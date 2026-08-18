#!/usr/bin/env python3
"""GPU smoke test for Kaggle/Colab — verifies CUDA + PyTorch + basic inference."""
import sys
import time

print(f"Python: {sys.version}")
print(f"Executable: {sys.executable}")

try:
    import torch
    print(f"PyTorch: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA version: {torch.version.cuda}")
        print(f"Device count: {torch.cuda.device_count()}")
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            print(f"  GPU {i}: {props.name} ({props.total_memory / 1e9:.1f} GB)")
        
        # Basic GPU operation test
        t0 = time.time()
        x = torch.randn(1000, 1000, device="cuda")
        y = torch.randn(1000, 1000, device="cuda")
        z = torch.mm(x, y)
        torch.cuda.synchronize()
        t1 = time.time()
        print(f"GPU matmul 1000x1000: {(t1-t0)*1000:.1f}ms")
        print(f"Result sum: {z.sum().item():.2f}")
        print("GPU SMOKE TEST: PASS")
    else:
        print("GPU SMOKE TEST: FAIL (no CUDA)")
        sys.exit(1)
except ImportError as e:
    print(f"PyTorch import failed: {e}")
    print("GPU SMOKE TEST: FAIL (no PyTorch)")
    sys.exit(1)
