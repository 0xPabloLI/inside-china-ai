# Spec: Asset Sourcer — Automated Media Asset Search & Download

> **Created**: 2026-08-14
> **Status**: Ready for implementation
> **Tracker**: GitHub Issues (label: `ready-for-agent`)
> **Grill sessions**: 2 rounds, 2026-08-14

## Problem Statement

The short-video pipeline currently downloads all image/video assets manually via `yt-dlp` and `curl` commands. There is no script that orchestrates finding, downloading, and cataloging media assets. Content coverage is low: only 2 unique assets for 10 scenes in the only media-enabled content (Unitree); all other content has 0 media assets.

## Solution

A standalone script `scripts/short-video/lib/asset-sourcer.mjs` that:
1. Extracts keywords from scene-data (`meta.keyEntities`, `voiceover` text) or CLI arguments
2. Searches multiple sources (API + CDP + yt-dlp) for matching images/videos
3. Scores and ranks candidates by keyword match, duration, file size, resolution
4. Downloads top candidates to `content/{slug}/assets/`
5. Outputs a JSON report (`output/asset-report.json`) with recommended scene assignments, animation presets, and overlay values

The script is a **tool**, not a pipeline step. It runs manually before scene-data authoring. It does not auto-modify scene-data — the user reviews the report and manually fills `media` fields.

## User Stories

1. As a video producer, I want to run `node asset-sourcer.mjs --content unitree` and have it automatically find relevant images and videos for my Unitree content, so that I don't have to manually search and download each asset.
2. As a video producer, I want the script to search Chinese news sites (IT之家, 机器之心, 新华网, 澎湃新闻) for real product photos, because stock sites don't cover Chinese AI companies.
3. As a video producer, I want the script to search B站 via `yt-dlp bilisearch:` for Chinese video content, because YouTube may not have Chinese company demos.
4. As a video producer, I want the script to search Pexels, Unsplash, and Pixabay for generic B-roll (nature, city, tech), because these are free and API-accessible.
5. As a video producer, I want the script to search Wikimedia Commons for company headquarters and product photos, because these are CC-licensed and free.
6. As a video producer, I want the script to download YouTube video clips via `yt-dlp --cookies-from-browser chrome`, because YouTube has the best demo videos.
7. As a video producer, I want the script to output a report telling me which asset goes in which scene, with recommended animation and overlay values, so that I can quickly fill in the `media` field in scene-data.
8. As a video producer, I want the script to skip sources that require API keys I don't have, so that missing keys don't block the script.
9. As a video producer, I want the script to handle partial failures gracefully — if one source fails, others continue, so that I always get some assets.
10. As a video producer, I want the script to check for existing files and skip re-downloading, so that re-running doesn't waste bandwidth.
11. As a video producer, I want the script to tell me when CDP proxy is not available, because CDP-based sources (Chinese news sites) require Chrome Remote Debugging.
12. As a video producer, I want the script to run yt-dlp searches serially, because parallel yt-dlp instances conflict on Chrome's cookie database lock.
13. As a video producer, I want the script to filter assets by quality (resolution, file size, duration), so that I get usable assets not junk.
14. As a video producer, I want the script to name files `{source}-{keyword}-{index}.{ext}`, so that I can easily identify where each asset came from.
15. As a video producer, I want the script to verify downloaded files are not empty/corrupt (≥1KB), so that broken downloads are caught.
16. As a video producer, I want the script to handle the case where scene-data has no `meta.keyEntities`, by falling back to CLI keywords or voiceover text extraction.
17. As a video producer, I want the script to handle the case where a news site's DOM structure has changed, by falling back to a generic image extraction script.
18. As a video producer, I want the script to handle the case where a social media platform requires login, by skipping and marking "needs auth" in the report.

## Implementation Decisions

### Architecture

`asset-sourcer.mjs` is a standalone module with pure functions for core logic and injectable interfaces for external calls (fetch, execSync, CDP). It imports existing `cdp-client.mjs` for CDP operations.

### Module structure

```
scripts/short-video/lib/asset-sourcer.mjs   ← main module
scripts/short-video/__tests__/asset-sourcer.test.mjs  ← tests
```

No existing files are modified.

### Input contract

```javascript
// From scene-data.mjs (dynamic import):
{
  meta: { keyEntities: { companies: ["Unitree"], ... } },
  scenes: [
    { voiceover: "Unitree's H1 robot does a backflip...", visualType: "narrative" },
    ...
  ]
}

// CLI fallback:
node asset-sourcer.mjs --content unitree --keywords "Unitree H1,robot"
```

### Output contract

```javascript
// output/asset-report.json
{
  searchedAt: "2026-08-14T...",
  content: "unitree",
  keywords: ["Unitree", "robot", "H1"],
  totalAssets: 5,
  assets: [
    {
      source: "youtube",
      keyword: "Unitree",
      type: "video",
      path: "content/unitree/assets/youtube-unitree-01.mp4",
      url: "https://youtube.com/watch?v=xxx",
      score: 85,
      duration: 8,
      resolution: "720p",
      recommendedScene: 2,
      recommendedAnimation: "zoom",
      recommendedOverlay: 0.7,
      status: "downloaded"
    },
    {
      source: "ithome",
      keyword: "Unitree",
      type: "image",
      path: "content/unitree/assets/ithome-unitree-01.jpg",
      url: "https://img.ithome.com/...",
      score: 70,
      recommendedScene: 4,
      recommendedAnimation: "ken-burns",
      recommendedOverlay: 0.75,
      status: "downloaded"
    }
  ],
  failed: [
    { source: "douyin", keyword: "Unitree", error: "needs auth" }
  ],
  skipped: [
    { source: "pixabay", reason: "no API key" }
  ]
}
```

### Source definitions

Each source is a pluggable definition (same pattern as `trend-sources.mjs`):

```javascript
{
  name: "pexels",
  type: "image+video",
  requiresApiKey: "PEXELS_API_KEY",
  search: async (keyword, apiKey) => { /* fetch API, return candidates */ },
  download: async (candidate, destDir) => { /* fetch URL, write file */ },
}
```

Source types:
- **API sources** (Pexels, Unsplash, Pixabay, Wikimedia Commons, Coverr, Flickr, Internet Archive): `fetch()` search + `fetch()` download
- **yt-dlp sources** (YouTube, Bilibili search, CCTV): `execSync("yt-dlp ...")` download
- **CDP sources** (IT之家, 机器之心, 新华网, 澎湃新闻): `cdpNewTab` → `extractFromTab` with fixed JS script → `fetch()` download image URLs

### Scoring algorithm

Score (0-100) = weighted sum of:
- Keyword match in title (0-40): exact match = 40, partial = 20, no match = 0
- Duration fitness (0-25): video 3-8s = 25, 8-15s = 15, <3s or >60s = 5, image = 20
- File size fitness (0-20): video <20MB = 20, <50MB = 10, >50MB = 0; image <5MB = 20, <10MB = 10
- Resolution bonus (0-15): ≥1080p = 15, ≥720p = 10, <720p = 5, unknown = 0

### Scene recommendation logic

Based on `visualType`:
- `narrative` → `fade` or `zoom`, overlay 0.7
- `info-card` → `ken-burns` (images only), overlay 0.75
- `quote` → `fade`, overlay 0.8
- `data` / `stat-reveal` → no media (CSS-only)
- `hook` / `cta` → no media (templates ignore media field)

### yt-dlp constraints

- All yt-dlp calls use `--cookies-from-browser chrome`
- **Serial execution only** — `for...of` + `await`, never `Promise.all`
- Video clips: `--download-sections "*0:00-0:08"` (8 seconds), `--max-filesize 20M`, `-f "best[height<=720]"`
- B站 search: `yt-dlp "bilisearch:keyword" --flat-playlist --print "%(id)s %(title)s %(duration)s"`

### CDP image extraction pattern

Each Chinese news site has:
1. Primary extract script (site-specific selectors) — matches `trend-sources.mjs` pattern
2. Fallback extract script (generic `img[src]` > 200px width)
3. Retry once on empty results (same as `discover-trends.mjs`)

### CDP proxy requirement

- **CDP proxy must be available** (`localhost:3456`). If unavailable, script exits with error (Q5 decision: report error and exit).
- Only CDP sources depend on the proxy. API sources and yt-dlp sources do not need CDP.

### File naming & dedup

- Format: `{source}-{keyword-slug}-{index}.{ext}` (e.g., `ithome-unitree-01.jpg`)
- Before download: `existsSync` check → skip if file exists
- After download: `statSync` check → delete if <1KB (corrupt)

### API key management

- Read from `.env.local` via `dotenv`
- Keys: `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PIXABAY_API_KEY` (optional)
- Missing key → source skipped with warning, not error

## Testing Decisions

### What makes a good test

Test external behavior of pure functions. Mock external calls (fetch, execSync, CDP). Do not test implementation details.

### Testing seams

1. **Pure functions** (no mocking needed):
   - `extractKeywords(scenes, meta, cliKeywords)` — keyword extraction logic
   - `scoreCandidate(candidate, keyword)` — scoring algorithm
   - `recommendScene(asset, scenes)` — scene assignment logic
   - `buildFilename(source, keyword, index, ext)` — file naming
   - `buildReport(assets, failed, skipped)` — report generation
   - `slugifyKeyword(keyword)` — keyword to filename-safe string

2. **Mocked external calls** (via `vi.stubGlobal` / `vi.mock`):
   - API source search/download: mock `fetch`
   - yt-dlp source: mock `execSync` via `vi.mock("child_process")`
   - CDP source: mock `cdpNewTab`, `extractFromTab`, `cdpCloseTab` via `vi.mock("../lib/cdp-client.mjs")`
   - File system: mock `existsSync`, `writeFileSync`, `statSync` via `vi.mock("fs")`

### Prior art

- `cdp-client.test.mjs` — mock fetch for CDP calls, `vi.stubGlobal("fetch")`
- `trend-sources.test.mjs` — test source definitions structure
- `media-bg.test.mjs` — test pure functions with file existence mocking
- `publora-client.test.mjs` — mock fetch + readFileSync for HTTP calls

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/short-video/lib/asset-sourcer.mjs` | New file | N/A | No existing files affected |
| `scripts/short-video/__tests__/asset-sourcer.test.mjs` | New file | N/A | No existing files affected |
| `docs/research/media-asset-strategy.md` | Update §4.4 status only | Low | Text-only status update, no logic change |
| `.env.local` | Add API keys | Low | Already done, keys are in `.gitignore` |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | scene-data not found / import fails | Error message, exit(1) | Low | File existence check before import |
| 2 | meta.keyEntities is empty/undefined | Fallback to CLI --keywords, then voiceover extraction | Medium | 3-tier keyword source chain |
| 3 | CDP proxy unreachable (localhost:3456) | Error message "CDP proxy not available", exit(1) | Medium | Pre-flight check at startup |
| 4 | API key missing (.env.local) | Skip that source, log warning, continue | Low | Read key, if undefined → skip |
| 5 | API source returns 0 results | Skip source, mark "no results" in report | Low | Per-source try/catch |
| 6 | yt-dlp download fails (invalid URL/timeout) | Mark URL as failed, continue to next candidate | Medium | Per-URL try/catch + 60s timeout |
| 7 | Multiple yt-dlp downloads requested | Serial execution (for...of + await) | Medium | Never use Promise.all for yt-dlp |
| 8 | content/{slug}/assets/ directory missing | Auto-create with mkdirSync recursive | Low | Standard pattern |
| 9 | Same-name file already exists | Skip download, mark "already exists" | Low | existsSync check |
| 10 | Multiple candidates match keyword | Sort by score, download top-3 | Low | sort + slice |
| 11 | Video duration unknown before download | Score uses yt-dlp --print duration first | Medium | Two-phase: search → metadata → download |
| 12 | Downloaded file is 0 bytes / <1KB | Delete file, mark as failed | Medium | statSync check post-download |
| 13 | API returns unexpected JSON format | Parse fails → skip item, continue | Medium | Per-item try/catch in parsing |
| 14 | CDP page load timeout (no readyState) | Retry once, then skip source | Medium | waitForPageLoad + 1 retry |
| 15 | CDP extract script returns 0 (DOM changed) | Fallback to generic img extraction, then skip | Medium | Two-layer extraction |
| 16 | B站 bilisearch returns error | Mark failed, continue other sources | Low | yt-dlp error caught |
| 17 | Douyin/XHS requires login | Skip, mark "needs auth" | Low | yt-dlp error message detection |
| 18 | Report JSON output | Fixed schema, user manually consumes | Low | Strict schema in buildReport() |

## Out of Scope

- Auto-modifying scene-data.mjs with `media` fields (future `--auto-assign` feature)
- Integration into `main.mjs` pipeline (runs as a standalone tool)
- Asset deduplication via SHA-256 (design proposal in §4.5, not yet implemented)
- Per-scene volume field in MediaField (proposed in §4.6, not yet implemented)
- Network-level CDP analysis for CCTV video URL extraction (blob URL issue)
- MCP fallback for Chinese platforms (existing MCP configs in trend-sources.mjs are for trend discovery, not asset download)
- TikTok scraping (excluded — TikTok is our distribution platform)
- Stock photo watermarked content (only free-license sources)

## Further Notes

- The script uses the same CDP infrastructure as `discover-trends.mjs` (cdp-client.mjs functions)
- yt-dlp's `bilisearch:` prefix is the only built-in search extractor for Chinese platforms — all others need CDP search first
- API keys are stored in `.env.local` (not in Git, covered by `*.local` gitignore rule)
- Pixabay API key not yet obtained — user needs to visit `https://pixabay.com/api/docs/` after Google login to see their key
- Coverr API appears to require no authentication — lowest barrier to entry
- Unsplash has a 50 req/hour demo limit → apply for Production approval (1000 req/hour) if needed
