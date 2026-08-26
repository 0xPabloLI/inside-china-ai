# 02 — VLM Crop Simulation + EXIF Fix

**What to build:** Add `simulate_crop()` function to `vlm_analyzer.py` that crops a landscape image to 9:16 from a given focus point (simulating `object-fit: cover`). Extend `handle_analyze_semantics` to send the cropped image to the VLM (instead of the original) when the image is landscape. Fix `resize_image_if_needed` to apply `ImageOps.exif_transpose` before dimension check (EXIF normalization bug fix). All temp files cleaned up in `finally` blocks.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `simulate_crop(img_path, target_ratio=9/16, focus=(0.5, 0.5))` implemented: applies `exif_transpose + convert("RGB")`, crops to target ratio from focus point, saves as temp JPEG, returns `(cropped_path, cleanup_path)`.
- [x] `resize_image_if_needed` fixed: calls `ImageOps.exif_transpose(source)` before checking dimensions. This ensures VLM and focus detector use the same orientation.
- [x] `handle_analyze_semantics` extended: calls `simulate_crop` first (center crop), then `resize_image_if_needed` on the cropped image. Both temp files cleaned in nested `finally` blocks.
- [x] No new VLM action — crop simulation is integrated into existing `analyze_semantics` handler. VLM prompt unchanged (already asks about fit and critical edge text).
- [x] `visual-analyzer.test.mjs` verified: 36 tests passing, no regression (IPC contract unchanged — JS sends same `analyze_semantics` action + path, crop happens in Python).
- [x] All tests pass: `npx vitest run scripts/short-video/__tests__/visual-analyzer.test.mjs` (36 passed)
