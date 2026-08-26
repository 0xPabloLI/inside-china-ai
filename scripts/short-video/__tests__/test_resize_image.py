#!/usr/bin/env python3
"""
Test suite for resize_image_if_needed() — covers Issue #113 acceptance criteria.

Tests:
1. Small image (≤1920px) → no resize, returns original path, temp=None
2. Large image (>1920px) → resized, temp file created, temp ≠ original
3. Non-image file → graceful fallback, returns original path, temp=None
4. Resized image preserves aspect ratio
5. Temp file is valid JPEG

Run: python3 scripts/short-video/__tests__/test_resize_image.py
"""
import sys
import os
import tempfile

# Add the lib directory to path so we can import vlm_analyzer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import resize_image_if_needed, MAX_IMAGE_LONG_EDGE
from PIL import Image


def run_tests():
    results = []

    # Test 1: Small image — no resize needed
    def test_small_image():
        tmpdir = tempfile.mkdtemp()
        img_path = os.path.join(tmpdir, "small.jpg")
        img = Image.new("RGB", (1080, 1920), color="blue")
        img.save(img_path, "JPEG")

        actual_path, temp_path = resize_image_if_needed(img_path)
        assert actual_path == img_path, f"Expected original path, got {actual_path}"
        assert temp_path is None, f"Expected None temp, got {temp_path}"
        return "PASS: small image (1080×1920) — no resize"

    # Test 2: Large image — should resize
    def test_large_image():
        tmpdir = tempfile.mkdtemp()
        img_path = os.path.join(tmpdir, "large.jpg")
        img = Image.new("RGB", (3468, 4624), color="red")
        img.save(img_path, "JPEG")

        actual_path, temp_path = resize_image_if_needed(img_path)
        assert actual_path != img_path, "Expected resized path, got original"
        assert temp_path is not None, "Expected temp path, got None"
        assert os.path.exists(temp_path), f"Temp file does not exist: {temp_path}"

        # Verify dimensions
        resized = Image.open(temp_path)
        w, h = resized.size
        assert max(w, h) <= MAX_IMAGE_LONG_EDGE, f"Longest edge {max(w,h)} > {MAX_IMAGE_LONG_EDGE}"

        # Cleanup
        os.unlink(temp_path)
        return f"PASS: large image (3468×4624) → resized to {w}×{h}"

    # Test 3: Non-image file — graceful fallback
    def test_non_image():
        tmpdir = tempfile.mkdtemp()
        txt_path = os.path.join(tmpdir, "not_image.txt")
        with open(txt_path, "w") as f:
            f.write("hello")

        actual_path, temp_path = resize_image_if_needed(txt_path)
        assert actual_path == txt_path, f"Expected original path on error, got {actual_path}"
        assert temp_path is None, f"Expected None on error, got {temp_path}"
        return "PASS: non-image file — graceful fallback to original"

    # Test 4: Aspect ratio preserved
    def test_aspect_ratio():
        tmpdir = tempfile.mkdtemp()
        img_path = os.path.join(tmpdir, "wide.jpg")
        # 4000×2000 → should become 1920×960
        img = Image.new("RGB", (4000, 2000), color="green")
        img.save(img_path, "JPEG")

        actual_path, temp_path = resize_image_if_needed(img_path)
        assert temp_path is not None

        resized = Image.open(temp_path)
        w, h = resized.size
        # Aspect ratio should be 2:1
        ratio = w / h
        assert abs(ratio - 2.0) < 0.01, f"Aspect ratio broken: {w}×{h} = {ratio:.2f}, expected 2.0"

        os.unlink(temp_path)
        return f"PASS: aspect ratio preserved (4000×2000 → {w}×{h}, ratio={ratio:.2f})"

    # Test 5: Temp file is valid JPEG
    def test_temp_is_jpeg():
        tmpdir = tempfile.mkdtemp()
        img_path = os.path.join(tmpdir, "big.jpg")
        img = Image.new("RGB", (3000, 3000), color="yellow")
        img.save(img_path, "JPEG")

        actual_path, temp_path = resize_image_if_needed(img_path)
        assert temp_path is not None

        # Verify it's a valid JPEG
        verify_img = Image.open(temp_path)
        verify_img.verify()  # Raises if invalid
        assert temp_path.endswith(".jpg"), f"Expected .jpg suffix, got {temp_path}"

        os.unlink(temp_path)
        return "PASS: temp file is valid JPEG"

    tests = [
        ("small_image", test_small_image),
        ("large_image", test_large_image),
        ("non_image", test_non_image),
        ("aspect_ratio", test_aspect_ratio),
        ("temp_is_jpeg", test_temp_is_jpeg),
    ]

    for name, test_fn in tests:
        try:
            msg = test_fn()
            print(f"  ✓ {msg}")
            results.append((name, True, msg))
        except Exception as e:
            print(f"  ✗ FAIL: {name} — {e}")
            results.append((name, False, str(e)))

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{'='*50}")
    print(f"Results: {passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(run_tests())
