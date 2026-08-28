"""
InfiniteTalk v10: Kaggle T4 GPU + FP8 quantization + low VRAM mode

v10 changes:
- Use curl -L for LFS file downloads (hf download/hf_hub_download cause 0B on Kaggle)
- Download models to /tmp (~70GB) instead of /kaggle/working (~20GB)
- Use Popen for real-time output (better than capture_output)
- HF_HUB_DISABLE_XET=1, no HF_HUB_ENABLE_HF_TRANSFER
- Fall back to built-in example data if no input dataset

Based on: scripts/kaggle/infinitetalk-dataset/create_dataset_kernel.py (v8, curl -L verified)
"""

import os
import sys
import subprocess
import time
import shutil
import json
import atexit
import traceback
import re
import glob as _glob

# CRITICAL: Disable Xet protocol BEFORE importing huggingface_hub
# Xet causes 0B LFS files on Kaggle
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

WORK_DIR = "/kaggle/working"
MODELS_DIR = "/tmp/models"  # /tmp has ~70GB, /kaggle/working only ~20GB
DEBUG_LOG = os.path.join(WORK_DIR, "debug_log.txt")

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
    """Run command with real-time output streaming via Popen."""
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
    result = subprocess.CompletedProcess(cmd, proc.returncode, '\n'.join(stdout_lines), '')
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result

def download_curl(repo_id, filename, dest_path):
    """Download a LFS file from HuggingFace using curl -L.
    This is the ONLY reliable method on Kaggle (Xet protocol causes 0B).
    """
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        print(f"  [SKIP] {dest_path} ({os.path.getsize(dest_path)/1024**3:.2f} GB)")
        return
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    url = f"https://huggingface.co/{repo_id}/resolve/main/{filename}"
    t0 = time.time()
    run(f"curl -L --max-time 3600 -o '{dest_path}' '{url}'", timeout=3700)
    fsize = os.path.getsize(dest_path)
    if fsize == 0:
        raise RuntimeError(f"0B file: {dest_path}")
    print(f"  [OK] {dest_path} ({fsize/1024**3:.2f} GB, {(time.time()-t0)/60:.1f} min)")
    sys.stdout.flush()

def download_small_file(repo_id, filename, dest_path):
    """Download a small non-LFS file using hf_hub_download."""
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        print(f"  [SKIP] {dest_path}")
        return
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    from huggingface_hub import hf_hub_download
    cached = hf_hub_download(repo_id=repo_id, filename=filename,
                             cache_dir="/tmp/hf_cache")
    shutil.copy2(os.path.realpath(cached), dest_path)
    print(f"  [OK] {dest_path} ({os.path.getsize(dest_path)/1024**2:.1f} MB)")

def download_tokenizer_dir(repo_id, dir_path, dest_dir):
    """Download a tokenizer directory (small non-LFS files)."""
    if os.path.exists(dest_dir) and os.listdir(dest_dir):
        print(f"  [SKIP] {dest_dir}")
        return
    os.makedirs(dest_dir, exist_ok=True)
    from huggingface_hub import list_repo_files, hf_hub_download
    all_files = list_repo_files(repo_id)
    files_to_download = list(set(f for f in all_files if f.startswith(dir_path)))
    print(f"  Found {len(files_to_download)} files in {dir_path}")
    for fname in files_to_download:
        dest_file = os.path.join(dest_dir, fname)
        if os.path.exists(dest_file) and os.path.getsize(dest_file) > 0:
            continue
        os.makedirs(os.path.dirname(dest_file), exist_ok=True)
        cached = hf_hub_download(repo_id=repo_id, filename=fname,
                                 cache_dir="/tmp/hf_cache")
        shutil.copy2(os.path.realpath(cached), dest_file)
        print(f"    [OK] {fname} ({os.path.getsize(dest_file)/1024**2:.1f} MB)")
        sys.stdout.flush()

# Register atexit to copy debug_log for download
def _copy_debug_on_exit():
    try: shutil.copy(DEBUG_LOG, os.path.join(WORK_DIR, "InfiniteTalk", "debug_log.txt"))
    except: pass
atexit.register(_copy_debug_on_exit)

def _excepthook(et, ev, tb):
    msg = f"\n\nFATAL ERROR:\n{''.join(traceback.format_exception(et, ev, tb))}"
    _orig_print(msg)
    try:
        with open(DEBUG_LOG, "a") as f: f.write(msg)
    except: pass
    _copy_debug_on_exit()
sys.excepthook = _excepthook

# ============================================================
# Main
# ============================================================
print("=" * 70)
print("InfiniteTalk Inference on Kaggle T4 GPU (v10)")
print("=" * 70)
print("FP8 quantization + low VRAM mode + 480P + TeaCache")
print("  Models downloaded to /tmp via curl -L (avoids Xet 0B bug)")
print("  Uses SDPA attention (no flash_attn on T4, no xfuser)")

total_start = time.time()

# Step 0: GPU Check
print("\n--- Step 0: GPU Check ---")
run("nvidia-smi", timeout=30, check=False)
run("df -h /tmp /kaggle/working", timeout=10, check=False)

import torch
gpu_name = torch.cuda.get_device_properties(0).name
gpu_total_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
print(f"\nGPU: {gpu_name} | VRAM: {gpu_total_mem:.1f} GB | CUDA: {torch.version.cuda} | PyTorch: {torch.__version__}")
supports_bf16 = torch.cuda.is_bf16_supported()
print(f"bf16 supported: {supports_bf16}")
if not supports_bf16:
    print("  T4 (sm_75) does NOT support bfloat16. Will use float16.")

# Step 1: Clone InfiniteTalk
print("\n--- Step 1: Clone InfiniteTalk ---")
os.chdir(WORK_DIR)
if not os.path.exists("InfiniteTalk"):
    run("git clone https://github.com/MeiGen-AI/InfiniteTalk.git", timeout=120)
os.chdir("InfiniteTalk")
print(f"Working dir: {os.getcwd()}")
run("ls -la", timeout=10, check=False)

# Step 2: Install dependencies
print("\n--- Step 2: Install Dependencies ---")
run(f"{sys.executable} -m pip install 'opencv-python' 'diffusers>=0.31.0' "
    f"'transformers>=4.49.0' 'tokenizers>=0.20.3' 'accelerate>=1.1.1' "
    f"tqdm imageio easydict ftfy dashscope imageio-ffmpeg scikit-image "
    f"loguru pyloudnorm scenedetect 'moviepy==1.0.3' decord 'numpy>=1.23.5,<2'", timeout=600)
run(f"{sys.executable} -m pip install 'optimum-quanto==0.2.6'", timeout=300, check=False)
run(f"{sys.executable} -m pip install huggingface_hub", timeout=120)
run(f"{sys.executable} -m pip install 'misaki[en]' kokoro", timeout=300, check=False)
run(f"{sys.executable} -m pip install einops safetensors timm albumentations "
    f"SentencePiece omegaconf soundfile librosa", timeout=300)

# Skip SageAttention - T4 Triton compile fails, causes 12h timeout
print("  Skipping SageAttention (T4 -> pure SDPA)")

# Step 3: Patch xfuser + xformers (T4 has no flash_attn, no xformers)
print("\n--- Step 3: Patch xfuser + xformers ---")
# Patch attention.py: remove xfuser + xformers, use SDPA
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
    # Since our xfuser patch makes enable_sp always False, this code never runs
    # But we still need to make the import not crash
    content = content.replace('xformers.ops.fmha.attn_bias.BlockDiagonalMask.from_seqlens',
                              'None  # PATCHED: BlockDiagonalMask not available, enable_sp=False anyway')
    # 3. Patch flash_attention: when no flash_attn, redirect to attention() which has SDPA fallback
    # CLIP calls flash_attention() directly. Instead of complex SDPA in flash_attention,
    # just make it call the attention() function which already has SDPA fallback.
    # Replace the assert + flash_attn 2 call with SDPA directly on the pre-flattened input
    # --- PATCH v10.8: Rewrite flash_attention for SDPA ---
    # When no flash_attn available, we need to intercept BEFORE the varlen preprocessing
    # (flatten/cat), because SDPA can't handle varlen mode.
    # Strategy: replace the entire flash_attention function body with a simpler SDPA version.
    old_flash_fn_start = '''def flash_attention(
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
    """
    q:              [B, Lq, Nq, C1].
    k:              [B, Lk, Nk, C1].
    v:              [B, Lk, Nk, C2]. Nq must be divisible by Nk.
    q_lens:         [B].
    k_lens:         [B].
    dropout_p:      float. Dropout probability.
    softmax_scale:  float. The scaling of QK^T before applying softmax.
    causal:         bool. Whether to apply causal attention mask.
    window_size:    (left right). If not (-1, -1), apply sliding window local attention.
    deterministic:  bool. If True, slightly slower and uses more memory.
    dtype:          torch.dtype. Apply when dtype of q/k/v is not float16/bfloat16.
    """
    half_dtypes = (torch.float16, torch.bfloat16)
    assert dtype in half_dtypes
    assert q.device.type == 'cuda' and q.size(-1) <= 256

    # params
    b, lq, lk, out_dtype = q.size(0), q.size(1), k.size(1), q.dtype

    def half(x):
        return x if x.dtype in half_dtypes else x.to(dtype)

    # preprocess query
    if q_lens is None:
        q = half(q.flatten(0, 1))
        q_lens = torch.tensor(
            [lq] * b, dtype=torch.int32).to(
                device=q.device, non_blocking=True)
    else:
        q = half(torch.cat([u[:v] for u, v in zip(q, q_lens)]))

    # preprocess key, value
    if k_lens is None:
        k = half(k.flatten(0, 1))
        v = half(v.flatten(0, 1))
        k_lens = torch.tensor(
            [lk] * b, dtype=torch.int32).to(
                device=k.device, non_blocking=True)
    else:
        k = half(torch.cat([u[:v] for u, v in zip(k, k_lens)]))
        v = half(torch.cat([u[:v] for u, v in zip(v, k_lens)]))

    q = q.to(v.dtype)
    k = k.to(v.dtype)

    if q_scale is not None:
        q = q * q_scale

    if version is not None and version == 3 and not FLASH_ATTN_3_AVAILABLE:
        warnings.warn(
            'Flash attention 3 is not available, use flash attention 2 instead.'
        )

    # apply attention
    if (version is None or version == 3) and FLASH_ATTN_3_AVAILABLE:'''
    # We won't do a simple replace — instead, replace the ENTIRE function
    # Find the function start and end (up to 'def attention(')
    flash_fn_end = '\n\ndef attention('
    flash_start_idx = content.find('def flash_attention(')
    flash_end_idx = content.find(flash_fn_end, flash_start_idx)
    if flash_start_idx >= 0 and flash_end_idx >= 0:
        old_flash_fn = content[flash_start_idx:flash_end_idx]
        new_flash_fn = '''# PATCHED v10.9: Tiered attention fallback
# Pure SDPA - no SageAttention (T4 can't compile Triton kernels, causes 12h timeout)

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
        print("  [OK] Replaced entire flash_attention function with SDPA version")
    else:
        print("  [WARNING] Could not find flash_attention function boundaries!")
        # Fallback: old approach
        content = content.replace(old_flash_fn_start, '# PATCHED: flash_attention replaced')
    with open(attn_path, "w") as f: f.write(content)
    print("  [OK] Patched attention.py (xfuser + xformers + flash_attn → SDPA)")

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
    with open(gen_path, "w") as f: f.write(gc)
    print("  [OK] Patched generate_infinitetalk.py")

# Patch multitalk_model.py: replace sageattn with SDPA (T4's Triton can't compile SageAttn kernels)
mt_model_path = os.path.join(WORK_DIR, "InfiniteTalk", "wan", "modules", "multitalk_model.py")
if os.path.exists(mt_model_path):
    with open(mt_model_path, "r") as f: mtm = f.read()
    # Replace all sageattn calls with SDPA equivalent
    # sageattn(q, k, v, tensor_layout='NHD') -> SDPA expects [B, H, N, D] (NHD = N=seq, H=heads, D=dim)
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
    # Also disable USE_SAGEATTN flag to prevent other code paths from trying sageattn
    mtm = mtm.replace("USE_SAGEATTN = True", "USE_SAGEATTN = False  # PATCHED: T4 can't compile SageAttn Triton kernels")
    with open(mt_model_path, "w") as f: f.write(mtm)
    print("  [OK] Patched multitalk_model.py (sageattn → SDPA, USE_SAGEATTN=False)")

# Patch all remaining files
for pyfile in _glob.glob("wan/**/*.py", recursive=True):
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
run(f"{sys.executable} -c 'import sys; sys.path.insert(0, \"/kaggle/working/InfiniteTalk\"); from wan.modules.attention import attention; print(\"attention.py OK\")'", timeout=60, check=False)
run(f"{sys.executable} -c 'import sys; sys.path.insert(0, \"/kaggle/working/InfiniteTalk\"); import wan; print(\"wan import OK\")'", timeout=60, check=False)

# Step 4: Download models to /tmp via curl -L
print("\n--- Step 4: Download Models (curl -L → /tmp) ---")
WAN_DIR = os.path.join(MODELS_DIR, "Wan2.1-I2V-14B-480P")
WAV2VEC_DIR = os.path.join(MODELS_DIR, "chinese-wav2vec2-base")
IT_DIR = os.path.join(MODELS_DIR, "InfiniteTalk")
IT_QUANT_DIR = os.path.join(IT_DIR, "quant_models")

# 4a: Wan2.1 base model (LFS files via curl, small files via hf_hub_download)
print("\n  --- 4a: Wan2.1-I2V-14B-480P base model ---")
download_small_file("Wan-AI/Wan2.1-I2V-14B-480P", "config.json",
                   os.path.join(WAN_DIR, "config.json"))
download_curl("Wan-AI/Wan2.1-I2V-14B-480P", "Wan2.1_VAE.pth",
              os.path.join(WAN_DIR, "Wan2.1_VAE.pth"))
download_curl("Wan-AI/Wan2.1-I2V-14B-480P", "models_t5_umt5-xxl-enc-bf16.pth",
              os.path.join(WAN_DIR, "models_t5_umt5-xxl-enc-bf16.pth"))
download_curl("Wan-AI/Wan2.1-I2V-14B-480P", "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth",
              os.path.join(WAN_DIR, "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth"))
download_small_file("Wan-AI/Wan2.1-I2V-14B-480P", "diffusion_pytorch_model.safetensors.index.json",
                   os.path.join(WAN_DIR, "diffusion_pytorch_model.safetensors.index.json"))
download_tokenizer_dir("Wan-AI/Wan2.1-I2V-14B-480P", "google/umt5-xxl",
                       os.path.join(WAN_DIR, "google/umt5-xxl"))
download_tokenizer_dir("Wan-AI/Wan2.1-I2V-14B-480P", "xlm-roberta-large",
                       os.path.join(WAN_DIR, "xlm-roberta-large"))

# 4b: chinese-wav2vec2-base from ModelScope (more reliable on Kaggle)
print("\n  --- 4b: chinese-wav2vec2-base (ModelScope) ---")
os.makedirs(WAV2VEC_DIR, exist_ok=True)
ms_base = "https://modelscope.cn/models/TencentGameMate/chinese-wav2vec2-base/resolve/master"
for fname in ["config.json", "preprocessor_config.json"]:
    dest = os.path.join(WAV2VEC_DIR, fname)
    if not os.path.exists(dest):
        run(f"curl -L --max-time 60 -o '{dest}' '{ms_base}/{fname}'", timeout=90, check=False)
run(f"curl -L --max-time 300 -o '{WAV2VEC_DIR}/pytorch_model.bin' '{ms_base}/pytorch_model.bin'", timeout=360)
if os.path.exists(os.path.join(WAV2VEC_DIR, "pytorch_model.bin")):
    print(f"  [OK] pytorch_model.bin ({os.path.getsize(os.path.join(WAV2VEC_DIR, 'pytorch_model.bin'))/1024**2:.1f} MB)")

# 4c: InfiniteTalk FP8 quantized model
print("\n  --- 4c: InfiniteTalk FP8 DiT (~19.5GB) ---")
download_curl("MeiGen-AI/InfiniteTalk", "quant_models/infinitetalk_single_fp8.safetensors",
              os.path.join(IT_QUANT_DIR, "infinitetalk_single_fp8.safetensors"))
download_small_file("MeiGen-AI/InfiniteTalk", "quant_models/infinitetalk_single_fp8.json",
                   os.path.join(IT_QUANT_DIR, "infinitetalk_single_fp8.json"))

# 4d: T5 FP8 quantized
print("\n  --- 4d: T5 FP8 (~6.7GB) ---")
download_curl("MeiGen-AI/InfiniteTalk", "quant_models/t5_fp8.safetensors",
              os.path.join(IT_QUANT_DIR, "t5_fp8.safetensors"))
download_small_file("MeiGen-AI/InfiniteTalk", "quant_models/t5_map_fp8.json",
                   os.path.join(IT_QUANT_DIR, "t5_map_fp8.json"))

print(f"\n  [SKIP] LoRA — not needed in FP8 quant mode (saves 9.9GB)")

print(f"\n  Total download+setup time: {(time.time()-total_start)/60:.1f} min")
run("df -h /tmp", timeout=10, check=False)
run(f"du -sh {MODELS_DIR}", timeout=30, check=False)

# Step 5: Prepare input data
print("\n--- Step 5: Prepare Input Data ---")
INPUT_DIR = None
for candidate in [
    "/kaggle/input/infinitetalk-input",
    "/kaggle/input/xpabloli/infinitetalk-input",
    "/kaggle/input/infinitetalk-test-inputs",
    "/kaggle/input/xpabloli/infinitetalk-test-inputs",
]:
    if os.path.exists(candidate):
        INPUT_DIR = candidate; break

if not INPUT_DIR:
    matches = _glob.glob("/kaggle/input/**/portrait.jpg", recursive=True)
    if matches: INPUT_DIR = os.path.dirname(matches[0])

if INPUT_DIR and os.path.exists(INPUT_DIR):
    for fname in ["portrait.jpg", "audio.wav"]:
        src = os.path.join(INPUT_DIR, fname)
        dst = os.path.join(WORK_DIR, "InfiniteTalk", "examples", fname)
        if os.path.exists(src):
            shutil.copy(src, dst)
            print(f"  Copied: {fname} ({os.path.getsize(dst)/1024:.1f} KB)")
else:
    print("  [WARNING] No uploaded input found. Using built-in example data...")
    single_dir = os.path.join(WORK_DIR, "InfiniteTalk", "examples", "single")
    if os.path.exists(single_dir):
        run(f"ls -la {single_dir}/", timeout=10, check=False)
        for src_name, dst_name in [("ref_image.png", "portrait.jpg"), ("1.wav", "audio.wav")]:
            src = os.path.join(single_dir, src_name)
            dst = os.path.join(WORK_DIR, "InfiniteTalk", "examples", dst_name)
            if os.path.exists(src):
                shutil.copy(src, dst)
                print(f"  Using built-in: {src_name} → {dst_name}")
    else:
        print("  [ERROR] No input data and no built-in example!")
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
input_json = {
    "prompt": PROMPT,
    "cond_video": "examples/portrait.jpg",
    "cond_audio": {"person1": "examples/audio.wav"}
}
json_path = os.path.join(WORK_DIR, "InfiniteTalk", "examples", "weixin_input.json")
with open(json_path, "w") as f: json.dump(input_json, f, indent=4)
print(f"  Created: {json_path}")

# Step 7: Run inference
print("\n--- Step 7: Run InfiniteTalk Inference ---")
print(f"  GPU: {gpu_name} ({gpu_total_mem:.1f} GB VRAM)")
print("  Mode: FP8 quantization + low VRAM + 480P + TeaCache")
print("  Attention: SDPA (SageAttention disabled — T4 Triton can't compile)")
print("  Frames: 13/chunk | Steps: 5 (talking head optimal) | TeaCache: 0.35 (max aggressive)")
print("  Audio: 3s clip → ~6 chunks → ~1.8s per chunk (5 steps) ≈ 11 min total")

FP8_FILE = os.path.join(IT_QUANT_DIR, "infinitetalk_single_fp8.safetensors")
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
print(f"\n  Command: {cmd[:300]}...")
t_inf = time.time()
result = run(cmd, timeout=28800, check=False)
inference_time = (time.time() - t_inf) / 60
print(f"\n  Inference time: {inference_time:.1f} min")

# Step 8: Check output
print("\n--- Step 8: Check Output ---")
run(f"find {WORK_DIR}/InfiniteTalk -name 'infinitetalk_res*' 2>/dev/null", timeout=10, check=False)
run(f"find {WORK_DIR} -name '*.mp4' -exec ls -la {{}} \\; 2>/dev/null | head -20", timeout=10, check=False)

# Copy output to /kaggle/working for easy download
for f in _glob.glob(f"{WORK_DIR}/InfiniteTalk/**/infinitetalk_res*.mp4", recursive=True):
    dst = os.path.join(WORK_DIR, os.path.basename(f))
    if f != dst:
        shutil.copy(f, dst)
        print(f"  Output: {dst} ({os.path.getsize(dst)/1024:.1f} KB)")

total_time = (time.time() - total_start) / 60
print(f"\n{'='*70}")
print(f"Total time: {total_time:.1f} min | Inference: {inference_time:.1f} min")
print(f"{'='*70}")
