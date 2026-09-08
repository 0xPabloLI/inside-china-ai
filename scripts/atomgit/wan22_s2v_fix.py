"""Fix staged loading patch - skip _configure_model too, then run inference"""
import os, sys, subprocess, time, gc, logging, re

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f:
    s2v = f.read()

log("=== Fix staged loading patch ===")

# The issue: _configure_model is called with self.noise_model=None in __init__
# Fix: patch _configure_model to handle None
if "if model is None:" not in s2v:
    # Find _configure_model definition and add None guard
    configure_pattern = r'(def _configure_model\(self.*?\):)\s*\n'
    match = re.search(configure_pattern, s2v, re.DOTALL)
    if match:
        insert_point = match.end()
        # Find the first line of the function body
        s2v = s2v[:insert_point] + "        if model is None:\n            return None\n" + s2v[insert_point:]
        log("  patched _configure_model to handle None")
    else:
        log("  WARNING: could not find _configure_model definition")

# Also check if the staged loading in generate() is correct
if "Staged loading" in s2v:
    log("  staged loading already present in generate()")
else:
    log("  WARNING: staged loading not found in generate()!")

with open(s2v_path, "w") as f:
    f.write(s2v)
log("  patch saved")

log("=== Run inference ===")
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
cmd = [sys.executable, "generate.py", "--task", "s2v-14B", "--size", "480*832",
       "--ckpt_dir", model_dir, "--offload_model", "True", "--sample_steps", "5",
       "--num_clip", "1", "--frame_num", "40", "--prompt", "A person is talking to camera",
       "--image", "/opt/atomgit/input/portrait-face.jpg",
       "--audio", "/opt/atomgit/input/audio.wav",
       "--save_file", "/opt/atomgit/s2v_npu_test.mp4"]
log(f"  cmd: {' '.join(cmd)}")

r = subprocess.run(cmd, capture_output=True, text=True, timeout=5400)
log(f"  RC: {r.returncode}")
log(f"  STDOUT: {r.stdout[-5000:]}")
log(f"  STDERR: {r.stderr[-3000:]}")
if os.path.exists("/opt/atomgit/s2v_npu_test.mp4"):
    log(f"  OUTPUT: {os.path.getsize('/opt/atomgit/s2v_npu_test.mp4')} bytes")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) ===")
log("ALL DONE")