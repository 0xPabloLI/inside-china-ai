"""
FeatherTalk — Modal T4 GPU 训练 + 推理测试

Usage:
    modal run scripts/modal/feathertalk-test/run_feathertalk.py
    modal run scripts/modal/feathertalk-test/run_feathertalk.py --infer-only

Hardware: Modal T4 GPU — 训练 20 epochs ~38min, 推理 ~5min
Input:    train_30s_180s.mp4（从 1029昆明南站.mp4 截取的 30-180s 片段）
Output:   训练后的 checkpoint + 推理视频

Volume:   feathertalk-vol 保存 person_dir + checkpoints，infer-only 可复用
"""

import modal
import os
import shutil
import subprocess
import sys
import time

app = modal.App("feathertalk-test")

vol = modal.Volume.from_name("feathertalk-vol", create_if_missing=True)

image = (
    modal.Image.from_registry(
        "python:3.10-slim",
    )
    .apt_install("ffmpeg", "git", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch",
        "torchvision",
        "opencv-python-headless",
        "librosa",
        "numpy",
        "onnx",
        "soundfile",
        "tqdm",
    )
    .run_commands("git clone https://github.com/anliyuan/FeatherTalk.git /repo")
    .add_local_dir(
        "scripts/short-video/assets/dh-fixtures/feathertalk",
        "/root/fixtures",
    )
)

VOL_MOUNT = "/root/vol"
PERSON_DIR = os.path.join(VOL_MOUNT, "person")
CKPT_DIR = os.path.join(VOL_MOUNT, "checkpoints")


@app.function(image=image, timeout=7200, gpu="A100-40GB", cpu=4, memory=16384, volumes={VOL_MOUNT: vol})
def run_train() -> str:
    os.chdir("/repo")

    train_video = "/root/fixtures/train_30s_180s.mp4"
    os.makedirs(PERSON_DIR, exist_ok=True)
    os.makedirs(CKPT_DIR, exist_ok=True)

    # ── Step 1: Preprocess training video ──
    print("[step 1] Preprocessing training video...")
    cmd = [
        sys.executable, "data_utils/process.py", train_video,
        "--feather_hubert_checkpoint", "./feather_hubert.pth",
    ]
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
    if result.returncode != 0:
        print(f"[FAIL] preprocess rc={result.returncode}")
        print(result.stderr[-2000:])
        raise RuntimeError("Preprocess failed")
    print(f"[ok] preprocess done in {time.time()-t0:.0f}s")

    # Move preprocessed data to person_dir (on volume)
    video_dir = os.path.dirname(train_video)
    for f in os.listdir(video_dir):
        if f != "train_30s_180s.mp4" and f != ".DS_Store":
            src = os.path.join(video_dir, f)
            dst = os.path.join(PERSON_DIR, f)
            if os.path.exists(src):
                shutil.move(src, dst)
                print(f"  moved {f}")

    # ── Step 2: Train ──
    print("[step 2] Training 200 epochs (A100 GPU)...")
    cmd = [
        sys.executable, "train.py",
        "--dataset_dir", PERSON_DIR,
        "--save_dir", CKPT_DIR,
        "--epochs", "200",
        "--batchsize", "16",
    ]
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout)
    if result.returncode != 0:
        print(f"[FAIL] train rc={result.returncode}")
        print(result.stderr[-3000:])
        raise RuntimeError("Train failed")
    print(f"[ok] train done in {time.time()-t0:.0f}s")

    vol.commit()
    return f"train done, checkpoints in {CKPT_DIR}"


@app.function(image=image, timeout=1800, gpu="A100-40GB", cpu=4, memory=16384, volumes={VOL_MOUNT: vol})
def run_infer() -> bytes:
    os.chdir("/repo")

    test_wav = os.path.join(PERSON_DIR, "audio.wav")
    test_feat = "/root/test_hu.npy"

    # ── Step 3: Extract test audio features ──
    print("[step 3] Extracting test audio features...")
    cmd = [
        sys.executable, "data_utils/feather_hubert/feather_hubert.py",
        "--wav", test_wav,
        "--checkpoint", "./feather_hubert.pth",
        "--out", test_feat,
    ]
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(result.stdout[-1000:] if len(result.stdout) > 1000 else result.stdout)
    if result.returncode != 0:
        print(f"[FAIL] audio feat rc={result.returncode}")
        print(result.stderr[-1000:])
        raise RuntimeError("Audio feature extraction failed")
    print(f"[ok] audio feat done in {time.time()-t0:.0f}s")

    # ── Step 4: Inference ──
    print("[step 4] Inference...")
    checkpoint = os.path.join(CKPT_DIR, "199.pth")
    output_path = "/root/output.mp4"
    cmd = [
        sys.executable, "inference.py",
        "--dataset", PERSON_DIR,
        "--audio_feat", test_feat,
        "--audio_wav", test_wav,
        "--checkpoint", checkpoint,
        "--save_path", output_path,
    ]
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
    if result.returncode != 0:
        print(f"[FAIL] inference rc={result.returncode}")
        print(result.stderr[-2000:])
        raise RuntimeError("Inference failed")
    print(f"[ok] inference done in {time.time()-t0:.0f}s")

    with open(output_path, "rb") as f:
        return f.read()


@app.local_entrypoint()
def main(infer_only: bool = False):
    if not infer_only:
        msg = run_train.remote()
        print(msg)
    else:
        print("[skip] skipping train, using cached checkpoint from volume")

    video_bytes = run_infer.remote()
    out_dir = "scripts/short-video/experiments/digital-human/feathertalk"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "feathertalk_result.mp4")
    with open(out_path, "wb") as f:
        f.write(video_bytes)
    print(f"[saved] {out_path} ({len(video_bytes)} bytes)")
