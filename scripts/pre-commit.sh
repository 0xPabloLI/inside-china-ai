#!/bin/bash
# =============================================================================
# pre-commit hook: Secret scanning (gitleaks + shell grep fallback)
#
# Blocks commits containing real secrets. Allows publishable keys and test fixtures.
#
# Bypass (emergency only):  git commit --no-verify
# (only use when you're 100% sure the flagged content is safe, then document why)
# =============================================================================

set -e

# --- Colors ---
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[pre-commit] Running secret scan...${NC}"

# --- Get staged files ---
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -vE '\.(lock|svg|png|jpg|jpeg|gif|webp|mp4|mp3|wav|pdf|woff2?|ttf|ico)$' || true)

if [ -z "$STAGED_FILES" ]; then
  echo -e "${GREEN}[pre-commit] No text files to scan, skipping.${NC}"
  exit 0
fi

# --- Method 1: gitleaks (primary) ---
if command -v gitleaks &>/dev/null; then
  # Scan only staged changes (not entire repo history)
  if ! gitleaks protect --staged --config .gitleaks.toml --no-banner 2>&1; then
    echo ""
    echo -e "${RED}[pre-commit] BLOCKED: gitleaks detected potential secrets!${NC}"
    echo -e "${YELLOW}If this is a false positive:${NC}"
    echo "  1. Add the value/pattern to .gitleaks.toml allowlist"
    echo "  2. Re-stage and commit again"
    echo ""
    echo -e "${YELLOW}If you're 100% sure it's safe (emergency only):${NC}"
    echo "  git commit --no-verify"
    echo ""
    exit 1
  fi
  echo -e "${GREEN}[pre-commit] gitleaks: clean${NC}"
else
  echo -e "${YELLOW}[pre-commit] gitleaks not found, using shell grep fallback${NC}"

  # --- Method 2: shell grep fallback ---
  # Pattern list: real secret patterns that should NEVER be committed
  PATTERNS=(
    # Supabase service_role / secret keys (publishable is allowed)
    'sb_secret_[A-Za-z0-9]{20,}'
    # Supabase JWT (not the test fixture)
    'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
    # HuggingFace tokens
    'hf_[A-Za-z0-9]{30,}'
    # OpenAI keys
    'sk-[A-Za-z0-9]{40,}'
    # HeyGen (sk_V2_ prefix)
    'sk_V2_[A-Za-z0-9_]{20,}'
    # D-ID keys (base64-like with colon)
    '[A-Za-z0-9]{20,}:[A-Za-z0-9_-]{20,}'
    # Lightning AI API keys (UUID format)
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    # Pexels
    'PEXELS_API_KEY=[A-Za-z0-9]{30,}'
    # Unsplash
    'UNSPLASH_ACCESS_KEY=[A-Za-z0-9]{30,}'
    # Pixabay
    'PIXABAY_API_KEY=[0-9]{8,}-[A-Za-z0-9]{20,}'
    # Coverr
    'COVERR_API_KEY=[A-Za-z0-9]{20,}'
    # ScrapeCreators
    'SCRAPECREATORS_API_KEY=[A-Za-z0-9]{20,}'
    # Supabase refresh tokens
    'SUPABASE_REFRESH_TOKEN=["'"'"']?[A-Za-z0-9]{10,}'
    # Admin passwords
    'ADMIN_PASSWORD=["'"'"']?[A-Za-z0-9%#*]{8,}'
    # Tailscale full IPs (100.x.x.x with real octets)
    '100\.(64|71|114)\.\d{1,3}\.\d{1,3}'
    # Windows machine names
    'PC-\d{8}[A-Z]+'
  )

  FOUND=0
  for file in $STAGED_FILES; do
    # Skip test files, examples, and .env (publishable key is safe)
    if echo "$file" | grep -qE '\.test\.|\.spec\.|\.env\.example|\.env\.local\.example|__tests__/'; then
      continue
    fi

    # Get staged content only (not full file)
    CONTENT=$(git diff --cached -- "$file" | grep '^+' | grep -v '^+++' || true)

    for pattern in "${PATTERNS[@]}"; do
      if echo "$CONTENT" | grep -qE "$pattern"; then
        MATCH=$(echo "$CONTENT" | grep -oE "$pattern" | head -1)
        echo -e "${RED}[pre-commit] BLOCKED: Potential secret in $file${NC}"
        echo -e "  Pattern matched: $pattern"
        echo -e "  Match: ${MATCH:0:40}..."
        FOUND=1
      fi
    done
  done

  if [ "$FOUND" -eq 1 ]; then
    echo ""
    echo -e "${YELLOW}If this is a false positive:${NC}"
    echo "  1. Add the pattern to .gitleaks.toml allowlist"
    echo "  2. Or install gitleaks: brew install gitleaks"
    echo ""
    echo -e "${YELLOW}If you're 100% sure it's safe (emergency only):${NC}"
    echo "  git commit --no-verify"
    echo ""
    exit 1
  fi

  echo -e "${GREEN}[pre-commit] shell grep: clean${NC}"
fi

# --- Method 3: .env.local guard (always check) ---
# Ensure .env.local is never staged (in case .gitignore is bypassed)
if git diff --cached --name-only | grep -qE '^\.env\.local$'; then
  echo -e "${RED}[pre-commit] BLOCKED: .env.local is staged!${NC}"
  echo -e "${YELLOW}This file contains real secrets. Unstage it:${NC}"
  echo "  git reset HEAD .env.local"
  exit 1
fi

echo -e "${GREEN}[pre-commit] All checks passed.${NC}"

# --- Method 4: Doc hierarchy lint (only when docs/ files are staged) ---
DOCS_STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^docs/' || true)
if [ -n "$DOCS_STAGED" ]; then
  if command -v node &>/dev/null; then
    echo -e "${YELLOW}[pre-commit] Running doc-hierarchy lint...${NC}"
    if ! node scripts/lint-doc-hierarchy.mjs 2>&1; then
      echo ""
      echo -e "${RED}[pre-commit] BLOCKED: doc-hierarchy FAIL${NC}"
      echo -e "${YELLOW}Fix the issues above, then re-stage and commit.${NC}"
      echo -e "${YELLOW}If you're sure it's a false positive (emergency only):${NC}"
      echo "  git commit --no-verify"
      exit 1
    fi
    echo -e "${GREEN}[pre-commit] doc-hierarchy: clean${NC}"
  else
    echo -e "${YELLOW}[pre-commit] node not found, skipping doc-hierarchy check.${NC}"
  fi
fi
