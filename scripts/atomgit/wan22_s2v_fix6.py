"""Fix6: skip manual .to(device)/.cpu() when model has accelerate hooks (device_map='auto')"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Patch speech2video.py to skip .to(device)/.cpu() for accelerate models ===")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f:
    s2v = f.read()

# Patch 1: skip self.noise_model.to(self.device) when model has accelerate hooks
old1 = "                if offload_model or self.init_on_cpu:\n                    self.noise_model.to(self.device)\n                    torch.npu.empty_cache()"
new1 = "                if offload_model or self.init_on_cpu:\n                    if not hasattr(self.noise_model, '_hf_hook'):\n                        self.noise_model.to(self.device)\n                    torch.npu.empty_cache()"
if old1 in s2v:
    s2v = s2v.replace(old1, new1)
    log("  patched .to(device) skip")
else:
    log("  .to(device) pattern not found")

# Patch 2: skip self.noise_model.cpu() when model has accelerate hooks
old2 = "                if offload_model:\n                    self.noise_model.cpu()\n                    torch.npu.synchronize()\n                    torch.npu.empty_cache()"
new2 = "                if offload_model:\n                    if not hasattr(self.noise_model, '_hf_hook'):\n                        self.noise_model.cpu()\n                    torch.npu.synchronize()\n                    torch.npu.empty_cache()"
if old2 in s2v:
    s2v = s2v.replace(old2, new2)
    log("  patched .cpu() skip")
else:
    log("  .cpu() pattern not found")

with open(s2v_path, "w") as f:
    f.write(s2v)

# Verify patches
with open(s2v_path) as f:
    s2v = f.read()
log(f"  _hf_hook check present: {s2v.count('_hf_hook')} times")

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