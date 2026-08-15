# Reference Video Extraction — Long-term Task

> Status: Backlog — not started. Priority: Low.
> Created: 2026-08-15 (extracted from `docs/archive/media-asset-strategy.md` §4.1)
> GitHub Issue: https://github.com/0xPabloLI/inside-china-ai/issues/29
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

## Existing infrastructure to build on

- `competitor-intel.mjs` — scrapes TikTok search results via CDP, extracts
  video titles/URLs/views. Extend it to download and analyze individual videos.
- `lib/trend-sources.mjs` — CDP extract scripts for TikTok, Douyin, Bilibili,
  YouTube. Same pattern for search-to-download.
- `asset-sourcer.mjs` — already has yt-dlp download + keyframe extraction
  patterns that can be reused.

## Concrete workflow

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

## Implementation notes

- For TikTok videos, `yt-dlp` needs `--cookies-from-browser chrome` (same bot
  detection issue as YouTube) [[memory:17865489336644602134]]
- Keyframe extraction at 1fps gives ~60 frames for a 60s video — sufficient
  for structural analysis without overwhelming the vision model
- The agent should output a "media strategy report" that maps to our
  `MediaField` schema, not a freeform description
- Vision model options: GPT-4o / Claude Vision (API), or local
  LLaVA / Qwen-VL via Ollama

## When to start

Prerequisites (all currently met):
- ✅ Pipeline has 5 animation presets + overlay system + media field
- ✅ `asset-sourcer.mjs` handles automated asset acquisition
- ✅ `competitor-intel.mjs` can find reference videos

Trigger conditions (not yet met):
- ⬜ Content coverage > 10 videos with TikTok analytics data
- ⬜ Per-scene retention correlation shows a pattern worth emulating
- ⬜ A specific competitor video is identified as a model to reverse-engineer

## Design Decisions & References

- Extracted from `docs/archive/media-asset-strategy.md` §4.1 on 2026-08-15
- Related: `docs/research/multi-video-splitting-best-practices.md` (episode-to-episode retention patterns)
- Related: `docs/research/short-video-script-writing-best-practices.md` (pattern interrupts, open loops)
