import subprocess
import os
from huggingface_hub import hf_hub_download, snapshot_download

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# Download ENTIRE repo at once
print("=== Downloading entire LatentSync model repo ===", flush=True)
try:
    snapshot_download(
        repo_id="bytedance/LatentSync",
        repo_type="model",
        local_dir="/content/LatentSync/checkpoints"
    )
    print("Snapshot download complete!", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)

# Check what was downloaded
run("find /content/LatentSync/checkpoints -type f -name '*.pt' | head -20")
run("ls -laR /content/LatentSync/checkpoints/")

# Make sure inference.sh can find files
# inference.sh uses relative paths from /content/LatentSync/
print("=== Running inference ===", flush=True)
run("cd /content/LatentSync && bash inference.sh")
print("=== Done ===", flush=True)

# Find output
run("find /content/LatentSync -name '*.mp4' -newer /content/LatentSync/assets/demo1_video.mp4 2>/dev/null | head -10")
