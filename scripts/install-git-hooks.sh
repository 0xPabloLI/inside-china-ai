#!/bin/bash
# =============================================================================
# scripts/install-git-hooks.sh — Enable every version-controlled hook
#
# Run this once after cloning the repo:
#   bash scripts/install-git-hooks.sh   (or: npm run setup:hooks)
#
# What it does:
#   1. Points core.hooksPath at .githooks/ so ALL version-controlled hooks run
#      (pre-commit secret scan + doc lint, commit-msg Session-Id gate,
#      prepare-commit-msg trailer auto-fill, reference-transaction ref-gate).
#      Installing only .git/hooks/pre-commit would leave the Session-Id gate off.
#   2. Marks every hook executable.
#   3. Enables the strict registration gate (session.provenance=strict).
#   4. Creates the shared registration file under the git common dir
#      ($(git rev-parse --git-common-dir)/session-pilot/pilot-log.md) so that
#      linked worktrees share one registry. A legacy root .session-pilot/
#      copy, if present, is migrated into it.
#
# To opt out of the registration gate only:
#   git config --unset session.provenance
# To opt out of all hooks:  git config --unset core.hooksPath
# =============================================================================

set -e

HOOKS_DIR=".githooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "Error: $HOOKS_DIR not found. Are you in the repo root?"
  exit 1
fi

git rev-parse --git-dir >/dev/null 2>&1 || {
  echo "Error: not inside a git repository."
  exit 1
}

# --- 1. Activate the version-controlled hooks directory ----------------------
git config core.hooksPath "$HOOKS_DIR"

# --- 2. Make hooks executable ------------------------------------------------
for hook in "$HOOKS_DIR"/*; do
  [ -f "$hook" ] || continue
  case "$(basename "$hook")" in
    *.sample|*.md) continue ;;
  esac
  chmod +x "$hook"
done

# --- 3. Enable the strict registration gate ---------------------------------
git config session.provenance strict

# --- 4. Create / migrate the shared registration file -----------------------
COMMON_DIR=$(git rev-parse --git-common-dir)
REGISTRY_DIR="$COMMON_DIR/session-pilot"
REGISTRY="$REGISTRY_DIR/pilot-log.md"
LEGACY="$(git rev-parse --show-toplevel)/.session-pilot/pilot-log.md"

mkdir -p "$REGISTRY_DIR"

if [ ! -f "$REGISTRY" ]; then
  if [ -f "$LEGACY" ]; then
    cp "$LEGACY" "$REGISTRY"
    echo "✅ Migrated registration file: $LEGACY -> $REGISTRY"
  else
    cat > "$REGISTRY" <<'EOF'
# Session Registration Log

> One entry per session. The commit-msg hook (strict mode) rejects any
> Session-Id that does not appear in this file.
> This file lives in the git common dir, so all worktrees share it.

## 模板

### #N — <date>

- **tool**: <agent tool / model>
- **Session-Id**: `<yyyymmdd>-<task>-<6hex>`
- **baseline**: <sha>
- **任务**: <one line>
- **commit_sha_list**: <shas>
- **compact**: 未发生 / 已恢复（id 不变）
- **观察**: <friction or incidents>
EOF
    echo "✅ Created registration file: $REGISTRY"
  fi
else
  echo "✅ Registration file already present: $REGISTRY"
fi

echo "✅ hooksPath set to $HOOKS_DIR (pre-commit + commit-msg + prepare-commit-msg + reference-transaction active)"
echo "✅ Session-Id gate: strict (trailer + registration enforced)"
echo ""
echo "   Registry:  $REGISTRY"
echo "   Bypass (emergency only): git commit --no-verify"
echo "   Disable registration gate: git config --unset session.provenance"
echo "   Install gitleaks for better secret detection: brew install gitleaks"
