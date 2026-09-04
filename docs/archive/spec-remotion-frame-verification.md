# Spec: Remotion 路径帧图片分析验证

> 状态：Draft
> 7e1
> 来源：Session 2026-08-13

## 问题

当前验证体系有两条路径：

| 路径              | 数据验证                     | 布局/视觉验证                                                          |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------- |
| Playwright (HTML) | `verify-video.mjs --pre/pre` | `verify-scene-dom.mjs` (Playwright DOM: safe zone, overflow, word-fit) |
| Remotion (React)  | `verify-video.mjs --pre`     | **无** (只有 ffprobe 规格：分辨率/时长/帧率)                           |

Remotion 路径渲染 React 组件 → 帧图片 → MP4，没有 DOM 可供 Playwright 检查。`verify-scene-dom.mjs` 不适用。结果是：Remotion 渲染的布局错误（文字越界、safe zone 侵犯）只能靠人眼发现。

## 目标

建一个**全自动**的帧图片分析验证工具，让 agent 能在 CI/管线中跑，无需 human-in-the-loop。覆盖 `verify-scene-dom.mjs` 的核心检查项（safe zone compliance、frame 非空、watermark 存在）。

## 设计

### 架构

```
rendered MP4
  ↓ ffmpeg extract key frames (1 frame per scene, at scene midpoint)
  ↓ pngjs parse PNG → raw pixel buffer
  ↓ lib/frame-analysis.mjs (pure functions)
  ↓ pass / warn / fail results
  ↓ integrate into verify-video.mjs post-render summary
```

### 新文件

#### 1. `lib/frame-analysis.mjs` — 纯函数模块（可测试）

所有分析逻辑为纯函数，输入是像素缓冲区 + 区域定义，输出是结构化结果。不涉及 IO。

```js
// 核心类型
interface PixelBuffer {
  data: Uint8Array;  // RGBA
  width: number;
  height: number;
}

interface Region {
  xStart: number; xEnd: number;
  yStart: number; yEnd: number;
}

interface AnalysisResult {
  level: "pass" | "warn" | "fail";
  check: string;
  detail: string;
  metrics?: Record<string, number>;
}

// 核心函数
export function luminance(r, g, b): number
export function getPixel(buf, x, y): { r, g, b, a }
export function sampleRegion(buf, region, step): PixelSample[]
export function countBrightPixels(buf, region, threshold, step): { bright, total, ratio }

// 检查函数（每个返回 AnalysisResult）
export function checkSafeZoneTop(buf, safeZones): AnalysisResult
export function checkSafeZoneRight(buf, safeZones): AnalysisResult
export function checkSafeZoneBottom(buf, safeZones): AnalysisResult
export function checkContentPresence(buf, safeZones): AnalysisResult
export function checkNotAllBlack(buf): AnalysisResult
export function runFrameAnalysis(buf, safeZones): AnalysisResult[]
```

**检查逻辑：**

| 检查                   | 区域                         | 判定                            | 级别                        |
| ---------------------- | ---------------------------- | ------------------------------- | --------------------------- |
| `checkSafeZoneTop`     | y∈[0, 220], x∈[0, 1080]      | brightPixelRatio > 0.05 → fail  | 内容侵犯顶部 UI 区          |
| `checkSafeZoneRight`   | x∈[880, 1080], y∈[640, 1775] | brightPixelRatio > 0.05 → fail  | 内容被右侧 action rail 遮挡 |
| `checkSafeZoneBottom`  | y∈[1150, 1188], x∈[0, 1080]  | brightPixelRatio > 0.05 → fail  | 内容侵入字幕通道上沿        |
| `checkContentPresence` | x∈[60, 880], y∈[220, 1150]   | pixelVariance < 0.01 → warn     | 空场景（内容区无内容）      |
| `checkNotAllBlack`     | 全帧                         | all pixels luminance < 5 → fail | 渲染失败（全黑）            |

**阈值定义：**

- `BRIGHT_THRESHOLD = 80` — luminance > 80 视为"亮像素"（内容）。背景色 #0a0a14 luminance ≈ 10，GridBg/Glow 等背景层 luminance < 60，文字/品牌元素 luminance > 100
- `BRIGHT_RATIO_FAIL = 0.05` — 亮像素占比 > 5% 判为 fail（safe zone 内不应有大量内容）
- `SAMPLE_STEP = 8` — 每 8px 采样一次（1080×1920 → ~32K 采样点，足够代表性，速度快）
- `BLACK_THRESHOLD = 5` — luminance < 5 视为"黑像素"

**采样策略：**

- 使用 step=8 的网格采样，不逐像素扫描
- 1080×1920 帧约 2M 像素 → 采样 ~32K 点 → 每帧分析 < 5ms

#### 2. `verify-remotion-frames.mjs` — CLI 入口

```
Usage: node verify-remotion-frames.mjs --content <dir> [--video <path>]
```

流程：

1. 加载 scene-data.mjs → 场景列表 + durations
2. 加载 safe-zones.mjs → SAFE_ZONES 常量
3. 计算每个场景的中间帧号（用 timeline.mjs 的 sceneClipFrames 累加）
4. 对每个场景：
   a. ffmpeg 从 MP4 提取该帧为 PNG → 临时文件
   b. pngjs 解析 PNG → PixelBuffer
   c. 调用 `runFrameAnalysis(buf, SAFE_ZONES)` → AnalysisResult[]
   d. 输出结果
5. 汇总 pass/warn/fail，exit code 0/1
6. 清理临时 PNG 文件

**帧号计算：**

```js
import { sceneClipFrames, FPS } from "./lib/timeline.mjs";

let cumulative = 0;
for (const scene of scenes) {
  const clipFrames = sceneClipFrames(durations[i]);
  const midFrame = cumulative + Math.floor(clipFrames / 2);
  // extract frame at midFrame
  cumulative += clipFrames;
}
```

**ffmpeg 提取命令：**

```bash
ffmpeg -i video.mp4 -vf "select=eq(n\,FRAME_NUM)" -vframes 1 -y output.png
```

#### 3. `__tests__/frame-analysis.test.mjs` — 单元测试

测试所有纯函数：

- `luminance` — 正确计算亮度
- `getPixel` — 正确读取像素
- `countBrightPixels` — 正确计数亮像素
- `checkSafeZoneTop` — 有/无内容侵犯
- `checkSafeZoneRight` — 有/无内容侵犯
- `checkSafeZoneBottom` — 有/无内容侵犯
- `checkContentPresence` — 有/无内容
- `checkNotAllBlack` — 全黑/非全黑
- `runFrameAnalysis` — 整合结果

测试使用构造的 PixelBuffer（合成像素数据），不依赖真实 PNG。

### 修改文件

#### 4. `verify-video.mjs` — 集成帧分析

在 post-render 模式下，在 subtitle checks 之后、manual items 之前加一个新 section：

```js
// ─── Post-render: Remotion frame analysis ───
if (!preMode && results.fail.length === 0) {
  // Only run for Remotion-rendered content
  const isRemotion = meta?.renderer === "remotion" || /* detect */;
  if (isRemotion && existsSync(VIDEO_PATH)) {
    console.log("\n🖼️ Remotion Frame Analysis");
    console.log("─".repeat(50));
    try {
      execSync(`node "${join(__dirname, "verify-remotion-frames.mjs")}" --content "${contentDir}" --video "${VIDEO_PATH}"`, {
        stdio: "inherit",
      });
      pass("Frames", "Frame analysis passed", "");
    } catch {
      fail("Frames", "Frame analysis failed", "See output above", "Fix layout issues in Remotion components");
    }
  }
}
```

#### 5. 依赖：`pngjs`

纯 JavaScript PNG 解码器，无 native 依赖。

```bash
npm install pngjs --save
```

在 `scripts/short-video/` 目录下安装。

## 不改的部分

- `verify-scene-dom.mjs` — 不改（Playwright 路径的 DOM 验证保持独立）
- `lib/safe-zones.mjs` — 不改（直接复用 SAFE_ZONES 常量）
- `lib/timeline.mjs` — 不改（直接复用 sceneClipFrames）
- `lib/scene-rules.mjs` — 不改（数据验证规则不变）
- `lib/media-bg.mjs` — 不改（media 验证不变）

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件               | 修改内容                                | 风险等级 | 评估                                                                                          |
| ------------------ | --------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `verify-video.mjs` | 加 post-render 帧分析 section（~15 行） | **Low**  | 纯追加，在现有 fail 检查之后。只在 Remotion 内容 + video 存在时触发。非 Remotion 内容不受影响 |
| `package.json`     | 加 pngjs 依赖                           | **Low**  | 纯 JS 库，无 native 依赖，不影响构建                                                          |

### Section 2: Behavioral Scenarios

| #   | Scenario                                     | Expected Behavior                                       | Risk   | Mitigation                                   |
| --- | -------------------------------------------- | ------------------------------------------------------- | ------ | -------------------------------------------- |
| 1   | Remotion 渲染的视频，所有场景 safe zone 合规 | 所有帧分析 pass                                         | Low    | 正常路径                                     |
| 2   | 某场景文字越过 top safe zone (y<220)         | checkSafeZoneTop → fail, detail 含 brightPixelRatio     | Medium | 阈值 5% 可调，避免背景层误报                 |
| 3   | 某场景文字被右侧 action rail 遮挡 (x>880)    | checkSafeZoneRight → fail                               | Medium | 限定 y∈[640,1775] 范围                       |
| 4   | 某场景内容侵入字幕通道上沿 (y∈[1150,1188])   | checkSafeZoneBottom → fail                              | Low    | 窄区域检查                                   |
| 5   | 某场景内容区为空（渲染 bug）                 | checkContentPresence → warn                             | Low    | warn 不阻断，提示人工检查                    |
| 6   | 渲染失败，全黑帧                             | checkNotAllBlack → fail                                 | Medium | 拦截渲染管线错误                             |
| 7   | Playwright 路径渲染的视频                    | 帧分析不触发（meta.renderer !== "remotion"）            | Low    | 条件判断                                     |
| 8   | 视频文件不存在                               | 帧分析 section 跳过（results.fail.length > 0 时不执行） | Low    | 前置检查                                     |
| 9   | 背景层 (GridBg/Glow/Scanlines) 存在          | 不误报 safe zone 违规                                   | Medium | BRIGHT_THRESHOLD=80 高于背景层 luminance     |
| 10  | 字幕烧录后的帧（底部有字幕文字）             | 不误报 bottom safe zone 违规                            | Medium | bottom 检查区域 y∈[1150,1188] 在字幕通道上方 |
| 11  | ffmpeg 提取帧失败                            | 该场景 skip + warn                                      | Low    | try/catch 容错                               |
| 12  | PNG 解析失败                                 | 该场景 skip + warn                                      | Low    | try/catch 容错                               |

## 测试覆盖

矩阵行 1-12 → 测试用例：

- `frame-analysis.test.mjs`：#1-6, #9-10（纯函数，构造 PixelBuffer）
- `verify-remotion-frames.mjs` 集成测试：#7-8, #11-12（CLI 行为，mock ffmpeg/pngjs）
