# Cloud GPU Strategy: Kaggle + Colab CLI

Local inference runs on an M2 Pro Mac (16GB unified memory), sufficient for TTS, VLM, and alignment. But digital human generation (CUDA, 16GB+ VRAM) and large model inference exceed local capacity.

**Primary: Kaggle (30h/week free GPU) + Colab CLI (one-command GPU runs). Reserve paid options (AutoDL) for specialized needs.** Kaggle provides T4×2 or P100 (16GB); `machine_shape: "NvidiaTeslaT4"` in `kernel-metadata.json` specifies T4. Colab CLI provides T4 (16GB) with free tier. Lightning AI is also usable (15 credits/month, L4/A10G/L40S GPUs).

## Considered Options

- **Lightning AI**: 15 credits/month (renewable), L4/A10G/L40S GPUs. Usable but limited hours (~22h T4/month).
- **AutoDL** (paid, ¥1.88/h RTX 4090): Cheapest paid CUDA option for China-based access. Reserved as paid fallback.
- **Local Windows GPU** (via Tailscale): Has GPU but Administrator empty password prevents SSH. Awaiting key configuration.

## Consequences

- Provider evaluation, configuration details, and P100/T4 compatibility: see `docs/research/cloud-gpu-options.md`.
- Kaggle test scripts at `scripts/kaggle/`. Colab CLI at `scripts/colab/`.
- Cloud GPU scripts must be self-contained `.py` files (no project imports).
- Local inference remains primary (ADR-0008, ADR-0009). Cloud GPU is for tasks exceeding M2 Pro capacity.
