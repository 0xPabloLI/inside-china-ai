# 02 — npm script registration + pre-commit hook integration

**What to build:** Register `npm run lint:docs` in package.json scripts, and append a doc-hierarchy check section to `scripts/pre-commit.sh` that triggers only when staged files include `docs/` paths, calls `node scripts/lint-doc-hierarchy.mjs`, blocks commit on FAIL (exit 1), prints warnings on WARN (exit 0), skips entirely if no docs/ files are staged.

**Blocked by:** 01 — Lint script must exist and pass all tests before integrating into the hook.

**Status:** ready-for-agent

- [ ] `package.json` scripts section has `"lint:docs": "node scripts/lint-doc-hierarchy.mjs"`
- [ ] `npm run lint:docs` runs the lint and exits 0 or 1 correctly
- [ ] `scripts/pre-commit.sh` has a new section after secret-scan, before final "All checks passed"
- [ ] New section checks if `git diff --cached --name-only` includes any `^docs/` path; if none, skips
- [ ] If docs/ staged: runs `node scripts/lint-doc-hierarchy.mjs`
- [ ] Exit 1 (FAIL): prints `[pre-commit] BLOCKED: doc-hierarchy FAIL` and exits 1
- [ ] Exit 0 (WARN): prints warnings and continues
- [ ] Exit 0 (PASS): prints `[pre-commit] doc-hierarchy: clean` and continues
- [ ] `command -v node` guard: if node missing, skips with warning (don't block on infrastructure)
- [ ] Manual test: `git add docs/some-file.md && git commit -m "test"` triggers the hook
- [ ] Manual test: `git add src/some-file.ts && git commit -m "test"` does NOT trigger the hook
