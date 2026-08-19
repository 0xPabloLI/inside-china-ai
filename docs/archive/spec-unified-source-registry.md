# Spec: Unified Source Registry — Capabilities, Cross-Stage Image Caching, and Cascade Order Fix

> **Spec ID**: spec-unified-source-registry
> **Created**: 2026-08-19
> **Status**: ready-for-agent
> **Related Issues**: #51 (cascade-filter audit — this spec addresses the architecture principle, not the specific violations)
> **ADRs**: ADR-0013 (asset sourcing three-layer — revised), ADR-0016 (cascade filtering — updated), ADR-0009 (VLM), ADR-0015 (focus detection)
> **Grill session**: 2 rounds, all decisions settled

## Problem Statement

The pipeline maintains two independent sets of source definitions that overlap for the same websites but never share code:

1. **`source-registry.mjs`** — 46 sources for trend discovery and deep research. Each source extracts article titles and URLs via CDP/MCP/API.
2. **`asset-sourcer.mjs`** — 21 sources (`API_SOURCES` + `YTDLP_SOURCES` + `CDP_SOURCES`) for image/video download. Each source has its own CDP scripts, API configs, and yt-dlp definitions.

Seven sources appear in both files under the same name but with different URLs, extraction scripts, and collection methods (ithome, jiqizhixin, bilibili, douyin, youtube, xiaohongshu, weibo). When a website changes its DOM structure, two files must be updated independently.

Additionally, trend discovery's CDP requests visit news sites and search pages but only extract article titles — ignoring the images that are already on those same pages. Asset sourcer then makes a second CDP request to the same sites' search pages to extract those same images. This violates ADR-0016 Rule 2 (signal density — one call should produce multiple signals).

Finally, the `analyzeAssets()` cascade has a layer-ordering violation: OpenCV focus detection (medium cost, ~0.5s/asset) runs before the pre-filter gate (free), processing assets that will be immediately skipped.

## Solution

### 1. Unify source definitions via `capabilities`

Merge all source definitions into `source-registry.mjs` as the single source of truth. Each source declares a `capabilities` object specifying what data types it can provide and how:

```js
{
  name: "ithome",
  capabilities: {
    articles: { url, extractScript, ... },  // trend discovery
    images: { url, primaryScript, fallbackScript, ... },  // asset sourcer
  },
}
```

`asset-sourcer.mjs` deletes `API_SOURCES`, `YTDLP_SOURCES`, `CDP_SOURCES` and imports from `source-registry.mjs`, querying by capability.

### 2. Extract image URLs during trend discovery

Enhance `extractScript` in `source-registry.mjs` to also extract `imageUrl` from the same DOM that produces article titles. One CDP request yields both article metadata and image URL — zero additional requests.

Store image URLs in `trending-topics.json` topics as an `images: [{url, sourceArticle}]` field.

### 3. Asset sourcer consumes cached image URLs

When `asset-sourcer.mjs` runs (Stage 4), it first checks `trending-topics.json` for cached image URLs whose source article title matches the asset search keyword. Matching images are downloaded directly (no new CDP request). Non-matching or insufficient images trigger the normal source search flow.

### 4. Fix cascade layer ordering in `analyzeAssets()`

Move the pre-filter gate (free) before focus detection (medium cost):

```
Before:  Phase 1: detectFocus (all assets) → Phase 2a: preFilter → Phase 2b: VLM
After:   Phase 1: preFilter (all assets) → Phase 2: detectFocus (survivors) → Phase 3: VLM
```

### 5. Add pre-download filter gate

Run `preFilterCandidate` before downloading, not just after. Assets with `technicalScore < 20` (lower than the post-download threshold of 30, since pre-download metadata is sparser) are not downloaded.

### 6. Delete Lorem Picsum source

Lorem Picsum returns random images unrelated to any keyword. It cannot pass the pre-download filter and produces only false accepts.

## User Stories

1. As a pipeline operator, I want all source definitions in one file, so that when a website changes its DOM I only update one extractScript instead of two.

2. As a pipeline operator, I want trend discovery to extract image URLs alongside article titles, so that the same CDP request produces both article and image signals (signal density principle).

3. As a pipeline operator, I want asset sourcer to check cached image URLs from trend discovery before making new CDP requests, so that I don't request the same website twice.

4. As a pipeline operator, I want the pre-filter gate to run before focus detection in `analyzeAssets()`, so that OpenCV doesn't waste 0.5s on assets that will be skipped anyway.

5. As a pipeline operator, I want a pre-download filter gate, so that obviously bad candidates (low technicalScore) are not downloaded at all.

6. As a developer, I want `asset-sourcer.mjs` to import source definitions from `source-registry.mjs`, so that `API_SOURCES`, `YTDLP_SOURCES`, and `CDP_SOURCES` are no longer maintained separately.

7. As a developer, I want Pexels, Unsplash, Pixabay, Coverr, and Wikimedia to be defined in `source-registry.mjs` with `category: "stock_api"`, so that trend discovery naturally skips them (no `capabilities.articles`) and asset sourcer naturally finds them (has `capabilities.images`).

8. As a developer, I want Lorem Picsum removed, since it returns random images unrelated to search keywords and cannot pass any quality filter.

9. As a developer, I want the `capabilities` field to use a consistent shape across all source types (articles, images, videos), so that consuming code can query sources by capability without type-specific branching.

10. As a developer, I want cached image URLs from trend discovery to be filtered by keyword match and URL pattern (excluding logos, avatars, icons) before download, so that only relevant, high-quality images enter the VLM cascade.

11. As a developer, I want VLM analysis to run only in Stage 4 (asset sourcer), not in trend discovery, so that expensive VLM calls are reserved for assets that survived the full cascade.

## Implementation Decisions

### 1. `capabilities` field shape

Each source in `source-registry.mjs` gets an optional `capabilities` object:

```js
capabilities: {
  articles?: {
    supportsKeyword: boolean,
    url: string | (keyword) => string,
    extractScript: string,      // CDP DOM extraction
    // ... existing fields (loginCheckScript, useCleanTitle, etc.)
  },
  images?: {
    supportsKeyword: boolean,
    url: string | (keyword) => string,
    primaryScript: string,     // CDP image extraction (primary)
    fallbackScript: string,    // CDP image extraction (fallback)
    // OR for API sources:
    method: "api",
    requiresApiKey: boolean,
    apiKeyEnv: string | null,
    searchUrl: (keyword, key) => string,
    parseResponse: (data, keyword) => Array,
    authHeader?: string,
    authValue?: (key) => string,
    userAgent?: string,
  },
  videos?: {
    method: "ytdlp" | "api",
    platform?: string,           // for ytdlp
    cookieRequired?: boolean,    // for ytdlp
    // OR for API sources (same shape as images.api)
    // OR for sources that share API config between images+videos (pexels)
  },
}
```

Sources without a capability (e.g., arXiv has no `images` or `videos`) simply omit that key.

### 2. Consumer query pattern

```js
// search-sources.mjs — unchanged behavior, queries articles
const articleSources = ALL_SOURCES.filter(s => s.capabilities?.articles);

// asset-sourcer.mjs — new behavior, queries images + videos
const imageSources = ALL_SOURCES.filter(s => s.capabilities?.images);
const videoSources = ALL_SOURCES.filter(s => s.capabilities?.videos);
```

### 3. `extractScript` enhancement

Trend discovery's `extractScript` adds `imageUrl` and `hasImage` fields:

```js
results.push({
  title: title.textContent.trim(),
  url: link.href,
  imageUrl: img ? img.src : null,   // NEW
  hasImage: !!img,                   // NEW
});
```

### 4. `trending-topics.json` schema change

Each topic in the `topics` object gets an optional `images` field:

```json
{
  "title": "DeepSeek releases V4",
  "sources": ["qbitai"],
  "urls": ["https://qbitai.com/1"],
  "keywords": ["deepseek"],
  "images": [
    { "url": "https://qbitai.com/img/v4.jpg", "sourceArticle": "https://qbitai.com/1" }
  ]
}
```

### 5. Asset sourcer cached-image flow

```js
// Phase 0: Check trending-topics.json for cached images
const cachedImages = loadCachedImages(trendingTopicsPath, keywords);
// Filter: title keyword match + URL pattern (exclude logo/avatar/icon)
const filtered = cachedImages.filter(img =>
  hasKeywordMatch(img.sourceTitle, keywords) &&
  !isLogoOrIcon(img.url)
);
// Download survivors, add to allAssets[]
```

### 6. Cascade order fix in `analyzeAssets()`

```
Phase 1: preFilterCandidate (free) → mark lowConfidence
Phase 2: detectFocus (~0.5s) → only for !lowConfidence assets
Phase 3: analyzeAssetSemantics (VLM, 20-120s) → only for !lowConfidence survivors
Phase 4: semantic re-scoring (free) → uses VLM output
```

### 7. Pre-download filter gate

Before downloading each candidate:
```js
const { technicalScore, lowConfidence } = preFilterCandidate(candidate, keyword);
if (lowConfidence && technicalScore < 20) {
  skipped.push({ source, reason: "pre-download filter" });
  continue;  // don't download
}
```

Threshold is 20 (lower than post-download 30) because pre-download metadata is sparser (no file size from API responses, resolution may be missing).

### 8. Lorem Picsum deletion

Remove the `lorem_picsum` entry from `API_SOURCES` (which becomes part of `source-registry.mjs`). Delete corresponding test cases. Remove attribution entry.

### 9. ADR updates

- **ADR-0013**: Revise the "separate set of sources" statement to reflect unified registry.
- **ADR-0016**: Add 4th point to "Already applied": cross-stage signal reuse (trend discovery extractScript extracts image URLs consumed by asset sourcer).

## Testing Decisions

### Test seams (4 existing + 1 new)

1. **`source-registry.test.mjs`** (existing, ~30 tests) — Add tests for `capabilities` field presence on unified sources. Verify that sources with `images` capability have required fields (`primaryScript` + `fallbackScript` for CDP, or `searchUrl` + `parseResponse` for API). Verify `stock_api` category sources have no `capabilities.articles`.

2. **`asset-sourcer.test.mjs`** (existing, ~100 tests) — Rewrite imports: replace `API_SOURCES`, `YTDLP_SOURCES`, `CDP_SOURCES` with queries to `source-registry.mjs`. Add tests for pre-download filter gate (technicalScore < 20 → skip). Add tests for cached-image flow (mock `trending-topics.json`, verify keyword matching + URL pattern filtering). Prior art: existing `preFilterCandidate` tests.

3. **`asset-sourcer-visual-integration.test.mjs`** (existing, ~8 tests) — Update `analyzeAssets` cascade order: verify pre-filter runs before detectFocus. Verify `lowConfidence` assets skip both detectFocus and VLM. Prior art: existing mock pattern for visual-analyzer.

4. **`trends-utils.test.mjs`** (existing, ~20 tests) — Add tests for `buildOutputJson` including `images` field in output. Verify `imageUrl` extraction from article objects. Prior art: existing `buildOutputJson` tests.

5. **`source-registry-capabilities.test.mjs`** (new) — Pure structural validation: every source has at least one capability; capabilities have required fields; no duplicate source names; `stock_api` sources have no `articles` capability.

### Testing principles

- Test external behavior, not implementation details. `capabilities` field shape is tested via queries, not by inspecting internal structure.
- Pre-download filter tests use the same `preFilterCandidate` function — no new test seam needed, just new call sites.
- Cached-image flow tests mock `readFileSync` for `trending-topics.json` — pure function, no CDP/IO.
- Cascade order test: mock `detectFocus` and verify it is NOT called for `lowConfidence` assets (spy assertion: `expect(mockDetectFocus).not.toHaveBeenCalled()`).

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `lib/source-registry.mjs` | Add `capabilities` to all 46 existing sources; add 7 new stock_api sources; add 7 new CDP image capabilities to news sources; delete Lorem Picsum | **High** | Core source definitions. 46 sources × structural change. Worst case: malformed capability → consumer query returns empty → source silently skipped. Mitigated by structural validation tests. |
| `lib/asset-sourcer.mjs` | Delete `API_SOURCES`, `YTDLP_SOURCES`, `CDP_SOURCES`, `SOURCE_ATTRIBUTIONS` (move to source-registry); import from source-registry; add cached-image flow; add pre-download filter; fix cascade order in `analyzeAssets()` | **High** | Core orchestrator. Import path change affects all downstream code. Worst case: import returns empty array → no assets found → empty report. Mitigated by existing 100+ tests rewritten with new imports. |
| `search-sources.mjs` | Change extractScript calls to include imageUrl extraction; update `buildOutputJson` consumer in trends-utils | **Medium** | CDP extraction changes. Worst case: extractScript syntax error → 0 results from that source → existing graceful degradation. Mitigated by trends-utils tests. |
| `lib/trends-utils.mjs` | `buildOutputJson` adds `images` field to topic output | **Low** | Additive change. Existing fields unchanged. |
| `__tests__/source-registry.test.mjs` | Add capability structure tests; update count assertions (46→53) | **Medium** | Count changes break existing tests. All assertions recalculated. |
| `__tests__/asset-sourcer.test.mjs` | Rewrite imports; add pre-download filter tests; add cached-image tests | **Medium** | Import path changes. All `API_SOURCES`/`YTDLP_SOURCES`/`CDP_SOURCES` references replaced with source-registry queries. |
| `__tests__/asset-sourcer-visual-integration.test.mjs` | Update cascade order assertions | **Medium** | Mock spy assertions change. Verify detectFocus NOT called for lowConfidence assets. |
| `__tests__/trends-utils.test.mjs` | Add images field tests to buildOutputJson | **Low** | Additive — existing tests unchanged. |
| `docs/adr/0013-*.md` | Revise "separate set" statement | **Low** | Documentation only. |
| `docs/adr/0016-*.md` | Add 4th "Already applied" point | **Low** | Documentation only. |
| `CONTEXT.md` | Update "Source Registry" definition; add "Capabilities" term | **Low** | Glossary update. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Source has `capabilities.articles` but no `capabilities.images` (e.g., arXiv) | search-sources includes it; asset-sourcer skips it | Low | Consumer query filters by capability |
| 2 | Source has `capabilities.images` but no `capabilities.articles` (e.g., Pexels) | search-sources skips it; asset-sourcer includes it | Low | Consumer query filters by capability |
| 3 | Source has both (e.g., IT之家) | Both consumers include it, each using its own capability config | Low | Capabilities are independent |
| 4 | Source has neither (malformed) | Both consumers skip it; structural validation test catches it | Low | Test seam 5 validates every source has ≥1 capability |
| 5 | `extractScript` extracts imageUrl but page has no images | `imageUrl: null`, `hasImage: false` stored; asset-sourcer skips null URLs | Low | Null check in cached-image flow |
| 6 | `trending-topics.json` doesn't exist (asset-sourcer run without prior trend discovery) | Cached-image phase returns empty array; normal source search proceeds | Low | `existsSync` check before reading |
| 7 | Cached image URL matches keyword but is a logo/avatar (false positive) | URL pattern filter rejects it; not downloaded | Low | Regex filter: `logo\|avatar\|icon\|placeholder\|spinner` |
| 8 | All cached images filtered out; asset-sourcer falls back to source search | Normal search flow runs; no degradation | Low | Cached-image is Phase 0, search is Phase 1 |
| 9 | Pre-download filter rejects all candidates from a source | Source contributes 0 assets; logged in `skipped[]` | Low | Same pattern as existing "no API key" skip |
| 10 | Pre-download filter threshold (20) lets through a bad asset that post-download filter (30) catches | Asset downloaded but skipped at post-download pre-filter | Low | Soft gate — VLM cascade still runs. Cost: one wasted download. Acceptable. |
| 11 | Cascade order: `lowConfidence` asset should NOT be sent to `detectFocus` | `detectFocus` mock spy assertion: not called for lowConfidence assets | Medium | Test seam 3 verifies call order |
| 12 | `analyzeAssets()` called with assets where ALL are lowConfidence | Phase 2 (detectFocus) receives empty array; Phase 3 (VLM) receives empty array; `asset-analysis.json` written with all assets marked lowConfidence | Low | Guard: `if (analyzableAssets.length === 0) skip to artifact write` |
| 13 | Pexels API key missing | Source skipped with "no API key" reason (same as current behavior) | Low | Unchanged — capability config carries `apiKeyEnv` |
| 14 | yt-dlp source (B站) cookie required but not available | Download fails with "needs auth"; logged in `failed[]` (same as current) | Low | Unchanged — capability config carries `cookieRequired` |
| 15 | Source name collision after merge (e.g., "bilibili" exists for both articles and videos) | Single source with `capabilities.articles` + `capabilities.videos`; no collision | Low | Capabilities are on the same source object |
| 16 | `SOURCE_ATTRIBUTIONS` moved to source-registry | `buildAttribution()` in asset-sourcer imports from source-registry instead of local | Low | Pure import path change |
| 17 | Existing `search-sources.mjs --research` mode (keyword-only sources) | Unaffected — queries `capabilities.articles` with `supportsKeyword=true` | Low | No behavior change for articles consumers |

## Out of Scope

1. **Issue #51 specific violations** — RAG reranker BM25 pre-filter and filterChinaAI LLM fallback are separate tickets under #51. This spec respects the cascade principle but doesn't fix those specific violations.

2. **P7 content-addressed caching** — SHA-256 based asset caching is a separate concern. This spec's cached-image flow is keyword-matching based, not hash-based.

3. **Multi-episode asset sharing** — If a series of videos covers the same topic, assets from Part 1 could be reused in Part 2. Not addressed here.

4. **Video temporal windowing (P4)** — VLM video fit analysis with temporal windows. This spec keeps the current "video skips fit" behavior.

5. **OCR / onScreenText fields** — VLM text localization. Not affected by source unification.

6. **Trend discovery LLM filter/classify** — Issue #51 proposes enhancing filterChinaAI with LLM fallback. This spec only adds imageUrl to extractScript output; filter/classify logic is unchanged.

7. **Article detail page image extraction** — The spec mentions "文章详情页精选图" as a future enhancement (Q3 option C). Current implementation only extracts search-page/homepage thumbnails. Detail-page extraction is a follow-up if thumbnail quality is insufficient.

## Further Notes

### Why not a `role: "fallback"` field for stock API sources

Stock API sources (Pexels, Unsplash, etc.) serve as implicit fallbacks — their images are generic and often rank lower than news-site images in scoreCandidate. Adding an explicit `role` field would require serializing source execution (wait for primary, check if enough, then run fallback), which is slower than the current parallel approach. The pre-download filter naturally rejects low-scoring stock API images, achieving the same cost savings without serialization.

### Pre-download vs post-download filter thresholds

Pre-download threshold (20) is lower than post-download (30) because:
- Pre-download: no file size info (API responses don't always include it), resolution may be missing
- Post-download: file size is known (downloaded file), technicalScore is more accurate
- A 20→30 gap means some assets are downloaded then skipped — this is acceptable (cost of one download vs cost of VLM analysis)

### Grill session decisions (all settled)

See conversation history: 13 questions across 2 rounds. All answered with consensus. Key decisions: (A) full merge, (A) stock APIs join registry, (C) extractScript + cached-image flow, (C) VLM only in Stage 4, (B) update ADR-0016, (C) cascade fix included, (A) pre-download filter, (A+C) keyword+URL pattern filter, (A) no role field, (A) delete Lorem Picsum, (A) single file ~53 sources.
