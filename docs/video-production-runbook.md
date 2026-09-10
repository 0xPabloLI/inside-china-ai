# China AI News — Video Production Runbook

> The **workflow steps** (research → write scene-data → run pipeline → thumbnail → quality check) live in the `short-video-pipeline` skill. This document covers project-specific content: content standards, best practices, publishing strategy, and file locations.

## Skill Loading Matrix（按任务类型，非互斥）

| 任务                                      | 加载的 Skill                                          | 用途                                                                                                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 写 scene-data / 跑管线 / 发布             | `short-video-pipeline` + `brand-system`               | 管线流程 + 品牌一致性                                                                                                                                                                                                         |
| 改 `remotion/src/` React 组件代码         | `remotion-markup`（主入口 `remotion-best-practices`） | Remotion API 最佳实践：`Interactive.Div` 结构、`@remotion/media` 组件、`@remotion/transitions` 转场、`@remotion/rough-notation` 文本标注、`@remotion/effects` 视觉效果、`perceptual-scale` 动画、`calculateMetadata` 动态时长 |
| 改视频模板视觉设计（间距/排版/层次/动画） | `impeccable`                                          | `critique` 审查问题，`layout` 修间距，`typeset` 修字体，`polish` 做最终打磨                                                                                                                                                   |
| 新建场景模板                              | `frontend-design`                                     | 选择美学方向                                                                                                                                                                                                                  |

> **`remotion-markup` vs `impeccable` 分工**：`remotion-markup` 管"Remotion 代码怎么写"（API 正确用法、组件结构、转场模式、动画 timing）；`impeccable` 管"画面该怎么排"（间距节奏、视觉层次、动画多样性、可读性、AI slop 检测）。改 `remotion/src/` 时两个都加载——先 `remotion-markup` 确保 API 正确，再 `impeccable` 确保视觉质量。

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

| Principle              | Rule                                                  | Why                                                                                       |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **One core message**   | First frame conveys ONE number/word/claim, not a menu | Users scroll at ~1 per second; multi-item frames read as "too much work"                  |
| **Text ≥ 32px**        | Minimum 32px on a 1080×1920 canvas; titles ≥ 60px     | At thumbnail size in-feed, < 32px is invisible                                            |
| **Upper 2/3 rule**     | Critical content above y=1150 (safe-zone bottom edge) | Below y=1150 sits the subtitle lane (y≈1188–1350) + TikTok caption UI (buttons, captions) |
| **No dead space**      | Fill the full 1920px height — no > 200px gaps         | Blank zones signal "no content" → scroll past                                             |
| **Bold color blocks**  | Use solid-color areas (not gradients) for contrast    | Gradients compress poorly at thumbnail size; solid blocks pop                             |
| **Asymmetric layout**  | Offset the main element left or right of center       | Centered layouts read as "AI-generated"; asymmetry feels human-designed                   |
| **Scan line / motion** | Subtle continuous animation (scan sweep, pulse)       | A static frame in autoplay feed looks like a still image, not a video                     |
| **Max 2 stat cards**   | Don't stack 3+ data points on the hook frame          | Users can't parse 3+ numbers in 1 second; 2 is the limit                                  |

**Standard hook template**: Scene 1 MUST use the shared HookScene opening card (`remotion/src/scenes/HookScene.tsx`) — fixed skeleton (badge → subject → focal → stats/source in the `lib/scene-layout.mjs` slot grid), two focal variants (number-led `bigNumber` / claim-led `hookText`+`revealText`). The focal is mandatory and exclusive, enforced FAIL-level by `checkHookContract`. Data contract in the HookScene docblock (spec: `docs/specs/spec-hook-opening-card.md`). The claim or number renders on frame 1 with no animation delay — the thumbnail itself must carry the hook.

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

### Cloud GPU Batch-Running

> 批量经验（启动开销摊销、结果尽早落盘、失败隔离，Modal/Kaggle/Colab 通用）：`docs/research/cloud-gpu-options.md` → "Batch-Running 经验"。

## Pipeline Execution (#225)

- **Step 0.2 CDP hard gate**（2026-09-09）: `main.mjs` 的第一步是 `lib/cdp-preflight.mjs` 的 `ensureCdpOrExit()`——探测 `localhost:3456/targets`；不通则自动拉起 `skills/web-access/scripts/cdp-proxy.mjs`（detached，日志 `output/cdp-proxy.log`）并轮询 ≤12s；仍不通 `process.exit(1)`。**禁止降级**：CDP 不可用时产出无背景媒体的视频（2026-09-08/09 事故），宁可早失败。代理通但 Chrome 调试端口（9222）不可达时给出用户操作指引——Agent 永远不代替用户重启 Chrome（AGENTS.md 守卫）。
- **并行轨**：`main.mjs` 媒体轨（Step 1.5 sourcing → 1.5c media-patch → 1.5b upscale → 1.5d B-roll，`lib/media-track.mjs`）与语音轨（Step 1 TTS）`Promise.all` 并行，join 后过 1.6 media gate 再进字幕/渲染/verify。数据依赖：媒体轨只写 scene 媒体字段、TTS 只读 scene 文本——无共享可变状态。失败语义不变：媒体轨每阶段 warn 不阻塞；TTS 失败仍中止管线。
- **步骤耗时 profile**：每次 run 结束（含失败路径）自动写 `output/<pipelineId>/profile-<version>.json`（另有稳定名 `last-profile.json`），并在末尾打印按耗时排序的 summary；失败时未结束 step 记 `unfinished: true`。管线提速决策以 profile 证据为准。
- **TTS 缓存**（#198）：scene 音频按 `(engine, engine.info, text)` 键跨 run 复用，forced alignment 按 `(text + 音频字节)` 签名复用（ttsText 变化会触发重对齐）；`TTS_NO_CACHE=1` 强制冷跑（重生成全部音频）。
- **长任务执行方式**：asset sourcing 全量 40+ 分钟，Agent 会话里**不要前台 `bash` 跑**（工具超时会杀进程）——用 `nohup ... > log 2>&1 &` 后台运行 + 轮询日志；搜索缓存已改为逐次增量落盘（见故障模式表），进程被杀也保留已完成搜索。

### 双轨朗读文本（TTS spoken vs display）

用户决策（2026-09-09）：**朗读可以改写，字幕/画面必须保持原文**。实现为三字段契约（`lib/normalize-tts-text.mjs`）：

- `scene.voiceover` — 显示轨，永不被改写。字幕、审查、文章都用它。
- `scene.voiceoverTts` — 内容生产时**手工标注的朗读形式**（语义在源头确定："0910" 是日期还是门牌号只有作者知道）。优先于规则。
- `scene.ttsText` / `scene.ttsReplacements` — Step 0.6 兜底产物：正则规则（版本号/小数/日期）派生朗读形式并记录 `{original, spoken[]}` 替换对。**不写回 voiceover**。

数据流：TTS manifest 与 forced alignment（text-align.py）读 `ttsText`（wav2vec2 词典无数字 token，必须用朗读形式才能对齐）；`lib/subtitles/restore-tokens.mjs` 在对齐结果落盘前把 spoken 词序列精确映射回 `original` 显示 token（匹配失败保留 spoken，绝不更差）。字幕因此显示 "V4.1 / 0910"，朗读读 "V four point one / September tenth"。

### 已知故障模式与固化措施（2026-09-08/09 修复清单）

修复固化在代码与本文档，不依赖会话记忆。回归时按表定位。

| # | 故障 | 固化位置 |
|---|------|----------|
| 1 | HookScene `<Circle>` 遮住 bigNumber | `remotion/src/components/shared.ts` ANNOTATION.circle（strokeWidth:3 + padding）；HookScene 显式传参 |
| 2 | TTS 读错版本号/小数/日期（"V four [停] one"） | 双轨文本（上文节）+ `lib/normalize-tts-text.mjs` + kernel 前端限制认知 |
| 3 | sourcing 跳过所有 assetNeed 场景 | `lib/claim-keywords.mjs` skipsMediaSourcing 的 `&& !scene.assetNeed` 守卫 |
| 4 | TTS prosody/speed 偏离认可基线 | adapter 默认 `prosody:null`+无 speed，`TTS_PROSODY=1` opt-in；kernel `torch.manual_seed(20260907)` |
| 5 | 重叠字幕 chunk 被丢弃 | `text-align.py` group_chunks 重叠合并（never `continue`） |
| 7 | media-patch.json 缺 `type` 字段 → 图片被当视频加载 | 每个条目必须 `"type":"image"|"video"`；`remotion/src/components/MediaBackground.tsx:206` 按 type 分派 |
| 8 | 亮背景图透过 overlay 进右侧安全区 | media-patch 条目加 `"overlay":0.88`（亮图/图表类）；frame analysis 右安全区阈值 |
| 9 | sourcing 被杀后搜索缓存全丢（"0 entries loaded"） | `lib/asset-sourcer.mjs` 5 处搜索后立即 `saveSearchResultsCache()` 增量落盘 |
| 10 | Kaggle kernel 每次全量下载模型（10+ min） | kernel metadata `dataset_sources` 含 `xPabloLI/cosyvoice3-model`；kernel 先查 `/kaggle/input/cosyvoice3-model/cosyvoice3.yaml` 再 symlink，HF 下载仅作 fallback |
| 11 | CDP 中途才检查/静默降级 | Step 0.2 CDP hard gate（上文节）；asset-sourcer CDP 不可用即 `process.exit(1)` |
| 12 | CosyVoice3-Kaggle 偶发印度口音/音素拖长/WPM骤降 | Kaggle 环境固化（`onnxruntime-gpu==1.20.0` + commit `074ca6d`）+ 四维 Prompt 规范（Persona+美音+情绪+节奏）+ TTS Quality Gate 自愈（#234） |
| 13 | TTS Quality Gate 版本号/小数 Token 错配导致相似度假阳性扣分 | `quality-gate.mjs` 实现 `buildExpandedAsrTokenSet` 及 `point` 音素桥接映射，实现 100% 语义匹配 (#234) |


## Content Standards

- **Information density**: every scene delivers a concrete fact or insight, not filler
- **Causal flow**: scenes build on each other — cause → effect → implication
- **Source attribution**: mention sources in voiceover ("Bloomberg reported...", "Liang said...")
- **No clickbait**: hooks are factual but dramatic, not misleading
- **English voiceover**: global audience. Chinese names romanized.

## Brand Voice

- **Tone**: Intelligence briefing. Authoritative, fast, no fluff.
- **Pace**: CosyVoice3-MLX (cloned voice + emotion instruct, speed=1.0). Fallback engines below.
- **Visual**: Cyber Intelligence Briefing — dark, grid, glow, scanlines
- **Colors**: Consistent entity-color mapping across all videos. Amber `#f59e0b` used for key data highlights (Hook scene big numbers) and CTA prompts (FOLLOW FOR MORE — the standard end-card action) for maximum visibility on dark backgrounds. White text uses `#f5f5f5` (not pure `#ffffff`) to reduce dark-mode glare.

## TTS Engine Configuration

> **Max Effort Rule** (2026-08-14): All local TTS models MUST run at max effort by default.
> If the machine cannot handle max effort (MPS OOM, excessive RTF),
> the agent must explicitly notify the user and mark the run as degraded.

| Priority | Engine                   | Max Effort Parameters                                            | Venv / Runtime                   | Notes                                                                                                                       |
| -------- | ------------------------ | ---------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1        | **CosyVoice3-Kaggle-CUDA** | instruct_text per visualType, `<\|endofprompt\|>` suffix          | Kaggle CLI + `~/.kaggle/kaggle.json` | **DEFAULT** (ADR-0019). Apache-2.0. P100 GPU, full emotion fidelity. ~8-10min/batch. Free 30h/week.                         |
| 2        | **CosyVoice3-MLX**       | speed=1.0, instruct_text per visualType                          | `~/.video-tts-env` (Python 3.12) | **LOCAL FALLBACK**. Emotion regression vs CUDA but fast RTF 0.64-0.87x. Model: `~/.cosyvoice3-mlx-model` (1.7GB)            |
| 3        | **F5-TTS-MLX**           | **steps=32, cfg_strength=3.0**, method='rk4', wps=2.8, speed=1.0 | `~/.video-tts-env` (Python 3.12) | **BACKUP**. Flow Matching on MLX. Best rhythm + natural pacing. Internal `duration` control. CC-BY-NC weights.               |
| 4        | Qwen3-TTS                | `do_sample=False`, `repetition_penalty=1.3` (greedy search)      | `~/.video-tts-env` (Python 3.12) | Autoregressive LLM. Good emphasis on data points, but no duration control.                                                  |
| 5        | edge-tts                 | en-US-BrianNeural                                                | npm                              | Network-dependent, retry 3x; no voice cloning. Template voice only.                                                         |
| 6        | macOS say                | Daniel, 190 wpm                                                  | built-in                         | Last resort; no voice cloning                                                                                               |

**M4A → WAV conversion**: M4A is not readable by Python audio libraries (`soundfile`/`torchaudio`/`librosa` are libsndfile-based) — `LibsndfileError: Format not recognised` means an M4A was passed. Convert first, matching the ref-audio spec (24 kHz mono):

```bash
ffmpeg -i input.m4a -ar 24000 -ac 1 output.wav
```

**F5-TTS-MLX** (DEFAULT):

- Voice cloning via reference audio + reference text (zero-shot)
- Ref audio: `voice-samples/voice-sample-24k.wav`（24kHz mono WAV）
- Ref text: `voice-samples/voice-sample-ref-text.txt`（必须精确匹配 ref audio）
- Model: `lucasnewman/f5-tts-mlx` (HF cache, 1.3GB)
- **缓存加载必须离线**：`huggingface_hub` 加载模型前默认向 HF 发 etag 检查请求（确认本地缓存是否最新）。
  该请求走系统代理，曾出现连接建立后 9 分钟零数据流动的挂死（qwen4-preview, 2026-08-29）——
  推理本身是纯本地的，卡死的只是「查更新」。B-roll 生成与 VLM 分析的子进程已默认注入
  `HF_HUB_OFFLINE=1`（`lib/b-roll/runner.mjs` + `lib/visual-analyzer.mjs`，设 `HF_HUB_OFFLINE=0` 可退出），
  无需手动 export；TTS 等其余路径仍需跑管线前手动 `export HF_HUB_OFFLINE=1`（权重已在缓存时），
  或先确认代理可用。症状识别：main.mjs 停在 "Loading F5-TTS-MLX model" 超过 3 分钟且
  `nettop` 显示零流量。

- Duration: `estimate_target_seconds(text)` — CJK chars / 4.5 + Latin words / 2.8 + punctuation × 0.15s
- Internal `duration` parameter controls audio length precisely → **no atempo needed**
- Post-processing: **silenceremove DISABLED**. Only resample (44.1kHz) applied.
- **Prosody DISABLED** — rubberband introduces mechanical artifacts on F5's natural output.

**Qwen3-TTS** (BACKUP):

- Model: `~/.qwen-tts-model` (Qwen3-TTS-12Hz-0.6B-Base)

- Post-processing: **silenceremove DISABLED**. Only resample applied.
- No duration control → pacing varies per scene.
- Subtitle alignment may fail due to variable audio lengths.

> Engine selection rationale, alternatives survey, and historical experiments: ADR-0008, `docs/research/voice-cloning-solutions-m2-pro.md`

**Per-Scene Prosody Enhancement**（基于 `visualType`，FFmpeg `rubberband` 滤镜）:

> **⚠️ CUDA 认可基线（2026-09-09）**: 用户认可的 P100 emotion 样本
> （`scripts/short-video/assets/tts-comparison/cosyvoice3-kaggle-p100-cuda/`，2026-09-07 验证）
> 是**纯 instruct2 输出**——无 inference `speed`、无 rubberband。两层叠加会改变音色/语速，
> 偏离认可声音（hook 口音漂移、CTA 与认可版不一致的根因）。CosyVoice3-Kaggle-CUDA 默认
> 关闭此表（kernel `torch.manual_seed(20260907)` 固定采样）；需要时显式 `TTS_PROSODY=1`
> opt-in。全局语速用 `TTS_ATEMPO`（不改音高）。
> 推理调用基线：`inference_instruct2(text, instruct_text, ref_path, stream=False)`，
> instruct 用 `INSTRUCT_MAP`（`lib/tts/cosyvoice3-kaggle-cuda.mjs`）+ `<|endofprompt|>` 后缀。

| visualType | Pitch  | Tempo  | Volume | Label                            |
| ---------- | ------ | ------ | ------ | -------------------------------- |
| `hook`     | +4%    | +6%    | +15%   | hook (urgent/energetic + louder) |
| `data`     | -2%    | -2%    | 0%     | data (authoritative)             |
| `quote`    | 0%     | -3%    | 0%     | quote (deliberate/emphasis)      |
| `cta`      | -2%    | -5%    | 0%     | cta (warm/inviting)              |
| 其他       | 无变化 | 无变化 | 无变化 | baseline                         |

- 参数推导：`docs/research/voice-prosody-hook-optimization.md`

**Post-Processing** (applied to all engines):

| Processing            | F5  | Qwen | Notes                                                                                   |
| --------------------- | --- | ---- | --------------------------------------------------------------------------------------- |
| silenceremove         | OFF | OFF  | Compresses pauses >0.25s. Causes "bursting" at scene transitions. All engines disabled. |
| highpass (80Hz)       | ON  | ON   | Removes low-frequency hum. Disable: `TTS_HIGHPASS=0`                                    |
| afftdn denoise (nr=5) | ON  | ON   | Removes noise floor. Disable: `TTS_DENOISE=0`                                           |
| rubberband prosody    | OFF | ON   | Per-scene pitch+tempo. F5 disabled (mechanical artifacts).                              |
| atempo                | OFF | OFF  | Post-hoc speed change. Causes mechanical voice. **NEVER use with F5**.                  |
| resample (44.1kHz)    | ON  | ON   | Standardize sample rate for assembly                                                    |

**Force engine**: `export TTS_ENGINE=cosyvoice3-mlx` / `f5-mlx` / `qwen-tts` / `edge-tts` / `say`

### Reference Audio Format (M4A → WAV)

不要把 `.m4a` 参考音频直接传给本管线的 Python 音频读取路径。`soundfile` 和部分 `librosa`/TTS 路径会落到 libsndfile，并在这里拒绝 M4A。先转换为 24 kHz、mono、PCM 16-bit WAV：

```bash
ffmpeg -y -i input.m4a -ar 24000 -ac 1 -c:a pcm_s16le \
  scripts/short-video/voice-samples/voice-sample-24k.wav
```

用 `ffprobe` 确认 `codec_name=pcm_s16le`、`sample_rate=24000`、`channels=1`。`LibsndfileError: Format not recognised` 通常表示输入仍是 M4A，或文件不是有效的 WAV。

**Subtitle alignment**: Uses `text-align.py` (wav2vec2 forced alignment) — NOT Whisper recognition. We already know the text (from scene-data.mjs), so we align known text to known audio directly. Output: `output/{pipelineId}/audio/subtitle-timing.json`.

## VLM Asset Analysis

The pipeline uses two independent Python subprocesses managed by `visual-analyzer.mjs`:

1. **Focus detector** (`focus_detector.py`, OpenCV) — fast spatial analysis (~180ms/image, <1s startup, ~200MB peak)
2. **VLM** (`vlm_analyzer.py`, Qwen3-VL-8B-8bit via mlx-vlm) — semantic analysis (~20-30s/image, ~100-120s/video, 12-17s model load)

Two-phase execution: Phase 1 `detectFocus()` batch → `closeFocusDetector()` (releases ~200MB) → Phase 2 `describeImage/Video()` + `analyzeFit()` → `closeVisualAnalyzer()` (releases ~11GB).

Graceful degradation: if Python or model unavailable, returns empty strings. Pipeline continues with keyword-only matching.

Video analysis timeout: 180s (`RESPONSE_TIMEOUT_MS`).

> Decisions: ADR-0009 (VLM), ADR-0015 (Focus detection). Alternatives survey: `docs/research/asset-focus-detection-alternatives.md`

## B-roll Generation (FastVideo MLX)

Scene-matched generated video backgrounds, on-device (FastVideo `FastMetal-1.3B-QAD` on MLX — see Checkpoint below). Opt-in per scene; a scene-data file using none of these fields behaves exactly as before.

| Field            | Value                    | Effect                                                                     |
| ---------------- | ------------------------ | -------------------------------------------------------------------------- |
| `mediaStrategy`  | absent or `"asset"`      | stock sourcing only (default)                                              |
|                  | `"b-roll"`               | skip sourcing, generate 2 video candidates                                 |
|                  | `"asset-then-broll"`     | source first; generate video only if the scene ended up without media      |
|                  | `"ai-image"`             | skip sourcing, generate 2 static-image candidates (T2I, #155 — see below)  |
|                  | `"asset-then-ai-image"`  | source first; generate an image only if the scene ended up without media   |
| `aiVideo.prompt` | string                   | required for the video strategies — 8 dimensions below                     |
| `aiImage.prompt` | string                   | required for the image strategies — 6 dimensions (video template minus CAMERA/MOTION) |

`verify-video.mjs --pre` enforces the contract (rule `B-roll strategy contract` in `lib/scene-rules.mjs`): an unknown strategy value FAILs, a video strategy with a missing or blank `aiVideo.prompt` FAILs, an image strategy with a missing or blank `aiImage.prompt` FAILs, and `mediaOptOut: true` on a generating scene WARNs and skips — a deliberate CSS-only scene is a choice, not an error.

**Where it runs**: Step 1.5d of `main.mjs`, after upscale. A 480×832 clip trips the "short side < 720" rule, so the assigned media carries `upscale: false` — that covers both upscale boundaries (Step 1.5b and `render-remotion.mjs`'s copy-to-`public/` step), and a generated clip never reaches Real-ESRGAN. Standalone entrypoint: `node scripts/short-video/generate-broll.mjs --content <dir>` (`--help` lists the flags; `--force` regenerates past the cache, `--scene <id>` targets one scene while iterating on a prompt).

**Non-destructive**: a gated winner is assigned to `scene.media` in memory. `scene-data.mjs` is never rewritten, so every rerun starts from the same declared intent and a content dir shows no diff from the stage alone.

**Report**: `output/<contentDir>/b-roll-report.json` — per scene the strategy, `promptHash`, `round`, status, every candidate with its score and the VLM's reason, and the winner. It is the agent's iteration input. `verify-video.mjs` renders it as the `B-roll Checks` block, which is the only B-roll surface HITL sees; anything short of `won` warns there and never blocks publishing.

### Tier A parameters

Defaults live in `lib/b-roll/runner.mjs`; what the code cannot say is why each one is fixed:

| Parameter                 | Reason                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| 480×832, 81 frames, 16fps | portrait native — the spike's landscape clips lost both edges to the 9:16 crop |
| int8                      | baked into the checkpoint; there is no runtime quantization flag to set        |
| `taehv` decode            | the decoder that fits this footprint                                           |
| 3-step DMD `1000,757,522` | the distilled schedule; the full one blows the time budget                     |
| `maxSequenceLength 512`   | the prompt's token budget — a longer prompt truncates silently                 |

Measured ≈235 s per clip on M3 Max (encode 28.6 + denoise 183.7 + decode 22.3); `EST_SECONDS_PER_CLIP = 240` is what the CLI estimate prints from.

**Tier B** — refine pass, `wan-vae`, full-precision DiT — OOMs on M3 Max. Quality gains come from the prompt, not from these knobs.

In `mlx_wan_batch.py` every job denoises before anything decodes: `taehv` calls `mx.clear_cache()`, which evicts the compiled DiT, so interleaving decode would re-trace per clip. Preserve that ordering.

### Dependencies

| Env var                | Default                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `FASTVIDEO_REPO`       | `scripts/short-video/experiments/fastvideo-spike/repo` (gitignored checkout) |
| `FASTVIDEO_PYTHON`     | probes `repo/.venv/bin/python3`, then `~/.video-tts-env/bin/python3`         |
| `BROLL_MODEL_ROOT`     | unset → HF cache snapshot of `FastMetal-1.3B-QAD`                            |
| `BROLL_MLX_CHECKPOINT` | unset → discovered under `BROLL_MODEL_ROOT`                                  |

The repo-local venv is the working interpreter — `~/.video-tts-env` lacks `cloudpickle`. A `FASTVIDEO_PYTHON` you set yourself is honored as given, with no fallback. When a dependency is missing the stage prints `⚠️ B-roll skipped: …` and the pipeline continues without generated media.

**Checkpoint** — `FastVideo/FastMetal-1.3B-QAD`: DMD2-distilled 1.3B Wan 2.1 with an INT8 quantization-aware-trained DiT, **Apache-2.0**, so generated clips need no license review before publishing. The `FastWan2.1-T2V-1.3B-Diffusers` named as its base is **lineage only** — the full-precision weights it was distilled from; this pipeline loads the MLX-packed DiT, never those. The weights live in neither the repo checkout nor the venv: the batch script resolves them from the Hugging Face cache through the repo's **current `main` revision**. Opted-in network means an upstream push silently turns a warm cache into a fresh 1.5 GB download in the middle of a run — pipeline runs are offline by default (`HF_HUB_OFFLINE=1`, see TTS section) and fail fast on a missing weight instead; opting out restores the online check, which is also how a deliberate model upgrade fetches the new revision. Two things that cost a session to learn:

- Keep the cache where it is (`~/.cache/huggingface/hub`). The spike's `--model-root /tmp/fastmetal_model` is gone the next boot — and the run does not say so, it just starts fetching.
- If that fetch hangs, it is the `xet` transport, not the network (observed: frozen at 142 KB for 14 minutes while plain HTTP pulled 3 MB/s). Re-fetch over HTTP, then rerun: `HF_HUB_DISABLE_XET=1 python -c "from huggingface_hub import snapshot_download; snapshot_download('FastVideo/FastMetal-1.3B-QAD')"`.

**Pinning them** — left unset, every batch re-resolves the cache snapshot, which costs a `GET /revision/main` and re-downloads silently on a cache miss. Both vars are checked before the batch starts — `BROLL_MODEL_ROOT` for existence, `BROLL_MLX_CHECKPOINT` for a packed DiT (`mlx_dit.json` + `mlx_dit.safetensors`) — and a failed check prints `⚠️ B-roll skipped: …` while the pipeline continues. Pin the checkpoint alone and the text encoder / VAE still come from the cache; pin the root as well to take those off the network too. Passing `--mlx-checkpoint` also drops `transformer/*` from resolution — the raw DiT weights a packed checkpoint makes unnecessary.

The batch script's stdout streams through `generate-broll.mjs` and Step 1.5d as it runs (child launched with `PYTHONUNBUFFERED=1`), so a stalled download and a slow denoise look different: `content/<dir>/assets/b-roll/` appears once job 1 starts.

### The 8-dimension prompt

SUBJECT · VISUAL METAPHOR · BRAND · REFERENCE · CAMERA · MOTION · LIGHTING · NEGATIVE — one clause each. A prompt that only names a subject reproduces the spike's failure mode: generic glow, unrelated to the narration.

Text belongs to the caption layer: `scene.texts` carries numbers and names, and the clip behind it carries none — T2V models garble glyphs. Keep the whole prompt inside the 512-token budget.

**Code-owned dimensions (#166 layer 2)**: `lib/b-roll/prompt-injection.mjs` composes the prompt that reaches the generator. The agent declares SUBJECT / VISUAL METAPHOR / BRAND / REFERENCE / CAMERA / MOTION / LIGHTING; the code appends what is fixed:

- **NEGATIVE** — always injected. Semantic groups missing from the declared prompt are appended (`no text` / `no hands` / `no watermark`), so agents stop hand-writing them. Existing clauses are never duplicated.
- **BRAND** — the `#0a0a14` dark base and blue-cyan tech palette, plus the subject entity's accent color (DeepSeek blue, Huawei red, Alibaba/Qwen amber, Tencent green — `docs/brand-system.md` → Entity Color Mapping), appended only when the declared prompt does not already art-direct the scene (its own background/palette/color words win).
- **CAMERA / MOTION / LIGHTING** — advisory defaults per `visualType` are exported (`dimensionDefaultsFor`); copy them into the prompt, override freely — never force-injected.
- **Budget** — the composed prompt must stay under a 480-token estimate (encoder truncates at 512, silently, tail-first). Over-budget scenes are refused before any GPU time with a `token-budget` reason in the report.

The report entry records both surfaces: `prompt` (declared) and `generationPrompt` (composed). `verify-video.mjs --pre` still sweeps the declared prompt for Arabic numerals and warns without blocking (check `B-roll prompt dimensions`) — a data value belongs in `texts`, though an element count (`3 layers`) is a legitimate thing to write. SUBJECT / VISUAL METAPHOR / REFERENCE stay 100% on the agent — they are the ones a template cannot write for you.

### Agent prompt-iteration protocol

The agent rewrites prompts; a human does not. After any run leaves a scene short of `won`:

1. Read the scene's report entry — the declared prompt, the composed `generationPrompt`, both candidate scores, and the VLM reason.
2. Attack the dimension the reason points at: off-topic → SUBJECT / VISUAL METAPHOR; watermark or garbled text → check `generationPrompt` actually carries the NEGATIVE clauses (and shorten the prompt if they were budget-truncated); static or flat → CAMERA / MOTION / LIGHTING (defaults live in `lib/b-roll/prompt-injection.mjs`).
3. Re-run `generate-broll.mjs --content <dir> --scene <id>` and read the report again.
4. `round` counts generations per scene. Past 3 the entry becomes `escalated` and the stage refuses to spend more time on it — surface the escalated scene, its candidates and scores to the user.

### AI Image (T2I) generation — Z-Image Turbo (#155)

Static-image counterpart of the video path above, for scenes that need a picture with no stock equivalent (architecture diagrams, throughput visuals, abstract concepts — the assets `qwen-architecture.png` / `qwen-throughput.png` were hand-made precisely because sourcing returns nothing on-topic for these). Strategies `ai-image` / `asset-then-ai-image` (see table at the top of this chapter) run through the same orchestrator, the same VLM gate, the same `b-roll-report.json`, and land winners in the same `content/<dir>/assets/b-roll/` directory — as `scene-<id>-seed<seed>.png`.

**Backend**: mflux's **Z-Image Turbo** (Tongyi-MAI `Z-Image-Turbo`, 6B, **Apache-2.0**; mflux itself is **MIT**), run locally on MLX. Default checkpoint is the pre-quantized 4-bit `filipstrand/Z-Image-Turbo-mflux-4bit` — a fraction of the ~31 GB full-precision weights, and the variant measured at **~30 s per 832×1216 image on M3 Max**. Fallback路线 (no separate admission needed — same local-model rule): **Z-Image base** (`mflux-generate-z-image`, CFG=4, `--guidance 4`, `--steps 50`) and SD3.5 sit behind `AI_IMAGE_BACKEND`; both are CFG-capable, which matters for the negative prompt below.

**Negative prompt reality (the load-bearing backend fact)**: Z-Image Turbo is guidance-distilled — CFG is disabled, so mflux accepts `--negative-prompt` on this path but never encodes it (the same architectural drop as FLUX schnell/dev, mflux issue #498). The runner therefore passes `--negative-prompt` **only** to CFG-capable backends (`mflux-z-image`, `sd3.5`) and omits it on the Turbo default. The NEGATIVE clauses still ride the composed prompt (`composeImagePrompt` injects them exactly as on the video side), where they act whenever a CFG backend is selected; on Turbo, quality is backstopped by the VLM relevance gate — a bad candidate simply fails the gate and costs a round, which is the accepted trade-off.

**The 6-dimension prompt**: the 8-dimension video template minus CAMERA and MOTION — SUBJECT · VISUAL METAPHOR · BRAND · REFERENCE · LIGHTING · NEGATIVE. A still has no camera move and no motion, so those two agent dimensions disappear; everything else (code-owned BRAND/NEGATIVE injection, entity accent color, art-direction skip, numeral sweep via `checkBrollPromptDimensions`) behaves identically, composed by `composeImagePrompt` in `lib/b-roll/prompt-injection.mjs` on top of `scene.aiImage.prompt`.

**Budget**: the composed image prompt reuses the same conservative 480-token estimate. Z-Image's text encoder (a Qwen3 LLM) has a far larger native context than UMT5's 512, but mflux exposes no per-model sequence constant to pin — the shared fail-safe budget over-estimates and holds for every current and future backend, and image prompts are short diagram descriptions anyway. Over-budget scenes are refused before any GPU time (`token-budget` reason in the report).

**Dependencies**:

| Env var            | Default                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `AI_IMAGE_BACKEND` | `mflux-z-image-turbo` (also accepts `mflux-z-image`, `sd3.5`)       |
| `MFLUX_BIN`        | probes `~/.video-t2i-env/bin/mflux-generate-z-image-turbo`, then `~/.video-tts-env/bin/…`, then PATH |
| `AI_IMAGE_MODEL`   | `filipstrand/Z-Image-Turbo-mflux-4bit`                             |
| `AI_IMAGE_WIDTH` / `AI_IMAGE_HEIGHT` | 832 / 1216 (portrait, matching the 9:16 frame)  |
| `AI_IMAGE_STEPS`   | 9 (the distilled schedule)                                         |

Install mflux in its **own venv** — `python3 -m venv ~/.video-t2i-env && ~/.video-t2i-env/bin/pip install mflux` (or `uv tool install mflux`). mflux's dependency floor (`huggingface-hub>=1.1.6`, `pillow>=12.3`, `torch`) conflicts with the TTS pins in the shared `~/.video-tts-env` (`mlx-audio` needs `transformers<5`, `pillow<12`), which is why the probe order prefers the dedicated venv; putting it in the shared venv breaks TTS. First run downloads the checkpoint to the HF cache — like the video runner, the child defaults to `HF_HUB_OFFLINE=1`, so a deliberate first download or model upgrade runs with `HF_HUB_OFFLINE=0`. When the binary is missing the stage prints `⚠️ B-roll skipped: …` for the image kind only and the pipeline continues; video generation on the same run is unaffected (each backend kind probes and fails independently).

**Landing**: an image winner assigns `scene.media` with `type: "image"`, `source: "AI-generated (mflux Z-Image Turbo)"`, `animation: "fade"`, `upscale: false` (832×1216 clears the short-side < 720 heuristic, but an env-overridden smaller size must never reach Real-ESRGAN), and no `volume` — a still has nothing to attenuate. A winner under existing media lands as `media.backdrop`, exactly like the video path. Cache/round/escalation semantics are shared with video: same `promptHash` over the composed image prompt, same 3-round escalation, same `decideCache` reuse.

## Logo Handling

**Video-grade brand mark**: `scripts/short-video/assets/china-ai-news-mark-video.svg` — viewBox'd, brand-palette fills (`#4d8bff`/`#ef4444`), generated **idempotently** by `scripts/short-video/build-mark-svg.mjs` from `china-ai-news-mark.svg`. Change the mark → edit the source SVG, then re-run the builder. Used in three places:

- **Brand bar** (top-left on opener/mid scenes): 48px, in `brandBar()`
- **Watermark** (top-left on non-brand scenes): 55px, `opacity: 0.35`, at `top: 60px; left: 60px` (`WATERMARK_POS` in `lib/safe-zones.mjs`)
- **CTA scene**: 130px centered in the hero slot — rendered by the shared CtaScene end card (`remotion/src/scenes/CtaScene.tsx`), never hand-rolled

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

**Hashtag 手动覆盖**：在 `meta.mjs` 中设置 `hashtags` 数组（3-5 个）可锁定 hashtag 输出，跳过自动推导。`generate-caption.mjs` 读取 `meta.mjs.hashtags`（非空时优先于 `keyEntities` 自动匹配）。锁定模式下 trending hashtags 不隐式注入——如需 trending tag，手动加入数组。未设置时 `deriveHashtags()` 从 `keyEntities.companies` 自动匹配 + 默认流量标签。

> Enforcement: `verify-video.mjs` runs automated checks after every video — do NOT publish until all checks pass. TikTok best practices, analytics, series strategy and scaffold guides: see "Design Decisions & References" at the bottom.

## File Locations

### Skills (2)

| Skill                  | Path                                             | Role                                                                 |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `short-video-pipeline` | `~/.catpaw/skills/short-video-pipeline/SKILL.md` | Workflow steps + Defaults + Architecture reference                   |
| `brand-system`         | `~/.catpaw/skills/brand-system/SKILL.md`         | Brand methodology — reads `docs/brand-system.md` and enforces tokens |

### Docs (2)

| Doc            | Path                     | Role                                                                                        |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| Video runbook | `docs/video-production-runbook.md` | ← **THIS FILE** — best practices, publishing strategy, file inventory, optimization lessons |
| Brand system   | `docs/brand-system.md`   | Color tokens, typography, animation library, 9 scene templates, media strategy (Route C)    |

### AGENTS.md (1)

| Section          | Path                                | Role                                                                       |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Content Pipeline | `AGENTS.md` → `## Content Pipeline` | Entry point — tells agent to load skills + read this file for optimization |

### Code — Pipeline

```text
scripts/short-video/
├── main.mjs                # Pipeline orchestrator (--content, --bgm, --skip-verify, --max-retries)
├── render-only.mjs         # Re-render from existing audio (no TTS) — fast visual/subtitle iteration
├── generate-broll.mjs      # Standalone B-roll generation entrypoint (--help)
├── verify-subtitles.mjs    # CLI wrapper — subtitle verification
├── text-align.py           # wav2vec2 forced alignment (known text → audio)
├── qwen_tts_batch.py       # Qwen3-TTS batch TTS (fallback engine)
├── lib/                    # Shared infrastructure (content-agnostic)
│   ├── tts/                # TTS engine registry + adapters
│   │   ├── registry.mjs    # Engine selector (F5-MLX > Qwen3 > edge-tts > say)
│   │   └── post-process.mjs # Audio post-processing (silenceremove + prosody)
│   ├── timeline.mjs        # Frame-exact scene durations + offsets (single source of truth)
│   ├── subtitles/          # cues.mjs (chunking + Netflix timing) / ass.mjs (\kt anchors, 1ms) / generate.mjs
│   ├── assemble.mjs        # Output-path resolution for the final video (rendering lives in render-remotion.mjs)
│   ├── render-remotion.mjs # Remotion render driver (React → frame-by-frame → final MP4)
│   ├── renderer-guard.mjs  # Fails fast on the retired --playwright flag / meta.renderer opt-out
│   ├── generate-bgm.mjs    # Procedural cyber-ambient BGM
│   ├── verify-retry.mjs    # Verify-retry loop: classify failure → repair → re-verify (--max-retries)
│   ├── b-roll/             # Generated B-roll (FastVideo MLX)
│   │   ├── orchestrator.mjs # Route by mediaStrategy, cache + rounds, batch, gate, assign winner
│   │   ├── runner.mjs      # spawn the MLX batch + Tier A defaults + dependency probe
│   │   ├── mlx_wan_batch.py # Python batch runner (denoise all, decode last)
│   │   ├── gate.mjs        # VLM relevance gate (threshold 60, fail-closed)
│   │   └── report.mjs      # b-roll-report.json read/write, promptHash, round rules
│   └── audio/              # Gapless master (track.mjs) + FFT onset sync (sync.mjs, >80ms drift = FAIL) + FAIL diagnostics (diagnostics.mjs)
├── retired-html-path/      # Frozen archive of the retired HTML/Playwright renderer (decision 59)
├── content/                # One dir per article (meta.mjs + scene-data.mjs required)
├── assets/logos/           # Company logos
├── voice-samples/          # TTS ref audio/text (gitignored, personal)
└── output/                 # Pipeline outputs (isolated per pipelineId)
    └── {pipelineId}/
        ├── audio/          # TTS audio + subtitle-timing.json
        ├── video/          # Remotion-rendered MP4 (single renderer)
        ├── subtitles.ass   # ASS subtitle file
        ├── verification-report.json # Subtitle verification report
        └── {pipelineId}-short.mp4  # Final video
```

### Key Paths & Environment

| Item             | Path / Value                               | Notes                                                                    |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| ffmpeg-full      | `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` | Contains libass (subtitle burn-in). Plain ffmpeg lacks subtitles filter. |
| Unified TTS venv | `~/.video-tts-env` (Python 3.12)           | F5-TTS-MLX + Qwen3-TTS + whisperx                                        |
| Qwen3-TTS model  | `~/.qwen-tts-model`                        | Qwen3-TTS-12Hz-0.6B-Base                                                 |

## Running the Pipeline

### Pre-render Gate

启动主管线前先验证 Scene Data：

```bash
node scripts/short-video/verify-video.mjs --pre --content <dir>
```

`main.mjs` 会在 Step 0 再执行同一检查，失败时拒绝继续。只有用户明确批准本次例外时才可传 `--skip-preflight`。Preflight 位于素材自动补全之前，因此可自动修复的缺媒体只产生待处理信号；素材处理后的 Step 1.6 final media gate 才对最终缺失执行 hard FAIL。

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

| Step | Action                                                                                                                                                                                                                                                                       | Output                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1    | Generate TTS voiceover (F5-TTS-MLX)                                                                                                                                                                                                                                          | `output/{id}/audio/scene-*.mp3` + `subtitle-timing.json` |
| 1.6  | **Final media gate — hard FAIL** after sourcing/patch/upscale/b-roll (media layouts must have their media)                                                                                                                                                                   | `lib/final-media-gate.mjs` failure list                  |
| 2    | Validate every scene received a TTS result                                                                                                                                                                                                                                   | fail-fast on missing voiceover                           |
| 3    | Generate BGM (optional, `--bgm`)                                                                                                                                                                                                                                             | `output/{id}/bgm.mp3`                                    |
| 4    | Generate ASS subtitles                                                                                                                                                                                                                                                       | `output/{id}/subtitles.ass`                              |
| 5    | Render the final video with Remotion (React → frame-by-frame, 1080×1920): TextGate geometry gate (safe zones / container overflow / glyph ink / annotation bounds, `cancelRender` with `[TextFitError]`) runs during this render, then ASS burn-in / BGM mix / loudness norm | `output/{id}/{id}-v{version}-short.mp4`                  |
| 6    | Verify subtitles with auto-retry (auto, `--skip-verify` to skip, `--max-retries N` default 2)                                                                                                                                                                                | `output/{id}/verification-report.json`                   |

### Version Numbers

Every pipeline run generates a **versioned output file**: `{pipelineId}-v{YYYY-MM-DDTHH-MM-SS}-short.mp4`.

A **latest copy** (`{pipelineId}-short.mp4`) is NOT created — the versioned file is the canonical output; the unversioned name only appears as a fallback when resolving outputs produced before versioning existed.

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

| Topic                           | Reference                                                   | Content                                                                 |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| TTS engine selection            | ADR-0019, ADR-0008, `docs/research/voice-cloning-solutions-m2-pro.md` | Engine comparison, alternatives survey                                  |
| Audio drift fix                 | `docs/research/audio-drift-fix.md`                          | Root cause analysis, fix implementation, sync verification, diagnostics |
| Per-scene prosody (pitch/tempo) | `docs/research/voice-prosody-hook-optimization.md`          | 15 sources, per-parameter rationale, research citations                 |
| TikTok best practices           | `docs/tiktok/tiktok-best-practices.md`                      | Signal weights, voice rules, hook formulas, audit checklist             |
| A/B testing methodology         | `docs/tiktok/ab-testing-methodology.md`                     | Element iteration method, single-variable testing philosophy            |
| Multi-video splitting           | `docs/series-production-guide.md` (L1)                      | Episode splitting strategy, inter-episode linking, compilation          |
| New content scaffold            | `docs/content-scaffold-guide.md` (L1)                       | Directory structure, file templates, CSS overflow checklist             |
| Analytics & optimization        | `docs/analytics-workflow.md` (L1)                           | Analytics export, A/B test tracking, optimization loop                  |
| Brand visual identity           | `docs/brand-system.md`                                      | Color tokens, typography, animation library, scene templates            |
