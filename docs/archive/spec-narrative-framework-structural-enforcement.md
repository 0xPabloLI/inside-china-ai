# Spec: 叙事框架结构化落实 — S.T.A.R.T. 主框架 + AI Outline 动态嵌入

> **创建于**: 2026-08-27
> **来源**: Grill with Docs session（Round 1 全部确认）
> **状态**: ready-for-agent

## Problem Statement

项目已有的 S.T.A.R.T. 叙事框架（15 源验证）和留存引擎（open loop / pattern interrupt / loop closure）在 `video-script-writing-guide.md` 中作为方法论写得很详细，但在管线中只是"参考"——`scene-data.mjs` 没有结构化字段声明每个 scene 的叙事角色和留存机制，`verify-video.mjs` preflight 也不检查这些叙事要素是否存在。结果是 Agent 可以写出自称遵循 S.T.A.R.T. 但实际缺少 open loop 或 pattern interrupt 的 scene-data。

同时，TikTok 官方 AI Outline 工具（5 段式结构输出）在管线中只是"参考"而非"动态输入"——Agent 拿到 AI Outline 输出后不知道每段内容怎么消费，导致 AI Outline 的平台数据价值未被利用。

## Solution

1. **scene-data 新增 `narrativeRole` 和 `retentionMechanism` 可选字段**，让每个 scene 显式声明其在 S.T.A.R.T. 框架中的叙事角色和留存机制。
2. **`scene-rules.mjs` 新增 3 个检查函数**（`checkOpenLoop` / `checkPatternInterrupt` / `checkLoopClosureNarrative`），在 preflight 中作为 Warning W7/W8/W9 验证留存机制是否存在。
3. **`video-script-writing-guide.md` 改回 S.T.A.R.T. 主框架**（从当前的"AI Outline 主框架"改回），AI Outline 降级为 HITL 工具输入，并新增 AI Outline 5 段消费映射表。
4. **`content-pipeline.md` Stage 3 调整描述**，AI Outline 定位从"主框架"改为"HITL 工具输入"。

## User Stories

1. As an Agent, I want each scene in scene-data to have a `narrativeRole` field, so that I can explicitly declare which S.T.A.R.T. stage (S/T/A/R/T-Tell) it belongs to.
2. As an Agent, I want each scene to have a `retentionMechanism` field, so that I can declare which retention technique (open-loop / pattern-interrupt / loop-closure / curiosity-gap / approaching-closure) is active in that scene.
3. As an Agent, I want `verify-video.mjs --pre` to warn me when a scene-data is missing open loop (W7), pattern interrupt (W8), or loop closure (W9), so that I don't accidentally publish a video without these retention elements.
4. As an Agent, I want the `video-script-writing-guide.md` to use S.T.A.R.T. as the primary framework with AI Outline as a HITL tool input, so that I have a single clear structure to follow instead of three competing frameworks.
5. As an Agent, I want an AI Outline consumption mapping table, so that when the user brings back AI Outline output from their phone, I know exactly which S.T.A.R.T. stage each AI Outline section maps to and how to consume it.
6. As a user, I want existing scene-data files to continue working without modification, so that the new fields are opt-in and don't break already-rendered videos.
7. As an Agent, I want `narrativeRole` and `retentionMechanism` to be optional fields with Warning-level enforcement, so that missing them doesn't block rendering but does prompt me to add them for new videos.

## Implementation Decisions

### 1. scene-data 字段新增

在 scene-data 的每个 scene 对象中新增两个可选字段：

- `narrativeRole`: 枚举值 `"S"` | `"T"` | `"A"` | `"R"` | `"T-Tell"` | `null`（未指定）
  - `S` = Stop (hook, 0-3s)
  - `T` = Tease (3-8s, open loop)
  - `A` = Authority (8-20s, data/sources)
  - `R` = Relay (20-50s, reveal/payoff)
  - `T-Tell` = Tell (50-60s, CTA)
- `retentionMechanism`: 枚举值 `null` | `"open-loop"` | `"pattern-interrupt"` | `"loop-closure"` | `"curiosity-gap"` | `"approaching-closure"`

这两个字段是**可选的**——现有 scene-data 不需要回填，新写的 scene-data 应该有。下游消费者（`scenes.mjs` dispatcher）不读取这两个字段，只读 `visualType`，因此不会 break。

### 2. scene-rules.mjs 新增 3 个检查函数

新增以下函数，在 `runAllSceneDataChecks` 中调用：

- `checkOpenLoop(scenes)`: Warning W7 — 检查是否存在至少一个 scene 的 `retentionMechanism` 是 `"open-loop"`。如果 S2（第二个 scene）有 `narrativeRole: "T"` 但 `retentionMechanism` 不是 `"open-loop"`，也 Warning。如果整个 scene-data 没有任何 scene 有 `retentionMechanism` 字段，跳过检查（兼容旧 scene-data）。
- `checkPatternInterrupt(scenes)`: Warning W8 — 检查是否存在至少一个 scene 的 `retentionMechanism` 是 `"pattern-interrupt"`。同样，如果无任何 scene 有 `retentionMechanism` 字段，跳过。
- `checkLoopClosureNarrative(scenes)`: Warning W9 — 检查倒数第二个内容 scene（CTA 前一个）的 `retentionMechanism` 是否是 `"loop-closure"`。如果无 `retentionMechanism` 字段，跳过。

**共存原则**：新的 W7/W8/W9 与现有的 `checkLoopClose`（基于文本内容的启发式检查）共存，不替代。有 `retentionMechanism` 字段时走结构化检查，没字段时走文本检查。

### 3. video-script-writing-guide.md 改回 S.T.A.R.T. 主框架

- Step 3 标题从"用融合公式搭建骨架"改为"用 S.T.A.R.T. 框架搭建骨架"
- 主框架从"AI Outline 6 段"改回"S.T.A.R.T. 5 段"
- AI Outline 的 5 段结构降级为"HITL 工具输入"，在 Step 4 中消费
- 新增"AI Outline 消费映射表"section，明确 5 段对应关系
- Scene 模板中每个 scene 增加 `narrativeRole` 和 `retentionMechanism` 字段说明

### 4. AI Outline 消费映射表

| AI Outline 段           | S.T.A.R.T. 对应  | 消费规则                                       |
| ----------------------- | ---------------- | ---------------------------------------------- |
| Intro suggestions       | S — Stop         | Hook 候选 → 对比 Agent 自己写的 hook，取更优者 |
| Core talking points     | A — Authority    | 筛选最相关 2-3 个点 → 指导 S3-S4 内容          |
| Highlight moment        | R — Relay (前半) | 确认 Peak scene 位置                           |
| Climatic build          | R — Relay (高潮) | 参考 S6-S7 情绪递进设计                        |
| Engagement-driven outro | T-Tell           | 参考其 CTA 角度 → 指导最终 scene voiceover     |

Title 和 Hashtags 直接取用（经过品牌一致性检查后）。

### 5. content-pipeline.md Stage 3 调整

- Step 4 描述保持不变（HITL 检查点，用户在手机端跑 AI Outline）
- Step 5 描述从"按融合公式设计 scene"改为"按 S.T.A.R.T. 映射表设计 scene"
- "脚本写作方法论"指针描述更新

### 6. DOCS-INDEX.md 描述更新

`video-script-writing-guide.md` 的描述从"AI Outline 骨架 + S.T.A.R.T. 补充 + 留存引擎"改为"S.T.A.R.T. 主框架 + AI Outline HITL 工具 + 留存引擎 + per-scene 素材要求"。

## Testing Decisions

- **测试 seam**: `scripts/short-video/__tests__/scene-rules.test.mjs`（现有测试文件，导入 `scene-rules.mjs` 的导出函数）
- **新增测试**:
  - `checkOpenLoop`: (1) 有 open-loop 的 scene → pass; (2) 有 T 角色但无 open-loop → warn; (3) 无 retentionMechanism 字段 → skip; (4) 有字段但无 open-loop → warn
  - `checkPatternInterrupt`: (1) 有 pattern-interrupt → pass; (2) 无字段 → skip; (3) 有字段但无 pattern-interrupt → warn
  - `checkLoopClosureNarrative`: (1) 倒数第二 scene 有 loop-closure → pass; (2) 无字段 → skip; (3) 有字段但倒数第二不是 loop-closure → warn
- **回归测试**: 现有 scene-data 文件（alibaba, doubao, deepseek, distillation 等）在新检查下应全部 skip（因为它们没有 `retentionMechanism` 字段），不产生新 Warning
- **Prior art**: `checkLoopClose` 已有测试模式，新测试跟随同样结构

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件                                       | 修改内容                                                                                                    | 风险等级 | 评估                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| `docs/video-script-writing-guide.md`       | S.T.A.R.T. 主框架改回；新增 AI Outline 消费映射表；Scene 模板增加 narrativeRole/retentionMechanism 字段说明 | Medium   | 改变规则和章节结构，但被 content-pipeline.md 引用方式不变 |
| `docs/content-pipeline.md`                 | Stage 3 Step 5 描述调整；脚本写作方法论指针描述更新                                                         | Medium   | 改变管线步骤描述但不改变执行流程                          |
| `scripts/short-video/lib/scene-rules.mjs`  | 新增 3 个检查函数 + 在 runAllSceneDataChecks 中调用                                                         | Low      | 纯追加，不修改现有检查函数                                |
| `docs/DOCS-INDEX.md`                       | 更新描述文字                                                                                                | Low      | 纯文字更新                                                |
| `docs/adr/0018-start-primary-framework.md` | 新建 ADR                                                                                                    | Low      | 新建文件                                                  |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                            | Expected Behavior                                        | Risk   | Mitigation                    |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------- | ------ | ----------------------------- |
| 1   | 新 scene-data 有 narrativeRole 和 retentionMechanism 字段           | preflight 正确识别 W7/W8/W9 状态                         | Low    | 结构化字段检查                |
| 2   | 旧 scene-data 无这两个字段                                          | preflight 跳过 W7/W8/W9（不产生新 Warning）              | Medium | 检查函数先判断字段是否存在    |
| 3   | scene-data 有 retentionMechanism 但缺少 open-loop                   | W7 Warning                                               | Low    | Warning 不 Blocker            |
| 4   | scene-data 有 retentionMechanism 但缺少 pattern-interrupt           | W8 Warning                                               | Low    | Warning 不 Blocker            |
| 5   | scene-data 有 retentionMechanism 但倒数第二 scene 不是 loop-closure | W9 Warning                                               | Low    | Warning 不 Blocker            |
| 6   | narrativeRole 值不在枚举中                                          | 忽略无效值，等同于 null                                  | Low    | 值校验                        |
| 7   | 多集系列每集独立检查 narrativeRole                                  | 每集独立 W7/W8/W9                                        | Low    | scene-rules 按 scene 数组检查 |
| 8   | AI Outline HITL 用户跳过                                            | Agent 自行按 S.T.A.R.T. 设计（降级逻辑不变）             | Low    | 现有降级逻辑保持              |
| 9   | scenes.mjs dispatcher 读取 scene-data                               | 不读取 narrativeRole/retentionMechanism，只读 visualType | Low    | 新字段对 dispatcher 透明      |
| 10  | runAllSceneDataChecks 调用新函数                                    | 新函数返回 result 数组，与现有函数格式一致               | Low    | 遵循现有返回格式              |

## Out of Scope

- 旧 scene-data 回填 narrativeRole/retentionMechanism 字段
- AI Outline 的 CDP 自动化抓取脚本
- `mrl2-check.mjs` 更新（它是旧的硬编码脚本，不影响管线）
- AI Outline 输出的结构化解析器（AI Outline 输出格式不稳定，用文档指引而非代码解析）
- scene-rules.mjs 中 `checkLoopClose` 的替换（共存不替代）
- TikTok-best-practices.md 的修改（不变）

## Further Notes

- S.T.A.R.T. 有 15 个独立来源验证（`docs/research/short-video-script-writing-best-practices.md`），是创作者社区共识最高的框架
- AI Outline 是 TikTok 官方工具输出（`tiktok.com/creator-academy/article/ai-outline`），5 段式结构，无 API，仅移动端可用
- 本 spec 遵循 `writing-for-agents` skill 原则：单一权威来源（S.T.A.R.T. 主框架）、不重复（AI Outline 消费规则只在 video-script-writing-guide.md 中定义一次）
