#!/usr/bin/env python3
"""#414 follow-up — how sensitive is the duration-aware cap to `min_spacing`?

The cap (`window_plan.MIN_SPACING`, default 2.0 s) trades recall for redundancy
on short assets. This sweep quantifies that trade per candidate spacing so the
default is picked from data, not taste:

  spacing in {None (pre-cap 32-frame design), 1.0, 1.5, 2.0, 3.0}

Pass 1 is geometry only (frames / max gap / GT recall) for every asset — cheap.
Pass 2 adds the redundancy block (near-dup pairs + informative share) for the
assets where the cap binds at ANY spacing, at ALL spacings — the same asset set
every column, so the means are paired; pHash costs one frame grab per timestamp,
which is why it is not run on the untouched long assets.

Output: results/exp_windows_cap.json

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/exp_windows_cap.py
"""

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")

sys.path.insert(0, HERE)
import bench_common as bc  # noqa: E402
import exp_windows as ew  # noqa: E402
import window_plan as wp  # noqa: E402

SPACINGS = [None, 1.0, 1.5, 2.0, 3.0]


def label(s):
    return "precap32" if s is None else f"cap{s:g}s"


def grid_for(duration, cuts, spacing):
    plan = wp.plan_windows(duration, cuts, min_spacing=spacing)
    ts = []
    for w in plan:
        ts.extend(wp.even_grid_timestamps(w["start"], w["end"], w["budget"]))
    return sorted({round(t, 3) for t in ts if 0 <= t <= duration}), plan


def main():
    ew.build_long_asset()
    assets = [(slug, p) for slug, p in bc.ASSETS.items() if os.path.exists(p)]
    assets += ew.pick_vm_sample()
    assets.append((ew.LONG_SLUG, ew.LONG_PATH))

    rows = []
    grids = {}                       # (slug, label) -> timestamps (reused in pass 2)
    print(f"{'asset':36s} {'dur':>7s} {'spacing':9s} {'n':>3s} {'gap':>6s} "
          f"{'recall':>7s}", flush=True)
    for slug, video in assets:
        duration = bc.asset_duration(video)
        gt = bc.GT_SHOTS.get(slug, {}).get("times", [])
        if slug == ew.LONG_SLUG:
            gt = ew.long_gt()
        cuts = ew.pure_scene_cuts(video)
        base_frames = None
        for spacing in SPACINGS:
            ts, plan = grid_for(duration, cuts, spacing)
            grids[(slug, label(spacing))] = (ts, video, duration)
            if base_frames is None:
                base_frames = len(ts)
            recall, hits, total, _ = bc.shot_recall(ts, gt, tol=0.5)
            gap = bc.max_temporal_gap(ts, duration)
            row = {"asset": slug, "spacing": spacing, "durationS": round(duration, 2),
                   "windows": len(plan), "frames": len(ts),
                   "budgets": [w["budget"] for w in plan],
                   "recall": None if recall is None else round(recall, 3),
                   "recallHits": hits, "gtShots": total,
                   "maxGap": round(gap, 2),
                   "capped": spacing is not None and len(ts) < base_frames}
            rows.append(row)
            print(f"{slug[:36]:36s} {duration:7.1f} {label(spacing):9s} "
                  f"{len(plan):3d} {len(ts):3d} {gap:6.2f} "
                  f"{str(row['recall']):>7s}", flush=True)

    # ── pass 2: redundancy on the assets the cap touches (same set per column) ──
    affected = sorted({r["asset"] for r in rows if r["capped"]})
    print(f"\nredundancy pass on {len(affected)} cap-affected assets", flush=True)
    for slug in affected:
        for spacing in SPACINGS:
            ts, video, _ = grids[(slug, label(spacing))]
            t0 = time.time()
            hs = ew.hashtimes(video, ts)
            red = bc.redundancy_stats(hs)
            ishare = ew.informative_share(hs)
            for row in rows:
                if row["asset"] == slug and row["spacing"] == spacing:
                    row["nearDupPairs"] = red["nearDupPairs"]
                    row["pairs"] = red["pairs"]
                    row["dupRate"] = (round(red["nearDupPairs"] / red["pairs"], 4)
                                      if red["pairs"] else None)
                    row["informativeShare"] = ishare
                    row["hashSec"] = round(time.time() - t0, 1)
                    break
            print(f"{slug[:36]:36s} {label(spacing):9s} dup={red['nearDupPairs']:4d} "
                  f"ishare={ishare:>7}", flush=True)

    out = os.path.join(RESULTS, "exp_windows_cap.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)

    # ── summary: the acceptance's single-window assets ──
    by = {}
    for r in rows:
        by.setdefault(r["asset"], {})[label(r["spacing"])] = r
    single = [a for a, v in by.items() if v["precap32"]["windows"] == 1]
    capset = [a for a in single if any(v["capped"] for v in by[a].values())]
    print(f"\nsingle-window assets: {len(single)} (cap binds on {len(capset)})")
    print(f"{'spacing':9s} {'meanFrames':>10s} {'meanRecall':>10s} {'maxGap':>7s} "
          f"{'meanDupRate':>12s} {'meanIShare':>11s}", flush=True)
    for spacing in SPACINGS:
        lab = label(spacing)
        fr = [by[a][lab]["frames"] for a in single]
        rec = [by[a][lab]["recall"] for a in single if by[a][lab]["recall"] is not None]
        gaps = [by[a][lab]["maxGap"] for a in single]
        dups = [by[a][lab]["dupRate"] for a in capset]
        ish = [by[a][lab]["informativeShare"] for a in capset]
        print(f"{lab:9s} {sum(fr)/len(fr):10.1f} "
              f"{(sum(rec)/len(rec) if rec else float('nan')):10.3f} "
              f"{max(gaps):7.2f} "
              f"{sum(dups)/len(dups):12.4f} {sum(ish)/len(ish):11.4f}", flush=True)
    print(f"\nDONE → {out}", flush=True)


if __name__ == "__main__":
    main()
