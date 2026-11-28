#!/usr/bin/env bash
# push-model-cache-build.sh — build + publish the #1537 Colab model cache.
#
# The build runs on Kaggle on purpose: `xpabloli/cosyvoice3-model` already holds
# the Fun-CosyVoice3 weights, so the archive is tarred from the mounted dataset
# (no 5.4GB download on the laptop, no Colab quota) and uploaded straight to the
# public HuggingFace dataset that `COSYVOICE3_COLAB_MODEL_CACHE_URL` points at.
#
# The HF token travels only inside a *private* Kaggle kernel; the kernel is
# deleted after a successful run unless --keep-kernel is passed. Prefer a
# fine-grained token limited to the cache dataset when rotating credentials.
#
# Usage:
#   scripts/short-video/colab/push-model-cache-build.sh [--no-wait] [--keep-kernel]
#
# Requires: `kaggle` CLI authenticated as xpabloli, HF write token in $HF_TOKEN
# or ~/.cache/huggingface/token.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/build-model-cache-kernel.py"
KERNEL_ID="xpabloli/1537-colab-model-cache"
HF_REPO="${HF_REPO:-0xpabloli/cosyvoice3-colab-cache}"
TARGET_NAME="${TARGET_NAME:-cosyvoice3-model-cache.tar}"
WAIT=1
KEEP_KERNEL=0
for arg in "$@"; do
  case "$arg" in
    --no-wait) WAIT=0 ;;
    --keep-kernel) KEEP_KERNEL=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[ -f "$TEMPLATE" ] || { echo "FAIL: missing $TEMPLATE" >&2; exit 1; }

TOKEN_FILE="${HF_TOKEN_FILE:-$HOME/.cache/huggingface/token}"
TOKEN="${HF_TOKEN:-$(cat "$TOKEN_FILE" 2>/dev/null || true)}"
[ -n "$TOKEN" ] || { echo "FAIL: no HF token (set HF_TOKEN or $TOKEN_FILE)" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

TEMPLATE_FOR_PY="$TEMPLATE" WORK_FOR_PY="$WORK" TOKEN_FOR_PY="$TOKEN" \
HF_REPO_FOR_PY="$HF_REPO" TARGET_FOR_PY="$TARGET_NAME" KERNEL_ID_FOR_PY="$KERNEL_ID" \
python3 - <<'PY'
import base64, json, os, pathlib

template = pathlib.Path(os.environ["TEMPLATE_FOR_PY"]).read_text()
work = pathlib.Path(os.environ["WORK_FOR_PY"])
token_b64 = base64.b64encode(os.environ["TOKEN_FOR_PY"].encode()).decode()

rendered = (
    template.replace("__HF_TOKEN_B64__", token_b64)
    .replace("__HF_REPO__", os.environ["HF_REPO_FOR_PY"])
    .replace("__TARGET_NAME__", os.environ["TARGET_FOR_PY"])
)
work.joinpath("build_model_cache.py").write_text(rendered)
work.joinpath("kernel-metadata.json").write_text(
    json.dumps(
        {
            "id": os.environ["KERNEL_ID_FOR_PY"],
            "title": "1537-colab-model-cache",
            "code_file": "build_model_cache.py",
            "language": "python",
            "kernel_type": "script",
            "is_private": True,
            "enable_gpu": False,
            "enable_tpu": False,
            "enable_internet": True,
            "machine_shape": "",
            "dataset_sources": ["xpabloli/cosyvoice3-model"],
            "competition_sources": [],
            "kernel_sources": [],
            "model_sources": [],
        },
        indent=2,
    )
    + "\n"
)
print("rendered kernel:", work)
PY

echo "==> pushing $KERNEL_ID"
kaggle kernels push -p "$WORK"

if [ "$WAIT" -eq 0 ]; then
  echo "==> not waiting; check: kaggle kernels status $KERNEL_ID"
  exit 0
fi

STAMP="$(date +%Y%m%dT%H%M%S)"
LOG_DIR="$HERE/../output"
LOG_FILE="$LOG_DIR/model-cache-build-$STAMP.log"
mkdir -p "$LOG_DIR"

echo "==> waiting for $KERNEL_ID (poll 30s, budget 2h)"
DEADLINE=$(( $(date +%s) + 7200 ))
while :; do
  STATUS_TEXT="$(kaggle kernels status "$KERNEL_ID" 2>&1 || true)"
  echo "$STATUS_TEXT" | tail -1
  if echo "$STATUS_TEXT" | grep -qi "COMPLETE"; then
    kaggle kernels logs "$KERNEL_ID" > "$LOG_FILE" 2>&1 || true
    echo "==> log: $LOG_FILE"
    grep -E "CACHE_URL=|sha256:|archive:" "$LOG_FILE" | tail -5 || true
    if grep -q "CACHE_URL=" "$LOG_FILE"; then
      if [ "$KEEP_KERNEL" -eq 0 ]; then
        echo "==> deleting private builder kernel (token hygiene)"
        kaggle kernels delete "$KERNEL_ID" --yes >/dev/null 2>&1 || \
          echo "WARN: kernel delete failed — delete $KERNEL_ID manually"
      fi
      echo "✅ cache archive published: $(grep -o 'CACHE_URL=.*' "$LOG_FILE" | tail -1 | cut -d= -f2-)"
      exit 0
    fi
    echo "FAIL: kernel completed without CACHE_URL; see $LOG_FILE" >&2
    exit 1
  fi
  if echo "$STATUS_TEXT" | grep -qiE "ERROR|CANCEL|FAILED"; then
    kaggle kernels logs "$KERNEL_ID" > "$LOG_FILE" 2>&1 || true
    echo "FAIL: kernel did not complete; log: $LOG_FILE" >&2
    tail -40 "$LOG_FILE" >&2 || true
    exit 1
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "FAIL: timed out waiting for $KERNEL_ID" >&2
    exit 1
  fi
  sleep 30
done
