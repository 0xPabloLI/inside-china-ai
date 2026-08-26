# T1 — 验证现状与基线

**What to build:** 用已有 content 目录（如 `doubao-work`）的真实 TTS 音频和 scene-data，证明当前管线无法检测 scene-data voiceover 被修改但 timing 未重做的场景。记录当前诊断行为作为修复基线。

**Parent:** #120

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 选一个已有 content 目录（如 `doubao-work`），记录其 subtitle-timing.json 与 scene-data voiceover 的基线匹配状态
- [ ] 修改 scene-data voiceover 中的一个词（如 "ByteDance" → "TikTok"），不重做 TTS / text-align.py
- [ ] 运行现有管线（`main.mjs --content <slug> --skip-preflight`），记录是否检测到不匹配
- [ ] 记录当前 `verifySubtitles` / `verify-retry` 的输出（PASS 还是 FAIL，如果 FAIL 是什么类别）
- [ ] 输出基线报告：当前管线在 canonical-text 失配时的行为
