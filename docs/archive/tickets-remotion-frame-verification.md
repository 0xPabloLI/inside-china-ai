# Tickets: Remotion 帧图片分析验证

> Spec: docs/specs/spec-remotion-frame-verification.md

## T-1: lib/frame-analysis.mjs — 纯函数像素分析模块

**依赖**：无
**阻塞**：T-2, T-3

**交付物**：

- `scripts/short-video/lib/frame-analysis.mjs`
- `scripts/short-video/__tests__/frame-analysis.test.mjs`

**内容**：

- `luminance(r, g, b)` — 亮度计算
- `getPixel(buf, x, y)` — 从 PixelBuffer 读取像素
- `sampleRegion(buf, region, step)` — 区域采样
- `countBrightPixels(buf, region, threshold, step)` — 亮像素计数
- `checkSafeZoneTop(buf, safeZones)` — 顶部安全区检查
- `checkSafeZoneRight(buf, safeZones)` — 右侧安全区检查
- `checkSafeZoneBottom(buf, safeZones)` — 底部安全区检查
- `checkContentPresence(buf, safeZones)` — 内容存在性检查
- `checkNotAllBlack(buf)` — 全黑检查
- `runFrameAnalysis(buf, safeZones)` — 整合所有检查

**常量**：

- `BRIGHT_THRESHOLD = 80`
- `BRIGHT_RATIO_FAIL = 0.05`
- `SAMPLE_STEP = 8`
- `BLACK_THRESHOLD = 5`

**测试覆盖**：Scenario matrix 行 1-6, 9-10

**验收**：

- `npx vitest run __tests__/frame-analysis.test.mjs` 全绿
- 所有函数为纯函数（无 IO、无副作用）

---

## T-2: verify-remotion-frames.mjs — CLI 入口 + ffmpeg 帧提取

**依赖**：T-1
**阻塞**：T-3

**交付物**：

- `scripts/short-video/verify-remotion-frames.mjs`
- `scripts/short-video/package.json` 加 `pngjs` 依赖

**内容**：

- CLI: `--content <dir> --video <path>`
- 加载 scene-data.mjs + safe-zones.mjs + timeline.mjs
- 计算每个场景中间帧号
- ffmpeg 提取帧 PNG
- pngjs 解析 PNG → PixelBuffer
- 调用 `runFrameAnalysis()` → 输出结果
- 汇总 pass/warn/fail，exit 0/1
- 清理临时文件

**测试覆盖**：Scenario matrix 行 7-8, 11-12（集成行为）

**验收**：

- 对已渲染的 Remotion 视频执行，输出 pass/warn/fail 汇总
- 非 Remotion 内容不触发
- ffmpeg/pngjs 失败时容错（skip + warn）

---

## T-3: verify-video.mjs 集成帧分析

**依赖**：T-1, T-2
**阻塞**：无

**交付物**：

- `scripts/short-video/verify-video.mjs` 修改

**内容**：

- 在 post-render 模式下，subtitle checks 之后、manual items 之前
- 检测 Remotion 内容（meta.renderer === "remotion"）
- 调用 `verify-remotion-frames.mjs`
- 结果合入 verify-video.mjs 的 pass/warn/fail 汇总

**验收**：

- `node verify-video.mjs --content <remotion-content>` 在 post-render 模式下自动执行帧分析
- `node verify-video.mjs --pre --content <dir>` 不执行帧分析（pre-render 模式）
- 非 Remotion 内容不执行帧分析
