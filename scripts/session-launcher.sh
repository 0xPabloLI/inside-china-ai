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
#   3. deletes branches in the session namespace whose work already landed on
#      origin/main — ancestry on origin/main (the commits themselves landed;
#      the exact proof), per-file byte identity (so squash merges qualify even
#      though `git branch -d` refuses them), or a merged PR whose head was
#      exactly the branch tip with its merge commit on origin/main (delivery
#      after main moved on, which byte identity can never re-verify);
#      branches checked out in any worktree are never touched, and a branch
#      contained in the local main only (never pushed) is kept with that
#      reason
#   4. sweeps remote twins, including orphans whose local branch is already
#      gone (stop deletes the local one first); every remote deletion is gated
#      on its own delivery verification, a fail-closed open-PR check, and a
#      closed-unmerged PR snapshot taken before it (deleting a head branch
#      closes its PRs, so the post-delete open count alone proves nothing) —
#      a newly closed PR, a newly open one, or an unreadable re-check gets the
#      ref pushed back exactly as verified, or a loud warning when someone
#      re-created the ref in the meantime (never clobbered)
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
# gh binary used by the delivery criteria and the open-PR guard; GH_CMD
# overrides it (tests, or a gh installed under a different name).
GH="${GH_CMD:-gh}"
# Absolute script path, resolved while the cwd is still valid: stop re-enters
# the launcher for the post-delivery gc even after it removed a worktree the
# cwd may have pointed into.
SELF="$0"
case "$SELF" in /*) ;; *) SELF="$(pwd)/$SELF" ;; esac
# Main worktree root, derived from the common git dir. stop cd's here before
# the post-removal git work: when it is invoked from inside the worktree it
# removes, the cwd is gone afterwards and every git call would fail — which
# must not be mistaken for "no merged PR".
MAIN_WT=$(dirname "$COMMON")
[ -d "$MAIN_WT" ] || MAIN_WT=""

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

# pr_delivered <branch> <tip> — did a merged PR carry exactly this tip into
# origin/main? 0 = yes; 1 = no merged PR matches this tip; 4 = cannot tell
# (gh missing, or the query failed). The tip binding is what makes this safe:
# a PR whose head SHA equals this exact tip proves this tip was pushed and
# merged; commits added afterwards move the tip and the branch is kept.
pr_delivered() {
  local b="$1" tip="$2" rows head_sha mc
  command -v "$GH" >/dev/null 2>&1 || return 4
  [ -n "$tip" ] || return 1
  rows=$("$GH" pr list --head "$b" --state merged --limit 20 \
    --json mergeCommit,headRefOid \
    --jq '.[] | [.headRefOid // "", .mergeCommit.oid // ""] | @tsv' </dev/null 2>/dev/null) || return 4
  while IFS=$'\t' read -r head_sha mc; do
    [ "$head_sha" = "$tip" ] || continue
    [ -n "$mc" ] || continue
    git merge-base --is-ancestor "$mc" refs/remotes/origin/main 2>/dev/null && return 0
  done <<< "$rows"
  return 1
}

# closed_unmerged_prs <branch> — one "<number><TAB><closedAt>" line per PR that
# was closed without being merged and whose head is <branch>; empty when there
# are none. rc 4 = the query could not run. Deleting a head branch closes its
# PRs, so the post-delete open count reads 0 whether or not a PR was just
# closed: this snapshot is taken before the delete and compared after it, and
# only a new entry tells the two apart.
closed_unmerged_prs() {
  local b="$1"
  command -v "$GH" >/dev/null 2>&1 || return 4
  "$GH" pr list --head "$b" --state closed --limit 50 \
    --json number,closedAt,mergedAt \
    --jq '.[] | select(.mergedAt == null) | [.number, .closedAt] | @tsv' \
    </dev/null 2>/dev/null || return 4
}

# ref_delivered <ref> <tip> — delivery verdict for one branch, most direct
# criterion first:
#   6 = <ref> is an ancestor of origin/main — the commits themselves landed
#       (exact proof; the files may have drifted since, so byte identity alone
#       cannot re-verify this shape);
#   0 = every file <ref> changed is byte-identical on origin/main
#       (ref_content_merged: the branch's own content landed, squash or not);
#   3 = a merged PR carried exactly <tip> into origin/main (the criterion that
#       survives main moving on after the merge — release bumps rewrite the
#       files the branch touched, so byte identity can never re-verify those);
#   1 = none of them → keep;
#   4 = content differs and the merged-PR check could not run → keep.
# Callers beware: verdicts 0 and 6 are only trustworthy on a freshly fetched
# ref. A tracking ref behind live origin/main can only under-report them, and
# both callers fetch first; a tracking ref *ahead* of it (remote main rewritten
# after the last fetch) would over-report, so a delete is never judged on a ref
# that was not just fetched.
ref_delivered() {
  local ref="$1" tip="$2" b rc
  git merge-base --is-ancestor "$ref" refs/remotes/origin/main 2>/dev/null && return 6
  ref_content_merged "$ref" refs/remotes/origin/main && return 0
  b="${ref#refs/heads/}"
  b="${b#refs/remotes/origin/}"
  rc=0
  pr_delivered "$b" "$tip" || rc=$?
  if [ "$rc" = 0 ]; then
    return 3
  fi
  return "$rc"
}

# local_main_only <branch> — the branch is contained in the local main
# checkout's main but NOT on origin/main. The work is safe locally, but a
# local merge is not a delivery: the branch is kept and the reason says so.
local_main_only() {
  local b="$1"
  git merge-base --is-ancestor "refs/heads/$b" refs/heads/main 2>/dev/null || return 1
  git merge-base --is-ancestor "refs/heads/$b" refs/remotes/origin/main 2>/dev/null && return 1
  return 0
}

# delete_if_delivered <branch> — the only `-D` in this script, gated on
# ref_delivered. 0 = deleted (content merged); 1 = kept (not delivered);
# 2 = kept (delete failed); 3 = deleted (PR merged into main); 4 = kept
# (content differs and the merged-PR check is unavailable); 6 = deleted
# (ancestry on origin/main); 7 = already gone (no local branch to judge —
# swept by a parallel gc or deleted by hand between listing and check).
delete_if_delivered() {
  local b="$1" tip rc
  tip=$(git rev-parse --verify --quiet "refs/heads/$b" 2>/dev/null) || return 7
  rc=0
  ref_delivered "refs/heads/$b" "$tip" || rc=$?
  case "$rc" in
    0 | 3 | 6) ;;
    4) return 4 ;;
    *) return 1 ;;
  esac
  git branch -D "$b" >/dev/null 2>&1 || return 2
  return "$rc"
}

# deleted_reason <verdict> — why a delete was authorised, for the log line.
deleted_reason() {
  case "$1" in
    6) printf '%s' "ancestry on origin/main" ;;
    3) printf '%s' "PR merged into main" ;;
    *) printf '%s' "content merged" ;;
  esac
}

# verdict_kept_reason <verdict> [branch] — the keep reason for the
# non-delivered verdict codes (1 = checked, nothing matched; 4 = check
# unavailable; 5 = fetch failed, so content is unverifiable and the PR check
# found nothing for this tip). Verdict 1 on a branch contained in the local
# main checkout says so instead of the generic wording.
verdict_kept_reason() {
  case "$1" in
    4) printf '%s' "not verified: content differs from origin/main and the merged-PR check is unavailable" ;;
    5) printf '%s' "not verified: fetch failed (content unverifiable) and no merged PR for this tip" ;;
    *)
      if [ -n "${2:-}" ] && local_main_only "$2"; then
        printf '%s' "merged into local main only — not on origin/main (push main or open a PR)"
      else
        printf '%s' "not delivered: content differs from origin/main, no merged PR for this tip"
      fi
      ;;
  esac
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
  closeout_done=""
  if [ -n "$WT_GITDIR" ] && [ -f "$WT_GITDIR/session-pilot/current-session" ]; then
    session_id=$(head -n 1 "$WT_GITDIR/session-pilot/current-session" | tr -d '[:space:]')
    rm -f "$WT_GITDIR/session-pilot/current-session"
    echo "[session] state cleared (auto-fill off; ref-gate block mode now keys on worktree count)"
  fi
  if git worktree remove "$wtpath" >/dev/null 2>&1; then
    echo "[session] worktree removed: $wtpath"
    # The cwd may have been inside the removed worktree; from here on the git
    # work runs from the main worktree so a dangling cwd can never be read as
    # an empty answer.
    if [ -n "$MAIN_WT" ]; then cd "$MAIN_WT" 2>/dev/null || true; fi
    # The delivery criteria judge against origin/main, and the routine
    # sequence is merge → stop with no intervening fetch: refresh it first
    # (non-fatal — offline just leaves the ref stale, and every criterion
    # stays fail-closed). gc fetches again for the closeout; this one is what
    # lets the tip-bound PR criterion see a merge that happened after the
    # last fetch.
    GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=15 \
      git fetch --quiet origin main 2>/dev/null || true
    # #195: a removed worktree means the session ended — delete the session
    # branch when its work is fully on origin/main. ref_delivered carries the
    # criteria (ancestry, then byte identity, then tip-bound merged PR); `-D`
    # is only reached behind it. Work that never landed is auto-exempted and
    # kept. Deletion failure never blocks the stop flow.
    #
    # `git branch -d` alone is NOT a delivery proof: besides ancestry it also
    # accepts a branch "merged" to its own remote-tracking ref, so an unmerged
    # PR's live twin — or a stale twin whose remote head was deleted — would
    # authorize deleting work that never reached main. The gate is ancestry to
    # `refs/remotes/origin/main` — the pushed main, not the local one and not
    # whatever branch the main checkout sits on: a local-only merge, or a side
    # branch holding the commits, is not a delivery. Everything else goes
    # through ref_delivered (fail-closed).
    if [ -n "$session_id" ]; then
      delivered=""
      if git merge-base --is-ancestor "refs/heads/session/$session_id" refs/remotes/origin/main 2>/dev/null \
         && git branch -d "session/$session_id" >/dev/null 2>&1; then
        echo "[session] merged session branch deleted (ancestry on origin/main): session/$session_id"
        delivered=1
      else
        rc=0
        delete_if_delivered "session/$session_id" || rc=$?
        case "$rc" in
          0)
            echo "[session] squash-merged session branch deleted (content verified on origin/main): session/$session_id"
            delivered=1
            ;;
          3)
            echo "[session] PR-merged session branch deleted (merged PR head verified on origin/main): session/$session_id"
            delivered=1
            ;;
          6)
            echo "[session] merged session branch deleted (ancestry on origin/main): session/$session_id"
            delivered=1
            ;;
          2)
            echo "[session] session branch kept (delete failed): session/$session_id"
            ;;
          7)
            # The branch was swept before this check — a parallel session's
            # stop/gc can do it any time this worktree sits on another branch
            # (gc never touches a checked-out branch). Nothing is kept, so say
            # that instead of claiming a keep; the closeout still runs, because
            # gc only ever deletes delivered branches (fail-closed) and the
            # merge → stop sequence stays a single command.
            echo "[session] session branch already gone (swept by an earlier gc or deleted): session/$session_id"
            delivered=1
            ;;
          *)
            echo "[session] session branch kept ($(verdict_kept_reason "$rc" "session/$session_id")): session/$session_id"
            ;;
        esac
      fi
      # A deleted session branch means the work landed — and a branch already
      # swept (verdict 7) leaves nothing to keep either: run the post-delivery
      # closeout now (sweep the remote twin, sync the main checkout), so the
      # merge → stop sequence needs no second command. stop may have been
      # invoked through the worktree's OWN launcher copy — that path died with
      # the worktree — so fall back to the main checkout's copy. Non-fatal:
      # stop never fails hard.
      if [ -n "$delivered" ]; then
        closeout=""
        if [ -r "$SELF" ]; then
          closeout="$SELF"
        elif [ -n "$MAIN_WT" ] && [ -r "$MAIN_WT/scripts/session-launcher.sh" ]; then
          closeout="$MAIN_WT/scripts/session-launcher.sh"
        fi
        if [ -n "$closeout" ]; then
          echo "[session] post-delivery closeout:"
          bash "$closeout" gc || true
          closeout_done=1
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

  # The closeout just ran when it could; only otherwise point at the manual
  # command, so the output never contradicts what stop already did.
  if [ -z "$closeout_done" ]; then
    echo "[session] closeout after the PR merges: npm run session:gc (sync main + clean merged branches)"
  fi
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

  # 3. Clean delivered branches in the session namespace. The criteria are
  #    ref_delivered (byte identity, then tip-bound merged PR); any failed
  #    verification keeps the branch. Checked-out branches are never touched.
  #    SESSION_GC_BRANCH_GLOBS overrides the namespace globs.
  #
  # The globs go into an array via `read -ra`: word-splitting `$globs` in a
  # `for` loop ALSO pathname-expands it against the checkout, so a real
  # `docs/` directory turned the `docs/*` pattern into that directory's file
  # names and no `docs/…` branch ever matched — gc skipped it silently
  # (2026-10-13: a delivered docs/ branch survived two gc runs; the test
  # fixture had no docs/ directory, which is why nothing caught it).
  # `read -ra` splits on IFS without globbing.
  read -r -a gc_globs <<<"${SESSION_GC_BRANCH_GLOBS:-session/* docs/* fix/* feat/* chore/* test/* refactor/*}"
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
    # ${gc_globs[@]+…} keeps an EMPTY override safe under `set -u`: bash 3.2
    # (macOS /bin/bash, the shebang path) treats a bare "${arr[@]}" on an
    # empty array as an unbound variable.
    for g in ${gc_globs[@]+"${gc_globs[@]}"}; do
      case "$name" in $g) return 0 ;; esac
    done
    return 1
  }

  # remote_twin_closeout <branch> <dry> — deletes origin/<branch> only when it
  # still exists, its own delivery verifies (ancestry on origin/main, content
  # on origin/main, or a tip-bound merged PR), gh can check for open PRs, and
  # none is open. dry=1 previews without writing any ref (no fetch, no delete).
  # Every unknown keeps it (fail-closed).
  #
  # The open-PR check and the delete are two steps, so a PR opened between them
  # would be closed by the delete — and deleting a head branch closes its PRs,
  # so the post-delete open-PR count reads 0 either way and proves nothing by
  # itself. The snapshot of closed-unmerged PRs taken before the delete is the
  # evidence: an entry that was not there before, an open PR that appeared, or
  # a re-check that could not run all push the ref back exactly as verified
  # (the branch is the only reference to that work, and this delete is the one
  # action in gc that can lose it). The restore push is not forced: a ref that
  # someone re-created in the window wins, with a loud warning instead.
  remote_twin_closeout() {
    local b="$1" dry="$2" open_prs tip tracked rc d tip_used post
    local closed_before closed_after appeared entry cause
    rc=0
    tip=$(git ls-remote --exit-code --heads origin "refs/heads/$b" 2>/dev/null | awk 'NR==1{print $1}') || rc=$?
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
      tracked=$(git rev-parse --verify --quiet "refs/remotes/origin/$b" || true)
      d=0
      ref_delivered "refs/remotes/origin/$b" "$tip" || d=$?
      if [ "$d" = 3 ]; then
        # The PR verdict does not depend on the tracking ref being fresh.
        echo "[gc] would delete remote origin/$b (PR merged into main)"
        remote_would=$((remote_would + 1))
      elif { [ "$d" = 0 ] || [ "$d" = 6 ]; } && [ "$tip" = "$tracked" ]; then
        # Ancestry and byte identity are judged on the tracking ref, so they
        # only count when it matches the live remote tip.
        echo "[gc] would delete remote origin/$b ($(deleted_reason "$d"))"
        remote_would=$((remote_would + 1))
      elif [ "$tip" = "$tracked" ]; then
        echo "[gc] kept remote origin/$b ($(verdict_kept_reason "$d"))"
        remote_kept=$((remote_kept + 1))
      else
        echo "[gc] would fetch and verify remote origin/$b before deleting (dry-run does not fetch)"
        remote_would=$((remote_would + 1))
      fi
      return 0
    fi
    # Content is only trustworthy on a freshly fetched ref: when the fetch
    # fails, the content criterion is skipped entirely and only the tip-bound
    # PR criterion may authorise the delete (its evidence does not depend on
    # local objects). Anything else is unknown and keeps the branch.
    d=0
    tip_used="$tip"
    if git fetch --quiet --force origin "refs/heads/$b:refs/remotes/origin/$b" </dev/null 2>/dev/null; then
      tip_used=$(git rev-parse "refs/remotes/origin/$b")
      ref_delivered "refs/remotes/origin/$b" "$tip_used" || d=$?
    else
      rc=0
      pr_delivered "$b" "$tip" || rc=$?
      case "$rc" in
        0) d=3 ;;
        1) d=5 ;; # PR check ran and found no match; content stays unverifiable
        *) d=4 ;;
      esac
    fi
    case "$d" in
      0 | 3 | 6)
        # Deleting a head branch closes its PRs, so the closed-unmerged
        # snapshot is taken first: an entry that was not there before is the
        # only evidence that this delete closed a PR. No snapshot, no delete.
        rc=0
        closed_before=$(closed_unmerged_prs "$b") || rc=$?
        if [ "$rc" != 0 ]; then
          echo "[gc] kept remote origin/$b (closed-PR history unavailable — fail-closed)"
          remote_kept=$((remote_kept + 1))
          return 0
        fi
        # --force-with-lease makes the delete conditional on the remote still
        # being at the tip just verified: a commit landing between
        # verification and deletion rejects the push (stale info) and keeps
        # the branch, closing that race atomically.
        if git push --quiet --force-with-lease="refs/heads/$b:$tip_used" origin --delete "$b" </dev/null >/dev/null 2>&1; then
          post=$("$GH" pr list --head "$b" --state open --json number --jq 'length' </dev/null 2>/dev/null) || post=""
          rc=0
          closed_after=$(closed_unmerged_prs "$b") || rc=$?
          appeared=""
          if [ "$rc" = 0 ]; then
            while IFS= read -r entry; do
              [ -n "$entry" ] || continue
              printf '%s\n' "$closed_before" | grep -Fxq "$entry" || { appeared="$entry"; break; }
            done <<< "$closed_after"
          fi
          if [ "$post" = "0" ] && [ "$rc" = 0 ] && [ -z "$appeared" ]; then
            echo "[gc] deleted remote origin/$b ($(deleted_reason "$d"))"
            remote_deleted=$((remote_deleted + 1))
          else
            if [ -n "$appeared" ]; then
              cause="a PR was closed by this delete"
            elif [ "$post" = "0" ]; then
              cause="the re-check could not run"
            else
              cause="an open PR appeared in the delete window"
            fi
            # Put the ref back exactly as verified; restoring the head branch
            # also reopens the PR GitHub closed with it. The push is
            # deliberately not forced — if someone re-created the ref in the
            # window, their tip wins and the recovery stays manual.
            if git push --quiet origin "$tip_used:refs/heads/$b" </dev/null >/dev/null 2>&1; then
              echo "[gc] restored remote origin/$b after the delete — $cause (fail-closed)"
            else
              echo "[gc] WARNING: deleted remote origin/$b while $cause; the remote moved on and was left untouched (never clobbered) — restore with: git push origin $tip_used:refs/heads/$b"
            fi
            remote_kept=$((remote_kept + 1))
          fi
        else
          echo "[gc] remote origin/$b delete failed or refused (remote moved after verification?) — skipped"
          remote_kept=$((remote_kept + 1))
        fi
        ;;
      *)
        echo "[gc] kept remote origin/$b ($(verdict_kept_reason "$d"))"
        remote_kept=$((remote_kept + 1))
        ;;
    esac
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
      # Same window as the real path below: the branch can be swept between
      # the listing and this check. Nothing to preview — not kept, not deleted.
      if ! git rev-parse --verify --quiet "refs/heads/$b" >/dev/null 2>&1; then
        echo "[gc] $b already gone (deleted concurrently)"
        continue
      fi
      d=0
      ref_delivered "refs/heads/$b" "$(git rev-parse "refs/heads/$b")" || d=$?
      case "$d" in
        0 | 3 | 6)
          echo "[gc] would delete $b ($(deleted_reason "$d"))"
          would_delete=$((would_delete + 1))
          remote_twin_closeout "$b" 1
          ;;
        *)
          echo "[gc] kept $b ($(verdict_kept_reason "$d" "$b"))"
          kept=$((kept + 1))
          ;;
      esac
      continue
    fi
    # One delivery verdict per branch, taken inside delete_if_delivered so the
    # `-D` is always gated on the check that authorises it (0 content merged,
    # 3 merged PR, 6 ancestry, 1 not delivered, 4 check unavailable, 2 delete
    # failed, 7 already gone).
    rc=0
    delete_if_delivered "$b" || rc=$?
    case "$rc" in
      0 | 3 | 6)
        echo "[gc] deleted $b ($(deleted_reason "$rc"))"
        deleted=$((deleted + 1))
        ;;
      2)
        echo "[gc] kept $b (delete failed)"
        kept=$((kept + 1))
        continue
        ;;
      7)
        # The branch vanished between the listing and this check (a parallel
        # session's stop/gc, or a manual delete): nothing was kept and nothing
        # was deleted here, so count neither. Its remote twin, if any, is left
        # to the orphan pass below, which re-verifies delivery on its own.
        echo "[gc] $b already gone (deleted concurrently)"
        continue
        ;;
      *)
        echo "[gc] kept $b ($(verdict_kept_reason "$rc" "$b"))"
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
