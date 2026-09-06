#!/usr/bin/env python3
"""
Tests for crop-focus hint threading through the VLM inference seam (#198 Item 3).

simulate_crop used to hard-code focus=(0.5, 0.5) — the VLM judged fit and
criticalEdgeText on a center crop while Phase 3b's crop decision could pick a
saliency-anchored crop, so the two stages disagreed about the final framing.
The focus hint now flows: request JSON → handle_analyze_semantics →
run_vlm_inference → simulate_crop.

Tests:
1. simulate_crop with focus 0.0 / 1.0 crops from the left / right edge
2. simulate_crop default (None) keeps center behavior
3. Out-of-range focus values are clamped
4. _parse_crop_focus normalizes request dicts {x, y} → tuple, rejects junk

Run: python3 scripts/short-video/__tests__/test_simulate_crop_focus.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import simulate_crop, _parse_crop_focus
from PIL import Image


def make_wide_image(path, w=1600, h=900):
    # Horizontal gradient: pixel column ≈ x position, so crop placement can
    # be asserted from pixel colors. Build 1px-high then stretch (exact, fast).
    row = Image.new("RGB", (w, 1))
    for x in range(w):
        row.putpixel((x, 0), (int(x * 255 / w), 0, 0))
    img = row.resize((w, h), Image.NEAREST)
    img.save(path, "JPEG")
    return path


def crop_left_edge_px(cropped_path):
    img = Image.open(cropped_path)
    return img.getpixel((2, 4))[0]


def run_tests():
    results = []
    tmpdir = tempfile.mkdtemp()

    # Test 1: focus 0.0 crops from the left edge
    def test_focus_left():
        src = make_wide_image(os.path.join(tmpdir, "left.jpg"))
        cropped, cleanup = simulate_crop(src, target_ratio=9 / 16, focus=(0.0, 0.5))
        assert cleanup is not None, "expected a temp crop for a wide image"
        # left-most source columns → near-black red channel
        assert crop_left_edge_px(cropped) < 40, "focus 0.0 should crop from the left edge"
        os.unlink(cropped)
        return "PASS: focus (0.0, 0.5) crops from the left edge"

    # Test 2: focus 1.0 crops from the right edge
    def test_focus_right():
        src = make_wide_image(os.path.join(tmpdir, "right.jpg"))
        cropped, cleanup = simulate_crop(src, target_ratio=9 / 16, focus=(1.0, 0.5))
        assert cleanup is not None
        # right-most source columns → near-white red channel
        assert crop_left_edge_px(cropped) > 150, "focus 1.0 should crop from the right edge"
        os.unlink(cropped)
        return "PASS: focus (1.0, 0.5) crops from the right edge"

    # Test 3: no hint keeps the historical center crop
    def test_focus_default_center():
        src = make_wide_image(os.path.join(tmpdir, "center.jpg"))
        cropped_default, _ = simulate_crop(src, target_ratio=9 / 16)
        cropped_center, _ = simulate_crop(src, target_ratio=9 / 16, focus=(0.5, 0.5))
        assert crop_left_edge_px(cropped_default) == crop_left_edge_px(cropped_center)
        os.unlink(cropped_default)
        os.unlink(cropped_center)
        return "PASS: default focus stays center-cropped"

    # Test 4: out-of-range focus clamps instead of cropping out of bounds
    def test_focus_clamped():
        src = make_wide_image(os.path.join(tmpdir, "clamp.jpg"))
        cropped, cleanup = simulate_crop(src, target_ratio=9 / 16, focus=(7.0, -3.0))
        assert cleanup is not None
        assert crop_left_edge_px(cropped) > 150, "out-of-range focus should clamp to the right edge"
        os.unlink(cropped)
        return "PASS: out-of-range focus clamps into [0, 1]"

    # Test 5: _parse_crop_focus normalization
    def test_parse_crop_focus():
        assert _parse_crop_focus(None) is None
        assert _parse_crop_focus({"x": 0.25, "y": 0.75}) == (0.25, 0.75)
        assert _parse_crop_focus({"x": 5, "y": 0.1}) == (1.0, 0.1)  # clamped
        assert _parse_crop_focus({"x": "junk"}) is None  # malformed → center
        assert _parse_crop_focus([0.3, 0.4]) is None  # wrong shape → center
        assert _parse_crop_focus("0.5") is None
        return "PASS: _parse_crop_focus normalizes and rejects junk"

    for test in [
        test_focus_left,
        test_focus_right,
        test_focus_default_center,
        test_focus_clamped,
        test_parse_crop_focus,
    ]:
        try:
            results.append(test())
        except AssertionError as e:
            print(f"FAIL: {e}", file=sys.stderr)
            sys.exit(1)

    for line in results:
        print(line)


if __name__ == "__main__":
    run_tests()
