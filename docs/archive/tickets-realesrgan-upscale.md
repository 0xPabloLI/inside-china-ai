# Tickets: Real-ESRGAN 超分辨率集成

## 依赖图

```
T-1 (下载安装 Real-ESRGAN)
  └─→ T-2 (upscale.mjs: checkResolution)
        └─→ T-3 (upscale.mjs: upscaleVideo + upscaleImage)
              └─→ T-4 (upscale.mjs: autoUpscaleIfNeeded)
                    └─→ T-5 (集成到 asset-sourcer.mjs)
```

---

## T-1: 下载安装 Real-ESRGAN ncnn-vulkan

**依赖**：无

**内容**：

- 用 `curl -L -o` 下载 macOS 版 Real-ESRGAN v0.2.5.0
- 解压到 `~/.local/realesrgan/`
- 验证二进制可执行：`~/.local/realesrgan/realesrgan-ncnn-vulkan -h`
- 确认 `models/` 子目录含 `realesr-animevideov3` 和 `RealESRGAN_x4plus` 模型

**完成标准**：`~/.local/realesrgan/realesrgan-ncnn-vulkan -h` 输出帮助信息，无错误。

---

## T-2: `upscale.mjs` — `checkResolution()` 纯函数

**依赖**：T-1

**内容**：

- 新建 `scripts/short-video/lib/upscale.mjs`
- 实现 `checkResolution(filePath)`：
  - 用 `execSync` 调用 ffprobe 获取宽高
  - 返回 `{ width, height, needsUpscale, isVideo }`
  - `needsUpscale = Math.min(width, height) < 720`
  - `isVideo` 按扩展名判断（`.mp4/.mov/.avi/.mkv` = video，`.jpg/.jpeg/.png/.webp` = image）
- 文件不存在 → `{ width: 0, height: 0, needsUpscale: false, isVideo: false }`
- ffprobe 执行失败 → `{ width: 0, height: 0, needsUpscale: false, isVideo: false }` + warning

**完成标准**：单元测试覆盖场景 #8（文件不存在）、#9（不支持格式）、#10（ffprobe 失败）。纯函数可 mock execSync 测试。

---

## T-3: `upscale.mjs` — `upscaleVideo()` + `upscaleImage()`

**依赖**：T-2

**内容**：

- 实现 `upscaleVideo(inputPath, outputPath, targetShortSide=720)`：
  - 调用 Real-ESRGAN `realesr-animevideov3 -s 2 -t 256`
  - 再用 ffmpeg 缩放到目标分辨率（`-vf scale=-1:1280` 竖版 / `scale=720:-1` 横版）
  - 返回 `{ success, path, error? }`
- 实现 `upscaleImage(inputPath, outputPath, targetShortSide=720)`：
  - 调用 Real-ESRGAN `RealESRGAN_x4plus -s 2`
  - 再用 ffmpeg 缩放到目标分辨率
  - 返回 `{ success, path, error? }`
- Real-ESRGAN 二进制路径：`~/.local/realesrgan/realesrgan-ncnn-vulkan`
- ffmpeg/ffprobe 路径：`/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`

**完成标准**：场景 #6（二进制不存在）、#7（执行失败）、#11（ffmpeg 失败）的降级路径测试。

---

## T-4: `upscale.mjs` — `autoUpscaleIfNeeded()`

**依赖**：T-3

**内容**：

- 实现 `autoUpscaleIfNeeded(filePath, targetShortSide=720)`：
  - 调用 `checkResolution(filePath)`
  - `needsUpscale=false` → 返回 `{ upscaled: false, path: filePath }`
  - `needsUpscale=true` → 调用 `upscaleVideo` 或 `upscaleImage`（按 isVideo）
  - 输出路径：`<dir>/<basename>-upscaled.<ext>`
  - 超分成功 → 返回 `{ upscaled: true, path: outputPath }`
  - 超分失败 → 返回 `{ upscaled: false, path: filePath, error: "..." }`
- 二进制不存在 → 直接返回 `{ upscaled: false, path: filePath }` + warning

**完成标准**：场景 #1-#5（正常路径+跳过）、#6（降级）全部测试。

---

## T-5: 集成到 `asset-sourcer.mjs`

**依赖**：T-4

**内容**：

- 在 `asset-sourcer.mjs` 顶部 import `autoUpscaleIfNeeded`
- 在 `main()` 函数中：
  - API 下载成功后（约第 1460 行），调用 `autoUpscaleIfNeeded(dlResult.path)`，用返回的 path 更新 `assetEntry.path`
  - yt-dlp 下载成功后（约第 1515 行），调用 `autoUpscaleIfNeeded(dlResult.path)`，用返回的 path 更新 asset entry
- 超分日志：`console.log("    📈 Upscaled: <filename> → 720p")`

**完成标准**：场景 #12（path 更新）验证。现有 asset-sourcer 测试不 break。
