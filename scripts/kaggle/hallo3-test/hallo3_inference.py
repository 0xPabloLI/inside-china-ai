"""
Hallo3 T4 冒烟测试 (Kaggle T4 16GB)

目标: 验证 Hallo3 (复旦+百度, CVPR 2025, DiT) 能否在 T4 上跑通。

预判: 几乎肯定 OOM —
  1. configs/inference.yaml "bf16: True"; T4 (sm_75 Turing) 不支持 bf16
     (需 Ampere sm_80+, 即 A100/H100/L4). torch.cuda.is_bf16_supported() -> False.
  2. 双 DiT 42 层 (network + ref_network, hidden 3072 / 48 头 / patch 2 / in_ch 32)
     + T5-XXL text encoder + CogVideo 3D VAE. 权重 bf16 ~25GB, 加激活/中间张量
     (50 步, 13 帧, 720x480) 峰值 35-40GB+ >> T4 16GB.
  3. 无 cpu_offload / 量化选项 (configs 无对应字段, 无社区量化版).
  4. 官方 README "Tested GPUs: H100".

策略: 两阶段冒烟, 把失败发现点提前到下载之前.
  阶段 1 (轻量 ~5min, 不下载 35GB 权重):
    clone repo + 装依赖 + import + bf16 兼容 + VRAM 估算
    -> bf16 不支持或 VRAM > 16GB 则快速失败, 不浪费下载配额
  阶段 2 (重量 ~30min+, 仅阶段 1 全过才执行):
    下载全部权重 + 官方 examples/inference 素材跑推理

信源 (参数信源标注, 官方优先):
  - bf16: configs/inference.yaml "bf16: True"
  - DiT 架构: configs/cogvideox_5b_i2v_s2.yaml (42 层, hidden 3072, 48 头, 双网络)
  - 采样: configs/inference.yaml sampling_image_size [480,720], num_frames 13, fps 25
  - 步数: configs/cogvideox_5b_i2v_s2.yaml sampler num_steps 50
  - 官方 GPU: README "Tested GPUs: H100"
  - T4 = sm_75 Turing, 无 bf16 Tensor Core: NVIDIA arch docs
  - 推理命令: scripts/inference_long_batch.sh -> hallo3/sample_video.py
  - 输入格式: examples/inference/input.txt "prompt@@image@@audio"
  - 音频必须英文: README "Audio must be in English"
  - 权重: HF fudan-generative-ai/hallo3 (含 hallo3 + cogvideox-5b + t5 + wav2vec + ...)
"""

import os
import sys
import subprocess
import time
import shutil
import traceback
import re
import atexit

# ===== CRITICAL: disable Xet BEFORE any huggingface import (causes 0B LFS on Kaggle) =====
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

WORK_DIR = "/kaggle/working"
MODELS_DIR = "/tmp/models"          # ~70GB, vs /kaggle/working ~20GB
HALLO3_DIR = "/tmp/hallo3"
PRETRAINED = os.path.join(HALLO3_DIR, "pretrained_models")
DEBUG_LOG = os.path.join(WORK_DIR, "debug_log.txt")

os.makedirs(WORK_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

with open(DEBUG_LOG, "w") as f:
    f.write("HALLO3 T4 SMOKE SCRIPT STARTED\n")
    f.flush()
    os.fsync(f.fileno())

_orig_print = print


def print(*args, **kwargs):
    _orig_print(*args, **kwargs)
    sys.stdout.flush()
    try:
        with open(DEBUG_LOG, "a") as f:
            _orig_print(*args, file=f, **kwargs)
            f.flush()
    except Exception:
        pass


# ---------------------------------------------------------------- pip helpers
# Hallo3 requirements.txt pins torch==2.4.0 + cu121. T4 (sm_75) is cu121-compatible.
# Re-asserting on every pip call stops a transitive dep from swapping the CUDA build.
TORCH_PINS = "torch==2.4.0 torchvision==0.19.0 torchaudio==2.4.0"

# Minimal dep set for the stage-1 smoke (import + bf16/VRAM probe). Full
# requirements.txt has 100+ pins; we install the inference-critical ones and
# let self_healing_import catch the rest. CogVideo uses SwissArmyTransformer (SAT)
# + deepspeed; hallo3/sample_video.py pulls insightface/mediapipe/decord/av.
DEP_MAP = {
    "torch": "torch==2.4.0",
    "torchvision": "torchvision==0.19.0",
    "transformers": "transformers==4.45.2",
    "diffusers": "diffusers",
    "accelerate": "accelerate",
    "safetensors": "safetensors",
    "einops": "einops==0.8.0",
    "omegaconf": "omegaconf==2.3.0",
    "numpy": "numpy==1.26.4",
    "PIL": "pillow==11.0.0",
    "cv2": "opencv-python-headless==4.10.0.84",
    "librosa": "librosa==0.10.2.post1",
    "soundfile": "soundfile",
    "decord": "decord==0.6.0",
    "av": "av==12.1.0",
    "imageio": "imageio==2.34.2 imageio-ffmpeg==0.5.1",
    "insightface": "insightface==0.7.3",
    "onnxruntime": "onnxruntime-gpu==1.19.2",
    "mediapipe": "mediapipe==0.10.14",
    "pytorch_lightning": "pytorch-lightning==2.3.3",
    "deepspeed": "deepspeed==0.14.4",
    "jax": "jax==0.4.36 jaxlib==0.4.36",
    "SwissArmyTransformer": "SwissArmyTransformer==0.4.12",
    "safetensors": "safetensors==0.4.3",
    "tqdm": "tqdm==4.66.5",
    "loguru": "loguru",
    "pyyaml": "pyyaml==6.0.2",
    "scipy": "scipy==1.14.0",
    "scikit_image": "scikit-image==0.24.0",
    "kornia": "kornia==0.7.3",
    "moviepy": "moviepy==1.0.3",
    "pydub": "pydub==0.25.1",
    "huggingface_hub": "huggingface_hub==0.25.2",
    "sentencepiece": "sentencepiece==0.2.0",
    "tokenizers": "tokenizers==0.20.1",
    "datasets": "datasets==3.0.1",
    "wandb": "wandb==0.17.5",
    "tensorboardX": "tensorboardX==2.6.2.2",
    "rotary_embedding_torch": "rotary-embedding-torch==0.6.5",
    "diffq": "diffq==0.2.4",
    "julius": "julius==0.2.7",
    "ml_collections": "ml_collections==0.1.1",
    "easydict": "easydict==1.13",
    "ffmpegcv": "ffmpegcv==0.3.15",
    "cpm_kernels": "cpm-kernels==1.0.11",
    "albumentations": "albumentations==1.4.18",
    "kornia_rs": "kornia_rs==0.1.5",
}


def run(cmd, timeout=600, check=True):
    print(f"\n>>> {cmd[:300]}{'...' if len(cmd) > 300 else ''}")
    sys.stdout.flush()
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, bufsize=1, universal_newlines=True)
    out_lines = []
    try:
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue
            if 'it/s]' in line or 's/it]' in line:
                continue
            print(line)
            sys.stdout.flush()
            out_lines.append(line)
    finally:
        proc.wait(timeout=timeout)
    result = subprocess.CompletedProcess(cmd, proc.returncode, "\n".join(out_lines), "")
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result


def pip_install(spec, timeout=1800, allow_fail=True):
    cmd = f"{sys.executable} -m pip install --no-cache-dir {spec} {TORCH_PINS}"
    r = run(cmd, timeout=timeout, check=False)
    if r.returncode == 0:
        return True
    print(f"  [FALLBACK] plain install failed for '{spec}', retrying with --no-deps")
    r2 = run(f"{sys.executable} -m pip install --no-cache-dir --no-deps {spec}",
             timeout=timeout, check=False)
    if r2.returncode == 0:
        return True
    if not allow_fail:
        print(f"[FATAL] could not install {spec}")
        sys.exit(1)
    return False


def self_healing_import(pyfile, label, max_rounds=8):
    for rnd in range(1, max_rounds + 1):
        r = run(f"{sys.executable} {pyfile}", timeout=900, check=False)
        if r.returncode == 0:
            print(f"  [OK] {label} passed (round {rnd})")
            return True
        m = re.search(r"No module named '([^']+)'", r.stdout)
        if not m:
            print(f"  [FATAL] {label} failed with a NON-import error (see log above)")
            return False
        mod = m.group(1).split(".")[0]
        spec = DEP_MAP.get(mod, mod)
        print(f"  [HEAL] round {rnd}: missing module '{mod}' -> pip install {spec}")
        if not pip_install(spec, timeout=1200, allow_fail=False):
            return False
    print(f"  [FATAL] {label} still failing after {max_rounds} healing rounds")
    return False


def hf_download(repo_id, dest):
    if os.path.isdir(dest) and any(os.scandir(dest)):
        print(f"  [SKIP] {dest} already present")
        return
    os.makedirs(dest, exist_ok=True)
    for attempt in range(1, 4):
        print(f"  [HF] attempt {attempt}: {repo_id} -> {dest}")
        r = run(
            f"HF_HUB_DISABLE_XET=1 {sys.executable} -m huggingface_hub.commands.huggingface_cli "
            f"download {repo_id} --local-dir {dest}",
            timeout=7200, check=False,
        )
        if r.returncode == 0 and any(os.scandir(dest)):
            n = sum(len(files) for _, _, files in os.walk(dest))
            print(f"  [OK] {repo_id} downloaded ({n} files)")
            return
        print(f"  [RETRY] {repo_id} attempt {attempt} failed, sleep 10s")
        time.sleep(10)
    print(f"  [FATAL] could not download {repo_id}")
    sys.exit(1)


def show_tree(root, max_depth=2, limit=80):
    if not os.path.isdir(root):
        print(f"  [TREE] {root} MISSING")
        return
    root = root.rstrip("/")
    shown = 0
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath[len(root):].count(os.sep)
        if depth >= max_depth:
            dirnames[:] = []
        indent = "  " * (depth + 1)
        print(f"  [TREE] {indent}{os.path.basename(dirpath)}/")
        for fn in sorted(filenames)[:12]:
            if shown >= limit:
                print("  [TREE] ... (truncated)")
                return
            try:
                mb = os.path.getsize(os.path.join(dirpath, fn)) / 1024 / 1024
                print(f"  [TREE] {indent}  {fn}  ({mb:.1f} MB)")
            except OSError:
                print(f"  [TREE] {indent}  {fn}")
            shown += 1


@atexit.register
def _copy_debug_on_exit():
    try:
        shutil.copy(DEBUG_LOG, os.path.join(WORK_DIR, "hallo3_debug_log.txt"))
    except Exception:
        pass


# ------------------------------------------------------------------ preflight
# Stage-1 smoke: prove the environment can import hallo3's modules AND that the
# GPU can actually run the configured precision. This runs BEFORE the 35GB
# download, so a bf16/VRAM failure costs ~5 min of Kaggle quota, not 30+.
PREFLIGHT_SRC = r'''
import sys, os, traceback
HALLO3_DIR = "{HALLO3_DIR}"
sys.path.insert(0, HALLO3_DIR)

import torch
print("torch", torch.__version__, "| cuda avail:", torch.cuda.is_available())
if not torch.cuda.is_available():
    print("PREFLIGHT_RESULT=FAIL reason=no_cuda")
    sys.exit(1)
gpu_name = torch.cuda.get_device_name(0)
total_vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
print(f"gpu: {gpu_name} | VRAM: {total_vram_gb:.1f} GB")
cap = torch.cuda.get_device_capability(0)
print(f"compute capability: sm_{cap[0]}{cap[1]}")

# --- bf16 compatibility (the first hard gate) ---
# configs/inference.yaml sets "bf16: True". bf16 Tensor Cores need Ampere sm_80+.
# T4 is sm_75 (Turing) -> is_bf16_supported() returns False.
bf16_ok = torch.cuda.is_bf16_supported()
print(f"bf16 supported on this GPU: {bf16_ok}")

# --- VRAM estimate (the second hard gate) ---
# From configs/cogvideox_5b_i2v_s2.yaml (信源: 官方配置):
#   network_config: DiT 42 layers, hidden 3072, 48 heads, patch 2, in_ch 32, out 16
#   ref_network_config: identical 42-layer DiT (checkpoint_activations: False)
#   conditioner: FrozenT5Embedder (T5-v1_1-xxl, ~4.7B params)
#   first_stage: CogVideo 3D VAE (~几百M)
# Parameter count estimate (rough, bf16 = 2 bytes/param):
#   main DiT:  ~5B params (CogVideo-5B I2V backbone)
#   ref  DiT:  ~5B params (reference network, same arch)
#   T5-XXL:    ~4.7B params
#   VAE+audio: ~0.5B params
#   total weights ~15.2B params -> ~30.4 GB in bf16
# Inference activations (50 steps, 13 frames, 720x480, batch 1): +5-10 GB peak
# => peak VRAM ~35-40 GB. T4 16GB is ~2.5x short.
DIT_PARAMS = 5.0e9      # main network (信源: CogVideo-5B I2V)
REF_DIT_PARAMS = 5.0e9  # ref_network (信源: same arch, checkpoint_activations: False)
T5_PARAMS = 4.7e9       # T5-v1_1-xxl
VAE_PARAMS = 0.5e9      # 3D VAE + wav2vec + face_analysis
TOTAL_PARAMS = DIT_PARAMS + REF_DIT_PARAMS + T5_PARAMS + VAE_PARAMS
WEIGHT_GB_BF16 = TOTAL_PARAMS * 2 / 1024**3
ACTIVATION_GB = 8.0     # 50 steps x 13 frames x 720x480 latent (conservative)
PEAK_GB = WEIGHT_GB_BF16 + ACTIVATION_GB
print(f"VRAM estimate: weights {WEIGHT_GB_BF16:.1f} GB (bf16) + activations ~{ACTIVATION_GB:.0f} GB = peak ~{PEAK_GB:.0f} GB")
print(f"T4 VRAM: {total_vram_gb:.1f} GB | shortfall: {PEAK_GB - total_vram_gb:.0f} GB")

# --- verdict ---
failures = []
if not bf16_ok:
    failures.append(
        f"bf16 NOT supported on {gpu_name} (sm_{cap[0]}{cap[1]}). "
        f"configs/inference.yaml sets bf16: True. Need Ampere sm_80+ (A100/H100/L4)."
    )
if PEAK_GB > total_vram_gb:
    failures.append(
        f"VRAM shortfall: estimated peak {PEAK_GB:.0f} GB > {total_vram_gb:.1f} GB available. "
        f"Short by {PEAK_GB - total_vram_gb:.0f} GB. No cpu_offload/quant option in configs."
    )

if failures:
    print("\n=== STAGE-1 SMOKE FAILED (T4 不可行) ===")
    for f in failures:
        print(f"  - {f}")
    print("\n建议: 直接上 Modal A100-80GB (你之前跑 LongCat/InfiniteTalk 用过, ~$1-2/次).")
    print("       T4 16GB 既不支持 bf16, 显存也不够 (35-40GB 峰值).")
    print("PREFLIGHT_RESULT=FAIL reason=" + ";".join(f.split(":")[0] for f in failures))
    sys.exit(2)

print("PREFLIGHT_RESULT=PASS bf16={} peak_gb={:.0f} vram_gb={:.1f}".format(bf16_ok, PEAK_GB, total_vram_gb))
'''


def main():
    t_start = time.time()

    print("=== STEP 1/6: clone hallo3 (depth 1) ===")
    if os.path.isfile(os.path.join(HALLO3_DIR, "hallo3", "sample_video.py")):
        print("  [SKIP] hallo3 already cloned")
    else:
        run(f"rm -rf {HALLO3_DIR}")
        run(f"git clone --depth 1 https://github.com/fudan-generative-vision/hallo3 {HALLO3_DIR}",
            timeout=600)

    print("=== STEP 2/6: install inference deps (repo-pinned torch 2.4.0+cu121) ===")
    # torch first (biggest, pins CUDA build). T4 sm_75 is cu121-compatible.
    run(f"{sys.executable} -m pip install --no-cache-dir {TORCH_PINS}", timeout=1800)
    # Core inference deps. Full requirements.txt has 100+ pins; install the
    # critical path and let self_healing_import catch the rest.
    pip_install(
        "transformers==4.45.2 accelerate safetensors==0.4.3 einops==0.8.0 "
        "omegaconf==2.3.0 numpy==1.26.4 pillow==11.0.0 opencv-python-headless==4.10.0.84 "
        "librosa==0.10.2.post1 soundfile decord==0.6.0 av==12.1.0 imageio==2.34.2 "
        "imageio-ffmpeg==0.5.1 insightface==0.7.3 mediapipe==0.10.14 "
        "pytorch-lightning==2.3.3 deepspeed==0.14.4 SwissArmyTransformer==0.4.12 "
        "tqdm==4.66.5 loguru pyyaml==6.0.2 scipy==1.14.0 scikit-image==0.24.0 "
        "kornia==0.7.3 moviepy==1.0.3 pydub==0.25.1 huggingface_hub==0.25.2 "
        "sentencepiece==0.2.0 tokenizers==0.20.1 datasets==3.0.1 "
        "rotary-embedding-torch==0.6.5 diffq==0.2.4 julius==0.2.7 "
        "ml_collections==0.1.1 easydict==1.13 ffmpegcv==0.3.15 "
        "cpm-kernels==1.0.11 albumentations==1.4.18",
        timeout=3000,
        allow_fail=False,
    )
    # jax/jaxlib are in requirements.txt (CogVideo may use them for T5)
    pip_install("jax==0.4.36 jaxlib==0.4.36", timeout=1200, allow_fail=True)
    # onnxruntime-gpu for insightface/mediapipe
    pip_install("onnxruntime-gpu==1.19.2", timeout=1200, allow_fail=True)

    print("=== STEP 3/6: STAGE-1 SMOKE (bf16 + VRAM gate, BEFORE 35GB download) ===")
    preflight_path = "/tmp/preflight_check.py"
    with open(preflight_path, "w") as f:
        f.write(PREFLIGHT_SRC.replace("{HALLO3_DIR}", HALLO3_DIR))
    r = run(f"{sys.executable} {preflight_path}", timeout=300, check=False)
    if r.returncode != 0:
        print("\n[STAGE-1 SMOKE FAILED] — T4 不可行, 跳过 35GB 下载, 不浪费配额.")
        print("    结论: Hallo3 需 A100/H100 (bf16 + 35-40GB VRAM). 请改用 Modal A100-80GB.")
        print(f"[SMOKE DONE] total wall {time.time()-t_start:.1f}s (省去 ~30min 下载)")
        return

    print("  [SURPRISE] STAGE-1 冒烟通过 — bf16 可用且 VRAM 估算 <= 显存.")
    print("             (若你看到这行, 说明 GPU 不是 T4 或估算偏大, 继续下载+推理)")

    print("=== STEP 4/6: download all pretrained weights (~35GB) ===")
    # README: huggingface-cli download fudan-generative-ai/hallo3 --local-dir ./pretrained_models
    # Contains: hallo3/ + cogvideox-5b-i2v-sat/ + t5-v1_1-xxl/ + wav2vec/ + audio_separator/ + face_analysis/
    hf_download("fudan-generative-ai/hallo3", PRETRAINED)
    show_tree(PRETRAINED, max_depth=2, limit=120)

    # Verify the layout the configs expect (信源: README directory tree)
    expected = [
        "hallo3",
        "cogvideox-5b-i2v-sat/transformer",
        "cogvideox-5b-i2v-sat/vae/3d-vae.pt",
        "t5-v1_1-xxl",
        "wav2vec/wav2vec2-base-960h",
        "audio_separator/Kim_Vocal_2.onnx",
        "face_analysis/models",
    ]
    missing = [p for p in expected if not os.path.exists(os.path.join(PRETRAINED, p))]
    if missing:
        print(f"[FATAL] missing weight paths: {missing}")
        sys.exit(1)
    print("  [OK] all expected weight paths present")

    print("=== STEP 5/6: run inference with official examples (English audio) ===")
    # Hallo3 要求英文音频 (README: "Audio must be in English"). 官方 examples/inference/
    # 是英文素材, 用它验证端到端. 后续可用我们的照片(裁切 1:1/3:2) + 英文 TTS 音频.
    input_txt = os.path.join(HALLO3_DIR, "examples", "inference", "input.txt")
    out_dir = os.path.join(WORK_DIR, "output")
    os.makedirs(out_dir, exist_ok=True)
    # 只跑第一行 (快速验证端到端, 不跑全部 6 行)
    first_line = None
    with open(input_txt) as f:
        for line in f:
            if line.strip():
                first_line = line.strip()
                break
    if not first_line:
        print("[FATAL] examples/inference/input.txt empty")
        sys.exit(1)
    smoke_input = os.path.join(WORK_DIR, "smoke_input.txt")
    with open(smoke_input, "w") as f:
        f.write(first_line + "\n")
    print(f"  smoke input: {first_line[:80]}...")

    # 推理命令 (信源: scripts/inference_long_batch.sh)
    cmd = (
        f"cd {HALLO3_DIR} && "
        f"WORLD_SIZE=1 RANK=0 LOCAL_RANK=0 LOCAL_WORLD_SIZE=1 "
        f"{sys.executable} hallo3/sample_video.py "
        f"--base ./configs/cogvideox_5b_i2v_s2.yaml ./configs/inference.yaml "
        f"--seed 42 --input-file {smoke_input} --output-dir {out_dir}"
    )
    t_inf = time.time()
    r = run(cmd, timeout=5400, check=False)
    dt = time.time() - t_inf
    print(f"  inference wall: {dt:.1f}s, exit code: {r.returncode}")

    # 收集产物
    mp4s = []
    for root, _, files in os.walk(out_dir):
        for fn in files:
            if fn.endswith(".mp4"):
                p = os.path.join(root, fn)
                mp4s.append((p, os.path.getsize(p) / 1024 / 1024))
    print("\n=== INFERENCE RESULTS ===")
    if mp4s:
        for p, mb in mp4s:
            print(f"  [OK] {p}  ({mb:.1f} MB)")
            # ffprobe 规格
            run(f'ffprobe -v error -show_entries stream=width,height,nb_frames,r_frame_rate,codec_name '
                f'-of default=noprint_wrappers=1 "{p}"', timeout=60, check=False)
        print(f"\n[SUCCESS] Hallo3 在 T4 上跑通! {len(mp4s)} mp4 产出.")
    else:
        print("  [FAIL] no mp4 produced — likely OOM during inference.")
        print("         检查上方 log 的 CUDA OOM / out of memory 行.")

    print("=== STEP 6/6: defensive entrypoints pin (Kaggle post-run nbconvert) ===")
    run(f"{sys.executable} -m pip install -q --no-cache-dir 'entrypoints<0.5'",
        timeout=600, check=False)

    print(f"[ALL DONE] total wall {time.time()-t_start:.1f}s")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        print(traceback.format_exc())
        raise