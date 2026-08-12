# 06 — 管线集成 + e2e 验证 + loudnorm

**What to build:** `main.mjs` 和 `render-only.mjs` 加 Remotion 路径检测分支：`content/{dir}/remotion/` 目录存在 → 走 `render-remotion.mjs`，否则走现有 Playwright 路径。在 `_test-fixtures/hook-standard` 下放标记文件触发 Remotion 路径。端到端验证产出通过 `verify-video.mjs`。

**Blocked by:** 05 — Composition + 渲染编排器, 01 — 提取后处理函数

**Status:** ready-for-agent

路径检测逻辑：
```javascript
const remotionDir = join(contentPath, "remotion");
const useRemotion = existsSync(remotionDir);
if (useRemotion) {
  // Remotion 路径
  const result = await renderRemotion({ scenes, audioPaths, durations, outputDir, ... });
} else {
  // Playwright 路径（现有逻辑不动）
  const videoResults = await recordScenes(sceneData, videoDir);
  const result = assembleVideo(videoResults, outputDir, ...);
}
```

- [ ] `main.mjs --content _test-fixtures/hook-standard` 走 Remotion 路径，产出 MP4
- [ ] `main.mjs --content deepseek` 走 Playwright 路径，与当前行为完全一致
- [ ] `render-only.mjs --content _test-fixtures/hook-standard` 走 Remotion 路径（跳过 TTS）
- [ ] `verify-video.mjs` 在 Remotion 输出上全绿（1080×1920, 30fps, 时长一致）
- [ ] `verify-subtitles.mjs` 在 Remotion 输出上字幕时间戳正确
- [ ] scene-data.mjs 的 `texts.stats` 为 `[]` 时不崩
- [ ] scene-data.mjs 的 `texts.bigNumber` 为 `undefined` 时不崩
- [ ] 12 种 CSS keyframe 全有对应 React 组件（全覆盖检查）
- [ ] 同一 content 先 Playwright 再 Remotion，verify-video.mjs 规格结果一致
- [ ] loudnorm 输出 -16 LUFS ±1
- [ ] 22 个场景矩阵行全部覆盖
