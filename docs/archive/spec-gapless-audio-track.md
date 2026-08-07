# Spec: 无间隙连续音轨 + 终片音频同步验证

> 前作：`docs/spec-subtitle-karaoke-timeline.md`（字幕时间轴数学，已完成并验证）。
> 本篇解决上一轮未覆盖的盲区：**最终成片的音频时间轴 vs 字幕时间轴**。

## 背景与根因

**症状**：字幕到片尾漂移（本地播放器复现），开头正常、越到后面越偏。

**证据链**（`restraint-pt1` v14-30-31 实测）：

1. 终片 MP4 的音频包时间戳**本身是正确的**：每段 scene 的音频起始点与字幕时间轴逐段吻合，恒定 +24ms、零累积。文件容器层面的时序没有问题。
2. 但音频轨含 **10 个"元数据间隙"**：scene clip 的视频（`clipDuration`，含 0.5s buffer）比音频（TTS 时长）长 ~0.5s，拼接时空隙以**时间戳跳变**（ffprobe packet 显示 ~510ms GAP）而非**真实静音采样**记录。
3. **任何"解码 → PCM → 重编码"的下游环节都会把间隙压扁**：WAV 提取实测 11 段音频起点全部前移，逐段累积至 scene 11 的 **-4.9s**。本地播放器的 gap 处理和 TikTok/Instagram 上传转码都属于此类下游。
4. 结构根因：字幕按 `clipDuration` 时间轴烧录，而下游可能按"音频实际采样"播放。两侧在数学上一致，但在**容器语义**上不一致——有一个环节（concat 重编码后的 MP4 音频轨）把 buffer 静音表达成了时间戳间隙，而"间隙"这种表达方式在转码生态里不是可靠的契约。

**最佳实践对照**（为什么抖音"不难"）：

- 抖音/YouTube 自动字幕是在**最终转码后的音轨**上做 ASR/对齐——字幕从观众实际听到的声音里长出来，不存在"两个时间轴"。
- 广播级流程：先把所有人声/音乐拼成**一根连续 PCM 母带**，最后一次封装时单次编码，中间不经过多次有损代际。
- 我们的字幕是提前烧录进画面的，无法事后适配下游——因此必须交付一根**无可压缩**的连续音轨，把"间隙压扁"这一整类失效从结构上消灭。

## 方案

### 1. 装配音轨改为连续 PCM 母带（`lib/audio/track.mjs`）

- scene clip 改为**纯视频**（`-an`），不再携带音频——音频只存在于一个地方（voiceover 母带）。
- 每段 scene mp3 解码为 **44.1kHz mono s16 PCM**；按 `clipDuration × 44100` 样本数补齐静音（`assembleTrackPcm` 纯函数，样本级精确），拼接为 `output/{id}/voiceover.wav`。
- 最终封装：视频 concat（`-c:v copy`）+ `voiceover.wav` 作为音频输入，**音频只编码一次**（AAC 192k 44.1k）。
- 数学保证：`voiceover.wav` 长度 == Σ clipDuration == 视频总长，任何下游转码都无可压缩。
- 副作用：装配从"MP3→AAC、concat 再 AAC、（BGM 再 AAC）"的 3 代有损链路降为"MP3→PCM→（AAC×1 或 BGM 时 ×2）"。

### 2. 终片音频同步验证（`lib/audio/sync.mjs`）

在 `verifySubtitles()` 中新增 **audioSync** 检查（对 shipped artifact 的验证，抖音式闭环）：

- 解码终片音轨为 **4kHz** PCM；对每个 scene，用 **FFT 互相关**在其源音频（`audio/scene-{id}.mp3`，同样解码到 4kHz）中定位实际起点。
  （修订：原写 16kHz。4kHz 精度 0.25ms，远低于 80ms 容差，FFT 规模小 4 倍；两侧统一采样率，单位换算一致。）
- 断言 `|measured − timelineOffset| ≤ 80ms`（与字幕同步同一容差，单一常量源 `AUDIO_SYNC_TOLERANCE`，字幕侧 `SYNC_TOLERANCE`  re-export 之），**FAIL 类**——失败则 `summary.passed === false`，管线的"红着退出"逻辑自动生效。
- scene 音频文件缺失 → 跳过该 scene 并 WARN（fail-open 于缺失数据，fail-closed 于时序错误）。
  文件**存在但解码失败** → 计入 `failedScenes` 并判 FAIL。（修订：审查发现原实现对此 fail-open，与"fail-closed 于时序错误"自相矛盾。）
- `verification-report.json` 新增 `audioSync` 字段。

### 3. 不做的事

- 不改 `assembleVideo()` / `verifySubtitles()` 签名。
- 不对终片音频重新对齐/改写字幕（终检只验证）。
- 不处理第三方播放器/TikTok 转码的既有产物（已上传的视频无法修改）。

## 接口契约（跨 step）

| Step | 产物 | 变更 |
|---|---|---|
| Step 4 字幕生成 | `subtitles.ass` | 无变化 |
| 装配（改） | `scene-{id}_final.mp4` | **语义变更：纯视频（无音频流）**。消费者仅 concat（同文件内）。concat demuxer 按容器时长偏移，无音频流也成立 |
| 装配（新） | `output/{id}/voiceover.wav` | 新产物：44.1k mono s16 PCM，长度 == Σ clipDuration |
| 装配（改） | 最终 MP4 | 音频轨连续无间隙；`ffprobe` packet 无 >0.1s 跳变 |
| Step 6 验证（改） | `verification-report.json` | 新增 `audioSync` 字段；无代码消费者（grep 确认），纯追加 |
| `assembleVideo()` 签名 | 7 参不变 | `infra-paths.test.mjs` 断言 `length >= 3` 仍满足 |
| `verifySubtitles()` 签名 | 对象参数不变 | scene 音频路径由 `outputDir/audio/scene-{id}.mp3` 派生 |
| `recordScenes()` 返回值 | `{sceneId, videoPath, audioPath, duration}` | 不变（`audioPath` 已透传） |
| CLI `verify-subtitles.mjs` | 可选第 5 参 `output-dir` | 不传则行为不变；传则启用 audioSync（修订：审查补登记，原表遗漏） |

## Testing Decisions

DSP 纯函数进单测（合成信号、手算期望），ffmpeg 行为（解码/编码/容器间隙）进 Runtime Verify + 真实 ffmpeg 集成测试：

- `lib/audio/wav.mjs`：RIFF 读写（s16 mono）——round-trip 测试。
- `lib/audio/fft.mjs`：radix-2 FFT + 互相关 `findOnset`——已知偏移的合成突发信号。
- `lib/audio/track.mjs`：`assembleTrackPcm` 纯函数——合成 PCM 拼接，断言逐段起点与总长。
- `lib/audio/sync.mjs`：`evaluateAudioSync` 纯判定（容差边界 80ms 整 = PASS）+ `verifyAudioSync` 真实 ffmpeg 集成测试（噪声突发 → 真实 mp3 → `buildVoiceoverTrack` 装配 → 终检；编码器延迟对 needle/haystack 相同因而对消）。
- `assemble.mjs`：无 `audioPath` 守卫测试（抛错先于任何 fs/ffmpeg 操作）。

FFmpeg 容器行为（无间隙、单次编码正确性）进 Runtime Verify：重渲染后 ffprobe packet dump + 互相关终检。

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/assemble.mjs` | scene 纯视频 + voiceover 构建 + 最终单次编码 | Medium | 影响所有 pipeline 产物。缓解：重渲染 + 终检（互相关）断言逐段起点 ≤80ms + packet 无间隙。 |
| `scripts/short-video/lib/audio/wav.mjs`（新） | s16 mono WAV 读写 + `decodeToWavFile`（唯一 ffmpeg 解码桥） | Low | 纯函数 + 单一解码入口，单测覆盖。 |
| `scripts/short-video/lib/audio/fft.mjs`（新） | radix-2 FFT + 互相关 | Low | 纯函数，合成信号单测。 |
| `scripts/short-video/lib/audio/track.mjs`（新） | PCM 拼接 `assembleTrackPcm` + 母带构建 | Low | 数学为纯函数；解码行为由集成测试 + Runtime Verify 覆盖。 |
| `scripts/short-video/lib/audio/sync.mjs`（新） | 终片终检（解码 + 互相关 + 判定） | Low | 只读验证，不写产物（除临时 wav）。 |
| `scripts/short-video/lib/verify-subtitles.mjs` | report 增加 `audioSync` FAIL 类门禁 | Medium | 新门禁可能卡管线。缓解：容差 80ms 与字幕对齐；scene 音频缺失 fail-open（WARN）。 |
| `scripts/short-video/verify-subtitles.mjs`（CLI） | 可选第 5 参 `output-dir` | Low | 不传则行为不变（修订：审查补登记，原表遗漏）。 |
| `__tests__/audio-wav.test.mjs`、`audio-fft.test.mjs`、`audio-track.test.mjs`、`audio-sync.test.mjs`（新）、`infra-paths.test.mjs`（扩） | 新增/扩展单测 | Low | audio-sync 含真实 ffmpeg 集成测试（场景 6/8/9/16）。 |
| `docs/video-workflow.md`、`docs/spec-gapless-audio-track.md`、`docs/tickets-gapless-audio-track.md` | 文档 | Low | |

### Section 2: Behavioral Scenarios

矩阵每一行 = 一个测试用例。

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 正常 11 场景装配 | `voiceover.wav` 总样本数 == Σ round(clipDuration×44100)；终片音频无 >0.1s 间隙 | 回归到间隙表达 | 逐段起点断言 + packet dump |
| 2 | 单场景视频 | 拼接正常，track 长度 == 该 scene clipDuration | 单段退化 | `assembleTrackPcm` 单段测试 |
| 3 | scene PCM 超过目标长度（数据异常） | 抛出明确错误，不静默截断 | 静默丢字 | 构造上不可能（clip ≥ tts+0.467s），防回归断言 + 测试 |
| 4 | 空 scenes / scene 无 `audioPath` | 抛出明确错误 | 无声视频 | 显式抛错 + 守卫测试 |
| 5 | scene mp3 带前导静音 | 互相关起点 = 实际采样起点，仍以 timeline 偏移判定 | 起点误判 | findOnset 全信号互相关测试 |
| 6 | 验证：音频被人为平移 +200ms | `audioSync` FAIL，`summary.passed === false` | 静默发错位视频 | evaluateAudioSync 合成测试 + 集成测试（1.2s 谎报时长装配） |
| 7 | 验证：恒定偏移 +24ms | PASS（≤80ms 容差） | 过度敏感 | 容差测试 |
| 8 | 验证：某 scene 音频文件缺失 | 该 scene 跳过并计入 skipped，不 crash，不判 FAIL | 误卡管线 | fail-open 集成测试（真实 ffmpeg） |
| 9 | 验证：终片无音频轨 | 解码失败 → 计入错误（FAIL）而非静默跳过 | 无声视频放行 | 集成测试（无音频轨 mp4） |
| 10 | BGM 开启 | amix 在连续音轨上运行，输出仍连续；终检在混音后文件上 PASS（voiceover 主导） | BGM 引入断层 | Runtime Verify 一档 --bgm（已执行：11/11 场景 0ms 漂移 PASS） |
| 11 | 浮点：clipDuration×44100 非整数 | 每段 ±0.5 样本（round），全程 <0.1ms | 累积误差 | 整数样本断言 |
| 12 | 容差边界恰为 80ms | PASS（≤）；80.1ms FAIL | 边界闪烁 | 边界值测试（+1e-9 epsilon） |
| 13 | 互相关性能：74s×4k 长音轨 | 11 段互相关总耗时 <5s | 验证过慢 | 基准（Runtime Verify 观察，实测亚秒级） |
| 14 | FFT 长度非 2 幂 | 补零到下一 2 幂，峰值位置不变 | 算法错误 | 非 2 幂长度测试 |
| 15 | 终片与 scene 采样率不同 | 统一解码到 4kHz，单位换算为秒，判定不受采样率影响 | 单位错误 | 统一解码约定 + 测试 |
| 16 | 验证：scene 音频文件存在但无法解码 | 计入 `failedScenes`，errors+1，判 FAIL（fail-closed） | 验证责任静默落空 | 集成测试（损坏 mp3）（修订：审查新增行） |

## Out of Scope

- 更换/重训对齐引擎（wav2vec2 的段内偏差是独立议题，80ms 门禁已覆盖）。
- 对终片音频重新对齐并改写字幕（会引入第二次对齐的偏差源；必要性由本终检测量后决定）。
- 修复第三方播放器/转码器对历史视频的处理（已上传产物无法改变）。
- TikTok 端自动字幕（平台侧能力，与烧录字幕互补而非替代）。
- 多声道/立体声输出（当前 mono，保持）。

## Further Notes

- 行业依据：ITU-R BT.1359 音视频同步容差（+45/-125ms）；Netflix/TikTok 自动字幕的"对齐最终音轨"实践；广播的"先混音后封装"单代编码惯例。
- 前作遗留声明：`.ass` 继续作为渲染中间产物；本次变更使字幕时间轴与音频在**容器级**（而非仅数学级）一致。

## 修订记录（Code Review 后）

1. 互相关采样率 16kHz → 4kHz（精度 0.25ms 足够，FFT 更小）。
2. `failedScenes`（文件存在但解码失败）由 fail-open 改为 FAIL 类——原实现与"fail-closed 于时序错误"矛盾；新增场景行 16。
3. CLI 可选第 5 参 `output-dir` 补登记进接口契约与 Modified Files Impact。
4. 容差常量单一源：`AUDIO_SYNC_TOLERANCE`（sync.mjs），字幕侧 `SYNC_TOLERANCE` re-export。
5. 场景 10（BGM）Runtime Verify 已执行并 PASS（11/11 场景 0ms 漂移）。
