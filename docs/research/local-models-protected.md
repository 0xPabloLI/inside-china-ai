# 本地在用模型保护清单

> **不可删除**。清理本地模型前必须核对此清单。
> 最后更新：2026-10-09（Whisper 四模型盘点；Systran/faster-whisper-large-v3 **已删**，见下）

## Whisper 家族盘点（2026-10-09）

ASR 一共四个模型，**各有用途，无冗余**。此前的 `Systran/faster-whisper-large-v3`
已删除（损坏且无调用方，详见 `keyframe-extraction-research.md` Q41 系列）。

| 模型 | 引擎 | 用途 | 大小 | 删除后果 |
|------|------|------|------|----------|
| `ggml-large-v3-turbo.bin` | whisper.cpp | **生产**：`video-understand.mjs` 转写 + `tts/quality-gate.mjs` 回读质检（ADR-0020） | 1.5GB | 生产 ASR 断 |
| `ggml-large-v3.bin` | whisper.cpp | #418 计时矩阵的 cpp large-v3 格（**该格尚未跑**，模型已就位） | 2.9GB | #418 缺口补不上，需重下 |
| `mlx-community/whisper-large-v3-mlx` | MLX | bench 转写（`asr_batch.py`）+ #418 的 MLX large-v3 计时格 | 2.9GB | bench 转写与 #418 断 |
| `mlx-community/whisper-large-v3-turbo` | MLX | #418 的 MLX turbo 计时格 | 1.5GB | #418 断 |

> 后三个是 **#418 未完成部分的输入**，不是可清理的旧物。#418 剩余验收明写
> 「同批音频 × {turbo, large-v3} × {whisper.cpp, MLX}」——四格中已有三格
> （cpp turbo / MLX turbo / MLX large-v3），缺的正是 cpp large-v3。

## HuggingFace 缓存（~/.cache/huggingface/hub/）

| 模型 | 用途 | 大小 | 删除后果 |
|------|------|------|----------|
| Boogu/Boogu-Image-0.1-Turbo | T2I 文生图（Boogu/mflux） | 36GB | T2I 管线断 |
| FastVideo/FastMetal-1.3B-QAD | T2V B-roll 生成（现役 Wan1.3B 档，`b-roll/mlx_wan_batch.py`） | 12GB | B-roll 管线断 |
| FastVideo/FastMetal-5B-QAD | T2V B-roll 生成 5B 档（#298 画质升级候选） | 12GB | 5B 评测链断（用户确认在用，2026-09-25） |
| ~~Systran/faster-whisper-large-v3~~ | ~~ASR 转写（`asr-analyzer.mjs` / WhisperX）~~ | ~~2.9GB~~ | **2026-10-09 已删**：`model.bin` 中段损坏（sha256 `f686498e…` ≠ HF `69f74147…`，大小却相同、文件头有效），且 `asr-analyzer.mjs` 的 `transcribeAudioWindow` 从无调用方。留着的风险是「头完好、只有中段坏」会给出 `Invalid string length` 这类难诊断的报错——删掉后缺失会变成清晰的「模型不存在」 |
| facebook/wav2vec2-large-960h-lv60-self | 字幕强制对齐（`text-align.py`，**非 ASR**：对齐已知文本，不做识别） | 1.2GB | 字幕对齐断 |
| lucasnewman/f5-tts-mlx | TTS 语音合成 | 1.3GB | TTS 断 |
| mlx-community/S3TokenizerV3 | tokenizer | 923MB | tokenizer 断 |
| mlx-community/MiniCPM-o-4_5-4bit | **空壳（仅 4KB refs 骨架，无权重）**——2026-09-24 HF 首次下载残留，真身在 `~/models/` | 4KB | 无影响（清理候选，待确认后删） |

> 变更记录（2026-09-25 核对）：GLM-4.1V-9B-Thinking-4bit（6.6GB）与 Qwen3-VL-2B-Instruct-4bit（1.7GB）**已不在缓存中**（此前清理）；VLM 现役引擎已迁至 `~/models/`。

## ~/models/

| 模型 | 用途 | 大小 | 删除后果 |
|------|------|------|----------|
| Qwen3-VL-30B-A3B-Instruct-4bit | 现役生产 VLM（`vlm-model.json` 默认引擎，#351 已单源化）+ 备选 1 引擎 | 17GB | VLM 生产与备选断 |
| MiniCPM-o-4_5-4bit | 方案 C 主引擎（#361 待接入，已全量实测：视觉/ASR/情绪/音视频联合） | 5.7GB | 方案 C 断 |

## ModelScope 缓存（~/.cache/modelscope/）

| 模型 | 用途 | 大小 | 删除后果 |
|------|------|------|----------|
| iic/emotion2vec_plus_large | 九类语音情绪（#361 方案 C 插件，e2v 辅助信号；2026-09-25 下载） | 1.9GB | e2v 插件断 |

## Ollama（~/.ollama/models/）

| 模型 | 用途 | 大小 | 删除后果 |
|------|------|------|----------|
| ornith:1.5-9b | OCR 代码审查（纯文本 + tools） | 9.8GB | OCR 断 |
| bge-m3 | embedding | 1.2GB | embedding 断 |

## venvs

| 路径 | 用途 | 大小 |
|------|------|------|
| ~/.venvs/mlx-vlm/ | MLX VLM 运行环境 | 1.7GB |
| ~/.video-tts-env/ | TTS + ASR + 对齐 + e2v 运行环境 | — |
| ~/.video-t2i-env/ | Boogu/mflux T2I 运行环境 | 1.3GB |

## 仓库内依赖

| 路径 | 用途 | 大小 |
|------|------|------|
| scripts/short-video/experiments/fastvideo-spike/repo/ | FastVideo B-roll 依赖 | 4.4GB |
