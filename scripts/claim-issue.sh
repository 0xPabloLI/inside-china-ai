#!/usr/bin/env bash
# claim-issue.sh — the mandatory read-before-claim gate (#258, docs/research/claim-gate-research-2026-09.md).
#
# Prints the issue body + ALL comments into the caller's context, surfaces the
# comments-unread signal, and only then assigns. Claims must go through this
# script instead of a bare `gh issue edit --add-assignee` (issue-tracker.md).
#
# Usage: scripts/claim-issue.sh <issue-number> [--yes]
#   --yes  skip the interactive confirmation (for re-claims after the
#          comments were already read in this session)

set -euo pipefail

REPO="${GITHUB_REPO:-0xPabloLI/inside-china-ai}"
N="${1:?usage: claim-issue.sh <issue-number> [--yes]}"
CONFIRM="${2:-}"
case "$N" in ''|*[!0-9]*) echo "❌ issue number must be numeric: $N" >&2; exit 1;; esac

# REST only — `gh issue view` rides GraphQL through the local proxy and
# intermittently times out (issue-tracker.md workaround).
ISSUE_JSON=$(gh api "repos/$REPO/issues/$N")
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
gh api --paginate "repos/$REPO/issues/$N/comments" | jq -r '.[] | "── \(.user.login) @ \(.created_at) ──\n\(.body)\n"'
echo "═══ end of comments ═══"

UNREAD=$(printf '%s' "$ISSUE_JSON" | jq -r '[.labels[].name] | index("comments-unread") != null')
if [ "$UNREAD" = "true" ]; then
  echo "⚠️  #$N carries comments-unread — new state above is NOT in the body."
  if [ "$CONFIRM" != "--yes" ]; then
    read -r -p "Confirm you have read ALL comments above and still want to claim [y/N] " answer
    case "$answer" in [yY]|[yY][eE][sS]) ;; *) echo "❌ claim aborted" >&2; exit 1;; esac
  fi
fi

gh api -X POST "repos/$REPO/issues/$N/assignees" -f assignees[]="@me" >/dev/null
# Clear the signal: this script's full-comment printout IS the read.
gh api -X DELETE "repos/$REPO/issues/$N/labels/comments-unread" >/dev/null 2>&1 || true
echo "✅ #$N claimed (assigned to @me, comments-unread cleared). Model/tool verdicts named in the ticket must still be re-checked against docs/research/ before work starts."
