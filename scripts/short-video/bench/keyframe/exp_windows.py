#!/usr/bin/env python3
"""#414 bench — cut-aligned 32-frame plan vs the 24-frame status quo (offline).

Variants per asset (no VLM, geometry only):
  legacy24       plan_windows_legacy + per-window fps grids (today's feed)
  cutwin32_unif  plan_windows(32, min_spacing=None) + even in-window grids
  cutwin32_cap   plan_windows(32) + even grids — the duration-aware per-window
                 cap (min_spacing, default 2.0 s; WIN_CAP_SPACING overrides)
  cutwin32_v5    plan_windows(32) + tiered_v5 per window (densify + floor
                 guard at 8 s) — the coverage-floor variant
  uniform32      global uniform 32 (true_uniform_timestamps @1fps cap 32) —
                 the acceptance's redundancy reference

Metrics: frames / windows / shot recall (GT assets only) / max temporal gap /
near-dup pairs (pHash hamming<=4) + pair rate / informative share (fraction of
frames that are not a near-dup of another selected frame).

Assets: 5 bench assets (GT) + 10 stratified Video-MME clips + a synthetic
302.5 s ABCx2 loop (built on demand; construction GT incl. loop seams) so the
multi-window path (n=2, boundary snapping) is exercised.

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/exp_windows.py
"""

import json
import os
import subprocess
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
import window_plan as wp  # noqa: E402

LONG_SLUG = "content_ABCx2_302s"
LONG_PATH = os.path.join(bc.BENCH_ASSETS, f"{LONG_SLUG}.mp4")
LOOP_S = 30.25
LOOPS = 10
LOOP_INNER_CUTS = [5.06, 10.13, 15.19, 20.25, 25.31]
VM_SAMPLE = int(os.environ.get("WIN_VM_SAMPLE", "10"))
CAP_SPACING = float(os.environ.get("WIN_CAP_SPACING", str(wp.MIN_SPACING)))

VARIANTS = ["legacy24", "cutwin32_unif", "cutwin32_cap", "cutwin32_v5", "uniform32"]


def build_long_asset():
    if os.path.exists(LONG_PATH):
        return
    os.makedirs(bc.BENCH_ASSETS, exist_ok=True)
    src = bc.ASSETS["content_ABCx2_30s"]
    subprocess.run(
        [bc.FFMPEG, "-nostdin", "-y", "-stream_loop", str(LOOPS - 1), "-i", src,
         "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
         "-pix_fmt", "yuv420p", LONG_PATH],
        capture_output=True, timeout=600, check=True)
    print(f"built {LONG_PATH}", flush=True)


def long_gt():
    times = []
    for k in range(LOOPS):
        base = k * LOOP_S
        if k > 0:
            times.append(round(base, 3))          # loop seam = content change
        times.extend(round(base + t, 3) for t in LOOP_INNER_CUTS)
    return times


def pick_vm_sample():
    vids = sorted(f[:-4] for f in os.listdir(os.path.join(VM, "videos"))
                  if f.endswith(".mp4"))
    if not vids:
        return []
    step = max(1, len(vids) // VM_SAMPLE)
    return [(f"videomme/{v}", os.path.join(VM, "videos", v + ".mp4"))
            for v in vids[::step][:VM_SAMPLE]]


def pure_scene_cuts(video):
    """Hard cuts only (scene > 0.08, no mod(t,8) fallback) — boundary snapping
    candidates for plan_windows."""
    return sorted({round(t, 2) for t in
                   bc._showinfo_timestamps(video, "select='gt(scene,0.08)'", None)})


def window_clip(video, lo, hi):
    clip = f"/tmp/winclip_{os.path.basename(video)[:-4]}_{int(lo * 100)}_{int(hi * 100)}.mp4"
    subprocess.run([bc.FFMPEG, "-nostdin", "-y", "-ss", f"{lo:.3f}", "-i", video,
                    "-t", f"{max(hi - lo, 0.05):.3f}",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-an", clip], capture_output=True, timeout=300)
    return clip


def select_v5(video, plan):
    """tiered_v5 per window: crop → select(budget, densify, floor guard 8 s) →
    shift back to the source timeline."""
    out = []
    for w in plan:
        clip = window_clip(video, w["start"], w["end"])
        try:
            if not (os.path.exists(clip) and os.path.getsize(clip) > 2000):
                out.append(round((w["start"] + w["end"]) / 2, 2))
                continue
            ts, _ = et.tiered_timestamps(clip, budget=w["budget"],
                                         densify=True, enforce_floor=True,
                                         floor=wp.GAP_FLOOR)
            out.extend(sorted({round(min(w["start"] + t, w["end"]), 2) for t in ts}))
        finally:
            if os.path.exists(clip):
                os.unlink(clip)
    return out


def hashtimes(video, ts):
    from PIL import Image
    hs = []
    for t in ts:
        cell = bc.grab_frame(video, t, size_w=160)
        if cell is None:
            continue
        hs.append(bc.phash64(Image.open(cell)))
        os.unlink(cell)
    return hs


def informative_share(hashes):
    if len(hashes) < 2:
        return None
    dup = 0
    for i, a in enumerate(hashes):
        if any(bc.hamming(a, b) <= 4 for j, b in enumerate(hashes) if j != i):
            dup += 1
    return round(1 - dup / len(hashes), 4)


def variant_timestamps(video, duration, cuts, variant):
    if variant == "legacy24":
        plan = wp.plan_windows_legacy(duration)
        return wp.legacy_frame_timestamps(plan), plan
    if variant == "cutwin32_unif":
        plan = wp.plan_windows(duration, cuts, min_spacing=None)
        ts = []
        for w in plan:
            ts.extend(wp.even_grid_timestamps(w["start"], w["end"], w["budget"]))
        return sorted({round(t, 3) for t in ts if 0 <= t <= duration}), plan
    if variant == "cutwin32_cap":
        plan = wp.plan_windows(duration, cuts, min_spacing=CAP_SPACING)
        ts = []
        for w in plan:
            ts.extend(wp.even_grid_timestamps(w["start"], w["end"], w["budget"]))
        return sorted({round(t, 3) for t in ts if 0 <= t <= duration}), plan
    if variant == "cutwin32_v5":
        # Pre-cap plan on purpose: unif-vs-v5 then isolates the FEED (tiered
        # selection) and unif-vs-cap isolates the PLAN (duration cap). Feeding
        # v5 the capped plan is a separate question (tiered densify already
        # owns the in-window spacing).
        plan = wp.plan_windows(duration, cuts, min_spacing=None)
        return select_v5(video, plan), plan
    if variant == "uniform32":
        return bc.true_uniform_timestamps(video, 1.0, 32), []
    raise ValueError(variant)


def main():
    build_long_asset()
    assets = [(slug, p) for slug, p in bc.ASSETS.items() if os.path.exists(p)]
    assets += pick_vm_sample()
    assets.append((LONG_SLUG, LONG_PATH))
    rows = []
    print(f"{'asset':34s} {'dur':>7s} {'variant':13s} {'win':>3s} {'n':>3s} "
          f"{'recall':>7s} {'gap':>7s} {'dup':>4s} {'ishare':>7s}", flush=True)
    for slug, video in assets:
        duration = bc.asset_duration(video)
        gt = bc.GT_SHOTS.get(slug, {}).get("times", [])
        if slug == LONG_SLUG:
            gt = long_gt()
        cuts = pure_scene_cuts(video)
        for variant in VARIANTS:
            t0 = time.time()
            try:
                ts, plan = variant_timestamps(video, duration, cuts, variant)
            except Exception as e:
                print(f"{slug[:34]:34s} {variant:13s} FAILED "
                      f"{type(e).__name__}: {str(e)[:80]}", flush=True)
                rows.append({"asset": slug, "variant": variant,
                             "error": f"{type(e).__name__}: {str(e)[:200]}"})
                continue
            ts = sorted(t for t in ts if 0 <= t <= duration)
            recall, hits, total, _ = bc.shot_recall(ts, gt, tol=0.5)
            gap = bc.max_temporal_gap(ts, duration)
            hs = hashtimes(video, ts)
            red = bc.redundancy_stats(hs)
            ishare = informative_share(hs)
            row = {"asset": slug, "variant": variant,
                   "durationS": round(duration, 2),
                   "windows": len(plan), "frames": len(ts),
                   "recall": None if recall is None else round(recall, 3),
                   "recallHits": hits, "gtShots": total,
                   "maxGap": round(gap, 2),
                   "nearDupPairs": red["nearDupPairs"], "pairs": red["pairs"],
                   "dupRate": (round(red["nearDupPairs"] / red["pairs"], 4)
                               if red["pairs"] else None),
                   "informativeShare": ishare,
                   "plan": plan, "selSec": round(time.time() - t0, 1)}
            rows.append(row)
            print(f"{slug[:34]:34s} {duration:7.1f} {variant:13s} "
                  f"{len(plan):3d} {len(ts):3d} {str(row['recall']):>7s} "
                  f"{gap:7.2f} {red['nearDupPairs']:4d} {str(ishare):>7s}",
                  flush=True)
    out = os.path.join(RESULTS, "exp_windows.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {out}", flush=True)


if __name__ == "__main__":
    main()
