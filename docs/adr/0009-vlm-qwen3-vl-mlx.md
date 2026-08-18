# VLM Analysis Layer: Qwen3-VL-8B via mlx-vlm

The video pipeline needs to understand visual assets (images, videos) before assigning them to scenes — describe content, analyze fit (landscape-to-vertical placement), and score asset-scene relevance. This must run locally (no per-call API cost for 20+ assets per video) on Apple Silicon.

**Use `mlx-community/Qwen3-VL-8B-Instruct-8bit` (9.2GB) via mlx-vlm** as the VLM, running as a persistent Python subprocess managed by a Node.js gateway (`visual-analyzer.mjs`). Local-first is a design principle (same as TTS — see ADR-0008). Cloud VLM APIs ($0.01-0.03/image) are a fallback, not primary.

## Considered Options

- **Cloud VLM APIs** (GPT-4V, Claude Vision): Faster (2-5s vs 20-30s) but per-call cost, network latency, privacy concerns, and non-reproducible quality (model changes with API versions).
- **LLaVA / other local VLMs**: Weaker on Chinese content and technology/brand recognition. Qwen3-VL has better video understanding and instruction following.
- **Ollama-based VLM**: Ollama does not support vision models natively. mlx-vlm is purpose-built for Apple Silicon.

## Consequences

- VLM architecture, performance characteristics, and known limitations: see `docs/video-workflow.md` → VLM Asset Analysis.
- VLM is integrated into `asset-sourcer.mjs` — two-phase analysis (focus detection then VLM). See ADR-0015 for the focus detection subprocess.
- Requires `~/.video-tts-env` (Python 3.12) with mlx-vlm installed — see ADR-0011.
- Future model upgrade requires: (1) update `MODEL_ID` in `vlm_analyzer.py`, (2) verify `apply_chat_template` compatibility, (3) re-run end-to-end validation.
- Alternatives survey: `docs/research/asset-focus-detection-alternatives.md`.
