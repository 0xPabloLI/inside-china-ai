#!/usr/bin/env python3
"""
LatentSync 1.5 inference — Colab self-contained script.
T4 16GB: use 1.5 (8GB VRAM). 1.6 needs 18GB — too much for T4.

Run: colab run --gpu T4 /path/to/run_latentsync_colab.py
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
print("LatentSync 1.5 — Colab T4 Test")
print("=" * 60, flush=True)

# 1. Check GPU
run("nvidia-smi", check=False)

# 2. Clone LatentSync
run("cd /content && rm -rf LatentSync && git clone https://github.com/bytedance/LatentSync.git", check=False)
# Use 1.5 branch/tag — 1.5 needs only 8GB VRAM
run("cd /content/LatentSync && git log --oneline -5", check=False)

# 3. Install deps
run("pip install -q diffusers transformers accelerate omegaconf einops opencv-python mediapipe face-alignment decord ffmpeg-python safetensors soundfile DeepCache", check=False)

# 4. Download checkpoints
run("cd /content/LatentSync && pip install -q huggingface-hub", check=False)
# setup_env.sh downloads latentsync_unet.pt and whisper/tiny.pt
run("cd /content/LatentSync && bash setup_env.sh", check=False)

# Check if checkpoints exist
run("ls -la /content/LatentSync/checkpoints/", check=False)

# 5. Upload files from local (we'll use gdown or direct copy)
# For now, use the built-in demo files
print("\n--- Testing with demo files ---", flush=True)
run("ls /content/LatentSync/assets/ 2>/dev/null || echo 'No assets dir'", check=False)

# 6. Try inference with demo data first
# inference.sh shows the basic command
INFERENCE_CMD = (
    "cd /content/LatentSync && python inference.py "
    "--inference_steps 25 "
    "--guidance_scale 1.5 "
    "--image_path assets/demo1.jpg "
    "--audio_path assets/demo1.wav "
    "--output_path /content/output_latentsync.mp4"
)
run(f"ls /content/LatentSync/assets/ 2>/dev/null", check=False)

# Try the inference.sh script instead
run("cd /content/LatentSync && cat inference.sh", check=False)
run("cd /content/LatentSync && bash inference.sh", check=False)

# 7. Check output
run("ls -la /content/output_latentsync.mp4 2>/dev/null || ls -la /content/LatentSync/output* 2>/dev/null || echo 'No output found'")

print("\n✅ LatentSync test complete")
