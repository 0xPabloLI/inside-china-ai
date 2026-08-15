#!/bin/bash
# =============================================================================
# scripts/install-git-hooks.sh — Install pre-commit hook for secret scanning
#
# Run this once after cloning the repo:
#   bash scripts/install-git-hooks.sh
#
# This creates .git/hooks/pre-commit from scripts/pre-commit.sh
# =============================================================================

set -e

HOOK_SRC="scripts/pre-commit.sh"
HOOK_DST=".git/hooks/pre-commit"

if [ ! -f "$HOOK_SRC" ]; then
  echo "Error: $HOOK_SRC not found. Are you in the repo root?"
  exit 1
fi

if [ ! -d ".git/hooks" ]; then
  echo "Error: .git/hooks not found. Is this a git repo?"
  exit 1
fi

cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"

echo "✅ Pre-commit hook installed to $HOOK_DST"
echo "   The hook scans staged files for secrets using gitleaks (or shell grep fallback)."
echo ""
echo "   To bypass (emergency only): git commit --no-verify"
echo "   Install gitleaks for better detection: brew install gitleaks"
