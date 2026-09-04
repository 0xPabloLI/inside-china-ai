#!/usr/bin/env bash
# Sync digital human test fixtures into each Kaggle test's input/ staging dir.
# Run before `kaggle datasets push`.
set -euo pipefail

FIXTURES="$(cd "$(dirname "$0")/../short-video/assets/dh-fixtures" && pwd)"

sync_echomimicv3() {
  local dir="$(dirname "$0")/echomimicv3-test/input"
  echo "[sync] echomimicv3-test/input"
  cp "$FIXTURES/portrait-fullbody.jpg" "$dir/portrait.jpg"
  cp "$FIXTURES/portrait-face.jpg"     "$dir/weixin-portrait.jpg"
  cp "$FIXTURES/audio.mp3"             "$dir/audio.mp3"
  cp "$FIXTURES/audio-10s.mp3"         "$dir/audio-10s.mp3"
}

sync_infinitetalk() {
  local dir="$(dirname "$0")/infinitetalk-test/input"
  echo "[sync] infinitetalk-test/input"
  cp "$FIXTURES/portrait-face.jpg" "$dir/portrait.jpg"
  cp "$FIXTURES/audio.wav"         "$dir/audio.wav"
}

sync_echomimicv3
sync_infinitetalk
echo "[sync] done. Now run: kaggle datasets push -p scripts/kaggle/<test>/input/"