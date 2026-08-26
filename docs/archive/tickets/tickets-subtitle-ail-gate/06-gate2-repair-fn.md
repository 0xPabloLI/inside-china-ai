# T6 — 门 2 补全 subtitle-alignment repairFn

**What to build:** 在 `main.mjs` 第 453 行，把 `subtitle-alignment` 的 `{ success: false }` 替换为真实修复：重做 `text-align.py` → 重新生成 ASS → 重新烧录 → 返回更新后的 videoPath 和 assPath。

**Parent:** #120

**Blocked by:** T5

**Status:** ready-for-agent

- [x] `main.mjs` `repairFn` 中 `subtitle-alignment` 分支替换为：
  1. 调用 `runForcedAlignment()` 重做 text-align.py
  2. 调用 `regenerateSubtitles()` 重新生成 ASS
  3. 调用 `findBaseAndBurn()` 重新烧录
  4. 返回 `{ success: true, videoPath, assPath }`
- [x] text-align.py 报错时返回 `{ success: false }`
- [x] 两条渲染路径（Remotion / FFmpeg）的 base file 查找逻辑正确
- [x] 测试：渲染后 subtitle-alignment 失败 → 重做对齐 + 重生成 ASS + 重烧录 → 重验 PASS
- [x] 测试：重做对齐报错 → `{ success: false }` → verify-retry 继续/最终硬失败
- [x] 测试：修复后旧成片被替换（新 videoPath 验证）
