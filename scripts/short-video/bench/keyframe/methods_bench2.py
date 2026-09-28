#!/usr/bin/env python3
"""#391 methods bench batch 2 — embedding-based selectors + tiered v2 (bench-only).

Methods:
  maxinfo_proxy   MaxVol / farthest-point selection on cheap grayscale
                  embeddings (32x32 flatten, L2-normalized). The paper uses
                  SigLIP2 embeddings; this proxy tests the SELECTION
                  PRINCIPLE (diversity maximization) at zero model cost.
  ktv_proxy       KTV stage-1 style: k-means on the same embeddings, medoid
                  per cluster (question-agnostic clustering).
  tiered_v2       tiered + PySceneDetect HashDetector as a SECOND L1 cut
                  signal (methods bench showed sd_hash hit unitree 1.0 where
                  scene/uniform/tiered got 0.857).

All scored identically (recall / gap / dup / KFS factors) at BUDGET=16.

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/methods_bench2.py
"""

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_tiered as et  # noqa: E402
import methods_bench as mb  # noqa: E402

EMB_SIZE = 32               # 32x32 gray flatten = 1024-dim embedding
EMB_STEP = 1.0              # 1fps candidate stream
BUDGET = 16


def decode_embeddings(video, size=EMB_SIZE, step=EMB_STEP):
    """1fps gray decode → [(t, L2-normalized flat vector)]."""
    import cv2
    frames = et.decode_frames(video, step=step)
    out = []
    for t, img in frames:
        small = cv2.resize(img, (size, size))
        v = small.flatten().astype(np.float32)
        n = np.linalg.norm(v) + 1e-9
        out.append((t, v / n))
    return out


def m_maxinfo_proxy(video, slug=None):
    """Farthest-point sampling — the standard cheap approximation of
    max-volume diversity selection (MaxVol greedy needs SVD; FPS captures
    the same 'pick the most different next frame' objective)."""
    frames = decode_embeddings(video)
    if not frames:
        return []
    ts = [t for t, _ in frames]
    vecs = np.stack([v for _, v in frames])
    sel = [0]
    min_d = np.linalg.norm(vecs - vecs[0], axis=1)
    while len(sel) < min(BUDGET, len(ts)):
        i = int(np.argmax(min_d))
        if min_d[i] <= 0:
            break
        sel.append(i)
        min_d = np.minimum(min_d, np.linalg.norm(vecs - vecs[i], axis=1))
    return sorted(ts[i] for i in set(sel))


def m_ktv_proxy(video, slug=None):
    """KTV stage-1 proxy: k-means (numpy, k-means++ init) on embeddings,
    medoid frame per cluster."""
    frames = decode_embeddings(video)
    if not frames:
        return []
    ts = [t for t, _ in frames]
    vecs = np.stack([v for _, v in frames])
    n, k = len(ts), min(BUDGET, len(ts))
    rng = np.random.RandomState(42)
    centers = [vecs[rng.randint(n)]]
    for _ in range(k - 1):  # k-means++ init
        d2 = np.min([np.sum((vecs - c) ** 2, axis=1) for c in centers], axis=0)
        centers.append(vecs[np.argmax(d2)])
    centers = np.stack(centers)
    for _ in range(20):
        assign = np.argmin(
            np.stack([np.sum((vecs - c) ** 2, axis=1) for c in centers]), axis=0)
        for j in range(k):
            if np.any(assign == j):
                centers[j] = vecs[assign == j].mean(axis=0)
    picked = []
    for j in range(k):
        members = np.where(assign == j)[0]
        if len(members) == 0:
            continue
        cent = centers[j]
        medoid = members[np.argmin(
            [np.sum((vecs[m] - cent) ** 2) for m in members])]
        picked.append(ts[int(medoid)])
    return sorted(picked)


def m_tiered_v2(video, slug=None):
    """tiered + HashDetector as second L1 cut signal. Hash-only cuts are
    merged into scene cuts with 0.6s linkage (scene time wins inside a
    cluster) — raw union let motion FPs (10.08-14.72 on unitree) crowd out
    the tail anchor and cost coverage (1.0 -> 0.875, 2026-09-28)."""
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
    return et.tiered_timestamps(video, extra_cuts=[t for t in merged
                                                   if t not in scene_set])[0]


METHODS = [
    ("tiered", lambda v, s: et.tiered_timestamps(v)[0]),
    ("maxinfo_proxy", m_maxinfo_proxy),
    ("ktv_proxy", m_ktv_proxy),
    ("tiered_v2_hash", m_tiered_v2),
]


def score(video, slug, name, ts, duration, intervals):
    from PIL import Image
    ts = mb.subsample(sorted(t for t in ts if 0 <= t <= duration), BUDGET)
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
        "maxGap": round(gap, 2), "nearDupPairs": red["nearDupPairs"],
        "coverage": kfs["coverage"], "balance": kfs["balance"],
        "informativeShare": kfs["informativeShare"],
        "ts": [round(t, 2) for t in ts],
    }


def main():
    rows = []
    for slug, video in bc.ASSETS.items():
        if not os.path.exists(video):
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

    out = os.path.join(RESULTS, "methods_bench2.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {out}")


if __name__ == "__main__":
    main()