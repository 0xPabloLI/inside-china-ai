# Media Asset Strategy for Short Videos

> Status: Active — last updated 2026-08-14
> Scope: Image/video asset acquisition, integration, and animation for the short-video pipeline.
>
> **Section 4 status summary** (as of 2026-08-14):
>
> **Completed research (informs current practice):**
> - §4.2 (Visual Engagement Research) — ✅ Research complete. Findings inform scene-data authoring.
> - §4.3 (Asset Source Catalog) — ✅ Research complete. 8 international + 5 Chinese news + 4 Chinese video sources documented. Download commands in §2.
>
> **Implemented in pipeline:**
> - §4.5 (Asset Directory Reorganization) — ✅ **Implemented 2026-08-14**. See `docs/media-asset-management.md` for authoritative structure.
> - §4.6 (Background Audio Mixing) — ✅ Validated. `volume={0.08}` confirmed as industry-standard (-22dB). Per-scene volume / envelope ducking: proposed, not yet in code.
> - §4.7 (BGM) — ⚠️ Deprecated. Pipeline BGM was fully implemented (`lib/bgm.mjs` + `mixBgm()`) but user has stopped using it — adds TikTok music manually at upload time. Code retained but `--bgm` flag no longer recommended.
>
> **Future ideas (not implemented):**
> - §4.1 (Reference Video Extraction) — Conceptual workflow only. Priority: Low.
> - §4.4 (Automated Asset Pipeline) — ✅ `asset-sourcer.mjs` **implemented** (commit 1198685 + 1501c69, 90 tests). Searches 10 sources, scores candidates, downloads top matches, outputs JSON report. Does NOT auto-modify scene-data — user reviews report and manually fills `media` field.
> - §4.5 (SHA-256 Dedup) — Future: content hashing to prevent duplicate downloads. Directory reorganization is already done; dedup logic is the remaining piece. Priority: Low.
> - §4.6 (Per-scene volume + envelope ducking) — Proposed in research, not yet in `types.ts` / `MediaBackground.tsx`. Priority: Medium.

## 1. Current State (2026-08-13)

### What we have

| Asset | Type | Size | Source | Used in (scenes) | Animation |
|-------|------|------|--------|-------------------|-----------|
| `unitree-demo.mp4` | video | 10MB | YouTube (yt-dlp + cookies) | S2, S5, S6 | fade, zoom, fade |
| `unitree-building.jpg` | image | 11MB | Wikipedia (Node fetch + UA) | S4 | ken-burns |

**Note**: `unitree-backflip.mp4` was listed in an earlier draft as "downloading" but the download was never completed and the file does not exist. Scene 5 reuses `unitree-demo.mp4` with `zoom` animation instead.

### Content coverage

| Content | Scenes | Scenes with media | Media coverage | Unique assets |
|---------|--------|-------------------|----------------|---------------|
| `unitree` | 10 | 4 (S2, S4, S5, S6) | 40% | 2 (1 video + 1 image) |
| `light-society` | 10 | 0 | 0% | 0 |
| `deepseek` | 12 | 0 | 0% | 0 |
| `distillation/pt1-3` | 8+9+9 | 0 | 0% | 0 |

**Observation**: Only the Unitree content uses media backgrounds. All other content is CSS-only. The same `unitree-demo.mp4` is reused across 3 scenes with different animations and overlay values, which works but reduces visual variety.

### What's working

- **Remotion `MediaBackground` component** (`remotion/src/components/MediaBackground.tsx`) renders `<Img>`/`<Video>` with 5 animation presets (fade, ken-burns, slide, zoom, none)
- **Playwright fallback** (`lib/media-bg.mjs`) provides the same 5 presets via CSS `@keyframes` for non-Remotion rendering
- **`render-remotion.mjs`** auto-copies media files from `content/{slug}/assets/` to `remotion/public/assets/`, auto-strips missing files with warning
- **Scene-data `media` field** declares which asset + animation each scene uses (see `types.ts` → `MediaField` interface)
- **Graceful degradation**: missing files are stripped, scene renders with CSS-only background
- **Pre-render validation**: `verify-video.mjs --pre` validates media objects (type, path, file existence, animation preset compatibility)

### What's not working yet

- **Subtitle timing drift**: Remotion TransitionSeries 6-frame transition accumulates offset across scenes
- **Low asset coverage**: 2 unique assets for 10 scenes in the only media-enabled content; all other content has 0 media assets
- **No automated asset sourcing pipeline**: all downloads are manual `yt-dlp` / `curl` commands — no script orchestrates finding, downloading, and assigning assets
- **Video reuse**: same `unitree-demo.mp4` appears in 3 scenes — viewers may notice the loop
- **Asset library organized** (2026-08-14): `assets/` now only holds global shared production assets (brand, logos, BGM). Per-content assets live in `content/{slug}/assets/`. TTS reference audio in `voice-samples/`. Experiments in `experiments/`. See `docs/media-asset-management.md`. SHA-256 dedup is a future optimization.

## 2. Download Methods & Troubleshooting

### 2.1 YouTube Videos (yt-dlp)

**Root cause of failures**: YouTube bot detection returns `LOGIN_REQUIRED` without cookies.

**Working command**:
```bash
yt-dlp --cookies-from-browser chrome \
  -f "best[height<=720][ext=mp4]/best[height<=720]" \
  --max-filesize 20M \
  --download-sections "*0:00-0:10" \
  -o "output-name.mp4" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

**Key flags**:
- `--cookies-from-browser chrome` — **MANDATORY**. Without this, YouTube returns "Sign in to confirm you're not a bot"
- `--download-sections "*0:00-0:10"` — download only first 10 seconds (keeps file size small)
- `--max-filesize 20M` — skip files that are too large
- `-f "best[height<=720]"` — limit to 720p (sufficient for 1080×1920 vertical video background)

**Parallel downloads fail**: Multiple yt-dlp instances with `--cookies-from-browser chrome` conflict on Chrome's cookie database lock. **Run serially**.

**Search for videos**:
```bash
yt-dlp --cookies-from-browser chrome --flat-playlist \
  --print "%(id)s %(title)s %(duration)s" \
  "https://www.youtube.com/results?search_query=unitree+H1+humanoid+demo"
```

### 2.2 Wikipedia Images (Node.js fetch)

**Root cause of failures**: Wikipedia returns 403 Forbidden without a proper User-Agent header. `curl` and `web_fetch` both fail.

**Working method** (Node.js fetch with UA):
```javascript
fetch('https://upload.wikimedia.org/wikipedia/commons/path/to/image.jpg', {
  headers: { 'User-Agent': 'ChinaAINews/1.0 (contact@china-ai.news)' }
}).then(r => r.arrayBuffer()).then(/* write to file */)
```

**Find image URLs** via Wikipedia REST API:
```bash
curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/Unitree_Robotics" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['originalimage']['source'])"
```

### 2.3 News Images

Google News RSS for finding articles with images:
```bash
curl -s "https://news.google.com/rss/search?q=Unitree+robot+when:7d&hl=en-US" \
  | python3 -c "import xml.etree.ElementTree as ET; ..."
```

**Limitation**: News article images are often behind paywalls or require scraping. Not yet automated.

## 3. Media Integration Architecture

### 3.1 Data Flow

```
content/{slug}/assets/*.mp4|jpg
  ↓ (render-remotion.mjs copies to)
remotion/public/assets/
  ↓ (MediaBackground.tsx loads via staticFile())
<Img> / <Video> with animation
```

### 3.2 Scene-Data Media Field

```javascript
media: {
  type: "video" | "image",
  path: "assets/filename.mp4",  // relative to content dir
  source: "Unitree Robotics",   // attribution
  animation: "fade" | "ken-burns" | "slide" | "zoom" | "none",
  overlay: 0.7,                 // 0-1, dark overlay for text readability
}
```

### 3.3 Animation Presets

Two rendering backends implement the same 5 presets with slightly different timing. The data contract (`MediaField` in `types.ts`) is shared; timing differences are implementation-level.

| Preset | Entrance | Sustained | Exit | Best for |
|--------|----------|-----------|------|----------|
| fade | opacity 0→1 + scale 1.0→1.05 | slow zoom | opacity 1→0 + drift up 30px | General purpose, text-heavy scenes |
| ken-burns | opacity 0→1 (1s) | zoom 1.0→1.12 + pan ±20px | opacity 1→0 | Static images (buildings, photos) |
| slide | slide from right + blur 8px→0 | static | slide out left | Action shots, transitions |
| zoom | scale 1.3→1.0 (easeOutExpo) | static | scale 1.0→1.15 | Dramatic reveals, viral moments |
| none | instant | static | instant | When animation distracts |

**Timing differences between backends** (seconds):

| Preset | Remotion `MediaBackground.tsx` in/out | Playwright `media-bg.mjs` in/out |
|--------|---------------------------------------|--------------------------------|
| fade | 0.8 / 0.6 | 0.8 / 0.5 |
| ken-burns | 1.0 / 0.6 | 0.8 / 0.5 |
| slide | 0.7 / 0.5 | 0.6 / 0.4 |
| zoom | 0.6 / 0.5 | 0.5 / 0.5 |

> **Auto-degrade rule**: `ken-burns` + video → auto-degrades to `fade` (ken-burns is image-only; panning a video frame-by-frame looks janky).

### 3.4 Overlay Strategy

The dark overlay (`rgba(10,10,20,overlay)`) ensures text readability over media. Overlay also fades in/out slightly for smoother transitions:
- **0.8** — heavy overlay (quote scenes, text is the focus) — used in Unitree S6
- **0.75** — ken-burns images (photos need more darkening than video) — used in Unitree S4
- **0.7** — standard (narrative scenes, media visible but text readable) — used in Unitree S2
- **0.6** — light overlay (product demos, media is the focus) — used in Unitree S5
- **0** — no overlay (only when media has no text on top)

### 3.5 When to Use Media vs CSS-Only

**Use media when**:
- Scene shows a product/demo (robot moving, CEO speaking)
- Scene references a physical entity (building, factory)
- Scene needs emotional impact (viral moment, dramatic stat)

**Use CSS-only when**:
- Pure data/stat scenes (big number reveal)
- Abstract concepts (market share, comparison)
- Quote scenes where text is the sole focus (though subtle video can enhance)

## 4. Future Optimizations

### 4.1 Reference Video Extraction — Future Idea

**Priority**: Low — conceptual workflow, no immediate need.

**Goal**: Given a reference TikTok/YouTube video, extract the media placement strategy (what assets, where, what transitions) to inform our own scene-data authoring.

**Existing infrastructure to build on**:
- `competitor-intel.mjs` already scrapes TikTok search results via CDP, extracts video titles/URLs/views — extend it to download and analyze individual videos
- `lib/trend-sources.mjs` has CDP extract scripts for TikTok, Douyin, Bilibili, YouTube — same pattern for search-to-download

**Concrete workflow**:

```bash
# Step 1: Download reference video (same yt-dlp pattern as asset downloads)
yt-dlp --cookies-from-browser chrome \
  -f "best[height<=720][ext=mp4]/best[height<=720]" \
  --max-filesize 50M \
  -o "output/reference-%(id)s.mp4" \
  "https://www.tiktok.com/@creator/video/123456"

# Step 2: Extract keyframes at 1fps
FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
$FFMPEG -i output/reference-123456.mp4 -vf "fps=1" \
  output/reference-frames/frame-%03d.jpg

# Step 3: Analyze each keyframe with vision model
# (agent prompt: for each frame, describe what's on screen —
#  text content, image/video background, layout, color scheme,
#  transition type if detectable from adjacent frames)

# Step 4: Map to our scene-data structure
# Agent outputs a JSON array:
# [{ scene: 1, mediaType: "video", animation: "zoom", overlay: 0.7, ... }]
```

**Implementation notes**:
- For TikTok videos, `yt-dlp` needs `--cookies-from-browser chrome` (same bot detection issue as YouTube) [[memory:17865489336644602134]]
- Keyframe extraction at 1fps gives ~60 frames for a 60s video — sufficient for structural analysis without overwhelming the vision model
- The agent should output a "media strategy report" that maps to our `MediaField` schema, not a freeform description

### 4.2 Visual Engagement Research

**Status**: ✅ Research complete — findings inform scene-data authoring. No pipeline code changes needed.

**Research date**: 2026-08-13 | **Sources**: 6 (Wikipedia, Sprout Social, existing project research, Stack Exchange)

> **Web deep research skill**: Not used for this section. The research was conducted via `web_fetch` (Wikipedia REST API, Sprout Social) + existing project research documents. A full `web-deep-research` skill pass (multi-source cross-validation + citation) was not warranted because: (1) the core questions (sound-off viewing, B-roll function, engagement metrics) are well-covered by existing sources; (2) the remaining open questions require A/B testing with TikTok analytics, not more web research. If deeper validation is needed later (e.g., specific B-roll duration studies), the `web-deep-research` skill can be triggered then.

#### What we already know

From `docs/research/multi-video-splitting-best-practices.md` (15 sources, 2026-08-03) [[memory:17857684585334551883]]:

- **70%+ completion rate** is the 2026 viral threshold (was 50% in 2024) — shorter scenes with media are easier to complete
- **Series content** has 3× higher save rate than standalone videos — media continuity across episodes helps
- **TikTok algorithm rewards session depth** — media that makes viewers watch the next scene is more valuable than media that looks good in isolation
- **TikTok Creator Academy** recommends dynamic visual changes every 2-3 seconds — our 5-8s scenes with animation presets align with this

From `docs/research/short-video-script-writing-best-practices.md` (15+ sources, 2026-08-13):

- **Pattern interrupts** every 10-15 seconds re-engage attention. Media background changes (CSS → video → image → CSS) serve as pattern interrupts
- **Open loops** drive retention between scenes — a teaser in Scene 2 that pays off in Scene 7 keeps viewers watching through media-heavy scenes

From Sprout Social (2026-02-11) [1]:

- **66% of consumers** say short-form video is the most engaging type of social content
- Short-form video is consumed **"often with sound off"** — visual engagement matters more than audio for retention
- Core metrics: video views, average watch time, completion rate, engagement rate, click-through rate, conversions

From Wikipedia [2]:

- B-roll is "supplemental or alternative footage intercut with the main shot" — its function is to provide visual evidence, context, and variety that the main shot (A-roll) cannot

#### Research findings

| Question | Finding | Source | Confidence | Action |
|----------|---------|--------|------------|--------|
| Does media background increase or decrease retention vs text-only? | No direct A/B data found. However: (1) 66% of consumers say short-form video is most engaging format [1]; (2) pattern interrupts (media → CSS → media) re-engage attention every 10-15s [existing research]; (3) B-roll provides visual evidence that text-only cannot. **Hypothesis**: media backgrounds increase retention for product/demo scenes, but may decrease for data/stat scenes where numbers are the focus. | Sprout Social, existing research | Medium — needs A/B test | A/B test: same script, one with media backgrounds, one without. Compare 3-day retention in TikTok analytics |
| Optimal B-roll clip duration in a 60s video? | No specific industry data on B-roll clip length for short-form. Our existing research shows 15-30s videos are easier to complete (70% threshold) [existing research]. Practical guidance: match clip duration to scene duration (5-8s), don't reuse the same clip across multiple scenes. | Existing research | Medium | Test 3s vs 5s vs 8s clips in the same scene position; avoid reusing same clip across >2 scenes |
| Full-screen video vs picture-in-picture vs split screen? | No engagement comparison data found. Current approach (full-screen) is the TikTok norm. PiP could allow showing product demo + data simultaneously but may reduce visual impact. Split screen is common for comparison scenes (we handle these with CSS cards). | — | Low | Prototype PiP in Remotion for comparison/contrast scenes; A/B test engagement |
| What visual elements drive engagement? | Dynamic visual changes every 2-3s (existing research). Animation presets provide entrance/sustained/exit motion. Overlay values calibrated for text readability. Color contrast (amber/blue/red against dark) provides visual hierarchy. | Existing research, codebase | Medium | Correlate TikTok analytics per-scene retention with media type/animation preset |
| Does TikTok viewing happen with sound off? | **Yes** — Sprout Social confirms short-form video is consumed "often with sound off" [1]. This means: (1) captions/subtitles are mandatory; (2) visual engagement matters more than background audio; (3) background video audio is a nice-to-have, not a must. | Sprout Social [1] | High | Ensure subtitles always burned in; don't over-invest in background audio quality |

#### Sources

1. Sprout Social — "Short-Form Video: The Ultimate Guide" (2026-02-11) — `https://sproutsocial.com/insights/short-form-video/`
2. Wikipedia — "B-roll", "TikTok", "Background music", "Audio mixing" — via Wikipedia REST API
3. `docs/research/multi-video-splitting-best-practices.md` — 15 sources, 2026-08-03
4. `docs/research/short-video-script-writing-best-practices.md` — 15+ sources, 2026-08-13

#### Still open (requires A/B testing, not web research)

- Per-scene retention correlation with media type (needs TikTok analytics data from published videos)
- Optimal number of media scenes per 60s video (current: 4/10 for Unitree, 0/10 for others)
- Whether reusing the same clip across multiple scenes (current: `unitree-demo.mp4` × 3) hurts retention

### 4.3 Asset Source Catalog

**Status**: ✅ Research complete. Download commands for YouTube/Wikipedia/News in §2 above.

> **Research date**: 2026-08-13 | **Method**: Web deep research (Chrome CDP + Jina + API testing) | **Sources**: Official API docs, License pages, live API tests

#### Tier 1: Validated in our pipeline

| Source | Type | Access method | Download guide | License | Notes |
|--------|------|---------------|---------------|---------|-------|
| YouTube | Video | `yt-dlp --cookies-from-browser chrome` | §2.1 | Varies by uploader | Official channel uploads, demo videos. Run serially [[memory:17865489336644602134]] |
| Wikipedia (article images) | Image | Node.js `fetch()` with `User-Agent` header | §2.2 | CC-BY-SA / Public Domain | Company buildings, product photos. Find URLs via Wikipedia REST API |
| Google News RSS | Article URLs | `curl` + XML parse | §2.3 | N/A (articles) | Finds articles, but images are often behind paywalls |

#### Tier 2: Researched & verified — ready for integration

**Pexels** — Free stock video & image API [1]

| Field | Detail |
|-------|--------|
| Content | Photos + Videos (HD/4K) |
| API base | `https://api.pexels.com/v1/` (photos), `https://api.pexels.com/v1/videos/` (videos) |
| Auth | `Authorization: YOUR_API_KEY` header (free, instant registration) |
| Rate limit | **200 requests/hour, 20,000 requests/month** (default). Contact api@pexels.com for unlimited free with attribution |
| Photo search | `GET /v1/search?query=robot&orientation=portrait&per_page=15` → returns `src.original`, `src.large`, `src.portrait` (800×1200), etc. |
| Video search | `GET /v1/videos/search?query=robot&orientation=portrait` → returns `video_files[]` with `quality` (sd/hd), `width`, `height`, `link` (direct MP4 URL) |
| Video filters | `orientation`: landscape/portrait/square; `size`: large(4K)/medium(Full HD)/small(HD) |
| Locale | Supports `zh-CN`, `zh-TW`, `ja-JP`, `ko-KR` and 25+ other locales |
| Download | Direct HTTP download from `src.original` (images) or `video_files[].link` (videos). No hotlinking restriction |
| License | Free for commercial and non-commercial use. **Attribution required** ("Photo by [Name] on Pexels" with link) |
| Best for | Generic B-roll (nature, city, technology), abstract backgrounds. Not ideal for specific company/product footage |
| Client libs | Official: Ruby, JavaScript (npm `pexels-javascript`), .NET |
| **Our use case** | Vertical (`orientation=portrait`) videos for TikTok backgrounds; abstract tech footage for data/stat scenes |

**Unsplash** — Free high-quality photo API [2]

| Field | Detail |
|-------|--------|
| Content | Photos only (no videos) |
| API base | `https://api.unsplash.com/` |
| Auth | `Authorization: Client-ID YOUR_ACCESS_KEY` header (free, register app) |
| Rate limit | **Demo mode: 50 req/hour** → apply for Production → **1000 req/hour**. Image requests (images.unsplash.com) do NOT count against limit |
| Photo search | `GET /search/photos?query=robot+building&orientation=portrait&per_page=30` → returns `urls.full` (1920px), `urls.regular` (1080px), `urls.small` (400px) |
| Random photo | `GET /photos/random?query=technology&orientation=portrait` → single random photo |
| Dynamic resize | Image URLs support Imgix params: `?w=800&h=1200&fit=crop` for on-the-fly resize |
| Pagination | Default 10/page, max 30/page. Headers: `X-Per-Page`, `X-Total`, `Link` (first/prev/next/last) |
| Download | `GET /photos/:id/download` → triggers download tracking, returns download URL. Or direct `urls.full` HTTP download |
| License | Free for commercial and non-commercial. **No attribution required** (though appreciated). Cannot sell unmodified images or replicate service |
| **Our use case** | Company buildings, city skylines, product photos. `orientation=portrait` for vertical video backgrounds |
| Limitation | **No video content**. Images only. For video B-roll, use Pexels or Pixabay |

**Pixabay** — Free stock video & image API [3]

| Field | Detail |
|-------|--------|
| Content | Photos + Videos + Illustrations + Vectors |
| API base | `https://pixabay.com/api/` (images), `https://pixabay.com/api/videos/` (videos) |
| Auth | `key` query parameter (free, register account) |
| Rate limit | **100 requests per 60 seconds** (associated with API key, not IP). Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| Image search | `GET /api/?key=KEY&q=robot&image_type=photo&orientation=vertical&min_width=1080` → returns `largeImageURL` (1280px), `fullHDURL` (1920px), `imageURL` (original) |
| Video search | `GET /videos/?key=KEY&q=robot&video_type=film&per_page=10` → returns `videos` array with `large` (1280×720), `medium` (640×360), `small` (320×180) URL |
| Image sizes | `previewURL` (150px), `webformatURL` (640px), `largeImageURL` (1280px), `fullHDURL` (1920px), `imageURL` (original) |
| Filters | `image_type` (photo/illustration/vector), `orientation` (all/horizontal/vertical), `category` (21 categories incl. `science`, `technology`, `business`, `buildings`, `industry`, `computer`), `colors`, `safesearch`, `editors_choice` |
| Lang | Supports `zh` (Chinese), `ja`, `ko` and 20+ other languages |
| Cache | API requires **24-hour caching** of responses. Systematic mass downloads not allowed |
| Download | Direct HTTP from `largeImageURL` / `imageURL` / `video.large.url`. **Permanent hotlinking of images NOT allowed** — must download to server |
| License | Free for commercial and non-commercial. **No attribution required**. Cannot sell standalone content. Trademarks in content may require third-party consent |
| **Our use case** | `orientation=vertical` + `category=technology` for tech B-roll. `zh` language support for Chinese keyword search |

**Wikimedia Commons** — Free media file repository [4]

| Field | Detail |
|-------|--------|
| Content | Images, videos, audio — largest free media repository (100M+ files) |
| API base | `https://commons.wikimedia.org/w/api.php` (MediaWiki API) |
| Auth | **No auth required**. `User-Agent` header recommended per Wikimedia policy |
| Search files | `GET /w/api.php?action=query&list=search&srsearch=Unitree+robot&srnamespace=6&format=json&srlimit=10` → returns `title` (e.g. `File:20260425 Unitree Headquarter 02.jpg`) |
| Get image URL | `GET /w/api.php?action=query&titles=File:FILENAME&prop=imageinfo&iiprop=url|extmetadata&format=json` → returns `url` (direct download), `extmetadata.License` (CC-BY-SA etc.) |
| Categories | Search within categories: `srsearch=incategory:Unitree` |
| Geo search | `GET /w/api.php?action=query&list=geosearch&gscoord=30.2741|120.1551&gsradius=10000&gslimit=10` (photos near GPS coordinates) |
| Download | Direct HTTP from `url` field. **Must include User-Agent** (`ChinaAINews/1.0 (contact@china-ai.news)`) |
| License | Mixed: CC-BY-SA, CC-BY, Public Domain, GFDL. **Must check each file's `extmetadata.LicenseShortName`**. Attribution required for CC-licensed content |
| **Our use case** | Company headquarters, product photos, historical/archival footage. Already validated via Wikipedia article API (same backend). GPS search for location-specific footage |
| API test result | ✅ 2026-08-13: search for "Unitree robot" returned 46 results, imageinfo query returned full URL + metadata + GPS coordinates |

**Coverr** — Free stock video + API [5]

| Field | Detail |
|-------|--------|
| Content | HD & 4K video clips, stock music, AI tools |
| API base | `https://api.coverr.co/` (OpenAPI 3.0 spec at `https://coverr.co/api`) |
| Endpoints | `GET /search_videos?query=QUERY`, `GET /videos` (latest), `GET /videos/{id}` (details), `GET /videos/filters?is_vertical=true` (vertical only) |
| Video download | `GET /storage/videos/{base_filename}` → returns signed Google Cloud Storage URL (valid 15 minutes) |
| Video object | `id`, `title`, `description`, `base_filename`, `is_vertical`, `full_image_path` (thumbnail), `duration`, `views`, `likes`, `downloads` |
| Auth | Not specified in OpenAPI spec — appears to be open API |
| Download | Via signed GCS URL (15-min validity). Must download promptly |
| License | Free for personal and commercial use. **No attribution required**. No sign-up needed |
| **Our use case** | `is_vertical=true` filter for TikTok-format clips. Free, no API key needed — lowest barrier to entry |

**Mixkit** — Free stock video (no API) [6]

| Field | Detail |
|-------|--------|
| Content | HD & 4K video clips, stock music, sound effects, video templates |
| Owner | Envato (same company as Envato Elements) |
| Access | **No API** — web browsing only. Direct download from website |
| Download | `curl` or CDP scraping. Browse categories: nature, people, business, technology, aerial, etc. |
| Vertical content | Has dedicated vertical video section: `https://mixkit.co/free-vertical-videos/` |
| License | Free for commercial use. **No attribution required, no watermark**. Part of Envato ecosystem |
| **Our use case** | Manual browsing for B-roll. Could use CDP to scrape search results and download. `https://mixkit.co/free-stock-video/` + `https://mixkit.co/free-vertical-videos/` |
| Limitation | No programmatic API — requires CDP scraping for automation |

**Internet Archive** — Public domain video & image [7]

| Field | Detail |
|-------|--------|
| Content | Millions of items: videos, images, books, audio, software |
| API base | `https://archive.org/advancedsearch.php` (search) + `https://archive.org/metadata/{identifier}` (item details) |
| Search | `GET /advancedsearch.php?q=collection:(movies)+AND+(robot+OR+unitree)&fl[]=identifier&fl[]=title&fl[]=mediatype&rows=10&output=json` |
| Item metadata | `GET /metadata/{identifier}` → returns `files` array with download URLs, `metadata` (license, description, date) |
| Auth | No auth for search and download. Upload/modify requires `S3` API keys |
| Download | Direct HTTP from `https://archive.org/download/{identifier}/{filename}` |
| License | Public domain, CC-licensed, or various. Must check each item's `metadata.licenseurl` |
| **Our use case** | Historical footage, news clips, public domain archival content. Not for current product/company footage |
| API test result | ✅ 2026-08-13: search `collection:(movies) AND (unitree OR robot)` returned 5 results. JSON API fully functional |
| Limitation | Content is mostly old/archival — not useful for current AI/tech company news |

**Flickr** — Creative Commons photo search [8]

| Field | Detail |
|-------|--------|
| Content | User-generated photos (billions). Videos also available but less common |
| API base | `https://api.flickr.com/services/rest/` (REST) or `https://api.flickr.com/services/rest/?method=flickr.photos.search` |
| Auth | `api_key` query parameter (free, register app at `flickr.com/services/api/`) |
| Photo search | `GET /services/rest/?method=flickr.photos.search&api_key=KEY&text=unitree+robot&license=4,5,7,9,10&per_page=10&format=json&nojsoncallback=1` |
| **License filter** | `license` parameter accepts comma-separated IDs: `4` (CC BY 2.0), `5` (CC BY-SA 2.0), `7` (No known copyright), `9` (CC0), `10` (Public Domain Mark), `11` (CC BY 4.0), `12` (CC BY-SA 4.0). **Avoid `1,2,3` (NC/ND licenses)** |
| Photo URL | Construct from API response: `https://farm{farm}.staticflickr.com/{server}/{id}_{secret}_b.jpg` (1024px) or `_o.jpg` (original) |
| Geo search | `bbox` parameter for bounding box search (min_lon, min_lat, max_lon, max_lat) |
| Sort | `relevance`, `date-posted-desc`, `interestingness-desc` |
| Download | Direct HTTP from constructed URL. No hotlinking restriction stated |
| License | Mixed — must filter by `license` parameter. Use `4,5,9,10,11,12` for commercial-safe CC licenses |
| **Our use case** | Real-world photos of companies/products that stock sites don't cover. Community photos from events, conferences, product launches |
| API test result | ✅ 2026-08-13: `flickr.photos.licenses.getInfo` returned 17 license types. `flickr.photos.search` documented with full parameter list |

#### Tier 3: Chinese news & media sites — CDP-scraped, image extraction verified

> **Why Chinese sources matter**: We report on China AI news. Stock footage sites (Pexels/Unsplash/Pixabay) don't cover specific Chinese companies, products, or events. Chinese news sites have real product photos, CEO photos, event coverage, and tech imagery that stock sites lack.

> **Anti-crawler assessment**: Chinese news sites are generally **less aggressive** on bot detection than Western platforms (no Cloudflare bot management, no CAPTCHA on most). CDP with login state is sufficient for most. Login-required sites (Douyin, Xiaohongshu) need active Chrome session.

**Xinhua (新华网)** — Official state news agency [9]

| Field | Detail |
|-------|--------|
| Content | News articles with high-quality images (92+ images per page), some video |
| URL | `https://www.news.cn/` (homepage), `https://www.news.cn/tech/` (tech section) |
| Image extraction | ✅ **Verified 2026-08-13**: CDP `document.querySelectorAll('img')` returned 92 images, 8+ with width > 200px. Image URLs follow pattern: `https://www.news.cn/20260813/{hash}/{hash}.jpg` — directly downloadable via HTTP |
| Video | No `<video>` elements on homepage. Article pages may contain embedded video players (needs per-article check) |
| Auth | None — fully public |
| Anti-crawler | None detected. Standard HTTP headers sufficient |
| License | ⚠️ Xinhua copyrighted content. Images are for editorial/news use. **Attribution required** ("Source: Xinhua") |
| **Our use case** | Official photos of AI events (WAIC, conferences), government tech policy images, company photos from official events. Search tech section: `https://www.news.cn/tech/` |
| CDP test | ✅ 2026-08-13: Page loaded successfully, 92 images extracted, tech section has AI-related articles (e.g. "物理AI：从WAIC展台，奔赴真实产业战场") |

**CCTV (央视网)** — State TV broadcaster [10]

| Field | Detail |
|-------|--------|
| Content | Video clips (news, documentaries), live streams, 308+ images per page |
| URL | `https://www.cctv.com/` (homepage), `https://v.cctv.com/` (video section), `https://news.cctv.com/` (news) |
| Image extraction | ✅ **Verified 2026-08-13**: 308 images extracted. Video thumbnails available as poster images |
| Video extraction | ⚠️ Homepage uses `<video>` with `blob:` URL (MSE streaming). Video section (`v.cctv.com`) may have direct MP4 links. Needs deeper CDP analysis — navigate to specific video page, inspect `<source>` or network requests |
| Auth | None — fully public |
| Anti-crawler | None detected |
| License | ⚠️ CCTV copyrighted. Video clips are for editorial/reference use only |
| **Our use case** | News video clips of AI events, product launches, tech demonstrations. Video URL extraction needs network-level CDP analysis (intercept media requests) |
| CDP test | ✅ 2026-08-13: Page loaded, 1 `<video>` element found (blob URL), 308 images extracted. Video download requires further work — likely needs `yt-dlp` or network interception |
| `yt-dlp` support | `yt-dlp` supports CCTV — can download video clips directly from `cctv.com` URLs |

**IT之家 (iThome)** — Chinese tech news [11]

| Field | Detail |
|-------|--------|
| Content | Tech news articles with product photos, screenshots |
| URL | `https://www.ithome.com/` (homepage), `https://www.ithome.com/ai/` (AI section) |
| Image extraction | ✅ **Verified 2026-08-13**: 8 high-quality images extracted, URLs: `https://img.ithome.com/newsuploadfiles/focus/{uuid}.jpg`. Images directly downloadable via HTTP |
| Auth | None |
| Anti-crawler | None detected. Baidu CDN serves images (`x-bce-process` param for format conversion) |
| License | ⚠️ iThome copyrighted. Editorial use with attribution |
| **Our use case** | Best source for Chinese AI product news images — DeepSeek, Qwen, Unitree, Xiaomi, etc. Already in `trend-sources.mjs` for trend discovery |
| Existing code | `trend-sources.mjs` → `NEWS_SOURCES` → `ithome` — CDP extract script exists for article titles/URLs. Can extend to also extract article images |

**机器之心** — Chinese AI news [12]

| Field | Detail |
|-------|--------|
| Content | AI-focused articles with cover images, product photos |
| URL | `https://www.jiqizhixin.com/` |
| Image extraction | ✅ **Verified 2026-08-13**: 8 images extracted, URLs: `https://image.jiqizhixin.com/uploads/article/cover_image/{uuid}/{filename}.jpg?imageView2/1/w/243/h/162` — directly downloadable. Remove `?imageView2/...` params for original size |
| Auth | None |
| Anti-crawler | None detected |
| License | ⚠️ 机器之心 copyrighted. Editorial use with attribution |
| **Our use case** | AI-specific cover images — best source for Chinese AI company news. Already in `trend-sources.mjs` |
| Existing code | `trend-sources.mjs` → `NEWS_SOURCES` → `jiqizhixin` — CDP extract script exists |

**澎湃新闻 (The Paper)** — Mainstream news with video section [13]

| Field | Detail |
|-------|--------|
| Content | News articles, has dedicated video section ("视频") |
| URL | `https://www.thepaper.cn/` |
| Image extraction | ✅ **Verified 2026-08-13**: 51 images on homepage. No `<video>` elements on homepage (video section loads dynamically) |
| Auth | None |
| Anti-crawler | None detected |
| License | ⚠️ 澎湃新闻 (上海东方报业) copyrighted |
| **Our use case** | News images for AI policy, industry developments. Video section needs separate CDP navigation |

**Other Chinese news sources already in `trend-sources.mjs`** (CDP search verified, image extraction not yet tested):

| Source | URL | needsAuth | Image extraction | Notes |
|--------|-----|-----------|-----------------|-------|
| 量子位 (qbitai) | `https://www.qbitai.com/` | false | Not tested | AI-focused media, likely has product photos |
| 36氪 (36kr) | `https://36kr.com/` | false | Not tested | Tech/business news, stock photos |
| 观察者网 (guancha) | `https://www.guancha.cn/` | false | Not tested | General news, may have tech section images |

#### Tier 4: Chinese video platforms — CDP-based, high friction

| Source | Type | Access method | Code location | Download tested | Notes |
|--------|------|---------------|-------------|-----------------|-------|
| Bilibili (B站) | Video | `yt-dlp` (native support) or CDP | `lib/trend-sources.mjs` (search only) | ❌ Not yet | CDP search extract exists. `yt-dlp` supports B站 natively — highest probability of working |
| Douyin (抖音) | Video | CDP + download | `lib/trend-sources.mjs` (search only) | ❌ Not yet | `needsAuth: true` — requires login. MCP fallback to `douyin_mcp`. Most friction |
| Xiaohongshu (小红书) | Image/Video | CDP + MCP fallback | `lib/trend-sources.mjs` (search only) | ❌ Not yet | `needsAuth: true`. MCP fallback to `xiaohongshu_mcp_server`. Good for product photos |
| 搜狗微信 (sogou_weixin) | Article URLs | CDP + MCP fallback | `lib/trend-sources.mjs` (search only) | ❌ Not yet | Searches WeChat public account articles. May have images but URLs redirect to `mp.weixin.qq.com` |

> **TikTok excluded**: We produce TikTok content — scraping TikTok for assets is not appropriate. TikTok is our distribution platform, not a source platform. The `competitor-intel.mjs` script exists for competitive analysis (search only), not for asset download.

#### Not recommended

| Source | Why |
|--------|-----|
| Google Images | Copyright issues, bot detection, no reliable download method |
| News article images directly | Behind paywalls or JS-rendered pages. Use Google News RSS to find articles, then CDP for image extraction |
| Videvo (videvo.net) | Redirected to Magnific/Freepik. Brand merged. No longer an independent source |
| Mazwai (mazwai.com) | Redirected to Magnific/Freepik. Brand merged. No longer an independent source |
| Videezy (videezy.com) | Still active (Eezy LLC) but mixed free/Pro content. Free selection limited compared to Pexels/Pixabay |

#### Integration priority & recommended approach

> **None of the 4 phases are implemented yet.** All phases are research-complete; `asset-sourcer.mjs` does not exist. The phases below are the recommended implementation order when development begins.

**Phase 1 — Quick wins (no API key needed, no auth):**
1. **Coverr API** — No auth required, vertical filter, free commercial use. Lowest barrier.
2. **Wikimedia Commons** — Already partially validated (Wikipedia article images). Extend to full Commons search.
3. **Chinese news sites (image extraction)** — Xinhua, iThome, 机器之心, 澎湃新闻: all verified ✅, no auth, no anti-crawler. CDP extract scripts already exist in `trend-sources.mjs`. **Highest ROI for China AI news content** — these are the only sources with real photos of Chinese AI companies/products.

**Phase 2 — API key registration (store in `.env.local`):**
4. **Pexels API** — Best stock video quality + search. 200 req/hour. `orientation=portrait` for vertical.
5. **Pixabay API** — 100 req/60s, supports `zh` language. Good for Chinese keyword search.
6. **Unsplash API** — Images only but highest quality. 50→1000 req/hour after Production approval.

**Phase 3 — Complex integration:**
7. **Flickr API** — License filter critical (`license=4,5,9,10,11,12` for commercial-safe). Good for niche product photos.
8. **Mixkit** — CDP scraping needed (no API). Browse `free-vertical-videos` section.
9. **Internet Archive** — Search API works, but content is archival. Low priority for current news.

**Phase 4 — Chinese video platforms (CDP-based, high friction):**
10. **Bilibili** — `yt-dlp` native support. CDP search already exists. **Best candidate for Chinese video content** — `yt-dlp` handles it directly.
11. **CCTV** — `yt-dlp` supports CCTV. Video URL extraction needs network-level CDP analysis. Good for official event footage.
12. **Douyin** — Requires login session. CDP search exists, download not tested.
13. **Xiaohongshu** — Requires login. MCP fallback available. Good for product photos.

> **TikTok excluded**: TikTok is our distribution platform, not a source. The `competitor-intel.mjs` script is for competitive analysis only, not asset download.

#### Download method patterns (for `asset-sourcer.mjs`)

| Pattern | Sources | Implementation |
|---------|---------|----------------|
| API search + HTTP download | Pexels, Unsplash, Pixabay, Flickr | `fetch()` with API key header → parse JSON → `fetch()` download URL → write file |
| Direct API + signed URL | Coverr | `fetch()` search → get `base_filename` → `GET /storage/videos/{base_filename}` → download signed URL (15-min validity) |
| MediaWiki API + HTTP download | Wikimedia Commons | `fetch()` API search → get `imageinfo.url` → `fetch()` with `User-Agent` → write file |
| Web scraping + HTTP download | Mixkit | CDP browse → extract video URL from DOM → `fetch()` download |
| yt-dlp | YouTube, Bilibili, CCTV | `yt-dlp --cookies-from-browser chrome -f "best[height<=720]" --download-sections "*0:00-0:08" --max-filesize 20M` |
| CDP + download | Douyin, Xiaohongshu | `lib/cdp-client.mjs` → extract URL → `fetch()` with login cookies |
| Internet Archive API | archive.org | `fetch()` advancedsearch → `fetch()` metadata → `fetch()` download URL |

#### API key management

Store all API keys in `.env.local` (not in Git):
```
PEXELS_API_KEY=...
UNSPLASH_ACCESS_KEY=...
PIXABAY_API_KEY=...
FLICKR_API_KEY=...
```
No key needed for: Coverr, Wikimedia Commons, Internet Archive, Mixkit (scraping).

#### Sources

1. Pexels — "Pexels API Documentation" — `https://www.pexels.com/api/documentation/` — Tier 1 (official)
2. Unsplash — "Unsplash API Documentation" — `https://unsplash.com/documentation` — Tier 1 (official)
3. Pixabay — "Pixabay API Documentation" — `https://pixabay.com/api/docs/` — Tier 1 (official)
4. Wikimedia Commons — "MediaWiki API" — `https://commons.wikimedia.org/w/api.php` — Tier 1 (official, live test)
5. Coverr — "Coverr API" (OpenAPI 3.0 spec) — `https://coverr.co/api` — Tier 1 (official)
6. Mixkit (Envato) — `https://mixkit.co/free-stock-video/` — Tier 1 (official, CDP extraction)
7. Internet Archive — "Developer Portal" — `https://archive.org/developers/` — Tier 1 (official, live test)
8. Flickr — "Flickr API: flickr.photos.search" — `https://www.flickr.com/services/api/flickr.photos.search.html` — Tier 1 (official)

### 4.4 Automated Asset Pipeline

**Status**: ✅ **Implemented** (commit 1198685 + 1501c69). `asset-sourcer.mjs` — 1218 lines, 90 tests.

**What it does**: Receives scene-data → searches 10 sources (Pexels, Unsplash, Wikimedia, Coverr, Pixabay, YouTube, Bilibili, IT之家, 机器之心, 新华网, 澎湃新闻, etc.) → scores candidates → downloads top matches → outputs JSON report with scene recommendations + attribution.

**What it does NOT do**: Auto-modify `scene-data.mjs`. User reviews the JSON report and manually fills the `media` field. This is by design — human-in-the-loop for media selection.

**Usage**:
```bash
node scripts/short-video/lib/asset-sourcer.mjs --content unitree
```

**Remaining gap**: The `media` field assignment is still manual. Future enhancement: auto-fill `media` field in scene-data with review checkpoint.

**Integration points** (where this plugs into existing code):

```
main.mjs pipeline flow:
  Step 0: verify-video.mjs --pre        ← (NEW) pre-asset check: warn if scenes lack media
  Step 1: TTS generation
  Step 2: Scene HTML/Remotion generation  ← media field already consumed here
  Step 3: Render
  Step 4: Post-process

NEW: scripts/short-video/lib/asset-sourcer.mjs  ← standalone module
  Input:  scene-data.mjs (voiceover texts + meta.keyEntities)
  Output: content/{slug}/assets/ directory with downloaded files
  Trigger: manual `node asset-sourcer.mjs --content unitree` or
           automatic in main.mjs Step 0b (before TTS)
```

**Pipeline design** (orchestration only — source-specific methods in §4.3):

1. **Extract keywords** from scene-data: `meta.keyEntities.companies[0]`, product names, action verbs from `voiceover` text.
2. **Search sources** — use the access methods cataloged in §4.3 (no need to duplicate here).
3. **Score candidates**: relevance (keyword match in title), duration (3-8s ideal for clip extraction), file size (< 20MB), resolution (≥ 720p)
4. **Download top candidates** to `content/{slug}/assets/`:
   - **Serial downloads only** — parallel yt-dlp instances conflict on Chrome cookie DB lock
   - Attribution required — `media.source` field must be filled for copyright compliance
5. **Auto-assign to scenes**: match scene `voiceover` keywords to asset metadata. Assign `animation` preset based on scene `visualType`:
   - `narrative` → `fade` or `zoom` (product demos)
   - `info-card` → `ken-burns` (static images, buildings/photos)
   - `quote` → `fade` with `overlay: 0.8` (text is the focus)
   - `data` / `stat-reveal` → no media (CSS-only is better for big numbers)
   - `hook` / `cta` → no media (shared templates ignore media field)
6. **Render**: existing pipeline handles the rest — `render-remotion.mjs` copies assets, `MediaBackground.tsx` renders with animation

**Design constraints**:
- **Never assign media to hook or CTA scenes** — `hookScene()` and `ctaScene()` delegate to shared templates that ignore the `media` field
- **Never use `ken-burns` with video** — auto-degrades to `fade` in `MediaBackground.tsx`, but better to assign correctly upstream
- **Deduplicate across content** — see §4.5

### 4.5 Asset Deduplication & Shared Library — Implemented (2026-08-14)

**Status**: ✅ Directory reorganization complete. See `docs/media-asset-management.md` for the authoritative structure.

**What was done**:
- `assets/` cleaned to only contain **global shared production assets**: `brand/` (logos, marks), `logos/` (company logo registry), `bgm/` (background music).
- `voice-samples/` created for TTS reference audio (personal, gitignored, binary).
- `experiments/` created for disposable experiment outputs (gitignored).
- Removed duplicate copies of content-specific assets from `assets/` (they already exist in `content/{slug}/assets/`).
- Updated TTS engine code (`cosyvoice.mjs`, `qwen-tts.mjs`, `f5-mlx.mjs`, `csm.mjs`) to reference `voice-samples/` instead of `assets/`.
- Updated `.gitignore` to reflect new paths.

**Current structure**:
```
scripts/short-video/
  ├── assets/                    ← Global shared production assets (Git-tracked)
  │   ├── brand/                 ← Brand visual assets
  │   ├── logos/                 ← Company logo registry
  │   └── bgm/                   ← Background music library
  ├── voice-samples/             ← TTS reference audio (Git-ignored)
  ├── experiments/               ← Disposable experiment outputs (Git-ignored)
  └── content/{slug}/assets/    ← Per-content media
```

**Future: SHA-256 dedup**: When the shared library grows to 20+ assets, implement content hashing → symlink instead of copy. Low priority — only needed when producing 3+ videos per week with overlapping entities.

### 4.6 Background Audio Mixing Research

**Status**: ✅ Research complete → 🟡 Partially applied. Current `volume={0.08}` validated as correct (no change needed). Per-scene `volume` field and envelope ducking are **proposed but not yet implemented** — see "Implementation" subsections below.

**Research date**: 2026-08-13 | **Sources**: 5 (Wikipedia, EBU R128 standard, Sprout Social, existing project research, codebase analysis)

#### Current setting

`<Video volume={0.08} />` in `MediaBackground.tsx` — background video audio at 8% of original volume.

**Why not muted**: Background clips from YouTube carry atmospheric audio (robot motor sounds, footsteps, crowd noise) that adds realism. Complete silence alongside a narrated video feels unnatural.

**Why not louder**: TTS voiceover is the primary audio track. Any background audio competing with it reduces comprehension, especially for non-native English speakers watching with subtitles.

#### Research findings

**1. Industry standard for background music relative to narration**

| Standard | Level | Source | Applicability |
|----------|-------|--------|---------------|
| Film/TV background score | -20dB to -25dB relative to dialogue | Industry convention [1] | High — same principle applies |
| EBU R128 (European broadcast) | -23 LUFS integrated loudness | EBU R128 (2010, rev. 2020) [2] | Medium — broadcast standard, short-form may differ |
| Podcast background music | -16dB to -20dB relative to host voice | Podcast production convention [1] | High — similar format (voice + background) |
| Our current setting | `volume={0.08}` ≈ -22dB | Codebase | — |

**Analysis**: Our `volume={0.08}` setting corresponds to approximately -22dB attenuation (20×log₁₀(0.08) ≈ -22dB). This falls within the industry standard range of -20dB to -25dB for background audio relative to primary narration. **The current setting is well-calibrated and does not need adjustment.**

**2. Volume ducking / sidechain compression**

From Wikipedia [3]: Dynamic range compression "reduces the volume of loud sounds or amplifies quiet sounds, thus compressing an audio signal's dynamic range." Sidechain compression (ducking) uses one signal to control the volume of another — standard in podcast production where the host voice automatically ducks the background music.

| Approach | Complexity | Benefit | Remotion support |
|----------|-----------|---------|------------------|
| Static volume (current) | None | None | `volume={0.08}` ✅ |
| Envelope ducking | Low — fade in/out with scene | Smoother transitions | `interpolate()` per-frame ✅ |
| Sidechain compression | High — needs TTS audio envelope | Automatic ducking when voice speaks | Not built-in; would need custom audio processing |
| Per-scene volume | Low — `media.volume` field | Action scenes louder, narrated scenes quieter | Would need `MediaField` extension |

**Recommendation**: Start with **envelope ducking** (low complexity, high ROI). Per-scene volume as a quick win via `media.volume` field. Sidechain compression is overkill for short-form video where most viewing is sound-off.

**3. TikTok sound-off viewing**

From Sprout Social (2026-02-11) [4]: Short-form video is consumed **"often with sound off"** — viewers rely on captions/subtitles.

**Implication**: Background video audio is a **nice-to-have, not a must-have**. The primary value of background video is **visual**, not audio. This means:
- Don't over-invest in audio quality of B-roll clips
- Subtitles must always be burned in (our pipeline does this via `burnSubtitles` in `post-process.mjs`)
- The 8% volume setting is a reasonable ambiance level — lower is unnecessary, higher risks competing with TTS for the subset of viewers who do have sound on

**4. Per-scene volume adjustment**

| Scene type | Background audio content | Recommended volume | Rationale |
|------------|----------------0---------|---------------------|-----------|
| Product demo (robot moving) | Motor sounds, mechanical noise — adds realism | 0.10-0.12 | Sound is diegetic and informative |
| Company overview (narrated clip) | Someone talking over the clip — conflicts with TTS | 0.03-0.05 | Redundant narration, minimal value |
| Building/landmark (image) | No audio (images are silent) | N/A | Images have no audio track |
| Crowd/event footage | Ambient noise, crowd murmur | 0.08 (current) | Adds atmosphere without competing |

**Proposed implementation** (NOT YET IN CODE — no spec/ticket created):

1. **Per-scene volume**: Add `volume?: number` to `MediaField` in `types.ts`. In `MediaBackground.tsx`, replace `volume={0.08}` with `volume={media.volume ?? 0.08}`.

2. **Envelope ducking**: Multiply volume by the same `interpolate()` envelope used for opacity:
```typescript
const baseVolume = media.volume ?? 0.08;
const videoVolume = baseVolume * interpolate(
  frame, [0, inFrames, outStart, totalFrames], [0, 1, 1, 0], clamp
);
// <Video src={src} style={mediaStyle} volume={videoVolume} />
```

**Current code**: `types.ts` has NO `volume` field; `MediaBackground.tsx` has `volume={0.08}` hardcoded.

#### Sources

1. Industry convention — Film/TV scoring and podcast production practice (background music -20 to -25dB below dialogue)
2. EBU R128 — "Loudness normalisation and maximum level of audio signals" (European Broadcasting Union, 2010, rev. 2020) — Wikipedia REST API
3. Wikipedia — "Dynamic range compression", "Audio mixing", "Background music" — via REST API
4. Sprout Social — "Short-Form Video: The Ultimate Guide" (2026-02-11)
5. Codebase analysis — `MediaBackground.tsx`, `post-process.mjs`, `types.ts`

### 4.7 BGM (Background Music) — Deprecated

**Status**: ⚠️ Deprecated. Pipeline BGM was fully implemented but user has stopped using it — adds TikTok music manually at upload time.

> **User workflow**: At TikTok upload time, user manually selects a full track from TikTok's music library ("全景 Music"). TikTok auto-trims the track to video length. The pipeline does NOT need to handle BGM — this is a manual in-app operation.
>
> **Code retained**: `lib/bgm.mjs` + `mixBgm()` still exist in the codebase. `--bgm` flag works if ever needed again. Not recommended for new videos.

**Pipeline BGM components** (all implemented):

| Component | File | Function |
|-----------|------|----------|
| BGM pool | `scripts/short-video/assets/bgm/` | 14 MP3 files (9 auto-selectable, 5 manual-only) |
| Auto-selection | `lib/bgm.mjs` → `selectBGM()` | Filters by instant-start + news-themed, deterministic FNV-1a hash pick |
| Mixing | `lib/post-process.mjs` → `mixBgm()` | FFmpeg `amix`, 0.1s fade-in, 3s fade-out, infinite loop, 12% volume |
| Procedural fallback | `lib/generate-bgm.mjs` → `generateBGM()` | FFmpeg sine wave synthesis (cyber-ambient), used when no MP3 pool exists |
| Attribution | `remotion/public/assets/bgm/ATTRIBUTION.md` | CC-BY / royalty-free track registry |

**BGM selection logic** (`lib/bgm.mjs`):
1. Scan `assets/bgm/*.mp3` → analyze each with `ffprobe` + `volumedetect`
2. Filter: instant-start (first 0.5s mean volume > -35dB) + news-themed (filename contains "news"/"breaking"/"urgent")
3. Deterministic pick: `FNV-1a hash(pipelineId) % candidates.length`
4. Override: `--bgm-file <path>` forces a specific track

**BGM mixing** (`mixBgm()` in `post-process.mjs`):
- Volume: 12% (≈ -18dB) — slightly louder than background video audio (8%) because BGM is full-track music, not atmospheric noise
- Fade-in: 0.1s (instant start, matches the instant-start filter)
- Fade-out: last 3s of video
- Loop: `-stream_loop -1` (infinite loop, stopped by `amix duration=first`)
- Loudness normalization: applied after BGM mixing (EBU R128 -16 LUFS)

**TrimmedMuse**: N/A in pipeline. The user's "TrimmedMuse" workflow is:
- Pipeline outputs a video with TTS voiceover + optional low-volume BGM
- At TikTok upload time, user manually selects a full track from TikTok's music library
- The pipeline does not trim, select, or process TikTok library music — this is a manual in-app step
- No code changes needed for this; it's already the correct separation of concerns

## 5. Design Decisions & References

- **yt-dlp cookies requirement**: Discovered 2026-08-13, verified with `--verbose` output showing `LOGIN_REQUIRED` without cookies, success with `--cookies-from-browser chrome` [[memory:17865489336644602134]]
- **Wikipedia 403**: Wikipedia's servers reject requests without a User-Agent header per their [API etiquette policy](https://meta.wikimedia.org/wiki/User-Agent_policy)
- **Parallel yt-dlp conflict**: Chrome's cookie database (`~/Library/Application Support/Google/Chrome/Default/Cookies`) uses SQLite with a lock; multiple yt-dlp instances reading it simultaneously can fail
- **Remotion media path resolution**: `staticFile()` resolves relative to `remotion/public/`, so content assets must be copied there before rendering (handled by `render-remotion.mjs` step 2b)
- **Overlay values**: Calibrated by testing text readability over various video/image backgrounds at 1080×1920 resolution. Values: 0.6 (light), 0.7 (standard), 0.75 (images), 0.8 (heavy/text-focus)
- **Background video audio at 8% volume**: `<Video volume={0.08} />` in `MediaBackground.tsx` (hardcoded, no per-scene control). Research (2026-08-13, §4.6) confirmed this ≈ -22dB falls within industry standard of -20dB to -25dB for background audio relative to narration. **Validated — no adjustment needed.** Future enhancement (NOT YET IMPLEMENTED): per-scene `volume` field via `MediaField` extension, and envelope ducking via `interpolate()` for smoother fade in/out.
- **BGM (background music) — deprecated**: `mixBgm()` in `post-process.mjs` (default `volume=0.12`) was fully implemented but is no longer recommended. User adds TikTok library music manually at upload time. Code retained; `--bgm` flag works if ever needed again. See §4.7.
- **ken-burns + video auto-degrade**: Ken-burns is designed for static images (slow zoom + pan). Applied to video, the per-frame interpolation creates janky stutter. `MediaBackground.tsx` auto-degrades to `fade`; `media-bg.mjs` `validateMedia()` issues a warning.
- **Playwright vs Remotion timing divergence**: The two backends evolved independently. Playwright (`media-bg.mjs`) uses CSS `@keyframes` with percentage-based timing; Remotion (`MediaBackground.tsx`) uses `interpolate()` with frame-based timing. The data contract (`MediaField`) is shared; timing is implementation-level. Unifying timing is a future cleanup task.
- **5 presets, not more**: Adding presets (e.g., `parallax`, `shake`, `glitch`) is technically easy but increases the testing surface. Current 5 presets cover all use cases encountered in 6+ content pieces. Add new presets only when a real content need cannot be met by existing ones.

## 6. License & Attribution Requirements (2026-08-14)

> **Pipeline integration**: `asset-sourcer.mjs` must enforce these requirements by recording attribution data in `output/asset-report.json` for each downloaded asset. When an asset is used in a video, the attribution must be displayed in the video description or as an on-screen credit.

### 6.1 Summary Table

| Source | License | Attribution Required? | How to Attribute | Logo/Watermark Required? |
|--------|---------|----------------------|------------------|------------------------|
| **Pexels** | Pexels License (free) | Optional but appreciated | "Photo by [author] on Pexels" | No logo required |
| **Unsplash** | Unsplash License (free) | Optional but appreciated | "Photo by [author] on Unsplash" | No logo required |
| **Pixabay** | Pixabay Content License (free) | **Yes — required by API terms** | "Source: Pixabay" or link to pixabay.com | **Yes — if API is used, must show Pixabay logo to users where search results are displayed** |
| **Wikimedia Commons** | Varies (CC-BY, CC-BY-SA, PD) | **Yes — required for CC-licensed content** | "Author: [name], via Wikimedia Commons, CC-BY-SA 4.0" | No logo, but license text required |
| **Coverr** | Coverr License (free) | Optional | "Video from Coverr" | No logo required |
| **YouTube (via yt-dlp)** | Varies (creator's copyright) | **Yes — required** | "Contains footage from [channel name], YouTube" | No logo, but credit required |
| **B站 (via yt-dlp)** | Varies (creator's copyright) | **Yes — required** | "Contains footage from [UP主 name], B站" | No logo, but credit required |
| **IT之家 / 机器之心 / 新华网 / 澎湃新闻** | News site copyright | **Yes — required** | "Image source: [site name]" | No logo, but credit required |

### 6.2 Detailed Requirements

#### Pixabay (API terms)
- **API usage requirement**: "If you make use of the API, show your users where the images and videos are from, whenever search results are displayed."
- **Rate limit**: 100 requests per 60 seconds (per API key)
- **Hotlinking**: Not allowed for permanent use. Must download to own server.
- **Caching**: API responses must be cached for 24 hours
- **Action for pipeline**: When Pixabay assets are used in a video, include "Source: Pixabay" in the TikTok video description. If displaying search results in a UI, show Pixabay logo.

#### Pexels (Pexels License)
- Free for commercial and non-commercial use
- Attribution not required but appreciated
- No permission needed, though credit is appreciated: "Photo by [Author Name] from Pexels"
- Cannot redistribute or sell the photos as-is
- **Action for pipeline**: Add "Photo by [author] from Pexels" to video description when used

#### Unsplash (Unsplash License)
- Free for commercial and non-commercial use
- Attribution not required but appreciated
- No permission needed, though credit is appreciated: "Photo by [Author Name] on Unsplash"
- Cannot compile photos from Unsplash to replicate a similar or competing service
- **Action for pipeline**: Add "Photo by [author] on Unsplash" to video description when used

#### Wikimedia Commons (CC licenses)
- Each file has its own license (CC-BY, CC-BY-SA, Public Domain, etc.)
- **Must check individual file license** before use
- CC-BY requires attribution: "Author: [name], via Wikimedia Commons, [license name]"
- CC-BY-SA requires attribution + share-alike (derivative works must use same license)
- Public Domain: no attribution required
- **Action for pipeline**: Record license type per asset. For CC-BY/CC-BY-SA, include attribution in video description

#### Coverr (Coverr License)
- Free for commercial and non-commercial use
- Attribution appreciated but not required
- Cannot redistribute or sell videos as-is
- **Action for pipeline**: Optional "Video from Coverr" in description

#### YouTube / B站 (Creator copyright)
- Downloading via yt-dlp does not grant copyright
- Fair use may apply for short clips with commentary/transformative use
- **Must credit original creator** in video description
- For TikTok, short clips with commentary typically fall under fair use
- **Action for pipeline**: Record channel/UP主 name, include "Contains footage from [creator] [platform]" in description

#### Chinese News Sites (CDP extraction)
- Images extracted from news sites are owned by the news organization
- Fair use for commentary/news reporting
- **Must credit source**: "Image source: IT之家" or "图片来源: 机器之心"
- **Action for pipeline**: Record source site name, include in video description

### 6.3 Pipeline Enforcement Plan

`asset-sourcer.mjs` must be updated to:
1. Record `attribution` field per asset in `output/asset-report.json`:
   ```json
   {
     "attribution": {
       "text": "Photo by John Doe on Pexels",
       "source": "pexels",
       "author": "John Doe",
       "license": "Pexels License",
       "url": "https://www.pexels.com/photo/...",
       "logoRequired": false
     }
   }
   ```
2. Generate a **Credits section** at the bottom of the report for easy copy-paste into TikTok description
3. For Pixabay: flag `logoRequired: true` when the API is the acquisition method
4. For Wikimedia: fetch and record the specific license type per file

> **Status**: ✅ Implemented. `buildAttribution()` generates per-asset attribution. `buildCreditsSection()` only surfaces sources with `logoRequired=true` to TikTok description. All other sources tracked internally in `output/asset-report.json`.

## 7. Cookie & Platform Access Status (2026-08-14)

> **Finding**: `yt-dlp --cookies-from-browser chrome` is **broken** on this macOS machine due to Chrome cookie encryption changes.

### 7.1 Platform Status Matrix

| Platform | yt-dlp Search | yt-dlp URL Download | Cookies Needed? | Status |
|----------|---------------|---------------------|------------------|--------|
| **YouTube** | ✅ `ytsearch10:` works | ✅ Works | ❌ Not needed | **Fully functional** |
| **B站** | ⚠️ `bilisearch:` returns results but title/duration = NA | ❌ KeyError('bvid') on direct URL | Yes (SESSDATA) | **Broken — needs investigation** |
| **抖音** | N/A (no search extractor) | ❌ "Fresh cookies needed" | Yes (sid_tt) | **Broken — cookies can't be decrypted** |
| **小红书** | N/A (no search extractor) | ❌ "No video formats found" | Yes (xsec_token) | **Broken — needs valid URL with token** |
| **微博** | N/A (no search extractor) | ❌ SSL EOF error | Possibly | **Broken — SSL/network issue** |

### 7.2 Root Cause: Chrome Cookie Decryption Failure

```
WARNING: find-generic-password failed
WARNING: cannot decrypt v10 cookies: no key found
```

- Chrome v127+ changed cookie encryption on macOS
- `security find-generic-password -s "Chrome Safe Storage" -w` returns empty
- yt-dlp cannot read Chrome's encrypted cookie database
- YouTube works because it doesn't require cookies for search

### 7.3 Workaround Options

1. **Export cookies.txt manually** (recommended):
   - **Chrome extension "Get cookies.txt LOCALLY"** has been **removed from Chrome Web Store** (as of 2026-08-14, shows "Item not available")
   - **Firefox addon still available**: [Get cookies.txt LOCALLY](https://addons.mozilla.org/en-US/firefox/addon/get-cookies-txt-locally/)
   - Alternative Firefox addons: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/), [Export Cookies](https://addons.mozilla.org/en-US/firefox/addon/export-cookies-txt/)
   - Navigate to douyin.com / bilibili.com (while logged in)
   - Export cookies → save as `~/.config/yt-dlp/cookies.txt`
   - Use `yt-dlp --cookies ~/.config/yt-dlp/cookies.txt`

2. **Use Firefox instead of Chrome**:
   - yt-dlp's Firefox cookie reader works on macOS
   - `yt-dlp --cookies-from-browser firefox`

3. **Wait for yt-dlp fix**: Track [yt-dlp issue #11442](https://github.com/yt-dlp/yt-dlp/issues)
   - yt-dlp version 2026.07.04 (Homebrew latest) — no fix yet
   - Chrome v127+ App-bound encryption is not yet supported

### 7.4 Impact on asset-sourcer.mjs

- **YouTube**: Works perfectly (no cookies needed)
- **B站**: Search returns results but metadata incomplete; download broken
- **抖音/小红书/微博**: All broken until cookies are manually exported
- **CDP sources (news sites)**: Not affected by cookie issue — CDP proxy uses Chrome's live session
- **API sources**: Not affected — API keys in `.env.local`

> **Action needed**: User should export cookies.txt from Chrome for Chinese platforms. Until then, `asset-sourcer.mjs` will work for YouTube + API + CDP sources, but yt-dlp Chinese platform sources will report errors.

## 8. API Key Validation & Source Testing (2026-08-14)

### 8.1 API Key Status

| Source | Key | Status | Tested |
|--------|-----|--------|--------|
| Pexels | `PEXELS_API_KEY` | ✅ Valid (returns photos) | Yes |
| Unsplash | `UNSPLASH_ACCESS_KEY` | ✅ Valid (returns results) | Yes |
| Pixabay | `PIXABAY_API_KEY=57136959-...` | ✅ Valid (760 results for "robot") | Yes |
| Coverr | `COVERR_API_KEY=3e7cc90c...` | ✅ Valid (15 hits for "robot") | Yes |
| Wikimedia | N/A | ✅ No key needed | Yes |

### 8.2 Coverr — AI Creative Platform + Stock Library (Updated 2026-08-14)

Coverr (coverr.co) has evolved beyond a stock video platform. It is now a **comprehensive AI creative platform**:

**AI Tools** (Coverr Studio):
- **AI Video Generator** — models: Google Veo 3.1, OpenAI Sora 2 Pro, Kling 2.6 Pro, Seedance 1.5 Pro, Hailuo 2.3 Pro
- **AI Images Generator** — models: Flux 2 Flex, Nano Banana Pro, ByteDance Seedream 5.0
- **AI Audio Generator** — SFX, voiceover, audio generators
- **AI Apps** — custom content creation from text or media

**Stock Library** (original service):
- Free HD/4K stock video footage for commercial use
- API: `GET /videos?query={keyword}` with `Authorization: Bearer {token}`
- Response: `{ hits: [...], params: { userToken: "..." } }`
- Video URL: `https://cdn.coverr.co/videos/{base_filename}/mp4`
- Monetized via premium subscriptions

### 8.3 New CDP Sources Added

| Source | URL Pattern | Type |
|--------|-------------|------|
| Google News | `google.com/search?tbm=nws` | Search engine news |
| Bing News | `bing.com/news/search` | Search engine news |
| 雷锋网 (leiphone) | `leiphone.com/search?s=` | Chinese tech media |
| 新智元 (xinzhiyuan) | `xinzhiyuan.com/?s=` | Chinese AI media |
| 智东西 (zhidx) | `zhidx.com/?s=` | Chinese AI media |

### 8.4 Attribution System (Implemented)

Pipeline auto-records attribution for each downloaded asset:
- `buildAttribution(source, asset)` → per-asset attribution object stored in `output/asset-report.json`
- `buildCreditsSection(assets)` → only generates TikTok-visible credits for sources with `logoRequired=true`
- `SOURCE_ATTRIBUTIONS` map: 20 sources with license + logo requirement
- **Only Pixabay** requires logo display (API terms) → only Pixabay appears in TikTok credits
- All other sources (Pexels, Unsplash, Coverr, YouTube, news sites, etc.) are tracked internally but not surfaced to TikTok
- **Wikimedia license fetch**: `fetchWikimediaLicense(fileTitle)` queries Commons API for per-file license metadata
  - Returns `{ license, author, attributionRequired, licenseUrl }`
  - Example: `LicenseShortName: "CC BY-SA 4.0"`, `Artist: "Windmemories"`

### 8.5 Cookie Extension Status (Updated 2026-08-14)

- **Chrome Web Store**: "Get cookies.txt LOCALLY" (ID: `ccpbcjjkcajmhkehiedhlbmadkcmjhfe`) — **REMOVED** ("Item not available")
- **Firefox Add-ons**: Still available — [Get cookies.txt LOCALLY](https://addons.mozilla.org/en-US/firefox/addon/get-cookies-txt-locally/)
- **yt-dlp version**: 2026.07.04 (Homebrew latest) — Chrome v127+ cookie decryption still broken
- **YouTube**: Works without cookies (search uses `ytsearch10:` which doesn't require auth)
- **Chinese platforms**: All require login session cookies

