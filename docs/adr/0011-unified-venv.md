# Unified Python Venv: ~/.video-tts-env

## Context

The video pipeline uses three Python-based AI components that each had separate virtual environments:

1. **F5-TTS-MLX** — TTS voice cloning (originally in `~/.f5-tts-env`, Python 3.14)
2. **Qwen3-TTS** — Backup TTS engine (originally in `~/.qwen-tts-env`, Python 3.12)
3. **whisperx** — Subtitle alignment via wav2vec2 (originally in `~/.whisperx-env`, Python 3.11, later merged into `~/.f5-tts-env`)

Additionally, **mlx-vlm** (VLM for asset analysis — see ADR-0009) was added later and also needed a Python environment.

### Problems with separate venvs

1. **Python version fragmentation** — F5 used Python 3.14 (Homebrew default), Qwen used 3.12, whisperx needed ≤3.12 (ctranslate2 incompatible with 3.14). Three different Python versions installed simultaneously.
2. **Disk space** — 4 venvs × ~2-4GB each = ~8-16GB of duplicated dependencies (PyTorch, NumPy, SciPy installed in each).
3. **PATH conflicts** — `source venv/bin/activate` in subprocess calls could pick up the wrong Python if PATH was not fully reset.
4. **Maintenance burden** — Updating a shared dependency (e.g., `transformers`) required updating it in 3-4 venvs. Forgetting one caused silent failures.
5. **whisperx incompatibility** — whisperx's `ctranslate2` dependency could not install on Python 3.14. It was initially given its own Python 3.11 venv, then merged into F5's Python 3.11 venv, creating a coupling that broke when F5 was upgraded.

## Decision

**Consolidate all Python AI components into a single venv: `~/.video-tts-env` (Python 3.12, Homebrew `python@3.12`).**

### Components in the unified venv

| Component | Package | Purpose |
|-----------|---------|---------|
| F5-TTS-MLX | `f5_tts_mlx` (v0.2.6) | Primary TTS engine |
| Qwen3-TTS | `qwen_tts` | Backup TTS engine |
| whisperx | `whisperx` + `facebook/wav2vec2-large-960h-lv60-self` | Subtitle timing alignment |
| mlx-vlm | `mlx_vlm` (0.6.13) + Qwen3-VL-8B | VLM asset analysis |

### Python version choice

**Python 3.12** (not 3.14, not 3.11):
- F5-TTS-MLX works on 3.12 ✅
- Qwen3-TTS works on 3.12 ✅
- whisperx's `ctranslate2` works on 3.12 ✅ (broken on 3.14)
- mlx-vlm works on 3.12 ✅
- Homebrew `python@3.12` is a supported, stable formula ✅

## Why not alternatives

### Keep separate venvs
- **Pros:** Isolation — a broken dependency in one venv doesn't affect others.
- **Cons:** Disk waste, maintenance burden, PATH conflicts, Python version fragmentation. The components share most dependencies anyway (PyTorch/MLX, transformers, NumPy).
- **Decision:** The shared dependencies far outweigh the isolation benefit. Isolation can be achieved via `pip install --user` or Docker if needed.

### Conda environments
- **Pros:** Better for scientific Python (NumPy/SciPy binary compatibility).
- **Cons:** Conda is heavy (~500MB itself), slow to resolve dependencies, and conflicts with Homebrew Python. The project already uses Homebrew + pip.
- **Decision:** Not worth the migration cost.

### Docker containers
- **Pros:** Full isolation, reproducible, could run on cloud GPU (see ADR-0012).
- **Cons:** Docker on macOS runs in a Linux VM (no native MLX/MPS support). MLX requires native Apple Silicon — Docker would break F5-TTS-MLX and mlx-vlm.
- **Decision:** Docker is viable for cloud GPU (CUDA-based) but not for local Apple Silicon inference. Keep local venv for local inference.

## Trade-offs

| Aspect | Unified venv | Separate venvs |
|--------|-------------|----------------|
| **Disk space** | ~4GB (shared deps) | ~12GB (duplicated) |
| **Python version** | 3.12 (one version) | 3.11 + 3.12 + 3.14 |
| **Dependency updates** | One `pip install --upgrade` | 3-4 separate upgrades |
| **Isolation** | Shared (dependency conflict risk) | Isolated |
| **MLX/MPS support** | ✅ (native Apple Silicon) | ✅ (same) |
| **Subprocess activation** | One venv path to remember | 3-4 different paths |

### Risk: dependency conflict
All four components share `transformers`, `torch`/`mlx`, and `numpy`. A version requirement mismatch could break one component when upgrading another. Mitigation: pin versions in a `requirements.txt` and test all four components after any upgrade.

## Consequences

- All TTS/VLM/alignment scripts reference `~/.video-tts-env/bin/python3` or `source ~/.video-tts-env/bin/activate`.
- Old venvs (`~/.f5-tts-env`, `~/.qwen-tts-env`, `~/.cosyvoice-env`) are deprecated and can be deleted. CosyVoice venv was already removed when CosyVoice was dropped (ADR-0008).
- `text-align.py` uses `~/.video-tts-env/bin/python3` directly (hardcoded in `post-process.mjs`).
- `ai_analyzer.py` docstring references `~/.video-tts-env`.
- The venv is NOT in version control — it's a local development dependency. Setup instructions are in `docs/video-workflow.md`.
- whisperx model upgraded from `facebook/wav2vec2-base-960h` (95M params, 368MB) to `facebook/wav2vec2-large-960h-lv60-self` (316M params, ~1.2GB) for better alignment accuracy.
