---
name: search-pool
description: |
  三路搜索分流决策树：Search Pool CLI（多引擎 fallback REST 搜索）、curl SearXNG（本地聚合、无额度）、web-access CDP（登录态/反爬站点）。
  触发场景：agent 需要搜索主流新闻/论文/深度技术信息（Search Pool CLI）、广度探索聚合结果（SearXNG）、或抓取微信公众号/知乎/微博等需要登录态或反反爬的内容（web-access CDP）。
metadata:
  author: inside-china-ai
  version: "1.0.0"
  issue: "#265"
---

# search-pool Skill

搜索方式按目标分流：先用下表选路，不确定时从 Route A 起步，失败再降级。

## 三路分流决策树

| 目标 | 路由 |
| --- | --- |
| 主流新闻、论文、深度技术信息，质量优先，需要结构化结果 | **Route A — Search Pool CLI** |
| 广度探索、多引擎聚合、无额度顾虑的快速扫描 | **Route B — curl SearXNG** |
| 登录态/反爬站点：微信公众号、知乎、微博、小红书等；需要浏览器内交互 | **Route C — web-access CDP** |

判断要点：

- Route A 是 REST API 链（Serper > Brave > Tavily > Jina），结果干净、snippet 截断到 200 字符，消耗付费额度——不要用它做广撒网式扫描。
- Route B 是自托管 metasearch（localhost:8888），零限额、聚合最多 269 个引擎，约 2s 返回；结果是原始 JSON，相关性质量不如 Route A 的商业引擎。
- Route C 不走搜索 API——对已知反爬平台直接用浏览器 CDP 访问主站，绕过静态层。加载 `web-access` skill 后按其指引操作。
- 平台专有搜索（X/Twitter、arXiv、GitHub 等专源）不在此 skill 范围；见 `docs/tools-catalog.md` 的搜索工具表。

## Route A — Search Pool CLI

质量优先的多源 fallback：Serper > Brave > Tavily > Jina，按序尝试，第一个返回非空结果的引擎胜出。引擎缺 key 或失败（HTTP 429/5xx、0 结果、超时）自动落到下一个。

> Grok bridge（mcp-search-bridge）**不在 pool 链内**——它是 `search-sources.mjs` Layer 3 的独立 spawn 兜底（#265 明确不动该桥）。pool CLI 的 fallback 链只有上述 4 个 API 引擎，`--engine grok` 会报错。

```bash
node scripts/short-video/lib/search-pool.mjs "<query>" [--engine <serper|brave|tavily|jina>] [--max-results <n>]
```

stdout 是纯 JSON（所有日志走 stderr），直接 `JSON.parse`：

```bash
node scripts/short-video/lib/search-pool.mjs "中国 AI 芯片出口管制" --max-results 5
```

```json
{
  "articles": [
    { "title": "...", "url": "https://...", "snippet": "..." }
  ],
  "engine": "serper",
  "attempts": []
}
```

解析要点（agent 侧）：

- `articles[]`：`{title, url, snippet}`；`snippet` 截断到 200 字符。
- `engine`：实际命中的引擎名；`null` 表示全部引擎失败（此时 `articles` 为空数组）。
- `attempts[]`：失败尝试记录（缺 key、HTTP 错误、0 结果、超时等，含原因）——命中首个引擎时为空数组，用于诊断为何降级。
- 退出码：0 = 有结果或空结果（空结果也是合法输出，读 `attempts` 判断原因）；1 = 参数错误/未知引擎/异常。
- `--engine <name>` 只跑指定引擎；`--max-results <n>` 截取前 n 条。

API key 从仓库根 `.env.local` 读取（`SERPER_API_KEY` / `BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` / `JINA_API_KEY`），无需注入环境变量。

适用：中文或英文的主流新闻检索、论文发现、技术事实核实。额度敏感——单次查询即可命中时优先 `--max-results` 截取，避免为凑数反复搜索。

## Route B — curl SearXNG

本地自托管 metasearch，无额度限制，适合广度探索和多角度扫描：

```bash
curl -s 'http://localhost:8888/search?q=<url-encoded-keyword>&format=json'
```

结果在 `.results[]`，每条含 `title` / `url` / `content`（snippet）/ `engine`（来源引擎）。可加 `&language=zh-CN`、`&safesearch=0` 等参数。

运维提示：容器由 colima 托管（Watchtower 24h 自动更新）；若 JSON 返回 403，是 `settings.yml` 的 `search.formats` 被镜像更新回退，需复查配置——详见 `docs/tools-catalog.md` → SearXNG 章节。

适用：关键词发散、竞品/话题面扫描、不需要高质量排序的批量发现。不可用时（容器未启动）降级回 Route A。

## Route C — web-access CDP

登录态或反爬站点（微信公众号文章、知乎、微博、小红书等），静态搜索层拿不到内容时，直接走浏览器 CDP：

1. 加载 `web-access` skill，运行其 `check-deps.mjs` 前置检查。
2. 对目标平台优先访问主站内搜索/导航（用户浏览器天然携带登录态），而不是先构造外部搜索引擎 query。
3. 遵循 web-access 的最小交互原则：只读目标数据页、单遍顺序访问、页间拟人间隔。

适用：公开搜索引擎被 robots/反爬挡住、内容只在登录后可见、需要浏览器内翻页或交互的场景。

## 参考

- Pool 设计与引擎链实现：`scripts/short-video/lib/search-pool.mjs`（#65/#226）
- 旧 MCP 常驻消费方式已废弃：`scripts/short-video/lib/search-pool-server.mjs`（#265）
- 工具额度与路由总表：`docs/tools-catalog.md`
