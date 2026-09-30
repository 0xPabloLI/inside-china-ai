#!/usr/bin/env python3
"""#414 window-plan tests — pure functions only (no video, no model).

Covers:
- plan_windows_legacy: byte-equivalent mirror of asset-sourcer.mjs Phase 2.5
  tiers (#360) — the bench baseline for the 16→32 comparison.
- legacy_frame_timestamps: per-window fps grid (what production actually feeds).
- plan_windows: cut-aligned windows, span cap (= (budget-1) × gap floor),
  snapping, min-window guard, proportional budgets with floor.
- the floor guarantee: every window's even grid spaces points <= gap_floor.
- even_grid_timestamps: the uniform in-window grid of the 32-frame plan.

Run: ~/.venvs/mlx-vlm/bin/python -m pytest \
  scripts/short-video/__tests__/test_window_plan.py -v
"""
import os
import sys

import math

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bench", "keyframe"))

from window_plan import (  # noqa: E402
    MIN_SPACING,
    _snap_boundaries,
    _window_budgets,
    even_grid_timestamps,
    legacy_frame_timestamps,
    plan_windows,
    plan_windows_legacy,
)


# ─── legacy plan (production #360 mirror) ───

class TestLegacyPlan:
    def test_short_tier_single_window_1fps(self):
        plan = plan_windows_legacy(5.0)
        assert plan == [{"start": 0.0, "end": 5.0, "fps": 1.0}]

    def test_tier_boundary_8s_is_first_tier(self):
        # <= DEFAULT_WINDOW_END_MS takes the 1 fps tier (JS boundary semantics)
        assert plan_windows_legacy(8.0) == [{"start": 0.0, "end": 8.0, "fps": 1.0}]

    def test_mid_tier_single_window_half_fps(self):
        for d in (8.001, 20.0, 30.0):
            plan = plan_windows_legacy(d)
            assert plan == [{"start": 0.0, "end": d, "fps": 0.5}]

    def test_long_tier_three_equal_windows(self):
        plan = plan_windows_legacy(60.0)
        assert len(plan) == 3
        assert [round(w["fps"], 2) for w in plan] == [0.4, 0.4, 0.4]
        assert plan[0]["start"] == 0.0 and plan[0]["end"] == pytest.approx(20.0)
        assert plan[2]["end"] == pytest.approx(60.0)

    def test_long_tier_ms_ceiling_matches_js(self):
        # 30.25s: segments=3, segmentMs=ceil(30250/3)=10084, fps=0.79
        plan = plan_windows_legacy(30.25)
        assert len(plan) == 3
        assert plan[1]["start"] == pytest.approx(10.084)
        assert plan[1]["end"] == pytest.approx(20.168)
        assert plan[2]["end"] == pytest.approx(30.25)
        assert plan[0]["fps"] == 0.79

    def test_300s_tier_math(self):
        plan = plan_windows_legacy(300.0)
        assert len(plan) == 3 and plan[0]["fps"] == 0.08

    def test_legacy_frame_grid_30s_is_15_frames(self):
        ts = legacy_frame_timestamps(plan_windows_legacy(30.0))
        assert len(ts) == 15
        assert ts[0] == 0.0 and ts[-1] == pytest.approx(28.0)

    def test_legacy_frame_grid_60s_is_3x8(self):
        ts = legacy_frame_timestamps(plan_windows_legacy(60.0))
        assert len(ts) == 24
        # window-relative grid: +2.5s cadence, restarting at each 20s boundary
        assert ts[0] == 0.0 and ts[7] == pytest.approx(17.5)
        assert ts[8] == pytest.approx(20.0) and ts[-1] == pytest.approx(57.5)


# ─── plan_windows (the #414 proposal) ───

class TestPlanWindows:
    def test_short_clip_budget_is_capped_by_spacing(self):
        # Duration-aware cap (user decision 2026-09-30): b = floor(len/1s)+1
        # keeps the in-window cadence at or below the official 1 fps sampling
        # density instead of feeding 32 frames into 10 s (0.32 s apart,
        # near-duplicates). 1.0 s is the sweep's recall-preserving point.
        for d, expected in ((10.0, 11), (30.25, 31), (31.0, 32), (120.0, 32),
                            (248.0, 32)):
            plan = plan_windows(d, cuts=[])
            assert plan == [{"start": 0.0, "end": d, "budget": expected}], d

    def test_cap_can_be_disabled_for_the_ab_control(self):
        plan = plan_windows(10.0, cuts=[], min_spacing=None)
        assert plan == [{"start": 0.0, "end": 10.0, "budget": 32}]

    def test_span_cap_is_budget_minus_one_times_floor(self):
        # 248 = 31 x 8 is the longest single window whose 32-point even grid
        # spaces by <= 8 s; 250 s must split even with no cut to snap to.
        plan = plan_windows(250.0, cuts=[])
        assert len(plan) == 2
        assert [w["budget"] for w in plan] == [32, 32]

    def test_boundary_snaps_to_nearest_cut(self):
        plan = plan_windows(300.0, cuts=[50, 100, 150, 200, 250])
        assert len(plan) == 2
        assert plan[0]["end"] == pytest.approx(150.0)
        assert plan[1]["start"] == pytest.approx(150.0)
        assert [w["budget"] for w in plan] == [32, 32]

    def test_boundary_out_of_tolerance_keeps_equal_split(self):
        plan = plan_windows(300.0, cuts=[280.0])
        assert plan[0]["end"] == pytest.approx(150.0)

    def test_uneven_windows_scale_budgets_with_floor(self):
        plan = plan_windows(300.0, cuts=[143.2])
        assert plan[0]["end"] == pytest.approx(143.2)
        # proportional: 64×143.2/300 = 30.55 → 31; the 156.8s window caps at 32
        assert [w["budget"] for w in plan] == [31, 32]

    def test_300s_synthetic_loop_boundary(self):
        plan = plan_windows(302.5, cuts=[146.31, 176.56, 206.81])
        assert plan[0]["end"] == pytest.approx(146.31)
        assert [w["budget"] for w in plan] == [31, 32]

    def test_five_windows_1000s(self):
        # 1000 / 248 = 4.03 → 5 windows (was 4 under the first-pass 256 cap)
        plan = plan_windows(1000.0, cuts=[])
        assert len(plan) == 5
        assert all(w["budget"] == 32 for w in plan)
        assert plan[-1]["end"] == pytest.approx(1000.0)

    def test_windows_are_contiguous_and_positive(self):
        plan = plan_windows(302.5, cuts=[146.31])
        assert plan[0]["start"] == 0.0
        assert plan[-1]["end"] == pytest.approx(302.5)
        for a, b in zip(plan, plan[1:]):
            assert a["end"] == pytest.approx(b["start"])

    def test_gap_floor_holds_by_construction(self):
        # The #414 acceptance floor: every window's even grid must leave no
        # blind spot > 8 s (spacing = len / (budget - 1), endpoints included).
        cases = [(10.0, []), (30.25, []), (120.0, []), (248.0, []),
                 (250.0, []), (302.5, []), (302.5, [146.31, 176.56]),
                 (600.0, [210.0]), (1000.0, []),
                 (1000.0, [30.0, 700.0]), (5000.0, [1234.5, 2468.0])]
        for d, cuts in cases:
            plan = plan_windows(d, cuts=cuts)
            assert plan[0]["start"] == 0.0 and plan[-1]["end"] == pytest.approx(d)
            for w in plan:
                ts = even_grid_timestamps(w["start"], w["end"], w["budget"])
                span = w["end"] - w["start"]
                assert span / (w["budget"] - 1) <= 8.0 + 1e-9, (d, cuts, w)
                assert ts[0] == pytest.approx(w["start"])
                assert ts[-1] == pytest.approx(w["end"])


class TestSnapBoundaries:
    def test_snaps_within_tolerance(self):
        assert _snap_boundaries([50.0], [45.0], tol=15.0, min_win_sec=30.0,
                                win_span_max=100.0, duration=100.0) == [45.0]

    def test_skips_candidate_that_starves_a_window(self):
        # [0, 25] would be < min_win_sec → equal split stays
        assert _snap_boundaries([50.0], [25.0], tol=30.0, min_win_sec=30.0,
                                win_span_max=100.0, duration=100.0) == [50.0]

    def test_skips_candidate_that_exceeds_span_cap(self):
        # 95s trailing window > span 90 → skip (min_win low so only span binds)
        assert _snap_boundaries([50.0], [5.0], tol=30.0, min_win_sec=3.0,
                                win_span_max=90.0, duration=100.0) == [50.0]

    def test_picks_nearest_tie_by_smaller_time(self):
        assert _snap_boundaries([50.0], [45.0, 55.0], tol=15.0, min_win_sec=30.0,
                                win_span_max=100.0, duration=100.0) == [45.0]


class TestWindowBudgets:
    def test_equal_windows_get_full_budget(self):
        windows = [{"start": 0.0, "end": 100.0}, {"start": 100.0, "end": 200.0}]
        assert _window_budgets(windows, budget_max=32, gap_floor=8.0,
                               duration=200.0) == [32, 32]

    def test_floor_binds_on_tiny_window(self):
        windows = [{"start": 0.0, "end": 10.0}, {"start": 10.0, "end": 1010.0}]
        b = _window_budgets(windows, budget_max=32, gap_floor=8.0, duration=1010.0)
        # 10s window: proportional rounds to 0.3 → floored at
        # max(4, ceil(10/8)+1 = 3) = 4 (min_budget binds)
        assert b[0] == 4 and b[1] == 32


class TestDurationSpacingCap:
    def _windows(self, *spans):
        out, t = [], 0.0
        for s in spans:
            out.append({"start": t, "end": t + s})
            t += s
        return out

    def test_cap_is_the_budget_whose_grid_keeps_the_spacing(self):
        assert MIN_SPACING == 1.0            # the measured recall-safe default
        w = self._windows(30.0)
        # floor(30/1)+1 = 31 → spacing 30/30 = 1.0 exactly
        assert _window_budgets(w, budget_max=32, gap_floor=8.0, duration=30.0,
                               min_spacing=MIN_SPACING) == [31]

    def test_two_second_spacing_would_cost_half_the_recall(self):
        # exp_windows_cap.json: meanRecall 1.000 (1.0 s) vs 0.457 (2.0 s) on
        # the GT assets — the cap must not be loosened without re-running it.
        w = self._windows(30.0)
        assert _window_budgets(w, budget_max=32, gap_floor=8.0, duration=30.0,
                               min_spacing=2.0) == [16]

    def test_long_window_is_untouched(self):
        # 31 s is the break-even (budget_max-1) x min_spacing; at/above it the
        # proportional term is already the binding one.
        for span in (31.0, 62.0, 120.0, 248.0):
            w = self._windows(span)
            assert _window_budgets(w, budget_max=32, gap_floor=8.0,
                                   duration=span, min_spacing=MIN_SPACING) == [32], span

    def test_gap_floor_wins_over_the_cap_on_tiny_windows(self):
        # 1 s window: spacing cap says 1 frame, the 8 s floor says 2 → floor wins
        # (a denser grid is cheaper than a blind spot).
        w = self._windows(1.0, 999.0)
        b = _window_budgets(w, budget_max=32, gap_floor=8.0, duration=1000.0,
                            min_spacing=2.0)
        assert b[0] == max(4, math.ceil(1.0 / 8.0) + 1)

    def test_none_restores_the_uncapped_budgets(self):
        w = self._windows(10.0)
        assert _window_budgets(w, budget_max=32, gap_floor=8.0, duration=10.0,
                               min_spacing=None) == [32]

    def test_cap_never_breaks_the_gap_floor_on_any_plan(self):
        for d, cuts in ((10.0, []), (30.25, []), (30.9, []), (31.1, []),
                        (250.0, []), (302.5, [146.31]), (1000.0, [])):
            for w in plan_windows(d, cuts=cuts):
                ts = even_grid_timestamps(w["start"], w["end"], w["budget"])
                assert (w["end"] - w["start"]) / (w["budget"] - 1) <= 8.0 + 1e-9
                assert len(ts) == w["budget"]


# ─── even grid (uniform in-window feed) ───

class TestEvenGrid:
    def test_inclusive_endpoints(self):
        assert even_grid_timestamps(0.0, 10.0, 3) == [0.0, 5.0, 10.0]

    def test_single_frame_is_midpoint(self):
        assert even_grid_timestamps(0.0, 10.0, 1) == [5.0]

    def test_32_frames_over_30s(self):
        ts = even_grid_timestamps(0.0, 30.0, 32)
        assert len(ts) == 32
        assert ts[0] == 0.0 and ts[-1] == 30.0
