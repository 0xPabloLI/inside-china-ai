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

| Principle              | Rule                                                  | Why                                                                         |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| **One core message**   | First frame conveys ONE number/word/claim, not a menu | Users scroll at ~1 per second; multi-item frames read as "too much work"    |
| **Text ≥ 32px**        | Minimum 32px on a 1080×1920 canvas; titles ≥ 60px     | At thumbnail size in-feed, < 32px is invisible                              |
| **Upper 2/3 rule**     | Critical content in top 1280px (of 1920)              | Bottom 640px gets covered by platform UI (buttons, captions, title overlay) |
| **No dead space**      | Fill the full 1920px height — no > 200px gaps         | Blank zones signal "no content" → scroll past                               |
| **Bold color blocks**  | Use solid-color areas (not gradients) for contrast    | Gradients compress poorly at thumbnail size; solid blocks pop               |
| **Asymmetric layout**  | Offset the main element left or right of center       | Centered layouts read as "AI-generated"; asymmetry feels human-designed     |
| **Scan line / motion** | Subtle continuous animation (scan sweep, pulse)       | A static frame in autoplay feed looks like a still image, not a video       |
| **Max 2 stat cards**   | Don't stack 3+ data points on the hook frame          | Users can't parse 3+ numbers in 1 second; 2 is the limit                    |

### Silent Autoplay

85% of social media videos start muted. The video must be compelling without sound:

- Burned-in subtitles on all scenes except CTA (hook scene now included)
- Visual data anchors (big numbers, colored bars) that convey meaning without audio
- If the first 3 seconds only make sense with sound, rework them

#### Subtitle Best Practices

| Parameter   | Value                                      | Rationale                                                |
| ----------- | ------------------------------------------ | -------------------------------------------------------- |
| Font size   | **42px** (was 34px)                        | Must be readable at phone size + thumbnail scale         |
| Font weight | **Bold**                                   | Thin text vanishes on bright backgrounds                 |
| Style       | **Karaoke `\kt` + `\kf`** (word-by-word highlight) | TikTok-native feel; `\kt` anchors each word absolutely so rounding error can't accumulate across a line |
| Chunks      | **≤6 words / ≤49 chars** per display (soft break at 38 chars when ≥2 words remain) | Users read ~2.5 words/sec; longer chunks get skipped |
| Rendering   | **FFmpeg ASS native burn-in** (ffmpeg-full) | CSS/JS approaches abandoned; ASS gives pixel-perfect control |
| Position    | `MarginV=450` (ASS)                        | Above TikTok bottom UI zone (buttons, description, username) |
| Timing      | **wav2vec2 forced alignment** (`text-align.py`) | Per-word timestamps; `\kf` tags use actual audio timing |
| Primary color | Dispatch Blue `#4d8bff`                   | Spoken words — hue shift, not a luminance drop, so read words stay legible |
| Secondary color | White `#F5F5F5`                         | Unspoken words (waiting to be spoken)                    |
| Background  | **None** (transparent, 3px black outline)  | Clean look; outline provides contrast on any scene       |
| Generation  | `lib/subtitles/` (JS)                      | Cue text is derived from its own word list, so a word can never be shown without timing |
| Cue timing  | 2-frame lead-in, ≥0.8s on screen, 0.5s hold-out, gaps either 2 frames or ≥0.5s | Netflix Timed Text Style Guide, converted to 30fps |
| Scene 1     | ✅ Now has subtitles (was skipped)         | User feedback: subtitles should appear from the start    |

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
- **Colors**: Consistent entity-color mapping across all videos. Amber `#f59e0b` used for key data highlights (Hook scene big numbers) and CTA prompts (Subscribe for more) for maximum visibility on dark backgrounds. White text uses `#f5f5f5` (not pure `#ffffff`) to reduce dark-mode glare.

## TTS Engine Configuration

| Priority | Engine      | Config                          | Speed   | Venv                        | Notes                                                              |
| -------- | ----------- | ------------------------------- | ------- | --------------------------- | ------------------------------------------------------------------ |
| 1        | F5-TTS-MLX  | ref_audio + ref_text (cloned)   | 1.0     | `~/.f5-tts-env` (Python 3.11) | Best quality on Apple Silicon; batch mode; no silenceremove needed |
| 2        | XTTS v2     | speaker_wav (cloned) or "Craig Gutsy" | 1.15 | `~/.xtts-env` (Python 3.11) | Batch mode; **MPS hybrid** (GPT on MPS, HiFi-GAN on CPU)          |
| 3        | Kokoro      | voice="am_michael"              | 1.1     | `~/.tts-env` (Python 3.12)  | 54 voices available; fastest on CPU                               |
| 4        | edge-tts    | en-US-BrianNeural               | +8%     | npm                         | Network-dependent, retry 3x                                        |
| 5        | macOS say   | Daniel                          | 190 wpm | built-in                    | Last resort                                                        |

**F5-TTS-MLX** (DEFAULT — best quality on Apple Silicon):

- Voice cloning via reference audio + reference text
- Ref audio: `assets/voice-sample-24k.wav`（24kHz mono WAV）
- Ref text: `assets/voice-sample-ref-text.txt`（必须精确匹配 ref audio 的文字内容）
- Duration formula: `duration = ref_dur + target_dur`（不设会导致 0.03s 音频）
- F5 音频振幅低，**跳过 silenceremove**（-35dB 阈值会全删）
- Optional atempo: `export TTS_ATEMPO=1.3`（加速语音）
- M4A 不被 Python 音频库支持，必须先转 WAV：`ffmpeg -y -i input.m4a -ar 24000 -ac 1 output.wav`

**XTTS v2** (fallback):

- XTTS clones timbre only; pronunciation is standard English from language model
- Override: `export TTS_SPEAKER_WAV=/path/to/other.wav` or set empty to disable
- To replace the sample: put M4A in `assets/`, extract 10-15s clear speech segment, convert with `ffmpeg -ar 22050 -ac 1`
- MPS hybrid mode: patch `tts/models/xtts.py` line 577 + 320 (add `.cpu()`), GPT on MPS, HiFi-GAN on CPU
- PyTorch 2.5.1 required (2.13.0 breaks `weights_only` default)

**Force engine**: `export TTS_ENGINE=f5` / `xtts` / `kokoro`

**Subtitle alignment**: Uses `text-align.py` (wav2vec2 forced alignment) — NOT Whisper recognition.

- We already know the text (from scene-data.mjs), so we align known text to known audio directly
- Whisper recognition approach was abandoned (TTS audio ≠ natural speech, recognition errors like "DeepSeek" → "deep seeks")
- Output: `output/{pipelineId}/audio/subtitle-timing.json`

## Logo Handling

- **Full logo**: `assets/china-ai-news-logo-gpt.png` (image + text, 1024×1024)
- **Pure graphic**: `assets/china-ai-news-logo-image-only.png` (no text, for flexible use)
- **Vector SVG**: `assets/china-ai-news-logo-vector.svg` (true vector, scalable)
- **In-video logo**: Same logo at 55px, `opacity: 0.18`, `bottom: 50px, right: 50px`
- **CTA scene**: Logo at 200px centered

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
- Title includes core SEO keywords (DeepSeek, China AI, model name)
- Title ≤60 chars (TikTok limit)
- Title is a factual statement, not clickbait
- `generate-caption.mjs` uses `metadata.title` when available (see `deriveTitle()` in `caption-utils.mjs`)

> Source: 自媒体实战方法论 — "封面给眼球，标题给算法。标题是给搜索和推荐算法看的，封面是给活人的眼睛看的。"

### TikTok Best Practices Integration

> Based on 2025-2026 research via Chrome CDP + community skill absorption (sergebulaev/tiktok-skills). Full details: `docs/tiktok-best-practices.md` (signal weights, voice rules, hook formulas, audit checklist, news strategy) and `docs/refs/tiktok-skills/` (34 community reference files).
>
> **Enforcement**: `scripts/short-video/verify-video.mjs` runs automated checks after every video. This is **Step 6** of the pipeline workflow (see `short-video-pipeline` SKILL.md). Do NOT publish until all automated checks pass.

#### ✅ Fully automated (checked by verify-video.mjs)

| Check                                               | How                                             | Fail action                      |
| --------------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| Resolution 1080×1920                                | ffprobe                                         | Fix record-scenes.mjs viewport   |
| Duration (YouTube ≤180s / TikTok ≤70s)              | ffprobe                                         | Cut scenes                       |
| Frame rate 23-60fps                                 | ffprobe                                         | Check assemble.mjs               |
| Hook has compelling element (number/strong word)    | Scan scene-data Scene 1                         | Rewrite hook voiceover           |
| Source attribution (≥2 scenes mention sources)      | Scan all scene voiceovers                       | Add "Bloomberg reported..." etc. |
| SEO keywords in ≥2 scenes (China/AI/DeepSeek)       | Scan voiceover + texts                          | Add keywords to more scenes      |
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
| SEO keywords in voiceover                 | Include "China AI", "DeepSeek" naturally       | ✅ Yes (keyword count check)        |
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
| Video Production | `AGENTS.md` → `## Video Production` | Entry point — tells agent to load skills + read this file for optimization |

### Code — Pipeline

```text
scripts/short-video/
├── main.mjs                # Pipeline orchestrator (--content, --bgm, --skip-verify)
├── render-only.mjs         # Re-render from existing audio (no TTS) — fast visual/subtitle iteration
├── verify-subtitles.mjs    # CLI wrapper — subtitle verification
├── text-align.py           # wav2vec2 forced alignment (known text → audio)
├── f5_mlx_batch_tts.py     # F5-TTS-MLX batch TTS (load model once, all scenes)
├── xtts_batch_tts.py       # XTTS v2 batch TTS (fallback engine)
├── kokoro_tts.py           # Kokoro TTS (fallback engine)
├── lib/                    # Shared infrastructure (content-agnostic)
│   ├── generate-tts.mjs    # TTS engine selector (F5 > XTTS > Kokoro > edge > say)
│   ├── timeline.mjs        # Frame-exact scene durations + offsets (single source of truth)
│   ├── subtitles/
│   │   ├── cues.mjs        # Alignment → cues (chunking + Netflix timing rules)
│   │   ├── ass.mjs         # ASS render + parse (\kt anchors, 1ms precision)
│   │   └── generate.mjs    # Entry point: timing JSON → subtitles.ass
│   ├── assemble.mjs        # FFmpeg assembly + ASS burn-in + BGM mix
│   ├── record-scenes.mjs   # Playwright recording (1080×1920)
│   ├── generate-bgm.mjs    # Procedural cyber-ambient BGM
│   ├── verify-subtitles.mjs # Reads back the .ass and checks it against the alignment data
│   └── base-styles.mjs     # Shared visual system (CSS vars, backgrounds, animations, brand SVG)
├── content/                # Content pipelines (each article = one dir)
│   ├── deepseek/           # DeepSeek story
│   │   ├── meta.mjs        # { pipelineId: "deepseek" }
│   │   ├── scene-data.mjs  # 12 scenes (voiceover, texts, visualType)
│   │   └── scenes.mjs      # 12 visual templates (read scene.texts)
│   └── distillation/       # LLM distillation series
│       ├── pt1/            # Part 1 (8 unique scenes, red/glitch DNA)
│       ├── pt2/            # Part 2 (scene-data + meta, scenes = stub)
│       └── pt3/            # Part 3 (scene-data + meta, scenes = stub)
├── assets/
│   ├── voice-sample-24k.wav # F5 ref audio (24kHz mono)
│   ├── voice-sample-ref-text.txt # F5 ref text (must match ref audio exactly)
│   ├── voice-samples/      # Multi-clip XTTS cloning samples
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
| F5 venv | `~/.f5-tts-env` (Python 3.11) | F5-TTS-MLX + whisperx (for text-align.py) |
| XTTS venv | `~/.xtts-env` (Python 3.11) | XTTS v2 (fallback TTS) |
| Kokoro venv | `~/.tts-env` (Python 3.12) | Kokoro TTS (fallback) |

### Code — Thumbnail

```text
scripts/
├── youtube-thumbnail.html  # EDIT THIS — thumbnail content
└── generate-thumbnail.mjs  # Thumbnail renderer
```

### Assets

```text
scripts/short-video/assets/
├── voice-sample-24k.wav              # F5-TTS ref audio (24kHz mono, required)
├── voice-sample-ref-text.txt         # F5-TTS ref text (must match ref audio exactly)
├── voice-sample.wav                  # XTTS cloning sample (15s)
├── voice-samples/                    # Multi-clip XTTS cloning samples
├── logos/                            # Company logos (deepseek.svg, ...)
├── china-ai-news-logo-gpt.png        # GPT-generated original PNG (full logo)
├── china-ai-news-logo-image-only.png # Pure graphic only (no text)
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

### Element Iteration Method (Scientific A/B Testing)

Source: 自媒体实战方法论 (乱码老师). A systematic approach to content optimization — not random testing, but controlled single-variable experiments.

**Core principle**: Change ONE element per iteration. Keep what works, discard what doesn't.

**Iteration cycle**:
1. Round 1: Discover element B works well → B + everything else
2. Round 2: Discover B + D works better → keep BD, swap other elements
3. Round 3: Discover B + D + E works even better → continue adding new variables
4. All good elements stay; all bad elements get eliminated. Each round changes only ONE element.

**What to iterate on**:
- Hook formula (T1 cold-open vs T3 number reveal vs T4 question)
- Hook angle (same formula, different framing)
- Video length (30s vs 45s vs 60s)
- Posting time (morning vs evening)
- Visual style (data-heavy vs text-heavy)
- TTS engine/speed (F5 vs XTTS, 1.0x vs 1.15x)

**How to use with ab-test-tracker.mjs**:
```bash
# Round 1: Test hook formula
ab-test-tracker.mjs add --variable hook --variant A --description "T1 cold-open"
ab-test-tracker.mjs add --variable hook --variant B --description "T3 number reveal"
# Record results, keep winner

# Round 2: Fix hook (use winner), test video length
ab-test-tracker.mjs add --variable length --variant A --description "30s"
ab-test-tracker.mjs add --variable length --variant B --description "45s"
# Record results, keep winner

# Round 3: Fix hook + length, test posting time
# ... continue
```

**Key insight**: "媒体终究是数据说话的事" (Media is ultimately a data-driven business). Don't rely on gut feeling — let the data decide which elements to keep.

### Content Publishing Red Lines

Source: 自媒体实战方法论 (乱码老师). Practical rules to protect account health and maximize ROI.

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
node scripts/short-video/compile-series-reconstruct.mjs --scenes scene-data-pt1.mjs scene-data-pt2.mjs scene-data-pt3.mjs

# 然后跑合集版 scene-data
node scripts/short-video/main.mjs --scene scene-data-compilation.mjs
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

# Standalone subtitle verification
node scripts/short-video/verify-subtitles.mjs <video.mp4> <subtitles.ass> <subtitle-timing.json> <scene-durations.json>

# Re-render without re-running TTS (visual or subtitle changes only)
node scripts/short-video/render-only.mjs --content restraint/pt1
```

### Pipeline Steps

| Step | Action | Output |
|------|--------|--------|
| 1 | Generate TTS voiceover (F5-TTS-MLX) | `output/{id}/audio/scene-*.mp3` + `subtitle-timing.json` |
| 2 | Generate HTML scene templates | `output/{id}/scenes/scene-*.html` |
| 3 | Record scene videos (Playwright) | `output/{id}/video/scene-*.webm` |
| 3.5 | Generate BGM (optional, `--bgm`) | `output/{id}/bgm.mp3` |
| 4 | Generate ASS subtitles | `output/{id}/subtitles.ass` |
| 5 | Assemble final video (FFmpeg) | `output/{id}/{id}-v{version}-short.mp4` + `{id}-short.mp4` (latest copy) |
| 6 | Verify subtitles (auto, `--skip-verify` to skip) | `output/{id}/verification-report.json` |

### Version Numbers

Every pipeline run generates a **versioned output file**: `{pipelineId}-v{YYYY-MM-DDTHH-MM-SS}-short.mp4`.

A **latest copy** (`{pipelineId}-short.mp4`) is also created for compatibility with verify-video.mjs and other tools.

**Why version numbers?** When iterating on video quality (subtitles, visuals, timing), you need to confirm which version you're watching. Without version numbers, the file looks the same after each run.

**How to check which version you're watching:**
```bash
# List all versions, newest first
ls -lt output/restraint-pt1/restraint-pt1-v*-short.mp4

# Check creation time of latest
stat -f "%Sm" output/restraint-pt1/restraint-pt1-short.mp4
```

### Audio Concat Drift Fix (AAC Priming)

**Critical**: FFmpeg concat with `-c copy` causes **~46ms/scene cumulative audio drift** because AAC frames have encoder delay (priming samples). After 11 scenes, subtitles drift ~500ms behind audio.

**Fix** (in `assemble.mjs`): Always use `-c:v copy -c:a aac -b:a 192k` for concat, never `-c copy`.

### Running in Background (MANDATORY for F5-TTS)

F5-TTS-MLX model loading takes 2-3 minutes alone, and full pipeline runs 7-10 minutes.
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
/* IMPORTANT: Check text width!
   - Canvas: 1080px wide
   - With padding: available width varies
   - At 42px bold: ~25px avg char width → max ~38 chars per 950px line
   - At 56px bold: ~33px avg char width → max ~28 chars per 950px line
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

**CSS overflow checklist (check before running pipeline):**

| Font size | Max chars per 950px line | Max chars per 360px card |
|-----------|-------------------------|------------------------|
| 32px bold | ~50 chars | ~19 chars |
| 42px bold | ~38 chars | ~14 chars |
| 48px bold | ~33 chars | ~12 chars |
| 56px bold | ~28 chars | ~10 chars |
| 72px bold | ~22 chars | ~8 chars |

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
