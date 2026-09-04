# Spec: SVE — Single-Visit Extraction

> **Issue:** #114
> **Grill session:** 4 rounds, all decisions settled (2026-08-27)
> **Status:** ready-for-agent

## Problem Statement

Stage 0 (Source Discovery) has a data flow gap: when the Agent opens article detail pages to extract full text, the media URLs (images, videos, og:image) on those pages are seen but never saved. Stage 4's asset-sourcer then re-searches from scratch — re-opening the same search result pages that Stage 0 already visited, and completely ignoring the detail pages that Stage 0 already opened. This wastes CDP requests and misses high-quality media that was already visible.

Separately, search-sources.mjs's `enrichWithImages` only extracts article thumbnails from search result pages — it does not extract `<video>`, `<iframe>`, or `og:image` metadata.

The combined effect: the pipeline visits URLs multiple times and still misses media that was right there on the page.

## Solution

Two layers:

### Layer 1: Search result page media enrichment (search-sources.mjs)

Upgrade `enrichWithImages` → `enrichWithMedia` in `collectFromCdp`. When the CDP tab is already open from `extractScript`, run an additional eval to extract:

- **Video signals**: `<video>` src, `<iframe>` YouTube/Bilibili/Douyin embed URLs, `og:video` meta
- **Metadata**: `og:image`, `og:title`, `article:published_time`

These are stored in `buildOutputJson`'s topic entries alongside the existing `images[]` field, as new `videos[]` and `metadata{}` fields.

### Layer 2: Detail page media cache (new `extract-media.mjs` script)

Create a script `lib/extract-media.mjs` that the Agent calls during Stage 0 when opening article detail pages. The script:

1. Accepts a URL (or CDP tab ID if Agent already has the page open)
2. Uses CDP `/eval` to extract all `<img>`, `<video>`, `<iframe>`, `og:image` URLs from the page
3. Filters out logos/icons (reuses `isLogoOrIcon()` from asset-sourcer)
4. Appends results to `content/<slug>/research/media-cache.json`

asset-sourcer.mjs gets a new **Phase 0b** (after Phase 0 cached images, before Phase 1 API sources) that reads `media-cache.json` and downloads the cached media URLs using the existing `downloadCandidate()` helper.

### Updated data flow

```
Stage 0 Step 1 (search-sources.mjs):
  Open search result page → extractScript → {title, url, imageUrl?}
  → enrichWithMedia → extract images[] + videos[] + metadata{} from same DOM
  → filter/dedup → write discovery.json / trending-topics.json
    └─ topic.videos = [{url, sourceArticle, platform}]
    └─ topic.metadata = {og:image, og:title, article:published_time}

Stage 0 Step 2 (Agent + extract-media.mjs):
  Agent picks URLs from discovery.json
  → Agent opens detail page via web-access (/new + /extract)
  → Agent runs extract-media.mjs --url <url> --content <slug>
    → extract-media.mjs opens CDP tab (or reuses Agent's open tab)
    → /eval extracts all <img>, <video>, <iframe>, og:image URLs
    → filters logos/icons
    → appends to content/<slug>/research/media-cache.json
  → Agent extracts full text via /extract → in memory for Stage 1/3

Stage 4 Step 1.5 (main.mjs → asset-sourcer.mjs):
  Phase 0: loadCachedImages() from trending-topics.json (existing)
  Phase 0b: loadCachedMedia() from content/<slug>/research/media-cache.json (NEW)
    → downloads cached images + videos via downloadCandidate()
    → adds to allAssets
  Phase 1: API sources (Pexels etc.)
  Phase 2: CDP sources (may skip if Phase 0+0b yielded enough)
  Phase 3: yt-dlp sources
  Phase 4: Tier 3 progressive search
```

## User Stories

1. As a content creator, I want the pipeline to extract all media (images + videos + metadata) from a web page the first time it is visited, so that downstream stages can reuse the cached media without re-opening the page.
2. As a content creator, I want search-sources to capture video embeds and og:image metadata from search result pages, so that the trend discovery cache contains richer media signals.
3. As an Agent, I want a script I can call during Stage 0 to cache all media URLs from an article detail page, so that asset-sourcer in Stage 4 can download them without re-searching.
4. As a pipeline operator, I want asset-sourcer to read from the detail-page media cache before doing its own CDP/API searches, so that already-seen media is prioritized and CDP requests are minimized.
5. As a pipeline operator, I want the media cache to be per-content (stored in `content/<slug>/research/`), so that multiple content pipelines don't interfere with each other.
6. As a developer, I want extract-media.mjs to reuse the existing CDP client and logo/icon filter, so that extraction logic is consistent across the pipeline.
7. As a developer, I want loadCachedMedia() to be gracefully degrading (file missing → empty array, malformed → empty array), so that the absence of a media cache never blocks asset-sourcer.
8. As a developer, I want the media-cache.json schema to be versioned, so that future changes to the cache format can be detected and handled.
9. As a content creator, I want cached videos to include platform identification (youtube, bilibili, direct, iframe), so that asset-sourcer's downloadCandidate knows which VDL adapter to use.
10. As a content creator, I want metadata (og:image, article:published_time) to be extracted alongside media URLs, so that additional images from og:image are available and time-based filtering can use published dates.
11. As a developer, I want the existing `images[]` field in trending-topics.json to remain unchanged, so that backward compatibility is maintained.
12. As a developer, I want enrichWithMedia to fail gracefully (try/catch, non-fatal), so that media extraction failure never blocks article extraction.

## Implementation Decisions

### Layer 1: enrichWithImages → enrichWithMedia

- Rename `enrichWithImages` → `enrichWithMedia` in search-sources.mjs
- The new function runs a single CDP eval that extracts images (existing behavior) PLUS video signals and metadata in one pass
- Video signals extracted: `<video>` src + `<source>` child src; `<iframe>` src matching YouTube/Bilibili/Douyin patterns; `og:video` meta tag
- Metadata extracted: `og:image` (added to images array as additional source), `og:title` (stored in metadata), `article:published_time` (stored in metadata)
- The function returns articles with new optional fields: `videoUrls: string[]`, `metadata: {ogImage?, ogTitle?, publishedTime?}`
- `buildOutputJson` in trends-utils.mjs updated to write `videos[]` and `metadata{}` into topic entries when present
- Existing `images[]` field behavior unchanged — purely additive

### Layer 2: extract-media.mjs + media-cache.json

- New script: `scripts/short-video/lib/extract-media.mjs`
- CLI: `node lib/extract-media.mjs --url <url> --content <slug>` or `--tab <tabId>` (reuse already-open CDP tab)
- Reuses `cdp-client.mjs` (cdpNewTab, cdpEval, cdpCloseTab) and `isLogoOrIcon()` from asset-sourcer
- Extracts: all `<img>` with `naturalWidth > 400` (reuses existing threshold from CDP_IMAGE_CAPABILITIES fallback scripts), all `<video>` src, all `<iframe>` YouTube/Bilibili/Douyin embeds, `og:image` meta
- Output format `content/<slug>/research/media-cache.json`:
  ```json
  {
    "version": 1,
    "entries": [
      {
        "sourceUrl": "https://example.com/article-1",
        "scrapedAt": "2026-08-27T...",
        "images": [{ "url": "https://...", "alt": "..." }],
        "videos": [{ "url": "https://...", "platform": "youtube" }],
        "metadata": { "ogImage": "https://...", "ogTitle": "...", "publishedTime": "..." }
      }
    ]
  }
  ```
- Appends to existing file if already present (merge by sourceUrl — update entry if same URL revisited)
- The script is called by the Agent during Stage 0, not by any automated pipeline script

### asset-sourcer Phase 0b

- New function `loadCachedMedia(filePath, keywords)` — reads media-cache.json, filters entries by keyword match on metadata.ogTitle or sourceUrl context, returns flat array of image + video candidates
- New function `toCachedMediaCandidate(candidate)` — normalizes for the score/filter/download pipeline, sets `type` based on original type, sets `source: "cached-media"`
- Phase 0b runs between Phase 0 (cached images from trending-topics) and Phase 1 (API sources)
- Uses existing `downloadCandidate()` for download — no new download logic
- `downloadedUrls` Set already tracks cross-phase dedup — Phase 0b results will be deduplicated against Phase 0 and each other

### content-pipeline.md update

- Stage 0 Step 2 description updated to include: "Agent runs `extract-media.mjs` on each detail page to cache media URLs"
- This is a documentation change (Agent behavior rule), not code

## Testing Decisions

- **enrichWithMedia**: test the CDP eval script extraction logic with mock CDP responses (same pattern as existing `enrichWithImages` tests in trends-utils.test.mjs). Test that articles without videoUrls/metadata still work (backward compat).
- **buildOutputJson**: test that `videos[]` and `metadata{}` appear in topic entries when articles have these fields, and are absent/empty when not.
- **extract-media.mjs**: test the extraction script (eval string) output with mock DOM structures. Test file I/O (create, append, merge by sourceUrl). Test logo/icon filtering.
- **loadCachedMedia**: test file-missing → empty, malformed → empty, keyword matching, image/video candidate shape.
- **toCachedMediaCandidate**: test type preservation (image stays image, video stays video), title mapping from ogTitle.
- **Phase 0b integration**: test that cached media candidates flow through score → preFilter → downloadCandidate, same as Phase 0.
- Prior art: `loadCachedImages` tests in asset-sourcer.test.mjs, `toCachedImageCandidate` tests, `buildOutputJson` tests in trends-utils.test.mjs.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                  | Modification                                                          | Risk   | Assessment                                                                                                                             |
| --------------------- | --------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `search-sources.mjs`  | `enrichWithImages` → `enrichWithMedia`, add video+metadata extraction | Medium | Modifies existing function behavior. Non-fatal try/catch preserves article extraction. CDP tab already open, zero additional requests. |
| `trends-utils.mjs`    | `buildOutputJson` add `videos[]` + `metadata{}` to topic entries      | Medium | New fields, doesn't modify existing `images[]` logic. Backward compatible — old consumers ignore new fields.                           |
| `asset-sourcer.mjs`   | New `loadCachedMedia` + `toCachedMediaCandidate` + Phase 0b           | Low    | Pure addition (new function + new phase), doesn't modify existing Phase 0/1/2/3 logic.                                                 |
| `content-pipeline.md` | Stage 0 Step 2 description updated                                    | Low    | Documentation change, Agent behavior rule.                                                                                             |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                  | Expected Behavior                                                      | Risk   | Mitigation                                                           |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| 1   | Search result page has `<video>` tag                      | `enrichWithMedia` extracts video src, article gets `videoUrls[]`       | Low    | Non-fatal try/catch; missing video = no videoUrls field              |
| 2   | Search result page has `<iframe>` YouTube embed           | `enrichWithMedia` extracts embed URL, identifies platform as "youtube" | Low    | Regex pattern match; non-YouTube iframe = skipped                    |
| 3   | Search result page has no videos                          | Article has no `videoUrls` field (or empty array)                      | Low    | Same as current `imageUrl: null` behavior                            |
| 4   | `enrichWithMedia` eval throws error                       | Articles returned without media fields (non-fatal)                     | Low    | Existing try/catch pattern from `enrichWithImages`                   |
| 5   | `buildOutputJson` receives article with `videoUrls`       | Topic entry gets `videos[]` array                                      | Low    | Pure additive — existing `images[]` unaffected                       |
| 6   | `buildOutputJson` receives article without `videoUrls`    | Topic entry has no `videos` field (or empty)                           | Low    | Same as current `imageUrl` absent behavior                           |
| 7   | Article has `metadata.ogImage`                            | `ogImage` URL added to images array as additional source               | Medium | Dedup by URL; ogImage may duplicate thumbnail URL                    |
| 8   | Article has `metadata.publishedTime`                      | Stored in metadata field                                               | Low    | Optional field, missing = not stored                                 |
| 9   | `extract-media.mjs` called on URL that's already in cache | Entry updated (merged by sourceUrl)                                    | Medium | Merge logic: replace entry with same sourceUrl, keep others          |
| 10  | `extract-media.mjs` CDP tab fails to open                 | Script exits with error message, no cache file written                 | Low    | Agent can retry or skip; asset-sourcer Phase 0b handles missing file |
| 11  | `media-cache.json` doesn't exist                          | `loadCachedMedia` returns empty array                                  | Low    | Same pattern as `loadCachedImages`                                   |
| 12  | `media-cache.json` is malformed                           | `loadCachedMedia` returns empty array                                  | Low    | try/catch, same as `loadCachedImages`                                |
| 13  | `media-cache.json` has entries but none match keywords    | `loadCachedMedia` returns empty array                                  | Low    | Same as `loadCachedImages` keyword matching                          |
| 14  | Cached video URL already downloaded by Phase 0            | Phase 0b skips it (downloadedUrls Set dedup)                           | Low    | Existing cross-phase dedup mechanism                                 |
| 15  | Cached video URL fails to download via VDL                | Failed entry recorded, other cached media still processed              | Low    | Same error handling as Phase 0                                       |
| 16  | `enrichWithMedia` called on non-CDP source (API, MCP)     | Not called — only called inside `collectFromCdp`                       | Low    | No change to API/MCP paths                                           |
| 17  | og:image URL is a logo/icon                               | Filtered by `isLogoOrIcon()` in extract-media.mjs                      | Low    | Reuses existing filter                                               |
| 18  | `<img>` has naturalWidth < 400 in extract-media.mjs       | Skipped (below quality threshold)                                      | Low    | Reuses existing threshold from CDP fallback scripts                  |
| 19  | media-cache.json has entries from multiple URLs           | All entries processed, candidates flattened and deduped                | Low    | Flatten + downloadedUrls dedup                                       |

## Out of Scope

1. **Opening article detail pages in search-sources.mjs** — search-sources only opens search result pages. Detail page extraction is Agent-driven via extract-media.mjs.
2. **Automatic detail page extraction** — The Agent decides which URLs to open. No batch auto-extraction of all discovery.json URLs.
3. **Full-text caching** — Agent's full-text extraction stays in memory. Only media URLs are cached to disk.
4. **Source registry schema changes (#77)** — capabilities.videos labeling audit is separate.
5. **CDP video frame extraction** — web-access `/screenshot` for video frame sampling is not part of this spec.
6. **Research mode output schema changes** — `research-results.json` and `discovery.json` get the new fields but their existing structure is not redesigned.
7. **filterChinaAI LLM fallback (#51)** — Enhancing the programmatic filter with LLM-based relevance scoring is a separate issue.

## Further Notes

- The `extract-media.mjs` script reuses the same CDP proxy (localhost:3456) that search-sources and asset-sourcer already use. No additional infrastructure.
- The `--tab <tabId>` option for extract-media.mjs allows the Agent to reuse an already-open CDP tab (Agent opens detail page with `/new`, gets tabId, then calls extract-media.mjs with `--tab` instead of `--url` — avoids opening the same page twice).
- `og:image` is added to the images array because it's often a higher-quality cover image than the thumbnail from the search result page.
- Video platform identification helps VDL's strategy selector: YouTube/Bilibili URLs → YtdlpAdapter, direct `.mp4` → DirectHttp, others → CobaltAdapter fallback.
