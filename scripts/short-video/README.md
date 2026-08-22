# China AI News — Short Video Pipeline

> **One prompt in, one qualified short video out.**
>
> The user gives a topic, URL, or source material. The pipeline researches,
> writes an article, generates scene data, sources visual assets, produces TTS
> voiceover, renders a 9:16 vertical video with burned-in karaoke subtitles,
> and verifies it against TikTok best practices — all autonomously. The only
> human checkpoint is the final video review before publishing.

## What it does

```
User prompt (topic / URL / PDF)
  │
  ▼
Stage 1  Article generation ───────→ MRL-1 self-review (auto)
  │  (research + write + widgets)
  ▼
Stage 2  Article publish + RAG reindex
  │
  ▼
Stage 3  Scene data generation ───→ MRL-2 self-review (auto)
  │  (6-10 scenes, voiceover, texts)
  ▼
Stage 3b Asset sourcing + VLM analysis
  │  (search → download → VLM describe → score → assign to scenes)
  │  (VLM auto-detects: content match, fullscreen vs background, fit + focus)
  ▼
Stage 4  Video production
  │  (TTS → HTML/Remotion scenes → FFmpeg assembly → ASS subtitles → BGM)
  ▼
Stage 5  Verification ────────────→ MRL-3 self-review (auto)
  │  (verify-video.mjs: scene rules + media + subtitles + frame analysis)
  │
  ▼
⏸️ HITL — Final video review (the ONE human checkpoint)
  │  (user watches the MP4, says "OK" → publish to TikTok + website)
  ▼
Stage 6  Analytics tracking
```

## Design principles

1. **One prompt, one video.** The user should not need to manually run
   intermediate steps, edit scene-data, or hand-pick assets. The pipeline
   decides everything and produces a candidate video. The user only reviews
   the final output.

2. **VLM is the brain, not a helper.** Qwen3-VL-8B (via `visual-analyzer.mjs`)
   is the core decision-maker for visual content: it describes what each
   asset shows, scores it against scene narration, decides whether to
   overlay text (background) or let the footage speak (fullscreen), and
   determines how to fit landscape assets into the vertical canvas.

3. **Graceful degradation, not hard failure.** If the VLM is unavailable,
   the pipeline falls back to keyword-based asset matching and default
   rendering (cover + center). The output is lower quality, not broken.

4. **TikTok-native.** Canvas is 1080×1920 (9:16). Safe zones, subtitle
   lane, brand bar, and frame analysis are calibrated against real FYP
   screenshots. Duration target is 60-70s. Every video is verified
   against 20+ scene rules before it ships.

5. **Human-in-the-loop only at the end.** MRL (Machine Review Loop) runs
   automated checks before every HITL checkpoint. The user sees a
   machine-verified candidate, not a raw draft.

## Architecture

```
scripts/short-video/
├── main.mjs                  # Pipeline entry point (--content <slug>)
├── verify-video.mjs          # Pre/post-render verification
├── content/                  # Per-content pipeline definitions
│   └── <slug>/
│       ├── meta.mjs          # Title, pipeline ID, key entities, renderer
│       ├── scene-data.mjs    # Scenes array (id, visualType, voiceover, texts, media)
│       └── scenes.mjs        # Scene HTML template generators (Playwright)
├── remotion/                 # Remotion renderer (React → frame-by-frame)
│   └── src/
│       ├── ShortVideo.tsx    # Main composition + scene dispatcher
│       ├── scenes/           # One component per visualType
│       ├── components/       # MediaBackground, Slot, BrandBar, animations
│       └── types.ts          # SceneData / MediaField types
├── lib/                      # Shared infrastructure
│   ├── visual-analyzer.mjs       # VLM bridge + focus detector (Qwen3-VL + OpenCV)
│   ├── vlm_analyzer.py            # Python side: VLM model loading + IPC loop
│   ├── focus_detector.py           # Python side: OpenCV face detection + saliency
│   ├── requirements-focus.txt      # Pinned deps for focus_detector.py
│   ├── asset-sourcer.mjs     # Search + download + VLM score + assign assets
│   ├── review-media-patch.mjs  # Format media-patch.json for human review
│   ├── media-bg.mjs          # Playwright media layer (CSS)
│   ├── scene-templates.mjs   # Shared scene HTML templates (hook, cta, etc.)
│   ├── scene-layout.mjs      # Slot layout system (fixed vertical bands)
│   ├── safe-zones.mjs        # TikTok safe zones + subtitle lane constants
│   ├── scene-rules.mjs       # Scene-data validation rules (20+ checks)
│   ├── generate-tts.mjs      # TTS orchestration (F5-TTS-MLX / Qwen3-TTS)
│   ├── record-scenes.mjs     # Playwright scene recording
│   ├── assemble.mjs          # FFmpeg assembly + subtitle burn + BGM mix
│   └── render-remotion.mjs   # Remotion CLI wrapper
├── assets/                   # Brand logos, BGM, shared images
└── output/                   # Per-pipeline output (video, audio, scenes)
```

## The VLM layer (visual-analyzer)

The AI analysis layer is the bridge between "assets exist" and "assets are
correctly placed." It uses `mlx-community/Qwen3-VL-8B-Instruct-8bit` running
as a long-lived Python subprocess in `~/.video-tts-env`.

### What the VLM does

| Action | Input | Output | Used for |
|--------|-------|--------|----------|
| `describe_image` | Image file path | 1-2 sentence description | Asset-to-scene content matching (scoreCandidate) |
| `describe_video` | Video file path | 1-2 sentence description | Same, with temporal awareness |
| `analyze_fit` | Image/video file path | `{fit, focus, reason}` | How to place landscape media in 9:16 canvas |
| `detectFocus` | Image file path | `{status, protectedRegions, saliency}` | Face detection + saliency map for text placement (Phase 1) |
| `suggest_mode` | Asset description + scene voiceover | `"fullscreen" \| "background"` | Whether to overlay text or let footage speak |

### How fit + focus works

When a landscape (16:9) asset is placed in a vertical (9:16) canvas, the VLM
decides:

- **`fit: "cover"`** — crop to fill. The VLM saw the main subject is centered
  and edge content is non-critical. Combined with `focus` to pick the crop
  window: `"top"`, `"center"`, or `"bottom"`.

- **`fit: "contain"`** — letterbox. The VLM saw text, UI elements, or critical
  content at the edges that must not be cropped. The canvas fills top/bottom
  with brand color `#0a0a14`.

```
Landscape 16:9 asset              fit: "cover"               fit: "contain"
                                  + focus: "center"

┌──────────────────────┐         ┌──────────┐              ┌──────────┐
│    sky               │         │ (cut)    │              │░░░░░░░░░░│ ← brand color
│                      │         │          │              ├──────────┤
│      🤖 robot        │   →     │  🤖      │        →     │ full 16:9│ ← complete
│      │               │         │  │       │              │ visible  │
│      └─ legs         │         │ (cut)    │              ├──────────┤
│    ground            │         └──────────┘              │░░░░░░░░░░│ ← brand color
└──────────────────────┘                                    └──────────┘
```

### Lifecycle

- Python process loads Qwen3-VL-8B once (~10s), stays resident for the batch.
- Auto-exits after 5 minutes of idle (releases ~11 GB memory).
- Node.js respawns on next call if process has exited.
- Serial processing (Apple Silicon is memory-bandwidth-bound — parallel doesn't help).

## Quick start

```bash
# Full pipeline from existing scene-data
node scripts/short-video/main.mjs --content deepseek --bgm

# Render-only (skip TTS, reuse existing audio)
node scripts/short-video/render-only.mjs --content deepseek --bgm

# Pre-render verification (no video needed)
node scripts/short-video/verify-video.mjs --pre --content deepseek

# Post-render verification (full check)
node scripts/short-video/verify-video.mjs --content deepseek

# Source assets for a content pipeline
node scripts/short-video/lib/asset-sourcer.mjs --content unitree
# API sources: Pexels, Unsplash, Wikimedia, Coverr, Pixabay, Lorem Picsum
# CDP sources: Google News, Bing News, IT之家, 机器之心, 新华网, 澎湃, 雷锋网, 新智元, 智东西
# Need more image/video sources? See docs/tools-catalog.md → Pipeline API 补充候选

# Apply VLM-analyzed media patches to scene-data
node scripts/short-video/apply-media-patch.mjs
```

## Environment requirements

| Component | Path / Version | Purpose |
|-----------|---------------|---------|
| FFmpeg (full) | `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` | Video assembly, rubberband, libass |
| Python venv | `~/.video-tts-env` | F5-TTS-MLX, Qwen3-TTS, whisperx, mlx-vlm, OpenCV |
| OpenCV | `opencv-contrib-python==4.10.0.84` | Focus detection (face + saliency) |
| VLM model | `mlx-community/Qwen3-VL-8B-Instruct-8bit` | Asset analysis (~11 GB resident) |
| TTS model | F5-TTS-MLX (default) | Voiceover generation |
| Ollama | `bge-m3:latest` | RAG embeddings (separate from VLM) |
| Chrome + CDP | `localhost:3456` | Asset search (Pexels, Unitree, etc.) |

## Key design documents

| Document | Purpose |
|----------|---------|
| `docs/content-pipeline.md` | End-to-end pipeline stages, HITL, MRL |
| `docs/video-workflow.md` | TTS engines, publishing, file paths |
| `docs/brand-system.md` | Brand identity, logo, color tokens |
| `docs/media-asset-management.md` | Asset placement + RAG reindex triggers |
| `scripts/short-video/lib/safe-zones.mjs` | TikTok safe zone constants (single source) |
| `scripts/short-video/lib/scene-layout.mjs` | Slot layout system (kicker / hero / support) |
