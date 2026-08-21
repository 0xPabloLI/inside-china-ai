#!/usr/bin/env python3
"""
LatentSync 1.5 inference script for Google Colab (T4 16GB GPU).
LatentSync 1.6 requires 18GB VRAM, but 1.5 only needs 8GB — perfect for T4.

Usage on Colab:
    !python run_latentsync.py --image /content/image.jpg --audio /content/audio.wav --output /content/output.mp4
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
        sys.exit(1)
    return result

# 1. Clone and setup
run("cd /content && git clone https://github.com/bytedance/LatentSync.git", check=False)
run("cd /content/LatentSync && git checkout v1.5", check=False)

# 2. Install dependencies
run("pip install -r /content/LatentSync/requirements.txt", check=False)
run("pip install ffmpeg-python mediapipe face-alignment decord", check=False)

# 3. Download checkpoints
run("cd /content/LatentSync && source setup_env.sh", check=False)

# 4. Run inference
IMAGE = "/content/image.jpg"
AUDIO = "/content/audio.wav"
OUTPUT = "/content/output_latentsync.mp4"

if not os.path.exists(IMAGE):
    print(f"ERROR: Image not found at {IMAGE}")
    sys.exit(1)
if not os.path.exists(AUDIO):
    print(f"ERROR: Audio not found at {AUDIO}")
    sys.exit(1)

inference_cmd = (
    f"cd /content/LatentSync && python inference.py "
    f"--inference_steps 20 "
    f"--guidance_scale 1.5 "
    f"--image_path {IMAGE} "
    f"--audio_path {AUDIO} "
    f"--output_path {OUTPUT}"
)
run(inference_cmd)

# 5. Download result
if os.path.exists(OUTPUT):
    from google.colab import files
    files.download(OUTPUT)
    print(f"✅ Output saved to {OUTPUT}")
else:
    print(f"❌ Output not found at {OUTPUT}")
