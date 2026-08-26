# Handoff: Framed Contain Composition for Landscape Images

## Context

### 已完成的前置工作

竖屏裁切管线（Vertical Cropping Pipeline）已实现并推送（commit `6e591b3` + `3394871`，Issue #119 已关闭）。核心功能：

- `crop-decision.mjs` — 纯函数 `resolveObjectPosition` / `evaluateCropSafety` / `selectBestCrop`
- `vlm_analyzer.py` — `simulate_crop()` + EXIF 归一化修复
- `MediaBackground.tsx` — `cropFocus: {x, y}` 字段，优先级高于 deprecated `focus` enum
- `asset-sourcer.mjs` — Phase 3b：调用 `selectBestCrop`，当 `status === "unsafe"` 时设 `asset.fit = "contain"`
- 185 个测试全绿

### 本次要解决的问题

当 `selectBestCrop` 返回 `status: "unsafe"`（即 9:16 cover 裁切无法保留所有保护区域），`asset-sourcer.mjs` 设 `fit = "contain"`。但 `MediaBackground.tsx` 渲染 `contain` 时只是朴素的 letterbox——图片居中缩放，上下/左右留黑，背景色 `#0a0a14`。

这在 TikTok 上观感很差：大面积黑色 dead space 没有品牌感，用户看到的是"图片放不下的补救"而不是"有意设计的构图"。

Review（`docs/reviews/handoff-vertical-cropping-pipeline-review-2026-08-26.md`）Finding #4 明确要求：bare `contain` 需要有意图的 frame，不是朴素黑底。验收矩阵 VC-08 要求"quiet brand matte or restrained palette-derived gradient frames the complete, unblurred source"。

## What to Build

### 范围

在 `MediaBackground.tsx` 中，当 `media.fit === "contain"` 时，在 `<CanvasImage>` / `<Video>` 下面增加一层**品牌背景层**，取代当前的朴素黑底。

**三层结构**（从底到顶）：

1. **Matte 层**（`AbsoluteFill`）— 品牌色 `#0a0a14` 填充（已有行为，保持不变）
2. **Contain 媒体层**（`CanvasImage` / `Video`）— `objectFit: "contain"`，居中缩放，保留完整内容
3. **Overlay 层**（已有）— `rgba(10, 10, 20, overlayOpacity)` 文字可读性叠加

**关键改动**：当 `fit === "contain"` 时，Matte 层从纯色升级为**品牌渐变背景**。

### 品牌渐变方案

Review 说"quiet brand matte or restrained palette-derived gradient"。推荐方案：

**方案 A（推荐）：品牌色径向渐变**
- 中心 `#0a0a14` → 边缘更深 `#050508`
- 添加微弱的品牌 accent 色辉光（如 `rgba(99, 102, 241, 0.05)` — indigo 微光）
- 效果：深色但有层次感，不抢前景

**方案 B：从图片采样的 palette gradient**
- 需要在 Python 端提取图片主色（`PIL.Image.getcolors` → 取 top-3 颜色）
- 写入 `asset-analysis.json` 的 `cropDecision` 或新字段 `palette`
- 渲染时用这些颜色做 gradient
- 更复杂但更"内容感知"

**建议先做方案 A**（纯 CSS，不需要 Python 端改动），验证效果后再考虑方案 B。

### 不做的事

- **Blur last-resort**：Review 说 blur 只能是 "explicitly approved, rare, opt-in, image-only last-resort"。推迟到未来 spec。当前只做 matte/gradient。
- **Padded preprocessing**（Phase 4）：预渲染 padded 素材。推迟。
- **Video contain framing**：focus_detector 不支持视频，视频的 `fit: "contain"` 仍用朴素黑底。只改图片。

## Files to Modify

| File | Change | Risk |
|------|--------|------|
| `remotion/src/components/MediaBackground.tsx` | 当 `fit === "contain"` 时，Matte 层用品牌渐变而非纯色 | Medium — 核心渲染路径，但只影响 contain 分支 |
| `remotion/src/types.ts` | 可选：新增 `containStyle?: "bare" \| "branded"` 字段（默认 `branded`）| Low — 纯新增，不破坏现有 |
| `scripts/short-video/__tests__/media-bg.test.mjs` | 如新增 `containStyle`，加验证测试 | Low |

## Implementation Notes

### MediaBackground.tsx 当前结构

```tsx
// 当前 return 结构：
<>
  {media.type === "image" ? (
    <CanvasImage src={src} style={mediaStyle} />  // mediaStyle.objectFit = "contain"
  ) : (
    <Video src={src} style={mediaStyle} volume={videoVolume} effects={effects} />
  )}
  <div style={{ ... overlayOpacity }} />  // overlay 层
</>
```

**问题**：当 `objectFit: "contain"`，`CanvasImage` 只占图片实际大小，周围是透明的——透出底层的 `#0a0a14`（在 `ShortVideo.tsx` 的 `AbsoluteFill` 上）。

**修复**：在 `<CanvasImage>` 之前插入一个背景层：

```tsx
const isContain = (media.fit ?? "cover") === "contain";

return (
  <>
    {isContain && (
      <AbsoluteFill style={{
        background: "radial-gradient(circle at 50% 50%, #0a0a14 0%, #050508 100%)",
      }} />
    )}
    {media.type === "image" ? (
      <CanvasImage src={src} style={mediaStyle} />
    ) : (
      <Video src={src} style={mediaStyle} volume={videoVolume} effects={effects} />
    )}
    <div style={{ ... overlayOpacity }} />
  </>
);
```

注意：`cover` 模式不需要这层（图片填满整个画面，看不到背景）。

### 动画考虑

- contain 模式下，`ken-burns` / `zoom` 动画的 scale 和 translate 仍然作用于 `CanvasImage`，不影响背景层
- 背景层可以是静态的（无动画），或加微弱的 scale 呼吸（`1.0 → 1.02`），增加生气但不抢前景
- 建议**静态**，保持"quiet"

### 与 crop-decision 的数据流

```
selectBestCrop → status: "unsafe" → asset.fit = "contain"
  → assignAssetsToScenes → media.fit = "contain"
  → MediaBackground.tsx → isContain = true → 渲染品牌渐变背景
```

不需要修改 `crop-decision.mjs`、`asset-sourcer.mjs`、`review-media-patch.mjs`、`apply-media-patch.mjs`——数据流已经打通，只差渲染层。

## Testing

- `MediaBackground.tsx` 的 contain 渲染无法用 vitest 单元测试覆盖（Remotion 组件需要渲染环境）
- 验证方式：`verify-video.mjs --pre` 检查 DOM 结构 + 人工在 dev server 中看效果
- 如新增 `containStyle` 字段，在 `media-bg.test.mjs` 加 `validateMedia` 验证测试

## Acceptance Criteria

- [ ] VC-08：当 `fit === "contain"` 时，背景从朴素 `#0a0a14` 升级为品牌渐变
- [ ] 渐变是"quiet"的——不抢前景，有层次感
- [ ] `cover` 模式渲染不受影响（无背景层，行为不变）
- [ ] 现有 scene-data 无 `fit` 字段时（默认 `cover`），行为不变
- [ ] TypeScript 编译通过
- [ ] `verify-video.mjs --pre` 通过

## Related

- 原始 Handoff: `docs/handoffs/handoff-vertical-cropping-pipeline.md`（Phase 3）
- Review: `docs/reviews/handoff-vertical-cropping-pipeline-review-2026-08-26.md`（Finding #4, VC-08）
- 已完成 Spec: `docs/archive/spec-vertical-cropping.md`（Out of Scope 中明确推迟了此项）
- 品牌色定义：`#0a0a14`（所有 Remotion 场景的 `backgroundColor`）
- 渲染组件：`scripts/short-video/remotion/src/components/MediaBackground.tsx`
