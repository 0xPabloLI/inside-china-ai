# Spec: Documentation Hierarchy Lint — Automated Layer Compliance

> Created: 2026-08-16
> Based on: Grill session (Round 1 + Round 2)
> Status: Ready for implementation

## Problem Statement

The project's documentation hierarchy (L0-L3) is defined in `docs/DOCS-INDEX.md` with Layer Placement Rules, but there is no automated enforcement. When an Agent creates or modifies docs without updating DOCS-INDEX, or when an L1 doc lacks a Design Decisions & References section despite having L2 references, nothing catches the drift. The rules are soft constraints — they work only when the Agent remembers to follow them.

## Solution

Three layered defenses forming a "rules → verify → block" chain:

1. **Rule** (DOCS-INDEX.md): A new Layer Placement Rule requiring DOCS-INDEX sync after doc changes
2. **Verify** (lint script): A Node.js script that checks DOCS-INDEX consistency, L1 Design Decisions presence, and L2 execution-instruction heuristics
3. **Block** (pre-commit hook): The existing pre-commit shell script calls the lint when staged files include `docs/` paths; FAIL blocks commit, WARN prints but allows

## User Stories

1. As an agent creating a new doc under `docs/`, I want the lint to tell me if I forgot to add it to DOCS-INDEX, so that the inventory stays complete.
2. As an agent modifying an L1 doc, I want the lint to warn me if I added L2 references without a Design Decisions & References section, so that L1 docs always have proper pointers to L2.
3. As an agent writing an L2 research doc, I want the lint to warn me if I accidentally wrote execution instructions (command lines), so that L2 stays research-focused.
4. As a developer committing doc changes, I want the pre-commit hook to block my commit if DOCS-INDEX is out of sync, so that the inventory can never silently go stale.
5. As a developer committing doc changes, I want WARN-level findings to print but not block my commit, so that I can use my judgement on edge cases.
6. As an agent or developer, I want to run the lint manually with `npm run lint:docs`, so that I can check doc hierarchy compliance before committing.
7. As a project maintainer, I want the lint to only trigger in pre-commit when staged files include `docs/` paths, so that code-only commits are not slowed down.
8. As an agent reading DOCS-INDEX Layer Placement Rules, I want a rule that says "sync DOCS-INDEX after doc changes", so that I remember to update the inventory.
9. As a developer, I want the lint to only check L1 (docs/ root .md files) and L2 (docs/research/ .md files), so that handoffs/, refs/, and archive/ are not flagged.
10. As an agent, I want the lint output to use a clear three-state format (PASS / WARN / FAIL), so that I can distinguish hard violations from soft suggestions.
11. As a developer, I want the lint to check command-line patterns (`npm run`, `node scripts/`, `git` commands) in L2 docs with a threshold of ≥5, so that research docs with 1-2 command references are not false-flagged.
12. As a developer, I want the pre-commit hook to run a full DOCS-INDEX consistency scan (not just staged files), so that a partial commit doesn't leave the inventory in an inconsistent state.

## Implementation Decisions

### D1: DOCS-INDEX Layer Placement Rule addition

Add a 5th rule to the Layer Placement Rules section in `docs/DOCS-INDEX.md`:

> **After creating, moving, or deleting any doc**: sync `docs/DOCS-INDEX.md` — add/remove/rename the corresponding table row.

This is a one-liner addition to the existing 4 rules. It lives in DOCS-INDEX (on-demand loaded), not in AGENTS.md (always-loaded), to avoid inflating context load.

### D2: Lint script — `scripts/lint-doc-hierarchy.mjs`

A pure-function module exporting check functions. The script:

- **Takes no parameters** — scans `docs/` and `docs/DOCS-INDEX.md` relative to the project root (resolved from `import.meta.url`).
- **Output**: prints findings to stderr in `rule-id: message (file)` format, one per line. Final summary line: `[doc-hierarchy] PASS | WARN (N) | FAIL (N)`.
- **Exit codes**: 0 = PASS or WARN, 1 = FAIL.

Three checks:

1. **DOCS-INDEX consistency** (FAIL): For each `.md` file in `docs/` root and `docs/research/`, verify its filename appears in `docs/DOCS-INDEX.md`. Missing = FAIL with `docs-index-missing: <filename> not listed in DOCS-INDEX.md`.
2. **L1 Design Decisions** (conditional FAIL): For each `.md` file in `docs/` root that contains a `docs/research/` or `docs/tiktok/` path reference, verify it has a `## Design Decisions` heading. Missing = FAIL with `l1-missing-design-decisions: <filename> references L2 but has no Design Decisions section`.
3. **L2 command-line heuristic** (WARN): For each `.md` file in `docs/research/`, count lines matching command patterns (`npm run`, `node scripts/`, `git `). ≥5 matches = WARN with `l2-execution-instructions: <filename> has N command-line references (≥5 threshold)`.

Checked directories:
- L1 = `docs/*.md` (root-level only, not recursing into subdirectories)
- L2 = `docs/research/*.md` (research only)

Not checked: `docs/handoffs/`, `docs/refs/`, `docs/archive/`, `docs/conventions/`, `docs/tiktok/`, `docs/adr/`, `docs/video/`, `docs/agents/`.

### D3: npm script registration

Add to `package.json` scripts:

```json
"lint:docs": "node scripts/lint-doc-hierarchy.mjs"
```

### D4: Pre-commit hook integration

Append to `scripts/pre-commit.sh`, after the existing secret-scan logic, before the final "All checks passed" line:

- Check if any staged file matches `^docs/`. If none, skip.
- If yes, run `node scripts/lint-doc-hierarchy.mjs`.
- If exit code 1 (FAIL): block commit with message.
- If exit code 0 with WARN output: print warnings, allow commit.
- If exit code 0 with no findings: print `[pre-commit] doc-hierarchy: clean`.

### D5: Module structure

The lint script exports pure functions for testability:

- `checkDocsIndexConsistency(docsDir, indexContent)` → `{ findings }`
- `checkL1DesignDecisions(l1Files)` → `{ findings }` where `l1Files` is `[{ filename, content }]`
- `checkL2CommandLines(l2Files)` → `{ findings }` where `l2Files` is `[{ filename, content }]`
- `main()` → orchestrates the three checks, prints output, sets exit code

## Testing Decisions

### Test seam

The check functions are pure functions taking file content strings and returning finding objects. Tests use fixture directories under `scripts/__tests__/fixtures/doc-hierarchy/` with controlled file structures — no dependency on the real `docs/` directory.

### What makes a good test

- Test external behavior (what findings are produced), not implementation details (how files are read).
- Each test creates a minimal fixture that triggers exactly one finding type.
- Prior art: `scripts/rag/__tests__/chunker.test.mjs` — pure function tests with controlled inputs.

### Test cases (from scenario matrix)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | L1 doc in DOCS-INDEX | PASS |
| 2 | L1 doc NOT in DOCS-INDEX | FAIL |
| 3 | L1 doc with L2 ref + has Design Decisions | PASS |
| 4 | L1 doc with L2 ref + no Design Decisions | FAIL |
| 5 | L1 doc without L2 ref + no Design Decisions | PASS |
| 6 | L2 doc with 0 command lines | PASS |
| 7 | L2 doc with 3 command lines | PASS (below threshold) |
| 8 | L2 doc with 5 command lines | WARN |
| 9 | L2 doc with 10 command lines | WARN |
| 10 | Empty docs/ directory | PASS |
| 11 | DOCS-INDEX with file in handoffs/ (not checked) | PASS |
| 12 | L1 doc with `docs/tiktok/` ref + no Design Decisions | FAIL |
| 13 | Multiple findings in one run | All reported |
| 14 | Exit code = 0 when only WARNs | PASS |
| 15 | Exit code = 1 when any FAIL | FAIL |

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `docs/DOCS-INDEX.md` | Add rule 5 to Layer Placement Rules | Low | Pure addition, one line. No existing rules modified. |
| `scripts/lint-doc-hierarchy.mjs` | New file | Low | New file, no existing consumers. |
| `scripts/__tests__/lint-doc-hierarchy.test.mjs` | New file | Low | New test file. |
| `scripts/__tests__/fixtures/doc-hierarchy/` | New fixture directory | Low | Test fixtures only. |
| `package.json` | Add `lint:docs` script entry | Low | Pure addition to scripts section. |
| `scripts/pre-commit.sh` | Append doc-hierarchy check section | Medium | Modifying existing hook. If the hook breaks, all commits are blocked. Mitigation: the new section is additive (after existing checks, before final echo), wrapped in its own if/then, and tested. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Agent creates `docs/research/new-topic.md`, forgets DOCS-INDEX | Lint FAILs: `docs-index-missing: new-topic.md` | Agent skips lint | Pre-commit hook blocks commit |
| 2 | Agent creates `docs/research/new-topic.md`, adds to DOCS-INDEX | Lint PASSes | — | — |
| 3 | Agent adds `docs/research/` ref to `docs/content-pipeline.md`, no Design Decisions | Lint FAILs: `l1-missing-design-decisions` | Agent already has the section (added in prior work) | Existing section satisfies check |
| 4 | Agent writes L2 doc with 6 `npm run` lines | Lint WARNs but allows commit | WARN ignored | Pre-commit prints warning, Agent can self-review |
| 5 | Agent writes L2 doc with 2 `node scripts/` lines | Lint PASSes (below threshold) | — | — |
| 6 | Commit with no `docs/` files staged | Pre-commit skips doc-hierarchy check | — | `grep -q '^docs/'` gate |
| 7 | Commit with `docs/research/foo.md` staged | Pre-commit runs full scan | Full scan is slow on large repos | docs/ is small (~30 files), scan takes <100ms |
| 8 | Pre-commit hook itself errors (node not found) | Hook should not block commit on infrastructure failure | Node not installed | Use `command -v node` guard; if missing, skip with warning |
| 9 | DOCS-INDEX has file listed as `research/foo.md` but actual file is `docs/research/foo.md` | Lint matches by filename, not path — should match | False positive | Use `includes(filename)` matching, not path matching |
| 10 | L1 doc has `docs/tiktok/` reference but no Design Decisions | Lint FAILs (tiktok/ counts as L2 ref) | — | Rule applies to both research/ and tiktok/ |
| 11 | `docs/handoffs/foo.md` exists, not in DOCS-INDEX | Lint does not check handoffs/ | — | Only docs/*.md and docs/research/*.md are scanned |
| 12 | Multiple FAILs in one run | All FAILs printed, exit 1 | — | Findings array accumulated, all reported at end |

## Out of Scope

- Modifying `writing-for-agents` skill itself (generic skill, not project-local)
- Checking L2 docs for execution instructions beyond command-line patterns (too heuristic)
- Auto-fixing DOCS-INDEX (too risky for table formatting)
- Checking `docs/tiktok/`, `docs/conventions/`, `docs/adr/`, `docs/handoffs/`, `docs/refs/`, `docs/archive/`, `docs/video/`, `docs/agents/` for Design Decisions or command lines
- Checking AGENTS.md content (L0 is out of scope for this lint)
- `content-pipeline.md` size reduction (already marked Out of Scope in prior spec)

## Further Notes

- The lint script is intentionally simple — ~100 lines of Node.js, no dependencies, no CLI framework. It reads files with `node:fs` and matches with `includes()` / regex.
- The command-line threshold (≥5) is an empirical value. Current L2 docs have 0-2 command lines. If this changes, the threshold can be adjusted in the script.
- The DOCS-INDEX consistency check uses filename matching (not path matching) because DOCS-INDEX has multiple tables (Root, research/, tiktok/, etc.) and a file's filename appearing in any table counts as "listed".
- The `writing-for-agents` skill's principle "The environment is a source of truth too" applies here: the lint script reads the actual filesystem as source of truth and checks DOCS-INDEX as a cache of that truth.
