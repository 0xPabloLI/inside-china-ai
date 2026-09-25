#!/usr/bin/env bash
# sync-colima-tunnel.sh — mirror scripts/colima-proxy-tunnel.sh into ~/bin
#
# The LaunchAgent (com.inside-china-ai.colima-proxy-tunnel) runs
# ~/bin/colima-proxy-tunnel.sh, and that file MUST be a real file: launchd has
# no macOS privacy (TCC) grant for ~/Documents, so a symlink pointing back into
# the repo fails every cycle with
#   /bin/bash: /Users/<user>/bin/colima-proxy-tunnel.sh: Operation not permitted
# (measured 2026-09-25).
#
# So the tracked script stays the single source of truth and this is the only
# writer of the runnable copy. Run it after editing scripts/colima-proxy-tunnel.sh.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/colima-proxy-tunnel.sh"
DST="${COLIMA_TUNNEL_DST:-$HOME/bin/colima-proxy-tunnel.sh}"

[ -f "$SRC" ] || { echo "error: missing $SRC" >&2; exit 1; }
mkdir -p "$(dirname "$DST")"

if [ -f "$DST" ] && cmp -s "$SRC" "$DST"; then
  echo "✅ already in sync: $DST"
else
  cp "$SRC" "$DST"
  echo "✅ synced: $SRC → $DST"
fi

echo "   verify: bash \"$DST\" status"
