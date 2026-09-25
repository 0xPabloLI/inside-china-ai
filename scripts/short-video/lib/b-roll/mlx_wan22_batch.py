"""Batch FastVideo (Wan 2.2 TI2V 5B, MLX) text-to-video on Apple Silicon for
the short-video pipeline's B-roll stage (#298).

Ported from the single-shot vendored entrypoint
(examples/inference/basic/mlx_wan22_generate.py) with the same batch contract
as mlx_wan_batch.py (Wan 1.3B):
  - one DiT load for the whole batch; decode deferred until every job has
    denoised (the taehv backend's cleanup_mlx() frees the compiled program,
    so decoding between jobs would force a re-trace per job)
  - #240 warm-up: all unique prompts pre-encoded with ONE text-encoder load
    before the DiT loads; peak memory stays max(UMT5, DiT)
  - per-job fault tolerance: a crashing job is recorded and the batch continues
  - machine-readable result line: [batch][results] {"ok": [...], "failed": [...]}
  - per-job metrics JSON (same shape as the single-shot entrypoint's
    --metrics-json) written next to each clip

5B specifics vs the 1.3B driver:
  - native portrait 704x1280 121f @24fps, flow-shift 5.0 (release config)
  - FastMetal-5B-QAD weights ship pre-quantized — no --mlx-quantization
  - the text encoder is the shared Wan2.1 UMT5; this script pins it to the
    FastMetal-1.3B snapshot (or --text-encoder-root), mirroring the vendored
    entrypoint's own default text-encoder pairing. The 5B HF snapshot's
    text_encoder/ ships config only in our cache (11.4GB of shards skipped).
  - denoise goes through sample_wan22_dmd (the 3-step DMD schedule lives
    inside fastvideo.mlx_runtime.wan22_sample, not a local loop)
  - decode via fastvideo.mlx_runtime.wan_vae.decode_latents_to_video, which
    returns metrics and needs z_dim (48-channel Wan2.2 latent)

Usage:
    python mlx_wan22_batch.py --repo /path/to/fastvideo/repo --jobs jobs.json
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
    ap.add_argument(
        "--text-encoder-root", type=Path, default=None,
        help="Root with text_encoder/ + tokenizer/ (UMT5). Defaults to the "
        "FastMetal-1.3B snapshot the local HF cache already holds — the "
        "vendored entrypoint pairs the 5B DiT with the same Wan2.1 encoder.",
    )
    ap.add_argument("--mlx-checkpoint", type=Path, default=None,
                    help="Packed FastMetal-5B-QAD MLX DiT directory")
    ap.add_argument("--jobs", type=Path, required=True,
                    help="JSON list of {label, prompt, output_path, seed?}")
    # Native portrait defaults (#298 eval config): 704x1280 121f @24fps.
    ap.add_argument("--height", type=int, default=1280)
    ap.add_argument("--width", type=int, default=704)
    ap.add_argument("--num-frames", type=int, default=121)
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--flow-shift", type=float, default=5.0)
    ap.add_argument("--decode-backend", default="taehv")
    ap.add_argument("--dmd-denoising-steps", default="1000,757,522")
    ap.add_argument("--no-warp", action="store_true")
    ap.add_argument("--no-mlx-compile", action="store_true")
    ap.add_argument("--text-encoder-device", default="cpu",
                    help="cpu (entrypoint default, safest) or mps")
    ap.add_argument("--metrics-dir", type=Path, default=None,
                    help="Write per-job metrics JSON here (default: next to each clip)")
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
            encode_prompt,
            make_rotary_embeddings,
            resolve_model_root,
        )
        from examples.inference.basic.mlx_wan22_generate import (  # type: ignore
            _default_prompt_cache_path,
            _prompt_cache_fingerprint,
        )
        from fastvideo.mlx_runtime.checkpoint_compat import resolve_mlx_checkpoint
        from fastvideo.mlx_runtime.memory import apply_memory_limits, cleanup_mlx
        from fastvideo.mlx_runtime.prompt_cache import load_prompt_cache, save_prompt_cache
        from fastvideo.mlx_runtime.refine import plan_refine_resolutions
        from fastvideo.mlx_runtime.wan22 import mlx_wan22_dit_from_mlx_checkpoint
        from fastvideo.mlx_runtime.wan22_sample import sample_wan22_dmd
        from fastvideo.mlx_runtime.wan_vae import decode_latents_to_video
        from mlx_wan_batch import _Umt5PromptEncoder, plan_warmup, preencode_prompts
    except Exception as exc:  # import failure = fatal, not per-job
        fatal(f"failed to import from repo {args.repo}: {exc}")

    import mlx.core as mx
    import torch

    jobs = json.loads(args.jobs.read_text())
    print(f"[batch] {len(jobs)} job(s) loaded")

    apply_memory_limits().as_metrics()  # default memory limits

    # The 5B DiT comes from the packed FastMetal-5B-QAD checkpoint; the UMT5
    # encoder + tokenizer come from the 1.3B snapshot (same weights the
    # vendored entrypoint pairs the 5B with). include_transformer=False: the
    # 1.3B root is only consulted for encoder assets here.
    text_encoder_root = args.text_encoder_root or resolve_model_root(
        None, include_transformer=False)
    mlx_checkpoint = resolve_mlx_checkpoint(args.mlx_checkpoint, text_encoder_root)
    if mlx_checkpoint is None:
        fatal("no packed MLX DiT found — pass --mlx-checkpoint (FastMetal-5B-QAD)")
    if not (mlx_checkpoint / "mlx_dit.json").is_file():
        fatal(f"{mlx_checkpoint} is not a packed MLX DiT (missing mlx_dit.json)")

    def fingerprint_for(prompt: str) -> dict:
        return _prompt_cache_fingerprint(
            prompt=prompt,
            prompt_used=prompt,
            enhance_prompt=False,
            enhance_prompt_backend="template",
            text_encoder_root=text_encoder_root,
            max_sequence_length=512,
            dtype="fp16",
        )

    def cache_path_for(prompt: str) -> Path:
        return _default_prompt_cache_path(fingerprint_for(prompt))

    # --- #240 warm-up: pre-encode all unique prompts with ONE encoder load ---
    plan = plan_warmup(jobs, cache_exists=lambda p: cache_path_for(p).exists())
    warm_embeds: dict = {}
    if plan["to_encode"]:
        print(f"[batch] warm-up: encoding {len(plan['to_encode'])}/{len(plan['unique'])} "
              f"unique prompt(s) with 1 text-encoder load "
              f"({len(plan['cached'])} served from cache)")
        t_warm = time.perf_counter()

        def _open_encoder():
            # fp16 on the encoder matches the single-shot entrypoint's encode
            # call (dtype_arg="fp16") — warm embeds must be bit-comparable to
            # what a single-shot run would produce.
            return _Umt5PromptEncoder(
                text_encoder_root,
                args.text_encoder_device,
                "fp16",
                512,
            )

        def _cache_save(prompt: str, embeds) -> None:
            save_prompt_cache(cache_path_for(prompt), embeds, fingerprint_for(prompt))

        warm_embeds = preencode_prompts(
            plan["to_encode"], open_encoder=_open_encoder, cache_save=_cache_save,
        )
        print(f"[batch] warm-up encoded {len(warm_embeds)} prompt(s) "
              f"in {time.perf_counter() - t_warm:.2f}s")
    elif plan["unique"]:
        print(f"[batch] warm-up: all {len(plan['unique'])} unique prompt(s) cached "
              f"— no text-encoder load")

    mlx_checkpoint_config = json.loads((mlx_checkpoint / "mlx_dit.json").read_text())
    dit_config = mlx_checkpoint_config.get("config", mlx_checkpoint_config)
    patch_size = tuple(dit_config.get("patch_size", (1, 2, 2)))
    in_ch = int(dit_config.get("in_channels", 48))

    # Same disabled-mode plan call the single-shot entrypoint uses to derive
    # the stage-1 latent grid (Wan2.2: 16x spatial / 4x temporal compression).
    active_plan = plan_refine_resolutions(
        height=args.height, width=args.width, num_frames=args.num_frames,
        spatial_scale=1, vae_spatial_compression=16, vae_temporal_compression=4,
        patch_size=patch_size, enabled=False,
    )
    lat_t = active_plan.latent_frames
    lat_h = active_plan.stage1_latent_height
    lat_w = active_plan.stage1_latent_width
    print(f"[batch] latent {in_ch}x{lat_t}x{lat_h}x{lat_w}")

    print("[batch] loading MLX DiT (once) ...")
    load_start = time.perf_counter()
    dit = mlx_wan22_dit_from_mlx_checkpoint(mlx_checkpoint, compile=not args.no_mlx_compile)
    config = getattr(dit, "config", dit_config)
    dit_load_s = time.perf_counter() - load_start
    print(f"[batch] DiT loaded in {dit_load_s:.2f}s")

    steps = [int(s.strip()) for s in args.dmd_denoising_steps.split(",") if s.strip()]

    pending: list = []
    results_ok: list = []
    results_failed: list = []
    batch_start = time.perf_counter()

    # --- denoise phase: the DiT stays loaded and warm for every job ---
    for i, job in enumerate(jobs):
        label = job.get("label") or Path(job["output_path"]).name
        prompt = job["prompt"]
        out = Path(job["output_path"])
        seed = int(job.get("seed", 1024))
        try:
            out.parent.mkdir(parents=True, exist_ok=True)

            print(f"\n[batch] job {i+1}/{len(jobs)} [{label}]")

            t0 = time.perf_counter()
            fp = fingerprint_for(prompt)
            cached = load_prompt_cache(cache_path_for(prompt), fp)
            if cached is not None:
                embeds = torch.from_numpy(cached).contiguous()
                encode_time = time.perf_counter() - t0
                print(f"[batch] prompt embeds served from cache ({encode_time:.2f}s)")
            elif prompt in warm_embeds:
                # #240 warm-up hit: pre-encoded with the single shared
                # text-encoder load; no reload, no disk round-trip.
                embeds = torch.from_numpy(warm_embeds[prompt])
                encode_time = time.perf_counter() - t0
            else:
                # Warm-up fallback for a prompt whose pre-encode failed.
                embeds = encode_prompt(
                    model_root=text_encoder_root, prompt=prompt,
                    max_sequence_length=512, device_arg=args.text_encoder_device,
                    dtype_arg="fp16",
                )
                save_prompt_cache(cache_path_for(prompt), embeds.cpu().numpy(), fp)
                encode_time = time.perf_counter() - t0
            ehs = mx.array(embeds.numpy()).astype(mx.float16)

            freqs = make_rotary_embeddings(
                config, latent_frames=lat_t, latent_height=lat_h, latent_width=lat_w)
            gen = torch.Generator().manual_seed(seed)
            noise = mx.array(
                torch.randn(1, in_ch, lat_t, lat_h, lat_w, generator=gen,
                            dtype=torch.float32).numpy()).astype(mx.float16)

            mx.reset_peak_memory()
            td = time.perf_counter()
            latents = sample_wan22_dmd(
                dit, ehs, noise, freqs,
                dmd_denoising_steps=steps,
                flow_shift=args.flow_shift,
                warp_denoising_step=not args.no_warp,
                seed=0,
            )
            denoise_time = time.perf_counter() - td
            peak_gib = mx.get_peak_memory() / (1024**3)

            latents_np = np.array(latents.astype(mx.float32))
            del latents, noise, ehs, freqs

            pending.append((label, out, latents_np, seed, encode_time, denoise_time, peak_gib))
            print(f"[batch] encode {encode_time:.2f}s | denoise {denoise_time:.2f}s | "
                  f"peak {peak_gib:.2f} GiB | (decode deferred) -> {label}")
        except Exception as exc:
            print(f"[batch] job [{label}] FAILED during denoise: {exc}", file=sys.stderr)
            results_failed.append({"label": label, "error": f"denoise: {exc}"})
            continue

    # --- decode phase: only now is cleanup_mlx()/mx.clear_cache() safe to call ---
    del dit
    cleanup_mlx()

    print(f"\n[batch] decoding {len(pending)} clip(s) ...")
    for label, out, latents_np, seed, encode_time, denoise_time, peak_gib in pending:
        try:
            tdec = time.perf_counter()
            metrics = decode_latents_to_video(
                latents_np, out, fps=args.fps,
                backend=args.decode_backend,
                vae_dir=args.mlx_checkpoint / "vae" if args.decode_backend == "wan-vae" else None,
                z_dim=in_ch,
            )
            decode_time = time.perf_counter() - tdec
            results_ok.append(label)
            print(f"[batch] decode {decode_time:.2f}s -> {label}")

            metrics_dir = args.metrics_dir or out.parent
            metrics_dir.mkdir(parents=True, exist_ok=True)
            (metrics_dir / f"{Path(out).stem}.metrics.json").write_text(json.dumps({
                "output_path": str(out.resolve()),
                "prompt": next(j["prompt"] for j in jobs
                               if (j.get("label") or Path(j["output_path"]).name) == label),
                "seed": seed,
                "height": args.height,
                "width": args.width,
                "fps": args.fps,
                "generated_frames": args.num_frames,
                "dmd_denoising_steps": steps,
                "flow_shift": args.flow_shift,
                "warp": not args.no_warp,
                "decode_backend": args.decode_backend,
                "prompt_encode_s": round(encode_time, 3),
                "denoise_s": round(denoise_time, 3),
                "decode_s": round(metrics.get("decode_s", decode_time), 3),
                "wall_total_s": round(time.perf_counter() - batch_start, 3),
                "peak_gib": round(peak_gib, 3),
                "latent_shape": [in_ch, lat_t, lat_h, lat_w],
                "mlx_checkpoint": str(mlx_checkpoint.resolve()),
            }, indent=2) + "\n")
        except Exception as exc:
            print(f"[batch] job [{label}] FAILED during decode: {exc}", file=sys.stderr)
            results_failed.append({"label": label, "error": f"decode: {exc}"})

    print("[batch][results] " + json.dumps({"ok": results_ok, "failed": results_failed}))
    print("\n[batch] ALL DONE")


if __name__ == "__main__":
    main()
