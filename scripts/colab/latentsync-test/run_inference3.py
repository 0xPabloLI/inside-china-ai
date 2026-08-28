import subprocess
import sys
import os

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# Check what setup_env.sh actually did
run("ls -la /content/LatentSync/checkpoints/")
run("ls -la /content/LatentSync/checkpoints/whisper/ 2>/dev/null || echo 'No whisper dir'")

# Download checkpoints manually from HuggingFace
print("=== Downloading checkpoints manually ===", flush=True)
run("mkdir -p /content/LatentSync/checkpoints/whisper")
run("cd /content/LatentSync && hf download bytedance/LatentSync latentsync_unet.pt --local-dir checkpoints/")
run("cd /content/LatentSync && hf download bytedance/LatentSync whisper/tiny.pt --local-dir checkpoints/")
run("ls -la /content/LatentSync/checkpoints/")
run("ls -la /content/LatentSync/checkpoints/whisper/")

# Now run inference
print("=== Starting inference ===", flush=True)
run("cd /content/LatentSync && bash inference.sh")
print("=== Inference complete ===", flush=True)

# Find output
run("find /content/LatentSync -name '*.mp4' -newer /content/LatentSync/assets/demo1_video.mp4 2>/dev/null | head -10")
run("ls -la /content/LatentSync/output* 2>/dev/null || echo 'No output dir'")
