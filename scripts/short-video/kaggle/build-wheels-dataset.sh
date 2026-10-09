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
# Requires: kaggle CLI authenticated; ~6GB disk; a modern pip (--platform).
#
# Target platform is resolved explicitly for Kaggle's runtime (linux x86_64 /
# CPython 3.13), so this runs from macOS/arm64 too. Two traps that make a
# naive cross-platform resolve silently incomplete, both handled below:
#   * pip does NOT expand manylinux_2_17 into the legacy alias manylinux2014
#     (the nvidia-* wheels are only tagged manylinux2014), so both spellings
#     must be listed;
#   * --platform does NOT change environment-marker evaluation: deps guarded
#     by `platform_system == "Linux"` (torch's nvidia-*/triton pins) are
#     dropped on a macOS host, so they are downloaded explicitly in group 3
#     and asserted present at the end.
#
# The four sdist-only packages — pyworld (Linux), wget, antlr4-python3-runtime
# and openai-whisper, none of which publish a Linux wheel — are downloaded as
# sdists; the kernel builds them with --no-build-isolation. Everything else
# must resolve to a wheel: --only-binary=:all: makes a missing wheel fail here,
# at build time, instead of mid-run on Kaggle.
set -euo pipefail

OUT_DIR="${1:-/tmp/cosyvoice3-wheels}"
PY="${PYTHON:-python3}"

TARGET=(
  --platform manylinux_2_28_x86_64
  --platform manylinux_2_17_x86_64
  --platform manylinux2014_x86_64
  --platform linux_x86_64
  --python-version 3.13
  --implementation cp
  --abi cp313
  --only-binary=:all:
)

# torch 2.6.0+cu124's Linux-only deps, pinned exactly in its metadata.
TORCH_LINUX_DEPS=(
  "nvidia-cuda-nvrtc-cu12==12.4.127"
  "nvidia-cuda-runtime-cu12==12.4.127"
  "nvidia-cuda-cupti-cu12==12.4.127"
  "nvidia-cudnn-cu12==9.1.0.70"
  "nvidia-cublas-cu12==12.4.5.8"
  "nvidia-cufft-cu12==11.2.1.3"
  "nvidia-curand-cu12==10.3.5.147"
  "nvidia-cusolver-cu12==11.6.1.9"
  "nvidia-cusparse-cu12==12.3.1.170"
  "nvidia-cusparselt-cu12==0.6.2"
  "nvidia-nccl-cu12==2.21.5"
  "nvidia-nvtx-cu12==12.4.127"
  "nvidia-nvjitlink-cu12==12.4.127"
  "triton==3.2.0"
)

mkdir -p "$OUT_DIR"

echo "==> group 1/5: build tooling (PyPI)"
"$PY" -m pip download -q -d "$OUT_DIR" "${TARGET[@]}" \
  "setuptools<81" wheel Cython \
  --index-url https://pypi.org/simple

echo "==> group 2/5: torch trio + core deps (pypi primary, pytorch cu124 for the trio)"
"$PY" -m pip download -q -d "$OUT_DIR" "${TARGET[@]}" \
  torch==2.6.0 torchaudio==2.6.0 torchvision==0.21.0 \
  conformer==0.3.2 HyperPyYAML==1.2.3 \
  inflect==7.3.1 librosa==0.10.2 modelscope==1.20.0 \
  onnx==1.18.0 soundfile==0.12.1 \
  wetext==0.0.4 gdown==5.1.0 \
  transformers==4.51.3 lightning==2.2.4 x-transformers==2.11.24 \
  onnxruntime-gpu==1.20.0 tiktoken numba \
  --index-url https://pypi.org/simple \
  --extra-index-url https://download.pytorch.org/whl/cu124

echo "==> group 3/5: torch's Linux-only deps (marker-guarded, see header)"
"$PY" -m pip download -q -d "$OUT_DIR" "${TARGET[@]}" \
  "${TORCH_LINUX_DEPS[@]}" \
  --index-url https://pypi.org/simple

echo "==> group 4/5: hydra/omegaconf wheels (--no-deps: their only unwheelable"
echo "    dep is antlr4, which comes as an sdist in group 5)"
"$PY" -m pip download -q -d "$OUT_DIR" "${TARGET[@]}" --no-deps \
  omegaconf==2.3.0 hydra-core==1.3.2 \
  --index-url https://pypi.org/simple

echo "==> group 5/5: sdist-only packages (built by the kernel with --no-build-isolation)"
"$PY" -m pip download -q -d "$OUT_DIR" --no-deps --no-binary=:all: \
  pyworld==0.3.4 wget==3.2 antlr4-python3-runtime==4.9.3 openai-whisper \
  --index-url https://pypi.org/simple

echo "==> verifying completeness against torch's own metadata"
"$PY" - "$OUT_DIR" <<'PYEOF'
import glob, os, re, sys, zipfile

out = sys.argv[1]
wheels = {os.path.basename(p) for p in glob.glob(os.path.join(out, "*.whl"))}
sdists = {os.path.basename(p) for p in glob.glob(os.path.join(out, "*.tar.gz"))}
size = sum(os.path.getsize(os.path.join(out, f)) for f in wheels | sdists)
print(f"    wheelhouse: {len(wheels)} wheels + {len(sdists)} sdists, {size / 1e9:.1f}GB")

def present(name):
    n = re.sub(r"[-_.]+", "-", name).lower()
    return any(re.sub(r"[-_.]+", "-", w).lower().startswith(n + "-") for w in wheels)

torch_whl = next((w for w in wheels if w.startswith("torch-")), None)
if not torch_whl:
    sys.exit("FAIL: no torch wheel in the wheelhouse")
meta = zipfile.ZipFile(os.path.join(out, torch_whl)).read(
    next(n for n in zipfile.ZipFile(os.path.join(out, torch_whl)).namelist() if n.endswith("METADATA"))
).decode("utf-8", "replace")

linux_deps = []
for line in meta.splitlines():
    if not line.startswith("Requires-Dist:"):
        continue
    spec = line.split(":", 1)[1].strip()
    if "platform_system" in spec and "Linux" in spec:
        linux_deps.append(spec.split(";")[0].strip())

missing = [d for d in linux_deps if not present(re.split(r"[<>=!~]", d)[0])]
print(f"    torch {torch_whl}: {len(linux_deps)} Linux-marker deps, {len(missing)} missing")
for d in missing:
    print(f"    MISSING: {d}")
if missing:
    sys.exit("FAIL: wheelhouse is incomplete — do not push")
if len(sdists) != 4:
    sys.exit(f"FAIL: expected exactly 4 sdists (pyworld/wget/antlr4/openai-whisper), found {len(sdists)}: {sorted(sdists)}")
print("    OK: every Linux-marker dep present, 4 sdists as expected")
PYEOF

# Metadata is written only after the check passes, so a failed build never
# leaves a pushable dataset directory behind.
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
