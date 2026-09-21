# Selector Auto-Healing Runbook (#140 P5)

> 触发：`node scripts/short-video/selector-health.mjs` 报某 CDP 源 `zero_results`（或 #200 sourceHealth 连续零结果 streak ≥3）。
> 本文档是修复 agent 的执行手册——修复是 agent 驱动的，脚本只负责发现。

## 循环

```
selector-health.mjs（发现）→ 本 runbook（修复）→ selector-health.mjs --only <源>（验证）
```

## 修复步骤（对每个 failing 源）

1. **确认是 DOM 变更，不是内容真空**：换一个常见关键词（如「人工智能」）再跑一次该源。多关键词仍 0 条才继续；单关键词 0 条可能是当天没新闻。
2. **打开真实页面检查 DOM**：
   ```bash
   node --input-type=module -e "
   const { cdpNewTab, cdpCloseTab, cdpEval } = await import('<repo>/scripts/short-video/lib/cdp-client.mjs');
   const t = await cdpNewTab('<该源 url(关键词)>');
   const html = await cdpEval(t, 'document.body.innerHTML.slice(0, 30000)');
   console.log(html?.result?.value ?? html?.value);
   await cdpCloseTab(t);"
   ```
   也可以把 HTML 存文件后离线分析。注意先过 `detectAntiBot`——拦截页上的"DOM"没有分析价值。
3. **从真实 DOM 推导新选择器**：找结果条目的稳定容器（class/id/结构关系），优先组合选择器而不是单一 class；旧脚本的选择器做交叉比对，确认旧失效原因（class 改名 / 结构层级变化 / 懒加载）。
4. **离线验证新脚本**：把新 articleScript 包在 `document.querySelectorAll(...)` 骨架里，对着第 2 步存的 HTML 用 `node --input-type=module -e` + JSDOM？——没有 JSDOM 依赖，直接回真实页测：
   ```bash
   node --input-type=module -e "
   const { cdpNewTab, cdpCloseTab, extractFromTab } = await import('.../cdp-client.mjs');
   const t = await cdpNewTab('<url>');
   const r = await extractFromTab(t, '<新脚本>');
   console.log(r.length, JSON.stringify(r.slice(0, 2)));
   await cdpCloseTab(t);"
   ```
   验收：≥3 条、每条有 title + url、抽样 URL 真实可访问。
5. **回归守卫**：跑 `selector-health.mjs --only <源>` 转绿；再跑同域相邻源（如 bing_news）确认没有顺手改坏。
6. **落库**：修 `lib/source-registry.mjs` 对应条目的 `articleScript`（pathspec 提交，`Session-Id` trailer）；issue #140 留一行修复记录（源名 / 旧失效原因 / 新选择器要点 / 验证计数）。

## 边界

- 只改 `articleScript` / `loginCheckScript` / `imageScript` 的选择器；不改 url、不改 fallback 链、不改 anti-bot 阈值。
- needsAuth 源（xhs、douyin）若失败原因是 `need_login`，那是登录态过期——提示用户人工登录，不是选择器问题，**不要**改脚本。
- `anti_bot` 失败不修选择器——那是风控，归 #140 P1/P2 机制处理。
- 一轮只修实测坏掉的源；"顺手优化"健康源的选择器是被禁止的（每个 healthy 源都是活体证据，别动它）。

## Design Decisions

- **修复是 agent 驱动，脚本只负责发现**：选择器修复需要读真实 DOM 并判断语义，脚本化重写不可靠；体检脚本与修复 runbook 分离，发现（可自动化）与修复（需判断）各司其职。
- **health 覆盖双主通道**：apiSearch 化的源（如 zhidx/weibo_hot）从 CDP 体检转入 `checkApiSource`（fetch + parser），保证主通道变更不产生体检盲区。
- **healthy 源禁止顺手优化**：每个 health 转绿的源都是活体证据；无症状重写选择器只会引入新回归。
- **不可修 ≠ 删源**：上游死亡（xinzhiyuan/baidu_news）保留 registry 条目零成本观察，移除属用户裁决；修复手段优先于移除（zhidx/weibo_hot 均为 API 破局而非弃用）。
- **Chrome 恢复阶梯**：代理是仓库自有工具可自由重启；Chrome 属用户资产，agent 永不代杀（见 Hard Safety Gates）。

## Chrome 安全规程（profile 守卫）

- **绝对禁止**：`pkill -9 Chrome` / `killall Chrome`（unclean kill 可损坏 profile 的 LevelDB——锁文件与 session 数据）；`rm`/移动 `~/Library/Application Support/Google/Chrome/` 下任何内容；任何 "Reset/Cleanup" 类操作。杀进程不等于删 profile，但 unclean kill 是 profile 损坏的最常见来源。
- **CDP 代理僵死的恢复阶梯**：① 只重启代理（`skills/web-access/scripts/cdp-proxy.mjs`，仓库自有工具，与 Chrome 零接触）；② 代理重启后仍 WS 连接失败而 `curl localhost:9222/json/version` 正常 → Chrome DevTools 层卡死，**由用户**优雅退出 Chrome（⌘Q 或 `osascript -e 'quit app "Google Chrome"'`）再带 `--remote-debugging-port=9222` 重启——优雅退出不触碰 profile 数据。Agent 不得代替用户杀/退 Chrome。
- 长跑注意：一次体检 ≈30 次导航，连续多轮压测会让 DevTools WS 层进入僵死——多轮之间留冷却，或分批 `--only` 跑。

## 逐源修复方法论（#269 Phase 2 定案，2026-09-21）

> 上游 runbook 修的是**选择器**（DOM 变了、articleScript 抓空）。本节修的是更靠前的一层：**搜索 URL 模式本身死了**（404 / 被重定向回首页）。两者失败层级不同——ITHome 案例里 articleScript 完全正常，死的是 `search?word=` 端点，且兜底分支把首页 534 条链接当成「搜索结果」静默入库（#269 Phase 1 实证）。本节是这一层的执行方法论。

### 触发与对象

- **触发**：`judgeUrlProbe`（Phase 1）判 `http-status` / `redirected-home` / `redirected-off-search`，或 quarantine 名单里带这类探针证据的源。
- **对象**：按源批量清扫，**不为每个失败单独开票**；失败已有三层记录（source-health 连败名单 / quarantine 名单含探针证据 / 逐 run trajectory）。
- **前置**：先跑批量诊断 `node scripts/short-video/source-url-sweep.mjs`，产物 `output/source-url-sweep-<date>.json` 是本节五步法的输入。

### 五步法（每源）

| 步 | 动作 | 判据（怎样算成立） |
| --- | --- | --- |
| 1 | **URL 探针**：GET 该源 `url(keyword)`，跟随重定向 | ≥400 → `http-dead`；final path ≡ 首页路径 → `redirected-home`；跨域 → `redirected-off-site`；200 但关键词 0 命中 → `alive-no-keyword`（JS 渲染或内容真空，转第 2/5 步） |
| 2 | **静态发现**：抓首页 HTML，抽 `<form action> + <input name>` 拼新搜索 URL；再看首页 search 形态链接；最后才试已知模板（`/search?q=` 等） | 候选 200 **且**关键词命中 > 0 → 新 URL 模式确认 |
| 3 | **RSS 对照探测**：首页 `<link rel=alternate type=application/rss+xml>` + 常见 feed 路径 | `itemCount > 0` 且 pubDate 落在关注窗口内 → feed 形态确认 |
| 4 | **形态对比选优**：在确认的形态里排优先级——**RSS/API > 新 URL 模式 > 页内搜索配方**（配方依赖选择器，最脆弱，只作备选降级形态，不作主路径） | 最优做主形态，其余登记为该源 fallback |
| 5 | **CDP 兜底**：1–4 全部无解时才上交互式 CDP（首页 → 定位搜索框 → 输入关键词 → 提交 → 收割结果链接），用于发现 JS 渲染站点的新端点 | 实测 ≥3 条且每条有 title + url，抽样 URL 真实可访问 |

### 探针纪律（三条实测教训）

1. **api 源必须探 `apiSearch.url`，不能探它的 CDP `url` 字段**——后者只是历史遗留形态。误探会把健康源报成死源：gnews（CDP 字段 404，真实端点 `/api/v4/search` 400 = 缺 key）、openalex（CDP 字段 403，真实端点 200）都是这么被冤枉的。
2. **`supportsKeyword: false` 的 listing/feed 源同样要扫**——URL 不带关键词不代表不会死（techcrunch / guancha / qbitai / telegram_aipost 都在连败名单里）。这类源跳过关键词相关性判据（`keywordHits` 传 null），只判状态与重定向。
3. **网络抖动必须重试后再定性**：本机代理会间歇断连，单次失败直接记 `network-error` 会产生假死源。脚本对每个源的主探针自带一次重试；报告里仍出现 `network-error` 的，需人工复测后再下结论。另：Node 的 fetch 默认**不读** `HTTP_PROXY`，须 `NODE_USE_ENV_PROXY=1`（Node ≥ 22.15），否则全量 ENOTFOUND。

### 落库与开票规则

- **有可行修复** → 为该源开一张修复建议票（同源去重：该源已有 open 票则不重开），票面必须带：探针证据、候选 URL 或 feed 的实测计数、registry diff 草案。
- **全部不可行** → 维持 quarantine + 7 天复检，**不开票**（沿用「不可修 ≠ 删源」：上游死亡保留条目零成本观察）。
- **needsAuth 源**（xhs/douyin）若失败原因是登录态过期，不修 URL 也不修选择器——提示用户人工登录。
- **anti_bot** 失败不修——那是风控，不是 URL 模式问题。
- **healthy 源禁止顺手优化**：批量诊断里 `alive` 的源一律不动。

### 判据的三个坑（首轮清扫实测踩到，2026-09-21）

1. **必须先分清探测的是哪条链**：`api` 源的失效发生在 `apiSearch.url`，不是遗留的 CDP `url` 字段。首轮先探 `url` 时 openalex（403）、gnews（404）、zhidx（重定向首页）三个**本健康的源**被误报成死源；改探 `apiSearch.url` 后三者全绿（openalex 200/171 命中）。
2. **200 + 关键词命中 ≠ 结果页**：新华 `www.news.cn/search?q=…` 返回 200 且正文含关键词，实为错误模板页 → 加 `looksLikeResults()`（排除 ErrorPageTemplate/40x 标题，并要求 ≥3 条有真实锚文本的链接）。同理，从 `redirected-off-site` 页面推出的候选（google/techmeme 被弹到 `howsearchworks`）一律视为**弱证据**，需人工或 CDP 复核。
3. **状态码语义要分开**：429（限流）、401（凭据）、403（反爬/风控）都不是「URL 模式死亡」，但旧判据一律归 `http-dead` → core_search 429 被判死、reddit 403 被判死。语义分流留作独立小票（见 #269 评论与 triage 台账）。

### 为什么「发现」要脚本化而「修复」不

发现是确定性的（HTTP 状态、关键词命中、feed 条数），可以全量自动跑且证据可复现；修复要判断形态取舍与语义等价性（feed 覆盖度是否等价于搜索结果），交给 agent。所以本节的脚本只产出**诊断结论 + 候选证据**，registry 改动仍走人工/agent 裁决后的独立提交。

### 首轮全量清扫台账（2026-09-21，34 源，keyword zh=人工智能 / en=AI）

产物：`scripts/short-video/output/source-url-sweep-2026-09-21.json`；命令 `NODE_USE_ENV_PROXY=1 node scripts/short-video/source-url-sweep.mjs`。

| 处置 | 源 | 实测 |
| --- | --- | --- |
| **可修 → 已开票** | ithome | `search?word=` 404（首页 200，站点活）；首页无搜索表单（JS 渲染）；`https://www.ithome.com/rss/` 200 / 60 条 / 最新 2026-09-21T16:17Z |
| **静态无解，待 CDP → 已开票** | xinhua、jiqizhixin | xinhua `search/news.htm?keyword=` 404，6 个候选全死（含错误模板页误报）；jiqizhixin 200 但 0 命中（SPA，静态看不到结果） |
| **判据缺陷（非 URL 死）→ 已开票** | core_search、gnews、reddit_search、google_search / bing_news / techmeme_search | 429 限流 / 400 缺 key / 403 反爬 / 重定向到 consent 页，被旧判据一律归 `http-dead` |
| **登录态与反爬，按边界不修** | weibo_search、douyin、zhihu、threads_search、tiktok_creator | 登录墙跳转（passport.weibo.com）/ 403 / 401 / JS+登录 |
| **环境依赖，不修** | searxng_search（localhost:8888 未起）、mcp_grok_search（无 url）、currents（超时） | 自托管实例与网络 |
| **健康，禁止顺手优化** | thepaper、leiphone、zhidx(api)、xhs、sogou_weixin、bilibili、x_search、youtube_search、arxiv_search、github_search、noozra_search、openalex_search、hackernews_search、polymarket_search、digg_search、duckduckgo_search | 200 + 关键词命中 + 结果页形态 |

## 已知修复台账

| 日期               | 源                    | 失效原因                                                                                                      | 修复要点                                                                                                                                                 | 验证                                                    |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 2026-09-07         | google_search         | Google 新新闻垂直 SERP：结果块改 `div[data-ved][data-hveid]`，标题改 `div[role="heading"]`，`div.g`/`h3` 消失 | articleScript/imageScript 重写为新结构；缩略图为 base64 data URI，仅 http 图标记 type=image（可下载），data URI 降级 text；外链过滤 google 域 + URL 去重 | health --only 1/1 绿，10 条全结构（title/url/imageUrl） |
| 2026-09-07         | leiphone              | 搜索结果标题改为 `a.headTit` 链接，旧 `.article-list`/`article` 容器归零                                      | articleScript 改为 `a.headTit[href*=".html"]` 直取                                                                                                       | health --only 绿，16 条                                 |
| 2026-09-07         | wechat_dongchabeating | Google 站内搜索同吃新 SERP 改版（`div.g` 归零）                                                               | 同 google_search 方案（新 DOM + 转载域白名单）                                                                                                           | health --only 绿，1 条                                  |
| 2026-09-07         | weibo_hot             | 登录墙（Sina Visitor System）                                                                                 | **经调研破局**：切 60s 公共 API（60s.viki.moe/v2/weibo，开源可自托管），apiSearch 化                                                                     | health 绿，50 条/2.3s                                   |
| 2026-09-07         | zhidx                 | 搜索结果 XHR 渲染，CDP 抓不到                                                                                 | **经调研破局**：站点是 WordPress，切 wp-json REST API，apiSearch 化                                                                                      | health 绿，20 条/2.6s                                   |
| 2026-09-07（放弃） | xinzhiyuan            | DNS 解析 overdue.aliyun.com——主机欠费停放                                                                     | 放弃；公众号内容已由 wechat2rss_zhinengyuan 覆盖                                                                                                         | —                                                       |
| 2026-09-07（放弃） | baidu_news            | 资讯索引功能性死亡（ns 端点空壳 218 字节，热词 0 结果）                                                       | 放弃；详见 docs/research/zh-source-recovery-research-2026-09.md                                                                                          | —                                                       |

## CDP 代理 wsPath 陈旧坑（2026-09-07 修复）

`DevToolsActivePort` 文件缓存的浏览器级 WS 路径与 Chrome 活值脱节时，代理报「连接失败」而 `curl localhost:9222/json/version` 正常——其他 session 正常、本 session 不通的假象即来源于此。已修 `skills/web-access/scripts/cdp-proxy.mjs`：WS 握手失败自动回退 `/json/version` 活值重试。注意 `skills/` 与 agent-harness 仓手动同步，此修复需带过去。
