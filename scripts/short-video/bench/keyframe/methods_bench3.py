#!/usr/bin/env python3
"""#391 methods bench batch 3 — tiered v3 flat-segment density floor (bench-only,
CPU-only, BUDGET=16, scored exactly like batch 1/2 via methods_bench.score).

Methods:
  tiered            v2 base (scene cuts + block-diff locals + 8s coverage floor)
  tiered_v2_hash    v2 + PySceneDetect HashDetector as second cut signal
  tiered_v3         v2 + L6 flat-segment density floor (handoff 2026-09-28:
                    the QA arm lost 59.4% vs uniform 66.7% while single-shot
                    clips ended at 4 frames of the 16-frame budget)
  tiered_v3_hash    v3 on the hash-augmented cut base

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/methods_bench3.py
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
import exp_tiered as et  # noqa: E402
import methods_bench as mb  # noqa: E402
import methods_bench2 as mb2  # noqa: E402

BUDGET = 16


def m_tiered_v3(video, slug=None):
    return et.tiered_timestamps(video, densify=True)[0]


def m_tiered_v3_hash(video, slug=None):
    import scenedetect as sd
    hash_cuts = [round(start.get_seconds(), 3)
                 for start, _e in sd.detect(str(video), sd.HashDetector())]
    scene = [round(t, 2)
             for t in bc.derive_scene_timestamps(video, "0.08", None)]
    scene_set = set(scene)
    merged, cluster = [], []
    for t in sorted(set(scene) | set(hash_cuts)):
        if cluster and t - cluster[-1] <= 0.6:
            cluster.append(t)
        else:
            if cluster:
                in_scene = [c for c in cluster if c in scene_set]
                merged.append(round(min(in_scene) if in_scene
                                    else min(cluster), 2))
            cluster = [t]
    if cluster:
        in_scene = [c for c in cluster if c in scene_set]
        merged.append(round(min(in_scene) if in_scene else min(cluster), 2))
    return et.tiered_timestamps(
        video, densify=True,
        extra_cuts=[t for t in merged if t not in scene_set])[0]


METHODS = [
    ("tiered", lambda v, s: et.tiered_timestamps(v)[0]),
    ("tiered_v2_hash", mb2.m_tiered_v2),
    ("tiered_v3", m_tiered_v3),
    ("tiered_v3_hash", m_tiered_v3_hash),
]


def main():
    import warnings
    warnings.filterwarnings("ignore")
    only = [m.strip() for m in os.environ.get("MB3_METHODS", "").split(",")
            if m.strip()]
    methods = [mv for mv in METHODS if not only or mv[0] in only]
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
        for name, fn in methods:
            try:
                ts = fn(video, slug)
            except Exception as e:
                print(f"{name:16s}  FAILED: {type(e).__name__}: {str(e)[:80]}")
                rows.append({"asset": slug, "method": name,
                             "error": f"{type(e).__name__}: {str(e)[:200]}"})
                continue
            r = mb.score(video, slug, name, ts, duration, intervals)
            rows.append(r)
            print(f"{name:16s} {r['frames']:3d} {str(r['recall']):>7s} "
                  f"{r['maxGap']:6.2f} {r['nearDupPairs']:4d} "
                  f"{str(r['coverage']):>6s} {str(r['balance']):>6s} "
                  f"{str(r['informativeShare']):>6s}  {r['ts']}", flush=True)

    out = os.path.join(RESULTS, os.environ.get("MB3_OUT", "methods_bench3.json"))
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {out}")


if __name__ == "__main__":
    main()
