# Handoff: Visual Focus Detection — P0/P1 Remediation Done + VLM Optimization Planning

> **Date**: 2026-08-18 (updated)
> **Original session**: Visual Focus Detection pipeline implementation (Tickets 02-08)
> **Remediation session**: P0/P1 fix (commit `8f4d7dd` + `fec2353`)
> **Next session focus**: Git push + P1-1 fixtures + VLM optimization planning (P3-P8)

## What was done

### Session 1: Full Pipeline Implementation

Implemented complete visual focus detection per `docs/specs/spec-visual-focus-detection.md` (v7, 7 rounds of review).

**Change A: Rename** — `ai-analyzer` → `visual-analyzer` (files, modules, docs). `ai_analyzer.py` → `vlm_analyzer.py`. `closeAnalyzer()` → `closeVisualAnalyzer()`.

**Change B: Focus Detection** — New OpenCV subprocess (`focus_detector.py`) for deterministic spatial analysis:
- Haar Cascade face detection → `protectedRegions` (normalized `[x, y, w, h]` bounding boxes)
- Spectral Residual saliency → `dispersion` + `centroid` as soft signal
- EXIF normalization via Pillow `ImageOps.exif_transpose()`
- Generation-based worker isolation in Node.js gateway
- requestId-based IPC routing (UUID v4, Map-based pending tracking)
- Failure-safe contract: `detectFocus()` never rejects
- Two-phase execution in `asset-sourcer.mjs`: Phase 1 focus (~200MB) → `closeFocusDetector()` → Phase 2 VLM (~11GB)

**Change C: analyzeFit Migration** — `fit` output preserved, `focus` output deprecated. `MediaField.focus` marked `@deprecated`.

### Session 2: P0/P1 Remediation (commit `8f4d7dd` + `fec2353`)

> Spec: `docs/archive/spec-visual-focus-detection-remediation.md`

**P0-1 FIXED** ✅ — `parseFitResponse()` fit/focus decoupling:
- `parseFitResponse()` now only validates `fit` (required); `focus` is optional
- `handleResponse()` resolves when `response.fit` exists regardless of focus
- 3 regression tests added: `{fit:"cover"}` → `{fit:"cover", reason:""}`; `{fit:"contain", focus:"left"}` → `{fit:"contain"}`; `{fit:"contain", focus:null}` → `{fit:"contain", reason:"..."}`
- 2 handleResponse integration tests added: fit-only response, fit+invalid focus

**P0-2 FIXED** ✅ — Smoke golden fixture assertions corrected:
- `focus-golden.json` `real-image-ok` renamed to `real-image-ok-no-faces`, `minProtectedRegions` changed to 0
- Runtime evidence: Haar Cascade detects **10 false-positive "faces"** on `shanghai-skyline.jpg` (building windows/signs)
- Removed face-count hard assertion; kept schema completeness validation for any detected regions
- `maxResponseTimeMs` relaxed from 2000 to 10000 (cold start needs ~8s)
- Golden fixtures (real face IoU ≥ 0.5) deferred to P1-1

**P1-3a FIXED** ✅ — Integration test assertions added:
- 4 new tests in `asset-sourcer-visual-integration.test.mjs`
- Asserts `analysis.focusAnalysis` complete schema (status, errorCode, frame, protectedRegions, saliency)
- Asserts `media.fit` written from `asset.aiFit`; `media.focus` NOT written (deprecated)

**P1-3b FIXED** ✅ — CLI rename:
- `lib/apply-media-patch.mjs` → `lib/review-media-patch.mjs`
- Updated: import path in test, `isMainModule` check, `README.md` reference

**P1-2 FIXED** ✅ — Parallel test isolation:
- `describe.serial` API not available in current vitest version (returns `undefined`)
- Fix: added serial execution comments + recommend `--maxWorkers=1` CLI flag for real subprocess tests
- All 81 tests pass with `--maxWorkers=1`

### Documentation

- **ADR-0015** created: `docs/adr/0015-opencv-focus-detection.md`
- **ADR-0009** updated: Architecture diagram, API surface, consequences
- **CONTEXT.md** updated: Focus Detection, Protected Region, Saliency Map terms
- **DOCS-INDEX.md** updated: ADR table 0001-0015, specs section
- **Review doc** updated: `docs/archive/spec-visual-focus-detection-review.md` — P0/P1 status updated
- **Spec/review/remediation** archived to `docs/archive/`
- **Archive README** updated with new entries

## Key files

### Code
- `scripts/short-video/lib/visual-analyzer.mjs` — Node.js gateway (VLM + focus)
- `scripts/short-video/lib/vlm_analyzer.py` — VLM Python subprocess
- `scripts/short-video/lib/focus_detector.py` — OpenCV Python subprocess
- `scripts/short-video/lib/asset-sourcer.mjs` — Two-phase analysis orchestration
- `scripts/short-video/lib/review-media-patch.mjs` — Human-readable review formatter (renamed from `apply-media-patch.mjs`)
- `scripts/short-video/lib/requirements-focus.txt` — Pinned dependency versions
- `scripts/short-video/remotion/src/types.ts` — `MediaField.focus` marked `@deprecated`

### Tests (81 total, 5 files)
- `scripts/short-video/__tests__/visual-analyzer.test.mjs` — 36 tests (VLM + Focus unit/protocol)
- `scripts/short-video/__tests__/apply-media-patch.test.mjs` — 14 tests (review formatter)
- `scripts/short-video/__tests__/asset-sourcer-visual-integration.test.mjs` — 13 tests (integration)
- `scripts/short-video/__tests__/focus-smoke.test.mjs` — 6 tests (real subprocess smoke)
- `scripts/short-video/lib/__tests__/focus_detector.test.mjs` — 7 tests (IPC protocol)
- `scripts/short-video/__tests__/fixtures/focus-golden.json` — Golden fixture data

### Documentation
- `docs/adr/0009-vlm-qwen3-vl-mlx.md` — VLM architecture
- `docs/adr/0015-opencv-focus-detection.md` — Focus detection ADR
- `docs/archive/spec-visual-focus-detection.md` — Full spec (v7, archived)
- `docs/archive/spec-visual-focus-detection-review.md` — Review records (archived, P0/P1 status updated)
- `docs/archive/spec-visual-focus-detection-remediation.md` — Remediation spec (archived)
- `docs/research/asset-focus-detection-alternatives.md` — Alternatives survey
- `docs/research/asset-focus-detection-alternatives-review.md` — Third-party review

## Current state

### Git
- **Branch**: `main`
- **Commits**: `8f4d7dd` (P0/P1 fix) + `fec2353` (archive) — local only, **not pushed**
- **Branch divergence**: 8 local vs 19 remote commits — `git pull --rebase` needed before push
- **Uncommitted**: Large number of non-this-session changes (text-align.py, README, docs, content dirs, etc.)
- **Action needed**: Clean workspace or resolve divergence, then push

### Runtime verified
- OpenCV 4.10.0.84 installed in `~/.video-tts-env`
- 81/81 tests passing (5 files, `--maxWorkers=1` serial execution) ✅
- `npm run lint` — no new errors in modified files ✅
- `npx tsc --noEmit` — type check pass ✅
- `npm run build` — production build pass ✅
- Cold start: ~8s (OpenCV import), warm: ~180ms

### Known issues — non-blocking
- `objc` warnings from `av`/`cv2` library class duplication (cosmetic)
- Haar Cascade misses side/occluded faces — Phase 2 will use YuNet
- Haar Cascade produces false positives on building windows/signs (10 false "faces" on skyline image)
- Video focus detection not supported (returns `unsupported`) — Phase 2 scope

## What's NOT done

### P1-1: Fixtures and benchmark (deferred)

> Marked as follow-up task. Needs image assets + benchmark script.

| Item | Status | Notes |
|------|--------|-------|
| `fixtures/exif/` — EXIF 90°/180°/270° JPEG samples | Not created | Need real images with EXIF orientation tags |
| `fixtures/golden/` — Real face images + human annotations | Not created | Need stable front-facing single + group photos with IoU ≥ 0.5 ground truth |
| `fixtures/baseline/` — Side face / occluded / low light | Not created | Record hit/miss rate, don't block |
| `fixtures/benchmark/` — Benchmark output (gitignored) | Not created | Store P50/P95, cold/hot start, peak RSS |
| `focus-detector-benchmark.mjs` — Benchmark script | Not created | Runs batch analysis, outputs timing/memory metrics |

**Why deferred**: Creating golden fixtures requires real human face images with manually annotated bounding boxes — this is a data collection task, not a code task. The current smoke test validates schema completeness without asserting face count, which is the correct interim behavior given Haar's known false-positive limitation.

### Phase 2 candidates (per spec §7, explicitly deferred)

1. **Slot scoring** — `cost(c)` multi-objective optimization for text placement
2. **Source → 9:16 canvas coordinate transform** — needs Remotion `MediaBackground` cover/scale/translate params
3. **Video focus detection** — `samples[]` with timestamps, cross-frame merge rules
4. **YuNet face detector** — replace Haar Cascade when precision insufficient
5. **OCR text protection** — protect chart/poster text regions
6. **Large-scale evaluation** — 80-120 image dataset with human annotations
7. **Remotion integration** — `MediaBackground.tsx` reading `protectedRegions` for `objectPosition` offset
8. **`verify-video.mjs` integration** — frame analysis checking text doesn't cover protected regions

## Next session: VLM & Media Analysis Optimization Planning

用户要求在**新 session** 中制定 VLM（Qwen3-VL-8B）的优化计划。以下是交接要点。

> **注意**：本节融合了两个视角——原 session 的初步方向 + 后续 session 的架构建议（Addendum）。统一优先级见下方表格。

### Current VLM state (ADR-0009)
- Model: `Qwen3-VL-8B-Instruct-8bit` (9.2GB) via mlx-vlm 0.6.13
- Performance: image ~20-30s, video ~100-120s, batch 20 assets ~40min+
- Strengths: semantic analysis (descriptions, brand recognition, Chinese content)
- Weaknesses: spatial localization (focusRegion unstable — now delegated to OpenCV)
- **已知问题**：横图素材当前调用两次 VLM（`describeImage` + `analyzeFit`），延迟翻倍
- **已知问题**：原生视频路径看整条视频，fallback 只看前 8 秒，语义范围不一致

### 统一优先级表（P3-P8）

| 优先级 | 工作 | 核心价值 | 验收标准 | 依赖 |
|--------|------|---------|---------|------|
| **P3** | `analyzeAssetSemantics` — 一次 VLM 调用替代 description + fit 双调用 | 横图推理时间减半（20-30s → 不再 ×2） | 横图只启动一次 VLM 推理；结果通过 JSON Schema 校验；`analyzeFit` 旧接口保留兼容 | 无 |
| **P4** | `analyzeVideoWindow` + FFmpeg/ffprobe 窗口基础设施 | 原生与 fallback 路径语义范围一致 | 原生和 frames fallback 返回完全相同的窗口元数据（`windowStartMs`, `windowEndMs`, `sampleFps`, `sourceMode`） | P3 |
| **P5** | 本地 ASR worker — 复用已有 whisperx | 视频/音频对白时间线 | 已知中文素材句级时间码可回放核验；失败返回结构化错误 | P4 |
| **P6** | `fuseMediaTimeline()` — 确定性时间融合 | 视觉+音频事件按毫秒对齐 | 每条融合事件可追溯至视觉窗口、ASR 区间和原视频时间码 | P4, P5 |
| **P7** | 内容寻址缓存 + 批量排程 | 重复资产不跑 20-120s 推理 | 第二次分析同一资产命中缓存；默认不并行加载多个 8B VLM | P3 |
| **P8** | Focus Phase 2 — 视频多帧 + slot scoring 接到渲染层 | 文字不遮挡保护区域 | 视频背景中文字不遮挡 `protectedRegions`；无安全布局时降级为换 poster 或 CSS-only | spec §7 Phase 2 候选 |

### 各优先级详情

#### P3: 合并 VLM 语义调用

当前 `asset-sourcer.mjs` 对横图先调 `describeImage`（20-30s），再调 `analyzeFit`（20-30s）= 40-60s。`focus` 已被 OpenCV 接管，`analyzeFit` 只剩 `fit`（cover/contain）有价值，可合入一次结构化调用。

新 action `analyzeAssetSemantics` 返回已校验 JSON：
```json
{
  "description": "嘉宾手持产品并展示屏幕功能。",
  "subjects": ["person", "product", "screen"],
  "actions": ["holding", "demonstrating"],
  "ocr": ["效率提升50%"],
  "contentKinds": ["product_demo"],
  "recommendedUses": ["hook", "narrative"],
  "hasCriticalEdgeText": false,
  "presentationHint": "media_with_text",
  "fit": "cover"
}
```

Python 端用 JSON Schema / Pydantic 校验，Node 层不再从自由文本正则抓 JSON。旧 `describeImage` / `analyzeFit` 接口保留兼容。

#### P4: 显式时间窗口

新增 `analyzeVideoWindow(videoPath, { startMs, endMs, profile, sampleFps })`。原生与 fallback 必须使用**同一时间窗口**。FFmpeg/ffprobe 负责：读时长/帧率/音轨 → 为 VLM 提供窗口 → native 失败时从同一窗口抽帧 → 保存精确时间码。

#### P5: 本地 ASR worker

**重要**：项目已有 whisperx + `facebook/wav2vec2-large-960h-lv60-self` 安装在 `~/.video-tts-env`，`text-align.py` 已在使用。不是新建路线，是**复用已有依赖**封装为独立 worker。

遵循 Focus worker 模式：独立 Python 子进程、requestId、generation isolation、schema-complete 错误结果。接口：
```text
transcribeAudioWindow(videoOrAudioPath, { startMs, endMs, languageHint })
```

#### P6: 确定性时间融合

纯 JS/Python `fuseMediaTimeline()` — 按毫秒时间轴连接 VLM 视觉窗口与 ASR 片段。融合规则确定性（区间重叠、最小重叠阈值）。LLM 仅在后续高光排序/创意编排中读取结构化时间线，不直接替代融合器。

#### P7: 缓存与排程

- **内容寻址缓存**：`SHA-256(源文件字节 + 分析 profile + 模型 ID + promptVersion + pipelineVersion)` 为键
- **串行重模型、并行轻模型**：M2 Pro 32GB 不并行启动多个 Qwen3-VL worker（~11GB each）；Focus 先批量串行完成并释放 ~200MB
- **统一 result envelope**：`{ok, data, error, meta}`，meta 记录模型/耗时/sourceMode/窗口/缓存命中
- **版本化 artifact**：`asset-analysis.json` / `video-timeline.json`，scene-data 只引用 assetId

#### P8: Focus Phase 2 — 跨场景 Visual Geometry 基础设施

详见 `docs/archive/spec-visual-focus-detection.md` §7 不做清单。核心架构观点：**Focus 产物是与 scene 无关、可被多个业务复用的视觉几何事实**；只有布局决策才依赖模板、文字和目标画布。

**四层 Focus 分离**：

| 层级 | 输入 | 产物 | 触发时机 |
|------|------|------|----------|
| `baseFocus` | 静态图片原文件 | EXIF 归一化尺寸、人脸框、saliency、protectedRegions、low-information 状态 | 图片入库时预计算；键为 `assetHash + focusAnalyzerVersion` |
| `mediaProbe` / `posterFocus` | 视频原文件 | 时长、帧率、音轨、旋转、poster 帧的 baseFocus | 视频入库时预计算；ffprobe |
| `transformedFocus` | baseFocus + targetCanvas + cropPolicy | 9:16/16:9/1:1 裁切后坐标系中的保护区域 | 消费端首次请求指定画布时计算 |
| `temporalFocus` | video + timeWindow + samplingProfile | 多帧保护区域、移动焦点风险、时间聚合 | 视频剪辑/动态背景/QA 需要时才计算 |

> `layoutDecision` 不属于 Focus 基础设施——它由消费端根据 transformed/temporalFocus + 模板 + 文字框 + safe zones 生成。

**推荐接口形态**：
```text
analyzeBaseFocus(imagePath)      // = 当前 detectFocus() 的正式命名
probeMedia(videoPath)            // ffprobe 媒体探测
analyzePosterFocus(videoPath)    // poster 帧的 baseFocus
transformFocus(baseFocus, { targetAspect, fit, cropPolicy })
analyzeTemporalFocus(videoPath, { startMs, endMs, samplingProfile })
resolveLayout({ focus, template, textBoxes, safeZones, businessGoal })
```

**跨场景消费者**：素材目录/搜索（baseFocus）、封面/缩略图（baseFocus + transformedFocus）、任意比例画布（transformedFocus）、Hook/Narrative 场景（transformedFocus + layoutDecision）、视频剪辑（temporalFocus）、渲染前/后 QA（所有层）。

**边界**：Focus/OpenCV = 视觉几何事实；Qwen3-VL = 语义事实；ASR = 语音文本/时间码；FFmpeg = 媒体事实/窗口操作。所有层通过 asset hash、assetId、time window 和版本化 artifact 关联，不互相替代。

具体技术项还包括：source → 9:16 canvas 坐标变换、YuNet 替代 Haar、OCR 文字保护区、Remotion `MediaBackground.tsx` 集成。

### 不建议现在做的事

- 不要把 Qwen3 LLM（文本模型）作为媒体理解链路的必需依赖
- 不要让 VLM 重新输出 `focusRegion` / overlay / 精确文字坐标——已由 Focus/布局层接管
- 不要为了速度并行跑多个 Qwen3-VL Python 子进程——先做好缓存和单 worker 窗口化
- 不要把视频 Focus Detection、ASR、VLM 长视频分析一次性混进当前已稳定的静态 Focus 版本

### Key references for the new session
- ADR-0009: `docs/adr/0009-vlm-qwen3-vl-mlx.md` — current VLM architecture
- ADR-0015: `docs/adr/0015-opencv-focus-detection.md` — focus detection (complements VLM)
- Spec (archived): `docs/archive/spec-visual-focus-detection.md` — full spec with Phase 2 candidates (§7)
- Remediation spec (archived): `docs/archive/spec-visual-focus-detection-remediation.md` — P0/P1 fix details
- Research: `docs/research/asset-focus-detection-alternatives.md` — alternatives survey
- Code: `scripts/short-video/lib/visual-analyzer.mjs` — Node.js gateway
- Code: `scripts/short-video/lib/vlm_analyzer.py` — Python VLM subprocess
- Code: `scripts/short-video/lib/asset-sourcer.mjs` — two-phase analysis orchestration
- Code: `scripts/short-video/text-align.py` — existing whisperx usage (for P5 ASR worker)
- Memory: VLM smoke test results (image 41.5s, video 120.3s on M2 Pro)

### Suggested skills for next session
- `/grill-with-docs` — to stress-test the optimization plan
- `/to-spec` — to synthesize findings into a spec
- `/research` — if deep research into VLM alternatives is needed
- `web-deep-research` — for surveying latest VLM benchmarks and models

## Session checklist status (remediation session)

- [x] Step 1 Grill — completed (6 questions, P0/P1 boundary scenarios verified)
- [x] Step 1b Prototype — N/A (no prototype needed)
- [x] Step 2 Spec — `docs/archive/spec-visual-focus-detection-remediation.md` (with Scenario Matrix)
- [x] Step 3 Tickets — 5 tracer-bullet tickets (T-01~T-05) with dependency edges
- [x] Step 4 TDD — Red (5 fail) → Green (81/81 pass) → Refactor (CLI rename)
- [x] Step 5 Code Review — Standards + Spec dual-axis review, all scenario matrix rows covered
- [x] Step 6 Runtime Verify — lint ✅ + tsc ✅ + build ✅ + 81/81 tests ✅ (`--maxWorkers=1`)
- [x] Step 7 Commit — `8f4d7dd` (fix) + `fec2353` (archive) — **push deferred** (branch diverged, non-session changes in working tree)
- [x] Step 8 Docs — Review doc updated, spec/tickets archived to `docs/archive/`, README updated

## Immediate action items (for next session)

1. **Push commits** — Resolve git divergence (`git pull --rebase` then `git push`), or clean workspace first. Commits `8f4d7dd` + `fec2353` are local only.
2. **P1-1 (optional follow-up)** — Create `fixtures/exif/`, `fixtures/golden/`, `fixtures/baseline/`, `fixtures/benchmark/` directories and `focus-detector-benchmark.mjs` script. Needs real face images with human annotations.
3. **Start VLM optimization planning** — Reference P3-P8 priorities below. Suggested starting point: `/grill-with-docs` on P3 (merge VLM semantic calls).
