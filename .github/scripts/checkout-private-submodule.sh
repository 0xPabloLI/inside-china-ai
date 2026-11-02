#!/usr/bin/env bash
# Fetch the private skills/shared submodule before the test suite runs (#466).
#
# Why this exists: .github/workflows/ci.yml used a plain actions/checkout, which
# leaves submodules uninitialised. skills/shared is a private repository, so the
# default GITHUB_TOKEN (scoped to this repository) cannot read it — and an empty
# skills/shared directory makes vitest's `skills/**/*.test.mjs` include match
# nothing. The job goes green while the skill-layer suite never runs, which is
# the exact failure mode #466 is about.
#
# The credential is a fine-grained PAT scoped to shared-skills only
# (contents:read). It is injected through env-based git config for this one
# process tree, so it never lands in .git/config, a credential helper, or the
# log. A missing token is a hard failure, not a skip: silently omitting the
# submodule would restore the "green but untested" state.

set -euo pipefail

if [ -z "${SHARED_SKILLS_TOKEN:-}" ]; then
  echo "::error::SHARED_SKILLS_TOKEN is unavailable (fork PR or missing repository secret)." >&2
  echo "::error::Without it the private skills/shared submodule cannot be checked out," >&2
  echo "::error::so skill-layer tests would silently not run. Failing instead of reporting green." >&2
  exit 1
fi

# `x-access-token` is the username half of GitHub's basic-auth pair for PATs.
AUTH="$(printf 'x-access-token:%s' "$SHARED_SKILLS_TOKEN" | base64 | tr -d '\n')"

GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0="http.https://github.com/.extraheader" \
GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $AUTH" \
  git submodule update --init --recursive
