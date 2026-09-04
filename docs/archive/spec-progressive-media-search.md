# Spec: Progressive (Tiered) Media Search Architecture

> GitHub Issue: #110
> Status: ready-for-agent
> Created: 2026-08-24

## Problem Statement

The video pipeline's `asset-sourcer.mjs` searches three layer types for media assets: (1) Stock API (Pexels/Unsplash/Pixabay/Wikimedia/Coverr), (2) CDP news sites (ithome/jiqizhixin/etc.), (3) yt-dlp (YouTube/Bilibili). For China AI keywords like "DeepSeek" or "Unitree", stock libraries return zero results and Chinese news sites may not have enough relevant images/videos. There is no open search engine image/video search tier to fill the gap.

The result: scenes go without media assets, reducing video quality. Users must manually search and provide assets (Tier 4 HITL), which is time-consuming.

## Solution

Add a **Tier 3: Open Search Engine Image Search** between the current CDP news search (Tier 2) and AI Analysis stages. Tier 3 only triggers when Tier 1 + Tier 2 yield insufficient results (quantity-based trigger condition). Tier 3 sources include:

- **Brave Image Search** — REST API at `https://api.search.brave.com/res/v1/images/search`, returns `properties.url` (direct image URL), `properties.width`, `properties.height`, `title`, `source`
- **SearXNG Image Search** — self-hosted metasearch at `http://localhost:8888/search?q=...&format=json&categories=images`, returns `img_src` (direct image URL), `title`, `resolution`, `source`

A new module `lib/progressive-search.mjs` handles tier evaluation and stop/continue logic. The existing `searchApiSource` function is reused for API-based search calls. A simple in-memory `BraveQuotaTracker` counts Brave API calls during the current run.

## User Stories

1. As a content producer, I want the asset-sourcer to automatically search open image search engines when stock libraries and news sites don't return enough results, so that my scenes have media assets without manual search.
2. As a content producer, I want Brave Image Search results to include image dimensions, so that the technical score can evaluate resolution fitness.
3. As a content producer, I want SearXNG image search as a fallback when Brave quota is exhausted or unavailable, so that Tier 3 doesn't have a single point of failure.
4. As a content producer, I want Tier 3 to only trigger when previous tiers are insufficient, so that API quota and network time are not wasted.
5. As a content producer, I want open-search-engine assets to be marked with attribution text indicating copyright is unverified, so that I know to manually review them before publishing.
6. As a content producer, I want the asset-sourcer report to indicate which assets came from Tier 3, so that I can prioritize manual review of those.
7. As a developer, I want the progressive search module to be testable independently, so that I can verify tier evaluation logic without running the full pipeline.
8. As a developer, I want Brave API response parsing to be a pure function, so that I can test it with mock data.
9. As a developer, I want SearXNG response parsing to be a pure function, so that I can test it with mock data.
10. As a developer, I want the Brave quota tracker to be simple and in-memory, so that it doesn't add infrastructure complexity. Later issues (#65/#109) will extract it to a shared module.
11. As a content producer, I want the progressive search to use existing search-cache, so that repeated runs don't waste API calls.
12. As a content producer, I want progressive search to degrade gracefully when Brave API key is missing, so that the pipeline continues with SearXNG only.

## Implementation Decisions

### 1. New module: `lib/progressive-search.mjs`

Responsibilities:

- `shouldTriggerTier3(totalAssets, scenesNeedingMedia)` — returns boolean. Trigger condition: `totalAssets < scenesNeedingMedia`
- `searchBraveImages(keyword, apiKey, { count, quotaTracker })` — calls Brave Image Search API, parses response into candidates: `{ url, title, type: "image", resolution, source: "brave_image" }`
- `searchSearXngImages(keyword, { baseUrl, count })` — calls SearXNG image search, parses response into candidates: `{ url: img_src, title, type: "image", resolution, source: "searxng_image" }`
- `BraveQuotaTracker` class — in-memory counter: `track()`, `getCount()`, `getRemaining(quotient)`. No persistence.

### 2. Source registry additions (`source-registry.mjs`)

Add two new entries to `STOCK_MEDIA_SOURCES` (or a new `OPEN_SEARCH_SOURCES` array — see decision below):

**Brave Image Search:**

- `name: "brave_image"`
- `capabilities.images`: `{ method: "api", requiresApiKey: true, apiKeyEnv: "BRAVE_SEARCH_API_KEY", searchUrl: (kw, key) => \`https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(kw)}&count=20&safesearch=strict\`, authHeader: "X-Subscription-Token", parseResponse: (data, kw) => ... }`
- `parseResponse` maps `data.results` → `{ url: r.properties.url, title: r.title, type: "image", resolution: r.properties.width && r.properties.height ? \`${r.properties.width}x${r.properties.height}\` : undefined, source: "brave_image" }`

**SearXNG Image Search:**

- `name: "searxng_image"`
- `capabilities.images`: `{ method: "api", requiresApiKey: false, searchUrl: (kw) => \`http://localhost:8888/search?q=${encodeURIComponent(kw)}&format=json&categories=images\`, parseResponse: (data, kw) => ... }`
- `parseResponse` maps `data.results` → `{ url: r.img_src, title: r.title, type: "image", resolution: r.resolution, source: "searxng_image" }`

### 3. Asset-sourcer main() integration

Insert Tier 3 search after CDP sources (Tier 2) and before AI Analysis:

```
// Existing: Phase 0 (cached) → API sources → yt-dlp → CDP sources
// NEW: Tier 3 evaluation + progressive search
// Existing: AI Analysis → Report
```

Integration point in main():

1. After CDP sources complete and `searchCacheDirty` is persisted
2. Calculate `scenesNeedingMedia = scenes.filter(s => !NO_MEDIA_TYPES.has(s.visualType) && !s.media).length`
3. Call `shouldTriggerTier3(allAssets.length, scenesNeedingMedia)`
4. If true: run Brave Image Search + SearXNG Image Search (Promise.allSettled), download results, add to allAssets
5. If false: skip Tier 3, proceed to AI Analysis

### 4. Attribution handling

Add to `SOURCE_ATTRIBUTIONS`:

- `brave_image`: `{ text: () => "Image source: Brave Search (copyright unverified)", license: "Copyright unverified — manual review required", logoRequired: false, attributionRequired: true }`
- `searxng_image`: `{ text: () => "Image source: SearXNG (copyright unverified)", license: "Copyright unverified — manual review required", logoRequired: false, attributionRequired: true }`

### 5. Testing seam

Primary testing seam: **pure functions in `progressive-search.mjs`** + **existing `searchApiSource` integration**.

- `shouldTriggerTier3` — pure function, no mocks needed
- `searchBraveImages` — mock `fetch` response, test parseResponse mapping
- `searchSearXngImages` — mock `fetch` response, test parseResponse mapping
- `BraveQuotaTracker` — pure state, test track/getCount/getRemaining

Prior art: `asset-sourcer.test.mjs` already tests `searchApiSource` with mock fetch, `buildAttribution`, `buildCreditsSection`.

## Testing Decisions

- Test external behavior, not implementation details
- `shouldTriggerTier3`: test boundary conditions (exactly enough, one short, zero assets, zero scenes needing media)
- Brave/SearXNG parseResponse: test with realistic mock API responses (based on actual API docs verified 2026-08-24)
- `BraveQuotaTracker`: test counter increments and remaining calculation
- Integration: test that progressive search results are added to allAssets with correct `source` field
- Follow existing test pattern: `describe/it` with `vitest`, mock `fetch` with `vi.fn()`

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件                                                   | 修改内容                                                                                              | 风险等级 | 评估                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `scripts/short-video/lib/progressive-search.mjs`       | 新建文件：tier 评估 + Brave/SearXNG 搜索 + quota tracker                                              | Low      | 纯新建，不修改现有逻辑                                                                            |
| `scripts/short-video/lib/source-registry.mjs`          | 在 STOCK_MEDIA_SOURCES 末尾追加 brave_image + searxng_image 源定义 + SOURCE_ATTRIBUTIONS 追加两个条目 | Low      | 追加，不修改现有源定义。ALL_SOURCES filter 自动包含新源                                           |
| `scripts/short-video/lib/asset-sourcer.mjs`            | main() 中在 CDP 搜索后插入 Tier 3 progressive search 调用                                             | Medium   | 修改 main() 控制流。插入点在 CDP 之后、AI Analysis 之前，是纯追加，不修改现有 API/yt-dlp/CDP 逻辑 |
| `scripts/short-video/__tests__/asset-sourcer.test.mjs` | 新增 progressive search 测试                                                                          | Low      | 纯追加测试                                                                                        |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                     | Expected Behavior                                               | Risk                                            | Mitigation                                                 |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| 1   | Tier 1+2 返回足够 assets (totalAssets >= scenesNeedingMedia) | Tier 3 不触发，main() 直接进入 AI Analysis                      | 数量足够但质量低的 assets 可能不理想            | 后置报告标注 avg VLM score，用户可手动审查                 |
| 2   | Tier 1+2 返回不足 assets (totalAssets < scenesNeedingMedia)  | Tier 3 触发，Brave + SearXNG 并行搜索                           | API 超时或不可用                                | Promise.allSettled，一个失败不影响另一个                   |
| 3   | BRAVE_SEARCH_API_KEY 未配置                                  | Brave source 被 skip，SearXNG 单独运行 Tier 3                   | Tier 3 结果可能不够                             | 记录到 skipped[]，报告显示原因                             |
| 4   | Brave API 返回 429 (quota 用尽)                              | Brave 返回空数组，SearXNG 继续                                  | Brave quota 被其他工具用尽                      | BraveQuotaTracker 记录调用次数，429 被 catch 返回空        |
| 5   | SearXNG localhost:8888 不可达                                | SearXNG 返回空数组，Brave 单独运行 Tier 3                       | 单点故障                                        | fetch 超时 5s，catch 网络错误                              |
| 6   | Brave Image 返回 `properties.url` 为 null/undefined          | 该 candidate 被 filter 掉（url 为空的 candidate 不下载）        | 下载 null URL crash                             | downloadAsset 已有 `candidate.url` 检查                    |
| 7   | SearXNG 返回 `img_src` 为空字符串                            | 该 candidate 被 filter 掉                                       | 空字符串 URL 传入 downloadAsset                 | parseResponse 中 filter `!r.img_src`                       |
| 8   | scenes 为空 (scenes.length = 0)                              | scenesNeedingMedia = 0，shouldTriggerTier3 返回 false           | 无意义搜索                                      | shouldTriggerTier3 中 `scenesNeedingMedia <= 0` 返回 false |
| 9   | Brave Image Search 返回空 results 数组                       | 正常处理，candidates 为空，继续 SearXNG                         | 无风险                                          | Promise.allSettled 正常处理空结果                          |
| 10  | Tier 3 下载的图片来自 Brave/SearXNG                          | attribution 标记 `attributionRequired: true`，出现在 credits 中 | 用户不知需手动审查                              | attribution text 明确标注 "copyright unverified"           |
| 11  | search-cache 中已有 Brave/SearXNG 的结果                     | cache hit，不重复 API 调用                                      | 缓存过期导致过时结果                            | 与现有 API_SOURCES 一致，cache 按 source+keyword 命中      |
| 12  | 多个 keyword 场景                                            | 每个 keyword 独立触发 Brave/SearXNG 搜索，结果累加              | API 调用次数 = keywords.length × sources.length | search-cache 缓存，BraveQuotaTracker 追踪                  |
| 13  | Brave 返回的图片 URL 403/404                                 | downloadAsset 返回 `{success: false}`，记录到 failed[]          | 部分图片不可下载                                | 与现有 stock API 下载行为一致                              |

## Out of Scope

- Brave Video Search — 延后（需要 yt-dlp 下载链路 + URL 去重逻辑）
- SearXNG Video Search — 延后（同上）
- Tavily include_images — 延后（Tavily 是有限付费资源，且 image search 能力有限）
- content-pipeline.md 文档更新 — 延后（#103 先做文档瘦身）
- 跨工具 Brave quota 共享 — 延后到 #65 统一 search pool
- VLM score 作为 Tier 3 触发条件 — 延后（需要 VLM 在搜索阶段可用，成本太高）

## Further Notes

- ADR-0013 (Asset Sourcing Three-Layer) describes the existing architecture. This spec adds a 4th layer (open search engine image search) within the same framework.
- ADR-0016 (Cascade Filtering) — Tier 3 respects cascade principle: it only runs after cheaper tiers (stock API + CDP) are exhausted.
- Brave API docs verified 2026-08-24 via `api-dashboard.search.brave.com` documentation.
- SearXNG running locally on localhost:8888, verified 2026-08-24 with test queries.
- Brave API key already in `.env.local` as `BRAVE_SEARCH_API_KEY` (confirmed via grep).
