"""Quick rerun: install diffusers + run inference (model already downloaded)"""
import os, sys, subprocess, time, traceback

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

log("=== Install diffusers ===")
r = subprocess.run(["pip", "install", "--user", "-q", "diffusers"],
                  capture_output=True, text=True, timeout=120)
log(f"  diffusers rc={r.returncode} {r.stderr[-200:]}")

log("=== Check other missing deps ===")
for pkg in ["transformers", "accelerate", "diffusers"]:
    try:
        __import__(pkg)
        log(f"  {pkg} OK")
    except ImportError:
        log(f"  {pkg} MISSING - installing...")
        subprocess.run(["pip", "install", "--user", "-q", pkg],
                      capture_output=True, text=True, timeout=120)

log("=== Run inference ===")
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
os.chdir("/opt/atomgit/Wan2.2")
portrait = "/opt/atomgit/input/portrait-face.jpg"
audio = "/opt/atomgit/input/audio.wav"
output_path = "/opt/atomgit/s2v_npu_test.mp4"

cmd = [sys.executable, "generate.py", "--task", "s2v-14B", "--size", "480*832",
       "--ckpt_dir", model_dir, "--offload_model", "True", "--sample_steps", "5",
       "--num_clip", "1", "--frame_num", "40", "--prompt", "A person is talking to camera",
       "--image", portrait, "--audio", audio, "--save_file", output_path]
log(f"  cmd: {' '.join(cmd)}")

r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
log(f"  RC: {r.returncode}")
log(f"  STDOUT (last 5000): {r.stdout[-5000:]}")
log(f"  STDERR (last 3000): {r.stderr[-3000:]}")
if os.path.exists(output_path):
    log(f"  OUTPUT: {os.path.getsize(output_path)} bytes")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) ===")
log("ALL DONE")