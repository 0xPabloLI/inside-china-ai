#!/usr/bin/env python3
"""
Sonic inference — Colab self-contained script.
Sonic is CVPR 2025, tested on 32GB GPU. May need cpu_offload on T4 (16GB).

Run: colab run --gpu T4 /path/to/run_sonic_colab.py
"""
import os
import sys
import subprocess

def run(cmd, check=True):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)
    if check and result.returncode != 0:
        print(f"Command failed with code {result.returncode}")
        if not check:
            return result
        sys.exit(1)
    return result

print("=" * 60)
print("Sonic (CVPR 2025) — Colab T4 Test")
print("=" * 60, flush=True)

# 1. Check GPU
run("nvidia-smi", check=False)

# 2. Clone Sonic
run("cd /content && rm -rf Sonic && git clone https://github.com/jixiaozhong/Sonic.git", check=False)
run("cd /content/Sonic && git log --oneline -5", check=False)

# 3. Install deps
run("pip install -q -r /content/Sonic/requirements.txt", check=False)
run("pip install -q timm einops transformers accelerate", check=False)

# 4. Download checkpoints from HuggingFace
run("pip install -q huggingface-hub", check=False)
print("\n--- Downloading Sonic checkpoints ---", flush=True)
run("huggingface-cli download xcf/Sonic --local-dir /content/Sonic/checkpoints", check=False)
run("ls -la /content/Sonic/checkpoints/", check=False)

# 5. Check demo files
run("ls /content/Sonic/examples/", check=False)

# 6. Run inference with demo data
print("\n--- Running Sonic inference ---", flush=True)
# demo.sh shows the basic command
run("cat /content/Sonic/demo.sh", check=False)
run("cd /content/Sonic && bash demo.sh", check=False)

# 7. Check output
run("ls -la /content/Sonic/output* 2>/dev/null || find /content/Sonic -name '*.mp4' | head -5", check=False)

print("\n✅ Sonic test complete")
