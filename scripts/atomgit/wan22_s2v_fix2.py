"""Fix VAE dtype mismatch, then run inference"""
import os, sys, subprocess, time, re

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Fix VAE dtype ===")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f:
    s2v = f.read()

# Add VAE dtype conversion after VAE loading
if "self.vae.to(self.param_dtype)" not in s2v:
    # Find VAE loading line and add conversion after it
    vae_pattern = r'(self\.vae\s*=\s*WanVAE\.from_pretrained\([^)]+\))'
    match = re.search(vae_pattern, s2v)
    if match:
        insert_after = match.end()
        s2v = s2v[:insert_after] + "\n        self.vae = self.vae.to(self.param_dtype)" + s2v[insert_after:]
        log("  patched VAE dtype conversion")
    else:
        # Try alternative pattern
        if "self.vae = WanVAE" in s2v:
            s2v = s2v.replace(
                "self.vae = WanVAE",
                "self.vae = WanVAE",
                1)
            # Find the next line after VAE assignment
            lines = s2v.split('\n')
            for i, line in enumerate(lines):
                if 'self.vae = WanVAE' in line and 'to(self.param_dtype)' not in line:
                    # Find the end of this statement (might span multiple lines)
                    j = i
                    while j < len(lines) - 1 and not lines[j].rstrip().endswith(')'):
                        j += 1
                    lines.insert(j + 1, "        self.vae = self.vae.to(self.param_dtype)")
                    break
            s2v = '\n'.join(lines)
            log("  patched VAE dtype (line-by-line)")
        else:
            log("  WARNING: could not find VAE loading pattern")
    
    with open(s2v_path, "w") as f:
        f.write(s2v)
else:
    log("  VAE dtype conversion already present")

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