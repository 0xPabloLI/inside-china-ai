# T5 — canonical-text 修复策略 + verify-retry 集成

**What to build:** 新增 canonical-text 修复策略到 `verify-retry.mjs`：重做 `text-align.py` 强制对齐 → 重新生成 ASS → 重验。最多重做 1 次。重做后仍 FAIL 则硬失败。每次 spawn 新 Python 进程。

**Parent:** #120

**Blocked by:** T3

**Status:** ready-for-agent

- [x] 在 `verify-retry.mjs` 新增 `canonical-text-mismatch` 失败分类
- [x] 修复策略：调用 `runForcedAlignment()` 重做 text-align.py → 重新生成 ASS → 重验
- [x] 最多重做 1 次
- [x] 重做后 PASS → 继续管线
- [x] 重做后仍 FAIL → 硬失败
- [x] 不自动触发 TTS 重做
- [x] 成功条件：100% 序列匹配，不接受"错误总数下降"
- [x] 测试：canonical-text 失配 → 重做对齐 → PASS → 管线继续
- [x] 测试：canonical-text 失配 → 重做对齐 → 仍 FAIL → 硬失败
- [x] 测试：重做 text-align.py 报错 → 返回 `{ success: false }`
