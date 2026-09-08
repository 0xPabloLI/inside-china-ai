"""Directly patch vae2_1.py encode to fix dtype mismatch"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Patch vae2_1.py encode ===")
vae_path = "wan/modules/vae2_1.py"
with open(vae_path) as f:
    vae = f.read()

# Fix: convert input to model dtype in encode method
# Original: self.model.encode(u.unsqueeze(0), self.scale).float().squeeze(0)
# Fixed: self.model.encode(u.unsqueeze(0).to(self.model.dtype), self.scale).float().squeeze(0)
old = "self.model.encode(u.unsqueeze(0), self.scale).float().squeeze(0)"
new = "self.model.encode(u.unsqueeze(0).float(), self.scale).float().squeeze(0)"
if old in vae:
    vae = vae.replace(old, new)
    log("  patched encode input to float()")
else:
    log("  pattern not found, trying alternative...")
    # Try to find any encode call and add .float()
    if "u.unsqueeze(0)" in vae:
        vae = vae.replace("u.unsqueeze(0)", "u.unsqueeze(0).float()", 1)
        log("  patched with alternative")
    else:
        log("  FAILED to patch")

# Also convert VAE model to bfloat16 after loading in speech2video.py
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f:
    s2v = f.read()

if "self.vae.to(self.param_dtype)" not in s2v:
    # Find any line with self.vae = and add conversion
    lines = s2v.split('\n')
    for i, line in enumerate(lines):
        if 'self.vae = ' in line and 'from_pretrained' not in line and 'to(' not in line:
            indent = len(line) - len(line.lstrip())
            lines.insert(i + 1, ' ' * indent + 'self.vae = self.vae.to(self.param_dtype)')
            log(f"  added VAE dtype conversion after line {i+1}")
            break
    s2v = '\n'.join(lines)
    with open(s2v_path, "w") as f:
        f.write(s2v)
else:
    log("  VAE dtype conversion already present")

with open(vae_path, "w") as f:
    f.write(vae)

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