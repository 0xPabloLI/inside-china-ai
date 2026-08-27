# Spec: Source Registry Field Rename (Issue #88 Part 1)

> Created: 2026-08-28
> Parent issue: #88 (Part 1 only — Part 2 universal fallback deferred)
> Grill: Round 1 complete, all 9 questions confirmed by user

---

## Problem Statement

Source registry script field names describe extraction strategy (primary/fallback) rather than what they extract (articles/images). `extractScript` extracts articles, `primaryScript` extracts images — their relationship is invisible from the names. `cdpFallback` is misleading: it's specifically Google `site:` search, not a generic CDP fallback. This causes confusion when reading source definitions and writing new ones.

## Solution

Rename 4 field names across the entire codebase to be self-documenting:

| Current | New | What it extracts |
|---------|-----|------------------|
| `extractScript` | `articleScript` | Articles (title + articleUrl + imageUrl) |
| `primaryScript` | `imageScript` | Images (title + imageUrl + type:'image') |
| `fallbackScript` | `imageFallbackScript` | Images fallback (generic img >200px) |
| `cdpFallback` | `googleSiteFallback` | Google site: search articles |

`loginCheckScript` unchanged (already self-documenting).

Scope is **Part 1 only** (mechanical rename). Part 2 (universal Google site: fallback auto-generation) deferred to a follow-up session.

## User Stories

1. As a developer adding a new source, I want field names that describe what they extract, so that I don't confuse articleScript and imageScript.
2. As a developer reading source-registry.mjs, I want `googleSiteFallback` instead of `cdpFallback`, so that I understand it's Google `site:` search not a generic CDP fallback.
3. As a developer maintaining search-sources.mjs, I want `articleScript` instead of `extractScript`, so that the code reads clearly about what is being extracted.
4. As a developer maintaining asset-sourcer.mjs, I want `imageScript` and `imageFallbackScript`, so that the primary/fallback relationship for image extraction is clear.
5. As a developer calling cdp-client.mjs, I want the parameter named `script` not `extractScript`, so that the transport layer doesn't impose domain semantics.
6. As a developer reading capabilities.articles, I want `articleScript` and `googleSiteFallback` there too, so that the SoT (capabilities) is consistent with top-level fields.
7. As a developer reading capabilities.images, I want `imageScript` and `imageFallbackScript` there too, so that the SoT is consistent.
8. As a developer reading docs, I want updated field names in all non-archive documentation, so that docs match code.
9. As a developer reading tests, I want test assertions to use new field names, so that tests verify the actual contract.
10. As a developer running the pipeline, I want the fallback chain to work identically after rename, so that no functional regression occurs.
11. As a developer reading enrichWithCapabilities, I want the capabilities object to use new field names, so that SoT violation is not introduced.
12. As a future developer doing Part 2 (universal fallback), I want field names already renamed, so that auto-generation code reads clearly with `googleSiteFallback`.

## Implementation Decisions

### 1. Rename scope — 4 fields, 6 files

**Source definitions** (`source-registry.mjs`):
- `extractScript` → `articleScript` (~58 occurrences in source defs + 1 in `enrichWithCapabilities`)
- `cdpFallback` → `googleSiteFallback` (x_search source def + `enrichWithCapabilities` + comment header)
- `CDP_IMAGE_CAPABILITIES` entries: `primaryScript` → `imageScript`, `fallbackScript` → `imageFallbackScript` (9 sources × 2 fields = 18 occurrences)

**Capabilities enrichment** (`source-registry.mjs` `enrichWithCapabilities()`):
- `capabilities.articles.extractScript` → `capabilities.articles.articleScript`
- `capabilities.articles.cdpFallback` → `capabilities.articles.googleSiteFallback`
- `capabilities.images.primaryScript` → `capabilities.images.imageScript` (via `CDP_IMAGE_CAPABILITIES` rename)
- `capabilities.images.fallbackScript` → `capabilities.images.imageFallbackScript` (via `CDP_IMAGE_CAPABILITIES` rename)

**Article consumers** (`search-sources.mjs`):
- `cap?.extractScript ?? source.extractScript` → `cap?.articleScript ?? source.articleScript`
- `cap?.cdpFallback ?? source.cdpFallback` → `cap?.googleSiteFallback ?? source.googleSiteFallback`
- `cdpFallback.url` / `cdpFallback.extractScript` → `googleSiteFallback.url` / `googleSiteFallback.articleScript`
- Comment references updated

**Image consumers** (`asset-sourcer.mjs`):
- `source.primaryScript` → `source.imageScript` (or `cap.imageScript`)
- `source.fallbackScript` → `source.imageFallbackScript` (or `cap.imageFallbackScript`)
- `cap.primaryScript` / `cap.fallbackScript` → `cap.imageScript` / `cap.imageFallbackScript`

**Transport layer** (`cdp-client.mjs`):
- `extractFromTab(tabId, extractScript)` parameter → `extractFromTab(tabId, script)`
- JSDoc references updated

**Comment header** (`source-registry.mjs` top comment):
- Field listing updated with new names

### 2. No compat aliases

No backward-compatibility aliases. Internal codebase, no external consumers. Single atomic rename across all files.

### 3. Capabilities.articles SoT consistency

`enrichWithCapabilities()` maps top-level → capabilities. Both levels get renamed simultaneously. Consumers read `cap?.articleScript ?? source.articleScript` (capabilities-first, top-level fallback — same pattern as #67).

### 4. `loginCheckScript` unchanged

Already self-documenting. No rename needed.

### 5. `search-sources.mjs` inline `imageScript` variable

The inline `imageScript` variable in `enrichWithImages` function is NOT renamed. It's a local variable, not a field name. It will be removed by #114 (SVE). Out of scope.

### 6. Docs: non-archive only

~56 non-archive doc references updated. ~100 archive references left as historical record.

### 7. Part 2 deferred

Universal Google `site:` fallback auto-generation is NOT in this spec. It will be done in a follow-up. #88 stays open with "Part 1 ✅, Part 2 pending" in tracker.

## Testing Decisions

### Test seam: existing test files

No new test files needed. Use existing seams:
- `scripts/short-video/__tests__/source-registry-capabilities.test.mjs` — verify field names in source defs + capabilities
- `scripts/short-video/__tests__/asset-sourcer.test.mjs` — verify image capability field names

### What makes a good test

Test external behavior (field names exist on sources and capabilities), not implementation details. The rename is mechanical — tests verify that:
1. Every source with `articleScript` has `capabilities.articles.articleScript`
2. Every source with `googleSiteFallback` has `capabilities.articles.googleSiteFallback`
3. `CDP_IMAGE_CAPABILITIES` entries use `imageScript` / `imageFallbackScript`
4. x_search has `googleSiteFallback` (not `cdpFallback`)
5. No source has old field names (`extractScript`, `cdpFallback`, `primaryScript`, `fallbackScript`)

### Prior art

`source-registry-capabilities.test.mjs` already has tests like "sources with extractScript have capabilities.articles" and "x_search has cdpFallback in capabilities.articles". These tests will be updated to use new field names — same assertions, new names.

## Out of Scope

- Part 2: Universal Google `site:` fallback auto-generation (deferred)
- `loginCheckScript` rename (already self-documenting)
- `search-sources.mjs` inline `imageScript` variable removal (tracked by #114 SVE)
- Archive doc references (~100 in `docs/archive/`)
- Adding new sources (#64)
- API→CDP fallback fix (#66)
- Source type labeling audit (#77)

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `source-registry.mjs` (3143 lines) | Rename ~76 field references: `extractScript`→`articleScript` (58), `cdpFallback`→`googleSiteFallback` (in x_search + enrich + header), `primaryScript`→`imageScript` (9), `fallbackScript`→`imageFallbackScript` (9) | **High** | Largest file in the project. Mechanical find-replace, but any missed reference = source silently excluded (undefined field → 0 results). Mitigated: TDD tests verify no old names remain. |
| `search-sources.mjs` (624 lines) | Rename ~10 references: `extractScript`→`articleScript` (6), `cdpFallback`→`googleSiteFallback` (4) | **Medium** | Core article collection logic. `collectFromCdp` reads `cap?.articleScript ?? source.articleScript` — both sides must rename atomically. Mitigated: atomic rename in one pass. |
| `asset-sourcer.mjs` (2436 lines) | Rename ~6 references: `primaryScript`→`imageScript` (3), `fallbackScript`→`imageFallbackScript` (3) | **Medium** | Image search logic. `searchCdpSource` reads `source.imageScript` / `source.imageFallbackScript`. Mitigated: atomic rename. |
| `cdp-client.mjs` | Rename parameter `extractScript`→`script` (~4 references) | **Low** | Transport layer, no domain semantics. Parameter rename only. |
| `source-registry-capabilities.test.mjs` (521 lines) | Update ~16 assertions to use new field names | **Low** | Tests verify field names — updating them is the TDD "green" step. |
| `asset-sourcer.test.mjs` (2476 lines) | Update ~14 assertions to use new field names | **Low** | Same as above. |
| Non-archive docs/ (~20 references) | Bulk find-replace field names | **Low** | Descriptive docs, not API contracts. Updating for consistency. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| S1 | Source with `articleScript` (was `extractScript`) | `enrichWithCapabilities` maps to `capabilities.articles.articleScript` | Low | Test: every source with `articleScript` has `capabilities.articles.articleScript` |
| S2 | x_search with `googleSiteFallback` (was `cdpFallback`) | `enrichWithCapabilities` maps to `capabilities.articles.googleSiteFallback`; `collectFromSource` reads it at Step 2 | Low | Test: x_search has `googleSiteFallback` in capabilities |
| S3 | Source without `googleSiteFallback` (most sources) | `capabilities.articles.googleSiteFallback` is undefined; Step 2 skipped | Low | Test: sources without googleSiteFallback have undefined in capabilities |
| S4 | `CDP_IMAGE_CAPABILITIES` entry with `imageScript` (was `primaryScript`) | `capabilities.images.imageScript` defined; `searchCdpSource` reads it | Low | Test: all CDP image sources have `imageScript` as string |
| S5 | `CDP_IMAGE_CAPABILITIES` entry with `imageFallbackScript` (was `fallbackScript`) | `capabilities.images.imageFallbackScript` defined; `searchCdpSource` reads it at fallback | Low | Test: all CDP image sources have `imageFallbackScript` as string |
| S6 | API-only source (no `articleScript`) | `capabilities.articles` is undefined; `collectFromCdp` skipped; API layer handles | Low | Existing behavior unchanged — field rename doesn't affect control flow |
| S7 | `collectFromSource` fallback chain after rename | Step 0 (API) → Step 1 (CDP with `articleScript`) → Step 2 (`googleSiteFallback`) → Step 3 (MCP) — same order | Low | Rename doesn't change control flow, only field names |
| S8 | `cdp-client.mjs` `extractFromTab(tabId, script)` | Accepts any script string, executes, returns array — same behavior | Low | Parameter name change only, no logic change |
| S9 | No old field names remain anywhere | `grep -r 'extractScript\|primaryScript\|fallbackScript\|cdpFallback' scripts/short-video/` returns 0 (excluding archive docs) | Low | TDD: test asserting no source has old field names |
| S10 | Pipeline run after rename | `search-sources.mjs --trend` produces same results — all sources still found | Medium | Runtime verify: run pipeline (or cached run) post-rename |
| S11 | `search-sources.mjs` research mode filter | Reads `s.capabilities?.articles?.googleSiteFallback` (was `cdpFallback`) to include fallback-only sources | Low | Test: research mode includes sources with googleSiteFallback |
| S12 | Cross-step contract: source-registry → search-sources | `search-sources.mjs` reads `cap?.articleScript ?? source.articleScript` — both sides renamed atomically | High | Atomic rename in one commit. If mismatched, all CDP sources return 0 results. TDD catches this. |
| S13 | Cross-step contract: CDP_IMAGE_CAPABILITIES → asset-sourcer | `asset-sourcer.mjs` reads `source.imageScript` / `source.imageFallbackScript` — both sides renamed atomically | High | Same as S12. TDD catches. |
| S14 | Docs field name consistency | Non-archive docs use new names; no mix of old and new | Low | Bulk replace; visual review of key docs |
