# Spec: Subtitle Verification System

> **Status**: Approved — 2026-08-05
> **Source**: handoff-2026-08-05.md Items 5 & 6
> **Workflow**: Grill → Spec → Tickets → TDD → Review → Verify → Commit

## 1. Problem

Pipeline 产出的视频字幕同步质量无自动化验证。当前 `verify-subtitles.mjs` 有语法 bug（`toFixed(1f)`），未集成到 pipeline，且缺少音频级同步对比。

## 2. Solution

构建 **Subtitle Verification System** — 纯 Node.js/FFmpeg 模块，集成到 pipeline 末端，输出 JSON 报告 + console summary。

### 架构

```
main.mjs Step 5: assembleVideo() → final.mp4
                ↓
main.mjs Step 6: verifySubtitles() → verification-report.json + console summary
```

### 模块结构

```
scripts/short-video/
├── lib/
│   └── verify-subtitles.mjs    ← 核心模块（纯函数 + FFmpeg 调用）
├── verify-subtitles.mjs         ← CLI wrapper（thin, 调用 lib 模块）
├── __tests__/
│   └── verify-subtitles.test.mjs ← 单元测试
└── main.mjs                     ← 集成点（Step 6）
```

### 导出 API

```typescript
// lib/verify-subtitles.mjs

// 纯函数 — 不依赖外部进程
analyzeCoverage(subtitles: Sub[], videoDuration: number): CoverageResult
analyzeDurations(subtitles: Sub[]): DurationResult
compareSync(subtitles: Sub[], silenceSegments: Silence[]): SyncResult
generateReport(subtitles: Sub[], videoDuration: number, silenceSegments: Silence[]): Report

// FFmpeg 依赖函数
detectSilence(videoPath: string): Promise<Silence[]>

// 主入口（组合所有检查 + 写 JSON）
verifySubtitles(videoPath: string, timingData: TimingData[], sceneDurations: SceneDur[]): Promise<Report>
```

### 检查维度

| # | 检查项 | 方法 | 阈值 |
|---|--------|------|------|
| 1 | 覆盖率间隙 | 字幕时间戳 → 视频时长，找 >1.0s 空隙 | gap > 1.0s = ❌ |
| 2 | 末尾覆盖 | 最后字幕 end vs 视频时长 | diff > 1.0s = ❌ |
| 3 | 字幕时长 | 每条字幕 end - start | < 0.5s = ⚠️ |
| 4 | 音频静默对比 | FFmpeg silencedetect vs 字幕空隙 | silence gap 无对应字幕空隙 = ⚠️ |
| 5 | 同步偏差 | 字幕 start vs silence 段边界 | deviation > 0.5s = ⚠️ |

### 报告格式

```json
{
  "videoPath": "output/deepseek/deepseek-short.mp4",
  "videoDuration": 45.2,
  "totalSubtitles": 32,
  "coverage": {
    "percent": 94.5,
    "gaps": [{ "from": 10.3, "to": 12.1, "duration": 1.8 }]
  },
  "durations": {
    "tooShort": [{ "sceneId": 3, "duration": 0.3, "text": "..." }]
  },
  "sync": {
    "silenceSegments": [{ "start": 5.2, "end": 6.1 }],
    "deviations": [{ "subtitleStart": 5.5, "silenceStart": 5.2, "delta": 0.3 }]
  },
  "summary": {
    "totalIssues": 2,
    "passed": false
  }
}
```

### 集成方式

- `main.mjs` Step 5 之后自动运行
- `--skip-verify` flag 跳过
- 报告写入 `output/{pipelineId}/verification-report.json`
- 验证失败不阻止 pipeline 完成（warn-only）
- 无 `subtitle-timing.json` 时跳过验证 + warning

---

## 3. Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/verify-subtitles.mjs` | 重写为 CLI wrapper，委托给 lib 模块 | Medium | 原脚本有语法 bug 无法运行，无下游消费者。重写后保持 CLI 接口不变（3 参数），新增 JSON 输出。验证：独立 CLI 运行测试。 |
| `scripts/short-video/main.mjs` | 在 Step 5 后新增 Step 6 verify 调用 | Low | 纯追加，不修改现有 Step 1-5 逻辑。`--skip-verify` 提供退出路径。验证：现有 pipeline 步骤不受影响。 |
| `scripts/short-video/lib/verify-subtitles.mjs` | 新建 | Low | 新文件，无现有消费者。纯函数可独立测试。 |
| `scripts/short-video/__tests__/verify-subtitles.test.mjs` | 新建 | Low | 新测试文件，不影响现有测试。 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Pipeline 正常运行，有 timing data | Step 6 自动运行，生成 verification-report.json + console summary | Low | 纯追加步骤，失败不阻止 pipeline |
| 2 | Pipeline 运行，无 subtitle-timing.json | 跳过验证，console 打印 warning | Low | existsSync 检查已有模式（main.mjs Step 4 同款） |
| 3 | `--skip-verify` flag | 完全跳过 Step 6 | Low | process.argv.includes 检查，与 `--bgm` 同模式 |
| 4 | timing data 为空数组 | 报告 coverage 0%，无 crash | Medium | 空数组边界：subtitles=[] → gaps=[], coverage=0%, lastSub=undefined → 分支处理 |
| 5 | 视频比最后字幕短 | gap 检查正常（无末尾 gap） | Low | videoDuration < lastSub.end 时，prevEnd=max 不产生负 gap |
| 6 | silencedetect 无静默段 | sync.deviations=[], silenceSegments=[] | Low | 空数组处理 |
| 7 | 字幕 duration < 0.5s | flagged in tooShort 列表 | Low | 纯过滤逻辑 |
| 8 | 字幕间隙 > 1.0s | flagged in gaps 列表 | Low | 纯比较逻辑 |
| 9 | CLI 独立运行（3 参数齐全） | 与集成模式行为一致 | Low | CLI wrapper 委托同一 lib 函数 |
| 10 | CLI 独立运行（参数缺失） | 打印 usage，exit 1 | Low | argv 检查 |
| 11 | FFmpeg silencedetect 输出格式异常 | 解析容错，跳过异常行 | Medium | 正则匹配 `silence_start:` / `silence_end:`，不匹配的行忽略 |
| 12 | ffprobe 获取视频时长失败 | 用 fallback duration（sum of sceneDurations） | Medium | try/catch + fallback 计算 |

---

## 4. Implementation Notes

### silencedetect 解析

FFmpeg silencedetect 输出格式：
```
[silencedetect @ 0x...] silence_start: 5.2
[silencedetect @ 0x...] silence_end: 6.1 | silence_duration: 0.9
```

正则匹配：
- `silence_start: ([\d.]+)` → start
- `silence_end: ([\d.]+)` → end

### 字幕绝对时间戳计算

与 `generate-srt.mjs` 保持一致的逻辑：
```
sceneOffset = 0
for each scene:
  for each segment:
    startAbs = sceneOffset + seg.start + START_OFFSET (-0.3)
    endAbs = sceneOffset + min(seg.end, sceneDur)
  sceneOffset += sceneDur + 0.5  // 0.5s buffer
```

### Sync 对比逻辑

静默段 = 音频中无人说话的区间。字幕空隙 = 两条字幕之间的间隔。

理想状态：每个静默段对应一个字幕空隙。

偏差计算：
- 对每个字幕 start，找最近的 silence_start
- delta = |subtitleStart - silenceStart|
- delta > 0.5s = deviation

---

## 5. Test Coverage Plan

| 场景矩阵行 | 测试名 | 类型 |
|------------|--------|------|
| #1 | pipeline integration (manual) | 集成 |
| #4 | analyzeCoverage with empty subtitles | 单元 |
| #5 | analyzeCoverage with video shorter than last sub | 单元 |
| #7 | analyzeDurations flags < 0.5s | 单元 |
| #8 | analyzeCoverage flags > 1.0s gap | 单元 |
| #6 | compareSync with no silence segments | 单元 |
| #11 | detectSilence parses valid/invalid lines | 单元 |
| #12 | verifySubtitles with ffprobe failure | 单元 |
| #9, #10 | CLI wrapper arg handling | 单元 |
| #2, #3 | main.mjs skip/no-timing (manual) | 集成 |
