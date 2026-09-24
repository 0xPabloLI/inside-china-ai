#!/usr/bin/env python3
"""
Tests for run_vlm_inference() — the inference seam extracted from
handle_analyze_semantics() (issue #127).

run_vlm_inference(model, processor, path, is_video, prompt_text, ...) runs one
VLM pass with media-type preprocessing (native video / windowed frame
extraction / image crop+resize) and guarantees temp-file cleanup.

Cleanup verification uses recorded os.unlink calls (monkeypatched) instead of
real temp files — the contract under test is "unlink called once on the exact
temp path returned by the preprocessor", not filesystem behavior.

Run with: python3 -m pytest __tests__/test_cascade_inference.py -v

TDD: Tests written first (red), implementation second (green).
"""

import sys
import os

_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_LIB_DIR = os.path.dirname(_TESTS_DIR)
sys.path.insert(0, os.path.join(_LIB_DIR, "lib"))

import pytest

import vlm_analyzer
from vlm_analyzer import run_vlm_inference


@pytest.fixture(autouse=True)
def _reset_calls():
    CALLS.reset()
    yield
    CALLS.reset()


# ─── Fakes ───

FRAME_PATHS = ["frame0.jpg", "frame1.jpg"]
FAKE_RESIZE_TMP = "vlm-fake-resized.tmp.jpg"
FAKE_CROP_TMP = "vlm-fake-crop.tmp.jpg"


class FakeCalls:
    """Records calls to the patched module functions."""

    def __init__(self):
        self.generate = []
        self.cleaned_frames = []
        self.unlinked = []

    def reset(self):
        self.__init__()


CALLS = FakeCalls()


def fake_extract_frames(path, fps=1.0, max_seconds=8, start_ms=None, end_ms=None):
    return list(FRAME_PATHS)


def fake_extract_frames_empty(path, fps=1.0, max_seconds=8, start_ms=None, end_ms=None):
    return []


def fake_generate(model, processor, image_paths=None, prompt_text=None,
                  video_path=None):
    CALLS.generate.append(
        (model, tuple(image_paths) if isinstance(image_paths, list) else image_paths, video_path)
    )
    return "## Description\nfake raw markdown"


def fake_cleanup_frames(frame_paths):
    CALLS.cleaned_frames.extend(frame_paths)


def fake_simulate_crop(img_path, target_ratio=9 / 16, focus=(0.5, 0.5)):
    return (img_path, None)


def fake_resize_image_if_needed(img_path):
    return (img_path, None)


def recording_unlink(path, *args, **kwargs):
    """Stand-in for os.unlink: record the path, do not touch the filesystem."""
    CALLS.unlinked.append(str(path))


def patch_module(monkeypatch, extract=None, resize=None):
    monkeypatch.setattr(vlm_analyzer, "generate_response", fake_generate)
    monkeypatch.setattr(vlm_analyzer, "_cleanup_frames", fake_cleanup_frames)
    monkeypatch.setattr(vlm_analyzer, "extract_frames", extract or fake_extract_frames)
    monkeypatch.setattr(vlm_analyzer, "simulate_crop", fake_simulate_crop)
    monkeypatch.setattr(
        vlm_analyzer, "resize_image_if_needed", resize or fake_resize_image_if_needed
    )
    # Redirect the module's unlink so cleanup assertions never touch disk.
    monkeypatch.setattr(vlm_analyzer.os, "unlink", recording_unlink)


# ─── run_vlm_inference: image path ───


def test_image_path_returns_raw_and_skips_frame_cleanup(monkeypatch, tmp_path):
    patch_module(monkeypatch)
    img = tmp_path / "photo.jpg"
    img.write_text("pixels")
    raw = run_vlm_inference("m2b", "p", str(img), is_video=False, prompt_text="PROMPT")
    assert raw == "## Description\nfake raw markdown"
    # Exactly one generation, against the image path (after preprocessing)
    assert len(CALLS.generate) == 1
    model, image_paths, _ = CALLS.generate[0]
    assert model == "m2b"
    assert image_paths == str(img)
    # Image path never touches frame cleanup
    assert CALLS.cleaned_frames == []


def test_image_path_cleans_resize_temp_file(monkeypatch, tmp_path):
    """When resize returns (path, tmp), the tmp file must be unlinked."""

    def fake_resize_with_temp(img_path):
        return (FAKE_RESIZE_TMP, FAKE_RESIZE_TMP)

    patch_module(monkeypatch, resize=fake_resize_with_temp)
    img = tmp_path / "photo.jpg"
    img.write_text("pixels")
    run_vlm_inference("m2b", "p", str(img), is_video=False, prompt_text="P")
    assert CALLS.unlinked == [FAKE_RESIZE_TMP]


def test_image_path_cleans_crop_temp_file(monkeypatch, tmp_path):
    """When crop returns (path, cleanup), the cleanup path must be unlinked."""

    def fake_crop_with_temp(img_path, target_ratio=9 / 16, focus=(0.5, 0.5)):
        return (FAKE_CROP_TMP, FAKE_CROP_TMP)

    patch_module(monkeypatch)
    monkeypatch.setattr(vlm_analyzer, "simulate_crop", fake_crop_with_temp)
    img = tmp_path / "photo.jpg"
    img.write_text("pixels")
    run_vlm_inference("m2b", "p", str(img), is_video=False, prompt_text="P")
    assert CALLS.unlinked == [FAKE_CROP_TMP]


# ─── run_vlm_inference: video path ───


def test_video_path_extracts_frames_and_cleans_them(monkeypatch, tmp_path):
    """With a time window, video goes through frame extraction."""
    patch_module(monkeypatch)
    vid = tmp_path / "clip.mp4"
    vid.write_text("bytes")
    raw = run_vlm_inference(
        "m2b", "p", str(vid), is_video=True, prompt_text="P",
        start_ms=0, end_ms=4000, sample_fps=1.0,
    )
    assert raw == "## Description\nfake raw markdown"
    assert len(CALLS.generate) == 1
    _, image_paths, video_path = CALLS.generate[0]
    assert image_paths == ("frame0.jpg", "frame1.jpg")
    assert video_path is None
    assert sorted(CALLS.cleaned_frames) == ["frame0.jpg", "frame1.jpg"]


def test_video_path_empty_frames_raises(monkeypatch, tmp_path):
    """Windowed extraction that returns no frames raises."""
    patch_module(monkeypatch, extract=fake_extract_frames_empty)
    vid = tmp_path / "clip.mp4"
    vid.write_text("bytes")
    with pytest.raises(RuntimeError, match="Frame extraction failed"):
        run_vlm_inference("m2b", "p", str(vid), is_video=True, prompt_text="P",
                          start_ms=0, end_ms=4000)


def test_video_path_native_when_no_window(monkeypatch, tmp_path):
    """Without start_ms/end_ms, video goes through native video path."""
    patch_module(monkeypatch)
    vid = tmp_path / "clip.mp4"
    vid.write_text("bytes")
    raw = run_vlm_inference("m2b", "p", str(vid), is_video=True, prompt_text="P")
    assert raw == "## Description\nfake raw markdown"
    assert len(CALLS.generate) == 1
    _, image_paths, video_path = CALLS.generate[0]
    assert image_paths is None
    assert video_path == str(vid)
    # Native path never touches frame extraction/cleanup
    assert CALLS.cleaned_frames == []
