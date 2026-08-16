# 02 — audio-sync.test.mjs 新增 .wav fixture 和测试用例

**What to build:** 在现有 `__tests__/audio-sync.test.mjs` 中新增 `.wav` 格式的 fixture 变体，并添加测试用例验证 `resolveSceneAudio` 和 `verifyAudioSync` 在 `.wav`、`.mp3`、两种都存在、两种都不存在四种场景下的行为。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 新增 `makeWavFixture()` — 生成 `.wav` 格式的 scene 音频文件
- [ ] 测试：`.wav` 文件存在时 `verifyAudioSync` 不 skip（场景 1）
- [ ] 测试：`.mp3` 文件存在时不 skip（场景 2，回归保护）
- [ ] 测试：两种格式都存在时优先 `.wav`（场景 3）
- [ ] 测试：两种都不存在时 skip + 报告（场景 4）
- [ ] 测试：`resolveSceneAudio` 边界场景（场景 5、6）
