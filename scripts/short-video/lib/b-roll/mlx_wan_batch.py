"""Batch FastVideo (Wan 1.3B) text-to-video on Apple Silicon MLX for the
short-video pipeline's B-roll stage.

Ported from experiments/fastvideo-spike/mlx_wan_batch.py with:
  - parameterized repo path (--repo) instead of a hardcoded checkout
  - portrait defaults (--height 832 --width 480) for the 9:16 pipeline
  - per-job fault tolerance: a crashing job is recorded and the batch continues
  - a machine-readable result line: [batch][results] {"ok": [...], "failed": [...]}

Loads the DiT ONCE and generates many clips in a single process (avoids the
~150s mx.compile trace per call).

#240 warm-up: before the DiT loads, all unique uncached prompts are encoded
with ONE text-encoder load (the per-job inline path reloads UMT5 for every
cache miss — 634s cold / 220s warm per reload). The encoder is freed again
before the DiT loads, so peak memory drops from (DiT + UMT5) to
max(UMT5, DiT). Any warm-up failure degrades to the previous per-job inline
behavior without killing the batch.

Usage:
    python mlx_wan_batch.py --repo /path/to/fastvideo/repo --jobs jobs.json
jobs.json = [{"label": "scene-6-seed1024", "prompt": "...",
              "output_path": "/abs/path.mp4", "seed": 1024}, ...]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np


def fatal(message: str) -> None:
    print(f"[batch][fatal] {message}", file=sys.stderr)
    sys.exit(2)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, required=True, help="FastVideo repo checkout")
    ap.add_argument("--model-root", type=Path, default=None)
    ap.add_argument("--mlx-checkpoint", type=Path, default=None)
    ap.add_argument("--jobs", type=Path, required=True,
                    help="JSON list of {label, prompt, output_path, seed?}")
    # Portrait defaults: the pipeline renders 9:16; the spike's landscape
    # 832x480 lost ~2/3 of the frame to cover-crop.
    ap.add_argument("--height", type=int, default=832)
    ap.add_argument("--width", type=int, default=480)
    ap.add_argument("--num-frames", type=int, default=81)
    ap.add_argument("--fps", type=int, default=16)
    ap.add_argument("--max-sequence-length", type=int, default=512)
    ap.add_argument("--torch-device", default="auto")
    ap.add_argument("--text-encoder-dtype", default="bf16")
    ap.add_argument("--mlx-dtype", default="fp16")
    ap.add_argument("--mlx-quantization", default="int8")
    ap.add_argument("--decode-backend", default="taehv")
    ap.add_argument("--dmd-denoising-steps", default="1000,757,522")
    ap.add_argument("--flow-shift", type=float, default=8.0)
    ap.add_argument("--no-mlx-compile", action="store_true")
    ap.add_argument("--prompt-cache", action="store_true", default=True)
    return ap.parse_args()


def unique_prompts_in_order(jobs: list) -> list:
    """Unique job prompts in first-seen order. The orchestrator assembles
    same-prompt seeds consecutively (scene by scene), so this keeps batch
    order stable."""
    seen = set()
    ordered = []
    for job in jobs:
        prompt = job["prompt"]
        if prompt not in seen:
            seen.add(prompt)
            ordered.append(prompt)
    return ordered


def plan_warmup(jobs: list, cache_exists=None) -> dict:
    """Split unique prompts into warm-up encodes vs on-disk cache hits.

    cache_exists(prompt) probes the persistent prompt-embeds cache; None when
    --prompt-cache is off (nothing cached, everything encodes for in-memory
    reuse only). An all-cached plan yields to_encode=[] — the signal main()
    uses to skip the text-encoder load entirely, so escalated reruns over
    unchanged prompts stay free.
    """
    unique = unique_prompts_in_order(jobs)
    if cache_exists is None:
        return {"unique": unique, "to_encode": list(unique), "cached": []}
    to_encode = []
    cached = []
    for prompt in unique:
        (cached if cache_exists(prompt) else to_encode).append(prompt)
    return {"unique": unique, "to_encode": to_encode, "cached": cached}


def preencode_prompts(prompts: list, *, open_encoder, cache_save=None) -> dict:
    """Encode every prompt with ONE text-encoder load (#240).

    open_encoder() -> object with encode(prompt) -> np.ndarray and close().
    cache_save(prompt, embeds) persists an embed (best-effort — a write
    failure must not drop the embed from the returned dict).

    Returns {prompt: np.ndarray}. Per-prompt failures are isolated: the
    failed prompt is absent and the job loop falls back to inline encode for
    it. An encoder-load failure returns {} (the whole batch degrades to the
    previous per-job inline behavior).
    """
    warm: dict = {}
    if not prompts:
        return warm
    encoder = None
    try:
        encoder = open_encoder()
        for i, prompt in enumerate(prompts):
            try:
                embeds = encoder.encode(prompt)
            except Exception as exc:
                print(f"[batch] warm-up encode {i + 1}/{len(prompts)} FAILED "
                      f"(job falls back to inline encode): {exc}", file=sys.stderr)
                continue
            if cache_save is not None:
                try:
                    cache_save(prompt, embeds)
                except Exception as exc:
                    print(f"[batch] warm-up cache write skipped: {exc}", file=sys.stderr)
            warm[prompt] = embeds
            print(f"[batch] warm-up encode {i + 1}/{len(prompts)} done")
    except Exception as exc:
        print(f"[batch] warm-up encoder load FAILED -> per-job inline encode: {exc}",
              file=sys.stderr)
        return {}
    finally:
        if encoder is not None:
            try:
                encoder.close()
            except Exception:
                pass
    return warm


class _Umt5PromptEncoder:
    """One-load UMT5 text encoder for the #240 warm-up phase.

    Mirrors the vendored FastVideo repo's encode_prompt()
    (examples/inference/basic/mlx_wan_prompt_to_video.py) tokenization and
    output shaping exactly: warm embeds must match what the per-job inline
    path would produce, or generation results drift.
    """

    def __init__(self, model_root: Path, device, dtype, max_sequence_length: int):
        import torch
        from transformers import AutoTokenizer, UMT5EncoderModel

        self._torch = torch
        self._device = device
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_root / "tokenizer", local_files_only=True)
        self.model = UMT5EncoderModel.from_pretrained(
            model_root / "text_encoder",
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
            local_files_only=True,
        ).to(device)
        self.model.eval()
        self._max_sequence_length = max_sequence_length

    def encode(self, prompt: str):
        torch = self._torch
        text_inputs = self.tokenizer(
            [prompt],
            padding="max_length",
            max_length=self._max_sequence_length,
            truncation=True,
            add_special_tokens=True,
            return_attention_mask=True,
            return_tensors="pt",
        )
        text_input_ids = text_inputs.input_ids.to(self._device)
        mask = text_inputs.attention_mask.to(self._device)
        seq_lens = mask.gt(0).sum(dim=1).long()

        with torch.no_grad():
            prompt_embeds = self.model(text_input_ids, mask).last_hidden_state
        prompt_embeds = [u[:v] for u, v in zip(prompt_embeds, seq_lens, strict=False)]
        prompt_embeds = torch.stack(
            [
                torch.cat([u, u.new_zeros(self._max_sequence_length - u.size(0), u.size(1))])
                for u in prompt_embeds
            ],
            dim=0,
        )
        if prompt_embeds.dtype == torch.bfloat16:
            # NumPy (and the .npy cache) has no bfloat16; fp32 is exact for
            # every bf16 value — same convention as the repo's encode_prompt.
            prompt_embeds = prompt_embeds.float()
        return prompt_embeds.cpu().contiguous().numpy()

    def close(self):
        del self.model, self.tokenizer
        # Same cleanup as encode_prompt: free MPS before the DiT loads.
        from fastvideo.mlx_runtime.memory import cleanup_torch_mps

        cleanup_torch_mps()


def main() -> None:
    args = parse_args()

    if not args.repo.is_dir():
        fatal(f"repo not found: {args.repo}")
    if not args.jobs.is_file():
        fatal(f"jobs file not found: {args.jobs}")

    sys.path.insert(0, str(args.repo))

    try:
        from examples.inference.basic.mlx_wan_prompt_to_video import (  # type: ignore
            resolve_model_root,
            make_rotary_embeddings,
            get_prompt_embeds,
            _default_prompt_cache_path,
            _prompt_cache_fingerprint,
            _torch_device,
            _torch_dtype,
            decode_latents_to_video,
            save_prompt_cache,
        )
        from fastvideo.mlx_runtime.checkpoint_compat import resolve_mlx_checkpoint
        from fastvideo.mlx_runtime.memory import apply_memory_limits  # noqa
        from fastvideo.mlx_runtime.fast_spatial import plan_fast_spatial, resolve_spatial_mode
        from fastvideo.mlx_runtime.refine import plan_refine_resolutions
        from fastvideo.mlx_runtime.sampling import MLXDMDSchedule, dmd_step
        from fastvideo.models.schedulers.scheduling_flow_match_euler_discrete import (
            FlowMatchEulerDiscreteScheduler,
        )
    except Exception as exc:  # import failure = fatal, not per-job
        fatal(f"failed to import from repo {args.repo}: {exc}")

    jobs = json.loads(args.jobs.read_text())
    print(f"[batch] {len(jobs)} job(s) loaded")

    apply_memory_limits().as_metrics()  # default memory limits

    model_root = resolve_model_root(args.model_root, include_transformer=args.mlx_checkpoint is None)
    mlx_checkpoint = resolve_mlx_checkpoint(args.mlx_checkpoint, model_root)

    # --- #240 warm-up: pre-encode all unique prompts with ONE encoder load ---
    # Placed BEFORE the DiT load: the encoder is the only big resident during
    # warm-up, so peak memory is max(UMT5, DiT) instead of (DiT + UMT5) as
    # with the old interleaved per-job inline encodes.
    cache_path_for = None
    if args.prompt_cache:

        def cache_path_for(prompt: str) -> Path:
            return _default_prompt_cache_path(
                model_root=model_root, prompt=prompt,
                max_sequence_length=args.max_sequence_length, dtype_arg=args.text_encoder_dtype,
            )

    plan = plan_warmup(
        jobs,
        cache_exists=(lambda p: cache_path_for(p).exists()) if cache_path_for else None,
    )
    warm_embeds: dict = {}
    if plan["to_encode"]:
        print(f"[batch] warm-up: encoding {len(plan['to_encode'])}/{len(plan['unique'])} "
              f"unique prompt(s) with 1 text-encoder load "
              f"({len(plan['cached'])} served from cache)")
        t_warm = time.perf_counter()

        def _open_encoder():
            return _Umt5PromptEncoder(
                model_root,
                _torch_device(args.torch_device),
                _torch_dtype(args.text_encoder_dtype),
                args.max_sequence_length,
            )

        def _cache_save(prompt: str, embeds) -> None:
            save_prompt_cache(
                cache_path_for(prompt), embeds,
                _prompt_cache_fingerprint(
                    model_root=model_root, prompt=prompt,
                    max_sequence_length=args.max_sequence_length, dtype_arg=args.text_encoder_dtype,
                ),
            )

        warm_embeds = preencode_prompts(
            plan["to_encode"], open_encoder=_open_encoder, cache_save=_cache_save,
        )
        print(f"[batch] warm-up encoded {len(warm_embeds)} prompt(s) "
              f"in {time.perf_counter() - t_warm:.2f}s")
    elif plan["unique"]:
        print(f"[batch] warm-up: all {len(plan['unique'])} unique prompt(s) cached "
              f"— no text-encoder load")

    import mlx.core as mx
    import torch

    mlx_checkpoint_config = json.loads((mlx_checkpoint / "mlx_dit.json").read_text())
    dit_config = mlx_checkpoint_config.get("config", mlx_checkpoint_config)
    config = dit_config

    is_wan21 = int(dit_config.get("in_channels", 0)) == 16
    vae_temporal_factor = 4 if is_wan21 else int(dit_config.get("scale_factor_temporal", 4))
    vae_spatial_factor = 8 if is_wan21 else int(dit_config.get("scale_factor_spatial", 8))
    patch_size = tuple(dit_config.get("patch_size", (1, 2, 2)))

    spatial_mode = resolve_spatial_mode(refine=False, fast_spatial=False)
    refine_plan = plan_refine_resolutions(
        height=args.height, width=args.width, num_frames=args.num_frames,
        spatial_scale=1, vae_spatial_compression=vae_spatial_factor,
        vae_temporal_compression=vae_temporal_factor, patch_size=patch_size, enabled=False,
    )
    fast_spatial_plan = plan_fast_spatial(
        height=args.height, width=args.width, num_frames=args.num_frames,
        spatial_scale=2, vae_spatial_compression=vae_spatial_factor,
        vae_temporal_compression=vae_temporal_factor, patch_size=patch_size,
        upsample_mode="bilinear", sharpen=0.0, enabled=False,
    )
    active_plan = refine_plan if spatial_mode == "refine" else fast_spatial_plan.plan
    latent_frames = active_plan.latent_frames
    latent_height = active_plan.stage1_latent_height
    latent_width = active_plan.stage1_latent_width
    mx_dtype = {"fp16": mx.float16, "bf16": mx.bfloat16, "fp32": mx.float32}[args.mlx_dtype]

    from fastvideo.mlx_runtime.checkpoint import load_mlx_dit_checkpoint

    print("[batch] loading MLX DiT (once) ...")
    load_start = time.perf_counter()
    dit = load_mlx_dit_checkpoint(mlx_checkpoint, compile=not args.no_mlx_compile)
    config = dit.config
    print(f"[batch] DiT loaded in {time.perf_counter() - load_start:.2f}s")

    scheduler = FlowMatchEulerDiscreteScheduler(shift=args.flow_shift)
    denoising_steps = [int(s.strip()) for s in args.dmd_denoising_steps.split(",") if s.strip()]
    timesteps = torch.tensor(denoising_steps, dtype=torch.long)
    dmd_schedule = MLXDMDSchedule.from_torch_scheduler(scheduler)

    # KEY: decode AFTER all denoise passes. The taehv decode backend calls
    # cleanup_mlx() -> mx.clear_cache(), which frees the compiled DiT program.
    # If we decoded between jobs, every later job would re-trace (~180s). By
    # denoising all jobs first (DiT stays warm), the compiled graph is reused.
    pending: list = []
    results_ok: list = []
    results_failed: list = []

    for i, job in enumerate(jobs):
        label = job.get("label") or Path(job["output_path"]).name
        prompt = job["prompt"]
        out = Path(job["output_path"])
        seed = int(job.get("seed", 1024))
        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            mx.random.seed(seed)
            torch.manual_seed(seed)

            print(f"\n[batch] job {i+1}/{len(jobs)} [{label}]")
            print(f"[batch] prompt: {prompt}")

            t0 = time.perf_counter()
            if prompt in warm_embeds:
                # #240 warm-up hit: embeds were pre-encoded with the single
                # shared text-encoder load; no reload, no disk round-trip.
                prompt_embeds = torch.from_numpy(warm_embeds[prompt])
            else:
                # Cache hit (warm-up skipped it) or warm-up fallback for a
                # prompt whose pre-encode failed — the original inline path.
                prompt_embeds = get_prompt_embeds(
                    model_root=model_root, prompt=prompt,
                    max_sequence_length=args.max_sequence_length, device_arg=args.torch_device,
                    dtype_arg=args.text_encoder_dtype, encode_mode="inline",
                    cache_path=(_default_prompt_cache_path(
                        model_root=model_root, prompt=prompt,
                        max_sequence_length=args.max_sequence_length, dtype_arg=args.text_encoder_dtype,
                    ) if args.prompt_cache else None),
                )
            encode_time = time.perf_counter() - t0

            generator = torch.Generator(device="cpu").manual_seed(seed)
            latents_torch = torch.randn(
                (1, int(config["in_channels"]), latent_frames, latent_height, latent_width),
                generator=generator, dtype=torch.float32,
            )
            latents = mx.array(latents_torch.numpy()).astype(mx_dtype)
            encoder_hidden_states = mx.array(prompt_embeds.numpy()).astype(mx_dtype)
            freqs_cis = make_rotary_embeddings(
                config, latent_frames=latent_frames, latent_height=latent_height, latent_width=latent_width,
            )

            td = time.perf_counter()
            for step_index, timestep in enumerate(timesteps):
                noise_input_latent = latents
                timestep_mx = mx.array([float(timestep.item())]).astype(mx.float32)
                noise_pred = dit(latents.astype(mx_dtype), encoder_hidden_states, timestep_mx, freqs_cis)
                ts_val = float(timestep.item())
                noise_input_f32 = noise_input_latent.astype(mx.float32)
                pred_noise_f32 = noise_pred.astype(mx.float32)
                if step_index < len(timesteps) - 1:
                    next_ts = float(timesteps[step_index + 1].item())
                    renoise = mx.random.normal(noise_input_f32.shape).astype(mx.float32)
                else:
                    next_ts, renoise = None, None
                latents = dmd_step(
                    latents=noise_input_f32, noise_input_latent=noise_input_f32,
                    pred_noise=pred_noise_f32, schedule=dmd_schedule, timestep=ts_val,
                    next_timestep=next_ts, noise=renoise,
                ).astype(mx_dtype)
                mx.eval(latents)
                print(f"denoise step {step_index+1}/{len(timesteps)} complete")
                del noise_input_f32, pred_noise_f32, renoise, noise_input_latent, noise_pred, timestep_mx
            denoise_time = time.perf_counter() - td

            del encoder_hidden_states, freqs_cis
            latents_np = np.array(latents.astype(mx.float32))
            del latents

            pending.append((label, out, latents_np))
            total = time.perf_counter() - t0
            print(f"[batch] encode {encode_time:.2f}s | denoise {denoise_time:.2f}s | "
                  f"(decode deferred) total {total:.2f}s -> {label}")
        except Exception as exc:
            print(f"[batch] job [{label}] FAILED during denoise: {exc}", file=sys.stderr)
            results_failed.append({"label": label, "error": f"denoise: {exc}"})
            continue

    # --- decode phase: only now is mx.clear_cache() safe to call ---
    print(f"\n[batch] decoding {len(pending)} clip(s) ...")
    for label, out, latents_np in pending:
        try:
            tdec = time.perf_counter()
            decode_latents_to_video(
                model_root=model_root, latents_np=latents_np, output_path=out, fps=args.fps,
                device_arg=args.torch_device, dtype_arg=args.text_encoder_dtype,
                backend=args.decode_backend, taehv_source_path=None,
                taehv_checkpoint_path=None, taehv_parallel=False,
            )
            decode_time = time.perf_counter() - tdec
            results_ok.append(label)
            print(f"[batch] decode {decode_time:.2f}s -> {label}")
        except Exception as exc:
            print(f"[batch] job [{label}] FAILED during decode: {exc}", file=sys.stderr)
            results_failed.append({"label": label, "error": f"decode: {exc}"})

    print("[batch][results] " + json.dumps({"ok": results_ok, "failed": results_failed}))
    print("\n[batch] ALL DONE")


if __name__ == "__main__":
    main()
