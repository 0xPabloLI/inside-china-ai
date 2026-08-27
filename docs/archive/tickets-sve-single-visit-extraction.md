# Tickets: SVE — Single-Visit Extraction

> Parent: #114
> Spec: `docs/spec-sve-single-visit-extraction.md`

## T1 — enrichWithMedia: search result page media enrichment

**What to build:** Upgrade `enrichWithImages` → `enrichWithMedia` in search-sources.mjs. When the CDP tab is already open from `extractScript`, run a single eval that extracts images (existing) PLUS video signals (`<video>` src, `<iframe>` YouTube/Bilibili/Douyin embeds, `og:video` meta) and metadata (`og:image`, `og:title`, `article:published_time`). Update `buildOutputJson` in trends-utils.mjs to write `videos[]` and `metadata{}` into topic entries when present. Existing `images[]` behavior unchanged.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] `enrichWithMedia` function replaces `enrichWithImages` in search-sources.mjs
- [x] Video extraction: `<video>` src, `<source>` child src, `<iframe>` platform embeds (YouTube/Bilibili/Douyin regex), `og:video` meta
- [x] Metadata extraction: `og:image`, `og:title`, `article:published_time`
- [x] Articles get optional `videoUrls: string[]` and `metadata: {ogImage?, ogTitle?, publishedTime?}` fields
- [x] `buildOutputJson` writes `videos[]` and `metadata{}` in topic entries when present
- [x] Existing `images[]` field behavior unchanged (backward compat)
- [x] Non-fatal: try/catch, media extraction failure never blocks article extraction
- [x] Tests: enrichWithMedia with mock CDP responses (video present, video absent, eval error)
- [x] Tests: buildOutputJson with videoUrls/metadata present and absent
- [x] Tests: scenario matrix rows 1-6, 16 covered

## T2 — extract-media.mjs: detail page media cache script

**What to build:** New script `scripts/short-video/lib/extract-media.mjs`. CLI: `--url <url> --content <slug>` or `--tab <tabId> --content <slug>`. Uses CDP `/eval` to extract all `<img>` (naturalWidth > 400), `<video>` src, `<iframe>` platform embeds, `og:image` meta from the page. Filters logos/icons via `isLogoOrIcon()`. Appends to `content/<slug>/research/media-cache.json` (versioned, merge by sourceUrl). Reuses `cdp-client.mjs` and `isLogoOrIcon()` from asset-sourcer.

**Blocked by:** None — can start immediately (independent of T1)

**Status:** ready-for-agent

- [x] `extract-media.mjs` created in `scripts/short-video/lib/`
- [x] CLI accepts `--url <url> --content <slug>` and `--tab <tabId> --content <slug>`
- [x] CDP eval script extracts: `<img>` (naturalWidth > 400), `<video>` src, `<iframe>` embeds, `og:image` meta
- [x] Logo/icon filtering via `isLogoOrIcon()` (imported from asset-sourcer)
- [x] Output: `content/<slug>/research/media-cache.json` with versioned schema
- [x] Merge logic: if sourceUrl already in cache, replace entry; append if new
- [x] Video platform identification (youtube, bilibili, direct, iframe)
- [x] Tests: extraction eval script with mock DOM (images, videos, iframes, og:image)
- [x] Tests: file I/O (create new, append, merge by sourceUrl)
- [x] Tests: logo/icon filtering
- [x] Tests: scenario matrix rows 9, 10, 17, 18 covered

## T3 — asset-sourcer Phase 0b: cached media consumer

**What to build:** New `loadCachedMedia(filePath, keywords)` and `toCachedMediaCandidate(candidate)` in asset-sourcer.mjs. New Phase 0b between Phase 0 (cached images) and Phase 1 (API sources): reads `content/<slug>/research/media-cache.json`, filters by keyword match on metadata.ogTitle or sourceUrl context, flattens to image + video candidates. Downloads via existing `downloadCandidate()`. Cross-phase dedup via existing `downloadedUrls` Set.

**Blocked by:** T1 (needs videos/metadata field structure from buildOutputJson), T2 (needs media-cache.json schema from extract-media.mjs)

**Status:** ready-for-agent

- [x] `loadCachedMedia(filePath, keywords)` — file missing → [], malformed → [], keyword filter
- [x] `toCachedMediaCandidate(candidate)` — normalizes for score/filter/download, type preservation (image vs video), `source: "cached-media"`
- [x] Phase 0b runs after Phase 0, before Phase 1
- [x] Uses `downloadCandidate()` for download — no new download logic
- [x] `downloadedUrls` Set dedup works across Phase 0 + 0b + 1
- [x] Tests: loadCachedMedia file-missing, malformed, no-keyword-match, happy path
- [x] Tests: toCachedMediaCandidate type preservation, title mapping
- [x] Tests: Phase 0b integration with score → preFilter → downloadCandidate
- [x] Tests: scenario matrix rows 11-15, 19 covered

## T4 — content-pipeline.md: Stage 0 Agent behavior rule

**What to build:** Update `docs/content-pipeline.md` Stage 0 Step 2 description. Define Agent behavior rule: when Agent opens article detail pages during Stage 0, Agent must run `extract-media.mjs` on each detail page to cache media URLs. Document the `--tab` option for reusing already-open CDP tabs.

**Blocked by:** T2 (extract-media.mjs must exist)

**Status:** ready-for-agent

- [x] Stage 0 Step 2 in content-pipeline.md updated with extract-media.mjs call rule
- [x] `--tab` option documented for reusing Agent's open CDP tab
- [x] Phase 0b in asset-sourcer referenced as downstream consumer
- [x] No code changes — documentation only
