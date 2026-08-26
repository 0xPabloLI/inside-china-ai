# China AI News

> Independent reporting on China's AI industry.
> One prompt in, one qualified short video out.

## What is this

China AI News is a content platform that produces articles and short videos
about China's AI industry, designed to run as an **autonomous pipeline**: the
user gives a topic, URL, or source material, and the system researches, writes
an article, generates a video, and verifies it against TikTok best practices —
all before the user reviews the final output.

The only human checkpoint is the final video review before publishing.

## How it works

```
User prompt (topic / URL / PDF)
  │
  ▼
Stage 1  Article generation          — research + write + interactive widgets
  │     (MRL-1 self-review: 8 blockers, 5 warnings — fully automated)
  ▼
Stage 2  Article publish + RAG reindex
  │     (live on website, indexed for future retrieval)
  ▼
Stage 3  Scene data generation       — 6-10 scenes: voiceover script + on-screen texts
  │     (MRL-2 self-review: 10 blockers, 6 warnings — fully automated)
  ▼
Stage 3b Asset sourcing + VLM analysis
  │     — search Pexels / official sites / yt-dlp for images & video
  │     — VLM (Qwen3-VL-8B) describes each asset, scores content match,
  │       decides display mode (fullscreen vs text overlay),
  │       determines fit + focus for landscape media in vertical canvas
  │     — auto-writes media fields into scene-data
  ▼
Stage 4  Video production
  │     — TTS voiceover (F5-TTS-MLX, Apple Silicon native)
  │     — Scene rendering (Remotion or Playwright HTML → screen record)
  │     — FFmpeg assembly + karaoke subtitles (ASS) + background music
  ▼
Stage 5  Verification                — verify-video.mjs: 20+ scene rules,
  │     media checks, subtitle sync, frame analysis (MRL-3 — automated)
  │
  ▼
⏸️ HITL — Final video review        — the ONE human checkpoint
  │     user watches the MP4, says "OK" → publish to TikTok + website
  ▼
Stage 6  Analytics tracking         — TikTok metrics, A/B testing, optimization
```

### Key design principles

1. **One prompt, one video.** No manual intermediate steps. The pipeline
   decides everything — asset selection, display mode, text overlay vs
   fullscreen, landscape fit — and produces a candidate video.

2. **VLM is the visual brain.** Qwen3-VL-8B analyzes every downloaded asset:
   what it shows, how well it matches the scene narration, how to display it
   in a 9:16 canvas. This replaces human judgment for asset-to-scene assignment.

3. **TikTok-native.** Canvas is 1080×1920. Safe zones, subtitle lane, brand
   bar, and frame analysis are calibrated against real FYP screenshots.
   Duration target is 60-70s. Every video passes 20+ automated checks.

4. **Machine Review Loop (MRL) before every human checkpoint.** The pipeline
   self-verifies at each stage. The user sees a machine-verified candidate,
   not a raw draft.

5. **Graceful degradation.** If the VLM is unavailable, the pipeline falls
   back to keyword-based asset matching and default rendering. Lower quality,
   not broken.

## Tech stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Web app | React 19 + TanStack Start + TypeScript | Website, articles, admin editor |
| Database | Supabase (PostgreSQL + Auth + RLS) | Articles, subscribers, auth |
| UI | Tailwind CSS v4 + shadcn/ui | Component system |
| Video rendering | Remotion (React → frame-by-frame) or Playwright (HTML → screen record) | Scene generation |
| TTS | F5-TTS-MLX (Apple Silicon) | Voiceover generation |
| VLM | Qwen3-VL-8B-Instruct-8bit via mlx-vlm | Asset analysis & visual decision-making |
| Video assembly | FFmpeg (full build with rubberband + libass) | Concatenation, subtitles, BGM, loudness |
| RAG | Ollama bge-m3 + pgvector | Content retrieval for research & asset search |
| Trend discovery | Chrome CDP + MCP search bridge | 28 sources across Chinese & Western platforms |

## Project structure

```
inside-china-ai/
├── src/                        # Web application
│   ├── routes/                 # TanStack file-based routing (pages + API)
│   ├── components/             # UI components + interactive widgets
│   └── integrations/supabase/  # Supabase client
├── scripts/
│   ├── short-video/            # Video production pipeline
│   │   ├── main.mjs            # Pipeline entry point
│   │   ├── content/            # Per-topic content definitions
│   │   ├── lib/                # TTS, rendering, assembly, AI analysis
│   │   ├── remotion/           # Remotion React video components
│   │   └── assets/             # Brand logos, BGM, shared images
│   ├── article/                # Article publishing scripts
│   ├── rag/                    # RAG indexing & query
│   └── seo/                    # SEO validation
├── supabase/migrations/        # Database schema
├── docs/                       # All documentation (see DOCS-INDEX.md)
├── articles/                   # Published article markdown files
└── AGENTS.md                   # Agent operating instructions (start here)
```

## Quick start

### Prerequisites

- Node.js 20+ and npm
- Python 3.12 (for TTS, VLM, whisperx) — use `~/.video-tts-env` venv
- FFmpeg full build (`brew install ffmpeg` or `/opt/homebrew/opt/ffmpeg-full`)
- Ollama with `bge-m3` model (for RAG)
- Chrome with remote debugging (for CDP-based asset search)

### Install

```sh
git clone <this-repository-url>
cd inside-china-ai
npm install

# Install pre-commit hook for secret scanning
bash scripts/install-git-hooks.sh

# Start dev server
npm run dev
```

### Make a video

```sh
# 1. Run the full pipeline (from existing scene-data)
node scripts/short-video/main.mjs --content deepseek --bgm

# 2. Render-only (skip TTS, reuse existing audio)
node scripts/short-video/render-only.mjs --content deepseek --bgm

# 3. Verify a video
node scripts/short-video/verify-video.mjs --content deepseek

# 4. Source assets for a content pipeline
node scripts/short-video/lib/asset-sourcer.mjs --content unitree
```

Or just tell the agent: *"用「华为 AI 芯片突破」这个话题做一条内容"* — and it
handles everything from research to final video.

### Common commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development server |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run format` | Prettier write |
| `npx tsc --noEmit` | Type check (no emit) |
| `npm test` | Run test suite (vitest) |
| `node scripts/short-video/main.mjs --content <slug> --bgm` | Produce a video |

## Documentation

Start with `AGENTS.md` (agent operating instructions), then `docs/DOCS-INDEX.md`
for the full document map. Key documents:

| Document | Purpose |
|----------|---------|
| `docs/content-pipeline.md` | End-to-end pipeline: article → video → publish |
| `docs/video-workflow.md` | TTS engines, publishing, file paths |
| `docs/brand-system.md` | Brand identity, logo, color tokens |
| `docs/tiktok/tiktok-best-practices.md` | TikTok algorithm & content rules |
| `docs/tanstack-lovable-conventions.md` | Stack-level conventions |
| `docs/installed-skills.md` | Agent skills overview & install guide |
| `docs/tools-catalog.md` | External tools/APIs catalog & decision table |
| `scripts/short-video/README.md` | Video pipeline architecture details |

## Built with

- [TanStack Start](https://tanstack.com/start) — full-stack React framework
- [Supabase](https://supabase.com) — PostgreSQL + Auth + RLS
- [Remotion](https://remotion.dev) — programmatic video creation
- [shadcn/ui](https://ui.shadcn.com) — UI components
- [Lovable](https://lovable.dev) — initial project scaffolding

## License

All rights reserved. This project is connected to [Lovable](https://lovable.dev).
