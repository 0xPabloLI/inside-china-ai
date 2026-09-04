# 01 — Lint Core Checks + DOCS-INDEX Rule

**What to build:** A Node.js script `scripts/lint-doc-hierarchy.mjs` that scans L1 docs (docs/_.md) and L2 docs (docs/research/_.md), checks three rules (DOCS-INDEX consistency, L1 Design Decisions presence, L2 command-line heuristic), prints findings in `rule-id: message (file)` format, and exits 0 (PASS/WARN) or 1 (FAIL). Also add rule 5 to DOCS-INDEX.md Layer Placement Rules requiring inventory sync after doc changes. Export pure check functions for testability.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `scripts/lint-doc-hierarchy.mjs` exists with exported functions: `checkDocsIndexConsistency`, `checkL1DesignDecisions`, `checkL2CommandLines`, `main`
- [ ] `checkDocsIndexConsistency`: scans docs/_.md and docs/research/_.md, reports FAIL if any filename not in DOCS-INDEX.md content
- [ ] `checkL1DesignDecisions`: for each docs/*.md with `docs/research/` or `docs/tiktok/` path reference, reports FAIL if no `## Design Decisions` heading
- [ ] `checkL2CommandLines`: for each docs/research/*.md, counts lines matching `npm run`, `node scripts/`, `git ` patterns; reports WARN if ≥5
- [ ] `main()`: orchestrates all three, prints findings to stderr, exit 0 on PASS/WARN, exit 1 on FAIL
- [ ] DOCS-INDEX.md Layer Placement Rules has a 5th rule: "After creating, moving, or deleting any doc, sync DOCS-INDEX.md"
- [ ] Tests in `scripts/__tests__/lint-doc-hierarchy.test.mjs` with fixtures under `scripts/__tests__/fixtures/doc-hierarchy/`
- [ ] All 15 scenario matrix test cases pass
