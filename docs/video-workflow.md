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
> This means using the highest quality parameters each model supports.
> If the machine cannot handle max effort (MPS OOM, excessive RTF),
> the agent must explicitly notify the user and mark the run as degraded.

| Priority | Engine      | Max Effort Parameters            | Venv                        | Notes                                                              |
| -------- | ----------- | ------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| 1        | **F5-TTS-MLX** | **steps=32, cfg_strength=3.0**, wps=2.8, speed=1.0 | `~/.f5-tts-env` (Python 3.14) | **DEFAULT**. Flow Matching on MLX. Best rhythm + natural pacing. Internal `duration` control eliminates atempo. |
| 2        | Qwen3-TTS   | `do_sample=False`, `repetition_penalty=1.3` (greedy search) | `~/.qwen-tts-env` (Python 3.12) | Autoregressive LLM. Good emphasis on data points, but no duration control. Backup engine. |
| 3        | CosyVoice 3 | `speed=1.0` (only adjustable param) | `~/.cosyvoice-env` (Python 3.11) | LLM + Flow Matching. Content accuracy issues on MPS. DEPRECATED. |
| 4        | edge-tts    | en-US-BrianNeural               | npm                         | Network-dependent, retry 3x; no voice cloning. Template voice only. |
| 5        | macOS say   | Daniel, 190 wpm                 | built-in                    | Last resort; no voice cloning                                      |

**F5-TTS-MLX** (DEFAULT — best rhythm + natural pacing):

- Flow Matching model on Apple Silicon MLX
- Voice cloning via reference audio + reference text (zero-shot)
- Ref audio: `voice-samples/voice-sample-24k.wav`（24kHz mono WAV）
- Ref text: `assets/voice-sample-ref-text.txt`（必须精确匹配 ref audio 的文字内容）
- Model: `lucasnewman/f5-tts-mlx` (HF cache, 1.3GB)
- **Max effort parameters** (in `f5_mlx_batch_tts.py`):
  - `steps=32` — maximum inference steps (default 8, we use 4x for best quality)
  - `cfg_strength=3.0` — strongest ref-audio guidance (default 2.0, we use 1.5x for better voice cloning)
  - `method='rk4'` — best ODE solver (default)
  - `wps=2.8` — words per second target for duration calculation
  - `speed=1.0` — no post-generation speed change (duration controls pace internally)
- Internal `duration` parameter controls audio length precisely → **no atempo needed**
- Post-processing: **silenceremove DISABLED** (F5 generates clean audio). Only resample (44.1kHz) applied.
- **Prosody DISABLED** (2026-08-14): rubberband post-hoc pitch/tempo shift introduces mechanical artifacts on F5's already-natural output. F5's internal duration control provides natural pacing.
- F5 does NOT do emphasis on specific words (e.g., "age, income") — it treats all text uniformly. Qwen is better at this.

**Qwen3-TTS** (BACKUP — good emphasis, variable pacing):

- Qwen3-TTS-12Hz-0.6B-Base: autoregressive LLM with codec tokens
- Same ref audio + ref text as F5
- Model: `~/.qwen-tts-model`
- **Max effort parameters** (in `qwen_tts_batch.py`):
  - `do_sample=False` — greedy search (NOT sampling). Sampling causes repetitive non-EOS loops. Greedy search naturally stops at EOS.
  - `repetition_penalty=1.3` — slightly above default 1.05 to prevent repetition loops
  - No `max_new_tokens` limit — let model stop naturally at EOS token (2150)
- Post-processing: **silenceremove DISABLED**. Only resample applied.
- Qwen naturally emphasizes data points ("age, income, education") — useful for data-heavy scenes.
- No duration control → pacing varies per scene. Cannot be made tighter.
- Subtitle alignment may fail due to variable audio lengths.

**CosyVoice 3** (DEPRECATED — content accuracy issues on MPS):

- LLM + Flow Matching; previously primary engine, now deprecated after A/B comparison
- Content generation errors on MPS (wrong words, garbled output) at speed=1.0
- Only adjustable parameter: `speed` (default 1.0; speed=2.0 caused mechanical voice)
- Model: `~/.cosyvoice-models/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B`
- No max effort parameters beyond speed

**CSM 1B** (DEPRECATED — MPS memory exhaustion):

- CSM (Conversational Speech Model) 1B by Sesame AI
- Fixed `temperature=0.6, topk=30` — no max effort variant available
- MPS memory exhaustion issues (187-frame generation loop without `torch.inference_mode()`)
- Even with fixes (float16, inference_mode), RTF ~2-3x — too slow for production
- No duration or speed control parameter

**Per-Scene Prosody Enhancement**（基于 `visualType`，FFmpeg `rubberband` 滤镜）:

| visualType | Pitch | Tempo | Volume | Label |
| ---------- | ----- | ----- | ------ | ----- |
| `hook` | +4% | +6% | +15% | hook (urgent/energetic + louder) |
| `data` | -2% | -2% | 0% | data (authoritative) |
| `quote` | 0% | -3% | 0% | quote (deliberate/emphasis) |
| `cta` | -2% | -5% | 0% | cta (warm/inviting) |
| 其他 | 无变化 | 无变化 | 无变化 | baseline |

- **F5: DISABLED** — rubberband introduces mechanical artifacts on F5's natural output
- **Qwen/CosyVoice**: ENABLED — prosody helps add variation to less-natural engines
- 参数推导：`docs/research/voice-prosody-hook-optimization.md`

**Post-Processing** (applied to all engines):

| Processing | F5 | Qwen | CosyVoice | Notes |
| ---------- | -- | ---- | --------- | ----- |
| silenceremove | OFF | OFF | OFF | Compresses pauses >0.25s. Causes "bursting" at scene transitions. All engines disabled. |
| highpass (80Hz) | ON | ON | ON | Removes low-frequency hum. Disable: `TTS_HIGHPASS=0` |
| afftdn denoise (nr=5) | ON | ON | ON | Removes noise floor. Disable: `TTS_DENOISE=0` |
| rubberband prosody | **OFF** | ON | ON | Per-scene pitch+tempo. F5 disabled (mechanical artifacts). |
| atempo | OFF | OFF | OFF | Post-hoc speed change. Causes mechanical voice. **NEVER use with F5**. |
| resample (44.1kHz) | ON | ON | ON | Standardize sample rate for assembly |

**Force engine**: `export TTS_ENGINE=f5-mlx` / `qwen-tts` / `cosyvoice` / `edge-tts`

**Subtitle alignment**: Uses `text-align.py` (wav2vec2 forced alignment) — NOT Whisper recognition.

- We already know the text (from scene-data.mjs), so we align known text to known audio directly
- Whisper recognition approach was abandoned (TTS audio ≠ natural speech, recognition errors like "DeepSeek" → "deep seeks")
- Output: `output/{pipelineId}/audio/subtitle-timing.json`

## Logo Handling

**Video-grade brand mark**: `scripts/short-video/assets/china-ai-news-mark-video.svg` — viewBox'd, brand-palette fills (`#4d8bff`/`#ef4444`), generated **idempotently** by `scripts/short-video/build-mark-svg.mjs` from `china-ai-news-mark.svg`. Change the mark → edit the source SVG, then re-run the builder. Used in three places:

- **Brand bar** (top-left on opener/mid scenes): 48px, in `brandBar()`
- **Watermark** (top-left on non-brand scenes): 55px, `opacity: 0.35`, at `top: 60px; left: 60px` (`WATERMARK_POS` in `lib/safe-zones.mjs`)
- **CTA scene**: 130px centered in the hero slot — rendered by the shared `ctaScene()` end card (`lib/scene-templates.mjs`), never hand-rolled

> Legacy web PNGs (`china-ai-news-logo-gpt.png`, `china-ai-news-logo-vector.svg`) still exist under `scripts/short-video/assets/` but are NOT used by the video pipeline.

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

**Agent should design the title explicitly in scene-data** (via `metadata.title`), not rely on `generate-caption.mjs` auto-derivation:
- Title includes core SEO keywords (primary entity, China AI, model name)
- Title ≤60 chars (TikTok limit)
- Title is a factual statement, not clickbait
- `generate-caption.mjs` uses `metadata.title` when available (see `deriveTitle()` in `caption-utils.mjs`)

### TikTok Best Practices Integration

Full details: `docs/tiktok/tiktok-best-practices.md`. Enforcement: `verify-video.mjs` runs automated checks after every video — do NOT publish until all checks pass.

#### ✅ Fully automated (checked by verify-video.mjs)

| Check                                               | How                                             | Fail action                      |
| --------------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| Resolution 1080×1920                                | ffprobe                                         | Fix record-scenes.mjs viewport   |
| Duration (YouTube ≤180s / TikTok ≤70s)              | ffprobe                                         | Cut scenes                       |
| Frame rate 23-60fps                                 | ffprobe                                         | Check assemble.mjs               |
| Hook has compelling element (number/strong word)    | Scan scene-data Scene 1                         | Rewrite hook voiceover           |
| Source attribution (≥2 scenes mention sources)      | Scan all scene voiceovers                       | Add "Bloomberg reported..." etc. |
| SEO keywords in ≥2 scenes (China/AI)               | Scan voiceover + texts                          | Add keywords to more scenes      |
| Share-worthy data points (≥50% scenes have numbers) | Scan voiceover + texts                          | Add concrete numbers             |
| All scenes have subtitle timing                     | Check subtitle-timing.json                      | Re-run force-align.py            |
| Scene 1 (hook) has subtitles                        | Check timing for sceneId=1                      | Re-run force-align.py            |
| No cross-platform watermark references              | Scan scene data                                 | Remove references                |
| No clickbait patterns in hook                       | Regex check Scene 1 voiceover                   | Rewrite to be factual            |
| No unverified "sources say" claims                  | Scan voiceovers                                 | Add specific source attribution  |
| **No em/en/double dashes**                          | Regex scan all voiceover + texts                | Replace with `..` or line break  |
| **No AI vocabulary blacklist**                      | Scan for ~40 words (see `tiktok-rules.mjs`)     | Replace with spoken equivalent   |
| **No written-style openers**                        | Regex Scene 1 for "In this video I will..."     | Rewrite to open on payoff        |
| **No greeting opener (B2 partial)**                 | Regex first 3 words of Scene 1 VO for hey/hi/etc | Cut greeting, open on payoff     |
| **Hook VO vs on-screen text (B4 three-tier)**       | ≥80% overlap=FAIL, 50-80%=WARN                  | Rewrite one to different angle   |
| **No dead closers**                                 | Regex last scene for "thanks for watching" etc. | End on loop-close line           |
| **No CTA stacking**                                 | Count CTAs per scene (warn if 3+)               | Use one clear ask                |
| **Caption length ≤ 2,200 chars (B6)**               | generate-caption.mjs exit(1) + verify check     | Trim caption content             |

#### 🔧 Agent-assisted at scene-data creation time (prompt-driven, not code)

These are enforced by the agent when writing `scene-data.mjs`, not by code. The agent should follow these rules when creating content:

| Rule                                      | Agent prompt                                   | Checked by verify-video.mjs?        |
| ----------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| SEO keywords in voiceover                 | Include "China AI" + primary entity naturally  | ✅ Yes (keyword count check)        |
| SEO keywords on screen                    | Add to `texts` array                           | ✅ Yes (keyword count check)        |
| Share-worthy data points                  | Design hook with surprising numbers            | ✅ Yes (number count check)         |
| Source attribution                        | "Bloomberg reported...", "Liang said..."       | ✅ Yes (source count check)         |
| Hook is factual not clickbait             | Compelling but factual                         | ✅ Yes (clickbait regex check)      |
| Every scene has a concrete fact           | No filler scenes                               | ⚠️ Manual (agent judgment)          |
| Causal flow between scenes                | Cause → effect → implication                   | ⚠️ Manual (agent judgment)          |
| No logo/slow-push opener (B2 visual)      | First frame = result/tension, not logo         | ⚠️ Manual (agent judgment)          |
| No empty three-part lists (W5)            | Avoid "faster, cheaper, easier" without data   | ⚠️ Manual (agent judgment)          |
| Hook formula selected (T1/T3/T4/T6/T7/T9) | Choose by goal (completion/saves/comments)     | ✅ Yes (compelling element check)   |
| Loop-close in last scene                  | Last line recontextualizes the opening         | ⚠️ Warning (keyword overlap check)  |
| Voiceover line length variation           | No teleprompter rhythm                         | ⚠️ Warning (length variation check) |
| Article-to-video workflow                 | Extract spine → open on payoff → make sayable  | ⚠️ Manual (agent judgment)          |
| News trend discovery                      | Monitor X/36Kr/Bloomberg for trending China AI | ⚠️ Manual (agent judgment)          |
| Content calendar rhythm                   | Breaking/Analysis/Data/Explainer mix           | ⚠️ Manual (agent judgment)          |
| Currency dual-annotation                 | All RMB amounts in voiceover/texts: "$X (¥Y)" with USD first. Use ¥1 ≈ $0.14 (review semi-annually). `meta.mjs` title/description may keep original RMB. | ⚠️ Manual (agent judgment)          |

#### 👤 Manual at publish time (output of verify-video.mjs, presented as checklist)

| Item                           | Detail                                             |
| ------------------------------ | -------------------------------------------------- |
| 3-5 hashtags                   | `#chinaai #deepseek #ai #technews #chinatech`      |
| Geographic tag                 | China/US location tag                              |
| In-app editing                 | Upload to TikTok, add sticker/effect, then publish |
| Reply to comments (first hour) | Post → monitor → respond                           |
| Post at off-peak hours         | Check TikTok analytics                             |
| Pinned comment                 | Article URL                                        |
| Title under 60 chars           | Write in TikTok UI                                 |
| AIGC label                     | Label as AI-generated if AI voice used             |
| Trending audio                 | Add from TikTok audio library                      |
| **Read-aloud test**            | Read voiceover at TikTok pace, flag stumbles       |
| **Caption ≤ 2,200 chars**      | API limit, hashtags included                       |
| **Hook formula goal tag**      | Identify T1/T3/T4/T6/T7/T9 + primary goal          |
| **Loop-close verification**    | Last 3s → first 3s transition check                |

#### ❌ Algorithm penalty (auto-checked, blocks publish)

| Don't                     | Check                               | Fail action          |
| ------------------------- | ----------------------------------- | -------------------- |
| Cross-platform watermarks | Scan scene data for @instagram etc. | Remove references    |
| Clickbait hooks           | Regex: "you won't believe" etc.     | Rewrite hook         |
| Unverified "sources say"  | Scan for attribution                | Add specific source  |
| Duration >90s for TikTok  | ffprobe duration                    | Create shortened cut |

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
├── main.mjs                # Pipeline orchestrator (--content, --bgm, --skip-verify, --skip-dom-check)
├── render-only.mjs         # Re-render from existing audio (no TTS) — fast visual/subtitle iteration
├── verify-subtitles.mjs    # CLI wrapper — subtitle verification
├── text-align.py           # wav2vec2 forced alignment (known text → audio)
├── cosyvoice_batch_tts.py  # CosyVoice 3 batch TTS (load model once, all scenes)
├── qwen_tts_batch.py       # Qwen3-TTS batch TTS (fallback engine)
├── lib/                    # Shared infrastructure (content-agnostic)
│   ├── tts/                # TTS engine registry + adapters
│   │   ├── registry.mjs    # Engine selector (F5-MLX > Qwen3 > CosyVoice > edge-tts > say)
│   │   ├── f5-mlx.mjs       # F5-TTS-MLX adapter (DEFAULT)
│   │   ├── qwen-tts.mjs    # Qwen3-TTS adapter (backup)
│   │   ├── cosyvoice.mjs   # CosyVoice 3 adapter (DEPRECATED)
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
│   ├── voice-sample-24k.wav # CosyVoice/Qwen3 ref audio (24kHz mono)
│   ├── voice-sample-ref-text.txt # CosyVoice/Qwen3 ref text (must match ref audio exactly)
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
| CosyVoice venv | `~/.cosyvoice-env` (Python 3.11) | CosyVoice 3 + torchaudio |
| Qwen3-TTS venv | `~/.qwen-tts-env` (Python 3.11) | Qwen3-TTS (fallback) |
| CosyVoice source | `~/.cosyvoice-models/CosyVoice` | Model + source code (pretrained_models/Fun-CosyVoice3-0.5B) |
| Qwen3-TTS model | `~/.qwen-tts-model` | Qwen3-TTS-12Hz-0.6B-Base |

### Code — Thumbnail

```text
scripts/
├── youtube-thumbnail.html  # EDIT THIS — thumbnail content
└── generate-thumbnail.mjs  # Thumbnail renderer
```

### Assets

```text
scripts/short-video/assets/
├── voice-sample-24k.wav              # CosyVoice/Qwen3 ref audio (24kHz mono, required)
├── voice-sample-ref-text.txt         # CosyVoice/Qwen3 ref text (must match ref audio exactly)
├── logos/                            # Company logos (deepseek.svg, ...)
├── china-ai-news-logo-gpt.png        # GPT-generated original PNG (full logo)
└── china-ai-news-logo-vector.svg     # Vector SVG (true vector, scalable)
```

## Step 8: Analytics & Optimization (Post-Publish)

After publishing, track performance and feed insights back into the next batch of scripts.

### Analytics Export

```bash
node scripts/short-video/export-analytics.mjs
# -> output/analytics-export.json (post status/metadata from Publora)
```

> **Note**: Publora provides post status/metadata only. For view/engagement metrics
> (views, completion rate, shares, saves, comments), use the TikTok Analytics dashboard
> or TikTok API directly. Record them manually via the A/B test tracker.

### A/B Test Tracking

```bash
# Track a new test variant
node scripts/short-video/ab-test-tracker.mjs add --variable hook --variant A --description "Question hook"

# Record results
node scripts/short-video/ab-test-tracker.mjs result --id ab-001 --views 5000 --completion 0.45 --shares 120 --saves 80

# View report (shows winner per variable)
node scripts/short-video/ab-test-tracker.mjs report
```

### Optimization Loop

1. **Export analytics** -- run `export-analytics.mjs` weekly
2. **Record results** -- manually enter TikTok dashboard metrics into ab-test-tracker
3. **Identify patterns** -- compare top 3 vs bottom 3 videos
   - Which hook type performed best?
   - Which duration had highest completion rate?
   - Which publish time got most shares?
4. **Adjust next batch** -- feed insights into `generate-calendar.mjs` output
   - Prioritize topics in the winning content type
   - Use the winning hook formula more often
   - Schedule at the best-performing time
5. **Content repurposing** -- run `repurpose-content.mjs` on top performers
   - Blog post -> website SEO
   - Newsletter -> email list
   - X thread -> social reach

### Content Publishing Red Lines

| Rule | Why | How to enforce |
| ---- | --- | -------------- |
| **Don't publish for the sake of publishing** | Publishing low-quality content on an account with no traction = killing the account. The algorithm records "this content got no views" and penalizes future posts. | HITL-3: If video quality is subpar, Agent should recommend not publishing. See quality gate in `content-pipeline.md` HITL-3. |
| **Don't use all source material at once** | "One-time use is wasteful — split it up." If an article is rich enough for multiple videos, split into parts rather than cramming everything into one. | Stage 3 Step 0: Run episode evaluator. If >60s, split into parts. |
| **Don't spend excessive time on low-ROI content** | "Someone spent half a day making one video, got a few thousand views — not worth it." Calculate time-to-ROI. | Agent should flag when a single video requires >2 pipeline reruns. Consider simplifying scope. |
| **Don't re-post underperforming material** | The algorithm remembers "this is a bad asset" — even re-edited versions get suppressed. | If a video significantly underperforms (<200 views), don't re-edit and re-post the same topic. Move to a new topic. |

---

## Multi-Video Series Strategy

> 当一篇文章内容太丰富无法在 60 秒内讲完时，拆分为多集系列。
> 调研报告：`docs/research/multi-video-splitting-best-practices.md`

### When to Split

Agent 在 Stage 3 Step 0 运行 `episode-evaluator.mjs`，自动判断：

- 估算单条时长 ≤ 60s → 单集
- > 60s → 拆分（2-5 集，上限 5 集）

### Series Types

| 类型               | 适用场景     | 长度   |
| ------------------ | ------------ | ------ |
| Explicit Part N    | 复杂事件分析 | 2-3 集 |
| Loop-and-Flashback | 突发新闻     | 1-2 集 |
| Deep Dive          | 技术解析     | 2-4 集 |
| 对比系列           | 多公司对比   | 2-3 集 |

### Inter-Episode Linking

| 方法                | 操作                                       |
| ------------------- | ------------------------------------------ |
| Pin Part 1          | 将 Part 1 pin 在主页顶部                   |
| Pinned Comment 互链 | 每集 pinned comment 放上下集链接           |
| Stitch 自身视频     | Part 2 开头 Stitch Part 1 作为「上集回顾」 |
| 统一 Hashtag        | 所有集用同一个 `#seriesId`                 |
| Part 编号           | 画面标注 "Part X/Y"                        |

### Coherence Rules

- **每集独立可看** — 不看前集也能看懂
- **不同 Hook** — 每集不同角度的 Hook
- **信息间隔** — Part 1 提出问题，Part 2 解答
- **Payoff 兑现** — 每集的承诺必须兑现
- **间隔 ≤ 3 天** — 超过 1 周观众流失

---

## Compilation Video

> 所有集发完后 3-5 天，合并为合集发布到 YouTube 长视频。

### Plan A: FFmpeg 拼接

```bash
# 自动拼接 + 交叉淡入淡出
node scripts/short-video/compile-series.mjs --videos part1.mp4 part2.mp4 part3.mp4
```

适合 2 集快速出合集。

### Plan B: 重构叙事

```bash
# 合并 scene-data，去掉每集 hook/CTA
node scripts/short-video/compile-series-reconstruct.mjs --scenes content/distillation/pt1/scene-data.mjs content/distillation/pt2/scene-data.mjs content/distillation/pt3/scene-data.mjs --output content/distillation-compilation/scene-data.mjs

# 然后跑合集版 scene-data
node scripts/short-video/main.mjs --content distillation-compilation
```

适合 3+ 集高质量合集。

### Compilation Publishing

合集 mp4 发布到 YouTube 长视频（2-5 分钟），网站文章更新嵌入合集视频。

---

## Series Publishing Workflow

### 发布节奏

| 策略     | 间隔         | 适用       |
| -------- | ------------ | ---------- |
| 快速连续 | 1-3 天       | 2-3 集系列 |
| 同日发布 | 同日不同时段 | 2 集系列   |

### 系列发布命令

```bash
# 发布 Part 1
node scripts/short-video/publish-tiktok.mjs --series-id deepseek-distillation --part 1/3

# 发布 Part 2（带上一集链接）
node scripts/short-video/publish-tiktok.mjs --series-id deepseek-distillation --part 2/3 --prev-url "https://tiktok.com/@chinaainews/video/xxx"

# 发布 Part 3（最后一集）
node scripts/short-video/publish-tiktok.mjs --series-id deepseek-distillation --part 3/3 --prev-url "https://tiktok.com/@chinaainews/video/yyy"
```

脚本自动：

1. Caption 加 `Part X/Y #seriesId`
2. 输出 pinned comment 内容（含上下集链接），用户手动 pin

### 批量生产

决定拆分后一次性生成所有 scene-data，批量跑 TTS → 渲染 → 合成。相比逐条制作节省 60-70% 时间。

---

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
| 3 | Record scene videos (Playwright) | `output/{id}/video/scene-*.webm` |
| 3.5 | Generate BGM (optional, `--bgm`) | `output/{id}/bgm.mp3` |
| 4 | Generate ASS subtitles | `output/{id}/subtitles.ass` |
| 5 | Assemble final video (FFmpeg) | `output/{id}/{id}-v{version}-short.mp4` + `{id}-short.mp4` (latest copy) |
| 6 | Verify subtitles (auto, `--skip-verify` to skip) | `output/{id}/verification-report.json` |

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

Root cause analysis, fix implementation, and diagnostics format: `docs/research/audio-drift-fix.md`

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

## Creating a New Content Pipeline (From Scratch)

When creating a new video content pipeline, follow this checklist. Each video can have its own visual style — the templates below are starting points, not rigid constraints.

### 1. Create directory structure

```
scripts/short-video/content/{article-slug}/
├── meta.mjs         # Pipeline metadata
├── scene-data.mjs   # Scene definitions (voiceover + texts)
└── scenes.mjs       # Visual templates (HTML/CSS per scene)
```

For multi-part series, use subdirectories:

```
scripts/short-video/content/{series-slug}/
├── pt1/
│   ├── meta.mjs
│   ├── scene-data.mjs
│   └── scenes.mjs
├── pt2/
│   └── ...
```

### 2. meta.mjs template

```javascript
export const meta = {
  pipelineId: "my-article",        // Used for output directory: output/my-article/
  title: "My Article Title",       // Display name
  article: "my-article-slug",      // Website article slug (for reference)
  // For series:
  // seriesId: "my-series",
  // partNumber: 1,
};
```

### 3. scene-data.mjs template

```javascript
export const scenes = [
  {
    id: 1,
    name: "hook",           // Scene name for logging
    visualType: "hook",     // Visual type (hook, narrative, data, quote, etc.)
    voiceover: "One breath of text. Max 25 words.",  // Drives TTS duration
    texts: {                 // On-screen text (read by scenes.mjs)
      line1: "BIG TEXT",
      line2: "SUPPORTING",
    },
  },
  // ... 6-10 more scenes
  {
    id: N,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
```

**Rules** (enforced by `verify-video.mjs`):
- Each `voiceover` ≤ 25 words (one breath)
- No em/en/double dashes (`—`, `–`, `--`)
- No AI vocabulary (leverage, delve, harness, etc.)
- Hook (Scene 1) must have a number or strong word
- ≥2 scenes mention sources
- "China", "AI", and main subject each appear in ≥2 scenes

### 4. scenes.mjs template

```javascript
import { baseStyles, BRAND_MARK_SVG, withWatermark } from "../../../lib/base-styles.mjs";

// Safe text accessor
function t(texts, key) { return texts?.[key] ?? ""; }

function scene1(scene, duration) {
  const txt = scene.texts || {};
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s1 { /* Your scene CSS here */ }
/* IMPORTANT: Compose into the fixed slot grid — kicker 220-400 / hero 400-950 /
   support 950-1150, x∈[60,880] — via sceneFrame({...}) from lib/scene-layout.mjs.
   Hand-rolled full-screen flex is banned by the DOM gate (verify-scene-dom.mjs).
   Check text width!
   - Content band: 820px wide (x 60-880)
   - At 42px bold: ~25px avg char width → max ~32 chars per 820px line
   - At 56px bold: ~33px avg char width → max ~24 chars per 820px line
   - ALWAYS add `word-break: break-word` as safety net
*/
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <!-- Your content here -->
</div></body></html>`;
}

// ... more scene functions

const sceneGenerators = { 1: scene1, /* ... */ };
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));  // MUST wrap with withWatermark
}
```

**Reuse the shared scene templates** (`lib/scene-templates.mjs`) for recurring layouts instead of hand-rolling CSS: `brandBar(tag)`, `breakingBadge(text)`, `statCard({num, unit, label})`, `quoteBox({quote, highlight, speaker, source})`, `titleBlock(text, {highlight, fontSize})`, `bigNumberAnchor(num)`, `pointsList(points)`, `stampBox({text, sub, color})`, `fadeToBlack(duration)`, and `ctaScene(scene, duration)` — the **standard CTA end card used by every video's last scene** (fixed layout: logo → brand (AI in blue) → tagline → amber stamp action → optional topic → fade). Never write a bespoke CTA scene: content `scenes.mjs` delegates to `ctaScene`, and `scene-rules.mjs` `checkCTAActionContract` fails preflight when the last scene's `texts.action` is missing (contract: `{ brand, brandHighlight, tagline, action, topic? }`). Imported alongside `baseStyles()`:

```javascript
import { templateCss } from "../../../lib/scene-templates.mjs";
// ...compose: `${baseStyles(duration)}\n${templateCss()}\n.s1 { /* scene-specific */ }`
```

All display copy must come from `scene.texts` via the `t()` accessor — the template layer and `scenes.mjs` must not hardcode business copy (channel constants `CHINA AI NEWS` / `INTELLIGENCE BRIEFING` are the only exceptions, in `brandBar`). Drift guards in `__tests__/scene-drift.test.mjs` enforce this.

**CSS overflow checklist (check before running pipeline):**

| Font size | Max chars per 820px line | Max chars per 360px card |
|-----------|--------------------------|------------------------|
| 32px bold | ~43 chars | ~19 chars |
| 42px bold | ~32 chars | ~14 chars |
| 48px bold | ~28 chars | ~12 chars |
| 56px bold | ~24 chars | ~10 chars |
| 72px bold | ~19 chars | ~8 chars |

- For flex columns with `gap: 40px`: each column = `(available - 40) / 2`
- For cards with padding: text area = `card_width - padding * 2`
- Always add `word-break: break-word` as safety net
- Test at thumbnail size (240×426) — if text is unreadable, it's too small

### 5. Visual style flexibility

Each video can have a different visual DNA while sharing the same brand system:

| Video type | Color dominance | Animation style | Logo usage |
|------------|----------------|-----------------|------------|
| Breaking news | Red, urgent | Glitch, stamp-in | Brand bar at top |
| Deep analysis | Blue, authoritative | Slide, fade | Watermark only |
| Data reveal | Amber, focused | Number pulse, bar grow | Minimal |
| Explainer | Blue + cyan | Sequential reveal | Brand at CTA |

**Mandatory across all styles:**
- Use CSS variables from `base-styles.mjs` (`var(--blue)`, `var(--red)`, etc.) — never hardcode hex
- Call `withWatermark()` on every scene's HTML
- Use `baseStyles(duration)` as the CSS foundation
- Brand logo appears in CTA scene at 130px+

### 6. Run and verify

```bash
# Run pipeline (ALWAYS in background — see "Running in Background" above)
node scripts/short-video/main.mjs --content my-article --bgm 2>&1 | tee /tmp/my-article.log &

# After completion, verify
node scripts/short-video/verify-video.mjs --tiktok --content my-article
```

Fix all FAIL items before presenting to user. WARN items are acceptable.

---

## Design Decisions & References

When modifying rules in this file, consult these reference docs for root cause and rationale:

| Topic | Reference | Content |
|-------|-----------|---------|
| Audio drift fix | `docs/research/audio-drift-fix.md` | Root cause analysis, fix implementation, sync verification, diagnostics |
| Per-scene prosody (pitch/tempo) | `docs/research/voice-prosody-hook-optimization.md` | 15 sources, per-parameter rationale, research citations |
| TikTok best practices | `docs/tiktok/tiktok-best-practices.md` | Signal weights, voice rules, hook formulas, audit checklist |
| A/B testing methodology | `docs/tiktok/ab-testing-methodology.md` | Element iteration method, single-variable testing philosophy |
| Multi-video splitting | `docs/research/multi-video-splitting-best-practices.md` | Episode splitting strategy, inter-episode linking |
| Brand visual identity | `docs/brand-system.md` | Color tokens, typography, animation library, scene templates |
