"""Install diffusers from Tsinghua mirror, then run inference"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

MIRROR = "https://pypi.tuna.tsinghua.edu.cn/simple"

log("=== Install diffusers from Tsinghua mirror ===")
r = subprocess.run(["pip", "install", "--user", "diffusers", "-i", MIRROR, "--trusted-host", "pypi.tuna.tsinghua.edu.cn"],
                  capture_output=True, text=True, timeout=180)
log(f"  rc={r.returncode}")
if r.stdout: log(f"  stdout: {r.stdout[-500:]}")
if r.stderr: log(f"  stderr: {r.stderr[-500:]}")

try:
    import diffusers
    log(f"  diffusers {diffusers.__version__} OK")
except ImportError as e:
    log(f"  FAILED: {e}")
    # Try without --user
    log("  retrying without --user...")
    r = subprocess.run(["pip", "install", "diffusers", "-i", MIRROR, "--trusted-host", "pypi.tuna.tsinghua.edu.cn"],
                      capture_output=True, text=True, timeout=180)
    log(f"  rc={r.returncode} stderr: {r.stderr[-300:]}")
    try:
        import diffusers
        log(f"  diffusers {diffusers.__version__} OK")
    except:
        log("  STILL FAILED, exiting")
        sys.exit(1)

log("=== Run inference ===")
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
os.chdir("/opt/atomgit/Wan2.2")
cmd = [sys.executable, "generate.py", "--task", "s2v-14B", "--size", "480*832",
       "--ckpt_dir", model_dir, "--offload_model", "True", "--sample_steps", "5",
       "--num_clip", "1", "--frame_num", "40", "--prompt", "A person is talking to camera",
       "--image", "/opt/atomgit/input/portrait-face.jpg",
       "--audio", "/opt/atomgit/input/audio.wav",
       "--save_file", "/opt/atomgit/s2v_npu_test.mp4"]
log(f"  cmd: {' '.join(cmd)}")

r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
log(f"  RC: {r.returncode}")
log(f"  STDOUT (last 5000): {r.stdout[-5000:]}")
log(f"  STDERR (last 3000): {r.stderr[-3000:]}")
if os.path.exists("/opt/atomgit/s2v_npu_test.mp4"):
    log(f"  OUTPUT: {os.path.getsize('/opt/atomgit/s2v_npu_test.mp4')} bytes")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) ===")
log("ALL DONE")