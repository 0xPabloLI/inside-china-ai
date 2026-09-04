# Spec: Karaoke 字幕漏词与不同步修复 + 时间轴单一真相源

> Status: ready-for-agent
> Created: 2026-08-06
> Related: `docs/spec-subtitle-rendering.md`（前代）、`docs/spec-subtitle-verification.md`（前代）

## Problem Statement

短视频管线产出的 karaoke 字幕有两个用户可见缺陷：

1. **漏词** — 每个句子的最后一个词从画面上消失。实测 `restraint-pt1`：对齐数据 170 词，画面只渲染 148 词，丢失 22 个（13%），全部是句尾词（`KPIs.` `chart.` `vision.` `profit.` …）。观众听到"DeepSeek has no KPIs"，画面只有"DeepSeek has no"。
2. **不同步** — 词高亮普遍早于语音，实测平均 -82ms、最差 -200ms。karaoke 高亮是"位置指针"，对偏差的敏感度接近唇音同步（可察觉阈值约 ±100ms），已越线。

根因分析（含 libass 源码级证据）见 session 诊断记录，摘要：

- 漏词：分块函数在**追加句尾词之前**就 flush，句尾词成为孤立尾块后走"并回上一块"分支，该分支只合并了 `text` 没有合并 `words`；而渲染只读 `words`。同一缺陷在第二处 merge 分支重复出现。
- 不同步（行内）：`\k`/`\kf` 时长逐词 `int(x*100)` 向下取整，而 libass 的 karaoke 计时**从行首累加**（`ass_process_karaoke_effects`: `timing = tm_end + skip_timing`），误差逐词累积。
- 不同步（跨 scene）：字幕假设每段 clip = TTS 时长 + 0.5s，而 `assemble.mjs` 用 `-t` + `-r 30` 编码，实际 clip 向上对齐到帧边界，每段多 5-11ms，全片累计 +96ms。
- 未被拦截：`verify-subtitles.mjs` 从不读取生成的 `.ass`，而是用**自己的一套常量**重算时间轴（`START_OFFSET=-0.3`，生成侧是 `-0.1`），属于"用输入验证输入"。

结构性根因：**同一套时间轴数学有四份实现**（`generate-ass.py`、`lib/generate-srt.mjs`、`lib/verify-subtitles.mjs`、`lib/assemble.mjs`），常量各不相同，且 Python 那份不在 vitest 覆盖内。

## Solution

把字幕生成收敛为**一份 JS 实现**，时间轴常量集中到一个模块，验证改为**回读产物断言**，并采用 libass 的 `\kt` 绝对锚点消除累积漂移。

用户视角的结果：

- 画面上的字幕文本与语音**逐词一致**，不再吞词。
- 词高亮与语音偏差 ≤ 80ms（验证门禁强制）。
- 字幕节奏符合行业规范（Netflix Timed Text）：入点贴音频首帧、最短 0.8s、相邻间隔只允许 2 帧或 ≥0.5s。
- 已读/未读对比明显（白 → 品牌蓝）。
- 任何一条被破坏时，管线**红着退出**而不是静默产出坏视频。

## User Stories

1. As a viewer, I want every spoken word to appear on screen, so that I can follow the narration without gaps.
2. As a viewer, I want the word highlight to track the voice within a perceptual threshold, so that the karaoke effect reads as synchronized rather than "running ahead".
3. As a viewer, I want to distinguish spoken from unspoken words at a glance on a phone screen, so that I know where the narration is.
4. As a viewer, I want subtitles to hold long enough to read, so that short cues don't flash by.
5. As a viewer, I want no distracting 3-frame blinks between consecutive cues, so that a run of subtitles reads as continuous.
6. As the pipeline operator, I want the pipeline to fail loudly when generated subtitles don't match the aligned audio, so that I never publish a video with dropped words.
7. As the pipeline operator, I want the verification report to describe the artifact that will actually ship, not a recomputation of the input.
8. As the pipeline operator, I want one place to change timeline constants (fps, scene buffer, lead-in), so that generator, assembler, and verifier can never disagree.
9. As the pipeline operator, I want subtitle generation to work without a Python virtualenv, so that a broken `~/.f5-tts-env` cannot silently downgrade output to a non-karaoke fallback.
10. As a developer, I want the chunking and timing logic under vitest, so that a regression is caught by `npx vitest run` instead of by watching a rendered video.
11. As a developer, I want the ASS writer and reader to round-trip, so that the verifier tests the same semantics libass will apply.
12. As a developer, I want to re-render a video without re-running TTS, so that verifying a subtitle change takes a minute instead of ten.
13. As a developer, I want alignment gaps (missing/degenerate word timings) to degrade to a readable static cue rather than crash or drop text.
14. As a brand owner, I want the highlight color to be the Dispatch Blue defined in DESIGN.md, so that video and web share the same progress-marker semantics.

## Implementation Decisions

### Modules

| 模块                                      | 角色                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `lib/timeline.mjs`（新）                  | 时间轴单一真相源：`FPS`、`SCENE_BUFFER`、帧对齐、scene clip 时长/帧数、scene 起始偏移 |
| `lib/subtitles/cues.mjs`（新）            | 纯函数：对齐数据 + scene 时长 → 绝对时间轴的 cue 列表（分块 + 时序规则）              |
| `lib/subtitles/ass.mjs`（新）             | ASS 序列化 + 反序列化（`renderAss` / `parseAss`），含 `\kt`/`\kf` 语义                |
| `lib/verify-subtitles.mjs`（重写）        | 回读 `.ass` 产物做断言，输出报告                                                      |
| `lib/assemble.mjs`（改）                  | 从 `timeline.mjs` 取帧对齐后的 clip 帧数/时长                                         |
| `main.mjs`（改）                          | Step 4 直接调 JS 生成器，删除 Python 调用与 fallback 分支                             |
| `render-only.mjs`（改）                   | 支持 `--content`，复用同一字幕生成路径                                                |
| `generate-ass.py`、`lib/generate-srt.mjs` | 删除                                                                                  |

### 时间轴（`timeline.mjs`）

- `FPS = 30`，`SCENE_BUFFER = 0.5`。
- **scene clip 时长由帧数定义**：`frames = ceil((ttsDuration + SCENE_BUFFER) * FPS)`（带 1e-6 epsilon 防浮点误判），`clipDuration = frames / FPS`。
- `assemble.mjs` 用 `-frames:v <frames>` 固定帧数，**不带 `-t`**：clip 时长由帧数定义，`-t <sec>` 的秒数舍入只会带来提前截断的风险而非保险（实跑 ffprobe 验证：2216 帧与 `sceneTimeline` 预测逐帧一致）。字幕用同一 `clipDuration` 累加 scene 偏移 → 两侧在数学上不可能分歧。
- `scene-durations.json` 的语义**保持不变**（写原始 TTS 音频时长），clip 时长一律由 `timeline.mjs` 派生。这样既不破坏既有产物契约，又只有一个派生点。

### Cue 构建（`cues.mjs`）

分块规则（`chunkWords`）：

- **`text` 始终由 `words` 派生**（`words.map(w => w.text).join(" ")` 再收紧标点前空格）。文本与词表不可能再分叉——漏词这一 bug 类被结构性消除。
- 先追加当前词，再判断是否 flush；句尾标点（`.!?:;`）归属**当前块**。
- 上限：≤ 6 词 **且** ≤ 49 字符（软限 38 字符，仅在后续还剩 ≥2 词时才在软限处断）。
- 尾部单词块并回前一块时，`words` 与 `text` 同步合并。

时序规则（Netflix Timed Text，30fps 换算）：

| 规则                 | 值                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 入点提前（lead-in）  | 2 帧（0.0667s），首条 clamp 到 0                                                                                                                  |
| 最短显示时长         | 0.8s                                                                                                                                              |
| 出点保持（hold-out） | 语音结束后 +0.5s                                                                                                                                  |
| 相邻间隔             | 若原始间隔 < 0.5s → 收紧到恰好 2 帧（chaining）；否则保留。横跨 scene 切换点的间隔豁免此规则——cue 被刻意 clamp 到镜头边界，画面切换本身掩盖了间隔 |
| 冲突优先级           | 不重叠 > 最短时长；无法两全时尝试与下一条合并（borrowing time），合并会超限则接受短 cue 并在验证中告警                                            |

降级路径：segment 无 `words`（对齐失败）时，产出一条无 karaoke 的静态 cue，文本取 `segment.text`，时间取 segment 级 start/end。文本不丢。

### ASS 生成（`ass.mjs`）

- 每个词写 `{\kt<abs_cs>\kf<dur_cs>}word`。`\kt` 是相对**行首**的绝对锚点，libass 会 `reset_effect` 清零累加器（源码 `ass_parse.c: tag("kt")`），因此第 N 个词的误差**不继承**前 N-1 个词的误差。
- `\kt`/`\kf` 参数写**一位小数**（厘秒的 1/10 = 1ms）。libass 用 `argtod` 解析后 `×10` 转毫秒，精度到 1ms（源码 `tag("kf")`）。
- **`\kt` 必须相对量化后的 cue 起点计算**：ASS 事件时间戳只有厘秒精度（`h:mm:ss.cc`），libass 的 `tm_current = time - event->Start`。先把 cue start 量化成厘秒，再用该值算 `\kt`，否则引入 ≤10ms 的系统偏差。
- 转义：`\` → `\\`，`{` → `\{`，`}` → `\}`，换行 → `\N`。
- 样式：`SecondaryColour`（未读）= `#F5F5F5` 白，`PrimaryColour`（已读）= `#4d8bff` Dispatch Blue。理由：场景背景 `#050508`，白 19:1 / 蓝 6:1 均清晰；行业验证的 karaoke 模式是**色相位移**（白→黄）而非压暗亮度；DESIGN.md 将 Dispatch Blue 定义为进度指示色，karaoke 填充即进度。
- 兼容性声明：`\kt` 是 v4++/libass 扩展，老版 VSFilter 会忽略。`.ass` 自此**仅作为渲染中间产物**，不作为通用交付格式。
- 渲染器版本敏感：libass 曾有 karaoke 整体滞后的回归（libass#357），所以生成侧的数学正确性不足以保证画面正确，必须有回读验证 + 一次真渲染抽查。

### 验证（`verify-subtitles.mjs`）

从"重算输入"改为"回读产物"。输入 `.ass` 路径 + 对齐数据 + scene 时长，断言：

| 检查         | 判定                                                               |
| ------------ | ------------------------------------------------------------------ |
| 词序列完整性 | 解析 `.ass` 得到的词序列 === 对齐数据词序列（顺序与文本全等）      | FAIL |
| 逐词同步     | 每个词的高亮起点（cue start + `\kt`）与期望绝对时刻偏差 ≤ 80ms     | FAIL |
| 相邻间隔     | 每个间隔 ∈ {2 帧 ±11ms} ∪ [0.489s, ∞)；横跨 scene 切换点的间隔豁免 | FAIL |
| 最短时长     | 每条 ≥ 0.8s                                                        | WARN |
| 每行词数     | ≤ 6                                                                | WARN |
| 覆盖率       | 沿用现有 gap 检测，但数据源改为解析后的 cue                        | WARN |

间隔门禁的容差由来：`.ass` 时间戳是厘秒量化，间隔两端各 ±5ms 舍入，测量天然 ±10ms，门禁再放 1ms 余量到 ±11ms；0.5s 端同理（0.5 − 0.011 = 0.489s）。

报告仍写 `verification-report.json`，`summary.passed` 只由 FAIL 类决定。`main.mjs` 与 `render-only.mjs` 在 `summary.passed === false` 时**红着退出**（`process.exit(1)`），不产出"完成"假象。

### 接口契约（跨 step）

- 上游 `subtitle-timing.json` 格式不变：`[{sceneId, segments:[{text,start,end,words:[{text,start,end}]}]}]`。
- 上游 `scene-durations.json` 格式与语义不变（TTS 原始时长）。
- 下游 `assemble.mjs` 仍接收 `.ass` 路径参数，签名不变。
- `verifySubtitles()` 签名变更为对象参数（新增 `assPath`）——消费者只有 `main.mjs` 与 `verify-subtitles.mjs` CLI，同批改。

## Testing Decisions

好的测试：只验证公开行为（给定对齐数据，产出的 cue/ASS 文本长什么样），不断言内部实现细节；期望值来自独立真相源（手算的时间戳、规范条款），不复算实现逻辑。

**Seams（测试接缝）** —— 全部是模块级纯函数，无需 mock：

1. `timeline.mjs` 的帧对齐与偏移计算
2. `cues.mjs` 的 `chunkWords()` 与 `buildCues()`
3. `ass.mjs` 的 `renderAss()` / `parseAss()`（含 round-trip）
4. `verify-subtitles.mjs` 的纯分析函数（词序列比对、同步偏差、间隔校验）

Prior art：`__tests__/verify-subtitles.test.mjs`、`__tests__/caption-utils.test.mjs`、`__tests__/tts-alignment.test.mjs`（同为 vitest + 纯函数 + 手算期望值）。

FFmpeg 相关的行为（帧数是否真的等于 `-frames:v`）不进单测，进 Runtime Verify：实跑后 ffprobe 每个 clip 断言帧数。

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件                                                      | 修改内容                               | 风险等级 | 评估                                                                                                                                                               |
| --------------------------------------------------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/short-video/generate-ass.py`                     | 删除                                   | Low      | 唯一消费者是 `main.mjs` Step 4，同批替换。最坏后果：删早了导致无字幕，被 Step 6 验证拦截。                                                                         |
| `scripts/short-video/lib/generate-srt.mjs`                | 删除                                   | Medium   | 消费者是 `main.mjs` 的 fallback 分支（同批删除）。它本身产出的是无 karaoke、按词数比例分配时间的劣化字幕——保留反而是风险。已 grep 确认无其他 import。              |
| `scripts/short-video/main.mjs`                            | Step 4 改为 JS 调用，去掉 try/fallback | Medium   | 主发布路径。失败后果：字幕缺失或管线中断。缓解：Step 6 验证门禁 + 实跑验证。                                                                                       |
| `scripts/short-video/lib/assemble.mjs`                    | clip 时长改为帧对齐 + `-frames:v`      | Medium   | 影响所有 pipeline 产物，每段时长变化 0-33ms，总时长变化 <0.2s。下游只有 concat 与 BGM 混音（按实测时长计算，自适应）。验证：ffprobe 断言每个 clip 帧数 == 期望值。 |
| `scripts/short-video/lib/verify-subtitles.mjs`            | 重写为回读 `.ass`                      | Medium   | 导出函数签名变更；消费者 `main.mjs` + `verify-subtitles.mjs` CLI + 单测，全部同批更新。最坏后果：验证误报导致管线卡住（可 `--skip-verify` 绕过）。                 |
| `scripts/short-video/verify-subtitles.mjs`（CLI）         | 适配新签名，新增 `.ass` 参数           | Low      | 独立工具，无下游。                                                                                                                                                 |
| `scripts/short-video/render-only.mjs`                     | 支持 `--content`，接入字幕生成         | Low      | 独立脚本，当前已损坏（硬编码 deepseek + 不产字幕），只会变好。                                                                                                     |
| `scripts/short-video/__tests__/verify-subtitles.test.mjs` | 重写                                   | Low      | 旧用例断言的是被删除的 `-0.3` 语义，保留即误导。                                                                                                                   |
| `docs/video-workflow.md`、`docs/brand-system.md`          | 更新字幕章节                           | Low      | 纯文档。                                                                                                                                                           |

### Section 2: Behavioral Scenarios

矩阵每一行 = 一个测试用例。

| #   | Scenario                                        | Expected Behavior                                     | Risk             | Mitigation                                  |
| --- | ----------------------------------------------- | ----------------------------------------------------- | ---------------- | ------------------------------------------- |
| 1   | segment 以句尾词结尾（`DeepSeek has no KPIs.`） | 渲染文本包含 `KPIs.`，且它有自己的 `\kt/\kf`          | 漏词回归         | `text` 由 `words` 派生，测试断言词序列全等  |
| 2   | 分块后尾部只剩 1 个词                           | 并回前一块，`words` 同步合并，无词丢失                | 漏词回归         | 断言合并后 words 数 == 输入 words 数        |
| 3   | segment 有 `text` 无 `words`（对齐失败）        | 产出静态 cue（无 karaoke tag），文本保留              | 文本丢失 / crash | 降级分支 + 测试                             |
| 4   | segment 为空数组 / scene 无 segments            | 不产出 cue，不 crash，后续 scene 偏移仍正确           | 时间轴错位       | 断言下一 scene 的 cue 绝对时间              |
| 5   | 词时间倒挂（`end < start`）                     | `\kf` 不为负，clamp 到 0；不影响后续词锚点            | ASS 解析异常     | clamp + 测试                                |
| 6   | 词结束时间超出 scene 时长                       | clamp 到 scene 尾，不越界进下一 scene                 | 跨 scene 串台    | clamp + 测试                                |
| 7   | 两条 cue 原始间隔 0.14s（<0.5s）                | 收紧到恰好 2 帧                                       | 3-14 帧禁区闪烁  | chaining 规则 + 测试                        |
| 8   | 两条 cue 原始间隔 1.2s（≥0.5s）                 | 前一条 hold 到语音结束 +0.5s，间隔保留                | 字幕悬挂过久     | hold-out 规则 + 测试                        |
| 9   | cue 语音仅 0.3s 且下一条紧邻                    | 优先不重叠；能合并则合并，否则接受短 cue 并 WARN      | 重叠 / 闪烁      | 优先级规则 + 测试                           |
| 10  | 首条 cue 语音从 0.04s 开始（lead-in 会变负）    | cue start clamp 到 0，`\kt` 相应变大，词锚点仍准      | 负时间戳         | clamp + 测试                                |
| 11  | 一行 9 词 / 55 字符                             | 拆成 ≤6 词且 ≤49 字符的多行                           | 高亮扫描过快     | 分块上限 + 测试                             |
| 12  | 跨 scene 累加                                   | 第 N 个 scene 的偏移 == 前 N-1 段帧对齐 clip 时长之和 | 累积漂移         | `timeline.mjs` 单一派生 + ffprobe 实测断言  |
| 13  | 文本含 `{` `}` `\`                              | 正确转义，libass 不解析为 tag                         | 渲染破损         | 转义 + round-trip 测试                      |
| 14  | 一行 7 个词的 `\kt` 锚点                        | 第 7 个词的 onset 与源时间戳偏差 ≤1ms（不累积）       | 行内漂移回归     | round-trip 解析后逐词断言                   |
| 15  | 时间值需量化到厘秒                              | `\kt` 基于量化后的 cue start 计算                     | ≤10ms 系统偏差   | 测试用非整厘秒的 cue start                  |
| 16  | 验证：`.ass` 少了一个词                         | 报告 FAIL，`summary.passed === false`                 | 静默发坏视频     | 词序列断言 + 测试                           |
| 17  | 验证：某词偏差 120ms                            | 报告 FAIL 并指出词与偏差值                            | 静默发不同步视频 | 阈值断言 + 测试                             |
| 18  | 验证：间隔 0.14s                                | 报告 FAIL                                             | 禁区间隔漏网     | 间隔断言 + 测试                             |
| 19  | `TTS_ATEMPO` 变速开启                           | 对齐在变速后音频上运行，时间轴一致（现状行为不变）    | 回归             | Runtime Verify 时不启用；契约不变           |
| 20  | `scene-durations.json` 缺某 sceneId             | 抛出明确错误而非静默按 0 处理                         | 时间轴静默错位   | 显式报错 + 测试                             |
| 21  | 验证：间隔落在禁区但横跨 scene 切换点           | 豁免，不判违规                                        | 镜头边界误报     | `analyzeGaps(cues, sceneBoundaries)` + 测试 |

## Out of Scope

- 更换对齐引擎（MFA / CrisperWhisper / gentle）。WhisperX 的 wav2vec2 有已知系统偏差，但本次通过 80ms 门禁把它暴露出来即可，替换是独立议题。
- 利用 edge-tts 的 WordBoundary 事件拿零误差时间轴。edge-tts 在引擎优先级第 4 位，实际不走这条路。
- 改为"每词一条 Dialogue 事件"的 TikTok 式高亮（只亮当前词）。当前 `\kf` 渐进填充是既定视觉方向。
- 把字幕改成在 HTML scene 内渲染（Remotion 式）。会消除跨 scene 偏移这一整类问题，但代价是失去后期换字幕能力，另案评估。
- 字号/边距/位置（`FONT_SIZE=42`、`MARGIN_V=450`）的视觉调整。
- `text-align.py` 的对齐逻辑与 `PAD_MS` 补偿值。

## Further Notes

- libass 源码依据：`ass_parse.c` 的 `tag("kt")` / `tag("kf")`（浮点解析、×10 转毫秒、`reset_effect`）与 `ass_process_karaoke_effects()`（`timing = tm_end + skip_timing` 的累加语义）。
- 行业规范依据：Netflix Timed Text Style Guide — Subtitle Timing Guidelines（最短 20 帧、间隔 2 帧或 ≥0.5s、chaining、borrowing time、入点距音频首帧 1-2 帧）。
- 短视频专项：每行 4-6 词、词间 50-100ms 呼吸、高亮色需一眼可辨。
- 删除 Python 路径后，字幕生成不再依赖 `~/.f5-tts-env` 与 `pysubs2`；`text-align.py`（whisperx 对齐）仍依赖该 env，不受影响。
