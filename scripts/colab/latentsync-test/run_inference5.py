import subprocess
import os
from huggingface_hub import hf_hub_download

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# Download whisper/tiny.pt directly with Python API
print("=== Downloading whisper/tiny.pt with Python API ===", flush=True)
os.makedirs("/content/LatentSync/checkpoints/whisper", exist_ok=True)
try:
    path = hf_hub_download(
        repo_id="bytedance/LatentSync",
        filename="whisper/tiny.pt",
        repo_type="model",
        local_dir="/content/LatentSync/checkpoints"
    )
    print(f"Downloaded to: {path}", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    # Try alternate download
    print("Trying alternate download...", flush=True)
    run("cd /content/LatentSync/checkpoints && wget -q https://huggingface.co/bytedance/LatentSync/resolve/main/whisper/tiny.pt -O whisper/tiny.pt")

# Check
run("ls -la /content/LatentSync/checkpoints/")
run("ls -la /content/LatentSync/checkpoints/whisper/")

# Run inference
print("=== Starting inference ===", flush=True)
run("cd /content/LatentSync && bash inference.sh")
print("=== Inference complete ===", flush=True)

# Find output
run("find /content/LatentSync -name '*.mp4' -newer /content/LatentSync/assets/demo1_video.mp4 2>/dev/null | head -10")
run("ls -la /content/LatentSync/output* 2>/dev/null || echo 'No output dir'")
