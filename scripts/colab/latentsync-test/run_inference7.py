import subprocess
import os

def run(cmd):
    print(f">>> {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)

# Set expandable_segments
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# Check which version we have - 1.5 or 1.6
run("cd /content/LatentSync && git log --oneline -3")
run("cd /content/LatentSync && git tag")

# Try running with expandable_segments + fewer steps
print("=== Running inference with expandable_segments ===", flush=True)
run("cd /content/LatentSync && PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True python -m scripts.inference --unet_config_path config/unet.yaml --checkpoint_path checkpoints/latentsync_unet.pt --image_path assets/demo1_video.mp4 --audio_path assets/demo1_audio.wav --output_path output_demo1.mp4 --inference_steps 20 --guidance_scale 1.0 2>&1 | tail -30")
print("=== Done ===", flush=True)

run("ls -la /content/LatentSync/output_demo1.mp4 2>/dev/null || echo 'No output'")
