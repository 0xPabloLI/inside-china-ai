# Handoff: Real-ESRGAN 超分辨率集成

## 任务目标

在短视频管线中集成 Real-ESRGAN，对低于 720p 的视频/图片素材自动超分辨率到 720p。独立模块，不依赖其他 AI 模型。

## 设备环境

- **Mac**: MacBook Pro, Apple M2 Pro, 32GB 统一内存
- **统一 venv**: `~/.video-tts-env`（Python 3.12, Homebrew python@3.12）
- **ffmpeg**: `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`（完整版，含 rubberband 等滤镜支持）
- **项目根**: `/Users/pabloli/Documents/code/inside-china-ai`

## Real-ESRGAN 方案

### 安装

使用 macOS 原生 ncnn-vulkan 可执行文件（不需要 PyTorch/CUDA）：

```bash
# 下载 macOS 版
wget https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip
unzip realesrgan-ncnn-vulkan-20220424-macos.zip -d ~/.local/realesrgan/
# 验证
~/.local/realesrgan/realesrgan-ncnn-vulkan -h
```

### 使用参数

```bash
# 视频超分辨率（480p → 720p）
# 使用 realesr-animevideov3 模型（视频专用，小模型，快）
# -s 2 放大2倍后裁剪到目标分辨率
~/.local/realesrgan/realesrgan-ncnn-vulkan \
  -i input.mp4 \
  -o output.mp4 \
  -n realesr-animevideov3 \
  -s 2 \
  -t 256  # tile size，小一点减少内存
```

### 模型选择

| 模型 | 用途 | 大小 | 速度 |
|------|------|------|------|
| `realesr-animevideov3` | 视频专用（默认选这个） | 小 | 快 |
| `RealESRGAN_x4plus` | 通用图片超分 | 大 | 慢 |

### 资源消耗（480→720, 15s 视频）

- 内存: ~1-2GB
- GPU: Apple GPU ~30-50%
- 处理时间: ~30-60 秒

## 集成方案

### 新文件: `scripts/short-video/lib/upscale.mjs`

```
功能：
  - checkResolution(filePath) → { width, height, needsUpscale }
  - upscaleVideo(inputPath, outputPath, targetHeight=720) → { success, path }
  - upscaleImage(inputPath, outputPath, targetHeight=720) → { success, path }
  - autoUpscaleIfNeeded(filePath) → { upscaled: boolean, path: string }
```

### 集成点: `scripts/short-video/lib/asset-sourcer.mjs`

在 `downloadAsset()` 和 `downloadYtdlp()` 之后，调用 `autoUpscaleIfNeeded()`：

```js
// asset-sourcer.mjs 下载流程修改
const dlResult = await downloadAsset(candidate.url, destPath, headers);
if (dlResult.success) {
  // 新增：检查分辨率，低于 720p 自动超分
  const upscaleResult = await autoUpscaleIfNeeded(dlResult.path);
  // ...
}
```

### 分辨率规则

- 素材 height < 720 → 超分辨率到 720p
- 素材 height >= 720 → 不处理
- 图片和视频都适用
- 超分后替换原文件（或输出到 `-upscaled` 后缀文件）

### 同时修改: yt-dlp 下载参数

当前 `downloadYtdlp()` 参数：
```js
'-f "best[height<=720][ext=mp4]/best[height<=720]/bestvideo[height<=720]+bestaudio/best"',
"--max-filesize 20M",
'--download-sections "*0:00-0:08"',
```

建议改为（下载完整视频，不截取，不限制 720p——因为超分辨率可以处理低分辨率）：
```js
'-f "best[height<=1080][ext=mp4]/best[height<=1080]/bestvideo[height<=1080]+bestaudio/best"',
"--max-filesize 50M",
// 移除 --download-sections，改为下载完整视频由 AI 分析层做智能片段选择
```

**注意**：yt-dlp 参数修改和 Real-ESRGAN 集成可以分开做。Real-ESRGAN 先做（独立），yt-dlp 参数修改等 AI 分析层搭好后再做（因为去掉 --download-sections 需要智能片段选择替代）。

## 测试方案

1. 单元测试 `upscale.mjs` 的纯函数（`checkResolution` 用 mock ffprobe 输出）
2. 集成测试：找一个 480p 短视频，跑 `autoUpscaleIfNeeded()`，验证输出是 720p
3. 验证：`ffprobe` 检查输出分辨率

## AGENTS.md 工作流

此改动涉及 `scripts/short-video/lib/` 下代码，属于 Substantial implementation，需走 mandatory workflow：
1. Grill → 2. Spec → 3. Tickets → 4. TDD → 5. Code Review → 6. Runtime Verify → 7. Commit

## 相关上下文

- 当前 `asset-sourcer.mjs` 的 `downloadYtdlp()` 在 `scripts/short-video/lib/asset-sourcer.mjs` 第 523-565 行
- `downloadAsset()` 在第 450-480 行
- 统一 venv 已有：`~/.video-tts-env`（Python 3.12）
- ffmpeg 完整版路径：`/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`
- 项目约定：Node.js 调用外部工具用 `execSync`/`execFileSync`，与 TTS 引擎调用模式一致

## 建议的 Skill

- `tdd` — 先写测试再实现
- `implement` — 实施 skill
- `code-review` — 完成后审查

## 前置依赖

无。Real-ESRGAN ncnn-vulkan 是独立的可执行文件，不依赖 Python/PyTorch/CUDA。只需要下载二进制文件。
