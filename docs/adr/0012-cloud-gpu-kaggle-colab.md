# Cloud GPU Strategy: Kaggle + Colab CLI

## Context

Local inference runs on an M2 Pro Mac (16GB unified memory). This is sufficient for:
- F5-TTS-MLX (1.5GB model)
- Qwen3-VL-8B-8bit (9.2GB model)
- whisperx alignment (1.2GB model)

But some tasks exceed local capacity:
- **Digital human generation** (Hallo2, EchoMimic v3) — requires CUDA, 16GB+ VRAM
- **Model fine-tuning** (LoRA for voice/emotion) — requires CUDA, multi-GPU ideal
- **Batch video rendering** — Remotion is CPU-bound; GPU rendering not applicable, but parallel pipeline runs could benefit from cloud compute
- **Large model inference** (70B+ parameter models) — exceeds 16GB unified memory

The project explored 4 cloud GPU providers (2026-08-16) before settling on a strategy.

## Decision

**Primary: Kaggle (30h/week free GPU) + Colab CLI (one-command GPU runs). Reserve paid options for specialized needs.**

### Provider evaluation summary

| Provider | GPU | Free Tier | Setup | Status |
|----------|-----|-----------|-------|--------|
| **Kaggle** | Tesla P100 (16GB) or T4 (16GB) | 30h/week, resets weekly | CLI (`kaggle kernels push/status/output`) | ✅ Configured, verified |
| **Colab CLI** | T4 (16GB) | Free tier (variable availability) | CLI (`colab run --gpu T4 script.py`) | ✅ Configured, verified |
| **Lightning AI** | Various | 5 credits (one-time, not renewable) | Studio (403 error on creation) | ⚠️ Broken, support contacted |
| **AutoDL** (paid) | RTX 4090 | ¥1.88/h | Web dashboard | Not configured (paid fallback) |

### Kaggle configuration

- CLI v2.2.4 installed via `pip3 install --break-system-packages kaggle`
- `~/.kaggle/kaggle.json` configured (username: xPabloLI)
- Workflow: prepare `.py` script → `kaggle kernels push -p .` → poll `kaggle kernels status` → `kaggle kernels output` download
- GPU assignment: Tesla P100-PCIE-16GB (sm_60). GPU type cannot be specified (T4 vs P100 by backend scheduling).
- **P100 compatibility note:** default PyTorch 2.10 only supports sm_70+. Must manually install `torch==2.4.1+cu121` for sm_60 compatibility.
- Weekly 30h resets. No paid upgrade option.

### Colab CLI configuration

- CLI v0.6.0 installed via `pip3 install --break-system-packages google-colab-cli`
- ADC authentication (gcloud CLI + 4 scopes)
- Workflow: `colab run --gpu T4 script.py` (one-command: run + teardown)
- ⚠️ Compatibility fix: `jupyter-kernel-client<1.0` (v1.0.1 API change breaks colab-cli)
- Free tier: T4 16GB. Pro ($10/month) still 16GB. Pro+ ($50/month) → A100 40GB.

## Why not alternatives

### Lightning AI
- Registered, received 5 credits, but "New App" returns 403 (support code: 03920104). Cannot create Studio.
- Free credits are one-time (not renewable). Once used, no more free GPU.
- API key configured but unusable until 403 is resolved.
- **Decision:** Unusable. Contacted support@lightning.ai, awaiting response.

### AutoDL (paid Chinese GPU cloud)
- RTX 4090 at ¥1.88/h — cheapest paid option for CUDA workloads.
- Good for long-running tasks (fine-tuning, batch rendering).
- **Decision:** Reserved as paid fallback. Not configured for free-tier-only workflow.

### RunPod / Vast.ai (international paid GPU marketplace)
- Competitive pricing but requires payment method setup and international network.
- Clash proxy + Tailscale coexistence issues (see `docs/research/tailscale-remote-gpu-setup.md`).
- **Decision:** Not evaluated. AutoDL preferred for China-based access.

### Local Windows GPU machine (via Tailscale)
- PC-20240307ZYUW (100.114.190.17 via Tailscale) has a GPU but Administrator has empty password — cannot SSH remotely.
- **Decision:** Awaiting SSH public key configuration (from GitHub `0xPabloLI.keys`). Not yet usable. Setup guide in `docs/research/tailscale-remote-gpu-setup.md`.

## Trade-offs

| Aspect | Kaggle + Colab | Paid (AutoDL) |
|--------|---------------|---------------|
| **Cost** | $0 | ¥1.88/h |
| **GPU** | P100/T4 (16GB) | RTX 4090 (24GB) |
| **Weekly limit** | 30h (Kaggle) + variable (Colab) | Unlimited (paid) |
| **GPU type control** | No (backend assigns) | Yes |
| **Persistent storage** | No (ephemeral) | Yes |
| **Network** | International (may need proxy) | China domestic |
| **Setup complexity** | CLI, script-based | Web dashboard |

### P100 vs T4 compatibility
- P100 (sm_60): requires `torch==2.4.1+cu121` (manual install, default PyTorch too new)
- T4 (sm_75): supported by default PyTorch 2.10+
- Cannot choose which GPU Kaggle assigns — must write scripts that work on both

## Consequences

- Kaggle test scripts at `scripts/kaggle/test-gpu/` (`test_gpu.py` + `kernel-metadata.json`).
- EchoMimic v3 test at `scripts/kaggle/echomimicv3-test/` (digital human generation experiment).
- Colab CLI usage guide: https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md
- Cloud GPU scripts must be self-contained `.py` files (no project imports). Data passed via Kaggle dataset upload or Colab `--install` packages.
- Local inference remains primary (ADR-0008, ADR-0009). Cloud GPU is for tasks that exceed M2 Pro capacity.
- Priority: Kaggle (30h/week, periodic) + Colab CLI (one-command) > Colab Pro+ ($50/month, A100 40GB) > AutoDL (paid, RTX 4090).
