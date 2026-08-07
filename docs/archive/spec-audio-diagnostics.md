# Spec: 验证失败诊断包（fail-loud 的可操作化）

> 前作：`docs/spec-gapless-audio-track.md`（无间隙音轨 + 终片音频同步验证，已落地）。
> 本篇解决上一轮暴露的流程短板：**验证红掉后，定位根因仍需人工手动探查**（上次我逐个 ffprobe 查了十几分钟才拼齐证据链）。让"红掉"自带证据包。

## 背景与目标

**现状**：验证 FAIL 时（`lib/verify-subtitles.mjs`）终端打印逐场景漂移表 + 落盘 `verification-report.json`。但定位根因需要的容器级证据——终片音频的 packet 间隙位置、视频流 vs 音频流时长差、失效场景点名——都不在报告里，必须手动跑 ffprobe。

**目标**：FAIL 时自动在 `output/{pipelineId}/diagnostics/{时间戳}/` 落一份**自包含诊断包**，把"红字 → 根因定位"的耗时从人工探查（10-20 分钟）压到 0。PASS 路径零写（硬规则）。

**不做的事**（明确排除）：

- 不自动修复、不自动重渲染、不改变退出码语义——诊断包是**人工修复闭环的输入**，不是修复本身。
- 不改 `verifySubtitles()` / `verifyAudioSync()` 的签名与返回结构。
- 不加"latest"符号链接（范围最小化；路径由终端打印）。
- 不采集音频样本/WAV 全文（体积与隐私；现有证据已足够定位）。

## 方案

### 1. 新模块 `lib/audio/diagnostics.mjs`

三个导出：

- `parsePacketPts(lines)`（纯函数）：解析 ffprobe `-show_entries packet=pts_time -of csv=p=0` 输出为 `number[]`。必须容：行尾逗号（实测 `-0.023220,`）、负 pts（AAC priming edit list）、空行。
- `collectPacketGaps(videoPath, minGapSeconds = 0.1)`：跑 ffprobe 取音频包 pts，计算相邻差值，返回 `{ packets, firstPts, lastPts, gaps: [{at, gapMs}] }`（`gapMs` 取整，阈值 `> 0.1s`，与既有 packet 检查口径一致）。ffprobe 失败/无音频流 → 抛错（由调用方兜底），或返回 `null`? 决定：**返回 `{ packets: 0, gaps: [], error }`**，不抛——诊断收集永远尽力而为。
- `collectStreamDurations(videoPath)`：返回 `{ video: number|null, audio: number|null }`，缺失流为 `null`。ffprobe `-show_entries stream=codec_type,duration -of csv`。
- `writeDiagnosticsBundle({ outputDir, report, videoPath })`：主入口。

### 2. 诊断包内容（`{outputDir}/diagnostics/{ts}/`）

ts = `new Date().toISOString()`，`:`/`.` 替换为 `-`（macOS 友好，秒+毫秒精度，同秒重跑不覆盖）。

| 文件 | 内容 | 用途 |
|---|---|---|
| `summary.txt` | 人类可读总结：FAIL 原因（word 失配 / audioSync / 两者）、逐场景漂移表（含 OK 行）、failed/skipped 场景点名、packet 间隙计数与位置、视频/音频流时长对比 | 用户直接粘贴给 Droid/协作者，无需懂 ffprobe |
| `drift.json` | `report.audioSync` 的 scenes + failedScenes + skippedScenes；无 audioSync 时为 `null` | 机器可读漂移明细 |
| `packet-gaps.json` | 间隙列表 + 计数 + 首尾 pts | 回答"间隙结构复发了吗" |
| `streams.json` | 视频/音频流时长 | 回答"音频又短了吗"（上次 73.4 vs 73.9 即铁证） |
| `verification-report.json` | 报告副本 | 自包含档案 |

### 3. 触发接线（`lib/verify-subtitles.mjs`）

`printSummary` 之后：

```js
if (outputDir && !report.summary.passed) {
  const bundleDir = writeDiagnosticsBundle({ outputDir, report, videoPath });
  if (bundleDir) console.log(`  📦 Diagnostics bundle: ${bundleDir}`);
}
```

- **`writeDiagnosticsBundle` 绝不 throw**：任何单步失败（目录权限、ffprobe 缺失、文件写失败）记录进 `summary.txt` 的 "collection errors" 段并继续/返回 `null`。理由：FAIL 已发生，诊断失败不得掩盖既有退出语义（main.mjs/render-only.mjs 的 `process.exit(1)` 必须保持由 `summary.passed` 驱动）。
- CLI 包装（`verify-subtitles.mjs`）零改动——`outputDir` 已作为第 5 参流入。

### 4. 接口契约（跨 step）

| Step | 产物 | 变更 |
|---|---|---|
| Step 6 验证（改） | `verification-report.json` | **无变更**（形状、路径、写入时机全不动） |
| Step 6 验证（新，仅 FAIL） | `output/{id}/diagnostics/{ts}/` | 新产物，仅 FAIL 时存在；无代码消费者（grep 确认前作报告），人工/Droid 消费 |
| 终端输出（改） | FAIL 块后追加一行 `📦 Diagnostics bundle: <path>` | 正常路径无该行 |
| `verifySubtitles()` 签名 | 对象参数不变 | 零破坏 |
| `verifyAudioSync()` 返回值 | 不变 | 直接消费现有字段 |

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/audio/diagnostics.mjs`（新） | 诊断收集 + 落盘 | Low | 只读验证 + 新目录写入；绝不 throw；PASS 路径不调用 |
| `scripts/short-video/lib/verify-subtitles.mjs`（改） | FAIL 后触发 + 打印路径（约 6 行） | Low | 触发条件 `summary.passed === false && outputDir`；PASS 路径零行为变化 |
| `__tests__/audio-diagnostics.test.mjs`（新） | 解析/收集/落盘/触发 四层测试 | Low | |
| `docs/video-workflow.md`、`docs/spec-audio-diagnostics.md`、`docs/tickets-audio-diagnostics.md` | 文档 | Low | |

### Section 2: Behavioral Scenarios

矩阵每一行 = 一个测试用例。

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 正常渲染 PASS | 不产生 diagnostics 目录，零新字节 | 污染正常产物 | 触发条件 `!summary.passed`；PASS 集成断言 |
| 2 | audioSync 漂移 FAIL（有 outputDir） | 生成诊断包：5 文件齐、summary.txt 含漂移表、路径打印一行 | 包缺文件 | 合成 FAIL report 单测 + 真实 FAIL 集成 |
| 3 | word 失配 FAIL（无 audioSync 数据，如 CLI 4 参） | 无 outputDir → 不落盘、不 crash，终端照旧 | 行为回归 | 触发条件含 outputDir；现状断言（CLI 4 参路径） |
| 4 | word 失配 FAIL + audioSync 也 FAIL | 两者都进 summary.txt 的 FAIL 原因段 | 只报一半 | report 多轴读取 |
| 5 | 终片无音频轨（audioSync errored） | 诊断包仍生成：streams.audio = null、packet-gaps 记 error、summary.txt 见 errored 原因 | 无音轨时包缺失 | 集成测试（lavfi 静默 mp4） |
| 6 | packet pts 行含尾逗号 / 负值 / 空行 | `parsePacketPts` 正确解析，gap 计算不受影响 | 解析崩 | 纯函数测试（实测 `-0.023220,` 样本） |
| 7 | 间隙恰为 0.1s | 不计数（`> 0.1s`，与 packet 检查口径一致） | 阈值闪烁 | 边界测试 0.1 / 0.1001 |
| 8 | 0 个间隙（纯漂移 FAIL） | `packet-gaps.json` 空列表 + 计数 0，包仍生成 | 误判"没证据" | 计数断言 |
| 9 | 10 个间隙 | 全部列出 + 计数 10 + 首个位置可读 | 列表截断丢失信息 | 全量列出（无截断）断言 |
| 10 | ffprobe 失败 / videoPath 损坏 | 各收集函数返回带 error 的结果；包仍写入，错误进 summary.txt；**函数绝不 throw** | 诊断掩盖既有退出码 | 损坏路径直接传参单测 |
| 11 | diagnostics 目录已存在（同秒重跑） | 毫秒级时间戳不同 → 新目录，无覆盖 | 覆盖丢失历史 | ts 含毫秒断言 |
| 12 | 无 audioSync 字段的 report（历史形状） | drift.json = null，不 crash | 前向兼容 | 形状单测 |
| 13 | 诊断包写入中途单文件失败（如权限） | 其余文件照写，错误记录，返回目录路径 | 部分失败 | 单文件失败注入（只读目录 fixture） |
| 14 | CLI 第 5 参（outputDir）传入 + FAIL | 与集成路径同一触发代码，包生成 | 双路径漂移 | CLI 集成一遍（真实 FAIL） |
| 15 | 大视频（74s, 3183 包） | 收集 p 包总耗时 < 2s | 验证过慢 | 真实产物 Runtime Verify 计时 |

## Out of Scope

- 自动修复 / 自动重渲染 / Loop 化失败处理（本 spec 明确服务人工闭环：证据 → 修源头 → 重渲染）。
- 诊断包上传/推送（当前仅本地目录 + 终端路径）。
- "latest" 快捷方式、历史清理策略（保留所有 diagnostics 目录，体积小）。
- 改变任何 PASS 路径产物或验证判据。

## Further Notes

- 设计依据：fail-loud 原则的补完——"红着退出"只完成了一半闭环（阻止发布），诊断包完成另一半（降低定位成本）。两者都服务于 AGENTS.md 的 HITL 纪律：证据交给人工，人工决策修复。
- 上次漂移修复的实际定位过程（手动 packet dump + 流时长对比 + WAV 提取交叉验证）即本包自动化的工作流——本包是那次手工过程的固化。
