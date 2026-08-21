# Handoff: Source Selector Fix (Code Domain)

**Session**: 2026-08-21
**Commits**: `af75dc4` (source-registry.mjs fixes), `85e39b9` (test updates)
**Spec**: `docs/specs/spec-source-registry-selector-fix.md`
**Issues**: #66 (auto-fallback, updated with test results)

## What was done

3 selector/config bugs in `source-registry.mjs` fixed with full TDD workflow:

1. **XHS extractScript**: `[data-v-*]` (invalid CSS) → `section.note-item` — 10/10 CDP test success
2. **XHS mcpFallback**: `python -m xiaohongshu_mcp_server` (never installed) → `rednote-mcp --stdio` — login works, search times out (upstream)
3. **X cdpFallback**: `div.g, .Gx5Zad, .fP1Qef` (Google redesign broke) → `h3`-based selector — 10/10 CDP test success

## Test coverage

- 119 tests pass (3 updated + 3 new)
- New tests verify: no `[data-v-*]`, has `section.note-item`, `h3` in cdpFallback, no `div.g`, `keywords` (plural) param
- Red phase confirmed: 2 tests failed before update
