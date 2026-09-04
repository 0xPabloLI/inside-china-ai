# Spec: Real-ESRGAN 超分辨率集成

## 概述

在短视频管线中集成 Real-ESRGAN ncnn-vulkan，对低于 720p 的视频/图片素材自动超分辨率到 720p。独立模块，不依赖 Python/PyTorch/CUDA。

## 动机

asset-sourcer 下载的素材（Pexels 图片、YouTube 视频、CDP 抓取的新闻图片）分辨率参差不齐，低于 720p 的素材在最终 1080×1920 视频中会模糊。Real-ESRGAN 自动超分提升素材质量。

## 方案

### 工具

- **Real-ESRGAN ncnn-vulkan** (v0.2.5.0, macOS) — 独立二进制，基于 Vulkan/Metal，不需要 PyTorch
- 安装路径：`~/.local/realesrgan/realesrgan-ncnn-vulkan`
- 模型文件在同目录的 `models/` 子目录中

### 模型选择

| 模型                   | 用途                       | 文件类型                         |
| ---------------------- | -------------------------- | -------------------------------- |
| `realesr-animevideov3` | 视频超分（小模型，快）     | `.mp4`, `.mov`, `.avi`, `.mkv`   |
| `RealESRGAN_x4plus`    | 图片超分（大模型，质量好） | `.jpg`, `.jpeg`, `.png`, `.webp` |

### 放大策略

1. Real-ESRGAN 用 `-s 2`（2x 整数放大）处理
2. ffmpeg 精确缩放到目标分辨率（`-vf scale=-1:<target>`）
3. 输出到 `<basename>-upscaled.<ext>`（不替换原文件）

### 目标分辨率规则

- 参数 `targetShortSide=720`（竖版视频的短边 = 宽度）
- `Math.min(width, height) < targetShortSide` → 需要超分
- 竖版（width < height）：`scale=-1:1280`（高=1280，宽按比例）
- 横版（width > height）：`scale=720:-1`（宽=720，高按比例）

### 新文件：`scripts/short-video/lib/upscale.mjs`

```
导出函数：
  - checkResolution(filePath) → { width, height, needsUpscale, isVideo }
  - upscaleVideo(inputPath, outputPath, targetShortSide=720) → { success, path, error? }
  - upscaleImage(inputPath, outputPath, targetShortSide=720) → { success, path, error? }
  - autoUpscaleIfNeeded(filePath, targetShortSide=720) → { upscaled: boolean, path: string, error? }
```

### 集成点：`scripts/short-video/lib/asset-sourcer.mjs`

在 `main()` 函数中：

- API 下载成功后（约第 1459 行），调用 `autoUpscaleIfNeeded(dlResult.path)`
- yt-dlp 下载成功后（约第 1515 行），调用 `autoUpscaleIfNeeded(dlResult.path)`
- 如果 `upscaled=true`，更新 `allAssets` 中的 `path` 指向超分后文件

### 降级策略

- Real-ESRGAN 二进制不存在 → 跳过 + warning
- ffprobe 解析失败 → 跳过 + warning
- Real-ESRGAN 执行失败 → 返回原路径 + error log
- ffmpeg 缩放失败 → 返回 Real-ESRGAN 输出（可能尺寸不对）+ warning
- 不支持的文件格式 → 跳过

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件                                             | 修改内容                                                                                   | 风险等级 | 评估                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `scripts/short-video/lib/upscale.mjs`            | 新建文件：checkResolution, upscaleVideo, upscaleImage, autoUpscaleIfNeeded                 | Low      | 纯新文件，不修改现有逻辑                                                                        |
| `scripts/short-video/lib/asset-sourcer.mjs`      | `main()` 中 API 下载成功后 + yt-dlp 下载成功后各加 `autoUpscaleIfNeeded()` 调用，更新 path | Medium   | 只追加逻辑到下载成功分支，不改原有流程。下游 asset-report.json 和 media-patch.json 用超分后路径 |
| `scripts/short-video/__tests__/upscale.test.mjs` | 新建文件：单元测试                                                                         | Low      | 纯新文件                                                                                        |

### Section 2: Behavioral Scenarios

| #   | Scenario                                          | Expected Behavior                       | Risk   | Mitigation                            |
| --- | ------------------------------------------------- | --------------------------------------- | ------ | ------------------------------------- |
| 1   | 视频素材 480x854（竖版，width<720）               | 超分到 720x1280，返回新路径             | Low    | Real-ESRGAN 2x + ffmpeg scale=-1:1280 |
| 2   | 视频素材 720x1280（已达标）                       | 不处理，返回原路径                      | Low    | checkResolution needsUpscale=false    |
| 3   | 视频素材 1080x1920（高于 720p）                   | 不处理，返回原路径                      | Low    | checkResolution needsUpscale=false    |
| 4   | 图片素材 640x1138（竖版，width<720）              | 超分到 720x1280，返回新路径             | Low    | Real-ESRGAN 2x + ffmpeg scale=-1:1280 |
| 5   | 图片素材 720x1280（已达标）                       | 不处理，返回原路径                      | Low    | checkResolution needsUpscale=false    |
| 6   | Real-ESRGAN 二进制不存在                          | 跳过超分，返回原路径 + warning          | Medium | existsSync 检查 + 降级                |
| 7   | Real-ESRGAN 执行失败（GPU 错误）                  | 返回原路径 + error log                  | Medium | try/catch 降级                        |
| 8   | 文件不存在（已删除）                              | checkResolution 返回 needsUpscale=false | Low    | existsSync 检查                       |
| 9   | 不支持的文件格式（.gif, .webm）                   | 跳过超分，返回原路径                    | Low    | 扩展名白名单                          |
| 10  | checkResolution 解析 ffprobe 输出失败             | 返回 needsUpscale=false + warning       | Medium | try/catch 降级                        |
| 11  | 超分后 ffmpeg 缩放失败                            | 返回 Real-ESRGAN 输出 + warning         | Medium | 降级到可用输出                        |
| 12  | yt-dlp 下载的素材超分后，allAssets 中的 path 更新 | 指向 -upscaled 文件                     | Medium | main() 中用返回的新 path 替换         |

## 测试方案

- **单元测试** `upscale.test.mjs`：mock `execSync` 测试 `checkResolution` 的 ffprobe 解析；测试降级路径（二进制不存在、文件不存在、不支持格式）
- **集成测试**：用真实 480p 短视频跑 `autoUpscaleIfNeeded()`，验证输出 720p
- **验证**：`ffprobe` 检查输出分辨率

## 不做

- yt-dlp 参数修改（等 AI 分析层搭好后再做）
- 视频音频流保留（超分输出无音频，B-roll 素材可接受）
- 超分结果缓存（每次重新处理）
