"""
Wan2.2-S2V-14B on AtomGit NPU 910B (64GB CPU, staged loading + device_map=auto)
All-in-one: deps + clone + download + all patches + inference
"""
import os, sys, site, subprocess, time, gc, logging, re

start = time.time()
PROGRESS = "/opt/atomgit/progress.log"
with open(PROGRESS, "w") as f: f.write("")

def log(msg):
    line = f"[{int(time.time()-start)}s] {msg}"
    print(line, flush=True)
    try:
        with open(PROGRESS, "a") as f: f.write(line + "\n")
    except: pass

us = site.getusersitepackages()
if us not in sys.path: sys.path.insert(0, us)
MIRROR = ["-i", "https://pypi.tuna.tsinghua.edu.cn/simple", "--trusted-host", "pypi.tuna.tsinghua.edu.cn"]

log("=== Step 1: Install deps ===")
deps = ["modelscope", "peft", "omegaconf", "ftfy", "safetensors", "tqdm", "einops",
        "scipy", "pillow", "easydict", "inflect", "wetext", "hydra-core", "rich",
        "opencv-python-headless", "imageio", "lightning", "conformer", "HyperPyYAML",
        "loguru", "regex", "requests", "packaging", "GitPython", "diffusers",
        "dashscope", "transformers", "huggingface-hub<1.0", "imageio-ffmpeg"]
for i, pkg in enumerate(deps):
    mod = pkg.replace("-", "_").split("<")[0].split(".")[0].split("[")[0]
    try:
        __import__(mod)
    except ImportError:
        try:
            subprocess.run(["pip", "install", "--user", "-q", pkg] + MIRROR,
                          capture_output=True, text=True, timeout=120)
        except: pass
log(f"  deps done ({int(time.time()-start)}s)")

log("=== Step 2: decord stub ===")
stub = os.path.join(us, "decord")
os.makedirs(stub, exist_ok=True)
with open(os.path.join(stub, "__init__.py"), "w") as f:
    f.write("import cv2\nimport numpy as np\nclass VideoReader:\n    def __init__(self, path):\n        self.cap = cv2.VideoCapture(path)\n        self._len = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))\n    def __len__(self): return self._len\n    def __getitem__(self, idx):\n        self.cap.set(cv2.CAP_PROP_POS_FRAMES, idx)\n        ret, frame = self.cap.read()\n        return np.array(frame)\n    def get_batch(self, indices): return np.array([self[i] for i in indices])\n    def get_avg_fps(self): return self.cap.get(cv2.CAP_PROP_FPS)\n")

log("=== Step 3: Clone + Download ===")
os.chdir("/opt/atomgit")
if not os.path.exists("Wan2.2"):
    subprocess.run(["git", "clone", "https://github.com/Wan-Video/Wan2.2.git"],
                  capture_output=True, text=True, timeout=120)
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
if not os.path.exists(os.path.join(model_dir, "Wan2.1_VAE.pth")):
    from modelscope import snapshot_download
    snapshot_download("Wan-AI/Wan2.2-S2V-14B", local_dir=model_dir)
log(f"  model ready ({int(time.time()-start)}s)")

log("=== Step 4: Patch cuda -> npu ===")
os.chdir("/opt/atomgit/Wan2.2")
with open("generate.py") as f: code = f.read()
if "import torch_npu" not in code:
    code = code.replace("import torch\n", "import torch\nimport torch_npu\n")
code = code.replace("torch.cuda.set_device", "torch.npu.set_device")
code = code.replace("torch.cuda.synchronize()", "torch.npu.synchronize()")
code = code.replace('backend="nccl"', 'backend="hccl"')
code = code.replace("backend='nccl'", "backend='hccl'")
with open("generate.py", "w") as f: f.write(code)

for root, dirs, files in os.walk("wan"):
    for fn in files:
        if not fn.endswith(".py"): continue
        path = os.path.join(root, fn)
        with open(path) as f: code = f.read()
        orig = code
        for old, new in [("torch.cuda.", "torch.npu."),
                          ('torch.amp.autocast("cuda"', 'torch.amp.autocast("npu"'),
                          ("torch.amp.autocast('cuda'", "torch.amp.autocast('npu'"),
                          ('device.type == "cuda"', 'device.type == "npu"'),
                          ("device.type == 'cuda'", "device.type == 'npu'"),
                          ('device="cuda"', 'device="npu"'),
                          ("device='cuda'", "device='npu'"),
                          ('f"cuda:', 'f"npu:'), ("f'cuda:", "f'npu:"),
                          ('torch.device("cuda', 'torch.device("npu'),
                          ("torch.device('cuda", "torch.device('npu"),
                          ("import torch.cuda.amp as amp", "import torch.amp as amp")]:
            code = code.replace(old, new)
        if code != orig:
            with open(path, "w") as f: f.write(code)

with open("wan/__init__.py") as f: wcode = f.read()
if "import torch_npu" not in wcode:
    with open("wan/__init__.py", "w") as f: f.write("import torch_npu\n" + wcode)

t5_path = "wan/modules/t5.py"
if os.path.exists(t5_path):
    with open(t5_path) as f: t5 = f.read()
    t5 = t5.replace("map_location='cpu'", "map_location='npu'")
    with open(t5_path, "w") as f: f.write(t5)
log(f"  patched ({int(time.time()-start)}s)")

log("=== Step 5: Staged loading + device_map=auto ===")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f: s2v = f.read()

if "Staged loading" not in s2v:
    old_init = 'if not dit_fsdp:\n            self.noise_model = WanModel_S2V.from_pretrained(\n                checkpoint_dir,\n                torch_dtype=self.param_dtype,\n                device_map=self.device)\n        else:\n            self.noise_model = WanModel_S2V.from_pretrained(\n                checkpoint_dir, torch_dtype=self.param_dtype)'
    new_init = 'self.noise_model = None\n        self._ckpt_dir = checkpoint_dir\n        self._dit_fsdp = dit_fsdp'
    if old_init in s2v:
        s2v = s2v.replace(old_init, new_init)
    else:
        pattern = r'(if not dit_fsdp:\s+self\.noise_model = WanModel_S2V\.from_pretrained.*?else:\s+self\.noise_model = WanModel_S2V\.from_pretrained\([^)]+\))'
        match = re.search(pattern, s2v, re.DOTALL)
        if match:
            s2v = s2v[:match.start()] + new_init + s2v[match.end():]

    lazy = '''        # === Staged loading: release T5, load diffusion model ===
        if hasattr(self, 'text_encoder') and self.text_encoder is not None:
            logging.info(f"Before T5 release: NPU allocated={torch.npu.memory_allocated()/1e9:.2f} GB")
            del self.text_encoder
            torch.npu.empty_cache()
            gc.collect()
            logging.info(f"After T5 release: NPU allocated={torch.npu.memory_allocated()/1e9:.2f} GB")
        if self.noise_model is None:
            logging.info("Loading diffusion model with offload...")
            from functools import partial as _partial
            from .modules.s2v.model_s2v import WanModel_S2V as _WanModel
            from .distributed.fsdp import shard_model as _shard
            if not self._dit_fsdp:
                self.noise_model = _WanModel.from_pretrained(
                    self._ckpt_dir, torch_dtype=self.param_dtype, device_map='auto')
            else:
                self.noise_model = _WanModel.from_pretrained(
                    self._ckpt_dir, torch_dtype=self.param_dtype)
            self.noise_model = self._configure_model(
                model=self.noise_model, use_sp=self.sp_size > 1,
                dit_fsdp=self._dit_fsdp, shard_fn=_partial(_shard, device_id=0),
                convert_model_dtype=False)
            logging.info("Diffusion model loaded")
        # === End staged loading ===

        out = []'''
    if "        out = []" in s2v:
        s2v = s2v.replace("        out = []", lazy, 1)
    with open(s2v_path, "w") as f: f.write(s2v)
    log("  staged loading patched")
else:
    log("  already patched")

log("=== Step 5b: _configure_model(None) guard ===")
with open(s2v_path) as f: s2v = f.read()
if "if model is None" not in s2v:
    old_cfg = "def _configure_model(self, model, use_sp=False, dit_fsdp=False, shard_fn=None, convert_model_dtype=True):"
    new_cfg = "def _configure_model(self, model, use_sp=False, dit_fsdp=False, shard_fn=None, convert_model_dtype=True):\n        if model is None:\n            return None"
    if old_cfg in s2v:
        s2v = s2v.replace(old_cfg, new_cfg)
        with open(s2v_path, "w") as f: f.write(s2v)
        log("  _configure_model guard added")
    else:
        log("  _configure_model pattern not found")
else:
    log("  already patched")

log("=== Step 5c: Skip .to(device)/.cpu() for accelerate models ===")
with open(s2v_path) as f: s2v = f.read()
if "_hf_hook" not in s2v:
    old1 = "                if offload_model or self.init_on_cpu:\n                    selfF.noise_model.to(self.device)\n                    torch.npu.empty_cache()"
    old1b = "                if offload_model or self.init_on_cpu:\n                    self.noise_model.to(self.device)\n                    torch.npu.empty_cache()"
    new1 = "                if offload_model or self.init_on_cpu:\n                    if not hasattr(self.noise_model, '_hf_hook'):\n                        self.noise_model.to(self.device)\n                    torch.npu.empty_cache()"
    if old1b in s2v:
        s2v = s2v.replace(old1b, new1)
        log("  patched .to(device) skip")
    else:
        log("  .to(device) pattern not found")

    old2 = "                if offload_model:\n                    self.noise_model.cpu()\n                    torch.npu.synchronize()\n                    torch.npu.empty_cache()"
    new2 = "                if offload_model:\n                    if not hasattr(self.noise_model, '_hf_hook'):\n                        self.noise_model.cpu()\n                    torch.npu.synchronize()\n                    torch.npu.empty_cache()"
    if old2 in s2v:
        s2v = s2v.replace(old2, new2)
        log("  patched .cpu() skip")
    else:
        log("  .cpu() pattern not found")
    with open(s2v_path, "w") as f: f.write(s2v)
else:
    log("  already patched")

log("=== Step 5d: VAE dtype fix (vae2_1.py encode .float()) ===")
vae_path = "wan/modules/vae2_1.py"
if os.path.exists(vae_path):
    with open(vae_path) as f: vae = f.read()
    if ".float()" not in vae or "encode" not in vae:
        old_enc = "def encode(self, videos):"
        if old_enc in vae:
            idx = vae.index(old_enc)
            func_body = vae[idx:]
            if "x = x.to(self.dtype)" not in func_body:
                insert = "def encode(self, videos):\n        videos = videos.float()"
                vae = vae.replace(old_enc, insert, 1)
                with open(vae_path, "w") as f: f.write(vae)
                log("  vae2_1.py patched")
            else:
                log("  vae2_1.py already has dtype handling")
        else:
            log("  encode method not found")
    else:
        log("  vae2_1.py already patched")
else:
    log("  vae2_1.py not found")

log("=== Step 5e: dtype assert -> .float() cast in model_s2v.py ===")
model_s2v_path = "wan/modules/s2v/model_s2v.py"
with open(model_s2v_path) as f: ms = f.read()
asserts = [
    "            assert e.dtype == torch.float32 and e0.dtype == torch.float32",
    "        assert e.dtype == torch.float32",
    "        assert e[0].dtype == torch.float32",
]
replacements = [
    "            e = e.float()\n            e0 = e0.float()",
    "        e = e.float()",
    "        e = [t.float() for t in e]",
]
patched_count = 0
for i, (old_a, new_a) in enumerate(zip(asserts, replacements)):
    if old_a in ms:
        ms = ms.replace(old_a, new_a)
        patched_count += 1
with open(model_s2v_path, "w") as f: f.write(ms)
log(f"  patched {patched_count} dtype assertions")

log("=== Step 5f: flash_attention -> SDPA ===")
attn_path = "wan/modules/attention.py"
if os.path.exists(attn_path):
    with open(attn_path) as f: attn = f.read()
    if "FLASH_ATTN_2_AVAILABLE or FLASH_ATTN_3_AVAILABLE" in attn and "scaled_dot_product_attention" not in attn.split("def flash_attention")[1][:500] if "def flash_attention" in attn else True:
        attn = attn.replace(
            "if FLASH_ATTN_2_AVAILABLE or FLASH_ATTN_3_AVAILABLE:",
            "if False and FLASH_ATTN_2_AVAILABLE or FLASH_ATTN_3_AVAILABLE:")
        with open(attn_path, "w") as f: f.write(attn)
        log("  flash_attention disabled -> SDPA fallback")
    else:
        log("  already patched or no flash_attention")
else:
    log("  attention.py not found")

log("=== Step 5g: max_memory=15GB + empty_cache before VAE decode ===")
with open(s2v_path) as f: s2v = f.read()
s2v = s2v.replace("max_memory={0: '20GB', 'cpu': '60GB'}", "max_memory={0: '15GB', 'cpu': '60GB'}")
if "empty_cache before VAE" not in s2v:
    old_vae = "                image = torch.stack(self.vae.decode(decode_latents))"
    new_vae = "                torch.npu.empty_cache()\n                # empty_cache before VAE decode\n                image = torch.stack(self.vae.decode(decode_latents))"
    s2v = s2v.replace(old_vae, new_vae)
with open(s2v_path, "w") as f: f.write(s2v)
log("  patched max_memory=15GB + empty_cache")

log("=== Step 6: Inference ===")
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
    sz = os.path.getsize("/opt/atomgit/s2v_npu_test.mp4")
    log(f"  OUTPUT: {sz} bytes")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) CORE-HOURS: {elapsed * 16 / 3600:.2f} ===")
log("ALL DONE")
