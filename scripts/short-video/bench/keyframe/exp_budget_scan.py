#!/usr/bin/env python3
"""#391 frame-budget scan — what does raising the frame budget cost, and what
does it buy, as a function of clip length? (bench-only, CPU-only)

Motivation (user decision 2026-09-28): the frame budget should grow, but the
cost has to be balanced against wall time and clip duration. The production
window design (3 windows x 8 frames) is far below MiniCPM's official sampling
route (<=128s @1fps), so before proposing a new budget this measures the two
sides of the trade:

  buy  = shot recall (±0.5s, only on assets with ground truth), max temporal
         gap, pHash near-duplicate pairs — all budget-independent code paths
  cost = selection wall time per asset-budget (ffmpeg decode + scene pass +
         pHash/CDP work), reported next to the clip duration

Assets: the 5 bench assets (10-30s, ground truth available) plus a stratified
sample of downloaded Video-MME clips (1-2 min, no GT → gap/redundancy only).

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/exp_budget_scan.py
"""

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_tiered as et  # noqa: E402
import methods_bench as mb  # noqa: E402
import methods_bench3 as mb3  # noqa: E402

BUDGETS = [int(b) for b in os.environ.get("BS_BUDGETS", "16,32,64").split(",")]
VM_SAMPLE = int(os.environ.get("BS_VM_SAMPLE", "10"))
STRATEGIES = ["uniform", "tiered", "tiered_v4", "slice"]


def select(video, duration, name, budget):
    if name == "uniform":
        return bc.true_uniform_timestamps(video, 1.0, budget)
    if name == "tiered":
        return et.tiered_timestamps(video, budget=budget)[0]
    if name == "tiered_v4":
        return et.tiered_timestamps(video, budget=budget, densify=True,
                                    spread_guard=True)[0]
    if name == "slice":
        return mb3.m_slice(video, budget=budget)
    raise ValueError(name)


def pick_vm_sample():
    """Stratified by duration across the downloaded Video-MME clips."""
    vids = sorted(f[:-4] for f in os.listdir(os.path.join(VM, "videos"))
                  if f.endswith(".mp4"))
    if not vids:
        return []
    out = []
    step = max(1, len(vids) // VM_SAMPLE)
    for v in vids[::step][:VM_SAMPLE]:
        out.append((f"videomme/{v}", os.path.join(VM, "videos", v + ".mp4")))
    return out


def main():
    import warnings
    warnings.filterwarnings("ignore")
    assets = [(slug, p) for slug, p in bc.ASSETS.items() if os.path.exists(p)]
    assets += pick_vm_sample()
    rows = []
    print(f"{'asset':32s} {'dur':>6s} {'strategy':10s} {'budget':>6s} "
          f"{'n':>3s} {'recall':>7s} {'gap':>7s} {'dup':>4s} {'selSec':>7s}")
    for slug, video in assets:
        duration = bc.asset_duration(video)
        intervals = bc.gt_scene_intervals(slug, duration)
        gt_times = bc.GT_SHOTS.get(slug, {}).get("times", [])
        for name in STRATEGIES:
            for budget in BUDGETS:
                t0 = time.time()
                try:
                    ts = select(video, duration, name, budget)
                except Exception as e:
                    print(f"{slug[:32]:32s} {name:10s} {budget:6d}  FAILED: "
                          f"{type(e).__name__}: {str(e)[:60]}", flush=True)
                    rows.append({"asset": slug, "strategy": name,
                                 "budget": budget,
                                 "error": f"{type(e).__name__}: {str(e)[:200]}"})
                    continue
                sel_sec = time.time() - t0
                ts = mb.subsample(sorted(t for t in ts if 0 <= t <= duration),
                                  budget)
                recall, hits, total, _ = bc.shot_recall(ts, gt_times, tol=0.5)
                gap = bc.max_temporal_gap(ts, duration)
                from PIL import Image
                hashes = []
                for t in ts:
                    cell = bc.grab_frame(video, t, size_w=160)
                    if cell is not None:
                        hashes.append(bc.phash64(Image.open(cell)))
                        os.unlink(cell)
                dup = bc.redundancy_stats(hashes)["nearDupPairs"]
                rows.append({"asset": slug, "strategy": name, "budget": budget,
                             "durationS": round(duration, 2), "frames": len(ts),
                             "recall": None if recall is None else round(recall, 3),
                             "recallHits": hits, "gtShots": total,
                             "maxGap": round(gap, 2), "nearDupPairs": dup,
                             "selSec": round(sel_sec, 2),
                             "secPerFrame": round(sel_sec / max(1, len(ts)), 3),
                             "intervals": len(intervals or [])})
                r = rows[-1]
                print(f"{slug[:32]:32s} {duration:6.1f} {name:10s} {budget:6d} "
                      f"{len(ts):3d} {str(r['recall']):>7s} {gap:7.2f} "
                      f"{dup:4d} {sel_sec:7.2f}", flush=True)

    out = os.path.join(RESULTS, "exp_budget_scan.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {out}")


if __name__ == "__main__":
    main()
