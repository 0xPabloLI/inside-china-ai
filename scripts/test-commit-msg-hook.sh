#!/bin/bash
# =============================================================================
# scripts/test-commit-msg-hook.sh — Acceptance scenarios for the Session-Id gate
#
# Run:  bash scripts/test-commit-msg-hook.sh
# Exit: 0 = all scenarios pass, 1 = at least one failed
#
# Scenarios cover both enforcement and the measured bypass surface. Bypass
# scenarios (S12-S17) assert the CURRENT behaviour so a future change that
# silently widens or narrows the gate is caught here.
# =============================================================================
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/.githooks/commit-msg"
INSTALLER="$REPO_ROOT/scripts/install-git-hooks.sh"

pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS: $1"; pass=$((pass+1)); else echo "FAIL: $1 (expected $2, got $3)"; fail=$((fail+1)); fi
}

TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

# new_repo <name> -> prints path; hooks installed, one root commit
new_repo() {
  local dir="$TMP_ROOT/$1"
  mkdir -p "$dir"
  ( cd "$dir"
    git init -q -b main .
    git config user.email t@t.local; git config user.name t
    git config commit.gpgsign false
    cp "$HOOK" .githooks_tmp 2>/dev/null || true
    mkdir -p .githooks && cp "$HOOK" .githooks/commit-msg && chmod +x .githooks/commit-msg
    rm -f .githooks_tmp
    git config core.hooksPath .githooks
    echo a > a.txt; git add a.txt
    git commit -q -m "root" --trailer "Session-Id: 20260903-root-aaaaaa"
  ) >/dev/null 2>&1
  echo "$dir"
}

# try_commit <dir> <msg> [extra args...] -> exit code of git commit
try_commit() {
  local dir="$1"; shift
  local msg="$1"; shift
  ( cd "$dir" && echo change >> a.txt && git add a.txt && git commit -q -m "$msg" "$@" >/dev/null 2>&1; echo $? )
}

GOOD_ID="20260903-closeout-a1b2c3"

# --- Group A: trailer validation (hook installed, strict off) ---------------
R=$(new_repo "trailer")

printf 'feat: x\n\nSession-Id: %s\n' "$GOOD_ID" > "$R/msg.txt"
( cd "$R" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R/out"
check "S1 valid trailer passes" 0 "$(cat "$R/out")"

printf 'feat: x\n' > "$R/msg.txt"
( cd "$R" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R/out"
check "S2 missing trailer blocked" 1 "$(cat "$R/out")"

printf 'feat: x\n\nSession-Id: 20260903-leaptalk-v8-api-research\n' > "$R/msg.txt"
( cd "$R" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R/out"
check "S3 malformed id blocked (leaptalk style)" 1 "$(cat "$R/out")"

printf 'feat: x\n\nSession-Id: %s\nSession-Id: 20260903-other-d4e5f6\n' "$GOOD_ID" > "$R/msg.txt"
( cd "$R" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R/out"
check "S4 duplicate id blocked" 1 "$(cat "$R/out")"

printf 'feat: x\n\nSession-Id: 20260903-x-abc1234\n' > "$R/msg.txt"
( cd "$R" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R/out"
check "S5 wrong hex length blocked" 1 "$(cat "$R/out")"

# --- Group B: registration gate (strict on) ---------------------------------
R2=$(new_repo "strict")
( cd "$R2" && git config session.provenance strict ) 

# S6 no registry at all -> fail-closed
printf 'feat: x\n\nSession-Id: %s\n' "$GOOD_ID" > "$R2/msg.txt"
( cd "$R2" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R2/out"
check "S6 strict, missing registry blocked (fail-closed)" 1 "$(cat "$R2/out")"

# S7 registered in common-dir registry -> passes
COMMON=$(cd "$R2" && git rev-parse --git-common-dir)
mkdir -p "$R2/$COMMON/session-pilot"
printf -- '- **Session-Id**: `%s` (test tool)\n' "$GOOD_ID" > "$R2/$COMMON/session-pilot/pilot-log.md"
( cd "$R2" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R2/out"
check "S7 strict, registered id passes" 0 "$(cat "$R2/out")"

# S8 unregistered id -> blocked
printf 'feat: y\n\nSession-Id: 20260903-ghost-999999\n' > "$R2/msg.txt"
( cd "$R2" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R2/out"
check "S8 strict, unregistered id blocked" 1 "$(cat "$R2/out")"

# S9 legacy root registry still honoured (transition path)
R3=$(new_repo "legacy")
( cd "$R3" && git config session.provenance strict )
mkdir -p "$R3/.session-pilot"
printf -- '- **Session-Id**: `%s` (test tool)\n' "$GOOD_ID" > "$R3/.session-pilot/pilot-log.md"
printf 'feat: x\n\nSession-Id: %s\n' "$GOOD_ID" > "$R3/msg.txt"
( cd "$R3" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R3/out"
check "S9 strict, legacy root registry accepted" 0 "$(cat "$R3/out")"

# --- Group C: worktree coverage ---------------------------------------------
R4=$(new_repo "worktree")
( cd "$R4" && git config session.provenance strict )
COMMON4=$(cd "$R4" && git rev-parse --git-common-dir)
mkdir -p "$R4/$COMMON4/session-pilot"
printf -- '- **Session-Id**: `%s` (test tool)\n' "$GOOD_ID" > "$R4/$COMMON4/session-pilot/pilot-log.md"
( cd "$R4" && git worktree add -q -b wt1 "$TMP_ROOT/wt1" >/dev/null 2>&1 )
printf 'feat: from worktree\n\nSession-Id: %s\n' "$GOOD_ID" > "$TMP_ROOT/wt1/msg.txt"
( cd "$TMP_ROOT/wt1" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$TMP_ROOT/wt.out"
check "S10 worktree finds registry via git-common-dir" 0 "$(cat "$TMP_ROOT/wt.out")"
printf 'feat: from worktree\n\nSession-Id: 20260903-ghost-888888\n' > "$TMP_ROOT/wt1/msg.txt"
( cd "$TMP_ROOT/wt1" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$TMP_ROOT/wt.out"
check "S11 worktree still blocks unregistered id" 1 "$(cat "$TMP_ROOT/wt.out")"

# --- Group D: installer ------------------------------------------------------
R5="$TMP_ROOT/fresh"
mkdir -p "$R5"
( cd "$R5" && git init -q -b main . && git config user.email t@t.local && git config user.name t && git config commit.gpgsign false ) >/dev/null 2>&1
mkdir -p "$R5/.githooks" && cp "$HOOK" "$R5/.githooks/commit-msg"
cp "$INSTALLER" "$R5/scripts_tmp.sh"
( cd "$R5" && mkdir -p scripts && mv scripts_tmp.sh scripts/install-git-hooks.sh && bash scripts/install-git-hooks.sh ) >/dev/null 2>&1
check "S12 installer sets hooksPath" ".githooks" "$(cd "$R5" && git config core.hooksPath)"
check "S13 installer enables strict" "strict" "$(cd "$R5" && git config session.provenance)"
check "S14 installer creates common-dir registry" "yes" "$([ -f "$R5/.git/session-pilot/pilot-log.md" ] && echo yes || echo no)"
check "S15 installer-installed repo blocks unregistered id" 1 "$(try_commit "$R5" "feat: no registration")"

# --- Group E: measured bypass surface ---------------------------------------
R6=$(new_repo "bypass")
check "S16 merge --no-ff exempt by choice (hook runs)" 0 "$(
  cd "$R6" && git checkout -q -b feat && echo b > b.txt && git add b.txt &&
  git commit -q -m "feat b" --trailer "Session-Id: 20260903-feat-bbbbbb" &&
  git checkout -q main && echo c > c.txt && git add c.txt &&
  git commit -q -m "main c" --trailer "Session-Id: 20260903-main-cccccc" &&
  git merge --no-ff -q feat -m "Merge feat" >/dev/null 2>&1; echo $?
)"
check "S17 merge commit carries no Session-Id (by design)" "" "$(cd "$R6" && git log --format='%(trailers:key=Session-Id,valueonly)' -1)"

R7=$(new_repo "revert")
( cd "$R7" && echo z >> a.txt && git add a.txt && git commit -q -m "second" --trailer "Session-Id: 20260903-sec-bbbbbb" ) >/dev/null 2>&1
check "S18 revert bypasses commit-msg (no hook invocation)" "" "$(
  cd "$R7" && git revert --no-edit HEAD >/dev/null 2>&1
  git log --format='%(trailers:key=Session-Id,valueonly)' -1
)"
( cd "$R7" && git revert --no-commit HEAD >/dev/null 2>&1 )
check "S18b revert --no-commit is then gated" 1 "$(
  cd "$R7" && echo x >> a.txt && git add a.txt && git commit -q -m "Revert \"second\"" >/dev/null 2>&1; echo $?
)"

R8=$(new_repo "cherry")
CHERRY_ID="$(
  cd "$R8" && git checkout -q -b feat && echo b > b.txt && git add b.txt &&
  git commit -q -m "feat b" --trailer "Session-Id: 20260903-feat-bbbbbb" &&
  git checkout -q main && echo c > c.txt && git add c.txt &&
  git commit -q -m "main c" --trailer "Session-Id: 20260903-main-cccccc" &&
  git cherry-pick feat >/dev/null 2>&1
  git log --format='%(trailers:key=Session-Id,valueonly)' -1
)"
check "S19 cherry-pick mis-attributes to the source session" "20260903-feat-bbbbbb" "$CHERRY_ID"

R9=$(new_repo "plumbing")
check "S20 commit-tree bypasses commit-msg" 0 "$(
  cd "$R9" && T=$(git write-tree) && git commit-tree "$T" -p HEAD -m "via commit-tree" >/dev/null 2>&1; echo $?
)"
check "S21 --no-verify bypasses commit-msg" 0 "$(try_commit "$R9" "no verify" --no-verify)"

R10=$(new_repo "nohooks")
( cd "$R10" && git config --unset core.hooksPath )
check "S22 checkout without hooksPath has no gate" 0 "$(try_commit "$R10" "no trailer at all")"

# --- Group F: dual-id query behaviour ---------------------------------------
R11=$(new_repo "dualid")
( cd "$R11" && T=$(git write-tree) &&
  C=$(git commit-tree "$T" -p HEAD -m "dual
  
Session-Id: 20260903-alpha-111111
Session-Id: 20260903-beta-222222") &&
  git update-ref refs/heads/main "$C" ) >/dev/null 2>&1
QUERY_A=$(cd "$R11" && git log --all --format='%h%x09%(trailers:key=Session-Id,valueonly,separator=%x2C)%x09%s' | awk -F '\t' -v id="20260903-alpha-111111" '$2 == id' | grep -c . || true)
QUERY_B=$(cd "$R11" && git log --all --format='%h%x09%(trailers:key=Session-Id,valueonly,separator=%x2C)%x09%s' | awk -F '\t' -v id="20260903-beta-222222" '$2 == id' | grep -c . || true)
check "S23 dual id unreachable from the alpha side" 0 "$QUERY_A"
check "S24 dual id unreachable from the beta side" 0 "$QUERY_B"

# --- Group G: runbook update-ref safety -------------------------------------
R12=$(new_repo "updateref")
STALE=$(cd "$R12" && git rev-parse HEAD)
( cd "$R12" && echo d > d.txt && git add d.txt && git commit -q -m "advance" --trailer "Session-Id: 20260903-adv-333333" ) >/dev/null 2>&1
NEW=$(cd "$R12" && git rev-parse HEAD)
STALE_OLD_EXIT="$(
  cd "$R12" && git update-ref refs/heads/main "$NEW" "$STALE" >/dev/null 2>&1; echo $?
)"
if [ "$STALE_OLD_EXIT" != "0" ]; then
  echo "PASS: S25 update-ref with stale expected-old is rejected (exit $STALE_OLD_EXIT)"
  pass=$((pass+1))
else
  echo "FAIL: S25 update-ref with stale expected-old was accepted — race window open"
  fail=$((fail+1))
fi
CURRENT=$(cd "$R12" && git rev-parse HEAD)
check "S26 update-ref with current expected-old succeeds" 0 "$(
  cd "$R12" && git update-ref refs/heads/main "$NEW" "$CURRENT" >/dev/null 2>&1; echo $?
)"

# S27 token-exact registration: an id embedded inside a longer token is NOT
# a registration (previously substring grep -qF would have accepted it)
R13=$(new_repo "token")
( cd "$R13" && git config session.provenance strict )
COMMON13=$(cd "$R13" && git rev-parse --git-common-dir)
mkdir -p "$R13/$COMMON13/session-pilot"
printf -- '- **Session-Id**: `zz%s` (embedded, not a token)\n' "$GOOD_ID" > "$R13/$COMMON13/session-pilot/pilot-log.md"
printf 'feat: x\n\nSession-Id: %s\n' "$GOOD_ID" > "$R13/msg.txt"
( cd "$R13" && bash "$HOOK" msg.txt >/dev/null 2>&1; echo $? ) > "$R13/out"
check "S27 substring-embedded id is not treated as registered" 1 "$(cat "$R13/out")"

# S28 legacy registry still works but warns (deprecation signal)
R14=$(new_repo "legacywarn")
( cd "$R14" && git config session.provenance strict )
COMMON14=$(cd "$R14" && git rev-parse --git-common-dir)
mkdir -p "$R14/$COMMON14/session-pilot" "$R14/.session-pilot"
printf -- '- **Session-Id**: `%s` (canonical)\n' "20260903-canonical-111111" > "$R14/$COMMON14/session-pilot/pilot-log.md"
printf -- '- **Session-Id**: `%s` (legacy)\n' "$GOOD_ID" > "$R14/.session-pilot/pilot-log.md"
printf 'feat: x\n\nSession-Id: %s\n' "$GOOD_ID" > "$R14/msg.txt"
LEGACY_WARN="$(cd "$R14" && bash "$HOOK" msg.txt 2>&1 >/dev/null)"
case "$LEGACY_WARN" in
  *"legacy path is scheduled for removal"*)
    echo "PASS: S28 legacy registry use prints deprecation warning"; pass=$((pass+1)) ;;
  *)
    echo "FAIL: S28 legacy deprecation warning missing"; fail=$((fail+1)) ;;
esac

# --- Group H: reference-transaction orphan gate (concurrency plan B) ---------
REFTX="$REPO_ROOT/.githooks/reference-transaction"

# S29 no state file -> foreign-id drop is allowed but loudly warned
R15=$(new_repo "reftx-warn")
( cd "$R15" && mkdir -p .githooks && cp "$REFTX" .githooks/reference-transaction && chmod +x .githooks/reference-transaction &&
  git checkout -q -b other && echo b > b.txt && git add b.txt &&
  git commit -q -m "theirs" --trailer "Session-Id: 20260903-foreign-444444" &&
  git checkout -q main && git merge -q --no-ff other -m "merge" >/dev/null 2>&1
) >/dev/null 2>&1
ROOT15=$(cd "$R15" && git rev-list --max-parents=0 HEAD)
WARN_OUT="$(cd "$R15" && git reset --hard "$ROOT15" 2>&1 >/dev/null)"
RESET15_EXIT="$(cd "$R15" && git reset --hard "$ROOT15" >/dev/null 2>&1; echo $?)"
check "S29 warn-mode reset succeeds (no state file)" 0 "$RESET15_EXIT"
case "$WARN_OUT" in *"provenanced to another session"*) echo "PASS: S29b warn message printed"; pass=$((pass+1)) ;; *) echo "FAIL: S29b warn message missing (got: $WARN_OUT)"; fail=$((fail+1)) ;; esac

# S30 state file present -> foreign-id drop is BLOCKED, ref untouched
R16=$(new_repo "reftx-block")
( cd "$R16" && mkdir -p .githooks && cp "$REFTX" .githooks/reference-transaction && chmod +x .githooks/reference-transaction &&
  COMMON=$(git rev-parse --git-common-dir) && mkdir -p "$COMMON/session-pilot" &&
  printf '20260903-mine-a1b2c3\n' > "$COMMON/session-pilot/current-session" &&
  git checkout -q -b other && echo b > b.txt && git add b.txt &&
  git commit -q -m "theirs" --trailer "Session-Id: 20260903-foreign-444444" &&
  git checkout -q main && git merge -q --no-ff other -m "merge" >/dev/null 2>&1
) >/dev/null 2>&1
BEFORE16=$(cd "$R16" && git rev-parse HEAD)
ROOT16=$(cd "$R16" && git rev-list --max-parents=0 HEAD)
BLOCK16_EXIT="$(cd "$R16" && git reset --hard "$ROOT16" >/dev/null 2>&1; echo $?)"
AFTER16=$(cd "$R16" && git rev-parse HEAD)
check "S30 foreign-id reset blocked with state file (git wraps hook exit as 128)" 128 "$BLOCK16_EXIT"
check "S30b ref untouched after blocked reset" "$BEFORE16" "$AFTER16"

# S31 own-id-only rewind passes even in block mode: advance main with an own
# commit first, then rewind exactly that commit (rebase/amend of own work)
FF31_EXIT="$(cd "$R16" && echo f >> a.txt && git add a.txt && git commit -q -m "ff" --trailer "Session-Id: 20260903-mine-a1b2c3" >/dev/null 2>&1; echo $?)"
check "S31a normal FF commit passes the gate" 0 "$FF31_EXIT"
OWN31_EXIT="$(cd "$R16" && git reset --hard HEAD~1 >/dev/null 2>&1; echo $?)"
check "S31b own-id rewind allowed (rebase/amend of own work)" 0 "$OWN31_EXIT"

echo "---"
echo "pass=$pass fail=$fail"
[ "$fail" = "0" ]
