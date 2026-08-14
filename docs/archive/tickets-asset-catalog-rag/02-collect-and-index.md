# 02 — catalog.yml + collectAssetCatalog() + index.mjs integration

**What to build:** The `assets/catalog.yml` file with 2 existing entries (unitree-demo.mp4 + unitree-building.jpg), plus a `collectAssetCatalog()` function in `scripts/rag/index.mjs` that reads the YAML file, parses it with `js-yaml`, calls `chunkCatalog()`, and returns chunk objects ready for embedding. The function is called in `main()` alongside existing collectors and its output is added to `allChunks`.

**Blocked by:** 01 — chunkCatalog() (uses this function)

**Status:** ready-for-agent

- [ ] `scripts/short-video/assets/catalog.yml` exists with 2 entries (unitree-demo.mp4, unitree-building.jpg)
- [ ] `collectAssetCatalog()` function in `index.mjs` reads catalog.yml via `js-yaml` and returns chunk objects
- [ ] Graceful degradation: missing file → returns [], YAML parse error → console.warn + returns []
- [ ] `main()` calls `collectAssetCatalog()` and adds result to `allChunks`
- [ ] Each chunk has `content_type: "asset-catalog"`, `source_id` = file path, correct metadata
- [ ] Orphan cleanup works: deleted catalog entries are removed on next rebuild
