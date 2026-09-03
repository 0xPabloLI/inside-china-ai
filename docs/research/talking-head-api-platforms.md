# Talking Head 模型 API 平台调研

> **调研日期**：2026-09-03
> **目的**：找免费/低价 API 平台直接调用 talking head 模型，省掉本地 GPU 折腾
> **信源**：NVIDIA NIM、Replicate、fal.ai、HuggingFace Spaces、Together AI、Fireworks AI、硅基流动、火山引擎、阿里云百炼、腾讯混元、百度千帆、智谱、MiniMax、月之暗面、DeepSeek、讯飞、魔搭 ModelScope、OpenXLab（全部 web-access CDP 实测）
> **结论**：一次性免费额度不持续，仅存档。Talking head 测试走 Kaggle T4（每周 30h 免费）或 AutoDL（cheapest paid）。

---

## 平台总览

| 平台 | talking head 模型数 | 免费额度 | 计费方式 | 覆盖目标模型 |
|------|-------------------|---------|---------|-------------|
| **fal.ai** | 20+ | $10 新用户 | 按输出秒 | **Wan2.2-S2V、EchoMimic V3、FlashHead** |
| **Replicate** | 30+ | ~$0.1-1 试用 | 按硬件秒 | Wan2.2-S2V、LatentSync、SadTalker、LivePortrait、Sonic |
| **HuggingFace Spaces** | 10+ | ZeroGPU 免费 | 免费（限时） | LeapTalk、SkyReels A1、LatentSync、LivePortrait |
| **NVIDIA NIM** | 1（LipSync） | 免费（rate-limited） | RPM 限 | ❌ 无纯生成式 talking head |
| **火山引擎** | 商业方案 | ❌ 需商务咨询 | 企业定价 | ✅ 虚拟数字人（98.5% 唇形） |
| Together AI | ❌ 无 | — | — | — |
| Fireworks AI | ❌ 无 | — | — | — |
| 硅基流动 | ❌ 无 | — | — | — |

---

## fal.ai（最佳 API 平台）

**新用户 $10 免费额度**，按输出秒计费，以速度快著称。

### 托管的目标模型

| 模型 | fal.ai ID | 价格 | 说明 |
|------|-----------|------|------|
| **Wan2.2-S2V** | `fal-ai/wan/v2.2-14b/speech-to-video` | $0.20/秒(720p), $0.15(580p), $0.10(480p) | ✅ 我们待测，Apache 2.0 |
| **EchoMimic V3** | `fal-ai/echomimic-v3` | $0.20/秒 | ✅ 可做 API vs 本地 v51 对比 |
| **SoulX-FlashHead** | `fal-ai/flashhead` | **$0.005/秒** | ✅ LeapTalk 基座，极便宜 |
| Flashtalk | `fal-ai/flashtalk` | — | SoulX-FlashTalk 14B |

### API 调用

```python
# pip install fal-client
import fal
result = fal.run("fal-ai/wan/v2.2-14b/speech-to-video", arguments={...})
```

---

## Replicate（托管最多）

按硬件时长计费：T4 $0.81/hr, A100 $5.04/hr, H100 $5.49/hr。

### 托管的目标模型

| 模型 | Replicate ID | 说明 |
|------|-------------|------|
| **Wan2.2-S2V** | `wan-video/wan-2.2-s2v` | 141k runs |
| LatentSync | `bytedance/latentsync` | 167k runs |
| SadTalker | `cjwbw/sadtalker` | 182k runs |
| LivePortrait | `zf-kbot/live-portrait` | 42k runs |
| Sonic | `zf-kbot/sonic` | — |
| OmniHuman | `bytedance/omni-human` | 165k runs（字节） |

### 缺失
Hallo3、FantasyTalking、EchoMimic、SkyReels-V3 均无托管。

---

## HuggingFace Spaces（免费试玩）

ZeroGPU 免费 GPU（限时），Web UI 非 API。

| Space | 状态 | likes | 说明 |
|-------|------|-------|------|
| **SkyReels A1 Talking Head** | ✅ Running | 200 | SkyReels，免费试 |
| **LatentSync** | ✅ Running | 619 | fffiloni |
| **Live Portrait** | ✅ Running | 3.79k | Kling 官方 |
| **LeapTalk** | ✅ Running | 7 | hugging-apps |
| **LongCat-Video-Avatar 1.5** | ✅ Running | 313 | 美团 |
| SadTalker 官方 | ❌ Build error | 1.43k | — |
| Hallo 官方 | ❌ Runtime error | 162 | — |
| FantasyTalking | ❌ Runtime error | 1 | — |
| Sonic | ❌ Build error | 193 | — |

---

## NVIDIA NIM

**无纯生成式 talking head API**。唯一 audio-driven 模型是 LipSync（`video+audio→video`，需已有视频做唇形对齐，非从静图生成）。Audio2Face-2D/3D 存在但只能自部署，无 cloud endpoint。

免费额度：Developer Program 会员免费、rate-limited ~40 RPM，仅限非生产。

---

## 火山引擎虚拟数字人（商业方案）

成熟企业级数字人：唇形准确率 98.5%、端到端延迟 500ms、MOS 4.0。支持 2D 形象定制（上传 3min 视频→3 小时交付数字分身）、直播/播报/交互型。需商务咨询定价，非按量 API。

---

## 目标模型覆盖矩阵

| 待测模型 | fal.ai | Replicate | HF Space | 自部署 |
|---------|--------|-----------|----------|--------|
| **Wan2.2-S2V-14B** | ✅ $0.20/秒 | ✅ | ⚠️ error | 可 |
| **SoulX-FlashHead** | ✅ $0.005/秒 | ❌ | ❌ | 可 |
| **EchoMimic V3** | ✅ $0.20/秒 | ❌ | ⚠️ | 已有本地 v51 |
| **SkyReels-V3** | ❌ | ❌ | ✅ 免费 | 可 |
| **Hallo3** | ❌ | ❌ | ⚠️ error | 需 |
| **FantasyTalking2** | ❌ | ❌ | ⚠️ error | 需 |

---

## 建议（分两步走）

### ~~第一步：fal.ai API 快速验证~~（一次性额度，已从测试表移除，仅存档）

1. **Wan2.2-S2V**（$0.20/秒，10 秒视频 = $2，可测 5 次）：我们待测列表里的模型，Apache 2.0 可商用
2. **SoulX-FlashHead**（$0.005/秒，10 秒视频 = $0.05）：LeapTalk 基座的独立质量
3. **EchoMimic V3 API vs 本地 v51 对比**（$0.20/秒）：验证 API 路线画质是否与本地一致

### ~~第二步：HF Space 免费试玩~~（5min/天太少，仅存档）

4. **SkyReels A1**（HF Space 免费）：看画质后再决定是否深入
5. **Hallo3 / FantasyTalking2**：三大平台均无 API，需自部署（按 license 门禁筛）

---

## 免费额度性质总表

| 平台 | 额度性质 | 具体政策 | talking head 覆盖 |
|------|---------|---------|-------------------|
| **HF ZeroGPU** | **每日更新** | Free 5min/天，PRO $9/月=40min/天 | LeapTalk/SkyReels/LatentSync/LivePortrait |
| fal.ai | 一次性 | ~$10，过期 1 周-1 年 | Wan2.2-S2V/EchoMimic V3/FlashHead |
| Replicate | 一次性 | 少量试用，prepaid credit 1 年 | Wan2.2-S2V/Sonic/LatentSync/SadTalker |
| NVIDIA NIM | 一次性 | ~1000 credits，trial terms | ❌ 无纯生成式 |
| ModelScope GPU | 一次性 | 36 小时 GPU（显存 24-32G）+ 100G 存储 | **全覆盖 10 个待测模型** |
| ModelScope CPU | 长期免费 | 8核32G（跑不了 talking head） | — |
| 阿里云百炼 | 一次性 | 每模型 100 万 token，90 天 | Wan 系列但无 S2V |
| 智谱 | 持续免费 | GLM-4.7-Flash 等（LLM，非 talking head） | ❌ |
| 火山引擎奇美拉 | 邀测免费 | 邀请制 | ✅ 商业数字人 |
| 讯飞 | 试用额度 | 新用户免费次数 | ✅ 虚拟人产品 |
| DeepSeek | 无免费 | 需充值 | ❌ |
| Together/Fireworks/硅基流动 | — | — | ❌ 均无 talking head |

**结论**：仅 HF ZeroGPU 每日更新（但量太少）。一次性额度不持续，仅存档。

---

## ModelScope 免费 GPU 详细规则

| 项目 | 规则 |
|------|------|
| GPU | 显存 24-32G，**一次性 36 小时** |
| CPU | 8核32G，长期免费 |
| 单次运行上限 | ≤ 10 小时 |
| 空闲自动关闭 | 1 小时无活动 |
| 持久化存储 | 免费 100G（`/mnt/workspace/`） |
| 底层 | 阿里云 PAI-DSW（需绑定阿里云账号） |
| 环境 | JupyterLab / WebIDE (VS Code) / Terminal |
| xGPU 创空间 | Beta，免费多卡型但需申请审核，高档 GPU 时长 < 低档 |
| 用尽后 | 切 CPU 继续 / 导出本地 / 跳转 PAI-DSW 付费 |

---

## 国内平台 talking head 覆盖

| 平台 | talking head API | 说明 |
|------|-----------------|------|
| **魔搭 ModelScope** | ✅ 全覆盖（开源托管 + 免费 GPU notebook） | 10 个待测模型全有仓库 |
| **讯飞** | ✅ 虚拟人独立产品 | 闭源商业，非开源模型 API |
| **火山引擎奇美拉** | ✅ 商业数字人 | 邀测中，邀请制 |
| 阿里云百炼 | ❌ 无 S2V | 有 Wan T2V/I2V 但无 audio-to-video |
| 硅基流动 | ❌ 无 S2V | 有 Wan T2V/I2V |
| 腾讯混元/百度千帆/智谱/MiniMax/月之暗面/DeepSeek/OpenXLab | ❌ | 均无 talking head API |

---

## fal.ai vs AutoDL 费用对比（10 秒输出视频）

| 方案 | 费用 | 优缺点 |
|------|------|--------|
| fal.ai Wan2.2-S2V 720p | $2（¥14） | 零部署，按输出秒计费 |
| fal.ai FlashHead | $0.05（¥0.35） | 极便宜 |
| AutoDL A100 80GB | ~¥0.3-0.5 | 便宜 30-50×，需自己搭环境 |
| AutoDL T4 | ~¥0.5-1 | 更慢但更便宜 |
| Kaggle T4 | $0（免费） | 每周 30h，我们一直在用 |

**结论**：AutoDL 便宜 30-50 倍，代价是要自己部署。fal.ai 价值是零部署开箱即用。日常测试走 Kaggle（免费）或 AutoDL（便宜），fal.ai 仅适合一次性快速验证。

---

## HF ZeroGPU 配置详情

| 配置 | 硬件 | VRAM | 配额消耗 |
|------|------|------|---------|
| `large`（默认） | Half RTX Pro 6000 Blackwell | 48GB | 1× |
| `xlarge` | Full RTX Pro 6000 Blackwell | 96GB | 2× |

- **不能选 A100/H100**，仅 RTX Pro 6000 Blackwell 两种切分
- Free 5min/天，PRO $9/月=40min/天（xlarge 实际减半）
- 仅兼容 Gradio SDK，不支持 torch.compile
- **不支持断点续传**：每次调用是独立 GPU session，结束后状态清空

---

## ModelScope 免费资源详情

### Notebook GPU 额度（用户 Pablo 实测 2026-09-03）

| 环境 | 配置 | 剩余额度 | 镜像 |
|------|------|---------|------|
| CPU | 8核 32G | 长期免费 | ubuntu22.04-py312-torch2.3.1 |
| NVIDIA GPU | 8核 32G + **显存 24G**（CUDA） | **35h 45min**（原 36h，已用 15min） | cuda12.8.1-py312-torch2.10.0 |
| AMD GPU | 8核 200G + **显存 192G**（ROCm 7.2.3） | **100h**（NEW） | rocm7.2.3-py312-torch2.11.0 |

- 底层：阿里云 PAI-DSW（需绑定阿里云账号，绑定不产生费用）
- 单次运行 ≤ 10h，空闲 1h 自动关闭
- 持久化存储 100G（`/mnt/workspace/`）
- **额度一次性，用完不续**（需等平台活动或跳阿里云 PAI 付费）

### 魔粒（积分）系统

- 每日登录自动发 200 魔粒 + 绑定阿里云额外 50
- **魔粒不能换 Notebook GPU 时长**，只能抵扣 AIGC 生图/API-Inference
- API-Inference 抵扣：轻量 0.5/次、主流 1/次、旗舰 2/次

### XGPU 创空间申请

- URL：https://www.modelscope.cn/organization/xGPU-Explorers
- 人工审核，数天到数周
- Beta 期间免费，多卡型可选，高档 GPU 时长 < 低档

### ModelScope 托管的我们待测模型（11/12）

| 模型 | 仓库 | License |
|------|------|---------|
| EchoMimicV3 | BadToBest/EchoMimicV3 | apache-2.0 |
| LongCat-VA-1.5 | meituan-longcat/LongCat-Video-Avatar-1.5 | mit |
| InfiniteTalk | MeiGen-AI/InfiniteTalk | — |
| Wan2.2-S2V | Wan-AI/Wan2.2-S2V-14B | apache-2.0 |
| SoulX-FlashHead | Soul-AILab/SoulX-FlashHead-1_3B | apache-2.0 |
| FantasyTalking | amap_cvlab/FantasyTalking | apache-2.0 |
| SkyReels | Skywork/SkyReels-V3-R2V-14B | — |
| Sonic | antgroup/Sonic | — |
| LatentSync | bytedance-community/LatentSync-1.6 | openrail++ |
| LivePortrait | KwaiVGI/LivePortrait | mit |
| SadTalker | wwd123/sadtalker | apache-2.0 |
| Hallo3 | ❌ 未托管 | — |

---

## AMD GPU 兼容性

- AMD GPU **不支持 CUDA**，用 ROCm/HIP
- PyTorch ROCm 版复用 `torch.cuda` 接口，纯标准 PyTorch 模型几乎不用改代码
- **风险**：flash-attention/xformers 等可能有 CUDA 专有代码，实际兼容性未知
- **无专门的 AMD 兼容标记或社区适配版**（据调研）
- AMD 100h 用完是否可增加：目前一次性赠送，需等新活动
- AMD Radeon Cloud：https://developer#developer.amd.com.cn/radeon/（免费 Notebook，ROCm 生态）

---

## 连通性测试（2026-09-03）

| 平台 | 状态 | 备注 |
|------|------|------|
| ModelScope | ✅ token 有效 | 成功访问 Wan2.2-S2V-14B |
| Kaggle | ✅ 已配置 | Kernel v8 已 push |
| D-ID | ⚠️ HTTP 401 | key 可能过期 |
| HeyGen | ⚠️ HTTP 000 | 连接失败 |
| fal.ai | ❌ 无账号 | — |

---

## 实际测试路线

| 路线 | 费用 | 说明 |
|------|------|------|
| **Kaggle T4** | 免费（每周 30h） | LeapTalk/InfiniteTalk/EchoMimicV3 已在用 |
| **Modal A100/T4** | 按量付费（很便宜） | LongCat/InfiniteTalk/EchoMimicV3/Hallo3 已在用 |
| **ModelScope NVIDIA GPU** | 一次性 35h 免费 | 可用于新模型快速验证 |
| **ModelScope AMD GPU** | 一次性 100h 免费 | ROCm 生态，实验性 |
| **AutoDL** | 最便宜付费 | 比 fal.ai 便宜 30-50× |
| HF ZeroGPU | 免费 5min/天 | 量太少，仅 demo |
| fal.ai | 一次性 $10 | 零部署，仅快速验证 |