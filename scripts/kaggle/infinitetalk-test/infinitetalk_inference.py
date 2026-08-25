"""
InfiniteTalk v9: Kaggle T4 GPU + FP8 quantization + low VRAM mode

Key changes from v8:
- Use --quant fp8 (NOT int8): T5 only has fp8 quantized weights (t5_fp8.safetensors)
  t5_int8.safetensors does NOT exist in HF repo → int8 mode would crash at T5 loading
- Skip LoRA download: quant mode bypasses LoRA (code: `if lora_dir is not None and quant is None`)
- Fix hf download: use file positional args, NOT --include + filenames mix
  (v8 bug: --include 'config.json' filtered out other positional file args → config.json MISSING)
- pip install without -q: keep output flowing (avoids WebSocket timeout on Colab)

NOTE: Kaggle /kaggle/working has ~20GB disk. Total model size ~42GB.
      This script requires a Kaggle Dataset with pre-downloaded models,
      OR run on Colab where /content has ~70-100GB disk space.
"""

import os
import sys
import subprocess
import time
import shutil
import json
import atexit
import traceback

DEBUG_LOG = "/kaggle/working/debug_log.txt"
WORK_DIR = "/kaggle/working"

# Write a startup marker immediately so we know the script at least started
with open(DEBUG_LOG, "w") as f:
    f.write("SCRIPT STARTED\n")
    f.flush()
    os.fsync(f.fileno())

_orig_print = print

def print(*args, **kwargs):
    _orig_print(*args, **kwargs)
    sys.stdout.flush()
    try:
        with open(DEBUG_LOG, "a") as f:
            kwargs.pop('file', None)
            _orig_print(*args, file=f, **kwargs)
            f.flush()
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

# Register atexit to copy debug_log to InfiniteTalk dir for download
def _copy_debug_on_exit():
    try:
        shutil.copy(DEBUG_LOG, os.path.join(WORK_DIR, "InfiniteTalk", "debug_log.txt"))
    except:
        pass

atexit.register(_copy_debug_on_exit)

# Also set a custom excepthook to catch fatal errors
def _excepthook(exc_type, exc_value, exc_tb):
    error_msg = f"\n\nFATAL ERROR:\n{''.join(traceback.format_exception(exc_type, exc_value, exc_tb))}"
    _orig_print(error_msg)
    try:
        with open(DEBUG_LOG, "a") as f:
            f.write(error_msg)
    except:
        pass
    _copy_debug_on_exit()

sys.excepthook = _excepthook

print("=" * 70)
print("InfiniteTalk Inference on Kaggle T4 GPU (v9)")
print("=" * 70)
print("FP8 quantization + low VRAM mode + 480P + TeaCache")
print("  Key fixes: --quant fp8 (not int8), skip LoRA, fix hf download")
print("  Uses SDPA attention (no flash_attn on T4, no xfuser)")
print("  All models downloaded from HuggingFace in-kernel")

total_start = time.time()

# Step 0: Check GPU
print("\n--- Step 0: GPU Check ---")
run("nvidia-smi", timeout=30, check=False)

import torch
gpu_name = torch.cuda.get_device_properties(0).name
gpu_total_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
print(f"\nGPU: {gpu_name}")
print(f"VRAM: {gpu_total_mem:.1f} GB")
print(f"CUDA: {torch.version.cuda}")
print(f"PyTorch: {torch.__version__}")

# Check if bfloat16 is supported (T4 does NOT support bf16)
supports_bf16 = torch.cuda.is_bf16_supported()
print(f"bf16 supported: {supports_bf16}")
if not supports_bf16:
    print("  T4 (sm_75) does NOT support bfloat16. Will use float16.")

# Step 1: Set up environment
print("\n--- Step 1: Environment Setup ---")
# Enable HF transfer for faster downloads
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Step 2: Clone InfiniteTalk repo
print("\n--- Step 2: Clone InfiniteTalk ---")
os.chdir(WORK_DIR)
if not os.path.exists("InfiniteTalk"):
    run("git clone https://github.com/MeiGen-AI/InfiniteTalk.git", timeout=120)
os.chdir("InfiniteTalk")
print(f"Working dir: {os.getcwd()}")

# Check repo structure
run("ls -la", timeout=10, check=False)
run("ls -la wan/", timeout=10, check=False)
run("ls -la examples/", timeout=10, check=False)

# Step 3: Install dependencies
print("\n--- Step 3: Install Dependencies ---")

# Core dependencies from requirements.txt (adapted for T4)
# Skip flash_attn (T4 sm_75 < sm_80 required by flash_attn)
# Skip xformers (will use SDPA fallback instead)
# NO -q flag: keep output flowing to avoid WebSocket/Colab timeout
run(f"{sys.executable} -m pip install 'opencv-python' 'diffusers>=0.31.0' "
    f"'transformers>=4.49.0' 'tokenizers>=0.20.3' 'accelerate>=1.1.1' "
    f"tqdm imageio easydict ftfy dashscope imageio-ffmpeg scikit-image "
    f"loguru pyloudnorm scenedetect 'moviepy==1.0.3' decord 'numpy>=1.23.5,<2'", timeout=600)

# Install optimum-quanto for FP8/INT8 quantization support
run(f"{sys.executable} -m pip install 'optimum-quanto==0.2.6'", timeout=300, check=False)

# Install hf_transfer for fast downloads
run(f"{sys.executable} -m pip install hf_transfer huggingface_hub", timeout=120)

# Install kokoro (for KPipeline used in TTS mode, but also imported at top level)
run(f"{sys.executable} -m pip install 'misaki[en]' kokoro", timeout=300, check=False)

# Install remaining deps
run(f"{sys.executable} -m pip install einops safetensors timm albumentations "
    f"SentencePiece omegaconf soundfile librosa", timeout=300)

# Step 3b: Patch attention.py to remove xfuser dependency
# xfuser import HANGS on single-GPU (tries to init distributed communication)
# We must patch BEFORE any code tries to import from wan.modules.attention
print("\n--- Step 3b: Patch attention.py to remove xfuser dependency ---")
attn_path = os.path.join(WORK_DIR, "InfiniteTalk", "wan", "modules", "attention.py")
if os.path.exists(attn_path):
    with open(attn_path, "r") as f:
        content = f.read()
    old_import = """from xfuser.core.distributed import (
    get_sequence_parallel_rank,
    get_sequence_parallel_world_size,
    get_sp_group,
)"""
    new_import = """# PATCHED: xfuser not available, using dummy functions for single-GPU
def get_sequence_parallel_rank():
    return 0
def get_sequence_parallel_world_size():
    return 1
def get_sp_group():
    return None
"""
    if old_import in content:
        content = content.replace(old_import, new_import)
        with open(attn_path, "w") as f:
            f.write(content)
        print("  [OK] Patched attention.py to remove xfuser dependency")
    else:
        # Try to find and show the actual xfuser import line
        print("  [WARNING] Could not find xfuser import pattern. Searching for xfuser references...")
        for i, line in enumerate(content.split('\n')):
            if 'xfuser' in line.lower():
                print(f"    Line {i+1}: {line}")
        # Just do a brute-force replace of any xfuser import
        import re
        content = re.sub(
            r'from xfuser\.[^\n]+\n(?:\s+\w+[,\n]*)+\)',
            new_import,
            content
        )
        with open(attn_path, "w") as f:
            f.write(content)
        print("  [OK] Applied brute-force xfuser removal patch")
else:
    print(f"  [ERROR] attention.py not found at {attn_path}")

# Also check generate_infinitetalk.py for xfuser imports
gen_path = os.path.join(WORK_DIR, "InfiniteTalk", "generate_infinitetalk.py")
if os.path.exists(gen_path):
    with open(gen_path, "r") as f:
        gen_content = f.read()
    if "xfuser" in gen_content:
        print("  Found xfuser references in generate_infinitetalk.py, patching...")
        # Find and comment out any xfuser import lines
        lines = gen_content.split('\n')
        new_lines = []
        in_xfuser_block = False
        for line in lines:
            if 'from xfuser' in line and not line.strip().startswith('#'):
                in_xfuser_block = True
                # Check if it's a multi-line import (has opening paren without closing)
                if '(' in line and ')' not in line:
                    new_lines.append('# ' + line)
                    continue
                else:
                    new_lines.append('# ' + line)
                    in_xfuser_block = False
                    continue
            if in_xfuser_block:
                if ')' in line:
                    in_xfuser_block = False
                new_lines.append('# ' + line)
                continue
            new_lines.append(line)
        gen_content = '\n'.join(new_lines)
        with open(gen_path, "w") as f:
            f.write(gen_content)
        print("  [OK] Patched generate_infinitetalk.py to comment out xfuser imports")

# Patch ALL remaining files that import xfuser
print("\n  Patching all remaining files with xfuser imports...")
import glob as _glob
for pyfile in _glob.glob("wan/**/*.py", recursive=True):
    fpath = os.path.join(WORK_DIR, "InfiniteTalk", pyfile) if not pyfile.startswith("/") else pyfile
    if not os.path.exists(fpath):
        fpath = pyfile
    if not os.path.exists(fpath):
        continue
    with open(fpath, "r") as f:
        c = f.read()
    if 'from xfuser' in c or 'import xfuser' in c:
        # Replace all xfuser import lines with dummy functions
        lines = c.split('\n')
        new_lines = []
        in_block = False
        for line in lines:
            if 'from xfuser' in line and not line.strip().startswith('#'):
                if '(' in line and ')' not in line:
                    # Multi-line import - start of block
                    in_block = True
                    new_lines.append('# PATCHED: ' + line)
                    continue
                else:
                    new_lines.append('# PATCHED: ' + line)
                    continue
            if in_block:
                if ')' in line:
                    in_block = False
                new_lines.append('# PATCHED: ' + line)
                continue
            new_lines.append(line)
        c = '\n'.join(new_lines)
        with open(fpath, "w") as f:
            f.write(c)
        print(f"    [OK] Patched {pyfile}")

# Verify key imports (without xfuser) - use 120s timeout for torch import
print("\n--- Verifying imports ---")
run(f"{sys.executable} -c 'import torch; import diffusers; import transformers; print(\"imports OK\")'", timeout=120, check=False)

# Step 4: Download models from HuggingFace
print("\n--- Step 4: Download Models from HuggingFace ---")
WEIGHTS_DIR = os.path.join(WORK_DIR, "weights")
os.makedirs(WEIGHTS_DIR, exist_ok=True)

# 4a: Download Wan2.1-I2V-14B-480P base model (selective — skip 70GB DiT shards for FP8 mode)
# FIX: Use positional file args + --include for glob patterns only (v8 bug: --include filtered out positional args)
WAN_DIR = os.path.join(WEIGHTS_DIR, "Wan2.1-I2V-14B-480P")
if not os.path.exists(os.path.join(WAN_DIR, "config.json")):
    print("\n  Downloading Wan2.1-I2V-14B-480P (selective, ~16GB — skip DiT shards for FP8 mode)...")
    t0 = time.time()
    # FP8 mode uses quantized DiT from InfiniteTalk repo, so skip 7 DiT shards (~70GB)
    # Only need: VAE, T5, CLIP, tokenizer, config files
    # Use positional file args for specific files, --include for glob patterns (tokenizer dirs)
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download Wan-AI/Wan2.1-I2V-14B-480P "
        f"config.json "
        f"Wan2.1_VAE.pth "
        f"models_t5_umt5-xxl-enc-bf16.pth "
        f"models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth "
        f"diffusion_pytorch_model.safetensors.index.json "
        f"--include 'google/umt5-xxl/*' 'xlm-roberta-large/*' "
        f"--local-dir {WAN_DIR}", timeout=1800)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] Wan2.1 base model already exists at {WAN_DIR}")

# Verify base model files (skip DiT shards in FP8 mode)
print("\n  Verifying base model files:")
expected_files = [
    "Wan2.1_VAE.pth",
    "config.json",
    "models_t5_umt5-xxl-enc-bf16.pth",
    "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth",
]
for f in expected_files:
    path = os.path.join(WAN_DIR, f)
    if os.path.exists(path):
        print(f"    OK {f} ({os.path.getsize(path)/1024**3:.2f} GB)")
    else:
        print(f"    MISSING: {f}")

# 4b: Download chinese-wav2vec2-base (~350MB)
WAV2VEC_DIR = os.path.join(WEIGHTS_DIR, "chinese-wav2vec2-base")
if not os.path.exists(os.path.join(WAV2VEC_DIR, "pytorch_model.bin")):
    print("\n  Downloading chinese-wav2vec2-base (~350MB)...")
    t0 = time.time()
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download TencentGameMate/chinese-wav2vec2-base "
        f"--local-dir {WAV2VEC_DIR}", timeout=300)
    # Also download the model.safetensors revision
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download TencentGameMate/chinese-wav2vec2-base "
        f"model.safetensors --revision refs/pr/1 --local-dir {WAV2VEC_DIR}", timeout=300, check=False)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] chinese-wav2vec2-base already exists at {WAV2VEC_DIR}")

# 4c: Download InfiniteTalk FP8 quantized model
# NOTE: Use FP8 (not INT8) because T5 quantized weights only exist as t5_fp8.safetensors
#   T5 code: load_file(os.path.join(quant_dir, f"t5_{quant}.safetensors"))
#   quant='int8' → t5_int8.safetensors → DOES NOT EXIST → crash
#   quant='fp8'  → t5_fp8.safetensors   → EXISTS ✅
INFINITETALK_QUANT_DIR = os.path.join(WEIGHTS_DIR, "InfiniteTalk", "quant_models")
FP8_FILE = os.path.join(INFINITETALK_QUANT_DIR, "infinitetalk_single_fp8.safetensors")
if not os.path.exists(FP8_FILE):
    print("\n  Downloading InfiniteTalk FP8 quantized model (~19.5GB)...")
    t0 = time.time()
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download MeiGen-AI/InfiniteTalk "
        f"quant_models/infinitetalk_single_fp8.safetensors "
        f"quant_models/infinitetalk_single_fp8.json "
        f"--local-dir {os.path.join(WEIGHTS_DIR, 'InfiniteTalk')}", timeout=1200)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] InfiniteTalk FP8 quantized model exists ({os.path.getsize(FP8_FILE)/1024**3:.2f} GB)")

# SKIP LoRA download — not needed in FP8 quant mode (saves 9.9GB)
# Pipeline code: `if lora_dir is not None and quant is None:` → LoRA only loads when quant is None
print("\n  [SKIP] LoRA download — not needed in FP8 quant mode (saves 9.9GB)")

# Download T5 FP8 quantized (6.7GB) - required when --quant fp8
T5_FP8_FILE = os.path.join(INFINITETALK_QUANT_DIR, "t5_fp8.safetensors")
if not os.path.exists(T5_FP8_FILE):
    print("\n  Downloading T5 FP8 quantized (~6.7GB)...")
    t0 = time.time()
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download MeiGen-AI/InfiniteTalk "
        f"quant_models/t5_fp8.safetensors quant_models/t5_map_fp8.json "
        f"--local-dir {os.path.join(WEIGHTS_DIR, 'InfiniteTalk')}", timeout=600)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] T5 FP8 exists ({os.path.getsize(T5_FP8_FILE)/1024**3:.2f} GB)")

# Print total download time and disk usage
print(f"\n  Total elapsed: {(time.time()-total_start)/60:.1f} min")
run("df -h /kaggle/working", timeout=10, check=False)
run(f"du -sh {WEIGHTS_DIR}", timeout=30, check=False)

# Step 5: Prepare input data
print("\n--- Step 5: Prepare Input Data ---")
INPUT_DIR = None
for candidate in [
    "/kaggle/input/infinitetalk-test-inputs",
    "/kaggle/input/xpabloli/infinitetalk-test-inputs",
    "/kaggle/input/datasets/infinitetalk-test-inputs",
    "/kaggle/input/datasets/xpabloli/infinitetalk-test-inputs",
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
    for fname in ["portrait.jpg", "audio.wav"]:
        src = os.path.join(INPUT_DIR, fname)
        dst = os.path.join(WORK_DIR, "InfiniteTalk", "examples", fname)
        if os.path.exists(src):
            shutil.copy(src, dst)
            print(f"  Copied: {fname} ({os.path.getsize(dst) / 1024:.1f} KB)")
else:
    print("ERROR: Input dataset not found!")
    sys.exit(1)

# Step 6: Create input JSON for image-to-video mode
print("\n--- Step 6: Create Input JSON ---")

# Detailed prompt for image-to-video mode
# InfiniteTalk uses T5 text conditioning, so prompt quality matters
# Based on the Weixin photo: Chinese man, professional appearance
PROMPT = (
    "A Chinese man with short black hair and a clean-shaven face is speaking "
    "directly to the camera in a professional setting. He wears a dark suit. "
    "His expression is natural and engaging as he talks, with subtle head "
    "movements and natural facial expressions. The background is neutral and "
    "well-lit. A medium close-up shot captures his upper body and face."
)

input_json = {
    "prompt": PROMPT,
    "cond_video": "examples/portrait.jpg",  # image-to-video: use image as cond
    "cond_audio": {
        "person1": "examples/audio.wav"
    }
}

json_path = os.path.join(WORK_DIR, "InfiniteTalk", "examples", "weixin_input.json")
with open(json_path, "w") as f:
    json.dump(input_json, f, indent=4)
print(f"  Created input JSON: {json_path}")
print(f"  Prompt: {PROMPT[:80]}...")

# Step 7: Run InfiniteTalk inference
print("\n--- Step 7: Run InfiniteTalk Inference ---")
print("  Mode: FP8 quantization + low VRAM + 480P + TeaCache")
print(f"  GPU: {gpu_name} ({gpu_total_mem:.1f} GB VRAM)")
print("  NOTE: --quant fp8 (NOT int8, because t5_int8.safetensors doesn't exist)")
print("  NOTE: No --infinitetalk_dir (not needed in quant mode, saves LoRA load)")

# Build inference command
# Key parameters:
# --quant fp8: use FP8 quantized model (NOT int8 — T5 int8 doesn't exist)
# --quant_dir: path to FP8 quantized weights file
# --num_persistent_param_in_dit 0: low VRAM mode (all DiT params offloaded)
# --size infinitetalk-480: 640x640 resolution
# --sample_steps 40: standard 40 steps
# --mode streaming: long video generation (handles >81 frames)
# --use_teacache: TeaCache acceleration
# --teacache_thresh 0.2: default threshold
# --motion_frame 9: driven frame length for streaming mode
# --sample_text_guide_scale 5.0: text CFG (no LoRA, optimal=5)
# --sample_audio_guide_scale 4.0: audio CFG (no LoRA, optimal=4)

cmd = (
    f"cd {WORK_DIR}/InfiniteTalk && "
    f"PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True "
    f"{sys.executable} generate_infinitetalk.py "
    f"--ckpt_dir {WAN_DIR} "
    f"--wav2vec_dir {WAV2VEC_DIR} "
    f"--quant_dir {FP8_FILE} "
    f"--quant fp8 "
    f"--input_json {json_path} "
    f"--size infinitetalk-480 "
    f"--sample_steps 40 "
    f"--mode streaming "
    f"--motion_frame 9 "
    f"--num_persistent_param_in_dit 0 "
    f"--use_teacache "
    f"--teacache_thresh 0.2 "
    f"--sample_text_guide_scale 5.0 "
    f"--sample_audio_guide_scale 4.0 "
    f"--save_file infinitetalk_res_fp8"
)

print(f"\n  Command: {cmd[:300]}...")
t_inference = time.time()

# Run with 8 hour timeout (Kaggle 9h limit minus setup time)
result = run(cmd, timeout=28800, check=False)

inference_time = (time.time() - t_inference) / 60
print(f"\n  Inference time: {inference_time:.1f} min")

# Step 8: Check output
print("\n--- Step 8: Check Output ---")
output_files = []
for ext in [".mp4", ".avi", ".mov"]:
    output_files.extend(
        run(f"find {WORK_DIR}/InfiniteTalk -name 'infinitetalk_res_fp8*' -o -name 'infinitetalk_res*' 2>/dev/null",
            timeout=10, check=False).stdout.strip().split('\n')
    )

output_dir = os.path.join(WORK_DIR, "InfiniteTalk")
run(f"ls -la {output_dir}/*.mp4 2>/dev/null || echo 'No mp4 found in root'", timeout=10, check=False)
run(f"find {output_dir} -name '*.mp4' -exec ls -la {{}} \\;", timeout=10, check=False)
run(f"find {WORK_DIR} -name '*.mp4' -exec ls -la {{}} \\; 2>/dev/null | head -20", timeout=10, check=False)

# Copy output to /kaggle/working/ for easy download
for f in output_files:
    if f and os.path.exists(f) and f.endswith('.mp4'):
        dst = os.path.join(WORK_DIR, os.path.basename(f))
        if f != dst:
            shutil.copy(f, dst)
            print(f"  Copied output: {dst} ({os.path.getsize(dst)/1024:.1f} KB)")

total_time = (time.time() - total_start) / 60
print(f"\n{'='*70}")
print(f"Total time: {total_time:.1f} min")
print(f"Inference time: {inference_time:.1f} min")
print(f"{'='*70}")

# atexit will copy debug_log to InfiniteTalk dir for download
