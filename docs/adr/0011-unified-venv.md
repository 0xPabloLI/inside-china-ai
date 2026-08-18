# Unified Python Venv: ~/.video-tts-env

The video pipeline uses four Python-based AI components (F5-TTS-MLX, Qwen3-TTS, whisperx, mlx-vlm) that each had separate virtual environments with different Python versions (3.11, 3.12, 3.14), causing disk waste (~12GB duplicated dependencies), PATH conflicts, and maintenance burden.

**Consolidate all Python AI components into a single venv: `~/.video-tts-env` (Python 3.12, Homebrew `python@3.12`).** Python 3.12 is the only version where all four components work (whisperx's `ctranslate2` is broken on 3.14; F5/Qwen/mlx-vlm all work on 3.12). Docker is not viable — MLX requires native Apple Silicon, and Docker on macOS runs in a Linux VM without MPS support.

## Consequences

- All TTS/VLM/alignment scripts reference `~/.video-tts-env/bin/python3`.
- Component list and venv path: see `docs/video-workflow.md` → Key Paths & Environment.
- Risk: shared `transformers`/`torch`/`numpy` dependency — a version mismatch could break one component when upgrading another. Mitigation: pin versions, test all components after upgrade.
