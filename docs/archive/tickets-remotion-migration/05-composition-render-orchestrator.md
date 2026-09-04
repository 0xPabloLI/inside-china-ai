# 05 — Composition + 渲染编排器（ShortVideo.tsx + render-remotion.mjs）

**What to build:** Remotion 主 Composition（接收 props → 按 visualType 分发场景 → `<Audio>` 放 TTS → `<TransitionSeries>` 排列场景）和 Node.js 渲染编排脚本（构造 props → 检测 node_modules → 调 `npx remotion render` → 输出 MP4 → 调后处理函数）。

**Blocked by:** 04 — 场景组件 + MediaBackground

**Status:** ready-for-agent

`ShortVideo.tsx`：

- 接收 props: `{ scenes: SceneData[], audioPaths: string[], durations: number[] }`
- 用 `<TransitionSeries>` 排列场景，hook 场景硬切（无 transition in），其他场景 6 帧 fade
- 每个场景放 `<Audio src={staticFile(audioPath)} />`，`durationInFrames` 从 `sceneClipFrames(duration)` 计算
- 按 `scene.visualType` 分发：`"hook"` → `<HookScene>`，`"cta"` → `<CtaScene>`，其他 → 对应组件
- 总 `durationInFrames` = Σ `sceneClipFrames(duration)`

`Root.tsx`：

- 注册 `<Composition id="ShortVideo" component={ShortVideo} durationInFrames={...} fps={30} width={1080} height={1920} />`

`render-remotion.mjs`（`scripts/short-video/lib/render-remotion.mjs`）：

- 输入：scenes, audioPaths, durations, outputDir, pipelineId, subtitlesPath?, bgmPath?
- 检测 `remotion/node_modules` 不存在 → `execSync('npm install', { cwd: remotionDir })`
- 构造 props JSON → 写入 `remotion/props.json`
- `execSync('npx remotion render src/Root.tsx ShortVideo output.mp4 --props=props.json', { cwd: remotionDir })`
- 输出 MP4 后调 `burnSubtitles()` → `mixBgm()` → `normalizeLoudness()`
- 返回 `{ path: finalPath, duration: finalDuration }`

- [ ] `ShortVideo.tsx` 在 Studio 中渲染 `_test-fixtures/hook-standard` 3 场景，总时长 = Σ sceneClipDuration
- [ ] `<Audio>` 正确放置每场景 TTS 音频，静音间隙自然产生
- [ ] `<TransitionSeries>` hook 场景首帧有内容（无黑帧），其他场景 fade in
- [ ] `render-remotion.mjs` 从 TTS 音频 + scene-data 产出完整 MP4（1080×1920, 30fps, 有音轨）
- [ ] 首次运行自动 `npm install`
- [ ] ASS 字幕烧录时间戳与 `sceneTimeline()` 一致
- [ ] `--bgm` 时 BGM 混音正常（12% 音量，即时开始，3s fade out）
- [ ] loudnorm 输出 -16 LUFS ±1
- [ ] `renderMedia()` 失败时报错退出，不产出半成品
