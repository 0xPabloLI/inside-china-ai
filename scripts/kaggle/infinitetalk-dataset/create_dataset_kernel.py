"""
Kaggle kernel: Download InfiniteTalk model files from HuggingFace
and create a Kaggle Dataset for use by the inference kernel.

Strategy: Download in batches (each batch < 18GB to fit in /kaggle/working ~20GB),
upload each batch as a new version of the dataset, then delete local files
to free space for the next batch.

Final dataset structure:
  /kaggle/input/infinitetalk-models/
    Wan2.1-I2V-14B-480P/
      config.json
      Wan2.1_VAE.pth
      models_t5_umt5-xxl-enc-bf16.pth
      models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth
      diffusion_pytorch_model.safetensors.index.json
      google/umt5-xxl/...
      xlm-roberta-large/...
    InfiniteTalk/
      quant_models/
        infinitetalk_single_fp8.safetensors
        infinitetalk_single_fp8.json
        t5_fp8.safetensors
        t5_map_fp8.json
    chinese-wav2vec2-base/
      pytorch_model.bin
      model.safetensors
      ...

Usage:
  1. Upload kaggle.json to a private dataset (e.g. xpabloli/kaggle-secrets)
  2. Set kernel-metadata.json dataset_sources to include the secrets dataset
  3. Push this kernel: kaggle kernels push -p scripts/kaggle/infinitetalk-dataset/
  4. Wait for completion (check output log)
  5. Verify dataset at kaggle.com/datasets/xpabloli/infinitetalk-models
"""

import os
import sys
import subprocess
import time
import json
import shutil

WORK_DIR = "/kaggle/working"
DATASET_DIR = os.path.join(WORK_DIR, "infinitetalk-models")

# Kaggle credentials — read from a secrets dataset mounted at /kaggle/input/
# The secrets dataset should contain a file named "kaggle.json" with:
# {"username": "xpabloli", "key": "..."}
KAGGLE_SECRETS_PATHS = [
    "/kaggle/input/kaggle-secrets/kaggle.json",
    "/kaggle/input/xpabloli-kaggle-secrets/kaggle.json",
]

# Dataset metadata
DATASET_ID = "xpabloli/infinitetalk-models"
DATASET_TITLE = "InfiniteTalk Models (FP8)"

# Model files to download, grouped by batch (each batch < 18GB)
BATCHES = [
    # Batch 1: Small base files (~5.3GB)
    {
        "name": "base-small",
        "files": [
            ("Wan-AI/Wan2.1-I2V-14B-480P", "config.json",
             "Wan2.1-I2V-14B-480P/config.json"),
            ("Wan-AI/Wan2.1-I2V-14B-480P", "Wan2.1_VAE.pth",
             "Wan2.1-I2V-14B-480P/Wan2.1_VAE.pth"),
            ("Wan-AI/Wan2.1-I2V-14B-480P", "diffusion_pytorch_model.safetensors.index.json",
             "Wan2.1-I2V-14B-480P/diffusion_pytorch_model.safetensors.index.json"),
        ],
        "globs": [
            ("Wan-AI/Wan2.1-I2V-14B-480P", "google/umt5-xxl/*",
             "Wan2.1-I2V-14B-480P/google/umt5-xxl/"),
            ("Wan-AI/Wan2.1-I2V-14B-480P", "xlm-roberta-large/*",
             "Wan2.1-I2V-14B-480P/xlm-roberta-large/"),
        ],
    },
    # Batch 2: T5 + CLIP (~16.2GB)
    {
        "name": "base-large",
        "files": [
            ("Wan-AI/Wan2.1-I2V-14B-480P", "models_t5_umt5-xxl-enc-bf16.pth",
             "Wan2.1-I2V-14B-480P/models_t5_umt5-xxl-enc-bf16.pth"),
            ("Wan-AI/Wan2.1-I2V-14B-480P", "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth",
             "Wan2.1-I2V-14B-480P/models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth"),
        ],
        "globs": [],
    },
    # Batch 3: FP8 DiT (~19.5GB — just fits under 20GB)
    {
        "name": "fp8-dit",
        "files": [
            ("MeiGen-AI/InfiniteTalk", "quant_models/infinitetalk_single_fp8.safetensors",
             "InfiniteTalk/quant_models/infinitetalk_single_fp8.safetensors"),
            ("MeiGen-AI/InfiniteTalk", "quant_models/infinitetalk_single_fp8.json",
             "InfiniteTalk/quant_models/infinitetalk_single_fp8.json"),
        ],
        "globs": [],
    },
    # Batch 4: T5 FP8 + wav2vec2 (~7.1GB)
    {
        "name": "t5-fp8-wav2vec2",
        "files": [
            ("MeiGen-AI/InfiniteTalk", "quant_models/t5_fp8.safetensors",
             "InfiniteTalk/quant_models/t5_fp8.safetensors"),
            ("MeiGen-AI/InfiniteTalk", "quant_models/t5_map_fp8.json",
             "InfiniteTalk/quant_models/t5_map_fp8.json"),
        ],
        "globs": [
            ("TencentGameMate/chinese-wav2vec2-base", None,
             "chinese-wav2vec2-base/"),
        ],
    },
]

def run(cmd, timeout=3600, check=True):
    print(f"\n>>> {cmd[:200]}{'...' if len(cmd) > 200 else ''}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    if result.stdout:
        print(result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout)
    if result.stderr:
        lines = [l for l in result.stderr.split('\n')
                if l.strip() and 'it/s]' not in l and 's/it]' not in l
                and not l.startswith('  Downloading')
                and 'FutureWarning' not in l
                and 'warnings.warn' not in l]
        if lines:
            print("STDERR:", '\n'.join(lines[-30:]))
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result

def setup_kaggle_credentials():
    """Set up Kaggle API credentials.

    In Kaggle notebooks, KAGGLE_USERNAME and KAGGLE_KEY are set automatically
    as environment variables. We just need to make sure kaggle CLI can find them.
    """
    # Check if already set (Kaggle notebooks set these automatically)
    if os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"):
        print(f"[OK] Kaggle credentials found in environment (user: {os.environ['KAGGLE_USERNAME']})")
        return True

    # Fallback: try to read from /root/.kaggle/kaggle.json
    kaggle_json = os.path.expanduser("~/.kaggle/kaggle.json")
    if os.path.exists(kaggle_json):
        with open(kaggle_json) as f:
            creds = json.load(f)
        os.environ["KAGGLE_USERNAME"] = creds["username"]
        os.environ["KAGGLE_KEY"] = creds["key"]
        print(f"[OK] Kaggle credentials loaded from {kaggle_json}")
        return True

    # Fallback 2: try secrets dataset
    for path in KAGGLE_SECRETS_PATHS:
        if os.path.exists(path):
            with open(path) as f:
                creds = json.load(f)
            os.environ["KAGGLE_USERNAME"] = creds["username"]
            os.environ["KAGGLE_KEY"] = creds["key"]
            print(f"[OK] Kaggle credentials loaded from {path}")
            return True

    print("[ERROR] Kaggle credentials not found!")
    print("  In Kaggle notebooks, KAGGLE_USERNAME and KAGGLE_KEY should be set automatically.")
    print("  If not, add a private dataset with kaggle.json to kernel-metadata.json dataset_sources")
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

def download_file(repo_id, filename, dest_rel_path):
    """Download a single file from HuggingFace."""
    dest_path = os.path.join(DATASET_DIR, dest_rel_path)
    if os.path.exists(dest_path):
        print(f"  [SKIP] {dest_rel_path} already exists ({os.path.getsize(dest_path)/1024**3:.2f} GB)")
        return
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    # Use hf download with specific file
    run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download {repo_id} {filename} "
        f"--local-dir {os.path.join(DATASET_DIR, os.path.dirname(dest_rel_path))}",
        timeout=1800)

def download_glob(repo_id, pattern, dest_rel_dir):
    """Download files matching a glob pattern from HuggingFace."""
    dest_path = os.path.join(DATASET_DIR, dest_rel_dir)
    if os.path.exists(dest_path) and os.listdir(dest_path):
        print(f"  [SKIP] {dest_rel_dir} already has files")
        return
    os.makedirs(dest_path, exist_ok=True)
    # Download the whole repo (for wav2vec2) or use --include for specific dirs
    if pattern is None:
        # Download entire repo (for chinese-wav2vec2-base)
        run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download {repo_id} "
            f"--local-dir {dest_path}", timeout=600)
        # Also get the safetensors version
        run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download {repo_id} model.safetensors "
            f"--revision refs/pr/1 --local-dir {dest_path}", timeout=600, check=False)
    else:
        run(f"HF_HUB_ENABLE_HF_TRANSFER=1 hf download {repo_id} "
            f"--include '{pattern}' --local-dir {dest_path}",
            timeout=1800)

def push_dataset_version(meta_path, version_msg):
    """Push current /kaggle/working/infinitetalk-models/ as a new dataset version."""
    print(f"\n  Pushing dataset version: {version_msg}")
    # Ensure metadata is correct
    with open(meta_path) as f:
        meta = json.load(f)
    if meta.get("id") != DATASET_ID:
        meta["id"] = DATASET_ID
        meta["title"] = DATASET_TITLE
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)

    result = run(f"kaggle datasets version -p {DATASET_DIR} -m '{version_msg}'",
                 timeout=1800, check=False)
    if result.returncode == 0:
        print(f"  [OK] Dataset version pushed successfully")
    else:
        # If version fails (dataset doesn't exist yet), try create
        print(f"  Version push failed, trying create...")
        result = run(f"kaggle datasets create -p {DATASET_DIR}",
                     timeout=1800, check=False)
        if result.returncode == 0:
            print(f"  [OK] Dataset created successfully")
        else:
            print(f"  [ERROR] Failed to create/push dataset")
    return result.returncode == 0

def free_space():
    """Delete all files in DATASET_DIR to free disk space for next batch."""
    print(f"\n  Freeing disk space...")
    for item in os.listdir(DATASET_DIR):
        if item == "dataset-metadata.json":
            continue  # Keep metadata
        item_path = os.path.join(DATASET_DIR, item)
        if os.path.isdir(item_path):
            shutil.rmtree(item_path)
        else:
            os.remove(item_path)
    # Show disk usage
    run(f"df -h /kaggle/working", timeout=10, check=False)

print("=" * 70)
print("InfiniteTalk Dataset Creation Kernel")
print("=" * 70)
print(f"Dataset: {DATASET_ID}")
print(f"Strategy: Download in {len(BATCHES)} batches, push each as new version")
print()

# Step 0: Check environment
print("--- Step 0: Environment Check ---")
run("df -h /kaggle/working", timeout=10, check=False)
run("nvidia-smi", timeout=30, check=False)

# Install hf CLI
run(f"{sys.executable} -m pip install -q huggingface_hub hf_transfer", timeout=120)

# Step 1: Set up Kaggle credentials
print("\n--- Step 1: Set up Kaggle credentials ---")
if not setup_kaggle_credentials():
    sys.exit(1)

# Step 2: Initialize dataset
print("\n--- Step 2: Initialize dataset metadata ---")
meta_path = init_dataset()

# Step 3: Download in batches
total_start = time.time()
for batch_idx, batch in enumerate(BATCHES):
    batch_name = batch["name"]
    print(f"\n{'='*60}")
    print(f"Batch {batch_idx+1}/{len(BATCHES)}: {batch_name}")
    print(f"{'='*60}")

    batch_start = time.time()
    run("df -h /kaggle/working", timeout=10, check=False)

    # Download files
    for repo_id, filename, dest_path in batch["files"]:
        print(f"\n  Downloading {filename} from {repo_id}...")
        download_file(repo_id, filename, dest_path)

    # Download globs
    for repo_id, pattern, dest_dir in batch["globs"]:
        print(f"\n  Downloading {pattern or 'all files'} from {repo_id}...")
        download_glob(repo_id, pattern, dest_dir)

    batch_time = (time.time() - batch_start) / 60
    print(f"\n  Batch {batch_idx+1} download time: {batch_time:.1f} min")

    # Show disk usage
    run(f"du -sh {DATASET_DIR}", timeout=30, check=False)

    # Push as new dataset version
    push_dataset_version(meta_path, f"Batch {batch_idx+1}: {batch_name}")

    # Free space for next batch (except last batch — keep files for final version)
    if batch_idx < len(BATCHES) - 1:
        free_space()

total_time = (time.time() - total_start) / 60
print(f"\n{'='*70}")
print(f"Total time: {total_time:.1f} min")
print(f"Dataset: https://www.kaggle.com/datasets/{DATASET_ID}")
print(f"{'='*70}")

# Final verification: list all files in dataset
print(f"\n--- Final dataset contents ---")
run(f"find {DATASET_DIR} -type f -exec ls -la {{}} \\; 2>/dev/null | head -50", timeout=30, check=False)
