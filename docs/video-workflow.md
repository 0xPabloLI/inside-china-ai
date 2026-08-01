# China AI News — Video Production Workflow

> The **workflow steps** (research → write scene-data → run pipeline → thumbnail → quality check) live in the `short-video-pipeline` skill. This document covers project-specific content: content standards, best practices, publishing strategy, and file locations.

## Best Practices

### Duration

**DEFAULT: 30-60 seconds.** This is the cross-platform sweet spot — one cut works on YouTube Shorts, TikTok, and Instagram Reels. Only override with an explicit reason from the user. Never exceed 90s (Reels' hard limit).

### Hook-First Design

The first 3 seconds determine 70% of completion rate. Rules:

- **First frame**: visually striking — bold text, breaking news badge, or large number
- **First sentence**: must deliver the core hook, not a setup
- **No slow fades** on the hook scene — start at full impact
- **No logo-only open** — the brand comes at the CTA, not the opener

#### First Frame Best Practices (TikTok / YouTube Shorts / Reels)

Based on platform research and session learnings:

| Principle | Rule | Why |
|-----------|------|-----|
| **One core message** | First frame conveys ONE number/word/claim, not a menu | Users scroll at ~1 per second; multi-item frames read as "too much work" |
| **Text ≥ 32px** | Minimum 32px on a 1080×1920 canvas; titles ≥ 60px | At thumbnail size in-feed, < 32px is invisible |
| **Upper 2/3 rule** | Critical content in top 1280px (of 1920) | Bottom 640px gets covered by platform UI (buttons, captions, title overlay) |
| **No dead space** | Fill the full 1920px height — no > 200px gaps | Blank zones signal "no content" → scroll past |
| **Bold color blocks** | Use solid-color areas (not gradients) for contrast | Gradients compress poorly at thumbnail size; solid blocks pop |
| **Asymmetric layout** | Offset the main element left or right of center | Centered layouts read as "AI-generated"; asymmetry feels human-designed |
| **Scan line / motion** | Subtle continuous animation (scan sweep, pulse) | A static frame in autoplay feed looks like a still image, not a video |
| **Max 2 stat cards** | Don't stack 3+ data points on the hook frame | Users can't parse 3+ numbers in 1 second; 2 is the limit |

### Silent Autoplay

85% of social media videos start muted. The video must be compelling without sound:

- Burned-in subtitles on all analysis scenes (skipped on hook & CTA which have full-screen text)
- Visual data anchors (big numbers, colored bars) that convey meaning without audio
- If the first 3 seconds only make sense with sound, rework them

#### Subtitle Best Practices

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Font size | **42px** (was 34px) | Must be readable at phone size + thumbnail scale |
| Font weight | **800** (bold) | Thin text vanishes on bright backgrounds |
| Chunks | **3-7 words** per display | Users read ~2.5 words/sec; longer chunks get skipped |
| Background | `rgba(0,0,0,0.75)` + 1px border | Ensures contrast on any scene |
| Position | `bottom: 200px` | Above platform UI zone (~180px from bottom) |
| Timing | Estimated by word count (~2.8 words/sec) | TODO: use whisper/aeneas for actual audio alignment |

### Pacing

- Scene changes every 6-12 seconds (attention drops after 12s without visual change)
- Within each scene, CSS animations provide staggered visual reveals
- TTS silence compressed via FFmpeg silenceremove (pauses >0.25s → 0.08s)

### Audio

- TTS at full volume
- BGM off by default (TikTok/Reels auto-add their own). Enable with `--bgm` flag: procedural cyber-ambient at 12% volume, fades in 2s, fades out last 3s
- All audio 192k AAC, 44100Hz

### Mobile-First Vertical (9:16)

**Resolution: 1080×1920.** This is the universal vertical format:

- TikTok: 1080×1920 (9:16), 5-10min max
- YouTube Shorts: 1080×1920 (9:16), 3min max
- Instagram Reels: 1080×1920 (9:16), 90s max

**Design rules for vertical:**
- Content flows top-to-bottom in a natural reading order
- Never put critical info in the bottom 180px (platform UI overlay zone)
- Use absolute positioning with explicit `top:` values — not flex centering (which can shift with dynamic content)
- Test at thumbnail size: if text is unreadable at 240×426 (1/4 scale), it's too small

## Content Standards

- **Information density**: every scene delivers a concrete fact or insight, not filler
- **Causal flow**: scenes build on each other — cause → effect → implication
- **Source attribution**: mention sources in voiceover ("Bloomberg reported...", "Liang said...")
- **No clickbait**: hooks are factual but dramatic, not misleading
- **English voiceover**: global audience. Chinese names romanized.

## Brand Voice

- **Tone**: Intelligence briefing. Authoritative, fast, no fluff.
- **Pace**: XTTS v2 (Craig Gutsy, speed=1.15) or Kokoro (am_michael, speed=1.1), silenceremove post-process
- **Visual**: Cyber Intelligence Briefing — dark, grid, glow, scanlines
- **Colors**: Consistent entity-color mapping across all videos

## TTS Engine Configuration

| Priority | Engine | Config | Speed | Venv | Notes |
|----------|--------|--------|-------|------|-------|
| 1 | XTTS v2 | speaker="Craig Gutsy" | 1.15 | `~/.xtts-env` (Python 3.11) | Batch mode (load once); CPU only (MPS crashes HiFi-GAN) |
| 2 | Kokoro | voice="am_michael" | 1.1 | `~/.tts-env` (Python 3.12) | 54 voices available; fastest |
| 3 | edge-tts | en-US-BrianNeural | +8% | npm | Network-dependent, retry 3x |
| 4 | macOS say | Daniel | 190 wpm | built-in | Last resort |

**Voice cloning**: `export TTS_SPEAKER_WAV=/path/to/voice.wav` — XTTS will clone from 3-10s sample.

**Known issues**:
- XTTS MPS mode → HiFi-GAN decoder crash → **must use CPU** (~1 min/scene)
- XTTS batch script outputs JSON to stdout, but TTS engine also prints sentence-split `["text"]` → JSON parser must look for `[{"sceneId"` prefix
- XTTS has 59 built-in speakers (list with `tts.synthesizer.tts_model.speaker_manager.name_to_id`)

## Logo Handling

- **Source**: GPT-generated PNG (`assets/Weixin Image_*.png`)
- **Pipeline**: Read PNG as base64, embed in SVG `<image>` wrapper → inlined into HTML
- **Why not potrace?**: GPT-generated images have gradients + anti-aliasing → potrace color-layer tracing produces visually different results
- **Watermark**: Same logo at 55px, `opacity: 0.18`, `bottom: 50px, right: 50px`
- **CTA scene**: Logo at 200px centered

## Publishing Strategy

### Platform adaptations

| Platform | Max Duration | Optimal | Action |
|----------|-------------|---------|--------|
| YouTube Shorts | 3min | 30-60s | Upload full video + custom thumbnail |
| TikTok | 10min | 15-30s | Upload full video (same cut as YouTube) |
| Instagram Reels | 90s | 15-30s | Upload full video if ≤90s; otherwise create shortened cut |

**Cross-platform default**: Write for 30-60s. One cut works for all three platforms. If a topic needs more depth, accept up to 90s max — never exceed Reels' hard limit.

### Posting checklist

- [ ] Title: compelling, under 60 characters
- [ ] Description: 2-3 sentence summary + hashtags
- [ ] Pinned comment: link to full article (when domain is live)
- [ ] Hashtags: #chinaai #deepseek #ai #technews

## File Locations

### Skills (2)

| Skill | Path | Role |
|-------|------|------|
| `short-video-pipeline` | `~/.catpaw/skills/short-video-pipeline/SKILL.md` | Workflow steps + Defaults + Architecture reference |
| `brand-system` | `~/.catpaw/skills/brand-system/SKILL.md` | Brand methodology — reads `docs/brand-system.md` and enforces tokens |

### Docs (2)

| Doc | Path | Role |
|-----|------|------|
| Video workflow | `docs/video-workflow.md` | ← **THIS FILE** — best practices, publishing strategy, file inventory, optimization lessons |
| Brand system | `docs/brand-system.md` | Color tokens, typography, animation library, 9 scene templates, media strategy (Route C) |

### AGENTS.md (1)

| Section | Path | Role |
|--------|------|------|
| Video Production | `AGENTS.md` → `## Video Production` | Entry point — tells agent to load skills + read this file for optimization |

### Code — Pipeline

```text
scripts/short-video/
├── scene-data.mjs          # EDIT THIS — scene definitions
├── generate-tts.mjs        # TTS engine config (XTTS > Kokoro > edge-tts > say)
├── xtts_batch_tts.py       # XTTS v2 batch TTS (loads model once for all scenes)
├── kokoro_tts.py            # Kokoro TTS single-scene script
├── generate-scenes.mjs     # HTML/CSS scene templates + burned-in subtitles
├── generate-bgm.mjs        # Procedural cyber-ambient BGM
├── record-scenes.mjs       # Playwright recording
├── assemble.mjs            # FFmpeg assembly + BGM mix
├── assemble-only.mjs       # Re-assemble from existing audio+video (skip TTS+recording)
├── render-only.mjs         # Re-render HTML + record + assemble (skip TTS)
├── main.mjs                # Pipeline orchestrator (--bgm flag for BGM)
├── preview.mjs             # Single-scene preview (validate before full pipeline)
├── png-to-svg.py           # Logo PNG→SVG converter (potrace, deprecated)
├── setup-tts.sh            # TTS environment setup script
├── tts-test.mjs            # TTS voice comparison tester
├── tts-config-log.md       # TTS config history (voice/speed per run)
└── output/
    ├── audio/              # TTS audio per scene
    ├── scenes/             # HTML scene files
    ├── video/              # Recorded WebM per scene
    └── deepseek-short.mp4  # Final video
```

### Code — Thumbnail

```text
scripts/
├── youtube-thumbnail.html  # EDIT THIS — thumbnail content
└── generate-thumbnail.mjs  # Thumbnail renderer
```

## Pipeline Optimization Lessons (Session 2026-07-31)

### Fixed issues
1. **XTTS per-scene model reload** → batch script loads model once (7 min vs 60+ min)
2. **XTTS MPS HiFi-GAN crash** → CPU mode (reliable but slower)
3. **XTTS stdout JSON pollution** → search for `[{"sceneId"` prefix
4. **SVG conversion lossy** → embed original PNG as base64 in SVG wrapper
5. **BGM default off** → documented `--bgm` flag

### Open TODOs
- [ ] Subtitle timing: replace word-count estimate with actual audio alignment (whisper/aeneas)
- [ ] Scene re-render without re-doing TTS (currently must re-run full pipeline for HTML changes)
- [ ] Single-scene preview mode (validate before full pipeline run)
- [ ] XTTS MPS support (wait for PyTorch fix or use CUDA GPU)
