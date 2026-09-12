#!/usr/bin/env bash
# build-wheels-dataset.sh — freeze the cosyvoice3-cuda-batch kernel's
# dependency set into a Kaggle dataset (#231).
#
# One-time (and after any deliberate dep bump) operation:
#   1. download the exact wheels the kernel's online path would resolve
#   2. push them as the xpabloli/cosyvoice3-wheels dataset
#   3. attach `xpabloli/cosyvoice3-wheels` in the kernel metadata's
#      dataset_sources — the kernel then installs offline via
#      `pip --no-index --find-links` (cosyvoice3_cuda_kernel.py #231 block)
#
# Requires: kaggle CLI authenticated; ~2-3GB disk; python 3.11 (Kaggle's
# image python) so the downloaded wheels match the runtime ABI.
set -euo pipefail

OUT_DIR="${1:-/tmp/cosyvoice3-wheels}"
PY="${PYTHON:-python3.11}"

mkdir -p "$OUT_DIR"

echo "==> downloading wheels (index: pytorch cu121 for the torch trio)"
"$PY" -m pip download -q -d "$OUT_DIR" \
  setuptools wheel Cython \
  --index-url https://pypi.org/simple
"$PY" -m pip download -q -d "$OUT_DIR" \
  torch==2.4.0 torchaudio==2.4.0 torchvision==0.19.0 \
  --index-url https://download.pytorch.org/whl/cu121
"$PY" -m pip download -q -d "$OUT_DIR" \
  conformer==0.3.2 hydra-core==1.3.2 HyperPyYAML==1.2.3 \
  inflect==7.3.1 librosa==0.10.2 modelscope==1.20.0 omegaconf==2.3.0 \
  onnx==1.16.0 pyworld==0.3.4 soundfile==0.12.1 \
  wetext==0.0.4 gdown==5.1.0 wget==3.2 \
  transformers==4.51.3 lightning==2.2.4 x-transformers==2.11.24 \
  onnxruntime-gpu==1.20.0 tiktoken numba openai-whisper

echo "==> writing dataset metadata"
cat > "$OUT_DIR/dataset-metadata.json" <<JSON
{
  "title": "cosyvoice3-wheels",
  "id": "xpabloli/cosyvoice3-wheels",
  "licenses": [{ "name": "other" }]
}
JSON

echo "==> pushing dataset (kaggle CLI)"
kaggle datasets create -p "$OUT_DIR" --dir-mode zip

echo "✅ Done. Now attach xpabloli/cosyvoice3-wheels to cosyvoice3-cuda-batch's dataset_sources."
echo "   Verify on the next real TTS run: kernel log must show 'wheels dataset mount found' and no PyPI traffic."
