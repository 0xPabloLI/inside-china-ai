#!/usr/bin/env python3
"""
InfiniteTalk v2: Colab T4 GPU + FP8 quantization + low VRAM mode

Key changes from v1:
- Use --quant fp8 (NOT int8): T5 only has fp8 quantized weights (t5_fp8.safetensors)
  t5_int8.safetensors does NOT exist in HF repo → int8 mode would crash at T5 loading
- Skip LoRA download: quant mode bypasses LoRA (code: `if lora_dir is not None and quant is None`)
- Fix hf download: use file positional args, NOT --include + filenames mix
  (v8 bug: --include 'config.json' filtered out other positional file args → config.json MISSING)
- pip install without -q: keep WebSocket alive during long installs

Model files needed (total ~42GB, Colab /content has ~70-100GB):
  Base (Wan-AI/Wan2.1-I2V-14B-480P, skip 70GB DiT shards):
    - config.json (250B)
    - Wan2.1_VAE.pth (508MB)
    - models_t5_umt5-xxl-enc-bf16.pth (11.4GB)  ← still needed as fallback if quant T5 fails
    - models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth (4.77GB)
    - google/umt5-xxl/ (tokenizer)
    - xlm-roberta-large/ (tokenizer)
  InfiniteTalk FP8 (MeiGen-AI/InfiniteTalk):
    - quant_models/infinitetalk_single_fp8.safetensors (19.5GB)
    - quant_models/infinitetalk_single_fp8.json (49.3KB)
    - quant_models/t5_fp8.safetensors (6.73GB)  ← T5 quantized, used when --quant fp8
    - quant_models/t5_map_fp8.json (12.5KB)
  chinese-wav2vec2-base (TencentGameMate/chinese-wav2vec2-base, ~350MB)

Usage:
  # One-shot (uses InfiniteTalk's built-in example data):
  HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc run --gpu T4 --timeout 36000 \
    scripts/colab/infinitetalk-test/run_infinitetalk_colab.py

  # Persistent session (supports file upload):
  HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc new --gpu T4 --session infinitetalk --keep
  HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc upload --session infinitetalk portrait.jpg audio.wav
  HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc run --gpu T4 --session infinitetalk --keep --timeout 36000 \
    scripts/colab/infinitetalk-test/run_infinitetalk_colab.py
  HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc download --session infinitetalk \
    /content/InfiniteTalk/infinitetalk_res_fp8.mp4
  HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc stop --session infinitetalk
"""
import os, sys, subprocess, time, shutil, json, atexit, traceback, re, glob

DEBUG_LOG = "/content/debug_log.txt"
WORK_DIR = "/content"

with open(DEBUG_LOG, "w") as f:
    f.write("SCRIPT STARTED\n"); f.flush()

_orig_print = print
def print(*args, **kwargs):
    _orig_print(*args, **kwargs)
    sys.stdout.flush()
    try:
        with open(DEBUG_LOG, "a") as f:
            kwargs.pop('file', None); _orig_print(*args, file=f, **kwargs); f.flush()
    except: pass

def run(cmd, timeout=600, check=True):
    print(f"\n>>> {cmd[:200]}{'...' if len(cmd) > 200 else ''}")
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    if r.stdout: print(r.stdout[-3000:])
    if r.stderr:
        lines = [l for l in r.stderr.split('\n') if l.strip() and 'it/s]' not in l and 's/it]' not in l and not l.startswith('  Downloading')]
        if lines: print("STDERR:", '\n'.join(lines[-50:]))
    if check and r.returncode != 0:
        print(f"Command failed with exit code {r.returncode}"); sys.exit(1)
    return r

def _copy_debug():
    try: shutil.copy(DEBUG_LOG, os.path.join(WORK_DIR, "InfiniteTalk", "debug_log.txt"))
    except: pass

atexit.register(_copy_debug)
def _excepthook(et, ev, tb):
    msg = f"\n\nFATAL ERROR:\n{''.join(traceback.format_exception(et, ev, tb))}"
    _orig_print(msg)
    try:
        with open(DEBUG_LOG, "a") as f: f.write(msg)
    except: pass
    _copy_debug()
sys.excepthook = _excepthook

print("=" * 70)
print("InfiniteTalk Inference on Colab T4 GPU (v2)")
print("=" * 70)
print("FP8 quantization + low VRAM mode + 480P + TeaCache")
print("Key fixes: --quant fp8 (not int8), skip LoRA, fix hf download, no -q on pip")
total_start = time.time()

# Step 0: GPU Check + Disk Space
print("\n--- Step 0: GPU Check + Disk Space ---")
run("nvidia-smi", timeout=30, check=False)
run("df -h /content", timeout=10, check=False)
import torch
gpu_name = torch.cuda.get_device_properties(0).name
gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
print(f"GPU: {gpu_name} | VRAM: {gpu_mem:.1f} GB | CUDA: {torch.version.cuda} | PyTorch: {torch.__version__}")
bf16 = torch.cuda.is_bf16_supported()
print(f"bf16 supported: {bf16}")
if not bf16: print("  T4 does NOT support bfloat16. Will use float16.")

# Step 1: Environment
print("\n--- Step 1: Environment Setup ---")
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Step 2: Clone InfiniteTalk
print("\n--- Step 2: Clone InfiniteTalk ---")
os.chdir(WORK_DIR)
if not os.path.exists("InfiniteTalk"):
    run("git clone https://github.com/MeiGen-AI/InfiniteTalk.git", timeout=120)
os.chdir("InfiniteTalk")
print(f"Working dir: {os.getcwd()}")
run("ls -la", timeout=10, check=False)
run("ls -la wan/", timeout=10, check=False)
run("ls -la examples/", timeout=10, check=False)

# Step 3: Install deps (NO -q flag: keep WebSocket alive during long installs)
print("\n--- Step 3: Install Dependencies (no -q to keep connection alive) ---")
print("  Installing core deps (this may take 5-10 min)...")
run(f"{sys.executable} -m pip install 'opencv-python' 'diffusers>=0.31.0' "
    f"'transformers>=4.49.0' 'tokenizers>=0.20.3' 'accelerate>=1.1.1' "
    f"tqdm imageio easydict ftfy dashscope imageio-ffmpeg scikit-image "
    f"loguru pyloudnorm scenedetect 'moviepy==1.0.3' decord 'numpy>=1.23.5,<2'",
    timeout=600)

print("  Installing optimum-quanto for INT8/FP8 quantization support...")
run(f"{sys.executable} -m pip install 'optimum-quanto==0.2.6'", timeout=300, check=False)

print("  Installing hf_transfer + huggingface_hub...")
run(f"{sys.executable} -m pip install hf_transfer huggingface_hub", timeout=120)

print("  Installing kokoro (TTS pipeline dependency)...")
run(f"{sys.executable} -m pip install 'misaki[en]' kokoro", timeout=300, check=False)

print("  Installing remaining deps...")
run(f"{sys.executable} -m pip install einops safetensors timm albumentations "
    f"SentencePiece omegaconf soundfile librosa", timeout=300)

# Step 3b: Patch xfuser
print("\n--- Step 3b: Patch xfuser dependency ---")
attn_path = os.path.join(WORK_DIR, "InfiniteTalk", "wan", "modules", "attention.py")
if os.path.exists(attn_path):
    with open(attn_path, "r") as f: content = f.read()
    old = """from xfuser.core.distributed import (
    get_sequence_parallel_rank,
    get_sequence_parallel_world_size,
    get_sp_group,
)"""
    new = """# PATCHED: xfuser not available
def get_sequence_parallel_rank(): return 0
def get_sequence_parallel_world_size(): return 1
def get_sp_group(): return None
"""
    if old in content:
        content = content.replace(old, new)
        with open(attn_path, "w") as f: f.write(content)
        print("  [OK] Patched attention.py")
    else:
        content = re.sub(r'from xfuser\.[^\n]+\n(?:\s+\w+[,\n]*)+\)', new, content)
        with open(attn_path, "w") as f: f.write(content)
        print("  [OK] Brute-force patched attention.py")

gen_path = os.path.join(WORK_DIR, "InfiniteTalk", "generate_infinitetalk.py")
if os.path.exists(gen_path):
    with open(gen_path, "r") as f: gc = f.read()
    if "xfuser" in gc:
        print("  Patching generate_infinitetalk.py...")
        lines = gc.split('\n'); nl = []; in_blk = False
        for line in lines:
            if 'from xfuser' in line and not line.strip().startswith('#'):
                in_blk = True
                if '(' in line and ')' not in line: nl.append('# ' + line); continue
                else: nl.append('# ' + line); in_blk = False; continue
            if in_blk:
                if ')' in line: in_blk = False
                nl.append('# ' + line); continue
            nl.append(line)
        with open(gen_path, "w") as f: f.write('\n'.join(nl))
        print("  [OK] Patched generate_infinitetalk.py")

print("\n  Patching all remaining xfuser files...")
for pyfile in glob.glob("wan/**/*.py", recursive=True):
    fp = os.path.join(WORK_DIR, "InfiniteTalk", pyfile) if not pyfile.startswith("/") else pyfile
    if not os.path.exists(fp): continue
    with open(fp, "r") as f: c = f.read()
    if 'from xfuser' in c or 'import xfuser' in c:
        lines = c.split('\n'); nl = []; in_blk = False
        for line in lines:
            if 'from xfuser' in line and not line.strip().startswith('#'):
                if '(' in line and ')' not in line: in_blk = True; nl.append('# PATCHED: ' + line); continue
                else: nl.append('# PATCHED: ' + line); continue
            if in_blk:
                if ')' in line: in_blk = False
                nl.append('# PATCHED: ' + line); continue
            nl.append(line)
        with open(fp, "w") as f: f.write('\n'.join(nl))
        print(f"    [OK] Patched {pyfile}")

print("\n--- Verifying imports ---")
run(f"{sys.executable} -c 'import torch; import diffusers; import transformers; print(\"imports OK\")'", timeout=120, check=False)

# Step 4: Download models
print("\n--- Step 4: Download Models from HuggingFace ---")
WEIGHTS_DIR = os.path.join(WORK_DIR, "weights")
os.makedirs(WEIGHTS_DIR, exist_ok=True)

# 4a: Download Wan2.1 base model (selective — skip 70GB DiT shards, not needed for FP8 mode)
# FIX: Use positional file args directly, NOT --include (v8 bug: --include filtered out positional args)
WAN_DIR = os.path.join(WEIGHTS_DIR, "Wan2.1-I2V-14B-480P")
if not os.path.exists(os.path.join(WAN_DIR, "config.json")):
    print("\n  Downloading Wan2.1-I2V-14B-480P (selective, ~16GB — skip DiT shards for FP8 mode)...")
    t0 = time.time()
    # Use positional file args + --include for glob patterns (tokenizer dirs)
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
    print(f"  [OK] Wan2.1 base model exists at {WAN_DIR}")

print("\n  Verifying base model files:")
for f in ["Wan2.1_VAE.pth", "config.json", "models_t5_umt5-xxl-enc-bf16.pth", "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth"]:
    p = os.path.join(WAN_DIR, f)
    if os.path.exists(p): print(f"    OK {f} ({os.path.getsize(p)/1024**3:.2f} GB)")
    else: print(f"    MISSING: {f}")

# 4b: Download chinese-wav2vec2-base (~350MB)
WAV2VEC_DIR = os.path.join(WEIGHTS_DIR, "chinese-wav2vec2-base")
if not os.path.exists(os.path.join(WAV2VEC_DIR, "pytorch_model.bin")):
    print("\n  Downloading chinese-wav2vec2-base (~350MB)...")
    t0 = time.time()
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download TencentGameMate/chinese-wav2vec2-base --local-dir {WAV2VEC_DIR}", timeout=300)
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download TencentGameMate/chinese-wav2vec2-base model.safetensors --revision refs/pr/1 --local-dir {WAV2VEC_DIR}", timeout=300, check=False)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] chinese-wav2vec2-base exists")

# 4c: Download InfiniteTalk FP8 quantized model
# NOTE: Use FP8 (not INT8) because T5 quantized weights only exist as t5_fp8.safetensors
#   T5 code: load_file(os.path.join(quant_dir, f"t5_{quant}.safetensors"))
#   quant='int8' → t5_int8.safetensors → DOES NOT EXIST → crash
#   quant='fp8'  → t5_fp8.safetensors   → EXISTS ✅
FP8_FILE = os.path.join(WEIGHTS_DIR, "InfiniteTalk", "quant_models", "infinitetalk_single_fp8.safetensors")
if not os.path.exists(FP8_FILE):
    print("\n  Downloading InfiniteTalk FP8 quantized model (~19.5GB)...")
    t0 = time.time()
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download MeiGen-AI/InfiniteTalk "
        f"quant_models/infinitetalk_single_fp8.safetensors "
        f"quant_models/infinitetalk_single_fp8.json "
        f"--local-dir {os.path.join(WEIGHTS_DIR, 'InfiniteTalk')}", timeout=1200)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] FP8 model exists ({os.path.getsize(FP8_FILE)/1024**3:.2f} GB)")

# 4d: Download T5 FP8 quantized (~6.7GB) — required when --quant fp8
T5_FP8_FILE = os.path.join(WEIGHTS_DIR, "InfiniteTalk", "quant_models", "t5_fp8.safetensors")
if not os.path.exists(T5_FP8_FILE):
    print("\n  Downloading T5 FP8 quantized (~6.7GB)...")
    t0 = time.time()
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download MeiGen-AI/InfiniteTalk "
        f"quant_models/t5_fp8.safetensors "
        f"quant_models/t5_map_fp8.json "
        f"--local-dir {os.path.join(WEIGHTS_DIR, 'InfiniteTalk')}", timeout=600)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] T5 FP8 exists ({os.path.getsize(T5_FP8_FILE)/1024**3:.2f} GB)")

# 4e: SKIP LoRA download — not needed in FP8 quant mode
# Pipeline code: `if lora_dir is not None and quant is None:` → LoRA only loads when quant is None
# Saving 9.9GB disk space
print("\n  [SKIP] LoRA download — not needed in FP8 quant mode (saves 9.9GB)")

# Print total download time and disk usage
print(f"\n  Total elapsed: {(time.time()-total_start)/60:.1f} min")
run("df -h /content", timeout=10, check=False)
run(f"du -sh {WEIGHTS_DIR}", timeout=30, check=False)

# Step 5: Prepare input data
print("\n--- Step 5: Prepare Input Data ---")
INPUT_DIR = None
for candidate in ["/content", "/content/inputs"]:
    if os.path.exists(os.path.join(candidate, "portrait.jpg")) and os.path.exists(os.path.join(candidate, "audio.wav")):
        INPUT_DIR = candidate; break

if INPUT_DIR:
    for fname in ["portrait.jpg", "audio.wav"]:
        src = os.path.join(INPUT_DIR, fname)
        dst = os.path.join(WORK_DIR, "InfiniteTalk", "examples", fname)
        if os.path.exists(src):
            shutil.copy(src, dst)
            print(f"  Copied: {fname} ({os.path.getsize(dst) / 1024:.1f} KB)")
else:
    print("  [WARNING] No uploaded input found. Using InfiniteTalk built-in example data...")
    single_dir = os.path.join(WORK_DIR, "InfiniteTalk", "examples", "single")
    if os.path.exists(single_dir):
        run(f"ls -la {single_dir}/", timeout=10, check=False)
        # Use built-in example image and audio
        example_img = os.path.join(single_dir, "ref_image.png")
        example_wav = os.path.join(single_dir, "1.wav")
        if os.path.exists(example_img) and os.path.exists(example_wav):
            shutil.copy(example_img, os.path.join(WORK_DIR, "InfiniteTalk", "examples", "portrait.jpg"))
            shutil.copy(example_wav, os.path.join(WORK_DIR, "InfiniteTalk", "examples", "audio.wav"))
            print("  [OK] Using built-in example: ref_image.png + 1.wav")
            INPUT_DIR = single_dir
        else:
            print("  [ERROR] Built-in example data not found!")
            sys.exit(1)

# Step 6: Create input JSON
print("\n--- Step 6: Create Input JSON ---")
PROMPT = (
    "A Chinese man with short black hair and a clean-shaven face is speaking "
    "directly to the camera in a professional setting. He wears a dark suit. "
    "His expression is natural and engaging as he talks, with subtle head "
    "movements and natural facial expressions. The background is neutral and "
    "well-lit. A medium close-up shot captures his upper body and face."
)
input_json = {"prompt": PROMPT, "cond_video": "examples/portrait.jpg", "cond_audio": {"person1": "examples/audio.wav"}}
json_path = os.path.join(WORK_DIR, "InfiniteTalk", "examples", "weixin_input.json")
with open(json_path, "w") as f: json.dump(input_json, f, indent=4)
print(f"  Created input JSON: {json_path}")

# Step 7: Run inference
print("\n--- Step 7: Run InfiniteTalk Inference ---")
print(f"  GPU: {gpu_name} ({gpu_mem:.1f} GB VRAM)")
print(f"  Mode: FP8 quantization + low VRAM + 480P + TeaCache")
print(f"  NOTE: --quant fp8 (NOT int8, because t5_int8.safetensors doesn't exist)")
print(f"  NOTE: No --infinitetalk_dir (not needed in quant mode, saves LoRA load)")

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

print(f"\n  Command: {cmd[:400]}...")
t_inf = time.time()
result = run(cmd, timeout=28800, check=False)
inf_time = (time.time() - t_inf) / 60
print(f"\n  Inference time: {inf_time:.1f} min")

# Step 8: Check output
print("\n--- Step 8: Check Output ---")
run(f"find {WORK_DIR}/InfiniteTalk -name 'infinitetalk_res*' 2>/dev/null", timeout=10, check=False)
run(f"find {WORK_DIR} -name '*.mp4' -exec ls -la {{}} \\; 2>/dev/null | head -20", timeout=10, check=False)
for f in run(f"find {WORK_DIR}/InfiniteTalk -name 'infinitetalk_res_fp8*' 2>/dev/null", timeout=10, check=False).stdout.strip().split('\n'):
    if f and os.path.exists(f) and f.endswith('.mp4'):
        dst = os.path.join(WORK_DIR, os.path.basename(f))
        if f != dst:
            shutil.copy(f, dst)
            print(f"  Copied output: {dst} ({os.path.getsize(dst)/1024:.1f} KB)")

total_time = (time.time() - total_start) / 60
print(f"\n{'='*70}")
print(f"Total time: {total_time:.1f} min | Inference: {inf_time:.1f} min")
print(f"{'='*70}")
