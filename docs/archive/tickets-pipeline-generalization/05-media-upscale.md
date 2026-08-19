# 05 — Media upscale pre-processing + default Remotion renderer

**What to build:** Low-resolution media files are automatically upscaled to ≥720p before rendering. Default renderer changed from Playwright to Remotion.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] New Step 1.5b in `main.mjs`: after scene-data load, before TTS, call `autoUpscaleIfNeeded()` on each `scene.media.path`
- [x] If upscaled, replace `scene.media.path` with upscaled path
- [x] Only processes confirmed media files (Cascade: selected first, then enhanced)
- [x] `main.mjs` line 94: default renderer changed to Remotion (Playwright via `--playwright` opt-out)
- [x] Works for both Playwright and Remotion paths
- [x] Tests: 640×360 file → upscaled to 720p
- [x] Tests: already-720p file → no upscale
- [x] Tests: no media in scene → skip
- [x] Tests: default renderer is Remotion when no flag/meta set
- [x] Scenario matrix rows 9, 13, 14, 18 covered
