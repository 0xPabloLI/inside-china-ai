#!/usr/bin/env bash
# sync-colima-tunnel.sh — mirror the tunnel launcher and its resolver into ~/bin
#
# The LaunchAgent (com.inside-china-ai.colima-proxy-tunnel) runs
# ~/bin/colima-proxy-tunnel.sh, and that file MUST be a real file: launchd has
# no macOS privacy (TCC) grant for ~/Documents, so a symlink pointing back into
# the repo fails every cycle with
#   /bin/bash: /Users/<user>/bin/colima-proxy-tunnel.sh: Operation not permitted
# (measured 2026-09-25).
#
# The launcher also runs `proxy-port.mjs --print-port` to resolve the host port
# (#1064). That is the same resolver git and the yt-dlp guard import, and it has
# to be copied for the same TCC reason — a path back into ~/Documents is exactly
# what launchd cannot read.
#
# So the tracked files stay the single source of truth and this is the only
# writer of the runnable copies. Run it after editing either file.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${COLIMA_TUNNEL_BIN_DIR:-$HOME/bin}"
LAUNCHER_DST="${COLIMA_TUNNEL_DST:-$BIN_DIR/colima-proxy-tunnel.sh}"

sync_one() {
  local src="$1" dst="$2"
  [ -f "$src" ] || { echo "error: missing $src" >&2; exit 1; }
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    echo "✅ already in sync: $dst"
  else
    cp "$src" "$dst"
    echo "✅ synced: $src → $dst"
  fi
}

mkdir -p "$(dirname "$LAUNCHER_DST")"
sync_one "$SRC_DIR/colima-proxy-tunnel.sh" "$LAUNCHER_DST"
# The launcher looks for this next to itself first, then in ./lib (in-repo run).
sync_one "$SRC_DIR/lib/proxy-port.mjs" "$(dirname "$LAUNCHER_DST")/proxy-port.mjs"

echo "   verify: bash \"$LAUNCHER_DST\" status"
