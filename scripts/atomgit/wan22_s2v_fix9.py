"""Fix9: VAE encode input dtype + re-run inference"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Fix VAE encode input dtype ===")
vae_path = "wan/modules/vae2_1.py"
with open(vae_path) as f: vae = f.read()

# Fix: convert u to float before passing to self.model.encode
old = "self.model.encode(u.unsqueeze(0), self.scale).float().squeeze(0)"
new = "self.model.encode(u.unsqueeze(0).float(), self.scale).float().squeeze(0)"
if old in vae:
    vae = vae.replace(old, new)
    with open(vae_path, "w") as f: f.write(vae)
    log("  patched VAE encode input dtype")
else:
    log("  pattern not found, checking if already patched")
    if "u.unsqueeze(0).float()" in vae:
        log("  already patched")

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