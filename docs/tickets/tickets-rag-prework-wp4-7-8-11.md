# Tickets: RAG Pre-Work — WP-4/7/8/11 + Slug Fixes

> Spec: `docs/specs/spec-rag-prework-wp4-7-8-11.md`
> Prerequisite: `docs/rag-prework.md`

---

## T-1: Fix slug inconsistencies (Pre-task)

**Type**: Data fix
**Depends on**: None
**Blocks**: T-2 (WP-4 needs correct slugs for entity extraction), T-3 (WP-7 frontmatter)

### Tasks

1. Update Supabase DB: `UPDATE posts SET slug = 'deepseek-art-of-restraint' WHERE slug = 'deepseek-leaked-investor-meeting'`
2. Update `scripts/short-video/content/distillation/pt1/meta.mjs`: `article: "china-llm-distillation-scandal"` → `"china-llm-distillation-storm"`
3. Update `scripts/short-video/content/distillation/pt2/meta.mjs`: same fix
4. Update `scripts/short-video/content/distillation/pt3/meta.mjs`: same fix
5. Verify: query DB to confirm slug change; run `verify-video.mjs --pre` on distillation content

---

## T-2: WP-4 — Entity Registry

**Type**: New file (pure documentation)
**Depends on**: T-1 (correct slugs for entity extraction)
**Blocks**: T-3 (WP-7 needs entity IDs)

### Tasks

1. Scan all content (3 articles, 13 widget data files, 3 source materials, 7 scene-data) for entities
2. Create `docs/refs/entity-registry.yaml` with companies, people, models sections
3. Each entity: `name`, `aliases[]`, category-specific fields
4. Entity ID convention: snake_case
5. Verify: all entity IDs referenced in later tickets exist in registry

---

## T-3: WP-7 — Article Frontmatter Extension

**Type**: Modify 3 existing files
**Depends on**: T-2 (entity IDs from registry)

### Tasks

1. `articles/deepseek-art-of-restraint.md`: add `topics`, `entities`, `sources` to frontmatter
2. `articles/china-llm-distillation-scandal.md`: add `topics`, `entities`, `sources` to frontmatter
3. `articles/bytedance-zhang-yiming-no-distillation.md`: add `topics`, `entities`, `sources` to frontmatter
4. Verify: `npm run lint && npx tsc --noEmit && npm run build` pass
5. Verify: entity IDs in frontmatter match entity-registry.yaml

---

## T-4: WP-8 — TikTok PDF Structuring

**Type**: New file (pure documentation)
**Depends on**: None (parallel with T-2/T-3)

### Tasks

1. Read PDF: `docs/refs/tiktok-skills/raw/2026-08-05-自媒体实战方法论(1).pdf`
2. Extract content to structured markdown with `##` sections
3. Write to `docs/refs/tiktok-skills/content-methodology.md`
4. Include source attribution and all 8 outline sections
5. Verify: output has multiple `##` headings for RAG chunking

---

## T-5: WP-11 — Golden Query Evaluation Set

**Type**: New file (pure documentation)
**Depends on**: None (parallel with T-2/T-3/T-4)

### Tasks

1. Review all indexed content (3 articles, 7 scene-data, 3 source materials, 1 research report, ~27 TikTok reference files)
2. Create `docs/refs/rag-eval/golden-queries.yaml` with 15-20 queries
3. Include 4 required use case types: cross-language, entity alias, data point, negative
4. Verify: all `expected_sources` map to actual files
5. Verify: YAML is valid

---

## Dependency Graph

```
T-1 (slug fixes) ──→ T-2 (WP-4 entity registry) ──→ T-3 (WP-7 frontmatter)
                                              ↗
T-4 (WP-8 TikTok PDF) ─────────────────────────/
                                              ↗
T-5 (WP-11 golden queries) ───────────────────/
```

T-4 and T-5 are independent and can be done in parallel with T-2/T-3.
