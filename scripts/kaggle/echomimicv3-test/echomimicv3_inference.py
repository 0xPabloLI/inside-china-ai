"""
EchoMimicV3 v38: T4 GPU + app_mm params + Weixin & Demo photos + max effort
v38: Same as v34 but on T4 (not P100) - should be faster with Tensor Cores
  A: Weixin half-body + 20 steps (max effort talking body) + app_mm params
  B: Official demo_ch_man_01 + 20 steps + app_mm params + official 1941-char prompt
  C: Weixin half-body + 8 steps (Flash speed) + app_mm params (speed/quality comparison)

Key: patches infer_flash.py to use sequential_cpu_offload (same as v34)
"""

import os
import sys
import subprocess
import time
import shutil

DEBUG_LOG = "/kaggle/working/debug_log.txt"
_orig_print = print

def print(*args, **kwargs):
    _orig_print(*args, **kwargs)
    sys.stdout.flush()
    try:
        with open(DEBUG_LOG, "a") as f:
            kwargs.pop('file', None)
            _orig_print(*args, file=f, **kwargs)
    except:
        pass

def run(cmd, timeout=600, check=True):
    print(f"\n>>> {cmd[:200]}{'...' if len(cmd) > 200 else ''}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    if result.stdout:
        print(result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout)
    if result.stderr:
        stderr_lines = [l for l in result.stderr.split('\n')
                       if l.strip() and 'it/s]' not in l and 's/it]' not in l and not l.startswith('  Downloading')]
        if stderr_lines:
            print("STDERR:", '\n'.join(stderr_lines[-50:]))
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result

print("=" * 70)
print("EchoMimicV3 Flash Inference on Kaggle GPU (v38)")
print("=" * 70)
print("v38: T4 GPU + app_mm params + Weixin & Demo photos + max effort")
print("  A: Weixin half-body + 20 steps (max effort) + app_mm params")
print("  B: Official demo + 20 steps + app_mm params + official prompt")
print("  C: Weixin half-body + 8 steps (Flash speed) + app_mm params")
print("  Same approach as v34 (patch infer_flash.py + subprocess)")
print("  T4 has Tensor Cores, should be faster than P100")

total_start = time.time()

# Step 0: Check GPU
print("\n--- Step 0: GPU Check ---")
run("nvidia-smi", timeout=30, check=False)

import torch
gpu_name = torch.cuda.get_device_properties(0).name
gpu_major = torch.cuda.get_device_capability(0)[0]
is_p100 = "P100" in gpu_name
is_t4 = "T4" in gpu_name
print(f"\nGPU: {gpu_name}, compute capability: {gpu_major}.x")

if is_p100:
    print("P100 detected: installing PyTorch 2.4.1+cu121 (sm_60 compatible)")
    run(f"{sys.executable} -m pip uninstall -y torch torchvision torchaudio", timeout=120, check=False)
    run(f"{sys.executable} -m pip install torch==2.4.1 torchvision==0.19.1 --index-url https://download.pytorch.org/whl/cu121", timeout=600)
else:
    print(f"T4 or newer detected: using default PyTorch {torch.__version__}")

print(f"\nPyTorch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
gpu = torch.cuda.get_device_properties(0)
print(f"GPU: {gpu.name}")
print(f"Memory: {gpu.total_memory / 1024**3:.1f} GB")
print(f"Compute capability: {gpu.major}.{gpu.minor}")

# Step 2: Clone EchoMimicV3
print("\n--- Step 2: Clone EchoMimicV3 ---")
WORK_DIR = "/kaggle/working"
os.chdir(WORK_DIR)
if not os.path.exists("echomimic_v3"):
    run("git clone https://github.com/antgroup/echomimic_v3.git", timeout=120)
os.chdir("echomimic_v3")
print(f"Working dir: {os.getcwd()}")

# Step 3: Install dependencies
print("\n--- Step 3: Install Dependencies ---")
run(f"{sys.executable} -m pip install --no-deps "
    f"Pillow einops safetensors timm decord datasets numpy scikit-image opencv-python "
    f"omegaconf SentencePiece albumentations imageio ftfy func_timeout onnxruntime "
    f"moviepy==2.2.1 librosa pyloudnorm accelerate "
    f"tomesd torchdiffeq torchsde retina-face==0.0.17 mmgp", timeout=600)
run(f"{sys.executable} -m pip install --no-deps huggingface-hub regex requests filelock tqdm "
    f"pyyaml packaging pydantic fsspec protobuf sympy multipledispatch yarl", timeout=300)

if is_p100:
    run(f"{sys.executable} -m pip install torch==2.4.1 torchvision==0.19.1 --index-url https://download.pytorch.org/whl/cu121 --force-reinstall --no-deps", timeout=600)

import diffusers
import transformers
print(f"\ndiffusers version: {diffusers.__version__}")
print(f"torch version: {torch.__version__}")
print(f"transformers version: {transformers.__version__}")

if is_p100:
    assert torch.__version__.startswith("2.4.1"), f"torch version is {torch.__version__}, expected 2.4.1 for P100!"

    CUSTOM_DIR = "/kaggle/working/diffusers0310"
    os.makedirs(CUSTOM_DIR, exist_ok=True)
    run(f"{sys.executable} -m pip uninstall -y diffusers", timeout=60, check=False)
    run(f"{sys.executable} -m pip install --no-deps --target={CUSTOM_DIR} diffusers==0.31.0", timeout=120)
    os.environ["PYTHONPATH"] = f"{CUSTOM_DIR}:{os.environ.get('PYTHONPATH', '')}"
    os.environ["PYTHONNOUSERSITE"] = "1"
    sys.path.insert(0, CUSTOM_DIR)
    for mod_name in list(sys.modules.keys()):
        if 'diffusers' in mod_name:
            del sys.modules[mod_name]
    import diffusers
    print(f"  diffusers version: {diffusers.__version__}")
    assert diffusers.__version__ == "0.31.0", f"Expected 0.31.0, got {diffusers.__version__}!"

    diffusers_dir = os.path.dirname(diffusers.__file__)
    plu_path = os.path.join(diffusers_dir, "pipelines", "pipeline_loading_utils.py")
    if os.path.exists(plu_path):
        with open(plu_path, "r") as f:
            content = f.read()
        if "from transformers.utils import FLAX_WEIGHTS_NAME" in content and "TRANSFORMERS_FLAX_WEIGHTS_NAME = 'flax_model.msgpack'" not in content:
            lines = content.split("\n")
            for line in lines:
                if "from transformers.utils import FLAX_WEIGHTS_NAME as TRANSFORMERS_FLAX_WEIGHTS_NAME" in line:
                    indent = len(line) - len(line.lstrip())
                    old_line = line
                    new_block = (
                        f"{' ' * indent}try:\n"
                        f"{' ' * (indent + 4)}from transformers.utils import FLAX_WEIGHTS_NAME as TRANSFORMERS_FLAX_WEIGHTS_NAME\n"
                        f"{' ' * indent}except ImportError:\n"
                        f"{' ' * (indent + 4)}TRANSFORMERS_FLAX_WEIGHTS_NAME = 'flax_model.msgpack'"
                    )
                    content = content.replace(old_line, new_block)
                    break
            with open(plu_path, "w") as f:
                f.write(content)
            print(f"  [OK] Patched FLAX_WEIGHTS_NAME")

    for mod_name in list(sys.modules.keys()):
        if 'diffusers' in mod_name:
            del sys.modules[mod_name]
    import diffusers
    import diffusers.models
    import diffusers.models.transformers
    print(f"  [OK] diffusers.models.transformers imported successfully")

    run(f"rm -rf /usr/local/lib/python3.12/dist-packages/diffusers/", timeout=30, check=False)
    run(f"rm -rf /usr/local/lib/python3.12/site-packages/diffusers/", timeout=30, check=False)

    transformers_dir = os.path.dirname(transformers.__file__)
    iu_path = os.path.join(transformers_dir, "utils", "import_utils.py")
    if os.path.exists(iu_path):
        with open(iu_path, "r") as f:
            lines = f.readlines()
        func_start = None
        func_end = None
        for i, line in enumerate(lines):
            if line.strip().startswith("def check_torch_load_is_safe("):
                func_start = i
                func_indent = len(line) - len(line.lstrip())
                for j in range(i + 1, len(lines)):
                    next_line = lines[j]
                    if next_line.strip() and not next_line[0].isspace() and next_line.strip().startswith("def "):
                        func_end = j
                        break
                    if len(next_line) - len(next_line.lstrip()) <= func_indent and next_line.strip().startswith("def "):
                        func_end = j
                        break
                if func_end is None:
                    func_end = len(lines)
                break
        if func_start is not None:
            new_lines = list(lines)
            replacement = [
                "def check_torch_load_is_safe():\n",
                "    \"\"\"Check that `torch.load` is safe to use.\"\"\"\n",
                "    # PATCHED v22: Disabled torch version check for P100 compatibility (PyTorch 2.4.1)\n",
                "    pass\n",
                "\n",
            ]
            new_lines = new_lines[:func_start] + replacement + new_lines[func_end:]
            with open(iu_path, "w") as f:
                f.writelines(new_lines)
            print(f"  [OK] Patched check_torch_load_is_safe")
    run(f"find {transformers_dir}/ -name '__pycache__' -exec rm -rf {{}} + 2>/dev/null; true", timeout=30, check=False)
else:
    CUSTOM_DIR = None

# Step 4: Load model weights from Kaggle Dataset
print("\n--- Step 4: Load Model Weights from Dataset ---")
DATASET_DIR = None
for candidate in [
    "/kaggle/input/echomimicv3-flash/echomimicv3-models",
    "/kaggle/input/echomimicv3-flash",
]:
    if os.path.exists(os.path.join(candidate, "flash", "Wan2.1-Fun-V1.1-1.3B-InP")):
        DATASET_DIR = candidate
        break

if DATASET_DIR:
    MODELS_DIR = DATASET_DIR
    BASE_MODEL_DIR = os.path.join(MODELS_DIR, "flash", "Wan2.1-Fun-V1.1-1.3B-InP")
    WAV2VEC_DIR = os.path.join(MODELS_DIR, "flash", "chinese-wav2vec2-base")
    FLASH_SAFETENSORS = os.path.join(BASE_MODEL_DIR, "diffusion_pytorch_model.safetensors")
    print(f"  [OK] Models loaded from Dataset: {DATASET_DIR}")
    for check_file in [
        os.path.join(BASE_MODEL_DIR, "Wan2.1_VAE.pth"),
        os.path.join(BASE_MODEL_DIR, "models_t5_umt5-xxl-enc-bf16.pth"),
        os.path.join(BASE_MODEL_DIR, "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth"),
        FLASH_SAFETENSORS,
        os.path.join(WAV2VEC_DIR, "pytorch_model.bin"),
    ]:
        if os.path.exists(check_file):
            print(f"    OK {os.path.basename(check_file)} ({os.path.getsize(check_file)/1024**2:.1f} MB)")
        else:
            print(f"    MISSING: {check_file}")
else:
    print("  [ERROR] Dataset not found!")
    sys.exit(1)

# Step 5: Copy input data
print("\n--- Step 5: Copy Input Data ---")
INPUT_DIR = None
for candidate in [
    "/kaggle/input/echomimicv3-test-inputs",
    "/kaggle/input/xpabloli/echomimicv3-test-inputs",
    "/kaggle/input/datasets/echomimicv3-test-inputs",
    "/kaggle/input/datasets/xpabloli/echomimicv3-test-inputs",
]:
    if os.path.exists(candidate):
        INPUT_DIR = candidate
        break
if not INPUT_DIR:
    import glob
    matches = glob.glob("/kaggle/input/**/portrait.jpg", recursive=True)
    if matches:
        INPUT_DIR = os.path.dirname(matches[0])

if INPUT_DIR and os.path.exists(INPUT_DIR):
    for fname in ["portrait.jpg", "weixin-portrait.jpg", "audio.mp3", "audio-10s.mp3"]:
        src = os.path.join(INPUT_DIR, fname)
        dst = os.path.join(WORK_DIR, fname)
        if os.path.exists(src):
            shutil.copy(src, dst)
            print(f"  Copied: {fname} ({os.path.getsize(dst) / 1024:.1f} KB)")
else:
    print("ERROR: Input dataset not found!")
    sys.exit(1)

# Copy official demo assets
print("\n--- v38: Copy Official Demo Assets ---")
DEMO_BASE = os.path.join(WORK_DIR, "echomimic_v3", "datasets", "echomimicv3_demos")
demo_name = "demo_ch_man_01"
for fname, label in [(f"{demo_name}.jpeg", "demo image"), (f"{demo_name}.WAV", "demo audio"), (f"{demo_name}.txt", "demo prompt")]:
    subdir = "imgs" if fname.endswith(".jpeg") or fname.endswith(".png") else ("audios" if fname.endswith(".WAV") else "prompts")
    src = os.path.join(DEMO_BASE, subdir, fname)
    dst = os.path.join(WORK_DIR, fname if not fname.endswith(".txt") else f"{demo_name}_prompt.txt")
    if os.path.exists(src):
        shutil.copy(src, dst)
        print(f"  Copied {label}: {os.path.basename(dst)} ({os.path.getsize(dst) / 1024:.1f} KB)")
    else:
        print(f"  [WARNING] {label} not found: {src}")

# Read demo prompt
demo_prompt_text = "A person is speaking."
demo_prompt_path = os.path.join(WORK_DIR, f"{demo_name}_prompt.txt")
if os.path.exists(demo_prompt_path):
    with open(demo_prompt_path, "r") as f:
        demo_prompt_text = f.read().strip()
    print(f"  Official prompt length: {len(demo_prompt_text)} chars")

# Step 6: Patch infer_flash.py for CPU offload (same as v34)
print("\n--- v24: Patch infer_flash.py for CPU offload ---")
infer_flash_path = os.path.join(WORK_DIR, "echomimic_v3", "infer_flash.py")
print(f"  infer_flash path: {infer_flash_path}")
print(f"  File exists: {os.path.exists(infer_flash_path)}")

if os.path.exists(infer_flash_path):
    with open(infer_flash_path, "r") as f:
        content = f.read()

    occurrences = content.count("pipeline.to(device=device)")
    print(f"  Found {occurrences} occurrence(s) of pipeline.to(device=device)")

    if occurrences > 0:
        patched_content = content.replace(
            "pipeline.to(device=device)",
            "if os.environ.get('USE_CPU_OFFLOAD', '0') == '1': pipeline.enable_sequential_cpu_offload()\n    else: pipeline.to(device=device)"
        )
        with open(infer_flash_path, "w") as f:
            f.write(patched_content)
        print(f"  [OK] Replaced {occurrences} pipeline.to(device=device) with conditional CPU offload")
        print(f"  [OK] Verified: enable_sequential_cpu_offload present in infer_flash.py")

    try:
        result = run(f"cd {WORK_DIR}/echomimic_v3 && {sys.executable} -c 'import py_compile; py_compile.compile(\"infer_flash.py\", doraise=True); print(\"OK\")'", timeout=30, check=False)
        if "OK" in (result.stdout or ""):
            print(f"  [OK] infer_flash.py compiles successfully")
    except:
        pass

# Step 7: Run EchoMimicV3 Flash Inference (v38 A/B/C test)
print("\n--- Step 6: Run EchoMimicV3 Flash Inference (v38 A/B/C test) ---")
weight_dtype = "float16"
print(f"GPU: {gpu_name}, using weight_dtype: {weight_dtype}")

# app_mm.py optimal params (from source code Config class)
APP_MM_PARAMS = [
    "--sampler_name", "Flow_DPM++",
    "--guidance_scale", "4.5",
    "--audio_guidance_scale", "2.5",
    "--neg_scale", "1.5",
    "--neg_steps", "2",
    "--use_dynamic_cfg",
    "--use_dynamic_acfg",
    "--shift", "5.0",
    "--audio_scale", "1.0",
    "--seed", "43",
    "--enable_teacache",
    "--teacache_threshold", "0.1",
    "--num_skip_start_steps", "5",
    "--teacache_offload",
    "--GPU_memory_mode", "sequential_cpu_offload",
    "--weight_dtype", weight_dtype,
]

# Set env for CPU offload
env = os.environ.copy()
env["USE_CPU_OFFLOAD"] = "1"
env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
if CUSTOM_DIR:
    env["PYTHONPATH"] = f"{CUSTOM_DIR}:{env.get('PYTHONPATH', '')}"
    env["PYTHONNOUSERSITE"] = "1"

test_cases = [
    {
        "name": "A-weixin-20steps-appmm",
        "image": "/kaggle/working/weixin-portrait.jpg",
        "audio": "/kaggle/working/audio-10s.mp3",
        "prompt": "A person is speaking.",
        "steps": 20,
        "desc": "Weixin half-body + 20 steps (max effort)",
    },
    {
        "name": "B-demo-20steps-appmm",
        "image": "/kaggle/working/demo_ch_man_01.jpeg",
        "audio": "/kaggle/working/demo_ch_man_01.WAV",
        "prompt": demo_prompt_text,
        "steps": 20,
        "desc": "Official demo + 20 steps + official prompt",
    },
    {
        "name": "C-weixin-8steps-appmm",
        "image": "/kaggle/working/weixin-portrait.jpg",
        "audio": "/kaggle/working/audio-10s.mp3",
        "prompt": "A person is speaking.",
        "steps": 8,
        "desc": "Weixin half-body + 8 steps (Flash speed)",
    },
]

results = []
for tc in test_cases:
    print(f"\n{'='*60}")
    print(f"Test case: {tc['name']}")
    print(f"  {tc['desc']}")
    print(f"  Image: {tc['image']}")
    print(f"  Audio: {tc['audio']}")
    print(f"  Prompt: {tc['prompt'][:100]}{'...' if len(tc['prompt']) > 100 else ''}")
    print(f"  Steps: {tc['steps']}")
    print(f"  Params: guidance=4.5, audio_guidance=2.5, neg_scale=1.5, neg_steps=2, dynamic_cfg=True, dynamic_acfg=True, sampler=Flow_DPM++")
    print(f"{'='*60}")

    output_dir = os.path.join(WORK_DIR, "outputs", tc["name"])
    os.makedirs(output_dir, exist_ok=True)

    cmd = [
        sys.executable, "infer_flash.py",
        "--image_path", tc["image"],
        "--audio_path", tc["audio"],
        "--prompt", tc["prompt"],
        "--num_inference_steps", str(tc["steps"]),
        "--save_path", output_dir,
        "--config_path", "config/config.yaml",
        "--model_name", BASE_MODEL_DIR,
        "--transformer_path", FLASH_SAFETENSORS,
        "--wav2vec_model_dir", WAV2VEC_DIR,
        "--video_length", "81",
        "--fps", "25",
    ] + APP_MM_PARAMS

    cmd_str = " ".join(cmd[:15]) + "..."
    print(f"Inference command: {cmd_str}")

    tc_start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600, env=env, cwd=os.path.join(WORK_DIR, "echomimic_v3"))
    tc_time = time.time() - tc_start

    if result.stdout:
        stdout_lines = result.stdout.split('\n')
        for line in stdout_lines:
            if 'Inference time' in line or 'Output' in line or 'Processing' in line or 'Audio' in line or 'missing keys' in line or 'unexpected' in line:
                print(f"  {line.strip()}")
    if result.stderr:
        stderr_lines = [l for l in result.stderr.split('\n')
                       if l.strip() and 'it/s]' not in l and 's/it]' not in l and not l.startswith('  Downloading')]
        if stderr_lines:
            print("  STDERR:", '\n'.join(stderr_lines[-20:]))

    if result.returncode != 0:
        print(f"  Test case {tc['name']} FAILED with exit code {result.returncode}")
        results.append({"name": tc["name"], "status": "failed", "time": tc_time})
        continue

    # Find output video
    output_videos = [f for f in os.listdir(output_dir) if f.endswith('.mp4')] if os.path.exists(output_dir) else []
    if output_videos:
        src = os.path.join(output_dir, output_videos[0])
        dst = os.path.join(WORK_DIR, f"echomimicv3_{tc['name']}.mp4")
        shutil.copy(src, dst)
        file_size = os.path.getsize(dst) / 1024
        print(f"  ✅ Output video: {output_videos[0]} ({file_size:.1f} KB)")
        print(f"     Copied to: {os.path.basename(dst)}")
        results.append({"name": tc["name"], "status": "success", "time": tc_time, "size": file_size})
    else:
        print(f"  ❌ No output video found in {output_dir}")
        results.append({"name": tc["name"], "status": "no_output", "time": tc_time})

# Summary
print(f"\n{'='*70}")
print("v38 A/B/C Test Summary")
print(f"{'='*70}")
for r in results:
    if r["status"] == "success":
        print(f"  {r['name']}: ✅ echomimicv3_{r['name']}.mp4 ({r['size']:.1f} KB, {r['time']/60:.1f} min)")
    else:
        print(f"  {r['name']}: ❌ {r['status']}")

total_time = time.time() - total_start
print(f"\n{'='*70}")
print(f"Total time: {total_time:.1f}s ({total_time/60:.1f} min)")
print(f"{'='*70}")
