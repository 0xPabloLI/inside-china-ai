#!/usr/bin/env bash
# Recreate the local SearXNG container with the #891 resource caps.
#
# The host settings stay in ~/searxng (bind mount); colima, watchtower and the
# other containers are left alone. Deliberately destructive to the container
# only — use when the caps/restart policy need to be re-applied.
set -euo pipefail

if ! colima status >/dev/null 2>&1; then
  echo "colima is not running; start it first (colima start)" >&2
  exit 1
fi

# Docker creates a missing host dir as an empty root-owned directory, so a
# bind-mount without settings boots default config where format=json is
# disabled — the /config probe below would still report 200.
if [ ! -f "$HOME/searxng/settings.yml" ]; then
  echo "missing $HOME/searxng/settings.yml; rescue it first (see scripts/colima-doctor.sh)" >&2
  exit 1
fi

echo "Recreating searxng container (--cpus 0.5 --memory 768m)..."
colima ssh -- sudo docker rm -f searxng >/dev/null 2>&1 || true
colima ssh -- sudo docker run -d --name searxng --restart unless-stopped -p 8888:8080 \
  -v "$HOME/searxng:/etc/searxng" \
  --cpus 0.5 --memory 768m --memory-swap 768m searxng/searxng:latest

for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:8888/config 2>/dev/null || true)
  if [ "$code" = "200" ]; then
    echo "searxng is up (HTTP 200)"
    colima ssh -- sudo docker inspect searxng --format 'NanoCpus={{.HostConfig.NanoCpus}} Memory={{.HostConfig.Memory}} MemorySwap={{.HostConfig.MemorySwap}}'
    exit 0
  fi
  sleep 1
done

echo "searxng did not become ready; check: colima ssh -- sudo docker logs --tail 50 searxng" >&2
exit 1
