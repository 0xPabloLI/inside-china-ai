# 03 — validateMedia fit/focus validation + scene-rules landscape warning

**What to build:** `validateMedia()` in `media-bg.mjs` validates `fit`/`focus` field values and warns on invalid ones. `verify-video.mjs --pre` detects landscape assets (via ffprobe) missing the `fit` field and emits a warning suggesting VLM analysis.

**Blocked by:** 02 (needs `fit`/`focus` fields in `MediaField` type).

**Status:** ready-for-agent

- [ ] `media-bg.mjs`: `VALID_FITS = ["cover", "contain"]` and `VALID_FOCUSES = ["top", "center", "bottom"]` constants
- [ ] `media-bg.mjs`: `validateMedia()` warns on `fit` not in `VALID_FITS`
- [ ] `media-bg.mjs`: `validateMedia()` warns on `focus` not in `VALID_FOCUSES`
- [ ] `scene-rules.mjs` or `verify-video.mjs`: landscape asset (aspect > 1.2) without `fit` → warning
- [ ] Tests: valid fit/focus passes, invalid warns, missing passes
- [ ] Tests: landscape-without-fit warning fires
