# 01 — 提取后处理函数（burnSubtitles/mixBgm/normalizeLoudness）

**What to build:** 从 `assemble.mjs` 提取字幕烧录、BGM 混音、响度标准化三个纯函数到 `lib/post-process.mjs`。`assemble.mjs` 改为调用这些函数，Playwright 路径输出完全不变。这是 prefactor，让 Remotion 路径和 Playwright 路径共用同一套后处理逻辑。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `lib/post-process.mjs` 导出 `burnSubtitles(videoPath, assPath, outputPath)`、`mixBgm(videoPath, bgmPath, outputPath, volume=0.12)`、`normalizeLoudness(videoPath, outputPath, target=-16)` 三个纯函数
- [ ] `assemble.mjs` 的字幕烧录段改为调用 `burnSubtitles()`
- [ ] `assemble.mjs` 的 BGM 混音段改为调用 `mixBgm()`
- [ ] `normalizeLoudness()` 在两条路径（Playwright + Remotion）的最终 MP4 上都调用
- [ ] Playwright 路径 `main.mjs --content deepseek` 输出与重构前 ffprobe 规格一致（分辨率/帧率/时长/音轨数）
- [ ] 现有测试 `__tests__/` 全绿（assemble 相关测试不 break）
