#!/usr/bin/env python3
"""
Build and publish the #1537 Colab CosyVoice3 model-cache archive.

Runs on Kaggle (CPU, internet on) with `xpabloli/cosyvoice3-model` mounted
read-only: the weights are already on Kaggle's disk, so this kernel never
downloads them. It tars only the files CosyVoice3 actually loads and uploads
the archive to the public HuggingFace dataset used by
`COSYVOICE3_COLAB_MODEL_CACHE_URL`.

GENERATED from scripts/short-video/colab/build-model-cache-kernel.py by
scripts/short-video/colab/push-model-cache-build.sh — placeholders are filled
at push time; do not edit the generated copy on Kaggle.
"""

import base64
import glob
import hashlib
import os
import shutil
import subprocess
import sys

HF_TOKEN = base64.b64decode("__HF_TOKEN_B64__").decode("utf-8")
HF_REPO = "__HF_REPO__"
TARGET_NAME = "__TARGET_NAME__"

# CosyVoice3 loads exactly these paths from model_dir (cosyvoice/cli/cosyvoice.py
# pinned at 074ca6dc): the hyper yaml, campplus + speech tokenizer ONNX, the
# blank-EN tokenizer/LLM directory, and the three torch checkpoints. The repo's
# flow.decoder.estimator.fp32.onnx, llm.rl.pt and *.batch.onnx variants are not
# read on this path, so they stay out of the cache.
NEEDED_FILES = [
    "cosyvoice3.yaml",
    "campplus.onnx",
    "speech_tokenizer_v3.onnx",
    "llm.pt",
    "flow.pt",
    "hift.pt",
]
BLANK_DIR = "CosyVoice-BlankEN"
BLANK_TAR = "CosyVoice-BlankEN.tar"
OUT = os.path.join("/kaggle/working", TARGET_NAME)
STAGE = "/kaggle/working/model-cache-stage"


def log(msg):
    print(msg, flush=True)


def find_model_root():
    hits = sorted(glob.glob("/kaggle/input/**/cosyvoice3.yaml", recursive=True))
    if not hits:
        raise SystemExit("cosyvoice3.yaml not found under /kaggle/input — "
                         "attach xpabloli/cosyvoice3-model to this kernel")
    root = os.path.dirname(hits[0])
    log(f"model root: {root}")
    missing = [f for f in NEEDED_FILES if not os.path.isfile(os.path.join(root, f))]
    if missing:
        raise SystemExit(f"model root is incomplete, missing: {missing}")
    blank_dir = os.path.join(root, BLANK_DIR)
    blank_tar = os.path.join(root, BLANK_TAR)
    if not os.path.isdir(blank_dir) and not os.path.isfile(blank_tar):
        raise SystemExit(f"neither {BLANK_DIR}/ nor {BLANK_TAR} exists in {root}")
    return root


def build_archive(root):
    if os.path.exists(OUT):
        os.unlink(OUT)
    log("tarring core files ...")
    subprocess.run(["tar", "-cf", OUT, "-C", root, *NEEDED_FILES], check=True)

    blank_dir = os.path.join(root, BLANK_DIR)
    blank_tar = os.path.join(root, BLANK_TAR)
    if os.path.isdir(blank_dir):
        log(f"appending {BLANK_DIR}/ ...")
        subprocess.run(["tar", "-rf", OUT, "-C", root, BLANK_DIR], check=True)
    else:
        log(f"extracting {BLANK_TAR} ...")
        shutil.rmtree(STAGE, ignore_errors=True)
        os.makedirs(STAGE, exist_ok=True)
        subprocess.run(["tar", "-xf", blank_tar, "-C", STAGE], check=True)
        if not os.path.isdir(os.path.join(STAGE, BLANK_DIR)):
            raise SystemExit(f"{BLANK_TAR} does not contain {BLANK_DIR}/ at its root")
        subprocess.run(["tar", "-rf", OUT, "-C", STAGE, BLANK_DIR], check=True)

    import tarfile

    with tarfile.open(OUT) as tar:
        names = tar.getnames()
    if not any(n == "cosyvoice3.yaml" or n.endswith("/cosyvoice3.yaml") for n in names):
        raise SystemExit("archive has no cosyvoice3.yaml")
    log(f"archive members: {len(names)}")
    return os.path.getsize(OUT)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def publish(size):
    try:
        import huggingface_hub  # noqa: F401 — usually preinstalled on Kaggle
    except ImportError:
        log("installing huggingface_hub ...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", "huggingface_hub"],
            check=True,
        )
    from huggingface_hub import HfApi

    api = HfApi(token=HF_TOKEN)
    api.create_repo(repo_id=HF_REPO, repo_type="dataset", private=False, exist_ok=True)
    log(f"uploading {size / 1e9:.2f} GB to {HF_REPO} ...")
    api.upload_file(
        path_or_fileobj=OUT,
        path_in_repo=TARGET_NAME,
        repo_id=HF_REPO,
        repo_type="dataset",
    )
    return f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/{TARGET_NAME}"


def main():
    log("=== #1537 Colab model-cache builder ===")
    root = find_model_root()
    size = build_archive(root)
    log(f"archive: {OUT} ({size / 1e9:.2f} GB)")
    log(f"sha256: {sha256(OUT)}")
    url = publish(size)
    log("CACHE_URL=" + url)


if __name__ == "__main__":
    main()
