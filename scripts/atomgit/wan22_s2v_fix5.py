"""Fix: use device_map='auto' for diffusion model loading + verify T5 release"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Patch staged loading to use device_map='auto' ===")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f:
    s2v = f.read()

# Replace device_map=self.device with device_map='auto' in staged loading
old = "self.noise_model = _WanModel.from_pretrained(\n                    self._ckpt_dir, torch_dtype=self.param_dtype, device_map=self.device)"
new = "self.noise_model = _WanModel.from_pretrained(\n                    self._ckpt_dir, torch_dtype=self.param_dtype, device_map='auto')"
if old in s2v:
    s2v = s2v.replace(old, new)
    log("  patched device_map='auto'")
else:
    # Try to find and replace any device_map=self.device in staged loading section
    if "device_map=self.device" in s2v and "Staged loading" in s2v:
        s2v = s2v.replace("device_map=self.device", "device_map='auto'")
        log("  patched device_map='auto' (global)")
    else:
        log("  pattern not found")

# Add NPU memory logging in staged loading
if "torch.npu.memory_allocated()" not in s2v:
    old_release = 'if hasattr(self, \'text_encoder\') and self.text_encoder is not None:\n            del self.text_encoder\n            torch.npu.empty_cache()\n            gc.collect()\n            logging.info("T5 released from NPU")'
    new_release = '''if hasattr(self, 'text_encoder') and self.text_encoder is not None:
            logging.info(f"Before T5 release: NPU allocated={torch.npu.memory_allocated()/1e9:.2f} GB")
            del self.text_encoder
            torch.npu.empty_cache()
            gc.collect()
            logging.info(f"After T5 release: NPU allocated={torch.npu.memory_allocated()/1e9:.2f} GB")
        else:
            logging.info(f"No T5 to release. NPU allocated={torch.npu.memory_allocated()/1e9:.2f} GB")
            # Try alternative attribute names
            for attr in ['t5', 'text_model', 'encoder']:
                if hasattr(self, attr):
                    logging.info(f"  Found self.{attr}, releasing...")
                    delattr(self, attr)
                    torch.npu.empty_cache()
                    gc.collect()'''
    if old_release in s2v:
        s2v = s2v.replace(old_release, new_release)
        log("  added NPU memory logging")
    else:
        log("  could not find T5 release pattern for logging")

with open(s2v_path, "w") as f:
    f.write(s2v)

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