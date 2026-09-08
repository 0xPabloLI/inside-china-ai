"""Fix syntax error in speech2video.py + ensure vae2_1.py patch, then run"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Fix speech2video.py syntax error ===")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f:
    s2v = f.read()

# Remove the bad VAE dtype line
bad_line = "        self.vae = self.vae.to(self.param_dtype)"
if bad_line in s2v:
    lines = s2v.split('\n')
    lines = [l for l in lines if l.strip() != "self.vae = self.vae.to(self.param_dtype)"]
    s2v = '\n'.join(lines)
    log("  removed bad VAE dtype line")

# Check for syntax
try:
    compile(s2v, s2v_path, 'exec')
    log("  syntax OK")
except SyntaxError as e:
    log(f"  STILL has syntax error: {e}")
    # Try harder to fix
    lines = s2v.split('\n')
    clean = []
    for i, line in enumerate(lines):
        if 'self.vae = self.vae.to(self.param_dtype)' in line:
            log(f"    skipping line {i+1}: {line.strip()}")
            continue
        clean.append(line)
    s2v = '\n'.join(clean)
    try:
        compile(s2v, s2v_path, 'exec')
        log("  syntax OK after second fix")
    except SyntaxError as e2:
        log(f"  STILL broken: {e2}")

with open(s2v_path, "w") as f:
    f.write(s2v)

log("=== Ensure vae2_1.py patch ===")
vae_path = "wan/modules/vae2_1.py"
with open(vae_path) as f:
    vae = f.read()
if "u.unsqueeze(0).float()" not in vae:
    old = "self.model.encode(u.unsqueeze(0), self.scale).float().squeeze(0)"
    new = "self.model.encode(u.unsqueeze(0).float(), self.scale).float().squeeze(0)"
    if old in vae:
        vae = vae.replace(old, new)
        with open(vae_path, "w") as f:
            f.write(vae)
        log("  vae2_1.py patched")
    else:
        log("  vae2_1.py pattern not found (maybe already patched differently)")
else:
    log("  vae2_1.py already patched")

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