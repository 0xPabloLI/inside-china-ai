#!/usr/bin/env bash
#
# setup-skills.sh — Link project-local skills into each agent's skills/ directory.
#
# This repo ships 3 custom skills in /skills/ (brand-system, short-video-pipeline,
# web-deep-research). Agent tools only discover skills from their own configured
# directories (.agents/skills/, .cursor/skills/, .claude/skills/, agent/skills/),
# and those directories are .gitignored. This script creates symlinks so every
# agent picks up the project-local skills after a fresh clone.
#
# Usage:
#   bash scripts/setup-skills.sh          # link all skills
#   bash scripts/setup-skills.sh --unlink  # remove symlinks
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"

# Agent skill directories that are .gitignored but actively used at runtime
AGENT_DIRS=(
  "$REPO_ROOT/.agents/skills"
  "$REPO_ROOT/.cursor/skills"
  "$REPO_ROOT/.claude/skills"
  "$REPO_ROOT/agent/skills"
)

# Skills that live in this repo (edit when adding a new custom skill)
CUSTOM_SKILLS=(
  brand-system
  short-video-pipeline
  web-deep-research
)

ACTION="${1:-link}"

case "$ACTION" in
  --unlink)
    for dir in "${AGENT_DIRS[@]}"; do
      for skill in "${CUSTOM_SKILLS[@]}"; do
        target="$dir/$skill"
        if [ -L "$target" ]; then
          rm "$target"
          echo "  removed  $target"
        fi
      done
    done
    echo "Symlinks removed."
    ;;
  link|"")
    for dir in "${AGENT_DIRS[@]}"; do
      mkdir -p "$dir"
      for skill in "${CUSTOM_SKILLS[@]}"; do
        target="$dir/$skill"
        source="$SKILLS_SRC/$skill"
        # Remove broken or existing symlink, or warn if real dir
        if [ -L "$target" ]; then
          rm "$target"
        elif [ -d "$target" ]; then
          echo "  WARN: $target is a real directory, skipping (remove manually if needed)"
          continue
        fi
        ln -s "$source" "$target"
        echo "  linked   $target → $source"
      done
    done
    echo "Symlinks created for ${#CUSTOM_SKILLS[@]} skills across ${#AGENT_DIRS[@]} agent dirs."
    ;;
  *)
    echo "Usage: bash scripts/setup-skills.sh [--unlink]"
    exit 1
    ;;
esac
