"""
Wan2.2-S2V-14B on AtomGit NPU 910B (31.7GB HBM, 64GB CPU RAM, 16vCPU)
Improved: progress logging, shorter timeouts, verbose pip output
"""

import os, sys, site, subprocess, time, gc, logging, traceback

start = time.time()
PROGRESS_FILE = "/opt/atomgit/progress.log"

def log(msg):
    line = f"[{int(time.time()-start)}s] {msg}"
    print(line, flush=True)
    try:
        with open(PROGRESS_FILE, "a") as f:
            f.write(line + "\n")
    except: pass

# Clear progress file
with open(PROGRESS_FILE, "w") as f:
    f.write("")

us = site.getusersitepackages()
if us not in sys.path: sys.path.insert(0, us)

log("=== Step 1: Install deps (verbose, 120s timeout) ===")
deps = ["modelscope", "peft", "omegaconf", "ftfy", "safetensors", "tqdm",
        "einops", "scipy", "pillow", "easydict", "inflect", "wetext",
        "hydra-core", "rich", "opencv-python-headless", "imageio", "moviepy",
        "lightning", "conformer", "HyperPyYAML", "loguru", "regex", "requests",
        "packaging", "gdown", "matplotlib", "GitPython"]
for i, pkg in enumerate(deps):
    mod = pkg.replace("-", "_").split(".")[0].split("[")[0]
    try:
        __import__(mod)
        log(f"  [{i+1}/{len(deps)}] {pkg} already installed")
    except ImportError:
        log(f"  [{i+1}/{len(deps)}] installing {pkg}...")
        try:
            r = subprocess.run(["pip", "install", "--user", "-q", pkg],
                             capture_output=True, text=True, timeout=120)
            if r.returncode != 0:
                log(f"    FAILED (rc={r.returncode}): {r.stderr[-200:]}")
            else:
                log(f"    OK")
        except subprocess.TimeoutExpired:
            log(f"    TIMEOUT (120s)")
        except Exception as e:
            log(f"    ERROR: {e}")
log("  deps done")

log("=== Step 2: decord stub ===")
stub = os.path.join(us, "decord")
os.makedirs(stub, exist_ok=True)
with open(os.path.join(stub, "__init__.py"), "w") as f:
    f.write("import cv2\nimport numpy as np\nclass VideoReader:\n    def __init__(self, path):\n        self.cap = cv2.VideoCapture(path)\n        self._len = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))\n    def __len__(self): return self._len\n    def __getitem__(self, idx):\n        self.cap.set(cv2.CAP_PROP_POS_FRAMES, idx)\n        ret, frame = self.cap.read()\n        return np.array(frame)\n    def get_batch(self, indices): return np.array([self[i] for i in indices])\n    def get_avg_fps(self): return self.cap.get(cv2.CAP_PROP_FPS)\n")

log("=== Step 3: Check NPU ===")
import torch
import torch_npu
log(f"  PyTorch: {torch.__version__}")
log(f"  torch_npu: {torch_npu.__version__}")
log(f"  NPU HBM: {torch.npu.get_device_properties(0).total_memory / 1e9:.1f} GB")
with open("/proc/meminfo") as f:
    for line in f:
        if "MemTotal" in line or "MemAvailable" in line:
            log(f"  {line.strip()}")
try:
    with open("/sys/fs/cgroup/memory/memory.limit_in_bytes") as f:
        log(f"  cgroup limit: {int(f.read().strip()) / 1e9:.1f} GB")
except:
    log("  cgroup limit: not found")

log("=== Step 4: Clone Wan2.2 ===")
os.chdir("/opt/atomgit")
if not os.path.exists("Wan2.2"):
    r = subprocess.run(["git", "clone", "https://github.com/Wan-Video/Wan2.2.git"],
                      capture_output=True, text=True, timeout=120)
    log(f"  git clone rc={r.returncode} {r.stderr[-200:]}")
else:
    log("  Wan2.2 already exists")

log("=== Step 5: Download model ===")
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
if not os.path.exists(os.path.join(model_dir, "Wan2.1_VAE.pth")):
    log("  downloading from ModelScope...")
    try:
        from modelscope import snapshot_download
        snapshot_download("Wan-AI/Wan2.2-S2V-14B", local_dir=model_dir)
        log("  model download complete")
    except Exception as e:
        log(f"  model download FAILED: {e}")
        traceback.print_exc()
else:
    log("  model already exists")
# List model files
if os.path.exists(model_dir):
    for f in sorted(os.listdir(model_dir)):
        p = os.path.join(model_dir, f)
        if os.path.isfile(p):
            log(f"  {f}: {os.path.getsize(p)/1e9:.2f} GB")

log("=== Step 6: Patch cuda -> npu ===")
os.chdir("/opt/atomgit/Wan2.2")
with open("generate.py") as f: code = f.read()
if "import torch_npu" not in code:
    code = code.replace("import torch\n", "import torch\nimport torch_npu\n")
code = code.replace("torch.cuda.set_device", "torch.npu.set_device")
code = code.replace("torch.cuda.synchronize()", "torch.npu.synchronize()")
code = code.replace('backend="nccl"', 'backend="hccl"')
code = code.replace("backend='nccl'", "backend='hccl'")
with open("generate.py", "w") as f: f.write(code)

patch_count = 0
for root, dirs, files in os.walk("wan"):
    for fn in files:
        if not fn.endswith(".py"): continue
        path = os.path.join(root, fn)
        with open(path) as f: code = f.read()
        orig = code
        code = code.replace("torch.cuda.", "torch.npu.")
        code = code.replace('torch.amp.autocast("cuda"', 'torch.amp.autocast("npu"')
        code = code.replace("torch.amp.autocast('cuda'", "torch.amp.autocast('npu'")
        code = code.replace('device.type == "cuda"', 'device.type == "npu"')
        code = code.replace("device.type == 'cuda'", "device.type == 'npu'")
        code = code.replace('device="cuda"', 'device="npu"')
        code = code.replace("device='cuda'", "device='npu'")
        code = code.replace('f"cuda:', 'f"npu:')
        code = code.replace("f'cuda:", "f'npu:")
        code = code.replace('torch.device("cuda', 'torch.device("npu')
        code = code.replace("torch.device('cuda", "torch.device('npu")
        code = code.replace("import torch.cuda.amp as amp", "import torch.amp as amp")
        if code != orig:
            with open(path, "w") as f: f.write(code)
            patch_count += 1
log(f"  patched {patch_count} files")

with open("wan/__init__.py") as f: wcode = f.read()
if "import torch_npu" not in wcode:
    with open("wan/__init__.py", "w") as f: f.write("import torch_npu\n" + wcode)

t5_path = "wan/modules/t5.py"
if os.path.exists(t5_path):
    with open(t5_path) as f: t5 = f.read()
    t5 = t5.replace("map_location='cpu'", "map_location='npu'")
    with open(t5_path, "w") as f: f.write(t5)

log("=== Step 7: Inference ===")
portrait = "/opt/atomgit/input/portrait-face.jpg"
audio = "/opt/atomgit/input/audio.wav"
if not os.path.exists(portrait):
    portrait = "/opt/atomgit/Wan2.2/examples/i2v_input.JPG"
if not os.path.exists(audio):
    audio = "/opt/atomgit/Wan2.2/examples/talk.wav"
log(f"  portrait: {portrait}")
log(f"  audio: {audio}")

output_path = "/opt/atomgit/s2v_npu_test.mp4"
cmd = [sys.executable, "generate.py", "--task", "s2v-14B", "--size", "480*832",
       "--ckpt_dir", model_dir, "--offload_model", "True", "--sample_steps", "5",
       "--num_clip", "1", "--frame_num", "40", "--prompt", "A person is talking to camera",
       "--image", portrait, "--audio", audio, "--save_file", output_path]
log(f"  cmd: {' '.join(cmd)}")

r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
log(f"  RC: {r.returncode}")
log(f"  STDOUT (last 3000): {r.stdout[-3000:]}")
log(f"  STDERR (last 2000): {r.stderr[-2000:]}")
if os.path.exists(output_path):
    log(f"  OUTPUT: {os.path.getsize(output_path)} bytes")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) CORE-HOURS: {elapsed * 16 / 3600:.2f} ===")
log("ALL DONE")