# Kaggle GPU Smoke Test

Minimal GPU verification for Kaggle and Colab — no model downloads, no inference.

## Files

| File | Purpose |
|------|---------|
| `smoke_gpu.py` | Minimal smoke test: Python/torch/CUDA/GPU info + matrix multiply |
| `test_gpu.py` | Full test with PyTorch reinstall (for P100 sm_60 compatibility) |
| `kernel-metadata.json` | Kaggle kernel configuration |

## Running on Kaggle

```bash
# Push the kernel
kaggle kernels push -p scripts/kaggle/test-gpu/

# Check status (poll until "complete")
kaggle kernels status xpabloli/test-gpu-availability

# Download output
kaggle kernels output xpabloli/test-gpu-availability -p /tmp/gpu-smoke-output
```

## Running on Colab

```bash
# One-shot run with T4 GPU
colab run --gpu T4 scripts/kaggle/test-gpu/smoke_gpu.py
```

## What it checks

1. `nvidia-smi` is available
2. PyTorch can detect CUDA
3. GPU name, memory, and compute capability are reported
4. A 2000×2000 matrix multiply completes without error
5. GPU memory is reported (free / total)

## Limitations

- **Kaggle**: 30h/week free GPU, resets weekly. GPU type (T4 vs P100) is not selectable.
- **Colab**: Free tier T4 16GB. Pro ($10/mo) still 16GB. Pro+ ($50/mo) A100 40GB.
- **No SLA**: GPU availability is not guaranteed. Sessions may be interrupted.
- **Storage is ephemeral**: Files do not persist between sessions.

## EchoMimic experiments

EchoMimic v3 test outputs are NOT tracked in Git. They live in `echomimicv3-test/` which is in `.gitignore`. Only scripts and metadata are tracked.
