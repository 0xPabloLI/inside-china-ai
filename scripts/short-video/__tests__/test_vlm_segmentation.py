#!/usr/bin/env python3
"""
Test suite for #360 ticket-1 — multi-window (segmented) VLM analysis.

Covers:
- normalize_windows(): request-side window-list parsing (pure)
- merge_window_results(): per-window parsed semantics -> one 8-field dict
  (S3 contract)
- handle_analyze_semantics(windows=...): loop + merge wiring, with
  run_vlm_inference monkeypatched (no model / venv needed)

Run: python3 -m pytest scripts/short-video/__tests__/test_vlm_segmentation.py -v
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import (  # noqa: E402
    handle_analyze_semantics,
    merge_window_results,
    normalize_windows,
)


def make_parsed(description="desc", subjects=None, content_kind=None, fit=None,
                critical_edge=None, reason=None, relevance=None,
                relevance_reason=None):
    """Build one parse_markdown_to_dict-shaped result for merge tests."""
    return {
        "description": description,
        "subjects": subjects if subjects is not None else [],
        "contentKind": content_kind,
        "fit": fit,
        "criticalEdgeText": critical_edge,
        "reason": reason,
        "relevance": relevance,
        "relevanceReason": relevance_reason,
    }


# ─── normalize_windows ───

class TestNormalizeWindows:
    def test_passes_valid_windows_through(self):
        windows = [
            {"startMs": 0, "endMs": 14000, "sampleFps": 1.0},
            {"startMs": 14000, "endMs": 28000, "sampleFps": 0.5},
        ]
        assert normalize_windows(windows) == windows

    def test_defaults_sample_fps(self):
        assert normalize_windows([{"startMs": 500, "endMs": 9000}]) == [
            {"startMs": 500, "endMs": 9000, "sampleFps": 1.0},
        ]

    def test_drops_malformed_entries(self):
        windows = [
            None,
            "not a dict",
            {"startMs": 0},                      # missing endMs
            {"endMs": 8000},                     # missing startMs
            {"startMs": "0", "endMs": 8000},     # non-numeric startMs
            {"startMs": 0, "endMs": 8000},       # valid
        ]
        assert normalize_windows(windows) == [
            {"startMs": 0, "endMs": 8000, "sampleFps": 1.0},
        ]

    def test_none_or_empty_returns_none(self):
        assert normalize_windows(None) is None
        assert normalize_windows([]) is None
        assert normalize_windows([None, {"startMs": 0}]) is None


# ─── merge_window_results (S3: 8-field contract) ───

def win(count, span_ms=10000):
    """Build `count` equal windows for merge tests."""
    return [
        {"startMs": i * span_ms, "endMs": (i + 1) * span_ms, "sampleFps": 1.0}
        for i in range(count)
    ]


class TestMergeWindowResults:
    def test_merged_result_has_all_eight_fields(self):
        parsed = [
            make_parsed(description="A robot walks.", subjects=["robot"],
                        content_kind="talking_head"),
            make_parsed(description="A chart appears.", subjects=["chart"],
                        content_kind="chart"),
        ]
        windows = [{"startMs": 0, "endMs": 20000, "sampleFps": 1.0},
                   {"startMs": 20000, "endMs": 40000, "sampleFps": 1.0}]
        merged = merge_window_results(parsed, windows)

        for key in ("description", "subjects", "contentKind", "fit",
                    "criticalEdgeText", "reason", "relevance",
                    "relevanceReason"):
            assert key in merged

    def test_description_concatenated_with_segment_markers(self):
        parsed = [
            make_parsed(description="A robot walks."),
            make_parsed(description="A chart appears."),
            make_parsed(description="Text on screen."),
        ]
        windows = [
            {"startMs": 0, "endMs": 10000, "sampleFps": 1.0},
            {"startMs": 10000, "endMs": 20000, "sampleFps": 1.0},
            {"startMs": 20000, "endMs": 30000, "sampleFps": 1.0},
        ]
        merged = merge_window_results(parsed, windows)
        assert "[Segment 1/3 — 0.0s-10.0s]" in merged["description"]
        assert "A robot walks." in merged["description"]
        assert "[Segment 3/3 — 20.0s-30.0s]" in merged["description"]
        assert "Text on screen." in merged["description"]
        # Order preserved: segment 1 before segment 3
        assert merged["description"].index("A robot walks.") < \
            merged["description"].index("Text on screen.")

    def test_subjects_union_first_seen_order(self):
        parsed = [
            make_parsed(subjects=["robot", "kitchen"]),
            make_parsed(subjects=["chart", "robot"]),
            make_parsed(subjects=[]),
        ]
        merged = merge_window_results(parsed, win(3))
        assert merged["subjects"] == ["robot", "kitchen", "chart"]

    def test_content_kind_majority_tie_first(self):
        parsed = [
            make_parsed(content_kind="talking_head"),
            make_parsed(content_kind="chart"),
            make_parsed(content_kind="talking_head"),
        ]
        merged = merge_window_results(parsed, win(3))
        assert merged["contentKind"] == "talking_head"

        tie = [
            make_parsed(content_kind="talking_head"),
            make_parsed(content_kind="chart"),
        ]
        merged = merge_window_results(tie, win(2))
        assert merged["contentKind"] == "talking_head"

    def test_first_non_null_for_reason_and_relevance(self):
        parsed = [
            make_parsed(reason=None, relevance=None),
            make_parsed(reason="later reason", relevance=70,
                        relevance_reason="why"),
        ]
        merged = merge_window_results(parsed, win(2))
        assert merged["reason"] == "later reason"
        assert merged["relevance"] == 70
        assert merged["relevanceReason"] == "why"

    def test_empty_parsed_list_yields_empty_contract(self):
        merged = merge_window_results([], [])
        assert merged["description"] == ""
        assert merged["subjects"] == []
        assert merged["contentKind"] is None


# ─── handle_analyze_semantics(windows=...) wiring ───

class TestHandleAnalyzeSemanticsWindows:
    def _write_fake_mp4(self, tmp_path):
        # Extension only — run_vlm_inference is mocked, no real video needed.
        path = tmp_path / "clip.mp4"
        path.write_bytes(b"fake")
        return str(path)

    def test_loops_per_window_and_merges(self, tmp_path, monkeypatch):
        import vlm_analyzer

        calls = []

        def fake_inference(model, processor, path, is_video, prompt_text,
                           **kwargs):
            calls.append(kwargs)
            if kwargs["start_ms"] == 0:
                return "## Description\nFirst part.\n\n## Subjects\nrobot\n\n## Content Kind\ntalking_head\n"
            return "## Description\nSecond part.\n\n## Subjects\nrobot, chart\n\n## Content Kind\nchart\n"

        monkeypatch.setattr(vlm_analyzer, "run_vlm_inference", fake_inference)
        model, processor = object(), object()
        result, err = handle_analyze_semantics(
            model, processor, self._write_fake_mp4(tmp_path),
            windows=[
                {"startMs": 0, "endMs": 10000, "sampleFps": 1.0},
                {"startMs": 10000, "endMs": 20000, "sampleFps": 1.0},
            ],
        )

        assert err is None
        assert len(calls) == 2
        assert calls[0]["start_ms"] == 0
        assert calls[1]["start_ms"] == 10000
        assert "First part." in result["description"]
        assert "Second part." in result["description"]
        assert result["subjects"] == ["robot", "chart"]
        assert result["contentKind"] == "talking_head"  # tie -> first
        assert result["sourceMode"] == "frames"

    def test_single_window_failure_fails_open(self, tmp_path, monkeypatch):
        import vlm_analyzer

        def fake_inference(model, processor, path, is_video, prompt_text,
                           **kwargs):
            if kwargs["start_ms"] == 0:
                raise RuntimeError("frame extraction failed")
            return "## Description\nSecond part only.\n\n## Subjects\nchart\n"

        monkeypatch.setattr(vlm_analyzer, "run_vlm_inference", fake_inference)
        result, err = handle_analyze_semantics(
            object(), object(), self._write_fake_mp4(tmp_path),
            windows=[
                {"startMs": 0, "endMs": 10000, "sampleFps": 1.0},
                {"startMs": 10000, "endMs": 20000, "sampleFps": 1.0},
            ],
        )

        assert err is None  # partial success is not a failure
        assert "Second part only." in result["description"]
        assert result["subjects"] == ["chart"]
        # The surviving window (10-20s) must keep its ORIGINAL segment index
        # (2 of 2), not be shifted to segment 1 by the failed window 0.
        assert "[Segment 2/2 — 10.0s-20.0s]" in result["description"]
        assert "[Segment 1/2" not in result["description"]

    def test_middle_window_failure_keeps_original_indices(self, tmp_path,
                                                          monkeypatch):
        """Windows 0 and 2 succeed, window 1 fails — window 2 must NOT be
        mislabeled as segment 2 (it is segment 3 of the full 3-window plan)."""
        import vlm_analyzer

        def fake_inference(model, processor, path, is_video, prompt_text,
                           **kwargs):
            if kwargs["start_ms"] == 10000:
                raise RuntimeError("middle window exploded")
            if kwargs["start_ms"] == 0:
                return "## Description\nFirst part.\n\n## Subjects\nrobot\n"
            return "## Description\nThird part.\n\n## Subjects\nchart\n"

        monkeypatch.setattr(vlm_analyzer, "run_vlm_inference", fake_inference)
        result, err = handle_analyze_semantics(
            object(), object(), self._write_fake_mp4(tmp_path),
            windows=[
                {"startMs": 0, "endMs": 10000, "sampleFps": 1.0},
                {"startMs": 10000, "endMs": 20000, "sampleFps": 1.0},
                {"startMs": 20000, "endMs": 30000, "sampleFps": 1.0},
            ],
        )

        assert err is None
        assert "First part." in result["description"]
        assert "Third part." in result["description"]
        # Full-plan denominator is 3, not 2 (the survivor count).
        assert "[Segment 1/3 — 0.0s-10.0s]" in result["description"]
        assert "[Segment 3/3 — 20.0s-30.0s]" in result["description"]
        # Window 2's content must NOT be mislabeled as segment 2.
        assert "[Segment 2/3" not in result["description"]
        # Order preserved: segment 1 before segment 3.
        assert result["description"].index("First part.") < \
            result["description"].index("Third part.")

    def test_all_windows_failing_returns_error(self, tmp_path, monkeypatch):
        import vlm_analyzer

        def fake_inference(*args, **kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(vlm_analyzer, "run_vlm_inference", fake_inference)
        result, err = handle_analyze_semantics(
            object(), object(), self._write_fake_mp4(tmp_path),
            windows=[
                {"startMs": 0, "endMs": 10000, "sampleFps": 1.0},
                {"startMs": 10000, "endMs": 20000, "sampleFps": 1.0},
            ],
        )

        assert result == {}
        assert err is not None and "boom" in err

    def test_windows_ignored_for_image_paths(self, tmp_path, monkeypatch):
        import vlm_analyzer

        from PIL import Image

        img = tmp_path / "still.jpg"
        Image.new("RGB", (8, 8)).save(img)

        calls = []

        def fake_inference(model, processor, path, is_video, prompt_text,
                           **kwargs):
            calls.append((is_video, kwargs))
            return "## Description\nAn image.\n\n## Subjects\nphoto\n"

        monkeypatch.setattr(vlm_analyzer, "run_vlm_inference", fake_inference)
        result, err = handle_analyze_semantics(
            object(), object(), str(img),
            windows=[{"startMs": 0, "endMs": 10000, "sampleFps": 1.0}],
        )

        assert err is None
        assert len(calls) == 1
        assert calls[0][0] is False  # image path — no window kwargs
        assert result["description"] == "An image."
