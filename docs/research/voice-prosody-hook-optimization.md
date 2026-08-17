# Voice Prosody & TikTok Hook Optimization Research

> **Research Date**: 2026-08-08 (initial), 2026-08-17 (updated with F5-TTS prosody alternatives deep research)
> **Sources**: 35+ sources (academic papers, TikTok creator content, TTS industry guides, social media marketing blogs, GitHub repos)
> **Status**: Complete
> **Related**: `docs/video-workflow.md`, `scripts/short-video/lib/tts/f5-mlx.mjs`, `scripts/short-video/lib/tts/post-process.mjs`

---

## Executive Summary

语音抑扬顿挫（prosody）对 TikTok hook 的完播率有**显著影响**。多源研究一致表明：hook 前 3 秒内的音调变化（pitch variation）、语速节奏（pace/rhythm）、和策略性停顿（pause）是决定观众是否继续观看的关键因素。当前我们的 F5-TTS 管线使用**单一固定参考音频**，导致所有场景（hook/narrative/CTA）的语调模式相同——这正是研究指出的"flat, monotone read"问题。

本报告提出六种优化方案，按推荐优先级排序：
- **方案 A**（已实施，F5 上已禁用）：FFmpeg rubberband 后处理 — 在 F5 上产生机械感，已于 2026-08-14 禁用
- **方案 B**（推荐优先）：多参考音频策略 — F5 的参考音频会部分传递情绪和韵律到生成结果
- **方案 C**（备选）：切换到 Qwen3-TTS — 已有 prosody 支持
- **方案 D**（立即可做）：参考音频优化 — 录制一段 prosody 更丰富的单一参考音频
- **方案 E**（研究最前沿）：EmoSteer-TTS — training-free activation steering，在 F5 DiT 层注入情感向量
- **方案 F**（需 fine-tune）：F5-TTS-Emotional-CFG — 双重 CFG 控制情感

如果仍需后处理路径，TD-PSOLA 比 rubberband 更适合语音韵律调整（保持频谱包络不变形）。

---

## 1. 研究发现

### 1.1 语音抑扬顿挫对 TikTok hook 的直接影响

**ReelForge AI (2026)** —— 病毒视频 hook 指南明确提出：

> "Voice modulation in the first few words has an outsized impact on viewer retention. Speaking a little faster than normal conversation pace creates urgency, while strategic pauses after questions build anticipation. Hooks that use clear pitch variation in the opening seconds tend to feel more alive and hold attention better than a flat, monotone read."

**来源**: ReelForge AI, "Guide to Viral Video Hooks: 7 Proven Strategies That Work", 2026-07-02

**Teleprompter.com (2026)** —— TikTok 3 秒法则：

> "Watch time and completion rate are the two metrics TikTok weighs most heavily when deciding whether to push a video to the For You page, and both are decided in that opening window."

TikTok for Business 官方数据：**63% 高 CTR 视频在 3 秒内 hook 住观众**。音乐和音效是关键——TikTok 是高度音频驱动的平台。

**来源**: Teleprompter.com, "TikTok 3 Second Rule: How to Hook Viewers Fast (2026)", 2025-03-21

### 1.2 声乐表现的 5P 框架

**Speaking.coach (Nausheen I. Chen)** 提出镜头前发声的 5P 框架：

| 维度 | 英文 | 在 TikTok hook 中的应用 |
|------|------|------------------------|
| **音调** | Pitch | 场景切换时变化音调，给观众"音频线索"——这是新内容了 |
| **语速** | Pace | 快速传达能量和紧迫感；慢速传达权威和重要性 |
| **停顿** | Pause | 问句后停顿制造期待；关键数字前停顿吸引注意力 |
| **投射** | Projection | 镜头前不需要戏剧投射，适当收一点反而更自然 |
| **发音** | Pronunciation | 刻意清晰发音 = 自信 + 清晰 = 观众更愿意继续看 |

**核心洞察**: "When you go from one segment to the other, naturally vary the pitch and the tone so that you're giving the audience an audio clue."

**来源**: Speaking.coach, "Mastering Vocal Impact: The 5 Ps of Public Speaking on Camera"

### 1.3 Prosody 三要素与 AI 语音质量

**Camb.ai (2026)** 对 prosody 的学术定义：

> "Prosody is the pattern of pitch, rhythm, stress, volume, and pacing in spoken language. Where individual sounds carry literal meaning, prosody carries the emotional and structural meaning of a sentence."

**三核心要素**:

| 要素 | 定义 | 对 hook 的影响 |
|------|------|---------------|
| **Pitch (intonation)** | 句中音高起伏；升调=疑问/惊讶，降调=陈述/权威 | 平坦音调 = 机器人感 = 观众流失 |
| **Stress** | 对特定音节/词语的重音 | 重音位置改变句意，引导观众关注关键词 |
| **Rhythm** | 语速、节奏、停顿 | 快=紧迫感；慢=权威感；停顿=制造期待 |

**来源**: Camb.ai, "What Is Prosody In Speech? How AI Voices Use Pitch, Pace, And Stress", 2026-06-05

### 1.4 AI 语音克隆的 prosody 差异研究

**University of Cambridge (Bakkouche et al., 2026)** —— 学术论文对三种 TTS 系统（ElevenLabs、StyleTTS-V2、XTTS-V2）的 prosodic 分析：

**关键发现**:

1. **ElevenLabs 在 prosodic 措施上最接近人类语音**——尤其在语速、节奏、局部音调控制方面
2. **TTS 系统间最大差异**: speech rate, vowel-based rhythm measures, **local pitch-control measures**, speaker-embedding similarity
3. **Prosodic timing, rhythm, and fine-grained pitch control 是感知自然度的关键 correlates**
4. **Intonation-contour accuracy** 用四个指标衡量：DTW-RMSE, RMSE, Voicing Decision Error (VDE), Gross Pitch Error (GPE)

> "Prosodic timing, rhythm, and fine-grained pitch control are potential correlates of perceived naturalness, and that improvement of these features can contribute to the development of more natural-sounding synthesised speech."

**来源**: Bakkouche et al., "What determines the success of AI voice-cloned speech? Prosodic and acoustic evidence on three TTS systems", Phonetica, June 2026, DOI:10.1515/phon-2025-0062

### 1.5 F5-TTS 的 Prosody 机制与限制

F5-TTS 的设计哲学是"极简"：没有 duration predictor、没有 phoneme alignment、没有 text encoder。文本直接用 filler tokens 填充到与语音等长，然后做 flow matching 生成。这意味着模型**没有暴露任何直接的 prosody 控制参数**。

F5-TTS 的 prosody 控制机制是**参考音频驱动**的：

> "Instead of tagging every sentence with mood instructions, simply provide a reference audio clip that demonstrates the feeling you want — calm narration, energetic delivery, or warm storytelling. F5-TTS reads the emotional style directly from the sample and applies it to your new text."

**关键限制**: F5-TTS **没有直接的 pitch/tone/emotion 参数**。所有 prosodic 特征完全由参考音频决定。这意味着：
- 参考音频平淡 → 所有生成语音都平淡
- 参考音频高能量 → 所有生成语音都高能量
- **当前管线使用单一参考音频 → 所有场景语调一致 = 缺乏变化**

多个来源确认 F5-TTS 的"expressive range 较窄"——擅长直接叙述，但在风格变化灵活性上不如 Qwen3-TTS。

**可用原生参数**（已集成在项目 f5-mlx.mjs 中）：
- **speed** — 通过 duration 估算公式控制语速
- **nfe_step** — ODE 求解步数（32 默认），影响生成质量但不直接影响韵律
- **cfg_strength** — CFG 强度（默认 2.0），低值更自然，高值更清晰
- **sway_sampling_coef** — 推理时采样策略，非韵律参数

**来源**: 
- F5-TTS GitHub: https://github.com/swivid/f5-tts
- F5-TTS 论文: arXiv:2410.06885 (Chen et al., 2024)
- RealTimeTTS: https://realtimetts.com/f5-tts
- 本地源码验证: f5_tts_mlx/generate.py

### 1.6 可控 TTS 前沿

**arxiv (Xie et al., 2025)** —— 可控语音合成综述：

> "TTS technologies have evolved beyond synthesizing human-like speech to enabling controllable speech generation. This includes fine-grained control over various attributes of synthesized speech such as emotion, prosody, timbre, and duration."

**控制方法分类**:
1. **Reference audio-based** (F5-TTS, XTTS) —— 从参考音频提取风格
2. **Explicit parameter control** —— pitch contour, speaking rate, energy
3. **Natural language prompt-based** —— 用文字描述情绪/风格
4. **Diffusion model-based** —— 更精细的 prosody 生成

**来源**: Xie et al., "Towards Controllable Speech Synthesis in the Era of Large Language Models: A Survey", arXiv:2412.06602v2, 2025-03-27

### 1.7 Resemble AI 对 TikTok 语音优化的建议

**Resemble AI (2025)**:

> "Adjust pitch and tone to match your speaking style or to evoke specific emotions like excitement, calm, or urgency. Modify speech speed to keep your narration clear and easy to follow without sounding rushed or sluggish. Control pauses and emphasis to make your delivery more dynamic."

**来源**: Resemble AI, "How to Use AI to Enhance Your Voice for TikTok", 2025-08-19

### 1.8 TikTok 创作者实践经验

**@askvinh (TikTok creator)** 系列视频：
- "Enhance Engagement with Vocal Variety Techniques" —— 声乐多样性提升互动
- "Mastering Speech: Lowering Your Voice Pitch for Authority" —— 降低音调增加权威感
- "Transform Your Speech: Gain Authority with Pitch" —— 用音调变化建立权威
- "Enhancing Clarity in Speech: Mastering Your Rate" —— 掌握语速提升清晰度

**来源**: TikTok @askvinh 系列, Instagram Reels

---

## 2. 当前管线问题分析

### 2.1 现状

| 组件 | 当前状态 | 问题 |
|------|----------|------|
| 参考音频 | 单一 `voice-sample-24k.wav` | 所有场景使用相同 prosody 模式 |
| 语速 | 全局 `F5_SPEED=1.0` | 无法按场景类型调节 |
| 后处理 | rubberband 已禁用（F5 上产生机械感） | 无 prosody 差异化处理 |
| 场景差异 | hook/narrative/CTA 无 TTS 层面区分 | hook 缺乏"音调线索"变化 |

### 2.2 研究指出的核心问题

1. **"Flat, monotone read"** —— ReelForge AI 明确指出这是 hook 杀手
2. **缺乏 pitch variation** —— Speaking.coach 的 5P 框架强调场景间变化音调
3. **无策略性停顿** —— Camb.ai 指出 rhythm/pause 是 prosody 三要素之一
4. **单一 prosody pattern** —— Cambridge 研究表明 local pitch-control 是自然度关键

---

## 3. 优化方案

### 方案 A: FFmpeg 后处理 Prosody 增强（已实施，F5 上已禁用）

**原理**: 在 TTS 生成后，用 FFmpeg rubberband 对不同场景类型的音频做差异化的 pitch/tempo 后处理。

**已实施 per-scene-type 参数**（2026-08-08 实施，使用 FFmpeg rubberband 滤镜）:

| 场景类型 | pitch | tempo | volume | 效果 |
|----------|-------|-------|--------|------|
| hook | 1.04 (+4%) | 1.06 (+6%) | 1.15 (+15%) | 紧迫/活力 + 加大音量 |
| data | 0.98 (-2%) | 0.98 (-2%) | 1.0 | 权威/分量感 |
| quote | 1.0 | 0.97 (-3%) | 1.0 | 强调/从容 |
| cta | 0.98 (-2%) | 0.95 (-5%) | 1.0 | 温暖/邀请感 |

> **2026-08-14 更新**：rubberband 后处理在 F5-TTS 上已禁用（`f5-mlx.mjs` L97-99）。原因：rubberband 做的是时间拉伸+重采样，在修改 pitch 时会影响频谱整体，在 F5 模型生成的"干净"音频上更容易暴露机械感 artifacts。F5 的内部 duration 控制已提供自然节奏，不需要后处理 pitch/tempo 操纵。Qwen3-TTS 引擎仍保留 rubberband prosody 支持。

**如果仍需后处理路径**：TD-PSOLA（Time-Domain Pitch-Synchronous Overlap-and-Add）是比 rubberband 更好的选择：
- **保持频谱包络**：TD-PSOLA 在 pitch period 级别操作，修改基频而不改变共振峰（formants），声音特征不变形
- **学术验证**：Morrison et al. (2021) 的 Context-Aware Prosody Correction 使用 TD-PSOLA + 神经网络去噪
- **Python 实现**：`maxrmorrison/psola`（GitHub）提供了 Python TD-PSOLA 库
- **限制**：需要 pitch contour 提取（CREPE 或 pypar），比 rubberband 多一步处理

**FFmpeg Pitch Shift 技术对比**:

| 方法 | 命令 | 质量 | 适用场景 |
|------|------|------|----------|
| **rubberband** | `rubberband=pitch=1.04:tempo=1.06` | 中等（F5 上有机械感） | 非 F5 引擎 |
| **asetrate** | `asetrate=25920,aresample=24000,atempo=0.926` | 中等 | 全局变调，简单快速 |
| **TD-PSOLA** | Python `psola.vocode()` | 高 | 保持共振峰，最自然 |

### 方案 B: 多参考音频（推荐优先，零改代码）

**原理**: F5-TTS 的 prosody 完全由参考音频决定。为不同场景类型准备不同的参考音频，让 hook 和 CTA 有不同的 prosody pattern。

**多源验证**：F5 会将参考音频中的情绪、语速、韵律特征部分传递到生成结果中。
- F5 官方 Demo 页面展示了 "Emotion" 章节，用不同情绪的参考音频生成不同情绪的语音
- LocalAIMaster 指南："For voice with emotion (excited, calm, sad), include that emotion in the reference — F5-TTS will partially carry it through to generation"
- YouTube 教程展示了 multistyle 功能：上传不同情绪的参考音频，在文本中用括号标记切换

**实现方式**:

1. **录制/选取 4 段参考音频**:

| 文件 | visualType | 风格 | 音调特征 | 语速 |
|------|-----------|------|----------|------|
| `ref-hook-24k.wav` | hook | 紧迫/高能量 | 较高 pitch，大 variation | 较快 |
| `ref-narrative-24k.wav` | narrative | 权威/稳定 | 中等 pitch，稳定 | 中等 |
| `ref-data-24k.wav` | data | 强调/刻意 | 中低 pitch，有起伏 | 稍慢 |
| `ref-cta-24k.wav` | cta | 温暖/邀请 | 较低 pitch，柔和 | 慢 |

每段音频 10-15 秒，24kHz mono WAV，附精确 ref-text。

2. **修改 `f5-mlx.mjs`** 支持按场景选择参考音频:

```javascript
const REF_AUDIO_MAP = {
  hook: join(ROOT_DIR, "voice-samples", "ref-hook-24k.wav"),
  narrative: join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav"),
  data: join(ROOT_DIR, "voice-samples", "ref-data-24k.wav"),
  cta: join(ROOT_DIR, "voice-samples", "ref-cta-24k.wav"),
};
```

3. **修改 `f5_mlx_batch_tts.py`** 支持 per-scene ref audio（manifest 中增加 ref_audio 和 ref_text 字段）

**优点**: 最符合 F5-TTS 设计理念，自然度最高，无 artifacts
**缺点**: 需要录制多段参考音频；参考音频韵律传递是"部分"的，不是完全可控的（ReStyle-TTS 论文指出这是零样本 TTS 的 fundamental limitation）
**限制**: 参考音频 ≤15 秒（F5 硬限制），需要同一说话人演绎不同风格

### 方案 C: 探索可控 TTS 引擎（长期）

**原理**: 评估具有直接 prosody/emotion 控制参数的 TTS 引擎，或切换到已有 prosody 支持的引擎。

**当前可用选项**：
- **Qwen3-TTS**（项目备用引擎）— 已有 rubberband prosody profiles 支持，设 `TTS_ENGINE=qwen-tts` 即可启用。Qwen3 的 expressive range 本身就比 F5 宽
- **ElevenLabs** — 情绪标签 + voice design，$0.30/1000 chars，适合 hook 专用
- **F5-TTS v1 Prism** — 多风格参考 + emotion transfer（免费，已有基础设施）

### 方案 D: 参考音频优化（立即可做）

**原理**: 即便只用单一参考音频，选择一段 prosody 更丰富的录音也能改善所有场景。

**操作**:
1. 录制一段 10-15 秒的参考音频，刻意包含：开头高能量、高 pitch → 中间稳定陈述 → 结尾柔和降调
2. 确保音调 variation 大，不要平铺直叙
3. F5 会从这段音频提取整体的 prosody pattern

**注意**: F5 的 ref text 必须精确匹配 ref audio，所以需要先录制再转录。

### 方案 E: EmoSteer-TTS — Training-Free Activation Steering（研究最前沿）

2025 年 8 月发表的论文，专门针对 F5-TTS 等 flow matching TTS 模型做 training-free 情感控制。

**核心原理**：
1. 从预训练 F5-TTS 模型中提取中性语音和情感语音的中间激活值
2. 计算两者的差异向量（steering vector）
3. 在推理时将 steering vector 注入到 DiT 层的 residual stream 中

**关键技术细节**：
- 对 F5-TTS 的 22 层 DiT，每 5 层注入一次（layer 1, 6, 11, 16, 21），修改 first residual stream
- 必须在所有 32 个 flow matching steps 上做 steering，只在早期 steps 做效果微弱，中后期效果最强
- 支持情感转换（conversion）、插值（interpolation）、擦除（erasure）和组合（composition）
- 支持的情感：angry, happy, sad, neutral, surprised, disgusted, fearful
- 有非官方 PyTorch 实现（GitHub: sujin-koo/emosteer-tts-unofficial）
- 有 Demo 页面可试听

**适用性评估**：
- ✅ Training-free，不需要重训 F5 模型
- ✅ 已验证对 F5-TTS 有效
- ✅ 支持连续控制（alpha 参数可调节情感强度）
- ⚠️ 需要 ESD (Emotion Speech Dataset) 来构建 steering vectors
- ⚠️ 非官方实现，需要适配到 MLX 框架（activation hooks 机制在 PyTorch 和 MLX 间不完全等价）
- ⚠️ ESD 数据集的情感语音需要与项目参考音频是同一说话人才能避免 timbre 漂移

### 方案 F: F5-TTS-Emotional-CFG — Fine-tune 方案

RaduBolbo 在 GitHub 开源的项目，通过 Multi-Term Classifier-Free Guidance 添加情感条件。

**核心方法**：
- 在 ESD 数据集上 fine-tune F5-TTS 模型
- 推理时用双重 CFG：`--cfg-strength`（常规 CFG）+ `--cfg-strength2`（情感 CFG）
- 支持的情感：Angry, Happy, Sad, Neutral, Surprise
- `cfg-strength2` 典型值 2-20，越高情感越强但可能降低自然度

**适用性评估**：
- ✅ 有代码和模型可用，论文已发表（SpeD 2025）
- ❌ 需要 fine-tune 模型（GPU 资源需求）
- ❌ 基于 PyTorch 原版 F5-TTS，非 MLX，fine-tuned 模型可能不兼容 MLX 推理

---

## 4. Contrarian Views & Risks

### F5-TTS 的韵律天花板
Medium 对比评测明确指出："F5-TTS 的 tradeoff 是 narrower expressive range；它处理 straightforward narration 很好，但不匹配 Qwen3 的 style-instruction flexibility。" 这意味着即使用 EmoSteer 或参考音频策略，F5-TTS 的韵律上限可能仍低于 Qwen3-TTS。

### 参考音频策略的不确定性
参考音频的情绪传递是"部分"的，不同文本、不同语言、不同长度的传递效果不一致。ReStyle-TTS 论文指出，零样本 TTS 中参考音频的风格影响是"fundamental limitation"。

### Post-processing 路线的根本矛盾
无论是 rubberband 还是 TD-PSOLA，在模型生成的"干净"音频上做后处理都存在根本矛盾：模型输出已经是"最优"的语音表示，任何后处理修改都会引入某种程度的失真。Neural TTS 的核心优势就是"prosody 在生成阶段就内嵌了，不是后处理添加的"。

---

## 5. 推荐实施路径

### Phase 1: 立即行动（1 天）

1. **方案 D** — 录制一段 prosody 更丰富的参考音频替换当前的 `voice-sample-24k.wav`
2. **方案 C 备选** — 在关键视频上设 `TTS_ENGINE=qwen-tts` 启用已有 prosody

### Phase 2: 短期优化（2-3 天）

1. **方案 B** — 录制多风格参考音频，修改 F5 batch 脚本支持 per-scene ref
2. 建立参考音频库（3-4 种风格）
3. 在 scene-data 中添加 `refStyle` 字段自动选择参考音频

### Phase 3: 中期探索（按需）

1. **方案 E** — 评估 EmoSteer-TTS 的 MLX 适配可行性
2. **方案 C** — 评估 ElevenLabs 仅用于 hook scene 的成本/效果

---

## 6. Prosody 优化检查清单

基于研究发现，以下是每条视频应检查的 prosody 维度：

| 维度 | 规则 | 验证方法 |
|------|------|----------|
| **Hook pitch variation** | Hook scene 的音调变化 > narrative scene | 频谱分析对比 |
| **Hook tempo** | Hook 语速比 narrative 快 10-15% | 时长/词数对比 |
| **Data scene authority** | 数据场景音调微降、语速微减 | 听感对比 |
| **CTA warmth** | CTA 音调降低、语速放缓 | 听感对比 |
| **Pause placement** | 问句后有 0.3-0.5s 停顿 | 音频波形检查 |
| **No monotone** | 整体音频 pitch variance > 单一参考音频 | f0 分析 |

---

## 7. 与现有管线的关系

### 需要修改的文件

| 文件 | 修改内容 | 方案 |
|------|----------|------|
| `lib/tts/post-process.mjs` | `buildFilter()` 支持 prosody 参数 | A（已实施，F5 禁用） |
| `lib/tts/f5-mlx.mjs` | 支持 per-scene ref audio | B |
| `f5_mlx_batch_tts.py` | manifest 支持 ref_audio/ref_text 字段 | B |
| `lib/tts/types.mjs` | TTSEngine 接口增加 prosody 支持 | A/B |
| `lib/tts/registry.mjs` | 传递 prosody 配置给引擎 | A/B |

### 不需要修改的文件

- `lib/subtitles/*` — 字幕对齐不受 prosody 影响
- `lib/assemble.mjs` — 视频合成不受影响
- `lib/timeline.mjs` — 时间线基于实际音频时长，自动适应

---

## 8. Recommendations（按实施难度排序）

| 优先级 | 方案 | 改动量 | 预期效果 | 风险 |
|--------|------|--------|---------|------|
| 1 | 多参考音频策略 (B) | 录制 4 段参考音频 + 修改 f5-mlx.mjs 按 visualType 选 ref | 中等，自然的韵律变化 | 参考音频情绪传递不精确 |
| 2 | 切换到 Qwen3-TTS (C) | 设 TTS_ENGINE=qwen-tts | 高，已有 prosody profiles | 生成质量/速度不同 |
| 3 | 参考音频优化 (D) | 录制一段更丰富的单一 ref audio | 低，改善基线 | 效果有限 |
| 4 | TD-PSOLA 后处理 | 添加 psola Python 脚本 + 修改 post-process.mjs | 中等，比 rubberband 好 | 仍有后处理 artifacts |
| 5 | EmoSteer-TTS (E) | 适配 MLX + 构建 steering vectors | 高，精确情感控制 | 开发量大，MLX 适配风险 |
| 6 | F5-TTS-Emotional-CFG (F) | Fine-tune 模型 | 高 | GPU 需求，非 MLX |

---

## 9. Open Questions

1. **多参考音频策略的实际效果如何？** 需要录制同一说话人的 4 种情绪参考音频，用相同文本做 A/B 测试，验证韵律传递是否足够明显。
2. **EmoSteer-TTS 能否适配 MLX？** MLX 的 `mx.compile` 和 forward hooks 机制与 PyTorch 不同，需要验证 steering vector 注入是否可行。
3. **TD-PSOLA 在 F5 输出上的 artifact 程度？** 需要用 `maxrmorrison/psola` 库做小规模测试，对比 rubberband 的机械感。
4. **是否应该在关键视频上切换到 Qwen3-TTS？** Qwen3-TTS 已有 prosody 支持（`do_sample=False` + `repetition_penalty=1.3`），且支持更长文本和更多风格指令。

---

## Appendix A: F5-TTS generate() 完整参数列表

从本地源码 `f5_tts_mlx/generate.py` 验证：

| 参数 | 类型 | 默认值 | 能控制 prosody? |
|------|------|--------|----------------|
| `generation_text` | str | — | ❌ 文本内容 |
| `duration` | float | None | ❌ 总时长 |
| `estimate_duration` | bool | False | ❌ 时长估算 |
| `ref_audio_path` | str | None | ✅ **决定 prosody pattern** |
| `ref_audio_text` | str | None | ✅ 必须匹配 ref audio |
| `speed` | float | 1.0 | ⚠️ 语速（影响节奏） |
| `steps` | int | 8 | ❌ 采样步数 |
| `method` | str | "rk4" | ❌ ODE 求解器 |
| `cfg_strength` | float | 2.0 | ⚠️ CFG 强度（影响风格跟随度） |
| `sway_sampling_coef` | float | -1.0 | ⚠️ 采样偏移（影响输出变化性） |
| `seed` | int | None | ⚠️ 不同 seed 产生不同韵律 |
| `quantization_bits` | int | None | ❌ 量化 |

**结论**: F5-TTS 的 prosody 控制依赖 `ref_audio_path`（最有效）+ `cfg_strength`/`sway_sampling_coef`/`seed`（间接微调）。

---

## Appendix B: Duration Predictor 社区增强方案

GitHub Issue #993 介绍了社区开发的 F5-TTS Duration Predictor 增强版。F5-TTS 原始设计没有 duration predictor，通过字符比例估算时长，这在短文本上表现不佳。

- Duration predictor 学习 token 级别的时长，给予更好的 rhythm/pacing/prosody 控制
- 显著减少跳字、异常停顿、重复音等 TTS artifacts
- 可在已有 checkpoint 上 fine-tune
- ⚠️ 需要额外 fine-tune，主要解决节奏准确性而非情感表达

---

## Design Decisions & References

- 现有 prosody 代码：`scripts/short-video/lib/tts/post-process.mjs`（rubberband 滤镜，F5 已禁用）
- F5 prosody 禁用决策：`scripts/short-video/lib/tts/f5-mlx.mjs` L97-99（2026-08-14 禁用）
- F5 参数配置参考：`scripts/short-video/f5_mlx_batch_tts.py`
- F5-TTS 官方论文：arXiv:2410.06885 (Chen et al., 2024)
- F5-TTS-MLX 实现：GitHub lucasnewman/f5-tts-mlx v0.2.6
- EmoSteer-TTS 论文：arXiv:2508.03543 (Xie et al., 2025-08-05)
- F5-TTS-Emotional-CFG：GitHub RaduBolbo/F5-TTS-Emotional-CFG (SpeD 2025)
- TD-PSOLA Python 库：GitHub maxrmorrison/psola
- Context-Aware Prosody Correction：Morrison et al., 2021 (Interactive Audio Lab, Northwestern)
- ReStyle-TTS：arXiv:2601.03632 (2026)

---

## Bibliography

### Original Research (2026-08-08, 15 sources)

1. **ReelForge AI**, "Guide to Viral Video Hooks: 7 Proven Strategies That Work", 2026-07-02
2. **Teleprompter.com**, "TikTok 3 Second Rule: How to Hook Viewers Fast (2026)", 2025-03-21
3. **Speaking.coach (Nausheen I. Chen)**, "Mastering Vocal Impact: The 5 Ps of Public Speaking on Camera"
4. **Camb.ai**, "What Is Prosody In Speech? How AI Voices Use Pitch, Pace, And Stress", 2026-06-05
5. **Bakkouche et al.**, "What determines the success of AI voice-cloned speech?", Phonetica, June 2026
6. **Xie et al.**, "Towards Controllable Speech Synthesis in the Era of Large Language Models: A Survey", arXiv:2412.06602v2, 2025-03-27
7. **Resemble AI**, "How to Use AI to Enhance Your Voice for TikTok", 2025-08-19
8. **F5-TTS GitHub** (SWivid), https://github.com/swivid/f5-tts
9. **RealTimeTTS**, https://realtimetts.com/f5-tts
10. **HeyOrca**, "The best TikTok hooks to boost views and engagement", 2025-12-12
11. **Picovoice.ai**, "Complete Guide to Text-to-Speech (TTS) Technology (2026)", 2025-12-02
12. **Chen et al.**, "F5-TTS: A Fairytaler that Fakes Fluent and Faithful Speech with Flow Matching", arXiv:2410.06885, 2024
13. **Bakkouche et al.**, "Finding the Human Voice in AI", Interspeech 2025
14. **TikTok @askvinh**, vocal variety and pitch authority series
15. **Instagram Reel @DbBBRZcxRAn**, "Which hook sounds better?"

### F5-TTS Prosody Deep Research (2026-08-17, 20 sources)

16. https://arxiv.org/html/2410.06885v3 — F5-TTS 论文（ACL 2025）— Tier 1
17. https://swivid.github.io/F5-TTS — F5-TTS 官方 Demo — Tier 1
18. https://github.com/lucasnewman/f5-tts-mlx — F5-TTS-MLX 实现（v0.2.6）— Tier 1
19. https://localaimaster.com/blog/f5-tts-setup-guide — F5-TTS Setup Guide 2026 — Tier 2
20. https://arxiv.org/html/2508.03543v3 — EmoSteer-TTS 论文 — Tier 1
21. https://emosteer-tts-demo.pages.dev — EmoSteer-TTS Demo 页面 — Tier 1
22. https://github.com/sujin-koo/emosteer-tts-unofficial — EmoSteer-TTS 非官方实现 — Tier 2
23. https://github.com/RaduBolbo/F5-TTS-Emotional-CFG — F5-TTS 情感 CFG — Tier 2
24. https://github.com/SWivid/F5-TTS/issues/993 — Duration Predictor 社区增强 — Tier 3
25. https://github.com/SWivid/F5-TTS/issues/1155 — 短文本时长问题 — Tier 3
26. https://interactiveaudiolab.github.io/assets/papers/morrison2021context.pdf — Context-Aware Prosody Correction — Tier 1
27. https://github.com/maxrmorrison/psola — Python TD-PSOLA 库 — Tier 2
28. https://arxiv.org/html/2407.05471v1 — Fine-Grained Neural Speech Editing — Tier 1
29. https://www.isca-archive.org/interspeech_2025/lee25f_interspeech.pdf — Counterfactual Activation Editing — Tier 1
30. https://aclanthology.org/2025.coling-main.518.pdf — ProsodyFlow — Tier 1
31. https://medium.com/data-science-collective/high-quality-long-form-tts-with-qwen3-open-weight-models — F5 vs Qwen3 对比 — Tier 3
32. https://www.emergentmind.com/topics/f5-tts — F5-TTS 综述 — Tier 2
33. https://www.emergentmind.com/topics/emosteer-tts — EmoSteer-TTS 综述 — Tier 2
34. https://arxiv.org/html/2601.03632v1 — ReStyle-TTS — Tier 1
35. https://comfy.icu/node/F5TTSEngineNode — F5-TTS ComfyUI 参数文档 — Tier 3
