"""Fix7: replace dtype assertion with explicit .float() cast in model_s2v.py"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Patch model_s2v.py: replace dtype assert with .float() cast ===")
model_path = "wan/modules/s2v/model_s2v.py"
with open(model_path) as f:
    model_code = f.read()

# Replace the assertion with explicit float cast
old = "            assert e.dtype == torch.float32 and e0.dtype == torch.float32"
new = "            e = e.float()\n            e0 = e0.float()"
if old in model_code:
    model_code = model_code.replace(old, new)
    log("  patched dtype assert -> .float() cast")
else:
    log("  assert pattern not found, checking if already patched")
    if "e = e.float()" in model_code:
        log("  already patched")

with open(model_path, "w") as f:
    f.write(model_code)

# Also search for other similar dtype assertions in the model
log("=== Check for other dtype assertions ===")
import re
for root, dirs, files in os.walk("wan/modules/s2v"):
    for fname in files:
        if fname.endswith('.py'):
            fpath = os.path.join(root, fname)
            with open(fpath) as f:
                for i, line in enumerate(f):
                    if 'assert' in line and 'dtype' in line and 'float' in line:
                        log(f"  {fpath}:{i+1}: {line.strip()}")

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