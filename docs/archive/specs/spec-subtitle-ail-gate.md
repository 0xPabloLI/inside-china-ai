# Spec: Subtitle AIL Gate — Canonical Text 溯源 + 渲染前/后双门验证

> **状态：** Spec — ready-for-agent
> **来源：** Proposal `docs/proposals/proposal-video-pipeline-improvements-from-lov-media-creator.md` + Grill 记录
> **日期：** 2026-08-26
> **Triage：** `enhancement` + `ready-for-agent`

## Problem Statement

当前管线的字幕验证存在两个缺口：

1. **没有渲染前的 canonical-text 校验。** `text-align.py` 用 scene-data voiceover 文本对 TTS 音频做强制对齐，输出 `subtitle-timing.json`。如果 scene-data 被修改但 timing 没有重做（例如用户只跑了 `render-only.mjs`），ASS 中的词序列会与当前 scene-data 不匹配，但当前没有任何检查能在渲染前发现这个问题。

2. **`subtitle-alignment` 失败没有自动修复。** `verify-retry.mjs` 能分类 `subtitle-alignment` 失败，但 `main.mjs` 第 453-457 行对此类别仍返回 `{ success: false }`，注释写着 "deferred for now"。这导致 alignment 失败直接终结管线，不做任何修复尝试。

## Solution

引入两个门：

- **门 1（渲染前 Canonical Text 门）：** 在 ASS 生成后、渲染/合成前执行。校验 `subtitle-timing.json` 中的词序列与 scene-data voiceover 规范化后的 canonical text 一致。失配时重做 `text-align.py` 强制对齐（最多 1 次），重做后仍失配则硬失败。

- **门 2（渲染后成片验证，已有，补全 repairFn）：** 在渲染/合成后执行。已有的 `verifySubtitles` + `verifyWithRetry`。补全 `subtitle-alignment` 的 repairFn：重做 `text-align.py` → 重新生成 ASS → 重新烧录。

两条渲染路径（Remotion / FFmpeg）均覆盖：门 1 在调用渲染函数前执行，门 2 在渲染完成后执行。

不引入 hash 溯源——"音频变但文本没变"的场景由门 2 的端到端 `verifyAudioSync` 互相关检查覆盖。

## User Stories

1. 作为 Agent，我想在渲染前验证 subtitle-timing.json 的词序列与 scene-data voiceover 一致，以便在渲染前发现文本不匹配问题。
2. 作为 Agent，我想在 canonical-text 失配时自动重做 text-align.py 强制对齐，以便尝试修复而不是直接失败。
3. 作为 Agent，我想在重做对齐后仍失配时硬失败并报告原因，以便提示用户需要重做 TTS。
4. 作为 Agent，我想在渲染后 subtitle-alignment 失败时自动重做对齐并重新烧录字幕，以便补全当前 deferred 的修复路径。
5. 作为 Agent，我想在 canonical-text 校验时对专有名词做 greedy merge，以便 "ByteDance" 不被误报为 "Byte" + "Dance"。
6. 作为 Agent，我想在 render-only.mjs 中也运行门 1，以便防止用户改了 scene-data 但只跑了 render-only。
7. 作为 Agent，我想在 render-only.mjs 中 canonical-text 失配时硬失败并提示运行 full pipeline，以便用户知道需要重做 TTS。
8. 作为 Agent，我想对 scene-data voiceover 做规范化（标点剥离、大小写折叠）后再与 timing 比对，以便格式差异不产生误报。
9. 作为 Agent，我想用 meta.keyEntities 构建专有名词词典，以便 greedy merge 知道哪些词应该合并。
10. 作为开发者，我想看到门 1 和门 2 的验证报告（通过/失败、失败原因、重试次数），以便诊断管线问题。
11. 作为开发者，我想在 timing JSON 格式从数组改为对象时保持向后兼容，以便旧 timing 文件仍能被读取。
12. 作为开发者，我想在 `verify-retry.mjs` 中新增 canonical-text 修复策略，以便门 1 的失败也能走 verify-retry 循环。
13. 作为开发者，我想用已有 content 目录的真实 TTS 音频测试 canonical-text 校验，以便不依赖 mock。
14. 作为开发者，我想在修改 scene-data 后重跑管线时，门 1 能检测到 timing 过期，以便防止用过期 timing 渲染。

## Implementation Decisions

### ID1: Canonical Text 规范化规则

规范化分两步：

1. **标点剥离 + 大小写折叠**：从 scene-data voiceover 和 timing 词序列两端各做一次，得到 canonical token stream。
2. **专有名词 greedy merge**：用 `meta.keyEntities` 构建词典，把 timing 中被拆开的专有名词（如 `["Byte", "Dance"]`）合并为 `["ByteDance"]`。

规范化规则覆盖：大小写折叠、标点剥离、专有名词合并。**不展开数字读法**（`$2B` 保持原样——text-align.py 的输入就是 scene-data 原文，output 的词应该忠实于输入）。

### ID2: 门 1 位置和输入

门 1 在 `main.mjs` Step 4（ASS 生成）和 Step 5（渲染/合成）之间执行。输入：

- `subtitle-timing.json`（timing 数据）
- `scene-data.mjs` 的 `scenes` 数组（voiceover 字段）
- `meta.mjs` 的 `keyEntities`（专有名词词典来源）

门 1 在 `render-only.mjs` 中也在 ASS 生成后、渲染前执行。

### ID3: 门 1 失败修复边界

- canonical-text 失配 → 重做 `text-align.py`（从当前 scene-data voiceover + 已有 TTS 音频重新生成 timing）
- 重做后重验 → PASS 则继续；仍 FAIL 则硬失败
- 最多重做 1 次
- 不自动触发 TTS 重做——TTS 重做是 Stage 4 Step 1 的职责
- TTS 引擎不可用时门 1 不降级

### ID4: timing JSON 格式变更

从数组格式 `[{ sceneId, segments }]` 改为对象格式 `{ scenes: [{ sceneId, segments }] }`。

读取时做适配：`const scenes = Array.isArray(timingData) ? timingData : timingData.scenes`。

涉及修改的消费者：`buildCues`、`expectedWordTimes`、`regenerateSubtitles`、`compareWordSequence`。

### ID5: 门 2 补全 subtitle-alignment repairFn

在 `main.mjs` 第 453-457 行，把 `{ success: false }` 替换为：

1. 调用 `runWhisperAlignment()` 重做 text-align.py
2. 重新生成 ASS（`regenerateSubtitles`）
3. 重新烧录（`burnSubtitles`，找 base file）
4. 返回 `{ success: true, videoPath, assPath }`

如果重做对齐失败（text-align.py 报错），返回 `{ success: false }`。

### ID6: text-align.py 重做行为

每次 spawn 新 Python 进程（`execAsync`），不引入长驻进程。模型加载 ~5-10s 对于重试场景（最多 1 次）可接受。

### ID7: 测试 seam

复用现有 test seam（`verify-subtitles.test.mjs`、`verify-retry-loop.test.mjs`），新增 canonical-text 校验和修复策略的测试。

新增一个基线验证脚本（非正式测试文件），用已有 content 目录的真实 TTS 音频证明当前缺口。

### ID8: 不引入 hash 溯源

"音频变但文本没变"场景由门 2 的 `verifyAudioSync` 端到端互相关覆盖。不增加 hash 字段到 timing JSON。

## Testing Decisions

- **测试外部行为，不测实现细节。** canonical-text 校验的测试验证"给定 timing + scene-data，PASS/FAIL 结果正确"，不测规范化函数内部步骤。
- **复用现有 seam。** `verify-subtitles.test.mjs` 已有 `compareWordSequence` 测试模式；`verify-retry-loop.test.mjs` 已有分类 + 修复循环测试模式。
- **用真实 TTS 音频做基线。** 用已有 content 目录（如 `doubao-work`）的 timing JSON + scene-data 做基线测试。修改 scene-data 中的一个词 → 验证 canonical-text 报 Blocker。
- **Prior art：** `verify-retry-drift.test.mjs`（drift 补偿测试）、`verify-retry-relax.test.mjs`（gap 放宽测试）。

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件                                   | 修改内容                                                | 风险等级 | 评估                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.mjs`                             | Step 4-5 间插入门 1；补全 subtitle-alignment repairFn   | Medium   | 门 1 是新增逻辑，不影响已有步骤；repairFn 补全是替换 `{ success: false }` 为真实修复，不改变 verify-retry 循环结构。验证：现有 verify-retry 测试 + 新 canonical-text 测试 |
| `lib/verify-subtitles.mjs`             | 新增 canonical-text 校验函数                            | Low      | 纯追加新函数，不修改现有 `compareWordSequence`、`analyzeSync` 等。验证：新增测试                                                                                          |
| `lib/verify-retry.mjs`                 | 新增 canonical-text 修复策略分类                        | Low      | 纯追加新分类和修复逻辑，不修改现有 `classifyFailure`、`applyDriftCorrection` 等。验证：新增测试                                                                           |
| `lib/tts/post-process.mjs`             | `runWhisperAlignment` 函数重命名为 `runForcedAlignment` | Medium   | 函数名变更影响调用方 `registry.mjs`。验证：grep 所有调用点。新增旧名作为 alias 过渡。                                                                                     |
| `lib/subtitles/generate.mjs`           | timing JSON 格式适配（数组 → 对象）                     | Medium   | 修改 `regenerateSubtitles` 的读取逻辑。影响下游 `buildCues`、`expectedWordTimes`。验证：现有字幕测试 + 格式适配测试                                                       |
| `lib/subtitles/cues.mjs`               | timing JSON 格式适配                                    | Medium   | `buildCues` 和 `collectRawCues` 接受 timingData。验证：现有 cues 测试                                                                                                     |
| `text-align.py`                        | 无改动                                                  | Low      | text-align.py 输出格式不变（仍输出数组），格式转换在 Node 侧做                                                                                                            |
| `render-only.mjs`                      | 新增门 1 调用                                           | Low      | 纯追加调用，不修改现有渲染逻辑                                                                                                                                            |
| `__tests__/verify-subtitles.test.mjs`  | 新增 canonical-text 测试                                | Low      | 纯追加                                                                                                                                                                    |
| `__tests__/verify-retry-loop.test.mjs` | 新增 canonical-text 修复策略测试                        | Low      | 纯追加                                                                                                                                                                    |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                                | Expected Behavior                                                      | Risk                                                   | Mitigation                                            |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| 1   | timing 词序列与 scene-data voiceover 完全一致                           | 门 1 PASS → 进入渲染                                                   | 无                                                     | —                                                     |
| 2   | scene-data voiceover 被修改（如 "ByteDance" → "TikTok"），timing 未重做 | 门 1 FAIL → 重做 text-align.py → 重验 → PASS（如果新文本与音频一致）   | 重做对齐可能因音频不匹配而产出错误 timing              | 重做后仍 FAIL 则硬失败                                |
| 3   | scene-data voiceover 被修改，重做 text-align.py 后仍不匹配              | 硬失败，提示用户重做 TTS                                               | 用户可能不理解为什么需要重做 TTS                       | 错误消息明确说明                                      |
| 4   | timing 中 "ByteDance" 被拆为 ["Byte", "Dance"]                          | canonical-text 规范化用 keyEntities 词典 merge → 通过                  | 词典不完整时漏报                                       | 词典从 meta.keyEntities 自动构建，覆盖主要专有名词    |
| 5   | timing 中有专有名词不在 keyEntities 词典中                              | canonical-text 报 FAIL（误报）                                         | 新公司名不在词典中                                     | 硬失败时提示"check keyEntities dictionary"            |
| 6   | render-only.mjs 运行时 scene-data 已改但 timing 未重做                  | 门 1 FAIL → 硬失败，提示运行 full pipeline                             | 用户期望 render-only 能工作                            | 错误消息明确说明需要 `node main.mjs --content <slug>` |
| 7   | render-only.mjs 运行时 scene-data 未改，timing 与 scene-data 一致       | 门 1 PASS → 继续渲染                                                   | 无                                                     | —                                                     |
| 8   | timing JSON 是旧数组格式（无 `scenes` 包装）                            | 读取时适配为数组 → 正常处理                                            | 适配代码有 bug                                         | 测试覆盖旧格式读取                                    |
| 9   | timing JSON 是新对象格式                                                | 读取 `.scenes` 数组 → 正常处理                                         | 无                                                     | —                                                     |
| 10  | 渲染后 subtitle-alignment 失败                                          | 门 2 repairFn 重做 text-align.py → 重新生成 ASS → 重新烧录 → 重验      | 重做对齐后 timing 变了但 ASS 烧到了旧 base file        | findBaseAndBurn 确保找对 base file                    |
| 11  | 渲染后 subtitle-alignment 失败，重做 text-align.py 报错                 | repairFn 返回 `{ success: false }` → verify-retry 继续重试或最终硬失败 | 无                                                     | —                                                     |
| 12  | Remotion 路径：门 1 PASS → 渲染 → 门 2                                  | 两条路径行为一致                                                       | Remotion 和 FFmpeg 的 base file 位置不同               | findBaseAndBurn 路径逻辑已有                          |
| 13  | FFmpeg 路径：门 1 PASS → 合成 → 门 2                                    | 同上                                                                   | 同上                                                   | 同上                                                  |
| 14  | scene 无 voiceover（如纯视觉场景）                                      | canonical-text 跳过该 scene（无词可校验）                              | 误报为 FAIL                                            | 检查 voiceover 为空时 skip                            |
| 15  | text-align.py 产出空 segments（0 words）                                | 门 1 检测到空词 → 硬失败                                               | 需区分"scene 无 voiceover"（合法）和"对齐失败"（错误） | 检查 voiceover 非空但 timing words 为空               |
| 16  | canonical-text 修复后引入新错误（修一个错引一个错）                     | 不接受——canonical-text 要求 100% 匹配                                  | 无                                                     | 修复策略只在 100% 匹配时返回 success                  |
| 17  | 修复后旧成片未替换                                                      | burnSubtitles 原子替换；门 2 重验新成片                                | 旧文件残留                                             | unlinkSync 清理                                       |

## Out of Scope

- **Hash 溯源机制** — 砍掉，门 2 audioSync 已覆盖。
- **Status Dimension Separation** — 独立排期（P1），不在此 spec 范围内。
- **Series Template Reuse** — 独立排期（P2），不在此 spec 范围内。
- **Profile Persistence** — 独立排期（P3），不在此 spec 范围内。
- **Cover vs Opening Still** — 仅文档记录，不在此 spec 范围内。
- **HITL 字幕审校** — 明确拒绝，所有门都是 AIL。

## Further Notes

- `runWhisperAlignment` 函数名有误导性（不运行 Whisper，运行的是 text-align.py wav2vec2 强制对齐）。重命名为 `runForcedAlignment`，保留旧名作为 alias 过渡。
- Grill 记录见本对话上文 Round 1 + Round 2，共 10 个设计决策。
- Proposal 文档：`docs/proposals/proposal-video-pipeline-improvements-from-lov-media-creator.md`
