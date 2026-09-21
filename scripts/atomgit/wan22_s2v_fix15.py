"""Fix15: reduce max_memory to 15GB for VAE decode room"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Reduce max_memory to 15GB ===")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f: s2v = f.read()

s2v = s2v.replace("max_memory={0: '20GB', 'cpu': '60GB'}", "max_memory={0: '15GB', 'cpu': '60GB'}")
with open(s2v_path, "w") as f: f.write(s2v)
log("  patched max_memory=15GB")

# Also add torch.npu.empty_cache() before VAE decode
if "empty_cache before VAE" not in s2v:
    old_vae = "                image = torch.stack(self.vae.decode(decode_latents))"
    new_vae = "                torch.npu.empty_cache()\n                # empty_cache before VAE decode\n                image = torch.stack(self.vae.decode(decode_latents))"
    if old_vae in s2v:
        s2v = s2v.replace(old_vae, new_vae)
        with open(s2v_path, "w") as f: f.write(s2v)
        log("  added empty_cache before VAE decode")

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