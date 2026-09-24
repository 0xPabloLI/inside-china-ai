# VLM Analysis Layer: Qwen3-VL-30B-A3B (Single Model)

The video pipeline needs to understand visual assets (images, videos) before assigning them to scenes — describe content, analyze fit (landscape-to-vertical placement), and score asset-scene relevance. This must run locally (no per-call API cost for 20+ assets per video) on Apple Silicon.

**Use `Qwen3-VL-30B-A3B-Instruct-4bit` (17GB, MoE 30B/3B active)** via mlx-vlm as the single VLM model. Running as an on-demand Python subprocess managed by `visual-analyzer.mjs`. Local-first is a design principle (same as TTS — see ADR-0008). Cloud VLM APIs ($0.01-0.03/image) are a fallback, not primary.

> **Benchmark and selection rationale**: `docs/research/vlm-model-selection-benchmark.md`. R10 benchmark + relevance accuracy test (17 asset-claim pairs × 3 models) confirmed 30B superior: 100% parse rate (vs 2B 59% / GLM 76%), 0% false-positive rate (vs 2B 10% / GLM 8%), gate accuracy 88% (vs 80% / 85%). Native video path on mlx-vlm 0.7.2 is 3.4x faster than frame extraction.

## Architecture

| Model | Speed | Role |
| ----- | ----- | ---- |
| Qwen3-VL-30B-A3B-Instruct-4bit (17GB) | ~10-60s/asset | Single model for all assets |

- **Images**: simulate 9:16 crop → resize if >1920px → generate
- **Video (full)**: native video input via `generate(video=)` — processor handles temporal sampling
- **Video (windowed)**: ffmpeg frame extraction (native video can't select a time range)

Previous cascade router (2B fast path + GLM-4.1V-9B deep path) was removed. The 30B MoE model activates only 3B parameters per token, giving 2B-class latency on simple inputs while matching GLM-class quality on complex inputs — no escalation needed.

## Considered Options

- **Cloud VLM APIs** (GPT-4V, Claude Vision): Faster but per-call cost, network latency, privacy concerns, and non-reproducible quality.
- **Qwen3-VL-2B-4bit + GLM-4.1V-9B cascade**: Previous architecture. 2B had 59% parse rate and 10% false-positive rate on relevance tests; GLM couldn't receive native video pixels (issue #2070). 30B eliminates both issues.
- **GLM-4.1V-9B-Thinking-4bit alone**: 76% parse rate, 8% FPR. Native video broken (issue #2070 — hallucinates from prompt text alone).
- **Qwen3.5-4B-MLX-4bit**: Tested in R7; 8.3x slower than 2B, no quality advantage. Not suitable.
- **GLM-4.5V/5.x**: Too large (45GB+ for 3-bit, MoE architecture). Requires ≥64GB RAM.

## Consequences

- VLM architecture and known limitations: see `docs/video-production-runbook.md` → VLM Asset Analysis.
- VLM is integrated into `asset-sourcer.mjs` — two-phase analysis (focus detection then VLM). See ADR-0015 for the focus detection subprocess.
- Requires `~/.video-tts-env` (Python 3.12) with mlx-vlm ≥0.7.2 installed — see ADR-0011. PR #2299 fixed MoE video pixel routing; PR #2191 fixed Metal GPU timeout; PR #2016 fixed Metal resource leak.
- `mx.metal.clear_cache()` called every 5 cases to prevent GPU resource leaks during long runs.
- Future model upgrade requires: (1) update `MODEL_ID` in `vlm_analyzer.py`, (2) verify `apply_chat_template` compatibility, (3) re-run end-to-end validation.
