# Spec: URL Dedup (#63)

> **Issue:** #63
> **Date:** 2026-08-27
> **Status:** Ready for implementation

## Problem

`search-sources.mjs` collects articles from ~30+ sources. Multiple sources return the same URL (e.g., Google search and 量子位 site search both return `jiqizhixin.com/article/abc`). In Trend mode, `deduplicateTopics()` deduplicates by title similarity (Jaccard ≥80%), not by URL — same URL with slightly different titles may survive. In Research mode, there is no dedup at all.

## Solution

Insert a URL-level Set-based dedup step after collecting `allArticles` and before any mode-specific processing. Reuse `canonicalizeUrl()` from `scripts/short-video/lib/url-normalizer.mjs` (VDL #75 第一批已实现).

### Dedup 插入点

在 `allArticles.push(...)` 循环结束之后、`console.log("Total articles scraped")` 之前，对 `allArticles` 数组进行原地去重。

```
collect all sources → allArticles.push(...)
  → URL dedup (NEW): canonicalizeUrl + Set dedup
  → Trend: filterChinaAI → classify → deduplicateTopics (title similarity)
  → Research: output as-is (now deduped)
```

### 保留策略

- **保留第一条**：同一 canonical URL 的多条文章，保留先入者（`allArticles` 中第一个出现的），丢弃后续重复项
- **不合并 `source` 字段**：URL dedup 是精确去重（同 URL = 同文章），不需要合并 source 来源信息；后续 `deduplicateTopics` 会处理跨 URL 的语义重复（合并 `sources`）
- **空 URL 不参与 dedup**：`canonicalizeUrl("")` 返回 `""`，空 URL 的文章直接保留（不加入 seen set），避免多条无 URL 文章被误删

### `resultsBySource` 不受影响

`resultsBySource[source.name]` 在循环内用 per-source `articles` 构建（不是 `allArticles`），反映"每个 source 返回了什么"。跨 source 的 URL 重复在 `allArticles` 层面被消除即可，`resultsBySource` 保持原始 per-source 数据。

### 日志

去重后输出一行：`🔗 URL dedup: {before} → {after} ({removed} duplicates removed)`

## Scope

1. 新增 `export function dedupByUrl(articles)` 在 `trends-utils.mjs`
2. 在 `search-sources.mjs` 中 `allArticles.push(...)` 循环之后调用 `dedupByUrl(allArticles)`
3. import `canonicalizeUrl` from `./url-normalizer.mjs`（不重新实现）
4. 测试覆盖场景矩阵所有行

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/trends-utils.mjs` | 新增 `dedupByUrl()` 函数 + import `canonicalizeUrl` | **Low** | 纯追加，不修改现有函数逻辑。`canonicalizeUrl` 是已有稳定函数（42 个 VDL 测试覆盖）。 |
| `scripts/short-video/search-sources.mjs` | 在 `allArticles.push(...)` 循环后插入 `dedupByUrl()` 调用 + 日志 | **Medium** | 修改了数据流——`allArticles` 在进入 mode 分支前被去重。三个消费者（trend filterChinaAI / research scoped discovery / research legacy output）都会拿到更少的 article。但这是预期行为（去重是目的）。验证方式：现有测试不应回归。 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 2 articles, same URL, different sources | 1 article kept (first one) | Low | Set-based dedup by canonical URL |
| 2 | 2 articles, same URL, different titles | 1 article kept (first one) | Low | URL dedup runs before title dedup; same URL = same article |
| 3 | 2 articles, different URLs, same title | 2 articles kept | Low | URL dedup only removes exact URL matches; title dedup handles semantic dupes |
| 4 | 2 articles, same URL with different query params | 1 article kept | Low | `canonicalizeUrl` strips query string |
| 5 | 2 articles, same URL, one http:// one https:// | 1 article kept | Low | `canonicalizeUrl` normalizes http→https |
| 6 | 2 articles, same URL, one with trailing slash one without | 1 article kept | Low | `canonicalizeUrl` normalizes trailing slash |
| 7 | 2 articles, same URL, one with fragment (#section) | 1 article kept | Low | `canonicalizeUrl` strips fragment |
| 8 | Article with empty/undefined URL | Kept, not deduped against other empty URLs | Medium | Empty URL → `canonicalizeUrl` returns `""` → skip dedup for this article |
| 9 | All articles from one source, no URL duplicates | All kept, no change | Low | Set only removes exact canonical URL matches |
| 10 | 0 articles | Empty array returned, no crash | Low | `dedupByUrl([])` returns `[]` |
| 11 | Articles with same hostname but different paths | All kept | Low | Canonical URL includes path; different paths = different canonical |
| 12 | Research mode: resultsBySource still has per-source counts | Per-source counts unchanged | Medium | `resultsBySource` built inside loop with per-source `articles`, not `allArticles` |
| 13 | Trend mode: filterChinaAI receives deduped array | Yes — dedup runs before filter | Low | Single insertion point, all downstream consumers get deduped data |
