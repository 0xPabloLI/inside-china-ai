# 01 — Fix absolute path conflict in media-patch.json (P0)

**What to build:** Stop mutating `asset.path` to absolute before VLM/Focus analysis. Add `contentDir` option to `analyzeAssets()` so it resolves relative paths locally. Add defensive `relative()` normalization before writing `media-patch.json`. Add path-escape guard. Add end-to-end test: relative path → analyzeAssets → assignAssetsToScenes → patch with relative `media.path`.

**Blocked by:** None — can start immediately.

**Spec:** `docs/specs/spec-vlm-semantic-merge-remediation.md` (Decision 1)

**Status:** ready-for-agent

- [ ] Remove the path mutation loop in `main()` (lines ~1952-1955) that sets `asset.path = join(contentDir, asset.path)`
- [ ] Add `contentDir` option to `analyzeAssets(opts)` — when provided, use `join(contentDir, asset.path)` as local `absolutePath` for VLM/Focus calls; `asset.path` stays relative
- [ ] In `main()`: pass `contentDir` to `analyzeAssets` instead of mutating paths
- [ ] Before writing `media-patch.json`: normalize any absolute `media.path` back to relative via `relative(contentDir, path)`; throw if result starts with `..`
- [ ] Add test: asset with `path: "assets/img.jpg"` → `analyzeAssets({ contentDir })` → `asset.path` still `"assets/img.jpg"` after analysis
- [ ] Add test: `assignAssetsToScenes` with relative-path assets → `media.path` is relative in all assigned patches
- [ ] Add test: asset with absolute path that escapes contentDir → throws on normalization
- [ ] All existing tests still pass
