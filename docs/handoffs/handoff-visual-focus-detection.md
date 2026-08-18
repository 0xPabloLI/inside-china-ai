# Handoff: Visual Focus Detection Implementation + VLM Optimization Planning

> **Date**: 2026-08-18
> **Session focus**: Completed Visual Focus Detection pipeline (Tickets 02-08) + documentation closure
> **Next session focus**: VLM optimization planning (用户要求在新 session 中制定 Qwen3-VL-8B 的优化计划)

## What was done in this session

### 1. Visual Focus Detection — Full Pipeline Implementation

Implemented the complete visual focus detection feature per `docs/specs/spec-visual-focus-detection.md` (v7, 7 rounds of review). The spec covers three changes:

**Change A: Rename** — `ai-analyzer` → `visual-analyzer` (files, modules, docs). `ai_analyzer.py` → `vlm_analyzer.py`. `closeAnalyzer()` → `closeVisualAnalyzer()`.

**Change B: Focus Detection** — New OpenCV subprocess (`focus_detector.py`) for deterministic spatial analysis:
- Haar Cascade face detection → `protectedRegions` (normalized `[x, y, w, h]` bounding boxes)
- Spectral Residual saliency → `dispersion` + `centroid` as soft signal
- EXIF normalization via Pillow `ImageOps.exif_transpose()`
- Generation-based worker isolation in Node.js gateway (prevents data contamination on subprocess restart/timeout)
- requestId-based IPC routing (UUID v4, Map-based pending tracking)
- **Failure-safe contract**: `detectFocus()` never rejects — all error paths return schema-complete `{status: "degraded", errorCode: "..."}` results
- Two-phase execution in `asset-sourcer.mjs`: Phase 1 focus (fast, ~200MB) → `closeFocusDetector()` → Phase 2 VLM (heavy, ~11GB)

**Change C: analyzeFit Migration** — `fit` output preserved (relatively stable), `focus` output deprecated (unstable). `MediaField.focus` marked `@deprecated` in `remotion/src/types.ts`.

### 2. Output Boundary

`focusAnalysis` is written to `media-patch.json`'s top-level `analysis` field for human review only. It does NOT enter the `media` object consumed by Remotion. `apply-media-patch.mjs` outputs a comment-formatted summary above the `media` block.

### 3. Documentation Closure (this session)

- **ADR-0015** created: `docs/adr/0015-opencv-focus-detection.md` — OpenCV selection, version lock (4.10.0.84), generation isolation, failure-safe contract, performance characteristics.
- **ADR-0009** updated: Architecture diagram now shows two subprocesses; API surface includes `detectFocus()` / `closeFocusDetector()`; consequences section updated with two-phase analysis flow.
- **CONTEXT.md** updated: Added **Focus Detection**, **Protected Region**, **Saliency Map** domain terms. Updated **VLM** entry (module name `ai-analyzer.mjs` → `visual-analyzer.mjs`). Updated **Asset Fit Analysis** (noted `focus` deprecated).
- **DOCS-INDEX.md** updated: ADR table expanded to 0001-0015. New `specs/` section with `spec-visual-focus-detection.md` + review. Research table updated with `asset-source-quick-reference.md`.

## Key files

### Code (implemented)
- `scripts/short-video/lib/focus_detector.py` — OpenCV Python subprocess (new)
- `scripts/short-video/lib/visual-analyzer.mjs` — Node.js gateway, manages VLM + focus subprocesses (renamed + extended)
- `scripts/short-video/lib/vlm_analyzer.py` — VLM Python subprocess (renamed from `ai_analyzer.py`, content unchanged)
- `scripts/short-video/lib/asset-sourcer.mjs` — Two-phase analysis integration
- `scripts/short-video/lib/apply-media-patch.mjs` — Human-readable comment summary output (new)
- `scripts/short-video/lib/requirements-focus.txt` — Pinned dependency versions (new)
- `scripts/short-video/remotion/src/types.ts` — `MediaField.focus` marked `@deprecated`

### Tests
- `scripts/short-video/lib/__tests__/visual-analyzer.test.mjs` — 14 tests (renamed from `ai-analyzer.test.mjs`)
- `scripts/short-video/lib/__tests__/focus_detector.test.mjs` — Protocol + unit tests
- `scripts/short-video/lib/__tests__/asset-sourcer-visual-integration.test.mjs` — Integration tests (renamed)
- `scripts/short-video/lib/__tests__/apply-media-patch.test.mjs` — Output boundary tests (new)
- **Total: 194 tests passing**

### Documentation
- `docs/adr/0015-opencv-focus-detection.md` — This feature's ADR (new)
- `docs/adr/0009-vlm-qwen3-vl-mlx.md` — Updated with focus subprocess references
- `docs/specs/spec-visual-focus-detection.md` — Full spec (v7, pre-existing)
- `docs/specs/spec-visual-focus-detection-review.md` — Review records (pre-existing)
- `docs/research/asset-focus-detection-alternatives.md` — Alternatives survey (pre-existing)
- `docs/research/asset-focus-detection-alternatives-review.md` — Third-party review (pre-existing)
- `CONTEXT.md` — Updated domain terms
- `docs/DOCS-INDEX.md` — Updated index

## Current state

### Git
- **Branch**: `main`
- **Commit**: `0a89105` (local only, not yet pushed — remote had diverged)
- **Uncommitted**: `scripts/short-video/text-align.py` (modified, not from this session)
- **Untracked**: handoff docs, research docs, kaggle scripts, asset images, content dirs
- **Action needed**: User should clean workspace or `git pull --rebase` then push

### Runtime verified
- OpenCV 4.10.0.84 installed in `~/.video-tts-env`
- Smoke test: 180ms response time (target was <1s) ✅
- 194 tests passing ✅
- ⚠️ `shanghai-skyline.jpg` smoke test 断言有误（见下方 P0-2）

### Known issues — P0 blockers (from `spec-visual-focus-detection-review.md`)

> **重要**：实现后复审（`docs/specs/spec-visual-focus-detection-review.md`）发现两个 P0 级未完成项。在修复前，功能**不应被视为完整通过**。

#### P0-1: `parseFitResponse()` 仍将 `focus` 视为必填，违反迁移契约

Spec §4.8 要求 `fit` 必填、`focus` 可选。但 `visual-analyzer.mjs` 中 `parseFitResponse()` 仍要求 `fit && focus` 同时有效才返回结果。当 VLM 返回 `{fit:"cover"}` 或 `{fit:"contain", focus:"left"}` 时会丢失有效 fit，重新引入横图裁切回归。

**修订要求**：
1. `parseFitResponse()` 只校验 `fit`；focus 仅在 `top|center|bottom` 时保留，否则省略
2. `handleResponse()` 在 `response.fit` 存在时立即解析
3. 新增两个回归测试：`{fit:"cover"}` → `{fit:"cover", reason:""}`；`{fit:"contain", focus:"left"}` → `{fit:"contain"}`
4. `asset-sourcer` 集成测试断言 `asset.aiFit` 被写入、`asset.aiFocus` 不被写入

#### P0-2: smoke golden 样本与人脸断言冲突

当前 smoke 测试用 `shanghai-skyline.jpg`（城市天际线，无人脸），却断言 `minProtectedRegions: 1`。该测试通过恰恰说明 Haar 可能假阳性（建筑窗格/标志被误判为 face），不能作为人脸检测质量证据。

**修订要求**：
- 创建 `fixtures/golden/`：至少一张稳定正面单人照 + 一张多人合照，附人工标注框，IoU ≥ 0.5 硬门槛
- 创建 `fixtures/baseline/`：侧脸/遮挡/低光样本，记录命中率不阻断
- `shanghai-skyline.jpg` 断言改为零 face protectedRegions

### Known issues — P1 should-fix (from review)

#### P1-1: Spec 承诺的验证素材和 benchmark 未落地
`fixtures/exif/`、`fixtures/benchmark/`、`fixtures/golden/`、`fixtures/baseline/` 目录和 `focus-detector-benchmark.mjs` 脚本均未创建。EXIF 90°/180°/270° 几何正确性、真实人脸 IoU、冷/热启动 P50/P95、峰值 RSS 均未取得实施证据。

#### P1-2: 跨文件并行测试超时
5 个相关测试文件并行执行时 3 项 timeout（串行 73/73 全通过）。真实 OpenCV 子进程测试需显式顺序执行或独立 Vitest project + 单 worker。

#### P1-3: 资产→patch 集成断言不足 + 同名 CLI 混淆
`asset-sourcer-visual-integration.test.mjs` 未断言 `analysis.focusAnalysis` 映射后的完整 schema。顶层 `apply-media-patch.mjs`（写入工具）与 `lib/apply-media-patch.mjs`（审阅 formatter）同名易误用，建议重命名审阅 CLI 为 `review-media-patch.mjs`。

### Known issues — non-blocking
- `objc` warnings from `av`/`cv2` library class duplication (cosmetic)
- Haar Cascade misses side/occluded faces — Phase 2 will use YuNet
- Video focus detection not supported (returns `unsupported`) — Phase 2 scope

## What's NOT done

### P0 blockers (must fix before declaring Phase 1a complete)

> 详见上方「Known issues — P0 blockers」和 `docs/specs/spec-visual-focus-detection-review.md`。

| # | 问题 | 影响 |
|---|------|------|
| P0-1 | `parseFitResponse()` 仍要求 fit+focus 同时有效 | 横图裁切回归风险 |
| P0-2 | smoke golden 样本用天际线图断言人脸 | 人脸检测质量无证据，假阳性被当成功 |

### P1 should-fix (before merging to stable)

| # | 问题 | 影响 |
|---|------|------|
| P1-1 | fixtures/exif, benchmark, golden, baseline 目录未创建 | EXIF/IoU/性能指标无实施证据 |
| P1-2 | 并行测试超时 | CI 不稳定 |
| P1-3 | patch 集成断言不足 + 同名 CLI 混淆 | 映射链路无端到端验证；用户可能误用写入工具 |

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

**重要**：项目已有 whisperx + `facebook/wav2vec2-large-960h-lv60-self` 安装在 `~/.video-tts-env` [[memory:17868067581926031155]]，`text-align.py` 已在使用。不是新建路线，是**复用已有依赖**封装为独立 worker。

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

详见 `docs/specs/spec-visual-focus-detection.md` §7 不做清单。核心架构观点：**Focus 产物是与 scene 无关、可被多个业务复用的视觉几何事实**；只有布局决策才依赖模板、文字和目标画布。

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
- Spec: `docs/specs/spec-visual-focus-detection.md` — full spec with Phase 2 candidates (§7)
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

## Session checklist status

- [x] Step 1 Grill — completed (7 rounds of spec review)
- [x] Step 1b Prototype — N/A (no prototype needed)
- [x] Step 2 Spec — `docs/specs/spec-visual-focus-detection.md` (v7)
- [x] Step 3 Tickets — Tickets 02-08拆分完成
- [x] Step 4 TDD — 194 tests passing (red → green → refactor)
- [x] Step 5 Code Review — 内审完成（spec review rounds）
- [x] Step 6 Runtime Verify — smoke test 180ms ✅, 194 tests ✅, **但复审发现 P0-1/P0-2 未通过（见 review 文档）**
- [ ] Step 7 Commit & Push — commit `0a89105` local only, **push pending** (remote diverged)
- [x] Step 8 文档更新 — ADR-0015, ADR-0009, CONTEXT.md, DOCS-INDEX.md all updated
- [ ] Spec/Ticket 归档 — `spec-visual-focus-detection.md` 尚在 `docs/specs/`（实施完成后应移到 `docs/archive/`）

## Immediate action items
1. **修复 P0-1 + P0-2**（优先级最高）：
   - P0-1: 修改 `parseFitResponse()` 解耦 fit/focus + 回归测试
   - P0-2: 创建真实人脸 golden fixtures + 修正 `shanghai-skyline.jpg` 断言
   - 详见 `docs/specs/spec-visual-focus-detection-review.md`
2. **补齐 P1**：fixtures/benchmark 目录、并行测试隔离、patch 集成断言、CLI 重命名
3. **Push commit**: Resolve the git divergence (`git pull --rebase` then `git push`), or clean workspace first
4. **Archive spec**: After P0/P1 修复并验证通过后，move `docs/specs/spec-visual-focus-detection*.md` to `docs/archive/` and update `docs/archive/README.md`
5. **Start new session**: For VLM optimization planning (P3-P8), reference this handoff doc



