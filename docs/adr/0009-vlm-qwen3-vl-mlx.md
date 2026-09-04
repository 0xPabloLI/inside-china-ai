# VLM Analysis Layer: Cascade Router (Qwen3-VL-2B + GLM-4.1V-9B)

The video pipeline needs to understand visual assets (images, videos) before assigning them to scenes — describe content, analyze fit (landscape-to-vertical placement), and score asset-scene relevance. This must run locally (no per-call API cost for 20+ assets per video) on Apple Silicon.

**Use `mlx-community/Qwen3-VL-2B-Instruct-4bit` (1.8GB) via mlx-vlm** as the Fast Path VLM, with **`mlx-community/GLM-4.1V-9B-Thinking-4bit` (6.6GB)** as the Deep Path for complex images. GLM is lazy-loaded on first escalation. Running as an on-demand Python subprocess managed by `visual-analyzer.mjs`. Local-first is a design principle (same as TTS — see ADR-0008). Cloud VLM APIs ($0.01-0.03/image) are a fallback, not primary.

> **Benchmark and selection rationale**: `docs/research/vlm-model-selection-benchmark.md`. R6 benchmark confirmed GLM-4.1V-9B superior at Chinese recognition (恒生, 中国农业银行, 宇树科技); R7 showed Qwen3.5-4B is 8.3x slower with no quality gain; R8 head-to-head confirmed GLM's Chinese advantage.

## Cascade Router Design

| Path | Model                     | Speed       | Trigger                                                                                                           |
| ---- | ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Fast | Qwen3-VL-2B-4bit          | ~3-5s/image | All assets run here first                                                                                         |
| Deep | GLM-4.1V-9B-Thinking-4bit | ~28s/image  | `should_escalate()` signals: short output (<100 chars), missing fit (images), empty description, repetition (≥3x) |

GLM loads lazily on first escalation (7.4s load time). RAM check (`psutil`, ≥16GB free) gates loading. If GLM unavailable at any point, 2B result is returned with `escalated: False`. Response includes `escalated: True/False` metadata.

## Considered Options

- **Cloud VLM APIs** (GPT-4V, Claude Vision): Faster but per-call cost, network latency, privacy concerns, and non-reproducible quality.
- **LLaVA / other local VLMs**: Weaker on Chinese content and technology/brand recognition. Qwen3-VL has better video understanding and instruction following.
- **Ollama-based VLM**: Ollama supports some vision models but is 5-7x slower than mlx-vlm (R5 benchmark). Not suitable for production.
- **Qwen3.5-4B-MLX-4bit**: Tested in R7; 8.3x slower than 2B, no quality advantage. Not suitable.
- **GLM-4.5V/5.x**: Too large (45GB+ for 3-bit, MoE architecture). Requires ≥64GB RAM.

## Consequences

- VLM architecture and known limitations: see `docs/video-workflow.md` → VLM Asset Analysis.
- VLM is integrated into `asset-sourcer.mjs` — two-phase analysis (focus detection then VLM). See ADR-0015 for the focus detection subprocess.
- Requires `~/.video-tts-env` (Python 3.12) with mlx-vlm installed — see ADR-0011.
- Future model upgrade requires: (1) update `MODEL_ID` / `DEEP_MODEL_ID` in `vlm_analyzer.py`, (2) verify `apply_chat_template` compatibility, (3) re-run end-to-end validation.
