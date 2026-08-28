#!/usr/bin/env python3
"""
InfiniteTalk v10.15: Colab T4 GPU + FP8 + pure SDPA + max speed (steps=5, teacache=0.35)

Synced with Kaggle v10.6 patches:
- SDPA fallback for flash_attention (CLIP visual encoder)
- xformers compat wrapper (SDPA-based)
- wav2vec2 attn_implementation="eager" (SDPA doesn't support output_attentions)
- multitalk.py ArgSpec import fix (Python 3.12)
- All xfuser imports commented out

Key changes from v3:
- FIX: run() uses subprocess.Popen with real-time output (not capture_output=True)
  v2 bug: hf download output was captured silently → WebSocket idle timeout → connection dropped
  v3 fix: Popen streams stdout/stderr line-by-line → constant output keeps WebSocket alive
- Use --quant fp8 (NOT int8): T5 only has fp8 quantized weights (t5_fp8.safetensors)
- Skip LoRA download: quant mode bypasses LoRA
- Fix hf download: use file positional args, NOT --include + filenames mix
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

# CRITICAL: Disable Xet protocol BEFORE importing huggingface_hub
# Even on Colab, Xet can cause issues
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

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
    """Run command with real-time output streaming.

    v3 FIX: Use Popen instead of subprocess.run(capture_output=True).
    capture_output=True swallows all stdout/stderr → Colab CLI WebSocket sees no data
    → idle timeout → connection dropped. Popen streams line-by-line to keep it alive.
    """
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
            # Filter tqdm progress bars (they spam \r lines)
            if 'it/s]' in line or 's/it]' in line:
                continue
            print(line)
            sys.stdout.flush()
            stdout_lines.append(line)
    finally:
        proc.wait(timeout=timeout)
    r = subprocess.CompletedProcess(cmd, proc.returncode, '\n'.join(stdout_lines), '')
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
print("InfiniteTalk Inference on Colab T4 GPU (v10.15 — pure SDPA, max speed)")
print("=" * 70)
print("FP8 quantization + low VRAM mode + 480P + TeaCache")
print("Patches: Pure SDPA (no SageAttention) + xformers compat + wav2vec2 eager + ArgSpec fix")
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

print("  Installing huggingface_hub...")
run(f"{sys.executable} -m pip install huggingface_hub", timeout=120)

print("  Installing kokoro (TTS pipeline dependency)...")
run(f"{sys.executable} -m pip install 'misaki[en]' kokoro", timeout=300, check=False)

print("  Installing remaining deps...")
run(f"{sys.executable} -m pip install einops safetensors timm albumentations "
    f"SentencePiece omegaconf soundfile librosa", timeout=300)

# Skip SageAttention - T4 Triton compile always fails, causes 12h timeout
print("  Skipping SageAttention (T4 -> pure SDPA)")

# Step 3b: Patch xfuser + xformers + flash_attn (v10.9 patches)
print("\n--- Step 3b: Patch xfuser + xformers + flash_attn (v10.6 patches) ---")
attn_path = os.path.join(WORK_DIR, "InfiniteTalk", "wan", "modules", "attention.py")
if os.path.exists(attn_path):
    with open(attn_path, "r") as f: content = f.read()
    # 1. Replace xfuser import with dummy functions
    new_xfuser = """# PATCHED: xfuser not available
def get_sequence_parallel_rank(): return 0
def get_sequence_parallel_world_size(): return 1
def get_sp_group(): return None
"""
    content = re.sub(r'from xfuser\.[^\n]+\n(?:\s+\w+[,\n]*)+\)', new_xfuser, content)
    # 2. Replace `import xformers.ops` with SDPA wrapper
    content = content.replace('import xformers.ops',
        '# PATCHED: xformers not available, using SDPA\n'
        'import torch.nn.functional as _F\n'
        'class _XformersOpsCompat:\n'
        '    @staticmethod\n'
        '    def memory_efficient_attention(q, k, v, attn_bias=None, op=None):\n'
        '        # q/k/v: [B, M, H, K] -> need [B, H, M, K] for SDPA\n'
        '        q = q.transpose(1, 2)\n'
        '        k = k.transpose(1, 2)\n'
        '        v = v.transpose(1, 2)\n'
        '        out = _F.scaled_dot_product_attention(q, k, v, attn_mask=attn_bias)\n'
        '        return out.transpose(1, 2)  # back to [B, M, H, K]\n'
        'class _XformersCompat:\n'
        '    ops = _XformersOpsCompat\n'
        'xformers = _XformersCompat()\n'
    )
    # Also handle xformers.ops.fmha.attn_bias.BlockDiagonalMask in enable_sp branch
    content = content.replace('xformers.ops.fmha.attn_bias.BlockDiagonalMask.from_seqlens',
                              'None  # PATCHED: BlockDiagonalMask not available, enable_sp=False anyway')
    # --- PATCH v10.9: Rewrite flash_attention with tiered fallback ---
    # Priority: SageAttention V1 (INT8, T4-compatible) > SDPA > CPU offload SDPA
    flash_fn_end = '\n\ndef attention('
    flash_start_idx = content.find('def flash_attention(')
    flash_end_idx = content.find(flash_fn_end, flash_start_idx)
    if flash_start_idx >= 0 and flash_end_idx >= 0:
        old_flash_fn = content[flash_start_idx:flash_end_idx]
        new_flash_fn = '''# Pure SDPA - no SageAttention (T4 can't compile Triton kernels, causes 12h timeout)

def flash_attention(
    q,
    k,
    v,
    q_lens=None,
    k_lens=None,
    dropout_p=0.,
    softmax_scale=None,
    q_scale=None,
    causal=False,
    window_size=(-1, -1),
    deterministic=False,
    dtype=torch.bfloat16,
    version=None,
):
    """Pure SDPA attention (SageAttention disabled for T4)."""
    half_dtypes = (torch.float16, torch.bfloat16)
    assert dtype in half_dtypes
    out_dtype = q.dtype

    if q_lens is not None or k_lens is not None:
        warnings.warn(
            'Padding mask is disabled when using fallback attention.'
        )

    try:
        q_h = q.transpose(1, 2).to(dtype)
        k_h = k.transpose(1, 2).to(dtype)
        v_h = v.transpose(1, 2).to(dtype)
        x = torch.nn.functional.scaled_dot_product_attention(
            q_h, k_h, v_h, attn_mask=None, is_causal=causal, dropout_p=dropout_p)
        return x.transpose(1, 2).contiguous().type(out_dtype)
    except torch.OutOfMemoryError:
        warnings.warn('GPU SDPA OOM, falling back to CPU offload attention (slow!)')
        torch.cuda.empty_cache()

    # CPU offload SDPA (very slow but won't OOM)
    q_cpu = q.transpose(1, 2).to(dtype).cpu()
    k_cpu = k.transpose(1, 2).to(dtype).cpu()
    v_cpu = v.transpose(1, 2).to(dtype).cpu()
    x = torch.nn.functional.scaled_dot_product_attention(
        q_cpu, k_cpu, v_cpu, attn_mask=None, is_causal=causal, dropout_p=0.0)
    return x.transpose(1, 2).contiguous().to(q.device).type(out_dtype)
'''
        content = content[:flash_start_idx] + new_flash_fn + content[flash_end_idx:]
        print("  [OK] Replaced entire flash_attention function with pure SDPA version")
    else:
        print("  [WARNING] Could not find flash_attention function boundaries!")
    with open(attn_path, "w") as f: f.write(content)
    print("  [OK] Patched attention.py (xfuser + xformers + flash_attn → tiered SDPA)")

# Patch multitalk.py: remove `from inspect import ArgSpec` (removed in Python 3.12)
mt_path = os.path.join(WORK_DIR, "InfiniteTalk", "wan", "multitalk.py")
if os.path.exists(mt_path):
    with open(mt_path, "r") as f: mt_content = f.read()
    if "from inspect import ArgSpec" in mt_content:
        mt_content = mt_content.replace("from inspect import ArgSpec",
                                        "# PATCHED: ArgSpec removed in Python 3.12, not used anyway")
        with open(mt_path, "w") as f: f.write(mt_content)
        print("  [OK] Patched multitalk.py (removed ArgSpec import)")

# Patch generate_infinitetalk.py
gen_path = os.path.join(WORK_DIR, "InfiniteTalk", "generate_infinitetalk.py")
if os.path.exists(gen_path):
    with open(gen_path, "r") as f: gc = f.read()
    # Patch 1: wav2vec2 from_pretrained needs attn_implementation="eager" (SDPA doesn't support output_attentions)
    if 'Wav2Vec2Model.from_pretrained(wav2vec' in gc:
        gc = gc.replace(
            'Wav2Vec2Model.from_pretrained(wav2vec, local_files_only=True)',
            'Wav2Vec2Model.from_pretrained(wav2vec, local_files_only=True, attn_implementation="eager")'
        )
        print("  [OK] Patched generate_infinitetalk.py (wav2vec2 attn_implementation=eager)")
    # Patch 2: comment out xfuser imports
    if "xfuser" in gc:
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
        gc = '\n'.join(nl)
    # Patch 3: skip kokoro import (not needed for video-only mode, misaki/spacy incompatible with Python 3.13)
    if "from kokoro import KPipeline" in gc:
        gc = gc.replace("from kokoro import KPipeline",
                        "# PATCHED: kokoro import skipped (not needed for video-only mode)\nKPipeline = None")
        print("  [OK] Patched generate_infinitetalk.py (skip kokoro import)")
    with open(gen_path, "w") as f: f.write(gc)
    print("  [OK] Patched generate_infinitetalk.py")

# Patch multitalk_model.py: replace sageattn with SDPA (T4's Triton can't compile SageAttn kernels)
mt_model_path = os.path.join(WORK_DIR, "InfiniteTalk", "wan", "modules", "multitalk_model.py")
if os.path.exists(mt_model_path):
    with open(mt_model_path, "r") as f: mtm = f.read()
    mtm = mtm.replace(
        "x = sageattn(q.to(torch.bfloat16), k.to(torch.bfloat16), v, tensor_layout='NHD')",
        "x = torch.nn.functional.scaled_dot_product_attention(q.to(torch.float16).transpose(1, 2), k.to(torch.float16).transpose(1, 2), v.to(torch.float16).transpose(1, 2)).transpose(1, 2)"
    )
    mtm = mtm.replace(
        "img_x = sageattn(q, k_img, v_img, tensor_layout='NHD')",
        "img_x = torch.nn.functional.scaled_dot_product_attention(q.to(torch.float16).transpose(1, 2), k_img.to(torch.float16).transpose(1, 2), v_img.to(torch.float16).transpose(1, 2)).transpose(1, 2)"
    )
    mtm = mtm.replace(
        "x = sageattn(q, k, v, tensor_layout='NHD')",
        "x = torch.nn.functional.scaled_dot_product_attention(q.to(torch.float16).transpose(1, 2), k.to(torch.float16).transpose(1, 2), v.to(torch.float16).transpose(1, 2)).transpose(1, 2)"
    )
    mtm = mtm.replace("USE_SAGEATTN = True", "USE_SAGEATTN = False  # PATCHED: T4 can't compile SageAttn Triton kernels")
    with open(mt_model_path, "w") as f: f.write(mtm)
    print("  [OK] Patched multitalk_model.py (sageattn → SDPA, USE_SAGEATTN=False)")

# Patch all remaining files
for pyfile in glob.glob("wan/**/*.py", recursive=True):
    fpath = os.path.join(WORK_DIR, "InfiniteTalk", pyfile)
    if not os.path.exists(fpath): continue
    with open(fpath, "r") as f: c = f.read()
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
        with open(fpath, "w") as f: f.write('\n'.join(nl))
        print(f"    [OK] Patched {pyfile}")

print("\n--- Verifying imports ---")
run(f"{sys.executable} -c 'import torch; import diffusers; import transformers; print(\"imports OK\")'", timeout=120, check=False)
run(f"{sys.executable} -c 'import sys; sys.path.insert(0, \"/content/InfiniteTalk\"); from wan.modules.attention import attention; print(\"attention.py OK\")'", timeout=60, check=False)
run(f"{sys.executable} -c 'import sys; sys.path.insert(0, \"/content/InfiniteTalk\"); import wan; print(\"wan import OK\")'", timeout=60, check=False)

# Step 4: Download models
print("\n--- Step 4: Download Models from HuggingFace ---")
WEIGHTS_DIR = os.path.join(WORK_DIR, "weights")
os.makedirs(WEIGHTS_DIR, exist_ok=True)

# 4a: Download Wan2.1 base model (selective — skip 70GB DiT shards, not needed for FP8 mode)
WAN_DIR = os.path.join(WEIGHTS_DIR, "Wan2.1-I2V-14B-480P")
if not os.path.exists(os.path.join(WAN_DIR, "config.json")):
    print("\n  Downloading Wan2.1-I2V-14B-480P (selective, ~16GB — skip DiT shards for FP8 mode)...")
    t0 = time.time()
    run(f"HF_HUB_DISABLE_XET=1 hf download Wan-AI/Wan2.1-I2V-14B-480P "
        f"config.json "
        f"Wan2.1_VAE.pth "
        f"models_t5_umt5-xxl-enc-bf16.pth "
        f"models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth "
        f"diffusion_pytorch_model.safetensors.index.json "
        f"google/umt5-xxl/tokenizer.json "
        f"google/umt5-xxl/spiece.model "
        f"google/umt5-xxl/tokenizer_config.json "
        f"google/umt5-xxl/special_tokens_map.json "
        f"xlm-roberta-large/sentencepiece.bpe.model "
        f"xlm-roberta-large/special_tokens_map.json "
        f"xlm-roberta-large/tokenizer_config.json "
        f"xlm-roberta-large/tokenizer.json "
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
    run(f"HF_HUB_DISABLE_XET=1 hf download TencentGameMate/chinese-wav2vec2-base --local-dir {WAV2VEC_DIR}", timeout=300)
    run(f"HF_HUB_DISABLE_XET=1 hf download TencentGameMate/chinese-wav2vec2-base model.safetensors --revision refs/pr/1 --local-dir {WAV2VEC_DIR}", timeout=300, check=False)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] chinese-wav2vec2-base exists")

# 4c: Download InfiniteTalk FP8 quantized model
FP8_FILE = os.path.join(WEIGHTS_DIR, "InfiniteTalk", "quant_models", "infinitetalk_single_fp8.safetensors")
if not os.path.exists(FP8_FILE):
    print("\n  Downloading InfiniteTalk FP8 quantized model (~19.5GB)...")
    t0 = time.time()
    run(f"HF_HUB_DISABLE_XET=1 hf download MeiGen-AI/InfiniteTalk "
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
    run(f"HF_HUB_DISABLE_XET=1 hf download MeiGen-AI/InfiniteTalk "
        f"quant_models/t5_fp8.safetensors "
        f"quant_models/t5_map_fp8.json "
        f"--local-dir {os.path.join(WEIGHTS_DIR, 'InfiniteTalk')}", timeout=600)
    print(f"  Download time: {(time.time()-t0)/60:.1f} min")
else:
    print(f"  [OK] T5 FP8 exists ({os.path.getsize(T5_FP8_FILE)/1024**3:.2f} GB)")

# 4e: SKIP LoRA download — not needed in FP8 quant mode
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
print("  Attention: Pure SDPA (SageAttention disabled - T4 Triton cant compile)")
print("  Frames: 13/chunk | Steps: 5 (talking head optimal) | TeaCache: 0.35 (max aggressive)")
print("  Audio: 3s clip -> ~6 chunks -> ~1.8s per chunk (5 steps) ~= 11 min total")
print(f"  NOTE: --quant fp8 (NOT int8, because t5_int8.safetensors doesn't exist)")

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
    f"--frame_num 13 "
    f"--max_frame_num 81 "
    f"--sample_steps 5 "
    f"--mode streaming "
    f"--motion_frame 9 "
    f"--num_persistent_param_in_dit 0 "
    f"--use_teacache "
    f"--teacache_thresh 0.35 "
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
