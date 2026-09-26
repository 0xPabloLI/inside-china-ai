#!/usr/bin/env python3
"""#391 D4 — real-model frame_strategy bench matrix (NOT production code).

Runs the REAL vlm_analyzer pipeline (MiniCPM-o 4.5 via mlx-vlm) over the
spec's config × asset matrix and writes per-run artifacts to
.scratch/keyframe-bench/results/:

  {config}__{asset}.json — {params, frameCount, frameTimestamps,
                            extractionMs, genMs, totalMs, outputText, error}

Config matrix (spec D4):
  uniform(16@2) baseline / uniform(32@2) / uniform(32@1) / uniform(64@1) /
  scene(cap16) / scene(cap32)

Assets:
  - .scratch/len-compare/ in the 361 worktree (READ-ONLY reference)
  - 1 real >20s asset (scripts/short-video/content/unitree/assets/
    unitree-superman-demo.mp4, 30.2s)

Run:
  nohup ~/.venvs/mlx-vlm/bin/python \
    scripts/short-video/bench/keyframe/run_bench.py \
    > .scratch/keyframe-bench/bench.log 2>&1 &

Notes:
  - frame timestamps: uniform = nominal (i / fps, decode-order); scene =
    real pts parsed from a separate ffmpeg showinfo pass (same select
    filter), because image2pipe does not carry timestamps.
  - a per-run error is recorded into the artifact and the matrix continues.
"""

import json
import os
import re
import subprocess
import sys
import time

# scripts/short-video/bench/keyframe/ → repo root is 4 levels up. Artifacts
# stay in the gitignored scratch area (.gitignore:95), per spec S6.
HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")

sys.path.insert(0, LIB)
import vlm_analyzer as vlm  # noqa: E402

WORKTREE_361 = "/Users/pabloli/Documents/code/inside-china-ai-wt/20260925-361-omni-vlm-5c0413"
ASSETS = [
    ("content_ABC_av", os.path.join(WORKTREE_361, ".scratch/len-compare/content_ABC_av.mp4")),
    ("content_ABCx2_30s", os.path.join(WORKTREE_361, ".scratch/len-compare/content_ABCx2_30s.mp4")),
    ("unitree-superman-demo-30s",
     os.path.join(WT_ROOT, "scripts/short-video/content/unitree/assets/unitree-superman-demo.mp4")),
]

CONFIGS = [
    ("uniform_16fps2", {"strategy": "uniform", "max_frames": 16, "fps": 2.0}),
    ("uniform_32fps2", {"strategy": "uniform", "max_frames": 32, "fps": 2.0}),
    ("uniform_32fps1", {"strategy": "uniform", "max_frames": 32, "fps": 1.0}),
    ("uniform_64fps1", {"strategy": "uniform", "max_frames": 64, "fps": 1.0}),
    ("scene_cap16", {"strategy": "scene", "max_frames": 16, "fps": None}),
    ("scene_cap32", {"strategy": "scene", "max_frames": 32, "fps": None}),
]

SHOWINFO_PTS_RE = re.compile(r"pts_time:([0-9.]+)")


def scene_frame_timestamps(video_path, max_frames, start_ms=None, end_ms=None):
    """Real frame timestamps for the scene strategy via an ffmpeg showinfo
    pass (bench-only re-run; the production extractor gets image2pipe bytes
    without timestamps). Returns seconds-relative-to-clip list."""
    cmd = [vlm.FFMPEG_PATH, "-nostdin"]
    if start_ms is not None:
        cmd.extend(["-ss", str(start_ms / 1000.0)])
    cmd.extend(["-i", video_path])
    if start_ms is not None and end_ms is not None:
        cmd.extend(["-t", str((end_ms - start_ms) / 1000.0)])
    cmd.extend([
        "-vf", vlm.SCENE_SELECT_FILTER + ",showinfo",
        "-frames:v", str(max_frames),
        "-fps_mode", "vfr",
        "-f", "null", "-",
    ])
    proc = subprocess.run(cmd, capture_output=True, timeout=120)
    pts = [float(m) for m in SHOWINFO_PTS_RE.findall(proc.stderr.decode("utf-8", "replace"))]
    return pts[:max_frames]


def run_one(model, processor, asset_path, config):
    """One config × asset run through the REAL pipeline. Returns artifact dict."""
    strategy = config["strategy"]
    cap = config["max_frames"]

    t_total0 = time.perf_counter()
    if strategy == "uniform":
        frames, meta = vlm._extract_minicpm_frames(
            processor, asset_path, fps=config["fps"], max_frames=cap,
            frame_strategy="uniform",
        )
        # Nominal decode-order timestamps; resolve_video_inputs exposes no pts.
        timestamps = [round(i / config["fps"], 3) for i in range(len(frames))]
        timestamp_source = "nominal_uniform_fps"
    else:
        frames, meta = vlm._extract_scene_frames(asset_path, max_frames=cap)
        try:
            timestamps = scene_frame_timestamps(asset_path, cap)
        except Exception as e:  # timestamps are best-effort, never fatal
            timestamps = []
            meta["timestampError"] = str(e)
        timestamp_source = "ffmpeg_showinfo_pts"

    extraction_ms = meta["extractionMs"]

    gen_ms = None
    output_text = None
    error = None
    try:
        t0 = time.perf_counter()
        output_text = vlm.generate_response(
            model, processor, engine=vlm.DEFAULT_ENGINE,
            image_paths=frames,
            prompt_text=vlm.SEMANTICS_PROMPT_VIDEO,
            max_tokens=1000,
        )
        gen_ms = round((time.perf_counter() - t0) * 1000, 1)
    except Exception as e:
        error = f"generation failed: {e}"
    finally:
        del frames  # free PIL frames before the next config

    return {
        "params": {**config},
        "frameCount": meta["frameCount"],
        "frameTimestamps": timestamps,
        "timestampSource": timestamp_source,
        "extractionMs": extraction_ms,
        "genMs": gen_ms,
        "totalMs": round((time.perf_counter() - t_total0) * 1000, 1),
        "outputText": output_text,
        "error": error,
    }


def main():
    os.makedirs(RESULTS, exist_ok=True)

    missing = [p for _, p in ASSETS if not os.path.exists(p)]
    if missing:
        print(f"FATAL: missing bench assets: {missing}")
        sys.exit(1)

    print(f"Engine={vlm.DEFAULT_ENGINE} model={vlm.MODEL_ID}")
    t0 = time.perf_counter()
    model, processor = vlm.load_model(vlm.MODEL_ID)
    print(f"Model loaded in {time.perf_counter() - t0:.1f}s")

    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
        print("Warmup complete")
    except Exception as e:
        print(f"Warmup failed (non-fatal): {e}")

    index = []
    for asset_slug, asset_path in ASSETS:
        for config_slug, config in CONFIGS:
            name = f"{config_slug}__{asset_slug}"
            print(f"=== {name} ===", flush=True)
            artifact = {"config": config_slug, "asset": asset_slug,
                        "assetPath": asset_path}
            try:
                artifact.update(run_one(model, processor, asset_path, config))
            except Exception as e:
                artifact["error"] = f"run failed: {e}"
            out_path = os.path.join(RESULTS, f"{name}.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(artifact, f, indent=2, ensure_ascii=False)
            status = artifact.get("error") or (
                f"{artifact['frameCount']} frames, "
                f"extract {artifact['extractionMs']}ms, "
                f"gen {artifact['genMs']}ms"
            )
            print(f"    -> {status}", flush=True)
            index.append({"name": name, "artifact": out_path,
                          "error": artifact.get("error")})

    with open(os.path.join(RESULTS, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)
    ok = sum(1 for e in index if not e["error"])
    print(f"DONE: {ok}/{len(index)} runs succeeded; artifacts in {RESULTS}")


if __name__ == "__main__":
    main()
