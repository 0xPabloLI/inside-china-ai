# AI 视觉分析层代码审查报告

**审查日期：**2026-08-19  
**范围：**本地工作区中最新的 Qwen3-VL 语义合并、OpenCV Focus worker、资产接入与相关测试。  
**审查方式：**只读代码审查与本地测试；未修改实现代码或运行模型推理。

## 总结

本次实现已经正确完成了 **P3 的核心目标**：以 `analyzeAssetSemantics()` 将资产描述与旧 `analyzeFit()` 合并为一次 Qwen3-VL 调用，并且结构化 `description`、`subjects`、`contentKind`、`fit`、`criticalEdgeText` 与 `reason` 已沿着资产接入、重评分和 `asset-analysis.json` artifact 流动。

OpenCV Focus worker 的独立进程、requestId 路由、generation 概念与失败安全结果也仍然存在。与旧架构相比，语义和空间职责的分离方向正确。

但目前**不能将视觉分析层视为生产就绪**。VLM worker 的超时路径会导致后续请求拿到前一个请求的迟到响应，造成资产语义错配；这会直接影响评分、场景分配和输出 artifact。应在合并更多 P4–P8 能力或用于批处理前修复。

| 结论              |                                            数量 |
| ----------------- | ----------------------------------------------: |
| 阻断/高优先级问题 |                                               1 |
| 中优先级问题      |                                               3 |
| 低优先级问题      |                                               1 |
| 已通过的目标测试  |                                              67 |
| 完整测试套件失败  | 27 个断言，集中在 1 个 source-registry 测试文件 |

---

## 审查发现

### R1 — 高优先级：VLM 超时后会将迟到响应错配给下一项资产 ✅ 已修复

**位置：**`scripts/short-video/lib/visual-analyzer.mjs`，`processQueue()` 第 250–258 行与 `handleResponse()` 第 187–215 行。

VLM 通信协议没有 requestId，Node 端依赖严格 FIFO：`handleResponse()` 总是从 `requestQueue.shift()` 取当前队首。可是超时回调会先将当前请求从队列移除并把它降级，然后立即调用 `processQueue()` 向**同一个仍在运行的 Python VLM 进程**写入下一请求。

若请求 A 已经开始生成但超过 180 秒，A 会被降级；请求 B 随后排入 Python stdin。Python 最终先输出 A 的迟到结果，Node 却已经将 B 置于队首，于是把 A 的语义结果解析并返回给 B。接下来 B 的真正结果会继续错配给 C，或在没有下一个请求时被丢弃。

这不是只影响超时的单个 asset，而是会产生“机器人视频的描述被写到金融图表 asset 上”这类数据污染，后续重评分和自动分配都会错误。

**建议修复：**二选一，但不可仅保留 FIFO 超时逻辑。

1. **推荐：**像 Focus worker 一样将 `requestId` 加入 VLM Python 协议。Python 回应同一 `requestId`，Node 用 `Map` 路由结果，超时仅影响对应请求。
2. **较小改动：**VLM 请求超时后立刻终止该 Python worker、将当前 generation 中尚未完成的请求全部降级、丢弃旧 worker 的所有输出，并按需启动新 worker。不可继续向旧 worker 投递 B。

必须增加回归测试：A 超时 → A 在超时后输出迟到响应 → B 正常输出；断言 A、B 的 Promise 均不能拿到对方结果。

### R2 — 中优先级：FFmpeg 回退在 VLM 生成抛错时泄漏临时帧目录 ✅ 已修复

**位置：**`scripts/short-video/lib/vlm_analyzer.py`，`handle_analyze_semantics()` 第 436–443 行。

回退路径先调用 `extract_frames()`，随后调用 `generate_response(..., image_paths=frames)`，再调用 `_cleanup_frames(frames)`。但如果 multi-image VLM 推理抛出异常，控制流会进入外层 `except` 并直接返回，清理函数不会执行。因此每次失败都可能留下 `vlm_analyzer_frames_*` 临时目录和 JPEG 帧。

**建议修复：**将 frames 变量置于 `try/finally`：无论 `generate_response()` 成功、失败、解析失败或被中断，均执行 `_cleanup_frames(frames)`。添加一个 mock `generate_response` 抛错的测试，断言临时目录被删除。

### R3 — 中优先级：Focus worker 的 timeout 只结算请求，没有按 ADR 预期重置卡死 worker ✅ 已修复

**位置：**`scripts/short-video/lib/visual-analyzer.mjs`，`detectFocus()` 第 557–562 行。

Focus timeout 当前只从 `focusPending` 删除该请求并返回 `focus_timeout`。它不会 kill worker、增加 generation、结算同 generation 中其他请求或标记 worker 为不可用。若 Python Focus worker 真正卡死，后续请求仍会写入同一个卡死的 stdin，每个请求都会等待 10 秒后超时，直到外部显式关闭进程。

这与 handoff/ADR 中“timeout、crash 或协议错误后 generation isolation 和 worker reset”的描述不一致。

**建议修复：**新增 `resetFocusWorker(generation, errorCode)`。发生 timeout 时：终止当前 worker、递增 generation、将同 generation 的 pending 请求全部以 `focus_worker_reset`（或首次请求保留 `focus_timeout`）结算；下一请求惰性 spawn 新 worker。对应测试应覆盖“timeout 后第二个请求使用新 process”。

### R4 — 中优先级：P4–P8 仍未落地，当前实现只完成 P3 语义合并 ✅ 已修复（标注）

代码库中未发现以下实现符号：`analyzeVideoWindow`、`transcribeAudioWindow`、`fuseMediaTimeline`、`probeMedia`、`analyzePosterFocus`、`transformFocus`、`analyzeTemporalFocus`。

这不是 P3 代码的回归，但意味着 handoff 中关于视频窗口、FFmpeg/ffprobe 媒体探测、本地 ASR、时间融合、跨场景 Focus 分层的内容仍是**后续计划**，尚不可被调用。当前视频语义仍是：原生路径尝试整条视频，而 FFmpeg 回退只抽开头 `MAX_VIDEO_SECONDS = 8` 秒，语义覆盖范围不同。

**建议：**在 handoff/status 中明确标示"P3 implemented；P4–P8 planned"，避免调用方误以为已具备长视频可追溯时间线或 ASR 融合。下一步优先 P4，先把视频输入改成显式窗口而不是直接进入 ASR。

**修复详情 (R1-R4, 2026-08-19)：**

- **R1 已修复**：VLM worker 加入 `requestId` + `vlmWorkerGeneration` 路由。超时后 kill worker、递增 generation、settle 同 generation 的 pending。Python `vlm_analyzer.py` echo `requestId`。FIFO fallback 保留向后兼容。回归测试：A 超时 → A 迟到响应 → B 正常 → 断言 B 不拿到 A 的结果。
- **R2 已修复**：`vlm_analyzer.py` 中 `extract_frames` → `generate_response` 包裹在 `try/finally` 中，确保 `_cleanup_frames(frames)` 在异常时也执行。
- **R3 已修复**：Focus timeout handler 现在 kill worker、递增 `focusWorkerGeneration`、`settlePendingFocus(myGen, "focus_worker_reset")`。第二个请求惰性 spawn 新 worker。回归测试：timeout → kill → 新 process → 正常响应。
- **R4 已修复**：`docs/handoffs/handoff-visual-focus-detection.md` 顶部已加 implementation status 标注："P3 implemented; P4-P8 planned"，明确列出不存在的符号。

### R5 — 低优先级：模块重复加载会累计 `process.on("exit")` 监听器，测试已出现警告 ✅ 已修复

**位置：**`scripts/short-video/lib/visual-analyzer.mjs` 第 625 行。

目标测试通过，但出现 `MaxListenersExceededWarning`：每次 `vi.resetModules()` 后，模块都会再注册一次全局 `process.on("exit")`。生产单次 Node 进程通常只加载一次，风险较低；但测试、热重载或嵌入式调用会持续增加监听器。

**建议：**将退出清理注册为模块级单例，例如通过 `globalThis[Symbol.for(...)]` 防止重复注册；或让顶层 CLI 统一注册资源清理，并保持库模块无全局副作用。添加测试以确保重复 import 后 `process.listenerCount("exit")` 不增长。

---

## 验证结果

| 检查                                        |          结果 | 备注                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual-analyzer.test.mjs`                  |          通过 | 28 个测试；但有 MaxListeners warning。                                                                                                                                                                                                        |
| `asset-sourcer-visual-integration.test.mjs` |          通过 | 32 个测试。                                                                                                                                                                                                                                   |
| `focus_detector.test.mjs`                   |          通过 | 7 个测试。                                                                                                                                                                                                                                    |
| 三个目标测试合计                            | **67 passed** | 覆盖当前语义合并和 Focus 基础路径。                                                                                                                                                                                                           |
| `npm test` 完整套件                         |      **失败** | 88 个文件通过、1 个失败；1830 tests passed、27 tests failed。失败集中在 `source-registry-capabilities.test.mjs`，缺少 `ALL_SOURCES`、`STOCK_API_SOURCES`、`SOURCE_ATTRIBUTIONS` 等导出/数据。该失败看起来不属于视觉分析提交，但 CI 当前不绿。 |
| `npm run lint`                              |        未完成 | 运行 180 秒无输出后被终止；需单独排查 lint 卡住原因或限制检查范围。                                                                                                                                                                           |
| `git diff --check`                          |        有问题 | 两个不相关 research 文档存在 EOF 空白行；视觉分析变更未发现空白错误。                                                                                                                                                                         |

---

## 建议合并顺序

1. **先修 R1。**这是数据错配风险，修复后再运行完整视觉资产批处理。
2. **同时修 R2、R3。**二者都是故障路径稳定性问题，改动范围局限于 worker 生命周期。
3. **为 R1–R3 增加失败路径测试。**现有测试主要覆盖成功、模型错误、Focus timeout 的单请求情况，未覆盖迟到响应、VLM timeout rollover、临时帧生成失败和 Focus timeout 后恢复。
4. **修复/隔离完整测试套件的 source registry 失败。**至少在变更说明中明确其与当前提交的关系。
5. **开始 P4：`analyzeVideoWindow` + ffprobe/FFmpeg 同窗口回退。**完成后再接 P5 ASR 和 P6 时间融合。不要跳过 P4。

## 修复与跟踪更新（2026-08-21）

原始审查发现保留为历史证据；以下记录后续代码、测试和任务跟踪状态。

| 项目                                | 当前状态 | 处理结果                                                                                                                                       |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R1：VLM timeout 后迟到响应错配      | 已修复   | VLM IPC 使用 `requestId` 与 `vlmWorkerGeneration`；timeout 后终止旧 worker 并结算旧 generation。回归测试覆盖 A 超时、A 迟到、B 正确响应。      |
| R2：frames fallback 临时文件泄漏    | 已修复   | `vlm_analyzer.py` 通过 `try/finally` 清理临时帧。                                                                                              |
| R3：Focus timeout 后复用卡死 worker | 已修复   | timeout 后终止 Focus worker、递增 generation，并由后续请求惰性启动新 worker。                                                                  |
| R4：P4 仅为计划                     | 已修复   | [Issue #69](https://github.com/0xPabloLI/inside-china-ai/issues/69) 已完成 P4：`probeMedia()`、窗口元数据和 native/frames 同窗口回退已经实现。 |
| R5：重复模块加载累计 exit listener  | 已修复   | `Symbol.for("visualAnalyzerExitHandler")` 防止重复注册；新增 reload 后 `process.listenerCount("exit")` 不增长的回归测试。                      |
| Focus IPC 测试超时                  | 已修复   | 测试 stdout 处理保留未闭合的 NDJSON chunk，避免子进程响应跨 chunk 时被静默丢弃。                                                               |

### 本次验证

- `visual-analyzer.test.mjs`：36 个测试通过，包含 R1、R3 与 R5 回归覆盖。
- `focus_detector.test.mjs`：7 个测试通过；此前两项 IPC 超时已消除。
- 后续能力已按原子 Issue 正式跟踪：P5 [#98](https://github.com/0xPabloLI/inside-china-ai/issues/98)、P6 [#99](https://github.com/0xPabloLI/inside-china-ai/issues/99)、P7 [#100](https://github.com/0xPabloLI/inside-china-ai/issues/100)、P8b [#101](https://github.com/0xPabloLI/inside-china-ai/issues/101)。

P5–P8b 仍未实现；当前调用方不得将其视为已有接口。

## 参考

[1] `scripts/short-video/lib/visual-analyzer.mjs` — VLM/Foucs worker 生命周期与 IPC。  
[2] `scripts/short-video/lib/vlm_analyzer.py` — Qwen3-VL 语义合并与 FFmpeg 回退。  
[3] `scripts/short-video/lib/asset-sourcer.mjs` — 资产分析、重评分与 artifact 写入。  
[4] `scripts/short-video/__tests__/visual-analyzer.test.mjs` — 已有 VLM/Foucs 测试覆盖。  
[5] `docs/handoffs/handoff-visual-focus-detection.md` — P3–P8 计划与 Focus 分层约定。
