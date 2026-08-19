# 云 GPU 方案调研：免费额度 + 付费租用

> **调研日期**：2026-08-13（2026-08-15 更新：Lightning AI 免费额度性质修正）
> **目标**：在 M2 Pro 32GB + GTX 1080 8GB 无法运行高质量数字人模型的情况下，寻找成本最低的 GPU 方案
> **核心结论**：Kaggle（30h/周，周期性刷新）是主力免费方案；Lightning AI 免费额度是一次性的（用完就没了），作为备选；AutoDL 付费是最低成本方案

---

## 1. 本地设备现状

| 设备 | GPU | 显存 | CUDA | 能跑模型 |
|------|-----|------|------|---------|
| MacBook Pro M2 Pro | Apple M2 Pro (MPS) | 32GB 统一内存 | ❌ 无 CUDA | Hallo2 (256px, MIT), LatentSync 1.5 (256px) |
| Windows PC | NVIDIA GTX 1080 | 8GB GDDR5X | ✅ CUDA 11.x (算力 6.1) | LatentSync 1.5, HeyGem Lite, SadTalker, Wav2Lip |

> GTX 1080 是 2016 年 Pascal 架构，支持 CUDA 11.x 但不支持 CUDA 12.x。大多数数字人模型要求 CUDA 12.1+，需要检查兼容性。
> **两台设备都无法运行高质量模型**（Sonic 12GB, LatentSync 1.6 18GB, Hallo2 20GB+ 等）。

---

## 2. 免费 GPU 服务（推荐：先薅羊毛）

### 2.1 Lightning AI ⭐⭐ 备选（免费额度一次性）

| 项目 | 详情 |
|------|------|
| **网址** | https://lightning.ai/ |
| **注册** | Google 或 GitHub 账号，不需要信用卡 |
| **免费额度** | 5 credits 初始 + 25 credits 绑卡后（共 ~$30），**一次性**，用完就没了 |
| **限制** | 4h 自动重启；同时 1 个 Studio；免费方案无法创建 App（仅 Studio） |
| **注意** | 免费额度是 **"to start"** 一次性起始额度，不是周期性刷新 |
| **当前状态** | 账号显示 5.00 credits；"New App" 功能返回 403（免费方案限制） |

**可用 GPU 及免费时长**：

| GPU | 显存 | 价格 | 免费时长 | 能跑模型 |
|-----|------|------|---------|---------|
| T4 | 16GB | $0.42/h | 75h | Sonic ✅, PersonaLive ✅, V-Express ✅ |
| L4 | 24GB | $0.48/h | 31h | **LatentSync 1.6 ✅, Hallo2 ✅** |
| L40S | 48GB | $2.14/h | 5h | + JoyVASA ✅ |
| A100 40GB | 40GB | $2.19/h | 10h | + JoyVASA ✅ |
| A100 80GB | 80GB | $2.71/h | 5h | **全部含 Hallo3** ✅ |
| H100 80GB | 80GB | $4.50/h | 0h | 需付费 |
| H200 141GB | 141GB | $6.53/h | 3h | 全部 ✅ |

> ⚠️ GPU 都是 **NVIDIA** 产品（T4/L4/L40S/A100/H100），不是 Google TPU。完整 CUDA 支持。

### 2.2 Google Colab

| 项目 | 详情 |
|------|------|
| **网址** | https://colab.research.google.com/ |
| **注册** | Google 账号即可，无需额外注册 |
| **免费 GPU** | T4 16GB |
| **免费时长** | 不固定，约 12h/天，随时可能断连 |
| **限制** | 长时间不操作会回收；免费层无 A100 |

| 层级 | 价格 | GPU | 显存 | 说明 |
|------|------|-----|------|------|
| Free | $0 | T4 | 16GB | 随时断连，~12h/天 |
| Pro | $10/月 | T4 + P100 | 16GB | 更多时长，不超 16GB |
| Pro+ | $50/月 | A100 | **40GB** | 优先排队，唯一超 16GB 的选项 |

> **注意**：Colab Pro ($10/月) 和 Google One AI Premium / Gemini Advanced ($20/月) 是**不同产品**。Gemini Advanced 不包含 Colab Pro+，要超过 16GB VRAM 必须订阅 Colab Pro+ ($50/月)。

### 2.3 Kaggle ⭐⭐⭐ 最推荐（周期性刷新）

| 项目 | 详情 |
|------|------|
| **网址** | https://www.kaggle.com/ |
| **注册** | Google 账号 + 手机号验证 |
| **免费 GPU** | T4 ×2 (16GB×2), P100 16GB |
| **免费时长** | **30h/周**（每周刷新，长期可用） |
| **限制** | 单次 Notebook 最长 12h；**无付费升级选项**，30h/周是硬上限 |
| **自动化** | 有官方 API/CLI（`pip install kaggle`），可编程创建/推送 Notebook |
| **当前状态** | ✅ 已配置（CLI v2.2.4 + kaggle.json），全链路验证通过 |

### 2.4 轮流使用策略

| 时间 | 平台 | GPU | 能跑模型 |
|------|------|-----|---------|
| 主力（自动化） | Kaggle P100/T4 | 16GB | EchoMimicV3, Sonic, V-Express, LatentSync 1.5 |
| Kaggle 30h 用完 | Colab T4 | 16GB | 交互式调试、快速验证 |
| 需要大显存（>16GB） | AutoDL RTX 4090 | 24GB | LatentSync 1.6, Hallo2（¥1.88/h） |
| 需要 A100 40GB+ | Colab Pro+ | 40GB | Hallo2/3（$50/月） |
| 需要长期高频 | AutoDL 付费 | RTX 4090 24GB | 全部 24GB 以下 |

---

## 3. 付费云 GPU 租用

### 3.1 AutoDL（国内，最便宜）

| 项目 | 详情 |
|------|------|
| **公司** | 视拓云（南京）科技有限公司（中国） |
| **网址** | https://www.autodl.com/ |
| **支付** | 支付宝/微信 |
| **计费** | 按分钟，不需预付 |

**GPU 价格**：

| GPU | 显存 | 价格 | 能跑模型 |
|-----|------|------|---------|
| RTX 2080Ti | 11GB | ¥0.88/h | SadTalker |
| RTX A4000 | 16GB | ¥0.92/h | EchoMimic V2 |
| RTX 3080Ti | 12GB | ¥0.98/h | Sonic, PersonaLive |
| RTX 3090 | 24GB | ¥1.32/h | 24GB 以下全部 |
| RTX 4090 | 24GB | ¥1.88/h | 24GB 以下全部（更快） |
| RTX 5090 | 32GB | ¥2.78/h | 32GB 以下 |
| A800-80GB | 80GB | ¥4.98/h | 全部含 Hallo3 |
| H800 80GB | 80GB | ¥8.88/h | 全部 |

### 3.2 海外平台

| 平台 | GPU | 价格 | 备注 |
|------|-----|------|------|
| Vast.ai (P2P) | RTX 3090 24GB | ~$0.20/h (~¥1.4) | 全球最低价，机器不稳定 |
| Vast.ai | RTX 4090 24GB | ~$0.35/h (~¥2.5) | |
| RunPod | RTX 3090 24GB | $0.50/h (~¥3.5) | 稳定 |
| RunPod | RTX 4090 24GB | $0.69/h (~¥4.9) | 有 Serverless 模板 |
| RunPod | A100 80GB | $1.39/h (~¥10) | |
| RunPod | H100 80GB | $2.89/h (~¥20) | |
| Lightning AI | L4 24GB | $0.48/h (~¥3.4) | 一次性免费额度 |

### 3.3 AutoDL vs Lightning AI GPU 质量对比

> **核心结论：AutoDL GPU 不比 Lightning AI 差，反而更强。**

AutoDL 的 GPU 是**消费级/企业级游戏卡**（RTX 4090/3090），Lightning AI 的 GPU 是**云数据中心卡**（T4/L4）。两者都是 NVIDIA CUDA GPU，但定位不同：

| 维度 | AutoDL RTX 4090 | Lightning AI L4 | AutoDL RTX 3090 |
|------|-----------------|-----------------|-----------------|
| 架构 | Ada (2022) | Ada (2023) | Ampere (2020) |
| 显存 | 24GB GDDR6X | 24GB GDDR6 | 24GB GDDR6X |
| 半精算力 | 165.2 TFLOPS | ~120 TFLOPS | 71 TFLOPS |
| 带宽 | 1008 GB/s | ~300 GB/s | 936 GB/s |
| 价格 | ¥1.88/h | ~¥3.4/h ($0.48) | ¥1.32/h |
| 性价比 | 🏆 最高 | 一般 | 便宜但慢 |

**关键差异**：
- **RTX 4090 比 L4 算力高 ~37%**（165 vs ~120 TFLOPS），带宽高 3 倍以上（1008 vs 300 GB/s），**推理速度更快**
- **RTX 4090 比 L4 便宜 45%**（¥1.88 vs ¥3.4/h）
- AutoDL 的 RTX 4090/3090 是**独享物理机**，性能稳定；Lightning AI 是**虚拟化实例**，可能有邻居噪声
- 两者都完整支持 CUDA 12.x，数字人模型兼容性无差异

**显存不够时的选择**：

| 需求 | 推荐 | 价格 |
|------|------|------|
| ≤12GB（Sonic, EchoMimic） | AutoDL RTX 3080Ti 12GB | ¥0.98/h |
| ≤16GB（LatentSync 1.5, V-Express） | Kaggle T4 16GB（免费） | ¥0 |
| ≤24GB（LatentSync 1.6, Hallo2） | AutoDL RTX 4090 24GB | ¥1.88/h |
| ≤32GB（Hallo2 大分辨率） | AutoDL RTX 5090 32GB | ¥2.78/h |
| ≤48GB（JoyVASA） | AutoDL PRO 6000 48GB | ¥5.98/h |
| ≤80GB（Hallo3） | AutoDL A800-80GB | ¥4.98/h |

### 3.4 成本估算（按每月 4 个视频，每个推理 20 分钟）

| 方案 | 月成本 | 说明 |
|------|--------|------|
| 免费（Kaggle + Colab 轮换） | ¥0 | Kaggle 30h/周 + Colab ~12h/天 |
| AutoDL RTX 4090 | ¥2.5 | 4 × 20min × ¥1.88/h |
| Vast.ai RTX 3090 | ¥1.9 | 4 × 20min × $0.20/h |
| D-ID API | ¥6.8 | 4 × 30s ≈ 2min × ¥3.4/min |
| HeyGen API | ¥14 | 4 × 30s ≈ 2min × ¥7/min |

> 云 GPU 比 API 便宜 3-7 倍，且完全可控。

---

## 4. GPU 硬件澄清

### 4.1 T4/L4/A100 都是 NVIDIA GPU

Lightning AI / Colab / Kaggle 提供的 T4、L4、P100、A100 等**都是 NVIDIA 产品**，不是 Google 自研芯片。

| GPU | 厂商 | 架构 | 年份 | CUDA | 在哪些平台 |
|-----|------|------|------|------|-----------|
| T4 | NVIDIA | Turing | 2018 | ✅ 7.5+ | Colab, Kaggle, Lightning AI |
| L4 | NVIDIA | Ada | 2023 | ✅ 8.9+ | Lightning AI |
| P100 | NVIDIA | Pascal | 2016 | ✅ 6.0+ | Kaggle, Colab Pro |
| A100 | NVIDIA | Ampere | 2020 | ✅ 11+ | Lightning AI, RunPod, AutoDL |
| H100 | NVIDIA | Hopper | 2022 | ✅ 12+ | RunPod, Lightning AI |

Google TPU 是完全不同的芯片（专为 TensorFlow/JAX 设计，不支持 CUDA），Colab/Kaggle 免费层提供的是 NVIDIA GPU，不是 TPU。

### 4.2 GTX 1080 限制

GTX 1080 是 2016 年 Pascal 架构（算力 6.1），8GB GDDR5X：
- ✅ 支持 CUDA 11.x
- ❌ 不支持 CUDA 12.x（大部分新模型需要 12.1+）
- ❌ 不支持 bf16
- ❌ 8GB 显存跑不了 12GB+ 模型

---

## 5. DGX Spark

| 项目 | 详情 |
|------|------|
| **芯片** | GB10 Grace Blackwell Superchip |
| **统一内存** | 128GB LPDDR5x |
| **算力** | ~1 PFLOPS (FP4) |
| **功耗** | ~150W |
| **价格** | $3,999 (~¥28,000) |
| **OS** | Ubuntu 22.04 (NVIDIA DGX OS) |
| **CUDA** | ✅ 完整支持 |

**定位**：本地 AI 开发工作站，适合跑 LLM 推理（DeepSeek 70B、Llama 70B）、LoRA 微调、数字人模型推理。

**优势**：128GB 统一内存能装下所有模型权重（含 Hallo3 80GB），150W 低功耗可放桌面。

**劣势**：LPDDR5x 带宽 273GB/s，推理速度比 RTX 4090（1008GB/s）慢 2-3x。¥28,000 价格高。无二手市场（2025年3月才发布）。

**中国制裁背景**：DGX Spark 的 GB10 芯片算力低于美国出口管制阈值，可在中国合法销售。不是"为绕过制裁而设计"——它本身就在管制线以下。

---

## 6. 本地 GPU 选购参考（验证效果后再考虑）

### 6.1 淘宝/闲鱼 GPU 价格（2026-08-13 实测搜索）

**RTX 3090 24GB**（2022年1月停产，无全新库存）：

| 渠道 | 类型 | 价格 | 质保 | 风险 |
|------|------|------|------|------|
| 淘宝低价 | 魔改/翻新 | ¥1,700-2,700 | 店铺三包 | ⚠️ 高风险 |
| 淘宝正规 | 品牌卡 | ¥2,000-2,700 | 店铺三包 | 可能是翻新 |
| 闲鱼 | 品牌二手 | ¥7,000-8,000 | 无 | 看卖家信用 |
| 闲鱼验货宝 | 品牌二手 | ¥7,400-7,900 | 验货宝验机 | ⭐ 推荐 |

**RTX 4090 24GB**：

| 渠道 | 类型 | 价格 |
|------|------|------|
| 淘宝拆机 | 七彩虹/华硕 | ¥4,400-4,500 |
| 淘宝全新 | 公版 | ¥8,800-8,900 |
| 闲鱼 | 微星魔龙 | ¥17,800 |

### 6.2 GTX 1080 机器升级检查清单

如果要换 GPU（比如 3090 24GB）：
1. **电源**：GTX 1080 功耗 180W → 3090 功耗 350W，需要 **750W+ 电源**
2. **机箱**：3090 三风扇卡长约 30-33cm，需要大机箱
3. **供电接口**：1080 用 1×8pin → 3090 用 2×8pin
4. **PCIe 插槽**：兼容（都是 PCIe ×16）
5. **CUDA 兼容**：3090 支持 CUDA 12.x，解决 1080 的 CUDA 版本问题

### 6.3 二手 GPU 检测方法

| 检测项 | 工具 | 判断标准 |
|--------|------|---------|
| GPU 核心健康 | GPU-Z | 参数正常 |
| 显存测试 | MATS/MOD2SU | 无 ECC 错误 |
| 烤机测试 | FurMark 30min | 温度 <85°C，不花屏 |
| 3D 压力测试 | 3DMark Stress Test | 通过率 >97% |
| 矿卡特征 | 肉眼 | PCB 发黄、散热垫干裂 |
| SN 码查询 | 品牌官网 | 保修状态、出厂日期 |

---

## 7. 推荐行动路径

1. ✅ **注册 Lightning AI + Kaggle + Colab**（免费）
2. ✅ 在 Lightning AI 上部署 LatentSync 1.6 / Hallo2（CUDA 原生，无需 patch）
3. ✅ 验证效果是否达标
4. 如效果好 → 继续用免费额度 + AutoDL 付费补充
5. 如需长期高频使用 → 闲鱼买 3090 品牌卡（验货宝）
6. 如需跑 Hallo3 → Lightning AI A100 80GB 免费额度（5h）或 AutoDL A800（¥4.98/h）

---

## Design Decisions & References

- **先薅羊毛策略**：Kaggle 30h/周（周期性刷新）是主力；Colab T4 做补充；Lightning AI 免费额度一次性用完就没了，留给需要大显存（L4 24GB）的模型。加起来每月可跑 120+ 小时推理。
- **AutoDL 为国内首选**：中国公司，按分钟计费，支付宝支付，国内访问快，有现成镜像。
- **T4/L4 CUDA 兼容澄清**：T4/L4/A100/H100 都是 NVIDIA GPU，完整 CUDA 支持。Google TPU 是不同产品，不支持 CUDA，Colab/Kaggle 提供的是 NVIDIA GPU 不是 TPU。
- **GTX 1080 纠正**：之前文档误写为 RTX 4060 8GB，实际是 GTX 1080 8GB（Pascal 架构，2016年）。1080 支持 CUDA 11.x 但不支持 12.x，大多数新数字人模型需要 CUDA 12.1+。
- **3090 淘宝低价卡风险**：¥1,700-2,700 的"全新 3090"几乎都是魔改卡（笔记本核心魔改）或矿卡翻新。正规品牌卡在闲鱼 ¥7,000-8,000，选验货宝标签。
- **DGX Spark 定位**：适合本地 LLM 推理（DeepSeek/Llama 70B），128GB 统一内存覆盖所有数字人模型。但 ¥28,000 成本高，免费云 GPU 验证效果后再决定。
- **相关文档**：`docs/research/digital-human-solutions-m2-pro.md`（数字人模型完整评估），`docs/research/tailscale-remote-gpu-setup.md`（GPU 机器远程部署）
## 双 T4 多 GPU 可行性分析（2026-08-18 新增）

> Kaggle 免费提供双 T4（每张 15GB），但两张卡的显存**不能自动合并**。以下分析哪些待测模型可以通过多 GPU 技术利用双卡超过单卡 15GB 限制。

### 多 GPU 技术方案对比

| 方案 | 原理 | 适合推理？ | 通信开销 | 实现难度 |
|------|------|----------|---------|---------|
| **DataParallel** | 每卡跑完整模型的不同 batch | ❌ 推理只有 1 个 batch，无意义 | 低 | 低 |
| **device_map="balanced"** (diffusers) | 不同组件放不同卡（text_encoder→GPU0, UNet→GPU1） | ✅ 适合 pipeline 模型 | 中 | 低 |
| **Tensor Parallelism** | 把每层权重拆到不同卡 | ✅ 适合大模型 | 高（PCIe） | 高 |
| **Pipeline Parallelism** | 不同层放不同卡 | ✅ 适合深模型 | 中 | 中 |
| **FSDP** | 分片模型参数 | ✅ 适合大模型训练+推理 | 中 | 中 |

### 各待测模型双 T4 可行性

| 模型 | 基座 | 多 GPU 支持 | 双 T4 可行？ | 原因 |
|------|------|------------|-------------|------|
| **InfiniteTalk** | Wan2.1 14B | ✅ **官方支持** `torchrun --nproc_per_node=8` + FSDP + Ulysses | ✅ **可行！** | 官方有多 GPU 推理命令，FSDP 可分片 14B 参数到双卡 |
| **MultiTalk INT8** | Wan2.1 14B | ✅ 同 InfiniteTalk 架构 | ✅ **可能** | `--quant int8` + FSDP，14B INT8 ~7GB/卡，双卡绰绰有余 |
| **EchoMimicV3** | Wan2.1 (1.3B) | ⚠️ diffusers pipeline 可能支持 device_map | ✅ 可能 | 1.3B 很小，单卡 + offload 已可跑；device_map 可进一步优化 |
| **LongCat GPU** | LongCat-Video 13.6B DiT | ❌ **多 GPU 有 bug** | ❌ **不可行** | 官方有多 GPU 命令但实际 NCCL 死锁，只能单卡。INT8 后 ~15GB 单卡勉强 |
| **LatentSync 1.6** | SD UNet + VAE | ⚠️ diffusers 支持 device_map | ⚠️ **困难** | OOM 在 VAE 解码，VAE 是单组件难以拆分到双卡 |
| **LatentSync 1.5** | SD UNet + VAE | ⚠️ 同上 | ✅ 可行 | 仅需 8GB，T4 单卡足够，不需要多 GPU |
| **Sonic** | SVD UNet | ❌ 无多 GPU 支持 | ❌ 不可行 | 官方仅支持单卡，ComfyUI 不支持多 GPU 推理 |
| **Hallo3** | CogVideo DiT | ⚠️ 可能支持 FSDP | ❓ 未知 | Transformer 骨干理论上适合 tensor parallelism，但官方未实现 |
| **Hallo (v1/v2/v4)** | 分层扩散 | ⚠️ 多 GPU 训练有，推理未确认 | ❓ 未知 | 训练脚本有 `finetune_multi_gpus_s1.sh`，但推理是单 GPU |
| **Hallo-Live** | 扩散实时 | ❓ 未知 | ❓ 未知 | 实时版本，可能单卡优化 |
| **EMO** | SD + Audio2Video | ❓ 未知 | ❓ 未知 | 官方未公开 weights，无法测试 |
| **PersonaLive** | SD1.5 | ❓ 未知 | ❓ 未知 | 12GB VRAM，T4 单卡足够，不需要多 GPU |
| **DICE-Talk** | 扩散+情感解耦 | ❓ 未知 | ❌ 不太可能 | 20GB+ VRAM 需求，T4 x2 无法合并显存 |
| **V-Express** | SD 1.5 | ❓ 未知 | ✅ 可行 | ~12GB，T4 单卡足够 |
| **JoyVASA** | 扩散+解耦 | ❓ 未知 | ❌ 不太可能 | A100 级别需求 |
| **EchoMimic V2** | SD + 关键点 | ❓ 未知 | ✅ 可行 | ~16GB，T4 单卡可能够 |
| **AniPortrait** | SD + 关键点 | ❓ 未知 | ✅ 可行 | ~12GB，T4 单卡足够 |
| **DreamTalk** | 扩散 | ❓ 未知 | ✅ 可行 | VRAM 未标注，扩散模型通常 T4 可跑 |
| **Wan2GP InfiniteTalk** | Wan2.1 (优化) | ❌ **不支持** | ❌ 不可行 | GitHub Issue #580 明确说 multi GPU 不支持 |

### 结论

**只有 InfiniteTalk / MultiTalk 系列可以在双 T4 上有效利用多 GPU 超过单卡限制**——因为它们官方支持 `torchrun` + FSDP 多 GPU 推理。其他模型要么没有多 GPU 支持，要么 OOM 发生在难以拆分的单组件（VAE）上。

对于 **LatentSync 1.6**，虽然 diffusers 理论上支持 `device_map="balanced"` 把 UNet 和 VAE 放到不同卡上，但 LatentSync 的 OOM 发生在 VAE 的单个 down_block 运算中（需要 2GB 连续显存），这种单组件内部无法通过 device_map 拆分。需要 tensor parallelism 才能拆分 VAE 内部，但这需要修改 diffusers 源码。

**推荐方案**：对于需要 >15GB 显存的模型，直接使用 L4 (22.5GB) 或 RTX 4090 (24GB) 单卡，比折腾双 T4 更实际。

---

## Kaggle vs Colab 平台对比（2026-08-18 新增）

### 为什么 Kaggle 限制少而 Colab 限制多？

| 维度 | Kaggle | Colab |
|------|--------|-------|
| **GPU 时间** | 30h/周（稳定刷新） | 不固定（"fluctuates over time"） |
| **冷却期** | ❌ 无 | ✅ 有（免费版几小时到几天） |
| **空闲断开** | 无限制 | ~90min（免费版） |
| **最大运行时间** | 12h/session | 12h（免费）/ 24h（Pro） |
| **GPU 型号** | P100 或 T4×2（可选） | T4（不保证型号） |
| **显存** | P100 16GB / T4 15GB×2 | T4 15GB（共享） |
| **同时实例** | 1 个 kernel | 2 个 notebook（免费） |
| **资源保证** | ✅ 相对稳定 | ❌ "not guaranteed, not unlimited" |

**为什么差异？**

1. **用户基数和滥用**：Colab 用户远多于 Kaggle（Colab 是 Google 主推的通用 ML 平台，Kaggle 主要面向数据科学竞赛）。Colab FAQ 明确说"access to expensive resources like GPUs is heavily restricted"以防止滥用。Reddit 报告 Colab 冷却期"从几小时延长到几天甚至几周"。

2. **资源调度策略不同**：Kaggle 采用**固定配额制**（30h/周），用完就等下周，简单透明。Colab 采用**动态限制**——Google 不公布具体限制，"overall usage limits as well as idle timeout periods, maximum VM lifetime, GPU types available, and other factors vary over time"。

3. **商业模型**：Colab 有明确的付费升级路径（Pro $9.99 → Pro+ $49.99），免费版的限制是为了推动付费。Kaggle 没有付费层（Google 通过 Kaggle 间接获利于竞赛生态和数据集平台）。

4. **Kaggle 双卡 T4 是真正的优势**：Kaggle 手机验证账号即可获得 T4×2，而 Colab 免费版只能获得单 T4，且不保证。

### 不同 GPU 对你的实际区别

| GPU | VRAM | bf16 | FP8 | Tensor Core | 能跑的模型 |
|-----|------|------|-----|-------------|----------|
| **P100** (Kaggle) | 16GB | ❌ | ❌ | ❌ | EchoMimicV3 ✅ / LatentSync 1.6 ❌ / InfiniteTalk ⚠️ |
| **T4** (Colab/Kaggle) | 15GB | ❌ | ❌ | ✅ | 同 P100，Tensor Core 加速但 VRAM 少 1GB |
| **L4** (Colab Pro) | 22.5GB | ✅ | ✅ | ✅ | + LatentSync 1.6 ✅ / LongCat GPU bf16 ✅ |
| **A100** (Colab Pro+) | 40/80GB | ✅ | ❌ | ✅ | + Hallo3 ✅ / LTX-2.3 22B ✅ |
| **RTX 4090** (AutoDL) | 24GB | ✅ | ❌ | ✅ | 同 L4 级别，VRAM 多 1.5GB |
| **A800** (AutoDL) | 80GB | ✅ | ❌ | ✅ | 同 A100 80GB |

**bf16 的实际影响**：P100/T4 不支持 bf16 只能用 float16。大多数模型（EchoMimicV3、LatentSync）训练时用 bf16，推理时转 float16 可能轻微质量损失但不影响功能。Wan2.1 系列模型官方推荐 bf16，T4/P100 跑 float16 可能出现 NaN 或需要额外 patch。

---

## Colab Pro $9.99 vs AutoDL ¥67.5 等价对比（2026-08-18，汇率 1:6.75）

> 实时汇率：**1 USD = 6.75 CNY**（2026-08-18 查询）
> Colab Pro $9.99/月 ≈ **¥67.5/月**

### 同等级 GPU 按小时费率对比（修正版）

| GPU 等级 | Colab GPU | Colab CU/h | Colab ¥/h | AutoDL GPU | AutoDL ¥/h | 同价位月时长对比 |
|---------|-----------|-----------|----------|-----------|-----------|---------------|
| 16GB 入门 | T4 15GB | 1.19 | ¥0.81 | A4000 16GB | ¥0.92 | Colab 84h vs AutoDL 73h → **Colab 略胜** |
| 22GB 中端 | L4 22.5GB | 1.71 | ¥1.15 | — (无同级) | — | AutoDL 无 L4 等价卡 |
| 24GB 中端 | — (无) | — | — | RTX 4090 24GB | ¥1.88 | **AutoDL 独占**（Colab 不提供 24GB） |
| 40GB 高端 | A100 40GB | 5.40 | ¥3.65 | A100 40GB | ¥3.45 | Colab 18.5h vs AutoDL 19.5h → **几乎持平** |
| 80GB 旗舰 | A100 80GB | 7.52 | ¥5.08 | A800 80GB | ¥4.98 | Colab 13.3h vs AutoDL 13.6h → **几乎持平** |

### ¥67.5/月 级别直接对比

| 维度 | Colab Pro ($9.99=100CU, ¥67.5) | AutoDL (¥67.5 充值) |
|------|-------------------------------|---------------------|
| T4 级别 (16GB) | **84h** T4 | **73.4h** A4000 (¥0.92/h) |
| L4 级别 (22.5GB) | **58h** L4 | — (AutoDL 无 L4) |
| 4090 级别 (24GB) | ❌ 不提供 | **35.9h** RTX 4090 (¥1.88/h) |
| A100 级别 (40GB) | **18.5h** A100 | **19.6h** A100 (¥3.45/h) |
| bf16 支持 | ✅ L4/A100 | ✅ 4090/A100 |
| GPU 型号保证 | ❌ 不保证 | ✅ 选什么就是什么 |
| GPU 独占 | ❌ 共享/抢占式 | ✅ 独占 |
| 冷却期 | ❌ Pro 无冷却期 | ❌ 无 |
| 后台执行 | ❌ Pro 无 | ✅ SSH 持久 |
| 管理 | 免管理（一键运行） | 需自行管理 VM |
| 网络 | 需翻墙 | 国内直连 |

### 对你的实际意义

**不同卡的区别只在这几点对你有意义**：

1. **VRAM 大小**：决定能跑哪些模型。15GB → EchoMimicV3 OK 但 LatentSync 1.6 OOM。22.5GB+ → 都能跑
2. **bf16 支持**：T4/P100 ❌ 只能 float16，可能需要 patch。L4/4090/A100 ✅ 原生支持
3. **Tensor Core**：T4 ✅ 比 P100 快 ~3x（矩阵加速）。但推理瓶颈通常在 CPU-GPU 数据搬运而非 GPU 计算
4. **其他差异（FP8、NVLink 等）对你没有实际意义**——你的模型都是单卡推理，不需要 NVLink 互联

**简化决策**：
- 只需 16GB → Colab 免费版 T4 或 Kaggle P100（都不要钱）
- 需 22.5GB+ 且要 bf16 → AutoDL RTX 4090 ¥1.88/h（最便宜的有 24GB + bf16 的选项）
- 需要 A100 级别 → Colab Pro+ 和 AutoDL A800 差不多价格，AutoDL 更稳定

### Colab 付费方案完整对比

| 特性 | 免费版 | Pro ($9.99/月) | Pro+ ($49.99/月) | Pay As You Go ($9.99/100CU) |
|------|--------|---------------|-------------------|---------------------------|
| **GPU** | T4 (共享) | T4/L4/A100 (优先) | T4/L4/A100/A100-80GB (高优先) | 同 Pro+ |
| **GPU 保证** | ❌ 不保证 | ❌ 不保证（看供应量） | ❌ 不保证（但优先级最高） | ❌ 不保证 |
| **VRAM** | 15 GB (T4) | 15 GB (T4) / 22.5 GB (L4) / 40 GB (A100) | 同 Pro + 80 GB (A100 80GB) | 同 Pro+ |
| **系统 RAM** | ~12 GB | **32 GB** | **52 GB** | 同 Pro+ |
| **磁盘空间** | 15 GB (Drive) | 100 GB (Drive) | 250 GB (Drive) | — |
| **Compute Units** | 不固定 | 100 CU/月 | 500 CU/月 | 按 CU 计费 |
| **最大运行时间** | 12h | 24h | 24h+ | 24h+ |
| **后台执行** | ❌ | ❌ | ✅ (关闭浏览器仍运行) | ✅ |
| **终端访问** | ❌ | ✅ | ✅ | ✅ |
| **AI 辅助** | ❌ | ✅ | ✅ | ❌ |
| **同时 notebooks** | 2 | 不限 | 不限 | 不限 |
| **空闲断开** | ~90min | 不断开 | 不断开 | 不断开 |
| **bf16 支持** | ❌ (T4) | ✅ (L4/A100) | ✅ (L4/A100) | ✅ (L4/A100) |

> ⚠️ **关键限制**：即使付费 Pro/Pro+，GPU 类型也不保证。Google FAQ 明确说"GPU 访问取决于可用性和使用模式"。付费后仍可能被分配 T4。Colab Pro 用户报告 A100 经常不可用，被自动降级到 L4（GitHub Issue #6013）。

### Compute Unit 消耗速率

| GPU | VRAM | 架构 | CU/hour | 等效 $/hour | $10 可用时间 | bf16 | FP8 |
|-----|------|------|---------|------------|-------------|------|-----|
| T4 | 15 GB | Turing (sm_75) | 1.19 | $0.12 | 84h | ❌ | ❌ |
| L4 | 22.5 GB | Ada (sm_89) | 1.71 | $0.17 | 58h | ✅ | ✅ |
| A100 (40GB) | 40 GB | Ampere (sm_80) | 5.40 | $0.54 | 18.5h | ✅ | ❌ |
| A100 (80GB) | 80 GB | Ampere (sm_80) | 7.52 | $0.75 | 13.3h | ✅ | ❌ |
| G4 (PRO 6000) | 96 GB | Blackwell | 8.71 | $0.87 | 11.5h | ✅ | ✅ |
| H100 | 80 GB | Hopper (sm_90) | ? | ? | ? | ✅ | ✅ |

> 数据来源：mccormickml.com 2026 年 3 月实测。CU 消耗速率非 Google 官方公布。

### bf16 硬件支持表

| GPU | 架构 | sm_版本 | bf16 | FP8 | Tensor Core | Colab 可用 |
|-----|------|---------|------|-----|-------------|-----------|
| P100 | Pascal | sm_60 | ❌ | ❌ | ❌ | Kaggle 免费 |
| T4 | Turing | sm_75 | ❌ | ❌ | ✅ | Colab 免费 |
| **L4** | Ada | sm_89 | ✅ | ✅ | ✅ | Colab Pro+ |
| **A100** | Ampere | sm_80 | ✅ | ❌ | ✅ | Colab Pro+ |
| H100 | Hopper | sm_90 | ✅ | ✅ | ✅ | Colab Pro+ |

**关键**：bf16 硬件支持从 Ampere (sm_80) 开始。T4 和 P100 都不支持 bf16，只能用 float16。L4 和 A100 支持 bf16，但需要 Colab Pro/Pro+ 付费。

### Colab Pro L4 和 A100 的 bf16 支持

- **L4 (Ada Lovelace, sm_89)**：✅ 支持 bf16 + FP8 + Tensor Core。Colab Pro 可请求，但不保证分配
- **A100 (Ampere, sm_80)**：✅ 支持 bf16（不支持 FP8）。Colab Pro 可请求，但 Pro 用户报告经常拿不到 A100
- **实际体验**：Pro 用户经常被自动降级到 L4（因为 A100 供应紧张）。Pro+ 优先级更高但仍不保证

---

## AutoDL vs Colab 付费方案对比（2026-08-18）

| 对比维度 | Colab Pro ($9.99/月) | Colab Pro+ ($49.99/月) | AutoDL (按需) |
|---------|---------------------|------------------------|--------------|
| **GPU 型号** | T4/L4/A100 (不保证) | T4/L4/A100/A100-80GB (不保证) | **自选指定** |
| **GPU 保证** | ❌ 可能被分到 T4 | ❌ 优先级更高但仍不保证 | ✅ **选定即保证** |
| **VRAM** | 15-40 GB | 15-80 GB | 按需选 24-80 GB |
| **系统 RAM** | 32 GB | 52 GB | 按需选（通常 40-100+ GB） |
| **磁盘空间** | 100 GB (Drive) | 250 GB (Drive) | 30 GB 系统盘 + 数据盘（按需） |
| **运行时间限制** | 24h/session | 24h+/session | **无限制**（按量计费不停机） |
| **后台执行** | ❌ | ✅ | ✅（SSH 持久连接） |
| **同时实例** | 不限 | 不限 | 不限 |
| **GPU 专属** | ❌ 共享/抢占式 | ❌ 共享/抢占式 | ✅ **独占** |
| **计费方式** | 月费 + CU 消耗 | 月费 + CU 消耗 | **按秒计费** |
| **网络** | 需翻墙 | 需翻墙 | **国内直连** |
| **预装环境** | PyTorch/TensorFlow | 同 Pro | 镜像市场（含各种 ML 框架） |

### AutoDL 定价（2026 年 8 月实测）

| GPU | VRAM | 按量 (普通) | 按量 (会员95折) | 包月估算 | 适用场景 |
|-----|------|-----------|---------------|---------|---------|
| RTX 3080Ti | 12 GB | ¥0.98/h | ¥0.93/h | ~¥600/月 | 轻量推理 |
| RTX A4000 | 16 GB | ¥0.92/h | ¥0.87/h | ~¥600/月 | 同 T4 级别 |
| RTX 2080Ti | 11 GB | ¥0.88/h | ¥0.84/h | ~¥550/月 | 轻量 |
| **RTX 3090** | **24 GB** | **¥1.32/h** | **¥1.25/h** | **~¥800/月** | **性价比之王** |
| **RTX 4090** | **24 GB** | **¥1.88/h** | **¥1.79/h** | **~¥1100/月** | **16GB 不够时的首选** |
| V100 | 32 GB | ¥1.88/h | ¥1.79/h | ~¥1100/月 | 中量 |
| RTX 5090 | 32 GB | ¥2.78/h | ¥2.64/h | ~¥1700/月 | 新品 |
| A800-80GB | 80 GB | ¥4.98/h | ¥4.73/h | ~¥3000/月 | 大模型 |
| PRO 6000 | 96 GB | ¥5.98/h | ¥5.68/h | ~¥3600/月 | 超大模型 |
| H800 | 80 GB | ¥8.88/h | ¥8.44/h | ~¥5300/月 | 顶级 |

> AutoDL **有包月服务**：支持按日/按周/按月预付费租用 GPU，价格比按量计费便宜 30-40%。优势是关机后 GPU 保留不被抢，劣势是无论是否使用都计费。支持按量↔包月互转， unused 部分可退款。
>
> **包月价格说明**：上表包月价格为按量 × 720h × 0.7（包月约 7 折）的估算值，实际价格以 AutoDL 网站显示为准。不同区域、不同时段价格有浮动。

### 划算分析：AutoDL vs Colab 付费（同等级 GPU 按小时对比）

**同等级 GPU 按小时费率对比**（以 $1 ≈ ¥7.25 换算）：

| GPU 等级 | Colab GPU | Colab CU/h | Colab $/h | AutoDL GPU | AutoDL ¥/h | AutoDL $/h | 谁更划算 |
|---------|-----------|-----------|----------|-----------|-----------|----------|---------|
| 16GB 入门 | T4 15GB | 1.19 | $0.12 | A4000 16GB | ¥0.92 | $0.13 | **几乎一样** |
| 24GB 中端 | L4 22.5GB | 1.71 | $0.17 | RTX 4090 24GB | ¥1.88 | $0.26 | **Colab L4 更便宜**（但 VRAM 少 1.5GB） |
| 40GB 高端 | A100 40GB | 5.40 | $0.54 | A100 40GB | ¥3.45 | $0.48 | **AutoDL 略便宜** |
| 80GB 旗舰 | A100 80GB | 7.52 | $0.75 | A800 80GB | ¥4.98 | $0.69 | **AutoDL 略便宜** |
| 96GB 顶级 | G4 96GB | 8.71 | $0.87 | PRO 6000 96GB | ¥5.98 | $0.83 | **AutoDL 略便宜** |

> **关键发现**：
> - **T4 级别**：Colab 免费版 T4 $0.12/h vs AutoDL A4000 $0.13/h → **几乎一样**，但 Colab 免费版不要钱
> - **L4 级别**：Colab Pro L4 $0.17/h vs AutoDL 4090 $0.26/h → **Colab 更便宜**，但 L4 只有 22.5GB 而 4090 有 24GB
> - **A100 级别**：AutoDL 普遍便宜 ~10-15%，但 Colab 不保证分配到 A100
> - **Colab 最大优势**：免费版 T4 不要钱，Pro $10/月 100 CU 可用 84h T4
> - **AutoDL 最大优势**：GPU 型号保证 + 独占 + 国内直连 + 有 24GB 级别 GPU（Colab 没有）
> - **Colab 致命劣势**：GPU 型号不保证、可能被抢占、免费版有冷却期

### $10/月 Colab Pro vs ¥10 充值 AutoDL 直接对比

| 维度 | Colab Pro $10/月 (100 CU) | AutoDL ¥10 充值 |
|------|--------------------------|-----------------|
| T4 级别 | 84h T4 | ~10.9h A4000 (¥0.92/h) |
| L4 级别 | 58h L4 | — (AutoDL 无 L4) |
| 4090 级别 | ❌ 不提供 | ~5.3h RTX 4090 (¥1.88/h) |
| A100 级别 | 18.5h A100 | ~2h A800 (¥4.98/h) |
| GPU 保证 | ❌ 不保证型号 | ✅ 选什么就是什么 |
| 独占 | ❌ 共享/抢占式 | ✅ 独占 |
| 冷却期 | Pro 无冷却期 | 无 |
| 后台执行 | ❌ Pro 无 | ✅ SSH 持久 |
| 管理 | 免管理（一键运行） | 需自行管理 VM |

> **结论**：$10/月 Colab Pro 在 **T4/L4 级别** 更划算（84h T4 vs AutoDL 的 10.9h），但如果需要 **24GB VRAM 或 A100 级别**，AutoDL 是唯一选择。

### 总结推荐

| 使用强度 | 推荐方案 | 原因 |
|---------|---------|------|
| 偶尔测试 | Colab 免费 T4 | 零成本，一键运行 |
| 每周几次 | Colab Pro $10/月 | T4 够用，方便 |
| 需要 24GB+ VRAM | **AutoDL RTX 4090 ¥1.88/h** | Colab 没有 24GB GPU |
| 需要 A100 但不常用 | **AutoDL A800 ¥4.98/h** | 按 CU 算 Colab Pro+ 更贵 |
| 长期重度使用 | AutoDL 包月 | 包月比按量再低 30-40% |
| 需要后台长时间运行 | Colab Pro+ 或 AutoDL | 都支持后台执行 |

> **核心差异**：Colab 是"共享/抢占式" GPU（可能被抢占），AutoDL 是"独占" GPU。Colab 不保证 GPU 型号，AutoDL 你选什么就是什么。Colab 优势是免管理（一键运行），AutoDL 优势是确定性 + 国内直连 + 24GB 级别 GPU。

---

## 云 GPU 资源 Pool 与 Fallback（2026-08-18 更新）

> **目标**：所有需要云 GPU 的任务（数字人推理、模型测试等）统一通过此 pool 调用资源。本地 M2 Pro MPS 无法跑 CUDA 模型时使用。

### 可用 GPU 完整清单

| 平台 | 免费可选 GPU | 付费可选 GPU | CPU RAM | 选择方式 | 默认推荐 |
|------|-------------|-------------|---------|---------|---------|
| **Kaggle** | T4 x2 (15GB×2) / P100 (16GB) | — | **29 GB** | `kernel-metadata.json` → `"machine_shape": "NvidiaTeslaT4"` | **T4 x2** |
| **Colab CLI** | T4 (14.6GB) | L4 / A100 / H100 | 12 GB (免费) / 32 GB (Pro) / 52 GB (Pro+) | `colab run --gpu T4` | **T4**（免费）/ L4（Pro）/ A100（Pro+） |
| **Colab CDP** | T4 (14.6GB) | L4 / A100 | 同 Colab | 浏览器 Settings → Accelerator | T4 |
| **AutoDL** | — | RTX 3090/4090/A800 等 | 按实例（通常 40-100+ GB） | 手动租用 | RTX 4090 (24GB) |

> ⚠️ **Kaggle P100 退役公告**（2026-08-18 发现）：Kaggle 将于 **2026 年 9 月 15 日** 退役 P100，届时 P100 自动切换到 T4 x2。之后 Kaggle 只有 T4 x2 和 TPU 可选。详见 [Sunsetting P100 announcement](https://www.kaggle.com/discussions/product-announcements/735239)。

### 资源优先级（更新）

| 优先级 | 平台 | 命令 | GPU | 免费额度 | 适用场景 |
|--------|------|------|-----|---------|--------|
| 1️⃣ | **Kaggle (T4 x2)** | `kaggle kernels push` + `machine_shape: NvidiaTeslaT4` | T4 x2 (15GB×2) | 30h/周刷新 | 自动化批量推理（默认） |
| 2️⃣ | **Colab CLI (T4)** | `colab run --gpu T4 script.py` | T4 14.6GB | 不固定，空闲90min | 一键运行单脚本 |
| 3️⃣ | **Colab CDP** | web-access skill | T4 14.6GB | 同 Colab | 交互式调试、参数调优 |
| 4️⃣ | **AutoDL** | 手动租用 | RTX 4090 24GB | ¥1.88/h | 16GB 不够时的付费备选 |

### 默认 GPU 策略（2026-08-18 确立）

1. **默认用 T4**：Kaggle 和 Colab 的免费 T4 是首选。T4 支持默认 PyTorch（cu128），不需要 P100 那套复杂的 PyTorch 降级 + diffusers patch
2. **P100 只用于已有脚本**：EchoMimicV3 v25-v34 的脚本已为 P100 写好了 patch，不需要改。新模型全部用 T4
3. **T4 x2 显存机制**：Kaggle 选 T4 实际是 **2 张 T4**，每张 15GB VRAM，**不是合并成 32GB**，而是各自独立的 15GB。要利用双卡需要代码适配多 GPU（`torch.nn.DataParallel` 或 `ulysses_degree` 参数）
   - **数据并行**：同一模型复制到两张卡，各自处理不同数据（适合批量推理）
   - **模型并行**：把模型不同层放到不同卡（适合超大模型）
   - **单卡使用**：不写多 GPU 代码，只用 `cuda:0`，第二张卡闲置（相当于 15GB VRAM）
4. **CPU RAM（offload 可用量）**：
   - Kaggle T4 x2 / P100：**29 GB RAM**（CPU 内存，offload 时模型参数放这里）
   - Colab 免费 T4：**~12 GB RAM**（偶尔升级到 25GB）
   - Colab Pro T4：**32 GB RAM**
   - Colab Pro+ T4：**52 GB RAM**
5. **VRAM 不够时**：单张 T4 15GB 不够 → 尝试双卡模型并行 / P100 16GB（仅 9/15 前）/ AutoDL 4090 24GB
6. **需要 bf16 时**：T4 和 P100 都不支持 bf16，需 L4/A100（Colab Pro+ 付费）

### Fallback 规则（更新）

1. **首选 Kaggle T4 x2**：`kernel-metadata.json` 设 `"machine_shape": "NvidiaTeslaT4"` → push → 轮询 `kaggle kernels status`
2. **Kaggle T4 失败/排队太长** → fallback 到 Colab CLI：`colab run --gpu T4 script.py`
3. **Colab 失败/超时** → Kaggle P100（仅 9/15 前可用，之后自动变 T4 x2）
4. **16GB 不够** → AutoDL RTX 4090 24GB（付费，需手动租用）

### Kaggle 多 Test Case 最佳实践（2026-08-18 确立）

**高效原则**：一次 Kaggle push（=一个 version）尽量跑完所有想测的 test case，减少 push 轮次。

- Kaggle kernel 有 12h 时限，一次跑 3-4 个 test case 完全没问题
- 每个 test case 在脚本里定义为一个 dict，包含 name/image/audio/prompt/steps/params
- 每个 test case 的输出 mp4 单独命名（`echomimicv3_{name}.mp4`），保存在同一个 version 的 output 里
- 用 `kagglehub.notebook_output_download('slug/versions/N')` 下载 debug_log.txt 看所有 test case 的推理时间
- mp4 文件可能不被 `kaggle kernels output` 下载（MP4 不在标准 output 格式），需从 Kaggle 网页手动下载
- **如果要换参数再跑同样的 test case，必须 push 新 version**（因为脚本内容变了）
- **如果只想加新 test case，改脚本里的 TEST_CASES 列表再 push 即可**

### 使用方式

Agent 在需要云 GPU 时：
1. 准备 `.py` 脚本（安装依赖 → clone 代码 → 下载模型 → 推理 → 输出结果）
2. 优先用 `colab run --gpu T4 script.py` 一键运行
3. 失败则用 Kaggle（`kernel-metadata.json` + `kaggle kernels push`）
4. 两者都失败则告知用户手动操作

### 相关文档

- `docs/research/cloud-gpu-options.md` — 完整 GPU 方案对比（免费 + 付费）
- `docs/archive/handoff-cloud-gpu-kaggle-setup.md` — Kaggle + Colab CLI 配置全过程
- `scripts/kaggle/test-gpu/` — Kaggle 自动化测试脚本模板
- Colab CLI 操作指南：https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md

---

## Kaggle T4×2 验证（2026-08-18）

### 手机验证状态：✅ 已通过

通过实际 push 测试 kernel 验证：

```
Kernel version 1 successfully pushed.
```

输出日志确认双 T4：
```
Tesla T4, 15360 MiB
Tesla T4, 15360 MiB
GPU count: 2
```

- **账号**：xPabloLI
- **手机验证**：✅ 已完成（2026-08-15）
- **T4×2 可用**：✅ 确认（`machine_shape: "NvidiaTeslaT4"` 生效）
- **每周配额**：30h/周，周六刷新

---

## 免费 GPU 平台深度调研（2026-08-18，交叉验证）

> **调研方法**：Tavily 多关键词搜索 + 官方文档 + 第三方对比 + 用户论坛交叉验证
> **核心问题**：哪些平台的免费 credits 是**定期更新**（月/周/日）而非一次性的？

### 定期更新的免费 GPU 平台（✅ 有意义）

| 平台 | 免费 GPU | VRAM | 更新周期 | 月/周时长 | 限制 | 来源验证 |
|------|---------|------|---------|---------|------|---------|
| **Kaggle** ✅ 已用 | T4×2 / P100 | 15GB×2 / 16GB | **每周刷新**（周六） | 30h/周 | 12h/session, 1 kernel | 官方文档 [1] |
| **Colab 免费版** ✅ 已用 | T4（不保证） | 15GB | **动态**（不固定） | 不固定 | 冷却期 + 90min 空闲 | 官方 FAQ [2] |
| **Lightning AI** | T4/L4/A10G/L40S | 15-48GB | **月度刷新** | 15 credits/月 (~22h T4) | 4h studio 重启, 不累计 | 官方 + SaaSworthy + aicreditmart [3] |
| **Hugging Face ZeroGPU** | H200（动态） | 48-96GB | **每日刷新** | 5 min/天, 3次/天 | 极短时间 | 官方文档 + 论坛 [4] |
| **Saturn Cloud** | T4（仅 CPU 免费？） | 16GB? | **月度刷新** | 150h/月（CPU 为主） | GPU 免费层不确定 | 官方博客 [5] |

### 一次性的免费 GPU（❌ 对我们没有意义）

| 平台 | 免费额度 | 性质 | 原因 |
|------|---------|------|------|
| **Google Cloud** | $300 credit | 一次性（90天过期） | 过期后不再补充 |
| **AWS Activate** | $200K credit | 一次性 | 面向初创公司，非个人 |
| **Azure 新用户** | $200 credit | 一次性（30天过期） | 30 天后失效 |
| **Oracle Cloud** | $300 credit | 一次性（30天过期） | 之后只有 always-free CPU |
| **RunPod** | $5-10 credit | 一次性 | 用完即止 |
| **Paperspace Gradient** | 有限 GPU 时 | 一次性 | 免费层 M4000 8GB 不够用 |
| **Modal** | $30/月 | **月度更新** ✅ | 但 GPU A100 $2.50/h, $30 只能跑 12h |
| **Thunder Compute** | $20 (学生) | 一次性 | 仅美国学生 |

### SageMaker Studio Lab 关闭详情

**关闭时间**：2026-07-30 停止接受新用户

**关闭原因**（来源：AWS 官方文档 [6]）：
- AWS 官方公告说 "Amazon SageMaker Studio Lab is no longer open to new customers"
- 这是 AWS **批量关闭 12 个服务/功能**的一部分（同一天关闭的还包括 Mechanical Turk、Ground Truth、Clarify、Debugger、GeoSpatial 等 9 个 SageMaker AI 子功能）
- AWS 把 Studio Lab 定位为"maintenance mode"——现有用户可继续使用，但"不计划引入新功能"
- **替代品**：AWS 建议迁移到 SageMaker Studio（但免费层只有 CPU-only `ml.t3.medium`，无 GPU）
- **没有说会重新开放注册**。AWS 的方向是把免费 GPU 体验引导到付费的 SageMaker Studio

**关键判断**：这不是一个临时关闭——AWS 正在系统性地退出"免费 GPU notebook"市场，把资源集中到 SageMaker Unified Studio（付费产品）。SageMaker Studio Lab 的关闭是战略性的，不是技术问题。

### Lightning AI Credits 详细分析（重点交叉验证）

**矛盾发现**：
- Lightning AI 官方 pricing FAQ 说："You get 5 free Lightning credits upon registration. Add a card for 25 more. If you don't use them, they expire in 12 months."
- 但 SaaSworthy（数据抓自官方页面）说："15 monthly Lightning credits included"
- aicreditmart.com 说："15 credits/month, Renews monthly; unused credits don't roll over"
- YouTube 实测视频（2026-05-12）说："in the free plan, you get 15 monthly credits"

**交叉验证结论**：
- 官方 FAQ 的 "5 credits + 25 (add card)" 指的是**初始注册赠送的一次性 bonus credits**，12 个月过期
- "15 monthly credits" 是**月度更新的免费额度**，每月刷新，不累计
- 两者是**独立的**——注册时拿到 5+25=30 一次性 credits，之后每月还有 15 credits 自动补充
- Reddit r/lightningAI 有帖子 "How does lightning ai free credit reset?" 确认用户也在困惑这个问题

**Lightning AI 免费层实际配置**：
- 15 credits/月（1 credit ≈ $1 ≈ 1.5h T4）
- 总计 ~22h T4/月 或 ~8h L4/月
- GPU 选项：T4 (15GB), L4 (22.5GB), A10G (24GB), L40S (48GB)
- 1 个 free active Studio，4 小时重启
- 持久化存储 100GB
- SSH/VS Code 连接
- 不需要信用卡，只需手机验证

**对你最有价值的 GPU 选项**：
- **L4 (22.5GB, bf16)** — 正好解决 LatentSync 1.6 的 OOM（需要 >15GB），且支持 bf16
- **A10G (24GB, bf16)** — 比 L4 多 1.5GB，可以跑更多模型
- 15 credits ≈ 8h L4/月，足够做几次测试

### Hugging Face ZeroGPU 详细分析

- 免费 H200 GPU（48-96GB），但每天只有 5 分钟，3 次请求
- **每日刷新**（24h 后重置）
- 太短了，不适合做视频推理（EchoMimicV3 需要 24min+）
- 适合做 API 推理测试（快速验证模型能否加载），不适合长时间推理

### 推荐的 Fallback Pool 策略（更新）

| 优先级 | 平台 | GPU | 月/周配额 | 用途 |
|--------|------|-----|---------|------|
| 1️⃣ | **Kaggle T4×2** | T4 15GB×2 | 30h/周 | 自动化批量推理（默认） |
| 2️⃣ | **Colab 免费 T4** | T4 15GB | 不固定 | 一键运行单脚本 |
| 3️⃣ | **Lightning AI L4** | L4 22.5GB (bf16) | ~8h/月 | **16GB 不够时首选**（替代 SageMaker Studio Lab） |
| 4️⃣ | **AutoDL 4090** | RTX 4090 24GB | ¥1.88/h | 长时间或 >22.5GB 时 |

> **关于多 Kaggle 账号 fallback pool**：技术上可行（维护多组 API key，轮询空闲账号），但 Kaggle TOS 禁止一人多账号，有封号风险。**更安全的替代方案是加入 Lightning AI 作为第二平台**——不同平台不违反 TOS，且 Lightning AI 的 L4 (22.5GB, bf16) 正好弥补 Kaggle T4 (15GB, 无 bf16) 的不足。

---

## 5. 国内云 GPU 平台验证（2026-08-19）

### 5.1 腾讯云 GPU 实例 ✅ 凭证有效

**验证状态**：SecretId/SecretKey 已验证，可查询到广州、北京、上海、南京各可用区。

**GPU 实例系列**（来源：[腾讯云 GPU 云服务器文档](https://cloud.tencent.com/document/product/560/19700)）：

| 系列 | GPU 型号 | GPU 显存 | 最小配置 vCPU | 最小配置 RAM | 适用场景 |
|------|---------|---------|-------------|------------|---------|
| **GN7** | NVIDIA T4 | 16GB×1~4 | 8 核 | 32GB | 推理、视频编解码、图形处理 |
| **GN10X** | NVIDIA V100 | 32GB×1~8 | 8 核 | 40GB | 深度学习训练、高性能计算 |
| **GN10Xp** | NVIDIA V100 NVLink | 32GB×1~8 | 10 核 | 40GB | 大规模训练（NVLink 互联） |
| **GNV4** | NVIDIA V100 | 16GB×? | 12 核 | 44GB | 计算型 |
| **PNV4** | NVIDIA? | ? | 28 核 | 116GB | 计算型（PN 系列） |
| **GT4** | NVIDIA A100 | 40GB×1~8 | 16 核 | 96GB | 大规模训练（A100 40GB） |
| **BMGNV4** | NVIDIA? | ? | 208 核 | 768GB | 裸金属 GPU（BM 系列） |

**最小 GPU 实例（GN7.2XLARGE32）**：
- GPU: NVIDIA T4 × 1（16GB）
- CPU: Intel Xeon Platinum 8255C 2.5GHz, 8 vCPU
- RAM: 32GB DDR4
- 内网带宽: 3Gbps
- 适用：推理场景，T4 显存 16GB 与 Kaggle T4 一致

> ⚠️ **限制**：GPU 实例需要**备案**或**按量付费**才能创建，部分区域可能有库存限制。建议先在[价格计算器](https://buy.tencentcloud.com/price/cvm/calculator)查看实时价格。

### 5.2 Modal ⚠️ Token 有效，免费额度已用完

**验证状态**（2026-08-19）：
- Token ID: `ak-wbmpSiJe6MGAdkMYaVVxxN` ✅ 验证通过
- Token Secret: `as-b8lPin3XHIJFFUjOD9Kvhb` ✅
- Profile: `qingshun-li` ✅ 已激活
- **问题**：Workspace `ac-yuE8WpOhZG3tDJBKphOPJn` 已超出消费限制（spend limit）
- **解决**：需到 modal.com → Settings → Billing 添加付费方式或提高 spend limit

**Clash 代理问题**：`api.modal.com` 被 FlClash TUN 拦截（fake-ip 198.18.0.x），导致 SSL 握手失败。已在 FlClash + Clash Verge 的 `fake-ip-filter` 中添加 `+.modal.com` 排除规则。使用时需设置 `NO_PROXY=api.modal.com,modal.com` 或重启 Clash 让配置生效。

### 5.3 Saturn Cloud ❌ Token 有效，Clash TUN 拦截

**验证状态**（2026-08-19）：
- JWT token 有效（user_id: `3d4d793125b74b97be7cdd7fa488c973`，iss: `atlas`）
- API endpoint: `app.saturncloud.io`（需要 JS 渲染的 SPA）
- **问题**：`app.saturncloud.io` 被 Clash TUN 拦截（fake-ip 198.18.0.180），SSL 握手失败
- **修复**：已在 FlClash + Clash Verge 的 `fake-ip-filter` 中添加 `+.saturncloud.io` 排除规则
- **后续**：需重启 FlClash 或 Clash Verge 让配置生效后重新验证

### 5.4 国内 LLM API 免费额度对比（2026-08-19）

| 平台 | 免费额度 | 刷新周期 | 模型 | 对项目有用？ |
|------|---------|---------|------|------------|
| 字节跳动（火山引擎） | 万级 token | **每月刷新** ✅ | 豆包 | 未来可能（内容分类/自动写稿） |
| 阿里云百炼 | 100万 token | 一次性 | 通义千问 | 同上 |
| 腾讯混元 | 50万 token | 一次性 | 混元 | 同上 |
| 华为云 AgentArts | 200万 token | **一次性** | 盘古 | 同上 |
| 百度 AI Studio | 文心一言 | 需积分 | ERNIE | 仅支持 PaddlePaddle |

> **项目当前不需要外部 LLM API token**。VLM 使用本地 mlx-vlm（Qwen3-VL-8B），RAG 使用本地 Ollama（bge-m3），无外部 LLM API 调用。几百万 token 用起来很快，目前无需求。
