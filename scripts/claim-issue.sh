#!/usr/bin/env bash
# claim-issue.sh — the mandatory read-before-claim gate (#258, docs/research/claim-gate-research-2026-09.md).
#
# Prints the issue body + ALL comments into the caller's context, surfaces the
# comments-unread signal, and only then assigns. Claims must go through this
# script instead of a bare `gh issue edit --add-assignee` (issue-tracker.md).
#
# The assign step is fail-closed (#311): the issue-assignees endpoint does not
# resolve `@me` — it can return 201 with an EMPTY assignees array, so success
# is only reported after a read-back confirms the assignee is actually set.
# The current login is resolved explicitly (`gh api user`) and posted by name.
#
# Usage: scripts/claim-issue.sh <issue-number> [--yes]
#   --yes  skip the interactive confirmation (for re-claims after the
#          comments were already read in this session)
#
# GH_CMD overrides the gh binary (tests inject a scenario-driven fake; see
# scripts/test-claim-issue.sh).

set -euo pipefail

REPO="${GITHUB_REPO:-0xPabloLI/inside-china-ai}"
N="${1:?usage: claim-issue.sh <issue-number> [--yes]}"
CONFIRM="${2:-}"
GH="${GH_CMD:-gh}"
case "$N" in ''|*[!0-9]*) echo "❌ issue number must be numeric: $N" >&2; exit 1;; esac
command -v "$GH" >/dev/null 2>&1 || { echo "❌ gh command not found: $GH" >&2; exit 1; }

# REST only — `gh issue view` rides GraphQL through the local proxy and
# intermittently times out (issue-tracker.md workaround).
ISSUE_JSON=$("$GH" api "repos/$REPO/issues/$N")
TITLE=$(printf '%s' "$ISSUE_JSON" | jq -r '.title')
STATE=$(printf '%s' "$ISSUE_JSON" | jq -r '.state')
[ "$STATE" = "open" ] || { echo "❌ #$N is $STATE — only open issues can be claimed" >&2; exit 1; }

ASSIGNEES=$(printf '%s' "$ISSUE_JSON" | jq -r '.assignees | length')
if [ "$ASSIGNEES" != "0" ]; then
  echo "❌ #$N is already assigned — concurrent sessions skip assigned tickets" >&2
  exit 1
fi

echo "═══ #$N — $TITLE ═══"
printf '%s' "$ISSUE_JSON" | jq -r '.body'
echo

echo "═══ comments ═══"
"$GH" api --paginate "repos/$REPO/issues/$N/comments" | jq -r '.[] | "── \(.user.login) @ \(.created_at) ──\n\(.body)\n"'
echo "═══ end of comments ═══"

UNREAD=$(printf '%s' "$ISSUE_JSON" | jq -r '[.labels[].name] | index("comments-unread") != null')
if [ "$UNREAD" = "true" ]; then
  echo "⚠️  #$N carries comments-unread — new state above is NOT in the body."
  if [ "$CONFIRM" != "--yes" ]; then
    read -r -p "Confirm you have read ALL comments above and still want to claim [y/N] " answer
    case "$answer" in [yY]|[yY][eE][sS]) ;; *) echo "❌ claim aborted" >&2; exit 1;; esac
  fi
fi

# claim_issue <login> — assign the explicit login and assert it stuck (#311).
# The 201 response body is not trusted; the issue is read back and the
# assignee list must contain <login>, otherwise the caller must treat the
# issue as unclaimed (concurrent sessions would otherwise double-claim).
claim_issue() {
  local login="$1" readback
  "$GH" api -X POST "repos/$REPO/issues/$N/assignees" -f "assignees[]=$login" >/dev/null
  readback=$("$GH" api "repos/$REPO/issues/$N" --jq '[.assignees[].login]') || return 1
  [ -n "$readback" ] || return 1
  printf '%s' "$readback" | jq -e --arg login "$login" 'index($login) != null' >/dev/null || return 1
}

LOGIN=$("$GH" api user --jq .login) || { echo "❌ cannot resolve current gh login — run \`gh auth status\`" >&2; exit 1; }
[ -n "$LOGIN" ] || { echo "❌ empty gh login — run \`gh auth status\`" >&2; exit 1; }
if ! claim_issue "$LOGIN"; then
  echo "❌ #$N claim FAILED: assignee '$LOGIN' not present after assign — issue is NOT claimed, do not start work" >&2
  exit 1
fi

# Clear the signal: this script's full-comment printout IS the read.
"$GH" api -X DELETE "repos/$REPO/issues/$N/labels/comments-unread" >/dev/null 2>&1 || true
echo "✅ #$N claimed (assigned to $LOGIN, comments-unread cleared). Model/tool verdicts named in the ticket must still be re-checked against docs/research/ before work starts."
