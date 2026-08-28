"""
Kaggle kernel: Download InfiniteTalk model files from HuggingFace
and create a Kaggle Dataset for use by the inference kernel.

v8: Fix --dir-mode zip for folder uploads.
  v7 successfully downloaded all files via curl -L, but kaggle datasets version/create
  silently skipped all subdirectories (default --dir-mode=skip), resulting in empty dataset.
  v8 fix: Add --dir-mode zip to both version and create commands.
  Also: check create/version return codes properly (v7 had false positive on create).

Strategy: Download in batches (each batch < 18GB to fit in /kaggle/working ~20GB),
upload each batch as a new version of the dataset (--dir-mode zip for folders),
then delete local files to free space for the next batch.
"""

import os
import sys
import subprocess
import time
import json
import shutil

# CRITICAL: Disable Xet protocol — it causes 0B LFS files on Kaggle
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)

from huggingface_hub import hf_hub_download

WORK_DIR = "/kaggle/working"
DATASET_DIR = os.path.join(WORK_DIR, "infinitetalk-models")

KAGGLE_SECRETS_PATHS = [
    "/kaggle/input/kaggle-secrets/kaggle.json",
    "/kaggle/input/xpabloli-kaggle-secrets/kaggle.json",
]

DATASET_ID = "xpabloli/infinitetalk-models"
DATASET_TITLE = "InfiniteTalk Models (FP8)"

# Model files to download, grouped by batch (each batch < 18GB)
# Each file: (repo_id, filename_in_repo, dest_rel_path, is_lfs)
# is_lfs=True → use curl -L (LFS file, stored on CDN)
# is_lfs=False → use hf_hub_download (small file, stored in Git)
BATCHES = [
    # Batch 1: Small base files + tokenizers (~5.3GB)
    {
        "name": "base-small",
        "files": [
            ("Wan-AI/Wan2.1-I2V-14B-480P", "config.json",
             "Wan2.1-I2V-14B-480P/config.json", False),
            ("Wan-AI/Wan2.1-I2V-14B-480P", "Wan2.1_VAE.pth",
             "Wan2.1-I2V-14B-480P/Wan2.1_VAE.pth", True),
            ("Wan-AI/Wan2.1-I2V-14B-480P", "diffusion_pytorch_model.safetensors.index.json",
             "Wan2.1-I2V-14B-480P/diffusion_pytorch_model.safetensors.index.json", False),
        ],
        "tokenizers": [
            ("Wan-AI/Wan2.1-I2V-14B-480P", "google/umt5-xxl",
             "Wan2.1-I2V-14B-480P/google/umt5-xxl"),
            ("Wan-AI/Wan2.1-I2V-14B-480P", "xlm-roberta-large",
             "Wan2.1-I2V-14B-480P/xlm-roberta-large"),
        ],
    },
    # Batch 2: T5 + CLIP (~16.2GB)
    {
        "name": "base-large",
        "files": [
            ("Wan-AI/Wan2.1-I2V-14B-480P", "models_t5_umt5-xxl-enc-bf16.pth",
             "Wan2.1-I2V-14B-480P/models_t5_umt5-xxl-enc-bf16.pth", True),
            ("Wan-AI/Wan2.1-I2V-14B-480P", "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth",
             "Wan2.1-I2V-14B-480P/models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth", True),
        ],
        "tokenizers": [],
    },
    # Batch 3: FP8 DiT (~19.5GB)
    {
        "name": "fp8-dit",
        "files": [
            ("MeiGen-AI/InfiniteTalk", "quant_models/infinitetalk_single_fp8.safetensors",
             "InfiniteTalk/quant_models/infinitetalk_single_fp8.safetensors", True),
            ("MeiGen-AI/InfiniteTalk", "quant_models/infinitetalk_single_fp8.json",
             "InfiniteTalk/quant_models/infinitetalk_single_fp8.json", False),
        ],
        "tokenizers": [],
    },
    # Batch 4: T5 FP8 + wav2vec2 (~7.1GB)
    {
        "name": "t5-fp8-wav2vec2",
        "files": [
            ("MeiGen-AI/InfiniteTalk", "quant_models/t5_fp8.safetensors",
             "InfiniteTalk/quant_models/t5_fp8.safetensors", True),
            ("MeiGen-AI/InfiniteTalk", "quant_models/t5_map_fp8.json",
             "InfiniteTalk/quant_models/t5_map_fp8.json", False),
        ],
        "tokenizers": [],
        "wav2vec2": True,  # Special: download from modelscope.cn
    },
]


def run(cmd, timeout=3600, check=True):
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


def setup_kaggle_credentials():
    """Set up Kaggle API credentials."""
    if os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"):
        print(f"[OK] Kaggle credentials found in environment (user: {os.environ['KAGGLE_USERNAME']})")
        return True

    kaggle_json = os.path.expanduser("~/.kaggle/kaggle.json")
    if os.path.exists(kaggle_json):
        with open(kaggle_json) as f:
            creds = json.load(f)
        os.environ["KAGGLE_USERNAME"] = creds["username"]
        os.environ["KAGGLE_KEY"] = creds["key"]
        print(f"[OK] Kaggle credentials loaded from {kaggle_json}")
        return True

    for path in KAGGLE_SECRETS_PATHS:
        if os.path.exists(path):
            with open(path) as f:
                creds = json.load(f)
            os.environ["KAGGLE_USERNAME"] = creds["username"]
            os.environ["KAGGLE_KEY"] = creds["key"]
            print(f"[OK] Kaggle credentials loaded from {path}")
            return True

    print("[ERROR] Kaggle credentials not found!")
    return False


def init_dataset():
    """Initialize the dataset metadata file."""
    os.makedirs(DATASET_DIR, exist_ok=True)
    meta_path = os.path.join(DATASET_DIR, "dataset-metadata.json")
    if not os.path.exists(meta_path):
        run(f"kaggle datasets init -p {DATASET_DIR}", timeout=30, check=False)
        with open(meta_path) as f:
            meta = json.load(f)
        meta["id"] = DATASET_ID
        meta["title"] = DATASET_TITLE
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)
        print(f"[OK] Dataset metadata created: {DATASET_ID}")
    else:
        print(f"[OK] Dataset metadata already exists")
    return meta_path


def download_curl(repo_id, filename, dest_rel_path):
    """Download a LFS file from HuggingFace using curl -L.

    This is the ONLY reliable method on Kaggle to download HF LFS files.
    curl -L follows the redirect to the CDN and downloads the actual binary.
    huggingface_hub (hf_hub_download, snapshot_download, hf download CLI) all
    go through the Xet protocol which hangs/returns 0B on Kaggle.

    Verified working in echomimicv3-model-packaging kernel (2026-08-17).
    """
    dest_path = os.path.join(DATASET_DIR, dest_rel_path)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        print(f"  [SKIP] {dest_rel_path} already exists ({os.path.getsize(dest_path)/1024**3:.2f} GB)")
        return
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    url = f"https://huggingface.co/{repo_id}/resolve/main/{filename}"
    t0 = time.time()
    # curl -L: follow redirects, --max-time: timeout, -o: output file
    # -s: silent (no progress bar, we use stderr for that), -S: show errors
    run(f"curl -L --max-time 3600 -o '{dest_path}' '{url}'", timeout=3700)

    fsize = os.path.getsize(dest_path)
    if fsize == 0:
        raise RuntimeError(f"Downloaded file is 0B: {dest_path}")
    print(f"  [OK] {dest_rel_path} ({fsize/1024**3:.2f} GB, {(time.time()-t0)/60:.1f} min)")
    sys.stdout.flush()


def download_small_file(repo_id, filename, dest_rel_path):
    """Download a small non-LFS file using hf_hub_download.

    Small files (config.json, .json maps) are stored in Git, not LFS CDN.
    hf_hub_download works for these. HF_HUB_DISABLE_XET=1 is set at module top.
    """
    dest_path = os.path.join(DATASET_DIR, dest_rel_path)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        print(f"  [SKIP] {dest_rel_path} already exists")
        return
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    t0 = time.time()
    cached = hf_hub_download(repo_id=repo_id, filename=filename,
                             cache_dir="/kaggle/working/hf_cache")
    # Copy from cache to dest (resolve symlinks)
    real_path = os.path.realpath(cached)
    shutil.copy2(real_path, dest_path)
    fsize = os.path.getsize(dest_path)
    print(f"  [OK] {dest_rel_path} ({fsize/1024**2:.1f} MB, {(time.time()-t0):.0f}s)")
    sys.stdout.flush()


def download_tokenizer_dir(repo_id, dir_path, dest_rel_dir):
    """Download a tokenizer directory (small non-LFS files) using hf_hub_download.

    curl returns LFS pointer (15 bytes) for small LFS-tracked files like tokenizer.json.
    hf_hub_download correctly downloads these. HF_HUB_DISABLE_XET=1 is set.
    """
    import fnmatch
    from huggingface_hub import list_repo_files

    dest_path = os.path.join(DATASET_DIR, dest_rel_dir)
    if os.path.exists(dest_path) and os.listdir(dest_path):
        print(f"  [SKIP] {dest_rel_dir} already has files")
        return
    os.makedirs(dest_path, exist_ok=True)

    # List all files in repo, filter by directory prefix
    all_files = list_repo_files(repo_id)
    files_to_download = [f for f in all_files if f.startswith(dir_path + "/") or f.startswith(dir_path)]
    # Deduplicate
    files_to_download = list(set(files_to_download))

    print(f"  Found {len(files_to_download)} files in {dir_path}")
    sys.stdout.flush()

    for fname in files_to_download:
        dest_file = os.path.join(dest_path, fname)
        if os.path.exists(dest_file) and os.path.getsize(dest_file) > 0:
            print(f"    [SKIP] {fname}")
            continue
        os.makedirs(os.path.dirname(dest_file), exist_ok=True)

        cached = hf_hub_download(repo_id=repo_id, filename=fname,
                                 cache_dir="/kaggle/working/hf_cache")
        real_path = os.path.realpath(cached)
        shutil.copy2(real_path, dest_file)
        fsize = os.path.getsize(dest_file)
        print(f"    [OK] {fname} ({fsize/1024**2:.1f} MB)")
        sys.stdout.flush()


def download_wav2vec2(dest_rel_dir):
    """Download chinese-wav2vec2-base from modelscope.cn (not HuggingFace).

    EchoMimicV3 used modelscope.cn for this model — it works on Kaggle.
    Also try HuggingFace as fallback (using curl -L for the .bin, hf_hub for config).
    """
    dest_path = os.path.join(DATASET_DIR, dest_rel_dir)
    if os.path.exists(dest_path) and os.listdir(dest_path):
        print(f"  [SKIP] {dest_rel_dir} already has files")
        return
    os.makedirs(dest_path, exist_ok=True)

    base_url = "https://modelscope.cn/models/TencentGameMate/chinese-wav2vec2-base/resolve/master"
    repo_id = "TencentGameMate/chinese-wav2vec2-base"

    # Download config files from modelscope
    for fname in ["config.json", "preprocessor_config.json"]:
        dest_file = os.path.join(dest_path, fname)
        if not os.path.exists(dest_file):
            run(f"curl -L --max-time 60 -o '{dest_file}' '{base_url}/{fname}'", timeout=90, check=False)

    # Download pytorch_model.bin from modelscope (LFS file, curl works)
    dest_file = os.path.join(dest_path, "pytorch_model.bin")
    if not os.path.exists(dest_file) or os.path.getsize(dest_file) == 0:
        print(f"  Downloading pytorch_model.bin from modelscope.cn...")
        sys.stdout.flush()
        run(f"curl -L --max-time 300 -o '{dest_file}' '{base_url}/pytorch_model.bin'", timeout=360)

    # Also get model.safetensors from HuggingFace refs/pr/1 (optional)
    try:
        safetensors_url = f"https://huggingface.co/{repo_id}/resolve/refs/pr/1/model.safetensors"
        dest_st = os.path.join(dest_path, "model.safetensors")
        if not os.path.exists(dest_st):
            print(f"  Downloading model.safetensors from HF refs/pr/1...")
            sys.stdout.flush()
            run(f"curl -L --max-time 300 -o '{dest_st}' '{safetensors_url}'", timeout=360, check=False)
    except Exception:
        pass  # Optional file

    # Verify
    for f in ["pytorch_model.bin", "config.json"]:
        fp = os.path.join(dest_path, f)
        if os.path.exists(fp) and os.path.getsize(fp) > 0:
            print(f"  [OK] {f} ({os.path.getsize(fp)/1024**2:.1f} MB)")
        else:
            print(f"  [WARN] {f} missing or 0B")


def push_dataset_version(meta_path, version_msg):
    """Push current dataset as a new version (or create if first time)."""
    print(f"\n  Pushing dataset version: {version_msg}")
    sys.stdout.flush()
    with open(meta_path) as f:
        meta = json.load(f)
    if meta.get("id") != DATASET_ID:
        meta["id"] = DATASET_ID
        meta["title"] = DATASET_TITLE
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)

    result = run(f"kaggle datasets version -p {DATASET_DIR} -m '{version_msg}' --dir-mode zip",
                 timeout=1800, check=False)
    if result.returncode == 0 and '403' not in result.stdout and 'error' not in result.stdout.lower():
        print(f"  [OK] Dataset version pushed successfully")
        return True
    else:
        print(f"  Version push failed (rc={result.returncode}), trying create...")
        result = run(f"kaggle datasets create -p {DATASET_DIR} --dir-mode zip",
                     timeout=1800, check=False)
        # Check for actual success (not just rc=0 — Kaggle CLI sometimes returns 0 on error)
        if result.returncode == 0 and 'error' not in result.stdout.lower() and 'Dataset created' in result.stdout:
            print(f"  [OK] Dataset created successfully")
            return True
        elif result.returncode == 0 and 'Please upload at least one file' in result.stdout:
            print(f"  [ERROR] No files uploaded — check --dir-mode and file paths")
            return False
        else:
            print(f"  [ERROR] Failed to create/push dataset (rc={result.returncode})")
            print(f"  Output: {result.stdout[:500]}")
            return False


def free_space():
    """Delete all files in DATASET_DIR (except metadata) to free disk space."""
    print(f"\n  Freeing disk space...")
    sys.stdout.flush()
    for item in os.listdir(DATASET_DIR):
        if item == "dataset-metadata.json":
            continue
        item_path = os.path.join(DATASET_DIR, item)
        if os.path.isdir(item_path):
            shutil.rmtree(item_path)
        else:
            os.remove(item_path)
    # Clear HF cache
    cache_dir = "/kaggle/working/hf_cache"
    if os.path.exists(cache_dir):
        shutil.rmtree(cache_dir)
    run("df -h /kaggle/working", timeout=10, check=False)


def verify_files(batch):
    """Verify downloaded files exist and are non-empty."""
    print(f"\n  Verifying files...")
    sys.stdout.flush()
    all_ok = True
    for repo_id, filename, dest_path, is_lfs in batch["files"]:
        full_path = os.path.join(DATASET_DIR, dest_path)
        if os.path.exists(full_path) and os.path.getsize(full_path) > 0:
            print(f"    [OK] {dest_path} ({os.path.getsize(full_path)/1024**3:.2f} GB)")
        else:
            print(f"    [FAIL] {dest_path} — missing or 0B!")
            all_ok = False
    for repo_id, dir_path, dest_dir in batch.get("tokenizers", []):
        full_dir = os.path.join(DATASET_DIR, dest_dir)
        if os.path.exists(full_dir) and os.listdir(full_dir):
            files = os.listdir(full_dir)
            print(f"    [OK] {dest_dir} ({len(files)} files)")
        else:
            print(f"    [FAIL] {dest_dir} — empty or missing!")
            all_ok = False
    if batch.get("wav2vec2"):
        full_dir = os.path.join(DATASET_DIR, "chinese-wav2vec2-base")
        if os.path.exists(full_dir) and os.listdir(full_dir):
            files = os.listdir(full_dir)
            print(f"    [OK] chinese-wav2vec2-base ({len(files)} files)")
        else:
            print(f"    [FAIL] chinese-wav2vec2-base — empty or missing!")
            all_ok = False
    return all_ok


# ============================================================
# Main
# ============================================================
print("=" * 70)
print("InfiniteTalk Dataset Creation Kernel (v8)")
print("=" * 70)
print(f"Dataset: {DATASET_ID}")
print(f"Strategy: Download in {len(BATCHES)} batches, push each as new version")
print(f"Download method: curl -L for LFS files + hf_hub_download for small files")
print(f"Upload method: --dir-mode zip (v7 bug: default skip dropped all folders)")
print(f"HF_HUB_DISABLE_XET=1 (avoids Xet protocol 0B bug on Kaggle)")
print()

# Step 0: Environment
print("--- Step 0: Environment Check ---")
run("df -h /kaggle/working", timeout=10, check=False)
run("nvidia-smi", timeout=30, check=False)
print(f"huggingface_hub version: ", end="")
import huggingface_hub; print(huggingface_hub.__version__)

# Step 1: Credentials
print("\n--- Step 1: Set up Kaggle credentials ---")
if not setup_kaggle_credentials():
    sys.exit(1)

# Step 2: Init dataset
print("\n--- Step 2: Initialize dataset metadata ---")
meta_path = init_dataset()

# Step 3: Download in batches
total_start = time.time()
for batch_idx, batch in enumerate(BATCHES):
    batch_name = batch["name"]
    print(f"\n{'='*60}")
    print(f"Batch {batch_idx+1}/{len(BATCHES)}: {batch_name}")
    print(f"{'='*60}")
    sys.stdout.flush()

    batch_start = time.time()
    run("df -h /kaggle/working", timeout=10, check=False)

    # Download files (LFS via curl, small via hf_hub_download)
    for repo_id, filename, dest_path, is_lfs in batch["files"]:
        print(f"\n  Downloading {filename} from {repo_id} (LFS={is_lfs})...")
        sys.stdout.flush()
        if is_lfs:
            download_curl(repo_id, filename, dest_path)
        else:
            download_small_file(repo_id, filename, dest_path)

    # Download tokenizer directories
    for repo_id, dir_path, dest_dir in batch.get("tokenizers", []):
        print(f"\n  Downloading tokenizer dir {dir_path} from {repo_id}...")
        sys.stdout.flush()
        download_tokenizer_dir(repo_id, dir_path, dest_dir)

    # Download wav2vec2 (special case)
    if batch.get("wav2vec2"):
        print(f"\n  Downloading chinese-wav2vec2-base from modelscope.cn...")
        sys.stdout.flush()
        download_wav2vec2("chinese-wav2vec2-base")

    batch_time = (time.time() - batch_start) / 60
    print(f"\n  Batch {batch_idx+1} download time: {batch_time:.1f} min")

    run(f"du -sh {DATASET_DIR}", timeout=30, check=False)

    # Verify before push
    if not verify_files(batch):
        print(f"\n  [ERROR] File verification failed! Skipping push.")
        sys.exit(1)

    # Push as new dataset version
    push_dataset_version(meta_path, f"Batch {batch_idx+1}: {batch_name}")

    # Free space (except last batch)
    if batch_idx < len(BATCHES) - 1:
        free_space()

total_time = (time.time() - total_start) / 60
print(f"\n{'='*70}")
print(f"Total time: {total_time:.1f} min")
print(f"Dataset: https://www.kaggle.com/datasets/{DATASET_ID}")
print(f"{'='*70}")

print(f"\n--- Final dataset contents ---")
run(f"find {DATASET_DIR} -type f -exec ls -la {{}} \\; 2>/dev/null | head -50", timeout=30, check=False)
