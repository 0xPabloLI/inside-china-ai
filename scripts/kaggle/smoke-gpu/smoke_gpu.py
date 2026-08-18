#!/usr/bin/env python3
"""GPU smoke test for Kaggle/Colab — verifies CUDA + PyTorch + basic inference.

On Kaggle P100 (sm_60): must install torch==2.4.1+cu121 (supports sm_60).
On Colab T4 (sm_75): default PyTorch works.

Strategy: check GPU compatibility first. If incompatible, install correct
PyTorch and RE-RUN this script via subprocess (importlib.reload doesn't
work with PyTorch due to TORCH_LIBRARY registration).
"""
import sys
import subprocess
import time
import os

RETRY_FLAG = "_SMOKE_GPU_RETRIED"

print(f"Python: {sys.version}")
print(f"Executable: {sys.executable}")

try:
    import torch
    print(f"PyTorch: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        print(f"GPU 0: {props.name} ({props.total_memory / 1e9:.1f} GB), capability sm_{props.major}{props.minor}")

        # Check if this GPU is compatible with current PyTorch
        try:
            x = torch.randn(100, 100, device="cuda")
            y = torch.mm(x, x)
            torch.cuda.synchronize()
            print("Default PyTorch works with this GPU!")
        except RuntimeError as e:
            if "no kernel image" in str(e) and not os.environ.get(RETRY_FLAG):
                print(f"Default PyTorch does not support sm_{props.major}{props.minor}.")
                print("Installing torch==2.4.1+cu121 (supports sm_60+)...")
                subprocess.check_call([sys.executable, "-m", "pip", "install", "-q",
                    "torch==2.4.1+cu121", "--index-url", "https://download.pytorch.org/whl/cu121"])
                print("Re-running smoke test with new PyTorch...")
                env = os.environ.copy()
                env[RETRY_FLAG] = "1"
                result = subprocess.run([sys.executable, __file__], env=env, capture_output=True, text=True)
                print(result.stdout)
                if result.stderr:
                    print(result.stderr, file=sys.stderr)
                sys.exit(result.returncode)
            elif "no kernel image" in str(e) and os.environ.get(RETRY_FLAG):
                print(f"ERROR: Even after reinstalling PyTorch, sm_{props.major}{props.minor} is not supported.")
                print("GPU SMOKE TEST: FAIL")
                sys.exit(1)
            else:
                raise
    else:
        print("GPU SMOKE TEST: FAIL (no CUDA)")
        sys.exit(1)
except ImportError as e:
    print(f"PyTorch import failed: {e}")
    print("GPU SMOKE TEST: FAIL (no PyTorch)")
    sys.exit(1)

# Full GPU operation test
t0 = time.time()
x = torch.randn(1000, 1000, device="cuda")
y = torch.randn(1000, 1000, device="cuda")
z = torch.mm(x, y)
torch.cuda.synchronize()
t1 = time.time()
print(f"GPU matmul 1000x1000: {(t1-t0)*1000:.1f}ms")
print(f"Result sum: {z.sum().item():.2f}")
print("GPU SMOKE TEST: PASS")
