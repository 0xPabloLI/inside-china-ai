"""
SoulX-FlashTalk 14B — Modal A100-80GB 推理测试

Usage:
    modal run scripts/modal/soulx-flashtalk-test/run_flashtalk.py

Hardware: Modal A100-80GB ($2.10/h) — 唯一能不加 cpu_offload 跑 64GB+ 的 Modal GPU
Input:    portrait-fullbody.jpg (1080×1920 竖版全身) + audio.wav (16kHz mono)
Output:   448×832 talking body video

First run: ~15-20min (image build + model download ~56GB + inference)
Cached run: ~5-8min (model load + inference)
"""

import modal
import os
import subprocess
import sys
import time

app = modal.App("soulx-flashtalk-test")

vol = modal.Volume.from_name("soulx-flashtalk-models", create_if_missing=True)

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
        index_url="https://download.pytorch.org/whl/cu128",
    )
    .run_commands(
        "pip install packaging wheel setuptools",
        "pip install flash_attn==2.8.0.post2 --no-build-isolation",
    )
    .pip_install(
        "opencv-python>=4.12.0.88",
        "opencv-python-headless>=4.12.0.88",
        "diffusers>=0.34.0",
        "transformers>=4.46.3",
        "tokenizers>=0.20.3",
        "accelerate>=1.8.1",
        "tqdm",
        "imageio",
        "easydict",
        "ftfy",
        "imageio-ffmpeg",
        "scikit-image",
        "loguru",
        "gradio>=5.0.0",
        "xfuser>=0.4.3",
        "pyloudnorm",
        "decord",
        "xformers==0.0.31",
        "librosa",
        "optimum-quanto==0.2.6",
        "huggingface_hub[cli]",
    )
    .run_commands("git clone https://github.com/Soul-AILab/SoulX-FlashTalk.git /repo")
    .add_local_file("scripts/modal/soulx-flashtalk-test/patch_wav2vec.py", "/root/patch_wav2vec.py", copy=True)
    .run_commands("python3 /root/patch_wav2vec.py")
    .add_local_dir(
        "scripts/short-video/assets/dh-fixtures",
        "/root/fixtures",
    )
)


@app.function(
    image=image,
    gpu="a100-80gb",
    volumes={"/root/models": vol},
    timeout=3600,
)
def run_test() -> bytes:
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

    # ── Download model weights (cached in volume) ──
    from huggingface_hub import snapshot_download

    models = [
        ("Soul-AILab/SoulX-FlashTalk-14B", "/root/models/SoulX-FlashTalk-14B"),
        ("TencentGameMate/chinese-wav2vec2-base", "/root/models/chinese-wav2vec2-base"),
    ]
    for repo_id, local_dir in models:
        if os.path.exists(local_dir) and os.listdir(local_dir):
            print(f"[skip] {repo_id} already cached")
        else:
            print(f"[download] {repo_id} → {local_dir}")
            t0 = time.time()
            snapshot_download(repo_id=repo_id, local_dir=local_dir)
            print(f"  done in {time.time() - t0:.0f}s")

    vol.commit()

    # ── Run inference ──
    os.chdir("/repo")
    cmd = [
        sys.executable, "generate_video.py",
        "--ckpt_dir", "/root/models/SoulX-FlashTalk-14B",
        "--wav2vec_dir", "/root/models/chinese-wav2vec2-base",
        "--cond_image", "/root/fixtures/portrait-original-4k.jpg",
        "--audio_path", "/root/fixtures/audio.wav",
        "--input_prompt", "A person is talking. Only the foreground characters are moving, the background remains static.",
        "--audio_encode_mode", "stream",
        "--save_file", "/root/res_output.mp4",
    ]
    print(f"[run] {' '.join(cmd)}")
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - t0

    print(result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout)
    if result.returncode != 0:
        print(f"[FAIL] returncode={result.returncode}, elapsed={elapsed:.0f}s")
        print(result.stderr[-3000:] if len(result.stderr) > 3000 else result.stderr)
        raise RuntimeError(f"Inference failed (rc={result.returncode})")

    print(f"[ok] inference done in {elapsed:.0f}s ({elapsed/60:.1f}min)")

    with open("/root/res_output.mp4", "rb") as f:
        return f.read()


@app.local_entrypoint()
def main():
    video_bytes = run_test.remote()
    out_dir = "scripts/short-video/experiments/digital-human/soulx-flashtalk"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "flashtalk_14b_a100_original.mp4")
    with open(out_path, "wb") as f:
        f.write(video_bytes)
    print(f"[saved] {out_path} ({len(video_bytes)} bytes)")