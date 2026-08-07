# Tickets: 验证失败诊断包

> Spec: `docs/spec-audio-diagnostics.md`
> 依赖顺序执行，每张票独立可验证。

---

# 01 — 诊断模块（`lib/audio/diagnostics.mjs`）

**What to build:** 诊断收集 + 落盘的独立模块，绝不 throw，PASS 路径不参与。

**Blocked by:** None

**Status:** done

- [x] `parsePacketPts(lines)`：纯函数，容尾逗号 / 负 pts / 空行 / 空输入
- [x] `findGaps(pts, minGapSeconds)`：纯函数，`> 0.1s` 阈值，边界 0.1 不计数，间隙全量列出
- [x] `collectPacketGaps(videoPath)`：ffprobe 音频包 pts → `{packets, firstPts, lastPts, gaps, error?}`，失败不抛
- [x] `collectStreamDurations(videoPath)`：`{video: number|null, audio: number|null}`，缺失流为 null
- [x] `writeDiagnosticsBundle({outputDir, report, videoPath})`：`diagnostics/{ts}/` 五文件（summary.txt / drift.json / packet-gaps.json / streams.json / verification-report.json 副本）
- [x] 单测试：parsePacketPts 样本（含实测 `-0.023220,`）/ findGaps 边界与 10 间隙全列 / 无 audioSync 时 drift.json=null / 损坏路径不抛 / EISDIR 注入部分失败 / 同秒重跑不覆盖
- [x] （审查后）`PACKET_GAP_THRESHOLD` 导出常量（summary 标题派生）+ `runFfprobeCsv` 共享桥 + `writeDiagnosticsBundle` 消费 write 错误并打印

---

# 02 — 触发接线 + 集成测试 + 文档

**What to build:** `verifySubtitles()` FAIL 后触发落盘并打印路径；真实 FAIL/PASS 双路径证据。

**Blocked by:** 01

**Status:** done

- [x] `lib/verify-subtitles.mjs`：`printSummary` 后 `if (outputDir && !summary.passed)` → 写包 + 打印 `📦 Diagnostics bundle: <path>`
- [x] 集成测试：真实 FAIL（静默 mp4 + 失配 ass）→ 包生成；无 outputDir → 不落盘不 crash
- [x] （审查后）PASS 零写 CI 断言（硬规则行 1：PASS 后 readdir 断言仅既有文件）+ 纯漂移 FAIL 活路径集成（行 2：谎报时长装配 → 包含 scene 2 +200ms）
- [x] Runtime Verify：重建旧式间隙结构产物 → FAIL + 包（10 场景 OFF、累积至 -4668ms、10 个 ~490ms 间隙、音频流短 0.487s，即上次手工证据链的自动复刻）；真实新产物 v00-32-54 → PASS 2s 零写
- [x] 文档：video-workflow.md 增"Failure diagnostics"小节 + 文件树
- [x] 全绿门禁：vitest 695 / eslint / tsc / build
