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

| Principle              | Rule                                                  | Why                                                                         |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| **One core message**   | First frame conveys ONE number/word/claim, not a menu | Users scroll at ~1 per second; multi-item frames read as "too much work"    |
| **Text ≥ 32px**        | Minimum 32px on a 1080×1920 canvas; titles ≥ 60px     | At thumbnail size in-feed, < 32px is invisible                              |
| **Upper 2/3 rule**     | Critical content above y=1150 (safe-zone bottom edge) | Below y=1150 sits the subtitle lane (y≈1188–1350) + TikTok caption UI (buttons, captions) |
| **No dead space**      | Fill the full 1920px height — no > 200px gaps         | Blank zones signal "no content" → scroll past                               |
| **Bold color blocks**  | Use solid-color areas (not gradients) for contrast    | Gradients compress poorly at thumbnail size; solid blocks pop               |
| **Asymmetric layout**  | Offset the main element left or right of center       | Centered layouts read as "AI-generated"; asymmetry feels human-designed     |
| **Scan line / motion** | Subtle continuous animation (scan sweep, pulse)       | A static frame in autoplay feed looks like a still image, not a video       |
| **Max 2 stat cards**   | Don't stack 3+ data points on the hook frame          | Users can't parse 3+ numbers in 1 second; 2 is the limit                    |

**Standard hook template**: Scene 1 MUST use the shared `hookScene` opening card (`lib/scene-templates.mjs`) — fixed skeleton (badge → subject → focal → stats/source in the `lib/scene-layout.mjs` slot grid), two focal variants (number-led `bigNumber` / claim-led `hookText`+`revealText`). The focal is mandatory and exclusive, enforced FAIL-level by `checkHookContract`. Data contract in the `hookScene()` docblock (spec: `docs/specs/spec-hook-opening-card.md`). The claim or number renders on frame 1 with no animation delay — the thumbnail itself must carry the hook.

### Silent Autoplay

85% of social media videos start muted. The video must be compelling without sound:

- Burned-in subtitles on all scenes except CTA (hook scene now included)
- Visual data anchors (big numbers, colored bars) that convey meaning without audio
- If the first 3 seconds only make sense with sound, rework them

#### Subtitle Best Practices

Subtitle spec (font, color, position, timing, ASS style line) lives in `docs/brand-system.md` → Subtitle Specification. All values derive from `SUBTITLE_LANE` in `lib/safe-zones.mjs` (single source of truth) — never hardcode them.

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
- Never put critical info below y=1150 (`1920 − SAFE_ZONES.bottom`): the burned-subtitle lane (y≈1188–1350) and TikTok caption UI live there — see Layout Safety in `docs/brand-system.md`
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
- **Pace**: F5-TTS-MLX (cloned voice, steps=32, cfg_strength=3.0). Fallback engines below.
- **Visual**: Cyber Intelligence Briefing — dark, grid, glow, scanlines
- **Colors**: Consistent entity-color mapping across all videos. Amber `#f59e0b` used for key data highlights (Hook scene big numbers) and CTA prompts (FOLLOW FOR MORE — the standard end-card action) for maximum visibility on dark backgrounds. White text uses `#f5f5f5` (not pure `#ffffff`) to reduce dark-mode glare.

## TTS Engine Configuration

> **Max Effort Rule** (2026-08-14): All local TTS models MUST run at max effort by default.
> If the machine cannot handle max effort (MPS OOM, excessive RTF),
> the agent must explicitly notify the user and mark the run as degraded.

| Priority | Engine      | Max Effort Parameters            | Venv                        | Notes                                                              |
| -------- | ----------- | ------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| 1        | **F5-TTS-MLX** | **steps=32, cfg_strength=3.0**, wps=2.8, speed=1.0 | `~/.video-tts-env` (Python 3.12) | **DEFAULT**. Flow Matching on MLX. Best rhythm + natural pacing. Internal `duration` control eliminates atempo. |
| 2        | Qwen3-TTS   | `do_sample=False`, `repetition_penalty=1.3` (greedy search) | `~/.video-tts-env` (Python 3.12) | Autoregressive LLM. Good emphasis on data points, but no duration control. Backup engine. |
| 3        | edge-tts    | en-US-BrianNeural               | npm                         | Network-dependent, retry 3x; no voice cloning. Template voice only. |
| 4        | macOS say   | Daniel, 190 wpm                 | built-in                    | Last resort; no voice cloning                                      |

**F5-TTS-MLX** (DEFAULT):
- Voice cloning via reference audio + reference text (zero-shot)
- Ref audio: `voice-samples/voice-sample-24k.wav`（24kHz mono WAV）
- Ref text: `assets/voice-sample-ref-text.txt`（必须精确匹配 ref audio）
- Model: `lucasnewman/f5-tts-mlx` (HF cache, 1.3GB)
- **缓存加载必须离线**：`huggingface_hub` 加载模型前默认向 HF 发 etag 检查请求（确认本地缓存是否最新）。
  该请求走系统代理，曾出现连接建立后 9 分钟零数据流动的挂死（qwen4-preview, 2026-08-29）——
  推理本身是纯本地的，卡死的只是「查更新」。跑管线前 `export HF_HUB_OFFLINE=1`（权重已在缓存时），
  或先确认代理可用。症状识别：main.mjs 停在 "Loading F5-TTS-MLX model" 超过 3 分钟且
  `nettop` 显示零流量。
- Max effort: `steps=32`, `cfg_strength=3.0`, `method='rk4'`, `speed=1.0`
- Duration: `estimate_target_seconds(text)` — CJK chars / 4.5 + Latin words / 2.8 + punctuation × 0.15s
- Internal `duration` parameter controls audio length precisely → **no atempo needed**
- Post-processing: **silenceremove DISABLED**. Only resample (44.1kHz) applied.
- **Prosody DISABLED** — rubberband introduces mechanical artifacts on F5's natural output.

**Qwen3-TTS** (BACKUP):
- Model: `~/.qwen-tts-model` (Qwen3-TTS-12Hz-0.6B-Base)
- Max effort: `do_sample=False` (greedy search), `repetition_penalty=1.3`
- Post-processing: **silenceremove DISABLED**. Only resample applied.
- No duration control → pacing varies per scene.
- Subtitle alignment may fail due to variable audio lengths.

> Engine selection rationale, alternatives survey, and historical experiments: ADR-0008, `docs/research/voice-cloning-solutions-m2-pro.md`

**Per-Scene Prosody Enhancement**（基于 `visualType`，FFmpeg `rubberband` 滤镜）:

| visualType | Pitch | Tempo | Volume | Label |
| ---------- | ----- | ----- | ------ | ----- |
| `hook` | +4% | +6% | +15% | hook (urgent/energetic + louder) |
| `data` | -2% | -2% | 0% | data (authoritative) |
| `quote` | 0% | -3% | 0% | quote (deliberate/emphasis) |
| `cta` | -2% | -5% | 0% | cta (warm/inviting) |
| 其他 | 无变化 | 无变化 | 无变化 | baseline |

- **F5: DISABLED** — rubberband introduces mechanical artifacts on F5's natural output
- **Qwen**: ENABLED — prosody helps add variation to less-natural engines
- 参数推导：`docs/research/voice-prosody-hook-optimization.md`

**Post-Processing** (applied to all engines):

| Processing | F5 | Qwen | Notes |
| ---------- | -- | ---- | ----- |
| silenceremove | OFF | OFF | Compresses pauses >0.25s. Causes "bursting" at scene transitions. All engines disabled. |
| highpass (80Hz) | ON | ON | Removes low-frequency hum. Disable: `TTS_HIGHPASS=0` |
| afftdn denoise (nr=5) | ON | ON | Removes noise floor. Disable: `TTS_DENOISE=0` |
| rubberband prosody | OFF | ON | Per-scene pitch+tempo. F5 disabled (mechanical artifacts). |
| atempo | OFF | OFF | Post-hoc speed change. Causes mechanical voice. **NEVER use with F5**. |
| resample (44.1kHz) | ON | ON | Standardize sample rate for assembly |

**Force engine**: `export TTS_ENGINE=f5-mlx` / `qwen-tts` / `edge-tts` / `say`

**Subtitle alignment**: Uses `text-align.py` (wav2vec2 forced alignment) — NOT Whisper recognition. We already know the text (from scene-data.mjs), so we align known text to known audio directly. Output: `output/{pipelineId}/audio/subtitle-timing.json`.

## VLM Asset Analysis

The pipeline uses two independent Python subprocesses managed by `visual-analyzer.mjs`:

1. **Focus detector** (`focus_detector.py`, OpenCV) — fast spatial analysis (~180ms/image, <1s startup, ~200MB peak)
2. **VLM** (`vlm_analyzer.py`, Qwen3-VL-8B-8bit via mlx-vlm) — semantic analysis (~20-30s/image, ~100-120s/video, 12-17s model load)

Two-phase execution: Phase 1 `detectFocus()` batch → `closeFocusDetector()` (releases ~200MB) → Phase 2 `describeImage/Video()` + `analyzeFit()` → `closeVisualAnalyzer()` (releases ~11GB).

Graceful degradation: if Python or model unavailable, returns empty strings. Pipeline continues with keyword-only matching.

Video analysis timeout: 180s (`RESPONSE_TIMEOUT_MS`).

> Decisions: ADR-0009 (VLM), ADR-0015 (Focus detection). Alternatives survey: `docs/research/asset-focus-detection-alternatives.md`

## Logo Handling

**Video-grade brand mark**: `scripts/short-video/assets/china-ai-news-mark-video.svg` — viewBox'd, brand-palette fills (`#4d8bff`/`#ef4444`), generated **idempotently** by `scripts/short-video/build-mark-svg.mjs` from `china-ai-news-mark.svg`. Change the mark → edit the source SVG, then re-run the builder. Used in three places:

- **Brand bar** (top-left on opener/mid scenes): 48px, in `brandBar()`
- **Watermark** (top-left on non-brand scenes): 55px, `opacity: 0.35`, at `top: 60px; left: 60px` (`WATERMARK_POS` in `lib/safe-zones.mjs`)
- **CTA scene**: 130px centered in the hero slot — rendered by the shared `ctaScene()` end card (`lib/scene-templates.mjs`), never hand-rolled

> Logo asset creation (PNG→SVG conversion, posterize, vtracer) is a branding task, documented in `docs/brand-system.md`.

## Publishing Strategy

### Platform adaptations

| Platform        | Max Duration | Optimal    | Action                                                    |
| --------------- | ------------ | ---------- | --------------------------------------------------------- |
| YouTube Shorts  | 3min         | 60-170s    | Upload full video + custom thumbnail                      |
| TikTok          | 10min        | **60-70s** | Upload shortened cut (6-8 key scenes)                     |
| Instagram Reels | 90s          | 15-30s     | Upload full video if ≤90s; otherwise create shortened cut |

**Cross-platform default**: Write for 60-90s. YouTube Shorts gets the full version; TikTok needs a shortened cut.

### Title & Cover Strategy

TikTok doesn't have a separate cover image — the first frame of the video IS the cover. The hook scene's first frame is already governed by First Frame Best Practices above. The title (caption first line ≤60 chars) is the SEO signal for the algorithm.

**Agent should design the title explicitly in scene-data** (via `metadata.title`), not rely on `generate-caption.mjs` auto-derivation. `generate-caption.mjs` uses `metadata.title` when available (see `deriveTitle()` in `caption-utils.mjs`).

> TikTok best practices (signal weights, voice rules, hook formulas, audit checklist, auto-check table, manual checklist): `docs/tiktok/tiktok-best-practices.md`. Enforcement: `verify-video.mjs` runs automated checks after every video — do NOT publish until all checks pass.

> Post-publish analytics and optimization: `docs/analytics-workflow.md`.

> Multi-video series strategy, compilation, and series publishing: `docs/series-production-guide.md`.

> Creating a new content pipeline from scratch (directory tree, templates, CSS checklist): `docs/content-scaffold-guide.md`.

## File Locations

### Skills (2)

| Skill                  | Path                                             | Role                                                                 |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `short-video-pipeline` | `~/.catpaw/skills/short-video-pipeline/SKILL.md` | Workflow steps + Defaults + Architecture reference                   |
| `brand-system`         | `~/.catpaw/skills/brand-system/SKILL.md`         | Brand methodology — reads `docs/brand-system.md` and enforces tokens |

### Docs (2)

| Doc            | Path                     | Role                                                                                        |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| Video workflow | `docs/video-workflow.md` | ← **THIS FILE** — best practices, publishing strategy, file inventory, optimization lessons |
| Brand system   | `docs/brand-system.md`   | Color tokens, typography, animation library, 9 scene templates, media strategy (Route C)    |

### AGENTS.md (1)

| Section          | Path                                | Role                                                                       |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Content Pipeline | `AGENTS.md` → `## Content Pipeline` | Entry point — tells agent to load skills + read this file for optimization |

### Code — Pipeline

```text
scripts/short-video/
├── main.mjs                # Pipeline orchestrator (--content, --bgm, --skip-verify, --skip-dom-check, --max-retries)
├── render-only.mjs         # Re-render from existing audio (no TTS) — fast visual/subtitle iteration
├── verify-subtitles.mjs    # CLI wrapper — subtitle verification
├── text-align.py           # wav2vec2 forced alignment (known text → audio)
├── qwen_tts_batch.py       # Qwen3-TTS batch TTS (fallback engine)
├── lib/                    # Shared infrastructure (content-agnostic)
│   ├── tts/                # TTS engine registry + adapters
│   │   ├── registry.mjs    # Engine selector (F5-MLX > Qwen3 > edge-tts > say)
│   │   ├── f5-mlx.mjs       # F5-TTS-MLX adapter (DEFAULT)
│   │   ├── qwen-tts.mjs    # Qwen3-TTS adapter (backup)
│   │   ├── edge-tts.mjs    # edge-tts adapter (network fallback)
│   │   ├── say.mjs         # macOS say adapter (last resort)
│   │   └── post-process.mjs # Audio post-processing (silenceremove + prosody)
│   ├── timeline.mjs        # Frame-exact scene durations + offsets (single source of truth)
│   ├── subtitles/
│   │   ├── cues.mjs        # Alignment → cues (chunking + Netflix timing rules)
│   │   ├── ass.mjs         # ASS render + parse (\kt anchors, 1ms precision)
│   │   └── generate.mjs    # Entry point: timing JSON → subtitles.ass
│   ├── assemble.mjs        # FFmpeg assembly + ASS burn-in + BGM mix
│   ├── record-scenes.mjs   # Playwright recording (1080×1920)
│   ├── generate-bgm.mjs    # Procedural cyber-ambient BGM
│   ├── verify-subtitles.mjs # Reads back the .ass and checks it against the alignment data
│   ├── verify-retry.mjs    # Verify-retry loop: classify failure → repair → re-verify (--max-retries)
│   ├── audio/
│   │   ├── wav.mjs         # Mono s16 PCM WAV read/write + ffmpeg decode bridge
│   │   ├── fft.mjs         # Radix-2 FFT + cross-correlation onset finder
│   │   ├── track.mjs       # Gapless voiceover master (pad each scene to its clip length)
│   │   ├── sync.mjs        # End-to-end check: scene onsets measured in the SHIPPED audio
│   │   └── diagnostics.mjs # FAIL-time bundle: drift table, packet gaps, stream durations
│   └── base-styles.mjs     # Shared visual system (CSS vars, backgrounds, animations, brand SVG)
├── content/                # Content pipelines (each article = one dir)
│   ├── deepseek/           # DeepSeek story
│   │   ├── meta.mjs        # { pipelineId: "deepseek" }
│   │   ├── scene-data.mjs  # 12 scenes (voiceover, texts, visualType)
│   │   └── scenes.mjs      # 12 visual templates (read scene.texts)
│   └── distillation/       # LLM distillation series
│       ├── pt1/            # Part 1 (8 unique scenes, red/glitch DNA)
│       ├── pt2/            # Part 2 — Kimi's Gambit (9 scenes)
│       └── pt3/            # Part 3 — The Fallout (9 scenes)
├── assets/
│   ├── voice-sample-24k.wav # F5/Qwen3 ref audio (24kHz mono)
│   ├── voice-sample-ref-text.txt # F5/Qwen3 ref text (must match ref audio exactly)
│   └── logos/              # Company logos (deepseek.svg, ...)
└── output/                 # Pipeline outputs (isolated per pipelineId)
    └── {pipelineId}/
        ├── audio/          # TTS audio + subtitle-timing.json
        ├── scenes/         # HTML scene files
        ├── video/          # Recorded WebM per scene
        ├── subtitles.ass   # ASS subtitle file
        ├── verification-report.json # Subtitle verification report
        └── {pipelineId}-short.mp4  # Final video
```

### Key Paths & Environment

| Item | Path / Value | Notes |
|------|-------------|-------|
| ffmpeg-full | `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` | Contains libass (subtitle burn-in). Plain ffmpeg lacks subtitles filter. |
| Unified TTS venv | `~/.video-tts-env` (Python 3.12) | F5-TTS-MLX + Qwen3-TTS + whisperx |
| Qwen3-TTS model | `~/.qwen-tts-model` | Qwen3-TTS-12Hz-0.6B-Base |

## Running the Pipeline

```bash
# DeepSeek video (default content)
node scripts/short-video/main.mjs --content deepseek --bgm

# Distillation pt1
node scripts/short-video/main.mjs --content distillation/pt1 --bgm

# Skip BGM
node scripts/short-video/main.mjs --content deepseek

# Skip subtitle verification (fast iteration)
node scripts/short-video/main.mjs --content deepseek --bgm --skip-verify

# Set max retry attempts for subtitle verification (default 2)
node scripts/short-video/main.mjs --content deepseek --max-retries 3

# Standalone subtitle verification (output-dir enables the end-to-end audio sync check)
node scripts/short-video/verify-subtitles.mjs <video.mp4> <subtitles.ass> <subtitle-timing.json> <scene-durations.json> [output-dir]

# Re-render without re-running TTS (visual or subtitle changes only)
node scripts/short-video/render-only.mjs --content restraint/pt1
```

### Pipeline Steps

| Step | Action | Output |
|------|--------|--------|
| 1 | Generate TTS voiceover (F5-TTS-MLX) | `output/{id}/audio/scene-*.mp3` + `subtitle-timing.json` |
| 2 | Generate HTML scene templates | `output/{id}/scenes/scene-*.html` |
| 2.5 | **DOM layout verification — hard gate** (safe zones / right rail / overflow, headless Chromium). Per-pipeline config from `content/<dir>/dom-config.mjs` (optional, defaults if absent). FAIL aborts before recording; `--skip-dom-check` is a debug-only escape hatch (all content dirs migrated) | `verify-scene-dom.mjs` report |
| 3 | Record scene videos (`--remotion` flag or `meta.renderer === "remotion"` → Remotion path; default → Playwright legacy path) | `output/{id}/video/scene-*.webm` |
| 3.5 | Generate BGM (optional, `--bgm`) | `output/{id}/bgm.mp3` |
| 4 | Generate ASS subtitles | `output/{id}/subtitles.ass` |
| 5 | Assemble final video (FFmpeg) | `output/{id}/{id}-v{version}-short.mp4` + `{id}-short.mp4` (latest copy) |
| 6 | Verify subtitles with auto-retry (auto, `--skip-verify` to skip, `--max-retries N` default 2) | `output/{id}/verification-report.json` |

### Version Numbers

Every pipeline run generates a **versioned output file**: `{pipelineId}-v{YYYY-MM-DDTHH-MM-SS}-short.mp4`.

A **latest copy** (`{pipelineId}-short.mp4`) is also created for compatibility with verify-video.mjs and other tools.

```bash
# List all versions, newest first
ls -lt output/restraint-pt1/restraint-pt1-v*-short.mp4

# Check creation time of latest
stat -f "%Sm" output/restraint-pt1/restraint-pt1-short.mp4
```

### Gapless Audio Track

The final video's audio is ONE continuous track: scene clips are encoded video-only (`-an`); voiceovers are padded with real silence to frame-aligned clip lengths and concatenated into a PCM master (`voiceover.wav`). End-to-end sync verification runs in Step 6 (cross-correlation FFT, >80ms drift = FAIL). Failure diagnostics bundle auto-dropped on FAIL.

> Root cause analysis, fix implementation, and diagnostics format: `docs/research/audio-drift-fix.md`

### Running in Background (MANDATORY for TTS)

F5-TTS-MLX model loading + TTS generation (steps=32) takes 12-15 minutes, and full pipeline runs 15-20 minutes.
Agent commands have a 3-minute timeout for foreground execution. **Always run the pipeline in background:**

```bash
# ✅ Correct — background execution, no timeout
node scripts/short-video/main.mjs --content restraint/pt1 --bgm 2>&1 | tee /tmp/pipeline.log &

# ❌ Wrong — foreground, will timeout after 3 minutes
node scripts/short-video/main.mjs --content restraint/pt1 --bgm
```

After starting, poll progress with `cat /tmp/pipeline.log | tail -30` at 2-minute intervals.
Do NOT start a second pipeline while the first is still running — check `ps aux | grep main.mjs` first.

---

## Design Decisions & References

When modifying rules in this file, consult these reference docs for root cause and rationale:

| Topic | Reference | Content |
|-------|-----------|---------|
| TTS engine selection | ADR-0008, `docs/research/voice-cloning-solutions-m2-pro.md` | Engine comparison, alternatives survey |
| Audio drift fix | `docs/research/audio-drift-fix.md` | Root cause analysis, fix implementation, sync verification, diagnostics |
| Per-scene prosody (pitch/tempo) | `docs/research/voice-prosody-hook-optimization.md` | 15 sources, per-parameter rationale, research citations |
| TikTok best practices | `docs/tiktok/tiktok-best-practices.md` | Signal weights, voice rules, hook formulas, audit checklist |
| A/B testing methodology | `docs/tiktok/ab-testing-methodology.md` | Element iteration method, single-variable testing philosophy |
| Multi-video splitting | `docs/series-production-guide.md` (L1) | Episode splitting strategy, inter-episode linking, compilation |
| New content scaffold | `docs/content-scaffold-guide.md` (L1) | Directory structure, file templates, CSS overflow checklist |
| Analytics & optimization | `docs/analytics-workflow.md` (L1) | Analytics export, A/B test tracking, optimization loop |
| Brand visual identity | `docs/brand-system.md` | Color tokens, typography, animation library, scene templates |
