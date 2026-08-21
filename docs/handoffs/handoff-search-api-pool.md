# Handoff: Search API Pool — 多搜索 API 轮转调度

> Created: 2026-08-20
> Parent discussion: `docs/research/pipeline-simplification-discussion.md` (Topic 3)
> Trigger: User wants monthly-renewing search APIs as a pool, not sequential fallback

## Context

当前管线的 fallback 链是线性的——每个层失败后走下一个。但 Jina、Tavily、Brave、mcp-search-bridge 都是"搜索类" API，且都有每月更新的免费额度。用户要求把它们做成一个 **pool**，同一层内 round-robin，额度独立消耗。

## Pool Members

| API | 免费额度 | 刷新周期 | 超额行为 | 集成方式 |
|-----|---------|----------|----------|----------|
| **Jina Search** | 1M tokens/月 | 每月更新 | 降级到无 key 模式（20 RPM） | **直接 API** — `fetch("https://s.jina.ai/" + query)` + `Authorization: Bearer {key}` |
| **Tavily** | 1000 credits/月 | 每月1号重置 | 请求停止 | **直接 API** — `fetch("https://api.tavily.com/search", { method: POST, body: { api_key, query } })` |
| **Brave Search** | 2000 queries/月 | 每月更新 | 请求停止 | **直接 API** — `fetch("https://api.search.brave.com/res/v1/web/search?q=...")` + `X-Subscription-Token` header |
| **mcp-search-bridge (Grok)** | 无限（自建） | 不适用 | 无限制 | **MCP** — 唯一没有 REST API 的成员，通过 `lib/mcp-client.mjs` 调用 |

> **设计原则**：Pipeline 代码优先用 `fetch()` 直接调用 REST API。MCP transport 仅用于没有 REST API 的服务（Grok 是自建 Node.js server）。这统一了 3/4 成员的调用模式，与现有 `apiSearch` 源（GNews、Currents）一致。

## What exists already

- **Jina Search**: REST API `https://s.jina.ai/{query}` + `Authorization: Bearer {JINA_API_KEY}` header。MCP 也配了但 pipeline 不用——直接 `fetch()` 调用。
- **Tavily**: REST API `https://api.tavily.com/search` (POST with `{ api_key, query }` body)。MCP 也配了但 pipeline 不用——直接 `fetch()` 调用。
- **Brave Search**: REST API `https://api.search.brave.com/res/v1/web/search` + `X-Subscription-Token` header。✅ 已测试 2026-08-20。API Key 在 `.env.local` 的 `BRAVE_SEARCH_API_KEY`。
- **mcp-search-bridge (Grok)**: 自建 Node.js server（`~/mcp-search-bridge/server.js`），无 REST endpoint，只能通过 stdio MCP 调用。source-registry 中 7 个源有 `mcpFallback` 配置指向它。

## What's missing (the gap)

### 1. Pool 调度器
需要一个 `SearchApiPool` 类/模块，管理四个 API 的调用和额度追踪：

```javascript
// 目标接口
class SearchApiPool {
  constructor(members) { /* [{ name, callMethod: 'mcp'|'api', mcpToolName?, apiUrl?, apiKeyEnv?, priority, monthlyLimit, currentUsage }] */ }
  
  async search(keyword) {
    // 1. 按 priority + remaining quota 选最优 member
    // 2. 调用该 member 的 MCP tool
    // 3. 成功 → 返回结果
    // 4. 失败 → 尝试下一个 member
    // 5. 全失败 → throw
  }
  
  resetMonthlyUsage() { /* 每月1号重置 currentUsage */ }
  getStatus() { /* 返回各 member 的剩余额度 */ }
}
```

### 2. 额度追踪持久化
- 当前用量需要持久化（写入文件或 DB），否则重启后丢失
- 简单方案：`output/search-api-usage.json`，记录 `{ member, month, usageCount }`
- 每次调用后 increment，每月1号自动重置

### 3. source-registry 集成
- 新增 `searchApiPool` 配置字段（替代现有的 `mcpFallback`）
- 或保留 `mcpFallback` 作为单个 fallback，pool 作为更高层的 fallback

### 4. 与现有 fallback 链的关系

现有链：
```
apiSearch → CDP (extractScript) → cdpFallback (Google site:) → mcpFallback (Grok)
```

新链（加入 web_fetch + Jina Reader + Pool）：
```
Layer 0: apiSearch (API 直连) — 最快
Layer 1: web_fetch — 免费、无限制
Layer 2: Jina Reader (URL→Markdown) — JS 渲染、1M tokens/月
Layer 3: CDP extractScript — per-site 精确选择器
Layer 3b: Generic eval fallback — 通用选择器
Layer 4: Search API Pool — Jina Search + Tavily + Brave + Grok (round-robin)
```

注意 Layer 2 (Jina Reader) 和 Layer 4 (Jina Search) 用的是 Jina 的不同功能：
- Jina Reader: `r.jina.ai/{url}` — 已知 URL 提取正文
- Jina Search: 关键词搜索，发现新 URL

它们消耗同一个 token 池。

## Implementation Scope

### 改动文件
1. `scripts/short-video/lib/search-api-pool.mjs` — 新建，Pool 调度器
2. `scripts/short-video/lib/source-registry.mjs` — 新增 `searchApiPool` 配置
3. `scripts/short-video/search-sources.mjs` — `collectFromSource` 新增 Layer 1-4
4. `scripts/short-video/__tests__/search-api-pool.test.mjs` — 新建，Pool 单元测试

### 不改动的文件
- `lib/mcp-client.mjs` — 已有的 MCP 调用逻辑不变
- `lib/cdp-client.mjs` — CDP 传输层不变
- MCP 配置文件 — 三个搜索 MCP 已配置好

## Design Decisions

1. **Pool 内优先级**：Jina Search > Brave > Tavily > Grok（按免费额度从大到小，Grok 兑底）
2. **额度耗尽时**：自动降级到下一个 member，不停服务
3. **月度重置**：检查 `usage.month !== currentMonth` → 重置
4. **Pool 只用于 "关键词搜索" 场景**，不用于 "URL 提取" 场景（后者走 web_fetch → Jina Reader → CDP）

## Suggested Skills

- `implement` skill — 标准 TDD 实施
- `tdd` skill — Pool 调度器单元测试（round-robin、额度耗尽降级、月度重置）
- `writing-for-agents` skill — 更新 `docs/tools-catalog.md` 和 `docs/research/pipeline-simplification-discussion.md`

## Design Clarifications (2026-08-20 补充)

### Bing API 已退役，不可用
Bing Search API 于 2025 年 8 月退役，2026 年 8 月 11 日完全关闭。不可加入 Pool。但 `bing_news` 源在 source-registry 中走 CDP 模式（打开 `bing.com/news/search` 页面用 extractScript），不依赖 API，仍然可用。

### CDP 搜索不能进 Pool
Pool 只包含**程序化 API 调用**的搜索服务。CDP 搜索（google_search、baidu_search、bing_news）是浏览器代理模式，不是 API，不能放进 Pool。它们作为独立 source 留在 source-registry 中。

### Wikipedia 不属于 general search，单独作为 reference source
Wikipedia REST API（`https://en.wikipedia.org/api/rest_v1/page/summary/{title}`）是实体背景信息查询，不是关键词搜索。应作为独立的 `category: "reference"` source 加入 source-registry，不放进 Search API Pool。适合在 content-pipeline Stage 1（写文章时查实体信息）调用。

### General search 的消费者
当前管线中消费 general search 的场景：
1. `google_search` / `baidu_search` / `mcp_grok_search` — 作为 source 在 search-sources.mjs 中被调用
2. `google_news` / `bing_news` — 新闻搜索 source
3. CDP fallback（Google `site:domain.com keyword`）— 某源 CDP 提取失败时的 fallback
4. Agent 直接调用 `web_fetch` 或 Jina — 对话中的即时搜索

### Jina 本地部署
- 预构建 Docker 镜像：`ghcr.io/jina-ai/reader:oss`
- 核心技术：Node.js + Puppeteer（headless Chrome）+ curl-impersonate + PDF.js + LibreOffice
- 资源消耗：CPU 2-4 核，内存 2-4GB（Chrome 是大头），磁盘 ~5GB（镜像）
- 两个端口：8080 (h2c) + 8081 (HTTP/1.1)
- 无状态模式（默认）或 S3 bucket 缓存模式
- **Pipeline 代码中 Jina 不通过 MCP 调用**——当前 pipeline 代码（`scripts/short-video/`）中没有 Jina 引用。Jina 目前只作为 MCP tool 供 Agent 直接调用。Search API Pool 实施时，Jina Search 通过 MCP 调用；如果本地部署 Jina Reader，pipeline 代码可直接 `fetch("http://localhost:3000/" + url)` 替代 MCP。

## Key References

- MCP 配置：`mcopilot_mcp_settings.json`（jina, tavily, mcp-search-bridge 三个 server）
- 管线入口：`scripts/short-video/search-sources.mjs` `collectFromSource()` 函数
- 现有 MCP 调用：`scripts/short-video/lib/mcp-client.mjs`
- Tavily 定价：https://tavily.com/pricing（1000 credits/月免费，每月1号重置）
- Jina 定价：1M tokens/月免费，每月更新
- Jina 本地部署：https://github.com/jina-ai/reader（Docker `ghcr.io/jina-ai/reader:oss`）
- Bing API 退役公告：2025-08 退役，2026-08-11 完全关闭
- 讨论：`docs/research/pipeline-simplification-discussion.md`
