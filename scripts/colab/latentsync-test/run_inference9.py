import subprocess
import os

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# Check the inference.sh for correct params
run("cat /content/LatentSync/inference.sh")
# Check what configs exist
run("find /content/LatentSync/config -type f -name '*.yaml' | head -10")

# Run inference.sh directly with expandable_segments
print("=== Running inference.sh with expandable_segments ===", flush=True)
run("cd /content/LatentSync && PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True bash inference.sh 2>&1 | tail -50")
print("=== Done ===", flush=True)

run("ls -la /content/LatentSync/output* 2>/dev/null || echo 'No output'")
run("find /content/LatentSync -name '*.mp4' -newer /content/LatentSync/assets/demo1_video.mp4 2>/dev/null | head -10")
