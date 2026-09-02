#!/usr/bin/env python3
"""
LongCat-Video-Avatar-1.5 v11.1-modal: 首次云端原版测试（MIT，可商用 ✅）

背景:
- MLX q4 本地版已判不可用（不像本人 + 唇同步错位，见 docs/research/digital-human-test-progress.md）
- 本脚本测云端原版权重，bf16 全精度 + 官方 8 步 DMD 蒸馏

参数（全部官方信源，2026-09-02 抓取）:
- 来源①: HF 模型卡 meituan-longcat/LongCat-Video-Avatar-1.5「Quick Inference」命令
- 来源②: 官方源码 run_demo_avatar_single_audio_to_video.py（main 分支，jsdelivr 代理抓取）
- steps=8: 官方源码 L71-72，use_distill + avatar-v1.5 时硬编码 8（DMD2 蒸馏，官方宣称 50→8）
- text_guidance_scale=4.0 / audio_guidance_scale=4.0: 官方 argparse 默认；模型卡 tip「Audio CFG 最优 3–5，
  提高可增强唇同步」→ 首跑用官方默认 4.0
- resolution=480p: 官方默认（支持 480p/720p）
- ref_img_index=10 / mask_frame_range=3: 官方默认（README tip: 0-24 一致性更好）
- prompt: 模型卡 tip 要求长描述性 prompt + 明确 "speaking" 动作词
- 官方命令带 --use_int8（INT8 生产路径）；首跑用 bf16 全精度（质量上限）——显存账：
  bf16 常驻 = text_encoder(UMT5 ~23GB) + DiT(~31.7GB) + whisper-large-v3(~3GB) + VAE(0.5GB) ≈ 58GB + 激活值
- INT8 A/B 变体已注释（首跑先验证 bf16，成功后再低成本对比量化损失）

硬件决策（Modal 定价 2026-09-02）:
- 权重全部 pipe.to(gpu) 常驻（官方源码 L172），无分层 offload
- bf16 全常驻 ≈58GB+激活 → 80GB 卡是最低门槛:
  | GPU        | $/h   | VRAM | 结论                                   |
  |------------|-------|------|----------------------------------------|
  | A100-40GB  | $2.10 | 40GB | ❌ 58GB 装不下                          |
  | L40S 48GB  | $1.95 | 48GB | ❌ bf16 装不下（INT8 勉强，社区 48GB OOM 案例）|
  | A100-80GB  | $2.50 | 80GB | ✅ 最便宜可行，沿用 InfiniteTalk 基础设施 | ← 当前
  | 2×A100-40  | $3.76 | 80GB | 官方 CP=2 配置，但单卡 40GB 装 text_encoder(23GB)+分片 DiT 很紧，且更贵 |
  | H100       | $3.95 | 80GB | 可行但比 A100-80 贵 58%，速度收益留给生产 |
- 社区佐证: A6000 48GB 跑 INT8+480p OOM（CSDN ask 9672748）；48GB 跑官方 demo OOM（GitHub issue #79）

Usage:
  cd /Users/pabloli/Documents/code/inside-china-ai
  HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 \
    NODE_USE_ENV_PROXY=1 modal run --detach scripts/short-video/experiments/modal-longcat-avatar.py

Output:
  scripts/short-video/experiments/digital-human/longcat/longcat_v111_bf16_distill.mp4
"""
import os
import sys
import time
import json
import shutil
import subprocess

import modal

app = modal.App("longcat-avatar-inference")

# Persistent volume for model weights (download once, reuse)
vol = modal.Volume.from_name("longcat-models", create_if_missing=True)

WEIGHTS_DIR = "/root/weights"
LCV_DIR = f"{WEIGHTS_DIR}/LongCat-Video"            # tokenizer + text_encoder + vae（官方源码从 checkpoint_dir/../LongCat-Video 读取）
LCVA_DIR = f"{WEIGHTS_DIR}/LongCat-Video-Avatar-1.5"  # base_model + lora + whisper + scheduler + vocal_separator
WORK_DIR = "/root/work"

# Image: python 3.10（官方 conda 环境版本，匹配 flash-attn 预编译 wheel cp310）
# flash-attn 2.7.4.post1 用 GitHub Release 预编译 wheel（cu12+torch2.6），避免源码编译 30-60min
FLASH_ATTN_WHEEL = (
    "https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/"
    "flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-cp310-cp310-linux_x86_64.whl"
)
image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.10")
    .apt_install("ffmpeg", "git", "libsndfile1")
    .pip_install("torch==2.6.0", "torchvision==0.21.0", "torchaudio==2.6.0",
                 index_url="https://download.pytorch.org/whl/cu124")
    .pip_install(FLASH_ATTN_WHEEL)
    # 官方 requirements.txt + requirements_avatar.txt 精选子集（去掉 streamlit/tritonserverclient/openai 等非推理依赖）
    .pip_install(
        "transformers==4.41.0",
        "diffusers==0.35.1",
        "accelerate",
        "einops",
        "ftfy",
        "loguru",
        "opencv-python==4.9.0.80",
        "av==12.0.0",
        "imageio",
        "imageio-ffmpeg",
        "scikit-image==0.25.2",
        "scipy==1.15.3",
        "numpy==1.26.4",
        "librosa==0.11.0",
        "soundfile",
        "soxr",
        "pyloudnorm",
        "audio-separator==0.30.2",
        "onnx==1.18.0",
        "onnxruntime==1.16.3",
        "Pillow",
    )
    .env({"HF_HUB_DISABLE_XET": "1"})
    # 官方仓库克隆进镜像层（构建时完成并永久缓存，GPU 容器免去 ~30s 运行时克隆 = 几分钱/次）
    .run_commands(
        "git clone --single-branch --branch main https://github.com/meituan-longcat/LongCat-Video.git /root/LongCat-Video",
    )
)


def run(cmd, timeout=600, check=True):
    """Run shell command with live output streaming."""
    print(f"\n$ {cmd[:300]}")
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    output_lines = []
    try:
        for line in proc.stdout:
            print(f"  {line.rstrip()}")
            output_lines.append(line)
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        print(f"  [TIMEOUT after {timeout}s]")
        if check:
            raise
        return subprocess.CompletedProcess(cmd, -1, "".join(output_lines))
    if check and proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {cmd[:200]}")
    return subprocess.CompletedProcess(cmd, proc.returncode, "".join(output_lines))


@app.function(
    image=image,
    volumes={WEIGHTS_DIR: vol},
    timeout=5400,
    cpu=8,
    memory=32768,
)
def download_weights_cpu():
    """CPU-only 预下载权重到 Volume（经验：不占 GPU 计费，沿用 InfiniteTalk 模式）。"""
    os.makedirs(WEIGHTS_DIR, exist_ok=True)

    # ① LongCat-Video 基础仓：只下 tokenizer/text_encoder/vae（官方源码 L113-115 用途），
    #    跳过 dit/（~54GB，avatar 推理不用自己的 DiT）和 lora/（cfg_step/refinement，avatar 不用）
    if not os.path.exists(f"{LCV_DIR}/text_encoder/model-00005-of-00005.safetensors"):
        print("\n  Downloading LongCat-Video tokenizer/text_encoder/vae (~24GB)...")
        run(
            f"hf download meituan-longcat/LongCat-Video --local-dir {LCV_DIR} "
            f"--include 'tokenizer/*' 'text_encoder/*' 'vae/*' 'config.json' 'model_index.json' "
            f"'scheduler/*'",
            timeout=3600,
        )
    else:
        print("  [SKIP] LongCat-Video already on volume")

    # ② Avatar-1.5 仓：bf16 base_model(~31.7GB) + dmd_lora(2.5GB) + scheduler + whisper(只下 fp16 单格式)
    #    + vocal_separator onnx；跳过 base_model_int8(16GB，后续 INT8 A/B 再下) 和 whisper 重复格式
    #    (fp32×2 + pytorch_model.bin + flax ≈ 21GB 冗余)
    if not os.path.exists(f"{LCVA_DIR}/base_model/diffusion_pytorch_model-00006-of-00006.safetensors"):
        print("\n  Downloading LongCat-Video-Avatar-1.5 base_model/lora/whisper (~38GB)...")
        run(
            f"hf download meituan-longcat/LongCat-Video-Avatar-1.5 --local-dir {LCVA_DIR} "
            f"--include 'base_model/*' 'lora/*' 'scheduler/*' 'config.json' 'model_index.json' "
            f"'vocal_separator/*' "
            f"'whisper-large-v3/config.json' 'whisper-large-v3/model.safetensors' "
            f"'whisper-large-v3/preprocessor_config.json' 'whisper-large-v3/tokenizer*' "
            f"'whisper-large-v3/added_tokens.json' 'whisper-large-v3/special_tokens_map.json'",
            timeout=5400,
        )
    else:
        print("  [SKIP] LongCat-Video-Avatar-1.5 already on volume")

    # 校验关键文件（全分片 —— v11.1 教训：只抽首尾分片，中间分片漏下/未 commit 会在 GPU 阶段才爆）
    required = [
        f"{LCV_DIR}/text_encoder/model-0000{i}-of-00005.safetensors" for i in range(1, 6)
    ] + [
        f"{LCV_DIR}/vae/diffusion_pytorch_model.safetensors",
    ] + [
        f"{LCVA_DIR}/base_model/diffusion_pytorch_model-0000{i}-of-00006.safetensors" for i in range(1, 7)
    ] + [
        f"{LCVA_DIR}/base_model/config.json",
        f"{LCVA_DIR}/lora/dmd_lora.safetensors",
        f"{LCVA_DIR}/whisper-large-v3/model.safetensors",
        f"{LCVA_DIR}/vocal_separator/Kim_Vocal_2.onnx",
    ]
    missing = [f for f in required if not os.path.exists(f)]
    if missing:
        raise FileNotFoundError(f"Missing required weights: {missing}")
    print("\n  [OK] All required weights present (full shard verification passed)")

    # 显式 commit：确保 GPU 容器挂载时看到全部文件（v11.1 教训：隐式提交有延迟，GPU 阶段读到旧快照）
    vol.commit()
    print("  [OK] Volume committed")


@app.function(
    image=image,
    gpu="A100-80GB",
    volumes={WEIGHTS_DIR: vol},
    timeout=7200,
    memory=98304,  # 96GB RAM — text_encoder 23GB + DiT 32GB 载入峰值
)
def run_inference(portrait_bytes: bytes, audio_bytes: bytes) -> list:
    """Run LongCat-Video-Avatar-1.5 bf16 + DMD 8-step distill on A100-80GB."""
    total_start = time.time()

    run("nvidia-smi", timeout=30, check=False)
    run("pip list 2>/dev/null | grep -E 'torch|flash|diffusers|transformers'", timeout=60, check=False)

    # Step 1: 官方仓库已在镜像层 /root/LongCat-Video（构建时克隆，运行时零开销）
    print("\n--- Step 1: Verify official repo (image layer) ---")
    repo_dir = "/root/LongCat-Video"
    if not os.path.exists(os.path.join(repo_dir, "run_demo_avatar_single_audio_to_video.py")):
        # 兜底：镜像层缺失时运行时克隆
        os.makedirs(WORK_DIR, exist_ok=True)
        os.chdir(WORK_DIR)
        run("git clone --single-branch --branch main https://github.com/meituan-longcat/LongCat-Video.git",
            timeout=300)
        repo_dir = os.path.join(WORK_DIR, "LongCat-Video")
    os.chdir(repo_dir)
    print(f"Working dir: {os.getcwd()}")

    # Step 2: Verify weights from volume（全分片，含 GPU 阶段二次校验）
    print("\n--- Step 2: Verify Weights ---")
    for f in [
        f"{LCV_DIR}/text_encoder/model-0000{i}-of-00005.safetensors" for i in range(1, 6)
    ] + [
        f"{LCVA_DIR}/base_model/diffusion_pytorch_model-0000{i}-of-00006.safetensors" for i in range(1, 7)
    ] + [
        f"{LCVA_DIR}/lora/dmd_lora.safetensors",
        f"{LCVA_DIR}/scheduler/scheduler_config.json",
    ]:
        if os.path.exists(f):
            print(f"  OK {os.path.basename(f)}")
        else:
            raise FileNotFoundError(f"{f} — run download_weights_cpu first")

    # Step 3: Prepare input data
    print("\n--- Step 3: Prepare Input Data ---")
    examples_dir = os.path.join(repo_dir, "examples_avatar_test")
    os.makedirs(examples_dir, exist_ok=True)
    portrait_path = os.path.join(examples_dir, "portrait.jpg")
    audio_path = os.path.join(examples_dir, "audio.wav")
    with open(portrait_path, "wb") as f:
        f.write(portrait_bytes)
    with open(audio_path, "wb") as f:
        f.write(audio_bytes)
    print(f"  portrait.jpg ({len(portrait_bytes)/1024:.1f} KB), audio.wav ({len(audio_bytes)/1024:.1f} KB)")

    # prompt 按官方模型卡 tip: 长描述性 + 明确 "speaking" 动作词
    PROMPT = (
        "A Chinese man with short black hair, a full black beard, and black-framed glasses "
        "is speaking directly to the camera in a professional setting. He wears a dark polo "
        "shirt with white stripes on the collar. His expression is natural and engaging while "
        "speaking, with subtle head movements and natural blinking. The background is plain "
        "white and well-lit. A medium close-up shot captures his head and shoulders."
    )
    input_json = {
        "prompt": PROMPT,
        "cond_image": "examples_avatar_test/portrait.jpg",
        "cond_audio": {"person1": "examples_avatar_test/audio.wav"},
    }
    json_path = os.path.join(examples_dir, "input.json")
    with open(json_path, "w") as f:
        json.dump(input_json, f, indent=4)
    print(f"  Created input JSON: {json_path}")

    # 参数自检表（对照官方模型卡 Quick Inference + 官方源码 argparse 默认）
    print("\n  ┌── 参数自检表（官方 v1.5 配方） ──────────────────┐")
    print("  │ 参数                    │ 当前值 │ 官方来源        │ 状态 │")
    print("  │─────────────────────────┼────────┼─────────────────│──────│")
    print("  │ model_type              │ v1.5   │ 模型卡命令       │  ✅  │")
    print("  │ use_distill → steps     │   8    │ 源码 L71 硬编码  │  ✅  │")
    print("  │ text_guidance_scale     │  4.0   │ 源码默认         │  ✅  │")
    print("  │ audio_guidance_scale    │  4.0   │ 源码默认/tip 3-5 │  ✅  │")
    print("  │ resolution              │ 480p   │ 源码默认         │  ✅  │")
    print("  │ ref_img_index           │  10    │ 源码默认         │  ✅  │")
    print("  │ mask_frame_range        │   3    │ 源码默认         │  ✅  │")
    print("  │ quant                   │  无    │ bf16 全精度首跑  │  ✅  │")
    print("  │ GPU                     │A100-80G│ bf16 需 80GB     │  ✅  │")
    print("  └────────────────────────────────────────────────────┘")

    # Step 4: Run inference（bf16 全精度 + DMD 8 步；官方单卡写法 torchrun nproc=1 + CP=1）
    # INT8 A/B 变体（--use_int8）注释保留：bf16 成功后低成本对比量化损失
    VARIANTS = [
        # (extra_flags, save_file)
        ("", "longcat_v111_bf16_distill"),
        # ("--use_int8", "longcat_v112_int8_distill"),  # 后续 A/B
    ]

    saved_outputs = []
    for extra_flags, save_file in VARIANTS:
        print(f"\n  ═══ Variant: flags='{extra_flags or 'bf16'}' → {save_file} ═══")
        cmd = (
            f"cd {repo_dir} && "
            f"PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True "
            f"torchrun --nproc_per_node=1 "
            f"run_demo_avatar_single_audio_to_video.py "
            f"--context_parallel_size=1 "
            f"--checkpoint_dir {LCVA_DIR} "
            f"--stage_1=ai2v "
            f"--input_json {json_path} "
            f"--use_distill --model_type avatar-v1.5 "
            f"--resolution 480p "
            f"--num_inference_steps 8 "
            f"--text_guidance_scale 4.0 "
            f"--audio_guidance_scale 4.0 "
            f"{extra_flags} "
            f"--output_dir {os.path.join(repo_dir, 'outputs_avatar_test')}"
        )

        print(f"\n  Command: {cmd[:400]}...")
        t_inf = time.time()
        result = run(cmd, timeout=5400, check=False)
        inf_time = (time.time() - t_inf) / 60
        print(f"\n  Variant inference time: {inf_time:.1f} min")

        # 出片立即写 Volume（失败隔离）
        output_dir = os.path.join(repo_dir, "outputs_avatar_test")
        output_path = None
        if os.path.isdir(output_dir):
            for root, _, files in os.walk(output_dir):
                for fn in files:
                    if fn.endswith(".mp4"):
                        output_path = os.path.join(root, fn)
                        break

        if output_path:
            print(f"  [OK] Output found: {output_path} ({os.path.getsize(output_path)/1024:.1f} KB)")
            vol_output = os.path.join(WEIGHTS_DIR, "outputs", f"{save_file}.mp4")
            os.makedirs(os.path.dirname(vol_output), exist_ok=True)
            shutil.copy2(output_path, vol_output)
            vol.commit()
            print(f"  [OK] Saved to Volume: {vol_output}")
            saved_outputs.append(f"{save_file}.mp4")
        else:
            print(f"  [ERROR] Variant {save_file}: no output video found!")
            run(f"find {repo_dir}/outputs_avatar_test -type f 2>/dev/null | head -20",
                timeout=10, check=False)

    total_time = (time.time() - total_start) / 60
    print(f"\n{'='*70}")
    print(f"Total time: {total_time:.1f} min | Saved variants: {saved_outputs}")
    print(f"{'='*70}")
    return saved_outputs


@app.local_entrypoint()
def main(
    portrait: str = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/self-portrait.jpg",
    audio: str = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/voice-samples/voice-sample-24k-3s.wav",
    output_dir: str = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/experiments/digital-human/longcat",
    detach: bool = True,
):
    """Run LongCat-Video-Avatar-1.5 (bf16 + DMD 8-step) on Modal A100-80GB.

    Usage:
      modal run --detach scripts/short-video/experiments/modal-longcat-avatar.py

    Two-phase: CPU-only weight download (no GPU billing), then GPU inference.
    """
    with open(portrait, "rb") as f:
        portrait_bytes = f.read()
    with open(audio, "rb") as f:
        audio_bytes = f.read()
    print(f"Portrait: {len(portrait_bytes)/1024:.1f} KB | Audio: {len(audio_bytes)/1024:.1f} KB")

    # Phase 1: CPU download（跳过 GPU 计费；权重已存在时秒过）
    print("\n=== Phase 1: Ensure weights downloaded (CPU-only) ===")
    download_weights_cpu.remote()

    # Phase 2: GPU inference
    print("\n=== Phase 2: GPU inference ===")
    saved = run_inference.remote(portrait_bytes, audio_bytes)
    print(f"\nSaved on volume: {saved}")

    if saved:
        os.makedirs(output_dir, exist_ok=True)
        import subprocess as sp
        for fn in saved:
            target = os.path.join(output_dir, fn)
            sp.run(["modal", "volume", "get", "longcat-models", f"outputs/{fn}", target], check=False)  # Volume 路径不含 /weights 前缀（那是容器内挂载点）
            if os.path.exists(target):
                print(f"[OK] Downloaded: {target} ({os.path.getsize(target)/1024:.1f} KB)")
