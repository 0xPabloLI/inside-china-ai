#!/bin/bash
# =============================================================================
# scripts/session-provision.sh — make a fresh worktree runnable
#
#   bash scripts/session-provision.sh [worktree-path]
#
# A `git worktree add` gets the tracked tree and nothing else. Everything the
# suite needs that git does not carry — installed dependencies, the reference
# voice, and the media the render fixtures load — is missing, and the six
# `npx remotion still` suites fail with `npm error could not determine
# executable to run` (no nested node_modules) or `Could not load <CanvasImage>`
# (no fixture media). That is a false failure: 76 tests red on a clean
# worktree for reasons that have nothing to do with the branch.
#
# What it links or copies, and why each form:
#   - node_modules (root + scripts/short-video + scripts/short-video/remotion)
#     → SYMLINK. Hundreds of MB, read-only in practice, and `npm ci` in the
#       main checkout must stay the single installed copy.
#   - scripts/short-video/voice-samples/ → COPY (884 KB). It is gitignored as a
#       directory, so a copy is invisible to `git status` while a symlink would
#       show up as an untracked entry and make `session:stop` call the worktree
#       dirty.
#   - media referenced by the render fixtures under scripts/short-video/assets/
#     → COPY. The Remotion dev server resolves them through
#       remotion/public/assets → ../../assets and refuses to serve a symlink
#       that escapes the public root, so a symlink here is a silent 404.
#
# Fail-open by design: a worktree with no main checkout next to it (CI, a bare
# clone, a fresh machine) still boots, it just keeps the false failures. Every
# skipped item is named on stderr so the reason is visible, not guessed.
#
# SESSION_NO_PROVISION=1 skips provisioning from session-launcher.sh start.
# =============================================================================
set -euo pipefail

usage() {
  echo "usage: session-provision.sh [worktree-path]   (default: current toplevel)" >&2
}

warn() { echo "   ⚠️  $*" >&2; }

# --- 1. resolve source (main worktree) and target (the worktree to fill) ------
TARGET="${1:-}"
if [ -n "$TARGET" ]; then
  [ -d "$TARGET" ] || { echo "error: not a directory: $TARGET" >&2; usage; exit 1; }
  TARGET=$(cd "$TARGET" && pwd)
else
  TARGET=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "error: not inside a git repository and no path given" >&2
    usage
    exit 1
  }
fi

# The main worktree is the FIRST entry of `git worktree list --porcelain` — the
# checkout that owns the shared .git dir. Deriving it this way (rather than
# dirname of the common dir, or the caller's cwd) keeps the script correct when
# it is invoked from inside a linked worktree.
SRC=$(git -C "$TARGET" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')
[ -n "$SRC" ] || { warn "cannot resolve the main worktree — nothing provisioned"; exit 0; }
SRC=$(cd "$SRC" && pwd)

if [ "$SRC" = "$TARGET" ]; then
  echo "[provision] $TARGET is the main worktree — nothing to do"
  exit 0
fi

echo "[provision] source: $SRC"
echo "[provision] target: $TARGET"

linked=0
copied=0
skipped=0

# --- 2. dependencies: symlink ------------------------------------------------
link_dir() {
  local rel="$1" src="$SRC/$1" dest="$TARGET/$1"
  if [ ! -d "$src" ]; then
    warn "not installed in the main checkout, skipped: $rel"
    skipped=$((skipped + 1))
    return 0
  fi
  if [ -e "$dest" ]; then
    skipped=$((skipped + 1))
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  ln -s "$src" "$dest"
  echo "   🔗 $rel → main checkout"
  linked=$((linked + 1))
}

link_dir node_modules
link_dir scripts/short-video/node_modules
link_dir scripts/short-video/remotion/node_modules

# --- 3. reference voice: copy ------------------------------------------------
copy_dir() {
  local rel="$1" src="$SRC/$1" dest="$TARGET/$1"
  if [ ! -d "$src" ]; then
    warn "absent in the main checkout, skipped: $rel"
    skipped=$((skipped + 1))
    return 0
  fi
  if [ -e "$dest" ]; then
    skipped=$((skipped + 1))
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  cp -R "$src" "$dest"
  echo "   📄 $rel (copy)"
  copied=$((copied + 1))
}

copy_dir scripts/short-video/voice-samples

# --- 4. fixture media: copy --------------------------------------------------
# The list is derived, not hardcoded: every `assets/<file>` a Remotion fixture
# references is resolved under scripts/short-video/assets/. A new fixture picks
# up its media without touching this script; a reference that resolves to a
# tracked file (already in the worktree) is skipped silently.
#
# The one-char prefix in the pattern is load-bearing: without it, a docblock
# mentioning `content/unitree/assets/x.mp4` yields a bogus `assets/x.mp4`
# reference that this machine never had. Only a reference whose preceding
# character is not `/` is a public-assets path.
FIXTURE_REFS=$(
  grep -ohE '.assets/[A-Za-z0-9._-]+\.(jpg|jpeg|png|mp4|webp)' \
    "$TARGET"/scripts/short-video/remotion/src/*fixture*.tsx 2>/dev/null |
    grep -vE '^/' | cut -c2- | sort -u || true
)
if [ -z "$FIXTURE_REFS" ]; then
  warn "no fixture media references found — render suites may still fail"
else
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    src="$SRC/scripts/short-video/$ref"
    dest="$TARGET/scripts/short-video/$ref"
    if [ ! -f "$src" ]; then
      # Tracked media (e.g. content/{slug}/assets/...) is already in the
      # worktree; anything else missing here is a fixture pointing at a file
      # this machine never downloaded.
      [ -f "$dest" ] || warn "referenced but absent in the main checkout: $ref"
      continue
    fi
    if [ -e "$dest" ]; then
      skipped=$((skipped + 1))
      continue
    fi
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    echo "   📄 scripts/short-video/$ref (copy)"
    copied=$((copied + 1))
  done <<< "$FIXTURE_REFS"
fi

echo "[provision] done — $linked linked, $copied copied, $skipped already present"
