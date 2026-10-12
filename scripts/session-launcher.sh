#!/bin/bash
# =============================================================================
# scripts/session-launcher.sh — one command per parallel writing session
#
#   npm run session:start <task-slug> [worktree-path]
#   npm run session:stop  <worktree-path>
#   npm run session:gc    [--dry-run]
#
# start does what the docs asked for manually (git-workflow §9.3):
#   1. generates a Session-Id  <yyyymmdd>-<task>-<6hex>  (collision-checked
#      against the registry as a whole token)
#   2. ensures hooks are installed (runs install-git-hooks.sh if hooksPath unset)
#   3. creates a dedicated worktree on branch session/<id>, BASED ON
#      origin/main (fetched first; SESSION_BASE / SESSION_NO_FETCH override) —
#      NOT on local HEAD, which is routinely behind
#      (default path: <repo>-wt/<id> NEXT TO the repo, sibling of the checkout)
#   4. writes the per-worktree state file
#      $(git -C <wt> rev-parse --absolute-git-dir)/session-pilot/current-session
#      line 1 = id — this is what prepare-commit-msg (trailer auto-fill) and
#      the reference-transaction gate (block mode) key on
#   5. appends the registration entry to the shared registry
#
# stop clears the state file (ending auto-fill + block mode) and removes the
# worktree when it is clean; a dirty worktree is reported, not destroyed.
#
# gc is the post-delivery closeout (run after a PR merges):
#   1. refreshes origin/main (fetch --prune; offline is non-fatal)
#   2. fast-forwards the main checkout when it is clean, on main, and strictly
#      behind — ff-only, never rebases, never switches, never touches a dirty
#      checkout
#   3. deletes branches in the session namespace whose content already landed
#      on origin/main (per-file byte identity, so squash merges qualify even
#      though `git branch -d` refuses them); branches checked out in any
#      worktree are never touched
#   4. sweeps remote twins, including orphans whose local branch is already
#      gone (stop deletes the local one first); every remote deletion is gated
#      on its own content verification and a fail-closed open-PR check
# =============================================================================
set -euo pipefail

cmd="${1:-}"
[ -n "$cmd" ] && shift
case "$cmd" in
  start|stop|gc) ;;
  *) echo "usage: session-launcher.sh start <task-slug> [worktree-path] | stop <worktree-path> | gc [--dry-run]" >&2; exit 1 ;;
esac

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "error: not inside a git repository" >&2; exit 1; }
COMMON=$(git rev-parse --git-common-dir)
case "$COMMON" in /*) ;; *) COMMON="$ROOT/$COMMON" ;; esac
REGISTRY_DIR="$COMMON/session-pilot"
REGISTRY="$REGISTRY_DIR/pilot-log.md"

rand_hex() { openssl rand -hex 3 2>/dev/null || od -An -N3 -tx1 /dev/urandom | tr -d ' \n'; }

# ref_content_merged <ref> <base-ref> — true when every file <ref> changed
# (vs their merge-base) is byte-identical on <base-ref>. Content, not
# ancestry: `git branch -d` only recognises ancestry merges, so a squash-
# merged branch would linger forever even though main already carries every
# byte it produced. Used by `stop` and `gc`; any failed verification keeps
# the branch, so this is the fail-closed gate for every `-D` in this script.
ref_content_merged() {
  local ref="$1" base="$2" mb f
  git rev-parse --verify --quiet "$ref" >/dev/null 2>&1 || return 1
  git rev-parse --verify --quiet "$base" >/dev/null 2>&1 || return 1
  mb=$(git merge-base "$ref" "$base" 2>/dev/null) || return 1
  git diff --name-only -z "$mb" "$ref" >/dev/null 2>&1 || return 1
  # -z keeps paths raw (NUL-delimited, never c-quoted). Plain --name-only
  # c-quotes non-ASCII names under core.quotePath, and the quoted literal fed
  # back as a pathspec matches nothing — a diff over an empty pathspec exits 0,
  # so such files would pass unverified: a fail-open on this gate that deletes
  # branches (and their remote twins). The loop's process substitution cannot
  # surface git's exit status, hence the guard above.
  while IFS= read -r -d '' f; do
    # Deleted by the branch: merged when the deletion landed on base too
    # (the path is absent there as well); still present on base means the
    # deletion never landed.
    if ! git cat-file -e "$ref:$f" 2>/dev/null; then
      git cat-file -e "$base:$f" 2>/dev/null && return 1
      continue
    fi
    git diff --quiet "$ref" "$base" -- ":(literal)$f" || return 1
  done < <(git diff --name-only -z "$mb" "$ref" 2>/dev/null)
  return 0
}

# delete_if_content_merged <branch> — the only `-D` in this script, gated on
# ref_content_merged. 0 = deleted; 1 = kept (content not verified on
# origin/main); 2 = kept (delete failed).
delete_if_content_merged() {
  local b="$1"
  ref_content_merged "refs/heads/$b" refs/remotes/origin/main || return 1
  git branch -D "$b" >/dev/null 2>&1 || return 2
  return 0
}

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

  # --- 3a. base ref -----------------------------------------------------------
  # A session must start from the newest INTEGRATED state, not from whatever the
  # main checkout happens to sit on. Local `main` is routinely behind
  # origin/main (other sessions push from their own worktrees), and a bare
  # `git worktree add` silently hands out that stale tree — you only notice when
  # your first commit conflicts, or when a file "doesn't exist" that was
  # actually deleted upstream.
  #
  # SESSION_BASE overrides the ref; SESSION_NO_FETCH=1 skips the fetch (a fetch
  # failure is non-fatal anyway — offline just means origin/main is a moment old).
  if [ -n "${SESSION_BASE:-}" ]; then
    base="$SESSION_BASE"
  else
    if [ -z "${SESSION_NO_FETCH:-}" ]; then
      GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=15 \
        git fetch --quiet origin main 2>/dev/null || true
    fi
    if git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null; then
      base="origin/main"
    else
      base="HEAD"
    fi
  fi
  base_sha=$(git rev-parse "$base^{commit}")

  # --- 3b. worktree -----------------------------------------------------------
  git worktree add -b "session/$id" "$wtpath" "$base_sha" >/dev/null

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
- **baseline**: $base_sha ($base)
- **任务**: $task
- **commit_sha_list**: (live)
- **compact**: 未发生
- **观察**: worktree $wtpath
EOF

  echo ""
  echo "✅ session started"
  echo "   id:        $id"
  echo "   base:      $base_sha ($base)"
  if [ "$base" != "HEAD" ] && git rev-parse --verify --quiet refs/heads/main >/dev/null \
     && [ "$(git rev-parse main)" != "$base_sha" ]; then
    echo "   note:      local main is at $(git rev-parse --short main) — worktree based on $base instead, not on local main"
  fi
  echo "   worktree:  $wtpath  (branch session/$id)"
  echo "   next:      cd $wtpath && work as usual"
  echo "   commits:   git commit -m ... — the trailer is filled automatically"
  echo "   finish:    npm run session:stop $wtpath"
  exit 0
fi

# --- stop ---------------------------------------------------------------------
if [ "$cmd" = "stop" ]; then
  wtpath="${1:-}"
  [ -n "$wtpath" ] || { echo "usage: session-launcher.sh stop <worktree-path>" >&2; exit 1; }
  WT_GITDIR=$(git -C "$wtpath" rev-parse --absolute-git-dir 2>/dev/null || true)
  session_id=""
  if [ -n "$WT_GITDIR" ] && [ -f "$WT_GITDIR/session-pilot/current-session" ]; then
    session_id=$(head -n 1 "$WT_GITDIR/session-pilot/current-session" | tr -d '[:space:]')
    rm -f "$WT_GITDIR/session-pilot/current-session"
    echo "[session] state cleared (auto-fill off; ref-gate block mode now keys on worktree count)"
  fi
  if git worktree remove "$wtpath" >/dev/null 2>&1; then
    echo "[session] worktree removed: $wtpath"
    # #195: a removed worktree means the session ended — delete the session
    # branch when its work is fully on origin/main. `git branch -d` covers
    # ancestry merges; the content check extends the same intent to squash
    # merges, and `-D` is only reached behind ref_content_merged. Work that
    # never landed is auto-exempted and kept. Deletion failure never blocks
    # the stop flow.
    if [ -n "$session_id" ]; then
      if git branch -d "session/$session_id" >/dev/null 2>&1; then
        echo "[session] merged session branch deleted: session/$session_id"
      else
        rc=0
        delete_if_content_merged "session/$session_id" || rc=$?
        if [ "$rc" = 0 ]; then
          echo "[session] squash-merged session branch deleted (content verified on origin/main): session/$session_id"
        elif [ "$rc" = 2 ]; then
          echo "[session] session branch kept (delete failed): session/$session_id"
        else
          echo "[session] session branch kept (unmerged and content differs from origin/main): session/$session_id"
        fi
      fi
    fi
  else
    echo "[session] worktree kept (dirty or locked). When done cleaning up: git worktree remove --force \"$wtpath\" (destructive — check first)"
    # Dirty means the work never landed — the branch is the only entry point
    # to it, so it must survive (#195).
    if [ -n "$session_id" ]; then
      echo "[session] session branch kept (worktree dirty): session/$session_id"
    fi
  fi

  echo "[session] closeout after the PR merges: npm run session:gc (sync main + clean merged branches)"
fi

# --- gc -----------------------------------------------------------------------
# Post-delivery closeout — safe to run any time, from any worktree. Never
# rebases, never switches branches, never touches a dirty checkout.
if [ "$cmd" = "gc" ]; then
  dry_run=""
  if [ "${1:-}" = "--dry-run" ]; then
    dry_run=1
    shift
  fi

  echo "🧹 session gc — post-delivery closeout"
  [ -n "$dry_run" ] && echo "   dry-run: nothing will be changed"

  # Stale worktree records (directory deleted by hand) would otherwise keep
  # their branches looking "checked out" forever. --dry-run only reports.
  stale=$(git worktree prune --dry-run -v 2>&1 || true)
  if [ -n "$stale" ]; then
    if [ -n "$dry_run" ]; then
      echo "[gc] would prune stale worktree record(s)"
    else
      git worktree prune
      echo "[gc] pruned stale worktree record(s)"
    fi
  fi

  # 1. Refresh remote state. The prune covers origin's whole namespace, not
  #    just main: stale tracking refs of already-deleted remote branches would
  #    otherwise linger and keep the remote-twin sweep re-examining them.
  #    --dry-run never writes refs: `fetch --dry-run` is a network probe only,
  #    so verification runs against the current refs and says so. Offline is
  #    likewise non-fatal.
  if [ -n "$dry_run" ]; then
    git fetch --prune --dry-run --quiet origin >/dev/null 2>&1 || true
    echo "[gc] dry-run: verifying against the current origin/main ref ($(git rev-parse --short refs/remotes/origin/main 2>/dev/null || echo none))"
  elif git fetch --prune --quiet origin 2>/dev/null; then
    echo "[gc] origin/main refreshed: $(git rev-parse --short refs/remotes/origin/main)"
  elif git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null 2>&1; then
    echo "[gc] fetch failed (offline?) — verifying against the existing origin/main ref"
  else
    echo "[gc] fetch failed and no origin/main ref — sync and verification disabled"
  fi

  # 2. Sync the main checkout — only when it is clean, on main, and strictly
  #    behind. Divergent or dirty checkouts are reported, never moved. The
  #    primary worktree is the one whose git dir IS the common dir (linked
  #    worktrees live under its worktrees/ subtree) — identity, not ordering.
  main_wt=""
  while IFS= read -r wt; do
    [ -n "$wt" ] || continue
    gd=$(git -C "$wt" rev-parse --absolute-git-dir 2>/dev/null || true)
    if [ "$gd" = "$COMMON" ]; then
      main_wt="$wt"
      break
    fi
  done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
  if [ -z "$main_wt" ] || [ ! -d "$main_wt" ]; then
    echo "[gc] main worktree not found — sync skipped"
  else
    main_branch=$(git -C "$main_wt" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
    head_sha=$(git -C "$main_wt" rev-parse HEAD 2>/dev/null || true)
    origin_sha=$(git rev-parse --verify --quiet refs/remotes/origin/main 2>/dev/null || true)
    if [ "$main_branch" != "main" ]; then
      echo "[gc] main checkout is on '${main_branch:-detached HEAD}' — sync skipped (never switch a checkout)"
    elif [ -n "$(git -C "$main_wt" status --porcelain --untracked-files=no)" ]; then
      echo "[gc] main checkout has tracked changes — sync skipped"
    elif [ -z "$origin_sha" ]; then
      echo "[gc] no origin/main ref — sync skipped"
    elif [ "$head_sha" = "$origin_sha" ]; then
      if [ -n "$dry_run" ]; then
        echo "[gc] main matches the current origin/main ref ($(git rev-parse --short "$head_sha")); dry-run does not fetch — remote tip may be newer"
      else
        echo "[gc] main is up to date ($(git rev-parse --short "$head_sha"))"
      fi
    elif git merge-base --is-ancestor "$head_sha" "$origin_sha"; then
      if [ -n "$dry_run" ]; then
        echo "[gc] would fast-forward main $(git rev-parse --short "$head_sha") → $(git rev-parse --short "$origin_sha")"
      elif git -C "$main_wt" merge --ff-only --quiet refs/remotes/origin/main >/dev/null 2>&1; then
        echo "[gc] main fast-forwarded to $(git -C "$main_wt" rev-parse --short HEAD)"
      else
        echo "[gc] main fast-forward refused (untracked collision?) — left untouched"
      fi
    else
      echo "[gc] main has local commits not on origin/main — left untouched (resolve manually)"
    fi
  fi

  # 3. Clean merged branches in the session namespace. The deletion criterion
  #    is per-file byte identity against origin/main (ref_content_merged); any
  #    failed verification keeps the branch. Checked-out branches are never
  #    touched. SESSION_GC_BRANCH_GLOBS overrides the namespace globs;
  #    GH_CMD overrides the gh binary (tests).
  globs="${SESSION_GC_BRANCH_GLOBS:-session/* docs/* fix/* feat/* chore/* test/* refactor/*}"
  GH="${GH_CMD:-gh}"
  deleted=0
  remote_deleted=0
  would_delete=0
  remote_would=0
  kept=0
  remote_kept=0
  handled=""

  # in_gc_namespace <branch> — the branch families gc owns. Bot and
  # integration branches (renovate/*, release-please--*, lovable-sync, …)
  # stay outside on purpose: their tools manage their lifecycle.
  in_gc_namespace() {
    local name="$1" g
    for g in $globs; do
      case "$name" in $g) return 0 ;; esac
    done
    return 1
  }

  # remote_twin_closeout <branch> <dry> — deletes origin/<branch> only when it
  # still exists, its own content independently verifies as merged, gh can
  # check for open PRs, and none is open. dry=1 previews without writing any
  # ref: a fetch is never performed, so a tracking ref that still matches the
  # remote tip is verified in place, and a stale one is reported as pending
  # fetch+verify. Every unknown keeps it (fail-closed).
  remote_twin_closeout() {
    local b="$1" dry="$2" open_prs tip tracked rc
    rc=0
    git ls-remote --exit-code --heads origin "refs/heads/$b" >/dev/null 2>&1 || rc=$?
    case "$rc" in
      0) ;;
      2) return 0 ;; # no such remote branch
      *)
        echo "[gc] kept remote origin/$b (origin unreachable — cannot verify)"
        remote_kept=$((remote_kept + 1))
        return 0
        ;;
    esac
    if ! command -v "$GH" >/dev/null 2>&1; then
      echo "[gc] kept remote origin/$b (gh unavailable — cannot check open PRs)"
      remote_kept=$((remote_kept + 1))
      return 0
    fi
    open_prs=$("$GH" pr list --head "$b" --state open --json number --jq 'length' </dev/null 2>/dev/null) || open_prs=""
    if [ -z "$open_prs" ]; then
      echo "[gc] kept remote origin/$b (open-PR check failed — fail-closed)"
      remote_kept=$((remote_kept + 1))
      return 0
    fi
    if [ "$open_prs" != "0" ]; then
      echo "[gc] kept remote origin/$b (open PR — deleting would close it)"
      remote_kept=$((remote_kept + 1))
      return 0
    fi
    if [ "$dry" = "1" ]; then
      tip=$(git ls-remote --heads origin "refs/heads/$b" 2>/dev/null | awk 'NR==1{print $1}' || true)
      tracked=$(git rev-parse --verify --quiet "refs/remotes/origin/$b" || true)
      if [ -n "$tip" ] && [ "$tip" = "$tracked" ]; then
        if ref_content_merged "refs/remotes/origin/$b" refs/remotes/origin/main; then
          echo "[gc] would delete remote origin/$b (content merged)"
          remote_would=$((remote_would + 1))
        else
          echo "[gc] kept remote origin/$b (content not verified merged)"
          remote_kept=$((remote_kept + 1))
        fi
      else
        echo "[gc] would fetch and verify remote origin/$b before deleting (dry-run does not fetch)"
        remote_would=$((remote_would + 1))
      fi
      return 0
    fi
    if git fetch --quiet --force origin "refs/heads/$b:refs/remotes/origin/$b" </dev/null 2>/dev/null \
      && ref_content_merged "refs/remotes/origin/$b" refs/remotes/origin/main; then
      if git push --quiet origin --delete "$b" </dev/null >/dev/null 2>&1; then
        echo "[gc] deleted remote origin/$b"
        remote_deleted=$((remote_deleted + 1))
      else
        echo "[gc] remote origin/$b delete failed — skipped"
        remote_kept=$((remote_kept + 1))
      fi
    else
      echo "[gc] kept remote origin/$b (content not verified merged)"
      remote_kept=$((remote_kept + 1))
    fi
  }

  while IFS=$'\t' read -r b wtpath; do
    [ -n "$b" ] || continue
    [ "$b" = "main" ] && continue
    in_gc_namespace "$b" || continue
    if [ -n "$wtpath" ]; then
      echo "[gc] kept $b (checked out in $wtpath)"
      kept=$((kept + 1))
      continue
    fi
    if [ -n "$dry_run" ]; then
      if ref_content_merged "refs/heads/$b" refs/remotes/origin/main; then
        echo "[gc] would delete $b (content merged)"
        would_delete=$((would_delete + 1))
        remote_twin_closeout "$b" 1
      else
        echo "[gc] kept $b (content not verified on origin/main)"
        kept=$((kept + 1))
      fi
      continue
    fi
    # One verification per branch: delete_if_content_merged re-checks the
    # content itself (rc 1 = not verified, rc 2 = delete failed).
    rc=0
    delete_if_content_merged "$b" || rc=$?
    case "$rc" in
      0)
        echo "[gc] deleted $b (content merged)"
        deleted=$((deleted + 1))
        ;;
      1)
        echo "[gc] kept $b (content not verified on origin/main)"
        kept=$((kept + 1))
        continue
        ;;
      *)
        echo "[gc] kept $b (delete failed)"
        kept=$((kept + 1))
        continue
        ;;
    esac
    remote_twin_closeout "$b" 0
    handled="$handled $b"
  done < <(git for-each-ref --format='%(refname:short)%09%(worktreepath)' refs/heads)

  # Orphaned remote twins: the loop above walks local branches, so a merged
  # branch whose local copy is already gone (stop ran first, or an earlier gc
  # deleted it) would keep its origin branch forever. Branches the loop just
  # settled are skipped, and a surviving local branch always wins: whatever
  # the loop decided for it already settled its remote.
  while IFS= read -r rb; do
    b=${rb#refs/remotes/origin/}
    [ "$b" = "HEAD" ] && continue
    [ "$b" = "main" ] && continue
    case " $handled " in *" $b "*) continue ;; esac
    in_gc_namespace "$b" || continue
    if git show-ref --verify --quiet "refs/heads/$b"; then
      continue
    fi
    remote_twin_closeout "$b" "${dry_run:-0}"
  done < <(git for-each-ref --format='%(refname)' refs/remotes/origin)

  echo "[gc] done — deleted $deleted (remote $remote_deleted), would delete $would_delete (remote $remote_would), kept $kept (remote $remote_kept)"
fi
