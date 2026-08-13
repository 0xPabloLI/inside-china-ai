# 数字人模型测试进度追踪

> **最后更新**：2026-08-11（新增 2026-08-11 调研发现的 5 个待测模型）
> **设备**：MacBook Pro M2 Pro 32GB, macOS 26.5.1
> **主文档**：`docs/research/digital-human-solutions-m2-pro.md`
> **用途**：多 session 共享追踪文件，每次测试后更新此文件

---

## 测试总览

### 本地模型

| # | 模型 | 技术路线 | 分辨率 | MPS | 商用 | 状态 | 日期 |
|---|------|---------|--------|-----|------|------|------|
| 1 | ~~MuseTalk 1.5 MLX~~ | VAE 替换 | 256px | ✅ MLX | ✅ MIT | ❌ 放弃 | 2026-08-09 |
| 2 | ~~SadTalker~~ | 3DMM | — | ✅ | ❌ | ❌ 效果差 | 2026-08-09 |
| 3 | ~~LatentSync 1.5~~ | 扩散+SyncNet | 256px | ✅ (需 patch) | ✅ OpenRAIL++ | ❌ 效果差 | 2026-08-10 |
| 4 | ~~LatentSync 1.6~~ | 扩散+SyncNet | 512px | ❌ MPS OOM | ✅ OpenRAIL++ | ❌ OOM | 2026-08-10 |
| 5 | ~~Sonic~~ | SVD 扩散 | — | ❌ 不可用 | ❌ 非商用 | ❌ 不可用 | 2026-08-10 |
| 6 | ~~Hallo2~~ | 分层扩散 | 256px | ✅ MPS | ✅ MIT | ❌ 256px 太低 | 2026-08-10 |
| 7 | ~~LivePortrait~~ | Warping | 826×1062 | ✅ MPS | ✅ | ❌ 无音频驱动 | 2026-08-10 |
| 8 | ~~V-Express~~ | 渐进式扩散 | — | ❌ MPS 太慢 | ❓ | ❌ 17min/sub-step | 2026-08-11 |
| 9 | **PersonaLive** | 流式扩散 | — | ⚠️ 待验证 | ❌ 非商用 | 📋 待测 | — |
| 10 | **LongCat-VA-1.5 MLX** | MLX 扩散 | 432×256 | ✅ MLX | ✅ MIT | ✅ **成功！** | 2026-08-12 |
| 11 | **EchoMimicV3** | Wan2.1 扩散 | — | ⚠️ 下载阻塞 | ❓ | 📋 待测 | — |
| 10 | **LongCat-Video-Avatar-1.5** | DiT + 音频驱动 | — | ✅ **有 MLX 移植** | ✅ MIT | 📋 待测 | — |
| 11 | **InfiniteTalk** | 稀疏帧视频配音 | — | ⚠️ 待测 | ✅ Apache 2.0 | 📋 待测 | — |
| 12 | **Hallo3** | Transformer DiT | — | ⚠️ 待测 | ✅ MIT | 📋 待测 | — |
| 13 | **EchoMimicV3** | 多任务扩散 | — | ⚠️ 待测 | ✅ Apache 2.0 | 📋 待测 | — |
| 14 | **FeatherTalk** | 轻量级框架 | — | ⚠️ 待测 | ❓ | 📋 待测 | — |
| 15 | **LTX-2.3 + AV-LoRA-talking-head** | DiT + LoRA | — | ❌ 22B 需大显存 | ✅ OpenRAIL | 📋 低优先级 | — |

### 云端 API

| # | 平台 | 端点 | 输入 | 状态 | 测试文件 | 日期 |
|---|------|------|------|------|---------|------|
| 1 | **D-ID** | `/talks` | 照片 + 音频 | ✅ 已验证 | `did-pablo-weixin-f5tts.mp4` (1.5MB) | 2026-08-10 |
| 2 | **D-ID** | `/clips` | 预置 Presenter + TTS | ✅ 已验证 | `did-clip-jack-test.mp4` (1.7MB) | 2026-08-10 |
| 3 | **HeyGen** | v2/generate | Custom Avatar + TTS | ✅ 已验证 | `heygen-pablo-test.mp4` (467KB) | 2026-08-10 |

---

## 已完成测试详情

### ❌ MuseTalk 1.5 MLX

- **日期**：2026-08-09
- **结论**：**放弃** — VAE 架构导致嘴部模糊，不可修复的架构问题
- **理由**：VAE 潜空间压缩/解压丢失高频细节（牙齿纹理、嘴唇边缘），单步替换无细化网络
- **清理**：安装目录、模型文件、测试视频均已删除

### ❌ SadTalker

- **日期**：2026-08-09
- **结论**：**效果差** — 恐怖谷眼神，表情僵硬
- **理由**：3DMM 方案虽然嘴部不模糊，但头部运动有限，整体不自然
- **清理**：已删除本地安装（3.5GB）

### ❌ LatentSync 1.5

- **日期**：2026-08-10
- **结论**：**效果差** — 远未达到商用质量
- **MPS Patch**：10 项（详见主文档 §3.2.1）
- **版本教训**：1.5 checkpoint 必须用 1.5 代码，1.6 代码不兼容（`affine_transform.py` 235 行差异）
- **test1/test2**：用 1.6 代码跑 1.5 checkpoint → 嘴巴完全扭曲
- **test3**：纯 1.5 代码 + 1.5 checkpoint → 比前两次好一些但仍然很差
- **根本问题**：256×256 分辨率不足以生成清晰的嘴部细节
- **推理性能**：17 分钟 / 5.28s 视频（affine 8min + diffusion 9min）
- **清理**：已删除 checkpoint（3.2GB），测试视频已删除

### ❌ LatentSync 1.6

- **日期**：2026-08-10
- **结论**：**失败** — 512px 推理 MPS OOM，32GB 内存不够
- **MPS Patch**：6 项（详见主文档 §3.2.2）
- **Run 1**：标准 MPS → OOM at `scaled_dot_product_attention`（MPS allocated: 29.34 GB, tried to allocate 8 GB）
- **Run 2**：`PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0` 禁用内存上限 → 进程被 macOS 内存压力杀手杀掉
- **根本问题**：512×512 分辨率的 UNet 推理需要 ~38GB 内存，M2 Pro 32GB 物理内存不足
- **清理**：已删除 checkpoint（4.7GB）

### ❌ Sonic (ComfyUI_Sonic) — fp32 第 1 步可完成但第 2 步系统崩溃

- **日期**：2026-08-10
- **结论**：**fp32 可工作但速度不实用** — fp16/bf16 死锁，fp32 第 1 步耗时 78 分钟
- **环境**：
  - ComfyUI 0.31.0 + ComfyUI_Sonic（最新 main 分支）
  - Python 3.11.14, PyTorch 2.13.0, MPS 后端
  - macOS 26.5.1, M2 Pro 32GB 统一内存
- **模型加载**：✅ 全部成功
  - SVD checkpoint（svd_xt.safetensors, 9.1GB）→ 2.9GB 加载到 MPS
  - Sonic UNet（unet.pth, 5.9GB）→ 167 weights 加载
  - CLIP Vision → 1.2GB
  - VAE/AutoencodingEngine → 186MB
  - whisper-tiny, yoloface_v5m, audio2bucket, audio2token, RIFE/flownet → 全部加载
- **音频预处理**：✅ 正常
  - 检测音频时长 5.228s，推理时长 5.0s
  - 面部检测（yoloface）+ 裁切 + 对齐 → 62/62 步完成
- **MPS 推理 — fp16/bf16（死锁）**：
  - Run 1（fp16, 512px, 25 steps）："Start infer" 后进度卡在 0/25，进程进入 U 状态，CPU 降为 0%，CPU 时间停止增长
  - Run 2（bf16, 256px, 5 steps）：同样卡在 0/5，同样死锁
  - 根本原因：SVD UNet 前向传播中某个 MPS 算子对 fp16/bf16 大张量死锁（PyTorch issue #154828：MPS 32-bit 索引器限制）
- **MPS 推理 — fp32（可工作但极慢 + 系统崩溃）**：
  - Run 3（**fp32**, 256px, 5 steps）：**第 1 步完成！** 耗时 78 分钟（进度从 0/5 → 1/5）
  - CPU TIME 持续增长（Start infer 后 +614s/82min = 12% 效率），证明进程在工作
  - 第 2 步开始后，Metal 着色器编译器（MTLCompilerService）在 LLVM 优化阶段崩溃（SIGABRT）
  - 崩溃连锁：MTLCompilerService → CatPawAI Helper → Chrome Helper → 系统无响应 → 重启
  - 根因：SVD UNet fp32 运算生成的 Metal 着色器代码过于复杂，LLVM AlwaysInliner + SROA 优化通道内存溢出
  - **不能断点续传**：ComfyUI 不保存推理中间状态，重启后全部丢失
  - **结论**：fp32 第 1 步可完成但第 2 步导致系统崩溃——整体不可用
- **根因分析**（GitHub Issue 调研）：
  - ComfyUI_Sonic Issue #105：Mac ARM 用户确认 "fp16 not working on mac arm!!! only fp32 work!!!"
  - PyTorch Issue #154828（已关闭）：MPS 后端对 fp16/bf16 大张量使用 32-bit 索引器溢出，报 "Can't be indexed using 32-bit iterator" 错误
  - PyTorch 2.13.0 修复了报错但引入了新的 MPS kernel 死锁（旧版报错退出，新版无限等待）
  - fp32 张量不触发 32-bit 索引限制，所以可以工作
- **服务器启动**：~3-4 分钟（Sonic 插件 import 耗时 54 秒）
- **磁盘占用**：ComfyUI + Sonic 模型 + SVD checkpoint ≈ 17GB
- **清理**：保留安装（ComfyUI 可复用于其他插件），待后续决定是否清理
- **SVD 模型说明**：当前使用 `svd_xt.safetensors`（原始版）；`svd_xt_1_1.safetensors`（改进版）需 HuggingFace 认证，用户已认证但尚未下载替换

### ❌ Hallo2 — 256px 分辨率太低，最终放弃

- **日期**：2026-08-10 ~ 2026-08-11
- **结论**：**放弃** — 256px 分辨率太低，无法生成清晰的嘴部细节
- **环境**：Hallo2 (ICLR 2025, 复旦), Python 3.13, PyTorch 2.13.0, MPS
- **MPS Patch**：4 个文件（device 选择、audio_processor、motion_module xformers、util seed guard）
- **测试配置**：
  - v1: fp32, 256px, 5 steps → 256×256, 5.24s, 475KB, ~5min
  - v2: fp16, 256px, 40 steps → 256×256, 5.24s, 366KB, ~40min
  - v3: fp16, 512px, 40 steps → ❌ 太慢 (235s/step, 预估 4.8 天)
  - v4: 微信照片 + fp16, 256px, 40 steps → 256×256, 5.24s, 377KB
- **关键发现**：
  - SD1.5 UNet 在 MPS 上完全没问题（vs SVD UNet 死锁）
  - fp16 在 SD1.5 上无死锁（vs SVD 的 fp16 死锁）
  - 40 步比 5 步清晰，但 256px 分辨率是硬伤——嘴部只有 ~30×30 像素
  - 512px 在 M2 Pro 上 235s/step，完全不实用
- **512px 为什么慢**：512px 的计算量是 256px 的 4 倍，但实际慢了 ~150 倍（1.35s → 235s），可能是 MPS attention 矩阵大小超过优化阈值
- **清理**：已删除（14GB）

### ❌ LivePortrait — 无原生音频驱动，D-ID 转接效果差

- **日期**：2026-08-10 ~ 2026-08-11
- **结论**：**放弃** — 视频驱动模型，无原生音频驱动；D-ID 视频转接效果不理想
- **环境**：LivePortrait (KwaiVGI, 18.9k stars), Python 3.13, onnxruntime-silicon
- **模型大小**：~600MB（vs Hallo2 的 12GB）
- **测试配置**：
  - v1: 示例照片 + d0.mp4 驱动 → 724×724, 3.12s, ✅ 高分辨率
  - v2: 用户照片 IMG_7975 + d6.mp4 驱动 → 718×1280, 33.6s, ✅ 高分辨率
  - v3: 微信照片 + d0.mp4 驱动 → 826×1062, 3.12s, ✅ 高分辨率
  - v4: 微信照片 + D-ID 视频驱动 → 826×1062, 10.44s, ❌ 效果不理想
- **优势**：
  - 官方支持 macOS Apple Silicon
  - 模型仅 600MB，秒级生成
  - 原图分辨率输出（724×724 ~ 826×1062）
- **劣势**：
  - **视频驱动**，非音频驱动——嘴部动作来自驱动视频
  - D-ID 视频转接方案：D-ID 生成有唇形同步的视频 → LivePortrait 提取表情 → 重新渲染，但效果不理想
  - 微信照片 bc927 在 LivePortrait 和 D-ID 上都检测不到人脸
- **清理**：已删除（3.3GB）

### ✅ D-ID `/talks`（照片 → 说话视频）

- **日期**：2026-08-10
- **结论**：**已验证，效果尚可** — 纯照片 + 音频 → 说话视频，嘴部同步
- **输入**：Weixin 照片 + F5-TTS 中文音频
- **输出**：826×1062 视频，12.7s，1.55MB
- **测试文件**：`scripts/short-video/assets/did-pablo-weixin-f5tts.mp4`
- **API 认证**：Basic Auth（`Authorization: Basic <base64(key)>`）
- **优势**：最快速"照片→说话"，API 调用几秒完成
- **劣势**：仅头/面部动画，无上半身动作；非本地部署

### ✅ D-ID `/clips`（预置人物 → 说话视频，含上半身）

- **日期**：2026-08-10
- **结论**：**已验证** — 预置 Presenter + TTS → 含上半身动作的说话视频
- **输入**：预置 Presenter "jack" + D-ID TTS
- **输出**：1080×1080 视频，5.08s，1.7MB
- **测试文件**：`scripts/short-video/assets/did-clip-jack-test.mp4`
- **限制**：`/clips` 使用 D-ID 预置人物，不能用自己照片（除非训练 Premium+ Avatar）

### ✅ HeyGen（Custom Avatar + TTS）

- **日期**：2026-08-10
- **结论**：**已验证，效果最好** — 自定义 Avatar + 中文 TTS
- **输入**：Custom Avatar "Pablo LI" + HeyGen TTS
- **输出**：1920×1080 视频，4.0s，467KB
- **测试文件**：`scripts/short-video/assets/heygen-pablo-test.mp4`
- **优势**：画质业界顶级，自定义 Avatar 极逼真
- **劣势**：API 费用高（Avatar IV/V 20 credits/min）；不只改嘴部，会做全身动画

---

## 待测模型详情

### ❌ V-Express — MPS 推理太慢，不可用

- **日期**：2026-08-11
- **结论**：**放弃** — 第一步耗时 17 分 38 秒，完全不可用
- **环境**：V-Express (腾讯 AI Lab), Python 3.13, PyTorch 2.13.0, MPS
- **模型大小**：~7GB（denoising_unet 2.5GB + reference_net 1.6GB + motion_module 769MB + VAE 328MB + Wav2Vec2 360MB + InsightFace 186MB + 其他）
- **测试配置**：fp16, 25 steps, context_frames=12, save_gpu_memory, MPS
- **第一次尝试**：context_frames=24 → MPS OOM（Failed to allocate private MTLBuffer for size 25.7GB）
- **第二次尝试**：context_frames=12 + save_gpu_memory → 第一步 17分38秒（1/25 steps, 1/16 context）
- **预估总时间**：25 steps × 16 context × 17min = ~6800 分钟 = **~4.7 天**
- **根本问题**：reference_net + denoising_unet 双网络<UNK>络前向传播 + 3D motion module，MPS 计算量远超 Hallo2
- **对比 Hallo2**：Hallo2 单 UNet 1.6s/step，V-Express 双 UNet 1058s/step（660x 慢）
- **硬件需求**：需要 **NVIDIA V100 GPU**（8GB VRAM，`--save_gpu_memory` 模式），31 秒音频需 7956MiB 峰值显存，处理时间 2617 秒（~44 分钟）。在 Apple Silicon MPS 上完全不可用。
- **适合的设备**：NVIDIA RTX 3090/4090（24GB VRAM）、A100、V100
- **RTX 4060 可行性**：RTX 4060 有 8GB VRAM，V100 测试需 7956MiB（`--save_gpu_memory`），**勉强可行但非常慢**（可能 1-2 小时/30 秒视频）
- **清理**：已删除（7GB）

### ✅ LongCat-Video-Avatar-1.5 MLX q4 — 首个在 M2 Pro 上成功的本地模型！

- **日期**：2026-08-12
- **结论**：**成功！** 首个在 M2 Pro 32GB 上成功生成有唇形同步的数字人视频
- **环境**：longcat-avatar-mlx (xocialize port), Python 3.12, MLX 0.32.0
- **模型**：q4-dmd-merged（4-bit 量化 + DMD 蒸馏）
- **模型大小**：~23GB on disk
- **推理配置**：q4, 8 DMD steps, 29 frames, 256×432
- **性能**：
  - Pipeline 加载：8.6 秒
  - 推理：**1090.7 秒**（18 分钟）生成 29 帧
  - 每帧：37.6 秒
- **输出**：432×256, 29 frames, 0.97s, 240KB
- **测试文件**：`scripts/short-video/assets/longcat-mlx-test-output.mp4`
- **对比 M5 Max 128GB**：102 秒 vs 1090 秒（10.7x 慢，但成功！）
- **关键意义**：
  - MLX 框架成功，PyTorch/MPS 路径全部失败
  - q4 量化使 23GB 模型在 32GB 内存上可运行
  - DMD 蒸馏只需 8 步（vs 标准 50 步）
  - **MIT 许可证，可商用**
  - 支持中文（美团训练数据含中文）
- **限制**：
  - 18 分钟生成 1 秒视频，速度慢
  - 256×432 分辨率较低（可通过更高分辨率改善）
  - 需要进一步测试用真人照片 + 中文音频
- **后续优化方向**：
  - 测试 480×832 分辨率（官方默认）
  - 测试用户照片 + F5-TTS 中文音频
  - 考虑 q8 量化（更好的质量，31GB）

#### 微信真人照片测试（2026-08-13）

- **输入**：微信照片 `Weixin Image_2026-08-10_003535_660.jpg` + LongCat demo `man.mp3`
- **推理**：1334.2 秒（22 分钟），29 帧，432×256
- **输出**：`scripts/short-video/assets/longcat-weixin-test.mp4`
- **结论**：LongCat 接受**图片输入**（非视频），可直接用任意人像照片生成数字人视频
- **Prompt**："A Chinese man in a suit is speaking on camera, professional setting."

### ⚠️ EchoMimicV3 — 下载阻塞

- **日期**：2026-08-12
- **结论**：**阻塞** — 模型文件下载不完整，无法测试
- **环境**：echomimic_v3 (蚂蚁集团/antgroup), Python 3.12, PyTorch
- **模型**：EchoMimicV3-Flash-pro（8步生成，12GB VRAM，768×768）
- **模型大小**：~20GB（Wan2.1 基础模型 16GB + Flash 权重 3.5GB）
- **下载状态**：
  - ✅ EchoMimicV3 Flash 权重（3.5GB）— 从 ModelScope 下载完成
  - ✅ CLIP 模型（4.4GB）— 从 hf-mirror.com 下载完成
  - ❌ VAE（484MB）— 下载卡在 64MB
  - ❌ umT5 文本编码器（10.8GB）— 下载卡在 1.5GB
  - ✅ chinese-wav2vec2-base（1.8GB）— 从 ModelScope 下载完成
- **根本问题**：HuggingFace、hf-mirror.com、ModelScope 对大文件的下载均不稳定，连接频繁断开
- **技术评估**：
  - 1.3B 参数，12GB VRAM — 在 M2 Pro 32GB 上理论可行
  - 8 步 Flash 生成 — 推理速度快
  - 768×768 分辨率 — 比 LongCat 的 256×432 高很多
  - 使用 PyTorch (MPS) — 需验证 MPS 兼容性
  - 中文 Wav2Vec2 — 原生中文支持
- **后续**：所有模型文件已下载完成（2026-08-13），但推理报 `KeyError: 'patch_embedding.weight'`——Flash 权重与代码版本不兼容，需进一步调试
- **下载方法**：`curl -L "https://huggingface.co/.../resolve/main/FILE" -H "Authorization: Bearer $HF_TOKEN" -o FILE` 直接下载成功（`hf download` CLI 有断点续传 bug）
- **直接下载链接**（可手动下载）：
  - VAE: `https://huggingface.co/alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP/resolve/main/Wan2.1_VAE.pth`（484MB）
  - umT5: `https://huggingface.co/alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP/resolve/main/models_t5_umt5-xxl-enc-bf16.pth`（10.8GB）
  - 镜像: 在 URL 中把 `huggingface.co` 换成 `hf-mirror.com`

### 📋 PersonaLive（未测，低优先级）

- **优先级**：⭐⭐
- **来源**：CVPR 2026
- **MPS**：⚠️ 12GB VRAM，MPS 可能可行
- **ComfyUI**：`okdalto/ComfyUI-PersonaLive`
- **备注**：所有基于 SD1.5 的扩散模型在 M2 Pro 上都已失败，PersonaLive 不太可能例外

### 📋 Hallo2

- **优先级**：⭐⭐⭐⭐（MIT 许可证可商用）
- **来源**：复旦
- **MPS**：⚠️ 官方要求 A100，需验证
- **许可证**：MIT

### 📋 PersonaLive

- **优先级**：⭐⭐⭐
- **来源**：CVPR 2026
- **MPS**：⚠️ 12GB VRAM，MPS 可能可行
- **ComfyUI**：`okdalto/ComfyUI-PersonaLive`

### 📋 LongCat-Video-Avatar-1.5（⭐ 最高优先级）

- **优先级**：⭐⭐⭐⭐⭐（MIT + MLX 移植 + 中英文 + 美团出品）
- **来源**：美团 meituan-longcat，714 likes
- **HuggingFace**：`meituan-longcat/LongCat-Video-Avatar-1.5`
- **MLX 移植**：`mlx-community/LongCat-Video-Avatar-1.5-bf16-dmd-merged`（还有 q8/q4 量化版）
- **MPS**：✅ **有 MLX 社区移植版**——M2 Pro 可用性最强信号
- **许可证**：MIT（商用 OK）
- **关键特点**：Whisper-Large 音频编码器，8 步推理（DMD2 蒸馏），支持 Audio-Text-to-Video / Audio-Image-Text-to-Video，商用级稳定性，支持动漫/动物/多人交互
- **中文支持**：✅ 原生支持中英文
- **测试重点**：MLX 移植版能否在 M2 Pro 32GB 上完整推理；q4 量化版质量是否可接受；唇同步精度

### 📋 InfiniteTalk

- **优先级**：⭐⭐⭐⭐（Apache 2.0 + 中文 + 无限长度）
- **来源**：MeiGen-AI，238 likes
- **HuggingFace**：`MeiGen-AI/InfiniteTalk`
- **GitHub**：github.com/MeiGen-AI/InfiniteTalk
- **MPS**：⚠️ 待验证（基于 WAN 2.1，可能需要较大显存）
- **许可证**：Apache 2.0（商用 OK）
- **关键特点**：稀疏帧视频配音，同步唇+头+身体+表情，**无限长度**生成，也可做 image-audio-to-video
- **中文支持**：✅ 原生支持中英文
- **测试重点**：M2 Pro 是否能运行；推理速度；无限长度的实际效果

### 📋 Hallo3

- **优先级**：⭐⭐⭐⭐（MIT + Transformer 骨干 + 复旦出品，Hallo2 升级版）
- **来源**：复旦 fudan-generative-ai，66 likes，CVPR 2025
- **HuggingFace**：`fudan-generative-ai/hallo3`
- **arxiv**：2412.00733
- **MPS**：⚠️ 待验证（用 Transformer 骨干而非 U-Net，可能比 Hallo2 更重但也可能更优）
- **许可证**：MIT（商用 OK）
- **关键特点**：Transformer-based video generation backbone（非 U-Net），causal 3D VAE + transformer 身份保持网络，处理非正面视角和动态背景
- **测试重点**：MPS 兼容性（Transformer 骨干可能比 U-Net 更友好也可能更重）；与 Hallo2 质量对比

### 📋 EchoMimicV3

- **优先级**：⭐⭐⭐⭐（Apache 2.0 + 仅 1.3B 参数 + 蚂蚁出品）
- **来源**：蚂蚁集团 BadToBest，48 likes
- **HuggingFace**：`BadToBest/EchoMimicV3`
- **arxiv**：2507.03905
- **MPS**：⚠️ 待验证（**仅 1.3B 参数**——如果能在 M2 Pro 上跑，可能是最快的高质量方案）
- **许可证**：Apache 2.0（商用 OK）
- **关键特点**：统一多任务+多模态人体动画，Soup-of-Tasks + Soup-of-Modals，Negative DPO，Phase-aware CFG，仅 1.3B 参数
- **测试重点**：1.3B 参数在 M2 Pro 上的推理速度；多任务能力（音频驱动/关键点驱动/组合）

### 📋 FeatherTalk

- **优先级**：⭐⭐⭐（超轻量，但许可证和效果待确认）
- **来源**：anliyuan，55 GitHub stars
- **GitHub**：github.com/anliyuan/FeatherTalk
- **MPS**：⚠️ 待验证（超轻量级，M2 Pro 可能性高）
- **许可证**：❓ 待确认
- **关键特点**：超轻量级音频驱动 talking-head 框架
- **测试重点**：轻量级是否意味着质量妥协；M2 Pro 兼容性

### 📋 LTX-2.3 + AV-LoRA-talking-head（低优先级）

- **优先级**：⭐⭐（22B 参数太大，M2 Pro 基本跑不动；但记录以备云 GPU 场景）
- **来源**：社区 elix3r，72 likes
- **HuggingFace**：`elix3r/LTX-2.3-22b-AV-LoRA-talking-head`（LoRA），基座 `Lightricks/LTX-2.3`（22B）
- **ComfyUI**：有工作流文件
- **MPS**：❌ 22B 参数，M2 Pro 32GB 基本不可行（无 MLX 移植）
- **许可证**：OpenRAIL
- **关键特点**：LTX-2.3 首个社区 AV LoRA，talking head + 唇同步 + 内化语音特征，但需训练自己的角色 LoRA
- **OmniNFT 可选叠加**：可叠加 `zghhui/OmniNFT` 的 RL-LoRA 进一步提升音视频同步质量
- **适用场景**：有 NVIDIA A100/H100 的云 GPU 场景，而非 M2 Pro 本地
- **测试重点**：仅在有云 GPU 时测试；验证 talking head LoRA + OmniNFT 叠加效果

---

## 统一测试素材

- **视频**：`scripts/short-video/assets/IMG_7991.MOV`（用户正面视频）
- **音频**：`scripts/short-video/output/deepseek/audio/scene-1.mp3`（F5-TTS 中文）
- **照片**：用户 Weixin 照片（已用于 D-ID 测试）
- **测试文本**：scene-1 对应的中文文本

## 评估标准

1. **安装可行性**：M2 Pro 上能否成功安装和运行
2. **推理速度**：生成 5-30 秒视频需要多长时间
3. **嘴部清晰度**：与原始视频对比，嘴部是否模糊或变形
4. **音频同步**：口型与音频是否匹配
5. **分辨率**：至少 512×512
6. **内存占用**：峰值在 32GB 以内

---

## 本地清理记录

| 日期 | 清理项 | 释放空间 | 原因 |
|------|--------|---------|------|
| 2026-08-09 | MuseTalk 安装目录 + 模型 | ~2GB | VAE 架构问题 |
| 2026-08-10 | LatentSync 1.5 checkpoint | 3.2GB | 256px 效果差 |
| 2026-08-10 | LatentSync 1.6 checkpoint | 4.7GB | 512px OOM |
| 2026-08-10 | SadTalker 目录 | 3.5GB | 效果差 |
| 2026-08-10 | — | — | Sonic 保留安装（ComfyUI 可复用），待决定是否清理 |
| 2026-08-10 | ComfyUI + Sonic + SVD | 18GB | fp16 死锁 + fp32 崩溃 |
| 2026-08-10 | LatentSync repo | 2.3GB | 两个版本均失败 |
| 2026-08-11 | Hallo2 | 14GB | 256px 太低，512px 不可用 |
| 2026-08-11 | LivePortrait | 3.3GB | 无音频驱动，D-ID 转接效果差 |
| 2026-08-11 | SadTalker（重装尝试） | 5.6GB | Python 3.13 不兼容，已删 |
| 2026-08-11 | V-Express | 7GB | 17min/sub-step，完全不可用 |

## 本地模型最终结论

**已测的 9 个本地模型在 M2 Pro 32GB 上均无法达到商用质量。**

核心限制：
1. **扩散模型**：MPS 内存限制只能跑 256px，嘴部细节不足
2. **非扩散模型**：效果不够好（恐怖谷/模糊/无音频驱动）
3. **512px 扩散**：在 M2 Pro 上不实用（235s/step）
4. **双网络扩散（V-Express）**：MPS 17min/sub-step，预估 4.7 天

**总计释放磁盘空间**：~50GB

**2026-08-11 新发现带来的希望**：

5 个新待测模型中，以下 3 个有较高可能在 M2 Pro 上可用：

1. **🥇 LongCat-Video-Avatar-1.5**（最高希望）— 有 MLX 社区移植版（bf16/q8/q4），MIT 许可证，美团出品，支持中文，8 步推理。MLX 移植是 Apple Silicon 可用性的最强信号。
2. **🥈 EchoMimicV3** — 仅 1.3B 参数（极轻量），Apache 2.0，蚂蚁集团出品。参数量小意味着 M2 Pro 可能跑得动。
3. **🥉 InfiniteTalk** — Apache 2.0，支持中文，无限长度。基于 WAN 2.1，需验证显存需求。

**推荐路径**（更新）：
- **优先测试**：LongCat-Video-Avatar-1.5 MLX 移植版（q4 量化先试，bf16 后试）
- **日常过渡**：D-ID API（便宜）或 HeyGen API（质量高但贵）
- **高质量批量**：云 GPU + 新模型（LongCat-Video-Avatar-1.5 / Hallo3 / EchoMimicV3）

详见 `docs/research/china-digital-human-api-alternatives.md` 了解中国平台替代方案。
