#!/usr/bin/env python3
"""#391 Exp 3 — tiered frame selector vs uniform/scene baselines (bench-only).

Zero-model-cost layers (empirically tuned on the 5-asset matrix, 2026-09-27):
  L1 hard cuts (scene filter 0.08, incl. the 8s fallback pts) — anchors.
  L2 appeared-and-settled local changes (UI/code/chart incremental updates):
     a block qualifies when ≥BLOCK_FRAC of its pixels changed strongly
     (PIX_DELTA) vs the LAST KEPT frame yet are stable vs the NEXT frame —
     ongoing motion (keeps moving) and blink/counter noise (changes then
     reverts) are filtered out. Measured: ui-demo GT 7/7 at
     320x180 / 20x12 / >40 / >0.03 / >=1 block.
  L3 priority-order dedupe — cuts merge near-dups (pHash) only within
     ±DEDUPE_WIN seconds so loop-repeated content can still anchor coverage
     far apart in time (ABCx2 fix). Locals keep by change strength with a
     minimum temporal separation (LOCAL_MIN_GAP): pHash cannot separate a
     tiny informative text delta from micro-motion noise, and pHash-based
     local dedupe ate the ui-demo 14.0/26 events (2026-09-27).
  L4 coverage floor — mid-point fills of blind spots > FLOOR seconds.
  L5 budget cap — explicit priority tuples (cuts > fills > locals); the old
     dict-union priority silently demoted cuts that also fired L2.

Scores: shot recall vs GT_SHOTS (unitree = mechanical-consensus GT, pending
user HITL), max temporal gap, pHash redundancy, face-interval hit (#397).

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/exp_tiered.py
"""

import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402

WORK_W, WORK_H = 320, 180     # diff working resolution
GRID_X, GRID_Y = 20, 12       # block grid (240 blocks)
PIX_DELTA = 40.0              # per-pixel strong-change threshold (0-255 gray)
BLOCK_FRAC = 0.03             # min fraction of block pixels that changed
CHANGED_RATIO = 0.002         # frame registers at >=1 qualifying block
DEDUPE_WIN = 2.0              # cuts: merge near-dups only within this window
LOCAL_MIN_GAP = 1.5           # locals: minimum temporal separation (seconds)
PHASH_TOL = 4                 # Hamming distance for "near-identical" (cuts)
FLOOR, BUDGET = 8.0, 16
TAIL_MIN_GAP = 3.0            # anchor a frame near the end if the tail is longer


def decode_frames(video, step=0.5):
    """2fps gray decode at the diff working resolution → [(t, ndarray)]."""
    proc = subprocess.run(
        [bc.FFMPEG, "-nostdin", "-i", str(video),
         "-vf", f"fps={1 / step},scale={WORK_W}:-2,format=gray",
         "-an", "-sn", "-dn", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
        capture_output=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(f"decode failed: {proc.stderr.decode(errors='replace')[-200:]}")
    frames = bc._decode_mjpeg_bytes(proc.stdout)
    return [
        (round(i * step, 3),
         np.asarray(f.convert("L").resize((WORK_W, WORK_H)), dtype=np.float32))
        for i, f in enumerate(frames)
    ]


def block_diff(frames):
    """Appeared-and-settled local-change moments vs the LAST KEPT frame.

    Returns [(t, changed_block_ratio)] — ratio feeds the L5 strength ranking.
    """
    bh, bw = WORK_H // GRID_Y, WORK_W // GRID_X
    kept, ref = [], frames[0][1]
    for i in range(1, len(frames) - 1):
        t, a = frames[i]
        nxt = frames[i + 1][1]
        settled = (np.abs(a - ref) > PIX_DELTA) & ~(np.abs(nxt - a) > PIX_DELTA)
        frac = settled[:GRID_Y * bh, :GRID_X * bw].reshape(
            GRID_Y, bh, GRID_X, bw).mean(axis=(1, 3))
        ratio = float((frac > BLOCK_FRAC).sum()) / (GRID_X * GRID_Y)
        if ratio > CHANGED_RATIO:
            kept.append((t, round(ratio, 4)))
            ref = a
    return kept


def tiered_timestamps(video, budget=BUDGET, floor=FLOOR, extra_cuts=None):
    """extra_cuts: second-signal cut times (e.g. HashDetector). They get
    priority tier 0.5 — below production scene cuts (0) but above fills (1) —
    so unconfirmed cuts never crowd out coverage anchors (2026-09-28: raw
    union let HashDetector motion FPs cost unitree its tail coverage)."""
    duration = bc.asset_duration(video)
    scene_cuts = sorted({round(t, 2)
                         for t in bc.derive_scene_timestamps(video, "0.08", None)})
    extra_set = {round(t, 2) for t in (extra_cuts or [])} - set(scene_cuts)
    cuts = sorted(set(scene_cuts) | extra_set)
    locals_ = block_diff(decode_frames(video))
    # Flood guard: "few cuts yet constant change" = single-shot dynamic content
    # (talking head, where the 4 cuts are only the mod(t,8) fallbacks so the
    # sampled set collapses onto near-duplicates). Discriminated by the
    # locals:cuts RATIO, not by an absolute locals count — an absolute
    # threshold also fired on multi-shot B-roll (unitree 58 locals / 16 cuts,
    # ABCx2 59 / 11), wrongly wiping their informative locals (2026-09-28,
    # caught by the KFS-Bench coverage factor).
    flood = len(locals_) > 10 * max(1, len(cuts))
    if flood:
        locals_ = []
    cut_set = set(cuts)
    local_ratio = {t: r for t, r in locals_}

    # L3 dedupe — cuts first (pHash near-dups within ±DEDUPE_WIN collapse so
    # loop-repeated cuts far apart in time stay as anchors), then locals by
    # change strength with a minimum temporal separation (no pHash: it cannot
    # separate tiny informative text deltas from micro-motion noise).
    from PIL import Image

    def phash_at(t):
        cell = bc.grab_frame(video, t, size_w=160)
        if cell is None:
            return None
        h = bc.phash64(Image.open(cell))
        os.unlink(cell)
        return h

    kept, seen = [], []  # seen: [(t, hash)] — cuts only
    for t in cuts:
        h = phash_at(t)
        if h is None:
            continue
        if all(abs(t - t0) > DEDUPE_WIN or bc.hamming(h, h0) > PHASH_TOL
               for t0, h0 in seen):
            kept.append(t)
            seen.append((t, h))
    for t, _r in sorted(locals_, key=lambda x: -x[1]):
        if t in cut_set:
            continue
        if all(abs(t - t0) >= LOCAL_MIN_GAP for t0 in kept):
            kept.append(t)

    # L4 coverage floor: mid-point fills of blind spots > floor (bounded).
    # Plus a TAIL anchor: symmetric to the scene filter's eq(n,0) first-frame
    # anchor, because an 8s floor lets a short final scene slip through
    # (ui-demo's last 4s = fully-typed final state had zero frames; flagged by
    # the KFS-Bench coverage factor, 2026-09-28).
    fills = []
    while len(fills) < budget:
        sel = sorted(kept + fills)
        bounds = [0.0] + sel + [duration]
        g, mid = max((b - a, (a + b) / 2) for a, b in zip(bounds, bounds[1:]))
        if g <= floor:
            break
        fills.append(round(mid, 2))
    if not flood and kept and duration - max(kept + fills) > TAIL_MIN_GAP:
        tail = round(max(max(kept + fills) + 1.0, duration - 0.5), 2)
        if all(abs(tail - t) > 0.2 for t in kept + fills):
            fills.append(tail)

    # L5 budget cap — explicit priority tuples (no dict-override hazard).
    # Scene cuts (0) > second-signal cuts (0.5) > fills (1) > locals (2):
    # unconfirmed extra cuts must not crowd out coverage anchors.
    def prio(t):
        if t in scene_cuts:
            return (0, t)
        if t in extra_set:
            return (0.5, t)
        if t in fills:
            return (1, t)
        return (2, -local_ratio.get(t, 0.0))

    sel = sorted(sorted(kept + fills, key=prio)[:budget])
    return sel, {"cuts": cuts, "locals": [t for t, _ in locals_], "fills": fills}


def face_intervals_for(video):
    import focus_detector
    focus_detector.init_classifier()
    if not focus_detector._cascade_loaded:
        raise RuntimeError("haar cascade failed")
    from criteria_eval import probe_face_intervals
    intervals, _ = probe_face_intervals(video, focus_detector)
    return intervals


def face_hit(ts, intervals):
    if not intervals or not ts:
        return None, 0, 0
    hit = [iv for iv in intervals if any(iv[0] <= t <= iv[1] for t in ts)]
    return round(len(hit) / len(intervals), 3), len(hit), len(intervals)


def main():
    out = []
    # baselines' face-hit from the existing criteria matrix
    cm_path = os.path.join(RESULTS, "criteria_matrix.json")
    cm = json.load(open(cm_path)) if os.path.exists(cm_path) else {}
    face_base = {(r["asset"], r["config"]): r["faceIntervalHitRate"]
                 for r in cm.get("layer2Focus", [])}

    for slug in bc.ASSETS:
        video = bc.ASSETS[slug]
        if not os.path.exists(video):
            continue
        duration = bc.asset_duration(video)
        gt = bc.GT_SHOTS.get(slug, {})
        gt_times = gt.get("times", [])
        intervals = face_intervals_for(video)

        variants = [("tiered", None)]
        for cfg in ("uniform_16fps2", "scene_008_cap16"):
            ts, _art = bc.resolved_timestamps(slug, cfg)
            variants.append((cfg, sorted(ts)))

        for name, ts in variants:
            meta = None
            if ts is None:
                ts, meta = tiered_timestamps(video)
            recall, hits, total, _pairs = bc.shot_recall(ts, gt_times, tol=0.5)
            gap = bc.max_temporal_gap(ts, duration)
            hashes = []
            from PIL import Image
            for t in ts:
                cell = bc.grab_frame(video, t, size_w=160)
                if cell is not None:
                    hashes.append(bc.phash64(Image.open(cell)))
                    os.unlink(cell)
            red = bc.redundancy_stats(hashes)
            fh, h, tot = face_hit(ts, intervals)
            row = {"asset": slug, "strategy": name, "frames": len(ts),
                   "recall": None if recall is None else round(recall, 3),
                   "hits": hits, "gt": total, "gtKind": gt.get("kind"),
                   "maxGap": round(gap, 2), "nearDup": red["nearDupPairs"],
                   "faceHit": fh if slug != "unitree-superman-demo-30s"
                              else face_base.get((slug, name), "haarFP"),
                   "ts": [round(t, 2) for t in ts]}
            if meta is not None:
                row["tieredMeta"] = {k: v for k, v in meta.items() if k != "cuts"}
            out.append(row)
            print(f"{slug[:24]:24s} {name:16s} n={row['frames']:2d} "
                  f"recall={row['recall']} ({hits}/{total}) gap={row['maxGap']}s "
                  f"nearDup={row['nearDup']} faceHit={row['faceHit']}", flush=True)
            if meta is not None:
                print(f"    cuts={meta['cuts']}")
                print(f"    locals(n={len(meta['locals'])})={meta['locals'][:20]}")
                print(f"    fills={meta['fills']}")

    with open(os.path.join(RESULTS, "exp_tiered.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"DONE → {os.path.join(RESULTS, 'exp_tiered.json')}", flush=True)


if __name__ == "__main__":
    main()