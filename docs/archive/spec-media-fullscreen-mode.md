# Spec: Media 字段扩展 — 支持 fullscreen 独立呈现模式

> 来源：`docs/handoffs/media-mode-design.md` + Grill Session 2026-08-13
> 状态：已确认，待实施

## 目标

为 `MediaField` 新增 `mode` 字段，支持两种呈现模式：

- `background`（默认）：图片/视频铺满全屏 + 暗色遮罩 + 文字叠加在 Slot 布局上（现有行为）
- `fullscreen`：图片/视频独立全屏呈现，无文字叠加，仅靠字幕（ASS 烧录）传达内容

## 实现范围

### 1. types.ts — MediaField 加 mode 字段

```ts
export interface MediaField {
  type: "image" | "video";
  path: string;
  mode?: "background" | "fullscreen"; // 新增，默认 "background"
  source?: string;
  animation?: "fade" | "ken-burns" | "slide" | "zoom" | "none";
  overlay?: number;
}
```

### 2. ShortVideo.tsx — renderScene 加 fullscreen 分支

在 switch 前检查 `scene.media?.mode === "fullscreen"`，提前返回 `<FullscreenMedia>`：

```tsx
function renderScene(scene: SceneData, duration: number, contentDir: string) {
  if (scene.media?.mode === "fullscreen") {
    return <FullscreenMedia media={scene.media} duration={duration} />;
  }
  // 正常路径：按 visualType 分发
  switch (scene.visualType) { ... }
}
```

### 3. 新组件 FullscreenMedia.tsx

- 只渲染 `MediaBackground`（overlay 强制 0）+ 可选 SOURCE 标签
- 不渲染 Slot / BrandBar / GridBg / 文字
- 字幕由 ASS 文件烧录（不在组件内）

### 4. MediaBackground.tsx — 两处改动

- `contentDir` 改为 optional（`contentDir?: string`）— 当前已未使用，清理类型
- overlay 计算加 mode 判断：`media.mode === "fullscreen" ? 0 : (media.overlay ?? 0.7)`

### 5. media-bg.mjs — validateMedia 加 mode 验证规则

- `mode: "fullscreen"` + `texts` 有内容 → warn（texts 被忽略）
- `mode` 值非 `"background" | "fullscreen"` → warn（走默认 background）

### 不改的部分

- `verify-video.mjs` — 无需直接修改（已调用 `validateMedia`）
- `lib/media-bg.mjs` 的 `mediaLayer` 函数 — Playwright 渲染路径，fullscreen 模式由 Remotion 处理
- TTS / 字幕 / loudnorm — fullscreen 场景照常 TTS + 烧字幕

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件                                          | 修改内容                                               | 风险等级 | 评估                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `remotion/src/types.ts`                       | 加 `mode?: "background" \| "fullscreen"` 到 MediaField | Low      | 纯追加 optional 字段，现有消费方不受影响                                                                 |
| `remotion/src/ShortVideo.tsx`                 | renderScene 加 fullscreen 提前返回分支                 | Medium   | 修改核心渲染分发函数。但 `mode === "fullscreen"` 只在显式设置时触发，现有场景 mode 为 undefined 不受影响 |
| `remotion/src/scenes/FullscreenMedia.tsx`     | 新组件                                                 | Low      | 纯新文件                                                                                                 |
| `remotion/src/components/MediaBackground.tsx` | contentDir 改 optional + overlay 加 mode 判断          | Medium   | contentDir 已未使用，改 optional 无风险。overlay 加 mode 判断在 mode=undefined 时走原逻辑                |
| `lib/media-bg.mjs`                            | validateMedia 加 mode 验证规则                         | Low      | 纯追加验证逻辑，不修改现有规则                                                                           |

### Section 2: Behavioral Scenarios

| #   | Scenario                                          | Expected Behavior                                                         | Risk   | Mitigation                                     |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| 1   | `mode` 未设置（undefined）                        | 走 background 模式，现有行为不变                                          | Low    | `mode === "fullscreen"` 检查，undefined 不匹配 |
| 2   | `mode: "background"` 显式设置                     | 走 background 模式                                                        | Low    | 同上                                           |
| 3   | `mode: "fullscreen"` + video                      | 只渲染 MediaBackground（overlay=0）+ source 标签，跳过 Slot/BrandBar/文字 | Medium | renderScene 提前返回 FullscreenMedia           |
| 4   | `mode: "fullscreen"` + image                      | 同 #3 但 type=image                                                       | Low    | MediaBackground 已支持 image                   |
| 5   | `mode: "fullscreen"` + 有 texts                   | validateMedia warn（texts 被忽略）                                        | Low    | validateMedia 加规则                           |
| 6   | `mode: "fullscreen"` + overlay 有值               | overlay 强制 0，忽略用户设的值                                            | Low    | MediaBackground mode 判断                      |
| 7   | `mode: "fullscreen"` + 无 source                  | 不渲染 SOURCE 标签                                                        | Low    | FullscreenMedia 条件渲染                       |
| 8   | `mode: "fullscreen"` + animation                  | 动画正常播放                                                              | Low    | 动画逻辑不依赖 mode                            |
| 9   | 混合视频：scene A background + scene B fullscreen | 每场景独立渲染，transition 正常                                           | Medium | TransitionSeries 每序列独立                    |
| 10  | `mode: "invalid"`                                 | validateMedia warn，渲染走 background 默认                                | Low    | 非 "fullscreen" 都走原路径                     |
| 11  | `mode: "fullscreen"` + 无 media.path              | validateMedia error（path required）                                      | Low    | 现有 path 检查覆盖                             |
