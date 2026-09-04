# Spec: Hook Scene Media Support + Narrative Ken-Burns + Warning Summary

## Problem Statement

Hook 场景（Scene 1）是视频的"第一冲击"，直接影响前 3 秒留存率。当前 hook 场景只使用纯 CSS 背景（grid-bg + glow-tint + scan-sweep），缺乏视觉冲击力。外部最佳实践明确指出：静态图片/背景杀留存，前 3 秒的视觉丰富度决定用户是否继续观看。

同时，narrative 场景的背景图默认使用 `fade` 动画（只在入场 0.8 秒有动画，之后静止），也缺乏持续运动感。

此外，`verify-video.mjs` 的 warning 只在控制台实时输出，散落在各检查段落中，用户在 HITL 检查点审阅视频时无法一目了然地看到所有 warning。

## Solution

1. **Hook 场景支持可选 media 背景**：hook 场景可以（但不必须）有 `scene.media`，渲染背景图 + overlay + ken-burns 动画。media 来源有两条路径：agent 手动指定（优先）或 asset-sourcer 自动分配（需通过 score>=60 + fit="cover" 双 gate）。
2. **Narrative 场景默认动画改为 ken-burns**：自动分配的 narrative 场景默认使用 ken-burns 动画（图片），提供持续运动感。
3. **Warning 汇总区块**：verify-video.mjs 的 `printSummary()` 在有 warning 时输出汇总列表。

## User Stories

1. As a content creator, I want hook scenes to optionally display background images, so that the first 3 seconds have stronger visual impact.
2. As a content creator, I want asset-sourcer to automatically assign high-quality media to hook scenes, so that I don't have to manually find and specify background images.
3. As a content creator, I want the system to skip media assignment when no suitable asset is found, so that hook scenes without good assets still render cleanly with CSS background.
4. As a content creator, I want narrative scene backgrounds to have continuous motion (ken-burns), so that static images don't kill retention.
5. As a content creator, I want all warnings surfaced in a summary block at the end of video verification, so that I can review them together during HITL checkpoint.
6. As an agent, I want to manually specify hook media in scene-data when I have a specific creative choice, so that my creative intent is respected over automatic assignment.
7. As an agent, I want verify-video.mjs to warn me when a hook scene has no media, so that I'm reminded to consider adding one.
8. As an agent, I want the VLM fit gate to only assign "cover" assets to hook scenes, so that letterboxed (contain) assets don't weaken the hook's visual impact.

## Implementation Decisions

### D1: Hook Media Decision Model

Hook 场景的 media 决策遵循以下优先级：

1. **Agent 手动指定**（`scene.media` in scene-data）→ 直接使用，跳过自动分配和 gate 验证
2. **Asset-sourcer 自动分配** → 从 `NO_MEDIA_TYPES` 移除 "hook"，hook 优先于 narrative 分配
   - Gate 1: `asset.score >= 60`（关键词匹配 + 类型 + 分辨率 + VLM description）
   - Gate 2: `asset.aiFit === "cover"`（VLM 判定为 cover 的素材；contain 留给 narrative）
   - 通过双 gate → 分配，默认 `{animation:"ken-burns", overlay:0.5, fit:"cover"}`
   - 不通过 → 不分配，hook 走 CSS 背景
3. **无 media** → 纯 CSS 背景（grid-bg + glow-tint + scan-sweep），verify-video 给 W 级 warning

### D2: CSS 路径修改（`hookScene()` in `lib/scene-templates.mjs`）

在 `hookScene()` 的 HTML 输出中，当 `scene.media` 存在时：

- 调用 `mediaLayer(scene.media, contentDir, duration)` 获取 `{css, html}`
- media CSS 注入到 `<style>` 块（在 `templateCss()` 之后）
- media HTML 插入到 `.scene` div 内的最前面（在 `<div class="grid-bg">` 之前），确保 media 在最底层

需要传入 `contentDir` 参数——当前 `hookScene()` 不接收此参数。修改签名：`hookScene(scene, duration, contentDir)`。调用方（`scenes.mjs` 中的 `scene1()`）需要传入 `__dirname`。

### D3: Remotion 路径修改（`HookScene.tsx`）

在 `HookScene` 组件中，`<GridBg />` 之前加条件渲染：

```tsx
{
  scene.media && (
    <MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />
  );
}
```

`MediaBackground` 组件本身不需要修改（已支持所有 media 字段）。更新注释删除"Hook/CTA scenes ignore media"。

`HookScene` 需要接收 `contentDir` prop（与 `NarrativeScene` 一致）。

### D4: Asset-sourcer 修改

- `NO_MEDIA_TYPES`: 从 `Set(["hook", "cta", "data", "stat-reveal"])` 改为 `Set(["cta", "data", "stat-reveal"])`
- `recommendScene()`: 新增 hook 分支，返回 `{sceneId, animation:"ken-burns", overlay:0.5}`
- `assignAssetsToScenes()`:
  - hook 场景优先分配（在 narrative 之前遍历）
  - hook 专用 gate：`asset.score >= 60 && asset.aiFit === "cover"`
  - hook 默认值：`{animation:"ken-burns", overlay:0.5, fit:"cover"}`
  - narrative 默认动画从 `"fade"` 改为 `"ken-burns"`（图片）/保持 `"zoom"`（视频）

### D5: Scene-rules 修改

新增 `checkHookMediaWarning()`：

- 检查 hook 场景（`scenes[0]`）是否有 `scene.media`
- 无 media → W 级 warning："Hook scene has no media — visual impact may be insufficient for first 3 seconds"
- 有 media → pass
- 在 `runAllSceneDataChecks()` 末尾追加调用

### D6: verify-video.mjs 修改

`printSummary()` 新增 warning 汇总区块：

- 当 `results.warn.length > 0` 时，在 summary 后输出：
  ```
  ⚠️  WARNINGS (review before publishing):
    • [Category] check — detail
      → FIX: ...
  ```
- 0 warnings 时不输出此区块

### D7: 注释更新

- `lib/media-bg.mjs` 第 16 行：删除"hookScene and ctaScene ignore the media field"
- `remotion/src/components/MediaBackground.tsx` 第 17 行：删除"Hook/CTA scenes ignore media"

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件                                                                  | 修改内容                                                               | 风险等级 | 评估                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/scene-templates.mjs` `hookScene()`                               | 插入 `mediaLayer()` 条件调用；签名加 `contentDir` 参数                 | Medium   | 向后兼容：无 media 时行为不变。已有 12 个视频的 hook scene-data 无 media 字段。                                                          |
| `remotion/src/scenes/HookScene.tsx`                                   | 加 `{scene.media && <MediaBackground>}` 条件渲染；加 `contentDir` prop | Medium   | 与 NarrativeScene 已有模式完全一致。                                                                                                     |
| `remotion/src/components/MediaBackground.tsx`                         | 更新注释                                                               | Low      | 纯注释。                                                                                                                                 |
| `lib/asset-sourcer.mjs` `NO_MEDIA_TYPES`                              | 移除 "hook"                                                            | High     | 改变分配行为。缓解：双 gate + hook 优先 + fit 分流。                                                                                     |
| `lib/asset-sourcer.mjs` `recommendScene()` + `assignAssetsToScenes()` | hook 优先分配 + 双 gate + narrative 默认改 ken-burns                   | High     | 公共接口修改。缓解：已有 scene-data 的 media 不被覆盖（`if (scene.media) continue`）。                                                   |
| `lib/scene-rules.mjs`                                                 | 新增 `checkHookMediaWarning()`                                         | Low      | 纯追加。                                                                                                                                 |
| `lib/media-bg.mjs`                                                    | 更新注释                                                               | Low      | 纯注释。                                                                                                                                 |
| `verify-video.mjs` `printSummary()`                                   | 新增 warning 汇总区块                                                  | Low      | 纯追加。                                                                                                                                 |
| `content/*/scenes.mjs`                                                | `scene1()` 调用 `hookScene()` 时传入 `__dirname`                       | Medium   | 每个内容的 scenes.mjs 都需更新。已有内容的 scenes.mjs 调用 `hookScene(scene, duration)` → 改为 `hookScene(scene, duration, __dirname)`。 |

### Section 2: Behavioral Scenarios

| #   | Scenario                                       | Expected Behavior                                                 | Risk   | Mitigation                             |
| --- | ---------------------------------------------- | ----------------------------------------------------------------- | ------ | -------------------------------------- |
| 1   | hook 无 media，asset-sourcer 未运行            | 纯 CSS 背景 + W 级 warning                                        | Low    | 向后兼容                               |
| 2   | hook 无 media，所有素材 score<60               | 不分配，CSS 背景 + warning                                        | Low    | 决策模型回退                           |
| 3   | hook 无 media，素材 score>=60 但 fit="contain" | 不分配给 hook，留给 narrative                                     | Medium | fit gate 分流                          |
| 4   | hook 无 media，素材 score>=60 且 fit="cover"   | 分配，ken-burns + overlay 0.5                                     | Medium | 理想路径                               |
| 5   | hook 有 media（agent 指定）                    | 直接使用，跳过 gate                                               | Low    | 信任 agent                             |
| 6   | hook media 文件不存在                          | mediaLayer 返回空，CSS 背景 + media warning                       | Low    | 已有逻辑                               |
| 7   | hook media 是视频                              | ken-burns 降级为 fade                                             | Low    | 已有降级逻辑                           |
| 8   | hook media overlay 未设置                      | 默认 0.5                                                          | Medium | asset-sourcer 层设好                   |
| 9   | hook 分配后 narrative 素材不够                 | fit 分流：cover→hook, contain→narrative                           | Medium | 自然分流                               |
| 10  | 已有视频重跑 asset-sourcer                     | 已有 media 不被覆盖                                               | Low    | `if (scene.media) continue`            |
| 11  | narrative 默认动画改为 ken-burns               | 新分配用 ken-burns，已有不受影响                                  | Medium | 只改默认值                             |
| 12  | post-render 有 warnings                        | 输出汇总区块                                                      | Low    | 纯追加                                 |
| 13  | post-render 0 warnings                         | 不输出汇总区块                                                    | Low    | 条件不满足                             |
| 14  | VLM 不可用时                                   | fit gate 无法验证，hook 不分配，CSS 背景 + warning                | Medium | 优雅降级                               |
| 15  | hook media 与 CSS 背景层叠加                   | media 在最底层，grid-bg 半透明叠加                                | High   | HTML 顺序：media → grid-bg → glow-tint |
| 16  | overlay=0.5 时 focal-number 可读性             | text-shadow 保证可读                                              | Low    | 视觉验证                               |
| 17  | ken-burns 与 scan-sweep 冲突                   | 不同 DOM 元素，不同 CSS 属性                                      | Low    | 无冲突                                 |
| 18  | 跨 Step 接口契约                               | asset-sourcer → media-patch → scene-data → hookScene → mediaLayer | Medium | 字段格式一致                           |

## Testing Decisions

### 测试 Seams（使用现有 seam，不新建测试文件）

1. **`__tests__/scene-templates.test.mjs`** — 新增：hook 有 media 时 HTML 包含 `media-container`；无 media 时不包含；`contentDir` 参数传入。
2. **`__tests__/asset-sourcer.test.mjs`** — 新增：hook 不在 NO_MEDIA_TYPES；hook 优先分配；score<60 不分配；fit="contain" 不分配；fit="cover" 分配；narrative 默认动画="ken-burns"。
3. **`__tests__/scene-rules.test.mjs`** — 新增：hook 无 media → warning；hook 有 media → pass。
4. **`__tests__/media-bg.test.mjs`** — 不新增（mediaLayer 无改动）。
5. **`__tests__/remotion-scene-parity.test.mjs`** — 新增：HookScene 有 media 时 DOM 包含 media 层。

### 测试原则

- 只测外部行为，不测实现细节
- 场景矩阵每一行 = 一个测试用例
- 已有测试必须继续通过（向后兼容验证）

## Out of Scope

- CTA 场景 media 支持（CTA 是结尾卡片，不需要背景图）
- Hook 场景视频素材的 ken-burns 支持（视频自动降级为 fade，已有逻辑）
- asset-sourcer 的搜索源扩展
- VLM 模型升级

## Further Notes

- `contentDir` 参数传递：`hookScene(scene, duration, contentDir)` → 调用方 `scenes.mjs` 中的 `scene1()` 传入 `__dirname`。Remotion 端 `HookScene` 组件已有 `contentDir` prop 模式（参考 NarrativeScene）。
- `printSummary()` 中 warning 汇总区块的格式参考现有 FAIL 汇总格式（第 526-530 行）。
- Hook media 的 overlay 默认 0.5（不是 narrative 的 0.7）是因为 hook 文字有强 text-shadow 发光效果，0.5 下仍可读，且 0.5 让背景图更可见。
