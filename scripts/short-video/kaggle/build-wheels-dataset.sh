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
# Run it ON Kaggle, not on the laptop: `kaggle kernels push` a script kernel
# that base64-embeds this file and calls it (kernel slug
# xPabloLI/231-build-wheels-dataset). Three reasons, all learned the hard way
# on 2026-10-09: Kaggle's own network pulls the 3.7GB set at 70-180MB/s where a
# home link manages ~0.7MB/s; group 5 compiles pyworld, and building it on the
# same image the TTS kernel uses keeps the ABI identical; and the CLI inside a
# kernel is authenticated, so the push step needs no local credentials.
#
# Requires: kaggle CLI authenticated; ~8GB free disk; a modern pip (--platform).
#
# Target platform is resolved explicitly for Kaggle's runtime (linux x86_64 /
# CPython 3.13) so groups 1-4 resolve correctly from any host. Two traps that
# make a naive cross-platform resolve silently incomplete, both handled below:
#   * pip does NOT expand manylinux_2_17 into the legacy alias manylinux2014
#     (the nvidia-* wheels are only tagged manylinux2014), so both spellings
#     must be listed;
#   * --platform does NOT change environment-marker evaluation: deps guarded
#     by `platform_system == "Linux"` (torch's nvidia-*/triton pins) are
#     dropped on a macOS host, so they are downloaded explicitly in group 3
#     and asserted present at the end.
#
# Group 5 has no such luxury — it compiles — so it refuses to run off-Linux.
set -euo pipefail

OUT_DIR="${1:-/tmp/cosyvoice3-wheels}"
PY="${PYTHON:-python3}"

# A rerun must not inherit the previous attempt's wheels: the completeness
# check below is presence-only, so a stale wheel from a half-finished build
# would satisfy it and get published as if it were part of this set.
if [ -n "$(ls -A "$OUT_DIR" 2>/dev/null)" ]; then
  echo "==> clearing $OUT_DIR from a previous build"
  rm -rf "${OUT_DIR:?}"/*
fi

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

# Each group reports its file count: the download is minutes long and silent
# with -q, so without this a slow group is indistinguishable from a hang.
wheels_so_far() { find "$OUT_DIR" -maxdepth 1 -name '*.whl' | wc -l | tr -d ' '; }

echo "==> group 1/5: build tooling (PyPI)"
"$PY" -m pip download -q -d "$OUT_DIR" "${TARGET[@]}" \
  "setuptools<81" wheel Cython \
  --index-url https://pypi.org/simple
echo "    $(wheels_so_far) wheels so far"

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
echo "    $(wheels_so_far) wheels so far"

echo "==> group 3/5: torch's Linux-only deps (marker-guarded, see header)"
"$PY" -m pip download -q -d "$OUT_DIR" "${TARGET[@]}" \
  "${TORCH_LINUX_DEPS[@]}" \
  --index-url https://pypi.org/simple
echo "    $(wheels_so_far) wheels so far"

echo "==> group 4/5: hydra/omegaconf wheels (--no-deps: their only unwheelable"
echo "    dep is antlr4, which comes as an sdist in group 5)"
"$PY" -m pip download -q -d "$OUT_DIR" "${TARGET[@]}" --no-deps \
  omegaconf==2.3.0 hydra-core==1.3.2 \
  --index-url https://pypi.org/simple
echo "    $(wheels_so_far) wheels so far"

echo "==> group 5/5: sdist-only packages, built into wheels here"
# Built rather than shipped as sdists: Kaggle unpacks archives inside a
# dataset, so a mounted sdist arrives as a `<name>-<ver>/<name>-<ver>/`
# directory that `--find-links` cannot see.
#
# This group must run on the consuming platform. Unlike groups 1-4 it carries
# no --platform flags — `pip wheel` compiles for the host — so on macOS it
# would emit arm64 wheels that the completeness check happily accepts (it
# matches names and versions, not platform tags) and that fail on Kaggle.
if [ "$(uname -s)" != "Linux" ]; then
  echo "FAIL: group 5 compiles for the host; run this script on the Kaggle image"
  echo "      (see the header: push it as a script kernel instead)"
  exit 1
fi
"$PY" -m pip wheel -q --no-deps -w "$OUT_DIR" \
  pyworld==0.3.4 wget==3.2 antlr4-python3-runtime==4.9.3 openai-whisper \
  --index-url https://pypi.org/simple
echo "    $(wheels_so_far) wheels so far"

echo "==> verifying completeness against torch's own metadata"
"$PY" - "$OUT_DIR" <<'PYEOF'
import glob, os, re, sys, zipfile

out = sys.argv[1]
wheels = {os.path.basename(p) for p in glob.glob(os.path.join(out, "*.whl"))}
size = sum(os.path.getsize(os.path.join(out, w)) for w in wheels)
print(f"    wheelhouse: {len(wheels)} wheels, {size / 1e9:.1f}GB")

def present(name, version, pool):
    """Is a wheel for exactly `name==version` in the wheelhouse?

    The version is checked, not just the name: a stale or wrong-version wheel
    satisfies a name-only prefix match and would sail through this gate, then
    fail the kernel's exact-pin install minutes into a Kaggle run. `version`
    is None for the deliberately unpinned packages, which match by name.
    """
    n = re.sub(r"[-_.]+", "-", name).lower()
    for w in pool:
        stem = re.sub(r"[-_.]+", "-", w).lower()
        if not stem.startswith(n + "-"):
            continue
        if version is None:
            return True
        rest = re.sub(r"[-_]+", ".", stem[len(n) + 1:])
        if rest.startswith(re.sub(r"[-_]+", ".", version).lower()):
            return True
    return False

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


def parse_requirement(spec):
    """`(name, version)` from a requirement spec, version None when unpinned.

    setuptools writes bracketed versions into METADATA — `nvidia-cudnn-cu12
    (==9.1.0.70)` — while PyPI's JSON reports `nvidia-cudnn-cu12==9.1.0.70`.
    Splitting on the version operator alone leaves a trailing " (" on the first
    form, which matches no file: every Linux dep then reads as missing even
    though the wheelhouse is complete (2026-10-09, cost one full build).
    A bare name is valid too — openai-whisper is deliberately unpinned.
    """
    m = re.match(r"([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\(\s*)?(?:==\s*([0-9][^\s,)]*))?", spec)
    if not m:
        sys.exit(f"FAIL: cannot parse a requirement from {spec!r}")
    return m.group(1), m.group(2)


missing = [d for d in linux_deps if not present(*parse_requirement(d), wheels)]
print(f"    torch {torch_whl}: {len(linux_deps)} Linux-marker deps, {len(missing)} missing")
for d in missing:
    name, _ = parse_requirement(d)
    print(f"    MISSING: {d}")
    for w in sorted(wheels):
        if name.lower().replace("_", "-") in w.lower().replace("_", "-"):
            print(f"        but this file looks related: {w}")
if missing:
    sys.exit("FAIL: wheelhouse is incomplete — do not push")

# The kernel installs these with --no-index too, and none of them publish a
# Linux wheel, so each is built here (group 5). Checked by name and version
# rather than by counting: one of them (wget) ships as a .zip, and a count
# would pass on the wrong set while still missing the one the kernel needs.
SDIST_ONLY = ["pyworld==0.3.4", "wget==3.2", "antlr4-python3-runtime==4.9.3", "openai-whisper"]
absent = [p for p in SDIST_ONLY if not present(*parse_requirement(p), wheels)]
for p in absent:
    print(f"    MISSING: {p} (built wheel expected)")
if absent:
    sys.exit("FAIL: wheelhouse is incomplete — do not push")
print(f"    OK: every Linux-marker dep + all {len(SDIST_ONLY)} built-from-sdist packages present")
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

# The CLI exits 0 even when the API rejects the request — a 2026-10-09 probe
# got "Dataset creation error: The requested title … is already in use by a
# notebook" with rc=0, and cloud-gpu-options.md records the same for "Please
# upload at least one file". So the check is a positive signal: something must
# say the push succeeded. A denylist of error words misses the failures nobody
# thought to name.
#
# Matched against a file, never a pipe: `printf … | grep -q` under
# `set -o pipefail` reports failure even on a match, because grep exits at the
# first hit and printf dies of SIGPIPE (141). That turned a successful 114-file
# upload into "no success signal" on the 2026-10-09 v6 run.
#
# Re-running after a first publish means `version` instead of `create`.
echo "==> pushing dataset (kaggle CLI)"
PUSH_LOG="$OUT_DIR/push.log"
kaggle datasets create -p "$OUT_DIR" --dir-mode zip >"$PUSH_LOG" 2>&1 || true
if grep -qi "already.*exists\|already in use" "$PUSH_LOG"; then
  echo "    dataset exists — publishing a new version"
  kaggle datasets version -p "$OUT_DIR" --dir-mode zip \
    -m "wheels rebuild $(date -u +%Y-%m-%dT%H:%MZ)" >"$PUSH_LOG" 2>&1 || true
fi
cat "$PUSH_LOG"
if ! grep -qi "successfully\|upload successful\|starting upload\|dataset version" "$PUSH_LOG"; then
  echo "FAIL: the dataset push printed no success signal (the CLI exits 0 even when it fails)"
  exit 1
fi
if grep -qi "error\|failed\|exceed" "$PUSH_LOG"; then
  echo "FAIL: the dataset push reported an error"
  exit 1
fi
rm -f "$PUSH_LOG"

echo "✅ Done. xpabloli/cosyvoice3-wheels is attached to the TTS kernel's dataset_sources."
echo "   A TTS run's kernel log shows it taking effect:"
echo "     restored local versions in 3 filenames: ['torch-2.6.0+cu124-...']"
echo "     wheels dataset mount found: /kaggle/input/cosyvoice3-wheels — offline install mode"
echo "   Verified 2026-10-09: 633s online → 512s offline for a 2-scene batch, no PyPI traffic."
