# Spec: RAG Pre-Work — WP-4/7/8/11 + Slug Fixes

> GitHub Issue: [#15 — feat: RAG pipeline for content knowledge base](https://github.com/0xPabloLI/inside-china-ai/issues/15)
> Prerequisite doc: `docs/rag-prework.md`
> Grilling: 2026-08-08, Round 1 (3 questions, all answered)
> Status: **Ready for implementation**

---

## 1. Overview

Execute 4 RAG pre-work packages (WP-4, WP-7, WP-8, WP-11) plus a pre-task to fix slug inconsistencies discovered during grilling.

### 1.1 Execution Order

1. **Pre-task**: Fix slug inconsistencies (DB + scene-data)
2. **WP-4**: Entity registry (prerequisite for WP-7)
3. **WP-7**: Article frontmatter extension (depends on WP-4)
4. **WP-8**: TikTok PDF structuring (independent)
5. **WP-11**: Golden query evaluation set (independent, depends on WP-10 ✅)

---

## 2. Pre-task: Slug Consistency Fixes

### 2.1 Problem

| Article | File slug | DB slug | Scene-data article | Issue |
|---------|----------|---------|-------------------|-------|
| DeepSeek | `deepseek-art-of-restraint` | `deepseek-leaked-investor-meeting` | `deepseek-art-of-restraint` | DB has stale slug |
| Distillation | `china-llm-distillation-storm` | `china-llm-distillation-storm` | `china-llm-distillation-scandal` | Scene-data mismatches |
| ByteDance | `bytedance-zhang-yiming-no-distillation` | same | same | ✅ OK |

### 2.2 Fix

1. **DB**: `UPDATE posts SET slug = 'deepseek-art-of-restraint' WHERE slug = 'deepseek-leaked-investor-meeting'`
2. **Scene-data**: Update `article` field in `distillation/pt1/meta.mjs`, `pt2/meta.mjs`, `pt3/meta.mjs` from `china-llm-distillation-scandal` to `china-llm-distillation-storm`

---

## 3. WP-4: Entity Registry

### 3.1 Output

`docs/refs/entity-registry.yaml`

### 3.2 Content

Entities extracted from existing content (3 articles, 7 scene-data, 3 source materials, 13 widget data files). Three categories:
- **companies**: DeepSeek, ByteDance, Moonshot, MiniMax, Alibaba, Baidu, Huawei, Tencent, OpenAI, Anthropic, Google, xAI, Xiaomi, Zhipu
- **people**: Liang Wenfeng, Zhang Yiming, Yang Zhilin, etc.
- **models**: DeepSeek V3/R1/V4-Flash/V4-Pro, Seed 2 Pro/Evolving, Kimi K3, etc.

Each entity has: `name`, `aliases[]`, and category-specific fields.

### 3.3 Entity ID Convention

snake_case: `deepseek`, `liang_wenfeng`, `deepseek_r1`

---

## 4. WP-7: Article Frontmatter Extension

### 4.1 Modified Files

| File | Changes |
|------|---------|
| `articles/deepseek-art-of-restraint.md` | Add `topics`, `entities`, `sources` to frontmatter |
| `articles/china-llm-distillation-scandal.md` | Add `topics`, `entities`, `sources` to frontmatter |
| `articles/bytedance-zhang-yiming-no-distillation.md` | Add `topics`, `entities`, `sources` to frontmatter |

### 4.2 Field Format (must match spec-rag.md §2.3)

```yaml
topics: ["deepseek", "funding", "agi"]           # lowercase
entities:
  companies: ["deepseek", "nvidia"]               # snake_case IDs from WP-4
  people: ["liang_wenfeng"]
  models: ["deepseek_v3", "deepseek_r1"]
sources:
  - type: "pdf"
    file: "docs/refs/source-materials/deepseek-liang-investor-meeting-research.md"
  - type: "url"
    url: "https://..."
```

### 4.3 Compatibility

- `gray-matter` ignores unknown fields (verified 2026-08-07)
- `publish-article.mjs` `buildPostPayload` only maps `title/slug/excerpt/content/published`
- New fields do NOT enter Supabase posts table
- Markdown file is the source of truth for RAG metadata (D3 data flow constraint)

---

## 5. WP-8: TikTok PDF Structuring

### 5.1 Input

`docs/refs/tiktok-skills/raw/2026-08-05-自媒体实战方法论(1).pdf` (683KB, ~5368 lines)

### 5.2 Output

`docs/refs/tiktok-skills/content-methodology.md`

### 5.3 Content Outline

1. 品类战略（A/B/C 品类）
2. 四层叙事公式（钩子 → 共情 → 获得感 → 升华）
3. Hook 公式和案例
4. 内容节奏控制技巧
5. 账号冷启动策略
6. 其他品类方法（B: 社区短剧, C: 播客对谈）
7. 发布频率和时机
8. 评论区运营

### 5.4 Format

Structured markdown with `##` sections (for RAG chunking by heading). Include source attribution.

---

## 6. WP-11: Golden Query Evaluation Set

### 6.1 Output

`docs/refs/rag-eval/golden-queries.yaml`

### 6.2 Content

15-20 golden queries with expected source matches. Must include:

1. **Cross-language retrieval** (EN query → CN source chunk; CN query → EN article chunk)
2. **Entity alias** (「梁文锋」→ "Liang Wenfeng" article)
3. **Data point retrieval** (specific numbers: funding amounts, token prices)
4. **Negative cases** (topics not in knowledge base → low similarity/empty)

### 6.3 Pass Criterion

top-5 hit rate ≥ 80% (for RAG implementation phase, not this pre-work)

---

## 7. Scenario & Risk Verification Matrix

### 7.1 Modified Files Impact

| File | Modification | Risk | Mitigation |
|------|-------------|------|------------|
| `articles/deepseek-art-of-restraint.md` | Frontmatter only (add fields) | Low — gray-matter ignores unknown fields | Verified 2026-08-07 |
| `articles/china-llm-distillation-scandal.md` | Frontmatter only (add fields) | Low — same as above | Same |
| `articles/bytedance-zhang-yiming-no-distillation.md` | Frontmatter only (add fields) | Low — same as above | Same |
| `scripts/short-video/content/distillation/pt1/meta.mjs` | `article` field value change | Low — meta.mjs is metadata only | Verify scene-data still loads |
| `scripts/short-video/content/distillation/pt2/meta.mjs` | `article` field value change | Low — same | Same |
| `scripts/short-video/content/distillation/pt3/meta.mjs` | `article` field value change | Low — same | Same |
| Supabase `posts` table | slug update for 1 record | Medium — changes URL | Old slug redirects not needed (low traffic); article already published under new slug in frontmatter |

### 7.2 Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk Level | Test Method |
|---|----------|-------------------|------------|-------------|
| S1 | Frontmatter with new fields → `publish-article.mjs` | New fields ignored; only title/slug/excerpt/content/published synced to DB | Low | Run `npx tsc --noEmit` + verify build |
| S2 | Scene-data meta.mjs with updated article slug | Scene-data loads correctly; `verify-video.mjs --pre` passes | Low | Run preflight check on distillation content |
| S3 | DB slug updated → article accessible at new URL | Article resolves at `/posts/deepseek-art-of-restraint/` | Medium | Verify via Supabase query post-update |
| S4 | Entity registry YAML → RAG indexer consumption (future) | Entity IDs match frontmatter `entities` field values | Low | Cross-check entity IDs between YAML and frontmatter |
| S5 | Golden queries reference content that exists | All `expected_sources` map to actual files | Low | Verify file paths exist |
| S6 | TikTok PDF extraction → markdown with `##` sections | Output has multiple `##` headings for RAG chunking | Low | Verify heading count in output |

### 7.3 Cross-Step Interface Contract

| Producer | Field | Consumer | Format Match? |
|----------|-------|----------|---------------|
| WP-4 entity-registry.yaml | `entities.<id>.aliases` | WP-7 frontmatter `entities.companies/people/models` | ✅ WP-7 uses entity IDs as values |
| WP-7 frontmatter `topics` | lowercase string array | spec-rag.md indexer `metadata.topics` | ✅ Q5: lowercase normalization |
| WP-7 frontmatter `entities` | snake_case IDs | spec-rag.md indexer `metadata.entities` | ✅ Matches §2.3 |
| WP-11 golden-queries.yaml | `expected_sources.content_type` | spec-rag.md `content_embeddings.content_type` | ✅ Same enum values |
| Slug fix (scene-data) | `article` field = frontmatter slug | RAG indexer article↔scene-data join | ✅ After fix |

---

## 8. Testing Plan

Pure documentation tasks — no unit tests required. Verification:

1. `npm run lint && npx tsc --noEmit && npm run build` — ensure no breakage
2. `node scripts/short-video/verify-video.mjs --pre --content distillation/pt1` — scene-data preflight
3. Supabase query — verify slug update
4. File existence check — verify all output files created
5. Cross-check — entity IDs in frontmatter match entity-registry.yaml
