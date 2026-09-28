#!/bin/bash
# #391 Video-MME bench downloader (NOT production code).
#
# Serial + spaced is the ONLY pattern that survives YouTube's rate limiter here:
# measured on 2026-09-28 (issue #405) — a burst batch of 23 got 100% blocked,
# one-at-a-time with request sleeps and a single retry got 22/23. A general
# serial-limited downloader shared by bench and production is what #405 asks
# for; until it lands this script stays bench-local.
#
# Usage: SUBSET=<path.csv> GAP=6 bash download_videomme.sh   (skips videos/
# entries already on disk, so it is resumable — rerun after an interrupted pass)
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
VM=${VM:-$ROOT/.scratch/keyframe-bench/videomme}
SUBSET=${SUBSET:-$VM/bench_subset.csv}
PROXY=${PROXY:-http://127.0.0.1:7897}
YTDLP=${YTDLP:-$HOME/.lightning-env/bin/yt-dlp}
GAP=${GAP:-6}

mkdir -p "$VM/videos"
n=0
while IFS=, read -r vid dur url domain sub _rest; do
  [ "$vid" = "videoID" ] && continue
  [ -z "$vid" ] && continue
  if [ -f "$VM/videos/$vid.mp4" ]; then
    echo "$vid have"
    continue
  fi
  HTTPS_PROXY="$PROXY" "$YTDLP" -q --no-warnings \
    --sleep-requests 3 --sleep-interval 8 --retries 3 \
    -f "bestvideo[height<=360]+bestaudio/best[height<=360]/best" \
    --merge-output-format mp4 --max-filesize 100M \
    -o "$VM/videos/%(id)s.mp4" "$url" 2>/dev/null
  echo "$vid rc=$?"
  n=$((n + 1))
  sleep "$GAP"
done < "$SUBSET"
echo "ATTEMPTED=$n ALL_DONE"
