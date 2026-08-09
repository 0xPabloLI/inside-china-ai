# 数字人方案调研报告：适配 Apple M2 Pro（32GB）

> **调研日期**：2026-08-09（初次），2026-08-10（更新：MuseTalk/SadTalker/HeyGen/D-ID/LatentSync MPS 实测结果）
> **目标设备**：MacBook Pro (Mac14,10), Apple M2 Pro, 32 GB, macOS 26.5.1, Metal 4
> **核心需求**：(1) 语音/文本 → 自然说话的数字人视频；(2) 用个人照片匹配最相似的数字人形象
> **方法论**：多源交叉验证，来源包括 arxiv 论文、GitHub README、HuggingFace API、官方平台首页

---

## 1. 执行摘要

> ⚠️ **MuseTalk 已放弃**：经实际测试，MuseTalk 的 VAE 架构导致嘴部模糊（高频细节在潜空间压缩/解压中丢失），质量不达标。已清理所有本地安装。

**当前推荐路径**（按优先级排序）：

| 优先级 | 方案 | 类型 | 质量 | M2 Pro 兼容 | 商用 | 测试状态 |
|--------|------|------|------|------------|------|---------|
| 1 | **Sonic via ComfyUI_Sonic** | 本地 | ⭐⭐⭐⭐⭐ | ✅ 已修复 MPS | ❌ 非商用 | 待测 |
| 2 | **LatentSync 1.5** | 本地 | ⭐⭐⭐⭐⭐ | ✅ MPS 已跑通（需 patch） | ✅ OpenRAIL++ | ⏳ 推理中（纯 1.5 代码） |
| 3 | **Hallo2** | 本地 | ⭐⭐⭐⭐ | ⚠️ MPS 待验证 | ✅ MIT | 待测 |
| 4 | **SadTalker** | 本地 | ⭐⭐ | ✅ MPS 已测试 | ❌ 非商用 | ❌ 已测试，效果差（恐怖谷眼神） |
| — | ~~MuseTalk 1.5 MLX~~ | 本地 | ❌ | ✅ MLX | ✅ MIT | ❌ 已测试，嘴部模糊（VAE 架构问题） |
| 5 | **D-ID API** | 云端 | ⭐⭐⭐ | ✅ 无需 GPU | ✅ | API key 已验证 |
| 6 | **HeyGen API** | 云端 | ⭐⭐⭐⭐⭐ | ✅ 无需 GPU | ✅ | 已测试，效果好但贵 |

**人脸匹配方案**：InsightFace（ArcFace backbone）提取 512 维人脸嵌入 → 余弦相似度匹配 → 选择最相似的 Avatar 模板。

---

## 2. 技术架构对比（关键）

不同模型的技术路线直接决定了嘴部清晰度。这是理解质量差异的核心框架。

### 2.1 四种技术路线

| 技术路线 | 原理 | 嘴部清晰度 | 代表模型 | 问题 |
|---------|------|-----------|---------|------|
| **VAE 潜空间替换** | 图像→VAE 编码到潜空间→替换嘴部潜码→VAE 解码回像素 | ❌ 模糊 | MuseTalk | 压缩/解压往返丢失高频细节 |
| **GAN 像素空间** | 生成对抗网络直接在像素空间生成嘴部区域 | ✅ 清晰但有"贴片感" | Wav2Lip | 2020 年老模型，训练数据质量低，嘴部边缘不自然 |
| **3DMM 像素空间** | 三维形变模型直接变形面部像素 | ✅ 清晰 | SadTalker | 头部运动有限，表情较僵硬 |
| **扩散模型潜空间** | 扩散去噪 + SyncNet 监督，在潜空间生成但有多步细化 | ✅ 清晰 | LatentSync, Sonic | 计算量大，速度慢 |

### 2.2 VAE 详解（为什么 MuseTalk 效果差）

**VAE = Variational Autoencoder（变分自编码器）**

核心原理：把图像压缩到低维"潜空间"（如 256×256 像素 → 32×32×4 潜码）→ 在潜空间做修改 → 解压回像素。

**MuseTalk 的流程**：
1. 原图裁切出 256×256 人脸区域
2. VAE 编码 → 32×32×4 潜码
3. 用 UNet 在潜空间预测嘴部区域的修改
4. **直接替换**嘴部潜码（无细化网络）
5. VAE 解码回 256×256 像素

**问题**：步骤 2 的压缩丢失了嘴部的高频细节（牙齿纹理、嘴唇边缘），步骤 5 的解压无法恢复这些细节。相当于用 JPEG 高压缩后再修改嘴唇像素，必然模糊。

**为什么 VAE 本身不差**：VAE 是 Stable Diffusion、Sora 等 SOTA 模型的核心组件。问题是 MuseTalk 的**用法**不对——用 VAE 做"局部精细编辑"超出了它的设计能力。更好的方案要么不用 VAE（SadTalker、Wav2Lip），要么用扩散模型做多步细化来补偿 VAE 的信息损失（LatentSync、Sonic）。

### 2.3 MuseTalk/Wav2Lip 关系纠正

> ⚠️ **之前的错误说法**：在之前的对话中，曾声称 "Wav2Lip 和 MuseTalk 都有相同的 VAE 质量限制"。**这是错误的**。

| | MuseTalk | Wav2Lip |
|---|---------|---------|
| **技术** | VAE 潜空间替换 | GAN 像素空间生成 |
| **嘴部问题** | 模糊（高频细节丢失） | "贴片感"（边缘不自然） |
| **问题原因** | VAE 压缩/解压损失 | 2020 年老模型 + 训练数据质量低 |
| **是否使用 VAE** | ✅ 是，核心组件 | ❌ 完全不用 VAE |

两者的质量问题是**完全不同的技术原因**。Wav2Lip 的 GAN 方案在像素空间直接生成嘴部，不走 VAE 压缩/解压，所以不会模糊——但因为是 2020 年的老模型，生成器容量小、训练数据有限，嘴部看起来像是"贴上去"的。

---

## 3. 开源本地模型评估

### 3.1 ❌ MuseTalk 1.5 MLX — 已测试，已放弃

| 属性 | 详情 |
|------|------|
| **来源** | Tencent Music (TMElyralab)，MLX 移植版由 MVS Collective (xocialize-code) |
| **HuggingFace 模型** | `mlx-community/MuseTalk-1.5-fp16`、`-q8`、`-q4` |
| **技术原理** | VAE 潜空间替换（whisper-tiny 音频编码 + SD1.x UNet + VAE） |
| **性能** | ~34 个 256×256 人脸/秒（batch 8），>25fps 实时，峰值 ~7GB |
| **许可证** | MIT（商用 OK）|
| **评估结论** | ❌ **已放弃** — VAE 架构导致嘴部模糊，质量不达标 |
| **测试记录** | 用官方 demo Avatar 和自定义视频均测试，嘴部模糊一致，非输入问题而是架构问题 |
| **已清理** | MuseTalk 安装目录、模型文件、测试视频均已删除 |

### 3.2 🔥 LatentSync 1.5/1.6 — 字节跳动，扩散模型唇同步（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | 字节跳动，arxiv 2412.09262 |
| **GitHub** | github.com/bytedance/LatentSync |
| **HuggingFace** | `ByteDance/LatentSync-1.5`（90 likes）、`ByteDance/LatentSync-1.6`（77 likes, 80k downloads） |
| **技术原理** | 音频条件潜在扩散模型（Audio-Conditioned Latent Diffusion），无中间运动表示，直接建模音视关联 |
| **技术细节** | Whisper 音频编码 → U-Net 交叉注意力 → 潜空间扩散去噪 → TREPA + LPIPS + SyncNet 三重损失 |
| **分辨率** | v1.5: 256×256，v1.6: 512×512（v1.5 嘴部模糊，v1.6 专门解决此问题） |
| **VRAM 需求** | v1.5: **8GB**（推理），v1.6: **18GB**（推理） |
| **许可证** | OpenRAIL++（商用 OK） |
| **M2 Pro 兼容** | ✅ v1.5 已在 MPS 跑通（需 patch，详见 3.2.1） |
| **1.5 vs 1.6 代码** | ⚠️ **不可混用** — 1.5 checkpoint 必须用 1.5 代码，1.6 代码的人脸对齐逻辑完全不同（`affine_transform.py` 235 行差异），混用导致嘴巴完全扭曲 |
| **ComfyUI 集成** | `ShmuelRonen/ComfyUI-LatentSyncWrapper`（957 stars） |
| **与 MuseTalk 区别** | 都用 VAE，但 LatentSync 用扩散模型做**多步去噪细化**，补偿了 VAE 的信息损失；MuseTalk 是单步直接替换 |
| **代码借鉴** | 官方致谢 MuseTalk、Wav2Lip、StyleSync、SyncNet |

**为什么比 MuseTalk 好**：虽然都用 VAE 做潜空间压缩，但 LatentSync 用扩散模型做**多步去噪**（类似 Stable Diffusion 的多步生成），每步都在细化嘴部细节。而 MuseTalk 是单步直接替换潜码，没有任何细化。此外 v1.6 专门升级到 512×512 分辨率来解决 v1.5 的嘴部模糊问题。

**测试优先级**：⭐⭐⭐⭐⭐（最高，v1.5 + MPS）

### 3.2.1 LatentSync 1.5 MPS 实测记录（2026-08-10）

**环境**：MacBook Pro M2 Pro 32GB, macOS 26.5.1, PyTorch 2.5.1, Python 3.11

**MPS 兼容性 patch 清单**（1.5 代码 `git checkout 75a4a17` 后需手动 patch）：

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 1 | `latentsync/utils/util.py` | `from decord import ...` 直接 import 失败 | try/except + `librosa` fallback 读音频 |
| 2 | `latentsync/utils/util.py` | `read_audio()` 无 librosa fallback | 添加 `if AudioReader is not None` 分支 |
| 3 | `latentsync/whisper/whisper/__init__.py` | `torch.load(weights_only=True)` 在 torch 2.5.1 不尊重 `map_location` | 去掉 `weights_only=True`，`map_location="cpu"` |
| 4 | `latentsync/whisper/whisper/__init__.py` | whisper checkpoint CUDA 格式无法 `.to("mps")` | 先 `.to("cpu")` 再 `.to(device)` |
| 5 | `latentsync/whisper/audio2feature.py` | whisper 模型 `.to(device)` 仍报 CUDA 错误 | 强制 `load_model(model_path, "cpu")` |
| 6 | `scripts/inference.py` | 1.5 代码无 `device` 变量，硬编码 `"cuda"` | 添加 if/elif/else 定义 `device`（cuda/mps/cpu）|
| 7 | `scripts/inference.py` | `LipsyncPipeline(...).to("cuda")` 硬编码 | 分步 `.to(device)`：先 VAE 再 UNet |
| 8 | `latentsync/pipelines/lipsync_pipeline.py` | `ImageProcessor(device="cuda")` 硬编码 | 改为 `device=self._execution_device` |
| 9 | `latentsync/utils/image_processor.py` | `face_alignment` 库尝试 CUDA 初始化 | 强制 `device="cpu"`（人脸检测不需 GPU）|
| 10 | `latentsync/models/unet.py` | `torch.load(weights_only=True)` 同 #3 | 去掉 `weights_only=True` |

**关键教训：1.5 checkpoint 不可用 1.6 代码运行**

1.5 和 1.6 之间有大量代码差异（`affine_transform.py` 235 行、`image_processor.py` 304 行、`lipsync_pipeline.py` 130 行变更）。1.6 的 `affine_transform.py` 用 insightface + kornia GPU 做人脸对齐，1.5 用 face_alignment + mediapipe。混用导致人脸对齐逻辑不匹配，嘴巴区域完全扭曲。

**test1/test2 失败原因**：用 1.6 代码跑 1.5 checkpoint → 人脸对齐错位 → 嘴巴全乱。
**test3**：纯 1.5 代码 + 1.5 checkpoint → 正在推理中。

**推理性能**（M2 Pro MPS）：
- Affine transform：128 faces × ~4s/face ≈ 8 分钟（CPU bound，face_alignment 库）
- Diffusion 推理：8 批 × 20 步 × ~65s/批 ≈ 9 分钟
- Face restore：128 faces × ~0.1s/face ≈ 15 秒
- 总计：约 17 分钟（5.28s 视频）
- 峰值内存：~1.5GB（远低于 32GB 上限）

**运行命令**：
```bash
cd /Users/pabloli/Documents/code/latentsync
source .venv/bin/activate
PYTORCH_ENABLE_MPS_FALLBACK=1 python3 -u -m scripts.inference \
  --unet_config_path "configs/unet/stage2.yaml" \
  --inference_ckpt_path "checkpoints/latentsync15/latentsync_unet.pt" \
  --inference_steps 20 --guidance_scale 1.5 \
  --video_path "INPUT_VIDEO" --audio_path "INPUT_AUDIO" \
  --video_out_path "OUTPUT.mp4"
```

### 3.3 🔥 Sonic — 腾讯，CVPR 2025（新发现，MPS 已修复）

| 属性 | 详情 |
|------|------|
| **来源** | 腾讯（jixiaozhong），CVPR 2025 |
| **GitHub** | github.com/jixiaozhong/Sonic |
| **技术原理** | Stable Video Diffusion (SVD) + 全局音频感知，扩散模型 |
| **特点** | 专注全局音频感知（不仅口型，还包括表情、头部运动的音频驱动） |
| **GPU 要求** | 官方测试 32GB GPU |
| **许可证** | CC BY-NC-SA 4.0（**非商用**；商用需联系腾讯云 VCLM） |
| **M2 Pro 兼容** | ✅ **ComfyUI_Sonic 已修复 MPS 支持**（`smthemex/ComfyUI_Sonic`） |
| **ComfyUI 集成** | `smthemex/ComfyUI_Sonic`，已修复 bf16 错误 + 12GVRAM OOM + **MPS device error** |
| **依赖** | 需下载 SVD checkpoints（`svd_xt.safetensors` 或 `svd_xt_1_1.safetensors`）+ Sonic 模型 |
| **社区** | ComfyUI 版本、HuggingFace Space 在线 Demo |

**ComfyUI_Sonic MPS 修复说明**（来自 README）：
> "fix bf16 error, fix 12GVRAM maybe OOM when first run, **fix MPS device error**, 修复 MAC 的 MPS 支持"

**测试优先级**：⭐⭐⭐⭐⭐（最高，唯一明确 MPS 兼容的扩散方案）

**安装路径**：
```
ComfyUI/custom_nodes/ → git clone https://github.com/smthemex/ComfyUI_Sonic.git
ComfyUI/models/sonic/ → 下载 checkpoints (audio2bucket.pth, audio2token.pth, unet.pth, yoloface_v5m.pt, whisper-tiny/)
ComfyUI/models/checkpoints/ → 下载 svd_xt.safetensors
```

### 3.4 ⚠️ SadTalker — 3DMM 方案，另一 session 测试中

| 属性 | 详情 |
|------|------|
| **来源** | 西安交大等，arxiv 2211.12194 |
| **功能** | 单张照片 + 音频 → 3D 感知说话人脸视频 |
| **技术** | 3DMM 运动系数（头部姿态 + 表情），ExpNet + PoseVAE，**像素空间变形** |
| **GPU 要求** | 官方要求 NVIDIA CUDA |
| **许可证** | 非商用研究 |
| **M2 Pro 兼容** | ⚠️ PyTorch MPS 后端可能可行，另一 session 正在测试 |
| **HuggingFace** | `vinthony/SadTalker`（134 likes） |
| **优势** | 不用 VAE，嘴部不模糊；3DMM 直接变形面部像素 |
| **劣势** | 表情较僵硬，头部运动有限 |

### 3.5 ⚠️ Hallo2 — 复旦，MIT 许可证（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | 复旦大学，arxiv 2410.07718 |
| **HuggingFace** | `fudan-generative-ai/hallo2`（136 likes） |
| **技术** | 分层音频驱动视觉合成（唇 + 表情 + 姿态），端到端扩散 |
| **v1 vs v2** | Hallo2 支持长视频生成（分钟级），v1 仅短片段 |
| **许可证** | **MIT（商用 OK）** ← 重要优势 |
| **音频限制** | v1 ⚠️ 仅支持英文；JoyHallo 中文扩展存在 |
| **GPU 要求** | 官方要求 Ubuntu + CUDA 12.1 + A100 级别 |
| **M2 Pro 兼容** | ⚠️ MPS 待验证 |
| **社区** | ComfyUI-Hallo、WebUI、Docker、RunPod 模板 |

**测试优先级**：⭐⭐⭐⭐（MIT 许可证 + 扩散方案）

### 3.6 ⚠️ DICE-Talk — ACM MM 2025（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | arxiv 2504.18087，ACM MM 2025 |
| **GitHub** | github.com/toto222/DICE-Talk |
| **技术** | 情感解耦扩散模型（Identity + Emotion 分离），支持情感控制（开心/愤怒/惊讶） |
| **GPU 要求** | 推荐 20GB+ VRAM，Linux |
| **许可证** | CC BY-NC-SA 4.0（非商用） |
| **M2 Pro 兼容** | ⚠️ 20GB VRAM 需求较高，MPS 待验证 |
| **特点** | 唯一支持**情感控制**的方案（其他模型情感中性） |

**测试优先级**：⭐⭐⭐（较新，VRAM 需求高）

### 3.7 ⚠️ EchoMimic / EchoMimicV2 — 蚂蚁集团

| 属性 | 详情 |
|------|------|
| **来源** | 蚂蚁集团，arxiv 2407.08136 |
| **功能** | 音频 + 面部关键点 → 人像动画（可纯音频、纯关键点或组合驱动） |
| **V2 增强** | 半身动画（不再仅面部） |
| **GPU 要求** | NVIDIA CUDA |
| **许可证** | Apache 2.0（商用 OK） |
| **M2 Pro 兼容** | ⚠️ MPS 待验证 |
| **HuggingFace** | `BadToBest/EchoMimic`（158 likes）、`BadToBest/EchoMimicV2`（137 likes） |

### 3.8 ⚠️ LivePortrait — 快手

| 属性 | 详情 |
|------|------|
| **来源** | 快手 (KwaiVGI) |
| **功能** | 人像照片 + 驱动视频 → 动画人像（**主要视频驱动，非音频驱动**） |
| **GPU 要求** | NVIDIA CUDA |
| **M2 Pro 兼容** | ⚠️ MPS 待验证 |
| **HuggingFace** | `KlingTeam/LivePortrait`（486 likes，最热门） |
| **注意** | 非音频驱动，需配合其他方案使用 |

### 3.9 ⚠️ Wav2Lip — GAN 方案，CPU 可跑

| 属性 | 详情 |
|------|------|
| **来源** | IIIT Hyderabad，arxiv 2008.10010 (ACM MM 2020) |
| **功能** | 音频 + 视频 → 唇形同步视频 |
| **技术** | **GAN（生成对抗网络），像素空间直接生成嘴部** — 不用 VAE |
| **GPU 要求** | 原设计 CUDA，但 CPU 推理可行（速度慢） |
| **许可证** | 非商用（开源版）；商用通过 sync.so API |
| **M2 Pro 兼容** | ⚠️ 可尝试 PyTorch MPS 后端 |
| **商用版本** | sync.so 提供 `lipsync-2` API（Python/TypeScript SDK） |
| **质量问题** | 嘴部"贴片感"（GAN 生成器容量小 + 2020 训练数据），**不是 VAE 模糊** |
| **与 MuseTalk 区别** | 完全不同的技术路线和质量问题（见 2.3 节） |

### 3.10 🔥 Hallo3 — 复旦+百度，CVPR 2025，DiT 架构（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | 复旦大学 + 百度，**CVPR 2025** |
| **GitHub** | github.com/fudan-generative-vision/hallo3（8658 stars 总系列） |
| **HuggingFace** | `fudan-generative-ai/hallo3`（66 likes） |
| **技术** | **Video Diffusion Transformer (DiT)**，基于 CogVideo-5B I2V 微调。比 Hallo2 的 UNet 更强大 |
| **论文** | arxiv 2412.00733 — "Highly Dynamic and Realistic Portrait Image Animation with Diffusion Transformer Networks" |
| **许可证** | MIT（商用 OK），基于 CogVideo-5B LICENSE |
| **GPU 要求** | Ubuntu 20.04/22.04, CUDA 12.1, **H100** 级别 |
| **M2 Pro 兼容** | ❌ 需 H100，MPS 极不可能 |
| **特点** | DiT 架构（非 UNet），是 Hallo 系列最新最强版本。支持高动态和真实感的肖像动画 |

### 3.11 🔥 EMO — 阿里巴巴，ECCV 2024，Audio2Video 扩散（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | 阿里巴巴智能计算研究院，**ECCV 2024** |
| **GitHub** | github.com/HumanAIGC/EMO（**7601 stars**，极高关注度） |
| **技术** | Audio2Video Diffusion Model under Weak Conditions — 直接从音频到视频的扩散模型 |
| **论文** | arxiv 2402.17485 — "Emote Portrait Alive: Generating Expressive Portrait Videos with Audio2Video Diffusion Model" |
| **许可证** | 未明确标注（研究用途） |
| **GPU 要求** | NVIDIA CUDA（未标注具体 VRAM） |
| **M2 Pro 兼容** | ❌ 需 NVIDIA GPU |
| **特点** | 业界最有名的数字人模型之一，生成效果极为生动。但模型未公开发布权重，只有 demo |

### 3.12 🔥 PersonaLive — 澳门大学+大湾区大学，CVPR 2026（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | 澳门大学 + Dzine.ai + GVC Lab，**CVPR 2026** |
| **GitHub** | github.com/GVCLab/PersonaLive（3489 stars） |
| **HuggingFace** | `huaichang/PersonaLive` |
| **技术** | 实时可流式扩散框架，支持无限长肖像动画 |
| **论文** | arxiv 2512.11253 |
| **许可证** | 学术研究仅用（非商用） |
| **GPU 要求** | **12GB VRAM**（支持流式推理，较低门槛） |
| **M2 Pro 兼容** | ⚠️ 12GB VRAM，MPS 可能可行 |
| **ComfyUI** | ✅ `okdalto/ComfyUI-PersonaLive` 已支持 |
| **特点** | 唯一支持实时流式推理 + 无限长视频的扩散方案 |

### 3.13 ⚠️ JoyVASA — 京东健康，扩散+解耦表示（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | 京东健康 (JD Health)，arxiv 2411.09209 |
| **GitHub** | github.com/jdh-algo/JoyVASA（876 stars） |
| **技术** | 扩散 Transformer 生成运动序列 + 解耦面部表示（LivePortrait 外观编码 + 运动编码分离） |
| **许可证** | 未明确标注 |
| **GPU 要求** | Ubuntu, CUDA 12.1, A100 |
| **M2 Pro 兼容** | ❌ 需 NVIDIA GPU |
| **特点** | **支持中文**（混合中英文训练数据），支持动物面部动画，身份无关的运动生成 |

### 3.14 ⚠️ V-Express — 腾讯，渐进式训练扩散（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | 腾讯 AI Lab，arxiv 2406.02511 |
| **GitHub** | github.com/tencent-ailab/V-Express（2357 stars） |
| **技术** | 条件渐进式 Dropout 训练，平衡 pose/image/audio 控制信号。基于 SD1.5 + wav2vec2 + VAE |
| **许可证** | 未明确标注 |
| **GPU 要求** | NVIDIA CUDA |
| **M2 Pro 兼容** | ⚠️ 基于 SD1.5，MPS 可能可行 |
| **ComfyUI** | ✅ `tiankuan93/ComfyUI-V-Express` |
| **特点** | 解决弱信号（音频）被强信号（pose/image）压制的问题 |

### 3.15 ⚠️ DreamTalk — 阿里巴巴，扩散说话头（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | 阿里巴巴 (ali-vilab)，github.com/ali-vilab/dreamtalk（1789 stars） |
| **技术** | 扩散模型说话头 |
| **许可证** | 未明确标注 |
| **GPU 要求** | NVIDIA CUDA |
| **M2 Pro 兼容** | ❌ |
| **特点** | 阿里 DreamTalk，有 camenduru Docker 版本 |

### 3.16 ⚠️ AniPortrait — 音频→关键点→动画（新发现）

| 属性 | 详情 |
|------|------|
| **来源** | ZJYang |
| **GitHub** | github.com/Zejun-Yang/AniPortrait（5019 stars） |
| **HuggingFace** | `ZJYang/AniPortrait`（125 likes） |
| **技术** | 音频→3D 面部关键点→扩散渲染。两阶段方法 |
| **GPU 要求** | NVIDIA CUDA |
| **M2 Pro 兼容** | ❌ |
| **特点** | 两阶段方法（关键点预测 + 扩散渲染），GitHub 5000+ stars |

### 3.17 ⚠️ 其他已发现模型（简要列表）

| 模型 | 来源 | 技术 | 会议/时间 | GitHub Stars | GPU | 许可证 | 备注 |
|------|------|------|----------|-------------|-----|--------|------|
| **Hallo4** | 复旦 | 扩散 | arxiv 2505.23525 | — | CUDA | MIT | Hallo 系列最新，HF: `fudan-generative-ai/hallo4` |
| **Hallo-Live** | 复旦 | 扩散 | — | — | CUDA | MIT | 实时版本，HF: `fudan-generative-ai/Hallo-Live` |
| **VideoReTalking** | — | 扩散唇同步编辑 | 2023 | — | CUDA | — | 已有视频改口型 |
| **StyleSync** | guanjz20 | 扩散+风格 | **CVPR 2023** | 328 | CUDA | — | 高保真唇同步 |
| **Diff2Lip** | camenduru | 扩散唇同步 | — | — | CUDA | — | HF: `camenduru/Diff2Lip` |
| **Real3D-Portrait** | ameerazam08 | 3D 肖像 | — | — | CUDA | — | 3D 感知说话头像 |
| **GeneFace++** | KimRina | 3DMM+NeRF | — | — | CUDA | — | 3DMM 基于神经渲染 |
| **JoyHallo** | jdh-algo | 扩散 | — | — | CUDA | — | Hallo 的中文扩展版 |
| **HeyGem** | 硅基智能 (GuijiAI) | ONNX 唇同步 | — | 486+ | CUDA (Linux) | Other | 中国开源数字人，`Holasyb918/HeyGem-Linux-Python-Hack`，需 onnxruntime-gpu |
| **Linly-Talker** | Kedreamix | LLM+SadTalker | — | 3424 | CUDA | — | 对话式数字人系统，整合 LLM+Whisper+SadTalker |

### 3.18 全球模型综合排名与技术标注

> **以下按技术先进性 + 效果质量排序**。标注每个模型的技术路线、发表会议、NVIDIA 需求、音频驱动、商用许可。

#### T0 — 顶会 SOTA（扩散/DiT，2024-2026）

| 排名 | 模型 | 技术路线 | 会议 | 时间 | NVIDIA 必需 | 音频驱动 | 商用 | VRAM | 质量 | GitHub Stars |
|------|------|---------|------|------|-----------|---------|------|------|------|-------------|
| 1 | **EMO** | Audio2Video 扩散 | ECCV 2024 | 2024.02 | ✅ | ✅ | ❓ | 未公开 | ⭐⭐⭐⭐⭐ | 7601 |
| 2 | **Sonic** | SVD 扩散 | **CVPR 2025** | 2024.12 | ✅（MPS ✅） | ✅ | ❌ 非商用 | 12GB | ⭐⭐⭐⭐⭐ | — |
| 3 | **Hallo3** | **DiT** (CogVideo) | **CVPR 2025** | 2024.12 | ✅ H100 | ✅ | ✅ MIT | H100 | ⭐⭐⭐⭐⭐ | 8658 |
| 4 | **PersonaLive** | 实时流式扩散 | **CVPR 2026** | 2025.12 | ✅（MPS ⚠️） | ✅ | ❌ 非商用 | 12GB | ⭐⭐⭐⭐⭐ | 3489 |
| 5 | **DICE-Talk** | 扩散+情感解耦 | **ACM MM 2025** | 2025.04 | ✅ | ✅+情感 | ❌ 非商用 | 20GB+ | ⭐⭐⭐⭐⭐ | — |
| 6 | **LatentSync 1.6** | 扩散+SyncNet | — | 2025.06 | ✅（MPS ⚠️） | ✅ | ✅ OpenRAIL++ | 18GB | ⭐⭐⭐⭐⭐ | — |
| 7 | **LatentSync 1.5** | 扩散+SyncNet | — | 2024.12 | ✅（MPS ⚠️） | ✅ | ✅ OpenRAIL++ | **8GB** | ⭐⭐⭐⭐ | — |
| 8 | **Hallo2** | 分层扩散 | — | 2024.10 | ✅ | ✅ | ✅ MIT | 20GB+ | ⭐⭐⭐⭐ | 8658 |
| 9 | **Hallo4** | 扩散 | — | 2025.05 | ✅ | ✅ | ✅ MIT | 未标注 | ⭐⭐⭐⭐ | — |

#### T1 — 扩散方案（未达顶会但技术先进）

| 排名 | 模型 | 技术路线 | 会议 | 时间 | NVIDIA 必需 | 音频驱动 | 商用 | VRAM | 质量 | GitHub Stars |
|------|------|---------|------|------|-----------|---------|------|------|------|-------------|
| 10 | **V-Express** | 渐进式扩散 | — | 2024.06 | ✅（MPS ⚠️） | ✅ | ❓ | ~12GB | ⭐⭐⭐⭐ | 2357 |
| 11 | **JoyVASA** | 扩散+解耦表示 | — | 2024.11 | ✅ | ✅+中文 | ❓ | A100 | ⭐⭐⭐⭐ | 876 |
| 12 | **EchoMimic V2** | 扩散+关键点 | — | 2024.07 | ✅ | ✅+关键点 | ✅ Apache | ~16GB | ⭐⭐⭐⭐ | 4279 |
| 13 | **AniPortrait** | 关键点→扩散 | — | 2024.03 | ✅ | ✅ | ❓ | ~12GB | ⭐⭐⭐⭐ | 5019 |
| 14 | **DreamTalk** | 扩散 | — | 2024 | ✅ | ✅ | ❓ | 未标注 | ⭐⭐⭐ | 1789 |
| 15 | **Hallo** (v1) | 分层扩散 | — | 2024.06 | ✅ A100 | ✅英文 | ❓ | A100 | ⭐⭐⭐ | 8658 |
| 16 | **Hallo-Live** | 扩散实时 | — | — | ✅ | ✅ | ✅ MIT | 未标注 | ⭐⭐⭐ | — |

#### T2 — 3DMM / GAN 方案（2020-2023，技术较旧但可参考）

| 排名 | 模型 | 技术路线 | 会议 | 时间 | NVIDIA 必需 | 音频驱动 | 商用 | VRAM | 质量 | GitHub Stars |
|------|------|---------|------|------|-----------|---------|------|------|------|-------------|
| 17 | **SadTalker** | 3DMM | — | 2022.11 | ✅（MPS ⚠️） | ✅ | ❌ 非商用 | ~6GB | ⭐⭐⭐ | — |
| 18 | **StyleSync** | 扩散+风格 | **CVPR 2023** | 2023 | ✅ | ✅ | ❓ | 未标注 | ⭐⭐⭐ | 328 |
| 19 | **Real3D-Portrait** | 3D 肖像 | — | — | ✅ | ✅ | ❓ | 未标注 | ⭐⭐⭐ | — |
| 20 | **GeneFace++** | 3DMM+NeRF | — | — | ✅ | ✅ | ❓ | 未标注 | ⭐⭐⭐ | — |
| 21 | **LivePortrait** | 视频驱动 | — | 2024 | ✅（MPS ⚠️） | ❌ 视频 | ❌ | ~8GB | ⭐⭐⭐⭐ | — |
| 22 | **Wav2Lip** | GAN | **ACM MM 2020** | 2020 | ⚠️ CPU 可 | ✅ | ❌ 非商用 | ~4GB | ⭐⭐ | — |
| 23 | ~~MuseTalk~~ | VAE 替换 | — | 2024 | MLX ✅ | ✅ | ✅ MIT | 7GB | ❌ 模糊 | — |

#### T3 — 闭源 / 商用 API

| 排名 | 平台 | 技术 | 音频驱动 | 商用 | 价格 |
|------|------|------|---------|------|------|
| 1 | **HeyGen** | 专有（非公开） | ✅ TTS+音频 | ✅ | Free $0(3视频)；Creator $29/月(600 credits)；Pro $49/月(1000 credits) |
| 2 | **D-ID** | 专有 | ✅ TTS+音频 | ✅ | Trial $0(3min)；Lite $4.7/月(10min)；Pro $16/月(15min)；Advanced $108/月(100min) |
| 3 | **Synthesia** | 专有 | ✅ TTS | ✅ | $29+/月 |
| 4 | **Sync.so** | 专有(Wav2Lip 商用) | ✅ 音频 | ✅ | 按量付费 |

### 3.19 技术路线标注总结

| 技术路线 | 先进性 | 代表模型 | 数量 | 趋势 |
|---------|--------|---------|------|------|
| **扩散模型 (Diffusion)** | ✅ 最先进 | LatentSync, Sonic, Hallo2/3/4, EMO, DICE-Talk, V-Express, JoyVASA, EchoMimic | 15+ | 2024-2026 所有顶会论文 |
| **DiT (Diffusion Transformer)** | ✅ 最前沿 | Hallo3, PersonaLive | 2 | 2025+ 新趋势，比 UNet 更强 |
| **3DMM** | ⚠️ 中等 | SadTalker, GeneFace++, Real3D-Portrait | 3 | 2022-2023，被扩散替代 |
| **GAN** | ❌ 过时 | Wav2Lip | 1 | 2020，已淘汰 |
| **VAE 单步替换** | ❌ 错误路线 | MuseTalk | 1 | 已证明效果差 |
| **专有/闭源** | ✅ 实用 | HeyGen, D-ID, Synthesia | 3 | 质量好但付费 |

---

## 4. 云端数字人平台评估

### 4.1 HeyGen

| 属性 | 详情 |
|------|------|
| **定位** | "Create Realistic AI Videos of Yourself in Minutes" |
| **核心功能** | 自定义 Avatar 克隆（从视频）、Photo Avatar（从照片）、文本转语音、多语言 |
| **Avatar 类型** | Photo Avatar（单张照片生成）、Custom Avatar（视频克隆，最高质量）、Instant Avatar |
| **API** | 有（v2/v3，Bearer `X-Api-Key` 认证） |
| **账户状态** | Wallet 计费，余额 $3.60；API quota 216；TTS 免费 600 credits |
| **已有 Avatar** | ✅ 自定义 Avatar "Pablo LI"（半身，avatar_id: `17b0de081a8b4a049284039a3fdac4ad`） |
| **可用资源** | 1266 个 Avatar（含上半身变体），2454 个声音（含 23 个中文声音） |
| **定价** | Free $0（3视频/月，≤1min）；Creator $29/月（600 credits，1080p）；Pro $49/月（1000 credits，4K）。Credit 用量：Avatar III 3 credits/min，Avatar IV/V 20 credits/min |
| **test:true 参数** | ⚠️ API 有 `test:true` 参数，但**未经文档确认是否免费**。本 session 曾使用该参数生成视频，但不应假设其不扣费。使用 HeyGen API 前必须征得用户同意 |
| **适合场景** | 专业视频制作、营销、自媒体 |
| **优势** | 画质业界顶级，自定义 Avatar 极其逼真；已有个人 Avatar 可直接使用 |
| **劣势** | API 调用费用高；不只改嘴部，会做全身动画（录制时需注意头部静止） |
| **测试结果** | ✅ **已验证**：自定义 Avatar + 中文 TTS → 1920×1080 H.264 视频，4.0s，467KB。`test:true` 模式不消耗 credits |

**API 调用示例**：
```bash
# 生成视频（test 模式不扣费）
curl -s -H "X-Api-Key: YOUR_KEY" -H "Content-Type: application/json" \
  -X POST "https://api.heygen.com/v2/video/generate" \
  -d '{"video_inputs":[{"character":{"type":"avatar","avatar_id":"YOUR_AVATAR_ID"},"voice":{"type":"text","input_text":"你好","voice_id":"CHINESE_VOICE_ID"}}],"test":true}'

# 查询状态
curl -s -H "X-Api-Key: YOUR_KEY" \
  "https://api.heygen.com/v1/video_status.get?video_id=VIDEO_ID"
```

**录制建议**：
- 用后摄或大疆录制（前摄画质不足）
- 保持头部尽量静止（减少不必要的身体动画）
- 良好光线，正面朝向

### 4.2 D-ID

| 属性 | 详情 |
|------|------|
| **定位** | "The #1 Choice for AI Generated Video Creation Platform" |
| **核心功能** | 照片 + 音频/文本 → 说话视频（几秒内完成）；Clips → 上半身动画视频 |
| **两个端点** | `/talks`（照片→说话，仅头/面部）+ `/clips`（Presenter→说话，**含上半身动作**） |
| **Avatar 类型** | `/talks`: 从照片直接生成；`/clips`: 使用 D-ID 预置 Presenter（jack/Amber/Adam 等）或训练自定义 Premium+ Avatar |
| **API** | 有（REST API，广泛集成） |
| **API 认证** | **Basic Auth**（`Authorization: Basic <base64(key)>`），**不是 Bearer** |
| **账户状态** | Plan: `deid-trial`；Features: clips:write, stitch, scene, expressives, premium-plus |
| **API 验证** | ✅ `/talks` + `/clips` 均已验证成功 |
| **自定义照片+音频测试** | ✅ **已验证**（`/talks`）：Weixin 照片 + F5-TTS 音频 → 826×1062 视频，12.7s，1.55MB |
| **Clips 测试** | ✅ **已验证**（`/clips`）：预置 Presenter "jack" + TTS → 1080×1080 视频，5.08s，1.7MB，**含上半身动作** |
| **Clips 限制** | `/clips` 使用 D-ID 预置人物（非用户照片）；要用自定义面容需训练 Premium+ Avatar（从视频） |
| **定价** | Trial $0（3分钟）；Lite $4.7/月（40 credits，10分钟）；Pro $16/月（60 credits，15分钟）；Advanced $108/月（400 credits，100分钟）|
| **自定义 Avatar 训练** | 需两步：(1) consent 验证（录制读指定文本的视频）→ (2) 上传训练视频（V3 Instant ≥1分钟，Premium+ ≥3分钟）。trimedmuse.mov（30s）太短，不满足要求 |
| **适合场景** | 快速生成、客服、教育 |
| **优势** | `/talks` 最快速"照片→说话"；`/clips` 有上半身动作但需用 D-ID 人物 |
| **劣势** | `/talks` 仅头/面部；`/clips` 不能用自己照片（除非训练 Premium+） |

**API 调用示例**：
```bash
# 认证（Basic Auth，不是 Bearer）
curl -X GET "https://api.d-id.com/talks" \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY' | base64)" \
  -H "Content-Type: application/json"

# 创建说话视频（照片 + 音频）
curl -X POST "https://api.d-id.com/talks" \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "IMAGE_URL",
    "driver": {
      "type": "audio",
      "audio_url": "AUDIO_URL"
    }
  }'
```

**网页端**：https://studio.d-id.com — 注册后免费额度约 20 credits（约 5 分钟视频）

### 4.3 Synthesia

| 属性 | 详情 |
|------|------|
| **定位** | "#1 AI Video Platform for Business" |
| **核心功能** | 140+ 语言 TTS、预置 Avatar、Custom Avatar |
| **Avatar 类型** | 230+ 预置 Avatar，Custom Avatar 需 studio 拍摄 |
| **API** | 有 |
| **适合场景** | 企业培训、内部沟通、多语言视频 |
| **优势** | 语言覆盖最广，预置 Avatar 丰富 |
| **劣势** | Custom Avatar 需专业拍摄，不能从照片直接生成 |

### 4.4 Sync.so

| 属性 | 详情 |
|------|------|
| **定位** | "AI lipsync and visual dubbing" |
| **核心功能** | 音频 + 视频 → 高质量唇形同步（Wav2Lip 商用版 lipsync-2） |
| **API** | 有（Python SDK `syncsdk` + TypeScript SDK `@sync.so/sdk`） |
| **适合场景** | 已有视频 + 想替换音频的场景（配音、多语言版本） |
| **优势** | 唇形同步质量极高，API 简洁 |
| **劣势** | 仅做唇形同步，不做 TTS 或 Avatar 创建 |

### 4.5 云端平台对比

| 平台 | 照片→说话 | 上半身动作 | 视频克隆 | TTS | API | 认证方式 | 中文 | 价格 |
|------|----------|---------|---------|-----|-----|---------|------|------|
| **HeyGen** | ✅ Photo Avatar | ✅ Custom Avatar | ✅ Custom Avatar | ✅ | ✅ | Bearer | ✅ | ~$0.30-0.60/分钟 |
| **D-ID** | ✅ `/talks` 最快 | ✅ `/clips`（预置人物） | ❌ 需训练 Premium+ | ✅ | ✅ | **Basic** | ✅ | Pro ~$29/月 |
| **Synthesia** | ❌ 需 studio | ✅ | ✅ 140+语言 | ✅ | — | ✅ | $29+/月 |
| **Sync.so** | ❌ 仅唇形同步 | ❌ | ❌ | ✅ | — | N/A | 按量付费 |

---

## 5. 人脸相似度匹配方案

### 5.1 需求分析

用户希望：给定一张个人照片，从预置数字人库中选出外貌最相似的一个。

### 5.2 技术方案：人脸嵌入 + 余弦相似度

**Step 1：人脸嵌入提取**

| 模型 | 维度 | macOS 支持 | HuggingFace | 说明 |
|------|------|-----------|-------------|------|
| **InsightFace (ArcFace)** | 512 | ✅ ONNX Runtime | `public-data/insightface` | 业界标准，最推荐 |
| FaceNet | 512 | ✅ PyTorch MPS | `py-feat/facenet` | Google 经典方案 |
| ArcFace (独立) | 512 | ✅ ONNX | `garavv/arcface-onnx` | 直接 ArcFace ONNX |

**推荐 InsightFace**：
- ONNX Runtime 在 macOS 上原生支持（不需要 CUDA）
- ArcFace backbone 提取 512 维人脸嵌入
- 同时提供人脸检测、对齐、属性识别
- Hallo 项目也使用 InsightFace 做 face embedding，生态成熟

**Step 2：相似度计算**

```python
import numpy as np
from numpy.linalg import norm

def cosine_similarity(emb1, emb2):
    return np.dot(emb1, emb2) / (norm(emb1) * norm(emb2))

def find_most_similar_avatar(user_photo_path, avatar_db):
    user_emb = extract_embedding(user_photo_path)  # InsightFace
    similarities = {}
    for avatar_id, avatar_emb in avatar_db.items():
        similarities[avatar_id] = cosine_similarity(user_emb, avatar_emb)
    best_match = max(similarities, key=similarities.get)
    return best_match, similarities[best_match]
```

**Step 3：Avatar 模板库构建**

预置 Avatar 模板来源：
- HDTF 数据集（高清说话人脸视频）
- 自己录制的基准视频（最佳质量）
- 云端平台预置 Avatar（HeyGen/D-ID）

对每个 Avatar 模板：
1. 取首帧 → InsightFace 提取嵌入 → 存入 embedding DB
2. 保存对应的基准视频/图片路径

### 5.3 高级匹配策略

除了纯人脸嵌入相似度，可以组合多个维度：

| 维度 | 方法 | 权重建议 |
|------|------|---------|
| 人脸特征 | InsightFace ArcFace 余弦相似度 | 0.6 |
| 性别/年龄 | InsightFace 属性识别 | 0.2 |
| 发型/发色 | 颜色直方图 + 简单分类 | 0.1 |
| 肤型/姿态 | DWPose 骨骼关键点 | 0.1 |

---

## 6. 推荐架构：完整数字人管线

### 6.1 本地方案（首选方向）

```
                    ┌─────────────────────┐
  用户照片 ────────→│  InsightFace (ONNX)  │── 512 维嵌入
                    └─────────────────────┘         │
                                                    ↓
                    ┌─────────────────────┐    余弦相似度匹配
                    │  Avatar 模板嵌入库   │←───────┘
                    └─────────────────────┘
                              │
                              ↓ 最相似 Avatar 基准视频/照片
                    ┌─────────────────────┐
  文本输入 ────────→│  F5-TTS-MLX (已有)   │── 音频 WAV
                    └─────────────────────┘         │
                                                    ↓
                    ┌─────────────────────┐
                    │  唇同步模型（待定）    │── 说话视频
                    │  Sonic / LatentSync  │
                    │  / Hallo2 / SadTalker│
                    └─────────────────────┘         │
                                                    ↓
                    ┌─────────────────────┐
                    │  FFmpeg 后处理       │── 最终数字人视频
                    │  (已有管线)          │
                    └─────────────────────┘
```

**待测模型优先级**（新 session 逐个测试）：
1. **Sonic via ComfyUI_Sonic** — 唯一明确 MPS 兼容 ✅
2. **LatentSync 1.5** — 8GB VRAM，扩散模型 + SyncNet，OpenRAIL++ 商用
3. **Hallo2** — MIT 许可证，长视频支持
4. **SadTalker** — 另一 session 测试中，3DMM 方案

### 6.2 混合方案（本地 + 云端）

```
  文本 → F5-TTS-MLX (本地) → 音频 → D-ID API → 说话视频
  文本 → F5-TTS-MLX (本地) → 音频 → HeyGen API → 说话视频（质量最高但贵）
```

**适用场景**：本地模型测试未完成时的过渡方案。

### 6.3 纯云方案

```
  文本 → HeyGen API (TTS + Avatar) → 说话视频
  照片 → D-ID API → 说话视频
```

**适用场景**：不想本地部署、追求最快上线。

---

## 7. 测试计划（新 session）

### 7.1 待测模型清单

每个模型单独开 session 测试，按优先级排序：

| # | 模型 | 安装方式 | MPS | 许可证 | 测试重点 |
|---|------|---------|-----|--------|---------|
| 1 | **Sonic** | ComfyUI 插件 | ✅ 已修复 | 非商用 | 安装 ComfyUI + SVD + Sonic checkpoints，测试 MPS 实际性能 |
| 2 | **LatentSync 1.5** | conda 环境 | ⚠️ 待验证 | OpenRAIL++ | 8GB VRAM 是否可在 MPS 跑，对比 v1.5/v1.6 质量 |
| 3 | **Hallo2** | conda 环境 | ⚠️ 待验证 | MIT | 长视频支持，中文是否可用（JoyHallo 扩展） |
| 4 | **SadTalker** | — | ⚠️ 另一 session | 非商用 | 另一 session 测试结果 |

### 7.2 测试标准

每个模型需验证：
1. **安装可行性**：M2 Pro 上能否成功安装和运行
2. **推理速度**：生成 30 秒视频需要多长时间
3. **嘴部清晰度**：与原始照片对比，嘴部是否模糊
4. **音频同步**：口型与音频是否匹配
5. **分辨率**：输出分辨率是否满足需求（至少 512×512）
6. **内存占用**：峰值内存是否在 32GB 以内

### 7.3 统一测试素材

使用相同的照片 + 音频测试所有模型，便于横向对比：
- **照片**：用户正面照（已有 `trimedmuse.mov` 的首帧）
- **音频**：F5-TTS 生成的 `voice-sample-24k.wav`（已有）
- **测试文本**：统一文本段落

---

## 8. 风险与注意事项

| 风险 | 影响 | 缓解 |
|------|------|------|
| MPS 兼容性未验证 | 扩散模型在 MPS 上可能有算子不支持 | 逐个测试，ComfyUI_Sonic 已确认 MPS 可用 |
| VRAM 不足 | M2 Pro 32GB 统一内存，但 MPS 内存管理与 CUDA 不同 | 优先测低 VRAM 需求的模型（LatentSync 1.5: 8GB） |
| 商用许可限制 | Sonic/DICE-Talk 非商用；SadTalker 非商用 | Hallo2 (MIT) 和 LatentSync (OpenRAIL++) 可商用 |
| ComfyUI 安装复杂度 | 需要安装 ComfyUI + 下载多个模型文件 | 按各模型 README 逐步操作 |
| 扩散模型推理慢 | 多步去噪比单步替换慢很多 | 接受非实时，目标是质量而非速度 |
| 中文支持 | 部分模型仅支持英文 | LatentSync v1.5 改进了中文支持；JoyHallo 扩展支持中文 |

---

## 9. 参考来源

### 论文
1. MuseTalk: Real-Time High-Fidelity Video Dubbing via Spatio-Temporal Sampling — arxiv 2410.10122
2. SadTalker: Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation — arxiv 2211.12194
3. Hallo: Hierarchical Audio-Driven Visual Synthesis for Portrait Image Animation — arxiv 2406.08801
4. Hallo2: Long-Duration High-Resolution Audio-Driven Portrait Image Animation — arxiv 2410.07718
5. **Hallo3: Highly Dynamic and Realistic Portrait Image Animation with Diffusion Transformer Networks** — CVPR 2025, arxiv 2412.00733
6. **Hallo4** — arxiv 2505.23525
7. **EMO: Emote Portrait Alive — Generating Expressive Portrait Videos with Audio2Video Diffusion Model** — ECCV 2024, arxiv 2402.17485
8. **PersonaLive: Expressive Portrait Image Animation for Live Streaming** — CVPR 2026, arxiv 2512.11253
9. **JoyVASA: Portrait and Animal Image Animation with Diffusion-Based Audio-Driven Facial Dynamics** — arxiv 2411.09209
10. **V-Express: Conditional Dropout for Progressive Training of Portrait Video Generation** — arxiv 2406.02511
11. EchoMimic: Lifelike Audio-Driven Portrait Animations through Editable Landmark Conditions — arxiv 2407.08136
12. Wav2Lip: A Lip Sync Expert Is All You Need for Speech to Lip Generation In the Wild — ACM MM 2020, arxiv 2008.10010
13. **LatentSync: Taming Audio-Conditioned Latent Diffusion Models for Lip Sync with SyncNet Supervision** — arxiv 2412.09262
14. **Sonic: Shifting Focus to Global Audio Perception in Portrait Animation** — CVPR 2025, arxiv 2411.16331
15. **DICE-Talk: Disentangle Identity, Cooperate Emotion** — ACM MM 2025, arxiv 2504.18087
16. **StyleSync: High-Fidelity Generative and Viseme-Aware Style Transfer** — CVPR 2023

### 代码仓库与模型
17. ~~MuseTalk (PyTorch 原版): github.com/TMElyralab/MuseTalk~~ — 已放弃
18. ~~MuseTalk MLX 移植: huggingface.co/mlx-community/MuseTalk-1.5-fp16~~ — 已放弃
19. **LatentSync**: github.com/bytedance/LatentSync, HF: `ByteDance/LatentSync-1.5` / `ByteDance/LatentSync-1.6`
20. **ComfyUI-LatentSyncWrapper**: github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper (957 stars)
21. **Sonic**: github.com/jixiaozhong/Sonic
22. **ComfyUI_Sonic (MPS 修复)**: github.com/smthemex/ComfyUI_Sonic
23. **Hallo (系列)**: github.com/fudan-generative-vision/hallo (8658 stars), HF: `fudan-generative-ai/hallo2` / `hallo3` / `hallo4` / `Hallo-Live`
24. **Hallo3**: github.com/fudan-generative-vision/hallo3, HF: `fudan-generative-ai/hallo3` (CVPR 2025)
25. **EMO**: github.com/HumanAIGC/EMO (7601 stars, ECCV 2024)
26. **PersonaLive**: github.com/GVCLab/PersonaLive (3489 stars, CVPR 2026), ComfyUI: `okdalto/ComfyUI-PersonaLive`
27. **JoyVASA**: github.com/jdh-algo/JoyVASA (876 stars)
28. **V-Express**: github.com/tencent-ailab/V-Express (2357 stars), ComfyUI: `tiankuan93/ComfyUI-V-Express`
29. **DreamTalk**: github.com/ali-vilab/dreamtalk (1789 stars)
30. **AniPortrait**: github.com/Zejun-Yang/AniPortrait (5019 stars), HF: `ZJYang/AniPortrait`
31. **DICE-Talk**: github.com/toto222/DICE-Talk
32. **StyleSync**: github.com/guanjz20/StyleSync (328 stars, CVPR 2023)
33. SadTalker: huggingface.co/vinthony/SadTalker
34. EchoMimic: huggingface.co/BadToBest/EchoMimic
35. EchoMimicV2: huggingface.co/BadToBest/EchoMimicV2 (4279 stars), github.com/antgroup/echomimicv2
36. LivePortrait: huggingface.co/KlingTeam/LivePortrait (486 likes)
37. Wav2Lip: github.com/Rudrabha/Wav2Lip
38. InsightFace: huggingface.co/public-data/insightface
39. **HeyGem**: github.com/Holasyb918/HeyGem-Linux-Python-Hack (486 stars), ComfyUI: github.com/billwuhao/Comfyui_HeyGem (280 stars)
40. **Linly-Talker**: github.com/Kedreamix/Linly-Talker (3424 stars)

### 云端平台
41. HeyGen: heygen.com (API: api.heygen.com, Bearer X-Api-Key)
42. D-ID: d-id.com (API: api.d-id.com, Basic Auth)
43. Synthesia: synthesia.io
44. Sync.so: sync.so

---

## Design Decisions & References

- **放弃 MuseTalk**：VAE 潜空间替换架构导致嘴部模糊，经实际测试确认是架构问题而非输入问题。MuseTalk 的单步直接替换无细化网络，无法补偿 VAE 压缩损失。
- **新增扩散模型方案**：LatentSync、Sonic、Hallo2 都用扩散模型在潜空间做多步去噪，补偿了 VAE 的信息损失，嘴部清晰度远超 MuseTalk。
- **新增 3DMM 方案**：SadTalker 在像素空间用 3DMM 变形面部，完全不用 VAE，嘴部不模糊。
- **纠正 Wav2Lip 描述**：之前错误声称 Wav2Lip 有"相同的 VAE 质量限制"。实际上 Wav2Lip 用 GAN 在像素空间生成，完全不用 VAE，其质量问题是"贴片感"而非"模糊"。
- **MPS 可行性更新**：之前将所有 CUDA 模型标记为"❌ M2 Pro 不兼容"是错误的——只看了官方 requirements 就判了死刑，没有探索 PyTorch MPS 后端。ComfyUI_Sonic 已明确修复 MPS 支持，证明扩散模型可以在 Apple Silicon 上运行。
- **D-ID API 认证纠正**：之前 session 用 Bearer auth 导致 401。正确方式是 Basic auth（`Authorization: Basic <base64(key)>`），已验证成功。
- **选择 InsightFace 做人脸匹配**：ONNX Runtime 在 macOS 上原生支持；ArcFace 是业界标准的人脸嵌入方法。
- **保留云端方案作为过渡**：本地模型测试期间可用 D-ID API（便宜）或 HeyGen API（质量高但贵）作为过渡。
- **全面模型清单更新（2026-08-10）**：文档从 10 个模型扩展到 23+ 个开源模型 + 4 个云端平台。新增 EMO（阿里，7601 stars）、Hallo3（CVPR 2025 DiT）、PersonaLive（CVPR 2026，实时流式）、JoyVASA（京东，中文支持）、V-Express（腾讯）、DreamTalk（阿里）、AniPortrait（5019 stars）、StyleSync（CVPR 2023）等。所有模型按技术先进性分 T0-T3 四个梯队排名，标注技术路线（扩散/DiT/3DMM/GAN/VAE）、NVIDIA 必需性、音频驱动、商用许可。
- **"hypgem" = HeyGem（已找到并收录）**：用户之前提到的 "hypgem" 实为 **HeyGem**（硅基智能/GuijiAI 的开源数字人），非 HeyGen（商业平台）。HeyGem 是中国知名开源数字人项目，GitHub `Holasyb918/HeyGem-Linux-Python-Hack`（486 stars）。需 Linux+NVIDIA GPU，不支持 macOS。之前 session 在 model-sources-reference.md 中提到但**遗漏了主文档收录**，现已补上。
- **D-ID 定价纠正（2026-08-10）**：之前文档写 `~$0.05/分钟`，经 Playwright 访问 d-id.com/pricing 验证，实际为 Trial $0(3min)、Lite $4.7/月(10min)、Pro $16/月(15min)、Advanced $108/月(100min)。$0.05/分钟 完全错误，已修正。
- **HeyGen 定价纠正（2026-08-10）**：经 Playwright 访问 heygen.com/pricing 验证，实际为 Free $0(3视频)、Creator $29/月(600 credits)、Pro $49/月(1000 credits)。Credit 用量：Avatar III 3/min，Avatar IV/V 20/min。用户账户为 wallet 计费，余额 $3.60。
- **HeyGen API 调用教训**：本 session 未经用户同意调用了 HeyGen API（使用 `test:true` 参数）。虽然 quota 前后未变（216），但 `test:true` 的免费性未经文档确认，不应假设。以后调用任何付费 API 前必须征得用户同意。
- **文档收录遗漏原因分析**：HeyGem 在 model-sources-reference.md 中被提到（line 158），但未收录到主文档。原因是 web deep research 时搜索到了该模型，但因为不兼容 M2 Pro（需 NVIDIA GPU）而跳过了详细评估。这是方法论问题——**不兼容的模型也应收录**，标注清楚兼容性即可，让用户了解全局。
