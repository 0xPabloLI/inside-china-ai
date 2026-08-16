# 03 — sensetime-latest scene-data RMB→USD 双标注改造 + video-workflow.md 规则

**What to build:** 修改 `content/sensetime-latest/scene-data.mjs` 中所有面向观众的金额文本为 `$X (¥Y)` 双标注格式。在 `docs/video-workflow.md` 的 "Agent-assisted at scene-data creation time" 表中新增货币标注规则。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `voiceover` 中所有 "X billion RMB" / "X million RMB" 改为 "$X (¥Y B)" 格式
- [ ] `hookText` "5 BILLION RMB" → "$700M (¥5B)"
- [ ] `result` "3.6B RMB" → "$500M (¥3.6B)"
- [ ] `context` "380M RMB H2 EBITDA + 10.9B CASH RESERVES" → "$53M (¥380M) H2 EBITDA + $1.5B (¥10.9B) CASH RESERVES"
- [ ] `meta.mjs` title 保留原始 RMB（不面向视频观众）
- [ ] `docs/video-workflow.md` 新增货币标注规则行
- [ ] 场景 7-13（spec 矩阵）人工验证
