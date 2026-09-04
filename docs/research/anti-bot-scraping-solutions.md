# Deep Research: Anti-Bot Scraping Solutions for Source Registry

> Generated: 2026-08-21
> Research scope: All sources in `scripts/short-video/lib/source-registry.mjs`
> Method: Web deep research (8-phase pipeline, Standard tier)
> Sources: 35+ search results across Jina Search, web_fetch, and project code analysis

## Executive Summary

本项目通过 CDP（Chrome DevTools Protocol）代理在用户真实 Chrome 浏览器中抓取约 35+ 个搜索源。当前的 CDP 方案——使用真实浏览器 session + cookies + JS 渲染——在反爬对抗中已经是一个**优秀的基础策略**，比 Puppeteer/Playwright headless 方案更有优势，因为它使用真实的浏览器 fingerprint 和已登录的 session。然而，当前方案缺少**系统化的 rate limiting、请求间隔随机化、以及 per-site 反爬策略**，这意味着在高频抓取时容易触发各平台的反爬机制。

调研发现，反爬方案必须是 **per-site 策略**，因为不同平台使用完全不同的检测机制。搜索引擎（Google/Bing/百度）主要使用 IP rate limiting + CAPTCHA + TLS fingerprinting；社交平台（B站/知乎/小红书）使用 login wall + API 签名验证 + 行为分析；新闻站通常反爬最弱。模拟人类行为的核心要素包括：随机延迟（2-10s）、header 完整性（不能只有 User-Agent）、TLS fingerprint 一致性、以及鼠标/滚动行为模拟。

## Key Findings

### 1. 搜索引擎反爬机制（Per-Engine Analysis）

#### Google Search / Google News

- **反爬等级**：极高 ⭐⭐⭐⭐⭐
- **检测手段**：
  - IP rate limiting：约 **100 次请求/小时/IP** 后开始 throttle（来源：scrapebadger.com 2026 指南 [Tier 2]）
  - CAPTCHA 触发：高频请求或异常 pattern 后返回 reCAPTCHA 页面
  - TLS/JA3 fingerprinting：检测非标准 TLS 握手特征
  - JavaScript 墙壁：搜索结果需要 JS 渲染，纯 HTTP 请求返回空壳
  - `&num=100` 参数已被 Google 移除（之前可一次获取 100 条结果）
- **绕过方案**：
  - **CDP 方案（当前方案）**：使用真实 Chrome session 是最优策略，CDP 连接的是真实浏览器实例，TLS fingerprint 天然匹配
  - Rate limiting：每 2 次查询间随机延迟 **5-15 秒**
  - 每小时不超过 **30-50 次查询**（保守上限，远低于 100 的 throttle 线）
  - 使用 Google News（`tbm=nws`）比通用搜索更宽松
  - **替代方案**：Google Custom Search JSON API（100 次/天免费，2025 后对新客户关闭注册，$5/1000 次付费）[Tier 1]
- **项目现状**：`google_search`、`google_news`、`techmeme_search`、`wechat_*` 都通过 Google 搜索。这些 source 共享同一 IP，如果同时跑会叠加请求量

#### Bing Search / Bing News

- **反爬等级**：高 ⭐⭐⭐⭐
- **检测手段**：
  - CAPTCHA + IP rate limiting（来源：scrapingbee.com 2026 指南 [Tier 2]）
  - Bing Search API 已于 **2025 年 8 月**正式停用（来源：firecrawl.com [Tier 2]）
  - 需要完整 headers（缺失 Referer/Accept 等 header 会被检测）
- **绕过方案**：
  - CDP 方案同样适用
  - Rate limiting：每查询间 **3-8 秒** 随机延迟
  - 每小时不超过 **50-80 次查询**
  - 保持 cookies 持久化（Bing 依赖 session cookies 降低怀疑度）
  - **替代方案**：SerpApi、ScrapingBee 等第三方 SERP API（付费）
- **项目现状**：`bing_news` 使用 CDP 抓取 Bing News Search 页面

#### DuckDuckGo

- **反爬等级**：中 ⭐⭐⭐（实测修正：对非浏览器请求为 ⭐⭐⭐⭐）
- **检测手段**：
  - **Anomaly detection（实测发现，2026-08-21）**：直接 `fetch()` 或 `curl` 访问 `html.duckduckgo.com` 会触发 `anomaly-modal`（异常验证弹窗），返回全 CAPTCHA 页面而非搜索结果。DOM 全是 `anomaly-modal__*` class，0 条搜索结果。
  - 这说明 DuckDuckGo 的反爬不仅基于 rate limit，还基于 **TLS 指纹 + 请求特征**检测非浏览器请求。Node.js `fetch()` 和 `curl` 的 TLS 指纹与 Chrome 不同，即使低频也被检测。
  - JS 渲染要求 + rate limit（来源：crawlbase.com [Tier 2]）
  - HTML endpoint（`html.duckduckgo.com`）返回 202/403 当触发 rate limit（来源：iproyal.com [Tier 2]）
  - 10 req/s 是 API 级别上限（来源：decodo.com [Tier 2]）
- **绕过方案**：
  - **必须通过 CDP 访问**：实测确认，通过 CDP（Chrome 真实 session + 本地代理）访问 `html.duckduckgo.com` 正常返回 10 条结果，不触发 anomaly-modal。**不能直接 `fetch()` 或 `curl`。**
  - **非 JS 版本**：`lite.duckduckgo.com` 或 `html.duckduckgo.com` 提供纯 HTML 版本，不需要 JS 渲染（来源：DuckDuckGo 官方帮助页 [Tier 1]）。但 HTML 版本仍然检测 TLS 指纹。
  - Rate limiting：每查询间 **2-5 秒** 随机延迟
  - DDGS Python 库可用（开源 scraper，无 API key）——但同样可能触发 anomaly detection
  - 对 CDP 方案来说是最友好的搜索引擎——**但仅限 CDP 方案**，直接 HTTP 请求不可行
- **项目现状**：当前 source-registry 中未配置 DuckDuckGo。**推荐添加**为 CDP 搜索源（accessMethod: cdp only）

#### 百度搜索

- **反爬等级**：高 ⭐⭐⭐⭐
- **检测手段**：
  - 验证码触发：频繁请求后弹出滑块验证码或图形验证码
  - IP rate limiting + cookie 检测
  - theHarvester 等工具的百度模块已因此 bug 报告（来源：GitHub theharvester issue #2403 [Tier 2]）
  - 结果页 DOM 结构频繁变动，selector 容易过时
- **绕过方案**：
  - CDP 方案最有效（真实 Chrome + 已有 cookies）
  - Rate limiting：每查询间 **5-10 秒** 随机延迟
  - 每天不超过 **100 次查询**（百度比 Google 更严格）
  - 保持 BIDUID 等 cookies 持久化
  - 添加 `Referer: https://www.baidu.com/` header
- **项目现状**：`baidu_search` 使用 CDP 抓取

### 2. 中文新闻站反爬机制（Per-Site Analysis）

| Source                | 反爬等级 | 检测手段             | 绕过方案                     | 当前方案         |
| --------------------- | -------- | -------------------- | ---------------------------- | ---------------- |
| 量子位 (qbitai)       | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP homepage     |
| 机器之心 (jiqizhixin) | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP search       |
| 36氪 (36kr)           | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP homepage     |
| TechCrunch            | 中 ⭐⭐  | Cloudflare 保护      | CDP + 完整 headers           | CDP category     |
| Bloomberg             | 中 ⭐⭐  | Paywall + Cloudflare | CDP（已登录 session 可突破） | CDP tech section |
| 观察者网 (guancha)    | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP homepage     |
| iThome                | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP search       |
| 新华社 (xinhua)       | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP search       |
| 澎湃新闻 (thepaper)   | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP search       |
| 雷锋网 (leiphone)     | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP search       |
| 新智元 (xinzhiyuan)   | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP search       |
| 智东西 (zhidx)        | 低 ⭐    | 基本无反爬           | CDP 直接抓取                 | CDP search       |

**新闻站总结**：中文 AI 新闻站（量子位/机器之心/36氪等）基本没有反爬保护，CDP 方案完全足够。TechCrunch 和 Bloomberg 有 Cloudflare 保护，但 CDP 使用真实浏览器 session 通常能通过。新闻站不需要特殊 rate limiting，但仍建议 **1-2 次请求/秒** 上限。

### 3. 社交/自媒体平台反爬机制（Per-Site Analysis）

#### B站 (Bilibili)

- **反爬等级**：高 ⭐⭐⭐⭐
- **检测手段**：
  - **HTTP 412 Precondition Failed**：最常见反爬信号，表示触发 rate limit 或反 bot 策略（来源：GitHub yt-dlp #5083, #14830 [Tier 2]）
  - 需要 `buvid3` cookie 才能正常访问 API（来源：yt-dlp issue [Tier 2]）
  - JavaScript 验证挑战：412 状态码要求客户端解决浏览器 JS 验证
  - IP rate limiting
- **绕过方案**：
  - CDP 方案天然携带 `buvid3` 等 cookies（真实浏览器 session）
  - 添加 `buvid3` cookie 到请求中（如果用 API 方式）
  - Rate limiting：每查询间 **3-8 秒** 随机延迟
  - 每小时不超过 **40-60 次查询**
  - MCP fallback 已配置（`bilibili_mcp_server`），CDP 失败时自动降级
- **项目现状**：`bilibili` source notes 中已标注 "Has 412 anti-bot intermittent issues"，有 MCP fallback

#### 知乎 (Zhihu)

- **反爬等级**：高 ⭐⭐⭐⭐
- **检测手段**：
  - **Login wall**：搜索页要求登录才能查看结果
  - Rate limiting：即使登录后也有频率限制
  - 请求头检测：需要完整浏览器 headers
- **绕过方案**：
  - CDP + 已登录 Chrome session（用户已登录知乎时直接可用）
  - `loginCheckScript` 已配置，检测到未登录时自动报告
  - Rate limiting：每查询间 **5-10 秒** 随机延迟
  - 无 MCP fallback，CDP 失败即丢弃
- **项目现状**：`zhihu` source 已配置 `loginCheckScript` 检测登录状态

#### 小红书 (Xiaohongshu / RedNote)

- **反爬等级**：极高 ⭐⭐⭐⭐⭐
- **检测手段**：
  - **AuthSigning 问题**：API 请求需要签名验证（来源：dev.to 2026 Xiaohongshu scraping 指南 [Tier 2]）
  - Per-IP rate limit：约 **10-20 请求/分钟/IP** 后开始限制
  - Login wall：搜索必须登录
  - 账号封禁风险：自动化操作可能导致账号被封
  - X-s/X-t 签名参数需要逆向工程
- **绕过方案**：
  - CDP + 已登录 session 是最可行方案
  - MCP fallback 已配置（`xiaohongshu_mcp_server`）
  - Rate limiting：极保守，每查询间 **10-20 秒**
  - 每天不超过 **30 次查询**
- **项目现状**：`xhs` source 已配置 `needsAuth: true` + `loginCheckScript` + MCP fallback

#### 微博 (Weibo)

- **反爬等级**：高 ⭐⭐⭐⭐
- **检测手段**：
  - 搜索页需要登录
  - API 签名验证
  - IP rate limiting
- **绕过方案**：
  - CDP + 已登录 session
  - 热搜页（`s.weibo.com/top/hot`）不需要登录，可直接抓取
  - Rate limiting：每查询间 **5-10 秒** 随机延迟
- **项目现状**：`weibo_hot` source 使用 CDP 抓取热搜页

#### X / Twitter

- **反爬等级**：极高 ⭐⭐⭐⭐⭐
- **检测手段**：
  - API 完全付费化（Free tier 仅 1500 tweets/月，只读 v2 API）
  - Guest token + doc_ids 轮换验证
  - 强制 login wall
  - 短时间内即触发 rate limit（来源：scrapfly.io 2026 指南 [Tier 2]）
- **绕过方案**：
  - CDP + 已登录 session（用户已登录 X 时）
  - `googleSiteFallback` 已配置：Google `site:x.com` 搜索
  - `mcpFallback` 已配置：mcp-search-bridge（Grok 有原生 X 数据访问）
  - Rate limiting：每查询间 **10-30 秒**，极保守
- **项目现状**：`x_search` source 有三层 fallback：CDP → Google site: → MCP/Grok

#### 微信公众号 (WeChat / Sogou)

- **反爬等级**：极高 ⭐⭐⭐⭐⭐
- **检测手段**：
  - Sogou 微信搜索（`weixin.sogou.com`）有极强反爬，CDP 返回空结果
  - `mp.weixin.qq.com` 需要微信客户端（非 Chrome）
  - Google `site:mp.weixin.qq.com` 索引量极少
- **绕过方案**：
  - 当前方案已是最优：通过 Google 搜索转发的公众号文章（虎嗅/新浪/ZAKER 等转载平台）
  - 如果有 `mp.weixin.qq.com` 后台 cookie + token，可用 `WECHAT_API_CONFIG` 直接 API 调用
  - Wechat2RSS 源（已配置）提供 RSS 订阅方式
- **项目现状**：`WECHAT_ACCOUNT_SOURCES` 和 `WECHAT_RSS_SOURCES` 已配置多源策略

### 4. API/低风险源（无需特殊反爬处理）

| Source                            | 方法        | 备注                           |
| --------------------------------- | ----------- | ------------------------------ |
| Reddit (`reddit_search`)          | JSON API    | 免费，需 User-Agent header     |
| Hacker News (`hackernews_search`) | Algolia API | 免费，无 auth                  |
| arXiv                             | API         | 免费，无 auth                  |
| GitHub                            | API         | 免费，rate limit 60/h 无 token |
| OpenAlex                          | API         | 免费，无 auth                  |
| Currents                          | API         | 免费 200 req/day               |
| Noozra                            | API         | 免费 100 req/day               |
| Grok (`mcp_grok_search`)          | MCP         | mcp-search-bridge              |

这些 API 源不需要 CDP，不会被反爬检测。只需遵守各自的 API rate limit。

### 5. 模拟人类行为的最佳实践

基于 35+ 个搜索结果的综合分析，以下是**系统化的模拟人类行为策略**：

#### 5.1 请求间隔随机化（最重要）

- **核心原则**：永远不要使用固定间隔。人类不会精确每 5 秒搜索一次。
- **推荐策略**：
  ```
  基础延迟 + 随机抖动
  base_delay = per_site_config.base_delay  // 如 5000ms
  jitter = random(0.5x ~ 1.5x) * base_delay
  total_delay = base_delay + jitter
  ```
- **Per-site 推荐延迟**：

  | 站点类型    | 基础延迟 | 随机范围 | 每小时上限 |
  | ----------- | -------- | -------- | ---------- |
  | Google 搜索 | 8s       | 5-15s    | 30-50      |
  | Bing 搜索   | 5s       | 3-8s     | 50-80      |
  | 百度搜索    | 7s       | 5-10s    | 40-60      |
  | DuckDuckGo  | 3s       | 2-5s     | 80-120     |
  | B站         | 5s       | 3-8s     | 40-60      |
  | 知乎        | 7s       | 5-10s    | 30-50      |
  | 小红书      | 15s      | 10-20s   | 20-30      |
  | 微博        | 7s       | 5-10s    | 30-50      |
  | X/Twitter   | 15s      | 10-30s   | 15-25      |
  | 新闻站      | 1s       | 0.5-2s   | 100-200    |
  | API 源      | 0.5s     | 0.3-1s   | 不限       |

#### 5.2 Header 完整性

- **核心原则**：不要只设置 `User-Agent`。反爬系统检测 header 的**完整性**和**顺序**。
- **CDP 优势**：CDP 使用真实 Chrome，headers 自动正确——这是 CDP 相比 Puppeteer/Playwright 的最大优势
- **如果用 HTTP 请求**，需要完整 header set：
  ```http
  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...
  Accept: text/html,application/xhtml+xml,application/xml;q=0.9,...
  Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
  Accept-Encoding: gzip, deflate, br
  Referer: https://www.google.com/
  Connection: keep-alive
  Upgrade-Insecure-Requests: 1
  ```
- **Header 顺序**：现代反爬系统检查 header 顺序是否匹配真实浏览器（来源：scrapingbee.com PerimeterX bypass 指南 [Tier 2]）

#### 5.3 TLS / JA3 Fingerprinting

- **检测原理**：每个 TLS 客户端的 ClientHello 消息有独特的指纹（JA3 hash），不同 HTTP 库的指纹与真实浏览器不同
- **CDP 优势**：CDP 连接真实 Chrome，TLS fingerprint 天然正确
- **HTTP 请求风险**：`fetch()` / `requests` / `axios` 的 TLS fingerprint 与 Chrome 不同，可被检测
- **Node.js fetch 注意**：项目 `collectFromApi()` 用的 `fetch()` 有 TLS fingerprint 差异风险，但仅对 API 源（Reddit/HN/arXiv）来说这些 API 不检测 TLS

#### 5.4 CDP 检测向量与规避

- **CDP 可被检测**：虽然 CDP 使用真实 Chrome，但 CDP 连接本身会留下痕迹（来源：octobrowser.net [Tier 2], datadome.co [Tier 2]）
- **已知检测向量**：
  1. `navigator.webdriver` 属性（CDP 连接时可能为 `true`）
  2. `window.cdc_` 前缀变量（Chrome DevTools 注入的内部变量）
  3. CDP Runtime.evaluate 调用的时间特征（anti-fraud 可通过 timing analysis 检测）
  4. `--enable-automation` 命令行 flag
- **CDP 连接到已启动的 Chrome 的优势**：本项目通过 `localhost:3456` CDP 代理连接用户**已手动启动**的 Chrome（非 Puppeteer 启动），因此 `navigator.webdriver` 为 `false`，`--enable-automation` flag 不存在。这是**最隐蔽的 CDP 使用方式**
- **残余风险**：CDP eval 调用的 timing pattern 仍可被高级反爬检测，但对本项目抓取的站点（新闻站为主）影响极低

#### 5.5 行为模拟（鼠标/滚动）

- **高级反爬系统检测**：鼠标移动轨迹（直线移动 = 机器人）、滚动行为、点击模式
- **实现方式**：
  - 贝塞尔曲线鼠标轨迹模拟（来源：ResearchGate 2025 论文 [Tier 1]）
  - `HumanCursor` Python 库可模拟真实鼠标移动（来源：GitHub HumanCursor [Tier 2]）
  - `humanization-playwright` PyPI 包提供 Playwright 人类行为模拟
  - 每次小移动后 10-60ms 随机延迟（来源：IJIRT 论文 [Tier 1]）
- **项目适用性**：对于搜索页面抓取（只需打开 URL → 等待加载 → 提取 DOM），鼠标行为模拟**非必需**。只有在需要点击/滚动加载更多结果的场景才需要

#### 5.6 指数退避重试

- 当收到 429 (Too Many Requests) 或 503 (Service Unavailable) 时：
  ```
  retry_delay = base_delay * 2^retry_count + random_jitter(0-1000ms)
  max_retries = 3
  ```
- 当前 `cdp-client.mjs` 有 `RETRY_WAIT_MS = 3000` 固定重试间隔，建议改为指数退避 + 随机抖动

### 6. Google 搜索请求量管理（最关键风险点）

项目中有多个 source 都走 Google 搜索：

- `google_search` — 通用搜索
- `google_news` — 新闻搜索
- `techmeme_search` — `site:techmeme.com` 搜索
- `wechat_dongchabeating` 等微信公众号 — `"来自微信公众号" "xxx"` 搜索

**风险**：如果 trend 模式同时跑这些 source，Google 看到的是同一 IP 在短时间内发起多次搜索，**请求量叠加**。

**建议**：

1. **Google 搜索源串行化**：所有走 Google 的 source 串行执行，之间间隔 5-15 秒随机延迟
2. **Google 搜索总量上限**：单次 trend/research 运行中，Google 搜索总次数不超过 **20 次**（保守）
3. **区分 Google 搜索变体**：`google_search` + `google_news` 可合并为一次搜索 + `tbm=nws` 切换
4. **Google site: 搜索合并**：`techmeme_search` 和 `wechat_*` 都是 `site:` 或引号搜索，可考虑批量用 Google OR 语法合并

## Detailed Analysis

### 当前 CDP 方案的优势

项目的 CDP 代理方案（`localhost:3456`）连接到用户**手动启动的 Chrome**（非自动化启动），这带来了几个天然优势：

1. **真实 TLS fingerprint**：Chrome 的 TLS ClientHello 与反爬系统期望的完全匹配，无需 TLS spoofing
2. **真实 cookies 和 session**：用户已登录的知乎/B站/小红书/X 等平台的 session cookies 自动携带
3. **`navigator.webdriver = false`**：手动启动的 Chrome 不会设置 webdriver flag
4. **无 `--enable-automation`**：不会触发 Chrome 自动化检测
5. **真实浏览器 fingerprint**：Canvas、WebGL、AudioContext 等 fingerprint 全部真实
6. **无 headless 检测风险**：非 headless 模式，`navigator.userAgent` 不包含 "HeadlessChrome"

### 当前方案的不足

1. **无系统化 rate limiting**：`PAGE_LOAD_WAIT_MS = 3000` 是固定的页面加载等待时间，不是请求间间隔控制
2. **无 per-site 差异化策略**：所有 CDP source 使用相同的 3 秒等待，但小红书应该比新闻站慢得多
3. **固定重试间隔**：`RETRY_WAIT_MS = 3000` 固定值，不符合人类行为模式
4. **无 CAPTCHA 检测**：`checkLogin` 只检测 `need_login` 和 `captcha`，但 captcha 检测依赖 source-specific script，非通用的
5. **无 Google 请求量汇总控制**：多个 Google 搜索 source 独立运行，不感知彼此的请求量
6. **无请求失败后的指数退避**：只 retry 一次固定 3 秒

### 推荐改进方案（优先级排序）

#### P0：Rate Limiter 模块（必须）

新建 `scripts/short-video/lib/rate-limiter.mjs`：

- Per-site 配置：`baseDelay`, `jitterRange`, `maxPerHour`
- 请求间随机延迟：`await rateLimiter.wait(sourceName)`
- 每小时请求计数 + 超限自动暂停
- Google 搜索源共享一个 rate limiter（同一域名 `google.com`）

```javascript
const SITE_RATE_CONFIG = {
  "google.com": { baseDelay: 8000, jitter: [0.5, 1.5], maxPerHour: 30 },
  "bing.com": { baseDelay: 5000, jitter: [0.6, 1.4], maxPerHour: 60 },
  "baidu.com": { baseDelay: 7000, jitter: [0.7, 1.3], maxPerHour: 40 },
  "bilibili.com": { baseDelay: 5000, jitter: [0.6, 1.4], maxPerHour: 50 },
  "zhihu.com": { baseDelay: 7000, jitter: [0.7, 1.3], maxPerHour: 40 },
  "xiaohongshu.com": { baseDelay: 15000, jitter: [0.6, 1.4], maxPerHour: 20 },
  // news sites: 默认配置
  _default: { baseDelay: 1000, jitter: [0.5, 2.0], maxPerHour: 200 },
};
```

#### P1：指数退避重试（重要）

修改 `cdp-client.mjs` 的重试逻辑：

- 第 1 次重试：3-5s 随机
- 第 2 次重试：6-10s 随机
- 第 3 次重试：12-20s 随机 + 放弃
- 如果收到 429/503，自动退避到更长延迟

#### P2：CAPTCHA 检测通用化（重要）

当前只有少数 source 有 `loginCheckScript`。添加通用 CAPTCHA/反爬检测：

```javascript
const GENERIC_ANTI_BOT_INDICATORS = [
  "unusual traffic",
  "captcha",
  "robot",
  "验证码",
  "人机验证",
  "access denied",
  "blocked",
  "429",
  "precondition failed",
];
```

在 `collectFromCdp()` 中，提取结果前先检测页面文本是否包含这些指标。

#### P3：添加 DuckDuckGo 搜索源（推荐）

DuckDuckGo 是最友好的搜索引擎，可作为 Google/Bing 的补充：

- URL: `https://html.duckduckgo.com/html/?q={keyword}`（非 JS 版本，轻量）
- Rate limit 宽松：10 req/s 上限
- 无 CAPTCHA 风险
- 可作为 Google 的 fallback source

#### P4：Google 搜索源合并（优化）

将 `google_search` + `google_news` 合并为一个 source，通过参数控制搜索类型，减少 Google 请求总量。

## Contrarian Views & Risks

### 1. CDP 并非万能

虽然 CDP 连接真实 Chrome 有很多优势，但高级反爬系统（DataDome、Cloudflare Bot Management）仍可通过 CDP 的 timing analysis 和 Runtime.evaluate 调用模式检测自动化（来源：octobrowser.net [Tier 2], datadome.co [Tier 2]）。然而，本项目抓取的站点中**没有使用 DataDome 级别反爬的**，所以这个风险在当前 scope 下不成立。

### 2. 过度保守的 rate limiting 可能导致效率过低

如果对所有站点都施加严格的 rate limiting，trend discovery 一次完整运行可能需要 10-20 分钟。但考虑到本项目每天最多运行 1-2 次 trend discovery，这是可接受的。

### 3. 免费替代方案的可持续性

DuckDuckGo 的 HTML endpoint 目前免费且宽松，但 DuckDuckGo 可能随时收紧（如 2024 年 10 月已有用户报告新的 rate limit，来源：Reddit r/duckduckgo [Tier 3]）。Google Custom Search API 已对新客户关闭。不要过度依赖免费服务的持续可用性。

## Open Questions

1. **是否有必要引入代理 IP 轮换？** 目前所有请求来自同一 IP（用户家庭网络 + 本地代理出口）。对于当前的使用频率（每天 1-2 次完整运行），单 IP + 合理 rate limiting 应该足够。但如果未来需要提高频率，residential proxy 轮换可能成为必需。
2. **鼠标行为模拟是否值得实现？** 对于搜索页面抓取（打开 URL → 等待 → 提取 DOM），鼠标行为模拟的 ROI 很低。但如果未来需要抓取需要滚动加载或点击展开的页面，则需要。
3. **是否需要 robots.txt 检查？** 大多数搜索引擎和新闻站的 robots.txt 允许搜索结果抓取（搜索引擎本身就是在抓取全网），但社交平台的 robots.txt 可能禁止搜索页抓取。法律风险需单独评估。

## Sources

1. https://scrapebadger.com/blog/how-to-scrape-google-search-results-without-getting-blocked-2026-complete-guide — Google scraping 2026 完整指南，100 req/hr 阈值 — [Tier 2]
2. https://scrapingbee.com/blog/best-bing-search-api-alternatives/ — Bing Search API 替代方案 2026 — [Tier 2]
3. https://iproyal.com/blog/duckduckgo-api/ — DuckDuckGo API 开发者指南 2026，HTML endpoint 202/403 — [Tier 2]
4. https://duckduckgo.com/duckduckgo-help-pages/features/non-javascript — DuckDuckGo 非 JS 版本官方文档 — [Tier 1]
5. https://decodo.com/scraping/web/duckduckgo-scraper-api — DuckDuckGo scraper 10 req/s 限制 — [Tier 2]
6. https://developers.google.com/custom-search/v1/overview — Google Custom Search JSON API 官方文档，100 req/day 免费 — [Tier 1]
7. https://blog.expertrec.com/google-custom-search-json-api-simplified/ — Google Custom Search 2025 后对新客户关闭 — [Tier 2]
8. https://www.firecrawl.dev/blog/bing-search-api-alternatives — Bing Search API 2025-08 停用 — [Tier 2]
9. https://github.com/yt-dlp/yt-dlp/issues/5083 — B站 412 Precondition Failed，buvid3 cookie 修复 — [Tier 2]
10. https://github.com/yt-dlp/yt-dlp/issues/14830 — B站 412 anti-bot 策略分析 — [Tier 2]
11. https://brightdata.com/blog/web-data/how-to-scrape-bilibili — B站 scraping 2026 指南 — [Tier 2]
12. https://dev.to/sami_8858131362756585e4f4/how-to-scrape-rednote-xiaohongshu-with-python-in-2026 — 小红书 AuthSigning 问题，10-20 req/min/IP — [Tier 2]
13. https://scrapfly.io/blog/posts/how-to-scrape-twitter — X/Twitter scraping 2026，三层验证 — [Tier 2]
14. https://blog.octobrowser.net/cdp-leaks-in-puppeteer-how-anti-fraud-systems-detect-automation-through-chrome-devtools-protocol — CDP 检测向量分析 — [Tier 2]
15. https://datadome.co/threat-research/how-new-headless-chrome-the-cdp-signal-are-impacting-bot-detection/ — Headless Chrome + CDP signal 对 bot detection 的影响 — [Tier 2]
16. https://stackoverflow.com/questions/79582148/how-to-avoid-detection-when-using-cdp-chrome-devtools-protocol-with-playwright — CDP 检测规避讨论 — [Tier 3]
17. https://www.scoredetect.com/blog/posts/behavioral-mimicry-web-crawling-explained — 行为模拟爬虫解释 — [Tier 2]
18. https://github.com/riflosnake/HumanCursor — HumanCursor Python 库，人类鼠标轨迹模拟 — [Tier 2]
19. https://pypi.org/project/humanization-playwright/ — humanization-playwright PyPI 包 — [Tier 2]
20. https://www.researchgate.net/publication/393981520 — 贝塞尔曲线鼠标轨迹论文 2025 — [Tier 1]
21. https://scrape.do/blog/web-scraping-rate-limit/ — Rate limiting 5 种绕过方法 — [Tier 2]
22. https://www.zenrows.com/blog/web-scraping-without-getting-blocked — 14 种反爬绕过方法 — [Tier 2]
23. https://brightdata.com/blog/web-data/web-scraping-without-getting-blocked — 12 种反爬技术 — [Tier 2]
24. https://www.capsolver.com/blog/All/best-user-agent — 最佳 User-Agent 列表和轮换策略 — [Tier 2]
25. https://zackproser.com/blog/web-scraping-without-getting-blocked — 1 req/s rate limiting 经验法则 — [Tier 2]
26. https://github.com/laramies/theharvester/issues/2403 — theHarvester 百度搜索模块因反爬 bug — [Tier 2]
27. https://www.scrapingbee.com/blog/web-scraping-without-getting-blocked/ — 2026 反爬完整指南，TLS fingerprinting — [Tier 2]
28. https://scrapingant.com/blog/proxy-strategy-in-2025-beating-anti-bot-systems-without — 2025 代理策略 — [Tier 2]
29. https://www.iwebscraping.com/bypass-anti-bot-detection-web-scraping/ — 2026 反爬绕过方案 — [Tier 2]
30. https://scrapfly.io/blog/posts/how-to-bypass-anti-bot-protection-when-web-scraping — 反爬保护绕过 5 通用技术 — [Tier 2]
31. https://lightpanda.io/blog/posts/cdp-vs-playwright-vs-puppeteer-is-this-the-wrong-question — CDP vs Playwright vs Puppeteer 对比 — [Tier 2]
32. https://browser-use.com/posts/playwright-to-cdp — 从 Playwright 迁移到 CDP — [Tier 2]
33. https://www.reddit.com/r/duckduckgo/comments/1fy3gr9/new_duckduckgo_api_rate_limits/ — DuckDuckGo 2024 新 rate limit 报告 — [Tier 3]
34. https://github.com/niespodd/browser-fingerprinting — 浏览器 fingerprinting 反爬分析 — [Tier 2]
35. https://www.reddit.com/r/sysadmin/comments/ajn79x/searches_getting_rate_limited_by_google/ — Google 搜索 rate limit 实际经验 — [Tier 3]

## Design Decisions & References

- **CDP 方案选择依据**：项目 `cdp-client.mjs` 连接 `localhost:3456` CDP 代理，代理连接用户手动启动的 Chrome（非 Puppeteer/Playwright 自动启动）。这避免了 `navigator.webdriver=true`、`--enable-automation` flag、headless 检测等常见检测向量。参考来源 [14][15][16]。
- **Rate limiting 数值依据**：Google 100 req/hr 阈值来自 [1]；小红书 10-20 req/min/IP 来自 [12]；通用 1 req/s 法则来自 [25]。推荐值取保守下限的 50-70%。
- **DuckDuckGo HTML endpoint**：官方支持非 JS 版本 [4]，是唯一不需要 JS 渲染的搜索引擎，适合作为轻量 fallback。
- **B站 buvid3 cookie**：CDP 方案天然携带此 cookie，无需额外处理。参考 [9]。
- **TLS fingerprinting 风险**：仅对 HTTP 请求源有效，CDP 方案使用真实 Chrome，TLS fingerprint 天然正确，不受此检测影响。参考 [27][30]。
- **行为模拟 ROI 分析**：搜索页面抓取只需 open URL → wait → extract DOM，不涉及点击/滚动交互，因此鼠标轨迹模拟（HumanCursor、贝塞尔曲线等）的 ROI 极低。仅在需要无限滚动加载的场景才值得引入。参考 [17][18][20]。
