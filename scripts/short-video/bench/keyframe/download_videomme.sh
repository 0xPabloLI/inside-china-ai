#!/bin/bash
# #391 Video-MME bench downloader (NOT production code).
#
# Serial + spaced is the ONLY pattern that survives YouTube's rate limiter here:
# measured on 2026-09-28 (issue #405) — a burst batch of 23 got 100% blocked,
# one-at-a-time with request sleeps and a single retry got 22/23.
#
# The pacing numbers are NOT owned by this script. They come from `YTDLP_PACING`
# in `scripts/short-video/lib/ytdlp-guard.mjs` — the same constant both
# production adapters use — and are overridable through the same env vars
# (YTDLP_SLEEP_REQUESTS / YTDLP_SLEEP_INTERVAL / YTDLP_ITEM_GAP, seconds).
# The 412 penalty box is shared with production too: a penalized domain is
# skipped, a 412 response records the penalty, a success clears it.
#
# Usage: SUBSET=<path.csv> bash download_videomme.sh   (skips videos already
# on disk, so it is resumable — rerun after an interrupted pass)
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
VM=${VM:-$ROOT/.scratch/keyframe-bench/videomme}
SUBSET=${SUBSET:-$VM/bench_subset.csv}
# Default to Clash Verge's FIXED http listener, not its mixed-port: the mixed
# port is random since 2026-11-01 (`enable_random_port: true`), so any hardcoded
# value here would be a port that stops existing at the next restart. Override
# with `PROXY=$(npm run -s proxy:url)` to follow the system proxy instead.
PROXY=${PROXY:-http://127.0.0.1:7899}
YTDLP=${YTDLP:-$HOME/.lightning-env/bin/yt-dlp}
GUARD=$ROOT/scripts/short-video/lib/ytdlp-guard.mjs

# One short-lived node process per concern, importing the module production
# uses — a second copy of the pacing values or the 412 rule in bash is exactly
# what #405 removed.
guard_call() {
  node --input-type=module -e '
    const { pathToFileURL } = await import("node:url");
    const { readFileSync } = await import("node:fs");
    const [lib, cmd, arg, extra] = process.argv.slice(1);
    const m = await import(pathToFileURL(lib).href);
    if (cmd === "pacing") {
      const p = m.ytdlpPacing();
      console.log(p.sleepRequestsSec, p.sleepIntervalSec, p.itemGapSec);
      process.exit(0);
    }
    const domain = m.ytdlpDomain(arg);
    if (cmd === "gate") process.exit(m.ytdlpGate(domain) ? 0 : 1);
    if (cmd === "success") { m.ytdlpRecordSuccess(domain); process.exit(0); }
    if (cmd === "412") {
      const hit = m.matchYtdlp412({ stderr: readFileSync(extra, "utf8") });
      if (hit) m.ytdlpRecord412(domain);
      process.exit(hit ? 0 : 1);
    }
    if (cmd === "resolve") {
      const out = m.resolveYtdlpOutputPath(arg);
      if (!out) process.exit(1);
      console.log(out);
      process.exit(0);
    }
    process.exit(2);
  ' "$GUARD" "$@"
}

read -r SLEEP_REQ SLEEP_INT GAP <<<"$(guard_call pacing)"
echo "pacing: sleep-requests=${SLEEP_REQ}s sleep-interval=${SLEEP_INT}s item-gap=${GAP}s"

mkdir -p "$VM/videos"
n=0
while IFS=, read -r vid dur url domain sub _rest; do
  [ "$vid" = "videoID" ] && continue
  [ -z "$vid" ] && continue
  # Any container counts as present: yt-dlp lands `$vid.mp4` or `$vid.mp4.webm`.
  if compgen -G "$VM/videos/$vid.*" > /dev/null; then
    echo "$vid have"
    continue
  fi
  if guard_call gate "$url"; then
    echo "$vid skipped-412"
    continue
  fi

  TMP="$VM/videos/$vid.mp4"
  ERR="$VM/videos/.$vid.stderr"
  # Lower-case http_proxy as well: the ffmpeg child yt-dlp spawns for a
  # segmented fetch reads only the lowercase spelling.
  http_proxy="$PROXY" https_proxy="$PROXY" HTTPS_PROXY="$PROXY" "$YTDLP" -q --no-warnings \
    --sleep-requests "$SLEEP_REQ" --sleep-interval "$SLEEP_INT" --retries 3 \
    -f "bestvideo[height<=360]+bestaudio/best[height<=360]/best" \
    --merge-output-format mp4 --max-filesize 100M \
    -o "$TMP" "$url" 2>"$ERR"
  rc=$?

  if [ "$rc" -ne 0 ]; then
    if guard_call 412 "$url" "$ERR"; then
      echo "$vid rc=$rc 412-recorded"
    else
      echo "$vid rc=$rc"
    fi
  elif PRODUCED=$(guard_call resolve "$TMP"); then
    # Normalize the name: a fixed `.mp4` template makes yt-dlp append the real
    # container (`$vid.mp4.webm`). Rename to `$vid.<container>` so the resumable
    # "have" check and any downstream consumer see one extension only.
    if [ "$PRODUCED" != "$TMP" ]; then
      mv -f "$PRODUCED" "$VM/videos/$vid.${PRODUCED##*.}"
    fi
    guard_call success "$url"
    echo "$vid ok"
  else
    echo "$vid rc=0 NO-FILE"
  fi

  rm -f "$ERR"
  n=$((n + 1))
  sleep "$GAP"
done < "$SUBSET"
echo "ATTEMPTED=$n ALL_DONE"
