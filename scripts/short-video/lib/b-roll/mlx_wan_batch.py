"""Batch FastVideo (Wan 1.3B) text-to-video on Apple Silicon MLX for the
short-video pipeline's B-roll stage.

Ported from experiments/fastvideo-spike/mlx_wan_batch.py with:
  - parameterized repo path (--repo) instead of a hardcoded checkout
  - portrait defaults (--height 832 --width 480) for the 9:16 pipeline
  - per-job fault tolerance: a crashing job is recorded and the batch continues
  - a machine-readable result line: [batch][results] {"ok": [...], "failed": [...]}

Loads the DiT ONCE and generates many clips in a single process (avoids the
~150s mx.compile trace per call).

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
            decode_latents_to_video,
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
