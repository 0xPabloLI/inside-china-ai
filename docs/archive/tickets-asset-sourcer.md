# Tickets: Asset Sourcer — Tracer-Bullet Breakdown

> **Spec**: docs/archive/spec-asset-sourcer.md
> **Issue**: GitHub #23
> **Created**: 2026-08-14

## Dependency Graph

```
AS-1 (core: keywords + scoring + naming)
  ├── AS-2 (API sources: Pexels + Unsplash + Wikimedia + Coverr)
  ├── AS-3 (yt-dlp sources: YouTube + Bilibili search)
  └── AS-4 (CDP sources: Chinese news image extraction)
       │
AS-5 (orchestrator: main() + report generation)
  └── depends on AS-1, AS-2, AS-3, AS-4
```

AS-1 has no dependencies and is the foundation. AS-2/AS-3/AS-4 depend on AS-1 and can be built in parallel. AS-5 ties everything together.

---

## AS-1: Core logic — keywords, scoring, naming, report

**Depends on**: nothing
**Blocks**: AS-2, AS-3, AS-4, AS-5

### Scope
- `extractKeywords(scenes, meta, cliKeywords)` — 3-tier keyword source chain
- `scoreCandidate(candidate, keyword)` — weighted scoring algorithm
- `recommendScene(asset, scenes)` — scene assignment recommendation
- `buildFilename(source, keyword, index, ext)` — file naming
- `slugifyKeyword(keyword)` — keyword to filename-safe string
- `buildReport(assets, failed, skipped)` — JSON report generation

### Tests (TDD — all must pass before implementation)
- extractKeywords: scene-data with keyEntities → returns companies
- extractKeywords: empty keyEntities → falls back to CLI keywords
- extractKeywords: no CLI keywords → extracts from voiceover text
- extractKeywords: all empty → returns empty array
- scoreCandidate: exact keyword match in title → 40 points
- scoreCandidate: partial match → 20 points
- scoreCandidate: no match → 0 points
- scoreCandidate: video 3-8s → 25 points duration
- scoreCandidate: video >60s → 5 points duration
- scoreCandidate: image → 20 points duration (fixed)
- scoreCandidate: video <20MB → 20 points size
- scoreCandidate: video >50MB → 0 points size
- scoreCandidate: image <5MB → 20 points size
- scoreCandidate: resolution ≥1080p → 15 points
- scoreCandidate: resolution unknown → 0 points
- recommendScene: narrative scene → fade/zoom, overlay 0.7
- recommendScene: info-card scene → ken-burns, overlay 0.75
- recommendScene: quote scene → fade, overlay 0.8
- recommendScene: data scene → no media
- recommendScene: hook/cta scene → no media
- buildFilename: normal keyword → `ithome-unitree-01.jpg`
- buildFilename: keyword with spaces → slugified
- buildFilename: keyword with special chars → slugified
- slugifyKeyword: "Unitree H1" → "unitree-h1"
- slugifyKeyword: "DeepSeek's" → "deepseeks"
- buildReport: with assets + failed + skipped → valid JSON structure
- buildReport: empty results → valid JSON with empty arrays

---

## AS-2: API sources — Pexels, Unsplash, Wikimedia, Coverr

**Depends on**: AS-1
**Blocks**: AS-5

### Scope
- Source definition objects for each API source
- `searchApiSource(source, keyword, apiKey)` — fetch search API → parse JSON → return candidates
- `downloadApiAsset(candidate, destDir, filename)` — fetch URL → write file → verify size ≥1KB
- API key reading from `.env.local`
- Sources: Pexels (images+videos), Unsplash (images only), Wikimedia Commons (images), Coverr (videos)

### Tests (TDD)
- Pexels source definition: has correct API base, auth header format
- Pexels search: mock fetch → returns candidates with title, url, type
- Pexels search: mock fetch error → returns empty array
- Unsplash source: orientation=portrait in search URL
- Unsplash search: mock fetch → returns image candidates
- Wikimedia search: includes User-Agent header
- Wikimedia search: mock fetch → returns candidates with direct image URLs
- Coverr search: no auth header needed
- Coverr search: mock fetch → returns video candidates with signed URLs
- downloadApiAsset: mock fetch → writes file → returns path
- downloadApiAsset: mock fetch error → returns null
- downloadApiAsset: 0-byte response → returns null, file deleted
- downloadApiAsset: existing file → skips, returns existing path
- API key missing → source skipped with warning

---

## AS-3: yt-dlp sources — YouTube, Bilibili, CCTV

**Depends on**: AS-1
**Blocks**: AS-5

### Scope
- Source definitions for yt-dlp sources
- `searchYtdlp(keyword, platform)` — run yt-dlp search (B站 bilisearch, YouTube flat-playlist) → parse output → return candidates
- `downloadYtdlp(url, destDir, filename)` — run yt-dlp with `--cookies-from-browser chrome` → verify file exists and ≥1KB
- Serial execution enforcement (no Promise.all for yt-dlp calls)
- yt-dlp flags: `--cookies-from-browser chrome`, `-f "best[height<=720]"`, `--download-sections "*0:00-0:08"`, `--max-filesize 20M`

### Tests (TDD)
- YouTube source definition: correct flags
- YouTube search: mock execSync → parses yt-dlp output lines
- YouTube search: mock execSync error → returns empty array
- Bilibili search: uses "bilisearch:" prefix
- Bilibili search: mock execSync → parses results
- CCTV source: URL-based, no search
- downloadYtdlp: mock execSync → file created → returns path
- downloadYtdlp: mock execSync error → returns null
- downloadYtdlp: existing file → skips
- Serial enforcement: multiple downloads → for...of not Promise.all

---

## AS-4: CDP sources — Chinese news image extraction

**Depends on**: AS-1
**Blocks**: AS-5

### Scope
- Source definitions for Chinese news sites (IT之家, 机器之心, 新华网, 澎湃新闻)
- Each source: primary extract script (site-specific selectors) + fallback (generic img extraction)
- `searchCdpSource(source, keyword)` — cdpNewTab → waitForPageLoad → extractFromTab → return image candidates
- `downloadCdpImage(candidate, destDir, filename)` — fetch URL → write file → verify size
- CDP proxy availability check at startup
- Retry once on empty extraction results

### Tests (TDD)
- CDP check: mock fetch to localhost:3456/targets → available
- CDP check: mock fetch error → throws "CDP proxy not available"
- ithome extract script: contains site-specific selectors
- jiqizhixin extract script: contains site-specific selectors
- xinhua extract script: contains site-specific selectors
- thepaper extract script: contains site-specific selectors
- Generic fallback script: contains `img[src]` and width check
- searchCdpSource: mock cdpNewTab + extractFromTab → returns candidates
- searchCdpSource: empty results → retry once
- searchCdpSource: still empty after retry → returns empty array
- searchCdpSource: fallback script → returns generic img results
- downloadCdpImage: mock fetch → writes file → returns path
- downloadCdpImage: fetch error → returns null

---

## AS-5: Orchestrator — main() + report output

**Depends on**: AS-1, AS-2, AS-3, AS-4
**Blocks**: nothing

### Scope
- `main()` CLI entry point with `--content`, `--keywords`, `--max-per-source` flags
- Dynamic import of scene-data from `content/{slug}/scenes.mjs`
- Keyword extraction chain (scene-data → CLI → voiceover)
- Source iteration: API sources (parallel via Promise.allSettled) + yt-dlp sources (serial) + CDP sources (serial)
- Report writing to `output/asset-report.json`
- Summary console output (total found, per-source stats, failed sources)
- `.env.local` loading via dotenv

### Tests (TDD)
- main: --content flag → imports scene-data
- main: --content not found → error + exit(1)
- main: --keywords flag → uses CLI keywords when no scene-data
- main: scene-data keyEntities → uses them as keywords
- main: empty keyEntities → falls back to --keywords
- main: CDP proxy check → exit(1) if unavailable
- main: API sources run in parallel (Promise.allSettled)
- main: yt-dlp sources run serial
- main: CDP sources run serial
- main: report written to output/asset-report.json
- main: partial failures → report includes failed[] and skipped[]
- main: .env.local loaded → API keys available to sources
