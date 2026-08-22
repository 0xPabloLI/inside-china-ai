# Proposal: 素材先行 + Hook 场景 Media 支持 + OpenCV 焦点检测

> Status: **Draft — 待多 Agent 审核**
> Created: 2026-08-17
> Author: Agent (Grill Round 1 结论 + VLM 测试 + Deep Research 综合)

## 1. 问题陈述

当前短视频管线存在三个独立但相关的不足：

1. **素材获取时序滞后**：`asset-sourcer.mjs` 在 `scene-data` 写作之后运行，创作者"盲写脚本"后再找素材，导致叙事契合度低。
2. **Hook 场景不支持背景素材**：`hookScene()` 的 `NO_MEDIA_TYPES` 包含 `"hook"`，场景模板不调用 `mediaLayer()`。第一帧（=TikTok 封面）无视觉素材，完播率低。
3. **文字可能遮挡素材重点内容**：当素材作为背景层时，overlay 只解决了文字可读性，没有解决"文字遮挡素材重点区域"（如人脸、产品）。

## 2. 方案概述

三个独立改动，可分别实施：

| 改动 | 描述 | 影响范围 |
|------|------|----------|
| **A: 素材先行** | `asset-sourcer.mjs` 提前到 scene-data 写作之前 | `content-pipeline.md` 流程 + `scene-data.mjs` 写作流程 |
| **B: Hook 场景 Media 支持** | Hook 场景可选地支持背景素材（mediaLayer 在 grid-bg 之下） | `scene-templates.mjs`, `asset-sourcer.mjs`, Remotion `HookScene.tsx` |
| **C: OpenCV 焦点检测** | 新增 OpenCV saliency + face detection，输出 `focusRegion` 字段 | `vlm_analyzer.py` 新 action, `asset-sourcer.mjs` 集成, Remotion slot 偏移 |

## 3. 改动 A: 素材先行

### 3.1 动机

sensetime-latest 案例达到 71% 素材覆盖率（7 场景中 5 个有素材），叙事贴合度高。原因是创作者"看着素材写脚本"。当前管线流程是 scene-data → asset-sourcer → 人工 review → 修改 scene-data，应反转为 asset-sourcer → 看着素材写 scene-data。

### 3.2 流程变更

```
当前: Stage 2 (文章) → Stage 3 (scene-data) → Stage 3a (asset-sourcer) → HITL → 修改 scene-data
提案: Stage 2 (文章) → Stage 2.5 (asset-sourcer) → Stage 3 (scene-data，看着素材写) → HITL
```

### 3.3 影响

- `docs/content-pipeline.md`：新增 Stage 2.5
- `scene-data.mjs` 写作流程：创作者先看 `media-patch.json` + 素材目录，再写场景
- `asset-sourcer.mjs`：输入从 `scenes`（已写好的场景数据）变为 `article` + `keywords`（从文章提取）

### 3.4 风险

asset-sourcer 当前依赖 `scenes` 参数做 `assignAssetsToScenes()`。如果没有 scene-data，需要改为只搜索 + 下载 + AI 分析 + 生成 `media-patch.json`（含素材列表 + AI 描述），不做场景分配。场景分配推迟到 scene-data 写作时由创作者手动决定。

## 4. 改动 B: Hook 场景 Media 支持

### 4.1 动机

TikTok 算法用第一帧做封面缩略图。Hook 场景当前只有 CSS 背景（grid-bg + glow-tint），作为封面吸引力不足。加入背景素材可以：
- Pattern Interrupt：CSS → Media → CSS 的视觉切换打破滑动惯性
- 三层开场理论：口播线 + 屏幕文字 + 开场画面（素材）在 0.0s 同步触发

### 4.2 渲染层级

```
z-index 0: mediaLayer (image/video + overlay)     ← 最底层
z-index 1: grid-bg + glow-tint + scanlines        ← 品牌层
z-index 2: brandBar + sceneFrame (kicker/hero/support)  ← 文字层
z-index 3: fade-to-black                           ← 过渡层
```

Media 在 CSS 背景元素之下，保持品牌一致性。

### 4.3 适用条件

| 场景类型 | 推荐素材 | 不推荐素材 |
|----------|----------|------------|
| Hook（产品/Demo 类） | 产品照片、Logo、Demo 视频截帧 | 纯数字、纯文字 |
| Hook（融资/事件类） | 建筑外观、活动照片 | 无 |
| Hook（数据/排名类） | 不加素材（CSS-only 更有力） | 任何（数字本身就是焦点） |

### 4.4 数据契约变更

```javascript
// scene-data.mjs — hook 场景新增可选 media 字段
{
  id: 1,
  visualType: "hook",
  texts: { ... },
  media: {              // ← 新增，可选
    type: "image",
    path: "assets/sensetime-hq.jpg",
    animation: "fade",
    overlay: 0.75       // Hook 场景默认高 overlay（文字是焦点）
  }
}
```

### 4.5 NO_MEDIA_TYPES 变更

```javascript
// 当前
const NO_MEDIA_TYPES = new Set(["hook", "cta", "data", "stat-reveal"]);

// 提案：移除 "hook"，保留其余
const NO_MEDIA_TYPES = new Set(["cta", "data", "stat-reveal"]);
```

### 4.6 Remotion 变更

`HookScene.tsx` 需引入 `MediaBackground` 组件，在 `GridBg` 之前渲染：

```tsx
{scene.media && <MediaBackground media={scene.media} duration={duration} />}
<GridBg />
<Glow color={color} />
// ... 其余不变
```

## 5. 改动 C: OpenCV 焦点检测

### 5.1 动机

VLM 测试结果（详见 `experiments/vlm-focus-test-results.json`）：
- JSON 输出成功率：100%（8/8）✅
- focusRegion 一致性：⚠️ 同一张图两个 prompt 给出不同值
- overlay 数值梯度：❌ 全部输出 0.3，无区分
- fullscreen 判断：✅ 全景类准确

结论：VLM 擅长语义判断（"这是什么""要不要全屏"），不擅长空间定位（"焦点在哪"）。

Deep Research（详见 `docs/research/asset-focus-detection-alternatives.md`）调研了 5 类替代方案，推荐 OpenCV Saliency + Face Detection 组合：

| 维度 | VLM | OpenCV 组合 |
|------|-----|------------|
| 速度 | 18-20s/张 | <200ms/张 |
| 模型下载 | 9.2GB | 0（OpenCV 自带） |
| 空间定位 | ⚠️ 不稳定 | ✅ 确定性输出 |
| 语义理解 | ✅ | ❌ |

**协同关系**（非替代）：VLM 做语义层（description + fullscreen），OpenCV 做空间层（focusRegion + faceBoxes）。

### 5.2 实现方案

在 `vlm_analyzer.py` 新增 `analyze_focus` action：

```python
def handle_analyze_focus(model, processor, path):
    """OpenCV-based focus region detection. No VLM needed."""
    import cv2
    import numpy as np
    
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]
    
    # Step 1: Face detection (Haar Cascade, built into OpenCV)
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    )
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
    
    # Step 2: Saliency map (Spectral Residual, built into OpenCV)
    saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
    _, sal_map = saliency.computeSaliency(img)
    
    # Step 3: Determine focus region
    if len(faces) > 0:
        # Face takes priority
        fx, fy, fw, fh = faces[0]
        centroid_y = (fy + fh / 2) / h
    else:
        # Use saliency centroid (weighted mean of salient pixels)
        ys = np.arange(h)
        sal_y = np.sum(ys[:, None] * sal_map) / (np.sum(sal_map) + 1e-8)
        centroid_y = sal_y / h
    
    # Map to region
    if centroid_y < 0.33:
        region = "top"
    elif centroid_y < 0.66:
        region = "center"
    else:
        region = "bottom"
    
    return {
        "focusRegion": region,
        "faceBoxes": faces.tolist(),
        "saliencyCentroidY": float(centroid_y),
    }, None
```

### 5.3 数据契约变更

`media-patch.json` 中每个 asset 新增 `focusAnalysis` 字段：

```json
{
  "focusRegion": "center",
  "faceBoxes": [[120, 340, 80, 80]],
  "saliencyCentroidY": 0.52
}
```

### 5.4 渲染层 slot 偏移

当 `focusRegion` 存在时，Remotion 和 Playwright 模板动态调整文字 slot 的 y 位置：

| focusRegion | 文字 slot 位置 | 效果 |
|-------------|--------------|------|
| `top` | 下移到 support 区 (y 950-1150) | 避开上半部焦点 |
| `center` | 默认布局 (当前不变) | — |
| `bottom` | 上移到 kicker 区 (y 220-400) | 避开下半部焦点 |

### 5.5 降级策略

- OpenCV 不可用（未安装 `opencv-contrib-python`）→ `focusRegion` 字段缺失，渲染层使用默认 `center` 布局
- 图片读取失败 → 返回 `focusRegion: "center"` + 空 `faceBoxes`
- 纯黑/纯白图片（saliency 方差极低）→ 返回 `focusRegion: "full"` + `fullscreen: true`

## 6. Modified Files Impact

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/asset-sourcer.mjs` | 1) 移除 `scenes` 参数硬依赖（改为可选）2) 新增 `analyzeFocusRegion()` 调用 OpenCV 3) `media-patch.json` 新增 `focusAnalysis` 字段 | **Medium** | 修改了 `assignAssetsToScenes` 的输入契约。缓解：`scenes` 参数保持可选，有则分配，无则跳过。下游 `media-patch.json` 消费者（创作者）只需读 `focusAnalysis` 可选字段。 |
| `scripts/short-video/lib/vlm_analyzer.py` | 新增 `analyze_focus` action（不修改现有 `describe_image` / `describe_video`） | **Low** | 纯追加，不改现有 action。IPC 协议新增一个 action type，旧调用方不受影响。 |
| `scripts/short-video/lib/visual-analyzer.mjs` | 新增 `analyzeFocus(imagePath)` 导出函数 | **Low** | 纯追加，不改现有 `describeImage` / `describeVideo`。 |
| `scripts/short-video/lib/scene-templates.mjs` | `hookScene()` 新增可选 `mediaLayer()` 调用 | **Medium** | 修改了 Hook 场景的 HTML 输出。缓解：`media` 字段可选，不存在时行为完全不变。`NO_MEDIA_TYPES` 移除 `"hook"`。 |
| `scripts/short-video/remotion/src/scenes/HookScene.tsx` | 引入 `MediaBackground` 组件 | **Medium** | 修改了 Hook 场景的渲染。缓解：`scene.media` 不存在时不渲染 `MediaBackground`，行为不变。 |
| `scripts/short-video/lib/safe-zones.mjs` | 无修改 | — | slot 偏移在 `scene-layout.mjs` 层面处理，不改 safe zones 常量。 |
| `scripts/short-video/lib/scene-layout.mjs` | `sceneFrame()` 新增可选 `focusRegion` 参数，调整 slot y 位置 | **Medium** | 修改了 slot 布局。缓解：`focusRegion` 未传入时使用默认布局，完全不变。 |
| `scripts/short-video/remotion/src/components/visuals.tsx` | `Slot` 组件新增可选 `focusRegion` prop | **Medium** | 同上。 |
| `docs/content-pipeline.md` | 新增 Stage 2.5 (Asset Sourcing) | **Low** | 纯文档追加。 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| S1 | Hook 场景有 media 字段（图片） | Hook 渲染背景图片 + grid-bg + glow 叠加 + 文字 slot | Medium | 媒体在 z-index 0，品牌元素在 z-index 1+，视觉一致性由 overlay 保证 |
| S2 | Hook 场景有 media 字段（视频） | Hook 渲染背景视频 + overlay + 文字 | Medium | 视频自动播放 + muted + loop，Playwright 需等待 readyState |
| S3 | Hook 场景无 media 字段 | Hook 渲染纯 CSS 背景（当前行为） | Low | `media` 字段可选，不存在时完全不变 |
| S4 | Hook 场景有 media + focusRegion: "top" | 文字 slot 下移到 support 区，避开上半部素材焦点 | Medium | slot 偏移量基于 SAFE_ZONES 计算，不超出 content band |
| S5 | Hook 场景有 media + focusRegion: "center" | 默认布局（当前 slot 位置不变） | Low | center 是默认值，不触发偏移 |
| S6 | Hook 场景有 media + focusRegion: "bottom" | 文字 slot 上移到 kicker 区，避开下半部素材焦点 | Medium | 同 S4 |
| S7 | Hook 场景有 media + focusRegion: "full" | 等同 fullscreen 模式，不叠文字 | Low | fullscreen 模式已有实现（FullscreenMedia.tsx） |
| S8 | Hook 场景有 media + focusRegion 缺失 | 默认 center 布局 | Low | focusRegion 可选，缺失时 fallback |
| S9 | asset-sourcer 在 scene-data 写作前运行 | 只做搜索 + 下载 + AI 分析，不做场景分配 | Medium | `scenes` 参数变可选，`assignAssetsToScenes` 在无 scenes 时跳过 |
| S10 | asset-sourcer 有 scenes 参数 | 正常做场景分配（当前行为） | Low | 向后兼容 |
| S11 | OpenCV 未安装 | `analyzeFocus` 返回空结果 + 警告 | Low | 优雅降级，同 VLM 不可用模式 |
| S12 | 图片纯黑/纯白（saliency 方差极低） | 返回 `focusRegion: "full"` + `fullscreen: true` | Low | 方差阈值检测，fallback 到 fullscreen |
| S13 | 人脸检测失败（侧面/遮挡） | saliency centroid 作为 fallback | Low | 两步组合，face detection 不是唯一路径 |
| S14 | Narrative 场景有 media + focusRegion | 同样支持 slot 偏移 | Low | focusRegion 是通用的，不限于 Hook 场景 |
| S15 | CTA 场景有 media 字段 | Media 被忽略（CTA 在 NO_MEDIA_TYPES 中） | Low | 不变 |
| S16 | 视频 focusRegion 检测 | 取首帧做 OpenCV 分析（视频是动态的，首帧代表性有限） | Medium | 首帧 + 1fps 采样 5 帧取多数 vote |
| S17 | 素材先行模式下 media-patch.json 无场景分配 | media-patch.json 只含素材列表 + AI 描述 + focusAnalysis | Low | 创作者手动从素材列表中选择并填入 scene-data |
| S18 | Hook 场景 media overlay 默认值 | Hook 场景默认 overlay 0.75（比 narrative 的 0.7 高，因为 Hook 文字是焦点） | Low | `recommendScene()` 对 hook visualType 给 0.75 |
| S19 | Hook 场景 media animation 推荐 | 图片用 fade（不抢注意力），视频用 fade（同上） | Low | Hook 场景不用 ken-burns/slide/zoom（太分散注意力） |
| S20 | Hook 场景是数字型（bigNumber） + media | 大数字 + 背景素材叠加，overlay 保证可读性 | Medium | 数字类 Hook 不推荐加 media，但如果加了，overlay 0.8 保证数字可读 |

## 7. 实施优先级

| 优先级 | 改动 | 依赖 | 预估工时 |
|--------|------|------|----------|
| P0 | A: 素材先行 | 无 | 2h（文档 + asset-sourcer 参数调整） |
| P1 | B: Hook 场景 Media 支持 | A（素材先行后有更多素材可用） | 4h（模板修改 + Remotion + 测试） |
| P2 | C: OpenCV 焦点检测 | B（slot 偏移需要先有 media 支持） | 4h（Python action + 集成 + slot 偏移 + 测试） |

## 8. 验证计划

1. **OpenCV 焦点检测验证**：用 4 张测试素材（shanghai-skyline, ai-robot-hand, financial-chart, data-center）运行 `analyze_focus`，检查 focusRegion 输出合理性
2. **Hook 场景 media 渲染验证**：在 dev server 中验证有/无 media 的 Hook 场景渲染
3. **slot 偏移验证**：用 Playwright DOM 检查 focusRegion=top/bottom 时 slot y 位置是否正确偏移
4. **回归测试**：现有视频（sensetime-latest, unitree-ipo, light-society）重新渲染，确认无回归

## 9. Open Questions

1. **Hook 场景的 media overlay 默认值**：0.75 还是 0.8？Hook 文字是焦点，需要更高 overlay 保证可读性，但也不能太暗导致素材失去意义。
2. **slot 偏移的粒度**：是 top/center/bottom 三档，还是连续偏移（基于 saliencyCentroidY 精确值）？三档更简单但可能不够精确；连续偏移更精确但实现复杂。
3. **视频 focusRegion 的代表性**：首帧可能不代表整个视频的焦点（如 CEO 从坐到站）。是否需要多帧 vote？
4. **Hook 场景 media 的 animation 限制**：是否强制只用 fade？ken-burns/slide/zoom 在 Hook 场景可能过于分散注意力。
5. **素材先行模式下 `assignAssetsToScenes` 的处理**：完全跳过，还是基于文章关键词做"预分配建议"？
