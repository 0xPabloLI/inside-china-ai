#!/bin/bash
# =============================================================================
# scripts/session-launcher.sh — one command per parallel writing session
#
#   npm run session:start <task-slug> [worktree-path]
#   npm run session:stop  <worktree-path>
#
# start does what the docs asked for manually (git-workflow §9.3):
#   1. generates a Session-Id  <yyyymmdd>-<task>-<6hex>  (collision-checked
#      against the registry as a whole token)
#   2. ensures hooks are installed (runs install-git-hooks.sh if hooksPath unset)
#   3. creates a dedicated worktree on branch session/<id>
#      (default path: <repo>-wt/<id> NEXT TO the repo, sibling of the checkout)
#   4. writes the per-worktree state file
#      $(git -C <wt> rev-parse --absolute-git-dir)/session-pilot/current-session
#      line 1 = id — this is what prepare-commit-msg (trailer auto-fill) and
#      the reference-transaction gate (block mode) key on
#   5. appends the registration entry to the shared registry
#
# stop clears the state file (ending auto-fill + block mode) and removes the
# worktree when it is clean; a dirty worktree is reported, not destroyed.
# =============================================================================
set -euo pipefail

cmd="${1:-}"
[ -n "$cmd" ] && shift
case "$cmd" in
  start|stop) ;;
  *) echo "usage: session-launcher.sh start <task-slug> [worktree-path] | stop <worktree-path>" >&2; exit 1 ;;
esac

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "error: not inside a git repository" >&2; exit 1; }
COMMON=$(git rev-parse --git-common-dir)
case "$COMMON" in /*) ;; *) COMMON="$ROOT/$COMMON" ;; esac
REGISTRY_DIR="$COMMON/session-pilot"
REGISTRY="$REGISTRY_DIR/pilot-log.md"

rand_hex() { openssl rand -hex 3 2>/dev/null || od -An -N3 -tx1 /dev/urandom | tr -d ' \n'; }

if [ "$cmd" = "start" ]; then
  task="${1:-}"
  wtpath="${2:-}"
  [ -n "$task" ] || { echo "usage: session-launcher.sh start <task-slug> [worktree-path]" >&2; exit 1; }
  task=$(printf '%s' "$task" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//')
  [ -n "$task" ] || { echo "error: task slug normalizes to empty" >&2; exit 1; }

  # --- 2. hooks present? ------------------------------------------------------
  if [ "$(git config core.hooksPath 2>/dev/null || echo '')" != ".githooks" ]; then
    echo "[session] hooksPath unset — running the installer first"
    bash "$ROOT/scripts/install-git-hooks.sh"
  fi
  [ -f "$REGISTRY" ] || { mkdir -p "$REGISTRY_DIR"; printf '# Session Registration Log\n' > "$REGISTRY"; }

  # --- 1. collision-checked id ------------------------------------------------
  id=""
  for _ in 1 2 3 4 5; do
    candidate="$(date +%Y%m%d)-$task-$(rand_hex)"
    if ! grep -qE "(^|[^0-9A-Za-z-])${candidate}(\$|[^0-9A-Za-z-])" "$REGISTRY" 2>/dev/null; then
      id="$candidate"; break
    fi
  done
  [ -n "$id" ] || { echo "error: could not generate a collision-free id" >&2; exit 1; }

  # --- 3. worktree ------------------------------------------------------------
  if [ -z "$wtpath" ]; then
    wtpath="$(dirname "$ROOT")/$(basename "$ROOT")-wt/$id"
  fi
  mkdir -p "$(dirname "$wtpath")"
  git worktree add -b "session/$id" "$wtpath" >/dev/null

  # A RELATIVE core.hooksPath resolves inside each worktree, where .githooks
  # does not exist — hooks would silently never run there (measured: no
  # commit-msg, no ref-gate). Per-worktree config with an ABSOLUTE path fixes
  # this; the main checkout keeps its relative setting.
  git config extensions.worktreeConfig true
  git -C "$wtpath" config --worktree core.hooksPath "$ROOT/.githooks"

  # --- 4. per-worktree state --------------------------------------------------
  WT_GITDIR=$(git -C "$wtpath" rev-parse --absolute-git-dir)
  mkdir -p "$WT_GITDIR/session-pilot"
  printf '%s\nstarted: %s\n' "$id" "$(date '+%F %T')" > "$WT_GITDIR/session-pilot/current-session"

  # --- 5. registration --------------------------------------------------------
  # awk (not `grep -c || echo 0`: grep prints 0 AND exits 1 when the file has
  # no match, and the doubled output breaks the arithmetic under set -e)
  N=$(awk '/^### #/{n++} END{print n+1}' "$REGISTRY")
  cat >> "$REGISTRY" <<EOF

### #$N — $(date +%F)

- **tool**: session-launcher (npm run session:start)
- **Session-Id**: \`$id\`
- **baseline**: $(git rev-parse HEAD)
- **任务**: $task
- **commit_sha_list**: (live)
- **compact**: 未发生
- **观察**: worktree $wtpath
EOF

  echo ""
  echo "✅ session started"
  echo "   id:        $id"
  echo "   worktree:  $wtpath  (branch session/$id)"
  echo "   next:      cd $wtpath && work as usual"
  echo "   commits:   git commit -m ... — the trailer is filled automatically"
  echo "   finish:    npm run session:stop $wtpath"
  exit 0
fi

# --- stop ---------------------------------------------------------------------
wtpath="${1:-}"
[ -n "$wtpath" ] || { echo "usage: session-launcher.sh stop <worktree-path>" >&2; exit 1; }
WT_GITDIR=$(git -C "$wtpath" rev-parse --absolute-git-dir 2>/dev/null || true)
if [ -n "$WT_GITDIR" ] && [ -f "$WT_GITDIR/session-pilot/current-session" ]; then
  rm -f "$WT_GITDIR/session-pilot/current-session"
  echo "[session] state cleared (auto-fill off, ref-gate back to warn mode)"
fi
if git worktree remove "$wtpath" >/dev/null 2>&1; then
  echo "[session] worktree removed: $wtpath"
else
  echo "[session] worktree kept (dirty or locked). When done cleaning up: git worktree remove --force \"$wtpath\" (destructive — check first)"
fi
