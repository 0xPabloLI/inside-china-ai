#!/usr/bin/env bash
# colima-proxy-tunnel.sh — SSH reverse tunnel: VM 127.0.0.1:7891 → host <proxy port>
#
# Purpose: give the colima VM an HTTP proxy endpoint at a *stable VM-local*
# address (127.0.0.1:7891) that does not move when you switch proxy clients.
#
# When it is NOT needed: if the host client runs in TUN mode the VM is already
# covered transparently — measured 2026-09-25: the VM resolves google.com to
# the host TUN fake-ip range (198.18.x.x) and reaches the internet directly.
# `start` detects that and exits without touching anything, so the supervisor
# costs nothing and cannot fight itself.
#
# Why `start` probes instead of trusting the pidfile: the pidfile only records
# *our* ssh process. A reverse forward registered on the persisted lima control
# master outlives the client that created it, so "pid is dead" does NOT mean
# "port is free". Trusting the pidfile made the LaunchAgent retry forever and
# log nothing but connection-refused noise while the tunnel quietly worked.
#
# Usage:
#   ./colima-proxy-tunnel.sh start|stop|status|restart
#
# Auto-start: LaunchAgent com.inside-china-ai.colima-proxy-tunnel (every 60s).
# It runs ~/bin/colima-proxy-tunnel.sh — a COPY of this file, because launchd
# has no macOS privacy (TCC) grant for ~/Documents and a symlink pointing back
# here fails with "Operation not permitted" on every cycle. Re-sync with:
#   npm run env:sync-tunnel
#
# That sync also copies `scripts/lib/proxy-port.mjs` next to the launcher: this
# script resolves the host port by running it (`--print-port`), and reading it
# back out of ~/Documents is exactly what launchd is not allowed to do.
#
# Contract: exit 0 = "nothing to do / healthy" (a legitimately absent tunnel is
# not an error); exit 1 = "needs a human".

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

set -euo pipefail

TUNNEL_PORT=7891
PROXY_HOST=127.0.0.1
PIDFILE="/tmp/colima-proxy-tunnel.pid"
SSHD_CONFIG="/tmp/colima_ssh_config"
VM_CURL="env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY curl"
# The resolver the git wrapper and the yt-dlp guard share (#1064), run as a CLI:
# candidate ports from `scutil` + `netstat`, then a per-port `generate_204`
# probe. Own copy of the candidate table is gone on purpose — `nc -z` answered
# "something is listening", which a client in Direct mode does while proxying
# nothing, and the previous `HTTPPort` read trusted a flag observed lying.
RESOLVER_NAME="proxy-port.mjs"

# --- resolve which host port to forward to ------------------------------------
# Order: explicit env → the shared resolver. `HTTP_PROXY_PORT` survives because
# this runs on a 60s timer and an operator who pinned a port should not wait for
# a probe loop to agree with them.
resolve_proxy_port() {
  if [ -n "${HTTP_PROXY_PORT:-}" ]; then printf '%s' "$HTTP_PROXY_PORT"; return 0; fi
  local dir resolver node_bin port
  dir=$(cd "$(dirname "$0")" && pwd)
  resolver="$dir/$RESOLVER_NAME"
  [ -f "$resolver" ] || resolver="$dir/lib/$RESOLVER_NAME"
  if [ ! -f "$resolver" ]; then
    echo "❌ cannot find $RESOLVER_NAME next to $0 or in $dir/lib — run: npm run env:sync-tunnel" >&2
    return 1
  fi
  node_bin="${NODE_BIN:-}"
  [ -n "$node_bin" ] || node_bin=$(command -v node || true)
  if [ -z "$node_bin" ]; then
    echo "❌ no node on PATH — cannot run $RESOLVER_NAME" >&2
    return 1
  fi
  port=$("$node_bin" "$resolver" --print-port) || return 1
  # The value becomes an ssh `-R` target; a non-numeric answer there is a
  # malformed forward, so it is rejected at the source rather than passed on.
  case "$port" in
    '' | *[!0-9]*)
      echo "❌ $RESOLVER_NAME returned a non-numeric port: '$port'" >&2
      return 1
      ;;
  esac
  printf '%s' "$port"
}

vm_run() { colima ssh -- bash -c "$1" 2>/dev/null; }

# Does the VM already reach the internet on its own (host TUN transparently
# covering the VM's NAT traffic)?
vm_direct_ok() {
  local code
  code=$(vm_run "$VM_CURL -s -o /dev/null -w '%{http_code}' --connect-timeout 6 https://www.google.com/generate_204" || true)
  [ "$code" = "204" ]
}

# Docker Hub answers 401 on /v2/ without credentials — i.e. the proxy works.
tunnel_ok() {
  local code
  code=$(vm_run "$VM_CURL -s -o /dev/null -w '%{http_code}' -x http://${PROXY_HOST}:${TUNNEL_PORT} --connect-timeout 5 https://registry-1.docker.io/v2/" || true)
  [ "$code" = "401" ]
}

managed_pid() {
  [ -f "$PIDFILE" ] || return 1
  local pid
  pid=$(cat "$PIDFILE" 2>/dev/null || true)
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  printf '%s' "$pid"
}

start() {
  local pid
  if pid=$(managed_pid); then
    echo "✅ tunnel running under supervision (PID $pid)"
    return 0
  fi
  if [ -f "$PIDFILE" ]; then
    echo "… stale pidfile (PID $(cat "$PIDFILE" 2>/dev/null) is gone) — probing the port instead of trusting it"
    rm -f "$PIDFILE"
  fi

  # The port can outlive our pid (orphan forward on the lima master). If it
  # already works, adopt it: starting another ssh would only fail to bind.
  if tunnel_ok; then
    echo "✅ VM:${PROXY_HOST}:${TUNNEL_PORT} already forwards correctly (unmanaged — held by the lima ssh master)"
    return 0
  fi

  if vm_direct_ok; then
    echo "✅ not needed — colima VM has direct egress (host proxy is in TUN mode; VM resolves via host fake-ip)"
    return 0
  fi

  local port
  if ! port=$(resolve_proxy_port); then
    echo "❌ no host port resolves (tried: ${HTTP_PROXY_PORT:-none}, then scutil + netstat candidates with a per-port 204 probe)"
    echo "   Start FlClash / Clash Verge, or set HTTP_PROXY_PORT=<port>."
    return 1
  fi

  colima ssh-config > "$SSHD_CONFIG" 2>/dev/null

  # ControlPath=none: the tunnel must own its connection. Sharing the persisted
  # lima master is what created the orphan forward in the first place.
  # ExitOnForwardFailure: fail loudly if VM:${TUNNEL_PORT} is already bound,
  # instead of running a tunnel that forwards nothing.
  ssh -F "$SSHD_CONFIG" \
    -R "${TUNNEL_PORT}:${PROXY_HOST}:${port}" \
    -N \
    -o ControlPath=none \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    colima &
  local ssh_pid=$!
  printf '%s\n' "$ssh_pid" > "$PIDFILE"
  sleep 2

  if ! kill -0 "$ssh_pid" 2>/dev/null; then
    echo "❌ tunnel process exited immediately (VM port ${TUNNEL_PORT} already bound?)"
    rm -f "$PIDFILE"
    return 1
  fi
  if tunnel_ok; then
    echo "✅ tunnel active (PID $ssh_pid): VM:${PROXY_HOST}:${TUNNEL_PORT} → host:${PROXY_HOST}:${port}"
  else
    echo "⚠️  tunnel up (PID $ssh_pid) but the VM test failed — check that host:${port} really proxies"
    return 1
  fi
}

stop() {
  if [ -f "$PIDFILE" ]; then
    local pid
    pid=$(cat "$PIDFILE" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "tunnel stopped (PID $pid)"
    else
      echo "no live tunnel process (stale PID $pid)"
    fi
    rm -f "$PIDFILE"
  else
    echo "no tunnel running (no pidfile)"
  fi
  # An unmanaged forward cannot be killed from here; report rather than lie.
  if tunnel_ok; then
    echo "⚠️  VM:${PROXY_HOST}:${TUNNEL_PORT} still forwards — an orphan forward owned by the lima ssh master."
    echo "   Harmless (it dies with that master / on 'colima restart'). The supervisor rebuilds a real one when this stops working."
  fi
}

status() {
  local pid port
  if pid=$(managed_pid); then
    echo "managed:   ✅ PID $pid"
  else
    echo "managed:   ❌ none (pidfile: $(cat "$PIDFILE" 2>/dev/null || echo absent))"
  fi
  if tunnel_ok; then
    echo "forward:   ✅ VM:${PROXY_HOST}:${TUNNEL_PORT} → Docker Hub 401"
  else
    echo "forward:   ❌ VM:${PROXY_HOST}:${TUNNEL_PORT} not usable"
  fi
  if port=$(resolve_proxy_port); then
    echo "host port: $port"
  else
    echo "host port: ❌ none resolves (shared resolver: scutil + netstat candidates, 204 probe)"
  fi
  if vm_direct_ok; then
    echo "vm egress: ✅ direct (host TUN) — tunnel not required"
  else
    echo "vm egress: ❌ proxy-only — tunnel required"
  fi
}

case "${1:-status}" in
  start)   start ;;
  stop)    stop ;;
  status)  status ;;
  restart) stop; start ;;
  *) echo "Usage: $0 {start|stop|status|restart}"; exit 1 ;;
esac
