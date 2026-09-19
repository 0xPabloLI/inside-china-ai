# Deep Research: M2 Pro 32GB 本地图片生成模型选型（2026-09-19）

## 背景
- 硬件：Apple M2 Pro / 32GB 统一内存
- 当前：Z-Image Turbo 4bit (6B, ~5.5GB)，每张 1024×1024 约 3-4 分钟
- 用途：短视频 B-roll 背景生成（抽象数据可视化、科技氛围图，无文字）
- 限制：huggingface.co 被 Clash TUN 拦截，hf-mirror.com 可用

## Top 3 推荐

### 1. FLUX.2-klein-4B（首选）
- 4B 参数，4 步，4bit ~3GB，预计 ~1-1.5 min/张
- Apache 2.0，非 gated，可直接通过 hf-mirror 下载
- Black Forest Labs 2026-01 发布，FLUX 下一代
- 命令：`mflux-generate-flux2 --model flux2-klein-4b`

### 2. ERNIE-Image-Turbo
- 8B 参数，8 步，4bit ~5GB，预计 ~4-5 min/张
- Apache 2.0，非 gated（百度出品）
- "vivid high-contrast output" 适合科技氛围图
- 命令：`mflux-generate-ernie-image-turbo`

### 3. Boogu Image Turbo
- 10B 参数，1024² 需 8 步，4bit ~6GB，预计 ~2-3 min/张
- Apache 2.0，非 gated
- 命令：`mflux-generate-boogu`

### 备选：Krea 2 Turbo（效果最强但 gated）
- 12B，Artificial Analysis leaderboard top 10
- 需先在 huggingface.co 接受协议（被 Clash TUN 拦截）

## 不推荐
- Qwen-Image-2512：30 步太慢（~35-40 min/张），图像偏 soft
- Ideogram 4：gated + 擅长文字（B-roll 不需要）
- FIBO：gated + 需 JSON prompt

## 决策建议
先试 FLUX.2-klein-4B（最快最省），不满意再试 ERNIE-Image-Turbo（8B 更大），都不满意再解决 Krea 2 gated 问题。