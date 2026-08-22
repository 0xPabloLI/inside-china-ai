#!/usr/bin/env bash
# colima-proxy-tunnel.sh — Persistent SSH reverse tunnel for colima Docker proxy
#
# Purpose: Lets colima VM's Docker daemon access Docker Hub through host's FlClash proxy.
# FlClash only listens on 127.0.0.1:7890 (not LAN), so colima VM can't reach it directly.
# This script creates a reverse SSH tunnel: VM:127.0.0.1:7891 → host:127.0.0.1:7890
#
# Usage:
#   ./colima-proxy-tunnel.sh start   # Start tunnel in background
#   ./colima-proxy-tunnel.sh status  # Check if running
#   ./colima-proxy-tunnel.sh stop     # Kill tunnel
#
# Auto-start: LaunchAgent at ~/Library/LaunchAgents/com.inside-china-ai.colima-proxy-tunnel.plist
# Runs every 60s, checks if tunnel is alive, starts if not.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
#   ./colima-proxy-tunnel.sh stop    # Kill tunnel
#
# Auto-start: Add to ~/.zshrc or use as a LaunchAgent:
#   brew services start colima  # already configured
#   # Then add this script to colima's provisioning or run manually after colima starts

set -euo pipefail

TUNNEL_PORT=7891
PROXY_HOST=127.0.0.1
PROXY_PORT=7890
PIDFILE="/tmp/colima-proxy-tunnel.pid"
SSHD_CONFIG="/tmp/colima_ssh_config"

start() {
  # Check if already running
  if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
    echo "Tunnel already running (PID $(cat $PIDFILE))"
    return 0
  fi

  # Generate SSH config for colima
  colima ssh-config > "$SSHD_CONFIG" 2>/dev/null

  # Start reverse tunnel in background
  ssh -F "$SSHD_CONFIG" \
    -R ${TUNNEL_PORT}:${PROXY_HOST}:${PROXY_PORT} \
    -N \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    colima &
  local ssh_pid=$!
  echo $ssh_pid > "$PIDFILE"
  
  # Wait for tunnel to establish
  sleep 2
  
  # Verify tunnel works
  if colima ssh -- bash -c "curl -x http://127.0.0.1:${TUNNEL_PORT} -s -o /dev/null -w '%{http_code}' --connect-timeout 5 https://registry-1.docker.io/v2/" 2>/dev/null | grep -q "401"; then
    echo "✅ Tunnel active (PID $ssh_pid): VM:127.0.0.1:${TUNNEL_PORT} → host:${PROXY_HOST}:${PROXY_PORT}"
  else
    echo "⚠️  Tunnel started but connectivity test failed. FlClash may not be running."
    echo "   PID: $ssh_pid"
  fi
}

stop() {
  if [ -f "$PIDFILE" ]; then
    local pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo "Tunnel stopped (PID $pid)"
    fi
    rm -f "$PIDFILE"
  else
    echo "No tunnel running"
  fi
}

status() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
    echo "✅ Running (PID $(cat $PIDFILE))"
  else
    echo "❌ Not running"
  fi
}

case "${1:-status}" in
  start)   start ;;
  stop)    stop ;;
  status)  status ;;
  restart) stop; start ;;
  *) echo "Usage: $0 {start|stop|status|restart}"; exit 1 ;;
esac
