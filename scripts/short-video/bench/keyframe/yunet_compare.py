#!/usr/bin/env python3
"""#391 D5 — focus_detector YuNet side-by-side eval (NOT production code).

For each bench asset, samples 6-8 frames (mix: scene-detected frames likely
to contain content + uniform frames covering static stretches), then runs
BOTH face detectors per frame:

  - Haar: the CURRENT production path — focus_detector.py is imported
    UNMODIFIED and its handle_analyze() is called per frame file, so the
    Haar numbers below are exactly what production would produce.
  - YuNet: cv2.FaceDetectorYN with the opencv_zoo 2023mar ONNX
    (input resized to 320x320, scoreThreshold 0.6).

Outputs per-frame JSON (boxes normalized to source frame, confidences, ms)
to .scratch/keyframe-bench/results/yunet_haar_compare.json and prints a
Haar false-positive / false-negative report cross-validated by YuNet.

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/yunet_compare.py
"""

import json
import os
import subprocess
import sys
import tempfile
import time

# scripts/short-video/bench/keyframe/ → repo root is 4 levels up. Artifacts
# stay in the gitignored scratch area (.gitignore:95), per spec S6.
HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
MODEL_PATH = os.path.join(
    WT_ROOT, ".scratch", "keyframe-bench", "models",
    "face_detection_yunet_2023mar.onnx",
)
FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"

sys.path.insert(0, LIB)
import focus_detector  # noqa: E402  — production module, NOT modified

WORKTREE_361 = "/Users/pabloli/Documents/code/inside-china-ai-wt/20260925-361-omni-vlm-5c0413"
ASSETS = [
    ("content_ABC_av", os.path.join(WORKTREE_361, ".scratch/len-compare/content_ABC_av.mp4")),
    ("content_ABCx2_30s", os.path.join(WORKTREE_361, ".scratch/len-compare/content_ABCx2_30s.mp4")),
    ("unitree-superman-demo-30s",
     os.path.join(WT_ROOT, "scripts/short-video/content/unitree/assets/unitree-superman-demo.mp4")),
]

SCENE_SELECT_FILTER = (
    "select='gt(scene,0.08)+eq(n,0)+not(mod(t,8))'"
    ",scale=480:480:force_original_aspect_ratio=decrease"
)
YUNET_INPUT_SIZE = 320
YUNET_SCORE_THRESHOLD = 0.6
SCENE_FRAMES_PER_ASSET = 4
UNIFORM_FRAMES_PER_ASSET = 3


def probe_duration(video_path):
    out = subprocess.run(
        [FFPROBE, "-v", "error",
         "-show_entries", "format=duration", "-of", "csv=p=0", video_path],
        capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def extract_sample_frames(video_path):
    """Extract scene-detected + uniform sample frames to a temp dir.

    Returns (frame_paths, meta_per_frame) with each frame tagged by its
    sampling source (scene | uniform) and its clip timestamp.
    """
    tmpdir = tempfile.mkdtemp(prefix="yunet_frames_")
    duration = probe_duration(video_path)
    frames = []

    # Scene-detected frames (same recipe as the #391 scene strategy)
    scene_dir = os.path.join(tmpdir, "scene")
    os.makedirs(scene_dir)
    subprocess.run(
        [FFMPEG, "-nostdin", "-i", video_path,
         "-vf", SCENE_SELECT_FILTER,
         "-frames:v", str(SCENE_FRAMES_PER_ASSET),
         "-fps_mode", "vfr", "-q:v", "2",
         os.path.join(scene_dir, "scene_%03d.jpg")],
        capture_output=True, timeout=120,
    )
    for name in sorted(os.listdir(scene_dir)):
        frames.append(("scene", os.path.join(scene_dir, name)))

    # Uniform frames at evenly spaced timestamps (covers static stretches)
    for i in range(UNIFORM_FRAMES_PER_ASSET):
        ts = duration * (i + 0.5) / UNIFORM_FRAMES_PER_ASSET
        uni_dir = os.path.join(tmpdir, f"uniform_{i}")
        os.makedirs(uni_dir)
        out = os.path.join(uni_dir, "uniform_%03d.jpg" % i)
        subprocess.run(
            [FFMPEG, "-nostdin", "-ss", f"{ts:.3f}", "-i", video_path,
             "-frames:v", "1", "-q:v", "2", out],
            capture_output=True, timeout=60,
        )
        if os.path.exists(out):
            frames.append(("uniform", out))

    return frames


def run_haar(frame_path):
    """Production Haar path: focus_detector.handle_analyze, UNMODIFIED."""
    t0 = time.perf_counter()
    result, err = focus_detector.handle_analyze(frame_path)
    ms = round((time.perf_counter() - t0) * 1000, 2)
    boxes = [
        [float(c) for c in r["rect"]]
        for r in (result or {}).get("protectedRegions", [])
    ]
    return {"boxes": boxes, "confidences": None, "ms": ms,
            "status": (result or {}).get("status"), "error": err}


def run_yunet(frame_path, detector, cv2):
    """YuNet path: resize to 320x320, detect, normalize boxes to source."""
    import numpy as np

    img = cv2.imread(frame_path)
    if img is None:
        return {"boxes": [], "confidences": [], "ms": 0.0,
                "error": "cannot_read_image"}
    h, w = img.shape[:2]
    resized = cv2.resize(img, (YUNET_INPUT_SIZE, YUNET_INPUT_SIZE))
    t0 = time.perf_counter()
    _ret, faces = detector.detect(resized)
    ms = round((time.perf_counter() - t0) * 1000, 2)
    boxes, confidences = [], []
    if faces is not None:
        for f in faces:
            x, y, fw, fh, score = (float(f[0]), float(f[1]), float(f[2]),
                                   float(f[3]), float(f[-1]))
            # Normalize to [0, 1] source-frame coordinates (same space as
            # focus_detector's protectedRegions rects)
            boxes.append([
                round(x / YUNET_INPUT_SIZE, 4),
                round(y / YUNET_INPUT_SIZE, 4),
                round(fw / YUNET_INPUT_SIZE, 4),
                round(fh / YUNET_INPUT_SIZE, 4),
            ])
            confidences.append(round(score, 4))
    return {"boxes": boxes, "confidences": confidences, "ms": ms, "error": None}


def main():
    import cv2

    if not os.path.exists(MODEL_PATH):
        print(f"FATAL: YuNet model missing: {MODEL_PATH}")
        sys.exit(1)
    detector = cv2.FaceDetectorYN.create(
        MODEL_PATH, "", (YUNET_INPUT_SIZE, YUNET_INPUT_SIZE),
        score_threshold=YUNET_SCORE_THRESHOLD,
    )
    detector.setInputSize((YUNET_INPUT_SIZE, YUNET_INPUT_SIZE))

    # Production Haar classifier init (same call production main() makes)
    focus_detector.init_classifier()
    if not focus_detector._cascade_loaded:
        print("FATAL: production Haar cascade failed to load")
        sys.exit(1)

    os.makedirs(RESULTS, exist_ok=True)
    per_frame = []
    for asset_slug, asset_path in ASSETS:
        print(f"=== {asset_slug} ===")
        samples = extract_sample_frames(asset_path)
        for source, frame_path in samples:
            haar = run_haar(frame_path)
            yunet = run_yunet(frame_path, detector, cv2)
            per_frame.append({
                "asset": asset_slug,
                "frame": frame_path,
                "sampleSource": source,
                "haar": haar,
                "yunet": yunet,
            })
            print(f"  [{source}] haar={len(haar['boxes'])} boxes "
                  f"({haar['ms']}ms) | yunet={len(yunet['boxes'])} boxes "
                  f"({yunet['ms']}ms) conf={yunet['confidences']}")

    out_path = os.path.join(RESULTS, "yunet_haar_compare.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "model": MODEL_PATH,
            "yunetInputSize": YUNET_INPUT_SIZE,
            "yunetScoreThreshold": YUNET_SCORE_THRESHOLD,
            "frames": per_frame,
        }, f, indent=2, ensure_ascii=False)

    # ─── Cross-validated Haar error report ───
    print("\n=== Haar suspected errors (cross-validated by YuNet) ===")
    fp = fn = agree = 0
    for fr in per_frame:
        n_haar, n_yunet = len(fr["haar"]["boxes"]), len(fr["yunet"]["boxes"])
        if n_haar > 0 and n_yunet == 0:
            fp += 1
            print(f"  FP suspect: {fr['asset']} [{fr['sampleSource']}] "
                  f"haar={n_haar} yunet=0 — {fr['frame']}")
        elif n_haar == 0 and n_yunet > 0:
            fn += 1
            print(f"  FN suspect (haar miss): {fr['asset']} "
                  f"[{fr['sampleSource']}] haar=0 yunet={n_yunet} "
                  f"conf={fr['yunet']['confidences']} — {fr['frame']}")
        else:
            agree += 1
    total = len(per_frame)
    haar_ms = [fr["haar"]["ms"] for fr in per_frame]
    yunet_ms = [fr["yunet"]["ms"] for fr in per_frame]
    print(f"\nTotal {total} frames | agree {agree} | FP suspects {fp} | "
          f"FN suspects {fn}")
    print(f"Mean ms — haar {sum(haar_ms)/total:.2f} | "
          f"yunet {sum(yunet_ms)/total:.2f}")
    print(f"JSON: {out_path}")


if __name__ == "__main__":
    main()
