# 01 — Add `checkTextOverflow` to frame-analysis.mjs

**What to build:** A new pure function `checkTextOverflow` in `frame-analysis.mjs` that scans each row of the content area for bright pixel spans exceeding the safe-zone content width, and returns a `warn`-level `AnalysisResult` if overflow is detected. Integrated into `runFrameAnalysis` so it runs automatically in every frame analysis.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `checkTextOverflow` function exists in `frame-analysis.mjs` with signature `(buf, safeZones) => AnalysisResult`
- [x] Function is pure (no IO, no side effects)
- [x] Uses existing `BRIGHT_THRESHOLD`, `SAMPLE_STEP`, `luminance()` — no new constants
- [x] Uses same exempt regions as other checks (BRAND_BAR_REGION, WATERMARK_REGION, frameGlowExemptRegions)
- [x] Returns `warn` level when any row's bright pixel span exceeds `width - safeZones.left - safeZones.right`
- [x] Returns `pass` level when all rows fit within content width
- [x] Returns `pass` when content area is empty (no bright pixels)
- [x] Detail string includes which row overflowed and by how many pixels
- [x] Added to `runFrameAnalysis` return array
- [x] Exported from module (added to exports)
- [x] Unit tests in `frame-analysis.test.mjs` cover scenarios #1-5, #17-18 from spec
