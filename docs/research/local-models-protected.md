# 本地在用模型保护清单

> **不可删除**。清理本地模型前必须核对此清单。
> 最后更新：2026-09-23

## HuggingFace 缓存（~/.cache/huggingface/hub/）

| 模型 | 用途 | 大小 | 删除后果 |
|------|------|------|----------|
| Boogu/Boogu-Image-0.1-Turbo | T2I 文生图（Boogu/mflux） | 36GB | T2I 管线断 |
| FastVideo/FastMetal-1.3B-QAD | T2V B-roll 生成 | 12GB | B-roll 管线断 |
| Systran/faster-whisper-large-v3 | ASR 转写 | 2.9GB | ASR 断 |
| facebook/wav2vec2-large-960h-lv60-self | 字幕强制对齐 | 1.2GB | 字幕对齐断 |
| lucasnewman/f5-tts-mlx | TTS 语音合成 | 1.3GB | TTS 断 |
| mlx-community/GLM-4.1V-9B-Thinking-4bit | VLM 图像理解 | 6.6GB | VLM 断 |
| mlx-community/Qwen3-VL-2B-Instruct-4bit | VLM 轻量图像理解 | 1.7GB | VLM 断 |
| mlx-community/S3TokenizerV3 | tokenizer | 923MB | tokenizer 断 |

## ~/models/

| 模型 | 用途 | 大小 | 删除后果 |
|------|------|------|----------|
| Qwen3-VL-30B-A3B-Instruct-4bit | MoE VLM（待测） | 17GB | 待测模型丢失 |

## Ollama（~/.ollama/models/）

| 模型 | 用途 | 大小 | 删除后果 |
|------|------|------|----------|
| ornith:1.5-9b | OCR 代码审查（纯文本 + tools） | 9.8GB | OCR 断 |
| bge-m3 | embedding | 1.2GB | embedding 断 |

## venvs

| 路径 | 用途 | 大小 |
|------|------|------|
| ~/.venvs/mlx-vlm/ | MLX VLM 运行环境 | 1.7GB |
| ~/.video-tts-env/ | TTS + ASR + 对齐运行环境 | — |
| ~/.video-t2i-env/ | Boogu/mflux T2I 运行环境 | 1.3GB |

## 仓库内依赖

| 路径 | 用途 | 大小 |
|------|------|------|
| scripts/short-video/experiments/fastvideo-spike/repo/ | FastVideo B-roll 依赖 | 4.4GB |