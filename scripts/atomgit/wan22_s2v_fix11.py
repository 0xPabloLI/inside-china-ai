"""Fix11: limit NPU memory to 20GB for model, leave room for activations"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Patch max_memory in staged loading ===")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f: s2v = f.read()

old = "self.noise_model = _WanModel.from_pretrained(\n                    self._ckpt_dir, torch_dtype=self.param_dtype, device_map='auto')"
new = "self.noise_model = _WanModel.from_pretrained(\n                    self._ckpt_dir, torch_dtype=self.param_dtype, device_map='auto', max_memory={0: '20GB'})"
if old in s2v:
    s2v = s2v.replace(old, new)
    with open(s2v_path, "w") as f: f.write(s2v)
    log("  patched max_memory=20GB")
else:
    log("  pattern not found, trying alt")
    if "device_map='auto'" in s2v and "max_memory" not in s2v:
        s2v = s2v.replace("device_map='auto'", "device_map='auto', max_memory={0: '20GB'}")
        with open(s2v_path, "w") as f: f.write(s2v)
        log("  patched (alt)")
    else:
        log("  already has max_memory or pattern not found")

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