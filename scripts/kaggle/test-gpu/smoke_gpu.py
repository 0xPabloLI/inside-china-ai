#!/usr/bin/env python3
"""
GPU Smoke Test — minimal verification for Kaggle / Colab.

This script verifies that a GPU is available and functional, without
downloading any large models or running inference. It outputs:
- Python version
- PyTorch version + CUDA version
- GPU name, compute capability, total memory
- A small matrix multiply benchmark

Usage on Kaggle:
  kaggle kernels push -p scripts/kaggle/test-gpu/
  kaggle kernels status xpabloli/test-gpu-availability
  kaggle kernels output xpabloli/test-gpu-availability -p /tmp/gpu-smoke-output

Usage on Colab:
  colab run --gpu T4 scripts/kaggle/test-gpu/smoke_gpu.py

Exit code 0 = GPU available and functional.
Exit code 1 = No GPU or GPU compute failed.
"""
import sys
import subprocess
import time

def main():
    print("=" * 60)
    print("GPU Smoke Test")
    print("=" * 60)
    print(f"\nPython: {sys.version}")
    print(f"Executable: {sys.executable}")

    # ── nvidia-smi ──
    try:
        result = subprocess.run(["nvidia-smi"], capture_output=True, text=True, timeout=10)
        print(f"\nnvidia-smi:\n{result.stdout[:1000]}")
    except Exception as e:
        print(f"\nnvidia-smi not available: {e}")

    # ── PyTorch ──
    try:
        import torch
        print(f"\nPyTorch: {torch.__version__}")
        print(f"CUDA available: {torch.cuda.is_available()}")

        if not torch.cuda.is_available():
            print("\n❌ No CUDA GPU detected.")
            sys.exit(1)

        print(f"CUDA version: {torch.version.cuda}")
        print(f"GPU count: {torch.cuda.device_count()}")

        for i in range(torch.cuda.device_count()):
            gpu = torch.cuda.get_device_properties(i)
            print(f"\n  GPU {i}: {gpu.name}")
            print(f"    Memory: {gpu.total_memory / 1024**3:.1f} GB")
            print(f"    Compute capability: sm_{gpu.major}{gpu.minor}")

        # ── Compute test ──
        x = torch.randn(2000, 2000, device="cuda")
        y = torch.randn(2000, 2000, device="cuda")
        start = time.time()
        for _ in range(100):
            z = torch.mm(x, y)
        torch.cuda.synchronize()
        elapsed = time.time() - start
        tflops = (2 * 2000**3 * 100) / elapsed / 1e12

        print(f"\n✅ GPU compute test PASSED")
        print(f"   100x matrix multiply (2000×2000): {elapsed:.2f}s, ~{tflops:.2f} TFLOPS FP32")

        # ── Memory test ──
        free_mem = torch.cuda.mem_get_info()[0] / 1024**3
        total_mem = torch.cuda.mem_get_info()[1] / 1024**3
        print(f"   GPU memory: {free_mem:.1f} GB free / {total_mem:.1f} GB total")

        print("\n" + "=" * 60)
        print("Smoke test PASSED ✅")
        print("=" * 60)
        sys.exit(0)

    except ImportError:
        print("\n❌ PyTorch not installed.")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ GPU test failed: {type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
