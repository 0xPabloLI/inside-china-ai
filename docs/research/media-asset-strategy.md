# Media Asset Strategy for Short Videos

> Status: Active — last updated 2026-08-13
> Scope: Image/video asset acquisition, integration, and animation for the short-video pipeline.

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
- **No asset library**: downloaded assets live in `content/{slug}/assets/` or `scripts/short-video/assets/` with no shared catalog or deduplication

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

### 4.1 Reference Video Extraction

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

**What we already know** from `docs/research/multi-video-splitting-best-practices.md` (15 sources, 2026-08-03):

- **70%+ completion rate** is the 2026 viral threshold (was 50% in 2024) — shorter scenes with media are easier to complete
- **Series content** has 3× higher save rate than standalone videos — media continuity across episodes helps
- **TikTok algorithm rewards session depth** — media that makes viewers watch the next scene is more valuable than media that looks good in isolation
- **TikTok Creator Academy** recommends dynamic visual changes every 2-3 seconds — our 5-8s scenes with animation presets align with this

**Research questions still open**:

| Question | Why it matters | How to research |
|----------|---------------|----------------|
| Does media background increase or decrease retention vs text-only? | Determines whether to invest in asset sourcing or improve CSS-only scenes | A/B test: same script, one with media backgrounds, one without. Compare 3-day retention in TikTok analytics |
| Optimal B-roll duration in a 60s video? | Avoid using a 10s clip that covers 2 scenes | Test 3s vs 5s vs 8s clips in the same scene position |
| Full-screen video vs picture-in-picture vs split screen? | We only support full-screen; PiP might let us show product demo + data simultaneously | Prototype in Remotion, test engagement |
| What visual elements (colors, motion speed, composition) drive engagement? | Calibrate animation presets and overlay values | Correlate TikTok analytics per-scene retention with media type |

**Sources to research** (not yet consulted):
- TikTok Creator Academy — specific guidelines on visual storytelling
- YouTube Shorts best practices documentation
- Academic papers on short-form video engagement (search Google Scholar)
- Industry reports from Tubular, Penthera, Conviva

### 4.3 Asset Source Catalog

**Validated sources** (tested and working in our pipeline):

| Source | Type | Access method | Tested | Notes |
|--------|------|---------------|--------|-------|
| YouTube | Video | `yt-dlp --cookies-from-browser chrome` | ✅ 2026-08-13 | Official channel uploads, demo videos. Parallel downloads fail (cookie DB lock) — run serially |
| Wikipedia Commons | Image | Node.js `fetch()` with `User-Agent` header | ✅ 2026-08-13 | Company buildings, product photos. Find URLs via Wikipedia REST API |
| Google News RSS | Article URLs | `curl` + XML parse | ✅ 2026-08-13 | Finds articles, but images are often behind paywalls |

**Candidate sources** (code exists but not yet used for asset downloads):

| Source | Type | Access method | Code location | Notes |
|--------|------|---------------|-------------|-------|
| TikTok | Video | `yt-dlp --cookies-from-browser chrome` | `competitor-intel.mjs` (search only) | Search scraping works via CDP; download not yet tested |
| Bilibili (B站) | Video | `yt-dlp` or CDP scraping | `lib/trend-sources.mjs` (search only) | CDP extract script exists. yt-dlp supports Bilibili |
| Douyin (抖音) | Video | CDP + download | `lib/trend-sources.mjs` (search only) | CDP extract script exists. `needsAuth: true` — requires login session |
| Xiaohongshu (小红书) | Image/Video | CDP + MCP fallback | `lib/trend-sources.mjs` (search only) | `needsAuth: true`. MCP fallback to `xiaohongshu_mcp_server` |

**Candidate sources** (not yet integrated, to research and validate):

| Source | Type | Access | Notes |
|--------|------|--------|-------|
| Pexels | Video/Image | API (free, register key) | Stock footage, no attribution needed. Good for abstract/tech B-roll |
| Unsplash | Image | API (free, register key) | High-quality stock photos. Good for company/city/building shots |
| Pixabay | Video/Image | API (free) | Mixed quality, broad coverage. No attribution required |
| Wikimedia Commons | Image | API + User-Agent | Historical/archival images (different endpoint than Wikipedia article images) |
| Company press kits | Image/Video | `web_fetch` or CDP scraping | Official product photos, press releases. Check `/press` or `/media` subpaths |
| Coverr | Video | Direct download | Free HD video clips, no attribution |
| Mixkit | Video | Direct download | Free video clips, no attribution |
| Internet Archive | Video/Image | Direct download | Historical footage, public domain |
| Flickr Creative Commons | Image | API (register key) | User-generated, CC-licensed. Filter by license |

**Not recommended**:

| Source | Why |
|--------|-----|
| Google Images | Copyright issues, bot detection, no reliable download method |
| News article images directly | Behind paywalls or JS-rendered pages. Use Google News RSS to find articles, then CDP for image extraction |

**Download method patterns** (for integration into automated pipeline):
- **API-based** (Pexels, Unsplash, Flickr): Register API key → search by keyword → download via HTTP. Store key in `.env.local`
- **Direct download** (Coverr, Mixkit): `curl` or `wget` with proper headers
- **yt-dlp** (YouTube, Bilibili, TikTok): `--cookies-from-browser chrome` + format selection + `--download-sections` for clips
- **CDP scraping** (Douyin, Xiaohongshu, press kits): Use existing `lib/cdp-client.mjs` pattern — connect to Chrome remote debugging, extract image/video URLs from DOM, download via `fetch()`

### 4.4 Automated Asset Pipeline

**Vision**: Agent receives a topic + scene-data → automatically finds, downloads, and assigns media to scenes.

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

**Pipeline design**:

1. **Extract keywords** from scene-data: `meta.keyEntities.companies[0]`, product names, action verbs from `voiceover` text. Use the same `keyEntities` extraction that `caption-utils.mjs` already does.
2. **Search sources** for each keyword:
   - YouTube: `yt-dlp --flat-playlist --print` for search (see §2.1)
   - Pexels/Unsplash: API search by keyword (requires API key)
   - Wikipedia: REST API for company/landmark images (see §2.2)
   - Bilibili/Douyin: CDP search via `lib/trend-sources.mjs` extract scripts
3. **Score candidates**: relevance (keyword match in title), duration (3-8s ideal for clip extraction), file size (< 20MB), resolution (≥ 720p)
4. **Download top candidates** to `content/{slug}/assets/`:
   - Video: `yt-dlp --download-sections "*0:00-0:08"` for 8s clips, `--max-filesize 20M`
   - Image: `fetch()` with proper headers (User-Agent for Wikipedia, API key for Pexels/Unsplash)
   - **Serial downloads only** — parallel yt-dlp instances conflict on Chrome cookie DB lock
5. **Auto-assign to scenes**: match scene `voiceover` keywords to asset metadata (title, tags). Assign `animation` preset based on scene `visualType`:
   - `narrative` → `fade` or `zoom` (product demos)
   - `info-card` → `ken-burns` (static images, buildings/photos)
   - `quote` → `fade` with `overlay: 0.8` (text is the focus)
   - `data` / `stat-reveal` → no media (CSS-only is better for big numbers)
   - `hook` / `cta` → no media (shared templates ignore media field)
6. **Render**: existing pipeline handles the rest — `render-remotion.mjs` copies assets, `MediaBackground.tsx` renders with animation

**Design constraints**:
- **Never assign media to hook or CTA scenes** — `hookScene()` and `ctaScene()` delegate to shared templates that ignore the `media` field
- **Never use `ken-burns` with video** — auto-degrades to `fade` in `MediaBackground.tsx`, but better to assign correctly upstream
- **Deduplicate across content** — if `unitree-demo.mp4` already exists in `scripts/short-video/assets/`, symlink rather than re-download
- **Attribution required** — `media.source` field must be filled for copyright compliance

### 4.5 Asset Deduplication & Shared Library

**Problem**: Assets currently live in per-content directories (`content/{slug}/assets/`) or the global `scripts/short-video/assets/`. No deduplication — same video could be downloaded multiple times for different content.

**Proposed structure**:
```
scripts/short-video/assets/
  ├── shared/              ← shared library (symlinked into content dirs)
  │   ├── companies/       ← company logos, buildings, product shots
  │   ├── b-roll/          ← generic stock footage (city, tech, abstract)
  │   └── archive/         ← downloaded clips, organized by source
  └── content-specific/    ← assets unique to one content piece
```

**Dedup strategy**: hash file content (SHA-256) → if hash exists in shared library, symlink instead of copy. This avoids storing the same 10MB video multiple times.

### 4.6 Background Audio Mixing Research

**Current setting**: `<Video volume={0.08} />` — 8% of original volume.

**Why not muted**: Background clips from YouTube carry atmospheric audio (robot motor sounds, footsteps, crowd noise) that adds realism. Complete silence feels dead.

**Why not louder**: TTS voiceover is the primary audio track. Any background audio competing with it reduces comprehension, especially for non-native English speakers watching with subtitles.

**Research questions** (TODO — web deep research needed):

| Question | Why it matters |
|----------|---------------|
| What is the industry standard for B-roll/narration audio ratio? | Film/TV uses -20dB to -25dB for background score relative to dialogue. Does this apply to short-form video? |
| Should volume duck during TTS speech and rise during pauses? | Sidechain compression — standard in podcast production. Remotion supports per-frame volume via `interpolate()`. |
| Does any background audio improve or hurt TikTok engagement? | A/B test needed. TikTok viewers often watch with sound off (captions on), so background audio may be irrelevant. |
| Per-scene volume adjustment? | Action demos (robot backflip) have useful sound; narrated demos (company overview) have redundant narration that conflicts with TTS. |

**Candidate approach** (to validate with research):
```typescript
// Per-frame volume ducking: lower during TTS, rise during pauses
const volume = interpolate(frame, [0, inFrames, totalFrames - outFrames, totalFrames], [0, 0.08, 0.08, 0], clamp);
// Future: sidechain with TTS audio envelope for automatic ducking
```

## 5. Design Decisions & References

- **yt-dlp cookies requirement**: Discovered 2026-08-13, verified with `--verbose` output showing `LOGIN_REQUIRED` without cookies, success with `--cookies-from-browser chrome` [[memory:17865489336644602134]]
- **Wikipedia 403**: Wikipedia's servers reject requests without a User-Agent header per their [API etiquette policy](https://meta.wikimedia.org/wiki/User-Agent_policy)
- **Parallel yt-dlp conflict**: Chrome's cookie database (`~/Library/Application Support/Google/Chrome/Default/Cookies`) uses SQLite with a lock; multiple yt-dlp instances reading it simultaneously can fail
- **Remotion media path resolution**: `staticFile()` resolves relative to `remotion/public/`, so content assets must be copied there before rendering (handled by `render-remotion.mjs` step 2b)
- **Overlay values**: Calibrated by testing text readability over various video/image backgrounds at 1080×1920 resolution. Values: 0.6 (light), 0.7 (standard), 0.75 (images), 0.8 (heavy/text-focus)
- **Background video audio at 8% volume**: `<Video volume={0.08} />` in `MediaBackground.tsx` — background clips from YouTube have their own audio (robot motor sounds, demo narration, music) that adds atmosphere when barely audible. 0.08 is a conservative starting point — low enough not to interfere with TTS voiceover, high enough to feel the scene. **TODO**: Web deep research to confirm optimal B-roll audio level (industry standard for background/score audio relative to main narration).
- **ken-burns + video auto-degrade**: Ken-burns is designed for static images (slow zoom + pan). Applied to video, the per-frame interpolation creates janky stutter. `MediaBackground.tsx` auto-degrades to `fade`; `media-bg.mjs` `validateMedia()` issues a warning.
- **Playwright vs Remotion timing divergence**: The two backends evolved independently. Playwright (`media-bg.mjs`) uses CSS `@keyframes` with percentage-based timing; Remotion (`MediaBackground.tsx`) uses `interpolate()` with frame-based timing. The data contract (`MediaField`) is shared; timing is implementation-level. Unifying timing is a future cleanup task.
- **5 presets, not more**: Adding presets (e.g., `parallax`, `shake`, `glitch`) is technically easy but increases the testing surface. Current 5 presets cover all use cases encountered in 6+ content pieces. Add new presets only when a real content need cannot be met by existing ones.
