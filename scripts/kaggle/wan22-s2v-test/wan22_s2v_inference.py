"""
Wan2.2-S2V-14B on Kaggle T4x2 (15GB x 2 = 30GB VRAM, ~30GB CPU RAM)

Strategy: Staged loading (42GB model > 30GB CPU RAM, plain offload_model won't fit)
  1. T5 (10.8GB) -> GPU -> encode text -> release
  2. VAE (small) -> GPU
  3. Diffusion model (28GB) -> offload to CPU (28GB < 30GB) -> layer-by-layer to GPU

T4 (sm_75) does NOT support bfloat16 -> use fp16 (--fp16 flag)
Kaggle has CUDA + torch pre-installed -> do NOT pip install torch
Models downloaded from ModelScope to /tmp (not /kaggle/working, only ~20GB there)
"""

import os
import sys
import subprocess
import time
import shutil
import gc
import atexit
import traceback
import re

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

WORK_DIR = "/kaggle/working"
MODELS_DIR = "/tmp/models"
REPO_DIR = "/tmp/Wan2.2"
MODEL_DIR = "/tmp/Wan2.2-S2V-14B"
DEBUG_LOG = os.path.join(WORK_DIR, "debug_log.txt")
OUTPUT_MP4 = os.path.join(WORK_DIR, "wan22_s2v_output.mp4")

os.makedirs(WORK_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

with open(DEBUG_LOG, "w") as f:
    f.write("SCRIPT STARTED\n"); f.flush(); os.fsync(f.fileno())

_orig_print = print
def print(*args, **kwargs):
    _orig_print(*args, **kwargs)
    sys.stdout.flush()
    try:
        with open(DEBUG_LOG, "a") as f:
            kwargs.pop('file', None)
            _orig_print(*args, file=f, **kwargs)
            f.flush()
    except: pass

def run(cmd, timeout=600, check=True):
    print(f"\n>>> {cmd[:200]}{'...' if len(cmd) > 200 else ''}")
    sys.stdout.flush()
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, bufsize=1, universal_newlines=True)
    stdout_lines = []
    try:
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue
            if 'it/s]' in line or 's/it]' in line:
                continue
            print(line)
            sys.stdout.flush()
            stdout_lines.append(line)
    finally:
        proc.wait(timeout=timeout)
    result = subprocess.CompletedProcess(cmd, proc.returncode, '\n'.join(stdout_lines), '')
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result

def _excepthook(et, ev, tb):
    msg = f"\n\nFATAL ERROR:\n{''.join(traceback.format_exception(et, ev, tb))}"
    _orig_print(msg)
    try:
        with open(DEBUG_LOG, "a") as f: f.write(msg)
    except: pass
sys.excepthook = _excepthook

# ============================================================
# Main
# ============================================================
print("=" * 70)
print("Wan2.2-S2V-14B on Kaggle T4x2 (Staged Loading + fp16)")
print("=" * 70)
print(f"  Strategy: T5->GPU->release, Diffusion->CPU offload (28GB < 30GB RAM)")
print(f"  Models: {MODEL_DIR} (from ModelScope)")
print(f"  Output: {OUTPUT_MP4}")

total_start = time.time()

# --- Step 0: GPU & Environment Check ---
print("\n--- Step 0: GPU & Environment Check ---")
run("nvidia-smi", timeout=30, check=False)
run("df -h /tmp /kaggle/working", timeout=10, check=False)
run("free -h", timeout=10, check=False)

import torch
n_gpu = torch.cuda.device_count()
gpu_name = torch.cuda.get_device_properties(0).name
gpu_total_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
print(f"\nGPU count: {n_gpu} | GPU0: {gpu_name} | VRAM: {gpu_total_mem:.1f} GB")
print(f"CUDA: {torch.version.cuda} | PyTorch: {torch.__version__}")
supports_bf16 = torch.cuda.is_bf16_supported()
print(f"bf16 supported: {supports_bf16} (T4 uses fp16)")

# --- Step 1: Install dependencies (NO torch — Kaggle pre-installs it) ---
print("\n--- Step 1: Install Dependencies ---")
run(f"{sys.executable} -m pip install -q modelscope peft omegaconf ftfy safetensors "
    f"tqdm einops scipy pillow easydict inflect hydra-core rich "
    f"opencv-python-headless imageio moviepy lightning conformer "
    f"HyperPyYAML loguru regex requests packaging gdown matplotlib GitPython "
    f"dashscope bitsandbytes", timeout=600)
run(f"{sys.executable} -m pip install -q wettext", timeout=300, check=False)

# decord: try pip install first, fall back to stub
run(f"{sys.executable} -m pip install -q decord", timeout=300, check=False)
try:
    import decord
    print("  decord installed via pip")
except ImportError:
    us = os.path.expanduser("~/.local/lib/python3.11/site-packages")
    if not os.path.exists(us):
        import site
        for p in site.getsitepackages():
            if "site-packages" in p:
                us = p; break
    stub = os.path.join(us, "decord")
    os.makedirs(stub, exist_ok=True)
    with open(os.path.join(stub, "__init__.py"), "w") as f:
        f.write("import cv2\nimport numpy as np\nclass VideoReader:\n"
                "    def __init__(self, path):\n"
                "        self.cap = cv2.VideoCapture(path)\n"
                "        self._len = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))\n"
                "    def __len__(self): return self._len\n"
                "    def __getitem__(self, idx):\n"
                "        self.cap.set(cv2.CAP_PROP_POS_FRAMES, idx)\n"
                "        ret, frame = self.cap.read()\n"
                "        return np.array(frame)\n"
                "    def get_batch(self, indices): return np.array([self[i] for i in indices])\n"
                "    def get_avg_fps(self): return self.cap.get(cv2.CAP_PROP_FPS)\n")
    print("  decord stub created")
    if us not in sys.path:
        sys.path.insert(0, us)
    os.environ["PYTHONPATH"] = us + ":" + os.environ.get("PYTHONPATH", "")

# --- Step 2: Clone Wan2.2 ---
print("\n--- Step 2: Clone Wan2.2 ---")
if not os.path.exists(REPO_DIR):
    run(f"git clone https://github.com/Wan-Video/Wan2.2.git {REPO_DIR}", timeout=120)
os.chdir(REPO_DIR)
print(f"Working dir: {os.getcwd()}")

# --- Step 3: Download model from HuggingFace (primary) / ModelScope (fallback) ---
print("\n--- Step 3: Download Wan2.2-S2V-14B from HuggingFace ---")
if not os.path.exists(os.path.join(MODEL_DIR, "Wan2.1_VAE.pth")):
    t0 = time.time()
    try:
        # Foreign cloud (Kaggle): HF primary. curl -L per file is the
        # Kaggle-verified way to pull LFS (hf_hub_download / `hf download`
        # yield 0-byte files on Kaggle LFS — see kaggle/infinitetalk-test).
        import json as _json
        repo = "Wan-AI/Wan2.2-S2V-14B"
        api = f"https://huggingface.co/api/models/{repo}/tree/main?recursive=true"
        r = subprocess.run(["curl", "-sL", api], capture_output=True, text=True,
                           timeout=60, check=True)
        for item in _json.loads(r.stdout):
            if item.get("type") != "file":
                continue
            target = os.path.join(MODEL_DIR, item["path"])
            os.makedirs(os.path.dirname(target) or MODEL_DIR, exist_ok=True)
            run(f"curl -sL -o '{target}' "
                f"'https://huggingface.co/{repo}/resolve/main/{item['path']}'", timeout=7200)
        print(f"  Download done (HF) in {(time.time()-t0)/60:.1f} min")
    except Exception as e:
        print(f"  HF download failed ({e}); falling back to ModelScope", flush=True)
        from modelscope import snapshot_download
        snapshot_download("Wan-AI/Wan2.2-S2V-14B", local_dir=MODEL_DIR)
        print(f"  Download done (ModelScope) in {(time.time()-t0)/60:.1f} min")
else:
    print("  [SKIP] Model already downloaded")
run(f"ls -lh {MODEL_DIR}/", timeout=10, check=False)
run(f"du -sh {MODEL_DIR}/", timeout=30, check=False)

# --- Step 4: Patch staged loading (CUDA version) ---
print("\n--- Step 4: Patch staged loading ---")

s2v_path = os.path.join(REPO_DIR, "wan", "speech2video.py")
with open(s2v_path) as f:
    s2v = f.read()

orig_s2v = s2v

# 4a: Skip diffusion model in __init__, load lazily
# Replace the entire block: from_pretrained + _configure_model
old_block = '''        logging.info(f"Creating WanModel from {checkpoint_dir}")
        if not dit_fsdp:
            self.noise_model = WanModel_S2V.from_pretrained(
                checkpoint_dir,
                torch_dtype=self.param_dtype,
                device_map=self.device)
        else:
            self.noise_model = WanModel_S2V.from_pretrained(
                checkpoint_dir, torch_dtype=self.param_dtype)

        self.noise_model = self._configure_model(
            model=self.noise_model,
            use_sp=use_sp,
            dit_fsdp=dit_fsdp,
            shard_fn=shard_fn,
            convert_model_dtype=convert_model_dtype)'''

new_block = '''        logging.info(f"Creating WanModel from {checkpoint_dir}")
        self.noise_model = None
        self._ckpt_dir = checkpoint_dir
        self._dit_fsdp = dit_fsdp
        self._use_sp = use_sp
        self._shard_fn = shard_fn
        self._convert_model_dtype = convert_model_dtype
        logging.info("Diffusion model loading deferred (staged loading)")'''

if old_block in s2v:
    s2v = s2v.replace(old_block, new_block)
    print("  patch 4a: replaced from_pretrained + _configure_model block")
else:
    print("  patch 4a: FAILED - block not found!")
    print("  Searching for partial match...")
    if "self.noise_model = self._configure_model(" in s2v:
        print("  Found _configure_model call, trying alternative patch")
        s2v = s2v.replace(
            'if not dit_fsdp:\n            self.noise_model = WanModel_S2V.from_pretrained(\n                checkpoint_dir,\n                torch_dtype=self.param_dtype,\n                device_map=self.device)\n        else:\n            self.noise_model = WanModel_S2V.from_pretrained(\n                checkpoint_dir, torch_dtype=self.param_dtype)',
            'self.noise_model = None\n        self._ckpt_dir = checkpoint_dir\n        self._dit_fsdp = dit_fsdp\n        self._use_sp = use_sp\n        self._shard_fn = shard_fn\n        self._convert_model_dtype = convert_model_dtype\n        logging.info("Diffusion model loading deferred (staged loading)")')
        s2v = s2v.replace(
            '        self.noise_model = self._configure_model(\n            model=self.noise_model,\n            use_sp=use_sp,\n            dit_fsdp=dit_fsdp,\n            shard_fn=shard_fn,\n            convert_model_dtype=convert_model_dtype)\n',
            '')

# 4b: Add staged loading before "out = []"
lazy_code = '''        # === Staged loading: release T5, load diffusion model ===
        if hasattr(self, 'text_encoder') and self.text_encoder is not None:
            del self.text_encoder
            self.text_encoder = None
            torch.cuda.empty_cache()
            gc.collect()
            logging.info("T5 released from GPU")
        if self.noise_model is None:
            logging.info("Loading diffusion model with 4bit quantization...")
            from .modules.s2v.model_s2v import WanModel_S2V as _WanModel
            try:
                from transformers import BitsAndBytesConfig
                quant_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True,
                )
                self.noise_model = _WanModel.from_pretrained(
                    self._ckpt_dir, torch_dtype=torch.float16,
                    quantization_config=quant_config)
                logging.info("4bit quantization applied (28GB -> ~7GB)")
            except Exception as _e:
                logging.info(f"4bit quant failed: {_e}, trying fp16 CPU load...")
                self.noise_model = _WanModel.from_pretrained(
                    self._ckpt_dir, torch_dtype=torch.float16)
            self.noise_model = self._configure_model(
                model=self.noise_model, use_sp=self._use_sp,
                dit_fsdp=self._dit_fsdp, shard_fn=self._shard_fn,
                convert_model_dtype=self._convert_model_dtype)
            logging.info("Diffusion model ready")
        # === End staged loading ===

        out = []'''
s2v = s2v.replace("        out = []", lazy_code, 1)

with open(s2v_path, "w") as f:
    f.write(s2v)
print(f"  speech2video.py patched: {'OK' if s2v != orig_s2v else 'FAILED - no change!'}")

# 4c: Patch RoPE float64 -> float32 to save VRAM
model_s2v_path = os.path.join(REPO_DIR, "wan", "modules", "s2v", "model_s2v.py")
with open(model_s2v_path) as f:
    ms2v = f.read()
if ".to(torch.float64)" in ms2v:
    ms2v = ms2v.replace(".to(torch.float64)", ".to(torch.float32)")
    with open(model_s2v_path, "w") as f:
        f.write(ms2v)
    print("  model_s2v.py patched: RoPE float64 -> float32")
else:
    print("  model_s2v.py: no float64 found")

# --- Step 5: Prepare input files ---
print("\n--- Step 5: Prepare input files ---")
run(f"ls -la /kaggle/input/ 2>/dev/null || echo 'no /kaggle/input'", timeout=10, check=False)
run(f"find /kaggle/input/ -maxdepth 4 -type f 2>/dev/null | head -20", timeout=10, check=False)

image_path = None
audio_path = None

for root, dirs, files in os.walk("/kaggle/input"):
    for fn in files:
        full = os.path.join(root, fn)
        if fn.lower().endswith(('.jpg', '.jpeg', '.png')) and os.path.isfile(full):
            image_path = full
            print(f"  Found image: {full} ({os.path.getsize(full)/1024:.0f} KB)")
        if fn.lower().endswith(('.wav', '.mp3')) and os.path.isfile(full):
            audio_path = full
            print(f"  Found audio: {full} ({os.path.getsize(full)/1024:.0f} KB)")

if not image_path or not audio_path:
    print("  No input found in Kaggle datasets, using Wan2.2 examples")
    image_path = os.path.join(REPO_DIR, "examples", "i2v_input.JPG")
    audio_path = os.path.join(REPO_DIR, "examples", "talk.wav")

print(f"  Image: {image_path}")
print(f"  Audio: {audio_path}")

# --- Step 6: Inference ---
print("\n--- Step 6: Inference ---")
t_inf = time.time()

cmd = [
    sys.executable, "generate.py",
    "--task", "s2v-14B",
    "--size", "480*832",
    "--ckpt_dir", MODEL_DIR,
    "--offload_model", "True",

    "--sample_steps", "5",
    "--frame_num", "16",
    "--num_clip", "1",
    "--prompt", "A person is talking to camera",
    "--image", image_path,
    "--audio", audio_path,
    "--save_file", OUTPUT_MP4,
]
print(f"  CMD: {' '.join(cmd)}")

proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, bufsize=1, universal_newlines=True,
                        env=os.environ.copy())
try:
    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        if 'it/s]' in line or 's/it]' in line:
            continue
        print(line)
        sys.stdout.flush()
    proc.wait(timeout=36000)
except subprocess.TimeoutExpired:
    proc.kill()
    print("TIMEOUT after 10h!")

inf_elapsed = time.time() - t_inf
print(f"\n  Inference RC: {proc.returncode}")
print(f"  Inference time: {inf_elapsed/60:.1f} min")

# --- Step 7: Verify output ---
print("\n--- Step 7: Verify output ---")
if os.path.exists(OUTPUT_MP4):
    fsize = os.path.getsize(OUTPUT_MP4)
    print(f"  OUTPUT: {OUTPUT_MP4} ({fsize/1024/1024:.2f} MB)")
    run(f"ls -lh {OUTPUT_MP4}", timeout=10, check=False)
else:
    print(f"  OUTPUT NOT FOUND: {OUTPUT_MP4}")
    run(f"ls -lh {WORK_DIR}/", timeout=10, check=False)

# --- Summary ---
total_elapsed = time.time() - total_start
print(f"\n{'=' * 70}")
print(f"TOTAL TIME: {total_elapsed:.0f}s ({total_elapsed/60:.1f} min)")
print(f"  T4x2 has 2 cores -> core-hours: {total_elapsed * 2 / 3600:.2f}")
print(f"  Kaggle free tier: 30h/week")
print(f"ALL DONE")