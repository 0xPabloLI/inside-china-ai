# Tickets: Subtitle Verification System

> **Spec**: `docs/specs/spec-subtitle-verification.md`
> **Strategy**: Tracer-bullet — each ticket delivers testable value

## Dependency Graph

```
T1 (pure functions) ──→ T3 (integration)
         ↑                    ↑
T2 (FFmpeg funcs) ─────┘      │
                              ↓
                    T4 (CLI wrapper)
                              ↓
                    T5 (main.mjs Step 6)
```

---

## T1: Pure analysis functions + unit tests

**Status**: TODO
**Depends on**: nothing

### Deliverables
- `scripts/short-video/lib/verify-subtitles.mjs` — 纯函数部分:
  - `analyzeCoverage(subtitles, videoDuration)` → { percent, gaps[] }
  - `analyzeDurations(subtitles)` → { tooShort[] }
  - `compareSync(subtitles, silenceSegments)` → { deviations[] }
  - `generateReport(subtitles, videoDuration, silenceSegments)` → report object
  - `computeAbsoluteTimestamps(timingData, sceneDurations)` → subtitles[] (shared helper)
- `scripts/short-video/__tests__/verify-subtitles.test.mjs` — 覆盖场景矩阵 #4, #5, #6, #7, #8

### Acceptance
- `npx vitest run __tests__/verify-subtitles.test.mjs` 全绿
- 纯函数不依赖 FFmpeg/文件系统

---

## T2: FFmpeg-dependent functions + unit tests

**Status**: TODO
**Depends on**: nothing (可与 T1 并行)

### Deliverables
- `scripts/short-video/lib/verify-subtitles.mjs` — FFmpeg 部分:
  - `detectSilence(videoPath)` → silenceSegments[] (解析 silencedetect 输出)
  - `getVideoDuration(videoPath)` → number (ffprobe, fallback)
- 测试覆盖场景矩阵 #11, #12
  - Mock execSync 输出测试 silencedetect 解析
  - 测试 ffprobe 失败时 fallback

### Acceptance
- `npx vitest run __tests__/verify-subtitles.test.mjs` 全绿
- silencedetect 输出解析容错（跳过不匹配的行）

---

## T3: verifySubtitles main entry + JSON report

**Status**: TODO
**Depends on**: T1 + T2

### Deliverables
- `scripts/short-video/lib/verify-subtitles.mjs` — 组合函数:
  - `verifySubtitles(videoPath, timingData, sceneDurations)` → report
  - 写 JSON 报告到 `output/{pipelineId}/verification-report.json`
  - console summary（✅/❌ + 关键指标）

### Acceptance
- 函数可被 import 调用
- JSON 报告格式符合 spec
- console summary 可读

---

## T4: CLI wrapper rewrite

**Status**: TODO
**Depends on**: T3

### Deliverables
- `scripts/short-video/verify-subtitles.mjs` — 重写为 thin CLI:
  - 解析 argv（3 参数）
  - 调用 `lib/verify-subtitles.mjs` 的 `verifySubtitles`
  - 打印 console summary
  - exit code = issue count > 0 ? 1 : 0

### Acceptance
- 场景矩阵 #9, #10 覆盖
- `node verify-subtitles.mjs` 无参数 → usage + exit 1
- 原 `toFixed(1f)` bug 消除

---

## T5: main.mjs integration

**Status**: TODO
**Depends on**: T3 + T4

### Deliverables
- `scripts/short-video/main.mjs` — 新增 Step 6:
  - `--skip-verify` flag 检查
  - 无 subtitle-timing.json → warning + skip
  - 调用 `verifySubtitles()` → 报告 + console summary
  - 失败不阻止 pipeline

### Acceptance
- 场景矩阵 #1, #2, #3 覆盖
- 现有 Step 1-5 不受影响
