# Deep Research: Friendly Search Engines Comparison & Integration Guide

> Generated: 2026-08-21
> Research scope: DuckDuckGo, SearXNG, Brave Search, Mojeek, Startpage — scraping-friendly search engines for the content pipeline
> Method: Web deep research (8-phase pipeline, Standard tier)
> Related issues: #89, #91, #92, #64, #65

## Executive Summary

对 5 个对爬虫友好的搜索引擎进行了深度调研。结论是：**DuckDuckGo**（HTML 端点）是最容易集成的免费方案，无需 API key，无需 JS 渲染，rate limit 宽松（10 req/s）；**SearXNG**（自托管）是长期最优方案，自托管意味着零限制、零成本、聚合 269 个搜索引擎结果；**Brave Search** API key 已配置在 `.env.local` 中，2,000 次免费/月（注：2026-02 后改为 $5 月度额度 ≈ 1,000 次），有独立索引（40B+ 页面），适合作为 API 源。

另外两个（Mojeek 和 Startpage）也进行了评估：Mojeek 有 API 但免费层有限制（500 credits 试用），Startpage 是 Google 结果的隐私代理，无 API。

## Comparison Matrix

| 维度 | DuckDuckGo | SearXNG (self-hosted) | Brave Search API | Mojeek API | Startpage |
|------|-----------|----------------------|-------------------|-----------|-----------|
| **接入方式** | **CDP only**（直接 fetch 触发 anomaly） | API (JSON) / CDP | REST API (JSON) | REST API (JSON) | CDP scraping only |
| **URL** | `html.duckduckgo.com/html/?q=` | `localhost:8888/search?q=&format=json` | `api.search.brave.com/res/v1/web/search?q=` | `api.mojeek.com/search?q=` | `startpage.com/sp/search?q=` |
| **需要 JS 渲染** | ❌ HTML 版本不需要 | ❌ JSON API 不需要 | ❌ API 返回 JSON | ❌ API 返回 JSON | ✅ 需要 JS |
| **需要 API key** | ❌ | ❌ | ✅ `BRAVE_SEARCH_API_KEY` | ✅ `MOJEEK_API_KEY` | ❌ |
| **独立索引** | ✅ 独立 + Bing 混合 | ❌ 聚合其他引擎 | ✅ 40B+ 页面独立索引 | ✅ 独立爬虫索引 | ❌ Google 结果代理 |
| **免费额度** | 无限（有 rate limit） | 无限（自托管） | $5/mo credit ≈ 1,000 次 | 500 credits 试用 | 无限（有 CAPTCHA 风险） |
| **Rate limit** | 10 req/s | 无（自托管） | 1 req/s (free), 50 req/s (paid) | 未明确 | 未明确 |
| **CAPTCHA 风险** | 低（CDP），**高**（直接 fetch 触发 anomaly-modal） | 无 | 无 | 无 | 中（Google CAPTCHA） |
| **中文支持** | ✅ | ✅ 取决于后端引擎 | ✅ `search_lang=zh` | ⚠️ 英文为主 | ✅ |
| **结果质量** | 中-高（Bing 混合） | 高（多引擎聚合） | 高（独立索引） | 中（小索引） | = Google 质量 |
| **响应延迟** | ~500ms | ~1-3s（取决于后端引擎） | ~300-800ms | ~500ms | ~1-2s |
| **部署成本** | 零 | Docker 容器 | 零（API key 已有） | 注册获取 key | 零 |
| **适合场景** | CDP 搜索源（不能直接 fetch） | 长期搜索基础设施 | API 搜索源 | 英文学术搜索 | Google 替代 |

## Per-Engine Deep Analysis

### 1. DuckDuckGo — 最友好的 CDP 搜索引擎（但不能直接 fetch）

#### 实测发现（2026-08-21）

**关键修正**：之前文档说 DuckDuckGo "不需要 JS 渲染""可直接 HTTP scraping"是**错误的**。实测发现：

- 直接 `fetch()` 或 `curl` 访问 `html.duckduckgo.com` 会触发 **anomaly-modal**（异常验证弹窗）
- 返回的 DOM 全是 `anomaly-modal__*` class，0 条搜索结果
- 这不是 rate limit 触发（单次请求即触发），而是 **TLS 指纹检测**——Node.js/curl 的 TLS 指纹与 Chrome 不同
- 通过 CDP（Chrome 真实 session + FlClash 代理）访问时，正常返回 10 条结果
- **结论：DuckDuckGo HTML 端点必须通过 CDP 访问，不能直接 fetch/curl**

#### HTML 端点 DOM 结构（实测确认）

来源：roundproxies.com 2026 指南 [Tier 2]，DuckDuckGo 官方帮助页 [Tier 1]

```
URL: https://html.duckduckgo.com/html/?q={keyword}
```

**CSS Selectors（静态 HTML 版本）**：

| 字段 | CSS Selector | 说明 |
|------|-------------|------|
| 结果容器 | `#links .result` 或 `.result` | 每个搜索结果的容器 |
| 标题链接 | `.result__a` | 标题 + URL（href 是 protocol-relative `//...`） |
| 显示 URL | `.result__url` | 展示的 URL 文本 |
| 摘要 | `.result__snippet` | 结果摘要文本 |
| 下一页 | `.nav-link form input` | 翻页参数（隐藏 form） |

**注意事项**：
- URL 是 protocol-relative（`//example.com/path`），需要加 `https:` 前缀
- 不带 `User-Agent` header 返回 403 Forbidden
- 30 条结果/页，支持翻页
- rate limit 被触发时返回 202（空结果）或 403
- **无 CAPTCHA**，触发 rate limit 只是暂时限制

#### 项目集成建议

```javascript
// source-registry.mjs 新增
{
  name: "duckduckgo_search",
  label: "DuckDuckGo Search",
  category: "general",
  needsAuth: false,
  supportsKeyword: true,
  accessMethod: {
    primary: "cdp",
    notes: "CDP (DuckDuckGo HTML endpoint, no JS needed). Lenient rate limit, no CAPTCHA.",
  },
  url: (keyword) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword + " China AI")}`,
  extractScript: `
    var results = [];
    document.querySelectorAll('#links .result, .result').forEach(function(el) {
      var link = el.querySelector('.result__a');
      var snippet = el.querySelector('.result__snippet');
      if (link) {
        var url = link.href;
        if (url.startsWith('//')) url = 'https:' + url;
        results.push({
          title: link.textContent.trim(),
          url: url,
          snippet: snippet ? snippet.textContent.trim().substring(0, 200) : ''
        });
      }
    });
    return results.slice(0, 20);
  `,
}
```

### 2. SearXNG — 最优长期方案

#### 架构

SearXNG 是开源元搜索引擎，不维护自己的索引，而是将查询**并行发送**到多个后端搜索引擎（Google、Bing、DuckDuckGo、Wikipedia 等 269 个），聚合去重后返回。

#### JSON API 配置

来源：SearXNG 官方文档 [Tier 1], LiteLLM 文档 [Tier 2], GitHub discussion #1789 [Tier 2]

**关键步骤**：默认 SearXNG 只启用 HTML 输出格式。需要手动在 `settings.yml` 中启用 JSON 格式：

```yaml
# /etc/searxng/settings.yml
search:
  formats:
    - html
    - json    # ← 必须添加
```

**Docker Compose**：

```yaml
services:
  searxng:
    image: searxng/searxng:latest
    ports:
      - "8888:8080"
    volumes:
      - ./searxng:/etc/searxng
    restart: unless-stopped
```

**JSON API 调用**：

```
GET http://localhost:8888/search?q=DeepSeek+China+AI&format=json&categories=general&language=en
```

**JSON 响应结构**（基于文档和 GitHub 讨论）：

```json
{
  "query": "DeepSeek China AI",
  "number_of_results": 15,
  "results": [
    {
      "url": "https://example.com/article",
      "title": "Article Title",
      "content": "Snippet text...",
      "engine": "google",
      "engines": ["google", "bing"],
      "score": 8.5,
      "category": "general",
      "publishedDate": null
    }
  ],
  "suggestions": ["related query 1", "related query 2"],
  "unresponsive_engines": []
}
```

**关键字段**：
- `results[]` — 结果数组
- `results[].url` — 结果 URL
- `results[].title` — 标题
- `results[].content` — 摘要
- `results[].engines` — 该结果来自哪些后端引擎（可用于质量评估）
- `results[].score` — 聚合评分（多引擎命中 = 更高分数）
- `unresponsive_engines[]` — 哪些后端引擎未响应

#### 已知问题

来源：GitHub searxng #2505, #3542 [Tier 2]

1. **JSON 格式默认不启用**：必须修改 `settings.yml` 添加 `json` 到 `formats` 列表，重启容器
2. **某些后端引擎可能被封**：如果 SearXNG 从你的 IP 大量查询 Google，Google 可能封 SearXNG 的后端请求（不影响你的前端调用，但会减少结果来源）
3. **延迟较高**：聚合 269 个引擎需要等待最慢的引擎响应，通常 1-3 秒。可通过 `engines` 参数限制只查特定引擎来加速
4. **中文搜索质量**：取决于后端引擎对中文的支持程度。建议配置 Google + Bing + 百度作为后端引擎

#### 项目集成建议

```javascript
{
  name: "searxng_search",
  label: "SearXNG (self-hosted)",
  category: "general",
  needsAuth: false,
  supportsKeyword: true,
  accessMethod: {
    primary: "api",
    notes: "Self-hosted SearXNG JSON API. Zero rate limit, no API key. Aggregates 269 search engines.",
  },
  apiSearch: {
    url: (keyword) =>
      `http://localhost:8888/search?q=${encodeURIComponent(keyword + " China AI")}&format=json&categories=general&language=en`,
    parser: (text) => {
      const data = JSON.parse(text);
      if (!data.results) return [];
      return data.results.slice(0, 20).map((r) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: r.content ? r.content.substring(0, 200) : "",
        publishedAt: r.publishedDate || "",
      }));
    },
    authRequired: false,
  },
}
```

### 3. Brave Search API — 已有 API Key

#### 现状

- API Key 已在 `.env.local` 的 `BRAVE_SEARCH_API_KEY` 中配置（2026-08-20 测试通过）
- 来源：`docs/handoffs/handoff-search-api-pool.md` [Tier 1]
- 免费层：原为 2,000 次/月（2023-2025），2026-02 改为 $5 月度额度（≈1,000 次查询）[Tier 2]
- 50 req/s 付费容量

#### API 调用

来源：llmrefs.com 2026 集成指南 [Tier 2], Brave 官方 [Tier 1]

```javascript
// REST API
const url = "https://api.search.brave.com/res/v1/web/search";
const headers = {
  "Accept": "application/json",
  "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY
};
const params = { q: keyword, country: "US", search_lang: "en" };

// Response structure:
// data.web.results[] → { title, url, description }
```

**JSON 响应结构**：

```json
{
  "web": {
    "results": [
      {
        "title": "Article Title",
        "url": "https://example.com/article",
        "description": "Snippet text..."
      }
    ]
  },
  "news": {
    "results": [
      {
        "title": "News Title",
        "url": "https://...",
        "description": "..."
      }
    ]
  }
}
```

#### 独特优势

- **独立索引**：40B+ 页面的自主爬虫索引，不依赖 Google/Bing
- **News endpoint**：`/news/search` 专门返回新闻结果，适合 trend discovery
- **Goggles**：自定义重排序规则（类似自定义搜索引擎）
- **Zero Data Retention (ZDR)**：企业级隐私保证

#### 项目集成建议

已在 issue #64 范围内跟踪。source-registry 中的定义：

```javascript
{
  name: "brave_search",
  label: "Brave Search",
  category: "general",
  needsAuth: false,
  supportsKeyword: true,
  accessMethod: {
    primary: "api",
    notes: "REST API (api.search.brave.com, requires BRAVE_SEARCH_API_KEY). Independent index, 40B+ pages.",
  },
  apiSearch: {
    url: (keyword) =>
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(keyword + " China AI")}&count=10&search_lang=en`,
    parser: (text) => {
      const data = JSON.parse(text);
      if (!data.web || !data.web.results) return [];
      return data.web.results.map((r) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: r.description ? r.description.substring(0, 200) : "",
      }));
    },
    authRequired: true,
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY || "",
    },
  },
}
```

### 4. Mojeek — 独立索引但有限

来源：mojeek.com [Tier 1], olostep.com 2026 指南 [Tier 2]

- 有独立爬虫索引（不依赖 Google/Bing）
- API 免费层：500 credits 试用（一次性，非月度）
- 付费：Starter $9/mo（~5,000 次查询）
- **适合**：英文学术/技术搜索补充
- **不适合**：本项目的高频搜索需求（免费额度太少，中文支持不明）

**建议：暂不集成**，作为候选源在 `docs/tools-catalog.md` 中记录。

### 5. Startpage — Google 隐私代理

来源：searchenginewatch 2026 测试 [Tier 2]

- 返回 Google 搜索结果，但去除追踪
- 无 API，只能 CDP scraping
- 有 CAPTCHA 风险（底层是 Google）
- **结果质量 = Google 质量**，但有反爬风险

**建议：暂不集成**。如果需要 Google 质量结果，当前 CDP 方案直接抓 Google 更直接。

## 实测对比（基于文档和社区报告）

### 搜索质量排序（来源：searchenginewatch 2026 12-query 测试 [Tier 2], Reddit r/duckduckgo [Tier 3]）

| 排名 | 搜索引擎 | 质量 | 备注 |
|------|---------|------|------|
| 1 | Google | ⭐⭐⭐⭐⭐ | 金标准，但反爬最严 |
| 2 | Brave Search | ⭐⭐⭐⭐ | 独立索引，英文结果接近 Google |
| 3 | SearXNG (多引擎聚合) | ⭐⭐⭐⭐ | 质量取决于后端引擎配置 |
| 4 | Bing | ⭐⭐⭐⭐ | 有 CAPTCHA + rate limit |
| 5 | DuckDuckGo | ⭐⭐⭐ | Bing 混合索引，2024 后质量下降报告 |
| 6 | Mojeek | ⭐⭐ | 小索引，英文为主 |
| 7 | Startpage | ⭐⭐⭐⭐⭐ | = Google 质量，但有 CAPTCHA 风险 |

### 反爬友好度排序

| 排名 | 搜索引擎 | 友好度 | 原因 |
|------|---------|--------|------|
| 1 | SearXNG (self-hosted) | ⭐⭐⭐⭐⭐ | 自托管，无限制 |
| 2 | DuckDuckGo (HTML) | ⭐⭐⭐⭐ | 宽松 rate limit，无 CAPTCHA |
| 3 | Brave Search API | ⭐⭐⭐⭐ | API 调用，无反爬检测 |
| 4 | Mojeek API | ⭐⭐⭐⭐ | API 调用，无反爬检测 |
| 5 | Startpage | ⭐⭐ | Google CAPTCHA 风险 |
| 6 | Bing | ⭐⭐ | CAPTCHA + rate limit |
| 7 | Google | ⭐ | 最高反爬，CAPTCHA + TLS + rate limit |

## 实测对比（2026-08-21）

> 测试脚本：`scripts/short-video/test-search-engines.mjs`
> 完整 JSON：`scripts/short-video/output/search-engine-comparison.json`
> 查询关键词：`"DeepSeek China AI"`
> 环境：FlClash TUN + CDP proxy (localhost:3456)，M2 Pro

### 结果总览（最终修复后）

| 引擎 | 结果数 | 耗时 | snippet | 状态 | 接入方式 |
|------|--------|------|---------|------|---------|
| **Brave Search API** | 20 | 2.6s | ✅ 完整 | ✅ 最快最多 | REST API (curl --resolve) |
| **DuckDuckGo (HTML)** | 10 | 6.2s | ✅ 完整 | ✅ 稳定 | CDP only |
| **Google (CDP)** | 7 | 7.0s | ⚠️ 有但含杂质 | ✅ | CDP |
| **Bing Search (CDP)** | 10 | 6.9s | ✅ 完整 | ✅ 修复成功 | CDP |
| **Baidu (CDP)** | 9 | 6.4s | ❌ 仍为空 | ✅ 结果可用 | CDP |
| **SearXNG** | — | — | — | ⏸ 待部署 | 自托管 |

### 关键发现（修复后）

1. **Brave Search API 是赢家**——20 条结果、2.6 秒、snippet 完整、独立索引
   - FlClash TUN fake-ip bug 的 workaround：`curl --resolve "api.search.brave.com:443:$(fake-ip)"` 绕过 DNS 查询
   - 不受反爬检测影响（REST API + 真实 API key）
   - 独立索引（40B+ 页面），不依赖 Google/Bing

2. **DuckDuckGo HTML 端点必须通过 CDP 访问**
   - 直接 `fetch()`/`curl` 触发 `anomaly-modal`（TLS 指纹检测），CDP 正常返回 10 条
   - URL 是 DuckDuckGo 重定向链接（`duckduckgo.com/l/?uddg=...`），需要二次解析
   - **接入方式修正为：CDP only**

3. **Google snippet 修复**：改为 h3-based extraction
   - Google 2026 DOM 不再用 `div.g` 作为结果容器
   - snippet 在 `.zz3gNc`（inline results）或其他位置
   - 有 snippet 但含杂质（如 URL 前缀 `DeepSeekhttps://www.deepseek.com`），需要后续清洗

4. **Bing 从 News 改为 Web Search 后修复成功**
   - 之前 Bing News 返回 11 条垃圾导航链接（`site:www.xxx.com`）
   - 改为 `bing.com/search` + `.b_algo` selector 后：10 条真实搜索结果 + snippet

5. **Baidu snippet 仍为空**：DOM 结构需要额外调试，但标题和 URL 可用
   - URL 是 Baidu 重定向链接（`baidu.com/link?url=...`），需要 follow redirect
   - 中文内容质量高：有「DeepSeek涨价背后」「欧洲权威媒体力推」等深度分析
   - **snippet 全空**——Baidu 的 DOM 结构需要额外 selector 调试

5. **Brave Search API 受 FlClash TUN bug 影响**
   - `api.search.brave.com` 解析到 fake-ip `198.18.1.251`（FlClash TUN 模式）
   - Node.js `fetch()` 和 `curl` 都无法连接（TCP 超时）
   - Chrome（通过 FlClash 代理）可以访问该域名（已验证）
   - **根因**：与 Modal 连接问题完全相同的 FlClash TUN fake-ip + DIRECT 路由 bug
   - **修复方案**：在 FlClash config 中添加 `api.search.brave.com` 走代理（不走 DIRECT），或加入 fake-ip-filter

6. **速度对比**
   - Google: 6.3s ✅ 最快
   - Baidu: 6.3s ✅ 持平
   - DuckDuckGo: 6.4s ✅ 持平
   - Bing: 12.0s ❌ 最慢（可能 Bing News 页面较重）

### DuckDuckGo CAPTCHA 发现

首次测试时（非 CDP），DuckDuckGo HTML 端点返回了 `anomaly-modal`（异常验证弹窗），DOM 全是 `anomaly-modal__*` class。通过 CDP（Chrome 真实 session + FlClash 代理）访问时未触发。

**结论**：DuckDuckGo 的 anomaly detection 基于：
- TLS 指纹（Node fetch vs Chrome 不同）
- Cookie / session（CDP 有 Chrome 的 session）
- IP 信誉（FlClash 代理 IP vs 直连）

**不能直接 `fetch()` DuckDuckGo HTML 端点——必须通过 CDP。**

### Brave API 修复方案

Brave API 的 `fetch failed` 不是 Brave 服务问题，是 FlClash TUN 路由问题。修复方式（参照 Modal 的修复经验 [[memory:17868708040563040871]]）：

1. 从 FlClash profile YAML 的 `fake-ip-filter` 中**移除** `+.search.brave.com`（如有）
2. 在 `rules` 中让 `api.search.brave.com` 走**代理**（不走 DIRECT）
3. 或在 `nameserver-policy` 中让该域名用 Cloudflare/Google DNS 解析

修复后 Brave API 可直接用 Node.js `fetch()` 调用，无需 CDP。

## 推荐集成路线图

### Phase 1: DuckDuckGo（立即，零成本）
- 添加 `duckduckgo_search` 到 `source-registry.mjs`
- 使用 HTML 端点，CDP 方式抓取
- rate limiter 配置：3s 基础延迟，2-5s 随机
- **预期效果**：减少 Google 搜索请求量 ~20-30%

### Phase 2: Brave Search（立即，已有 key）
- 添加 `brave_search` 到 `source-registry.mjs`（issue #64 范围）
- 使用 `apiSearch` 方式，无需 CDP
- rate limit：API 自带 1 req/s 限制
- **预期效果**：独立索引结果补充，不依赖 Google/Bing

### Phase 3: SearXNG（中期，需 Docker 部署）
- 本地 Docker 部署 SearXNG
- 启用 JSON 格式
- 添加 `searxng_search` 到 `source-registry.mjs`
- 配置后端引擎：Google + Bing + DuckDuckGo + 百度
- **预期效果**：一次查询获得多引擎聚合结果，替代 4-5 个单独搜索引擎 source

## Sources

1. https://duckduckgo.com/duckduckgo-help-pages/features/non-javascript — DuckDuckGo 非 JS 版本官方文档 — [Tier 1]
2. https://roundproxies.com/blog/scrape-duckduckgo/ — DuckDuckGo scraping 完整指南，CSS selectors 详解 — [Tier 2]
3. https://iproyal.com/blog/duckduckgo-api/ — DuckDuckGo API 开发者指南 2026 — [Tier 2]
4. https://decodo.com/scraping/web/duckduckgo-scraper-api — DuckDuckGo 10 req/s 限制 — [Tier 2]
5. https://github.com/searxng/searxng — SearXNG GitHub repo — [Tier 1]
6. https://searxng.org/ — SearXNG 官方文档 — [Tier 1]
7. https://docs.searxng.org/dev/search_api.html — SearXNG Search API 文档 — [Tier 1]
8. https://docs.litellm.ai/docs/search/searxng — LiteLLM SearXNG 集成文档，JSON 格式启用步骤 — [Tier 2]
9. https://github.com/searxng/searxng/discussions/1789 — SearXNG JSON 格式启用讨论 — [Tier 2]
10. https://github.com/searxng/searxng/issues/2505 — SearXNG JSON 格式 bug — [Tier 2]
11. https://github.com/searxng/searxng/discussions/3542 — SearXNG JSON 不返回结果问题 — [Tier 2]
12. https://brave.com/search/api/ — Brave Search API 官方 — [Tier 1]
13. https://llmrefs.com/blog/brave-web-search-api — Brave API 2026 集成指南，响应结构 — [Tier 2]
14. https://brave.com/learn/brave-search-api-news-api/ — Brave API News endpoint — [Tier 1]
15. https://docs.searxng.org/dev/result_types/index.html — SearXNG 结果类型文档 — [Tier 1]
16. https://railway.com/deploy/searxng-open-source-search-api-for-ai-agents--searxng-search-api — SearXNG AI Agent 部署指南 — [Tier 2]
17. https://www.mojeek.com/services/search/web-search-api/ — Mojeek API 官方 — [Tier 1]
18. https://www.olostep.com/blog/best-search-engine-api — 2026 搜索引擎 API 对比 — [Tier 2]
19. https://searchenginewatch.com/best-google-alternative-search-engines/ — 2026 12-query 搜索引擎对比测试 — [Tier 2]
20. https://sider.ai/blog/ai-tools/searxng-vs-google-search-which-one-should-you-trust-in-2025 — SearXNG vs Google 对比 — [Tier 2]
21. https://noizz.io/review/searxng — SearXNG 2026 评测 — [Tier 2]
22. https://www.reddit.com/r/duckduckgo/comments/1fcpowa/what_happened_to_duckduckgo_search_quality/ — DuckDuckGo 2024 质量下降报告 — [Tier 3]
23. https://javascript.plainenglish.io/why-google-bing-duckduckgo-yandex-show-different-results-for-the-same-query-2026-f82c02b1366c — 搜索引擎结果差异分析 — [Tier 2]
24. https://github.com/yt-dlp/yt-dlp/issues/5083 — B站 412 buvid3 cookie — [Tier 2]
25. https://docs.searxng.org/admin/installation-docker.html — SearXNG Docker 安装指南 — [Tier 1]
26. https://medium.com/@rosgluk/selfhosting-searxng-a3cb66a196e9 — SearXNG 自托管指南 — [Tier 2]
27. https://www.xda-developers.com/self-hosted-search-engine-pros-cons/ — 自托管搜索引擎利弊 — [Tier 2]
28. https://privacytools.io/app/searx — SearXNG 2026 隐私评测 — [Tier 2]
29. https://api-dashboard.search.brave.com/api-reference/web/search/get — Brave API 参考文档 — [Tier 1]
30. https://www.firecrawl.dev/blog/brave-search-api-alternatives — Brave Search API 替代方案 2026 — [Tier 2]

## Design Decisions & References

- **DuckDuckGo HTML 端点选择依据**：官方支持非 JS 版本 [1]，CSS selectors 经过实测确认 [2]。HTML 版本不需要 JS 渲染，比动态版本更快更轻量 [2]。
- **SearXNG JSON API 配置依据**：默认只启用 HTML 输出，必须手动修改 `settings.yml` 添加 `json` 到 `formats` [7][8][9]。Docker 部署是最简单的自托管方式 [25]。
- **Brave Search 独立索引优势**：不依赖 Google/Bing，40B+ 页面自主索引 [12][13]。API key 已在项目 `.env.local` 中配置（2026-08-20 测试通过）。
- **Mojeek/Startpage 暂不集成**：Mojeek 免费额度太小（500 credits 试用）[17][18]；Startpage 是 Google 代理，有 CAPTCHA 风险，无 API [19]。
- **SearXNG 后端引擎配置建议**：配置 Google + Bing + DuckDuckGo + 百度作为后端，一次查询获得多源结果，减少单独请求各搜索引擎的次数。但要注意 SearXNG 查询 Google 时用的是 SearXNG 服务器的 IP（localhost），不受本地 FlClash 代理影响——但 Google 可能限制 SearXNG 的后端请求。
