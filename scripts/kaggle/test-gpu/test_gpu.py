"""
Kaggle GPU Availability Test v3
- Installs PyTorch compatible with both P100 (sm_60) and T4 (sm_75)
- Tests GPU compute
- Reports GPU type and memory
"""

import sys
import subprocess

print("=" * 60)
print("Kaggle GPU Availability Test v3")
print("=" * 60)

# Check Python version
print(f"\nPython: {sys.version}")

# Check nvidia-smi
try:
    result = subprocess.run(["nvidia-smi"], capture_output=True, text=True, timeout=10)
    print(f"\nnvidia-smi:\n{result.stdout[:1500]}")
except Exception as e:
    print(f"\nnvidia-smi failed: {e}")

# Uninstall pre-installed PyTorch and install a compatible version
print("\n--- Installing compatible PyTorch ---")
subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "torch", "torchvision", "torchaudio"],
               capture_output=True, text=True, timeout=120)
# Install PyTorch 2.4.1 with CUDA 12.1 — supports sm_60 (P100) through sm_90
install_result = subprocess.run(
    [sys.executable, "-m", "pip", "install", "torch==2.4.1", "torchvision==0.19.1",
     "--index-url", "https://download.pytorch.org/whl/cu121"],
    capture_output=True, text=True, timeout=300
)
print(f"Install exit code: {install_result.returncode}")
if install_result.returncode != 0:
    print(f"Install stderr: {install_result.stderr[-500:]}")

# Now test with the compatible PyTorch
try:
    import torch
    print(f"\nPyTorch version: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA version: {torch.version.cuda}")
        print(f"GPU count: {torch.cuda.device_count()}")
        for i in range(torch.cuda.device_count()):
            gpu = torch.cuda.get_device_properties(i)
            print(f"  GPU {i}: {gpu.name}")
            print(f"    Memory: {gpu.total_memory / 1024**3:.1f} GB")
            print(f"    Compute capability: {gpu.major}.{gpu.minor}")

        # GPU compute test
        try:
            x = torch.randn(2000, 2000, device="cuda")
            y = torch.randn(2000, 2000, device="cuda")
            import time
            start = time.time()
            for _ in range(100):
                z = torch.mm(x, y)
            torch.cuda.synchronize()
            elapsed = time.time() - start
            tflops = (2 * 2000**3 * 100) / elapsed / 1e12
            print(f"\n✅ GPU compute test PASSED: 100x matrix multiply {z.shape}")
            print(f"    Time: {elapsed:.2f}s, ~{tflops:.2f} TFLOPS (FP32)")
        except Exception as e:
            print(f"\n❌ GPU compute test FAILED: {e}")
    else:
        print("CUDA not available")
except ImportError:
    print("\nPyTorch not installed")

print("\n" + "=" * 60)
print("Test complete!")
print("=" * 60)
