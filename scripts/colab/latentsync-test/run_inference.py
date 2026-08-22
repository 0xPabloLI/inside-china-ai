import subprocess
import sys

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# Install missing kornia
run("pip install -q kornia")
print("=== kornia installed ===", flush=True)

# Now run inference
print("=== Starting inference ===", flush=True)
run("cd /content/LatentSync && cat inference.sh")
run("cd /content/LatentSync && bash inference.sh")
print("=== Inference complete ===", flush=True)

# Find output
run("find /content/LatentSync -name '*.mp4' -newer /content/LatentSync/assets/demo1_video.mp4 | head -10")
run("ls -la /content/LatentSync/output* 2>/dev/null || echo 'No output dir'")
