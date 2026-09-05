"""
Wan2.2-S2V-14B — Modal A100-80GB 推理测试

Usage:
    modal run scripts/modal/wan22-s2v-test/run_wan22_s2v.py
    modal run --detach scripts/modal/wan22-s2v-test/run_wan22_s2v.py   # 首次冷启动推荐

Hardware: Modal A100-80GB ($2.10/h) — 官方单卡推理最低要求 80GB VRAM
Input:    portrait-face.jpg (827×1063 竖图 3:4) + audio.wav (16kHz mono ~10s)
Output:   ~624×832 竖版 talking head video (size=832*624 面积, 宽高比跟随输入图)

First run: ~30-60min (image build + model download ~40GB+ + inference)
Cached run: ~10-20min (model load + inference)

信源：
- 推理命令：Wan-Video/Wan2.2 官方 README "Run Speech-to-Video Generation" 单 GPU 段
- 参数 --offload_model True --convert_model_dtype：官方 80GB VRAM 单卡示例
- size 832*624：面积参数，宽高比自动跟随输入图（官方文档说明）
- 不设 --num_clip：视频长度自动按音频长度调整（官方说明）
- 模型 Wan-AI/Wan2.2-S2V-14B：HuggingFace 官方权重
- License: Apache 2.0（官方 LICENSE.txt）
"""

import modal
import os
import subprocess
import sys
import time

app = modal.App("wan22-s2v-test")

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
    gpu="a100-80gb",
    volumes={"/root/models": vol},
    timeout=7200,
)
def run_test() -> bytes:
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

    # ── Download model weights (cached in volume) ──
    from huggingface_hub import snapshot_download

    repo_id = "Wan-AI/Wan2.2-S2V-14B"
    local_dir = "/root/models/Wan2.2-S2V-14B"
    print(f"[download] {repo_id} → {local_dir} (snapshot_download auto-skips existing files)")
    t0 = time.time()
    snapshot_download(repo_id=repo_id, local_dir=local_dir)
    print(f"  done in {time.time() - t0:.0f}s")

    vol.commit()

    # ── Run inference ──
    os.chdir("/repo")
    cmd = [
        sys.executable, "generate.py",
        "--task", "s2v-14B",
        "--size", "1024*704",
        "--ckpt_dir", local_dir,

        "--prompt", "A person is talking to camera, frontal face, static background.",
        "--image", "/root/fixtures/portrait-face.jpg",
        "--audio", "/root/fixtures/audio.wav",
        "--save_file", "/root/s2v_output.mp4",
    ]
    print(f"[run] {' '.join(cmd)}")
    t0 = time.time()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    last_lines = []
    for line in proc.stdout:
        line_stripped = line.rstrip()
        if line_stripped:
            print(line_stripped, flush=True)
            last_lines.append(line_stripped)
            if len(last_lines) > 30:
                last_lines.pop(0)
    proc.wait()
    elapsed = time.time() - t0

    if proc.returncode != 0:
        print(f"[FAIL] returncode={proc.returncode}, elapsed={elapsed:.0f}s")
        raise RuntimeError(f"Inference failed (rc={proc.returncode})")

    print(f"[ok] inference done in {elapsed:.0f}s ({elapsed/60:.1f}min)")

    out = "/root/s2v_output.mp4"
    if not os.path.exists(out):
        raise FileNotFoundError(f"Output not found: {out}")
    with open(out, "rb") as f:
        return f.read()


@app.local_entrypoint()
def main():
    video_bytes = run_test.remote()
    out_dir = "scripts/short-video/experiments/digital-human/wan22-s2v"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "wan22_s2v_14b_a100_480p.mp4")
    with open(out_path, "wb") as f:
        f.write(video_bytes)
    print(f"[saved] {out_path} ({len(video_bytes)} bytes)")