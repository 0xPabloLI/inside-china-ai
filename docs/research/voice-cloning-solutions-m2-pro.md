# 语音克隆/TTS 模型调研报告：适配 Apple M2 Pro（32GB）

> **调研日期**：2026-08-10
> **目标设备**：MacBook Pro (Mac14,10), Apple M2 Pro, 32 GB, macOS 26.5.1, Metal 4
> **核心需求**：(1) 语音克隆 — 用少量参考音频生成目标说话人的语音；(2) 在 Apple Silicon 上本地推理；(3) 支持英文为主的视频旁白
> **方法论**：多源交叉验证，来源包括 arxiv 论文、GitHub README/API、HuggingFace 模型页、CosyVoice/Fish Audio 官方 benchmark
> **关联文档**：`docs/research/digital-human-solutions-m2-pro.md`（数字人）、`docs/research/voice-prosody-hook-optimization.md`（prosody 优化）、`docs/video-workflow.md`（管线配置）

---

## 1. 执行摘要

**当前状态**（2026-09-03 与代码核对，以 `scripts/short-video/lib/tts/registry.mjs` 为准）：管线为 4 级 TTS 引擎降级链（**F5-TTS-MLX → Qwen3-TTS → edge-tts → macOS say**）。F5-TTS-MLX 为默认引擎（rhythm/自然停顿最佳，内部 duration 控制），Qwen3-TTS 为快速备选（MPS 原生）。CosyVoice 3 因 MPS RTF 39.8x 不实用，**从未集成进管线**；XTTS v2 / Kokoro 已从 registry 移除。本地模型统一使用 venv `~/.video-tts-env`（Python 3.12，F5 + Qwen + whisperx 共用）。

**2024-2026 关键变化**：TTS 领域经历了从"GAN/VITS 为主"到"LLM-based + Flow Matching 为主"的范式转移。2025-2026 年涌现了大量基于 Qwen2.5/Llama 等大语言模型 backbone 的 TTS 系统，质量显著提升，但多数需要 NVIDIA CUDA。

**当前推荐路径**（按优先级排序）：

| 优先级 | 方案                       | 类型 | 质量       | M2 Pro 兼容               | 商用                | 测试状态                    |
| ------ | -------------------------- | ---- | ---------- | ------------------------- | ------------------- | --------------------------- |
| 1      | **F5-TTS-MLX**（管线默认） | 本地 | ⭐⭐⭐⭐   | ✅ MLX 原生               | ⚠️ 权重 CC-BY-NC    | ✅ **已部署，默认引擎**     |
| 2      | **Qwen3-TTS**（备选）      | 本地 | ⭐⭐⭐⭐⭐ | ✅ **MPS 已验证**         | ✅ Apache-2.0       | ✅ **已采用**               |
| —      | **CosyVoice 3.0**          | 本地 | ⭐⭐⭐⭐⭐ | ⚠️ MPS RTF 39.8x          | ✅ Apache-2.0       | ❌ 未集成进管线（实测过慢） |
| 4      | **Zonos**（已测试）        | 本地 | ⭐⭐⭐⭐⭐ | ⚠️ CPU only（MPS 有 bug） | ✅ Apache-2.0       | ✅ 已测试                   |
| 5      | **Sesame CSM**             | 本地 | ⭐⭐⭐⭐   | ❌ MPS 卡死，CPU RTF 120x | ✅ Apache-2.0       | ✅ **已测试**               |
| 5b     | **Spark-TTS**              | 本地 | ⭐⭐⭐⭐   | ✅ **MPS 已验证**         | ⚠️ 模型 CC-BY-NC-SA | ✅ **已测试**               |
| 5c     | **GPT-SoVITS**             | 本地 | ⭐⭐⭐⭐   | ❌ CPU RTF 321x           | ✅ MIT              | ✅ **已测试**               |
| 6      | **VoxCPM2**                | 本地 | ⭐⭐⭐⭐⭐ | ❌ 需 CUDA 12.0+          | ✅ Apache-2.0       | 不兼容                      |
| 6      | **Fish Speech S2**         | 本地 | ⭐⭐⭐⭐⭐ | ❌ 需 CUDA                | ❌ 非商用           | 不兼容                      |
| 7      | **ElevenLabs API**         | 云端 | ⭐⭐⭐⭐⭐ | ✅ 无需 GPU               | ✅                  | 业界 SOTA                   |
| 8      | **OpenAI TTS API**         | 云端 | ⭐⭐⭐⭐   | ✅ 无需 GPU               | ✅                  | 无克隆                      |
| 9      | **XTTS v2**                | 本地 | ⭐⭐⭐     | ✅ MPS hybrid             | ✅ MPL-2.0          | ❌ 已从 registry 移除       |
| 10     | **Kokoro**                 | 本地 | ⭐⭐⭐     | ✅ CPU 原生               | ✅ Apache-2.0       | ❌ 已从 registry 移除       |

---

## 2. 技术架构对比（关键）

不同模型的技术路线直接决定了语音质量、推理速度和硬件需求。这是理解质量差异的核心框架。

### 2.1 五种技术路线

| 技术路线          | 原理                                | 质量上限   | 推理速度      | 代表模型                                               | M2 Pro 可行性   |
| ----------------- | ----------------------------------- | ---------- | ------------- | ------------------------------------------------------ | --------------- |
| **Flow Matching** | ODE 流匹配生成 mel → vocoder → 波形 | ⭐⭐⭐⭐⭐ | 中等          | F5-TTS, CosyVoice                                      | ✅ MLX 移植已有 |
| **LLM-based AR**  | 大语言模型自回归预测离散音频 token  | ⭐⭐⭐⭐⭐ | 慢            | GPT-SoVITS, ChatTTS, Qwen3-TTS, Fish Speech, Index-TTS | ⚠️ 多需 CUDA    |
| **Diffusion**     | 扩散去噪生成语音表征                | ⭐⭐⭐⭐   | 慢            | StyleTTS2, VoxCPM2, Parler-TTS                         | ⚠️ 部分可 MPS   |
| **GAN/VITS**      | 生成对抗网络 / 变分推断，非自回归   | ⭐⭐⭐     | ⭐⭐⭐⭐⭐ 快 | Kokoro, MeloTTS, OpenVoice, Piper                      | ✅ CPU 友好     |
| **Dual-AR**       | 双自回归：语义 AR + 声学 AR         | ⭐⭐⭐⭐⭐ | 中等          | Fish Speech S2                                         | ❌ 需 CUDA      |

### 2.2 Flow Matching 详解（F5-TTS 的技术基础）

**Flow Matching** 是 Normalizing Flow 和 Diffusion 的统一视角。核心思想：学习一个从噪声分布到数据分布的连续变换（ODE 轨迹）。

**F5-TTS 的流程**：

1. 参考音频 → 文本编码（对比式语义模型）+ 音频编码
2. 目标文本 → 文本编码
3. DiT（Diffusion Transformer）+ ConvNeXt V2 在 mel 频谱域做 Flow Matching 去噪
4. Sway Sampling：推理时的流步采样策略，显著提升性能
5. Vocoder（BigVGAN）→ 24kHz 波形

**与 E2 TTS 的关系**：F5-TTS 是 E2 TTS（arxiv 2406.18009）的改进版，用 DiT + ConvNeXt V2 替换了 Flat-UNet Transformer，训练更快、推理更好。

### 2.3 LLM-based AR 详解（2025-2026 主流趋势）

**核心思路**：把语音离散化为 token 序列，让 LLM 像生成文本一样"生成"语音。

**典型架构**：

```
文本 → 文本 tokenizer → LLM (Qwen2.5/Llama/etc.) → 离散音频 token → Vocoder/Codec → 波形
参考音频 → 音频编码器 → speaker embedding → ↑
```

**token 化方案对比**：

| 方案                               | 帧率       | 代表                    | 特点                                     |
| ---------------------------------- | ---------- | ----------------------- | ---------------------------------------- |
| RVQ (Residual Vector Quantization) | ~21-50 Hz  | Fish Speech, Sesame CSM | 多 codebook 残差编码                     |
| 语义+声学分离                      | ~7.5-12 Hz | VibeVoice, Qwen3-TTS    | 语义 token 理解内容，声学 token 恢复音质 |
| 连续表征（无 tokenizer）           | —          | VoxCPM2                 | 直接生成连续语音表征，跳过离散化         |

**为什么 LLM-based 是主流**：

1. **可扩展性**：LLM backbone 随参数量增加质量提升
2. **上下文理解**：LLM 天然理解文本语义，prosody 更自然
3. **多语言**：LLM 预训练已覆盖大量语言
4. **可控性**：可通过 prompt/instruct 控制情感、语速、风格
5. **流式推理**：支持 token-by-token 生成，低延迟

**代价**：推理速度比 GAN/VITS 慢（自回归生成），通常需要 GPU 加速。

### 2.4 技术路线演进时间线

```
2020 ─── GAN 时代 ───────────────────────────────────────────────────────
  Wav2Lip (GAN), HiFi-GAN, VITS

2023 ─── VITS 成熟期 ─────────────────────────────────────────────────────
  OpenVoice V2, MeloTTS, StyleTTS2, Bark, Piper

2024 ─── Flow Matching + LLM-TTS 兴起 ───────────────────────────────────
  F5-TTS (Flow Matching), ChatTTS (LLM), GPT-SoVITS (LLM),
  CosyVoice (Flow Matching), XTTS v2 (AR), Fish Speech v1

2025 ─── LLM-TTS 爆发 ───────────────────────────────────────────────────
  Spark-TTS (Qwen2.5), Sesame CSM (Llama), Orpheus-TTS (Llama-3b),
  Zonos (Transformer), Parler-TTS (Diffusion), Chatterbox,
  Index-TTS, CosyVoice 2.0, GLM-TTS, FireRedTTS2

2026 ─── RL 对齐 + 多模态 ────────────────────────────────────────────────
  Fish Speech S2 (Dual-AR + RL), Qwen3-TTS (Multi-codebook LM),
  VoxCPM2 (Diffusion AR, 2B), Fun-CosyVoice3 (RL),
  VibeVoice (ICLR 2026 Oral)
```

---

## 3. 开源本地模型评估

### 3.1 ✅ F5-TTS-MLX — 已部署，管线默认引擎

| 属性            | 详情                                                           |
| --------------- | -------------------------------------------------------------- |
| **来源**        | 上海交大 X-LANCE 实验室，arxiv 2410.06885                      |
| **GitHub**      | github.com/SWivid/F5-TTS（15,090 stars）                       |
| **MLX 移植**    | github.com/lucasnewman/f5-tts-mlx（644 stars）                 |
| **HuggingFace** | `SWivid/F5-TTS`（742K downloads, 1,191 likes）                 |
| **技术原理**    | Flow Matching + DiT (Diffusion Transformer) + ConvNeXt V2      |
| **参数量**      | 0.3B                                                           |
| **采样率**      | 24kHz                                                          |
| **许可证**      | 代码 MIT；**模型权重 CC-BY-NC-4.0**（非商用）⚠️ 见下方深度分析 |
| **M2 Pro 兼容** | ✅ MLX 原生支持，已在 `~/.f5-tts-env` 部署                     |
| **性能**        | 约 2-3x 实时（MLX 加速），峰值 ~7GB 内存                       |
| **评估结论**    | ✅ **已部署**，管线默认 TTS 引擎，已在数十个视频中验证         |

**⚠️ 许可证深度分析（2026-08-10 新发现）**：

管线实际使用的模型是 `lucasnewman/f5-tts-mlx`（HuggingFace 标注 MIT），而非原作者的 `SWivid/F5-TTS`（CC-BY-NC-4.0）。但通过文件 hash 比对发现：

| 模型仓库                             | HF 许可证标签    | 1.3GB 权重文件 hash               |
| ------------------------------------ | ---------------- | --------------------------------- |
| `SWivid/F5-TTS`（原作者）            | **CC-BY-NC-4.0** | `670900fd14e6...`                 |
| `lucasnewman/f5-tts-mlx`（管线使用） | MIT              | `670900fd14e6...`（**同一文件**） |

**结论**：`lucasnewman` 将原作者 CC-BY-NC-4.0 的权重转成 MLX 格式后重新标注为 MIT 发布，但 1.3GB 权重文件 hash 完全相同。CC-BY-NC-4.0 是版权许可，不允许第三方通过重新托管改变许可条款。格式转换（PyTorch → MLX）一般不构成转换性使用（transformative use），原始 CC-BY-NC-4.0 仍然适用。实际风险低（开源 ML 社区普遍如此），但正式商业化时需注意。**Qwen3-TTS (Apache-2.0) 完全无此问题。**

**实战教训**（来自 [[memory:17857691344010182898]]）：

1. **duration 参数必须显式设置** — F5 generate() 的 duration 是总时长（ref + target），不设会生成 0.03s 音频。公式：`duration = ref_dur + word_count / 2.5`
2. **ref-text 必须精确匹配 ref-audio** — 不匹配时 F5 会把参考文本泄漏到生成语音中
3. **跳过 silenceremove** — F5 音频振幅低于 -35dB 阈值，silenceremove 会全删
4. **estimate_duration=True 不可靠** — 基于参考音频语速估算，参考音频说得慢会过长

**Benchmark 表现**（来自 CosyVoice 评测）：

- 中文 CER 1.52%, 说话人相似度 74.1%
- 英文 WER 2.00%, 说话人相似度 64.7%
- 困难集 CER 8.67%, SS 71.3%

### 3.2 🔥 Zonos — 44kHz 高质量，支持 macOS（新发现）

| 属性            | 详情                                                         |
| --------------- | ------------------------------------------------------------ |
| **来源**        | Zyphra, Inc.                                                 |
| **GitHub**      | github.com/Zyphra/Zonos（7,235 stars）                       |
| **HuggingFace** | `Zyphra/Zonos-v0.1-transformer`（67K downloads, 435 likes）  |
| **技术原理**    | eSpeak 音素化 → DAC token 预测 → Transformer/Hybrid backbone |
| **采样率**      | **44kHz**（原生，远高于 F5-TTS 的 24kHz）                    |
| **许可证**      | **Apache-2.0**（商用 OK）                                    |
| **M2 Pro 兼容** | ✅ **README 明确支持 macOS**（`brew install espeak-ng`）     |
| **VRAM 需求**   | 6GB+（Hybrid 需要 NVIDIA 3000+，Transformer 可纯 CPU/MPS）   |
| **语音克隆**    | 10-30s 参考音频即可克隆                                      |
| **可控参数**    | 语速、音调、音频质量、情感（喜/怒/哀/惧）                    |
| **多语言**      | 英语、日语、中文、法语、德语                                 |
| **推理速度**    | RTF ~2x on RTX 4090                                          |

**测试优先级**：⭐⭐⭐⭐⭐（最高 — Apache-2.0 + macOS 原生支持 + 44kHz）

**两个变体**：

- `Zonos-v0.1-transformer`：纯 Transformer，可在 macOS 运行
- `Zonos-v0.1-hybrid`：混合架构，需要 NVIDIA 3000+ GPU

### 3.3 🔥 Fun-CosyVoice 3.0 — 阿里，Flow Matching + RL（最新）

| 属性                | 详情                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| **来源**            | 阿里巴巴 FunAudioLLM                                                         |
| **GitHub**          | github.com/FunAudioLLM/CosyVoice（22,659 stars）                             |
| **HuggingFace**     | `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`                                       |
| **技术原理**        | LLM (Qwen) 预测语义 token + Flow Matching 生成声学特征                       |
| **版本**            | v1.0 (300M, 2024.07) → v2.0 (0.5B, 2024.12) → Fun-CosyVoice3 (0.5B, 2025.12) |
| **采样率**          | 24kHz                                                                        |
| **许可证**          | **Apache-2.0**（商用 OK）                                                    |
| **M2 Pro 兼容**     | ⚠️ MPS 可用但极慢（RTF 39.8x），CPU 更慢                                     |
| **语言支持**        | 9 种语言（中/英/日/韩/德/西/法/意/俄）+ 18 种中文方言                        |
| **M2 Pro 测试结果** | MPS RTF 39.83x（不可用），内存 1616 MB，加载 112.2s，输出 11.0s              |
| **特色**            | 发音纠正（拼音/CMU 音素）、文本归一化、双向流式、指令控制                    |

**Benchmark 表现**（来自官方评测，Fun-CosyVoice3-0.5B-RL）：

- 中文 CER **0.81%**, SS 77.4%
- 英文 WER 1.68%, SS 69.5%
- 困难集 CER **5.44%**, SS 75.0%
- **RL 版本在中文 CER 上超越所有开源模型**

**测试优先级**：⭐⭐⭐⭐⭐（Apache-2.0 + RL 对齐 + 9 语言 + 方言）

### 3.4 🔥 Sesame CSM — Llama backbone，MPS 代码已有

| 属性                | 详情                                                         |
| ------------------- | ------------------------------------------------------------ |
| **来源**            | Sesame AI Labs                                               |
| **GitHub**          | github.com/SesameAILabs/csm（14,716 stars）                  |
| **HuggingFace**     | `Sesame/csm-1b`（185K downloads, 2,424 likes）               |
| **技术原理**        | Llama-3.2-1B backbone + Mimi 音频 codec → RVQ token 预测     |
| **参数量**          | 1B                                                           |
| **采样率**          | 24kHz                                                        |
| **许可证**          | **Apache-2.0**（商用 OK）                                    |
| **M2 Pro 兼容**     | ❌ **MPS 生成卡死**（进程挂起，CPU 0%），CPU 可用但极慢      |
| **HF Transformers** | ✅ 已集成到 HuggingFace Transformers v4.52.1+                |
| **特色**            | 对话式语音生成（支持上下文多轮对话）、2 说话人对话           |
| **GPU 需求**        | 官方推荐 CUDA，但代码支持 MPS/CPU                            |
| **M2 Pro 测试结果** | CPU RTF 120.26x（19分钟生成9.5s），内存 3577 MB，加载 292.3s |

**测试优先级**：⭐⭐⭐⭐（Apache-2.0 + MPS 明确支持 + HF 集成）

### 3.5 ⚠️ VoxCPM2 — OpenBMB，Tokenizer-Free 扩散 AR（不兼容 M2 Pro）

| 属性            | 详情                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| **来源**        | OpenBMB（面壁智能），基于 MiniCPM-4 backbone                             |
| **GitHub**      | github.com/OpenBMB/VoxCPM（35,135 stars）                                |
| **HuggingFace** | `OpenBMB/VoxCPM2`（688K downloads, 1,522 likes）                         |
| **技术原理**    | **Tokenizer-Free** 扩散自回归 — 直接生成连续语音表征，跳过离散化         |
| **参数量**      | 2B                                                                       |
| **训练数据**    | 200 万小时+ 多语言语音                                                   |
| **采样率**      | **48kHz**（接受 16kHz 参考音频，内置超分辨率）                           |
| **许可证**      | **Apache-2.0**（商用 OK）                                                |
| **M2 Pro 兼容** | ❌ **需要 CUDA 12.0+**（PyTorch ≥ 2.5.0, CUDA ≥ 12.0）                   |
| **语言支持**    | 30 种语言 + 9 种中文方言                                                 |
| **特色**        | 语音设计、可控克隆、终极克隆（保留所有声音细节）、RTF ~0.13（vLLM 加速） |

**Benchmark 表现**（来自 CosyVoice 评测）：

- 中文 CER **0.93%**, SS **77.2%**（开源模型中文最佳之一）
- 英文 WER 1.85%, SS **72.9%**（开源模型英文 SS 最佳）
- 困难集 CER 8.87%, SS 73.0%

**测试优先级**：⭐⭐（质量极高但 M2 Pro 不兼容，如获远程 GPU 可优先测试）

### 3.6 ⚠️ Fish Speech S2 Pro — Dual-AR + RL（不兼容 M2 Pro）

| 属性            | 详情                                                                                   |
| --------------- | -------------------------------------------------------------------------------------- |
| **来源**        | Fish Audio                                                                             |
| **GitHub**      | github.com/fishaudio/fish-speech（32,113 stars）                                       |
| **HuggingFace** | `fishaudio/s2-pro`（767 likes）                                                        |
| **技术原理**    | **Dual-AR 架构**：Slow AR (4B, 语义) + Fast AR (400M, 声学 9 codebooks) + GRPO RL 对齐 |
| **参数量**      | 4B（Slow）+ 400M（Fast）                                                               |
| **训练数据**    | 1000 万小时+，80+ 语言                                                                 |
| **许可证**      | ❌ **FISH AUDIO RESEARCH LICENSE**（非商用）                                           |
| **M2 Pro 兼容** | ❌ 需 NVIDIA GPU（SGLang 推理）                                                        |
| **特色**        | 子词级 `[tag]` 情感控制（15000+ tags）、多说话人、多轮对话、流式 RTF 0.195             |

**Benchmark 表现**（来自 Fish Audio 官方）：

- Seed-TTS Eval WER: 中文 **0.54%**（所有模型最佳），英文 **0.99%**（所有模型最佳）
- Audio Turing Test: **0.515** 后验均值（超越 Seed-TTS 24%，超越 MiniMax 33%）
- EmergentTTS-Eval 胜率: **81.88%**（所有模型最高）

**不兼容原因**：Dual-AR 架构需要 SGLang/vLLM 加速推理，这些推理引擎需要 NVIDIA CUDA。

### 3.7 ⚠️ Qwen3-TTS — 阿里通义，多码书 LM（需 CUDA）

| 属性            | 详情                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| **来源**        | 阿里云 Qwen 团队                                                                   |
| **GitHub**      | github.com/QwenLM/Qwen3-TTS（12,878 stars）                                        |
| **技术原理**    | 离散多码书 LM（Discrete Multi-Codebook LM），非 DiT 架构，Qwen3-TTS-Tokenizer-12Hz |
| **参数量**      | 0.6B / 1.7B                                                                        |
| **许可证**      | **Apache-2.0**（商用 OK）                                                          |
| **M2 Pro 兼容** | ⚠️ 官方推荐 FlashAttention 2 + CUDA，但底层是 HF Transformers，MPS 可能可行        |
| **语言支持**    | 10 种语言（中/英/日/韩/德/法/俄/葡/西/意）                                         |
| **特色**        | 语音克隆（3 秒参考）、语音设计、自然语言声音控制、双轨流式（延迟 97ms）            |
| **变体**        | Base（克隆）、CustomVoice（9 预置音色）、VoiceDesign（文本描述生成音色）           |

**Benchmark 表现**（来自 Fish Audio 评测）：

- Seed-TTS Eval WER: 中文 0.77%, 英文 1.24%

**测试优先级**：⭐⭐⭐（Apache-2.0 + 10 语言 + 低延迟，但 MPS 兼容不确定）

### 3.8 ⚠️ ChatTTS — 对话 TTS（非商用）

| 属性            | 详情                                                |
| --------------- | --------------------------------------------------- |
| **来源**        | 2noise                                              |
| **GitHub**      | github.com/2noise/ChatTTS（39,757 stars）           |
| **HuggingFace** | `2Noise/ChatTTS`（1,665 likes）                     |
| **技术原理**    | LLM-based 自回归，专为对话场景优化                  |
| **训练数据**    | 10 万小时中英文（开源版为 4 万小时预训练版）        |
| **许可证**      | 代码 AGPL-3.0；**模型 CC-BY-NC-4.0**（非商用）      |
| **M2 Pro 兼容** | ⚠️ PyTorch，MPS 可能可行                            |
| **特色**        | 细粒度 prosody 控制（笑声、停顿、语气词）、多说话人 |
| **限制**        | 开源版有高频噪声 + MP3 压缩（防滥用），学术用途     |

### 3.9 ⚠️ GPT-SoVITS — 少样本克隆（60K stars 最热门）

| 属性                | 详情                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **来源**            | RVC-Boss                                                                                                                                  |
| **GitHub**          | github.com/RVC-Boss/GPT-SoVITS（**60,627 stars**，TTS 领域最高）                                                                          |
| **技术原理**        | GPT 预测语义 token + SoVITS 声码器                                                                                                        |
| **许可证**          | **MIT**（商用 OK）                                                                                                                        |
| **M2 Pro 兼容**     | ⚠️ CPU 可用（`is_half=False`），MPS 未测试                                                                                                |
| **特色**            | **1 分钟参考音频即可克隆**，中英双语，WebUI，支持微调                                                                                     |
| **优势**            | 社区最大、文档最全、工具链最完善                                                                                                          |
| **劣势**            | 质量不如 Fish Speech S2 / CosyVoice 3.0 / VoxCPM2 等新一代模型                                                                            |
| **M2 Pro 测试结果** | CPU RTF 321.86x（495.7s 生成 1.5s），内存 422 MB，加载 363.3s，32kHz                                                                      |
| **macOS 依赖问题**  | NLTK `averaged_perceptron_tagger_eng` 需手动下载、`fast_langdetect` 模型需手动下载、`torchcodec` 需安装、`torch.distributed` 需手动初始化 |

### 3.10 ⚠️ Index-TTS — 工业级零样本 TTS

| 属性            | 详情                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| **来源**        | Bilibili（哔哩哔哩），Index-TTS Team                                                                    |
| **GitHub**      | github.com/index-tts/index-tts（22,490 stars）                                                          |
| **技术原理**    | 工业级可控零样本 TTS，主打情感/表现力控制                                                               |
| **参数量**      | 1.5B                                                                                                    |
| **许可证**      | 模型为 **Bilibili 自有许可**（非标准开源许可，商用前需单独确认；2026-09-03 经 VoiceStudio README 证实） |
| **M2 Pro 兼容** | ⚠️ 工业级系统，可能需 CUDA                                                                              |
| **ComfyUI**     | ✅ `chenpipi0807/ComfyUI-Index-TTS`（731 stars）                                                        |

**Benchmark 表现**（来自 CosyVoice 评测，Index-TTS2）：

- 中文 CER 1.03%, SS 76.5%
- 英文 WER 2.23%, SS 70.6%
- 困难集 CER 7.12%, SS 75.5%

### 3.11 ✅ Zonos 以外的 M2 Pro 兼容模型

#### 3.11.1 Bark — Suno，文本提示生成音频

| 属性            | 详情                                                      |
| --------------- | --------------------------------------------------------- |
| **来源**        | Suno AI                                                   |
| **GitHub**      | github.com/suno-ai/bark（39,235 stars）                   |
| **HuggingFace** | `suno/bark`（1,549 likes）                                |
| **技术原理**    | Text-prompted generative audio model（Transformer-based） |
| **许可证**      | **MIT**（商用 OK）                                        |
| **M2 Pro 兼容** | ✅ CPU/MPS 可用（Transformer 推理）                       |
| **特色**        | 可生成语音、音乐、音效、笑声等；多语言                    |
| **劣势**        | 推理慢、质量不如专用 TTS、最后更新 2024.08                |

#### 3.11.2 OpenVoice V2 — MIT+MyShell，即时克隆

| 属性            | 详情                                            |
| --------------- | ----------------------------------------------- |
| **来源**        | MIT + MyShell.ai                                |
| **GitHub**      | github.com/myshell-ai/OpenVoice（37,113 stars） |
| **技术原理**    | 音色克隆 + 风格控制（情感/口音/节奏/停顿/语调） |
| **许可证**      | **MIT**（商用 OK）                              |
| **M2 Pro 兼容** | ✅ CPU 可用                                     |
| **特色**        | 零样本跨语言克隆、灵活风格控制                  |
| **劣势**        | V2 质量不如新一代 LLM-TTS，但克隆能力强         |

#### 3.11.3 MeloTTS — MyShell，多语言 VITS

| 属性            | 详情                                         |
| --------------- | -------------------------------------------- |
| **来源**        | MyShell.ai                                   |
| **GitHub**      | github.com/myshell-ai/MeloTTS（7,570 stars） |
| **技术原理**    | VITS2-based，非自回归                        |
| **许可证**      | **MIT**（商用 OK）                           |
| **M2 Pro 兼容** | ✅ CPU 友好                                  |
| **特色**        | 英/西/法/中/日/韩多语言，CPU 实时推理        |
| **劣势**        | 无语音克隆（固定音色），质量中等             |

#### 3.11.4 Piper — rhasspy，ONNX CPU 优化

| 属性            | 详情                                           |
| --------------- | ---------------------------------------------- |
| **来源**        | rhasspy (Home Assistant)                       |
| **GitHub**      | github.com/rhasspy/piper（11,276 stars）       |
| **技术原理**    | VITS-based，ONNX Runtime 推理                  |
| **许可证**      | **MIT**（商用 OK）                             |
| **M2 Pro 兼容** | ✅ **CPU 原生，ONNX 优化**，最轻量             |
| **特色**        | 极低延迟（CPU 实时）、多语言多音色、嵌入式可用 |
| **劣势**        | 无语音克隆（固定音色），质量较低               |

#### 3.11.5 Chatterbox — Resemble AI，SOTA 开源 TTS

| 属性            | 详情                                                   |
| --------------- | ------------------------------------------------------ |
| **来源**        | Resemble AI                                            |
| **HuggingFace** | `ResembleAI/chatterbox`（2.1M downloads, 1,732 likes） |
| **GitHub**      | 搜索结果 25,928 stars（resemble-ai/chatterbox）        |
| **技术原理**    | 开源 SOTA TTS（具体架构待查）                          |
| **许可证**      | 待确认                                                 |
| **M2 Pro 兼容** | ⚠️ 待验证                                              |
| **特色**        | 声称超越 ElevenLabs 的开源 TTS                         |

### 3.12 其他已发现模型（简要列表）

| 模型              | 来源            | 技术                             | 参数      | Stars  | 许可证                         | 备注                                                                                                                                                                                                                                                                                                          |
| ----------------- | --------------- | -------------------------------- | --------- | ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GLM-TTS**       | 智谱 AI         | LLM-based AR                     | 1.5B      | 1,048  | Apache                         | 多奖励 RL 对齐                                                                                                                                                                                                                                                                                                |
| **FireRedTTS2**   | FireRedTeam     | LLM                              | 1.5B      | 1,421  | —                              | 长篇流式多说话人                                                                                                                                                                                                                                                                                              |
| **VibeVoice**     | Microsoft       | Next-token Diffusion             | 1.5B/0.5B | 52,272 | Apache                         | ICLR 2026 Oral；⚠️ TTS 代码已撤回                                                                                                                                                                                                                                                                             |
| **HiggsAudio v2** | 阿里达摩院      | —                                | 3B        | —      | —                              | 多模态 TTS                                                                                                                                                                                                                                                                                                    |
| **Spark-TTS**     | 港科大+出门问问 | LLM (Qwen2.5)                    | 0.5B      | 11,008 | Apache(代码)/CC-BY-NC-SA(模型) | 单流解耦语音 token                                                                                                                                                                                                                                                                                            |
| **StyleTTS2**     | —               | Style Diffusion + 对抗训练       | —         | 6,328  | MIT                            | 人类级别 TTS                                                                                                                                                                                                                                                                                                  |
| **Parler-TTS**    | HuggingFace     | 文本条件扩散                     | —         | 5,588  | Apache                         | 文本描述控制语音风格                                                                                                                                                                                                                                                                                          |
| **Orpheus-TTS**   | Canopy Labs     | Llama-3b backbone                | 3B        | 6,284  | Apache                         | 零样本克隆 + 情感 tag                                                                                                                                                                                                                                                                                         |
| **OmniVoice**     | k2-fsa          | —                                | —         | 8,870  | Apache                         | 600+ 语言                                                                                                                                                                                                                                                                                                     |
| **MockingBird**   | babysor         | SV2TTS                           | —         | 36,919 | —                              | 中文克隆，RTVC 仿制                                                                                                                                                                                                                                                                                           |
| **RTVC**          | CorentinJ       | SV2TTS                           | —         | 60,083 | —                              | 2019 经典，已过时                                                                                                                                                                                                                                                                                             |
| **VoiceStudio**   | debpalash       | 聚合器（HF 模型 + Tauri 桌面壳） | —         | 14,623 | —                              | 开源本地 ElevenLabs 替代品；克隆/配音/转录/播客，646 语言，可离线。Apple Silicon 可用（MPS+MLX，macOS 13.3+）。Instruct 情感控制仅限部分底层引擎（OmniVoice/CosyVoice3/VoxCPM2/IndexTTS 2.5）。应用 AGPL-3.0；默认 OmniVoice 权重 CC-BY-NC。⚠️ 它封装底层模型（多为 CUDA 系），不替代 M2 Pro 上的独立引擎选型 |

### 3.13 全球模型综合排名与技术标注

> **以下按技术先进性 + 效果质量排序**。标注每个模型的技术路线、参数量、NVIDIA 需求、商用许可、M2 Pro 兼容性。

#### T0 — 顶会 SOTA / 工业级最强（2025-2026）

| 排名 | 模型                  | 技术路线                    | 参数      | NVIDIA 必需   | M2 Pro | 商用      | 采样率    | 质量       | GitHub Stars |
| ---- | --------------------- | --------------------------- | --------- | ------------- | ------ | --------- | --------- | ---------- | ------------ |
| 1    | **Fish Speech S2**    | Dual-AR + RL                | 4B+0.4B   | ✅            | ❌     | ❌ 非商用 | —         | ⭐⭐⭐⭐⭐ | 32,113       |
| 2    | **Fun-CosyVoice3 RL** | Flow Matching + RL          | 0.5B      | ⚠️ MPS 待验证 | ⚠️     | ✅ Apache | 24kHz     | ⭐⭐⭐⭐⭐ | 22,659       |
| 3    | **VoxCPM2**           | Diffusion AR (无 tokenizer) | 2B        | ✅ CUDA 12+   | ❌     | ✅ Apache | **48kHz** | ⭐⭐⭐⭐⭐ | 35,135       |
| 4    | **Qwen3-TTS**         | Multi-Codebook LM           | 0.6B/1.7B | ⚠️ FA2 推荐   | ⚠️     | ✅ Apache | —         | ⭐⭐⭐⭐⭐ | 12,878       |
| 5    | **VibeVoice**         | Next-token Diffusion        | 1.5B/0.5B | ✅            | ❌     | ✅ Apache | —         | ⭐⭐⭐⭐⭐ | 52,272       |
| 6    | **GLM-TTS RL**        | LLM-based AR + RL           | 1.5B      | ✅            | ❌     | ✅ Apache | —         | ⭐⭐⭐⭐⭐ | 1,048        |

#### T1 — 高质量开源（可部署或可测试）

| 排名 | 模型              | 技术路线            | 参数 | NVIDIA 必需   | M2 Pro | 商用          | 采样率    | 质量       | GitHub Stars |
| ---- | ----------------- | ------------------- | ---- | ------------- | ------ | ------------- | --------- | ---------- | ------------ |
| 7    | **Zonos**         | Transformer/DAC     | ~1B  | ❌ macOS ✅   | ✅     | ✅ Apache     | **44kHz** | ⭐⭐⭐⭐⭐ | 7,235        |
| 8    | **F5-TTS**        | Flow Matching + DiT | 0.3B | ❌ MLX ✅     | ✅     | ⚠️ 权重非商用 | 24kHz     | ⭐⭐⭐⭐   | 15,090       |
| 9    | **Sesame CSM**    | Llama + Mimi codec  | 1B   | ❌ MPS ✅     | ✅     | ✅ Apache     | 24kHz     | ⭐⭐⭐⭐   | 14,716       |
| 10   | **Chatterbox**    | —                   | —    | ⚠️            | ⚠️     | ✅            | —         | ⭐⭐⭐⭐   | 25,928       |
| 11   | **Index-TTS2**    | LLM-based AR        | 1.5B | ⚠️            | ⚠️     | ❓            | —         | ⭐⭐⭐⭐   | 22,490       |
| 12   | **Spark-TTS**     | LLM (Qwen2.5)       | 0.5B | ⚠️            | ⚠️     | ⚠️ 模型非商用 | —         | ⭐⭐⭐⭐   | 11,008       |
| 13   | **CosyVoice 2.0** | Flow Matching       | 0.5B | ⚠️ MPS 待验证 | ⚠️     | ✅ Apache     | 24kHz     | ⭐⭐⭐⭐   | 22,659       |
| 14   | **GPT-SoVITS**    | GPT + SoVITS        | —    | ⚠️            | ⚠️     | ✅ MIT        | —         | ⭐⭐⭐⭐   | 60,627       |
| 15   | **Orpheus-TTS**   | Llama-3b            | 3B   | ✅ vLLM       | ⚠️     | ✅ Apache     | 24kHz     | ⭐⭐⭐⭐   | 6,284        |
| 16   | **FireRedTTS2**   | LLM                 | 1.5B | ⚠️            | ⚠️     | ❓            | —         | ⭐⭐⭐⭐   | 1,421        |

#### T2 — GAN/VITS 方案（2023-2024，速度快但质量中等）

| 排名 | 模型                | 技术路线              | 参数    | NVIDIA 必需 | M2 Pro | 商用       | 质量   | GitHub Stars |
| ---- | ------------------- | --------------------- | ------- | ----------- | ------ | ---------- | ------ | ------------ |
| 17   | **XTTS v2**（已有） | GPT AR + HiFi-GAN     | —       | ❌ MPS ✅   | ✅     | ✅ MPL-2.0 | ⭐⭐⭐ | 45,870       |
| 18   | **Kokoro**（已有）  | StyleTTS-based        | **82M** | ❌ CPU ✅   | ✅     | ✅ Apache  | ⭐⭐⭐ | 6666 likes   |
| 19   | **OpenVoice V2**    | 音色克隆 + VITS       | —       | ❌ CPU ✅   | ✅     | ✅ MIT     | ⭐⭐⭐ | 37,113       |
| 20   | **MeloTTS**         | VITS2                 | —       | ❌ CPU ✅   | ✅     | ✅ MIT     | ⭐⭐⭐ | 7,570        |
| 21   | **StyleTTS2**       | Style Diffusion + GAN | —       | ⚠️          | ⚠️     | ✅ MIT     | ⭐⭐⭐ | 6,328        |
| 22   | **Piper**           | VITS + ONNX           | —       | ❌ CPU ✅   | ✅     | ✅ MIT     | ⭐⭐   | 11,276       |
| 23   | **Bark**            | Transformer           | —       | ❌ MPS ✅   | ✅     | ✅ MIT     | ⭐⭐⭐ | 39,235       |

#### T3 — 闭源 / 商用 API

| 排名 | 平台                  | 技术    | 语音克隆         | 商用 | 价格                  | 特点                          |
| ---- | --------------------- | ------- | ---------------- | ---- | --------------------- | ----------------------------- |
| 1    | **ElevenLabs**        | 专有    | ✅ 即时/专业克隆 | ✅   | ~$0.17-0.36/分钟      | 业界 SOTA，prosody 最接近人类 |
| 2    | **OpenAI TTS**        | 专有    | ❌ 固定音色      | ✅   | $0.015-0.030/1K chars | 6 预置音色，质量高但无克隆    |
| 3    | **MiniMax Speech-02** | 专有    | ✅               | ✅   | —                     | 中文 TTS 顶级                 |
| 4    | **Azure TTS**         | 专有    | ❌ 固定音色      | ✅   | 按量计费              | 400+ 音色，企业级             |
| 5    | **Fish Audio API**    | S2 模型 | ✅               | ✅   | —                     | S2 模型的 API 服务            |

### 3.14 技术路线标注总结

| 技术路线          | 先进性            | 代表模型                                                                                | 数量 | 趋势                          |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------- | ---- | ----------------------------- |
| **LLM-based AR**  | ✅ 最先进         | Fish Speech S2, Qwen3-TTS, GPT-SoVITS, ChatTTS, Sesame CSM, Index-TTS, GLM-TTS, Orpheus | 10+  | 2025-2026 绝对主流            |
| **Flow Matching** | ✅ 高质量         | F5-TTS, CosyVoice 2/3                                                                   | 3    | 2024 兴起，与 LLM 结合        |
| **Diffusion**     | ✅ 高质量         | StyleTTS2, VoxCPM2, Parler-TTS, VibeVoice                                               | 4    | 2023-2026 持续演进            |
| **Dual-AR**       | ✅ 最前沿         | Fish Speech S2                                                                          | 1    | 2026 新趋势                   |
| **GAN/VITS**      | ⚠️ 成熟但渐被替代 | Kokoro, XTTS v2, MeloTTS, Piper, OpenVoice                                              | 5+   | 2020-2023，推理快但质量有上限 |
| **专有/闭源**     | ✅ 实用           | ElevenLabs, OpenAI TTS, MiniMax                                                         | 3    | 质量好但付费                  |

---

## 4. 云端 TTS / 语音克隆平台评估

### 4.1 ElevenLabs — 业界 SOTA

| 属性         | 详情                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| **定位**     | "The most realistic voice AI platform"                                                        |
| **核心功能** | TTS、即时语音克隆、专业语音克隆、声音设计、多语言配音                                         |
| **语音克隆** | Instant Cloning（几秒音频）、Professional Cloning（分钟级音频，最高质量）                     |
| **API**      | 有（REST API，广泛集成）                                                                      |
| **定价**     | Free $0（10K credits）；Starter $6/mo；Creator $22/mo（~121 min）；Pro $99/mo（~600 min）     |
| **音质**     | 44.1kHz, 128-192 kbps                                                                         |
| **多语言**   | 30+ 语言                                                                                      |
| **学术评价** | Cambridge 研究表明 ElevenLabs 在 prosody 措施上最接近人类语音 [[memory:17857691344010182898]] |

**定价细节**：

- 1 credit = 1 character（V2 Multilingual 模型）
- V2 Flash/Turbo: 0.5-1 credit/character（更便宜）
- Creator ($22/mo): ~121 分钟 TTS
- Pro ($99/mo): ~600 分钟 TTS, 192kbps

### 4.2 OpenAI TTS

| 属性         | 详情                                                                 |
| ------------ | -------------------------------------------------------------------- |
| **定位**     | OpenAI API 内置 TTS                                                  |
| **核心功能** | 文本 → 语音，6 种预置音色（alloy, echo, fable, onyx, nova, shimmer） |
| **语音克隆** | ❌ 不支持                                                            |
| **API**      | 有（`/v1/audio/speech`）                                             |
| **定价**     | tts-1: $0.015/1K chars; tts-1-hd: $0.030/1K chars                    |
| **音质**     | 24kHz, MP3/FLAC/PCM/WAV                                              |
| **优势**     | 集成简单、延迟低、质量稳定                                           |
| **劣势**     | 无语音克隆、仅 6 音色、无情感控制                                    |

### 4.3 MiniMax Speech-02

| 属性          | 详情                                                              |
| ------------- | ----------------------------------------------------------------- |
| **定位**      | 中文 TTS 顶级平台                                                 |
| **语音克隆**  | ✅ 支持                                                           |
| **API**       | 有                                                                |
| **Benchmark** | Seed-TTS Eval WER: 中文 0.83%, 英文 1.65%（闭源中仅次于 Fish S2） |

### 4.4 云端平台对比

| 平台           | 语音克隆 | 多语言  | API | 中文支持 | 价格/分钟   | 质量       |
| -------------- | -------- | ------- | --- | -------- | ----------- | ---------- |
| **ElevenLabs** | ✅ 最强  | ✅ 30+  | ✅  | ✅       | ~$0.17-0.36 | ⭐⭐⭐⭐⭐ |
| **OpenAI TTS** | ❌       | ✅ 50+  | ✅  | ✅       | ~$0.02-0.04 | ⭐⭐⭐⭐   |
| **MiniMax**    | ✅       | ✅      | ✅  | ✅ 最强  | —           | ⭐⭐⭐⭐⭐ |
| **Azure TTS**  | ❌       | ✅ 400+ | ✅  | ✅       | 按量计费    | ⭐⭐⭐⭐   |
| **Fish Audio** | ✅       | ✅ 80+  | ✅  | ✅       | —           | ⭐⭐⭐⭐⭐ |

---

## 5. Benchmark 对比（综合）

### 5.1 Seed-TTS Eval（来自 Fish Audio 官方）

| 模型                  | 类型 | 中文 WER ↓ | 英文 WER ↓ | 备注         |
| --------------------- | ---- | ---------- | ---------- | ------------ |
| **Fish Audio S2**     | 开源 | **0.54%**  | **0.99%**  | 所有模型最佳 |
| **Qwen3-TTS**         | 开源 | 0.77%      | 1.24%      |              |
| **MiniMax Speech-02** | 闭源 | 0.99%      | 1.90%      |              |
| **Seed-TTS**          | 闭源 | 1.12%      | 2.25%      |              |

### 5.2 CosyVoice 综合评测（来自 CosyVoice 官方）

| 模型               | 开源 | 参数 | 中文 CER ↓ | 中文 SS ↑ | 英文 WER ↓ | 英文 SS ↑ | 困难 CER ↓ | 困难 SS ↑ |
| ------------------ | ---- | ---- | ---------- | --------- | ---------- | --------- | ---------- | --------- |
| Human              | —    | —    | 1.26       | 75.5      | 2.14       | 73.4      | —          | —         |
| **Fun-CV3 RL**     | ✅   | 0.5B | **0.81**   | **77.4**  | **1.68**   | 69.5      | **5.44**   | **75.0**  |
| **VoxCPM**         | ✅   | 0.5B | 0.93       | **77.2**  | 1.85       | **72.9**  | 8.87       | 73.0      |
| GLM-TTS RL         | ✅   | 1.5B | 0.89       | 76.4      | —          | —         | —          | —         |
| Index-TTS2         | ✅   | 1.5B | 1.03       | 76.5      | 2.23       | 70.6      | 7.12       | 75.5      |
| Spark-TTS          | ✅   | 0.5B | 1.2        | 66.0      | 1.98       | 57.3      | —          | —         |
| CosyVoice2         | ✅   | 0.5B | 1.45       | 75.7      | 2.57       | 65.9      | 6.83       | 72.4      |
| **F5-TTS**         | ✅   | 0.3B | 1.52       | 74.1      | 2.00       | 64.7      | 8.67       | 71.3      |
| FireRedTTS2        | ✅   | 1.5B | 1.14       | 73.2      | 1.95       | 66.5      | —          | —         |
| HiggsAudio-v2      | ✅   | 3B   | 1.50       | 74.0      | 2.44       | 67.7      | —          | —         |
| VibeVoice-1.5B     | ✅   | 1.5B | 1.16       | 74.4      | 3.04       | 68.9      | —          | —         |
| VibeVoice-Realtime | ✅   | 0.5B | —          | —         | 2.05       | 63.3      | —          | —         |

### 5.3 关键发现

1. **F5-TTS 在 benchmark 中处于中游** — CER 1.52% 高于 VoxCPM (0.93%)、Fun-CV3 (0.81%)、Index-TTS2 (1.03%)，但仍是 0.3B 参数量中最强
2. **VoxCPM 在英文 SS 上最强**（72.9%），甚至超越人类基线（73.4% 非常接近）
3. **Fun-CosyVoice3 RL 版**在中文 CER (0.81%) 和困难集 (5.44%) 上都是开源最佳
4. **Fish Audio S2 在 WER 上绝对领先**，但需要 CUDA + 非商用
5. **参数量 ≠ 质量** — VoxCPM (0.5B) 超越多个 1.5B 模型；F5-TTS (0.3B) 与 CosyVoice2 (0.5B) 接近

---

## 6. 已有引擎实战经验总结

### 6.1 当前管线 TTS 引擎降级链

```
F5-TTS-MLX (priority 1) ──失败──→ Qwen3-TTS (priority 2)
    ──失败──→ edge-tts (priority 3) ──失败──→ macOS say (priority 4)
```

代码位置：`scripts/short-video/lib/tts/registry.mjs`（优先级更新于 2026-08-16）。本地引擎统一 venv `~/.video-tts-env`。

### 6.2 F5-TTS-MLX 实战教训

| #   | 教训                                | 影响                                     | 解决方案                                  |
| --- | ----------------------------------- | ---------------------------------------- | ----------------------------------------- |
| 1   | **duration 参数必须显式设置**       | 不设会生成 0.03s 音频                    | `duration = ref_dur + word_count / 2.5`   |
| 2   | **ref-text 必须精确匹配 ref-audio** | 不匹配时参考文本泄漏到生成语音           | 用 Whisper 识别 ref-text 有误差也会出问题 |
| 3   | **跳过 silenceremove**              | F5 音频振幅低，-35dB 阈值会全删          | F5 后处理只用 atempo                      |
| 4   | **estimate_duration=True 不可靠**   | 参考音频说得慢会生成过长音频（38s）      | 手动计算 duration                         |
| 5   | **M4A 不被 Python 音频库支持**      | `LibsndfileError: Format not recognised` | ffmpeg 转 WAV                             |
| 6   | **权重 CC-BY-NC-4.0**               | 非商用许可                               | 项目为非商用内容创作，暂可使用            |

### 6.3 XTTS v2 实战教训

| #   | 教训                            | 解决方案                                                   |
| --- | ------------------------------- | ---------------------------------------------------------- |
| 1   | **XTTS 只克隆音色，不克隆发音** | XTTS 的发音来自语言模型，标准英语                          |
| 2   | **MPS hybrid 模式**             | GPT on MPS, HiFi-GAN on CPU，需 patch `tts/models/xtts.py` |
| 3   | **PyTorch 2.5.1 必须**          | 2.13.0 breaks `weights_only` default                       |
| 4   | **COQUI_TOS_AGREED=1**          | 需设此环境变量才能下载模型                                 |

### 6.4 Prosody 优化经验

已有 prosody 后处理方案（`docs/research/voice-prosody-hook-optimization.md`）：

| visualType | Pitch           | Tempo | 场景      |
| ---------- | --------------- | ----- | --------- |
| `hook`     | +8% (132 cents) | +12%  | 开场 hook |
| `data`     | -3% (-52 cents) | -3%   | 数据展示  |
| `quote`    | 0%              | -5%   | 引述      |
| `cta`      | -4% (-70 cents) | -8%   | 行动号召  |

通过 FFmpeg rubberband 滤镜实现，已修复 pitch 参数传递 bug [[memory:17862429060283302855]]。

### 6.5 F5-TTS-MLX 在管线中的已知局限

1. **单一固定参考音频** — 所有场景用同一个 ref-audio，导致 prosody 模式相同
2. **24kHz 采样率** — 低于 Zonos (44kHz) 和 VoxCPM2 (48kHz)
3. **无情感控制** — 不能通过 instruct 控制情感/语速/风格
4. **中文支持有限** — 主要训练数据是 Emilia-ZH-EN，中文质量不如 CosyVoice/VoxCPM
5. **CC-BY-NC 权重** — 限制了商用可能性

---

## 7. 推荐升级路径

### 7.1 短期（不需改代码）：保持 F5-TTS-MLX

**理由**：

- 已验证、已部署、已在管线中稳定运行
- MLX 原生支持，Apple Silicon 最优
- 质量足够用于 TikTok/YouTube Shorts 旁白
- Prosody 后处理已解决"flat read"问题

### 7.2 中期（新 session 测试）：Zonos 优先

**测试优先级**：

| #   | 模型                              | 理由                                                                          | M2 Pro          | 商用                 |
| --- | --------------------------------- | ----------------------------------------------------------------------------- | --------------- | -------------------- |
| 1   | **Zonos**                         | Apache-2.0 + macOS 原生 + 44kHz + 情感控制                                    | ✅              | ✅                   |
| 2   | **Sesame CSM**                    | Apache-2.0 + MPS 代码已有 + HF Transformers 集成                              | ✅              | ✅                   |
| 3   | **CosyVoice 3.0**                 | Apache-2.0 + RL 对齐 + 9 语言 + 方言 + benchmark SOTA                         | ⚠️              | ✅                   |
| 4   | **GPT-SoVITS**                    | MIT + 60K stars + 1 分钟克隆 + 社区最大                                       | ⚠️              | ✅                   |
| 5   | **Index-TTS 2.5**                 | Bilibili 出品 + 情感/表现力控制主打                                           | ⚠️ 待验证       | ⚠️ Bilibili 自有许可 |
| 6   | **Fish Speech S2**（远程 GPU）    | 情感控制最强（子词级 15000+ tags，EmergentTTS 胜率 81.9%）+ WER 全场最佳      | ❌ 需 CUDA      | ❌ 非商用            |
| 7   | **VoxCPM2**（远程 GPU）           | Apache-2.0 + 48kHz + 30 语言 + 英文 SS 顶级                                   | ❌ 需 CUDA      | ✅                   |
| 8   | **Fun-CosyVoice3 RL**（远程 GPU） | Apache-2.0 + RL 对齐 + 中文 CER/困难集开源最佳（MPS 上 RTF 39.8x 已排除本地） | ❌ 建议远程 GPU | ✅                   |

**情感/声调优先子集**：Index-TTS 2.5 > Fish Speech S2 > Zonos > CosyVoice 3（instruct）> CSM（对话表现力）。

> 注：VoiceStudio 不列入本表——它是聚合器应用（封装 16 个 TTS 引擎的 GUI 壳，配音/有声书/听写 workflow），不产生引擎层面的测试结论，仅作 §3.12 发现记录。

**测试标准**：

1. 安装可行性 — M2 Pro 上能否成功安装
2. 推理速度 — 生成 30 秒音频需要多长时间
3. 语音质量 — 对比 F5-TTS-MLX 的输出
4. 克隆相似度 — 与参考音频的说话人相似度
5. 内存占用 — 峰值在 32GB 以内
6. 引擎集成 — 能否适配 `lib/tts/registry.mjs` 的 engine 接口

### 7.3 远程 GPU 候选（远程 GPU 已具备）

远程 NVIDIA GPU（Tailscale 方案）已可用，以下 CUDA 系模型升为正式测试候选（见 §7.2 表 #6-#8）：

1. **VoxCPM2** — 48kHz + Apache-2.0 + 30 语言 + benchmark 顶级
2. **Fish Speech S2** — Dual-AR + 15000+ 情感 tags + WER 最佳
3. **Fun-CosyVoice3 RL** — RL 对齐 + 困难集 CER 最佳

### 7.4 引擎集成架构

所有引擎适配统一的 `TTSEngine` 接口（`scripts/short-video/lib/tts/`）：

```javascript
// TTSEngine interface (conceptual)
{
  name: string,
  info: string,
  useSilenceFilter: boolean,  // F5 = false, others = true
  resample: boolean,
  generate: (scenes, outputDir) => Promise<TTSResult[]>
}
```

新增引擎只需：

1. 创建 `lib/tts/<engine-name>.mjs`，导出 `create<Engine>Engine()` 工厂函数
2. 在 `registry.mjs` 的 `ENGINE_FACTORIES` 和 `PRIORITY` 中注册
3. 设置 `TTS_ENGINE=<name>` 环境变量即可强制使用

---

## 8. 实测对比结果（2026-08-10）

### 8.1 测试环境

- **设备**：MacBook Pro M2 Pro (32GB), macOS 26.5.1
- **参考音频**：`voice-sample-24k.wav`（12.65s, 24kHz）
- **测试文本**："DeepSeek just shocked the AI world again. Their latest model outperforms GPT-4 on key benchmarks, and it costs ten times less to run."
- **音频输出**：`scripts/short-video/assets/tts-comparison/` 目录下 7 个 WAV 文件

### 8.2 横向对比表（7 个模型）

| 指标            | F5-TTS-MLX (T1)          | Qwen3-TTS (T0)    | Zonos (T1)      | Spark-TTS (T1) | CosyVoice 3.0 (T0)  | CSM (T1)           | GPT-SoVITS (T1)    |
| --------------- | ------------------------ | ----------------- | --------------- | -------------- | ------------------- | ------------------ | ------------------ |
| **梯队**        | T1                       | **T0**            | T1              | T1             | **T0**              | T1                 | T1                 |
| **技术路线**    | Flow Matching            | Multi-Codebook LM | Transformer/DAC | LLM (Qwen2.5)  | Flow Matching + LLM | Llama + Mimi codec | GPT + SoVITS       |
| **设备**        | ✅ MLX 原生              | ✅ **MPS 原生**   | ❌ CPU only     | ✅ MPS         | ✅ MPS              | ❌ CPU only        | ❌ CPU only        |
| **模型大小**    | ~1.5 GB                  | 2.3 GB            | 3.0 GB          | ~1 GB          | ~2 GB               | ~7 GB              | ~1.5 GB            |
| **模型加载**    | ~2s                      | 64.8s             | 24.6s           | 255.6s         | 112.2s              | 292.3s             | 363.3s             |
| **生成时间**    | 71.0s (修复后 ~16s)      | **34.6s**         | ~112s           | 100.9s         | 436.5s              | 1144.9s            | 495.7s             |
| **输出时长**    | 9.2s (修复后)            | 10.8s             | 9.6s            | 9.5s           | 11.0s               | 9.5s               | 1.5s ⚠️            |
| **RTF**         | **1.78x** (修复后 ~1.7x) | **3.20x**         | 11.65x          | 10.60x         | 39.83x              | 120.26x            | 321.86x            |
| **采样率**      | 24 kHz                   | 24 kHz            | **44.1 kHz**    | 24 kHz         | 24 kHz              | 24 kHz             | 32 kHz             |
| **内存**        | ~7 GB                    | **330 MB**        | 7.1 GB          | **351 MB**     | 1616 MB             | 3577 MB            | **422 MB**         |
| **许可证**      | ⚠️ CC-BY-NC              | ✅ Apache-2.0     | ✅ Apache-2.0   | ⚠️ CC-BY-NC-SA | ✅ Apache-2.0       | ✅ Apache-2.0      | ✅ MIT             |
| **M2 Pro 可用** | ✅ 已部署                | ✅ **MPS 加速**   | ⚠️ CPU 可用     | ✅ MPS 可用    | ⚠️ 极慢             | ❌ 极慢            | ❌ 极慢 + 输出异常 |

### 8.3 速度排序（RTF，越低越快）

```
F5-TTS-MLX  ████████ 1.78x   ← MLX 原生，绝对优势
Qwen3-TTS   ████████████ 3.20x ← T0 梯队最快
Spark-TTS   ██████████████████████████ 10.60x  ← MPS 但仍慢
Zonos       ██████████████████████████ 11.65x  ← CPU only
CosyVoice3  ███████████████████████████████████████████████████████████████████████ 39.83x  ← MPS 极慢
CSM         ███████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████ 120.26x  ← CPU only，不可用
GPT-SoVITS  ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████ 321.86x  ← CPU only，输出异常
```

### 8.4 内存排序（越低越好）

```
Qwen3-TTS   █ 330 MB      ← 极低，其他模型的 1/20
Spark-TTS   █ 351 MB      ← 同样极低
GPT-SoVITS  █ 422 MB      ← 低内存，但 RTF 极差
CosyVoice3  ████ 1616 MB
CSM         █████████ 3577 MB
F5-TTS-MLX  █████████████████ 7000 MB (est.)
Zonos       █████████████████████ 7100 MB
```

### 8.5 关键发现

1. **F5-TTS-MLX 仍是 M2 Pro 上最快的 TTS 引擎**（RTF 1.78x）
   - MLX 原生加速，Apple Silicon 最优
   - 修复 `estimate_duration` bug 后输出正确（9.2s vs 破损的 41.1s）
   - 权重 CC-BY-NC-4.0 仍是商用隐患

2. **Qwen3-TTS 是 M2 Pro 上可跑的 T0 模型** 🎉
   - 唯一在 MPS 上成功运行的 T0 模型
   - 内存占用极低（330 MB），是其他模型的 1/20
   - 生成速度比 Zonos 快 3.2x（34.6s vs 112s）
   - Apache-2.0 许可证，商用友好
   - **缺点**：模型加载慢（64.8s）

3. **Spark-TTS 是 M2 Pro 上第二快的可克隆模型**（RTF 10.60x）
   - MPS 原生支持，加载成功
   - 内存极低（351 MB），与 Qwen3-TTS 同级
   - **但**：模型权重 CC-BY-NC-SA（非商用），代码 Apache
   - Benchmark 中质量中等（CER 1.2%, SS 66.0%）

4. **CosyVoice 3.0 在 M2 Pro 上不可用**（RTF 39.83x）
   - 虽然是 T0 梯队 + Apache-2.0 + RL 对齐
   - 但 MPS 生成极慢：436.5 秒生成 11 秒音频
   - 内存 1616 MB，加载 112.2s
   - **结论**：Benchmark SOTA 但 M2 Pro 实用性为零

5. **CSM 在 M2 Pro 上完全不可用**（RTF 120.26x）
   - MPS 生成直接卡死（进程挂起，CPU 0%，需 kill -9）
   - CPU 模式可用但极慢：19 分钟生成 9.5 秒音频
   - 内存 3577 MB，加载 292.3s
   - 7GB 模型文件占磁盘空间
   - **结论**：Apache-2.0 + 对话式语音概念好，但 M2 Pro 不可用

6. **Zonos 的 MPS 支持是坏的**
   - 开发者在代码中明确注释：`# MPS breaks for whatever reason. Uncomment when it's working.`
   - CPU 模式可用但极慢（RTF 11.65x）
   - 优点：44.1kHz 输出采样率最高

7. **GPT-SoVITS 测试完成，但 M2 Pro 上不实用**（RTF 321.86x）
   - 模型加载 363.3s，生成 495.7s 仅输出 1.5s 音频
   - 输出异常短（1.5s vs 预期 ~10s）：中英混合文本被分割为 6 段（en/zh/en/zh/en/zh），生成可能提前终止
   - 内存占用极低（422 MB），是所有测试模型中最低的之一
   - macOS 依赖问题：NLTK `averaged_perceptron_tagger_eng` 需手动下载、`fast_langdetect` 模型需手动下载、`torchcodec` 需安装、`torch.distributed` 需手动初始化、语言参数需 `i18n()` 包装
   - **结论**：60K stars 但 macOS 体验差、CPU 推理极慢、混合语言输出异常，暂不推荐

8. **用户主观评价（2026-08-10，7 模型全部听完后）**
   - **CosyVoice 3.0 音质最好** — 尽管生成极慢（RTF 39.83x），但听感是所有模型中最自然的
   - **CSM 也不错** — 对话式 TTS 架构，音色有特色，但 RTF 120x 不实用
   - **Qwen3-TTS 声音偏轻，但音色干净** — MPS 原生加速 + 330MB 低内存 + Apache-2.0 + RTF 3.2x，综合性价比最高
   - 修复后的 F5-TTS 和 Qwen3-TTS 各有优势，均优于 Zonos
   - F5-TTS 修复前的问题：部分输出听不懂的语言 + 部分原声泄漏
   - Zonos CPU 模式 RTF 11.65x，实用价值低
   - **质量 vs 速度矛盾**：听感最好的 CosyVoice (RTF 39.83x) 和 CSM (RTF 120x) 恰恰是最慢的；实际可用的 F5-TTS (1.78x) 和 Qwen3-TTS (3.20x) 质量虽非最佳但已足够

9. **GPT-SoVITS 测试完成，结果令人失望**
   - RTF 321.86x — 所有测试模型中最慢
   - 输出仅 1.5s（其他模型 9-11s）：中英混合文本被分割为 6 段交替处理，生成可能提前终止
   - 内存 422 MB 是最低的之一，但速度和输出质量不支持实用
   - macOS 依赖链极其复杂（5 个手动修复），60K stars 但本地体验差
   - **结论**：社区最大但 M2 Pro 上不推荐

### 8.6 推荐结论（更新后）

| 场景                 | 推荐模型                         | 理由                                                      |
| -------------------- | -------------------------------- | --------------------------------------------------------- |
| **当前管线（不变）** | F5-TTS-MLX                       | 最快 RTF 1.78x、已验证、MLX 原生                          |
| **商用迁移首选**     | Qwen3-TTS                        | T0 梯队 + Apache-2.0 + MPS 原生 + 330MB 低内存 + RTF 3.2x |
| **低资源备选**       | Spark-TTS                        | MPS 可用 + 351MB 低内存 + RTF 10.6x，但权重非商用         |
| **不推荐**           | CosyVoice 3.0 / CSM / GPT-SoVITS | M2 Pro 上 RTF 39.8x / 120.3x / 321.9x，实用性为零         |
| **远程 GPU**         | VoxCPM2 / Fish Speech S2         | T0 顶级 + 48kHz + 多语言                                  |

### 8.7 测试脚本位置

| 模型          | 测试脚本                      | Python 环境         | 模型缓存               |
| ------------- | ----------------------------- | ------------------- | ---------------------- |
| F5-TTS-MLX    | `/tmp/test-f5-comparison.py`  | `~/.f5-tts-env`     | 内置                   |
| Qwen3-TTS     | `/tmp/test-qwen-tts-local.py` | `~/.qwen-tts-env`   | `/tmp/qwen-tts-model/` |
| Zonos         | `/tmp/test-zonos-local.py`    | `~/.zonos-env`      | `/tmp/zonos-model/`    |
| Spark-TTS     | `/tmp/test-spark-tts.py`      | `~/.spark-tts-env`  | HF cache               |
| CosyVoice 3.0 | `/tmp/test-cosyvoice3.py`     | `~/.cosyvoice-env`  | `/tmp/CosyVoice/`      |
| CSM           | `/tmp/test-csm-fixed.py`      | `~/.csm-env`        | `/tmp/csm-model/`      |
| GPT-SoVITS    | `/tmp/test-gpt-sovits-cn.py`  | `~/.gpt-sovits-env` | `/tmp/GPT-SoVITS/`     |

- 音频输出：`scripts/short-video/assets/tts-comparison/`
- 注：表中 venv 为 2026-08-10 测试时的独立环境；此后管线已统一为 `~/.video-tts-env`（Python 3.12，F5 + Qwen + whisperx 共用），见 `scripts/short-video/lib/tts/registry.mjs`。

---

## 9. 风险与注意事项

| 风险                   | 影响                                             | 缓解                                                  |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| F5-TTS 权重非商用      | CC-BY-NC-4.0 限制商用                            | 如需商用，迁移到 Zonos (Apache) 或 CosyVoice (Apache) |
| MPS 兼容性             | Zonos MPS 已确认不可用；Qwen3-TTS MPS 已确认可用 | Zonos 用 CPU 降级；Qwen3-TTS 优先                     |
| LLM-TTS 推理慢         | 自回归生成比 GAN/VITS 慢很多                     | 接受非实时，目标是质量                                |
| 新引擎集成成本         | 需要编写 adapter + 测试                          | 接口已抽象，集成成本低                                |
| VibeVoice TTS 代码撤回 | 微软因"负责任 AI"撤回了 TTS 代码                 | 不可用，仅 ASR 部分可用                               |
| ChatTTS 非商用         | 模型 CC-BY-NC + 代码 AGPL-3.0                    | 不适合商用场景                                        |

---

## 9. 参考来源

### 论文

1. **F5-TTS: A Fairytaler that Fakes Fluent and Faithful Speech with Flow Matching** — arxiv 2410.06885
2. **E2 TTS** — arxiv 2406.18009
3. **CosyVoice / Fun-CosyVoice3** — arxiv 2412.10117, 2505.17589
4. **Spark-TTS: Single-Stream Decoupled Speech Tokens** — arxiv 2503.01710
5. **Fish Audio S2 Technical Report** — arxiv 2603.08823
6. **VoxCPM2 Technical Report** — arxiv 2606.06928
7. **VibeVoice** — ICLR 2026 Oral, OpenReview
8. **StyleTTS 2: Towards Human-Level TTS through Style Diffusion and Adversarial Training** — arxiv 2310.05444
9. **OpenVoice: Versatile Instant Voice Cloning** — arxiv 2312.01479
10. **Bark: Text-Prompted Generative Audio Model** — suno-ai/bark
11. **Bakkouche et al., "What determines the success of AI voice-cloned speech?"** — Phonetica, June 2026

### 代码仓库与模型

12. **F5-TTS**: github.com/SWivid/F5-TTS (15,090 stars), HF: `SWivid/F5-TTS`
13. **F5-TTS-MLX**: github.com/lucasnewman/f5-tts-mlx (644 stars)
14. **GPT-SoVITS**: github.com/RVC-Boss/GPT-SoVITS (60,627 stars)
15. **CosyVoice**: github.com/FunAudioLLM/CosyVoice (22,659 stars)
16. **ChatTTS**: github.com/2noise/ChatTTS (39,757 stars)
17. **Fish Speech**: github.com/fishaudio/fish-speech (32,113 stars), HF: `fishaudio/s2-pro`
18. **VoxCPM2**: github.com/OpenBMB/VoxCPM (35,135 stars), HF: `OpenBMB/VoxCPM2`
19. **Qwen3-TTS**: github.com/QwenLM/Qwen3-TTS (12,878 stars)
20. **Zonos**: github.com/Zyphra/Zonos (7,235 stars), HF: `Zyphra/Zonos-v0.1-transformer`
21. **Sesame CSM**: github.com/SesameAILabs/csm (14,716 stars), HF: `Sesame/csm-1b`
22. **Spark-TTS**: github.com/SparkAudio/Spark-TTS (11,008 stars), HF: `SparkAudio/Spark-TTS-0.5B`
23. **Kokoro**: HF: `hexgrad/Kokoro-82M` (6,666 likes, 11.5M downloads)
24. **XTTS v2 / Coqui TTS**: github.com/coqui-ai/TTS (45,870 stars)
25. **OpenVoice V2**: github.com/myshell-ai/OpenVoice (37,113 stars)
26. **MeloTTS**: github.com/myshell-ai/MeloTTS (7,570 stars)
27. **Bark**: github.com/suno-ai/bark (39,235 stars)
28. **StyleTTS2**: github.com/yl4579/StyleTTS2 (6,328 stars)
29. **Piper**: github.com/rhasspy/piper (11,276 stars)
30. **Chatterbox**: HF: `ResembleAI/chatterbox` (1,732 likes, 2.1M downloads)
31. **Orpheus-TTS**: github.com/canopyai/Orpheus-TTS (6,284 stars)
32. **Index-TTS**: github.com/index-tts/index-tts (22,490 stars)
33. **GLM-TTS**: github.com/zai-org/GLM-TTS (1,048 stars)
34. **FireRedTTS2**: github.com/FireRedTeam/FireRedTTS2 (1,421 stars)
35. **VibeVoice**: github.com/microsoft/VibeVoice (52,272 stars) — ⚠️ TTS 代码已撤回
36. **Parler-TTS**: github.com/huggingface/parler-tts (5,588 stars)
37. **OmniVoice**: github.com/k2-fsa/OmniVoice (8,870 stars)

### 云端平台

38. ElevenLabs: elevenlabs.io — Free ~$990/mo
39. OpenAI TTS: platform.openai.com — $0.015-0.030/1K chars
40. MiniMax Speech: minimax.io
41. Azure TTS: azure.microsoft.com

---

## Design Decisions & References

- **参考数字人调研文档结构**：本文档结构参照 `docs/research/digital-human-solutions-m2-pro.md`，保持一致的章节组织（执行摘要 → 技术架构 → 模型评估 → 排名 → 推荐路径 → 风险 → 参考）。
- **技术路线分类从 4 种扩展到 5 种**：数字人文档分 VAE/GAN/3DMM/扩散 4 种；TTS 领域分 Flow Matching/LLM-AR/Diffusion/GAN-VITS/Dual-AR 5 种，更精确地反映技术差异。
- **Benchmark 数据来自两个独立来源**：(1) Fish Audio 官方的 Seed-TTS Eval（侧重 WER）；(2) CosyVoice 官方的综合评测（侧重 CER + SS + 困难集）。两个来源交叉验证。
- **M2 Pro 兼容性评估更审慎**：数字人文档曾错误地将所有 CUDA 模型标记为不兼容。本次严格检查每个模型的 README 代码是否包含 MPS/macOS 分支（如 Sesame CSM 代码中有 `if torch.backends.mps.is_available(): device = "mps"`）。
- **F5-TTS 权重许可问题**：F5-TTS 代码是 MIT，但 HuggingFace 模型权重标注为 CC-BY-NC-4.0。这意味着用 F5-TTS 生成的语音不应用于商业用途。这是考虑迁移到 Zonos (Apache-2.0) 或 CosyVoice (Apache-2.0) 的重要原因。
- **VibeVoice TTS 代码撤回**：微软于 2025-09-05 因"负责任 AI 使用"从 GitHub 撤回了 VibeVoice-TTS 代码。模型权重仍在 HuggingFace，但无法直接使用。TTS 部分不可用，仅 ASR 部分可用。
- **LLM-based TTS 是 2025-2026 绝对主流**：T0 排名 6 个模型中有 5 个是 LLM-based AR。Flow Matching 与 LLM 的结合（CosyVoice）是另一种高质量路线。纯 GAN/VITS 方案（Kokoro, MeloTTS, Piper）在质量上已无法竞争，但在推理速度和 CPU 友好性上仍有优势。
- **已有管线经验是独特优势**：项目已积累了 F5-TTS 的 7 个关键调试教训、XTTS 的 MPS hybrid 方案、prosody 后处理方案。这些经验使新引擎测试可以快速避坑。
- **不推荐 GPT-SoVITS 作为首选**：虽然 GPT-SoVITS 有 60K stars（TTS 领域最高），但其质量在新一代模型 benchmark 中未出现，且架构（GPT + SoVITS）已不是最先进。推荐作为第 4 优先级测试，主要因为其社区生态和 1 分钟克隆能力。
- **Chatterbox 信息不完整**：HuggingFace 上下载量很高（2.1M），但 GitHub repo 路径不确定（搜索到 resemble-ai/chatterbox 有 25,928 stars，但 API 返回 404）。待进一步调研。
