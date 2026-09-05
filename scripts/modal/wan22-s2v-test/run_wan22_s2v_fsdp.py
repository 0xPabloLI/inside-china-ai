"""
Wan2.2-S2V-14B — Modal 2×A100-80GB FSDP 推理（方向A：去 offload）

Usage:
    modal run --detach scripts/modal/wan22-s2v-test/run_wan22_s2v_fsdp.py

Hardware: 2×A100-80GB ($4.20/h 总) — FSDP 分摊模型去 offload，每步不搬模型
对比基线: 单卡 offload 62.6min/$2.19；预期 ~16min/$1.12（-49%）

信源：
- 多卡命令：Wan-Video/Wan2.2 官方 README "Multi-GPU inference using FSDP + DeepSpeed Ulysses"
- 不加 --ulysses_size（默认1）：纯 FSDP 不 Ulysses，避免 xfuser 依赖
- 不加 --offload_model：多卡（world_size>1）代码默认 offload=False
"""

import modal
import os
import subprocess
import sys
import time

app = modal.App("wan22-s2v-fsdp-test")

vol = modal.Volume.from_name("wan22-s2v-models", create_if_missing=True)

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.0-devel-ubuntu22.04",
        add_python="3.10",
    )
    .apt_install("ffmpeg", "git", "libgl1", "libglib2.0-0")
    .pip_install("ninja")
    .pip_install(
        "torch==2.7.1",
        "torchvision==0.22.1",
        "torchaudio==2.7.1",
        index_url="https://download.pytorch.org/whl/cu128",
    )
    .run_commands(
        "pip install packaging wheel setuptools",
        "pip install flash_attn==2.8.0.post2 --no-build-isolation",
    )
    .pip_install(
        "opencv-python>=4.9.0.80",
        "diffusers>=0.31.0",
        "transformers>=4.49.0,<=4.51.3",
        "tokenizers>=0.20.3",
        "accelerate>=1.1.1",
        "tqdm",
        "imageio[ffmpeg]",
        "easydict",
        "ftfy",
        "dashscope",
        "imageio-ffmpeg",
        "numpy>=1.23.5,<2",
        "huggingface_hub[cli]",
        "hf_transfer",
        "decord",
        "librosa",
        "modelscope",
        "GitPython",
        "omegaconf",
        "scipy",
        "pillow",
        "peft",
    )
    .run_commands("git clone https://github.com/Wan-Video/Wan2.2.git /repo")
    .run_commands("pip install -r /repo/requirements.txt peft")
    .add_local_dir(
        "scripts/short-video/assets/dh-fixtures",
        "/root/fixtures",
    )
)


@app.function(
    image=image,
    gpu="a100-80gb:2",
    volumes={"/root/models": vol},
    timeout=7200,
)
def run_test() -> bytes:
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

    from huggingface_hub import snapshot_download

    repo_id = "Wan-AI/Wan2.2-S2V-14B"
    local_dir = "/root/models/Wan2.2-S2V-14B"
    print(f"[download] {repo_id} → {local_dir} (snapshot_download auto-skips existing files)")
    t0 = time.time()
    snapshot_download(repo_id=repo_id, local_dir=local_dir)
    print(f"  done in {time.time() - t0:.0f}s")

    vol.commit()

    os.chdir("/repo")
    cmd = [
        sys.executable, "-m", "torch.distributed.run", "--nproc_per_node=2",
        "generate.py",
        "--task", "s2v-14B",
        "--size", "1024*704",
        "--ckpt_dir", local_dir,
        "--dit_fsdp",
        "--t5_fsdp",
        "--prompt", "A person is talking to camera, frontal face, static background.",
        "--image", "/root/fixtures/portrait-face.jpg",
        "--audio", "/root/fixtures/audio.wav",
        "--save_file", "/root/s2v_output_fsdp.mp4",
    ]
    print(f"[run] {' '.join(cmd)}")
    t0 = time.time()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    for line in proc.stdout:
        line_stripped = line.rstrip()
        if line_stripped:
            print(line_stripped, flush=True)
    proc.wait()
    elapsed = time.time() - t0

    if proc.returncode != 0:
        print(f"[FAIL] returncode={proc.returncode}, elapsed={elapsed:.0f}s")
        raise RuntimeError(f"Inference failed (rc={proc.returncode})")

    print(f"[ok] inference done in {elapsed:.0f}s ({elapsed/60:.1f}min)")

    out = "/root/s2v_output_fsdp.mp4"
    if not os.path.exists(out):
        raise FileNotFoundError(f"Output not found: {out}")
    with open(out, "rb") as f:
        return f.read()


@app.local_entrypoint()
def main():
    video_bytes = run_test.remote()
    out_dir = "scripts/short-video/experiments/digital-human/wan22-s2v"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "wan22_s2v_14b_2xa100_fsdp.mp4")
    with open(out_path, "wb") as f:
        f.write(video_bytes)
    print(f"[saved] {out_path} ({len(video_bytes)} bytes)")