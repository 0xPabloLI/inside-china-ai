# 本地在用模型保护清单

> **不可删除**。清理本地模型前必须核对此清单。
> 最后更新：2026-09-25（Round M：30B 转正为现役生产引擎；新增 FastMetal-5B / MiniCPM-o / emotion2vec+ 登记；确认 GLM-4.1V-9B 与 Qwen3-VL-2B 已不在缓存）

## HuggingFace 缓存（~/.cache/huggingface/hub/）

| 模型 | 用途 | 大小 | 删除后果 |
|------|------|------|----------|
| Boogu/Boogu-Image-0.1-Turbo | T2I 文生图（Boogu/mflux） | 36GB | T2I 管线断 |
| FastVideo/FastMetal-1.3B-QAD | T2V B-roll 生成（现役 Wan1.3B 档，`b-roll/mlx_wan_batch.py`） | 12GB | B-roll 管线断 |
| FastVideo/FastMetal-5B-QAD | T2V B-roll 生成 5B 档（#298 画质升级候选） | 12GB | 5B 评测链断（用户确认在用，2026-09-25） |
| Systran/faster-whisper-large-v3 | ASR 转写（`asr-analyzer.mjs` / WhisperX，ADR-0020） | 2.9GB | ASR 断 |
| facebook/wav2vec2-large-960h-lv60-self | 字幕强制对齐 | 1.2GB | 字幕对齐断 |
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
