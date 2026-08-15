# Tickets: Media fullscreen mode

> 来源 spec: `docs/archive/spec-media-fullscreen-mode.md`

## T-1: types.ts + MediaBackground.tsx — 类型 + overlay 逻辑
- **依赖**: 无
- **范围**:
  1. `types.ts`: MediaField 加 `mode?: "background" | "fullscreen"`
  2. `MediaBackground.tsx`: `contentDir` 改 optional + overlay 加 `mode === "fullscreen" ? 0 : ...`
- **测试**: media-bg.test.mjs 加 mode 相关 validateMedia 测试（场景 #1,2,5,6,10,11）

## T-2: validateMedia — mode 验证规则
- **依赖**: 无（与 T-1 并行）
- **范围**:
  1. `lib/media-bg.mjs` 的 `validateMedia` 加:
     - `mode: "fullscreen"` + texts 有内容 → warn
     - `mode` 值非 `"background" | "fullscreen"` → warn
- **测试**: media-bg.test.mjs 加 validateMedia mode 测试（场景 #5,10）

## T-3: FullscreenMedia.tsx — 新组件
- **依赖**: T-1（需要 MediaField.mode 类型）
- **范围**:
  1. 新建 `remotion/src/scenes/FullscreenMedia.tsx`
  2. 渲染 MediaBackground + 可选 SOURCE 标签
- **测试**: 无单元测试（React 组件，靠 tsc 类型检查 + 运行时渲染验证）

## T-4: ShortVideo.tsx — renderScene 分支
- **依赖**: T-1（类型）+ T-3（组件）
- **范围**:
  1. `renderScene` 开头加 `if (scene.media?.mode === "fullscreen") return <FullscreenMedia .../>`
  2. import FullscreenMedia
- **测试**: 无单元测试（靠 tsc + 运行时渲染验证）
