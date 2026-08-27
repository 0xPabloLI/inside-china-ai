# Tickets: URL Dedup (#63)

> **Spec:** `docs/spec-url-dedup.md`
> **Date:** 2026-08-27

## T1: dedupByUrl() + search-sources.mjs 集成

**Dependencies:** None
**Files:** `scripts/short-video/lib/trends-utils.mjs`, `scripts/short-video/search-sources.mjs`, `scripts/short-video/__tests__/trends-utils.test.mjs`

### Checklist

- [x] Red: 写 `dedupByUrl()` 测试用例（覆盖场景矩阵 13 行）
- [x] Green: 实现 `dedupByUrl()` — import `canonicalizeUrl`，Set-based dedup，空 URL 跳过
- [x] Green: 在 `search-sources.mjs` 中 `allArticles.push(...)` 循环后调用 `dedupByUrl(allArticles)` + 日志
- [x] Refactor: 检查代码风格一致性
- [x] 全量测试通过
