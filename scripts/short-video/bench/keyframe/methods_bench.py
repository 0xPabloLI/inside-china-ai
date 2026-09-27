#!/usr/bin/env python3
"""#391 methods bench — every externally-sourced frame-selection method on one
harness (bench-only, NOT production code).

Methods (all capped to BUDGET=16 for fairness, scored with the SAME criteria):
  baselines (already in-repo)
    uniform_16fps2   mlx_vlm-style even sampling
    scene_008_cap16  ffmpeg scene filter (fixed threshold 0.08)
    iframe_even16    coded I-frames
    tiered           our 3-stage + 2-guard selector
  external, CPU-only (batch 1)
    sd_content       PySceneDetect ContentDetector        (HSV weighted diff)
    sd_adaptive      PySceneDetect AdaptiveDetector       (rolling-average thr)
    sd_histogram     PySceneDetect HistogramDetector      (Y-channel histogram)
    sd_hash          PySceneDetect HashDetector           (perceptual hash)
    sd_threshold     PySceneDetect ThresholdDetector      (fade / luma)
    blockslide       video-slide-extractor style: block diff vs LAST KEPT
                     frame + changed-ratio (no cuts / no fills / no tiering),
                     i.e. a clean ablation of our L2 layer alone
  external, model-backed (batch 2, run separately)
    maxinfo / ktv — need frame embeddings; see methods_bench_model.py

Scoring (unified): shot recall ±0.5s vs GT, max temporal gap, pHash near-dup
pairs, and KFS-Bench coverage / balance / informativeShare.

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/methods_bench.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_tiered as et  # noqa: E402  (tiered selector + block-diff machinery)

BUDGET = 16
FLAG = "^objc\\[[0-9]+\\]"


def subsample(times, budget):
    """Keep <=budget entries, spread evenly across the list (mlx_vlm round()),
    always preserving first and last so coverage tails are not silently lost."""
    n = len(times)
    if n <= budget:
        return sorted(times)
    idxs = sorted({round(i * (n - 1) / (budget - 1)) for i in range(budget)})
    return sorted(times[i] for i in idxs)


# ─── external CPU-only methods ───────────────────────────────────────────────

def _scenedetect_scenes(video, detector_name):
    """Run a REAL PySceneDetect detector (library default params)."""
    import scenedetect as sd
    detector_cls = getattr(sd, detector_name)
    scene_list = sd.detect(str(video), detector_cls())
    if not scene_list:
        return []
    return [round(start.get_seconds(), 3) for start, _end in scene_list]


def m_sd_content(video):
    return _scenedetect_scenes(video, "ContentDetector")


def m_sd_adaptive(video):
    return _scenedetect_scenes(video, "AdaptiveDetector")


def m_sd_histogram(video):
    return _scenedetect_scenes(video, "HistogramDetector")


def m_sd_hash(video):
    return _scenedetect_scenes(video, "HashDetector")


def m_sd_threshold(video):
    return _scenedetect_scenes(video, "ThresholdDetector")


def m_blockslide(video):
    """video-slide-extractor-style detector alone: block diff vs the LAST KEPT
    frame with a changed-ratio gate (their core rule), no cuts / fills."""
    return [t for t, _r in et.block_diff(et.decode_frames(video))]


METHODS = [
    ("uniform_16fps2", lambda v, s: bc.resolved_timestamps(s, "uniform_16fps2")[0]),
    ("scene_008_cap16", lambda v, s: bc.resolved_timestamps(s, "scene_008_cap16")[0]),
    ("iframe_even16", lambda v, s: bc.resolved_timestamps(s, "iframe_even16")[0]),
    ("tiered", lambda v, s: et.tiered_timestamps(v)[0]),
    ("sd_content", lambda v, s: m_sd_content(v)),
    ("sd_adaptive", lambda v, s: m_sd_adaptive(v)),
    ("sd_histogram", lambda v, s: m_sd_histogram(v)),
    ("sd_hash", lambda v, s: m_sd_hash(v)),
    ("sd_threshold", lambda v, s: m_sd_threshold(v)),
    ("blockslide", lambda v, s: m_blockslide(v)),
]


def score(video, slug, name, ts, duration, intervals):
    from PIL import Image
    ts = subsample(sorted(t for t in ts if 0 <= t <= duration), BUDGET)
    gt_times = bc.GT_SHOTS.get(slug, {}).get("times", [])
    recall, hits, total, _ = bc.shot_recall(ts, gt_times, tol=0.5)
    gap = bc.max_temporal_gap(ts, duration)
    hashes = []
    for t in ts:
        cell = bc.grab_frame(video, t, size_w=160)
        if cell is not None:
            hashes.append(bc.phash64(Image.open(cell)))
            os.unlink(cell)
    red = bc.redundancy_stats(hashes)
    kfs = bc.kfs_factors(ts, intervals, hashes)
    return {
        "asset": slug, "method": name, "frames": len(ts),
        "recall": None if recall is None else round(recall, 3),
        "recallHits": hits, "gtShots": total,
        "maxGap": round(gap, 2),
        "nearDupPairs": red["nearDupPairs"],
        "coverage": kfs["coverage"], "balance": kfs["balance"],
        "informativeShare": kfs["informativeShare"],
        "ts": [round(t, 2) for t in ts],
    }


def main():
    import warnings
    warnings.filterwarnings("ignore")
    rows = []
    for slug, video in bc.ASSETS.items():
        if not os.path.exists(video):
            print(f"SKIP (missing asset): {slug}")
            continue
        duration = bc.asset_duration(video)
        intervals = bc.gt_scene_intervals(slug, duration)
        print(f"\n===== {slug} ({duration:.2f}s) =====", flush=True)
        print(f"{'method':16s} {'n':>3s} {'recall':>7s} {'gap':>6s} "
              f"{'dup':>4s} {'cov':>6s} {'bal':>6s} {'info':>6s}  ts")
        for name, fn in METHODS:
            try:
                ts = fn(video, slug)
            except Exception as e:
                print(f"{name:16s}  FAILED: {type(e).__name__}: {str(e)[:80]}")
                rows.append({"asset": slug, "method": name,
                             "error": f"{type(e).__name__}: {str(e)[:200]}"})
                continue
            r = score(video, slug, name, ts, duration, intervals)
            rows.append(r)
            print(f"{name:16s} {r['frames']:3d} {str(r['recall']):>7s} "
                  f"{r['maxGap']:6.2f} {r['nearDupPairs']:4d} "
                  f"{str(r['coverage']):>6s} {str(r['balance']):>6s} "
                  f"{str(r['informativeShare']):>6s}  {r['ts']}", flush=True)

    out = os.path.join(RESULTS, "methods_bench.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {out}")


if __name__ == "__main__":
    main()
