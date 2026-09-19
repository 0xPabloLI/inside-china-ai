#!/bin/bash
# =============================================================================
# scripts/test-claim-issue.sh — Acceptance scenarios for the claim gate (#311)
#
# Run:  bash scripts/test-claim-issue.sh
# Exit: 0 = all scenarios pass, 1 = at least one failed
#
# Exercises scripts/claim-issue.sh against a scenario-driven fake `gh`
# (GH_CMD injection). The gate must resolve the real login explicitly, assign
# THAT login, and fail closed — nonzero exit, no success marker — when the
# assignee is not present after the assign call (#311: the assignees endpoint
# accepts `@me` with a 201 but writes nothing).
# =============================================================================
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAIM="$REPO_ROOT/scripts/claim-issue.sh"

pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS: $1"; pass=$((pass+1)); else echo "FAIL: $1 (expected $2, got $3)"; fail=$((fail+1)); fi
}
check_not_contains() { # name needle haystack
  case "$3" in *"$2"*) echo "FAIL: $1 (output contains '$2')"; fail=$((fail+1));; *) echo "PASS: $1"; pass=$((pass+1));; esac
}
check_contains() { # name needle haystack
  case "$3" in *"$2"*) echo "PASS: $1"; pass=$((pass+1));; *) echo "FAIL: $1 (output missing '$2')"; fail=$((fail+1));; esac
}

TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

LOGIN="0xPabloLI"
ISSUE_JSON='{"number":311,"state":"open","title":"t","body":"b","assignees":[],"labels":[{"name":"bug"},{"name":"ready-for-agent"},{"name":"P2"}]}'
ISSUE_JSON_ASSIGNED='{"number":311,"state":"open","title":"t","body":"b","assignees":[{"login":"someone-else"}],"labels":[{"name":"bug"}]}'

# make_fake_gh <dir> — writes a fake `gh` whose behaviour is steered by marker
# files inside <dir>: user-fails (api user exits 1), silent-fail (assign POST
# reports 201 with an empty assignees array, the #311 bug shape).
make_fake_gh() {
  local dir="$1"
  mkdir -p "$dir"
  cat > "$dir/gh" <<FAKE
#!/bin/bash
# fake gh — scenario-driven; logs every call to calls.log
echo "\$*" >> "$dir/calls.log"
if [ "\$2" = "user" ]; then
  [ -f "$dir/user-fails" ] && { echo "gh: auth error" >&2; exit 1; }
  echo "$LOGIN"
  exit 0
fi
case "\$*" in
  *"-X POST"*"assignees"*)
    printf '%s\n' "\$*" >> "$dir/assign-payload.log"
    if [ -f "$dir/silent-fail" ]; then
      echo '{"assignees":[]}'   # 201-shaped success, nothing written (#311)
    else
      echo "{\"assignees\":[{\"login\":\"$LOGIN\"}]}"
    fi
    exit 0 ;;
  *"/comments"*)
    echo '[]'; exit 0 ;;
  *"-X DELETE"*)
    exit 0 ;;
  *"--jq"*"assignees"*)
    # assignee read-back after the POST
    if [ -f "$dir/silent-fail" ]; then echo '[]'; else echo "[\"$LOGIN\"]"; fi
    exit 0 ;;
  *"/issues/"*)
    cat "$dir/issue.json"
    exit 0 ;;
esac
echo "fake gh: unhandled call: \$*" >&2
exit 1
FAKE
  chmod +x "$dir/gh"
  printf '%s' "$ISSUE_JSON" > "$dir/issue.json"
  echo "$dir/gh"
}

# run_claim <dir> — runs the gate with the fake; captures combined output
run_claim() {
  local dir="$1"
  GH_CMD="$dir/gh" bash "$CLAIM" 311 --yes > "$dir/out.txt" 2>&1
  echo $?
}

# --- S1: happy path — explicit login assigned, read-back asserted, success printed
D="$TMP_ROOT/s1"; make_fake_gh "$D" >/dev/null
RC=$(run_claim "$D")
OUT=$(cat "$D/out.txt")
check "S1 exits 0" 0 "$RC"
check_contains "S1 prints success marker" "✅" "$OUT"
check_contains "S1 names the assigned login" "assigned to $LOGIN" "$OUT"
PAYLOAD=$(cat "$D/assign-payload.log" 2>/dev/null)
check_contains "S1 POSTs the explicit login" "assignees[]=$LOGIN" "$PAYLOAD"
check_not_contains "S1 never sends @me" "@me" "$PAYLOAD"

# --- S2: silent failure — 201 but empty assignees must fail closed
D="$TMP_ROOT/s2"; make_fake_gh "$D" >/dev/null; touch "$D/silent-fail"
RC=$(run_claim "$D")
OUT=$(cat "$D/out.txt")
if [ "$RC" != "0" ]; then echo "PASS: S2 exits nonzero"; pass=$((pass+1)); else echo "FAIL: S2 exits nonzero (got 0)"; fail=$((fail+1)); fi
check_not_contains "S2 prints no success marker" "✅" "$OUT"
check_contains "S2 explains the read-back failure" "NOT claimed" "$OUT"

# --- S3: login resolution failure fails closed BEFORE assigning
D="$TMP_ROOT/s3"; make_fake_gh "$D" >/dev/null; touch "$D/user-fails"
RC=$(run_claim "$D")
OUT=$(cat "$D/out.txt")
if [ "$RC" != "0" ]; then echo "PASS: S3 exits nonzero"; pass=$((pass+1)); else echo "FAIL: S3 exits nonzero (got 0)"; fail=$((fail+1)); fi
check_not_contains "S3 prints no success marker" "✅" "$OUT"
if [ -f "$D/assign-payload.log" ]; then echo "FAIL: S3 assigns only after login resolves"; fail=$((fail+1)); else echo "PASS: S3 assigns only after login resolves"; pass=$((pass+1)); fi

# --- S4: already-assigned issue is skipped before any POST (dedup contract)
D="$TMP_ROOT/s4"; make_fake_gh "$D" >/dev/null
printf '%s' "$ISSUE_JSON_ASSIGNED" > "$D/issue.json"
RC=$(run_claim "$D")
OUT=$(cat "$D/out.txt")
if [ "$RC" != "0" ]; then echo "PASS: S4 refuses assigned issue"; pass=$((pass+1)); else echo "FAIL: S4 refuses assigned issue (got 0)"; fail=$((fail+1)); fi
if [ -f "$D/assign-payload.log" ]; then echo "FAIL: S4 makes no assign call"; fail=$((fail+1)); else echo "PASS: S4 makes no assign call"; pass=$((pass+1)); fi

echo
echo "Passed: $pass, Failed: $fail"
[ "$fail" = "0" ]
