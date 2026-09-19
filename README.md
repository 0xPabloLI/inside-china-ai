# Auto Short-Video Pipeline

> One prompt in, one verified, platform-ready short video out.
> The only human checkpoint is approving the final cut.

An autonomous production pipeline that turns a topic, URL, or source document
into a finished short video (TikTok-native 1080×1920, 60-70s) with zero manual
intermediate steps: research → article → scene data → asset sourcing → voice →
render → self-verify → candidate for your OK.

This repository is the **China AI News** template — a reference deployment that
points the pipeline at China's AI industry. It ships the pipeline plus the
website, article editor, interactive widgets, subscriber/newsletter system, and
analytics loop that form its publish surface and feedback channel. Use it as a
working template to deploy the same pipeline on any beat.

---

## How it works

```
User prompt (topic / URL / PDF)
  │
  ▼
Stage 1  Research + article          — RAG retrieval, draft, interactive widgets
  │     MRL-1 self-review (8 blockers, 5 warnings — automated)
  ▼
Stage 2  Publish article + RAG reindex (live on site, indexed for next run)
  ▼
Stage 3  Scene data                  — 6-10 scenes: voiceover script + on-screen texts
  │     MRL-2 self-review (10 blockers, 6 warnings — automated)
  ▼
Stage 3b Asset sourcing + VLM analysis
  │     — search 59 sources (news, stock, video platforms, WeChat RSS) for images/video
  │     — VLM describes each asset, scores claim match, decides display mode + crop
  │     — AI B-roll generation (text-to-video) when no real footage fits, gated by quality
  ▼
Stage 4  Production
  │     — TTS voiceover (5-engine heterogeneous router, see below)
  │     — Digital-human / avatar frames (optional)
  │     — Remotion rendering (React → frame-accurate)
  │     — FFmpeg assembly + karaoke subtitles (ASS) + BGM + loudness
  ▼
Stage 5  Verification                — verify-video: 20+ scene rules, media checks,
  │     subtitle sync, frame analysis; factual claim audit
  │     MRL-3 (automated)
  ▼
⏸️ HITL — Final review               — the ONE human checkpoint
  │     user watches MP4 → "OK" → publish to TikTok + website
  ▼
Stage 6  Analytics                   — TikTok metrics, A/B testing, optimization
```

### Key design principles

1. **One prompt, one video.** No manual intermediate steps. The pipeline
   decides everything — asset selection, display mode, text overlay vs
   fullscreen, landscape fit — and produces a candidate video.

2. **Machine Review Loop (MRL) before every human checkpoint.** Each stage
   self-audits against a blocker/warning checklist and loops until clean. The
   user sees a machine-verified candidate, not a raw draft.

3. **VLM is the visual brain.** A vision-language model analyzes every
   candidate asset: what it shows, how well it matches the scene's claim, how
   to display it in a 9:16 canvas. A relevance gate fails closed — no asset
   rather than the wrong asset.

4. **TikTok-native.** Canvas is 1080×1920. Safe zones, subtitle lane, brand
   bar, and frame analysis are calibrated against real FYP screenshots.
   Duration target 60-70s. Every video passes 20+ automated checks.

5. **Graceful degradation.** VLM down → keyword matching + default rendering.
   Best GPU unavailable → next tier. A stage can produce lower quality, but
   the pipeline doesn't break.

---

## Heterogeneous compute routing

The TTS/render workload runs across four hardware classes. The router tries
the cheapest tier that meets the fidelity bar and falls through on
quota/failure. Free quota is used first; paid cloud only when free tiers are
exhausted.

| Tier | Hardware | Role | Cost |
| ---- | -------- | ---- | ---- |
| 1 | Apple Silicon MLX (M-series) | Local default for VLM, B-roll, fast TTS | $0 |
| 2 | Kaggle T4 / P100 16GB | Free cloud CUDA for TTS (CosyVoice3, full emotion) | $0 (30h/wk) |
| 3 | Modal T4 → L4 → A100 | Paid cloud when free quota exhausted | ~$30/mo cap |
| 4 | Ascend 910B NPU | Chinese NPU, free fallback | $0 |

**TTS engine priority** (the most fidelity-sensitive stage, 5 engines):
CosyVoice3-Kaggle-CUDA (default, P100, Apache-2.0) → CosyVoice3-Modal-CUDA
(A100 paid) → CosyVoice3-NPU (Ascend 910B) → CosyVoice3-MLX (local) →
F5-TTS-MLX (backup). `edge-tts` and macOS `say` are manual opt-in only.

CUDA engines are prioritized because MPS/MLX/NPU have verified emotion
regression vs CUDA; Kaggle P100 CUDA matches the A100 emotion baseline.

---

## Tech stack

| Layer | Technology | Purpose |
| ----- | ---------- | ------- |
| Web app | React 19 + TanStack Start + TypeScript | Website, articles, admin editor |
| Database | Supabase (PostgreSQL + Auth + RLS) | Articles, subscribers, auth |
| UI | Tailwind CSS v4 + shadcn/ui | Component system |
| Video rendering | Remotion (React → frame-by-frame) | Scene generation |
| TTS | CosyVoice3 (CUDA/NPU/MLX) + F5-TTS-MLX + Qwen3-TTS + edge-tts + say | 5-engine heterogeneous voiceover |
| VLM | Qwen3-VL-8B (mlx-vlm), Qwen3.8-27B VLM (upgraded) | Asset analysis, visual decisions, B-roll gating |
| AI B-roll | Wan1.3B (MLX) + Lance-3B-Video | Text-to-video when no real footage fits |
| Video assembly | FFmpeg (rubberband + libass) | Concat, subtitles, BGM, loudness |
| RAG | Ollama bge-m3 + pgvector + bge-reranker | Research retrieval + asset search |
| Trend discovery | Chrome CDP + MCP search bridge | 59 sources, Chinese & Western platforms |

---

## Project structure

```
inside-china-ai/
├── src/                        # Web application (site + editor + widgets)
│   ├── routes/                 # TanStack file-based routing (pages + API)
│   ├── components/             # UI + interactive article widgets
│   └── integrations/supabase/  # Supabase client
├── scripts/
│   ├── short-video/            # ← THE PIPELINE (entry: main.mjs)
│   │   ├── content/            # Per-topic content packages (30+)
│   │   ├── lib/
│   │   │   ├── tts/            # 5-engine TTS registry + adapters
│   │   │   ├── b-roll/         # AI B-roll orchestrator + t2i runner + gate
│   │   │   ├── platforms/      # TikTok publish + profile model
│   │   │   └── ...             # VLM, asset-sourcer, scene-rules, digital-human, claim-audit
│   │   └── remotion/           # Remotion React video components
│   ├── article/                # Article publishing
│   ├── rag/                    # RAG indexing + query + eval
│   └── seo/                    # SEO validation
├── supabase/migrations/        # Database schema
├── articles/                   # Published article markdown
├── docs/                       # All documentation (see DOCS-INDEX.md)
└── AGENTS.md                   # Agent operating instructions (start here)
```

---

## Template status (China AI News deployment)

The reference deployment is live with real output:

- **30+ content packages** produced across DeepSeek, Alibaba, ByteDance, Anthropic,
  Kimi, Qwen, SenseTime, Unitree, Zhipu, Didi and more.
- **11 articles published** to the live site with interactive widgets.
- **Multi-part series** support (up to 3 parts per topic, inter-episode linking).
- **TikTok publish + analytics** loop wired (manual-guide + API methods).
- **Full verify chain** (20+ scene rules, claim audit) gating every video.

---

## Using this template

The pipeline is beat-agnostic. To deploy it on a different subject area using
this repo as a template:

1. **Sources** — edit `scripts/short-video/lib/source-registry.mjs` to point at
   the new beat's news, social, and stock sources.
2. **Content packages** — add new entries under `scripts/short-video/content/`.
3. **Brand** — swap the reference voice and brand tokens (`docs/brand-system.md`)
   for the new channel identity.

The research, RAG, VLM, TTS, rendering, verify, and publish stages carry over
unchanged.

---

## Quick start

### Prerequisites

- Node.js 22 (arm64) and npm
- Python 3.12 (TTS/VLM/whisperx) — shared venv at `~/.video-tts-env`
- FFmpeg full build (`brew install ffmpeg`)
- Ollama with `bge-m3` (RAG)
- Chrome with remote debugging (CDP asset search)

### Install

```sh
git clone <this-repository-url>
cd inside-china-ai
npm install
bash scripts/install-git-hooks.sh   # secret scan + Session-Id gate
cp .env.example .env.local          # fill in keys (search pool keys are SECRET)
npm run dev
```

### Make a video

```sh
# Full pipeline from existing scene-data
node scripts/short-video/main.mjs --content deepseek --bgm

# Render-only (reuse audio)
node scripts/short-video/render-only.mjs --content deepseek --bgm

# Verify a video
node scripts/short-video/verify-video.mjs --content deepseek

# Source assets for a content pipeline
node scripts/short-video/lib/asset-sourcer.mjs --content unitree
```

Or just tell the agent: _"用「华为 AI 芯片突破」这个话题做一条内容"_ — it
runs research → article → video → verify and hands you the candidate.

### Common commands

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Local dev server |
| `npm run lint` / `npx tsc --noEmit` | Lint + type check |
| `npm test` | Test suite (vitest) |
| `node scripts/short-video/main.mjs --content <slug> --bgm` | Produce a video |
| `node scripts/short-video/lib/search-pool.mjs "<query>"` | Multi-engine search CLI |

---

## Documentation

Start with `AGENTS.md`, then `docs/DOCS-INDEX.md` for the full map. Key docs:

| Document | Purpose |
| -------- | ------- |
| `docs/content-pipeline.md` | End-to-end pipeline + HITL rules |
| `docs/video-production-runbook.md` | TTS engines, rendering, publishing |
| `docs/brand-system.md` | Brand identity, logo, color tokens |
| `docs/tiktok/tiktok-best-practices.md` | TikTok algorithm & content rules |
| `docs/tanstack-lovable-conventions.md` | Stack conventions |
| `docs/installed-skills.md` | Agent skills overview & install guide |
| `docs/tools-catalog.md` | External tools/APIs catalog |
| `scripts/short-video/README.md` | Pipeline architecture details |

---

## Built with

- [TanStack Start](https://tanstack.com/start) — full-stack React framework
- [Supabase](https://supabase.com) — PostgreSQL + Auth + RLS
- [Remotion](https://remotion.dev) — programmatic video creation
- [shadcn/ui](https://ui.shadcn.com) — UI components
- [Lovable](https://lovable.dev) — initial project scaffolding

## License

All rights reserved. This project is connected to [Lovable](https://lovable.dev).
