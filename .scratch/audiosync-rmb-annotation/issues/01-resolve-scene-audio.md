# 01 — resolveSceneAudio helper + sync.mjs 文件名探测修复

**What to build:** `lib/audio/sync.mjs` 新增 `resolveSceneAudio(audioDir, sceneId)` helper 函数，按优先级探测 `.wav` → `.mp3`，返回第一个存在的文件路径或 `null`。`verifyAudioSync()` 内部从硬编码 `scene-{id}.mp3` 改为调用此 helper。顶部添加注释说明 TTS 引擎输出格式。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `resolveSceneAudio(audioDir, sceneId)` 导出，按 `.wav` → `.mp3` 优先级探测
- [ ] `verifyAudioSync()` 内使用 `resolveSceneAudio()` 替代硬编码路径
- [ ] `.wav` 不存在但 `.mp3` 存在时，使用 `.mp3`（向后兼容）
- [ ] 两种都不存在时，skip 该 scene 并报告 `skippedScenes`
- [ ] 顶部注释列出 TTS 引擎输出格式清单
- [ ] 测试覆盖场景 1-6（spec 矩阵）
