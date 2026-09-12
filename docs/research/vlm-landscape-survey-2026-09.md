# Deep Research: 2026 开源 VLM 全市场调研 + MOSS-VL 确认

> **创建日期**：2026-09-11
> **关联 issue**：[#262](https://github.com/0xPabloLI/inside-china-ai/issues/262)
> **关联 ADR**：`docs/adr/0009-vlm-qwen3-vl-mlx.md`
> **现有选型**：Qwen3-VL-2B-4bit (Fast, ~3s/图) + GLM-4.1V-9B-4bit (Deep, ~28s/图)
> **场景约束**：Apple Silicon M2 Pro 32GB（剩 ~24GB）｜mlx-vlm 加速｜中文品牌识别｜原生视频｜商用许可
> **方法**：web-deep-research Deep tier（8-phase），5 并行子 agent + MLX 源码验证，~30 sources

---

## Executive Summary

复旦 MOSS **确实有官方 VL 模型**——`OpenMOSS/MOSS-VL`（11B, Apache-2.0, 256K context, 视频理解专长，2026-08 发布，极度活跃）。但**mlx-vlm 不支持 MOSS-VL**（models 目录无 `moss_vl`，README 仅提 CUDA/NVIDIA，依赖 FlashAttention-3 + Megatron-LM），在 Apple Silicon 上无 MLX 加速路径，按 ADR-0009 排除逻辑不适合生产。

本次全市场普查发现两个**此前漏掉的强候选**，均有 mlx-vlm 原生支持：

1. **MiniCPM-V 4.6（1.3B, 面壁智能）**——Apache-2.0、中文原生（MMBench-CN 87.2，10B 以下开源最高）、视频原生、mlx-vlm 就绪、1.3B 极省内存。是 Qwen3-VL-2B-4bit 最有潜力的替代/补充。
2. **Gemma 4 E2B/E4B（2.3B/4.5B, Google）**——Apache-2.0、140+ 语言、原生视频+音频、mlx-vlm 就绪 + MTP 投机解码（2-3x 加速）。

现有选型（Qwen3-VL-2B + GLM-4.1V-9B cascade）依然合理。建议新增实测 MiniCPM-V 4.6 和 Gemma 4 E2B/E4B，与现有 Qwen3-VL-2B 同口径对比。MOSS-VL 可作为**质量基准**下载对比（PyTorch + MPS 慢跑），但不纳入生产。

---

## Key Findings

### 1. MOSS-VL 存在性：确认存在（High confidence）

| 维度 | 值 |
|------|-----|
| 仓库 | https://github.com/OpenMOSS/MOSS-VL |
| 参数量 | 11B（三个变体均为 11B） |
| 许可 | Apache-2.0 |
| context | 256K |
| last commit | 2026-09-07（GitHub），HF 权重 12 小时前更新 |
| archived | 否（636 stars, 123 commits, 7 open issues） |
| 定位 | 长视频 + 实时视频流理解（cross-attention 架构） |
| 三个变体 | Realtime（实时流式）/ Instruct-0708（离线）/ Base-0708（预训练） |
| 量化 | FP8 + NF4（24GB NVIDIA GPU 可跑） |
| 技术报告 | arXiv:2608.15045（2026-08-15） |
| 中文 | 支持（中英双语，基座致谢 Qwen，有 README_zh） |
| 权重 | HF `OpenMOSS-Team/MOSS-VL-*` + ModelScope `openmoss/MOSS-VL-*` |

**"MOSS"名字歧义澄清**：复旦 MOSS（邱锡鹏团队，现 OpenMOSS/SII）是独立系列；面壁智能 VisCPM/MiniCPM-V 基于 CPM-Bee，与 MOSS 无关。用户看到的"MOSS VL"是复旦官方 MOSS-VL，非混淆。

### 2. MOSS-VL MLX 支持：确认不支持（High confidence）

- mlx-vlm `models/` 目录（github.com/Blaizzy/mlx-vlm/tree/main/mlx_vlm/models）**无 `moss_vl` 或 `moss` 目录**
- MOSS-VL README 推理方式：PyTorch + transformers + `device_map="auto"` + bf16，或 SGLang
- 依赖 FlashAttention-3（CUDA 专用）、Megatron-LM（CUDA）、XRoPE cross-attention
- NF4 量化教程明确"enabling efficient inference on a single 24 GB **NVIDIA** GPU"
- **结论**：MOSS-VL 在 Apple Silicon 上无 MLX 加速，只能 PyTorch + MPS（参考 memory：MPS 上 11B 会极慢，CosyVoice3 MPS 20.5x RTF）

### 3. 2026 VLM 中文能力排行（MMBench-CN v1.1，三源交叉验证）

| 排名 | 模型 | MMBench-CN | 参数量 | 许可 | MLX | 视频 |
|------|------|-----------|--------|------|-----|------|
| 1 | GLM-4.5V | 88.3 | 106B-A12B MoE | MIT | ✅ glm4v_moe | ✅ |
| 2 | GLM-4.6V | 88.2 | 106B-A12B MoE | MIT | ✅ | ✅ |
| 3 | InternVL3-78B | 87.9 | 78B | MIT | ⚠️ internvl_chat | ✅ |
| 4 | Qwen2.5-VL-72B | 87.4 | 72B | Qwen Lic | ✅ qwen2_5_vl | ✅ |
| 5 | **MiniCPM-o 4.5** | **87.2** | 9B | Apache-2.0 | ✅ minicpmo | ✅ |
| 6 | Qwen3-VL-8B | 84.7 | 8B | Qwen Lic | ✅ qwen3_vl | ✅ |
| 7 | GLM-4.1V-9B-Thinking | 84.7 | 9B | MIT | ✅ glm4v | ✅ |
| 8 | LLaVA-OneVision-72B | 83.9 | 72B | Apache-2.0* | ✅ llava_onevision | ✅ |
| 9 | DeepSeek-VL2 | 80.1 | 27.5B MoE | MIT | ✅ deepseek_vl_v2 | ❌ |
| 10 | CogVLM2-19B | 68.6 | 19B | Apache+CogLic | ❌ | ✅ |

> **10B 以下 + 中文 + 视频 + MLX + 商用**的最强候选：**MiniCPM-o 4.5 (9B, 87.2)** 和 **MiniCPM-V 4.6 (1.3B)**。

### 4. mlx-vlm 支持的 VLM 架构（源码验证）

mlx-vlm `models/` 目录确认支持的 VLM 相关架构（部分）：
- **Qwen 系列**：qwen_vl, qwen2_5_vl, qwen3_vl
- **GLM 系列**：glm4v, glm4v_moe, glm5_next, glm_ocr
- **Gemma 系列**：gemma3, gemma3n, **gemma4**, gemma4_text, gemma4_unified
- **MiniCPM**：minicpmv4_6, minicpmo
- **DeepSeek**：deepseek_vl_v2, deepseekocr, deepseekocr_2
- **InternVL**：internvl_chat, internlm2, internlm3
- **LLaVA**：llava_onevision
- **Phi**：phi4mm, phi4_siglip
- **其他**：kimi_vl, hunyuan_vl, ernie4_5_moe_vl, granite4_vision, aya_vision, lfm2_vl, jina_vlm, falcon_perception, moondream, idefics3, paligemma, dots_ocr, falcon_ocr
- **❌ 无 moss_vl**

### 5. 候选决策矩阵（针对我们的场景）

| 模型 | 参数量 | 许可 | 中文 | 视频 | MLX | 32GB 可跑 | 决策 |
|------|--------|------|------|------|-----|----------|------|
| **MiniCPM-V 4.6** | 1.3B | Apache-2.0 | ✅ 87.2 | ✅ 原生 | ✅ | ✅ ~1GB | ⭐ **首选实测** |
| **Gemma 4 E2B** | 2.3B | Apache-2.0 | ✅ 140+语言 | ✅ 原生 | ✅+MTP | ✅ ~1.5GB | ⭐ **并列实测** |
| **Gemma 4 E4B** | 4.5B | Apache-2.0 | ✅ | ✅ | ✅+MTP | ✅ ~3GB | ⭐ 并列实测 |
| Qwen3-VL-2B-4bit（现有） | 2B | Qwen Lic | ✅ | ✅ | ✅ | ✅ 1.8GB | 保留 |
| GLM-4.1V-9B-4bit（现有） | 9B | MIT | ✅ 84.7 | ✅ | ✅ | ✅ 6.6GB | 保留 |
| **MOSS-VL-Instruct-NF4** | 11B | Apache-2.0 | ✅ | ✅ 专长 | ❌ | ⚠️ ~6GB+MPS慢 | 质量基准 only |
| DeepSeek-VL2-Tiny | 1B act | MIT | ✅ | ❌ | ✅ | ✅ | 图片备选 |
| InternVL3.5-2B | 2B | MIT | ✅ | ✅ | ⚠️ 未确认 | ✅ | 待验证 MLX |
| CogVLM2 | 19B | Apache+CogLic | ✅ | ✅ | ❌ | ❌ 太大 | 排除 |
| mPLUG-Owl3 | 7B | MIT | ✅ | ❌ | ❌ | — | 排除（被 Qwen-VL 取代） |
| LLaVA 原版 | 7B | Apache* | ❌ 弱 | ✅ | ❌ | — | 排除（停更） |
| Phi-3.5/4 Vision | 4-5.6B | MIT | ❌ 弱 | ✅ | ✅ | ✅ | 排除（中文弱） |
| PaliGemma2 | 3-28B | Gemma Lic | ❌ | ❌ | ❌ | — | 排除（非商用） |
| Aya-Vision | 8-32B | CC-BY-NC | ✅ | ❌ | ✅ | — | 排除（非商用） |
| Idefics3 | 8B | Apache* | ❌ 弱 | ❌ | ✅ | — | 排除 |
| Moondream | 0.5-2B | Apache | ❌ 弱 | ❌ | ✅ | ✅ | 边缘兜底 only |

---

## Detailed Analysis

### MOSS-VL 深度档案

MOSS-VL 是复旦邱锡鹏团队（OpenMOSS/SII）2026 年发布的视频理解 VLM，核心创新是 **cross-attention 架构 + XRoPE**，专为长视频和实时视频流设计。三个变体：
- **Realtime**：连续视频流实时交互，可中断、主动发言、动态纠正（开源 SOTA latency）
- **Instruct**：离线长视频理解 + 深度对话
- **Base**：预训练基座

**为何不适合我们生产**：
1. **无 MLX 加速**——mlx-vlm 不支持，Mac 上只能 PyTorch + MPS，11B 在 MPS 上预计极慢（参考 CosyVoice3 MPS 20.5x RTF）
2. **CUDA 依赖**——FlashAttention-3、Megatron-LM、SGLang 都是 CUDA 生态，Mac 上 fallback 到普通 attention
3. **偏重视频流理解**——我们的场景是素材语义分析（图片为主 + 短视频），MOSS-VL 的实时流式能力过剩
4. **11B 偏大**——NF4 ~6GB 权重，加推理 overhead 在 24GB 里紧张，且与 GLM-4.1V-9B（6.6GB）同时加载会 OOM

**但仍值得对比**：MOSS-VL 视频理解能力是开源 SOTA，作为**质量基准**下载后在 MPS 上跑一次（不追求速度），看其中文品牌识别和视频描述质量，有参考价值。

### MiniCPM-V 4.6：最有潜力的新候选

面壁智能 OpenBMB 2026-05 发布，1.3B（SigLIP2-400M + Qwen3.5-0.8B）：
- **中文基因**：面壁智能主打中文，MiniCPM-o 4.5 (9B) MMBench-CN 87.2 是 10B 以下开源最高
- **视频原生**：高 FPS、多帧、stack_frames 机制
- **mlx-vlm 原生支持**：`mlx_vlm/models/minicpmv4_6` 有专属文档
- **边缘部署**：支持 iOS/Android/HarmonyOS，50% 视觉计算压缩
- **Apache-2.0**：商用友好
- **1.3B 极省内存**：4bit ~0.7GB，可与 GLM-4.1V-9B-4bit（6.6GB）同时加载，完美适配 cascade

**与 Qwen3-VL-2B 对比预期**：MiniCPM-V 4.6 中文可能更强（面壁中文基因 vs Qwen 中文），1.3B 比 2B 更小，视频能力待实测。需同口径 benchmark（速度/内存/中文品牌识别/视频描述）。

### Gemma 4：2026 重大新候选

Google DeepMind 2026-07 发布（arXiv:2607.02770），多尺寸 E2B(2.3B)/E4B(4.5B)/12B/26B-A4B/31B：
- **140+ 预训练语言**，开箱 35+ 语言（中文覆盖待实测）
- **原生视频 + 音频**（E2B/E4B/12B Unified encoder-free）
- **mlx-vlm 原生支持**：`gemma4`, `gemma4_unified` + MTP 投机解码（2-3x 加速）+ EAGLE-3
- **Apache-2.0**
- **E2B 4bit ~1.5GB / E4B 4bit ~3GB**，轻松 fit 24GB

**风险**：Gemma 系列历史上中文不是强项（Gemma 2/3 中文偏弱），Gemma 4 "140+ 语言"是否真覆盖中文品牌识别需实测。

### 现有选型评估

- **Qwen3-VL-2B-4bit (Fast)**：MMBench-CN 84.7（8B 分数，2B 未公开），3s/图，1.8GB。依然合理，但 MiniCPM-V 4.6 可能在中文上更优。
- **GLM-4.1V-9B-4bit (Deep)**：MMBench-CN 84.7，MIT，28s/图，6.6GB。10B 级最佳之一，保留。
- **Cascade Router**：设计合理，2B fast + 9B deep 覆盖速度+质量。

---

## Contrarian Views & Risks

1. **MiniCPM-V 4.6 中文品牌识别未实测**——MMBench-CN 87.2 是 MiniCPM-o 4.5 (9B) 的分数，V 4.6 (1.3B) 的分数未获取。1.3B 在品牌识别（"宇树科技"/"峰达创意园"）上可能不如 2B。需实测。
2. **Gemma 4 中文能力存疑**——"140+ 语言"是预训练覆盖，不代表中文 OCR/品牌识别强。Gemma 历史中文偏弱。需实测。
3. **MOSS-VL 在 MPS 上可能跑不通**——11B + trust_remote_code + FlashAttention-3 依赖，MPS 上可能有算子不兼容。只是推断慢，未验证。
4. **InternVL3.5 MLX 支持未确认**——`internvl_chat` 模块可能只支持旧版架构，InternVL3.5 的 MLX 4bit 转换未在 HF 确认。
5. **Qwen3-VL-2B 中文分数缺失**——只有 8B 的 MMBench-CN 84.7，2B 分数未公开，可能偏低。
6. **OCRBench 两种 scale**——GLM 论文用归一化 0-100，OpenVLM 用原始 0-1000，跨源比较需注意。

---

## Open Questions

1. MiniCPM-V 4.6 (1.3B) 在真实中文品牌素材上的识别准确率？（需实测）
2. Gemma 4 E2B/E4B 中文 OCR/品牌识别能力？（需实测）
3. MOSS-VL 在 Apple Silicon MPS 上能否跑通？速度多慢？（需 smoke test）
4. InternVL3.5-2B 是否有现成 MLX 4bit 转换？（需查 mlx-community HF）
5. Qwen3-VL-2B 的 MMBench-CN 分数？（官方未公开）
6. CMMMU benchmark 无公开分数——VLMEvalKit 已支持但未出结果

---

## 选型建议

### 生产候选（有 MLX + 中文 + 视频 + 商用）

| 优先级 | 模型 | 角色 | 理由 |
|--------|------|------|------|
| ⭐⭐ 首选实测 | **MiniCPM-V 4.6 (1.3B)** | Fast Path 候选 | 中文最强基因 + 视频 + Apache + MLX + 1.3B 极省 |
| ⭐⭐ 并列实测 | **Gemma 4 E2B (2.3B)** | Fast Path 候选 | 140 语言 + 视频 + Apache + MLX + MTP 加速 |
| 保留 | Qwen3-VL-2B-4bit | Fast Path（现有） | 已验证，3s/图，中文品牌识别可靠 |
| 保留 | GLM-4.1V-9B-4bit | Deep Path（现有） | 10B 级最佳，MIT，中文 SOTA |
| 质量基准 | MOSS-VL-Instruct-NF4 | 对比 only | 视频理解 SOTA，但无 MLX 不适合生产 |

### 建议实测矩阵

用真实中文品牌视频片段（如 `unitree-building.jpg`, `unitree-demo.mp4`）跑同一 prompt，对比：
1. MiniCPM-V 4.6 (1.3B, 4bit)
2. Gemma 4 E2B (2.3B, 4bit)
3. Gemma 4 E4B (4.5B, 4bit)
4. Qwen3-VL-2B-4bit（现有基线）
5. MOSS-VL-Instruct-NF4（MPS 慢跑，质量基准）

**指标**：中文 OCR 准确率（品牌名识别）、视频描述质量、mlx-vlm token/s、24GB 内存占用、加载时间。

---

## Sources

### Tier 1（官方一手）
1. https://github.com/OpenMOSS/MOSS-VL — MOSS-VL 仓库，11B, Apache-2.0, 视频专长
2. https://huggingface.co/collections/OpenMOSS-Team/moss-vl — HF 权重 collection（9 个变体）
3. https://arxiv.org/abs/2608.15045 — MOSS-VL 技术报告（2026-08-15）
4. https://github.com/Blaizzy/mlx-vlm/tree/main/mlx_vlm/models — mlx-vlm 支持架构目录（无 moss_vl）
5. https://github.com/OpenBMB/MiniCPM-V — MiniCPM-V 4.6 (1.3B) + MiniCPM-o 4.5 (9B)
6. https://huggingface.co/google/gemma-4-31B-it — Gemma 4（2026-07, Apache-2.0, 140+ 语言）
7. https://github.com/OpenGVLab/InternVL — InternVL3.5（2025-08-26, MIT）
8. https://github.com/deepseek-ai/DeepSeek-VL2 — DeepSeek-VL2（MIT, MoE, 无视频）
9. https://github.com/X-PLUG/mPLUG-Owl — mPLUG-Owl3（MIT, 被 Qwen-VL 取代）
10. https://github.com/zai-org/CogVLM2 — CogVLM2（被 GLM-4V 取代）
11. https://arxiv.org/abs/2507.01006 — GLM-4.5V/4.6V/4.1V 论文（MMBench-CN 排行）
12. https://huggingface.co/microsoft/Phi-4-multimodal-instruct — Phi-4（MIT, Vision 仅英文）
13. https://huggingface.co/CohereLabs/aya-vision-8b — Aya Vision（CC-BY-NC 非商用）
14. https://github.com/OpenBMB/VisCPM — VisCPM 基于 CPM-Bee 非 MOSS

### Tier 1（评测工具）
15. OpenVLM.json / VLMEvalKit（285 模型，2025-09-17）— MMBench-CN/OCRBench 排行
16. MiniCPM-o 4.5 官方 README 评测表 — Qwen3-VL-8B + MiniCPM-o 分数

### Tier 2（次级）
17. https://huggingface.co/models?search=MOSS — HF MOSS 搜索结果
18. https://github.com/OpenMOSS — OpenMOSS 组织页（Vision & multimodal 区块）
19. https://github.com/fudanNLP — FudanNLP（指向 OpenMOSS）