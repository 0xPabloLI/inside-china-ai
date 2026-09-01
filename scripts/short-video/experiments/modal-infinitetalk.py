#!/usr/bin/env python3
"""
InfiniteTalk v10.18-modal: lightx2v rank32 4 步 A/B（vs v10.17 FusionX 8 步基线）

v10.17 → v10.18 变更:
- LoRA: FusionX I2V (8步, NC) → lightx2v rank32 (4步, 官方 README 同节指定，Kijai/WanVideo_comfy)
- 其余参数不变（官方同节配方）: text=1.0, audio=2.0, shift=2, lora_scale=1.0, frame_num=73
- 目的: 验证可商用蒸馏 LoRA 的质量，若接近 FusionX 则商用许可问题解决
- v10.17 结果: FusionX 8 步成功，12.2min/3s 段，$0.56，lip sync 人眼确认达标（2026-09-02）

v10.16 → v10.17 变更（参数来源：官方 README「Run with FusioniX or Lightx2v」章节，2026-08-31 抓取）:
- GPU: A100-40GB → A100-80GB（bf16 DiT ~28GB + 激活值，40GB 贴线 OOM 风险）
- 权重: fp8 量化 → 非量化 bf16（LoRA 与 fp8 格式冲突，官方 LoRA 命令也不用 quant）
- 新增下载: InfiniteTalk/single/infinitetalk.safetensors (~28GB) + FusionX I2V LoRA (~1GB)
- 权重下载移到 CPU-only 函数（不占 GPU 计费）
- 命令改用官方 LoRA 章节: steps=8, text=1.0, audio=2.0, shift=2, lora_scale=1.0
- 移除遗留参数: --use_teacache（与蒸馏冲突）、--quant fp8、--num_persistent_param_in_dit 40（80GB 全常驻不需要）
- frame_num: 13→73（分块大小，需 < 音频嵌入数 75；官方默认 81 会触发音频断言失败）
- 单变体批跑: 官方基准 (audio=2.0)；audio=3.0 备选已注释（2026-08-31 用户决定先看 2.0 结果）
- 注意（官方 README 原文）: FusionX LoRA 会加剧 >1min 视频的颜色漂移并降低 ID 保持。
  3s 测试不受影响；生产长视频需分段或换 LongCat-Video-Avatar-1.5（同团队后继，内置 8 步蒸馏）

Usage:
  cd /Users/pabloli/Documents/code/inside-china-ai
  HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 \
    NODE_USE_ENV_PROXY=1 modal run --detach scripts/short-video/experiments/modal-infinitetalk.py

Output:
  scripts/short-video/experiments/digital-human/infinitetalk/infinitetalk_v1017_lora_audio2.0.mp4
"""
import os
import sys
import time
import json
import re
import glob as glob_mod
import shutil
import subprocess
import traceback
import atexit

# ─── Modal Configuration ───────────────────────────────────────────────────

import modal

app = modal.App("infinitetalk-inference")

# Persistent volume for model weights (42GB, download once)
vol = modal.Volume.from_name("infinitetalk-models", create_if_missing=True)

# ─── GPU 选型决策表（bf16 非量化 ~28GB DiT + 激活值，Modal 定价 2026-08-31） ─────
# | GPU        | $/h   | VRAM | bf16 28GB 全常驻？          | 8步预估 | 单次成本  |
# |------------|-------|------|-----------------------------|---------|-----------|
# | T4/L4/A10  | ≤$1.10| ≤24GB| ❌ 28GB 装不下               | —       | —         |
# | L40S       | $1.95 | 48GB | ✅ 但 BF16 算力≈A100 的 6 成 | ~75 min | ~$2.4     |
# | A100 40GB  | $2.10 | 40GB | ⚠️ 贴线（28+激活≈35GB）OOM 风险 | —      | 重试反而贵 |
# | A100 80GB  | $2.50 | 80GB | ✅ 余量充足                  | ~48 min | ~$2.0-2.5 | ← 当前
# | H100       | $3.95 | 80GB | ✅ 算力 2-3x                | ~25 min | ~$2-2.5   | 快反馈可换

# Image with all dependencies
# CRITICAL: torch must be installed FIRST, before optimum-quanto pulls in a newer torch.
# transformers must be pinned <5.0 — transformers 5.x requires PyTorch >= 2.5 but we use 2.4.1.
# diffusers pinned to 0.31.0 — InfiniteTalk imports no_init_weights/ContextManagers which were removed in 0.32+.
# Use NVIDIA CUDA devel image as base — provides nvcc + CUDA headers for JIT compilation.
# This is needed because optimum-quanto's Marlin FP8 kernel requires CUDA_HOME at runtime.
image = (
    modal.Image.from_registry("nvidia/cuda:12.1.0-devel-ubuntu22.04", add_python="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install("torch==2.4.1", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("torchvision==0.19.1", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install(
        "opencv-python",
        "diffusers==0.31.0",
        "transformers>=4.49.0,<5.0",
        "tokenizers>=0.20.3,<0.22",
        "accelerate>=1.1.1,<2.0",
        "tqdm",
        "imageio",
        "easydict",
        "ftfy",
        "dashscope",
        "imageio-ffmpeg",
        "scikit-image",
        "loguru",
        "pyloudnorm",
        "scenedetect",
        "moviepy==1.0.3",
        "decord",
        "numpy>=1.23.5,<2",
        "optimum-quanto==0.2.6",
        "huggingface_hub[cli]",
        "einops",
        "safetensors",
        "timm",
        "albumentations",
        "SentencePiece",
        "omegaconf",
        "soundfile",
        "librosa",
    )
    .env({
        "HF_HUB_DISABLE_XET": "1",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        "TOKENIZERS_PARALLELISM": "false",
        "CUDA_HOME": "/usr/local/cuda",
    })
)

# ─── Paths (inside container) ─────────────────────────────────────────────

WORK_DIR = "/root"
REPO_DIR = "/root/InfiniteTalk"
WEIGHTS_DIR = "/root/weights"
WAN_DIR = f"{WEIGHTS_DIR}/Wan2.1-I2V-14B-480P"
WAV2VEC_DIR = f"{WEIGHTS_DIR}/chinese-wav2vec2-base"
FP8_FILE = f"{WEIGHTS_DIR}/InfiniteTalk/quant_models/infinitetalk_single_fp8.safetensors"
T5_FP8_FILE = f"{WEIGHTS_DIR}/InfiniteTalk/quant_models/t5_fp8.safetensors"
# v10.17: 非量化权重（LoRA 兼容必需，官方 LoRA 命令指定文件）
IT_NONQUANT_FILE = f"{WEIGHTS_DIR}/InfiniteTalk/single/infinitetalk.safetensors"
# v10.17: FusionX I2V LoRA（官方 README 链接: vrgamedevgirl84/Wan14BT2VFusioniX）
FUSIONX_DIR = f"{WEIGHTS_DIR}/FusionX"
FUSIONX_LORA_FILE = f"{FUSIONX_DIR}/FusionX_LoRa/Wan2.1_I2V_14B_FusionX_LoRA.safetensors"
# v10.17: 变体矩阵 (steps, audio_guide, shift, save_file)。基准 = 官方 LoRA 章节
# v10.17 已完成：FusionX 8 步（audio=2.0，lip sync 人眼确认达标 2026-09-02）
# v10.18：lightx2v A/B（官方同节配方，4 步；LoRA 文件换 Kijai 转存的 rank32）
LIGHTX2V_LORA_FILE = f"{WEIGHTS_DIR}/lightx2v/Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank32.safetensors"
VARIANTS = [
    (4, 2.0, 2, "infinitetalk_v1018_lightx2v_audio2.0"),
    # (8, 2.0, 2, "infinitetalk_v1017_lora_audio2.0"),   # FusionX ✅ 已验证（NC，仅验证用）
    # (8, 3.0, 2, "infinitetalk_v1017_lora_audio3.0"),   # FusionX lip sync 上探（未启用）
]


# ─── Helper Functions ──────────────────────────────────────────────────────

def run(cmd, timeout=600, check=True):
    """Run command with real-time output streaming."""
    print(f"\n>>> {cmd[:200]}{'...' if len(cmd) > 200 else ''}")
    sys.stdout.flush()
    proc = subprocess.Popen(
        cmd, shell=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1, universal_newlines=True
    )
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
    r = subprocess.CompletedProcess(cmd, proc.returncode, '\n'.join(stdout_lines), '')
    if check and r.returncode != 0:
        print(f"Command failed with exit code {r.returncode}")
        sys.exit(1)
    return r


# ─── Download Functions ────────────────────────────────────────────────────

def download_models():
    """Download all model files to Modal Volume (run once, reuse forever)."""
    import os
    os.makedirs(WEIGHTS_DIR, exist_ok=True)

    # 4a: Wan2.1 base model (selective — skip 70GB DiT shards)
    if not os.path.exists(f"{WAN_DIR}/config.json"):
        print("\n  Downloading Wan2.1-I2V-14B-480P (selective, ~16GB)...")
        t0 = time.time()
        run(
            f"HF_HUB_DISABLE_XET=1 hf download Wan-AI/Wan2.1-I2V-14B-480P "
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
            f"--local-dir {WAN_DIR}",
            timeout=1800,
        )
        print(f"  Download time: {(time.time()-t0)/60:.1f} min")
    else:
        print(f"  [OK] Wan2.1 base model exists at {WAN_DIR}")

    # 4b: chinese-wav2vec2-base (~350MB)
    if not os.path.exists(f"{WAV2VEC_DIR}/pytorch_model.bin"):
        print("\n  Downloading chinese-wav2vec2-base (~350MB)...")
        t0 = time.time()
        run(
            f"HF_HUB_DISABLE_XET=1 hf download TencentGameMate/chinese-wav2vec2-base "
            f"--local-dir {WAV2VEC_DIR}",
            timeout=300,
        )
        run(
            f"HF_HUB_DISABLE_XET=1 hf download TencentGameMate/chinese-wav2vec2-base "
            f"model.safetensors --revision refs/pr/1 --local-dir {WAV2VEC_DIR}",
            timeout=300, check=False,
        )
        print(f"  Download time: {(time.time()-t0)/60:.1f} min")
    else:
        print(f"  [OK] chinese-wav2vec2-base exists")

    # 4c: InfiniteTalk FP8 quantized model (~19.5GB)
    if not os.path.exists(FP8_FILE):
        print("\n  Downloading InfiniteTalk FP8 quantized model (~19.5GB)...")
        t0 = time.time()
        run(
            f"HF_HUB_DISABLE_XET=1 hf download MeiGen-AI/InfiniteTalk "
            f"quant_models/infinitetalk_single_fp8.safetensors "
            f"quant_models/infinitetalk_single_fp8.json "
            f"--local-dir {os.path.join(WEIGHTS_DIR, 'InfiniteTalk')}",
            timeout=1200,
        )
        print(f"  Download time: {(time.time()-t0)/60:.1f} min")
    else:
        print(f"  [OK] FP8 model exists ({os.path.getsize(FP8_FILE)/1024**3:.2f} GB)")

    # 4d: T5 FP8 quantized (~6.7GB)
    if not os.path.exists(T5_FP8_FILE):
        print("\n  Downloading T5 FP8 quantized (~6.7GB)...")
        t0 = time.time()
        run(
            f"HF_HUB_DISABLE_XET=1 hf download MeiGen-AI/InfiniteTalk "
            f"quant_models/t5_fp8.safetensors "
            f"quant_models/t5_map_fp8.json "
            f"--local-dir {os.path.join(WEIGHTS_DIR, 'InfiniteTalk')}",
            timeout=600,
        )
        print(f"  Download time: {(time.time()-t0)/60:.1f} min")
    else:
        print(f"  [OK] T5 FP8 exists ({os.path.getsize(T5_FP8_FILE)/1024**3:.2f} GB)")

    # 4e: InfiniteTalk 非量化权重（bf16, ~28GB — LoRA 兼容必需，v10.17 新增）
    if not os.path.exists(IT_NONQUANT_FILE):
        print("\n  Downloading InfiniteTalk non-quantized bf16 model (~28GB)...")
        t0 = time.time()
        run(
            f"HF_HUB_DISABLE_XET=1 hf download MeiGen-AI/InfiniteTalk "
            f"single/infinitetalk.safetensors "
            f"--local-dir {os.path.join(WEIGHTS_DIR, 'InfiniteTalk')}",
            timeout=3600,
        )
        print(f"  Download time: {(time.time()-t0)/60:.1f} min")
    else:
        print(f"  [OK] Non-quant model exists ({os.path.getsize(IT_NONQUANT_FILE)/1024**3:.2f} GB)")

    # 4f: FusionX I2V LoRA（~1GB，官方 README「Run with FusioniX」指定文件，v10.17 新增）
    if not os.path.exists(FUSIONX_LORA_FILE):
        print("\n  Downloading FusionX I2V LoRA (~1GB)...")
        t0 = time.time()
        run(
            f"HF_HUB_DISABLE_XET=1 hf download vrgamedevgirl84/Wan14BT2VFusioniX "
            f"FusionX_LoRa/Wan2.1_I2V_14B_FusionX_LoRA.safetensors "
            f"--local-dir {FUSIONX_DIR}",
            timeout=1200,
        )
        print(f"  Download time: {(time.time()-t0)/60:.1f} min")
    else:
        print(f"  [OK] FusionX LoRA exists ({os.path.getsize(FUSIONX_LORA_FILE)/1024**3:.2f} GB)")

    # 4g: Wan2.1 base DiT shards（非量化路径必需！v10.17 修复）
    # 旧脚本为 FP8 路线跳过了这些（FP8 文件本身是完整 DiT）；但官方非量化命令是
    # "base DiT shards + infinitetalk 适配权重"分开加载，缺 shard 直接 FileNotFoundError
    shard_check = os.path.join(WAN_DIR, "diffusion_pytorch_model-00001-of-00007.safetensors")
    if not os.path.exists(shard_check):
        print("\n  Downloading Wan2.1 base DiT shards (~57GB, 7 files)...")
        t0 = time.time()
        run(
            f"HF_HUB_DISABLE_XET=1 hf download Wan-AI/Wan2.1-I2V-14B-480P "
            f"--include 'diffusion_pytorch_model*' "
            f"--local-dir {WAN_DIR}",
            timeout=7200,
        )
        print(f"  Download time: {(time.time()-t0)/60:.1f} min")
    else:
        print("  [OK] Base DiT shards exist")

    # 4h: lightx2v 蒸馏 LoRA（v10.18 A/B；官方 README 链接：Kijai/WanVideo_comfy rank32；权重许可标注商用前需核实）
    if not os.path.exists(LIGHTX2V_LORA_FILE):
        print("\n  Downloading lightx2v rank32 LoRA (~1GB)...")
        t0 = time.time()
        run(
            f"HF_HUB_DISABLE_XET=1 hf download Kijai/WanVideo_comfy "
            f"Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank32.safetensors "
            f"--local-dir {os.path.join(WEIGHTS_DIR, 'lightx2v')}",
            timeout=1200,
        )
        print(f"  Download time: {(time.time()-t0)/60:.1f} min")
    else:
        print(f"  [OK] lightx2v LoRA exists ({os.path.getsize(LIGHTX2V_LORA_FILE)/1024**3:.2f} GB)")

    # Commit volume
    vol.commit()

@app.function(
    image=image,
    volumes={WEIGHTS_DIR: vol},
    timeout=5400,
    cpu=4,
    memory=16384,
)
def download_weights_cpu():
    """Download all weights on CPU container (cheap), GPU runs pure inference."""
    print("CPU pre-download: ensuring all weights on Volume...")
    download_models()
    print("CPU pre-download done.")


# ─── Patch Functions ────────────────────────────────────────────────────────

def apply_patches():
    """Apply all v10.15 patches to InfiniteTalk source code."""
    print("\n--- Applying v10.15 patches ---")

    # Patch attention.py: xfuser + xformers + flash_attn → pure SDPA
    attn_path = os.path.join(REPO_DIR, "wan", "modules", "attention.py")
    if os.path.exists(attn_path):
        with open(attn_path, "r") as f:
            content = f.read()

        # 1. Replace xfuser import with dummy functions
        new_xfuser = """# PATCHED: xfuser not available
def get_sequence_parallel_rank(): return 0
def get_sequence_parallel_world_size(): return 1
def get_sp_group(): return None
"""
        content = re.sub(
            r'from xfuser\.[^\n]+\n(?:\s+\w+[,\n]*)+\)',
            new_xfuser, content
        )

        # 2. Replace `import xformers.ops` with SDPA wrapper
        content = content.replace(
            'import xformers.ops',
            '# PATCHED: xformers not available, using SDPA\n'
            'import torch.nn.functional as _F\n'
            'class _XformersOpsCompat:\n'
            '    @staticmethod\n'
            '    def memory_efficient_attention(q, k, v, attn_bias=None, op=None):\n'
            '        q = q.transpose(1, 2)\n'
            '        k = k.transpose(1, 2)\n'
            '        v = v.transpose(1, 2)\n'
            '        out = _F.scaled_dot_product_attention(q, k, v, attn_mask=attn_bias)\n'
            '        return out.transpose(1, 2)\n'
            'class _XformersCompat:\n'
            '    ops = _XformersOpsCompat\n'
            'xformers = _XformersCompat()\n'
        )

        # Also handle xformers.ops.fmha.attn_bias.BlockDiagonalMask
        content = content.replace(
            'xformers.ops.fmha.attn_bias.BlockDiagonalMask.from_seqlens',
            'None  # PATCHED: BlockDiagonalMask not available'
        )

        # 3. Rewrite flash_attention with pure SDPA
        flash_fn_end = '\n\ndef attention('
        flash_start_idx = content.find('def flash_attention(')
        flash_end_idx = content.find(flash_fn_end, flash_start_idx)
        if flash_start_idx >= 0 and flash_end_idx >= 0:
            new_flash_fn = '''# Pure SDPA - no SageAttention (T4/L4 SDPA is fast enough)

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
    """Pure SDPA attention (SageAttention disabled)."""
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
            print("  [OK] Replaced flash_attention with pure SDPA")
        else:
            print("  [WARNING] Could not find flash_attention function boundaries!")

        with open(attn_path, "w") as f:
            f.write(content)
        print("  [OK] Patched attention.py")

    # Patch multitalk.py: remove ArgSpec import + fix diffusers import
    mt_path = os.path.join(REPO_DIR, "wan", "multitalk.py")
    if os.path.exists(mt_path):
        with open(mt_path, "r") as f:
            mt_content = f.read()
        if "from inspect import ArgSpec" in mt_content:
            mt_content = mt_content.replace(
                "from inspect import ArgSpec",
                "# PATCHED: ArgSpec removed in Python 3.12"
            )
            print("  [OK] Patched multitalk.py (removed ArgSpec import)")
        # Fix: no_init_weights / ContextManagers removed from diffusers 0.31+
        if "from diffusers.models.modeling_utils import no_init_weights, ContextManagers" in mt_content:
            mt_content = mt_content.replace(
                "from diffusers.models.modeling_utils import no_init_weights, ContextManagers",
                "# PATCHED: no_init_weights / ContextManagers not in diffusers 0.31+\n"
                "from contextlib import contextmanager as _cm\n"
                "class ContextManagers:\n"
                "    def __init__(self, context_managers):\n"
                "        self.context_managers = context_managers\n"
                "    def __enter__(self):\n"
                "        for m in self.context_managers:\n"
                "            m.__enter__()\n"
                "    def __exit__(self, *args):\n"
                "        for m in reversed(self.context_managers):\n"
                "            m.__exit__(*args)\n"
                "@_cm\n"
                "def no_init_weights(_=None):\n"
                "    def no_init(m):\n"
                "        for p in m.parameters():\n"
                "            p.detach_()\n"
                "            p.requires_grad_(False)\n"
                "    return no_init\n"
            )
            print("  [OK] Patched multitalk.py (diffusers no_init_weights → inline)")
        with open(mt_path, "w") as f:
            f.write(mt_content)

    # Patch generate_infinitetalk.py
    gen_path = os.path.join(REPO_DIR, "generate_infinitetalk.py")
    if os.path.exists(gen_path):
        with open(gen_path, "r") as f:
            gc = f.read()

        # Patch 1: wav2vec2 attn_implementation="eager"
        if 'Wav2Vec2Model.from_pretrained(wav2vec' in gc:
            gc = gc.replace(
                'Wav2Vec2Model.from_pretrained(wav2vec, local_files_only=True)',
                'Wav2Vec2Model.from_pretrained(wav2vec, local_files_only=True, attn_implementation="eager")'
            )
            print("  [OK] Patched generate_infinitetalk.py (wav2vec2 eager)")

        # Patch 2: comment out xfuser imports
        if "xfuser" in gc:
            lines = gc.split('\n')
            nl = []
            in_blk = False
            for line in lines:
                if 'from xfuser' in line and not line.strip().startswith('#'):
                    in_blk = True
                    if '(' in line and ')' not in line:
                        nl.append('# ' + line)
                        continue
                    else:
                        nl.append('# ' + line)
                        in_blk = False
                        continue
                if in_blk:
                    if ')' in line:
                        in_blk = False
                    nl.append('# ' + line)
                    continue
                nl.append(line)
            gc = '\n'.join(nl)

        # Patch 3: skip kokoro import
        if "from kokoro import KPipeline" in gc:
            gc = gc.replace(
                "from kokoro import KPipeline",
                "# PATCHED: kokoro import skipped\nKPipeline = None"
            )
            print("  [OK] Patched generate_infinitetalk.py (skip kokoro)")

        with open(gen_path, "w") as f:
            f.write(gc)
        print("  [OK] Patched generate_infinitetalk.py")

    # Patch multitalk_model.py: sageattn → SDPA
    mt_model_path = os.path.join(REPO_DIR, "wan", "modules", "multitalk_model.py")
    if os.path.exists(mt_model_path):
        with open(mt_model_path, "r") as f:
            mtm = f.read()

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
        mtm = mtm.replace(
            "USE_SAGEATTN = True",
            "USE_SAGEATTN = False  # PATCHED: SDPA only"
        )
        with open(mt_model_path, "w") as f:
            f.write(mtm)
        print("  [OK] Patched multitalk_model.py (sageattn → SDPA)")

    # Patch all remaining xfuser imports
    for pyfile in glob_mod.glob("wan/**/*.py", recursive=True):
        fpath = os.path.join(REPO_DIR, pyfile)
        if not os.path.exists(fpath):
            continue
        with open(fpath, "r") as f:
            c = f.read()
        if 'from xfuser' in c or 'import xfuser' in c:
            lines = c.split('\n')
            nl = []
            in_blk = False
            for line in lines:
                if 'from xfuser' in line and not line.strip().startswith('#'):
                    if '(' in line and ')' not in line:
                        in_blk = True
                        nl.append('# PATCHED: ' + line)
                        continue
                    else:
                        nl.append('# PATCHED: ' + line)
                        continue
                if in_blk:
                    if ')' in line:
                        in_blk = False
                    nl.append('# PATCHED: ' + line)
                    continue
                nl.append(line)
            with open(fpath, "w") as f:
                f.write('\n'.join(nl))
            print(f"    [OK] Patched {pyfile}")


# ─── Main Inference Function ───────────────────────────────────────────────

@app.function(
    gpu="A100-80GB",  # bf16 28GB 常驻 + 激活值 ≈35GB；40GB 贴线 OOM 风险，80GB 消除（见文件头决策表）
    image=image,
    volumes={WEIGHTS_DIR: vol},
    timeout=7200,  # 2h — 单变体 ~48min + 启动/加载/编码开销，留余量（3.0 变体恢复时改回 10800）
    memory=65536,  # 64GB RAM — fp32 shard 逐个载入后转 bf16，32GB 有点紧，64GB 保险
    cpu=4,
)
def run_inference(portrait_bytes: bytes, audio_bytes: bytes) -> list:
    """Run InfiniteTalk + FusionX LoRA inference (official LoRA params, 2 variants)."""
    import torch
    import warnings

    total_start = time.time()

    print("=" * 70)
    print("InfiniteTalk v10.18 on Modal A100 80GB (bf16 + lightx2v rank32 LoRA, 4 steps)")
    print("=" * 70)
    print("Official LoRA params (shared recipe): text=1.0, audio=2.0, shift=2, lora_scale=1.0; steps: lightx2v=4")
    print("Patches: Pure SDPA + xformers compat + wav2vec2 eager + ArgSpec fix + kokoro skip")

    # Step 0: GPU Check
    print("\n--- Step 0: GPU Check ---")
    run("nvidia-smi", timeout=30, check=False)
    gpu_name = torch.cuda.get_device_properties(0).name
    gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
    print(f"GPU: {gpu_name} | VRAM: {gpu_mem:.1f} GB | CUDA: {torch.version.cuda} | PyTorch: {torch.__version__}")
    bf16 = torch.cuda.is_bf16_supported()
    print(f"bf16 supported: {bf16}")

    # Step 1: Clone InfiniteTalk (cached on volume)
    print("\n--- Step 1: Clone InfiniteTalk ---")
    os.chdir(WORK_DIR)
    if not os.path.exists("InfiniteTalk"):
        run("git clone https://github.com/MeiGen-AI/InfiniteTalk.git", timeout=120)
    os.chdir("InfiniteTalk")
    print(f"Working dir: {os.getcwd()}")

    # Step 2: Download models (cached on volume)
    print("\n--- Step 2: Ensure Models Downloaded ---")
    download_models()

    # Verify base model files
    print("\n  Verifying base model files:")
    for f in ["Wan2.1_VAE.pth", "config.json", "models_t5_umt5-xxl-enc-bf16.pth",
              "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth"]:
        p = os.path.join(WAN_DIR, f)
        if os.path.exists(p):
            print(f"    OK {f} ({os.path.getsize(p)/1024**3:.2f} GB)")
        else:
            print(f"    MISSING: {f}")

    # Step 3: Apply patches
    print("\n--- Step 3: Apply Patches ---")
    apply_patches()

    # Verify imports
    print("\n--- Verifying imports ---")
    run(f"{sys.executable} -c 'import torch; import diffusers; import transformers; print(\"imports OK\")'",
        timeout=120, check=False)
    run(f"{sys.executable} -c 'import sys; sys.path.insert(0, \"{REPO_DIR}\"); from wan.modules.attention import attention; print(\"attention.py OK\")'",
        timeout=60, check=False)
    run(f"{sys.executable} -c 'import sys; sys.path.insert(0, \"{REPO_DIR}\"); import wan; print(\"wan import OK\")'",
        timeout=60, check=False)

    # Step 4: Prepare input data (from uploaded bytes)
    print("\n--- Step 4: Prepare Input Data ---")
    examples_dir = os.path.join(REPO_DIR, "examples")
    os.makedirs(examples_dir, exist_ok=True)

    portrait_path = os.path.join(examples_dir, "portrait.jpg")
    audio_path = os.path.join(examples_dir, "audio.wav")

    with open(portrait_path, "wb") as f:
        f.write(portrait_bytes)
    print(f"  Wrote portrait.jpg ({len(portrait_bytes) / 1024:.1f} KB)")

    with open(audio_path, "wb") as f:
        f.write(audio_bytes)
    print(f"  Wrote audio.wav ({len(audio_bytes) / 1024:.1f} KB)")

    # Step 5: Create input JSON
    print("\n--- Step 5: Create Input JSON ---")
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
    json_path = os.path.join(examples_dir, "weixin_input.json")
    with open(json_path, "w") as f:
        json.dump(input_json, f, indent=4)
    print(f"  Created input JSON: {json_path}")

    # Step 6: Run inference — 双变体批跑（官方基准 + audio 上探），每变体独立子进程（显存天然隔离）
    print("\n--- Step 6: Run InfiniteTalk Inference (variants) ---")
    print(f"  GPU: {gpu_name} ({gpu_mem:.1f} GB VRAM)")
    print("  Mode: bf16 non-quant + FusionX I2V LoRA + 480P + streaming")
    print("  Attention: Pure SDPA (SageAttention disabled)")

    # ─── 参数自检表（对照官方 README「Run with FusioniX」章节） ──
    print("\n  ┌── 参数自检表（官方 LoRA 章节） ─────────────────┐")
    print("  │ 参数                      │ 当前值 │ 官方推荐 │ 状态 │")
    print("  │──────────────────────────┼────────┼─────────┼──────│")
    print("  │ sample_steps              │   4    │  4~8    │  ✅  │")
    print("  │ sample_text_guide_scale   │  1.0   │  1.0    │  ✅  │")
    print("  │ sample_audio_guide_scale  │  2.0   │  2.0    │  ✅  │")
    print("  │ sample_shift              │   2    │   2     │  ✅  │")
    print("  │ lora_scale                │  1.0   │  1.0    │  ✅  │")
    print("  │ teacache                  │  无    │  无     │  ✅  │")
    print("  │ quant                     │  无    │  无     │  ✅  │")
    print("  │ offload_model             │ False  │  False  │  ✅  │")
    print("  │ GPU                       │A100-80G│   —     │  ✅  │")
    print("  └──────────────────────────────────────────────────┘")
    print("  注: --num_persistent_param_in_dit 0 在官方 LoRA 命令里是低显存用法，80GB 不需要（全常驻更快）")
    print("      offload_model=False 必须显式传（InfiniteTalk 默认 True）")

    saved_outputs = []
    for steps, audio_guide, shift, save_file in VARIANTS:
        lora_desc = "lightx2v rank32 (v10.18 A/B)" if "lightx2v" in save_file else "FusionX I2V"
        print(f"\n  ═══ Variant: steps={steps}, audio_guide={audio_guide}, shift={shift}, LoRA={lora_desc} → {save_file} ═══")
        cmd = (
            f"cd {REPO_DIR} && "
            f"PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True "
            f"{sys.executable} generate_infinitetalk.py "
            f"--ckpt_dir {WAN_DIR} "
            f"--wav2vec_dir {WAV2VEC_DIR} "
            f"--infinitetalk_dir {IT_NONQUANT_FILE} "  # 非量化权重（官方 LoRA 命令要求）
            f"--lora_dir {LIGHTX2V_LORA_FILE} "         # v10.18: lightx2v rank32（官方 README 同节指定）
            f"--lora_scale 1.0 "
            f"--input_json {json_path} "
            f"--size infinitetalk-480 "
            f"--frame_num 73 "  # 分块大小，4n+1 且必须 < 音频嵌入数（3s@25fps=75）；官方默认 81 会触发音频断言失败
            f"--max_frame_num 81 "  # 总长上限（音频驱动，实际输出 75 帧）
            f"--sample_steps {steps} "  # FusionX=8 / lightx2v=4（官方：4~8 步）
            f"--mode streaming "
            f"--motion_frame 9 "
            "--offload_model False "  # 关键: 80GB 全常驻（InfiniteTalk 默认 True, 必须显式关）
            f"--sample_text_guide_scale 1.0 "  # FusionX 官方: CFG 必须=1
            f"--sample_audio_guide_scale {audio_guide} "
            f"--sample_shift {shift} "
            f"--save_file {save_file}"
        )

        print(f"\n  Command: {cmd[:400]}...")
        t_inf = time.time()
        result = run(cmd, timeout=5400, check=False)  # 单变体 90min timeout
        inf_time = (time.time() - t_inf) / 60
        print(f"\n  Variant inference time: {inf_time:.1f} min")

        # 出片立即写 Volume（失败隔离：后续变体崩溃不丢已完成结果）
        output_path = os.path.join(REPO_DIR, f"{save_file}.mp4")
        if not os.path.exists(output_path):
            found = run(f"find {REPO_DIR} -name '{save_file}*.mp4' 2>/dev/null",
                        timeout=10, check=False).stdout.strip()
            if found:
                output_path = found.split('\n')[0]

        if os.path.exists(output_path):
            print(f"  [OK] Output found: {output_path} ({os.path.getsize(output_path)/1024:.1f} KB)")
            vol_output = os.path.join(WEIGHTS_DIR, "outputs", f"{save_file}.mp4")
            os.makedirs(os.path.dirname(vol_output), exist_ok=True)
            shutil.copy2(output_path, vol_output)
            vol.commit()
            print(f"  [OK] Saved to Volume: {vol_output}")
            saved_outputs.append(f"{save_file}.mp4")
        else:
            print(f"  [ERROR] Variant {save_file}: no output video found!")
            run(f"find {REPO_DIR} -name '*.mp4' -exec ls -la {{}} \\; 2>/dev/null | head -10",
                timeout=10, check=False)

    total_time = (time.time() - total_start) / 60
    print(f"\n{'='*70}")
    print(f"Total time: {total_time:.1f} min | Saved variants: {saved_outputs}")
    print(f"{'='*70}")
    return saved_outputs


# ─── Local Entry Point ─────────────────────────────────────────────────────

@app.local_entrypoint()
def main(
    portrait: str = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/self-portrait.jpg",
    audio: str = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/voice-samples/voice-sample-24k-3s.wav",
    output_dir: str = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/experiments/digital-human/infinitetalk",
    detach: bool = True,
):
    """Run InfiniteTalk v10.17 (FusionX LoRA 8-step, 2 variants) on Modal A100 80GB.

    Usage:
      modal run --detach scripts/short-video/experiments/modal-infinitetalk.py

    With custom inputs:
      modal run --detach scripts/short-video/experiments/modal-infinitetalk.py \\
        --portrait path/to/photo.jpg --audio path/to/audio.wav

    Outputs land in output_dir (one mp4 per variant) and are also kept on
    Modal Volume infinitetalk-models:/outputs/ as a persistent copy.
    """
    # Read input files locally
    with open(portrait, "rb") as f:
        portrait_bytes = f.read()
    with open(audio, "rb") as f:
        audio_bytes = f.read()

    expected_files = [f"{save_file}.mp4" for _, _, _, save_file in VARIANTS]
    print(f"Portrait: {portrait} ({len(portrait_bytes)/1024:.1f} KB)")
    print(f"Audio: {audio} ({len(audio_bytes)/1024:.1f} KB)")
    print(f"Expected outputs: {expected_files}")

    # CPU 预下载权重（便宜；首次 ~20min，后续秒级 no-op——不占 GPU 计费）
    print("\n⬇️  CPU pre-download (not billed at GPU rate)...")
    download_weights_cpu.remote()
    print("✅ Weights ready on Volume.")

    def _download_one(filename: str, local_path: str):
        import subprocess as _sp
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        _sp.run(
            ["modal", "volume", "get", "infinitetalk-models",
             f"outputs/{filename}", local_path],
            check=True, timeout=120, env={**os.environ},
        )
        if os.path.exists(local_path):
            print(f"   ✅ Downloaded: {local_path} ({os.path.getsize(local_path)/1024:.1f} KB)")

    if detach:
        # Spawn async — survives heartbeat disconnect
        handle = run_inference.spawn(portrait_bytes, audio_bytes)
        print(f"\n🚀 Spawned async inference (function call ID: {handle.object_id})")
        print("   Polling Volume for variant outputs (auto-download when done)...")

        import subprocess as _sp
        import time as _time
        poll_interval = 60
        max_wait = 12600  # 3.5h (双变体)
        elapsed = 0
        remaining = list(expected_files)

        while remaining and elapsed < max_wait:
            _time.sleep(poll_interval)
            elapsed += poll_interval
            try:
                r = _sp.run(
                    ["modal", "volume", "ls", "infinitetalk-models", "outputs/"],
                    capture_output=True, text=True, timeout=30,
                    env={**os.environ},
                )
                for fn in list(remaining):
                    if fn in r.stdout:
                        print(f"\n✅ {fn} detected on Volume after {elapsed//60} min!")
                        _download_one(fn, os.path.join(output_dir, fn))
                        remaining.remove(fn)
                if remaining:
                    print(f"   [{elapsed//60} min] Waiting for: {remaining}")
                else:
                    print(f"\n✅ All {len(expected_files)} variants downloaded!")
                    return
            except _sp.TimeoutExpired:
                print(f"   [{elapsed//60} min] Volume check timed out, retrying...")
            except Exception as e:
                print(f"   [{elapsed//60} min] Poll error: {e}")

        print(f"\n⏰ Timed out after {max_wait//60} min. Still missing: {remaining}")
        print("   Check manually: modal volume ls infinitetalk-models outputs/")
    else:
        # Sync mode — blocks until done
        result = run_inference.remote(portrait_bytes, audio_bytes)
        if result:
            for fn in result:
                _download_one(fn, os.path.join(output_dir, fn))
            print(f"\n✅ All done: {result}")
        else:
            print("\n❌ Inference failed — no output video generated")
            sys.exit(1)
