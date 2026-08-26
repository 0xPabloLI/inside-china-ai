# T2 — timing JSON 格式适配 + runWhisperAlignment 重命名

**What to build:** timing JSON 从数组格式改为对象格式 `{ scenes: [...] }`，所有消费者做向后兼容适配（读取时 `Array.isArray(data) ? data : data.scenes`）。`runWhisperAlignment` 重命名为 `runForcedAlignment`，保留旧名为 alias。

**Parent:** #120

**Blocked by:** T1

**Status:** ready-for-agent

- [x] `text-align.py` 输出格式不改（仍输出数组），格式转换在 Node 侧做
- [x] `regenerateSubtitles` 读取 timing JSON 时做格式适配
- [x] `buildCues` / `collectRawCues` / `expectedWordTimes` / `compareWordSequence` 做格式适配
- [x] `runWhisperAlignment` 重命名为 `runForcedAlignment`，保留 alias
- [x] grep 所有调用点确认更新
- [x] 现有测试通过（verify-subtitles.test.mjs, verify-retry-*.test.mjs）
- [x] 新增测试：旧数组格式仍能被正确读取
- [x] 新增测试：新对象格式能被正确读取
