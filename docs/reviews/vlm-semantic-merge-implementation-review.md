# VLM Semantic Merge 与 Visual Focus Detection 当前实现复审

**复审基线：** `main` 的当前 HEAD `9432e73`，以及未提交工作区中可见的无关改动。  
**复审范围：** Visual Focus Detection Phase 1a、VLM Semantic Merge、`media-patch.json` 人工审阅与应用路径。  
**结论：** **Changes requested。** 上一轮的测试 P0 已关闭，当前相关自动化测试全部通过；但“分析后生成 patch，再由应用器安全写入 scene-data”的主路径仍有一个可复现的 P0 路径契约冲突。

> **本轮判断依据：** 测试全绿证明单元与模拟集成契约正常；对于跨 CLI 路径，额外以当前编排器和当前应用器执行同一条构造数据验证。两者冲突时，以实际边界验证为准。

## 当前状态

| 项目 | 结论 | 本轮证据 |
|---|---|---|
| Focus IPC、超时与降级 | **通过** | 相关 Vitest 范围在默认 worker 配置下通过；真实 smoke 显示当前 Skyline 样本响应约 154 ms。 |
| `fit` 迁移 | **通过** | 旧 hook 测试已从 `aiFit` 更新为 `fit`，相关 suite 全绿。 |
| Markdown 解析 | **通过** | `test_parse_markdown.py` 的 10 个边界用例全部通过。 |
| artifact 写入测试 | **通过** | 先前缺少 `join` 导入的测试已修复，相关集成 suite 已通过。 |
| 默认相关测试基线 | **通过，需持续观察** | `vitest run` 的 6 个相关文件：**216 / 216** 测试通过。运行仍出现一次 `MaxListenersExceededWarning`，不影响此次结果但应清理。 |
| patch 生成 → 应用 | **P0 未通过** | 当前编排器生成绝对媒体路径，应用器仍拒绝绝对路径；构造端到端检查返回 `valid: false`。 |
| subjects / contentKind 消费 | **P1 未通过** | 两个字段已持久化并显示给人工，但评分和场景推荐尚未按 Spec 使用它们。 |
| pre-filter 行为 | **P1 待决** | Spec 的软门描述与当前硬跳过实现不一致，需要产品决策后统一。 |
| artifact run 隔离 | **P1 未通过** | 分析与 patch 仍写入共享 `scripts/short-video/output/` 默认路径。 |

## 已关闭事项

以下是本轮验证已关闭的旧问题，不应再作为 blocker 重复提出。

| 原问题 | 当前结论 | 证据 |
|---|---|---|
| `fit` 与废弃 `focus` 耦合 | **已关闭** | 语义合并接口取代 `analyzeFit`；hook 测试使用 `asset.fit = "cover"` 并通过。 |
| artifact 集成测试的 `join` 未导入 | **已关闭** | 当前相关 Vitest 范围全绿。 |
| 真实 Focus 测试本轮发生 timeout | **本轮未复现** | 默认 4 worker 的相关范围全部通过。测试仍仅以注释建议 `--maxWorkers=1`，因此保留为低优先级运行稳定性风险。 |
| 天际线被视为人脸 golden | **已关闭为已知精度边界** | Smoke 只断言 saliency、frame 与 schema；不会把 Haar false positive 作为真实人脸能力证明。 |

## 必须修复（P0）

### Comment P0-1 — 生成的 `media-patch.json` 不能被当前应用器接受

**当前行为。** `asset-sourcer.mjs` 在 VLM/Focus 调用前把每个相对 `asset.path` 原地替换为 `join(contentDir, asset.path)` 的绝对路径；之后它用同一对象调用 `assignAssetsToScenes()` 并写入 `scripts/short-video/output/media-patch.json`。`apply-media-patch.mjs` 则把 `/` 或 `~` 开头的路径明确判为不安全并拒绝。

**可复现验证。** 使用当前 `assignAssetsToScenes()` 以 `/tmp/inside-china-ai-review-content/assets/example.jpg` 构造 assigned patch，并传入当前 `validatePatchEntry()`，结果为：

```json
{
  "mediaPath": "/tmp/inside-china-ai-review-content/assets/example.jpg",
  "valid": false,
  "errors": [
    "Media path \"/tmp/inside-china-ai-review-content/assets/example.jpg\" is not contained within content directory."
  ]
}
```

这意味着真正的“素材搜集 → VLM/Focus 分析 → patch → apply”路径无法完成；此前的 formatter 测试不覆盖该跨模块契约。

**[建议修改]** 让分析调用使用局部 `absolutePath`，保持 `asset.path` 始终是相对于 `contentDir` 的 `assets/...` 路径。若需要 artifact 可追溯性，可新增仅用于调试的 `absolutePath`，但 `media.path` 和可复制 scene-data 必须始终保存相对路径。也可在写 patch 前通过 `relative(contentDir, asset.path)` 归一化，并在结果以 `..` 开头时抛出错误。

**完成条件。** 新增端到端测试：相对素材路径 → `analyzeAssets` → `assignAssetsToScenes` → `validatePatchEntry`。它必须断言 assigned patch 合法，且 `apply-media-patch.mjs --dry-run` 能接受其路径。

## 合并前应明确的事项（P1）

### Comment P1-1 — `subjects` 与 `contentKind` 尚未驱动选择逻辑

Semantic Merge Spec 明确把 `subjects` 作为 0–20 分精确匹配信号，并把 `contentKind` 定义为场景推荐的输入。当前 `scoreCandidate(candidate, keyword, aiDescription)` 仅从 description 字符串计算全部 30 分；`recommendScene()` 只根据 `asset.type` 和 `scene.visualType` 选择，并未读取 `asset.contentKind`。

**[建议修改]** 将评分输入改为语义对象，例如 `scoreCandidate(candidate, keyword, { description, subjects })`；subjects 的精确匹配给 0–20 分，description 的 boundary match 给 0–10 分。为场景推荐增加一个窄且可测试的 `contentKind → preferred visualType` 映射，并对未知类型保留现有回退。

**完成条件。** 添加两类测试：description 不含关键字但 subjects 命中的评分案例；以及 `product_demo` / `talking_head` 的场景偏好和未知类型回退案例。

### Comment P1-2 — pre-filter 的“软门”说明与硬跳过实现不一致

归档 Spec 写明技术分低于 30 的素材标为 `lowConfidence`，但在 VLM 可用时仍可分析以挽回错误拒绝。当前 `analyzeAssets()` 对 `lowConfidence` 直接不加入 `analyzableAssets`，日志也明确为 “Skipping VLM”。

**[建议修改]** 先作一个产品决策，再把代码、测试和归档说明对齐：

| 选项 | 正向契约 |
|---|---|
| 保持成本优先 | 把 Spec 改为硬门；记录其可能漏掉元数据差但视觉相关的素材。 |
| 保持召回优先 | 让 low-confidence 素材继续 VLM 分析，但设置独立预算/并发上限或只分析候选 top-N。 |

当前不应同时保留“soft gate”文案和“hard skip”行为。

### Comment P1-3 — artifact 仍未按 content/run 隔离

主编排将 `asset-analysis.json` 与 `media-patch.json` 固定写入共享 `scripts/short-video/output/`，而 Spec 示例为 `output/{pipelineId}/asset-analysis.json`。连续运行不同内容时，后一个运行会覆盖前一个 artifact；审阅 CLI 的默认输入同样是共享路径。

**[建议修改]** 使用 content slug 或 pipeline run ID 作为输出目录，并让 review CLI 从同一 run 目录读取 patch 与分析 artifact。至少在两个 JSON 中写入同一 `contentSlug` 与 `runId`，并在 CLI 发现不匹配时拒绝格式化。

### Comment P1-4 — 真实 VLM 验证证据仍是旧接口格式

`experiments/vlm-focus-test-results.json` 仍记录 `focusRegion`、`focusType` 与 `recommendedOverlay` 的旧 JSON 输出，不是当前 `analyze_semantics` 的 Markdown 六字段协议。因此它不能作为当前 Semantic Merge 的格式稳定、延迟或语义评分验收证据。

**[建议修改]** 保留该文件但标记为 legacy，或把它移到相应归档目录。为当前接口新增可重跑、gitignored 的实验结果，至少记录：Markdown section 合规率、parser 成功率、三张图片的一次调用延迟，以及一组 subjects/description 评分比较。

## 运行稳定性观察（P2）

本轮默认并发测试全绿，因此不把 Focus isolation 作为 blocker。不过两个真实 Python subprocess test 文件依然只通过注释要求调用者传 `--maxWorkers=1`，Vitest 配置仍允许 4 worker。另一次当前绿色运行中出现了 `MaxListenersExceededWarning`。

**[建议修改]** 把真实 subprocess runtime suite 变成明确脚本或配置，而不是调用约定；同时审查测试中模块重载或全局 process 监听器的清理。完成条件是连续多次默认运行无 timeout、无 listener warning。

## 最终判定与修复顺序

当前实现已经满足观察与人工审阅用途，且相关单元与集成测试本轮全绿。它尚不满足把生成 patch 安全应用到 scene-data 的完成标准。

| 顺序 | 工作项 | 通过门槛 |
|---:|---|---|
| 1 | 修复相对路径契约 | 端到端 dry-run 接受生成 patch。 |
| 2 | 决定并实现 `subjects`/`contentKind` 消费 | 评分与推荐测试证明字段影响结果。 |
| 3 | 统一 pre-filter 语义 | Spec、代码、日志和测试完全一致。 |
| 4 | 隔离 per-run artifact 并刷新实验验证 | Review 不会读取其他 content 的旧分析；当前协议有可重跑实测证据。 |
| 5 | 加固 runtime test harness | 连续默认测试稳定且无 listener warning。 |

## References

[1]: ../archive/spec-vlm-semantic-merge.md "VLM Semantic Merge Spec"
[2]: ../archive/spec-visual-focus-detection.md "Visual Focus Detection Spec"
[3]: ../../scripts/short-video/lib/asset-sourcer.mjs "Asset Sourcer"
[4]: ../../scripts/short-video/apply-media-patch.mjs "Apply Media Patch"
[5]: ../../scripts/short-video/__tests__/focus-smoke.test.mjs "Focus Smoke Test"
[6]: ../../scripts/short-video/experiments/vlm-focus-test-results.json "Legacy VLM Focus Experiment Result"
