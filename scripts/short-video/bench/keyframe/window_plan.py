#!/usr/bin/env python3
"""#414 window-plan proposal + production mirror — bench-only (NOT production).

Ticket #414: replace the production window plan (3 equal windows x <=8 frames,
#360) with cut-aligned windows and a 32-frame per-window budget (the recall
knee from the #391 budget scan), while keeping the max-gap <= 8 s floor inside
every window (tiered v5's L7 guard, applied by the caller).

Design:
  - A single VLM call with `budget_max` frames can hold the gap floor only if
    its window is <= (budget_max - 1) x gap_floor seconds (31 x 8 = 248 s):
    the even in-window grid spaces points by window_s / (budget - 1), so the
    span cap must subtract the closing endpoint. (First pass used
    budget_max x gap_floor = 256 s, which lets a 250 s window emit 8.06 s
    gaps; corrected before landing. No bench asset plan changes — the
    affected span (248, 256] s holds no asset.)
  - Window count n = ceil(D / span_cap); internal boundaries start at equal
    splits and snap to the nearest hard cut within +/-tol (tol = min(SNAP_SEC,
    10% of D/n)) when the adoption keeps both neighbouring windows
    >= MIN_WIN_SEC and <= the span cap. No valid candidate -> equal split.
  - Budgets: b_i = clamp(round(budget_max x n x w_i / D), floor_i, budget_max)
    with floor_i = max(MIN_BUDGET, min(budget_max, ceil(w_i / gap_floor) + 1)):
    equal windows get exactly budget_max ("每窗预算 32 帧"), uneven windows
    scale with length, and a short window never falls to zero ("单窗下限").
    The +1 is what makes w_i / (b_i - 1) <= gap_floor hold when the floor
    (not the proportional term) is the binding constraint.

plan_windows_legacy mirrors asset-sourcer.mjs Phase 2.5 (#360) the way the
numbers reach the frame grids (ms-ceiling segmentation, 2dp fps rounding,
Math.round semantics) — it is the "24-frame status quo" baseline of the #414
bench. Keep in sync if the production tiers change.

Run tests: ~/.venvs/mlx-vlm/bin/python -m pytest \
  scripts/short-video/__tests__/test_window_plan.py -v
"""

import math

BUDGET_MAX = 32
GAP_FLOOR = 8.0
SNAP_SEC = 15.0
SNAP_FRAC = 0.10
MIN_WIN_SEC = 30.0
MIN_BUDGET = 4


def _js_round(x):
    """Math.round semantics for positive values (half away from zero)."""
    return math.floor(x + 0.5)


# ─── production mirror (#360 tiers) ─────────────────────────────────────────

def plan_windows_legacy(duration, window_end_ms=8000, long_tier_ms=30000,
                        max_segments=3, max_frames_per_segment=8,
                        default_fps=1.0, reduced_fps=0.5):
    """asset-sourcer.mjs Phase 2.5 mirror: duration tiers -> window plan.

    Returns [{"start": s, "end": e, "fps": fps}] in seconds, matching the JS
    constants (DEFAULT_WINDOW_END_MS / LONG_TIER_MAX_MS / MAX_SEGMENTS /
    MAX_FRAMES_PER_SEGMENT / DEFAULT_SAMPLE_FPS / REDUCED_SAMPLE_FPS).
    """
    duration_ms = duration * 1000.0
    if duration_ms <= window_end_ms:
        return [{"start": 0.0, "end": duration, "fps": default_fps}]
    if duration_ms <= long_tier_ms:
        return [{"start": 0.0, "end": duration, "fps": reduced_fps}]
    segments = min(math.ceil(duration_ms / window_end_ms), max_segments)
    segment_ms = math.ceil(duration_ms / segments)
    fps = min(default_fps, max_frames_per_segment / (segment_ms / 1000.0))
    fps = _js_round(fps * 100) / 100
    return [
        {"start": round(i * segment_ms / 1000.0, 3),
         "end": round(min((i + 1) * segment_ms, duration_ms) / 1000.0, 3),
         "fps": fps}
        for i in range(segments)
    ]


def legacy_frame_timestamps(plan):
    """Per-window fps grid, mirroring `ffmpeg -vf fps=<f>` per window: frames
    at k/fps (k = 0..N-1) relative to the window start, with
    N = ceil(window_s x fps - 1e-9), min 1."""
    out = []
    for w in plan:
        dur = w["end"] - w["start"]
        n = max(1, math.ceil(dur * w["fps"] - 1e-9))
        out.extend(round(w["start"] + k / w["fps"], 3) for k in range(n))
    return out


# ─── #414 proposal ──────────────────────────────────────────────────────────

def _snap_boundaries(targets, cuts, tol, min_win_sec, win_span_max, duration):
    """Pick one boundary time per target: the nearest cut within +/-tol whose
    adoption keeps every window >= min_win_sec and <= win_span_max; else the
    equal-split target itself. Ties break to the smaller time."""
    bounds = []
    prev = 0.0
    for idx, t in enumerate(targets):
        nxt = targets[idx + 1] if idx + 1 < len(targets) else duration
        chosen = t
        best = None
        for c in sorted(set(cuts)):
            if abs(c - t) > tol + 1e-9:
                continue
            if c - prev < min_win_sec - 1e-9 or nxt - c < min_win_sec - 1e-9:
                continue
            if c - prev > win_span_max + 1e-9 or nxt - c > win_span_max + 1e-9:
                continue
            key = (abs(c - t), c)
            if best is None or key < best:
                best, chosen = key, c
        bounds.append(chosen)
        prev = chosen
    return bounds


def _window_budgets(windows, budget_max, gap_floor, duration,
                    min_budget=MIN_BUDGET):
    """Proportional in-window budgets with a length-derived floor and the
    per-window cap. Equal windows -> exactly budget_max each.

    floor_i = ceil(len / gap_floor) + 1: with an even grid of b points over
    len seconds the spacing is len / (b - 1), so b = ceil(len/gap) alone
    leaves len/(b-1) > gap whenever len is not an exact multiple.
    """
    n = len(windows)
    total = budget_max * n
    out = []
    for w in windows:
        length = w["end"] - w["start"]
        floor_i = max(min_budget,
                      min(budget_max, math.ceil(length / gap_floor - 1e-9) + 1))
        b = _js_round(total * length / duration)
        out.append(int(max(floor_i, min(budget_max, b))))
    return out


def plan_windows(duration, cuts, budget_max=BUDGET_MAX, gap_floor=GAP_FLOOR,
                 snap_sec=SNAP_SEC, snap_frac=SNAP_FRAC,
                 min_win_sec=MIN_WIN_SEC, min_budget=MIN_BUDGET):
    """Cut-aligned window plan: [{start, end, budget}], contiguous, covering
    [0, duration]. See module docstring for the rules."""
    if duration <= 0:
        return []
    win_span_max = (budget_max - 1) * gap_floor
    n = max(1, math.ceil(duration / win_span_max - 1e-9))
    targets = [duration * i / n for i in range(1, n)]
    tol = min(snap_sec, snap_frac * duration / n)
    inside = [c for c in cuts if 1e-9 < c < duration - 1e-9]
    bounds = _snap_boundaries(targets, inside, tol=tol, min_win_sec=min_win_sec,
                              win_span_max=win_span_max, duration=duration)
    edges = [0.0] + bounds + [duration]
    windows = [{"start": round(a, 3), "end": round(b, 3)}
               for a, b in zip(edges, edges[1:])]
    budgets = _window_budgets(windows, budget_max=budget_max,
                              gap_floor=gap_floor, duration=duration,
                              min_budget=min_budget)
    return [{"start": w["start"], "end": w["end"], "budget": b}
            for w, b in zip(windows, budgets)]


def even_grid_timestamps(start, end, n):
    """n points from start to end inclusive (the plan's uniform in-window
    feed); n <= 1 -> the midpoint."""
    if n <= 1:
        return [round((start + end) / 2, 3)]
    step = (end - start) / (n - 1)
    return [round(start + i * step, 3) for i in range(n)]
