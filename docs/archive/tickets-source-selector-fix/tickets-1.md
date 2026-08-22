# Ticket 1: Update tests for source-registry selector & mcpFallback fixes

**Spec**: `docs/specs/spec-source-registry-selector-fix.md`
**Depends on**: none (source-registry.mjs already fixed in commit af75dc4)
**Blocks**: none

## Checklist

- [x] Run existing tests to confirm 3 failures (red phase) — 2 failed (vitest short-circuits within same test)
- [x] Update 3 existing assertions for XHS mcpFallback config change
  - L557: `command` from `"python"` → `"rednote-mcp"`
  - L558: `toolName` from `"search_feeds"` → `"search_notes"`
  - L601-602: `args.keyword` → `args.keywords`
- [x] Add new test: XHS extractScript doesn't contain `[data-v-*]`, contains `section.note-item`
- [x] Add new test: XHS mcpFallback toolArgs returns `keywords` key (plural)
- [x] Add new test: X cdpFallback extractScript contains `h3`, doesn't contain `div.g`
- [x] All tests pass (green phase) — 119/119 passed
- [x] No refactor needed — tests are straightforward assertions
