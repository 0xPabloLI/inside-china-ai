#!/usr/bin/env python3
"""#391 v4 spread-guard & v5 floor-repair A/B on REAL clips (bench-only, CPU-only).

v2/v3/v4 are indistinguishable on the 10-30s bench assets (no stacked
clusters there), so the guard has to be judged where it was motivated: the
1-2 minute Video-MME clips, where tiered's selection was observed to stack
frames 0.2-0.3s apart (e.g. 18.8/18.9/19.1, 41.1/41.3/41.5/41.6).

For each sampled clip and each variant it reports frames, max temporal gap,
pHash near-duplicate pairs, and the number of selected pairs closer than
SPREAD_MIN_GAP (the clusters the guard is meant to attack). No model is
involved; the question is only whether the guard does what it claims.

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/exp_v4_ab.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_tiered as et  # noqa: E402

CLIPS = int(os.environ.get("V4_AB_CLIPS", "20"))
VARIANTS = [
    ("tiered_v2", dict()),
    ("tiered_v3", dict(densify=True)),
    ("tiered_v4", dict(densify=True, spread_guard=True)),
    ("tiered_v5", dict(densify=True, enforce_floor=True)),
]


def close_pairs(ts, win):
    ts = sorted(ts)
    return sum(1 for a, b in zip(ts, ts[1:]) if b - a < win)


def main():
    import warnings
    from PIL import Image
    warnings.filterwarnings("ignore")
    vids = sorted(f[:-4] for f in os.listdir(os.path.join(VM, "videos"))
                  if f.endswith(".mp4"))
    step = max(1, len(vids) // CLIPS)
    vids = vids[::step][:CLIPS]
    rows = []
    for vid in vids:
        video = os.path.join(VM, "videos", vid + ".mp4")
        duration = bc.asset_duration(video)
        for name, kw in VARIANTS:
            ts, meta = et.tiered_timestamps(video, **kw)
            hashes = []
            for t in ts:
                cell = bc.grab_frame(video, t, size_w=160)
                if cell is not None:
                    hashes.append(bc.phash64(Image.open(cell)))
                    os.unlink(cell)
            dup = bc.redundancy_stats(hashes)["nearDupPairs"]
            row = {"video": vid, "durationS": round(duration, 2), "variant": name,
                   "frames": len(ts), "maxGap": round(bc.max_temporal_gap(ts, duration), 2),
                   "nearDupPairs": dup,
                   "stackedPairs": close_pairs(ts, et.SPREAD_MIN_GAP),
                   "droppedNear": len(meta.get("droppedNear", [])),
                   "dens": len(meta.get("dens", []))}
            rows.append(row)
            print(f"{vid[:12]:12s} {duration:6.1f}s {name:11s} n={row['frames']:2d} "
                  f"gap={row['maxGap']:5.2f} dup={dup:3d} "
                  f"stacked(<{et.SPREAD_MIN_GAP}s)={row['stackedPairs']:2d} "
                  f"dropped={row['droppedNear']:2d}", flush=True)
    out = os.path.join(RESULTS, "exp_v4_ab.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    agg = {}
    for r in rows:
        a = agg.setdefault(r["variant"], {"n": 0, "frames": 0, "gap": 0.0,
                                          "dup": 0, "stacked": 0, "dropped": 0})
        a["n"] += 1
        a["frames"] += r["frames"]
        a["gap"] += r["maxGap"]
        a["dup"] += r["nearDupPairs"]
        a["stacked"] += r["stackedPairs"]
        a["dropped"] += r["droppedNear"]
    print("\n=== 均值 ===")
    for k, a in agg.items():
        print(f"{k:11s} frames={a['frames']/a['n']:.1f} gap={a['gap']/a['n']:.2f} "
              f"dup={a['dup']/a['n']:.1f} stacked={a['stacked']/a['n']:.2f} "
              f"dropped={a['dropped']/a['n']:.2f}")
    print(f"\nDONE → {out}")


if __name__ == "__main__":
    main()
