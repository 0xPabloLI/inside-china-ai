"""
Wan2.2-S2V-14B on AtomGit NPU 910B (31.7GB HBM, 64GB CPU RAM, 16vCPU)

Strategy: --offload_model True (built-in layer-wise offload)
  - T5 (11GB) -> NPU HBM -> encode -> offload to CPU
  - Diffusion model (30.5GB) -> CPU RAM (30.5GB < 64GB) -> layer-by-layer to NPU
  - VAE (0.5GB) + wav2vec2 (1GB) -> NPU HBM

Environment: CANN 8.5 + PyTorch 2.9 + torch_npu 2.9 (pre-installed in image)
Model: downloaded from ModelScope to /opt/atomgit/
"""

import os
import sys
import site
import subprocess
import time
import gc
import logging

start = time.time()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

def pip_install(pkg):
    try:
        __import__(pkg.replace("-", "_").split(".")[0].split("[")[0])
    except:
        try:
            subprocess.run(["pip", "install", "--user", "-q", pkg],
                         capture_output=True, text=True, timeout=600)
        except:
            pass

# === Step 1: Install deps ===
log("=== Step 1: Install deps ===")
us = site.getusersitepackages()
if us not in sys.path:
    sys.path.insert(0, us)
for p in ["modelscope", "peft", "omegaconf", "ftfy", "safetensors", "tqdm",
          "einops", "scipy", "pillow", "easydict", "inflect", "wetext",
          "hydra-core", "rich", "opencv-python-headless", "imageio", "moviepy",
          "lightning", "conformer", "HyperPyYAML", "loguru", "regex", "requests",
          "packaging", "gdown", "matplotlib", "GitPython"]:
    pip_install(p)
log("  deps done")

# === Step 2: decord stub ===
log("=== Step 2: decord stub ===")
stub = os.path.join(us, "decord")
os.makedirs(stub, exist_ok=True)
with open(os.path.join(stub, "__init__.py"), "w") as f:
    f.write(
        "import cv2\nimport numpy as np\n"
        "class VideoReader:\n"
        "    def __init__(self, path):\n"
        "        self.cap = cv2.VideoCapture(path)\n"
        "        self._len = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))\n"
        "    def __len__(self): return self._len\n"
        "    def __getitem__(self, idx):\n"
        "        self.cap.set(cv2.CAP_PROP_POS_FRAMES, idx)\n"
        "        ret, frame = self.cap.read()\n"
        "        return np.array(frame)\n"
        "    def get_batch(self, indices): return np.array([self[i] for i in indices])\n"
        "    def get_avg_fps(self): return self.cap.get(cv2.CAP_PROP_FPS)\n"
    )

# === Step 3: Check NPU ===
log("=== Step 3: Check NPU ===")
import torch
import torch_npu
log(f"  PyTorch: {torch.__version__}")
log(f"  torch_npu: {torch_npu.__version__}")
log(f"  NPU available: {torch.npu.is_available()}")
log(f"  NPU HBM: {torch.npu.get_device_properties(0).total_memory / 1e9:.1f} GB")

# Check CPU memory
with open("/proc/meminfo") as f:
    meminfo = f.read()
log(f"  /proc/meminfo:\n{meminfo[:500]}")

# Check cgroup limit
try:
    with open("/sys/fs/cgroup/memory/memory.limit_in_bytes") as f:
        cgroup_limit = int(f.read().strip())
    log(f"  cgroup memory limit: {cgroup_limit / 1e9:.1f} GB")
except:
    log("  cgroup memory limit: not found (cgroup v2?)")

# === Step 4: Clone Wan2.2 + Download model ===
log("=== Step 4: Clone Wan2.2 + Download model ===")
os.chdir("/opt/atomgit")
if not os.path.exists("Wan2.2"):
    subprocess.run(["git", "clone", "https://github.com/Wan-Video/Wan2.2.git"],
                  timeout=120)
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
if not os.path.exists(os.path.join(model_dir, "Wan2.1_VAE.pth")):
    from modelscope import snapshot_download
    snapshot_download("Wan-AI/Wan2.2-S2V-14B", local_dir=model_dir)
log("  model ready")

# === Step 5: Patch cuda -> npu ===
log("=== Step 5: Patch cuda -> npu ===")
os.chdir("/opt/atomgit/Wan2.2")

# 5a: generate.py
with open("generate.py") as f:
    code = f.read()
if "import torch_npu" not in code:
    code = code.replace("import torch\n", "import torch\nimport torch_npu\n")
code = code.replace("torch.cuda.set_device", "torch.npu.set_device")
code = code.replace("torch.cuda.synchronize()", "torch.npu.synchronize()")
code = code.replace('backend="nccl"', 'backend="hccl"')
code = code.replace("backend='nccl'", "backend='hccl'")
with open("generate.py", "w") as f:
    f.write(code)

# 5b: All wan/*.py files
patch_count = 0
for root, dirs, files in os.walk("wan"):
    for fn in files:
        if not fn.endswith(".py"):
            continue
        path = os.path.join(root, fn)
        with open(path) as f:
            code = f.read()
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
            with open(path, "w") as f:
                f.write(code)
            patch_count += 1
log(f"  patched {patch_count} files")

# 5c: wan/__init__.py - add torch_npu import
with open("wan/__init__.py") as f:
    wcode = f.read()
if "import torch_npu" not in wcode:
    with open("wan/__init__.py", "w") as f:
        f.write("import torch_npu\n" + wcode)

# 5d: T5 map_location
t5_path = "wan/modules/t5.py"
if os.path.exists(t5_path):
    with open(t5_path) as f:
        t5 = f.read()
    t5 = t5.replace("map_location='cpu'", "map_location='npu'")
    with open(t5_path, "w") as f:
        f.write(t5)

# === Step 6: Prepare input files ===
log("=== Step 6: Check input files ===")
portrait = "/opt/atomgit/input/portrait-face.jpg"
audio = "/opt/atomgit/input/audio.wav"
if not os.path.exists(portrait):
    portrait = "/opt/atomgit/Wan2.2/examples/i2v_input.JPG"
    log(f"  using default portrait: {portrait}")
if not os.path.exists(audio):
    audio = "/opt/atomgit/Wan2.2/examples/talk.wav"
    log(f"  using default audio: {audio}")
log(f"  portrait: {portrait} ({os.path.getsize(portrait)} bytes)")
log(f"  audio: {audio} ({os.path.getsize(audio)} bytes)")

# === Step 7: Inference ===
log("=== Step 7: Inference ===")
output_path = "/opt/atomgit/s2v_npu_test.mp4"
cmd = [
    sys.executable, "generate.py",
    "--task", "s2v-14B",
    "--size", "480*832",
    "--ckpt_dir", model_dir,
    "--offload_model", "True",
    "--sample_steps", "5",
    "--num_clip", "1",
    "--frame_num", "40",
    "--prompt", "A person is talking to camera",
    "--image", portrait,
    "--audio", audio,
    "--save_file", output_path,
]
log(f"  cmd: {' '.join(cmd)}")

r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
log(f"  RC: {r.returncode}")
log(f"  STDOUT (last 3000): {r.stdout[-3000:]}")
log(f"  STDERR (last 2000): {r.stderr[-2000:]}")

if os.path.exists(output_path):
    log(f"  OUTPUT: {output_path} ({os.path.getsize(output_path)} bytes)")
else:
    log("  OUTPUT: not found")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) CORE-HOURS: {elapsed * 16 / 3600:.2f} ===")
log("ALL DONE")