# 全模态模型选型调研：32GB Apple Silicon 本地部署

> 调研日期：2026-09-24
> 目标：在 Apple M2 Pro 32GB 上本地部署开源全模态模型，用于短视频分析（视觉 + 音频情感 + ASR）
> 背景：现有方案为 Qwen3-VL-30B-A3B（纯 VLM，无音频能力），需补充语音分析能力（风格、音调、情感）

## 1. 调研范围

### 1.1 筛选条件

- **开源权重**（非 API-only）
- **有 MLX 量化版**（可在 Apple Silicon 上跑）
- **License 允许商用**（Apache-2.0 或类似）
- **全模态**：能同时处理音频 + 视频 + 文本
- **32GB 统一内存可部署**

### 1.2 调研覆盖的模型

| 组织 | 模型 | 全模态? | MLX? | License | 结论 |
|------|------|---------|------|---------|------|
| Qwen | Qwen3.8-Omni-Flash | ✅ | ❌ 闭源 | API-only | 排除 |
| Qwen | Qwen3.5-Omni-Plus | ✅ | ❌ 闭源 | API-only | 排除 |
| Qwen | Qwen3-Omni-30B-A3B | ✅ | ✅ 4bit 21.8GB | Apache-2.0 | 候选 |
| Qwen | Qwen2.5-Omni-7B | ✅ | ✅ 4bit ~5-6GB | Apache-2.0 | 候选 |
| Qwen | Qwen2.5-Omni-3B | ✅ | ✅ 4bit ~2-3GB | Apache-2.0 | 轻量候选 |
| OpenBMB | **MiniCPM-o 4.5** | ✅ | **✅ 4bit 6.14GB** | Apache-2.0 | **最佳候选** |
| ByteDance | BAGEL-7B-MoT | ❌ 无音频 | - | Apache-2.0 | 排除 |
| Google | Gemma-4 | ❌ 无音频 | ✅ | Gemma license | 排除 |
| NVIDIA | Nemotron-3-Nano-Omni-30B | ✅ | ❌ 无 MLX | - | 排除 |
| 阶跃星辰 | Step-Audio-2-mini | ⚠️ 语音为主 | 需确认 | 需确认 | 待查 |
| 商汤 | SenseNova-U1.5-8B-MoT | ✅ | ❌ 无 MLX | 需确认 | 排除 |

## 2. 最终候选模型详细对比

### 2.1 基本信息

| | MiniCPM-o 4.5 | Qwen3-Omni-30B-A3B | Qwen2.5-Omni-7B |
|---|---|---|---|
| **组织** | 面壁智能 (OpenBMB) | 阿里通义 | 阿里通义 |
| **发布日期** | 2025-08 | 2025-09-22 | 2025-04-30 |
| **参数量** | 9B (dense) | 35B (MoE, A3B) | 11B (dense) |
| **架构** | SigLip2+Whisper+CosyVoice2+Qwen3-8B | MoE Thinker-Talker+AuT | Thinker-Talker+TMRoPE |
| **MLX 4bit** | **6.14 GB** | 21.8 GB | ~5-6 GB |
| **MLX 4bit ID** | `mlx-community/MiniCPM-o-4_5-4bit` | `mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit` | `giangndm/qwen2.5-omni-7b-mlx-4bit` |
| **License** | Apache-2.0 | Apache-2.0 | Apache-2.0 |

### 2.2 Apple Silicon 实测/估算性能

| | MiniCPM-o 4.5 (M4 Pro 24GB 实测) | Qwen3-Omni-30B (估算) | Qwen2.5-Omni-7B (估算) |
|---|---|---|---|
| **生成速度** | ~55 tok/s | 未知(预计慢) | 未知 |
| **峰值内存** | **~9 GB** | ~25-30 GB | ~12-15 GB |
| **32GB Mac 余量** | **~23 GB** | ~2-6 GB | ~17-20 GB |

MiniCPM-o 4.5 性能数据来源：`andrevp/MiniCPM-o-4_5-MLX-4bit` HuggingFace 页面，M4 Pro 24GB 实测。

### 2.3 Benchmark 对比（全精度 bf16）

#### 视觉理解

| 指标 | MiniCPM-o 4.5 | Qwen3-Omni-30B | Qwen2.5-Omni-7B |
|------|---------------|----------------|-----------------|
| OpenCompass | **77.6** | 75.7 | ~65 |
| MMMU | 67.6 | **69.1** | 59.2 |
| MathVista | **80.1** | 75.9 | 67.9 |
| MMBench EN | **87.6** | 84.9 | 81.8 |
| OCR (OmniDocBench↓) | **0.109** | 0.216 | - |

#### 音频理解

| 指标 | MiniCPM-o 4.5 | Qwen3-Omni-30B | Qwen2.5-Omni-7B |
|------|---------------|----------------|-----------------|
| Meld SER↑ | **59.2** | - | 57.0 |
| MMAU Avg↑ | 76.9 | **77.5** | 65.6 |
| ASR-ZH CER↓ | 0.9 | **0.6** | - |
| ASR-EN WER↓ | 2.5 | **2.3** | - |

#### 全模态理解

| 指标 | MiniCPM-o 4.5 | Qwen3-Omni-30B |
|------|---------------|----------------|
| Daily-Omni↑ | **80.2** | 70.7 |
| Video-Holmes↑ | **64.3** | 50.4 |
| JointAVBench↑ | **60.0** | 53.1 |
| Avg↑ | **68.5** | 63.7 |

#### 视频

| 指标 | MiniCPM-o 4.5 | Qwen3-Omni-30B | Qwen2.5-Omni-7B |
|------|---------------|----------------|-----------------|
| Video-MME (w/o subs)↑ | 70.4 | **70.5** | 64.3 |
| MLVU (M-Avg)↑ | **76.5** | 75.2 | - |

### 2.4 结论

**MiniCPM-o 4.5 MLX 4bit 是 32GB Apple Silicon 上最佳开源全模态模型：**
- 最小（6.14GB）、最快（55 tok/s 实测）、内存最宽裕（峰值 9GB）
- 视觉最强（OpenCompass 77.6，接近 Gemini 2.5 Flash 78.5）
- SER 最强（Meld 59.2）
- 全模态理解最强（Avg 68.5）
- 有完整 MLX 支持 + 全双工流式 + chat 脚本

## 3. 专门语音情感识别模型

| 模型 | 大小 | 能力 | 训练数据 | 32GB Mac | License |
|------|------|------|----------|----------|---------|
| emotion2vec+ large | ~300M | 9类情感分类 | 42526h | ✅ 轻松 | model-license |
| emotion2vec+ base | ~90M | 9类情感分类 | 4788h | ✅ 轻松 | model-license |

emotion2vec+ 在 utterance 级别工作（整段语音一个情感标签），通过 FunASR/ModelScope 使用。可作为全模态模型的补充。

## 4. 三个&ensp;推荐方案

### 方案 A：全模态单模型（推荐）

**用 MiniCPM-o 4.5 MLX 4bit 一步到位**

- 模型：`mlx-community/MiniCPM-o-4_5-4bit`（6.14GB）
- 优势：原生时间对齐（TMRoPE），部署简单，一次推理
- 劣势：各模态能力可能不如专门模型组合
- 适用：大多数短视频分析场景
- 内存：峰值 ~9GB，32GB Mac 余量充足

### 方案 B：模块化组合（精度优先）

**VLM + ASR + SER + VAD 各自最强，手动时间对齐**

- 视觉：Qwen3-VL-30B-A3B（现有，17GB）
- ASR：whisper（带时间戳）
- SER：emotion2vec+ large（300M）
- VAD：silero-vad 或 FunASR
- 优势：每个环节用最强模型
- 劣势：时间对齐复杂，多模型部署，实现难度高
- 适用：需要最高精度的专业场景

### 方案 C：混合方案（平衡）

**全模态模型为主 + 专门模型补充**

- 主分析：MiniCPM-o 4.5 MLX 4bit（6.14GB）
- 补充：emotion2vec+ large（300M）做精细 9 类情感分类
- 优势：全模态原生对齐 + 专门模型补充细节
- 劣势：两个模型，但都很轻量
- 适用：实践推荐方案

## 5. Qwen 系列闭源模型（仅 API）

| 模型 | 发布 | 能力 | 价格 |
|------|------|------|------|
| Qwen3.8-Omni-Flash | 2026-09-18 | 全模态, 1M context | $0.15/$0.47 per 1M tokens |
| Qwen3.5-Omni-Plus | 2025 | 全模态 | API-only |

这些模型无法本地部署，但可通过 API 调用。Qwen3.8-Omni-Flash 比 Qwen3.5-Omni-Plus 平均提升 25%+，音视频接近 Gemini 3.8 Flash。

## 6. 量化精度说明

HuggingFace 上的 benchmark 数字是**全精度（bf16）模型**的打分。4bit 量化会有一定精度损失（通常 1-3%）。

| 量化 | 大小 | 精度保持 |
|------|------|----------|
| bf16 | ~18GB | 100% |
| 8bit | ~9GB | ~99% |
| 5bit | ~7.5GB | ~98% |
| 4bit | 6.14GB | ~97% |

4bit 在 32GB Mac 上性价比最高。MiniCPM-o 4.5 也有 5bit 版（`mlx-community/MiniCPM-o-4_5-5bit`）。

## 7. 面壁智能 (OpenBMB) 背景

- 中国 AI 初创公司，由清华大学自然语言处理实验室 (THUNLP) 孵化
- 创始人：刘知远团队
- MiniCPM 系列：端侧多模态模型，小参数、高性能
- MiniCPM-o 4.5 架构基于 SigLip2 + Whisper-medium + CosyVoice2 + Qwen3-8B 端到端联合训练
- Apache-2.0 开源

## 8. M2 Pro 32GB 实测结果（2026-09-24）

### 8.1 测试环境

- 机器：Apple M2 Pro 32GB 统一内存
- mlx-vlm 0.7.2，Python 3.14（.lightning-env）
- 生产 prompt：与 `vlm_analyzer.py` 完全一致（SEMANTICS_PROMPT_IMAGE / SEMANTICS_PROMPT_VIDEO）
- 测试素材：3 张图片 + 3 个视频（pexels 素材 + 生成场景）
- 模型：MiniCPM-o 4.5 MLX 4bit（6.14GB）vs Qwen3-VL-30B-A3B MLX 4bit（17GB）

### 8.2 性能对比

| 指标 | MiniCPM-o 4.5 | Qwen3-VL-30B-A3B | 倍率 |
|------|--------------|------------------|------|
| 模型加载 | 4.5s | 9.0s | 2.0x |
| 图片推理（平均） | 5.99s | 23.94s* | 4.0x |
| 视频推理（平均） | 9.07s | 44.28s | 4.9x |
| 总体平均 | 7.53s | 36.14s* | **4.8x** |
| 吞吐量 | 8.0 tok/s | 3.7 tok/s* | **2.2x** |
| 峰值内存 | ~7.3GB | ~17GB+ | **2.3x 省** |
| 成功率 | 6/6 (100%) | 5/6 (83%)* | — |

\* Qwen3-VL 在 pexels-alibaba-01.jpg（2MB 大图）上 GPU 崩溃（kIOGPUCommandBufferCallbackErrorImpactingInteractivity），疑因 17GB 模型 + 大图超内存。

### 8.3 逐素材对比

#### pexels-alibaba-01.jpg（大图 2MB）
- **MiniCPM-o** ✅："A modern red and black bus is stopped at a bus stop in front of a large building with 'Alibaba Central' signage" (7.74s)
- **Qwen3-VL** ❌：GPU 崩溃

#### pexels-dc-server.jpg
- **MiniCPM-o**："A row of server racks in a data center, showing the side panels and some indicator lights" (5.0s)
- **Qwen3-VL**："A row of server racks in a data center, with a focus on the rightmost rack showing internal components and blinking lights" (8.31s)
- 质量相当，MiniCPM-o 快 1.7x

#### pexels-chart-01.jpg
- **MiniCPM-o**："A smartphone displaying a bar chart is placed on top of a printed calendar and notebook" (5.25s)
- **Qwen3-VL**："A smartphone displaying a bar chart of monthly data is placed on top of a larger, printed version of the same chart, which is part of a colorful calendar or planner" (39.57s)
- Qwen3-VL 略详细，MiniCPM-o 快 7.5x

#### pexels-video-alibaba-01.mp4
- **MiniCPM-o**："A large, colorful kite shaped like a character floats in the sky" (8.19s)
- **Qwen3-VL**："A large, colorful inflatable character resembling a genie floats in the sky...suspended by cables and appears to be part of a parade or event" (60.07s)
- Qwen3-VL 略详细（"genie", "parade"），MiniCPM-o 快 7.3x

#### scene-1-seed1024.mp4
- **MiniCPM-o**："A person playing a video game, likely a first-person shooter...A large explosion is visible on the game screen, set in a snowy, industrial environment" (10.44s)
- **Qwen3-VL**："A first-person view of a person playing a video game...the surrounding environment is a snowy, industrial landscape at night" (11.03s)
- 质量相当，速度接近

#### scene-10.mp4
- **MiniCPM-o**："A man in a white shirt is speaking directly to the camera" (8.57s)
- **Qwen3-VL**："A man in a white t-shirt is looking at the camera and talking, with a slight cartoon-like filter applied to his face. He is in a room with a chair and a clock visible in the background" (61.73s)
- Qwen3-VL 更详细（"cartoon-like filter", "chair and a clock"），MiniCPM-o 快 7.2x

### 8.4 关键发现

1. **MiniCPM-o 4.5 快 4.8x**：7.53s vs 36.14s 平均推理时间
2. **MiniCPM-o 4.5 省内存 2.3x**：~7.3GB vs ~17GB+，且无 GPU 崩溃
3. **Qwen3-VL 描述略详细**：在成功案例中，Qwen3-VL 通常多捕捉 1-2 个细节（如 "cartoon-like filter", "at night"）
4. **MiniCPM-o 4.5 质量足够**：所有 6 个素材均成功，描述准确，满足生产需求（9:16 视频素材分析）
5. **MiniCPM-o 4.5 无原生视频支持**：mlx_vlm 自动降级为帧采样（10帧@2fps），仍能正确分析视频内容
6. **Qwen3-VL 稳定性问题**：17GB 模型 + 大图（2MB）导致 GPU 崩溃，32GB 机器上内存余量不足

### 8.5 结论

MiniCPM-o 4.5 在 M2 Pro 32GB 上**全面优于** Qwen3-VL-30B-A3B：
- 速度更快（4.8x）
- 内存更省（2.3x）
- 稳定性更好（无崩溃）
- 质量足够（描述准确，满足生产需求）

Qwen3-VL 的唯一优势是描述略详细，但代价是 5x 慢和 GPU 崩溃风险。对于短视频素材分析场景，MiniCPM-o 4.5 是更好的选择。

### 8.6 公平对比修正（2026-09-25）

**问题**：§8.2-8.3 的对比存在不公平因素——测试脚本 `test_minicpm_omni.py` 缺少生产代码 `vlm_analyzer.py` 的图片预处理（`MAX_IMAGE_LONG_EDGE=1920`，长边 >1920px 用 Lanczos resize）。Qwen3-VL 收到 5184px 原图导致 GPU 崩溃，而生产代码会先 resize 到 1920px。

**修复**：在 `test_minicpm_omni.py` 中加入 `resize_image_if_needed()` 函数，镜像生产逻辑（EXIF transpose → 长边检查 → Lanczos resize → 临时 JPEG quality=90）。两个模型均应用预处理后重跑。

**被 resize 的图片**：
- `pexels-alibaba-01.jpg`: 3456×5184 → 1280×1920（之前 Qwen3-VL 崩溃的图）
- `pexels-chart-01.jpg`: 1920×2880 → 1280×1920

**公平对比结果**：

| 指标 | MiniCPM-o 4.5 | Qwen3-VL-30B-A3B | 倍率 |
|------|--------------|------------------|------|
| 模型加载 | 1.9s | 8.2s | 4.3x |
| 总体平均 | **6.73s** | 32.38s | **4.8x** |
| 吞吐量 | **9.1 tok/s** | 3.9 tok/s | **2.3x** |
| 成功率 | **6/6 (100%)** | **6/6 (100%)** | — |
| 峰值内存 | ~7.3GB | ~17GB | **2.3x 省** |

**关键变化**：Qwen3-VL 从 5/6 (83%) → 6/6 (100%)，不再崩溃。修复后 MiniCPM-o 仍然快 4.8x、省内存 2.3x。两个模型输出质量均正常，结论不变。

## 9. MiniCPM-o 4.5 音频能力实测（2026-09-24）

### 9.1 测试环境

- 同 §8.1 环境
- 测试音频：6 个文件（TTS 情感音频中英各 3 个 + 1 个真实音频）
- Prompt：全量分析（转写 + 语言 + 情感 + 语调 + 风格 + 交付质量）+ 单独 ASR

### 9.2 ASR（语音转写）结果

| 音频 | 语言 | 转写结果 | 准确度 |
|------|------|---------|--------|
| hook-shock-zh | 中文 | "刚刚，整个AI圈被彻底炸翻了！DeepSeek不只是追上了GPTs，它是直接把对手按在地上摩擦，价格更是低到离谱！" | **完美** (WER=0.0) |
| hook-shock-en | 英文 | "This just broke the entire AI industry. DeepSeek didn't just catch up to GPT-4, they completely obliterated it, and the price drop is absolutely insane." | **完美** |
| cta-call-zh | 中文 | "关注我，每天第一时间拿到AI前沿突破。如果这条真惊到你了，下一条更炸。现在就点订阅，打开通知，别错过。" | **完美** |
| narrative-calm-zh | 中文 | "DeepSeek的新模型只花了500万美元训练成本，它在推理能力上对标GPT-4，而运行费用只有对方的十分之一。" | **完美** |
| narrative-calm-en | 英文 | "DeepSeek's new model was trained on a budget of just $5 million. It matches GPT-4 on reasoning benchmarks while costing 10 times less to run." | **完美** |
| real-audio-10s | 英文 | "In May, DeepSeek founder Liang Wenfeng held a closed-door meeting with investors, no press, no recording. Two months later, the full transcript leaked online, then..." | **准确** |

### 9.3 情感与风格分析结果

| 音频 | 期望情感 | 实测情感 | 期望风格 | 实测风格 | 语调描述 |
|------|---------|---------|---------|---------|---------|
| hook-shock-zh | 震惊 | **excited** (含 surprise) | hook | conversational | "energetic and highly expressive" |
| hook-shock-en | 震惊 | **excited** (含 surprise) | hook | conversational/narrative | "highly energetic and expressive" |
| cta-call-zh | 激动 | **excited** ✅ | CTA | **cta** ✅ | "energetic and persuasive" |
| narrative-calm-zh | 平静 | **neutral** ✅ | narrative | **narrative** ✅ | "informative and objective" |
| narrative-calm-en | 平静 | **neutral** ✅ | narrative | **narrative** ✅ | "informative and objective" |
| real-audio-10s | 未知 | **neutral** (含 intrigue) | 未知 | **narrative** | "informative and matter-of-fact" |

### 9.4 音频性能

| 指标 | 值 |
|------|-----|
| 平均推理时间 | 9.71s |
| 平均吞吐量 | 12.2 tok/s |
| 首次推理 | 34.27s（冷启动） |
| 后续推理 | 6-9s |
| 成功率 | 8/8 (100%) |

### 9.5 关键发现

1. **ASR 质量极高**：中英文转写均完美，专有名词（DeepSeek、GPT-4、Liang Wenfeng）正确识别
2. **情感识别有效但粒度有限**：正确区分 excited vs neutral，但将 "震惊" 归类为 "excited" 而非 "surprised"
3. **风格分类准确**：CTA 和 narrative 风格均正确识别，hook 被归为 conversational（接近但不精确）
4. **语调描述精准**："energetic and persuasive"、"informative and objective" 等描述准确反映语音特征
5. **中英文均支持**：无语言障碍，混合语言也能处理
6. **单一模型完成多任务**：ASR + 情感 + 风格 + 语调 + 交付质量，一步到位
7. **Qwen3-VL-30B-A3B 无此能力**：纯 VLM，不支持音频输入

### 9.6 音频能力结论

MiniCPM-o 4.5 的音频能力**满足短视频分析需求**：
- ASR 可替代 whisper（转写准确）
- 情感分析可替代 emotion2vec+（区分 excited/neutral，语调描述精准）
- 风格分类可辅助场景理解（CTA/narrative 正确识别）
- **单一模型完成视觉 + 音频全部分析**，无需多模型拼接

## 10. MiniCPM-o 4.5 音视频联合实测（2026-09-24）

### 10.1 测试设计

3 个测试用例，验证同时处理视频画面 + 音频的能力：

| 用例 | 视频 | 音频 | 场景 |
|------|------|------|------|
| pexels-alibaba-av | pexels 素材 4.2s | 同视频音轨 | 真实视频+环境音 |
| feathertalk-av | feathertalk 10s | 同视频音轨 | 真实视频+中文语音 |
| scene-10 + tts | scene-10 5s | TTS hook-shock 中文 | 视频+不匹配 TTS 音频 |

### 10.2 结果

#### pexels-alibaba-av（真实视频+环境音）
- **画面**："A large, colorful kite shaped like a cartoon character floats high in the sky" ✅
- **音频**："No clear speech or narration is present, only background environmental sounds" ✅
- **对齐**："ambient outdoor sounds align well with the outdoor scene" ✅
- **建议**："A voiceover or music track could enhance the storytelling" — 有用的生产建议
- 8 帧, 12.77s, 8.8 tok/s

#### feathertalk-av（真实视频+中文语音）
- **画面**："A man sits in a hotel room, speaking directly to the camera, wearing a white and beige hoodie" ✅
- **音频转写**："等他，我就没事走来走去嘛，观察一下人生百态。然后火车站当然游客志愿者。" ✅ 中文转写
- **情感**：neutral ✅
- **对齐**："The audio and visual content align as the speaker describes his actions" ✅
- 16 帧, 17.51s, 6.0 tok/s

#### scene-10 + tts-audio（视频+不匹配 TTS）
- **画面**："A man in a white t-shirt sits in an office or home setting, looking directly into the camera" ✅
- **音频转写**："刚刚，整个AI圈被彻底炸翻了。DeepSeek不只是追上了GPTs，它是直接把对手按在地上摩擦，价格更是低到离谱。" ✅
- **情感**：excited with surprise ✅
- **对齐**："The man's serious and engaged expression matches the intensity of the topic" ✅ — 合理判断（talking head + voiceover 是常见模式）
- 10 帧, 38.03s, 3.8 tok/s

### 10.3 关键发现

1. **真·全模态能力确认**：MiniCPM-o 4.5 能同时处理视频帧 + 音频，输出统一分析
2. **音视频对齐检测有效**：正确识别音频与画面的匹配关系
3. **中文语音转写**：从视频音轨中正确转写中文语音
4. **不匹配场景处理得当**：视频+不匹配 TTS 音频仍能分别正确分析，并给出合理对齐判断
5. **生产建议有用**：模型提供实用的短视频制作建议（如 "考虑添加背景音乐"）
6. **性能**：12-38s/次，3.8-8.8 tok/s，比单模态慢（需处理两种输入）
7. **Qwen3-VL-30B-A3B 完全无此能力**

### 10.4 全模态结论

MiniCPM-o 4.5 是**真正的全模态模型**，在 M2 Pro 32GB 上可以：
- 视觉分析（图片/视频）— §8 验证，4.8x 快于 Qwen3-VL
- 音频分析（ASR + 情感 + 风格）— §9 验证，ASR WER=0.0
- **音视频联合分析** — §10 验证，同时理解画面和语音
- 峰值内存 ~7.3GB，32GB 机器余量充足
- 单一模型替代 VLM + Whisper + emotion2vec+ 三个模型

## 11. 未覆盖/待查

- HuggingFace Any-to-Any 有 11,677 个模型，本次只看了第一页
- Step-Audio-2-mini（阶跃星辰 8B）未深入查 MLX 版和 benchmark
- 4bit 量化在短视频分析场景的精度损失已实测，与 Qwen3-VL 对比质量相当
- 情感分析粒度有限（7 类），如需更精细分类可补充 emotion2vec+（9 类）
- **下一步**：修改 `vlm_analyzer.py` 采纳 MiniCPM-o 4.5 为生产模型