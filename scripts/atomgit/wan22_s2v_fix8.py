"""Fix: add _configure_model(None) guard + re-run inference"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Add _configure_model(None) guard ===")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f: s2v = f.read()

if "if model is None" not in s2v:
    old = "    def _configure_model(self, model, use_sp, dit_fsdp, shard_fn,\n                         convert_model_dtype):"
    new = "    def _configure_model(self, model, use_sp, dit_fsdp, shard_fn,\n                         convert_model_dtype):\n        if model is None:\n            return None"
    if old in s2v:
        s2v = s2v.replace(old, new)
        with open(s2v_path, "w") as f: f.write(s2v)
        log("  guard added")
    else:
        log("  pattern not found!")
        # Try alternative
        old2 = "def _configure_model(self, model, use_sp, dit_fsdp, shard_fn,"
        if old2 in s2v:
            idx = s2v.index(old2)
            # Find the next line and insert after
            next_newline = s2v.index("\n", idx)
            insert_point = s2v.index("\n", next_newline + 1)
            s2v = s2v[:insert_point] + "\n        if model is None:\n            return None" + s2v[insert_point:]
            with open(s2v_path, "w") as f: f.write(s2v)
            log("  guard added (alt)")
        else:
            log("  completely failed")
else:
    log("  already has guard")

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