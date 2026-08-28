import subprocess
import os

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# Check what's in the HF repo
print("=== Checking HF repo structure ===", flush=True)
run("hf download bytedance/LatentSync --repo-type model 2>&1 | head -20")

# Try downloading with the correct paths
print("=== Downloading latentsync_unet.pt ===", flush=True)
run("cd /content/LatentSync && hf download bytedance/LatentSync latentsync_unet.pt --repo-type model --local-dir checkpoints")

print("=== Downloading whisper/tiny.pt ===", flush=True)
run("mkdir -p /content/LatentSync/checkpoints/whisper")
run("cd /content/LatentSync && hf download bytedance/LatentSync whisper/tiny.pt --repo-type model --local-dir checkpoints")

# Check if files exist now
run("ls -la /content/LatentSync/checkpoints/")
run("ls -la /content/LatentSync/checkpoints/whisper/")

# If still not found, try the setup_env.sh approach
print("=== Trying setup_env.sh again ===", flush=True)
run("cd /content/LatentSync && cat setup_env.sh")
run("cd /content/LatentSync && bash setup_env.sh 2>&1 | tail -20")
run("ls -la /content/LatentSync/checkpoints/")
run("ls -la /content/LatentSync/checkpoints/whisper/")

# Run inference
print("=== Starting inference ===", flush=True)
run("cd /content/LatentSync && bash inference.sh")
print("=== Inference complete ===", flush=True)

# Find output
run("find /content/LatentSync -name '*.mp4' -newer /content/LatentSync/assets/demo1_video.mp4 2>/dev/null | head -10")
run("ls -la /content/LatentSync/output* 2>/dev/null || echo 'No output dir'")
