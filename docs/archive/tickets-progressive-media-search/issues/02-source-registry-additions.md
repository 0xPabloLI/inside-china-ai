# 02 — Source Registry: Add Brave + SearXNG Image Sources

**What to build:** Add `brave_image` and `searxng_image` source definitions to `source-registry.mjs`, so that `ALL_SOURCES` includes them and `API_SOURCES` (which filters `capabilities.images.method === "api"`) automatically picks them up. Add corresponding attribution entries to `SOURCE_ATTRIBUTIONS` marking them as copyright-unverified, attribution-required. This makes the new sources visible to asset-sourcer's existing API search + download + attribution pipeline without any changes to the consumption layer.

**Blocked by:** None — can start immediately (independent of T1, but T3 depends on both).

**Status:** ready-for-agent

- [x] `brave_image` source in STOCK_MEDIA_SOURCES with `capabilities.images`: `{ method: "api", requiresApiKey: true, apiKeyEnv: "BRAVE_SEARCH_API_KEY", authHeader: "X-Subscription-Token", searchUrl, parseResponse }`
- [x] `searxng_image` source in STOCK_MEDIA_SOURCES with `capabilities.images`: `{ method: "api", requiresApiKey: false, searchUrl, parseResponse }`
- [x] `SOURCE_ATTRIBUTIONS.brave_image`: `{ text: () => "Image source: Brave Search (copyright unverified)", license: "Copyright unverified — manual review required", logoRequired: false, attributionRequired: true }`
- [x] `SOURCE_ATTRIBUTIONS.searxng_image`: `{ text: () => "Image source: SearXNG (copyright unverified)", license: "Copyright unverified — manual review required", logoRequired: false, attributionRequired: true }`
- [x] Existing tests still pass (API_SOURCES now includes 2 new entries, no existing test breaks)
- [x] Scenario #10 covered (attribution appears in credits for Tier 3 assets)
- [x] Scenario #11 covered (search-cache works with new source names)
