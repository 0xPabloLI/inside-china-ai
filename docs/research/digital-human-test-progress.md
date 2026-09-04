# 数字人模型测试进度追踪

> **最后更新**：2026-09-04（SoulX-FlashTalk 14B ✅ Modal A100-80GB 测试成功；SoulX-FlashHead 基座测试完成 + 全平台适配搜索 + 测试素材整理到 `dh-fixtures/`；超分工具已有但未接入数字人 pipeline）
> **设备**：MacBook Pro M2 Pro 32GB, macOS 26.5.1 + **Kaggle T4×2 15GB×2（✅ 已验证）** + **Colab T4 15GB**
> **配套文档**：`docs/research/digital-human-solutions-m2-pro.md`（模型调研与技术分析）
> **云 GPU 文档**：`docs/research/cloud-gpu-options.md`、`docs/handoffs/cloud-gpu-kaggle-setup.md`
> **用途**：多 session 共享追踪文件，每次测试后更新此文件
>
> **文档结构说明**：本文档是测试进度+云 GPU 调研的主文件。`digital-human-solutions-m2-pro.md` 是配套的模型调研报告（技术架构对比、模型评估、人脸匹配方案），两文档互补引用，不重复内容。合并不可行——调研报告 28K tokens + 本文档 70K+ tokens，合并后超 100K tokens 不便导航。

---

## 文档规则

### 参数信源标注（强制，2026-09-02 起）

所有测试参数（推理步数 `sample_steps`、文本/音频引导 `sample_text/audio_guide_scale`、`sample_shift`、帧数 `frame_num`/`max_frame_num`、分辨率、量化方式 `quant`、GPU 类型、LoRA `lora_scale` 等）**必须逐条标注信源**。信源优先级：

1. **官方文档优先**：模型官方 README、源码（含默认参数）、HuggingFace 模型卡、官方论文、官方加速/LoRA 章节（如 FusionX、lightx2v 的专门章节）。
2. **社区讨论次之**：GitHub Issues、社区 LoRA 发布页、Reddit/Discord、博客教程——仅在无官方值或官方值需补充时使用，并明确标注「社区来源：…」。
3. **禁止无信源参数**：既无官方也无社区来源的参数，标注 `待验证` 并写明假设依据；`作废` 的值禁止回用（见 §参数矩阵 规则）。
4. **License 门禁**：商用许可不明确或 NC 的候选一律不测试；筛选阶段即在模型条目标注「不测」，只测可商用或许可已核实的（2026-09-02 用户规则）。

> 与 §参数矩阵 规则一致：有官方值用官方值；组合维度无官方值时，取各 artifact 各自官方默认作起点；来源必须标注。

### 生成偏好（强制，2026-09-03 用户规则）

所有数字人生成（无论哪个模型）**一律用用户自己的照片做参考图**，不用第三方/官方示例素材——否则无法做同素材 A/B 横向对比。

- **用户照片**：`scripts/short-video/assets/dh-fixtures/portrait-original-4k.jpg`（3072×4096 竖图，3:4）→ 裁切版 `portrait-face.jpg`（827×1063）/ `portrait-fullbody.jpg`（1080×1920）/ `portrait-small.jpg`（240×308）
- **裁切**：按目标模型要求裁切（Hallo3 需 1:1 或 3:2；EchoMimicV3/InfiniteTalk 按各自 ref 比例）
- **音频**：按模型语言限制选（Hallo3 必须英文；EchoMimicV3/InfiniteTalk 可中文）

---

## 测试总览

### 本地模型

| #   | 模型                               | 技术路线                             | 分辨率   | 发布    | MPS                    | 商用                                            | 状态                                                                                                                                                                       | 日期       |
| --- | ---------------------------------- | ------------------------------------ | -------- | ------- | ---------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | ~~MuseTalk 1.5 MLX~~               | VAE 替换                             | 256px    | —       | ✅ MLX                 | ✅ MIT                                          | ❌ 放弃                                                                                                                                                                    | 2026-08-09 |
| 2   | ~~SadTalker~~                      | 3DMM                                 | —        | —       | ✅                     | ❌                                              | ❌ 效果差                                                                                                                                                                  | 2026-08-09 |
| 3   | ~~LatentSync 1.5~~                 | 扩散+SyncNet                         | 256px    | —       | ✅ (需 patch)          | ✅ OpenRAIL++                                   | ❌ 效果差                                                                                                                                                                  | 2026-08-10 |
| 4   | ~~LatentSync 1.6~~                 | 扩散+SyncNet                         | 512px    | —       | ❌ MPS OOM             | ✅ OpenRAIL++                                   | ❌ OOM                                                                                                                                                                     | 2026-08-10 |
| 5   | ~~Sonic~~                          | SVD 扩散                             | —        | —       | ❌ 不可用              | ❌ 非商用                                       | ❌ 不可用                                                                                                                                                                  | 2026-08-10 |
| 6   | ~~Hallo2~~                         | 分层扩散                             | 256px    | —       | ✅ MPS                 | ✅ MIT                                          | ❌ 256px 太低                                                                                                                                                              | 2026-08-10 |
| 7   | ~~LivePortrait~~                   | Warping                              | 826×1062 | —       | ✅ MPS                 | ✅                                              | ❌ 无音频驱动                                                                                                                                                              | 2026-08-10 |
| 8   | ~~V-Express~~                      | 渐进式扩散                           | —        | —       | ❌ MPS 太慢            | ❓                                              | ❌ 17min/sub-step                                                                                                                                                          | 2026-08-11 |
| 9   | **PersonaLive**                    | 流式扩散                             | —        | 2025-11 | ⚠️ 待验证              | ❌ 非商用                                       | 📋 待测                                                                                                                                                                    | —          |
| 10  | ~~LongCat-VA-1.5 MLX~~             | MLX 扩散                             | 432×256  | 2025-12 | ✅ MLX                 | ✅ MIT                                          | ❌ **不可用**（不像本人+唇同步错位）                                                                                                                                       | 2026-08-19 |
| 10b | ~~LongCat-VA-1.5 MLX 480×832~~     | MLX 扩散                             | 480×832  | 2025-12 | ✅ MLX                 | ✅ MIT                                          | ❌ **全黑输出**                                                                                                                                                            | 2026-08-18 |
| 11  | ~~EchoMimicV3 Flash~~              | Wan2.1 扩散                          | 624×816  | 2025-07 | ✅ Kaggle P100         | ✅ Apache 2.0                                   | ✅ v51 最优配置（talking head, 8步蒸馏, ~14min/段）                                                                                                                        | 2026-08-22 |
| 10  | **LongCat-Video-Avatar-1.5**       | DiT + 音频驱动                       | 480p     | 2025-12 | ✅ **Modal A100-80GB** | ✅ MIT                                          | ✅ **v11.1 bf16+DMD 8步可用**（2026-09-02 用户确认：唇同步基本正常但**口型幅度偏大偏夸张**；镜片绿色为反光非伪影；4.3min/3.2s 段，$0.18；调优方向：audio CFG 下探 3.0）    | 2026-09-02 |
| 11  | **InfiniteTalk**                   | 稀疏帧视频配音(talking body)         | 576×704  | 2025-08 | ✅ Modal A100          | ✅ lightx2v LoRA 可商用 / ~~FusionX NC 已停测~~ | ✅ **v10.18 lightx2v 4步可用**（9.3min/3s 段，$0.42，lip sync 达标但表情偏僵，2026-09-02 用户确认）——可商用备选；v10.17 FusionX 8 步 $0.56 表情最佳仅作质量基线（NC 停测） | 2026-09-02 |
| 12  | ~~**Hallo3**~~                     | Transformer DiT                      | 720×480  | 2024-11 | ✅ Modal A100-80GB     | ✅ MIT                                          | ❌ **否决**（self-portrait+deepseek 同素材 A/B：与 EchoMimicV3 接近但无显著优势；只能英文+只能 head+25min/5.2s，用户判定效果不好）                                         | 2026-09-03 |
| 13  | ~~EchoMimicV3 Flash (Modal)~~      | 多任务扩散                           | 512×512  | 2025-07 | ✅ Modal T4 NF4        | ✅ Apache 2.0                                   | ✅ NF4 量化已测（5min/段, talking head）                                                                                                                                   | 2026-08-23 |
| 14  | **FeatherTalk**                    | 轻量级框架                           | —        | 2026-07 | ⚠️ 待测                | ✅ Apache 2.0                                   | ⏸️ **等用户录口播视频**（3-5min 25fps，需训练个性化模型；5.46M 可本地 CPU 跑）                                                                                             | —          |
| 15  | **LTX-2.3 + AV-LoRA-talking-head** | DiT + LoRA                           | —        | —       | ❌ 22B 需大显存        | ✅ OpenRAIL                                     | 📋 低优先级                                                                                                                                                                | —          |
| 16  | ~~**LeapTalk**~~                   | 桥蒸馏（Brownian bridge 数据到数据） | 512×512  | 2026-07 | ⚠️ Kaggle T4           | ✅ Apache 2.0                                   | ❌ **否决**（v4-v8 五轮穷尽参数空间，画质远不及 InfiniteTalk/EchoMimicV3；音视频不同步是架构固有问题；设计取向为实时流式换画质，不适合离线生产）                           | 2026-09-03 |
| 17  | **SoulX-FlashHead (Model_Pro)**    | Wan2.1 DiT 1.3B 基座（未蒸馏）       | 512×512  | 2026-02 | ✅ Kaggle T4           | ✅ Apache 2.0                                   | ✅ **基座可用**（675.7s/3.08s段；嘴部有动态变化，画质清晰无伪影；验证 LeapTalk 差是1步桥蒸馏造成而非基座）                                                                 | 2026-09-04 |
| 18  | **SoulX-FlashHead (Model_Lite)**   | LTX-VAE 轻量基座                     | 512×512  | 2026-02 | ✅ Kaggle T4           | ✅ Apache 2.0                                   | ✅ **基座可用**（197.5s/3.08s段；嘴部有动态，画质略逊 Pro——稍平滑；实时路线 96 FPS on RTX4090）                                                                            | 2026-09-04 |
| 19  | **SoulX-FlashTalk 14B**            | Wan+InfiniteTalk talking body        | 416×720  | 2025-12 | ✅ Modal A100-80GB     | ✅ Apache 2.0                                   | ✅ **最佳 Talking Body**（350s/5.2s段, $0.20, 手指细节好, 2026-09-04 用户确认）                                                                                            | 2026-09-04 |

### 云端 API

| #   | 平台       | 端点        | 输入                 | 状态      | 测试文件                             | 日期       |
| --- | ---------- | ----------- | -------------------- | --------- | ------------------------------------ | ---------- |
| 1   | **D-ID**   | `/talks`    | 照片 + 音频          | ✅ 已验证 | `did-pablo-weixin-f5tts.mp4` (1.5MB) | 2026-08-10 |
| 2   | **D-ID**   | `/clips`    | 预置 Presenter + TTS | ✅ 已验证 | `did-clip-jack-test.mp4` (1.7MB)     | 2026-08-10 |
| 3   | **HeyGen** | v2/generate | Custom Avatar + TTS  | ✅ 已验证 | `heygen-pablo-test.mp4` (467KB)      | 2026-08-10 |

> **API 平台调研存档**：#`docs/research/talking-head-api-platforms.md`（fal.ai / Replicate / HF Spaces / NVIDIA NIM / ModelScope / 火山引擎 / 国内 12 平台，含定价、覆盖矩阵、免费额度性质）
> **结论**：一次性免费额度（fal.ai $10 / Replicate 试用 / NVIDIA 1000 credits / ModelScope 36h GPU）不持续，已从测试表移除仅存档。持续免费仅 HF ZeroGPU（5min/天 Free / 40min/天 PRO $9/月），量太少。Talking head 测试走 **Kaggle T4（每周 30h 免费）** 或 **AutoDL（ cheapest paid）**。

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

### ❌ LongCat-Video-Avatar-1.5 MLX q4 — 本地模型不可用

- **日期**：2026-08-12（初测）→ 2026-08-19（最终评估）
- **结论**：❌ **不可用** — 虽然技术上能生成视频，但生成的人像与本人完全不像，唇同步与音频内容对不上
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
- **技术意义**（仅限研究参考）：
  - MLX 框架可运行，PyTorch/MPS 路径全部失败
  - q4 量化使 23GB 模型在 32GB 内存上可运行
  - DMD 蒸馏只需 8 步（vs 标准 50 步）
  - MIT 许可证，可商用
  - 支持中文（美团训练数据含中文）
- **不可用原因**（2026-08-19 最终评估）：
  - 生成的人像与输入照片**完全不像**，面孔特征丢失严重
  - 唇形与音频内容**对不上**，唇同步失败
  - 432×256 分辨率太低，无法生成可用的真实人像
  - 480×832 分辨度全黑输出（MPS 内存溢出）
  - 18 分钟生成 1 秒视频，速度慢
  - **不再做本地进一步测试**，q8/bf16 等更高精度版本在 M2 Pro 32GB 上大概率仍不可用
- **后续方向**：云 GPU bf16 版可能质量更好，但优先级低（EchoMimicV3 已在 Kaggle 成功）

#### 微信真人照片测试（2026-08-13 ~ 2026-08-19）❌ 不可用

- **输入**：微信照片 `Weixin Image_2026-08-10_003535_660.jpg` + LongCat demo `man.mp3`
- **推理**：1334.2 秒（22 分钟），29 帧，432×256
- **输出**：`scripts/short-video/experiments/digital-human/longcat-weixin-photorealistic.mp4`
- **结论**：LongCat 接受**图片输入**（非视频），但生成的人像与本人**完全不像**，唇同步与音频内容**对不上**
- **Prompt**："A Chinese man in a suit is speaking on camera, professional setting."
- **最终评估**（2026-08-19）：❌ **完全不可用** — 生成结果与预期差距太大，不再做本地进一步测试

#### 480×832 photorealistic 测试（2026-08-18）❌ 全黑输出

- **输入**：同微信照片 + photorealistic prompt
- **推理**：**5 小时**（wall time），CPU time 54min，93 帧，480×832
- **输出**：`longcat-weixin-photorealistic.npy`（111MB numpy 数组）
- **结果**：❌ **全部 93 帧为全黑（所有像素 = 0）**
  ```python
  # 验证结果
  data = np.load('longcat-weixin-photorealistic.npy')
  # shape=(93, 480, 832, 3), min=0, max=0, mean=0.0000, nonzero=0
  ```
- **原因分析**：MPS 内存不足导致推理过程中 tensor 被清零。480×832 分辨率下 93 帧的总内存需求远超 M2 Pro 32GB（MPS 上限约 18GB），MLX 在内存溢出时静默返回零张量而非报错
- **结论**：**480×832 在 M2 Pro 上不可行**，需降回 432×256 或使用云 GPU（≥16GB VRAM）
- **清理**：已删除无用的 .npy 和 .mp4 文件

### ✅ EchoMimicV3 — Kaggle T4 最优配置（v51）

- **日期**：2026-08-12 ~ 2026-08-22
- **结论**：**最优配置已固化！** Kaggle T4 上完成全链路优化，确定 v51 为最终配置
- **最优配置（v51）**：TeaCache on + torch.compile on + 720p + 8步 + sequential_cpu_offload + diffusers 0.31.0
- **推理时间**：~14 min/段（3.24s, 81帧），1分钟视频 ≈ 20段 × 14min ≈ 4.7小时
- **最佳实践 Notebook**：`xpabloli/echomimicv3-flash-best-practice-t4`
- **Kaggle Dataset**：`xpabloli/echomimicv3-flash`（17.1GB 模型权重）+ `xpabloli/echomimicv3-test-inputs`（5MB 测试输入）
- **详细优化文档**：`docs/research/echomimicv3-optimization-options.md` → "最优配置（v51）"章节
- **历史演进**：P100(24min) → T4(18min) → torch.compile(14min) → 固化
- **早期 P100 测试**（2026-08-12 ~ 2026-08-17）：
  - 环境：echomimic_v3 (蚂蚁集团/antgroup), Python 3.12, PyTorch 2.4.1+cu121, **Kaggle Tesla P100 16GB**
  - 模型：EchoMimicV3-Flash-pro（8步生成，768×768）
  - 推理时间：24.6 分钟（sequential_cpu_offload 模式）
- **输出**：portrait_output.mp4, 210KB, 768×768, 81帧
- **Kaggle kernel slug**: `xpabloli/echomimicv3-flash-test`
- **自动化脚本**：`scripts/kaggle/echomimicv3-test/echomimicv3_inference.py`（v25）
- **本地测试历史**：
  - 2026-08-12：模型文件下载不完整
  - 2026-08-13：所有模型文件下载完成，但推理报 `KeyError: 'patch_embedding.weight'`
- **Kaggle P100 云 GPU 测试**（2026-08-15 ~ 2026-08-17）：
  - **v20**（version 21）：diffusers 0.31.0 自定义安装 + FLAX_WEIGHTS_NAME patch
  - **v22**（version 24）：transformers check_torch_load_is_safe patch
  - **v23**（version 25）：tokenizer 下载修复（hf_hub_download）
  - **v24**（version 26）：OOM 修复（pipeline.to → enable_sequential_cpu_offload）— 缩进错误
  - **v25**（version 27）：缩进检测修复 — **推理成功！**
  - **v26**（version 28）：A/B 对比测试 — Weixin 照片 vs 视频截图，简化 prompt `A person is speaking.`
  - **v27/v29**（version 29）：model_cpu_offload 验证 — **OOM**，P100 16GB 不够
  - **v30**（version 30）：5步 vs 8步对比 — 同一张 Weixin 照片，时间差仅 1.7min
- **限制**：
  - `sequential_cpu_offload` 模式推理 22-24 分钟（3.24s 视频），速度较慢
  - Kaggle `kaggle kernels output` 未下载 mp4 文件（需手动从 Kaggle 网页下载）
- **后续优化方向**：
  - 验证 `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` 是否减少 GPU 内存碎片
  - 如果碎片减少后 model_cpu_offload 可行，推理时间可能大幅降低
  - 把模型打包成 Kaggle Dataset 持久化
  - 测试 Colab T4 作为并行平台
  - patch infer_flash.py 添加 `--partial_video_length` 支持长视频生成
- **关键技术问题（已全部修复）**：
  1. **PyTorch 版本**：P100 (sm_60) 需要 cu121 → 降级到 2.4.1+cu121
  2. **diffusers 版本**：安装 0.31.0 到自定义目录 + PYTHONPATH 覆盖
  3. **FLAX_WEIGHTS_NAME**：try/except patch
  4. **check_torch_load_is_safe**：patch 函数体为 pass
  5. **P100 不支持 bfloat16**：使用 float16
  6. **Tokenizer LFS 指针**：改用 `huggingface_hub.hf_hub_download`
  7. **CUDA OOM**：`pipeline.to(device)` → `enable_sequential_cpu_offload()`
  8. **Patch 缩进错误**：逐行扫描检测原始缩进 + 应用到所有替换行

#### v28 A/B 对比测试结果（2026-08-17）

| Test Case     | 参考图                                  | 大小     | 推理时间 | 说明                               |
| ------------- | --------------------------------------- | -------- | -------- | ---------------------------------- |
| A-weixin      | Weixin 照片（正面，光照均匀，827×1063） | 421.4 KB | 24.3 min | VLM 评估"perfectly frontal"        |
| B-video-frame | 视频截图（微上仰+侧偏，1080×1920）      | 203.2 KB | 24.8 min | FFmpeg 从视频截帧（Lavc62.28.102） |

- **总时间**：62.1 min（含环境安装 + 模型下载 + 两次推理）
- **Prompt**：`A person is speaking.`（简化版，不限制头部运动）
- **音频**：deepseek scene-2 截取 10s（F5-TTS 中文男声）
- **Kaggle CLI 未下载 mp4**：需从 Kaggle 网页手动下载 `echomimicv3_A-weixin.mp4` 和 `echomimicv3_B-video-frame.mp4`
- **VLM 对比分析**：Weixin 照片在光照、头部朝向、适合做 ref 方面全面优于视频截图
- **待验证**：从网页下载 mp4 后对比两个视频的实际效果（头部是否歪斜、唇同步质量）

#### v30 5步 vs 8步对比测试结果（2026-08-18）

| Test Case       | 参考图      | 步数 | 推理时间 | 文件大小 | 说明                       |
| --------------- | ----------- | ---- | -------- | -------- | -------------------------- |
| A-weixin-5steps | Weixin 照片 | 5    | 22.4 min | 432.7 KB | 官方推荐 talking-head 步数 |
| B-weixin-8steps | Weixin 照片 | 8    | 24.1 min | 421.4 KB | Flash 默认步数             |

- **总时间**：57.4 min（含环境安装 + 模型下载 + 两次推理）
- **时间差异**：仅 1.7 min（-7.1%），不是有效的时间优化手段
- **控制变量**：同一张 Weixin 照片 + 同一音频 + 同一 seed 43 + 同一 prompt
- **Kaggle CLI 未下载 mp4**：需从 Kaggle 网页手动下载 `echomimicv3_A-weixin-5steps.mp4` 和 `echomimicv3_B-weixin-8steps.mp4`
- **质量对比**：待人工评估两个 mp4 的质量差异（嘴部细节、皮肤纹理、整体自然度）

#### v30 推理时间分析

5 步 vs 8 步时间差异极小（1.7 min），原因分析：

- TeaCache 已启用（`--enable_teacache --teacache_threshold 0.1 --num_skip_start_steps 5`），会缓存和跳过部分去噪步骤
- sequential_cpu_offload 的瓶颈在于 CPU→GPU 数据搬运，而非 GPU 计算本身
- 步数从 8 减到 5 只少了 3 步 GPU 计算，但每步的 CPU-GPU 传输开销不变
- **结论**：在 sequential_cpu_offload 模式下，减少步数不是有效优化手段

#### v31 Max Effort 15步/25步测试结果（2026-08-18，log 通过 kagglehub 获取）

| Test Case        | 步数 | 推理时间           | offload 模式           | 备注                     |
| ---------------- | ---- | ------------------ | ---------------------- | ------------------------ |
| A-weixin-15steps | 15   | 29.4 min (1765.7s) | sequential_cpu_offload | audio_guidance_scale=3.0 |
| B-weixin-25steps | 25   | 31.4 min (1882.7s) | sequential_cpu_offload | audio_guidance_scale=3.0 |

- **总时间**：71.5 min（4291.7s，含环境安装 + 模型下载 + 两次推理）
- **log 获取方法**：`pip install kagglehub` → `kagglehub.notebook_output_download('xpabloli/echomimicv3-flash-test/versions/31', path='debug_log.txt', output_dir='/tmp/v31')`
- **之前预估 vs 实际**：15步预估 30min（实际 29.4min ✅），25步预估 42min（实际 31.4min ❌ 高估）
- **关键发现**：步数增加的时间代价远小于预期——8步→25步仅多 7min（+29.2%）

#### v33 最终配置固化（2026-08-18）

| 配置项                  | 值                                 | 变更说明                             |
| ----------------------- | ---------------------------------- | ------------------------------------ |
| PYTORCH_CUDA_ALLOC_CONF | expandable_segments:True           | v32 新增，解决内存碎片               |
| GPU_memory_mode         | model_cpu_offload                  | v32 验证成功，替代 sequential        |
| audio_guidance_scale    | 2.0                                | 从 3.0 降至 2.0，减少眨眼            |
| num_inference_steps     | 8                                  | Flash 默认值                         |
| 模型来源                | Kaggle Dataset `echomimicv3-flash` | 从 /kaggle/input/ 直接读取，省 12min |

- **v33 实测推理时间**：A-weixin 23.9min (1434.6s)，B-video-frame 24.2min (1453.7s)
- **总时间**：51.5 min（3093.0s，含环境安装 + Dataset 读取 + 两次推理）
- **kagglehub 下载 v33 log**：`kagglehub.notebook_output_download('xpabloli/echomimicv3-flash-test/versions/33')`
- **完整推理步数时间对比表**：见 `docs/research/echomimicv3-optimization-options.md` → "推理步数时间对比" 章节

#### v34 app_mm.py 参数组合 + 官方 demo 测试（2026-08-18，✅ 完成）

**结果**：3 个 test case 全部成功，总时间 81.2 min。

| Test Case                     | 素材                       | 步数 | 推理时间               | 输出大小 | 状态 |
| ----------------------------- | -------------------------- | ---- | ---------------------- | -------- | ---- |
| A: `weixin-8steps-appmm`      | 微信照片 + 中文音频        | 8    | **24.1 min** (1445.5s) | 415.3 KB | ✅   |
| B: `weixin-20steps-appmm`     | 微信照片 + 中文音频        | 20   | **29.1 min** (1746.0s) | 405.5 KB | ✅   |
| C: `demo-ch-man-8steps-appmm` | 官方 demo 照片+音频+prompt | 8    | **24.6 min** (1473.8s) | 361.6 KB | ✅   |

**关键发现**：

- app_mm.py 参数组合（guidance=4.5, audio=2.5, neg=1.5/2, dynamic_cfg/acfg, Flow_DPM++）与 v33 默认参数（guidance=6.0, audio=2.0, neg=1.0/0, Flow_Unipc）推理时间几乎一致
- 8步 A (24.1min) vs v33 8步 (23.9min) → 参数变化对推理时间无影响
- 20步 B (29.1min) 对比 v31 25步 (31.4min) → 步数越多越慢，线性关系
- 官方 demo C 用了 1941 字符的详细 prompt，推理时间 (24.6min) 与简单 prompt (24.1min) 无差异
- **结论：app_mm 参数组合不影响推理速度，质量差异需看视频对比**
- GPU 仍是 P100（非 T4），因为 kernel-metadata.json 未设 machine_shape

#### v34 后续待测（EchoMimicV3 原始版测完后）

原始版（`infer_flash.py`）测完 v34 后，EchoMimicV3 的下一步是**量化版测试**：

- app_mm.py 用 mmgp FP8 量化 + `offload.profile()` + `profile_type.LowRAM_HighVRAM`
- 需要写独立脚本（app_mm.py 是 Gradio UI，不能直接命令行调用）
- 量化版 VRAM 需求 8-12GB，可能不需要 CPU offload → 推理更快
- **推荐用 T4**（Tensor Core 加速 FP16 推理）

#### Modal T4 NF4 量化测试（2026-08-23）✅ 已完成

- **日期**：2026-08-23
- **平台**：Modal.com T4 GPU（Tesla T4, 14.6GB VRAM, 32GB CPU RAM 请求→实际计费 32.1 GiB）
- **脚本**：`scripts/short-video/experiments/modal-echomimicv3-nf4.py`（Modal 函数，Volume 缓存模型 + 持久化输出。旧版 `/tmp/modal-nf4-v2.py` 已清理）
- **脚本特性**：(1) 自动检测 Volume 上的真实素材（`inputs/portrait.jpg` + `inputs/audio.mp3`），不存在则生成 placeholder；(2) 输出保存到 Volume `outputs/` 目录持久化，容器销毁后不丢失；(3) 运行前需 `modal volume put echomimicv3-models <本地照片> inputs/portrait.jpg` 和 `modal volume put echomimicv3-models <本地音频> inputs/audio.mp3` 上传素材
- **依赖版本**：bitsandbytes 0.45.1, accelerate 0.34.2, diffusers 0.31.0, PyTorch 2.5.1+cu124
- **NF4 实现**：patch `infer_flash.py`，在 `pipeline.to(device)` 前用 `bnb.nn.Linear4bit` 替换 transformer 中所有 `torch.nn.Linear`（462 层），然后 `enable_model_cpu_offload()` 而非 `pipeline.to(device)` 避免 OOM
- **关键发现**：NF4 + `pipeline.to(device)` 在 T4 上 OOM（VRAM 14.6GB 不够放整个 pipeline），改为 `enable_model_cpu_offload()` 后成功

**测试结果**：

| 测试                              | 模式                   | 推理时间           | 8步平均    | 输出大小  | 状态         |
| --------------------------------- | ---------------------- | ------------------ | ---------- | --------- | ------------ |
| NF4 + model_cpu_offload           | nf4_bnb                | **5.0 min** (301s) | 13.8s/step | 1542.2 KB | ✅ 第3次运行 |
| Baseline (sequential_cpu_offload) | sequential_cpu_offload | **5.9 min** (352s) | 24.2s/step | 372.0 KB  | ✅ 第1次运行 |

> **数据来源说明**：NF4 和 baseline 数据来自同一天不同运行（环境完全相同：同一台 Modal T4、同一个 Volume 缓存、同样的 512×512 分辨率）。NF4 来自第 3 次运行（shell-308），baseline 来自第 1 次运行（shell-283），因为第 3 次运行中 baseline 被 kill 掉了（exit_code=143）。两个测试用的是**同一个模型权重**，唯一区别是：NF4 量化了 462 个 Linear 层为 4-bit + 用 `model_cpu_offload`，baseline 不量化 + 用 `sequential_cpu_offload`。

**逐步耗时对比**：

| Step | NF4 (s) | Baseline (s) | 加速比         |
| ---- | ------- | ------------ | -------------- |
| 1    | 23.75   | 41.72        | 43%            |
| 2    | 22.33   | 38.74        | 42%            |
| 3    | 17.12   | 29.13        | 41% (TeaCache) |
| 4    | 跳过    | 跳过         | TeaCache       |
| 5    | 跳过    | 跳过         | TeaCache       |
| 6    | 14.44   | 23.02        | 37%            |
| 7    | 16.87   | 25.93        | 35%            |
| 8    | 14.94   | 22.78        | 34%            |

**关键结论**：

1. **NF4 推理速度比 baseline 快 43%**（13.8s vs 24.2s per step），总时间 5.0min vs 5.9min
2. **NF4 需要 model_cpu_offload**：直接 `pipeline.to(device)` 会 OOM（T4 14.6GB VRAM 不够放 VAE + wav2vec2 + text_encoder + transformer）
3. **NF4 输出文件更大**（1542KB vs 372KB），可能是量化后的模型生成的高频细节更多或噪声模式不同——**质量评估需人工对比视频**
4. **与 Kaggle v51 对比**：Modal baseline (5.9min) vs Kaggle v51 (14min) → Modal 快 2.4×，主要因为：(a) 512×512 vs 624×816 分辨率差异（像素少 56%），(b) Modal 32GB RAM vs Kaggle ~12GB 的 offload I/O 优势
5. **Kaggle/Colab Free 不可行**：Kaggle 29GB CPU RAM + Colab Free 12.7GB CPU RAM 不足以做 NF4 量化（bitsandbytes 量化过程峰值需 >29GB）。
   - > ⚠️ **更正**：之前写「Modal 186GB 充足」有误。billing report 反推显示 Modal 实际按 **32.1 GiB** 计费 Memory（我们请求的 `memory=32768`）。容器内 `psutil` 报告 186GB 是宿主机总量，但 Modal 只按请求值计费。NF4 量化成功是因为 32GB 比 Kaggle 29GB 多了 3GB，刚好跨过阈值。
   - > ⚠️ **以官方文档为准，不以记忆为准**：Modal 定价、资源分配等事实性信息，必须查 [modal.com/pricing](https://modal.com/pricing) 官方文档确认，不能以 agent 记忆为准。

**Modal 成本**（2026-08-24 billing report 明细验证 ✅ 完全对上）：

- **官方定价**（来源 [modal.com/pricing](https://modal.com/pricing)，2026-08-24 抓取）：
  - GPU T4: **$0.5904/h**（$0.000164/s）
  - CPU: **$0.0472/core/h**（$0.0000131/core/s）—— 不是 $0.142（那是 Sandbox 定价）
  - Memory: **$0.0080/GiB/h**（$0.00000222/GiB/s）—— 不是 $0.024（那是 Sandbox 定价）
  - > ⚠️ **以官方文档为准，不以记忆为准**：Modal 定价有两套（标准 compute vs Sandbox+Notebooks），之前混淆了
- **$30/月免费额度**（Starter plan）
- **Volume 存储**：$0.09/GiB/月，含 1 TiB/月免费（来源同上）。模型缓存 ~17GB 远低于 1TB 免费额度，**不产生额外费用**
- **billing report 明细**（`modal billing report --show-resources`，2026-08-24 重新解析）：
  - 总计 **$0.7586**（GPU $0.488 + CPU $0.060 + Memory $0.210）
  - 共 22 个 container 生命周期（含 image build、冷启动、推理、失败的 OOM kill 等）
  - **4 个主要运行**（实际 NF4/baseline 推理）：
    | App ID     | GPU 时间       | GPU 费用 | CPU 费用 | Memory 费用 | 总计   | 对应运行             |
    | ---------- | -------------- | -------- | -------- | ----------- | ------ | -------------------- |
    | ap-8VTytKy | 716s (11.9min) | $0.117   | $0.010   | $0.051      | $0.179 | Run #2 baseline 成功 |
    | ap-eomao9u | 674s (11.2min) | $0.110   | $0.010   | $0.048      | $0.168 | Run #3 NF4 成功      |
    | ap-AFWZ9w3 | 517s (8.6min)  | $0.085   | $0.010   | $0.037      | $0.131 | Run #1（OOM 失败）   |
    | ap-SPjSOFl | 355s (5.9min)  | $0.058   | $0.003   | $0.025      | $0.086 | 可能是 image build   |
  - **反推验证**：billing 中的 Memory 费用反推出 **32.1 GiB**（不是 186GB！）→ Modal 按请求的 `memory=32768` 计费
  - **反推 CPU**：~1.1 cores（Modal 自动分配）
  - **验证结果**：用官方定价 × 反推的秒数/GiB/cores 重新计算，与 billing 完全一致（零误差）
- **单次成功运行成本**：
  - NF4 (ap-eomao9u): $0.168（11.2min）
  - Baseline (ap-8VTytKy): $0.179（11.9min）
  - **均约 $0.17/次**
- **L4 性价比分析**（基于 T4 billing 精确数据推导）：
  - L4 = $0.80/h（VRAM 24GB + bf16），T4 = $0.59/h（VRAM 14.6GB, 无 bf16）
  - **关键优势**：L4 24GB 可以放下整个 pipeline（~19GB FP16），不需要 CPU offload → 消除 I/O 瓶颈 → 预计 2-3x 推理加速
  - **Breakeven**：L4 只要比 T4 快 **1.13x**（16GB RAM）就比 T4 划算。消除 offload 后预期 2-3x，远超 breakeven。
  - 估算对比：
    | 场景                                      | GPU 时间 | 单次费用 | vs T4 | $30/月可跑 |
    | ----------------------------------------- | -------- | -------- | ----- | ---------- |
    | T4 + NF4（实测）                          | 11.2min  | $0.168   | 基准  | 179 次     |
    | L4 conservative（2x加速, 16GB RAM）       | 5.8min   | $0.095   | 56%   | 317 次     |
    | L4 aggressive（3x加速, 8GB RAM）          | 3.9min   | $0.059   | 35%   | 509 次     |
    | L4 无量化 pipeline.to(device)（2.5x加速） | 4.6min   | $0.076   | 45%   | 395 次     |
  - **结论：L4 性价比远超 T4**——单次成本降 44-65%，速度提升 2-3x，还不需要 NF4 量化（避免质量损失风险）。bf16 支持也提升数值稳定性。

**后续方向**（2026-08-24 用户确认，按优先级排序）：

1. ~~Modal L4 测试~~ → **暂不测**——L4 用的是同一个 EchoMimicV3 模型，billing 数据已证明性价比优势，但用户决定先看其他模型。L4 推导数据已存档，将来需要时可直接用
2. **下一个模型：InfiniteTalk**（⭐⭐⭐⭐，Apache 2.0，无限长度 + 中文，14B Wan2.1 基座）→ Kaggle T4 测试
3. 其他候选：MultiTalk INT8（已发布 INT8 + SageAttention）、EchoMimic V2（Apache 2.0，4279 stars）
4. 在 Modal 上测试 720p 分辨率（当前测试用 512×512）——低优先级
5. ~~torch.compile 在 Modal T4/L4 上是否有效~~ → **不需要单独测**：torch.compile 是 PyTorch 级别的 JIT 编译优化，效果取决于 GPU 架构（sm_75 T4 vs sm_89 L4）和算子覆盖。在 Kaggle T4 上已验证 13% 加速（v47/v49）。Modal T4 用的是同型号 GPU（Tesla T4, sm_75），torch.compile 效果应基本一致。L4（Ampere, sm_89）的 torch.compile 效果可能略好（更多算子支持），但差异不大——不是值得单独测的维度

- **Volume 存储费用**：$0.09/GiB/月，含 1TB/月免费。模型缓存 ~17GB + 输出 mp4 几 MB，远低于免费额度，不产生额外费用。用 `modal volume get` 下载输出不收费（只算本地带宽）
- **模型缓存策略**：Volume 上的模型缓存不需要一直在——如果不用了可以 `modal volume rm` 删除释放空间，但只要还在 1TB 免费额度内就不产生费用。下次运行时如果缓存还在就省下载时间（~5min），删了就重新下载。**建议保留**（17GB 远低于 1TB 免费额度）

#### 优化方案记录

优化方案对比详见 `docs/research/echomimicv3-optimization-options.md`。摘要：

| 方案                    | 收益                 | 代价                   | 状态                                                       |
| ----------------------- | -------------------- | ---------------------- | ---------------------------------------------------------- |
| model_cpu_offload       | 3-5x 加速            | 可能 OOM               | ✅ v32+v33 已验证可用（需 expandable_segments）            |
| 减少步数(5步)           | -7% 时间             | 质量下降               | ❌ v30 已验证，时间差 1.7min 不值得                        |
| PYTORCH_CUDA_ALLOC_CONF | 减少碎片             | 无                     | ✅ v32 已验证，使 model_cpu_offload 可用                   |
| app_mm.py 参数组合      | 质量提升             | 无时间代价             | ✅ v34 已验证：推理时间与默认参数一致                      |
| 模型打包 Dataset        | -12min 下载          | 一次性上传             | ✅ v33 已完成                                              |
| Kaggle T4 替代 P100     | 脚本简化+Tensor Core | VRAM 少1.4GB           | 📋 待测试（`machine_shape: NvidiaTeslaT4`）                |
| NF4 (bitsandbytes) 量化 | 43% 推理加速         | 质量损失待评估         | ✅ Modal T4 已验证：5.0min vs 5.9min，需 model_cpu_offload |
| mmgp FP8 量化           | 最大加速             | 质量损失+P100 兼容未知 | 📋 量化版测试（app_mm.py）                                 |
| Colab L4/A100           | 全 GPU 推理+bf16     | 付费                   | 备选                                                       |
| AutoDL 4090             | 24GB 不需 offload    | ¥1.88/h 付费           | 备选                                                       |

### 📋 PersonaLive（未测，低优先级）

- **优先级**：⭐⭐
- **来源**：CVPR 2026
- **MPS**：⚠️ 12GB VRAM，MPS 可能可行
- **ComfyUI**：`okdalto/ComfyUI-PersonaLive`
- **备注**：所有基于 SD1.5 的扩散模型在 M2 Pro 上都已失败，PersonaLive 不太可能例外

### ✅ LongCat-Video-Avatar-1.5 云端原版（Modal A100-80GB，bf16 + DMD 蒸馏）— v11.1

- **日期**：2026-09-02；脚本：`scripts/short-video/experiments/modal-longcat-avatar.py`（v11.1）
- **许可**：MIT ✅（符合 License 门禁）
- **参数**（全部官方信源，2026-09-02 抓取）：HF 模型卡 Quick Inference 命令 + 官方源码 `run_demo_avatar_single_audio_to_video.py`
  - steps=8：源码 L71-72，`use_distill + avatar-v1.5` 硬编码（DMD2 蒸馏 50→8）
  - text/audio CFG = 4.0/4.0：源码默认；模型卡 tip「Audio CFG 最优 3-5，越高唇同步越好」
  - 480p、ref_img_index=10、mask_frame_range=3：官方默认
  - bf16 全精度首跑（INT8 变体已注释，待 A/B）
- **硬件**：A100-80GB 单卡 —— 权重全部常驻 GPU（源码 L172 `pipe.to()`）：UMT5 text encoder ~23GB + DiT bf16 ~31.7GB + whisper-large-v3 ~3GB + VAE ~0.5GB ≈ 58GB+激活。40GB/48GB 卡装不下（社区 A6000 48GB INT8 OOM 案例 CSDN 9672748；GitHub issue #79 48GB OOM）
- **权重**（Volume longcat-models，~61GB）：LongCat-Video 仓只下 tokenizer/text_encoder/vae（跳过 dit/ 54GB，avatar 不用）；Avatar-1.5 仓 base_model + dmd_lora + whisper fp16 单格式 + vocal_separator（跳过 INT8 与 whisper 冗余格式 ~37GB）
- **运行**：app ap-NB4fegRbepTDyO9j2Dksfv，二次触发成功；GPU 总计 4.3min ≈ **$0.18**（首跑 ap-ai58 因 Volume 隐式提交延迟失败，损失 ~$0.1）
- **产出**：`experiments/digital-human/longcat/longcat_v111_bf16_distill.mp4`（3.24s，323KB，93 帧@官方硬编码）
- **抽帧评估**（t=0.5/1.5/2.5s）：ID 保持好（眼镜/胡型/发型与源照一致），t1.5s 静止帧几乎与源照无异；口型开合幅度大且过渡自然
- **用户人眼确认（2026-09-02）**：唇同步基本正常，但**口型幅度偏大、偏夸张**（待优化项）；镜片绿色斑块实为**镜片反光**，属正常物理表现而非伪影
- **成本对比（同素材 3s 段）**：LongCat bf16 $0.18/4.3min < InfiniteTalk lightx2v $0.42/9.3min < InfiniteTalk FusionX $0.56/12.2min —— LongCat 又快又便宜且 MIT，**当前可商用首选**
- **遗留/调优方向**：① 口型幅度：官方 tip 说 audio CFG 3-5 影响唇同步强度，下探 3.0 可能收敛幅度（与 lip sync 精度权衡，需 A/B）；② 720p 档未测；③ INT8 A/B 优先级低（同卡只省 ~1min 加载）

### ❌ LongCat-Video-Avatar-1.5（本地不可用，云 GPU 低优先级）

- **优先级**：⭐⭐（本地测试失败，云 GPU 降为低优先级）
- **来源**：美团 meituan-longcat，714 likes
- **HuggingFace**：`meituan-longcat/LongCat-Video-Avatar-1.5`
- **MLX 移植**：`mlx-community/LongCat-Video-Avatar-1.5-bf16-dmd-merged`（还有 q8/q4 量化版）
- **MPS**：✅ 有 MLX 社区移植版——技术上可运行，但**质量不可用**
- **许可证**：MIT（商用 OK）
- **关键特点**：Whisper-Large 音频编码器，8 步推理（DMD2 蒸馏），支持 Audio-Text-to-Video / Audio-Image-Text-to-Video，商用级稳定性，支持动漫/动物/多人交互
- **中文支持**：✅ 原生支持中英文
- **本地测试结论**：❌ 432×256 生成的人像与本人完全不像，唇同步与音频对不上；480×832 全黑输出（MPS OOM）。**不再做本地测试**
- **云 GPU 评估**：bf16 版可能质量更好，但 EchoMimicV3 已在 Kaggle P100 成功，LongCat 降为低优先级

#### LongCat 各版本对比

| 版本                  | 来源            | 量化方式     | 磁盘  | 本地/云端           | 状态                    |
| --------------------- | --------------- | ------------ | ----- | ------------------- | ----------------------- |
| bf16-dmd-merged (MLX) | mlx-community   | bf16         | 43GB  | 本地（需64GB+ Mac） | 📋 待测                 |
| q4-dmd-merged (MLX)   | mlx-community   | 4-bit        | 24GB  | ✅ **本地已测**     | ✅ 成功但分辨率低       |
| q8-dmd-merged (MLX)   | mlx-community   | 8-bit        | 31GB  | 本地                | 📋 待测（质量接近bf16） |
| **GPU INT8 量化**     | meituan-longcat | `--use_int8` | ~15GB | **云 GPU**          | 📋 待测（官方支持）     |
| GPU bf16 原始版       | meituan-longcat | 无           | ~23GB | 云 GPU              | 📋 待测                 |

- **MLX 版不打包到 Kaggle Dataset**——MLX 是 Apple Silicon 专用，CUDA GPU 无法运行
- **GPU 版动画风格问题**：LongCat 官方设计支持"realistic humans, anime, virtual idols, and animals"。MLX q4 测试生成的是动画风格，可能原因：(1) q4 量化损失真实感 (2) 256×432 分辨率太低 (3) prompt 未强调真实感。GPU bf16 版应该能更好地处理真实人像
- **LongCat MLX 本地推理命令**：`cd /Users/pabloli/Documents/code/longcat-avatar-mlx && python3 scripts/run_inference.py --weights weights --variant q4-merged --image <微信照片> --audio <音频> --prompt "photorealistic person speaking" --height 480 --width 832`

### 📋 InfiniteTalk / MultiTalk

- **优先级**：⭐⭐⭐⭐（Apache 2.0 + 中文 + 无限长度）
- **来源**：MeiGen-AI，238 likes
- **HuggingFace**：`MeiGen-AI/InfiniteTalk`
- **GitHub**：github.com/MeiGen-AI/InfiniteTalk
- **MPS**：⚠️ 待验证（基于 WAN 2.1，可能需要较大显存）
- **许可证**：Apache 2.0（商用 OK）
- **关键特点**：稀疏帧视频配音，同步唇+头+身体+表情，**无限长度**生成，也可做 image-audio-to-video
- **中文支持**：✅ 原生支持中英文
- **测试重点**：T4 16GB 是否能运行（FP8 量化 + low VRAM mode）；推理速度；无限长度的实际效果

#### 源码分析结论（2026-08-25）

通过阅读 InfiniteTalk 源码（`generate_infinitetalk.py` + `wan/multitalk.py` + `wan/modules/t5.py`），确认：

1. **必须用 `--quant fp8`（不是 int8）**：T5 量化加载代码 `load_file(os.path.join(quant_dir, f"t5_{quant}.safetensors"))` 在 int8 时寻找 `t5_int8.safetensors`，但 HF repo 只有 `t5_fp8.safetensors`，int8 模式会崩溃。DiT 有 INT8 和 FP8 两种量化，但 T5 只有 FP8。
2. **FP8 模式不需要 LoRA**：Pipeline 代码 `if lora_dir is not None and quant is None:` — LoRA 仅在非量化模式加载，FP8 模式跳过 LoRA（省 9.9GB）。
3. **`config.json` MISSING 根因**：`hf download --include 'config.json' '其他文件' ...` 中 `--include` 和位置参数混用导致 filter 冲突。修复：用位置参数指定具体文件，`--include` 只用于 glob pattern。

#### 测试状态（2026-08-30 更新）

- **Kaggle v5-v8**：❌ 均失败（排队超时 / huggingface-cli 废弃 / 磁盘满 / config.json MISSING + 磁盘满）
- **Colab v1**：❌ Session 被回收（pip install `-q` 静默模式导致 WebSocket 超时）
- **Kaggle v10.11-v10.12**：✅ 成功生成视频（13帧，0.52s），但质量待验证
- **Kaggle v10.13-v10.14**：❌ 12h 超时（streaming mode + max_frame_num=81）
- **Modal v10.15 A100 40GB**：✅ 推理完成（76 min，576×704，3s 视频），❌ 质量不达标（表情太夸张）
  - **根因**: steps=5 对 InfiniteTalk 太少（非蒸馏模型，官方推荐 40 步），从 EchoMimicV3 Flash 错误套用
  - **模型类型**: Talking body（唇+头+身体+表情同步），不是 talking head
  - **成本**: $2.69（A100 $2.10/h × 1.28h）
- **Modal v10.16 A100 40GB**：❌ 标准 40 步推理 4h 超时（即使 `offload_model=False`，全模型常驻 GPU）
  - **结论**: 官方推荐 40 步是为多卡 FSDP 设计的，单卡 A100 不可行
  - **隐藏交互**: `offload_model` 默认 True 会覆盖 `num_persistent_param_in_dit` 的效果，必须显式 `--offload_model False`
  - **Modal 总花费**: ~$26（L4 调试 + 3 次 A100 运行）
- **模型总大小**：~42GB（基座 15.5GB + FP8 DiT 19.5GB + T5 FP8 6.7GB + wav2vec2 0.35GB）
- **handoff 文档**: `docs/handoffs/handoff-infinitetalk-modal-2026-08-28.md`（含完整恢复指南）
- **下一步**（按优先级）：
  1. **方案 A**: Kaggle T4/P100 + 官方推荐 40 步（免费，已有 v10.11 成功先例，预估 ~7h）
  2. **方案 B**: FusionX LoRA 8 步 + Modal A100（预估 ~$1.68，⚠️ CC BY-NC-SA 许可证，仅限质量验证）
  3. **方案 C**: 换模型（LeapTalk 1 步推理 / LongCat-Video-Avatar-1.5 8 步蒸馏）

#### InfiniteTalk / MultiTalk 各版本对比

| 版本                      | 来源         | 量化方式       | 大小            | 说明                                                  |
| ------------------------- | ------------ | -------------- | --------------- | ----------------------------------------------------- |
| **InfiniteTalk 原始版**   | MeiGen-AI    | 无             | ~20GB           | 14B Wan2.1 基座 + InfiniteTalk LoRA                   |
| **InfiniteTalk FP8 量化** | MeiGen-AI    | `--quant fp8`  | ~26GB(19.5+6.7) | ✅ **已发布**！DiT FP8 + T5 FP8，用 `--quant fp8`     |
| InfiniteTalk INT8 量化    | MeiGen-AI    | `--quant int8` | —               | ⚠️ DiT INT8 已发布，但 **T5 INT8 不存在**，实际不可用 |
| **Wan2GP InfiniteTalk**   | deepbeepmeep | int8/fp8/gguf  | 6GB+            | ✅ 已集成 InfiniteTalk，6GB VRAM 可跑                 |
| ComfyUI InfiniteTalk      | Kijai        | 标准           | —               | ✅ ComfyUI 工作流已支持                               |
| **lightX2V LoRA 加速**    | 社区         | LoRA 蒸馏      | —               | 4-8 步推理（vs 标准 40 步）                           |
| TeaCache                  | 官方         | 缓存加速       | —               | ✅ 已支持，2-3x 加速                                  |

#### 参数矩阵（按 artifact 组合，2026-08-31 建立）

> **规则**：不同 artifact 组合用不同参数，禁止跨组合套用（依据 AGENTS.md Proposal Self-Review #5）。有官方值的维度用官方值；组合维度无官方值时，取两个 artifact 各自官方默认作起点。来源必须标注；`作废` 的值禁止回用。

| 参数                      | ① base + fp8 量化（v10.11/10.16 已测） | ② bf16 非量化 + FusionX I2V LoRA（✅ v10.17 已验证）                                                                               | ③ bf16 非量化 + lightx2v LoRA（✅ v10.18 已验证）                                                        | 来源                                                                             |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| sample_steps              | 40                                     | 8                                                                                                                                  | 4                                                                                                        | ②: FusionX 卡（6-8，实践 8-10）；③: lightx2v 官方 4 步（官方 LoRA 章节注明 4-8） |
| sample_text_guide_scale   | 5.0                                    | 1.0                                                                                                                                | 1.0                                                                                                      | ②③: 蒸馏 LoRA 硬性要求 CFG=1；①: InfiniteTalk README                             |
| sample_audio_guide_scale  | 4.0                                    | 2.0（官方 LoRA 章节；lip sync 不足上探 3-4）                                                                                       | 2.0（官方 LoRA 章节同一配方）                                                                            | 官方 README tips：非 LoRA 最优 4，LoRA 后推荐 2                                  |
| sample_shift              | 7                                      | 2（官方 LoRA 命令原值；非 LoRA 默认 7）                                                                                            | 2                                                                                                        | 官方源码/README：shift 默认随分辨率，LoRA 命令传 2                               |
| lora_scale                | —                                      | 1.0                                                                                                                                | 1.0                                                                                                      | 官方 LoRA 命令原值（参数默认 1.2，2.0 仅草稿降步数用）                           |
| use_teacache              | 0.1（thresh）                          | **禁用**（跳步与蒸馏冲突）                                                                                                         | **禁用**（同 ②）                                                                                         | —                                                                                |
| quant                     | fp8                                    | 无（LoRA 与 fp8 格式冲突）                                                                                                         | 无（同 ②）                                                                                               | —                                                                                |
| frame_num / max_frame_num | 81 / 81                                | 81 / 81                                                                                                                            | 81 / 81                                                                                                  | 官方默认（frame_num 13 是 v10.15 遗留，作废）                                    |
| GPU                       | T4 16GB / A100 40GB                    | A100 80GB（40GB 贴线 OOM 风险）                                                                                                    | A100 80GB（同 ②）                                                                                        | Modal 定价 2026-08-31                                                            |
| 状态                      | ✅ 可跑（40 步单卡 A100 超时不可行）   | ⏸️ **停测**（2026-09-02 用户裁决：NC 许可不可商用，不再花测试费；结论保留作质量基线：12.2min/3s 段，$0.56，lip sync + 表情均最佳） | ✅ lip sync 达标（2026-09-02 用户人眼确认），表情略僵不如 ②；9.3min/3s 段，$0.42；可商用，许可标注待核实 |                                                                                  |

> **License 门禁（2026-09-02 用户规则）**：任何候选模型/LoRA **商用许可不明确或 NC（非商用）的一律不测试**——测试费是真金白银，NC 结论再好也用不上。筛选阶段（读 license 文件/模型卡）就把 NC 候选标注为「不测」，只测可商用或许可已核实的。FusionX 是本规则前最后一个 NC 测试项，已停测。

> **纠错（2026-08-31）**：本表初版曾将组合 ② 的 audio/shift 标为 4.0/7.0 并注「旧值无出处」——实为误判，官方 README 有专门的 LoRA 章节（「Run with FusioniX or Lightx2v」）明文推荐 audio=2.0、shift=2，已改回。教训：**查官方默认值之前，先确认 README 是否有专门的 LoRA/加速章节**——加速用法常有独立推荐值，不能拿非 LoRA 默认覆盖。

后续新增 artifact 组合（如 lightx2v StepDistill、LongCat）时在表中加列，不加新文档。

### ❌ Hallo3 — 已否决（2026-09-03 用户判定效果不好）

- **优先级**：⭐⭐⭐⭐（MIT + Transformer 骨干 + 复旦出品，Hallo2 升级版）
- **来源**：复旦 fudan-generative-ai，66 likes，CVPR 2025
- **HuggingFace**：`fudan-generative-ai/hallo3`
- **arxiv**：2412.00733
- **许可证**：MIT（商用 OK）
- **关键特点**：基于 CogVideo-5B I2V 微调，双 DiT 42 层（network + ref_network，hidden 3072/48 头）+ T5-XXL + 3D VAE，峰值 VRAM ~36GB；**talking head only**（不驱动身体/手部）
- **量化版本**：❌ 暂无社区量化版
- **脚本**：`scripts/short-video/experiments/modal-hallo3.py`

#### 测试 1：官方示例素材冒烟（2026-09-03）

- **素材**：官方 `examples/inference/` 第一条（英文音频 + 儿童烤棉花糖场景图，**带身体+场景**）
- **结果**：✅ 跑通，33.7min，480×480/25fps/9.8s，`hallo3_smoke.mp4`（1.0 MB）
- **画质**：皮肤偏塑料感、唇边界略糊、发丝 halo——**效果一般**
- **根因**：素材域不匹配——Hallo3 期望纯肖像（1:1/3:2 头肩），输入带身体+场景时模型只驱动面部，身体/场景区域 VAE 解码模糊

#### 测试 2：self-portrait + deepseek 同素材 A/B（2026-09-03）

- **素材**：`assets/self-portrait.jpg`（827×1063）+ `deepseek/audio/scene-1.mp3`（英文 F5-TTS, 5.2s）——与 EchoMimicV3 v50_merged **完全同素材**
- **结果**：✅ 25.3min，720×480/25fps/5.24s，`hallo3/hallo3_selfportrait.mp4`（0.4 MB）
- **A/B 对比 EchoMimicV3 v50_merged**（624×816/5.2s，同照片+同音频）：

  | 维度 | Hallo3 (3s帧)                  | EchoMimicV3 (3s帧)                     |
  | ---- | ------------------------------ | -------------------------------------- |
  | 唇部 | 张开说话，口型自然，轮廓清晰   | 张开说话，轻微僵硬，唇边缘平滑缺微纹理 |
  | 伪影 | 无明显（眼镜清晰、胡须无毛边） | 下颌糊边、颈部锯齿、牙齿缺失           |
  | 唇内 | 略模糊                         | 缺牙齿/舌细节                          |
  | 综合 | 4.5/5                          | 可接受非电影级                         |

- **结论**：同素材下 Hallo3 与 EchoMimicV3 质量接近，说话中帧 Hallo3 略优（更自然、更少伪影）

#### 总结

- **Hallo3 talking head 画质与 EchoMimicV3 接近**，说话中帧略优
- **限制**：只能英文（wav2vec+T5 英文训练）；只能 talking head（身体不驱动）；25min/5.2s 成本 ~$1.0；输出 720×480 横图
- **适用**：英文 talking head 高质量场景；中文需 TTS 翻译或换 EchoMimicV3/InfiniteTalk

### 📋 Sonic（质量基准，非商用）

- **优先级**：⭐⭐⭐（效果最好但非商用，可做质量基准）
- **来源**：Tencent/ZJU，CVPR 2025
- **GitHub**：`jixiaozhong/Sonic`
- **许可证**：❌ 非商用
- **VRAM**：官方说 32GB，可能需要 model_cpu_offload 才能在 16GB 上跑
- **本地测试结论**：M2 Pro 上 fp16 死锁 + fp32 崩溃（SVD UNet 与 MPS 不兼容）
- **云 GPU 测试**：📋 待测（Colab T4 16GB，可能需 cpu_offload）
- **量化版本**：❌ 无量化版本发布

#### Colab T4 测试（2026-08-18）

- **状态**：❌ 未完成——Colab 免费版 GPU assignment 冷却期限制
- **尝试 1**：`colab --auth=adc new --gpu T4 --session sonic-test` → `TooManyAssignmentsError`（LatentSync session 刚用完 GPU，免费版不能连续分配）
- **尝试 2**：等 60 秒后 `colab --auth=adc run --gpu T4 sonic_script.py` → 同样 `TooManyAssignmentsError`
- **原因**：Colab 免费版有 GPU assignment 冷却期——使用完 GPU 后需要等待一段时间才能再分配
- **建议**：(1) 等待 1-2 小时后重试 (2) 升级 Colab Pro $9.99/月可避免此限制 (3) 用 Kaggle P100 作为替代
- **Sonic 关键信息**：
  - 官方测试在 32GB GPU 上，T4 只有 16GB——可能需要 model_cpu_offload
  - 需要下载 `xcf/Sonic` HF 仓库的 checkpoint
  - ComfyUI 版本：`ComfyUI_Sonic`（社区版）
  - `demo.sh` 展示了基本推理命令
  - 脚本已准备好：`scripts/colab/sonic-test/run_sonic_colab.py`

### ❌ LatentSync 1.6 — Colab T4 OOM 验证（2026-08-18）

- **日期**：2026-08-18
- **结论**：**Colab T4 16GB 不够** — LatentSync 1.6 需要 18GB VRAM，即使加 `expandable_segments:True` 仍然 OOM
- **环境**：Colab T4 14.56GB（Tesla T4），PyTorch + diffusers
- **测试过程**：
  1. `git clone` + `pip install` 依赖（kornia、insightface 等需要手动安装）
  2. `hf download bytedance/LatentSync` 下载 checkpoint（latentsync_unet.pt + whisper/tiny.pt）
  3. `bash inference.sh` → VAE 解码阶段 OOM：`Tried to allocate 2.00 GiB. GPU has 14.56 GiB total, 959 MiB free`
  4. 加 `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` 重试 → 仍然 OOM
- **OOM 位置**：`diffusers/models/resnet.py` VAE down_block forward → `(input_tensor + hidden_states) / output_scale_factor`
- **根本原因**：LatentSync 1.6 训练在 512×512 分辨率，VAE 解码需要大量 VRAM
- **与文档记录一致**：LatentSync 1.6 最低 18GB VRAM，1.5 最低 8GB
- **建议**：如需在 16GB GPU 上跑 LatentSync，必须用 1.5 版本（256×256 分辨率，8GB VRAM）

### ✅ EchoMimicV3 — 已在 Kaggle P100 上测试完成（见上方详情）

- **许可证**：Apache 2.0（商用 OK）
- **后续**：优化推理速度 + 验证质量 + 测试长视频生成

#### EchoMimicV3 各版本对比

| 版本                          | 来源         | 量化方式                        | VRAM              | 说明                                    |
| ----------------------------- | ------------ | ------------------------------- | ----------------- | --------------------------------------- |
| **原始版 (infer_flash.py)**   | 官方         | 无量化                          | 12-16GB + offload | ✅ v33 当前在用                         |
| **NF4 量化版 (bitsandbytes)** | 自测         | NF4 (4-bit) + model_cpu_offload | T4 14.6GB         | ✅ Modal T4 已验证：5.0min/段，43% 加速 |
| **Gradio 量化版 (app_mm.py)** | 官方         | mmgp FP8 + model_cpu_offload    | 8-12GB            | 📋 待测——参数更优化                     |
| **ComfyUI 版 (smthemex)**     | 社区         | mmgp FP8 + LCM + lightX2V LoRA  | 8GB+              | 📋 12G可跑65帧，16G跑97帧               |
| **Wan2GP 版**                 | deepbeepmeep | int8/fp8/gguf/NV FP4            | 6GB+              | 📋 集成 InfiniteTalk，低 VRAM 优化      |

#### app_mm.py 关键参数对比（vs 当前 v33 配置）

| 参数                   | infer_flash.py (v33) | app_mm.py (量化版) | 影响                       |
| ---------------------- | -------------------- | ------------------ | -------------------------- |
| `guidance_scale`       | 6.0                  | **4.5**            | 视觉更自然                 |
| `audio_guidance_scale` | 2.0                  | **2.5**            | 唇同步更好但可能眨眼       |
| `neg_scale`            | 1.0                  | **1.5**            | 减少伪影                   |
| `neg_steps`            | 0                    | **2**              | 前2步负向引导              |
| `use_dynamic_cfg`      | False                | **True**           | 动态 CFG 更自然            |
| `use_dynamic_acfg`     | False                | **True**           | 动态 audio CFG             |
| `sampler_name`         | Flow_Unipc           | **Flow_DPM++**     | 不同采样器                 |
| `num_inference_steps`  | 8                    | 20                 | 更多步数（但用 mmgp 加速） |

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

### ✅ SoulX-FlashHead 基座测试（2026-09-04 完成）

**目的**：验证 LeapTalk 否决根因是"1步桥蒸馏+TAEHV 结构性上限"还是基座本身。基座未蒸馏，用官方 `generate_video.py` 跑 Model_Pro + Model_Lite。

**信源**：仓库 `Soul-AILab/SoulX-FlashHead`，权重 `Soul-AILab/SoulX-FlashHead-1_3B`，License Apache 2.0。推理脚本 `generate_video.py`，配置 `flash_head/configs/infer_params.yaml`。

#### 测试结果

| 变体       | VAE    | FID（论文） | T4 耗时                 | T4 FPS | RTX4090 FPS | VRAM      | 画质             | 嘴部动态  |
| ---------- | ------ | ----------- | ----------------------- | ------ | ----------- | --------- | ---------------- | --------- |
| Model_Pro  | WanVAE | 21          | 675.7s (11.3min) / 3s段 | 0.11   | 10.8        | ~15GB     | 清晰，无伪影     | ✅ 有变化 |
| Model_Lite | TAEHV  | 38          | 197.5s (3.3min) / 3s段  | 0.39   | **96**      | **6.4GB** | 稍平滑，略逊 Pro | ✅ 有变化 |

- 输出：512×512, 77 帧, 25fps, 3.08s, h264+aac
- 产物：`scripts/short-video/experiments/digital-human/soulx-flashhead/`（mp4 + 关键帧）
- Kaggle 脚本：`scripts/kaggle/soulx-test/`

#### 关键结论

1. **LeapTalk 的差是1步桥蒸馏造成，不是基座的问题**：基座嘴部有自然动态变化（LeapTalk 蒸馏版嘴部几乎不动），画质清晰无伪影（LeapTalk 蒸馏版画质差、有色块）
2. **Pro 优于 Lite**：WanVAE FID 21 vs TAEHV FID 38，与论文 Table 1 一致；肉眼 Pro 细节更锐利
3. **Pro 成本更高**：11.3min vs 3.3min（Pro 慢 3.4 倍），但都可接受

#### 分辨率与比例

- `infer_params.yaml` 有 `height: 512` `width: 512`，**可改**（改 yaml），`generate_video.py` 无命令行覆盖
- **比例可改**：height/width 独立设置，理论上可设竖版（如 512×910），但模型训练时为 512×512，超出训练分布可能变形/质量下降，**未测试**
- **768×768 在 T4 OOM**（LeapTalk 测试已证），更大分辨率需 A100 80GB
- **后处理超分可行**：可用 Real-ESRGAN / Topaz Video AI / waifu2x 将 512×512 超分到 1024×1024+（但现有 `upscale.mjs` 是 B-roll 专用，需新写数字人 wrapper）

#### 平台适配

- **CUDA only**：基于 PyTorch + CUDA，不支持 MPS / 华为 NPU / AMD ROCm
- **全平台搜索（2026-09-04）**：GitHub 0 结果 / HuggingFace 只有官方 CUDA 版 + 1 镜像 / ModelScope 只有从 GitHub 同步的官方版（`FromSite: "github"`, 2326 downloads, CUDA only）/ Gitee API 返回空 / AtomGit API 不可访问但无 NPU 适配证据。**结论：所有主流平台均无 MPS/NPU/AMD/CoreML 适配版**
- **GTX 1080（Pascal sm_61）不能跑**：PyTorch 2.7.1 最低 sm_75；降级 PyTorch 理论可行但 xfuser/xformers 依赖不兼容；且 8GB VRAM 只够 Lite（6.4GB），不够 Pro
- **可跑环境**：Kaggle T4（免费，已验证）/ RTX 20xx+ / RTX 30xx+ / RTX 40xx+ / AutoDL 4090 ¥1.88/h

#### Talking Body

- SoulX-FlashHead 是 **Talking Head only**（512×512 头部/肩部）
- Soul-AILab 还有 **SoulX-FlashTalk**（14B，**已开源** `Soul-AILab/SoulX-FlashTalk`，Apache 2.0，1.5k stars）：talking body/全身 avatar，实时流式；但需 **64GB+ VRAM**（或 40GB + cpu_offload），实时需 8×H800——硬件门槛远高于 FlashHead
- **✅ Modal A100-80GB 测试成功（2026-09-04）**：
  - 输入：`portrait-fullbody.jpg`（1080×1920）+ `audio.wav`（5.23s, 16kHz mono）；`--audio_encode_mode stream`
  - 输出：`scripts/short-video/experiments/digital-human/soulx-flashtalk/flashtalk_14b_a100.mp4`（416×720, 25fps, 5.24s, 131帧, h264+aac, 222KB）
  - 推理时间：348s（5.8min）；费用 ≈ $0.20（348s × $2.10/h）
  - 修复两个兼容性问题：① wav2vec2 hidden_states（monkey-patch `Wav2Vec2Encoder.forward` 支持 `output_hidden_states`，transformers ≥4.49 移除了该参数）；② ffmpeg in-place 编辑（`--save_file` 加 `res_` 前缀，`save_video` 用 `replace('res_','')` 做 temp 路径）
  - 脚本：`scripts/modal/soulx-flashtalk-test/run_flashtalk.py` + `patch_wav2vec.py`
  - **✅ portrait-original-4k.jpg 对比测试（2026-09-04）**：
    - 输入：`portrait-original-4k.jpg`（3072×4096）+ 同 audio；输出 468KB（vs fullbody 222KB），比特率 733kbps（vs 267kbps），细节显著更多
    - 输出：`scripts/short-video/experiments/digital-human/soulx-flashtalk/flashtalk_14b_a100_original.mp4`
    - 推理时间：350s（5.8min）；费用 ≈ $0.20
    - **用户评价**：「效果是看到现在最好的 Talking Body 效果，手指的细节全都很好」
    - **结论**：SoulX-FlashTalk 14B 是目前最佳 Talking Body 方案；输出固定 416×720（Wan VAE 决定，不可改），输入任意尺寸自动 resize；成本 $0.20/5s（Modal A100），AutoDL A800 可降至 ≈$0.07/5s
- Talking Body 需求用 InfiniteTalk（576×704，Apache 2.0，已测可用）或 LongCat（480p，MIT，已测可用）

#### 下一步

- SoulX-FlashHead Model_Pro vs EchoMimicV3 v51 同素材 A/B 对比（未做）
- 竖版比例测试（改 yaml 设 512×910，未做）
- 后处理超分可行但需新写 wrapper：现有 `scripts/short-video/lib/upscale.mjs` 是 **B-roll pipeline 专用**（场景媒体素材 ≥720p 送 Remotion 渲染），不是数字人输出超分。底层 Real-ESRGAN ncnn-vulkan 二进制可复用，但需写新的数字人后处理 wrapper（512×512 → 1024×1024+）

#### 测试素材

- **规范位置**：`scripts/short-video/assets/dh-fixtures/`（进 git + LFS，详见 `README.md`）
- **Kaggle 同步**：`scripts/kaggle/sync-fixtures.sh` → 复制到各 test 的 `input/` 暂存区 → `kaggle datasets push`
- **文件**：`portrait-face.jpg`（827×1063 主用）/ `portrait-fullbody.jpg`（1080×1920）/ `portrait-original-4k.jpg`（3072×4096 原图）/ `portrait-small.jpg`（240×308）/ `audio.wav` / `audio.mp3` / `audio-10s.mp3`

### 📋 LeapTalk（最高优先级新模型）✅ 门禁已通过，下一个测试目标

- **优先级**：⭐⭐⭐⭐⭐（1 步推理 + 1.3B + 无限长度，潜在解决 EchoMimicV3 多段拼接瓶颈）
- **来源**：arXiv 2608.00079（2026-07-29，Zhang & Liu，上海交通大学 AI 学院 + 哈工大）
- **GitHub**：`zhangrongxiang/LeapTalk`
- **HuggingFace**：`z-rx/leaptalk`（LoRA 权重）、`Soul-AILab/SoulX-FlashHead-1_3B`（基座）
- **技术**：reference-anchored data-to-data transport（Brownian bridge），不做传统扩散去噪，1 步推理（1 NFE），流式无限长度；audio-driven classifier-free guidance 保唇同步
- **基座**：SoulX-FlashHead-1.3B（1.3B 参数，与 EchoMimicV3 Flash 同量级）
- **许可证**：✅ **Apache 2.0（门禁通过，可商用）** — LeapTalk repo `LICENSE`（2026-08-11 提交 "Add Apache License 2.0"，OpenTrain 确认 "Apache-2.0 license"）+ 基座 `SoulX-FlashHead-1_3B` ModelScope/HF 标注 `apache-2.0`（airosetta："Apache-2.0 licensed for commercial use"）。全栈 Apache 2.0，无 NC 风险
- **VRAM**：官方 Lite 模式单 RTX 4090 仅 **6.4GB**（96 FPS，3 并发实时）；**T4 15GB 充裕**；模型磁盘 ~14.33GB（SoulX-FlashHead-1_3B）+ LeapTalk LoRA 小（信源：Soul-AILab/SoulX-FlashHead README + airosetta）
- **关键特点**：1 步推理（vs EchoMimicV3 8 步）+ 流式生成（vs EchoMimicV3 多段拼接）。若质量达标，1 分钟视频可能从 4.7 小时压缩到分钟级
- **风险**：非常新（2026-07-29 arxiv），社区验证少；质量未经独立验证；LoRA 方式依赖基座质量
- **测试重点**：与 EchoMimicV3 v51 做同素材 A/B 对比；验证 1 步推理的唇同步质量；测试流式生成是否真的无限长度

#### 官方推理参数（信源：仓库 `inference.py` argparse 默认值 + README `inf.sh`，2026-09-02 核验）

> 全部为官方代码默认值，非推测。`inference.py` 的 argparse 即权威来源；`inf.sh` 是官方推荐运行配置。按「文档规则：参数信源标注」逐条标注。

| 参数                          | 官方默认                                     | 信源                                 |
| ----------------------------- | -------------------------------------------- | ------------------------------------ |
| `num_inference_steps`         | **1**（单步）                                | `inference.py` `default=1`           |
| `height` / `width`            | 512 / 512                                    | `inference.py` `default=512`         |
| `frame_num`（每块总帧）       | 33                                           | `inference.py` `default=33`          |
| `motion_frames_latent_num`    | 2                                            | `inference.py` `default=2`           |
| `fps`                         | 25                                           | `inference.py` `default=25`          |
| `guidance_scale`（Audio CFG） | 1.0（=1.0 即禁用引导）                       | `inference.py` `default=1.0`         |
| `audio_encode_mode`           | `stream`                                     | `inference.py` `default="stream"`    |
| `cached_audio_duration`       | 8 s                                          | `inference.py` `default=8`           |
| `max_chunks`                  | 0（跑全部块）                                | `inference.py` `default=0`           |
| `history_update_mode`         | `roundtrip`                                  | `inference.py` `default="roundtrip"` |
| `dtype`                       | `bf16`                                       | `inference.py` `default="bf16"`      |
| `lite`（Lite TAE 后端）       | `True`（启用 TAE）                           | `inference.py` `default=True`        |
| `tae_model_type`              | `wan21`                                      | `inference.py` `default="wan21"`     |
| `compile`                     | `off`                                        | `inference.py` `default="off"`       |
| `noise_scale`                 | 1.0                                          | `inference.py` `default=1.0`         |
| `shift_gamma`                 | 5.0                                          | `inference.py` `default=5.0`         |
| `seed`                        | 42                                           | `inference.py` `default=42`          |
| `device`                      | `cuda`                                       | `inference.py` `default="cuda"`      |
| `usp`（多卡序列并行）         | `on`                                         | `inference.py` `default="on"`        |
| `model_type`                  | `pro`                                        | `inference.py` `default="pro"`       |
| 基座 `CKPT_DIR`               | `SoulX-FlashHead-1_3B`                       | README `inf.sh`                      |
| `WAV2VEC_DIR`                 | `facebook/wav2vec2-base-960h`                | README `inf.sh`                      |
| `LORA_DIR` + `AUDIO_PROJ`     | `z-rx/leaptalk` / `audio_proj_step_10400.pt` | README `inf.sh`                      |

- **官方速度口径**：论文摘要 "up to **200 FPS** in the Lite setting"（arXiv 2608.00079）；基座 README "Lite **96 FPS** on single RTX 4090"（Soul-AILab/SoulX-FlashHead）。两者均为官方口径，200 FPS 为论文最优-case，96 FPS 为 RTX4090 实测。
  - **200 FPS 的硬件口径已确认**：论文 Appendix F 原文 "Note that the **200 fps in the main manuscript is measured on H200**"；Implementation Details "all experiments are performed on a **single NVIDIA H200 GPU** with a batch size of 1"。→ T4 上 1.41 FPS 与论文数字不构成矛盾，是硬件差距。

#### 官方推荐配置（2026-09-02 补齐，此前标 `待验证` 的项已有官方值）

| 参数                      | 官方值                | 信源（原文引用）                                                                                                                                                      |
| ------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`guidance_scale`（α）** | **1.6**               | 论文 §Parameter Sensitivity Analysis："a moderate value around **1.6** achieves the best balance. ... We therefore use **α=1.6** and λ_perc=4.0 as default settings." |
| `num_inference_steps`     | 1                     | README `inf.sh` `NUM_INFERENCE_STEPS="1"`                                                                                                                             |
| 分辨率                    | 512×512               | 论文 Appendix F："**All main experiments were conducted at 512×512 resolution.**"                                                                                     |
| Pro 的 VAE                | **WanVAE**（3D Conv） | 论文 Table 1 `OURS (Pro)`：HDTF FID **21** / FVD 197 / CelebV-HQ FID 42 / 55 FPS                                                                                      |
| Lite 的 VAE               | **TAEHV**（2D Conv）  | 论文 Table 1 `OURS (Lite)`：HDTF FID **38** / FVD 285 / CelebV-HQ FID 47 / **200 FPS**                                                                                |
| teacher 分支 CFG          | 3.0（硬编码）         | `flash_head_pipeline.py:166` `self.audio_guide_scale = 3.0`                                                                                                           |

**⚠️ 关键矛盾（v4 质量问题的根因）**：`inf.sh` 的 `guidance_scale` 默认 **1.0 = 关闭音频 CFG**，而论文默认 **α=1.6**。README 自己也写明 CFG 的作用——"Audio-driven classifier-free guidance **strengthens mouth motion and speech alignment**"。即官方脚本默认跑的是**关闭唇同步增强**的形态。

**CFG 消融（论文 Appendix D, Table 7, HDTF）**：

| CFG Scale          | Avg Std（运动多样性） | BAS（音频-运动对齐） |
| ------------------ | --------------------- | -------------------- |
| **1.0**（v4 所用） | **1.655**             | 0.723                |
| 3.0                | 3.394                 | 0.658                |
| 5.0                | 5.000                 | 0.696                |
| 7.0                | 6.323                 | 0.650                |

论文解读原文："pose diversity (Avg Std) increases with CFG scale, proving CFG effectively **enhances motion and avoids static behavior**. However, BAS gradually drops as CFG grows, indicating over-strong guidance can hurt audio-motion alignment."
→ **CFG 1.0 的 Avg Std 为全部测试点最低**（1.655），升到 3.0 即翻倍（3.394）。这直接解释 v4 产物"接近静态"。

**画质（糊）的官方归因**：论文 §Effect of different Autoencoders 原文——TAEHV "main degradation is **slight blurriness in fine regions such as lips**, which can be **alleviated by increasing inference from 1 to 2 steps**"。
→ 官方自己给的两条缓解路径：**换 WanVAE**（FID 38→21）或**步数 1→2**。

**⚠️ 修正（2026-09-02 v5 复盘，原措辞不准确）**：之前称 "`--model_type pro` + `--lite` = Pro 权重 + Lite TAEHV 是论文里不存在的混搭"。**经核 `inference.py:480-492` argparse + `:625-635` 调用，事实是 `--lite` 仅切 VAE 后端（`fh_pipe_mod.COMPILE_VAE = bool(not args.lite)` + `use_tae=bool(args.lite)`），`model_type` 始终由独立 `--model_type` 控制**。即 Pro+TAEHV 是合法组合，**但论文 Table 1 只整体比较了 Pro+WanVAE vs Lite+TAEHV 两种完整系统，单独切 VAE 偏离论文验证矩阵**——v4 的"非推荐"成立，**但"不存在"措辞不成立**。已 v5 测得：单切 VAE（A→C）在 T4 上带来的清晰度提升**几乎为零**（嘴部 Laplacian 52.0 vs 49.8），代价是 3.5× 慢。详见下方"v5 实测结果"。

#### 测试计划（执行中 · 2026-09-02 已提交 Kaggle T4 首测）

1. **平台**：Kaggle T4（15GB）或 Modal T4；官方 Lite 单卡 6.4GB，T4 充裕（信源：Soul-AILab README）。
2. **权重**：按 README 下载 3 份 — `SoulX-FlashHead-1_3B`（基座）、`facebook/wav2vec2-base-960h`、`z-rx/leaptalk`（LoRA + `audio_proj_step_10400.pt` + Lite TAE）。
3. **首跑配置**：`inf.sh` 默认（`LITE=1`、`NUM_INFERENCE_STEPS=1`、`COMPILE=off`），参考图=微信照片，音频=scene-1 mp3。
4. **A/B**：同素材对比 EchoMimicV3 v51（Kaggle T4，8 步，~14min/段）。
5. **验证项**：唇同步（人眼确认）、无限长度流式、ID 保持、单段推理耗时。
6. **风险点**：`guidance_scale` 默认值禁用音频 CFG，唇同步强度待实验；CUDA-only，无 MPS/MLX 本地路径（M2 Pro 不可跑，必须云 GPU）。

#### 运行时结构（实测，非推测）

以下均为**读源码/日志所得**，用于后续任何平台复用（Kaggle/Modal 通用）：

| 项                  | 结论                                                                                                                                                                                                                                                          | 信源                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 代码布局            | 单仓库自带 `flash_head/`、`vibt/`、`utils/`，**无需克隆第二个代码仓库**                                                                                                                                                                                       | README + `inference.py` 顶部 `sys.path` 注释（`SOULX_ROOT` 为遗留死代码）     |
| `--ckpt_dir` 结构   | `--model_type pro` → `<ckpt_dir>/**Model_Pro/**`；`lite` → `Model_Lite/` + `VAE_LTX/`                                                                                                                                                                         | `flash_head_pipeline.py:167-169`                                              |
| 基座卡子目录        | `SoulX-FlashHead-1_3B` **同时含 `Model_Pro` 与 `Model_Lite`**                                                                                                                                                                                                 | Soul-AILab README "Released" 链接（HF tree/main/Model_Pro、Model_Lite）       |
| Lite TAE 查找顺序   | `--lora_dir` → 其父目录 → `<ckpt_dir>/VAE_Wan`，匹配 `taew2_1.pth` 等                                                                                                                                                                                         | `inference.py:_resolve_lite_tae_path`                                         |
| `VAE_Wan` 是否必需  | **否**（`--lite` 走 TAEHV）。但 **`VAE_Wan/Wan2.1_VAE.pth` 确实在权重卡里，484.1 MB** —— 即「治糊」的 `--no_lite` 变体**无需任何额外下载**                                                                                                                    | `flash_head_pipeline.py:141-165` + v4 运行日志 `[TREE]` 实测                  |
| `--lite` 的真实形态 | `store_true, default=**True**` —— 默认就是 Lite；要画质**必须显式传 `--no_lite`**（另有 `--use_tae`/`--no_tae` 隐藏别名）                                                                                                                                     | `inference.py` argparse                                                       |
| 权重卡实测体积      | `Model_Pro` 5751.5 MB / `Model_Lite` 5824.6 MB / `VAE_LTX` 1599.1 MB / `VAE_Wan/Wan2.1_VAE.pth` 484.1 MB / `leaptalk/lora` 180.1 MB / `audio_proj_step_10400.pt` 165.6 MB / `taew2_1.pth` 21.6 MB（共 37 files）                                              | v4 运行日志 `[TREE]`                                                          |
| 推理必需依赖闭包    | xfuser、pyloudnorm、mediapipe、diffusers、einops、accelerate、omegaconf、cv2 等                                                                                                                                                                               | 用 AST 解析 `flash_head/`、`vibt/`、`utils/`、`inference.py` 全部 import 得出 |
| 可选依赖（已跳过）  | `flash_attn` / `sageattention` / `torch_xla` / `yunchang` —— 均在 `try:` 或函数内，非单卡 Lite 路径                                                                                                                                                           | `flash_head_model.py:19,25,31,206`（try 内）                                  |
| MediaPipe           | **非致命**（v4 实测修正）：`flash_head_pipeline.py:16` → `facecrop.py:10` → `cpu_face_handler.py:1` 顶层 `import mediapipe`，但 `--use_face_crop` 默认关闭且 `process_image()` 被 `try/except` 包住。v4 实测 `MEDIAPIPE_STATUS=UNAVAILABLE`，**推理照常完成** | 同左 + v4 日志                                                                |

#### 首测记录

- **v1（2026-09-02，失败）**：`kaggle kernels push` 后 4 分钟 `ERROR`。死因 `ModuleNotFoundError: No module named 'xfuser'`（`flash_head_model.py:12`）。**冒烟测试在下权重之前拦住了**，未浪费 GPU 配额与下载时间。根因：v1 依赖清单靠猜，漏了 4 个包。
- **v2（2026-09-02，失败但解决依赖）**：**依赖问题彻底解决**——`FLASH_HEAD IMPORT OK`、`torch 2.7.1+cu126`、`cuda avail: True`、`Tesla T4`。新的死因是 `AttributeError: module 'mediapipe' has no attribute 'solutions'`（最新 mediapipe 已移除 legacy `solutions` 命名空间）。**预检再次在下权重之前拦住**。v2 的三处结构性改进全部生效：① 依赖闭包改用 AST 解析得出而非猜测；② **自愈式导入循环**（缺模块自动 pip 装并重试，最多 8 轮），消除「缺一个依赖就要重 push 一轮、每轮重装 torch」的循环；③ 下完权重后**校验目录结构**（断言 `Model_Pro/` 存在、解析出 TAE 路径）再进推理。
- **v3（2026-09-02，失败但大幅推进）**：**依赖 + 权重 + pipeline 初始化全部走通**，实测确认：三套权重下载完成、`Using TAEHV for VAE encode/decode: /tmp/models/leaptalk/taew2_1.pth`、`Pipeline initialized. Model dtype: pro`、`torch 2.7.1+cu126 / Tesla T4`。死在 LoRA 注入：`PeftModel.from_pretrained` → `ImportError: Found an incompatible version of torchao. Found version 0.10.0, but only versions above 0.16.0 are supported`。
  - **根因（对照 peft v0.19.1 源码核实，非推测）**：`is_torchao_available()`（`peft/import_utils.py:128-147`）在 torchao 已安装但版本 <0.16.0 时**抛异常**而非返回 `False`；而 `dispatch_torchao`（`peft/tuners/lora/torchao.py:142`）位于 dispatcher 链中、`dispatch_default` **之前**（`peft/tuners/lora/model.py:409-418`），且每个带 `.weight` 的目标模块都会走到它。因此**任何**陈旧 torchao（Kaggle 镜像自带的 0.10.0）都会打断**全部** LoRA 创建——与模型是否量化无关。
  - **修法是「移除」而非「升级」**：torchao ≥0.16 需要比仓库 pin 的 `torch==2.7.1` 更新的 torch（`requirements.txt:171`）。移除后 `find_spec()` 返回 `None` → `is_torchao_available()` 为 `False` → 回落到 `dispatch_default`。
  - 注意：`requirements.txt` **没有** pin torchao，它来自 Kaggle 镜像预装。
- **v3 的 mediapipe 处置（与 torchao 无关，一并记录）**——
  - **人脸裁剪是可选且安全的**：`--use_face_crop` 为 `store_true`（默认关闭，`inf.sh` 从不传），且 `flash_head_pipeline.py:69-73` 把 `process_image()` 包在 `try/except` 里 → mediapipe 坏了只会**优雅降级**为原图，不会崩。因此 mediapipe 探测改为**非致命**。
  - **不裁剪也不会变形**：`flash_head_pipeline.py:246` 用 `resize_and_centercrop`（保持宽高比 + 居中裁剪），非直接拉伸。
  - **best-effort shim**：尝试 `mp.solutions = mediapipe.python.solutions` 恢复 legacy 命名空间。
  - **一次 GPU 周期双跑**（权重已下完，边际成本仅为推理时间）：A) 官方 `inf.sh` 默认（不裁剪，作为忠实 baseline）；B) `+ --use_face_crop`（能用则裁，失败自动降级）。
- **v4（2026-09-02）**：针对 torchao 的两处改动——
  - `neutralize_torchao()`：**在 pip 安装之后**执行（传递依赖可能把 torchao 装回来），检测到 <0.16.0 即卸载；absent 或 ≥0.16.0 则不动。实测：探测到 `Found existing installation: torchao 0.10.0` → 卸载 → `torchao neutralized: OK`。
  - **预检加入真实 LoRA 注入用例**：对一个 `nn.Linear(8,8)` 跑 `get_peft_model`，完整走一遍 peft 的 dispatcher 链。**约 1 秒**即可复现 v3 的失败，**不需要下载多 GB 权重**——把「失败发现点」从「下完权重之后」提前到「预检之内」。实测：`PEFT LORA INJECT OK -> Linear`。
  - 顺手加 `pip install -U entrypoints`（防止 `huggingface_hub[cli]` 拉旧版 `entrypoints` 弄坏 Kaggle 自己的 jupyter 导出），**v5 待补**。
- **v4 实测结果（2026-09-02 13:41）**：
  - **两个变体都成功产出 mp4**：A) `leaptalk_out.mp4`（官方 inf.sh 默认，不裁剪）B) `leaptalk_out_facecrop.mp4`（`+ --use_face_crop`）。**MD5 完全相同**——`process_image()` 被 `try/except` 包住，mediapipe 失败后优雅降级为原图，**与「不裁剪」等价**。shim 尝试 `mediapipe.python.solutions` 失败（`ModuleNotFoundError: No module named 'mediapipe.python'`），v5 可改 pin `mediapipe==0.10.21`（legacy `mp.solutions` 还在）。
  - **视频规格**：512×512 / 25fps / 77 帧 / 3.08s / h264 + mp3（音轨已正确合成）。`ffprobe` 验证。
  - **T4 实测 FPS = 1.41**（**远低于论文宣传的 200 FPS**，论文应是在 H100/B200 + compile 上测的）：`Chunk 1/3 | time=19.86s | frames=28 | FPS=1.41 | denoise=17.29s | decode=1.84s | denoise 占 87%`。`debug_log` 行 837-849 都有。
  - **关键质量发现：默认参数下产物接近静态**。
    - 视觉证据：6 帧（0/15/30/45/60/76）拼图、9 帧嘴部特写（0/10/20/.../76）都看不出明显唇动。`/tmp/leaptalk_frames.jpg` & `/tmp/leaptalk_mouth.jpg`。
    - 量化证据：相邻帧 Y 通道均值差（`ffmpeg signalstats YAVG`）`min=1.158, max=8.058, mean=3.193`（0-255 标度）。典型 talking head 应 10-30+。
    - **而音频是真实语音**：`ffmpeg volumedetect` → `mean_volume=-26.3 dB, max_volume=-8.8 dB`（不是静音）。
    - 根因：官方 `inf.sh` 不传 `--guidance_scale`，默认 **1.0 = 禁用音频 CFG**。`inference.py` 默认 `default=1.0`，是**作者设计**的 1 步推理形态（论文/官方说法是 1 步推理音频 CFG=1 + 实际推理时调高）。所以输入音频并不驱动唇动。
  - **KERNEL 状态 ERROR 的真相**：我的脚本 `[ALL DONE] total wall 511.0s`（exit 0），输出已保存；**ERROR 来自 Kaggle 跑完后的 jupyter-nbconvert 导出**：`ImportError: cannot import name 'EntryPoint' from 'entrypoints'`，是 `huggingface_hub[cli]` 把 `entrypoints` 装旧版了。与推理无关。**v5 修法**：脚本最后追加 `pip install -U "entrypoints>=0.4"`。
- **结论与下一步（2026-09-02 修订：官方值已找到，此前为外推猜测）**：
  - **唇同步问题 → 根因是 `guidance_scale=1.0`，不是 step 不够**。`inf.sh` 默认关闭 CFG，而**论文默认 α=1.6**。Table 7 显示 CFG 1.0 的 Avg Std=1.655 为全部测试点最低，3.0 翻倍至 3.394。（此前「参考 LongCat 下探 3.0-5.0」是类比外推，**现以官方 1.6 为准**；且 Table 7 显示 BAS 在 3.0 后下降，过大反而伤音频对齐。）
  - **「糊」→ 根因是 Lite TAEHV，官方给了两条缓解路径**：① 换 WanVAE（Table 1 FID 38→21）；② 步数 1→2（§Effect of different Autoencoders 原文）。但 v5 实测**这两条在 T4 上都不成立**——见下"v5 实测结果"（D 步数翻倍后清晰度仍 49.8、C 换 WanVAE 清晰度 49.8 < A 的 52.0；B 单纯 CFG 3.0 把唇同步 r 从 0.41 拉到 0.68 + 嘴部清晰度 52→181）。
- **v5（2026-09-02，已执行）**：把上面 A/B/C 三条**合并成一次 GPU 周期的参数矩阵**（权重已下完，边际成本只有推理时间）。按「最便宜 + 信息量最大」排序，即使中途超时也已拿到决定性对比：

  | 变体 | CFG     | VAE                       | steps | 直击问题               | 官方信源                          |
  | ---- | ------- | ------------------------- | ----- | ---------------------- | --------------------------------- |
  | A    | **1.6** | TAEHV（lite）             | 1     | 唇同步（最小改动）     | 论文 §Parameter Sensitivity α=1.6 |
  | B    | 3.0     | TAEHV（lite）             | 1     | CFG 是否 1.6 不够      | 论文消融：幅度 1.655→3.394        |
  | C    | 1.6     | **WanVAE**（`--no_lite`） | 1     | 糊（收益最大，FID 21） | 论文 Table 1                      |
  | D    | 1.6     | WanVAE                    | **2** | 糊（论文官方缓解法）   | §Effect of different Autoencoders |

  其余全部钉死在官方 `inf.sh` 基线（`--model_type pro`、512×512、fps 25、`--compile off`、`--max_chunks 4`），保证变量唯一。每个变体独立 `torchrun` 进程 + `check=False`，**单变体 OOM 不影响其余三个**。

- **⏱️ 单次运行耗时基线（v4 实测，用于预估后续每轮成本）**：

  | 阶段                          | 实测耗时             | 备注                                                                                    |
  | ----------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
  | clone + 装 torch 2.7.1 + 依赖 | ~5.7 min             | 大头是 821 MB torch wheel + cuDNN 571 MB                                                |
  | 预检（含 CUDA/LoRA 注入用例） | ~0.3 min             |                                                                                         |
  | 下载三套权重                  | 含在上项内           | Kaggle 出网到 HF 很快                                                                   |
  | **推理（单变体，lite/1 步）** | **~1.5-1.8 min**     | 3 chunks × ~20s + pipeline init ~25s                                                    |
  | **v4 总 wall**                | **511s ≈ 8.5 min**   | 两个 lite 变体                                                                          |
  | **v5 预估**                   | **~25-30 min**       | 4 变体：A/B 各 ~2.5 min（CFG 双 forward），C ~4 min，D ~8 min（WanVAE 解码更重 + 2 步） |
  | **v5 实测**                   | **1819s ≈ 30.3 min** | 见下"v5 实测结果"，预估偏短（漏算 WanVAE 首块冷启动）                                   |

  **注意**：模型存在 `/tmp`，而 Kaggle 每次运行是全新容器，**权重每轮都要重下**——这是固定成本，不因变体数增加而增加。把权重存成 Kaggle Dataset 可省掉这部分（待办）。

- **v5 实测结果（2026-09-02 19:12 CST 完赛 · T4 4 变体单跑 30.3 min）**：

  4 个变体均产出 512×512 / 25fps / 77 帧 / 3.08s 的 mp4。所有量化数据在 `/tmp/leaptalk_out/`（`metrics_v5.json` + `lipsync_evidence2.png`），分析脚本 `analyze.py`+`sync2.py` 同目录。

  | 指标                                               | A TAEHV α=1.6 s=1 | B TAEHV α=3.0 s=1 | C WanVAE α=1.6 s=1 | D WanVAE α=1.6 s=2 |
  | -------------------------------------------------- | ----------------- | ----------------- | ------------------ | ------------------ |
  | **唇同步 r@lag0**（嘴部暗度信号 vs 音频 RMS 包络） | 0.409             | **0.677**         | 0.344              | 0.046              |
  | 嘴部帧间运动 mean                                  | 12.6              | **20.5**          | 13.1               | 13.0               |
  | 上脸运动（jitter 代理）                            | 10.2              | 14.2              | 10.7               | 9.7                |
  | 背景闪烁                                           | 3.74              | 5.88              | 3.79               | 3.09               |
  | 嘴部 Laplacian（清晰度）                           | 52.0              | **180.8**         | 49.8               | 49.8               |
  | 上脸 Laplacian                                     | 172.5             | **462.5**         | 131.1              | 113.2              |
  | 身份相关性（眼区）                                 | 0.60              | 0.49              | 0.59               | 0.62               |
  | **单变体 wall**                                    | 165s              | 168s              | **508s**           | **627s**           |
  | 生成 FPS                                           | 0.66              | 0.60              | 0.28               | 0.19               |
  | VAE decode（s/chunk）                              | 2.0               | 2.5               | **149/51/51**      | 142/51/51          |

  **5 个反直觉结论（v5 阶段，依据代理指标，2026-09-02 22:39 已重新肉眼复核，结论 1/2/3 大幅修正）**：

  1. ⚠️ **「B = T4 最优」是基于 Laplacian 清晰度代理的错判，肉眼复核后被推翻**。v5 抽帧对比：A_05 / B_05 额头出现明显油画/水彩色块（C_05 / D_05 干净），这是 TAEHV 在高 CFG 下被激出的高频伪影被 Laplacian 算法当成"清晰"算分；D_02/D_05/C_05 视觉画质肉眼明显优于 A_05/B_05。**真实视觉画质排序（仅看 C/D/B/A 的 mid+late 帧）：C ≈ D ≫ B ≫ A**。
  2. ⚠️ **「D 全面退步」也是同一代理的错判**。D 的视觉画质与 C 几乎一致（WanVAE 1 步 vs 2 步），差别只在 D 的嘴动更弱（用户观感"画面稳"）。**2 步在 WanVAE 上没让画质退步，也没让画质提升**——只是净增成本（10.5 vs 8.5 min）。
  3. ⚠️ **「换 WanVAE 治糊」并不是「不划算」而是「真有效」——我之前错把代理当人眼**。Laplacian 算 A=52.0 > C=49.8（**反的**），真实视觉 C 是 A 的明显改善（无色块伪影）。代价 3× 慢是事实，但视觉收益大。
  4. **CFG 与画质的取舍**：A 是 TAEHV+α=1.6（伪影最重、嘴动中等）；B 是 TAEHV+α=3.0（伪影较重、嘴动最强）；C 是 WanVAE+α=1.6+1步（**画质干净、嘴动中等**）；D 是 WanVAE+α=1.6+2步（画质干净、嘴动最弱）。**最优画质是 C 或 D，最强嘴动是 B，没有单一参数通吃**——这是一个真实的「画质 vs 唇同步」权衡。
  5. **KERNEL 状态仍 ERROR，但不影响结果**。v4 的 `pip install -U "entrypoints>=0.4"` 在 v5 仍 nbconvert 报错（kernel 1798s 安装 / 1803s 报 `cannot import name 'EntryPoint'`），**4 个 mp4 在 1794s 全部已 Saved**。KERNEL 状态 ERROR 仅来自 Kaggle 跑完后的导出阶段，与推理无关。（**v6 追验**：去掉 `huggingface_hub[cli]` + pin `entrypoints<0.5` **仍未修好**——0.4.x 确实没有 `EntryPoint` 符号；**v7 需 pin `entrypoints==0.3`**。）

  **对用户 3 个核心问题的直接回答（v5 阶段已被推翻，v8 重新规划）**：
  - "**官方文档建议什么？**" — α=1.6、1 步、Pro 配 WanVAE、Lite 配 TAEHV；**但这套推荐在 T4 上视觉画质不再是最佳**（C/D 视觉更干净但慢，B/A 视觉有伪影但快）。
  - "**是 step 不够吗？**" — 在 TAEHV 上不是；在 WanVAE 上**也不让画质提升**（C=D），只是让嘴动略弱（用户后续肉眼识别出 v5 D 视觉干净）。
  - "**每跑一次要多久？**" — A/B 变体（TAEHV）~2.8 min；C/D（WanVAE）~8.5-10.5 min；**4 变体完整矩阵 ~30 min**（含权重下载 ~5-7 min + 推理 ~20-23 min）。

- **运行配置**：`scripts/kaggle/leaptalk-test/`（`leaptalk_inference.py` + `kernel-metadata.json`），Kaggle T4，复用 `xpabloli/infinitetalk-input`（portrait.jpg + audio.wav）做同素材 A/B。推理参数用 `inf.sh` 默认（`--num_inference_steps 1 --lite --compile off --model_type pro`），首跑加 `--max_chunks 4` 限时（先验证端到端可跑通，再跑全长做 A/B）。
- **产物**：4 个 mp4 + metrics_v5.json + lipsync_evidence2.png 拉回 `/tmp/leaptalk_out/` 后回填本表。运行/结果见：https://www.kaggle.com/code/xpabloli/leaptalk-test
- **当前状态**：✅ v6 CFG 扫描完成，α 响应曲线已量化（见下）。**T4 实测甜区 α=3.0-3.5（唇同步峰值），清晰度随 α 单调上升至 5.0 无同步损失**。
- **v6（2026-09-02，已执行完赛 20:56 结束 · 总 wall 1198.4s ≈ 20 min）**：放弃 WanVAE 变体（C/D 全面退步——**注：此判断已由 22:39 肉眼复核推翻**），改为 **CFG 扫描**：α = 2.0 / 2.5 / 3.5 / 4.0 / 5.0 全在 TAEHV + 1 步上跑，与 v5 的 A(1.6)/B(3.0) 合并成 7 点曲线。5 变体全部 OK，单变体 153-179s。
- **v7（2026-09-02，已执行完赛 21:19 结束）：主交付 CFG α=4.0+512，768 变体 OOM 自动回退**。**注：α=4.0 是 Laplacian 代理指标"嘴部清晰度 463.9"最高的点，但肉眼复核发现 frame 70 出现水彩伪影（油画感色块）——指标把噪声当清晰。CF5.0 视觉上有"比 v6 B 更糊"的质感，已被 22:39 推翻。**
- **LeapTalk 四轮运行成本汇总**：硬件均为 **Kaggle T4×1 15GB（免费，每周 30h GPU 配额）**，成本 **$0**；耗时 v4=511s、v5=1819s、v6=1198s、v7=176s（含权重下载 ~6 min + 推理 ~3 min）。**v8 已规划（沿 WanVAE CFG 扫描，~35 min）待新 session 跑，结论未出。**
- **v8（2026-09-02，规划中）**：基于肉眼复核发现 WanVAE 视觉明显优于 TAEHV，重新设计——**沿 C 路线（Pro+WanVAE+1步）做 CFG 扫描**（α=1.6/2.0/2.5/3.0），找画质+嘴动平衡点。WanVAE decoder 慢但在视觉上才能体现 WanVAE 优势。

#### v8 设计详解（每项均标信源 + 理由）

**1. 路线：WanVAE（`--no_lite`）—— 推翻了 v5-v7 的全部 TAEHV 隐含推荐**

| 信源                                                                    | 性质                         | 结论                                              |
| ----------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------- |
| `/tmp/leaptalk_out/C_05.png` vs `B_05.png`（2026-09-02 22:39 肉眼复核） | **直接证据（ground truth）** | C/D 视觉干净（无色块），A/B 有明显油画/水彩伪影   |
| `scripts/kaggle/leaptalk-test/leaptalk_inference.py` v7 commit          | 间接                         | `--lite` 默认走 TAEHV；切 WanVAE 必须 `--no_lite` |
| LeapTalk 论文 Table 1（arXiv 2608.00079）                               | 官方                         | Pro+WanVAE **FID 21** vs Pro+TAEHV **FID 38**     |

**2. 步数：1 步（不变）—— 不是被官方禁止多步，是 v5 已证多步无收益**

| 信源                                             | 结论                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `/tmp/leaptalk_out/C_05.png` vs `D_05.png`（v5） | **C/D 视觉几乎一致**，2 步没让画质提升，只是嘴动略弱（v5 metrics：r 0.344→0.046）                                    |
| LeapTalk README Highlights                       | "One-step inference, 200 FPS"（设计目标 1 步）                                                                       |
| 论文 §Effect of different Autoencoders           | "TAEHV blur can be alleviated by increasing 1→2 steps"（**仅对 TAE**，WanVAE 无数据；v5 验证在 WanVAE 上无视觉收益） |

**3. CFG 范围：α ∈ {1.6, 2.0, 2.5, 3.0}**

| 边界             | 信源                                                        | 理由                                                                                                                                  |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 下限 1.6         | 论文默认 α=1.6（README + Table 7）                          | 官方起点，可作为基线                                                                                                                  |
| 上限 3.0         | v6 7 点 CFG 扫描（`metrics_v6_sweep.json`）+ 22:39 肉眼复核 | v6 B=α3.0 唇同步峰 r=0.677（TAEHV 路线）；但 TAEHV 在 α≥3 已视觉毁容，**WanVAE 未知**，先保守到 3.0，避免重蹈 v7 α=4.0 视觉变差的覆辙 |
| 跳过 3.5/4.0/5.0 | 22:39 肉眼复核（v6 H/I + v7）                               | TAEHV 在 α≥3.5 已视觉毁容；WanVAE 还没数据，先不探                                                                                    |

**4. 分辨率：512×512（不变）**

| 信源                                             | 结论                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| v7 实测 `/tmp/leaptalk_v7_out/leaptalk-test.log` | 768×768 直接 OOM（28.7s 失败），T4 15GB 撑不住；512 是 T4 唯一可行尺寸 |

**5. 复用 v5 C（α=1.6 + WanVAE + 1 步）**

| 信源                                                | 结论                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `/tmp/leaptalk_out/leaptalk_C_cfg1.6_wanvae_s1.mp4` | 已存在且帧数=77，时长=3.08s，与 v8 规格一致，**不重跑**节约 8.5 min |

**6. 决策准则（三层验证，不再被 Laplacian 等代理骗）**

**Round 1（粗筛，仅用不被证伪的代理）**：

- ✅ 嘴部 ROI（y 0.59-0.74）× 灰度暗度-时间序列的 std（`/tmp/leaptalk_out/sync2.py` 已实现）—— **口动强度代理**，与 Table 7 Avg Std 同向
- ✅ 音视频对齐：ffprobe 检查 `start_time=0`、`duration≈3.08s`
- ❌ **Laplacian 方差**：被 22:39 推翻（色块伪影被当"清晰"），**本轮禁用**
- ➕ 整帧颜色 std（多帧间方差）：粗略的颜色稳定度代理

**Round 2（必须，肉眼复核）**：

- 每变体抽 5 帧：第 10/25/40/55/70 帧（与 v5 比较基准一致）
- 网格图 4 列 × 5 行摆一排，一眼看出逐帧稳定性
- **逐帧逐变体盯**：色块、锐化环、毛刺、肤色跳变、嘴形清晰度

**Round 3（最终验收）**：

- 4 变体 mp4 **拼成 1×4 带音频对照视频**（已有 `grid2.py` 改 4 列），**你的耳朵+眼睛**判哪格最佳
- 提交顺序：选定的最佳变体 → 写文档 → 推送最终结论

**7. 预计时长**

| 阶段                              | 时长                    |
| --------------------------------- | ----------------------- |
| 权重重下                          | ~6 min                  |
| K (α=2.0) + L (α=2.5) + M (α=3.0) | 3 × ~8.5 min ≈ 25.5 min |
| 抽帧 + 量化 + 网格图              | ~3 min                  |
| **总 wall**                       | **~35 min**             |

**8. 数据/参考的时效声明**

- 所有实测数据采集日期：**2026-09-02（CST，星期三）**
- 引用论文：arXiv **2608.00079v1**（若 v2 发布需重读）
- HuggingFace 权重卡：`z-rx/leaptalk`（若权重更新需重测）
- 引用脚本基线：`scripts/kaggle/leaptalk-test/leaptalk_inference.py`（v7 commit，本次将改为 v8 commit）

  **v5+v6 合并 CFG 响应曲线**（Pro DiT + TAEHV + 1 步，512×512，77 帧，同素材）：

  | α                   | 1.6(A) | 2.0(E) | 2.5(F) | 3.0(B)        | 3.5(G) | 4.0(H) | 5.0(I)    |
  | ------------------- | ------ | ------ | ------ | ------------- | ------ | ------ | --------- |
  | **唇同步 r@lag0**   | 0.409  | 0.613  | 0.661  | **0.677** ←峰 | 0.662  | 0.639  | 0.673     |
  | 嘴部运动            | 13.5   | 16.2   | 18.8   | 20.7          | 22.3   | 23.8   | **25.5**  |
  | 嘴部清晰度          | 69.6   | 114.3  | 175.6  | 219.4         | 295.1  | 359.8  | **555.0** |
  | 上脸清晰度          | 187.2  | 315.7  | 443.2  | 525.0         | 583.1  | 615.3  | **813.7** |
  | 口腔开合动态 ap_std | 0.033  | 0.045  | 0.062  | 0.076         | 0.085  | 0.094  | **0.100** |

  （数据信源：`output/leaptalk-v6/metrics_v6_sweep.json`，分析脚本 `/tmp/leaptalk_v6_out/sweep.py`；曲线图 `cfg_sweep_chart.png`，嘴部特写+信号叠加 `cfg_sweep_mouths.png`，带音频 2×2 对照 `cfg_sweep_2x2_labeled.mp4`）

  **v6 结论**：
  1. **唇同步在 α=3.0 达峰（0.677），之后平台期（3.5/5.0 ≈ 0.66-0.67），4.0 有个浅谷（0.639）**——不是单调函数。α<2.0 时急剧劣化（1.6→0.409），**α≥2.5 后都是可用的**。
  2. **清晰度随 α 严格单调上升，且 5.0 处无同步损失**——「糊」的另一个解法是把 CFG 拉高（α=5.0 嘴部清晰度 555 是 3.0 的 2.5 倍）。**但高 CFG 的过锐/伪影未被本指标捕捉**，需肉眼验收 `leaptalk_I_cfg5.0_lite_s1.mp4`（v7 待办）。
  3. **T4 实测推荐**：**α=3.0（均衡首选）/ α=5.0（清晰度优先，需肉眼确认无伪影）**。论文官方 α=1.6 在 T4 上确认偏弱（r 仅 0.409）。
  4. **KERNEL 状态 v6 仍 ERROR（推理无影响，5 mp4 全部 Saved）**：`entrypoints<0.5` 解析到 0.4.x，仍无 `EntryPoint` 符号；去掉 `huggingface_hub[cli]` 也没拦住。**v7 改 pin `entrypoints==0.3`**（nbconvert 7 需要 `from entrypoints import EntryPoint`，该符号 0.3 才有）。
  5. 用户主观观察校准：v5 2×2 对照里「D 看起来最好」实为**近静态假象**（D r=0.046 嘴几乎不动，画面稳但不会说话）；声画在容器层是对齐的（音视频均 start=0，时长 3.072/3.08s），「不同步」感来自低 α 变体嘴动过弱 + 对照格里 4 张嘴只有 1 条音轨的归因困难。**已做带音频标注版对照**（`cfg_sweep_2x2_labeled.mp4`：F2.5/B3.0/G3.5/I5.0）供肉眼验收。

- **❌ 最终裁决（2026-09-02 20:43 用户肉眼验收）**：**「画面质量太差」——LeapTalk 否决，停止进一步调参**。用户三问的核实结论：
  1. **「之前画质好时我的评价是什么」**：可用基线的用户评价分别为——InfiniteTalk v10.17 FusionX 8 步「**lip sync + 表情均最佳**」（质量基线，NC 停测）；InfiniteTalk v10.18 lightx2v 4 步「**lip sync 达标但表情偏僵**」（可商用备选）；LongCat v11.1「唇同步基本正常但口型幅度偏大偏夸张」；EchoMimicV3 v51 当时**固化为最优配置**（用户认可可用）。
  2. **「之前那版视频还有吗」**：在。`scripts/short-video/experiments/digital-human/` 下——`infinitetalk/infinitetalk_v1017_lora_audio2.0.mp4`（表情最佳基线）、`infinitetalk/infinitetalk_v1018_lightx2v_audio2.0.mp4`、`echomimicv3_v50_merged.mp4`（及 v48/v49/v50 seg1/seg2）、`longcat/longcat_v111_bf16_distill.mp4`。并排对照已做：`output/leaptalk-v6/baseline_vs_leaptalk.mp4`（左 InfiniteTalk v10.18，右 LeapTalk α=3.0，同 portrait+audio 输入）。
  3. **「之前那版是官方推荐配置吗」**：是官方配方——InfiniteTalk v10.17/10.18 用官方 README LoRA 章节**明文推荐值**（audio CFG=2.0、shift=2、8 步/4 步），bf16 **非量化**；EchoMimicV3 v51 = 官方 8 步 Flash 配置 + 速度补丁（TeaCache/compile，画质影响小）。
  4. **「现在跑的是量化版本所以差吗」**：**不是量化**。LeapTalk 权重是 bf16/fp16 全精度。差距来自**架构取舍**：① **1 步桥蒸馏**（之前可用模型都是 4-8 步迭代，一步生成细节天花板低）；② **TAEHV 轻量 VAE**（FID 38 vs 完整 WanVAE 21，且 WanVAE 在 T4 上 51s/chunk 不实用）；③ **512×512**（vs 576×704/768²）；④ LeapTalk 设计目标是 **200 FPS 实时流式**（H200），本质是拿画质换速度和无限长。v6 已证 α 拉到 5.0 清晰度涨 2.5 倍仍远不及 8 步模型——这是蒸馏模型天花板，调参救不回来。
  5. **后续**：LeapTalk 归档为「实时流式备选，画质不达标」；可用基线仍是 InfiniteTalk v10.18（可商用）与 EchoMimicV3 v51。若继续找更高质量模型，按 license 门禁筛下一批候选（Hallo3 等）。

- **v7（2026-09-02，21:19 完赛 · 总 wall 558.5s ≈ 9.3 min）**：应用户「输出一个画质最佳的 LeapTalk 视频 + 解决音频问题」的请求，做**最终画质冲刺**：
  - **配置**：Pro DiT + TAEHV + **CFG α=4.0** + 1 步 + 512×512 + 25fps（v6 曲线中清晰度较 α=3.0 提升 2.5 倍且同步仍在平台区）。同时尝试 **768×768（α=3.5）**，T4 15GB **OOM 失败**（28.7s）。
  - **音频问题修复**：LeapTalk 直出 mp4 本身已带 mp3 音轨（`inference.py:1131 _mux_audio`），v6 单条视频音视频均 start=0、对齐；用户此前"没音频"是本地 2×2 拼格视频的合成错误。v7 增加一层兜底：**推理后再用 ffmpeg 把原始 `audio.wav` 与视频流重混成 AAC**，输出 `leaptalk_v7_cfg4.0_512_aac.mp4`，避免 mp3 兼容问题。
  - **产物量化（仅供记录，不可作"画质更好"的证据）**：77 帧 512×512。**该指标的方法学缺陷**：Laplacian 方差同时受真实细节、高频噪声和 TAEHV 解码伪影驱动——CFG 拉高把噪声一并放大，所以"清晰度数字涨"≠"人眼看到更好"。**实际肉眼验收（2026-09-02 22:26，v7 五帧采样 n=10/25/40/55/70）**：嘴确实在动（验证 lip-sync OK），但整脸呈"水彩/油画"风格——尤其 frame 70 出现大块紫色/绿色/红色 blotchy artifacts（TAEHV 在高 CFG + 1 步蒸馏下的典型失真），眼睛区域糊化。**这与用户"画面质量太差"的裁决一致**，且非调参可修——是 1 步蒸馏 + TAEHV 轻量 VAE 的结构性上限。
  - **诚实结论**：即便 CFG4.0 让嘴明显变锐、嘴动更强烈，画面仍有 **1 步桥蒸馏 + TAEHV 的结构性伪影**（色带、胡须/边缘拖影）。这是模型设计取向（实时流式/无限长）的天花板，不是调参能彻底修好的。v7 就是 T4 上我能拿到的最佳 LeapTalk 输出。
  - **产物**：`output/leaptalk-v7/leaptalk_v7_cfg4.0_512_aac.mp4`（带 AAC 音频，start=0，时长 3.08s / 音频 2.99s）。

### 📋 SoulX-FlashHead

- **优先级**：⭐⭐⭐⭐（LeapTalk 基座，1.3B 实时流式 talking head）
- **来源**：Soul-AILab，2026-02-12 发布
- **GitHub**：`Soul-AILab/SoulX-FlashHead`
- **HuggingFace**：`Soul-AILab/SoulX-FlashHead-1_3B`
- **技术**：1.3B 参数，oracle-guided 无限长度实时流式 talking head
- **许可证**：✅ **Apache 2.0**（ModelScope/HF 标注 `apache-2.0`；Soul-AILab README；airosetta 报道 "Apache-2.0 licensed for commercial use"）— 与 LeapTalk 同栈，门禁通过
- **VRAM**：1.3B，预估 ~8-12GB，**T4 可能可跑**
- **关键特点**：LeapTalk 的基座模型，本身也是独立产品。支持实时流式 + 无限长度
- **测试重点**：独立于 LeapTalk 测试基座质量；验证是否需要 oracle guide（如果需要额外输入则复杂度高）

### 📋 FantasyTalking2

- **优先级**：⭐⭐⭐⭐（AAAI 2026，v1 已在列表，v2 升级版）
- **来源**：阿里 Fantasy-AMAP，AAAI 2026
- **GitHub**：`Fantasy-AMAP/fantasy-talking2`
- **技术**：Wan2.1-14B 基座，Timestep-Layer Adaptive Preference Optimization（TLPO），410K preference pairs
- **许可证**：❓ 待确认
- **VRAM**：14B，需 ~24GB+，T4 需重度量化
- **关键特点**：v2 用 TLPO 对齐多维度人类偏好（运动自然度+唇同步+视觉质量），声称超 SOTA
- **与 v1 区别**：v1（ACM MM 2025）是 coherent motion synthesis；v2（AAAI 2026）加了偏好优化，质量更高
- **测试重点**：v1 vs v2 质量对比；14B 在 T4 上的量化可行性

### 📋 SkyReels-V3 (A2V-19B)

- **优先级**：⭐⭐⭐（Wan2.1 基座 19B，有 GGUF 量化，但需付费 GPU）
- **来源**：Skywork（昆仑万维），2026-01-29 开源
- **GitHub**：`SkyworkAI/SkyReels-V3`
- **HuggingFace**：`Skywork/SkyReels-V3-A2V-19B`（talking avatar 19B）
- **技术**：Wan2.1 架构，统一多模态 in-context learning 框架，支持 audio-to-video
- **许可证**：❓ 待确认（Skywork 模型通常有自定义许可）
- **VRAM**：19B 需 ~40GB+，T4 不可行；有社区 GGUF 量化版（`vantagewithai/SkyReels-V3-14B-GGUF`）
- **关键特点**：与 EchoMimicV3 同基座（Wan2.1），但 19B 参数更大，可能有质量优势
- **测试重点**：GGUF 量化后能否在 T4 上跑；与 EchoMimicV3 1.3B 做质量对比

### 📋 Soul (CVPR 2026)

- **优先级**：⭐⭐⭐（CVPR 2026，声称超 SOTA，但代码/权重开源状态待确认）
- **来源**：arXiv 2512.13495，CVPR 2026
- **项目页**：`zhangzjn.github.io/projects/Soul/`
- **技术**：多模态驱动（单帧图+文本+音频），1080P 分钟级长视频，唇同步+表情+身份保持
- **许可证**：❓ 待确认
- **VRAM**：未知
- **关键特点**：声称显著超过当前开源和商业模型；配套 Soul-1M 数据集 + Soul-Bench 基准
- **风险**：代码/权重是否开源未确认；VRAM 需求未知
- **测试重点**：确认代码/权重是否开源；如果开源则测质量

### 📋 Wan2.2-S2V-14B

- **优先级**：⭐⭐⭐（Apache 2.0 ✅，Wan 官方 audio-to-video，但 14B 需量化）
- **来源**：阿里 Wan 团队，2025-08-26
- **GitHub**：`Wan-Video/Wan2.2`
- **技术**：audio-driven cinematic video generation，14B
- **许可证**：✅ Apache 2.0
- **VRAM**：14B 需 ~24GB+，T4 需重度量化
- **关键特点**：EchoMimicV3 基于 Wan2.1，这是 Wan2.2 官方 S2V 模式，同族升级
- **测试重点**：与 EchoMimicV3（Wan2.1 基座）做质量对比；14B INT8 量化后 T4 可行性

### 📋 SoulX-LiveAct

- **优先级**：⭐⭐（小时级实时，但需 RTX 4090/H100）
- **来源**：Soul-AILab，arXiv 2603.11746，2026-03-16 开源
- **GitHub**：`Soul-AILab/SoulX-LiveAct`（1.1k stars）
- **HuggingFace**：`Soul-AILab/LiveAct`
- **技术**：DiT + Flow Matching，Neighbor Forcing + ConvKV Memory，小时级实时生成
- **许可证**：❓ 待确认
- **VRAM**：支持 RTX 4090/5090（FP8 KV cache + CPU offload），T4 未提及
- **关键特点**：小时级实时动画是终极目标，但硬件门槛高
- **测试重点**：T4 是否可行（可能需要重度量化）；如果不可行则标记为付费 GPU 候选

### 📋 MiniMax H3 (API only)

- **优先级**：⭐⭐（质量好但本地不可行，仅 API 路线）
- **来源**：MiniMax，2026-07-31 发布，2026-08-03 开源权重
- **HuggingFace**：`MiniMaxAI/MiniMax-H3`
- **技术**：33B 全模态 DiT（H3-Omni Transformer），Ref2VA checkpoint 支持音频驱动+口型同步
- **许可证**：⚠️ **MiniMax H3 Community License**（不是 MIT/Apache）：
  - 商用免费但年收入 <$20M
  - **地域限制**：排除 US/EU/UK/South Korea
  - 必须 prominently display "MiniMax H3"
  - 禁止用输出改进其他 AI 模型
- **VRAM**：完整 BF16 ~150GB；INT8/offload ~80GB；社区 ComfyUI INT4 最低 ~16GB（大量 offload）。**所有路径在免费 GPU 上不可行**
- **API 定价**：$0.13/s（2K）或 ~¥0.09/s（768p）
- **关键特点**：Ref2VA 模式支持参考图+音频→口型同步视频，社区已有 ComfyUI talking avatar 工作流
- **风险评估**：Community License 不是宽松许可，需按 NC-like 风险评估流程审核。地域限制对中国用户不构成障碍，但许可条款比 MIT/Apache 严格
- **测试重点**：API 路线质量验证（如果决定接受 Community License 条款）

---

## 统一测试素材

- **视频**：`scripts/short-video/assets/IMG_7991.MOV`（用户正面视频）
- **音频**：`scripts/short-video/output/deepseek/audio/scene-1.mp3`（F5-TTS 中文）
- **照片**：`scripts/short-video/assets/Weixin Image_2026-08-10_003535_660.jpg`（正面照，VLM 评估适合做 ref）
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

| 日期       | 清理项                    | 释放空间 | 原因                                             |
| ---------- | ------------------------- | -------- | ------------------------------------------------ |
| 2026-08-09 | MuseTalk 安装目录 + 模型  | ~2GB     | VAE 架构问题                                     |
| 2026-08-10 | LatentSync 1.5 checkpoint | 3.2GB    | 256px 效果差                                     |
| 2026-08-10 | LatentSync 1.6 checkpoint | 4.7GB    | 512px OOM                                        |
| 2026-08-10 | SadTalker 目录            | 3.5GB    | 效果差                                           |
| 2026-08-10 | —                         | —        | Sonic 保留安装（ComfyUI 可复用），待决定是否清理 |
| 2026-08-10 | ComfyUI + Sonic + SVD     | 18GB     | fp16 死锁 + fp32 崩溃                            |
| 2026-08-10 | LatentSync repo           | 2.3GB    | 两个版本均失败                                   |
| 2026-08-11 | Hallo2                    | 14GB     | 256px 太低，512px 不可用                         |
| 2026-08-11 | LivePortrait              | 3.3GB    | 无音频驱动，D-ID 转接效果差                      |
| 2026-08-11 | SadTalker（重装尝试）     | 5.6GB    | Python 3.13 不兼容，已删                         |
| 2026-08-11 | V-Express                 | 7GB      | 17min/sub-step，完全不可用                       |

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

---

## 云 GPU 测试计划（2026-08-15 新增）

**云 GPU 已配置完成**：

- ✅ Kaggle CLI v2.2.4 + API 配置（全链路验证通过，P100 16GB，自动化 push → status → output）
- ✅ Colab CLI v0.6.0 已安装（`pip3 install --break-system-packages google-colab-cli`）— 全链路验证通过：`colab --auth=adc run --gpu T4 script.py` → Tesla T4 14.6GB ✅
- ⚠️ 兼容性修复：需降级 `jupyter-kernel-client<1.0`（v1.0.1 API 变更导致 `KernelClient` 找不到）
- ✅ ADC 认证已完成（`gcloud auth application-default login --scopes=...`）
- 📖 配置详情见 `docs/archive/handoff-cloud-gpu-kaggle-setup.md`
- 📖 Colab CLI 操作指南：https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md

**云 GPU 可跑的模型（之前在 M2 Pro 上失败的）**：

| 优先级     | 模型               | VRAM  | Kaggle P100 16GB | Colab T4 16GB | 商用          | 之前失败原因          |
| ---------- | ------------------ | ----- | ---------------- | ------------- | ------------- | --------------------- |
| ⭐⭐⭐⭐⭐ | **EchoMimicV3**    | 12GB  | ✅               | ✅            | ✅ Apache 2.0 | 下载阻塞 + 代码兼容   |
| ⭐⭐⭐⭐   | **InfiniteTalk**   | ~12GB | ✅ 可能          | ✅ 可能       | ✅ Apache 2.0 | 未测                  |
| ⭐⭐⭐⭐   | **LatentSync 1.6** | 18GB  | ⚠️ 省内存模式    | ⚠️ 省内存模式 | ✅ OpenRAIL++ | M2 Pro OOM            |
| ⭐⭐⭐     | **Sonic**          | 12GB  | ✅               | ✅            | ❌ 非商用     | M2 Pro fp16 死锁      |
| ⭐⭐⭐     | **V-Express**      | ~8GB  | ✅               | ✅            | ❓            | M2 Pro 17min/sub-step |
| ⭐⭐       | **Hallo2**         | 20GB+ | ❌ 16GB 不够     | ❌ 16GB 不够  | ✅ MIT        | M2 Pro 256px 太低     |

**推荐测试顺序**（从最高性价比开始）：

1. **EchoMimicV3**（Apache 2.0 + 12GB + 768px + 蚂蚁出品）→ Kaggle 自动化脚本
2. **Sonic**（效果最好但非商用，可做质量基准）→ Kaggle/Colab
3. **InfiniteTalk**（Apache 2.0 + 无限长度 + 中文）→ Kaggle
4. **LatentSync 1.6**（官方最低 18GB）→ L4/A100 云 GPU
5. **V-Express**（最轻量扩散）→ Colab 手动

**Kaggle 自动化方式**：准备 `.py` script + `kernel-metadata.json` → `kaggle kernels push -p .` → `kaggle kernels status` 轮询 → `kaggle kernels output` 下载。测试脚本参考 `scripts/kaggle/test-gpu/`。

**Colab CLI 方式**（推荐）：`colab run --gpu T4 script.py` 一键运行（provision VM → execute → teardown）。需先完成 ADC 认证（`gcloud auth application-default login --scopes=...`）。参见 [Colab CLI SKILL.md](https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md)。

**Colab 手动/CDP 方式**：在浏览器 Notebook 中执行 cell，或通过 web-access CDP 自动操作（Google 账号 qingshun.li@gmail.com 已登录）。适合调试参数。

---

## 完整待测模型列表（2026-08-18 更新）

> 此列表汇总所有待测模型/版本，按优先级排序。下文每个模型详情章节包含各版本对比表。
>
> **GPU 选择指南**（2026-08-18 新增）：Kaggle `kernel-metadata.json` 通过 `machine_shape` 字段可选 GPU 类型：
>
> - `"machine_shape": "NvidiaTeslaT4"` → T4 x2（2张T4，每张15GB，sm_75，Tensor Core，默认 PyTorch 兼容）
> - `"machine_shape": "NvidiaTeslaP100"` → P100（16GB，sm_60，无 Tensor Core，需手动降级 PyTorch）
> - 不设该字段 → 默认 P100（9/15 后自动变 T4 x2）
> - **推荐默认用 T4**：T4 支持默认 PyTorch（cu128），不需要 PyTorch 降级/diffusers patch，脚本大幅简化
> - **T4 x2 显存不是合并 32GB**：两张卡各自独立 15GB，需多 GPU 代码才能利用双卡
> - P100 需要手动安装 PyTorch 2.4.1+cu121 + diffusers 0.31 + FLAX patch + check_torch_load_is_safe patch
> - T4 和 P100 **都不支持 bfloat16**（需 Ampere sm_80+，即 L4/A100）

| # | 模型/版本 | 基座模型 | 类型 | 许可证 | 推荐 GPU | 本地/云端 | 优先级 | 说明 |
|---|----------|---------|------|--------|---------|----------|--------|--------|------|
| 1 | ~~EchoMimicV3 Flash (v51 最优配置)~~ | Wan2.1-Fun-V1.1-1.3B | 原始版 | Apache 2.0 | T4✅ | ✅ **最优** | — | TeaCache on + torch.compile + 720p + 8步，~14min/段 |
| 2 | ~~EchoMimicV3 app_mm.py 参数组合 (v34)~~ | Wan2.1-Fun-V1.1-1.3B | 量化版 | Apache 2.0 | P100✅ | ✅ 已完成 | — | 3 test case 全成功，app_mm 参数无加速 |
| 3 | ~~EchoMimicV3 NF4/bnb 量化~~ | Wan2.1-Fun-V1.1-1.3B | 量化版 | Apache 2.0 | T4 (Modal) | ✅ **已完成** | — | Modal T4 186GB RAM + NF4 + model_cpu_offload：5.0min/段 vs baseline 5.9min，推理 43% 加速 |
| 4 | ~~InfiniteTalk (原始版)~~ | Wan2.1-I2V-14B | 原始版 | Apache 2.0 | A100 | ✅ **v10.18 已测** | — | lightx2v 4步可商用，9.3min/3s，lip sync 达标表情偏僵 |
| 5 | MultiTalk INT8 量化版 | Wan2.1-I2V-14B | 量化版 | Apache 2.0 | T4 | Kaggle | ⭐⭐⭐⭐ | 已发布 INT8 + SageAttention |
| 6 | ~~LongCat GPU INT8~~ | LongCat-Video 13.6B DiT | 量化版 | MIT | A100 | ✅ **v11.1 已测** | — | bf16+DMD 8步，4.3min/3.2s，唇同步正常但口型偏夸张 |
| 7 | Wan2GP InfiniteTalk 低VRAM | Wan2.1 (deepbeepmeep 优化) | 优化版 | 开源 | T4 | Kaggle | ⭐⭐⭐ | deepbeepmeep，6GB 可跑 |
| 8 | EchoMimicV3 ComfyUI LCM | Wan2.1-Fun-V1.1-1.3B | 加速版 | Apache 2.0 | T4 | Kaggle | ⭐⭐⭐ | 4步推理，需 ComfyUI 环境 |
| 9 | ~~InfiniteTalk + lightX2V LoRA~~ | Wan2.1-I2V-14B | 加速版 | Apache 2.0 | A100 | ✅ **v10.18 已测** | — | 即 #4 的加速版 |
| 10 | ~~LongCat MLX q8~~ | LongCat-Video 13.6B DiT | 本地量化 | MIT | — | ❌ 本地失败 | — | MLX 移植不像本人+全黑；云 GPU 版已测（#6） |
| 11 | ~~EchoMimicV3 T4 平台测试~~ | Wan2.1-Fun-V1.1-1.3B | 平台测试 | Apache 2.0 | T4 | ✅ 已完成 | — | T4 替代 P100，快 24%，已固化为最优配置 |
| 12 | ~~Sonic (原始版)~~ | SVD UNet + Whisper-Tiny | 质量基准 | ❌ 非商用 | T4 | ❌ 不测 | — | 非商用，license 门禁不通过 |
| 13 | ~~LatentSync 1.6 省内存模式~~ | SD UNet + VAE | 原始版 | OpenRAIL++ | L4/A100 | ❌ T4 OOM | — | T4 16GB 不够（需 18GB），已验证 |
| 14 | ~~Hallo3 (原始版)~~ | CogVideo DiT | 原始版 | MIT | A100 | ❌ **否决** | — | self-portrait+deepseek A/B 与 EchoMimicV3 接近无优势；只能英文+只能 head |
| 15 | FeatherTalk | 轻量 CNN | 轻量级 | ❓ | — | 本地 M2 Pro | ⭐⭐ | 超轻量，license 待确认 |
| 16 | LTX-2.3 + AV-LoRA | LTX-Video 22B DiT | DiT+LoRA | OpenRAIL | L4/A100 | Colab Pro+ | ⭐⭐ | 22B 需大显存 + bf16 |
| 17 | **EMO** | Stable Diffusion + Audio2Video | 原始版 | ❓ | A100 | 云 GPU | ⭐⭐⭐⭐⭐ | 阿里，ECCV 2024，7601 stars，未公开 weights |
| 18 | ~~**PersonaLive**~~ | 扩散 (SD1.5 基座) | 原始版 | ❌ 非商用 | T4 | ❌ 不测 | — | 非商用，license 门禁不通过 |
| 19 | ~~**DICE-Talk**~~ | 扩散+情感解耦 | 原始版 | ❌ 非商用 | L4/A100 | ❌ 不测 | — | 非商用，license 门禁不通过 |
| 20 | **Hallo4** | 扩散 (Hallo 系列最新) | 原始版 | MIT | A100 | 云 GPU | ⭐⭐⭐⭐ | 2025.05，Hallo 系列最新版 |
| 21 | **Hallo-Live** | 扩散实时 | 实时版 | MIT | T4 | Kaggle | ⭐⭐⭐ | 实时版本，MIT 许可 |
| 22 | ~~**V-Express**~~ | SD 1.5 | 原始版 | ❓ | T4 | ❌ MPS 太慢 | — | 17min/sub-step，已本地测放弃 |
| 23 | **JoyVASA** | 扩散+解耦表示 | 原始版 | ❓ | A100 | 云 GPU | ⭐⭐⭐⭐ | 京东健康，中文支持，876 stars |
| 24 | **EchoMimic V2** | SD + 关键点 | 原始版 | Apache 2.0 | T4 | Kaggle | ⭐⭐⭐⭐ | 2024.07，4279 stars |
| 25 | **AniPortrait** | SD + 关键点 | 原始版 | ❓ | T4 | Kaggle | ⭐⭐⭐⭐ | 2024.03，5019 stars |
| 26 | **DreamTalk** | 扩散 | 原始版 | ❓ | T4 | Kaggle | ⭐⭐⭐ | 阿里，1789 stars |
| 27 | **Hallo (v1)** | 分层扩散 | 原始版 | ❓ | A100 | 云 GPU | ⭐⭐⭐ | 2024.06，8658 stars |
| 28 | ~~**Hallo2 (云 GPU)**~~ | 分层扩散 | 原始版 | MIT | A100 | ❌ 256px 太低 | — | 已本地测过 256px 放弃 |
| 29 | **SoulX-FlashHead** | 1.3B DiT | 原始版 | ✅ Apache 2.0 | T4 | Kaggle | ⭐⭐⭐⭐ | LeapTalk 基座，未蒸馏，验证"LeapTalk 差是蒸馏还是基座"；1.3B ~8-12GB，T4 可跑，零成本 |
| 30 | **Wan2.2-S2V-14B** | Wan2.2-14B | 原始版 | ✅ Apache 2.0 | L4/A100 | 云 GPU | ⭐⭐⭐ | Wan 官方 2025.08 audio-to-video，EchoMimicV3 同族升级；14B 需 20GB+，T4 跑不了需付费 GPU |
| 31 | **FantasyTalking2** | Wan2.1-14B | 原始版 | ❓ 待确认 | L4/A100 | 云 GPU | ⭐⭐⭐⭐ | AAAI 2026，TLPO 偏好优化，声称超 SOTA；license 待核实 |
| 32 | **JoyVASA** | 扩散+解耦 | 原始版 | ❓ 待确认 | A100 | 云 GPU | ⭐⭐⭐⭐ | 京东健康，中文支持，876 stars；license 待核实 |
| 29 | **LatentSync 1.5** | SD UNet + VAE | 原始版 | OpenRAIL++ | T4（8GB） | Kaggle | ⭐⭐⭐⭐ | 8GB 即可跑，T4 单卡足够 |
| 30 | **LeapTalk** | SoulX-FlashHead-1.3B (DiT) | 1步推理 | ✅ Apache 2.0 | T4（~15GB） | Kaggle | ⚠️ v4 1.41 FPS / 默认参数近静态 | 2026-07-29 arXiv，1步推理 200 FPS，无限长度流式，基座 1.3B 同 EchoMimicV3 量级 |
| 31 | ~~**SoulX-FlashHead**~~ | Soul-AILab 自研 (1.3B) | 实时流式 | ✅ Apache 2.0 | T4（~15GB） | ✅ 已完成 | — | 2026-09-04 测完：Model_Pro 675.7s + Model_Lite 197.5s，嘴部有动态变化，画质清晰；验证 LeapTalk 差是1步桥蒸馏造成而非基座；产物 `experiments/digital-human/soulx-flashhead/` |
| 32 | **FantasyTalking2** | Wan2.1-14B (DiT) | 原始版 | ❓ 待确认 | L4/A100 | Colab Pro+/云 GPU | ⭐⭐⭐⭐ | AAAI 2026，v2 升级版（TLPO 偏好优化），v1 已在列表 |
| 33 | **SkyReels-V3 A2V** | Wan2.1-19B | 原始版 | ❓ 待确认 | A100（40GB+） | 云 GPU | ⭐⭐⭐ | 2026-01-29 开源，统一多模态框架，talking avatar 19B，有 GGUF 量化 |
| 34 | **Soul** | 自研 DiT | 原始版 | ❓ 待确认 | A100 | 云 GPU | ⭐⭐⭐ | CVPR 2026，多模态驱动（图+文+音频），1080P 分钟级长视频，声称超 SOTA |
| 35 | **Wan2.2-S2V-14B** | Wan2.2-14B | 原始版 | ✅ Apache 2.0 | L4/A100 | Colab Pro+/云 GPU | ⭐⭐⭐ | 2025-08 官方 audio-driven cinematic video，Wan2.2 系列 |
| 36 | **SoulX-LiveAct** | DiT + Flow Matching | 实时版 | ❓ 待确认 | RTX 4090/H100 | 云 GPU | ⭐⭐ | 2026-03 开源，小时级实时动画，Neighbor Forcing+ConvKV，需 RTX 4090+ |
| 37 | **MiniMax H3** | H3-Omni Transformer 33B | API/权重 | ⚠️ Community License | API only | API | ⭐⭐ | 2026-07-31 发布，33B 全模态，Ref2VA 支持 talking head，134GB 权重本地不可行，地域限制 US/EU/UK/KR |

---

## 云 GPU 平台分析（已 offload）

> **双 T4 多 GPU 可行性分析、Kaggle vs Colab 平台对比、Colab Pro vs AutoDL 等价对比、GPU 硬件差异（bf16/VRAM）、免费 GPU 平台深度调研**见 `docs/research/cloud-gpu-options.md` — 从 §"双 T4 多 GPU 可行性分析" 开始到文档末尾。
