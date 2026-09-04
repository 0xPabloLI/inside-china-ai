# Spec: AudioSync 文件名探测修复 + RMB→USD 双标注约定

> Status: ready-for-agent
> Created: 2026-08-16

## Problem Statement

两个独立问题：

1. **AudioSync 验证静默失效**：`lib/audio/sync.mjs` 第 138 行硬编码 `scene-{id}.mp3`，但 F5-TTS-MLX 和 Qwen3-TTS 输出 `.wav`。导致终片音频同步验证全部 skip（7/7 scenes skipped），失去了跨 scene 漂移检测能力——正是这个检测在上一轮修复中专门设计来防止"字幕到片尾漂移"问题复发。

2. **人民币金额缺少 USD 标注**：面向英文观众的短视频中，所有金额用 RMB 表示（"5 billion RMB"），英文观众对人民币数字缺乏直觉感受。

## Solution

### Part A: AudioSync 文件名探测修复

**Root Cause**：`lib/audio/sync.mjs` 硬编码 `.mp3` 扩展名，源于最初只有 edge-tts/say 引擎（输出 `.mp3`）。F5-TTS-MLX 和 Qwen3-TTS 后续加入时输出 `.wav`（避免双重有损编码），但 `sync.mjs` 从未更新。

**测试盲区**：`__tests__/audio-sync.test.mjs` 的 fixture 也硬编码 `.mp3`，测试验证了一个与实际 TTS 引擎输出脱节的路径。

**修复**：

- `sync.mjs` 改为 fallback 探测：先试 `.wav`，再试 `.mp3`，两种都不存在才 skip
- 测试 fixture 增加 `.wav` 场景，确保两种格式都能被 sync 验证

**防再犯机制**：

- 在 `sync.mjs` 顶部写注释，列出所有 TTS 引擎的输出格式清单
- 提取 `resolveSceneAudio(audioDir, sceneId)` helper 函数，统一路径解析逻辑，禁止再硬编码扩展名
- 测试覆盖两种格式 + 两种都不存在的场景

### Part B: RMB→USD 双标注约定

**约定**：所有面向观众的视频文本字段（`voiceover`、`texts` 下的所有子字段、`hookText`、`result`、`context` 等）中涉及人民币金额的，统一使用双标注格式 `"$X (¥Y)"` 或 `"$X (¥Y B)"`，USD 做主数字，RMB 做括号备注。

- 汇率：固定近似 ¥1 ≈ $0.14（7.15 的倒数），在 scene-data 写作约定中写明
- 半年 review 一次汇率
- `meta.mjs` 的 title/description 可保留原始 RMB（SEO/元数据不面向视频观众）
- 以 `sensetime-latest` 内容作为示范改造

## User Stories

1. As a viewer, I want the audio sync verification to actually run against my video's audio, so that inter-scene drift is caught before publishing.
2. As a pipeline maintainer, I want sync.mjs to automatically detect the audio file format, so that adding a new TTS engine with a different output format doesn't silently disable verification.
3. As a pipeline maintainer, I want a test that covers both `.wav` and `.mp3` scene audio, so that a format mismatch is caught in CI, not in production.
4. As an English-speaking viewer, I want monetary values shown in USD, so that I can intuitively grasp the scale of financial figures.
5. As a content creator, I want a clear convention for dual-currency annotation, so that I don't have to decide the format each time.
6. As a content creator, I want the sensetime-latest content to serve as a reference example, so that future scene-data follows the same pattern.

## Implementation Decisions

### Part A: AudioSync

- **模块**：`scripts/short-video/lib/audio/sync.mjs`
- **新增 helper**：`resolveSceneAudio(audioDir, sceneId)` — 按优先级探测 `.wav` → `.mp3`，返回第一个存在的路径或 `null`
- **修改**：第 138 行从硬编码 `scene-{id}.mp3` 改为调用 `resolveSceneAudio()`
- **注释**：顶部添加 TTS 引擎输出格式清单（F5-MLX/Qwen3 → `.wav`，edge-tts/say → `.mp3`）

### Part B: RMB→USD

- **文档**：在 `docs/video-workflow.md` 的 "Agent-assisted at scene-data creation time" 表中新增一条货币标注规则
- **内容改造**：修改 `scripts/short-video/content/sensetime-latest/scene-data.mjs` 中所有面向观众的文本字段
- **汇率常量**：在 `docs/video-workflow.md` 中写明 ¥1 ≈ $0.14

## Testing Decisions

### Part A

- 测试 seam：`__tests__/audio-sync.test.mjs`（已有文件，增加测试用例）
- 现有 fixture 只生成 `.mp3`；新增一个 fixture 变体生成 `.wav`
- 新增测试：
  - `.wav` 文件存在时 sync 不 skip
  - `.mp3` 文件存在时 sync 不 skip（回归保护）
  - 两种格式都存在时优先 `.wav`
  - 两种都不存在时 skip + 报告 skippedScenes
- Prior art：`audio-sync.test.mjs` 已有 `makeFixture()` + `buildFinal()` + `verifyAudioSync()` 集成模式

### Part B

- 纯内容修改 + 文档更新，无代码逻辑测试
- 验证方式：人工检查 scene-data.mjs 中所有金额字段已改为双标注格式

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件                                      | 修改内容                                                                 | 风险等级 | 评估                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `lib/audio/sync.mjs`                      | 新增 `resolveSceneAudio()` helper，修改 `verifyAudioSync()` 内的路径解析 | Medium   | 修改核心验证路径。但改动是纯路径解析（探测文件存在性），不改变验证逻辑。现有测试覆盖回归。 |
| `__tests__/audio-sync.test.mjs`           | 新增 `.wav` fixture 和测试用例                                           | Low      | 纯追加，不修改现有测试                                                                     |
| `content/sensetime-latest/scene-data.mjs` | 修改所有金额文本为双标注                                                 | Low      | 纯文本内容修改，不涉及代码逻辑                                                             |
| `docs/video-workflow.md`                  | 新增货币标注规则                                                         | Low      | 纯文档追加                                                                                 |

### Section 2: Behavioral Scenarios

| #   | Scenario                                         | Expected Behavior                              | Risk           | Mitigation             |
| --- | ------------------------------------------------ | ---------------------------------------------- | -------------- | ---------------------- |
| 1   | TTS 输出 `.wav`，sync 验证运行                   | `resolveSceneAudio` 找到 `.wav`，sync 正常执行 | —              | 测试覆盖               |
| 2   | TTS 输出 `.mp3`，sync 验证运行                   | `resolveSceneAudio` 找到 `.mp3`，sync 正常执行 | 回归           | 现有测试覆盖           |
| 3   | `.wav` 和 `.mp3` 都存在                          | 优先 `.wav`                                    | 选择错误文件   | 测试断言 `.wav` 被使用 |
| 4   | 两种格式都不存在                                 | skip + 报告 `skippedScenes`                    | 静默失效       | 测试断言 skip 计数     |
| 5   | `resolveSceneAudio` 传入 null/undefined sceneId  | 不 crash，返回 null                            | 边界           | 测试覆盖               |
| 6   | `resolveSceneAudio` 传入不存在的 sceneId         | 返回 null，sync skip                           | 与现有行为一致 | 测试覆盖               |
| 7   | scene-data 中 `voiceover` 含 "5 billion RMB"     | 改为 "$700M (¥5B)"                             | —              | 人工验证               |
| 8   | scene-data 中 `hookText` 含 "5 BILLION RMB"      | 改为 "$700M (¥5B)"                             | —              | 人工验证               |
| 9   | scene-data 中 `result` 含 "3.6B RMB"             | 改为 "$500M (¥3.6B)"                           | —              | 人工验证               |
| 10  | scene-data 中 `context` 含 "380M RMB"            | 改为 "$53M (¥380M)"                            | —              | 人工验证               |
| 11  | scene-data 中 `context` 含 "10.9B CASH RESERVES" | 改为 "$1.5B (¥10.9B) CASH RESERVES"            | —              | 人工验证               |
| 12  | scene-data 中不含金额的文本                      | 不变                                           | —              | 人工验证               |
| 13  | `meta.mjs` title 含 RMB                          | 保留原样（不面向视频观众）                     | —              | 人工验证               |

## Out of Scope

- 更换 wav2vec2 对齐模型（已在用 large 模型，无需更换）
- 修改 `text-align.py` 的 chunk 保底时长（tooShort cue 是场景文本密度问题，非代码 bug）
- 自动汇率转换管线步骤（固定近似汇率足够，不需要实时汇率）
- 修改其他已有内容目录的 scene-data（只改 sensetime-latest 作为示范）

## Further Notes

- AudioSync root cause timeline：edge-tts/say 先存在（`.mp3`）→ sync.mjs 硬编码 `.mp3` → F5/Qwen3 后加入（`.wav`）→ sync.mjs 未更新 → 验证静默失效
- 防再犯核心：`resolveSceneAudio()` 统一路径解析 + 测试覆盖两种格式 + 注释说明引擎输出格式
- RMB→USD 汇率选择依据：¥1 ≈ $0.14 是 2025-2026 年 USD/CNY 汇率近似值（7.1-7.2 区间），短视频非财务报告，近似值足够
