import subprocess
import sys

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# 1. GPU check
run("nvidia-smi")
print("=== GPU Ready ===", flush=True)

# 2. Clone LatentSync
run("cd /content && rm -rf LatentSync && git clone https://github.com/bytedance/LatentSync.git")

# 3. Install deps
run("pip install -q diffusers transformers accelerate omegaconf einops opencv-python mediapipe face-alignment decord ffmpeg-python safetensors soundfile DeepCache huggingface-hub")
print("=== Deps installed ===", flush=True)

# 4. Download checkpoints
run("cd /content/LatentSync && bash setup_env.sh")
print("=== Checkpoints ready ===", flush=True)

# 5. List checkpoints
run("ls -la /content/LatentSync/checkpoints/")

# 6. List demo assets
run("ls -la /content/LatentSync/assets/ 2>/dev/null || echo 'No assets'")

# 7. Run inference with demo data
print("=== Starting inference ===", flush=True)
run("cd /content/LatentSync && cat inference.sh")
run("cd /content/LatentSync && bash inference.sh")
print("=== Inference complete ===", flush=True)

# 8. Find output
run("find /content/LatentSync -name '*.mp4' -o -name 'output*' | head -10")
