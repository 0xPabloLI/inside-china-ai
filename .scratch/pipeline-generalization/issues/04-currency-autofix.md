# 04 — RMB→USD auto-fix in normalizeSceneData()

**What to build:** Pipeline automatically converts RMB amounts in voiceover/texts to dual-annotation format `$X (¥Y)` before TTS runs, enforcing the currency rule by code.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] New `lib/normalize-currency.mjs` with `normalizeSceneData(scenes, meta)`
- [x] Scans `voiceover` and all `texts` string values for `¥\d+` or `\d+ (?:billion|million|thousand) yuan`
- [x] If `$` equivalent not already present nearby, inserts `$X (¥Y)` format using `CNY_TO_USD_RATE = 0.14`
- [x] Called in `main.mjs` Step 0 (after scene-data load, before TTS)
- [x] New `checkCurrencyDualAnnotation()` in `scene-rules.mjs` as verify-time warn
- [x] Tests: "445 billion yuan" → "$63 billion (445 billion yuan)"
- [x] Tests: already has "$63 billion (445 billion yuan)" → no modification
- [x] Tests: "¥1100 per share" → "$154 (¥1100) per share" (small amount rounding)
- [x] Tests: no RMB amounts → no-op
- [x] Scenario matrix rows 10, 11, 17 covered
