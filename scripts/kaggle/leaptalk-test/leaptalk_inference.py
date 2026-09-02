"""
LeapTalk v1: Kaggle T4 GPU smoke + first real inference

Pattern borrowed from scripts/kaggle/infinitetalk-test/infinitetalk_inference.py
(Xet disabled, /tmp for models, debug_log + atexit copy, Popen streaming).

Differences:
- Single repo clone (LeapTalk ships flash_head/ + vibt/ + utils/ in-repo).
- Curated INFERENCE-ONLY deps (repo-pinned versions), NOT the full 200-pkg
  requirements.txt (which includes training/demo bloat that breaks on Kaggle).
- huggingface-cli download (HF_HUB_DISABLE_XET=1) for the 3 weight sets.
- A flash_head import smoke test runs BEFORE the multi-GB model download so a
  missing dependency fails fast instead of wasting 20 min of download.

Sources (信源优先, official):
- Setup/run: github.com/zhangrongxiang/LeapTalk README + inf.sh
- Args defaults: LeapTalk/inference.py argparse
- License: Apache-2.0 (LICENSE added 2026-08-11)
"""

import os
import sys
import subprocess
import time
import shutil
import traceback
import glob as _glob
import atexit

# ===== CRITICAL: disable Xet BEFORE any huggingface import (causes 0B LFS on Kaggle) =====
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

WORK_DIR = "/kaggle/working"
MODELS_DIR = "/tmp/models"          # ~70GB, vs /kaggle/working ~20GB
LEAPTALK_DIR = "/tmp/LeapTalk"
CKPT_DIR = os.path.join(MODELS_DIR, "SoulX-FlashHead-1_3B")
WAV2VEC_DIR = os.path.join(MODELS_DIR, "wav2vec2-base-960h")
LORA_DIR = os.path.join(MODELS_DIR, "leaptalk")
DEBUG_LOG = os.path.join(WORK_DIR, "debug_log.txt")

os.makedirs(WORK_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

with open(DEBUG_LOG, "w") as f:
    f.write("LEAPTALK SCRIPT STARTED\n")
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
            if 'it/s]' in line or 's/it]' in line:   # filter tqdm spam
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


def hf_download(repo_id, dest):
    """Download a whole HF repo via huggingface-cli (Xet disabled). Retry x3."""
    if os.path.isdir(dest) and any(os.scandir(dest)):
        print(f"  [SKIP] {dest} already present")
        return
    os.makedirs(dest, exist_ok=True)
    for attempt in range(1, 4):
        print(f"  [HF] attempt {attempt}: {repo_id} -> {dest}")
        r = run(
            f"HF_HUB_DISABLE_XET=1 {sys.executable} -m huggingface_hub.commands.huggingface_cli "
            f"download {repo_id} --local-dir {dest}",
            timeout=5400, check=False,
        )
        if r.returncode == 0 and any(os.scandir(dest)):
            n = sum(len(files) for _, _, files in os.walk(dest))
            print(f"  [OK] {repo_id} downloaded ({n} files)")
            return
        print(f"  [RETRY] {repo_id} attempt {attempt} failed, sleep 10s")
        time.sleep(10)
    print(f"  [FATAL] could not download {repo_id}")
    sys.exit(1)


@atexit.register
def _copy_debug_on_exit():
    try:
        shutil.copy(DEBUG_LOG, os.path.join(WORK_DIR, "leaptalk_debug_log.txt"))
    except Exception:
        pass


def resolve_input():
    for cand in ("/kaggle/input/infinitetalk-input", "/kaggle/input/xpabloli/infinitetalk-input"):
        if os.path.isdir(cand):
            return cand
    matches = _glob.glob("/kaggle/input/**/portrait.jpg", recursive=True)
    if matches:
        return os.path.dirname(matches[0])
    return None


def main():
    t_start = time.time()
    print("=== STEP 1/6: clone LeapTalk (depth 1) ===")
    if os.path.isfile(os.path.join(LEAPTALK_DIR, "inference.py")):
        print("  [SKIP] LeapTalk already cloned")
    else:
        run(f"rm -rf {LEAPTALK_DIR}")
        run(f"git clone --depth 1 https://github.com/zhangrongxiang/LeapTalk {LEAPTALK_DIR}", timeout=600)

    print("=== STEP 2/6: install inference deps (repo-pinned versions) ===")
    run(f"{sys.executable} -m pip install --no-cache-dir torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1", timeout=1800)
    run(
        f"{sys.executable} -m pip install --no-cache-dir "
        f"peft==0.19.1 safetensors einops transformers==4.57.3 tokenizers accelerate "
        f"imageio imageio-ffmpeg librosa \"huggingface_hub[cli]\" omegaconf pyyaml "
        f"xformers==0.0.31 opencv-python-headless scikit-image scipy pillow loguru",
        timeout=1800,
    )

    print("=== STEP 3/6: smoke-import flash_head (catch missing deps BEFORE download) ===")
    smoke = run(
        f"{sys.executable} -c \"import sys; sys.path.insert(0, '{LEAPTALK_DIR}'); "
        f"import flash_head.src.pipeline.flash_head_pipeline as m; print('FLASH_HEAD IMPORT OK')\"",
        timeout=300, check=False,
    )
    if smoke.returncode != 0:
        print("[FATAL] flash_head import failed; add missing dep and re-push")
        sys.exit(1)

    print("=== STEP 4/6: download 3 weight sets ===")
    hf_download("Soul-AILab/SoulX-FlashHead-1_3B", CKPT_DIR)
    hf_download("facebook/wav2vec2-base-960h", WAV2VEC_DIR)
    hf_download("z-rx/leaptalk", LORA_DIR)

    print("=== STEP 5/6: prepare inputs (reuse infinitetalk-input dataset) ===")
    INPUT_DIR = resolve_input()
    if not INPUT_DIR:
        print("[FATAL] input dataset not found")
        sys.exit(1)
    cond_image = os.path.join(WORK_DIR, "portrait.jpg")
    audio_path = os.path.join(WORK_DIR, "audio.wav")
    shutil.copy(os.path.join(INPUT_DIR, "portrait.jpg"), cond_image)
    shutil.copy(os.path.join(INPUT_DIR, "audio.wav"), audio_path)
    print(f"  inputs: {cond_image} | {audio_path}")

    out_path = os.path.join(WORK_DIR, "leaptalk_out.mp4")

    print("=== STEP 6/6: run inference (1-step, Lite, official defaults) ===")
    print("  Source of args: LeapTalk/inference.py argparse defaults + inf.sh (NUM_INFERENCE_STEPS=1, LITE=1)")
    cmd = (
        f"cd {LEAPTALK_DIR} && "
        f"CUDA_VISIBLE_DEVICES=0 torchrun --nproc_per_node=1 inference.py "
        f"--ckpt_dir {CKPT_DIR} "
        f"--wav2vec_dir {WAV2VEC_DIR} "
        f"--lora_dir {LORA_DIR} "
        f"--num_inference_steps 1 "
        f"--compile off "
        f"--lite "
        f"--cond_image {cond_image} "
        f"--audio_path {audio_path} "
        f"--out {out_path} "
        f"--height 512 --width 512 --fps 25"
    )
    run(cmd, timeout=7200)

    if os.path.exists(out_path):
        mb = os.path.getsize(out_path) / 1024 / 1024
        print(f"[DONE] output saved: {out_path} ({mb:.1f} MB) in {time.time()-t_start:.1f}s wall")
    else:
        print("[WARN] output mp4 not found — check debug_log for inference error")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        print(traceback.format_exc())
        raise
