# 04 — asset-sourcer integration + patch output

**What to build:** `analyzeAssets()` in `asset-sourcer.mjs` calls `analyzeFit()` for landscape assets after `describeImage/describeVideo`. Results stored in `asset.aiFit`/`asset.aiFocus`. `closeAnalyzer()` moved from `analyzeAssets` finally to main function finally (keeps VLM alive across phases). `assignAssetsToScenes()` patch `media` object includes `fit`/`focus` when present. `apply-media-patch.mjs` outputs fit/focus lines.

**Blocked by:** 01 (needs `analyzeFit()` API), 02 (needs `fit`/`focus` in MediaField).

**Status:** ready-for-agent

- [ ] `asset-sourcer.mjs` `analyzeAssets()`: after describe, check aspect ratio via `checkResolution()`. If landscape, call `analyzeFit()`. Store in `asset.aiFit`/`asset.aiFocus`.
- [ ] `asset-sourcer.mjs`: move `closeAnalyzer()` from `analyzeAssets` finally to main function finally.
- [ ] `asset-sourcer.mjs` `assignAssetsToScenes()`: patch `media` includes `fit`/`focus` when `aiFit`/`aiFocus` present.
- [ ] `apply-media-patch.mjs`: output `fit` and `focus` lines when fields exist in patch.
- [ ] Tests: `analyzeAssets()` with mock VLM — landscape asset gets `aiFit`/`aiFocus`, portrait does not.
- [ ] Tests: `assignAssetsToScenes()` patch includes fit/focus when present, omits when absent.
- [ ] Tests: `apply-media-patch.mjs` output includes fit/focus lines when present.
- [ ] Tests: VLM unavailable — `aiFit`/`aiFocus` not set, patch omits fields, no crash.
