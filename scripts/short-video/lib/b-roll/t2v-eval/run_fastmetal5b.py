#!/usr/bin/env python3
"""FastMetal-5B-QAD B-roll T2V eval driver (issue #298).

Runs the vendored Wan2.2-5B MLX entrypoint per job from fastmetal5b-jobs.json
at the model's native portrait 704x1280 121f @24fps, with HF_HUB_OFFLINE=1
(all weights pre-cached). Each run writes:

  <out>/<label>.mp4            the generated clip
  <out>/<label>.metrics.json   entrypoint-reported timing + memory
  <out>/<label>.log            full stdout/stderr

Usage:
  python3 run_fastmetal5b.py                # all jobs, sequentially
  python3 run_fastmetal5b.py --only scene-4-datacenter-racks
  python3 run_fastmetal5b.py --dry-run      # print commands, run nothing
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
MAIN_REPO = Path("/Users/pabloli/Documents/code/inside-china-ai")
FASTVIDEO_REPO = MAIN_REPO / "scripts/short-video/experiments/fastvideo-spike/repo"
ENTRYPOINT = FASTVIDEO_REPO / "examples/inference/basic/mlx_wan22_generate.py"
OUT_DIR = MAIN_REPO / f"scripts/short-video/output/t2v-eval-fastmetal5b-20260925"

HEIGHT, WIDTH = 1280, 704  # portrait 9:16, native 5B 720p
NUM_FRAMES, FPS = 121, 24  # 5.04s, matches baseline 1.3B clip duration


def hf_snapshot(repo_id: str) -> Path:
    """Resolve the local HF hub snapshot dir for a fully cached model."""
    hub = Path.home() / ".cache/huggingface/hub"
    dotted = "models--" + repo_id.replace("/", "--")
    snaps = sorted((hub / dotted / "snapshots").glob("*"))
    if not snaps:
        sys.exit(f"snapshot not found for {repo_id}; download first")
    return snaps[-1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="run a single job by label (smoke test)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    jobs_doc = json.loads((EVAL_DIR / "fastmetal5b-jobs.json").read_text())
    jobs = jobs_doc["jobs"]
    if args.only:
        jobs = [j for j in jobs if j["label"] == args.only]
        if not jobs:
            sys.exit(f"no job labeled {args.only!r}")

    snapshot = hf_snapshot("FastVideo/FastMetal-5B-QAD")
    mlx_ckpt = snapshot  # text_encoder/ + vae/ subdirs auto-derive inside the entrypoint
    if not (mlx_ckpt / "mlx_dit.json").exists():
        sys.exit(f"mlx_dit.json missing under {mlx_ckpt}; download incomplete")
    # The 5B snapshot's text_encoder/ holds config only (11.4GB of UMT5 shards
    # deliberately skipped). The entrypoint's own default for the 5B text
    # encoder is the Wan2.1-1.3B UMT5 encoder — same weights, already cached —
    # so point --text-encoder-root at the 1.3B snapshot explicitly.
    enc_root = hf_snapshot("FastVideo/FastMetal-1.3B-QAD")
    if not (enc_root / "text_encoder").is_dir():
        sys.exit(f"text_encoder/ missing under {enc_root}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, HF_HUB_OFFLINE="1")

    results = []
    for job in jobs:
        label, seed, prompt = job["label"], job["seed"], job["prompt"]
        mp4 = OUT_DIR / f"{label}.mp4"
        metrics = OUT_DIR / f"{label}.metrics.json"
        log = OUT_DIR / f"{label}.log"
        cmd = [
            str(FASTVIDEO_REPO / ".venv/bin/python"),
            str(ENTRYPOINT),
            "--mlx-checkpoint", str(mlx_ckpt),
            "--text-encoder-root", str(enc_root),
            "--height", str(HEIGHT),
            "--width", str(WIDTH),
            "--num-frames", str(NUM_FRAMES),
            "--fps", str(FPS),
            "--seed", str(seed),
            "--prompt", prompt,
            "--output-path", str(mp4),
            "--metrics-json", str(metrics),
        ]
        print(f"[eval] {label} (seed {seed}) -> {mp4.name}")
        if args.dry_run:
            print("  ", " ".join(cmd))
            continue
        t0 = time.time()
        with log.open("w") as lf:
            proc = subprocess.run(cmd, cwd=str(FASTVIDEO_REPO), env=env,
                                  stdout=lf, stderr=subprocess.STDOUT)
        wall = time.time() - t0
        ok = proc.returncode == 0 and mp4.exists()
        results.append({"label": label, "seed": seed, "ok": ok,
                        "returncode": proc.returncode, "wall_s": round(wall, 1)})
        print(f"[eval] {label}: {'OK' if ok else 'FAIL'} in {wall:.0f}s")

    if results and not args.dry_run:
        summary = OUT_DIR / "driver-summary.json"
        summary.write_text(json.dumps(results, indent=1))
        print(f"[eval] summary -> {summary}")


if __name__ == "__main__":
    main()
