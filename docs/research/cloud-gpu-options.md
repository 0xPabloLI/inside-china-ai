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
