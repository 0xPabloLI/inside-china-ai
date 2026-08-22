#!/usr/bin/env python3
"""
Sonic inference script for Google Colab (T4 16GB GPU).
Sonic is tested on 32GB GPU but may work on 16GB with optimizations.
If OOM, try with --enable_cpu_offload.

Usage on Colab:
    !python run_sonic.py --image /content/image.jpg --audio /content/audio.wav --output /content/output_sonic.mp4
"""
import os
import sys
import subprocess
import argparse

def run(cmd, check=True):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)
    if check and result.returncode != 0:
        sys.exit(1)
    return result

# 1. Clone
run("cd /content && git clone https://github.com/jixiaozhong/Sonic.git", check=False)

# 2. Install dependencies
run("pip install -r /content/Sonic/requirements.txt", check=False)
run("pip install timm einops transformers accelerate", check=False)

# 3. Download checkpoints from HuggingFace
run("pip install huggingface-hub", check=False)
run("huggingface-cli download xcf/Sonic --local-dir /content/Sonic/checkpoints", check=False)

# 4. Prepare input data
IMAGE = "/content/image.jpg"
AUDIO = "/content/audio.wav"
OUTPUT = "/content/output_sonic.mp4"

if not os.path.exists(IMAGE):
    print(f"ERROR: Image not found at {IMAGE}")
    sys.exit(1)
if not os.path.exists(AUDIO):
    print(f"ERROR: Audio not found at {AUDIO}")
    sys.exit(1)

# 5. Run inference
# Sonic demo.sh shows the basic command structure
inference_cmd = (
    f"cd /content/Sonic && python demo.py "
    f"--config config/inference/sonic.yaml "
    f"--image_path {IMAGE} "
    f"--audio_path {AUDIO} "
    f"--output_path {OUTPUT}"
)
run(inference_cmd)

# 6. Download result
if os.path.exists(OUTPUT):
    from google.colab import files
    files.download(OUTPUT)
    print(f"✅ Output saved to {OUTPUT}")
else:
    print(f"❌ Output not found at {OUTPUT}")
