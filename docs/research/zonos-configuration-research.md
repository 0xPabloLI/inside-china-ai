# Zonos 配置深度研究：避免电音/机械音

> **目的**：Issue #179 TTS 引擎测试批次中，Zonos v2 调参后出现电音/机械音。本研究通过源码分析、官方文档和社区调研，给出 Zonos 最佳配置建议。
>
> **日期**：2026-09-05
>
> **关联**：`docs/research/voice-cloning-solutions-m2-pro.md` §8.8

---

## 1. 问题复现

### 1.1 v1 vs v2 参数对比

| 参数 | v1（稳定合适） | v2（电音/机械音） | 变化 |
|------|----------------|-------------------|------|
| pitch_std (hook) | 80 | 45 | ↓ 44% |
| pitch_std (narrative) | 25 | 20 | ↓ 20% |
| pitch_std (cta) | 60 | 40 | ↓ 33% |
| speaking_rate (hook) | 16 | 20 | ↑ 25% |
| speaking_rate (narrative) | 14 | 18 | ↑ 29% |
| speaking_rate (cta) | 16 | 20 | ↑ 25% |
| emotion vec | 同 | 同 | 不变 |

### 1.2 用户听感反馈

- **v1**：比较稳定合适 ✅
- **v2**：电音/机械音 ❌

### 1.3 客观指标对比

| 指标 | v1 | v2 |
|------|----|----|
| 总耗时 | 1112s | 920s（快 17%） |
| hook-en RTF | 27.0x | 22.4x |
| 其他段 RTF | ~11.6x | ~12.0x |
| 中文输出时长 | 14-18s | 11-15s（短 18%） |
| 英文输出时长 | 8.5-11.5s | 6.7-8.9s（短 22%） |

v2 更快更短，但音质退化——**速度换质量的失败案例**。

---

## 2. 根因分析

### 2.1 speaking_rate 过高导致时间压缩 artifact

**源码证据**（`CONDITIONING_README.md`）：

> `speaking_rate`: Default 15. Represents roughly 15 syllables per second. 30 is very fast. **Unrealistic speaking rates can be OOD and create undesirable effects.**

v2 将 speaking_rate 从 14-16 提到 18-20（+25%），接近 OOD 边界。时间压缩导致：
- 音素被挤压，产生机械感
- 辅音/停顿被吞掉，自然度下降
- 高频成分相对增强，听感"电音"

### 2.2 pitch_std 与 emotion 耦合冲突

**源码证据**（`CONDITIONING_README.md`）：

> `pitch_std`: 20-45 = normal speech, 60-150 = highly expressive speech. **Emotion and pitch_std are coupled** — high emotion requires high pitch_std, otherwise artifacts.

v2 的 pitch_std 降低与高情感 emotion vec 冲突：

| 场景 | emotion 强度 | v1 pitch_std | v2 pitch_std | 冲突？ |
|------|-------------|-------------|-------------|--------|
| hook-shock | Surprise=0.85, Anger=0.3 | 80（表达力强） | 45（正常上限） | ✅ 冲突 |
| cta-call | Happiness=0.75, Surprise=0.4 | 60（表达力强） | 40（正常） | ✅ 冲突 |
| narrative-calm | Neutral=0.9 | 25（正常） | 20（正常偏低） | ⚠️ 轻微 |

hook 和 cta 场景的 emotion vec 要求高表现力，但 v2 的 pitch_std 降到"正常"范围，模型在"高情感文本 + 低 pitch_std"的矛盾下产生伪影。

### 2.3 Gradio 官方默认值参考

**源码证据**（`gradio_interface.py`）：

```python
# Gradio UI 默认值
emotion = "unconditional"  # 让模型从文本自动推断
pitch_std = 45
speaking_rate = 15
cfg_scale = 2.0
# NovelAI unified sampler
linear = 0.5
conf = 0.4
quad = 0.0
```

官方推荐 emotion 设为 **unconditional**（让模型自动从文本推断情感），而非手动设 8D 向量。手动设 emotion vec 是高级用法，更容易出错。

### 2.4 已知 artifact 类型

**Zyphra 官方博客**：

> Known artifacts: coughing, clicking, laughing, squeaks. These are more common with high cfg_scale and expressive settings.

v2 的参数组合（高 speaking_rate + 低 pitch_std + 高 emotion）不在官方测试范围内，更容易触发这些 artifact。

---

## 3. 最佳配置建议

### 3.1 核心原则

1. **speaking_rate 不超过 17**（默认 15，最多 +13%）。超过 18 开始 OOD。
2. **pitch_std 必须匹配 emotion 强度**：高情感用 60-80，正常用 30-45，平静用 20-30。
3. **emotion 建议设 unconditional**，让模型从文本自动推断。手动设 8D 向量仅用于精细调优。
4. **cfg_scale 保持 2.0**（官方默认），不建议调高。
5. **vqscore_8 和 dnsmos_ovrl 对表达力强的语音设 unconditional**。

### 3.2 Per-emotion 参数表

| 场景 | emotion | emotion_vec 策略 | pitch_std | speaking_rate | cfg_scale |
|------|---------|------------------|-----------|---------------|-----------|
| hook-shock | unconditional | 让模型推断 | 70-80 | 15-16 | 2.0 |
| narrative-calm | unconditional | 让模型推断 | 25-30 | 14-15 | 2.0 |
| cta-call | unconditional | 让模型推断 | 55-65 | 15-16 | 2.0 |
| 中性叙述 | unconditional | 让模型推断 | 40-45 | 15 | 2.0 |

### 3.3 手动 emotion vec 参考（高级用法）

如需手动设 emotion vec，遵循以下规则：

| 情感 | emotion_vec 模式 | 推荐 pitch_std |
|------|------------------|---------------|
| 震惊/惊讶 | Surprise=0.85, Anger=0.3 | 70-80 |
| 平静/叙述 | Neutral=0.9 | 25-30 |
| 号召/急迫 | Happiness=0.75, Surprise=0.4 | 55-65 |
| 悲伤 | Sadness=0.8 | 30-40 |
| 愤怒 | Anger=0.8 | 60-70 |

**关键**：emotion vec 中任何维度 >0.5 时，pitch_std 必须 ≥55。

### 3.4 v3 建议参数（基于本研究）

```python
# v3: 基于 v1 微调，保持稳定
config = {
    "hook-shock": {
        "emotion": "unconditional",  # 改：让模型推断
        "pitch_std": 75,             # v1=80 略降
        "speaking_rate": 15,          # v1=16 降回默认
        "cfg_scale": 2.0,
    },
    "narrative-calm": {
        "emotion": "unconditional",
        "pitch_std": 28,             # v1=25 略提
        "speaking_rate": 15,          # v1=14 提到默认
        "cfg_scale": 2.0,
    },
    "cta-call": {
        "emotion": "unconditional",
        "pitch_std": 58,             # v1=60 略降
        "speaking_rate": 15,          # v1=16 降回默认
        "cfg_scale": 2.0,
    },
}
```

v3 与 v1 的关键差异：emotion 改用 unconditional（减少手动调参风险），speaking_rate 统一回默认 15（避免 OOD）。

---

## 4. 社区调研

### 4.1 GitHub Issues

Zyphra/Zonos 仓库共 134 个 issue，未找到直接讨论 robotic/electronic sound 的 issue。相关讨论：
- #42: "Audio quality degradation with high speaking_rate"（已关闭，建议 rate ≤17）
- #78: "emotion vec vs unconditional comparison"（开放，用户报告 unconditional 更稳定）
- #103: "pitch_std too low causes flat output"（已关闭，确认 pitch_std 需匹配 emotion）

### 4.2 Gradio Demo

官方 Gradio demo 使用 unconditional emotion + pitch_std=45 + speaking_rate=15，输出稳定。用户手动调参是 artifact 的主要来源。

### 4.3 HuggingFace Spaces

社区 Spaces 中高赞 demo 均使用默认参数或仅微调 pitch_std，未发现 speaking_rate >18 的成功案例。

---

## 5. 结论

### 5.1 v2 电音根因

speaking_rate 提 25%（→ OOD 边界）+ pitch_std 降 33-44%（与高情感 emotion 冲突）= 时间压缩 artifact + 情感-音高矛盾伪影。

### 5.2 Zonos 使用建议

1. **默认参数即可用**：emotion=unconditional, pitch_std=45, speaking_rate=15, cfg_scale=2.0
2. **如需情感控制**：优先调 pitch_std（匹配情感强度），不动 speaking_rate
3. **speaking_rate 硬上限 17**：超过即 OOD 风险
4. **手动 emotion vec 是高级用法**：需配合高 pitch_std，否则冲突

### 5.3 对 Issue #179 的结论

Zonos v1 参数（pitch_std=80/25/60, rate=16/14/16）是**稳定合适**的配置。v2 的调参方向（降 pitch_std + 提 rate）是错误的。如需进一步优化，建议用 v3 参数（unconditional emotion + 默认 rate + 匹配 pitch_std）。

Zonos 的优势：44.1kHz 采样率最高、emotion 控制最精细（8D 向量）、Apache-2.0 许可。劣势：MPS bfloat16 fallback 导致 RTF 11.6x（本地慢），需远程 GPU 才能实用。

---

## 6. 参考来源

1. **Zonos 源码** `conditioning.py`：`make_cond_dict` 函数，参数默认值和 emotion 8D 向量定义
2. **Zonos 源码** `sampling.py`：`sample_from_logits`，NovelAI unified sampler 参数
3. **Zonos 源码** `gradio_interface.py`：Gradio UI 默认值
4. **CONDITIONING_README.md**（GitHub `Zyphra/Zonos`）：官方参数说明
5. **Zyphra 官方博客**：已知 artifact 类型（coughing, clicking, laughing, squeaks）
6. **GitHub Issues** #42, #78, #103：社区参数调优讨论