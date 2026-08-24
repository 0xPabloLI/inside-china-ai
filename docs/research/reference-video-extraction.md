# Reference Video Extraction — Long-term Task

> Status: Backlog — not started. Priority: Low.
> Created: 2026-08-15 (extracted from `docs/archive/media-asset-strategy.md` §4.1)
> Updated: 2026-08-25 (offload platform download methods to asset-source-quick-reference.md)
> GitHub Issue: https://github.com/0xPabloLI/inside-china-ai/issues/29
> (Issue 29 Part B covers the reference video extraction pipeline)
>
> **Trigger**: When the pipeline has enough content coverage and the bottleneck
> shifts to visual template design / competitive analysis. Not urgent while
> asset sourcing (§4.4) and content volume are the primary constraints.

## Goal

Given a reference TikTok/YouTube video, extract the media placement strategy
(what assets, where, what transitions) to inform our own scene-data authoring.

## Why it matters

Currently, scene-data authoring relies on human judgment for media placement
decisions — which scenes get video vs image vs CSS-only, what animation preset,
what overlay value. Analyzing high-performing competitor videos would:

1. Validate or challenge our current 5-preset animation system
2. Discover visual patterns we haven't considered (PiP, split screen, text-on-video)
3. Provide data-driven guidance for new content types

## Video Download

> **Platform download methods** (YouTube, Bilibili, TikTok, Douyin) — see
> `docs/research/asset-source-quick-reference.md` → "Chinese Video Platforms"
> table for the full, maintained list. This section only retains TikTok CDP
> method details (JS code too long for the quick-reference table).

### TikTok — CDP `item/detail` API (verified 2026-08-24)

TikTok has no public download API — video URLs are dynamically signed and expire.

**Default: CDP `item/detail` API.** Fallback: manual download when CDP
unavailable. Network interception only if API method fails.

**Method A (default): CDP `item/detail` API**

- Call TikTok's internal API `aweme/v1/web/item/detail/` via CDP `fetch()`
  within the browser session — the browser carries all necessary cookies
  and signature headers automatically
- Response JSON contains `itemInfo.item.video.playAddr` — a direct MP4 URL
  (no `blob:` intermediary, no MSE)
- Download the MP4 via CDP `fetch(playAddr, {credentials:'include'})` —
  browser session provides required Referer + cookies
- **Low ban risk**: same browser session, same cookies as normal browsing
- Requires non-HK proxy (Clash HK node gets redirected to "TikTok not
  available in Hong Kong" page)
- CDP eval JS (simplified):
  ```js
  // 1. Get video metadata (itemId from short URL redirect)
  const detail = await fetch(
    'https://www.tiktok.com/aweme/v1/web/item/detail/?itemId=VIDEO_ID&aid=1988',
    {credentials:'include'}
  ).then(r => r.json());
  // 2. Extract playAddr
  const playAddr = detail.itemInfo.item.video.playAddr;
  // 3. Download video (returns Blob)
  const blob = await fetch(playAddr, {credentials:'include'}).then(r => r.blob());
  // 4. Convert to base64 or save via CDP download handler
  ```

**Method B (fallback): CDP network interception**

- TikTok uses MSE, so `<video>.src` is a `blob:` URL, not a direct file URL
- Extract real stream URL via `performance.getEntriesByType("resource")`
- Flow: CDP open page → wait for video load → scan resource entries →
  filter for video stream URL → `fetch()` download
- Fragile: stream URLs are transient, MSE blob URLs vary by player

**Method C (last resort): Manual download**

- Chrome extension: [TikTok Video Downloader](https://chromewebstore.google.com/)
  or similar — adds a download button to TikTok pages
- Or: right-click video → "Save video as" (not available on all TikTok versions)
- Or: ask agent to use CDP method A
- Save to: `output/reference-videos/<name>.mp4`

**Failed: yt-dlp + impersonate**

- TikTok's anti-bot challenge (`_solve_challenge_and_set_cookies`) requires
  **JS execution** — yt-dlp cannot do this
- This is a fingerprint problem, not a frequency problem

### Third-party TikTok/Douyin download solutions (2026-08-24 research)

The `item/detail` → `playAddr` approach is the most common TikTok
reverse-engineering method in the open-source community. Key projects:

| Project | Approach | Stars | Relevance to us |
|---------|----------|-------|-----------------|
| **TikTokApi** (davidteather) | Python, calls TikTok API + extracts playAddr | ~10K+ | Same concept as our Method A, but needs signature signing |
| **Cobalt** (imputnet) | Node.js service, parses rehydration JSON for playAddr | ~3K+ | Self-deployable HTTP API; overkill for our low-frequency use |
| **Douyin_TikTok_Download_API** (Evil0ctal) | Python FastAPI, handles `a_bogus` signing | 19K | Most popular but requires reversing X-Bogus/X-Argus signature |
| **tiktok-api-dl** (TobyG74) | Node.js wrapper around ssstik.io + musicaldown.com | — | Depends on third-party scraping services (privacy risk) |
| **yt-dlp** | Attempts HTML rehydration JSON extraction | — | Blocked by TikTok JS challenge |

**Why CDP over third-party:** no signature reversing (browser carries cookies +
signed headers), no external dependency (privacy risk on ssstik.io etc.). Only
requires: user's logged-in Chrome + CDP eval.

For higher-frequency needs, **Cobalt** (self-deployed) is the best
upgrade path — it wraps the same playAddr extraction into an HTTP API.

## Concrete workflow (design intent — not yet implemented)

> This task is `Backlog — not started`. The workflow below is the intended
> design for when the task triggers. Execution instructions will migrate to
> `docs/video-workflow.md` (L1) at implementation time.

```bash
# Step 1: Download reference video
# → See asset-source-quick-reference.md for platform-specific methods
# → TikTok CDP Method A details: see above
# Save to: output/reference-videos/<name>.mp4

# Step 2: Extract keyframes at 1fps
FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
$FFMPEG -i output/reference-videos/reference.mp4 -vf "fps=1" \
  output/reference-frames/frame-%03d.jpg

# Step 3: Analyze each keyframe with vision model
# (agent prompt: for each frame, describe what's on screen —
#  text content, image/video background, layout, color scheme,
#  transition type if detectable from adjacent frames)

# Step 4: Map to our scene-data structure
# Agent outputs a JSON array:
# [{ scene: 1, mediaType: "video", animation: "zoom", overlay: 0.7, ... }]
```

## Implementation notes (design intent)

- Keyframe extraction at 1fps gives ~60 frames for a 60s video — sufficient
  for structural analysis without overwhelming the vision model
- The agent should output a "media strategy report" that maps to our
  `MediaField` schema, not a freeform description
- Vision model options: GPT-4o / Claude Vision (API), or local
  Qwen-VL via Ollama
- **The valuable automation is steps 2-4** (keyframe → vision → report),
  not the download itself

## When to start

Prerequisites (all currently met):
- ✅ Pipeline has 5 animation presets + overlay system + media field
- ✅ `asset-sourcer.mjs` handles automated asset acquisition
- ✅ `source-registry.mjs` has TikTok Creator Center search (used by search-sources.mjs)

### Two trigger paths

**Path 1: User-initiated (primary, low frequency)**

User discovers a competitor video worth emulating while browsing TikTok/YouTube.
User manually downloads the video and provides it to the agent for analysis.
Expected frequency: once every 1-2 months.

**Path 2: Data-driven (secondary, requires analytics accumulation)**

Agent identifies a retention pattern from analytics data (e.g., data scenes
have lower completion rates than narrative scenes). Agent reports the pattern
to the user, but **does not search for or recommend specific competitor
videos** — TikTok search is region-restricted (HK proxy blocked) and search
results are not ranked by competitive relevance. The user decides whether
to find a reference video, and which one.

This path is part of the Analytics workflow (see
`docs/analytics-workflow.md`). Trigger conditions:
- ⬜ Enough published videos (>10) with analytics data accumulated
- ⬜ Per-scene retention correlation shows a specific visual pattern
  (e.g., media-heavy scenes retain better for product demos)

When Path 2 triggers, the agent reports the pattern. If the user then finds
and downloads a reference video, the agent runs keyframe extraction + vision
analysis.

## Design Decisions & References

- Extracted from `docs/archive/media-asset-strategy.md` §4.1 on 2026-08-15
- Video download feasibility research: 2026-08-16 (yt-dlp TikTok blocked, CDP
  network interception feasible, manual download recommended, no TikTok official API)
- CDP `item/detail` API method verified: 2026-08-24 (direct `playAddr` extraction,
  simpler than network interception, verified working with browser session fetch)
- Third-party TikTok download survey: 2026-08-24 (TikTokApi, Cobalt,
  Douyin_TikTok_Download_API, tiktok-api-dl, yt-dlp — our CDP method is
  more elegant: no signature reversing, no third-party dependency, no headless browser)
- Platform download methods offloaded to `docs/research/asset-source-quick-reference.md`
  on 2026-08-25 (YouTube/Bilibili/Douyin methods + Quick reference table removed;
  only TikTok CDP details retained here — JS code too long for quick-reference table)
- Related: `docs/research/multi-video-splitting-best-practices.md` (episode-to-episode retention patterns)
- Related: `docs/research/short-video-script-writing-best-practices.md` (pattern interrupts, open loops)
- Related: `docs/analytics-workflow.md` (独立 Analytics 工作流, 数据驱动优化建议)
