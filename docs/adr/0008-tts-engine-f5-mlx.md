# TTS Engine Selection: F5-TTS-MLX as Default

The short video pipeline needs local TTS that clones a reference voice, controls duration, runs on Apple Silicon, and produces natural speech. After evaluating 6 engines through A/B testing (2026-07-30 to 2026-08-14), **F5-TTS-MLX is the default TTS engine**, with Qwen3-TTS as backup, edge-tts as fallback, and macOS `say` as last resort.

F5-TTS-MLX won on natural pacing and intonation at Max Effort configuration (steps=32). The original F5-TTS (SJTU, PyTorch/CUDA) does not run on Apple Silicon; the MLX port by lucasnewman (MIT, HF: `lucasnewman/f5-tts-mlx`) provides native inference via Metal Performance Shaders. CosyVoice was used as default briefly but dropped for metronomic rhythm and Python 3.12 incompatibility.

## Considered Options

- **CosyVoice** (used then dropped): Fast inference, good Mandarin, but no duration control and metronomic rhythm. A/B comparison showed F5 with steps=32 noticeably more natural.
- **XTTS / Kokoro** (dropped in Phase 1): XTTS slower on Apple Silicon; Kokoro no voice cloning.
- **Cloud API TTS** (excluded by design): Per-call cost for 10+ scenes × 20+ videos/month. Local-first is a design principle (same as VLM — see ADR-0009).

## Consequences

- TTS engine parameters, post-processing rules, and priority chain: see `docs/video-workflow.md` → TTS Engine Configuration.
- Engine evaluation and comparison details: see `docs/research/voice-cloning-solutions-m2-pro.md`.
- F5-TTS-MLX requires `~/.video-tts-env` (Python 3.12) — see ADR-0011.
- Future engine swap requires: (1) new adapter in `lib/tts/`, (2) register in `ENGINE_FACTORIES` + `PRIORITY`, (3) verify post-processing compatibility.
