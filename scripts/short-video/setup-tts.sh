#!/bin/bash
#
# Setup script for Kokoro TTS (neural text-to-speech)
# Creates a Python 3.12 virtual environment with Kokoro installed.
#
# Usage:
#   bash scripts/short-video/setup-tts.sh
#
# Prerequisites:
#   - Python 3.12 (brew install python@3.12)
#   - ~500MB disk space for model weights
#

set -e

VENV_PATH="${HOME}/.tts-env"

echo "🎙️  Setting up Kokoro TTS environment..."
echo "   Venv path: ${VENV_PATH}"
echo ""

# Check for Python 3.12
if ! command -v python3.12 &>/dev/null; then
  echo "❌ Python 3.12 not found. Install with: brew install python@3.12"
  exit 1
fi

# Create venv if it doesn't exist
if [ -d "${VENV_PATH}" ]; then
  echo "   Venv already exists, skipping creation."
else
  echo "   Creating Python 3.12 virtual environment..."
  python3.12 -m venv "${VENV_PATH}"
fi

# Install Kokoro
echo "   Installing Kokoro TTS package..."
source "${VENV_PATH}/bin/activate"
pip install kokoro --quiet

echo ""
echo "✅ Kokoro TTS setup complete!"
echo "   Venv: ${VENV_PATH}"
echo ""
echo "   The first TTS generation will download model weights (~350MB)."
echo "   Subsequent runs will be fast."
echo ""
echo "   To verify: source ${VENV_PATH}/bin/activate && python3 -c 'import kokoro; print(\"OK\")'"
