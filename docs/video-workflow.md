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

- Burned-in subtitles on all scenes except CTA (hook scene now included)
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
| Timing | **Force-aligned** via ffmpeg silencedetect | Actual audio silence boundaries, not word-count estimate |
| Scene 1 | ✅ Now has subtitles (was skipped) | User feedback: subtitles should appear from the start |

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
| 1 | XTTS v2 | speaker_wav (cloned) or "Craig Gutsy" | 1.15 | `~/.xtts-env` (Python 3.11) | Batch mode; **MPS hybrid** (GPT on MPS, HiFi-GAN on CPU) |
| 2 | Kokoro | voice="am_michael" | 1.1 | `~/.tts-env` (Python 3.12) | 54 voices available; fastest on CPU |
| 3 | edge-tts | en-US-BrianNeural | +8% | npm | Network-dependent, retry 3x |
| 4 | macOS say | Daniel | 190 wpm | built-in | Last resort |

**Voice cloning**: `export TTS_SPEAKER_WAV=assets/voice-sample.wav` — XTTS clones from denoised WAV sample.
- Source: M4A file → ffmpeg denoise (afftdn) + resample 22050Hz mono → WAV
- Clone test: 10.8s per sentence (MPS hybrid), quality confirmed
- Cloned voices sound more natural than built-in speakers (less robotic)

**MPS hybrid mode** (2x faster than CPU):
- Patch XTTS source: `tts/models/xtts.py` line 577 + line 320 (add `.cpu()` to gpt_latents/speaker_embedding/speaker_encoder input)
- GPT runs on MPS (Apple GPU), HiFi-GAN decoder runs on CPU (avoids conv1d crash)
- PyTorch 2.5.1 required (2.13.0 breaks model loading via `weights_only` default change)

**Subtitle alignment**: Uses `force-align.py` (ffmpeg silencedetect) — NOT Whisper recognition.
- We already know the text (machine-generated), so we align known text to known audio via silence boundaries
- Whisper recognition approach was wrong (TTS audio ≠ natural speech, recognition errors)

**Known issues**:
- XTTS batch script outputs JSON to stdout, but TTS engine also prints sentence-split `["text"]` → JSON parser must look for `[{"sceneId"` prefix
- XTTS has 59 built-in speakers (list with `tts.synthesizer.tts_model.speaker_manager.name_to_id`)

## Logo Handling

- **Source**: GPT-generated PNG (`assets/china-ai-news-logo-gpt.png`, 1024×1024)
- **Vector SVG**: `vtracer` converts PNG to SVG (867 paths after noise removal)
  - Command: `vtracer --input logo.png --output logo.svg --filter_speckle 8 --color_precision 3`
  - Post-process: Python script removes gray anti-aliasing artifacts (1415→867 paths)
- **PNG split**: Two versions available:
  - `china-ai-news-logo-gpt.png` — full logo (image + text)
  - `china-ai-news-logo-image-only.png` — pure graphic only (no text, 92K pixels)
- **Watermark**: Same logo at 55px, `opacity: 0.18`, `bottom: 50px, right: 50px`
- **CTA scene**: Logo at 200px centered

## Publishing Strategy

### Platform adaptations

| Platform | Max Duration | Optimal | Action |
|----------|-------------|---------|--------|
| YouTube Shorts | 3min | 60-170s | Upload full video + custom thumbnail |
| TikTok | 10min | **60-70s** | Upload shortened cut (6-8 key scenes) |
| Instagram Reels | 90s | 15-30s | Upload full video if ≤90s; otherwise create shortened cut |

**Cross-platform default**: Write for 60-90s. YouTube Shorts gets the full version; TikTok needs a shortened cut.

### TikTok Best Practices Integration

> Based on 2025-2026 research via Chrome CDP. Full details: `docs/tiktok-best-practices.md` and `docs/tiktok-do-dont.md`.
>
> **Enforcement**: `scripts/short-video/verify-video.mjs` runs automated checks after every video. This is **Step 6** of the pipeline workflow (see `short-video-pipeline` SKILL.md). Do NOT publish until all automated checks pass.

#### ✅ Fully automated (checked by verify-video.mjs)

| Check | How | Fail action |
|-------|-----|-------------|
| Resolution 1080×1920 | ffprobe | Fix record-scenes.mjs viewport |
| Duration (YouTube ≤180s / TikTok ≤70s) | ffprobe | Cut scenes |
| Frame rate 23-60fps | ffprobe | Check assemble.mjs |
| Hook has compelling element (number/strong word) | Scan scene-data Scene 1 | Rewrite hook voiceover |
| Source attribution (≥2 scenes mention sources) | Scan all scene voiceovers | Add "Bloomberg reported..." etc. |
| SEO keywords in ≥2 scenes (China/AI/DeepSeek) | Scan voiceover + texts | Add keywords to more scenes |
| Share-worthy data points (≥50% scenes have numbers) | Scan voiceover + texts | Add concrete numbers |
| All scenes have subtitle timing | Check subtitle-timing.json | Re-run force-align.py |
| Scene 1 (hook) has subtitles | Check timing for sceneId=1 | Re-run force-align.py |
| No cross-platform watermark references | Scan scene data | Remove references |
| No clickbait patterns in hook | Regex check Scene 1 voiceover | Rewrite to be factual |
| No unverified "sources say" claims | Scan voiceovers | Add specific source attribution |

#### 🔧 Agent-assisted at scene-data creation time (prompt-driven, not code)

These are enforced by the agent when writing `scene-data.mjs`, not by code. The agent should follow these rules when creating content:

| Rule | Agent prompt | Checked by verify-video.mjs? |
|------|------------|------------------------------|
| SEO keywords in voiceover | Include "China AI", "DeepSeek" naturally | ✅ Yes (keyword count check) |
| SEO keywords on screen | Add to `texts` array | ✅ Yes (keyword count check) |
| Share-worthy data points | Design hook with surprising numbers | ✅ Yes (number count check) |
| Source attribution | "Bloomberg reported...", "Liang said..." | ✅ Yes (source count check) |
| Hook is factual not clickbait | Compelling but factual | ✅ Yes (clickbait regex check) |
| Every scene has a concrete fact | No filler scenes | ⚠️ Manual (agent judgment) |
| Causal flow between scenes | Cause → effect → implication | ⚠️ Manual (agent judgment) |

#### 👤 Manual at publish time (output of verify-video.mjs, presented as checklist)

| Item | Detail |
|------|-------|
| 3-5 hashtags | `#chinaai #deepseek #ai #technews #chinatech` |
| Geographic tag | China/US location tag |
| In-app editing | Upload to TikTok, add sticker/effect, then publish |
| Reply to comments (first hour) | Post → monitor → respond |
| Post at off-peak hours | Check TikTok analytics |
| Pinned comment | Article URL |
| Title under 60 chars | Write in TikTok UI |
| AIGC label | Label as AI-generated if AI voice used |
| Trending audio | Add from TikTok audio library |

#### ❌ Algorithm penalty (auto-checked, blocks publish)

| Don't | Check | Fail action |
|-------|-------|-------------|
| Cross-platform watermarks | Scan scene data for @instagram etc. | Remove references |
| Clickbait hooks | Regex: "you won't believe" etc. | Rewrite hook |
| Unverified "sources say" | Scan for attribution | Add specific source |
| Duration >90s for TikTok | ffprobe duration | Create shortened cut |

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
├── force-align.py          # Subtitle alignment via ffmpeg silencedetect (replaces whisper)
├── verify-video.mjs        # TikTok best practices compliance gate (Step 6, MANDATORY)
├── whisper-align.py        # [deprecated] Whisper word-level timestamps — use force-align.py instead
├── run-whisper.mjs         # [deprecated] Run whisper-align on existing audio
├── setup-tts.sh            # TTS environment setup script
├── tts-test.mjs            # TTS voice comparison tester
├── tts-config-log.md       # TTS config history (voice/speed per run)
└── output/
    ├── audio/              # TTS audio per scene + subtitle-timing.json
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

### Assets

```text
scripts/short-video/assets/
├── china-ai-news-logo-gpt.png        # GPT-generated original PNG (full logo)
├── china-ai-news-logo-image-only.png # Pure graphic only (no text)
├── china-ai-news-logo-vector.svg     # vtracer SVG (867 paths, noise removed)
├── china-ai-news-logo-clean.svg      # vtracer SVG before noise removal (1134 paths)
├── china-ai-news-logo-vtracer.svg    # vtracer original output (1415 paths)
├── voice-sample.wav                   # Denoised voice sample for XTTS cloning
├── audio4507181385.m4a                # Original M4A recording (6 min)
└── deepseek-logo.svg                  # DeepSeek logo for video
```

## Pipeline Optimization Lessons

### Session 2026-07-31
1. **XTTS per-scene model reload** → batch script loads model once (7 min vs 60+ min)
2. **XTTS stdout JSON pollution** → search for `[{"sceneId"` prefix
3. **BGM default off** → documented `--bgm` flag

### Session 2026-08-01
4. **XTTS MPS hybrid mode** → patch lines 577+320, GPT on MPS + HiFi-GAN on CPU (2x speedup: 8s vs 16s/sentence)
5. **Voice cloning** → M4A→WAV denoise→XTTS clone. Patched speaker_encoder for MPS. 10.8s/sentence.
6. **Subtitle sync** → force-align.py (ffmpeg silencedetect), NOT Whisper recognition. We already know the text.
7. **Scene 1 subtitles** → removed skip condition, subtitles now appear from the start
8. **SVG logo** → vtracer (867 paths) replaces potrace/PNG-base64. True vector, noise removed.
9. **PNG split** → pure-image version + full version for different use cases
10. **render-only.mjs** → re-render HTML+record+assemble without re-running TTS
11. **Chrome CDP** → web-access skill for TikTok best practices research (Playwright fails on most sites)

### 2025 TikTok Best Practices (from Google + Hootsuite + Buffer via CDP)
- **Hook**: first 3 seconds — shocking statement, visual cue, or clear promise
- **Length**: 5-12s for looping or 60-70s for storytelling (our 170s is for YouTube Shorts only)
- **Pattern interrupts**: rapid cuts, text overlays, dynamic visual transitions
- **SEO**: keywords in on-screen text, captions, verbal hooks
- **Hashtags**: avoid #FYP, mix broad + niche
- **Shares**: most highly-weighted metric in TikTok algorithm
- **Captions**: burned-in subtitles (accessibility + engagement)
- **Authenticity**: casual, relatable > polished corporate
- **In-app editing**: edit within TikTok for algorithm favor (manual step)

### Open TODOs
- [ ] Create 60-70s TikTok-optimized cut (select 6-8 key scenes from full video)
- [ ] Try `vtracer --filter_speckle 16+` for even cleaner SVG
- [ ] Update generate-tts.mjs to call force-align.py instead of whisper-align.py
- [ ] Voice clone: try 15-20s sample + lighter denoise (nr=8) for higher speaker similarity
- [ ] Sprout Social 2026 articles (algorithm, video specs) — URL 404, need correct URLs from site navigation
