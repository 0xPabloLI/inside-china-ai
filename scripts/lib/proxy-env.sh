#!/bin/bash
# =============================================================================
# scripts/lib/proxy-env.sh — source me; do not execute me.
#
# Points git — and the tools it spawns — at the local port that is *currently*
# proxying. Source it near the top of a script that makes network git calls.
#
# Why not `.git/config`: that file is shared by every worktree, so writing it
# re-points another session's checkout. Git treats GIT_CONFIG_KEY_n /
# GIT_CONFIG_VALUE_n as if they were `-c` on the command line, which reaches
# every git call in this process tree without touching a shared file.
#
# Fail-open on purpose: if node is missing, the resolver is missing, or no port
# answers, nothing is exported and the caller keeps whatever `.git/config` says.
# A closeout that refuses to run because a proxy client happens to be off would
# be worse than the stale-port failure this prevents — and the resolver's own
# strictness (`git-with-proxy.mjs` refuses to run git it cannot route) belongs to
# the caller that opted into it, not to every script that sources this file.
#
# Resolution is reused, not reimplemented: the port comes from
# `git-with-proxy.mjs --print-port`, so this file and the wrapper cannot drift.
# =============================================================================

if [ -z "${GIT_CONFIG_COUNT:-}" ] && command -v node >/dev/null 2>&1; then
  _proxy_env_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  _proxy_env_url=""
  if [ -f "$_proxy_env_root/scripts/git-with-proxy.mjs" ]; then
    _proxy_env_url="$(node "$_proxy_env_root/scripts/git-with-proxy.mjs" --print-port 2>/dev/null || true)"
  fi
  if [ -n "$_proxy_env_url" ]; then
    export GIT_CONFIG_COUNT=2
    export GIT_CONFIG_KEY_0=http.proxy
    export GIT_CONFIG_VALUE_0="$_proxy_env_url"
    export GIT_CONFIG_KEY_1=https.proxy
    export GIT_CONFIG_VALUE_1="$_proxy_env_url"
    export HTTP_PROXY="$_proxy_env_url"
    export HTTPS_PROXY="$_proxy_env_url"
    export http_proxy="$_proxy_env_url"
    export https_proxy="$_proxy_env_url"
  fi
  unset _proxy_env_root _proxy_env_url
fi
