# 03 — Asset Sourcer: Integrate Progressive Search into main()

**What to build:** Modify `asset-sourcer.mjs` `main()` to insert Tier 3 progressive search between CDP sources (Tier 2) and AI Analysis. After CDP sources complete, evaluate whether Tier 3 is needed (`shouldTriggerTier3`). If yes, run Brave + SearXNG image search (reusing `searchApiSource` from existing infrastructure), download results, and add to `allAssets`. The existing `API_SOURCES` array already includes the new sources (from T2), so the main integration is the conditional trigger + progressive search orchestration.

**Blocked by:** 01 (progressive-search.mjs), 02 (source-registry additions)

**Status:** ready-for-agent

- [x] After CDP sources and `persistSearchResultsCache`, insert: calculate `scenesNeedingMedia`, call `shouldTriggerTier3`
- [x] If triggered: run Brave + SearXNG search via progressive-search.mjs functions, download results via `downloadAsset`, add to `allAssets`
- [x] Log Tier 3 status: "Tier 3 triggered: X assets needed, Y found"
- [x] Skip Tier 3 when not triggered: log "Tier 3 skipped: sufficient assets"
- [x] BraveQuotaTracker instantiated at start of Tier 3, tracks Brave API calls
- [x] search-cache integration: use `getOrSearchResults` for Brave/SearXNG searches (consistent with other API sources)
- [x] Scenario #2 covered (insufficient assets → Tier 3 triggers)
- [x] Scenario #12 covered (multiple keywords → each searched independently)
- [x] Scenario #13 covered (download failure → recorded in failed[])
- [x] All existing asset-sourcer tests still pass
