#!/usr/bin/env bash
# colima-doctor.sh — Colima VM health check & rebuild (#140 P7)
#
# Purpose: The SearXNG/Docker setup (#92) depends on Colima staying healthy.
# A corrupted VM used to surface only when a discovery run found localhost:8888
# dead. This script makes the failure explicit and the recovery scripted:
#
#   ./colima-doctor.sh            # check only — print report, exit 0/1
#   ./colima-doctor.sh --restart  # middle tier: colima stop + start (keeps VM disk)
#   ./colima-doctor.sh --rebuild  # DESTRUCTIVE: colima delete + fresh start + re-pull
#
# Scheduled checks: LaunchAgent pattern (see colima-proxy-tunnel.sh) running
# the check mode every N minutes. Auto-rebuild is deliberately NOT wired into
# any scheduler — deleting the VM destroys containers; a human runs --rebuild
# after reading the check report.
#
# SearXNG ops reference: docs/tools-catalog.md (SearXNG section) — settings.yml
# needs search.formats: [html,json]; outgoing.proxies must match host proxy port.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
set -uo pipefail

# Profile shape matches the running default (colima list): 2 CPU / 2GiB / 10GiB docker.
COLIMA_PROFILE="default"
COLIMA_ARGS=(--cpu 2 --memory 2 --disk 10 --runtime docker)
SEARXNG_URL="http://localhost:8888/search?q=healthcheck&format=json"

FAILURES=()

check() {
  local name="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "true" ]; then
    echo "  ✅ $name${detail:+ — $detail}"
  else
    echo "  ❌ $name${detail:+ — $detail}"
    FAILURES+=("$name")
  fi
}

check_colima_running() {
  local status
  status=$(colima list 2>/dev/null | awk -v prof="$COLIMA_PROFILE" '$1 == prof {print $2}')
  check "colima profile running" "$([ "${status:-}" = "Running" ] && echo true || echo false)" \
    "profile=$COLIMA_PROFILE status=${status:-absent}"
}

check_docker_daemon() {
  if docker info >/dev/null 2>&1; then
    check "docker daemon responsive" true
  else
    check "docker daemon responsive" false "docker info failed — VM likely corrupted"
  fi
}

check_searxng_container() {
  local status
  status=$(docker ps --filter "name=searxng" --format "{{.Status}}" 2>/dev/null | head -1)
  check "searxng container up" "$([ -n "${status:-}" ] && echo true || echo false)" "${status:-not found}"
}

check_searxng_json_api() {
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$SEARXNG_URL" 2>/dev/null)
  check "searxng JSON API (localhost:8888)" "$([ "$http_code" = "200" ] && echo true || echo false)" \
    "HTTP ${http_code:-timeout}"
}

run_checks() {
  echo "🩺 Colima Doctor — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "──────────────────────────────────────────────"
  check_colima_running
  check_docker_daemon
  check_searxng_container
  check_searxng_json_api
  echo "──────────────────────────────────────────────"
  if [ "${#FAILURES[@]}" -gt 0 ]; then
    echo "❌ UNHEALTHY: ${FAILURES[*]}"
    echo "   Recovery ladder: --restart (keeps VM disk) → --rebuild (destructive, fresh VM)"
    return 1
  fi
  echo "✅ Healthy"
  return 0
}

do_restart() {
  echo "🔄 Restarting colima profile '$COLIMA_PROFILE' (VM disk preserved)..."
  colima stop "$COLIMA_PROFILE" || true
  colima start "$COLIMA_PROFILE" "${COLIMA_ARGS[@]}"
  echo "⏳ Waiting for docker daemon..."
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  run_checks
}

do_rebuild() {
  echo "💥 DESTRUCTIVE: deleting colima VM '$COLIMA_PROFILE' (all containers + volumes lost)..."
  # The live searxng uses anonymous volumes, so colima delete destroys its
  # settings.yml. Rescue it to a host mount first — the rebuilt container
  # mounts the host dir from then on, so future rebuilds preserve config.
  mkdir -p "$HOME/.searxng"
  if docker cp searxng:/etc/searxng/settings.yml "$HOME/.searxng/settings.yml" 2>/dev/null; then
    echo "  📋 settings.yml rescued to ~/.searxng/settings.yml"
  else
    echo "  ⚠️  Could not rescue settings.yml (container dead?) — SearXNG will start with defaults;"
    echo "      re-apply search.formats: [html,json] + outgoing.proxies per docs/tools-catalog.md"
  fi

  colima stop "$COLIMA_PROFILE" 2>/dev/null || true
  colima delete "$COLIMA_PROFILE" --force
  colima start "$COLIMA_PROFILE" "${COLIMA_ARGS[@]}"
  echo "⏳ Waiting for docker daemon..."
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  echo "📦 Re-pulling searxng + watchtower..."
  docker pull searxng/searxng:latest
  docker pull ghcr.io/containrrr/watchtower:latest
  docker rm -f searxng watchtower 2>/dev/null || true
  docker run -d --name searxng -p 8888:8080 \
    -v "$HOME/.searxng:/etc/searxng" searxng/searxng:latest
  docker run -d --name watchtower -v /var/run/docker.sock:/var/run/docker.sock \
    ghcr.io/containrrr/watchtower:latest --interval 86400
  echo "⏳ Waiting for searxng JSON API..."
  for _ in $(seq 1 30); do
    [ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$SEARXNG_URL" 2>/dev/null)" = "200" ] && break
    sleep 2
  done
  run_checks
}

case "${1:-check}" in
  check) run_checks ;;
  --restart) do_restart ;;
  --rebuild) do_rebuild ;;
  *)
    echo "Usage: $0 [check|--restart|--rebuild]"
    exit 2
    ;;
esac
