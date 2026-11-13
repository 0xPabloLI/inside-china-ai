"""Tests for the #541 relevance bench (scripts/short-video/bench/relevance).

The bench is research scaffolding, but its numbers become a tolerance decision,
so the parts that turn raw runs into FPR/FNR are pinned here: crop geometry
(must match lib/crop-decision.mjs), the production admission rule (must match
lib/relevance-verdict.mjs), the CI math, and the one invariant the whole design
rests on — ground truth never comes from the model under test.
"""

import importlib.util
import json
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH = os.path.abspath(
    os.path.join(HERE, "..", "bench", "relevance", "relevance_bench.py")
)


def load_bench():
    spec = importlib.util.spec_from_file_location("relevance_bench", BENCH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bench = load_bench()


# ─── crop geometry (mirror of lib/crop-decision.mjs) ───


def test_object_position_fixed_points():
    # 0 / 0.5 / 1 are fixed points of f -> p (#1040 contract).
    assert bench.object_position([0.5, 0.5], 1920, 2880)["x"] == 0.5
    assert bench.object_position([0.0, 0.5], 1920, 2880)["x"] == 0.0
    assert bench.object_position([1.0, 0.5], 1920, 2880)["x"] == 1.0


def test_object_position_matches_js_formula():
    # p = (f*r - 0.5) / (r - 1), r = sourceAspect / targetAspect.
    source_aspect = 3456 / 5184
    r = source_aspect / (9 / 16)
    focus = 0.55
    expected = (focus * r - 0.5) / (r - 1)
    assert bench.object_position([focus, 0.5], 3456, 5184)["x"] == pytest.approx(
        round(expected, 3)
    )


def test_object_position_clamps_and_centres_uncropped_axis():
    assert bench.object_position([2.0, -1.0], 1920, 2880)["x"] == 1.0
    # A portrait source narrower than 9:16 needs no vertical/horizontal crop.
    assert bench.object_position([0.1, 0.9], 900, 1600)["x"] == 0.5


def test_crop_window_keeps_full_height_and_follows_position():
    window = bench.crop_window(3456, 5184, 0.5)
    assert window[1] == 0.0 and window[3] == 1.0
    assert window[2] == pytest.approx((9 / 16) / (3456 / 5184), abs=1e-3)
    # p slides the window across the slack: left edge at 0, right edge at 1.
    assert bench.crop_window(3456, 5184, 0.0)[0] == 0.0
    assert bench.crop_window(3456, 5184, 1.0)[0] == pytest.approx(1 - window[2], abs=1e-3)


def test_crop_window_returns_whole_frame_when_already_vertical():
    assert bench.crop_window(900, 1600, 0.8) == [0.0, 0.0, 1.0, 1.0]


def test_rect_inside_fraction():
    window = [0.2, 0.0, 0.6, 1.0]
    assert bench.rect_inside_fraction([0.3, 0.2, 0.2, 0.2], window) == 1.0
    assert bench.rect_inside_fraction([0.0, 0.2, 0.1, 0.2], window) == 0.0
    assert bench.rect_inside_fraction([0.1, 0.2, 0.2, 0.2], window) == pytest.approx(0.5)


def test_load_crop_focus_reads_queue_positions(tmp_path):
    """score must reuse the queue's framing, not invent a centre crop."""
    (tmp_path / "queue.json").write_text(
        json.dumps(
            {
                "assets": {
                    "A": {"candidate": {"position": {"x": 0.4, "y": 0.5}}},
                    "B": {"candidate": {}},
                }
            }
        ),
        encoding="utf-8",
    )
    assert bench.load_crop_focus(str(tmp_path)) == {"A": {"x": 0.4, "y": 0.5}}
    assert bench.load_crop_focus(str(tmp_path / "missing")) == {}


# ─── admission rule (mirror of lib/relevance-verdict.mjs) ───


def run(first, second=None):
    return {"firstPass": {"relevance": first}, "secondPass": second}


def test_admitted_matches_production_rule():
    assert bench.admitted(run(60)) is True
    assert bench.admitted(run(59, {"verdict": "match"})) is True
    assert bench.admitted(run(59, {"verdict": "no_match"})) is False
    assert bench.admitted(run(39, {"verdict": "match"})) is False  # below the band
    assert bench.admitted(run(None)) is False


def test_admitted_fails_closed_without_second_pass():
    # 40–59 without a successful second pass stays closed (#294).
    assert bench.admitted(run(45)) is False
    assert bench.admitted(run(45, {"verdict": None})) is False


# ─── metrics ───


def test_confusion_counts_and_rates():
    pairs = [
        (True, True),
        (True, False),
        (False, True),
        (False, False),
    ]
    result = bench.confusion(pairs)
    assert (result["tp"], result["fn"], result["fp"], result["tn"]) == (1, 1, 1, 1)
    assert result["fpr"] == 0.5
    assert result["fnr"] == 0.5
    assert result["accuracy"] == 0.5


def test_wilson_and_rule_of_three():
    low, high = bench.wilson(0, 10)
    assert low == 0.0
    assert high == pytest.approx(0.2775, abs=0.002)
    assert bench.rule_of_three(10) == 0.3


def test_tolerance_table_reports_what_each_target_allows():
    rows = {row["tolerance"]: row for row in bench.tolerance_table(7, 6)}
    # 10% of 6 unusable cases allows 0 errors: that is the current resolution.
    assert rows[0.10]["unusableErrorsAllowed"] == 0
    assert rows[0.20]["unusableErrorsAllowed"] == 1
    # 10% of 7 usable cases allows 0 too.
    assert rows[0.10]["usableErrorsAllowed"] == 0
    # Sample sizes the doc must quote before anyone signs a tolerance.
    assert rows[0.10]["nForZeroEventBound"] == 30
    assert rows[0.05]["nToSeparateFromDouble"] > rows[0.20]["nToSeparateFromDouble"]


def test_report_separates_current_n_boundary_from_required_n():
    """A reader must not confuse "what n=6 can say" with "what a target needs"."""
    metrics = {
        "meta": {"engine": "e", "temperature": 0.0, "threshold": 60, "repeats": 1, "restarts": 0},
        "generatedAt": "2026-11-13T00:00:00Z",
        "gtCounts": {"usable": 5, "unusable": 6, "unsure": 2, "missing": 0},
        "arms": {},
        "pooled": {},
        "stability": {},
        "tolerance": bench.tolerance_table(5, 6),
    }
    report = bench.render_report(metrics, using_design=False)
    assert "### A. 当前 n 下的结论边界" in report
    assert "### B. 各目标所需样本量" in report
    assert "不能断言「已满足 10% 容忍度」" in report


# ─── labels: the GT boundary ───


def test_labels_exclude_unsure_and_mark_source(tmp_path):
    manifest = {"cases": [{"id": "A1"}, {"id": "A2"}]}
    labels_path = tmp_path / "labels.json"
    labels_path.write_text(
        json.dumps(
            {
                "claims": {
                    "A1": {"verdict": "usable"},
                    "A2": {"verdict": "unsure"},
                }
            }
        ),
        encoding="utf-8",
    )
    payload, using_design = bench.load_labels(str(labels_path), manifest)
    by_id = {item["caseId"]: item for item in payload["labels"]}
    assert by_id["A1"] == {"caseId": "A1", "label": "usable", "source": "human"}
    assert by_id["A2"]["label"] is None
    assert using_design is False


def test_design_labels_are_flagged_as_not_gt():
    manifest = {"cases": [{"id": "A1", "design": {"label": "usable"}}]}
    payload, using_design = bench.load_labels(None, manifest)
    assert using_design is True
    assert payload["labels"][0]["source"] == "design"


def test_queue_never_carries_model_scores(tmp_path):
    """The annotation surface must not be seeded with the model under test."""
    html = bench.render_queue_html(
        {
            "A": {
                "file": "a.jpg",
                "frame": {"width": 10, "height": 16},
                "status": "ok",
                "candidate": {"position": {"x": 0.5}, "window": [0, 0, 1, 1]},
                "faces": [],
                "previews": {"full": "previews/A-full.jpg", "crop": "previews/A-crop.jpg"},
            }
        },
        [
            {
                "caseId": "A1",
                "asset": "A",
                "claim": {"voiceover": "旁白", "assetNeed": "画面"},
                "design": {"label": "usable", "bucket": "direct", "note": ""},
                "autoLabel": None,
            }
        ],
    )
    assert 'data-v="usable"' in html
    assert 'data-v="unusable"' in html
    # No analyzer field may leak into the annotation surface: the label the
    # human accepts must not be seeded by the model being measured.
    assert '"relevance"' not in html
    assert "relevanceScore" not in html
    assert "relevanceReason" not in html
