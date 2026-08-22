import subprocess
import sys

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# Install ALL missing deps at once
run("pip install -q kornia insightface onnxruntime-gpu")
print("=== All deps installed ===", flush=True)

# Check what inference.sh does
run("cat /content/LatentSync/inference.sh")

# Run inference
print("=== Starting inference ===", flush=True)
run("cd /content/LatentSync && bash inference.sh")
print("=== Inference complete ===", flush=True)

# Find output
run("find /content/LatentSync -name '*.mp4' -newer /content/LatentSync/assets/demo1_video.mp4 2>/dev/null | head -10")
run("ls -la /content/LatentSync/output* 2>/dev/null || echo 'No output dir'")
