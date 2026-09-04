# Handoff: Media 字段扩展 — 支持 fullscreen 独立呈现模式

> 来源：Session 2026-08-12
> 状态：设计草案，待新 session 讨论 + 实施

## 背景

当前 `MediaBackground` 组件只支持 `background` 模式——图片/视频铺满全屏 + 暗色遮罩 + 文字叠加在 Slot 布局上。用户需要一种新模式：图片/视频独立全屏呈现，无文字叠加，仅靠字幕（ASS 烧录）传达内容。

## 当前 media 字段

```js
// scene-data.mjs
media: {
  type: "video",           // "image" | "video"
  path: "assets/xxx.mp4",  // 相对于 remotion/public/
  source: "Unitree",       // 来源标注
  animation: "fade",       // "fade" | "ken-burns" | "slide" | "zoom" | "none"
  overlay: 0.7,            // 遮罩透明度 (0-1)
}
```

## 设计：新增 mode 字段

```js
media: {
  type: "video",
  path: "assets/xxx.mp4",
  mode: "background",  // 新增，默认 "background"
                       // "background" = 背景+文字叠加（现有行为）
                       // "fullscreen" = 全屏独立呈现，跳过 Slot 文字，只有视频+字幕
  source: "Unitree",
  animation: "fade",
  overlay: 0.7,        // mode=background 时有效；fullscreen 时忽略
}
```

## 实现范围

### 1. types.ts — MediaField 类型加 mode

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

### 2. ShortVideo.tsx — renderScene 里检查 mode

当 `scene.media?.mode === "fullscreen"` 时，只渲染 MediaBackground，跳过 Slot 布局的文字：

```tsx
function renderScene(scene: SceneData, duration: number, contentDir: string) {
  // fullscreen 模式：只渲染媒体+背景层，跳过文字 Slot
  if (scene.media?.mode === "fullscreen") {
    return <FullscreenMedia media={scene.media} duration={duration} />;
  }
  // 正常路径：按 visualType 分发
  switch (scene.visualType) { ... }
}
```

### 3. 新组件：FullscreenMedia.tsx

```tsx
// 全屏媒体呈现 — 只有图片/视频 + 可选来源标注
// 不渲染 Slot 布局、不渲染 BrandBar、不渲染文字
// 字幕由 ASS 文件烧录（不在组件内）
export const FullscreenMedia: React.FC<{
  media: MediaField;
  duration: number;
}> = ({ media, duration }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14" }}>
      <MediaBackground media={media} duration={duration} contentDir="" />
      {/* 无遮罩 — fullscreen 模式下 overlay 强制为 0 */}
      {/* 可选：左下角来源标注 */}
      {media.source && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 60,
            fontSize: 20,
            color: "rgba(203,213,225,0.6)",
            letterSpacing: "2px",
          }}
        >
          SOURCE: {media.source}
        </div>
      )}
    </AbsoluteFill>
  );
};
```

### 4. MediaBackground.tsx — fullscreen 模式时 overlay 强制 0

```tsx
// 在 MediaBackground 里：
const overlay = media.mode === "fullscreen" ? 0 : (media.overlay ?? 0.7);
```

### 5. scene-data.mjs 使用示例

```js
// 传统背景模式（文字叠加）
{
  visualType: "narrative",
  media: {
    type: "video",
    path: "assets/unitree-demo.mp4",
    mode: "background",  // 或省略，默认 background
    overlay: 0.7,
    animation: "fade",
  },
  texts: { company: "UNITREE", result: "$9B" },
}

// 全屏独立呈现（无文字，只有视频+字幕）
{
  visualType: "narrative",  // visualType 保留但不影响渲染
  media: {
    type: "video",
    path: "assets/unitree-demo.mp4",
    mode: "fullscreen",
    animation: "fade",
    source: "Unitree Robotics",
  },
  texts: {},  // 空 — fullscreen 模式不渲染文字
  voiceover: "Unitree's humanoid robot demonstrates...",  // TTS + 字幕照常
}
```

### 6. verify-video.mjs — 检查 fullscreen 模式规则

- `mode: "fullscreen"` 时 `texts` 必须为空（或仅含 voiceover）
- `mode: "fullscreen"` 时 `overlay` 可省略
- `mode: "fullscreen"` 时 `visualType` 不限制（不用于渲染）

## 影响面

| 文件                                           | 改动                             |
| ---------------------------------------------- | -------------------------------- |
| `remotion/src/types.ts`                        | 加 `mode` 字段                   |
| `remotion/src/ShortVideo.tsx`                  | renderScene 里加 fullscreen 分支 |
| `remotion/src/scenes/FullscreenMedia.tsx`      | 新组件                           |
| `remotion/src/components/MediaBackground.tsx`  | overlay 强制 0 when fullscreen   |
| `scripts/short-video/verify-video.mjs`         | 加 fullscreen 规则检查           |
| `scripts/short-video/content/*/scene-data.mjs` | 可选：现有 media 加 mode 字段    |

## 不改的部分

- Playwright 路径的 `lib/media-bg.mjs` 不改（Playwright 走自己的渲染）
- TTS / 字幕 / loudnorm 不改（fullscreen 场景照常 TTS + 烧字幕）
