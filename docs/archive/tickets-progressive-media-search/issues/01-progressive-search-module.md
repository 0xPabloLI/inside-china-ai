# 01 — Progressive Search Module: Pure Functions + API Calls

**What to build:** A new module `lib/progressive-search.mjs` that provides tier evaluation logic and Brave/SearXNG image search functions. When given a keyword and API key, it can search Brave Image API and SearXNG image API, returning candidates in the same format as existing stock API sources (`{ url, title, type, resolution, source }`). It also provides `shouldTriggerTier3()` to decide whether Tier 3 search is needed based on current asset count vs. scenes needing media, and a `BraveQuotaTracker` class for in-memory API call counting.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `shouldTriggerTier3(totalAssets, scenesNeedingMedia)` — returns true when `totalAssets < scenesNeedingMedia` and `scenesNeedingMedia > 0`
- [x] `BraveQuotaTracker` class — `track()` increments count, `getCount()` returns current, `getRemaining(monthlyQuotient)` returns remaining
- [x] `searchBraveImages(keyword, apiKey, { count, quotaTracker })` — calls `GET https://api.search.brave.com/res/v1/images/search`, parses `data.results[].properties.url` → `{ url, title, type: "image", resolution, source: "brave_image" }`
- [x] `searchSearXngImages(keyword, { baseUrl, count })` — calls `GET <baseUrl>/search?q=...&format=json&categories=images`, parses `data.results[].img_src` → `{ url, title, type: "image", resolution, source: "searxng_image" }`
- [x] Tests: shouldTriggerTier3 boundary conditions (exactly enough, one short, zero assets, zero scenes), Brave parseResponse with mock API response (verified 2026-08-24), SearXNG parseResponse with mock API response, BraveQuotaTracker track/getCount/getRemaining
- [x] Scenario #1, #8 covered (sufficient assets → no trigger; empty scenes → no trigger)
- [x] Scenario #3, #4, #5 covered (missing API key → skip; 429 → empty; SearXNG unreachable → empty)
- [x] Scenario #6, #7, #9 covered (null/empty URL → filtered; empty results → []; parseResponse correctness)
