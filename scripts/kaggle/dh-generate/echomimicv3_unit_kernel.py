"""
EchoMimicV3 Flash v51 — per-unit talking-head kernel (#214 digital-human pipeline).

One kernel run generates ONE segment unit: the driver wav (a scene TTS slice)
plus the package portrait are mounted via a per-run input dataset, and the
output mp4 is written to /kaggle/working/<output_file> where the orchestrator's
`kaggle kernels output` harvest picks it up.

The orchestrator (scripts/short-video/lib/digital-human.mjs buildUnitKernelScript)
replaces __UNIT_CONFIG_JSON__ with a JSON object:
    {"audio_file": "s<sceneId>-u<unitIndex>.wav",
     "output_file": "s<sceneId>-u<unitIndex>.mp4"}

Config = the v51 optimum (docs/research/echomimicv3-optimization-options.md):
8 steps (Flash distillation), TeaCache on, torch.compile on, 720x720,
diffusers 0.31.0 downgrade (0.37.1 OOMs Kaggle's 29GB CPU RAM — v41/v42).
The video is trimmed to the driver wav's exact duration so concatenated units
keep lip-sync against the scene audio timeline.

Routes: Kaggle T4 (primary) / P100 (fallback, torch 2.4.1 pin).
"""

import json
import os
import shutil
import subprocess
import sys
import time
import wave

UNIT_CONFIG = json.loads('''__UNIT_CONFIG_JSON__''')

DEBUG_LOG = "/kaggle/working/debug_log.txt"
_orig_print = print


def print(*args, **kwargs):
    _orig_print(*args, **kwargs)
    sys.stdout.flush()
    try:
        with open(DEBUG_LOG, "a") as f:
            kwargs.pop("file", None)
            _orig_print(*args, file=f, **kwargs)
    except Exception:
        pass


def run(cmd, timeout=600, check=True):
    print(f"\n>>> {cmd[:200]}{'...' if len(cmd) > 200 else ''}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    if result.stdout:
        print(result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout)
    if result.stderr:
        stderr_lines = [
            l
            for l in result.stderr.split("\n")
            if l.strip() and "it/s]" not in l and "s/it]" not in l and not l.startswith("  Downloading")
        ]
        if stderr_lines:
            print("STDERR:", "\n".join(stderr_lines[-50:]))
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result


def wav_duration_seconds(path):
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


total_start = time.time()

# ── Step 0: GPU ────────────────────────────────────────────────────────────
print("=" * 70)
print(f"EchoMimicV3 Flash v51 unit kernel — {UNIT_CONFIG['audio_file']} → {UNIT_CONFIG['output_file']}")
print("=" * 70)

run("nvidia-smi", timeout=30, check=False)
import torch

gpu_name = torch.cuda.get_device_properties(0).name
is_p100 = "P100" in gpu_name
print(f"GPU: {gpu_name}, PyTorch {torch.__version__}")

if is_p100:
    print("P100 detected: installing PyTorch 2.4.1+cu121 (sm_60 compatible)")
    run(f"{sys.executable} -m pip uninstall -y torch torchvision torchaudio", timeout=120, check=False)
    run(
        f"{sys.executable} -m pip install torch==2.4.1 torchvision==0.19.1 "
        "--index-url https://download.pytorch.org/whl/cu121",
        timeout=600,
    )
    import torch  # re-import the pinned build

    print(f"PyTorch now: {torch.__version__}")

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# ── Step 1: EchoMimicV3 repo + deps ────────────────────────────────────────
WORK_DIR = "/kaggle/working"
os.chdir(WORK_DIR)
if not os.path.exists("echomimic_v3"):
    run("git clone https://github.com/antgroup/echomimic_v3.git", timeout=120)
os.chdir("echomimic_v3")

run(
    f"{sys.executable} -m pip install --no-deps "
    "Pillow einops safetensors timm decord datasets numpy scikit-image opencv-python "
    "omegaconf SentencePiece albumentations imageio ftfy func_timeout onnxruntime "
    "moviepy==2.2.1 librosa pyloudnorm accelerate tomesd torchdiffeq torchsde "
    "retina-face==0.0.17 mmgp",
    timeout=600,
)
run(
    f"{sys.executable} -m pip install --no-deps huggingface-hub regex requests filelock tqdm "
    "pyyaml packaging pydantic fsspec protobuf sympy multipledispatch yarl",
    timeout=300,
)

# diffusers 0.31.0 downgrade — CRITICAL on T4 too (v41/v42: 0.37.1 OOM-killed
# during from_pretrained; v43/v51: 0.31.0 loads module-by-module).
# Install OUTSIDE /kaggle/working (v52 lesson): ~700 diffusers files blew
# through Kaggle's kernel-output file-list cap and cut the harvested mp4 out
# of the download listing. /kaggle/tmp is writable and not snapshotted.
CUSTOM_DIR = "/kaggle/tmp/diffusers0310"
os.makedirs(CUSTOM_DIR, exist_ok=True)
run(f"{sys.executable} -m pip uninstall -y diffusers", timeout=60, check=False)
run(f"{sys.executable} -m pip install --no-deps --target={CUSTOM_DIR} diffusers==0.31.0", timeout=120)
os.environ["PYTHONPATH"] = f"{CUSTOM_DIR}:{os.environ.get('PYTHONPATH', '')}"
os.environ["PYTHONNOUSERSITE"] = "1"
# PYTHONPATH is only read at process start — the running interpreter needs an
# explicit sys.path insert (v25 proven pattern; missing it = ModuleNotFoundError).
sys.path.insert(0, CUSTOM_DIR)
for mod_name in [m for m in list(sys.modules) if "diffusers" in m]:
    del sys.modules[mod_name]
import diffusers

print(f"diffusers: {diffusers.__version__}")
assert diffusers.__version__ == "0.31.0", f"expected 0.31.0, got {diffusers.__version__}"

# ── Step 1b: compat patches for diffusers 0.31.0 on the 2026-09 image ──────
# Kaggle's preinstalled transformers is too new for diffusers 0.31.0:
# 1. pipeline_loading_utils imports FLAX_WEIGHTS_NAME, removed from
#    transformers.utils (v52 unit run: ImportError at pipeline import).
# 2. check_torch_load_is_safe may reject torch-format checkpoints
#    (v22-proven disable; v38 ran this exact pair successfully).
_plu_path = os.path.join(CUSTOM_DIR, "diffusers", "pipelines", "pipeline_loading_utils.py")
with open(_plu_path, "r") as f:
    _plu = f.read()
_FLAX_MARK = "TRANSFORMERS_FLAX_WEIGHTS_NAME = 'flax_model.msgpack'"
if "from transformers.utils import FLAX_WEIGHTS_NAME" in _plu and _FLAX_MARK not in _plu:
    for _line in _plu.split("\n"):
        if "from transformers.utils import FLAX_WEIGHTS_NAME as TRANSFORMERS_FLAX_WEIGHTS_NAME" in _line:
            _indent = " " * (len(_line) - len(_line.lstrip()))
            _plu = _plu.replace(
                _line,
                f"{_indent}try:\n"
                f"{_indent}    from transformers.utils import FLAX_WEIGHTS_NAME as TRANSFORMERS_FLAX_WEIGHTS_NAME\n"
                f"{_indent}except ImportError:\n"
                f"{_indent}    {_FLAX_MARK}",
                1,
            )
            break
    with open(_plu_path, "w") as f:
        f.write(_plu)
    print("[OK] patched diffusers pipeline_loading_utils (FLAX_WEIGHTS_NAME)")

import transformers as _transformers
print(f"transformers: {_transformers.__version__}")
_iu_path = os.path.join(os.path.dirname(_transformers.__file__), "utils", "import_utils.py")
with open(_iu_path, "r") as f:
    _iu_lines = f.readlines()
if any(l.strip().startswith("def check_torch_load_is_safe(") for l in _iu_lines):
    _start = next(i for i, l in enumerate(_iu_lines) if l.strip().startswith("def check_torch_load_is_safe("))
    _indent = len(_iu_lines[_start]) - len(_iu_lines[_start].lstrip())
    _end = len(_iu_lines)
    for j in range(_start + 1, len(_iu_lines)):
        _l = _iu_lines[j]
        if _l.strip() and (not _l[0].isspace() or (len(_l) - len(_l.lstrip()) <= _indent)) and _l.strip().startswith("def "):
            _end = j
            break
    _iu_lines = (
        _iu_lines[:_start]
        + ['def check_torch_load_is_safe():\n', '    """Patched: disabled for offline kernel compat."""\n', "    pass\n", "\n"]
        + _iu_lines[_end:]
    )
    with open(_iu_path, "w") as f:
        f.writelines(_iu_lines)
    run(f"find {os.path.dirname(_transformers.__file__)}/ -name '__pycache__' -exec rm -rf {{}} + 2>/dev/null; true", timeout=30, check=False)
    print("[OK] patched transformers check_torch_load_is_safe")

# ── Step 2: model weights (Kaggle dataset xpabloli/echomimicv3-flash) ──────
import glob
# Kaggle mount convention drifts: kernels pushed via the API may see datasets
# at /kaggle/input/<slug> (classic) or /kaggle/input/datasets/<slug> (observed
# 2026-09, matches the /kaggle/input/datasets/xpabloli/... fallback v25 kept).
# Detect by content, not by path: walk /kaggle/input for the model dir.
MODEL_DIR_NAME = "Wan2.1-Fun-V1.1-1.3B-InP"
model_matches = glob.glob(f"/kaggle/input/**/{MODEL_DIR_NAME}", recursive=True)
if model_matches:
    # found = .../<dataset>/flash/Wan2.1-Fun-V1.1-1.3B-InP → dataset root is 2 up
    DATASET_DIR = os.path.dirname(os.path.dirname(model_matches[0]))
if not DATASET_DIR:
    print("[ERROR] model dataset echomimicv3-flash not found")
    try:
        print("[DEBUG] /kaggle/input contents:", os.listdir("/kaggle/input"))
    except Exception as e:
        print(f"[DEBUG] listing /kaggle/input failed: {e}")
    sys.exit(1)
BASE_MODEL_DIR = os.path.join(DATASET_DIR, "flash", "Wan2.1-Fun-V1.1-1.3B-InP")
WAV2VEC_DIR = os.path.join(DATASET_DIR, "flash", "chinese-wav2vec2-base")
FLASH_SAFETENSORS = os.path.join(BASE_MODEL_DIR, "diffusion_pytorch_model.safetensors")
print(f"Models: {DATASET_DIR}")

# ── Step 3: unit inputs (per-run dataset: portrait.jpg + driver wav) ───────
portrait_matches = glob.glob("/kaggle/input/**/portrait.jpg", recursive=True)
audio_matches = glob.glob(f"/kaggle/input/**/{UNIT_CONFIG['audio_file']}", recursive=True)
if not portrait_matches or not audio_matches:
    print(f"[ERROR] unit inputs missing — portrait={bool(portrait_matches)} audio={bool(audio_matches)}")
    sys.exit(1)
PORTRAIT = portrait_matches[0]
DRIVER_WAV = audio_matches[0]
unit_duration = wav_duration_seconds(DRIVER_WAV)
print(f"Portrait: {PORTRAIT}")
print(f"Driver wav: {DRIVER_WAV} ({unit_duration:.3f}s)")

# ── Step 4: patch infer_flash.py — seq offload + torch.compile (v52) ───────
# Upstream (2026-09) dropped all GPU_memory_mode branching and unconditionally
# does pipeline.to(device=device) → every module on GPU at once → CUDA OOM on
# T4 16GB (v52 first run died during pipeline.to). The v51 optimum documented
# in docs/research/echomimicv3-optimization-options.md is sequential offload +
# torch.compile(forward) — 14.3 min/segment on T4 (v43/v47/v49 proven).
# Patch BOTH pipeline.to call sites the v38-proven way; guard the compile so
# the second site does not recompile.
infer_flash_path = os.path.join(WORK_DIR, "echomimic_v3", "infer_flash.py")
with open(infer_flash_path, "r") as f:
    content = f.read()
if "torch.compile(pipeline.transformer.forward" not in content:
    OFFLOAD_BLOCK = (
        'if GPU_memory_mode == "sequential_cpu_offload":\n'
        "        pipeline.enable_sequential_cpu_offload()\n"
        '    elif GPU_memory_mode == "torch_compile":\n'
        "        pipeline.enable_sequential_cpu_offload()\n"
        '        if not getattr(pipeline.transformer, "_dh_torch_compiled", False):\n'
        "            pipeline.transformer.forward = torch.compile(pipeline.transformer.forward, dynamic=True)\n"
        '            pipeline.transformer._dh_torch_compiled = True\n'
        "    else:\n"
        "        pipeline.to(device=device)"
    )
    n_sites = content.count("pipeline.to(device=device)")
    if n_sites == 0:
        print("[ERROR] could not patch infer_flash.py: no pipeline.to(device=device) found")
        print("[DEBUG] file head:")
        print(content[:1500])
        sys.exit(1)
    content = content.replace("    pipeline.to(device=device)", "    " + OFFLOAD_BLOCK)
    with open(infer_flash_path, "w") as f:
        f.write(content)
    print(f"[OK] patched infer_flash.py: {n_sites} call site(s) → seq offload + torch.compile")
else:
    print("[OK] seq offload + torch.compile already present in infer_flash.py")

# ── Step 5: v51 inference ──────────────────────────────────────────────────
OUTPUT_DIR = os.path.join(WORK_DIR, "outputs", "unit")
os.makedirs(OUTPUT_DIR, exist_ok=True)
cmd = [
    sys.executable,
    "infer_flash.py",
    "--image_path", PORTRAIT,
    "--audio_path", DRIVER_WAV,
    "--prompt", "A person is speaking.",
    "--num_inference_steps", "8",
    "--audio_guidance_scale", "3.0",
    "--guidance_scale", "6.0",
    "--audio_scale", "1.0",
    "--neg_scale", "1.0",
    "--neg_steps", "0",
    "--seed", "43",
    "--weight_dtype", "float16",
    "--sample_size", "720", "720",
    "--fps", "25",
    "--shift", "5.0",
    "--video_length", "81",
    "--save_path", OUTPUT_DIR,
    "--config_path", "config/config.yaml",
    "--model_name", BASE_MODEL_DIR,
    "--transformer_path", FLASH_SAFETENSORS,
    "--wav2vec_model_dir", WAV2VEC_DIR,
    "--enable_teacache",
    "--teacache_threshold", "0.1",
    "--num_skip_start_steps", "5",
    "--GPU_memory_mode", "torch_compile",
    "--ulysses_degree", "1",
    "--ring_degree", "1",
]
tc_start = time.time()
result = subprocess.run(cmd, capture_output=True, text=True, timeout=14400, cwd=os.path.join(WORK_DIR, "echomimic_v3"))
tc_time = time.time() - tc_start
if result.returncode != 0:
    print(f"[ERROR] infer_flash.py failed with exit code {result.returncode}")
    if result.stderr:
        print("STDERR:", result.stderr[-4000:])
    sys.exit(1)
print(f"Inference done in {tc_time / 60:.1f} min")

# ── Step 6: trim to the wav's exact duration → /kaggle/working/<output> ────
videos = [f for f in os.listdir(OUTPUT_DIR) if f.endswith(".mp4")] if os.path.exists(OUTPUT_DIR) else []
if not videos:
    print("[ERROR] no output mp4 produced")
    sys.exit(1)
raw_video = os.path.join(OUTPUT_DIR, videos[0])
final_video = os.path.join(WORK_DIR, UNIT_CONFIG["output_file"])
# 81 frames @25fps = 3.24s regardless of the unit's true length; trim to the
# driver wav duration so concatenated units stay lip-synced (av is re-encoded
# once more at concat time anyway).
run(
    f'ffmpeg -y -i "{raw_video}" -t {unit_duration:.3f} '
    f'-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -r 25 -an "{final_video}"',
    timeout=300,
)
size_mb = os.path.getsize(final_video) / 1024 / 1024
print(f"[OK] {UNIT_CONFIG['output_file']} ({size_mb:.1f} MB, trimmed to {unit_duration:.3f}s)")

# Keep the kernel output tiny: the raw 720x720 inference mp4 (~150MB) would
# make the harvest download blow past the orchestrator's timeout. The trimmed
# unit mp4 + debug log are all the orchestrator needs.
shutil.rmtree(OUTPUT_DIR, ignore_errors=True)

total_time = time.time() - total_start
print(f"Unit complete in {total_time / 60:.1f} min")
