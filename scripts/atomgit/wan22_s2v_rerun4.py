"""Fix huggingface-hub version conflict, then run inference"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

MIRROR = "https://pypi.tuna.tsinghua.edu.cn/simple"
PIP_ARGS = ["-i", MIRROR, "--trusted-host", "pypi.tuna.tsinghua.edu.cn"]

log("=== Fix huggingface-hub version ===")
# Downgrade huggingface-hub to <1.0
r = subprocess.run(["pip", "install", "--user", "huggingface-hub<1.0"] + PIP_ARGS,
                  capture_output=True, text=True, timeout=180)
log(f"  huggingface-hub downgrade: rc={r.returncode} {r.stderr[-200:]}")

# Also upgrade transformers
r = subprocess.run(["pip", "install", "--user", "-q", "transformers", "-U"] + PIP_ARGS,
                  capture_output=True, text=True, timeout=180)
log(f"  transformers upgrade: rc={r.returncode} {r.stderr[-200:]}")

# Verify
try:
    import diffusers; log(f"  diffusers {diffusers.__version__}")
except: log("  diffusers MISSING")
try:
    import transformers; log(f"  transformers {transformers.__version__}")
except: log("  transformers MISSING")
try:
    import huggingface_hub; log(f"  huggingface_hub {huggingface_hub.__version__}")
except: log("  huggingface_hub MISSING")

log("=== Run inference ===")
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
os.chdir("/opt/atomgit/Wan2.2")
cmd = [sys.executable, "generate.py", "--task", "s2v-14B", "--size", "480*832",
       "--ckpt_dir", model_dir, "--offload_model", "True", "--sample_steps", "5",
       "--num_clip", "1", "--frame_num", "40", "--prompt", "A person is talking to camera",
       "--image", "/opt/atomgit/input/portrait-face.jpg",
       "--audio", "/opt/atomgit/input/audio.wav",
       "--save_file", "/opt/atomgit/s2v_npu_test.mp4"]
log(f"  cmd: {' '.join(cmd)}")

r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
log(f"  RC: {r.returncode}")
log(f"  STDOUT (last 5000): {r.stdout[-5000:]}")
log(f"  STDERR (last 3000): {r.stderr[-3000:]}")
if os.path.exists("/opt/atomgit/s2v_npu_test.mp4"):
    log(f"  OUTPUT: {os.path.getsize('/opt/atomgit/s2v_npu_test.mp4')} bytes")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) ===")
log("ALL DONE")