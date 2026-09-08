# Deep Research: CUDA-based 数字人模型适配华为昇腾 NPU 910B 可行性调研

> 调研日期：2026-09-07
> 调研方法：web-deep-research（8-phase methodology），4 个并行子代理分治 13 个模型，多源验证（GitHub repo / HuggingFace / 论文 / Issues / 源码 import 检查）
> 目标硬件：Ascend 910B，32GB HBM + 64GB CPU cgroup，算力 ≈ A100-40GB
> 软件栈：PyTorch 2.9.0 + torch_npu 2.9.0 + CANN 8.5

## Executive Summary

我们已在 NPU 910B 上成功运行 Wan2.2-S2V-14B（550s 产出 480×832×40 帧，质量 8.5/10），积累了 8 条 patch 经验。本次调研评估 13 个 CUDA-based 数字人模型能否复用该经验迁移到 NPU 910B。

**核心结论**：

1. **13 个模型中 12 个技术上可行**，仅 LongCat-Video-Avatar-1.5 因 Triton BSA kernel 硬编码 CUDA 评为 Very Hard（非 Impossible，可关闭 BSA fallback 损失效率）。
2. **5 个模型为 Easy 级**：FeatherTalk、EchoMimicV3 Flash、LatentSync、SadTalker、SoulX-FlashHead（单卡）。其中 EchoMimicV3 和 SoulX-FlashHead 基于 Wan2.1-1.3B，与我们已跑通的 Wan2.2-14B 架构同源，patch 经验直接可复用，且 1.3B 远小于 14B 显存压力更低。
3. **InfiniteTalk 已有社区 NPU 适配 fork**（`rockie/InfiniteTalk-Ascend`，含 `_npu_adapter/` 层），是 talking body 组中风险最低的，建议首发。
4. **最大障碍不是模型核心，而是预处理依赖**：MMLab 生态（MuseTalk）、onnxruntime-gpu（LivePortrait）、Triton kernel（LongCat）、SAT 框架 + triton（Hallo3）、xformers 硬 import（SoulX-FlashTalk）。
5. **显存是硬约束**：SoulX-FlashTalk 14B（实际 18.88B，bf16 37.76GB）和 Hallo3（25–30GB）超出 32GB HBM，必须 int8 量化或激进 CPU offload。其余 11 个模型均可全驻留 HBM。

## 汇总表格

| # | 模型 | 参数量 | bf16 权重 | 32GB HBM 可驻留 | flash_attn | CUDA kernel | xformers | triton | bitsandbytes | 适配难度 | 预估推理时间 | NPU 先例 | 关键风险 |
|---|------|--------|-----------|----------------|------------|-------------|----------|--------|--------------|----------|--------------|----------|----------|
| 1 | SoulX-FlashTalk 14B | 18.88B | 54.46GB | ❌（需 int8/offload） | 有 SDPA fallback ✓ | 无 | **硬依赖无 fallback** ✗ | 无 | 无 | **Hard** | 10–30s/chunk | 无 | xformers+xfuser 两层 CUDA 库 + 显存缺口 |
| 2 | LongCat-Video-Avatar-1.5 | 14.8B | ~33GB | ❌（需 INT8 ~18GB） | 需 fallback | 无 | 可选（CUDA-only） | **硬编码 CUDA backend** ✗ | 无（INT8 自实现）✓ | **Very Hard** | 2–5 min/段 | 无 | Triton BSA kernel 是核心效率特性 |
| 3 | InfiniteTalk | ~14B | ~30–34GB | ⚠️（需 fp8/offload） | 有 SDPA fallback ✓ | 无 | 硬依赖（单卡可换 SDPA） | **无** ✓ | 无（用 optimum-quanto）✓ | **Medium** | 3–15 min/5s | **有 fork** | 已有 `rockie/InfiniteTalk-Ascend`，多卡未就绪 |
| 4 | FeatherTalk | ~12M | ~27MB | ✅（绰绰有余） | 无 | 无 | 无 | 无 | 无 | **Easy** | 数十秒/60s 音频 | 无 | 极低，仅需 device 选择 patch |
| 5 | SoulX-FlashHead Pro/Lite | 1.3B | ~4–6GB | ✅ | 有完整 SDPA fallback 链 ✓ | 无 | 冗余（未实际用） | 无 | 无 | **Easy→Medium** | 1–3 min/次 | **同团队有** | xfuser 硬 import（单卡可绕过） |
| 6 | EchoMimicV3 Flash | 1.3B | ~4–6GB | ✅（12G 即可） | try/except 自动降级 SDPA ✓ | 无 | 无 | 无 | 无 | **Easy** | 1–3 min/次 | 无 | 仅字符串级 patch，最干净 |
| 7 | Hallo3 | ~5B（CogVideoX） | 25–30GB | ⚠️（T5 需 offload） | 否（SAT 走 SDPA）✓ | SAT 框架 CUDA 耦合 | 无 | **3.0.0 硬依赖** ✗ | 无 | **Hard** | 50–100s/6s | 无 | triton + SAT 框架 + 大模型 offload |
| 8 | Hallo2 | ~4.2B | 9–10GB | ✅ | 否（diffusers SDPA）✓ | 仅 4K 超分子模块 | 无 | 无 | 无 | **Medium** | 15–40s/100 帧 | 无 | CodeFormer 4K 超分 CUDA ops（可选） |
| 9 | LatentSync | 1–2B | 3–5GB | ✅（8GB 即可） | 否（diffusers SDPA）✓ | 无 | 无 | 无 | 无 | **Easy** | 1–3s/16 帧窗口 | 无 | 仅 SDPA backend 探测，纯 diffusers |
| 10 | Sonic | ~1.5B（SVD） | 3–4GB | ✅（32G 即可） | 否（diffusers SDPA）✓ | 无 | 无 | 无 | 无 | **Medium** | 60–120s/5s | 无 | 扩散多步去噪慢 + 非商用许可 |
| 11 | MuseTalk | ~860M | 1–2GB | ✅（4GB 即可） | 无 | 无 | 无 | 无 | 无 | **Medium** | 30fps+ 实时 | **官方拒绝** | MMLab 生态（mmcv/mmdet/mmpose）CUDA op |
| 12 | SadTalker | <1GB | <1GB | ✅ | 无 | GFPGAN（有 fallback） | 无 | 无 | 无 | **Easy** | <10s/10s 视频 | 无 | PyTorch 1.12→2.9 版本跨度 |
| 13 | LivePortrait | ~200–400MB | 200–400MB | ✅ | 无 | Animals 模式有 CUDA op | 无 | 无 | 无 | **Medium**（Humans） | 30fps+ 实时 | 无 | onnxruntime-gpu + Animals 模式 CUDA op |

## 详细分析

### 组 1：Talking Body 大模型（3 个）

#### 1. SoulX-FlashTalk 14B — Hard

**证据来源**：
- GitHub: https://github.com/Soul-AILab/SoulX-FlashTalk
- HuggingFace: https://huggingface.co/Soul-AILab/SoulX-FlashTalk-14B
- 论文: https://arxiv.org/abs/2512.23379

**分析**：营销称 14B 但实际 18.88B，bf16 DiT 37.76GB + 辅助共 54.46GB，超出 32GB HBM。官方 `--cpu_offload` 仍需 40GB VRAM，必须 int8 量化（optimum-quanto → ~19GB 可全驻留）或激进层级 offload。CUDA 依赖：flash_attn 有 SDPA fallback ✓，但 **xformers 硬依赖无 fallback**（`multitalk_attention.py` 的 `memory_efficient_attention` + `BlockDiagonalMask` 需手写 SDPA 等价），**xfuser 无条件 import** 需 stub。无 triton/无自定义 CUDA kernel/无 bitsandbytes 是利好。无人在 NPU 跑过。预估单卡 910B + 激进 offload 每 33 帧 chunk 10–30 秒（离线可用，非实时；int8 全驻留可能降到 3–8 秒/chunk）。

#### 2. LongCat-Video-Avatar-1.5 — Very Hard

**证据来源**：
- GitHub: https://github.com/meituan-longcat/LongCat-Video
- HuggingFace: https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5
- 主页: https://meigen-ai.github.io/LongCat-Video-Avatar-1.5-Page/

**分析**：DiT ~14.8B，bf16 ~33GB 超 32GB HBM，但 **INT8 ~18GB 可入 HBM**（INT8 纯 PyTorch 自实现，无 bitsandbytes ✓）。**核心障碍是 Triton BSA kernel**：`@triton.jit` + 硬编码 `backend=="cuda"` + Hopper TMA + `device="cuda"`，NPU Triton 支持不成熟，只能关闭 `enable_bsa` fallback（显著降效）或重写 kernel。flash_attn 需 fallback 到 SDPA 且需验证数值一致性（3D RoPE + BSA + reference skip attention 结构复杂）。xformers 路径不可用作 NPU fallback。无 NPU 先例。预估 INT8 + 8 步蒸馏 + 关闭 BSA 约 2–5 分钟/段（需实测）。

#### 3. InfiniteTalk — Medium ⭐（有现成 NPU fork）

**证据来源**：
- GitHub: https://github.com/MeiGen-AI/InfiniteTalk
- HuggingFace: https://huggingface.co/MeiGen-AI/InfiniteTalk
- 论文: https://arxiv.org/abs/2508.14033
- **NPU 适配 fork**: https://github.com/rockie/InfiniteTalk-Ascend

**分析**：≈14B（Wan2.1-I2V-14B 底座），bf16 ~30–34GB 接近 32GB 上限，需 `--num_persistent_param_in_dit 0` offload 或 `--quant fp8`（≈15GB）。CUDA 依赖：flash_attn try/except 可选有 SDPA fallback ✓，**无 triton** ✓，无 bitsandbytes（用 optimum-quanto）✓，xformers 硬依赖但单卡 `attn_bias=None` 时 SDPA 语义等价可直接换。**已有严肃 NPU 适配**：`rockie/InfiniteTalk-Ascend` 含 `wan/_npu_adapter/`（device.py/attention_dispatch.py/amp_shim.py/xfuser_stub.py 等 6 文件）+ `requirements-npu.txt`，当前仅单卡 MVP，多卡 HCCL 为 Phase 2 未完成。旁证：Wan2.1-T2V-14B 已在 910B 跑通（CSDN/昇腾社区）。预估 480P 5s 视频 40 steps：bf16+offload 8–15 分钟，fp8 + 8 步蒸馏 3–5 分钟。

---

### 组 2：Wan 基座 Talking Head（3 个）

#### 4. FeatherTalk — Easy ⭐（最轻量）

**证据来源**：
- GitHub: https://github.com/anliyuan/FeatherTalk（权重存仓库内）

**分析**：极小。视觉 UNet 5.46M + FeatherHuBERT 3.36M + SCRFD/PFLD ≈ 3.5M，推理总权重 **≈27MB**。32GB HBM 绰绰有余，甚至可纯 CPU 运行（README 明确声明）。CUDA 依赖极浅：无 flash_attn（手写 `nn.Linear+torch.softmax`）、无 CUDA kernel、无 triton、无 bitsandbytes、无 xformers、无 accelerate/diffusers/transformers。`torch.cuda.*` 仅用于 device 选择（3 处文件），requirements.txt 仅 8 个包。已内置 MPS fallback，说明作者已考虑非 CUDA 后端。仅需 device 选择加 npu 分支（3 文件约 5-10 行）+ `import torch_npu`。预估 60s 音频端到端数十秒级，瓶颈在 I/O 而非 NPU 计算。

#### 5. SoulX-FlashHead Pro/Lite — Easy→Medium

**证据来源**：
- GitHub: https://github.com/Soul-AILab/SoulX-FlashHead
- 论文: https://arxiv.org/pdf/2602.07449
- 权重: https://huggingface.co/Soul-AILab/SoulX-FlashHead-1_3B
- **同团队 NPU 适配先例**：GitCode "SoulX-Podcast-1.7B 昇腾Ascend NPU 适配版本"

**分析**：基座 1.3B（Wan2.1 DiT），bf16 核心权重 ≈2.6GB，加辅助估 4-6GB，32GB HBM 宽裕。flash_attn/sageattn **有完整 SDPA fallback 链**（sage→flash3→flash2→else SDPA）✅，VAE 用 SDPA ✅，无 bitsandbytes/无 triton/无自定义 CUDA kernel。**xfuser 是硬 import**（非 try/except）⚠️ 需 patch 成 try/except（单卡 `dist.is_initialized()=False` 不调用可绕过）。**强正相关**：代码直接复用 Wan（`flash_head/wan/modules/vae.py` 顶部 "Copyright 2024-2025 The Alibaba Wan Team Authors"），同团队 SoulX-Podcast-1.7B 已有昇腾 NPU 适配版本。单卡 Easy，多卡 Medium（需 NCCL→HCCL + xfuser 替换）。预估 Pro 1-3 分钟/次，Lite 可达实时级。

#### 6. EchoMimicV3 Flash — Easy ⭐（CUDA 依赖最干净）

**证据来源**：
- GitHub: https://github.com/antgroup/echomimic_v3（蚂蚁集团，AAAI 2026）
- 论文: https://arxiv.org/abs/2507.03905
- 权重: https://huggingface.co/BadToBest/EchoMimicV3/tree/main/echomimicv3-flash-pro
- Base: https://huggingface.co/alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP

**分析**：核心 1.3B（论文 "1.3B Parameters are All You Need"），Flash 官方声明仅需 12G VRAM（8 步、768×768），32GB HBM 完全放下。flash_attn **try/except 自动降级 SDPA** ✅，VAE 用 SDPA ✅，无自定义 CUDA kernel/triton/cuDNN/bitsandbytes/xformers。**xfuser/pai_fuser 为 try/except 可选**（单卡 ulysses=ring=1 不需要）✅。仅 CUDA 字符串级硬编码：`import torch.cuda.amp`、`assert q.device.type=='cuda'`、`device="cuda"`、`@amp.autocast('cuda')`、`dist.init_process_group("nccl")`。`wan_transformer3d_audio_2512.py` 第 1 行注释 "Modified from Wan-Video/Wan2.1"，全套 `wan_*` 模块，**与我们 Wan2.2 经验同源**。Flash 模式无需 face mask → retina-face/tensorflow 预处理可绕过。预估 1-3 分钟/次。

---

### 组 3：扩散类 Talking Head（3 个）

#### 7. Hallo3 — Hard

**证据来源**：
- GitHub: https://github.com/fudan-generative-vision/hallo3（1.4k stars，CVPR 2025）
- HuggingFace: https://huggingface.co/fudan-generative-ai/hallo3
- 论文: https://arxiv.org/abs/2412.00733
- SAT attention 源码: https://github.com/THUDM/SwissArmyTransformer/blob/main/sat/transformer_defaults.py

**分析**：基于 CogVideoX-5B I2V 微调，总推理权重 ≈ 25–30GB，32GB HBM 紧张需 T5-XXL (~10GB) CPU offload。attention 路径走 SDPA（SAT `attention_fn_default` 在 PyTorch ≥ 2.0 用 `F.scaled_dot_product_attention`）✓，无 flash_attn/xformers/bitsandbytes。**最大障碍：triton==3.0.0 硬依赖**（NPU 无 triton，SAT/deepspeed 可能用 triton JIT 编译 kernel，需确认推理路径是否触发）+ **SAT 框架 CUDA 耦合**（`sat.mpu.get_cuda_rng_tracker`、`ColumnParallelLinear`）+ deepspeed + jax 依赖。6+ 处 `.to("cuda")` 需替换。预估 50–100s/6s 视频。需实际 `import` 测试确认 triton 是否在推理时被调用。

#### 8. Hallo2 — Medium

**证据来源**：
- GitHub: https://github.com/fudan-generative-vision/hallo2（3737 stars，ICLR 2025）
- HuggingFace: https://huggingface.co/fudan-generative-ai/hallo2
- 论文: https://arxiv.org/abs/2410.07718

**分析**：核心 net.pth 4.85GB（fp16）+ SD1.5 UNet ~3GB + 辅助，总推理显存 9–10GB，32GB HBM 绰绰有余无需 offload。无 flash_attn（diffusers `Attention` 默认 SDPA）✓，无 triton ✓。**仅 CodeFormer 4K 超分子模块有 CUDA ops**（`basicsr/ops/dcn`、`fused_act`、`upfirdn2d` 三组 .cu kernel），但**仅被 `scripts/video_sr.py`（4K 超分）调用**，核心 talking head 推理路径不触及任何 CUDA kernel。bitsandbytes/xformers 声明在 requirements 但推理路径不使用。核心推理链全部纯 diffusers + PyTorch，仅 1 处 `torch.device("cuda")` 硬编码。预估 15–40s/100 帧，1 分钟视频 4–8 分钟（不含 4K 超分）。

#### 9. LatentSync — Easy ⭐（纯 diffusers 最干净）

**证据来源**：
- GitHub: https://github.com/bytedance/LatentSync（6.1k stars）
- HuggingFace: https://huggingface.co/ByteDance/LatentSync-1.6
- 论文: https://arxiv.org/abs/2412.09262

**分析**：基于 AnimateDiff + SD UNet3D，总推理权重 3–5GB，最小 VRAM 8GB (v1.5) / 18GB (v1.6)，32GB HBM 极其轻松。requirements.txt 非常干净：`torch==2.5.1`, `diffusers==0.32.2`, `transformers==4.48.0`, `accelerate==0.26.1`, `DeepCache==0.1.1`, `onnxruntime-gpu==1.21.0`。无 flash_attn/无自定义 CUDA kernel/无 triton/无 bitsandbytes/无 xformers。`lipsync_pipeline.py` 是标准 `DiffusionPipeline` 子类，全部用 diffusers + PyTorch API，仅 1 处 `device="cuda"`。纯 PyTorch 程度极高。仅需 4 步：`import torch_npu` + `device="cuda"→"npu"` + `onnxruntime-gpu→onnxruntime`（CPU EP）+ 强制 SDPA backend。预估 1–3s/16 帧窗口，1 分钟视频 2–5 分钟。

---

### 组 4：经典 Talking Head（4 个）

#### 10. Sonic — Medium

**证据来源**：
- GitHub: https://github.com/jixiaozhong/Sonic（3.3k stars，CVPR 2025）
- HuggingFace: https://huggingface.co/LeonJoe13/Sonic
- 论文: CVPR 2025, "Sonic: Shifting Focus to Global Audio Perception in Portrait Animation"

**分析**：基座 SVD-XT ~1.5B，总权重 3–4GB，README 明确 "tested on a single 32G GPU"，32GB HBM 充足。依赖栈非常干净：`diffusers==0.29.0 + torch==2.2.1 + transformers==4.43.2`，无 flash_attn/bitsandbytes/xformers/自定义 CUDA kernel/triton。RIFE flownet 和 yoloface 均纯 PyTorch。无人公开在 NPU 跑过。风险：diffusers SVD pipeline 内部可能硬编码 CUDA 行为需验证；扩散多步去噪导致推理慢（25 steps）；**非商业许可**（CC BY-NC-SA-4.0）。预估 60–120s/5s 视频。

#### 11. MuseTalk — Medium

**证据来源**：
- GitHub: https://github.com/TMElyralab/MuseTalk（6.5k stars）
- HuggingFace: https://huggingface.co/TMElyralab/MuseTalk
- **昇腾 issue**: https://github.com/TMElyralab/MuseTalk/issues/46

**分析**：核心 UNet 借自 SD-v1.4（~860M），单步 inpainting 非扩散，总权重 1–2GB，4GB VRAM 即可跑。无 flash_attn/bitsandbytes/xformers。**官方明确拒绝昇腾支持**（issue #46，itechmusic 2024-04-30 回复 "不太熟悉昇腾平台，暂时没有这个计划"）。**主要障碍是 MMLab 生态**（mmcv==2.0.1 + mmdet==3.1.0 + mmpose==1.1.0，用于预处理人脸检测/姿态估计，常含 CUDA 编译 op）+ tensorflow==2.12.0（syncnet 训练，推理可能可避开）。核心 UNet 单步推理纯 PyTorch 非常轻量。预估可实时 30fps+（预处理一次性完成后逐帧极快）。

#### 12. SadTalker — Easy ⭐（最经典最易跑通）

**证据来源**：
- GitHub: https://github.com/OpenTalker/SadTalker（14.1k stars，CVPR 2023）
- HF Space: https://huggingface.co/spaces/vinthony/SadTalker
- 论文: CVPR 2023, arXiv 2211.12194

**分析**：3DMM 方法，模型 <1GB，总权重 <1GB 完全放入 HBM。无 flash_attn/bitsandbytes/xformers/triton。GFPGAN 可能含 CUDA op 但通常有 PyTorch fallback，facexlib/basicsr/kornia 可能含 CUDA op 但有纯 PyTorch 路径，face-vid2vid (PIRender) 纯 PyTorch，Deep3DFaceReconstruction 渲染部分可能用 CUDA 但推理时 3DMM 系数已预计算。3DMM 是最经典 talking head，纯 PyTorch 为主社区有大量移植经验。主要工作：`torch.cuda→torch.npu` + PyTorch 1.12→2.9 版本升级 + GFPGAN/facexlib device 适配。预估 <10s/10s 视频（远快于扩散方法）。生成质量相对较低（3DMM 固有限制）。

#### 13. LivePortrait — Medium

**证据来源**：
- GitHub: https://github.com/KlingAIResearch/LivePortrait（19k stars，原 `KwaiVGI` 已迁移）
- HuggingFace: https://huggingface.co/KlingTeam/LivePortrait
- 论文: arXiv 2407.03168

**分析**：Warping 方法（FOMM-based），模型 200–400MB，完全放入 HBM。无 flash_attn/bitsandbytes/xformers/triton。**关键依赖 onnxruntime-gpu==1.18.0**（insightface 人脸检测）。**Humans 模式纯 PyTorch + ONNX Runtime，支持 macOS Apple Silicon（MPS）**说明对 device 抽象良好；**Animals 模式需 X-Pose 的 `MultiScaleDeformableAttention` CUDA 编译 op**（`python setup.py build install`）。Humans 模式 Medium：核心 warping 纯 PyTorch，障碍是 onnxruntime-gpu（方案 A 替换 CPU EP 预处理走 CPU 核心走 NPU；方案 B CANN EP）。Animals 模式 Hard。`torch.compile` 加速选项 NPU 不可用。预估 Humans 模式可实时 30fps+。

---

## 推荐优先尝试排序（从易到难）

### Tier 1 — 立即可尝试（Easy，预估 1–3 天跑通）

| 优先级 | 模型 | 理由 |
|--------|------|------|
| 🥇 | **EchoMimicV3 Flash** | CUDA 依赖最干净，flash_attn 自动降级，xfuser try/except 可选，仅字符串级 patch。基于 Wan2.1-1.3B 与我们 Wan2.2 经验同源。12G VRAM 即可。 |
| 🥈 | **FeatherTalk** | 最轻量（27MB），纯 PyTorch 无任何 CUDA-specific 依赖，仅需 device 选择 patch。与 Wan 经验无关但更简单。 |
| 🥉 | **LatentSync** | 纯 diffusers 最干净，requirements 仅 6 包，无任何第三方 CUDA。与我们 Wan2.2 patch 经验几乎一一对应。 |
| 4 | **SadTalker** | 3DMM 最经典，<1GB 纯 PyTorch，无 ONNX/扩散/CUDA kernel。先跑通验证流程。质量较低但最易。 |
| 5 | **SoulX-FlashHead**（单卡） | 复用 Wan VAE+DiT 同源，flash_attn 有完整 SDPA fallback 链。仅 xfuser 硬 import 需 patch 成 try/except。同团队已有 NPU 适配先例。 |

### Tier 2 — 中等难度（Medium，预估 3–7 天）

| 优先级 | 模型 | 理由 |
|--------|------|------|
| 6 | **InfiniteTalk** ⭐ | **已有 `rockie/InfiniteTalk-Ascend` 现成 NPU 适配层可借鉴**，风险最低的 talking body。底座与 Wan2.2 同源，无 triton/无 bitsandbytes。建议首发 talking body。 |
| 7 | **Hallo2** | 核心推理纯 diffusers，9–10GB 全驻 HBM。仅 4K 超分有 CUDA ops（可选跳过）。 |
| 8 | **LivePortrait**（Humans） | 核心纯 PyTorch 且支持 MPS，仅 onnxruntime-gpu 需 CPU fallback。实时高质量。 |
| 9 | **MuseTalk** | 核心单步推理轻量，但 MMLab 生态 CUDA op 适配工作量大。官方明确不支持。 |
| 10 | **Sonic** | 代码最干净（纯 diffusers）但扩散多步去噪慢，非商用许可。 |

### Tier 3 — 困难（Hard，预估 1–2 周）

| 优先级 | 模型 | 理由 |
|--------|------|------|
| 11 | **SoulX-FlashTalk 14B** | 无 triton/无自定义 kernel，但实际 18.88B 显存更大，xformers + xfuser 两层 CUDA 库。攻克 InfiniteTalk 的 xformers→SDPA 后可复用。 |
| 12 | **Hallo3** | triton + SAT 框架 CUDA 耦合 + 大模型 offload。需先验证 triton 是否在推理路径实际触发。 |

### Tier 4 — 极困难（Very Hard，预估 2+ 周）

| 优先级 | 模型 | 理由 |
|--------|------|------|
| 13 | **LongCat-Video-Avatar-1.5** | Triton BSA kernel 硬编码 CUDA 是核心效率特性。先验证关闭 BSA 的 fallback 路径能否跑通再谈效率。 |

---

## torch_npu 适配通用经验和注意事项

### 1. 已验证的 8 条 patch 模式（来自 Wan2.2-S2V-14B 成功案例）

| # | patch | 适用场景 | 本次调研适用模型 |
|---|-------|----------|------------------|
| 1 | `torch.cuda.*` → `torch.npu.*` 字符串替换 | 所有 CUDA-based 模型 | 全部 13 个 |
| 2 | `import torch_npu` 添加 | 所有模型入口 | 全部 13 个 |
| 3 | NCCL → HCCL 分布后端 | 多卡分布式 | InfiniteTalk/SoulX-FlashTalk/LongCat（多卡） |
| 4 | `flash_attention` → SDPA fallback | NPU 无 flash_attn 包 | SoulX-FlashTalk/LongCat/InfiniteTalk/SoulX-FlashHead/EchoMimicV3 |
| 5 | `device_map='auto'` + `max_memory` 分阶段加载 | 大模型超 HBM | SoulX-FlashTalk/Hallo3/InfiniteTalk |
| 6 | VAE dtype fix + dtype assert → .float() cast | VAE 数值稳定性 | 所有扩散模型（Wan 系尤甚） |
| 7 | empty_cache before VAE decode | 显存回收 | 所有扩散模型 |
| 8 | Skip .to(device)/.cpu() for accelerate-managed models | accelerate 托管 | 使用 accelerate 的模型 |

### 2. CUDA 专用库的 NPU 替代方案

| CUDA 专用库 | NPU 状态 | 替代方案 | 影响模型 |
|-------------|----------|----------|----------|
| **flash_attn** | ❌ 无包 | SDPA（`F.scaled_dot_product_attention`），torch_npu 2.9.0 支持 | SoulX-FlashTalk/LongCat/InfiniteTalk/SoulX-FlashHead/EchoMimicV3 |
| **xformers** | ❌ CUDA-only | SDPA（单卡 `attn_bias=None` 时语义等价；多卡 `BlockDiagonalMask` 需手写） | SoulX-FlashTalk/InfiniteTalk/LongCat |
| **triton** | ⚠️ 不成熟 | 纯 PyTorch 算子重写，或关闭对应功能 fallback | LongCat（BSA kernel）/Hallo3（SAT） |
| **bitsandbytes** | ❌ CUDA-only | optimum-quanto（纯 PyTorch） | 无模型硬依赖（利好） |
| **xfuser** | ❌ CUDA-only | try/except 包裹（单卡不调用），多卡需替换 | SoulX-FlashTalk（硬 import）/SoulX-FlashHead（硬 import）/EchoMimicV3（try/except ✓） |
| **onnxruntime-gpu** | ⚠️ CUDA EP 不可用 | CPUExecutionProvider（预处理走 CPU）或 CANN EP | LivePortrait/LatentSync/MuseTalk |
| **MMLab (mmcv/mmdet/mmpose)** | ⚠️ 含 CUDA 编译 op | CPU 预处理或 NPU 兼容版本 | MuseTalk |
| **SAT (SwissArmyTransformer)** | ⚠️ `sat.mpu` CUDA 耦合 | monkey-patch mpu 模块 | Hallo3 |
| **deepspeed** | ⚠️ 训练框架 | 推理路径可能可跳过 | Hallo3 |

### 3. 显存策略（32GB HBM + 64GB CPU）

| 模型大小 | 策略 | 适用模型 |
|----------|------|----------|
| <10GB | 全驻留 HBM，无需 offload | FeatherTalk/SadTalker/LivePortrait/MuseTalk/LatentSync/Sonic/Hallo2 |
| 10–32GB | 全驻留 HBM，注意激活值 | EchoMimicV3/SoulX-FlashHead |
| 32–40GB | fp8/int8 量化全驻留，或 bf16 + 层级 offload | InfiniteTalk（fp8 ~15GB）/LongCat（INT8 ~18GB） |
| >40GB | 必须 int8 量化 + 激进 offload | SoulX-FlashTalk（int8 ~19GB）/Hallo3（T5 offload） |

### 4. 通用注意事项

1. **diffusers SDPA backend 探测**：diffusers 初始化 UNet 时根据设备探测 attention backend，`"npu"` 可能不在识别列表，会 fallback 到 `math`（极慢）。**务必强制** `attn_implementation="sdpa"` 或 `set_attn_processor(AttnProcessor2_0())`。影响：所有 diffusers 模型。
2. **`assert q.device.type=='cuda'`**：多处代码有此断言，需放宽为 `'npu'` 或删除。影响：EchoMimicV3/InfiniteTalk。
3. **`torch.cuda.amp` / `@amp.autocast('cuda')`**：需改为 `torch.npu.amp` / `'npu'`，torch_npu 2.9.0 通常已映射但需验证。影响：SoulX-FlashHead/EchoMimicV3。
4. **bf16 优于 fp16**：NPU 910B 原生支持 bf16，性能优于 fp16。建议 `torch.bfloat16`，需验证 VAE decode 数值稳定性。
5. **ONNX 预处理走 CPU**：insightface/face-parse 等预处理 ONNX 模型用 CPUExecutionProvider，一次性预处理开销可接受（30–60s/分钟视频）。
6. **多卡分布式是未就绪区**：HCCL + 序列并行需重写，本次调研所有多卡场景均未就绪。**建议全部走单卡离线推理**。
7. **`torch.compile` NPU 兼容存疑**：SoulX-FlashTalk/LivePortrait 用到，NPU 上可能不可用，需禁用或验证。
8. **jax 依赖**：Hallo3 的 `jax==0.4.36` 在 NPU 环境安装困难（jaxlib 需 CUDA/TPU backend），需确认是否仅可选依赖。

### 5. 高效适配工作流建议

1. **先跑通最小模型验证环境**：FeatherTalk（27MB）或 SadTalker（<1GB）先跑通，验证 torch_npu + CANN 基础设施。
2. **复用 Wan 经验优先攻同源模型**：EchoMimicV3 Flash / SoulX-FlashHead（Wan2.1-1.3B）patch 经验直接套用。
3. **借鉴现成 NPU fork**：InfiniteTalk 有 `rockie/InfiniteTalk-Ascend`，直接参考 `_npu_adapter/` 层。
4. **预处理与核心分离**：ONNX/MMLab 预处理走 CPU，核心扩散/DiT 走 NPU。
5. **显存先 int8 再 offload**：int8 量化（optimum-quanto）全驻留 HBM 优于 bf16 + offload（避免 PCIe 换页）。
6. **单卡优先**：多卡 HCCL/序列并行均未就绪，单卡离线推理是现实路径。

---

## Contrarian Views & Risks

1. **"有 NPU fork 不等于能跑"**：InfiniteTalk 的 `rockie/InfiniteTalk-Ascend` 是单卡 MVP，多卡 Phase 2 未完成，且未发布推理结果证据。需实际验证而非盲信。
2. **"同源 Wan 不等于零成本"**：EchoMimicV3/SoulX-FlashHead 基于 Wan2.1，我们跑通的是 Wan2.2-S2V-14B。Wan2.1 vs Wan2.2 架构差异（尤其 VAE 和 DiT 细节）可能引入新问题，patch 不能 100% 照搬。
3. **"纯 PyTorch 不等于 Easy"**：SadTalker 虽纯 PyTorch，但 PyTorch 1.12→2.9 跨度巨大，API 变化（`torch.fft`、`torch.cuda.amp`、`torch.load` 等）可能引发连锁修复。
4. **"diffusers 干净不等于无坑"**：LatentSync/Sonic 纯 diffusers，但 diffusers 版本（0.29/0.32）与 torch_npu 2.9.0 的兼容性未验证，diffusers 内部可能假设 CUDA 设备。
5. **"关闭 BSA 不等于可用"**：LongCat 关闭 Triton BSA fallback 路径能否跑通未验证，可能存在其他 CUDA 硬编码。

---

## Open Questions

1. **torch_npu 2.9.0 对 `GroupNorm/SiLU/GELU/nn.Upsample(bilinear)` 的覆盖**：FeatherTalk 依赖这些通用算子，CANN 8.5 理应支持但需实测。
2. **diffusers 0.29/0.32 与 torch_npu 2.9.0 兼容性**：LatentSync/Sonic/Hallo2 依赖 diffusers，需验证 UNet3D/SVD pipeline 在 NPU 设备上的行为。
3. **SAT 框架推理路径是否触发 triton JIT**：Hallo3 的 triton 依赖是否在推理时实际调用，需 `import` 测试确认。
4. **optimum-quanto int8 在 NPU 的数值精度**：SoulX-FlashTalk/LongCat 依赖 int8 量化，需验证与 bf16 的质量差异。
5. **`rockie/InfiniteTalk-Ascend` 的实际推理结果**：是否有产出视频质量证据，还是仅代码框架。
6. **CANN EP for ONNX Runtime**：LivePortrait/MuseTalk 的 ONNX 预处理能否用 CANN EP 走 NPU 而非 CPU，减少预处理开销。

---

## Sources

### 组 1：Talking Body 大模型
1. https://github.com/Soul-AILab/SoulX-FlashTalk — SoulX-FlashTalk 官方 repo — Tier 1
2. https://huggingface.co/Soul-AILab/SoulX-FlashTalk-14B — HF 模型卡 — Tier 1
3. https://arxiv.org/abs/2512.23379 — SoulX-FlashTalk 论文 — Tier 1
4. https://github.com/meituan-longcat/LongCat-Video — LongCat 官方 repo — Tier 1
5. https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5 — HF 模型卡 — Tier 1
6. https://meigen-ai.github.io/LongCat-Video-Avatar-1.5-Page/ — LongCat 主页 — Tier 1
7. https://github.com/MeiGen-AI/InfiniteTalk — InfiniteTalk 官方 repo — Tier 1
8. https://huggingface.co/MeiGen-AI/InfiniteTalk — HF 模型卡 — Tier 1
9. https://arxiv.org/abs/2508.14033 — InfiniteTalk 论文 — Tier 1
10. https://github.com/rockie/InfiniteTalk-Ascend — **InfiniteTalk NPU 适配 fork** — Tier 1

### 组 2：Wan 基座 Talking Head
11. https://github.com/anliyuan/FeatherTalk — FeatherTalk 官方 repo — Tier 1
12. https://github.com/Soul-AILab/SoulX-FlashHead — SoulX-FlashHead 官方 repo — Tier 1
13. https://arxiv.org/pdf/2602.07449 — SoulX-FlashHead 论文 — Tier 1
14. https://huggingface.co/Soul-AILab/SoulX-FlashHead-1_3B — HF 权重 — Tier 1
15. https://github.com/antgroup/echomimic_v3 — EchoMimicV3 官方 repo（蚂蚁集团） — Tier 1
16. https://arxiv.org/abs/2507.03905 — EchoMimicV3 论文 — Tier 1
17. https://huggingface.co/BadToBest/EchoMimicV3/tree/main/echomimicv3-flash-pro — HF 权重 — Tier 1
18. https://huggingface.co/alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP — EchoMimicV3 base — Tier 1

### 组 3：扩散类 Talking Head
19. https://github.com/fudan-generative-vision/hallo3 — Hallo3 官方 repo — Tier 1
20. https://huggingface.co/fudan-generative-ai/hallo3 — HF 模型卡 — Tier 1
21. https://arxiv.org/abs/2412.00733 — Hallo3 论文 — Tier 1
22. https://github.com/THUDM/SwissArmyTransformer — SAT 框架源码 — Tier 1
23. https://github.com/fudan-generative-vision/hallo2 — Hallo2 官方 repo — Tier 1
24. https://huggingface.co/fudan-generative-ai/hallo2 — HF 模型卡 — Tier 1
25. https://arxiv.org/abs/2410.07718 — Hallo2 论文 — Tier 1
26. https://github.com/bytedance/LatentSync — LatentSync 官方 repo（字节跳动） — Tier 1
27. https://huggingface.co/ByteDance/LatentSync-1.6 — HF 模型卡 — Tier 1
28. https://arxiv.org/abs/2412.09262 — LatentSync 论文 — Tier 1

### 组 4：经典 Talking Head
29. https://github.com/jixiaozhong/Sonic — Sonic 官方 repo（腾讯） — Tier 1
30. https://huggingface.co/LeonJoe13/Sonic — HF 模型卡 — Tier 1
31. https://github.com/TMElyralab/MuseTalk — MuseTalk 官方 repo（腾讯音乐） — Tier 1
32. https://huggingface.co/TMElyralab/MuseTalk — HF 模型卡 — Tier 1
33. https://github.com/TMElyralab/MuseTalk/issues/46 — **MuseTalk 昇腾支持官方拒绝 issue** — Tier 1
34. https://github.com/OpenTalker/SadTalker — SadTalker 官方 repo — Tier 1
35. https://huggingface.co/spaces/vinthony/SadTalker — HF Space — Tier 1
36. https://github.com/KlingAIResearch/LivePortrait — LivePortrait 官方 repo（快手） — Tier 1
37. https://huggingface.co/KlingTeam/LivePortrait — HF 模型卡 — Tier 1

### 通用参考
38. https://github.com/rockie/InfiniteTalk-Ascend — NPU 适配参考实现 — Tier 1
39. GitCode SoulX-Podcast-1.7B 昇腾 NPU 适配版本 — 同团队 NPU 先例 — Tier 2