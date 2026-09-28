#!/usr/bin/env python3
"""#391 criteria bench — real-model frame_strategy matrix (NOT production code).

Runs the REAL vlm_analyzer pipeline (MiniCPM-o 4.5 via mlx-vlm) over the
criteria-research config × asset matrix (handoff §〇, 2026-09-27) and writes
per-run artifacts to .scratch/keyframe-bench/results/:

  {config}__{asset}.json — {params, frameCount, frameTimestamps,
                            extractionMs, genMs, totalMs, outputText,
                            frameFiles, frameFields, error}

Config matrix (five signal tiers, handoff §1.2):
  uniform_16fps2   — current default baseline (mlx_vlm resolve_video_inputs)
  scene_004/008/012_cap16 — ffmpeg scene detect threshold sweep
  iframe_first16 / iframe_even16 — zero-decode coded I-frame baseline (对照)

Assets: 3 legacy bench assets (PR #392) + talkinghead loop + UI screencast
(handoff §〇.5 补齐, built by make_assets.py).

Extras vs the 18-run bench:
  - frame dumps: every selected frame saved under results/frames/ and listed
    in the artifact (contact-sheet 证据链).
  - fit pass: per selected frame, the PRODUCTION image path (simulate_crop
    9:16 + SEMANTICS_PROMPT_IMAGE) collects Fit/Subjects/ContentKind for the
    layer-2 field-stability criteria. Skipped for runs reused from artifacts.

Run (background):
  nohup ~/.venvs/mlx-vlm/bin/python \
    scripts/short-video/bench/keyframe/run_bench.py \
    > .scratch/keyframe-bench/bench2.log 2>&1 &

Filters: --only "scene_*:unitree*,uniform_16fps2:talkinghead*" (comma pairs
of fnmatch globs config:asset); existing artifacts are skipped unless --force.
"""

import argparse
import fnmatch
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
FRAMES_DIR = os.path.join(RESULTS, "frames")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import vlm_analyzer as vlm  # noqa: E402

ASSETS = bc.ASSETS

# Canonical criteria matrix (handoff §〇.2/§〇.5). Legacy 18-run artifacts
# (uniform_32*, scene_cap*) stay on disk; bench_common.artifact_path resolves
# the aliases so reuse works without rerunning.
CONFIGS = [
    ("uniform_16fps2", {"strategy": "uniform", "max_frames": 16, "fps": 2.0}),
    ("scene_004_cap16", {"strategy": "scene", "max_frames": 16, "threshold": "0.04"}),
    ("scene_008_cap16", {"strategy": "scene", "max_frames": 16, "threshold": "0.08"}),
    ("scene_012_cap16", {"strategy": "scene", "max_frames": 16, "threshold": "0.12"}),
    ("iframe_first16", {"strategy": "iframe", "max_frames": 16, "mode": "first"}),
    ("iframe_even16", {"strategy": "iframe", "max_frames": 16, "mode": "even"}),
]

# Per-frame image-mode fit pass (layer-2 Fit stability) — runs on frames
# extracted in-process. ~1.1s/frame on M2 Pro.
FIT_PASS_ENABLED = True
SHOWINFO_PTS_RE = re.compile(r"pts_time:([0-9.]+)")


def scene_frame_timestamps(video_path, max_frames, threshold=None):
    """Real frame timestamps for a scene threshold via an ffmpeg showinfo
    pass (bench-only re-run; the production extractor gets image2pipe bytes
    without timestamps). Returns seconds list."""
    th = threshold if threshold is not None else vlm.SCENE_DETECT_THRESHOLD
    vf = bc.SCENE_FILTER.format(th=th)
    cmd = [vlm.FFMPEG_PATH, "-nostdin", "-i", video_path,
           "-vf", vf + ",showinfo",
           "-frames:v", str(max_frames),
           "-fps_mode", "vfr",
           "-f", "null", "-"]
    proc = subprocess.run(cmd, capture_output=True, timeout=120)
    pts = [float(m) for m in SHOWINFO_PTS_RE.findall(proc.stderr.decode("utf-8", "replace"))]
    return pts[:max_frames]


def _extract_scene_frames_th(video_path, threshold, max_frames=16):
    """Bench-local scene extraction for non-default thresholds — mirrors the
    production _extract_scene_frames recipe (image2pipe mjpeg → PIL)."""
    vf = bc.SCENE_FILTER.format(th=threshold)
    cmd = [vlm.FFMPEG_PATH, "-nostdin", "-i", video_path,
           "-vf", vf, "-an", "-sn", "-dn",
           "-frames:v", str(max_frames),
           "-fps_mode", "vfr",
           "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"]
    t0 = time.perf_counter()
    proc = subprocess.run(cmd, capture_output=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg scene(th={threshold}) extraction failed "
            f"(rc={proc.returncode}): {proc.stderr.decode(errors='replace')[-300:]}")
    frames = vlm._decode_mjpeg_stream(proc.stdout)
    meta = {"extractionMs": round((time.perf_counter() - t0) * 1000, 1),
            "frameCount": len(frames)}
    return frames, meta


def _extract_iframe_frames(video_path, max_frames=16, mode="first"):
    """I-frame baseline extraction (对照信号, bench-only): zero-semantics
    coded I-frames at the scene recipe's 480p downscale. 'even' spreads the
    cap across ALL I-frames with the mlx_vlm round() formula."""
    cmd = [vlm.FFMPEG_PATH, "-nostdin", "-i", video_path,
           "-vf", "select='eq(pict_type,I)',"
                  "scale=480:480:force_original_aspect_ratio=decrease",
           "-an", "-sn", "-dn",
           "-fps_mode", "vfr",
           "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"]
    t0 = time.perf_counter()
    proc = subprocess.run(cmd, capture_output=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg I-frame extraction failed (rc={proc.returncode}): "
            f"{proc.stderr.decode(errors='replace')[-300:]}")
    frames = vlm._decode_mjpeg_stream(proc.stdout)
    total = len(frames)
    if mode == "first":
        frames = frames[:max_frames]
    elif total > max_frames:
        idxs = [round(i * (total - 1) / (max_frames - 1)) for i in range(max_frames)]
        frames = [frames[i] for i in idxs]
    meta = {"extractionMs": round((time.perf_counter() - t0) * 1000, 1),
            "frameCount": len(frames), "iframeCountTotal": total}
    return frames, meta


def dump_frames(frames, config_slug, asset_slug):
    """Persist selected frames for the evidence chain; returns file paths."""
    out_dir = os.path.join(FRAMES_DIR, f"{config_slug}__{asset_slug}")
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i, img in enumerate(frames):
        p = os.path.join(out_dir, f"f{i:03d}.jpg")
        img.save(p, quality=88)
        paths.append(p)
    return paths


def run_fit_pass(model, processor, frames):
    """Production image path per frame: simulate_crop 9:16 (center focus) →
    SEMANTICS_PROMPT_IMAGE → parsed Fit/Subjects/ContentKind. Per-frame
    failures are contained (field=None), never fatal."""
    import tempfile
    fields = []
    for img in frames:
        fd, tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        try:
            img.save(tmp, quality=92)
            crop_path, cleanup = vlm.simulate_crop(tmp, target_ratio=9 / 16,
                                                   focus=(0.5, 0.5))
            try:
                actual, temp2 = vlm.resize_image_if_needed(crop_path)
                try:
                    raw = vlm.generate_response(
                        model, processor, engine=vlm.DEFAULT_ENGINE,
                        image_paths=actual,
                        prompt_text=vlm.SEMANTICS_PROMPT_IMAGE,
                        max_tokens=600,
                    )
                    parsed = vlm.parse_markdown_to_dict(raw)
                    fields.append({
                        "fit": parsed.get("fit"),
                        "subjects": parsed.get("subjects"),
                        "contentKind": parsed.get("content_kind"),
                        "criticalEdgeText": parsed.get("critical_edge_text"),
                    })
                finally:
                    vlm._unlink_quiet(temp2)
            finally:
                vlm._unlink_quiet(cleanup)
        except Exception as e:
            fields.append({"error": str(e)[:200]})
        finally:
            vlm._unlink_quiet(tmp)
    return fields


def run_one(model, processor, asset_slug, asset_path, config_slug, config,
            fit_pass):
    """One config × asset run through the REAL pipeline. Returns artifact dict."""
    strategy = config["strategy"]
    cap = config["max_frames"]

    t_total0 = time.perf_counter()
    if strategy == "uniform":
        frames, meta = vlm._extract_minicpm_frames(
            processor, asset_path, fps=config["fps"], max_frames=cap,
            frame_strategy="uniform",
        )
        # Nominal decode-order stamps (artifact convention); criteria_eval
        # recomputes the TRUE subsample_evenly mapping — do not use for geometry.
        timestamps = [round(i / config["fps"], 3) for i in range(len(frames))]
        timestamp_source = "nominal_uniform_fps"
    elif strategy == "scene":
        th = config["threshold"]
        if th == vlm.SCENE_DETECT_THRESHOLD:
            frames, meta = vlm._extract_scene_frames(asset_path, max_frames=cap)
        else:
            frames, meta = _extract_scene_frames_th(asset_path, th, max_frames=cap)
        try:
            timestamps = scene_frame_timestamps(asset_path, cap, threshold=th)
        except Exception as e:  # timestamps are best-effort, never fatal
            timestamps = []
            meta["timestampError"] = str(e)
        timestamp_source = "ffmpeg_showinfo_pts"
    else:  # iframe
        frames, meta = _extract_iframe_frames(asset_path, max_frames=cap,
                                              mode=config["mode"])
        try:
            timestamps = bc.derive_iframe_timestamps(asset_path, cap, config["mode"])
        except Exception as e:
            timestamps = []
            meta["timestampError"] = str(e)
        timestamp_source = "ffmpeg_showinfo_pts"

    extraction_ms = meta["extractionMs"]
    frame_files = dump_frames(frames, config_slug, asset_slug)

    gen_ms = None
    output_text = None
    error = None
    frame_fields = None
    try:
        t0 = time.perf_counter()
        output_text = vlm.generate_response(
            model, processor, engine=vlm.DEFAULT_ENGINE,
            image_paths=frames,
            prompt_text=vlm.SEMANTICS_PROMPT_VIDEO,
            max_tokens=1000,
        )
        gen_ms = round((time.perf_counter() - t0) * 1000, 1)
        if fit_pass and FIT_PASS_ENABLED:
            frame_fields = run_fit_pass(model, processor, frames)
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
        "frameFiles": frame_files,
        "frameFields": frame_fields,
        "error": error,
    }


def parse_only(spec):
    """'cfgglob:assetglob' comma pairs → list of (cfg_pat, asset_pat)."""
    pairs = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" not in part:
            raise ValueError(f"--only entry needs config:asset — got {part!r}")
        cfg, asset = part.split(":", 1)
        pairs.append((cfg, asset))
    return pairs


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", default=None,
                    help="comma list of config:asset fnmatch globs")
    ap.add_argument("--force", action="store_true",
                    help="rerun combos that already have artifacts")
    ap.add_argument("--no-fit-pass", action="store_true",
                    help="skip per-frame image-mode fit collection")
    args = ap.parse_args()
    pairs = parse_only(args.only) if args.only else []

    os.makedirs(RESULTS, exist_ok=True)

    todo = []
    for asset_slug, asset_path in ASSETS.items():
        if not os.path.exists(asset_path):
            print(f"SKIP (missing asset): {asset_slug}")
            continue
        for config_slug, config in CONFIGS:
            if pairs and not any(
                    fnmatch.fnmatch(config_slug, c) and fnmatch.fnmatch(asset_slug, a)
                    for c, a in pairs):
                continue
            if not args.force and bc.artifact_path(config_slug, asset_slug):
                print(f"SKIP (artifact exists): {config_slug}__{asset_slug}")
                continue
            todo.append((asset_slug, asset_path, config_slug, config))

    if not todo:
        print("nothing to run (all artifacts present or filtered out)")
        return

    print(f"{len(todo)} runs queued; fit_pass={FIT_PASS_ENABLED and not args.no_fit_pass}")
    print(f"Engine={vlm.DEFAULT_ENGINE} model={vlm.MODEL_ID}")
    t0 = time.perf_counter()
    model, processor = vlm.load_model(vlm.MODEL_ID)
    print(f"Model loaded in {time.perf_counter() - t0:.1f}s")

    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
        print("Warmup complete")
    except Exception as e:
        print(f"Warmup failed (non-fatal): {e}")

    index = dict()  # name → {artifact, error}; rebuilt from disk at the end
    for asset_slug, asset_path, config_slug, config in todo:
        name = f"{config_slug}__{asset_slug}"
        print(f"=== {name} ===", flush=True)
        artifact = {"config": config_slug, "asset": asset_slug,
                    "assetPath": asset_path}
        try:
            artifact.update(run_one(model, processor, asset_slug, asset_path,
                                    config_slug, config,
                                    fit_pass=not args.no_fit_pass))
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

    # Rebuild the index from every artifact on disk (legacy + new).
    import glob as _glob
    entries = []
    for p in sorted(_glob.glob(os.path.join(RESULTS, "*.json"))):
        base = os.path.basename(p)
        if base in ("index.json", "yunet_haar_compare.json",
                    "criteria_matrix.json"):
            continue
        with open(p, encoding="utf-8") as f:
            err = json.load(f).get("error")
        entries.append({"name": base[:-5], "artifact": p, "error": err})
    with open(os.path.join(RESULTS, "index.json"), "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)
    ok = sum(1 for e in entries if not e["error"])
    print(f"DONE: {ok}/{len(entries)} artifacts healthy; index in {RESULTS}")


if __name__ == "__main__":
    main()
