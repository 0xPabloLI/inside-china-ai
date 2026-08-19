# Handoff: Unified Source Registry Implementation

> **Created**: 2026-08-19
> **From session**: Grilling + Spec + Tickets (spec-unified-source-registry)
> **To**: Fresh session for TDD implementation
> **Parent issue**: #52
> **Tickets**: #53 (T01), #54 (T02), #55 (T03), #56 (T04), #57 (T05), #58 (T06), #59 (T07)

## What was decided

### Core design

1. **Unify source definitions**: `source-registry.mjs` becomes the single source of truth. Each source gets a `capabilities` field declaring what data types it provides (articles, images, videos) and how (CDP scripts, API config, yt-dlp platform). `asset-sourcer.mjs` deletes `API_SOURCES`, `YTDLP_SOURCES`, `CDP_SOURCES` and queries source-registry by capability.

2. **Cross-stage image caching**: Trend discovery's `extractScript` is enhanced to also extract `imageUrl` from the same DOM. Image URLs are stored in `trending-topics.json`. Asset sourcer (Stage 4) checks cached URLs first, filters by keyword match + URL pattern, downloads matches without new CDP requests.

3. **Cascade order fix**: In `analyzeAssets()`, move pre-filter (free) before detectFocus (~0.5s/asset). Currently detectFocus runs on all assets including ones that pre-filter will skip.

4. **Pre-download filter gate**: Run `preFilterCandidate` before downloading. `technicalScore < 20` → skip download entirely.

5. **Lorem Picsum deleted**: Returns random images, cannot pass any filter.

6. **No `role: "fallback"` field**: Stock API sources (Pexels etc.) run in parallel with all other sources. Unified ranking + pre-download filter naturally handles quality. Serializing for fallback semantics would be slower.

### ADR updates needed

- ADR-0013: Revise "asset-sourcer uses a separate set of sources" → unified
- ADR-0016: Add 4th "Already applied" point — cross-stage signal reuse
- CONTEXT.md: Update "Source Registry" definition, add "Capabilities" term

## Key files

- `scripts/short-video/lib/source-registry.mjs` — 1932 lines, 46 sources, to be expanded to ~53 with capabilities
- `scripts/short-video/lib/asset-sourcer.mjs` — 2158 lines, has API_SOURCES (7), YTDLP_SOURCES (5), CDP_SOURCES (9), to be deleted and replaced with source-registry imports
- `scripts/short-video/lib/trends-utils.mjs` — buildOutputJson needs `images` field
- `scripts/short-video/search-sources.mjs` — 489 lines, extractScript consumer
- `scripts/short-video/lib/visual-analyzer.mjs` — 640 lines, VLM + focus detection
- `docs/adr/0013-asset-sourcing-three-layer.md` — to be revised
- `docs/adr/0016-cascade-filtering-signal-density.md` — to be updated

## Test files

- `__tests__/source-registry.test.mjs` — ~30 tests, structural validation, count assertions
- `__tests__/asset-sourcer.test.mjs` — ~100 tests, imports API_SOURCES/YTDLP_SOURCES/CDP_SOURCES directly
- `__tests__/asset-sourcer-visual-integration.test.mjs` — ~8 tests, mocks visual-analyzer
- `__tests__/trends-utils.test.mjs` — ~20 tests, buildOutputJson

## Ticket execution order

```
#53 (T01 capabilities) — no blockers, start here
  ├─ #54 (T02 asset-sourcer imports) — blocked by #53
  │    ├─ #56 (T04 cached-image flow) — blocked by #54 + #55
  │    ├─ #57 (T05 pre-download filter) — blocked by #54
  │    └─ #58 (T06 cascade order fix) — blocked by #54
  └─ #55 (T03 extractScript imageUrl) — blocked by #53
       └─ (feeds into #56)

#59 (T07 ADR docs) — blocked by #54 + #55 + #58
```

Frontier (can start immediately): #53 only.
After #53: #54 and #55 can run in parallel.
After #54: #56, #57, #58 can run in parallel.
After #54 + #55 + #58: #59.

## Grilling decisions reference

13 questions across 2 rounds, all settled:
- Q1: Full merge (A)
- Q2: Stock APIs join registry (A)
- Q3: Both thumbnail + detail-page extraction (C)
- Q4: VLM only in Stage 4 (C)
- Q5: Update ADR-0016 + revise ADR-0013 (B)
- Q6: Cascade fix included, marked as附带修复 (C)
- Q7: Pre-download filter, threshold 20 (A)
- Q8: Keyword match + URL pattern filter (A+C)
- Q9: All confirmed
- Q10: No role field, parallel + unified sort (A)
- Q11: Delete Lorem Picsum (A)
- Q12: Single file ~53 sources (A)
- Q13: No special标注 for stock APIs

## Spec location

`docs/specs/spec-unified-source-registry.md`

## Next step

Start TDD implementation from ticket #53 (T01). Follow AGENTS.md Step 4-9.
