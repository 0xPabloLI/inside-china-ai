# Handoff: Add Free API Sources to Source Registry

> Created: 2026-08-20
> Parent discussion: `docs/research/pipeline-simplification-discussion.md` (Topic 3)
> Trigger: User wants all viable free APIs added to source-registry.mjs, not just 3

## Context

用户在对比测试 `web_fetch` vs Jina vs CDP 后，确认需要更多免费 API 源补充管线。用户明确要求："你刚才列的可以考虑的那些源都可以加呀，不止加这三个。"

当前 `source-registry.mjs` 已有的 API 直连源：
- arXiv API（学术搜索）
- Reddit JSON API
- Hacker News Algolia API
- GitHub Search API
- OpenAlex API（学术）
- Noozra API（新闻聚合）
- GNews API（新闻搜索）
- Currents API（新闻搜索）
- CORE API（学术论文）
- DataCube AI（新闻聚合）

## Candidate Free APIs to Add

### 已测试验证可用的（对比测试 2026-08-20）

| API | URL Pattern | Auth | 成功率 | 内容质量 | 适合 Pipeline |
|-----|-------------|------|--------|----------|---------------|
| **Bing News Search** | `https://www.bing.com/news/search?q=...` | 无 | web_fetch ✅ | 高（列表+摘要） | ✅ 已在 registry，CDP 模式 |
| **Sogou Weixin** | `https://weixin.sogou.com/weixin?type=2&query=...` | 无 | web_fetch ✅ | 中（标题+链接） | ✅ 已在 registry，CDP 模式 |
| **Baidu Search** | `https://www.baidu.com/s?wd=...` | 无 | jina ✅ | 中 | ✅ 已在 registry，CDP 模式 |

### 新增候选（需要评估+接入）

#### 1. DevNews API (dev.to)
- URL: `https://dev.to/api/articles?tag=ai&per_page=10`
- Auth: 无
- 格式: JSON（title, url, description, published_at, cover_image）
- 适合: AI 技术新闻
- 接入方式: `apiSearch` direct-connect

#### 2. NewsAPI.org (有免费层)
- URL: `https://newsapi.org/v2/everything?q=...&apiKey=...`
- Auth: API Key（免费层 100 req/day，仅开发环境）
- 格式: JSON
- 限制: 免费层仅允许开发环境使用，生产需付费
- 适合: 通用新闻搜索
- 接入方式: `apiSearch` with `paidApi: false`（但标注 `devOnly: true`）
- **注意**: 需要先走 4 步评估流程（见 `docs/tools-catalog.md`）

#### 3. The Guardian API
- URL: `https://content.guardianapis.com/search?q=AI&api-key=...`
- Auth: API Key（免费，需注册）
- 格式: JSON
- 限制: 5000 req/day, 12 req/sec
- 适合: 英文主流媒体新闻
- 接入方式: `apiSearch` direct-connect

#### 4. New York Times API
- URL: `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=...&api-key=...`
- Auth: API Key（免费，需注册）
- 格式: JSON
- 限制: 500 req/day, 5 req/min
- 适合: 英文主流媒体新闻
- 接入方式: `apiSearch` direct-connect

#### 5. MediaStack
- URL: `https://api.mediastack.com/v1/news?keywords=...&access_key=...`
- Auth: API Key（免费层 500 req/month）
- 格式: JSON
- 限制: 免费层限制多（仅 HTTP, 无 HTTPS）
- 适合: 全球新闻聚合
- 接入方式: `apiSearch` with `paidApi: true`（免费层有限）

#### 6. GNews (已在 registry 但可增强)
- 已有: `https://gnews.io/api/v4/search?q=...&apikey=...`
- 可增强: 增加 `category=technology` 参数

#### 7. RSS2JSON Proxy
- URL: `https://api.rss2json.com/v1/api.json?rss_url=...`
- Auth: 无（免费层 5000 req/day）
- 格式: JSON（RSS → JSON 转换）
- 适合: 任何 RSS 源的 JSON 转换（扩展 wechat2rss 等已有 RSS 源）
- 接入方式: `apiSearch` direct-connect

#### 8. Wikipedia REST API (Reference Source)
- URL: `https://en.wikipedia.org/api/rest_v1/page/summary/DeepSeek`
- Auth: 无
- 格式: JSON（title, extract, thumbnail）
- 适合: 实体背景信息查询
- **不属于 general search**，应作为独立的 `category: "reference"` source 加入 source-registry
- 适合在 content-pipeline Stage 1（写文章时查实体信息）调用，不参与 trend/research 文章搜索
- 接入方式: `apiSearch` direct-connect, `accessMethod.primary: "api"`, 无 fallback

#### 9. Semantic Scholar API
- URL: `https://api.semanticscholar.org/graph/v1/paper/search?query=...&limit=10`
- Auth: 无（有速率限制）
- 格式: JSON（title, url, abstract, authors, year）
- 适合: 学术论文搜索（补充 arXiv + OpenAlex）
- 接入方式: `apiSearch` direct-connect

#### 10. Crossref API
- URL: `https://api.crossref.org/works?query=...&rows=10`
- Auth: 无（推荐加mailto参数）
- 格式: JSON（title, DOI, authors, published date）
- 适合: 学术论文 DOI 搜索
- 接入方式: `apiSearch` direct-connect

#### 11. Docker Hub Search (技术类)
- URL: `https://hub.docker.com/v2/search/repositories?query=...&page_size=10`
- Auth: 无
- 格式: JSON
- 适合: AI 工具/项目发现（补充 GitHub）
- 接入方式: `apiSearch` direct-connect

#### 12. Product Hunt API
- URL: `https://api.producthunt.com/v2/api/graphql`
- Auth: Bearer token（免费，需注册 OAuth app）
- 格式: GraphQL
- 适合: 新 AI 产品发现
- 接入方式: `apiSearch`（需 GraphQL query）
- **注意**: GraphQL 格式与现有 parser 不兼容，需特殊处理

#### 13. Hacker News Search (Algolia, 已在 registry)
- 已有: `https://hn.algolia.com/api/v1/search?query=...`
- 可增强: 增加 `tags=story` 和 `numericFilters=created_at_i>...` 时间过滤

## Implementation Scope

### 改动文件
1. `scripts/short-video/lib/source-registry.mjs`
   - 在对应 category 数组中添加新 source 定义
   - 每个新 source 需要：`name`, `label`, `category`, `supportsKeyword`, `accessMethod`, `apiSearch` (url, parser, authRequired)
   - 有 API Key 的源需标注 `apiKeyEnv` 字段

2. `.env.local` / `.env.local.example`
   - 添加新 API Key 环境变量
   - 用户需注册获取 key 后填入

3. 测试文件
   - `__tests__/asset-sourcer.test.mjs` 或 `__tests__/source-registry.test.mjs`
   - 每个新 API 至少 1 个 parser 单元测试

4. `docs/tools-catalog.md`
   - 更新 API 清单

### 接入原则
- **先评估再接入**：每个 API 走 `docs/tools-catalog.md` 的 4 步评估流程
- **免费优先**：无 auth 或 free tier 够用的优先
- **JSON 格式优先**：现有 `apiSearch.parser` 框架支持 JSON，非 JSON（如 RSS/XML）需额外解析器
- **paidApi 标注**：免费层有严格限制的标注 `paidApi: true`，默认跳过
- **不重复接入**：如果 CDP 模式已能提取该源，API 直连仅作为 fallback 层

## Suggested Skills

- `implement` skill — 标准 TDD 实施
- `tdd` skill — parser 单元测试
- `writing-for-agents` skill — 更新 `docs/tools-catalog.md`

## Key References

- 源文件：`scripts/short-video/lib/source-registry.mjs`（ALL_SOURCES 定义）
- 工具目录：`docs/tools-catalog.md`（4 步评估流程）
- 对比测试结果：`tmp-compare-extraction.mjs`（2026-08-20 运行结果）
- 讨论：`docs/research/pipeline-simplification-discussion.md` Topic 3
