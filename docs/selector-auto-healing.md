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
- **CDP 代理僵死的恢复阶梯**：① 只重启代理（`skills/web-access/scripts/cdp-proxy.mjs`，仓库自有工具，与 Chrome 零接触）；② 代理重启后仍 WS 连接失败而 `curl localhost:9229/json/version` 正常 → Chrome DevTools 层卡死，**由用户**优雅退出该实例（⌘Q 或 `osascript -e 'quit app "Google Chrome"'`）再按上条与 `docs/analytics-workflow.md` 的启动块重启——优雅退出不触碰 profile 数据。Agent 不得代替用户杀/退 Chrome。**注意 9222 不能用作这个判据**：Chrome 136+ 禁止在默认 profile 目录上开远程调试，你日常 Chrome 的 9222 虽然 LISTEN 但 `/json/version` 与 `/json/list` **一律 404**（2026-09-22 实测），拿它做探活永远是假阴性。
- 长跑注意：一次体检 ≈30 次导航，连续多轮压测会让 DevTools WS 层进入僵死——多轮之间留冷却，或分批 `--only` 跑。
- **用哪个 profile 决定了「登录门」结论的真假（2026-09-22 三补轮，用户当场纠正）**：CDP 实例必须是 **`~/chrome-tiktok-profile`**，端口 **9229**（agent-harness 的 3456 代理自 9/19 起就钉在 9229）。**不要另起空 profile**：`~/.chrome-cdp` 是个无登录态的闲 profile，`WEB_ACCESS_CDP_PORT` 一旦指到它，所有「登录墙」判决都会变成「这个 profile 没登录」的投影。
- **这条约定仓库里早就写了，且 2026-09-23 已升级为代码级守卫**：`docs/analytics-workflow.md` §TikTok 专用登录实例 / `docs/reviews/source-chain-audit-2026-09-15.md` §运维事实 / `docs/issue-roadmap.md` 2026-09-19 inventory ⑤（「仅 1 个自动化罐，无冗余」）三处均有记载，AGENTS.md §Chrome 守卫也钉了硬规则。**动手前跑 `npm run cdp:ensure`**（exit 1 = 端口跑的不是自动化 profile 或没起；`--start` 可起，`--print-cmd` 打印权威命令）。
  - 代码守卫 = `scripts/short-video/lib/cdp-profile-guard.mjs`（四态判定 `ok` / `no-chrome` / `wrong-profile` / `unknown-profile`；**启动命令的唯一权威副本是 `launchCommand()`，文档不得抄**）；生产管线 `main.mjs` 在 Step 0.1 自动跑（`cdp-preflight.mjs`），默认告警、`CDP_REQUIRE_AUTOMATION_PROFILE=1` 改硬失败。
  - 为什么必须是代码：用错 profile **不会报错**，只会静默把「登录墙」变成「这个 profile 没登录」的投影（2026-09-22 事故）——文档和记忆都拦不住，只有门禁拦得住。

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

## 判据准确度：裸探针只是筛选，不是判决（2026-09-22 二轮）

> 一轮全量清扫后暴露的问题不是「扫得不够多」，而是**判决不准**：14 个非存活源里，只有 3 个是真的坏了。裸 HTTP 探针对其中几类源给不出可信答案，二轮逐类拆开（下表五类）并配了浏览器第二次意见。

### 判决词汇表：先分清「谁的问题」

```text
健康        alive                    结果在，站点内
            alive-off-site           结果在，但配置的 URL 落在另一个主机（规范化跳转，非故障）
失败        http-dead                404/410/5xx —— 端点真的没了
（源的问题）network-error            传输失败
            redirected-home          搜索 URL 被弹回站点根
            redirected-off-site      落到别的主机且丢了关键词
            alive-no-keyword         能打开但关键词不出现
            alive-zero-results       页面自述该查询 0 条结果（URL 活着，查询没结果）
探针问题    login-wall               答案取决于 cookie，不取决于 URL
（不是源的  probe-not-authoritative 401/403/405/429 —— 边缘/WAF/凭据在回答「探针」
 问题）                            的问题，真浏览器可能不同
```

判据统一落在 `isFailureVerdict()` / `needsCdpSecondOpinion()`（`lib/source-url-heal.mjs`）这两个 seam：**只有「失败」那一栏才进死源台账**，#285 建立的 login-wall 语义在 2026-09-22 扩到了 WAF 一层。下游消费方不要各自再判一次。

### 裸探针实测的五类误判（都是二轮修的）

| 类 | 实例 | 裸探针说的 | 真相 | 修法 |
| --- | --- | --- | --- | --- |
| **主机别名跳转** | google_search、techmeme_search、wechat_dongchabeating、threads_search | `redirected-off-site`（4 个"故障"） | 规范域跳转（google.com→google.com.hk、threads.net→threads.com），其中 3 个带 28–148 关键词命中 | 跨主机 **且仍带词** → `alive-off-site`（`classifyProbe`） |
| **短 ASCII 关键词按子串计数** | reddit_search 403 页 | `keywordHits: 237` | 命中全部来自 email / certain / domain，页面无结果 | ASCII 关键词一律**词边界**匹配（`countKeywordHits`） |
| **状态码一刀切** | bloomberg/zhihu 403、tiktok_creator 401、core_search/google_search 429 | `http-dead` | 浏览器里 bloomberg 就是 200/alive；其余是边缘/WAF/限流在回答探针 | 401/403/405/429 或短响应体 → `probe-not-authoritative`（`detectBlockPage`） |
| **登录门混进"跨域跳转"** | weibo_search | `redirected-off-site` | 跳到 `passport.weibo.com` —— 是登录门 | 登录端点/登录文案 → `login-wall`（`detectLoginWall`） |
| **页面自述 0 结果仍判 alive** | thepaper | `alive`（浏览器二次意见也一度误判） | 页面明文写「找到约 0 个结果」 | 页面自述结果数优先于关键词命中 → `alive-zero-results`（`detectZeroResults`，正则表 `ZERO_RESULTS_PATTERNS` 由 HTTP 与 CDP 两条链共用） |

### 第二次意见：`source-url-discover.mjs`（CDP）

裸探针给出非健康判决后，**用真浏览器重问一遍**。这是五步法第 5 步的工具化——交互式 CDP 不该再是「1–4 全无解才上」的最后兜底，而是**非健康判决的常规复核**。

```bash
# 从一轮清扫报告里取出所有非健康行（含 probe-not-authoritative）
NODE_USE_ENV_PROXY=1 node scripts/short-video/source-url-discover.mjs \
  --from output/source-url-sweep-2026-09-22.json \
  --env <主 checkout>/.env.local

# 也可点名
node scripts/short-video/source-url-discover.mjs --only xinhua,ithome --json
```

每个源最多 4 步：**A 复探**配置 URL（真浏览器，含 `PerformanceNavigationTiming.responseStatus` 取真实状态码）→ **B 驱动搜索框**（首页定位搜索框、输入关键词、提交、读地址栏）→ **C 回收模板**（把落地点 URL 里的关键词换回 `{kw}`）→ **D 验证模板**（再导航一次，确认它真出结果）。

读表方式：**`http` 列与 `browser` 列对照**才是结论——

- `probe-not-authoritative` + `alive` ⇒ 裸探针是假象（bloomberg）；
- `probe-not-authoritative` + `blocked-in-browser-too` ⇒ 封锁是真的，改 URL 无用（reddit）；
- `url-recovered-but-login-gated` ⇒ **URL 是错的、端点也是登录门**，两件事要分开处置（ithome）。

### 第二次意见必须跑在【带登录态的 profile】上（2026-09-22 三补轮）

在无登录态的 profile 上复检，**凡是登录门都只会复现登录门**——分不清「站点真的要登录」与「只是这个 profile 没登录」。同一批 URL、两个 profile 的实测对照：

| 源 | 空 profile（`~/.chrome-cdp`） | 带登录态（`~/chrome-tiktok-profile`） | 结论 |
| --- | --- | --- | --- |
| weibo_search | 跳 `passport.weibo.com` ⇒ 判 `login-wall` | **5350 字符真结果，零登录提示** | **判据假阳**，URL 本就可用 |
| ithome | 302 到登录页 | **仍 302 到登录页** | 登录门是真的，`needsAuth: true` 站得住 |
| douyin | 内容加载失败 | 内容加载失败 +「登录账号」 | 仍需登录 |
| zhihu | 「未搜索到相关内容」 | 同左 + 扫码提示 | 仍需登录 |

所以「登录门」判决**必须标注在哪个 profile 下测得**；只有带登录态的 profile 也过不去，才算站点的登录门（否则只是探针环境问题）。

（**2026-09-23 更新**：上表的 ithome / zhihu 行已过期——用户在自动化 profile 里登录后复测，两者都出真结果；douyin 的最终结论也变了。见下节。）

### 登录态复测：3/4 可用 + 两个「时序竞态 ⇒ 假判决」（2026-09-23）

用户在自动化 profile（`~/chrome-tiktok-profile`，9229）里登录 ithome / 知乎 / 抖音之后复测：

| 源 | 复测结果 | 结论 |
| --- | --- | --- |
| ithome | **64 条真结果**（落在 `/search/{kw}.html`，页眉是「软媒新友2707533 退出登录」） | ✅ 登录生效 → **功能级收口**（此前是 302 登录门） |
| weibo_search | 16 条 | ✅ 本就可用（无需登录） |
| zhihu | 31 条（登录态：页眉有「消息 / 私信」，无「登录 / 注册」） | ✅ 可用；首轮报的 `zero_results` 是**判据竞态**，不是源坏 |
| douyin | 0 条，`anti_bot:captcha` | ❌ **不可用**（见下） |

两个竞态都是**测量方式**造成的假判决，已修在 `selector-health.mjs`：

1. **单发抽取 vs SPA 水合（zhihu）**：同一页面「加载后立刻抽」= 0 张卡，「1.6s 后」= 31 张 → 多源连跑时判决在 0 / 31 之间翻（实测 0、31、0、31、0）。改走生产同款 `extractWithRetry`（既有 backoff seam，只有全部重试后仍空才算 `zero_results`）。修后连跑 5 次稳定 31/31/27/31/31。
2. **反爬插页晚到 vs 前置检测（douyin）**：t+0 页面仅 106 字符、无标记；t+3.5s 起 `captcha` 稳定命中并持续到 t+10s。旧顺序会把这种页面判成 `zero_results`——那是「选择器腐烂」的 runbook，而正确指令是「别碰这个源」。新增纯函数 `verdictReason()`（带单测）：空结果 + 晚到反爬标记 ⇒ `anti_bot` 优先。

**douyin 结论升级为「登录也救不了」**：登录在 `www.douyin.com` 确实生效（无登录提示、有「我的」），但 `www.douyin.com/search/` 的结果容器 `scroll-list` 始终空（0 卡片、0 个 `a[href*="/video/"]`、页面 title 为空），且 `/passport/login` 曾直接返回 `{error_code:22,description:"非法应用"}`（风控定向拦截自动化 profile）。`needsAuth: true` 保留，但**不要再把「登录」当它的修复路径**；若将来要拿抖音搜索，改走 `iesdouyin` 分享页（无需登录，仅下载链路）才是可行方向。

### 驱动搜索框：找真实 URL 的权威方式（实测要点）

站点自己的搜索 UI 就是它自己的路由——**比任何模板表都权威**。ithome 的 registry 写着 `/search?word=`（404）、模板表 9 个猜测全死，而搜索框提交后落在 `/search/{kw}.html`（路径段 + `.html`，**根本没有 query 参数**）。五个实测要点：

1. **组件库的 `input[type=search]` 常常不是搜索框**：Ant Design 的 `<Select>` 隐藏过滤框就是这个类型（so.news.cn 的 `ant-select-selection-search-input`），提交它什么都不会发生 → 打分时对 `[role=combobox]` / `ant-select` / `aria-autocomplete=list` 重罚。
2. **受控输入必须走原生 setter**：React/Vue 自己存值，直接写 `el.value` 只改 DOM 不改组件状态，提交处理器读到空字符串 → 用 `HTMLInputElement.prototype.value` 的 setter + `input`/`change` 事件。
3. **提交优先级：搜索按钮 > 表单 > Enter**。按文本（`搜索`/`Search`/`Go`）或 class 找按钮并 `click()`；很多 JS 渲染的框没有表单。
4. **高级搜索面板会偷走分数**：站点搜索框通常**独占一个表单**，而高级检索面板字段多、名字更像搜索（xinhua 的 `AdvancedSearchForm_a_keyWordAll`）→ 按所在表单的 `input` 数量扣分。
5. **登录重定向里藏着答案**：被门禁的站点仍会告诉你它本来要送你去哪。ithome 的 302 参数带 `url=https%3a%2f%2fwww.ithome.com%2fsearch%2f%25e4%25ba…html`（双层编码）→ 解出来就是真实搜索 URL。`loginRedirectTarget()` 把「被登录门挡住所以看不到 URL」拆成「URL 是 X，且匿名被门禁」两个独立事实。

**已知边界**：受控组件的复杂 SPA（xinhua 的 `so.news.cn`）点不出正确 URL——工具会诚实报 `dismissed`，不会编一个模板出来。这类站点靠人工诊断补上端点（xinhua 走的就是这条路），工具只负责**验证**。

### 二轮台账（2026-09-22，55 源清扫 + 10 源 CDP 复核）

清扫产物 `output/source-url-sweep-2026-09-22.json`；CDP 复核产物 `output/source-url-discover-batch1.json` / `batch2.json`。

| 处置 | 源 | 实测证据 |
| --- | --- | --- |
| **已修 + 已落库** | xinhua | 旧 `www.news.cn/search/news.htm?keyword=` 404；`www.news.cn/search?q=` 是 ErrorPageTemplate 假页；JSON 端点 `so.news.cn/getNews` 对 Node fetch 403（openresty，159B）、浏览器内 200 + JSON。真实页面路由 `so.news.cn/#search/0/{kw}/1/` 经双关键词证伪（量子计算→量子聚力/潘建伟，人工智能→人形机器人），结果容器 `.items`，`selector-health --only xinhua` **6 条绿** |
| **诊断收口，未改行为** | jiqizhixin | 关键词搜索是**服务端故障**（浏览器内一样 500 +「服务器内部故障」），不是 SPA 渲染问题；存在可用的 `api/article_library/articles.json` 但**忽略一切关键词参数**（latest-flow）；机器之心内容已由 `wechat2rss_jiqizhixin` 覆盖 → 改成 listing 源只会重复入库，维持原状待裁决 |
| **已修 + 已落库（needsAuth）** | ithome | 真实形态 `/search/{kw}.html`；对匿名（含无 cookie 的纯 HTTP）一律 302 到 `user-login/index.htm?tip=登录以查看搜索结果` → URL 改正 + `needsAuth: true`；匿名通道是 `/rss/`（60 条，当日）。**三补轮：在带登录态的 profile 下仍被同一门禁 302 拦下**——登录门是站点侧的，不是探针环境造成的（登录表单在 `my.ruanmei.com` 的 **iframe** 内，页面上有微信扫码面板） |
| **判据修正，无需修源** | bloomberg、thepaper、threads_search、reddit_search、zhihu、tiktok_creator、core_search、google_search、techmeme_search、wechat_dongchabeating、weibo_search | 见上表五类误判；红黑名单归属由新判决自动分流 |
| **确认真实封锁，按边界不修** | reddit_search（浏览器内也是 network-security 拦截页）、tiktok_creator（401：探针带不上 API key 头） | `blocked-in-browser-too` |
| **真 URL 已回收；weibo 在登录态下已验证可用** | weibo_search → `s.weibo.com/weibo?q={kw}&Refer=index`（**带登录态 profile 下 5350 字符真结果、零登录提示** → 旧 `login-wall` 判决系空 profile 造成的假阳）；douyin → `so.douyin.com/s?search_entrance=aweme&keyword={kw}`（内容加载失败 + 需登录账号） | weibo = **可用**，待落库裁决；douyin = `url-recovered-but-login-gated` 待裁决 |

## 已知修复台账

| 日期               | 源                    | 失效原因                                                                                                      | 修复要点                                                                                                                                                 | 验证                                                    |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 2026-09-22         | xinhua                | `www.news.cn/search/news.htm?keyword=` 404；`search?q=` 是错误模板页；JSON 端点 `so.news.cn/getNews` 被 WAF 拦（Node 403 / 浏览器 200） | url 换真实页面路由 `so.news.cn/#search/0/{kw}/1/`，articleScript 收到 `.items a[href*="news.cn/20"]`（含重命名兜底）                                            | 双关键词证伪（量子计算/人工智能 标题随词变化）+ `selector-health --only xinhua` 绿 / 6 条 |
| 2026-09-22         | ithome                | 真实形态是 `/search/{kw}.html`（非 query 参数），且对匿名一律 302 到登录页——两个事实被旧判据混成一个 404        | url 改为真实形态；`needsAuth: true`（登录门由用户处置）；匿名通道沿用 `/rss/`（60 条 / 当日）                                                              | CDP 驱动搜索框回收模板 + 裸 HTTP 无 cookie 复现 302      |
| 2026-09-07         | google_search         | Google 新新闻垂直 SERP：结果块改 `div[data-ved][data-hveid]`，标题改 `div[role="heading"]`，`div.g`/`h3` 消失 | articleScript/imageScript 重写为新结构；缩略图为 base64 data URI，仅 http 图标记 type=image（可下载），data URI 降级 text；外链过滤 google 域 + URL 去重 | health --only 1/1 绿，10 条全结构（title/url/imageUrl） |
| 2026-09-07         | leiphone              | 搜索结果标题改为 `a.headTit` 链接，旧 `.article-list`/`article` 容器归零                                      | articleScript 改为 `a.headTit[href*=".html"]` 直取                                                                                                       | health --only 绿，16 条                                 |
| 2026-09-07         | wechat_dongchabeating | Google 站内搜索同吃新 SERP 改版（`div.g` 归零）                                                               | 同 google_search 方案（新 DOM + 转载域白名单）                                                                                                           | health --only 绿，1 条                                  |
| 2026-09-07         | weibo_hot             | 登录墙（Sina Visitor System）                                                                                 | **经调研破局**：切 60s 公共 API（60s.viki.moe/v2/weibo，开源可自托管），apiSearch 化                                                                     | health 绿，50 条/2.3s                                   |
| 2026-09-07         | zhidx                 | 搜索结果 XHR 渲染，CDP 抓不到                                                                                 | **经调研破局**：站点是 WordPress，切 wp-json REST API，apiSearch 化                                                                                      | health 绿，20 条/2.6s                                   |
| 2026-09-07（放弃） | xinzhiyuan            | DNS 解析 overdue.aliyun.com——主机欠费停放                                                                     | 放弃；公众号内容已由 wechat2rss_zhinengyuan 覆盖                                                                                                         | —                                                       |
| 2026-09-07（放弃） | baidu_news            | 资讯索引功能性死亡（ns 端点空壳 218 字节，热词 0 结果）                                                       | 放弃；详见 docs/research/zh-source-recovery-research-2026-09.md                                                                                          | —                                                       |

## CDP 代理 wsPath 陈旧坑（2026-09-07 修复）

`DevToolsActivePort` 文件缓存的浏览器级 WS 路径与 Chrome 活值脱节时，代理报「连接失败」而 `curl localhost:9222/json/version` 正常（**当时的约定端口是 9222；2026-09-07 起 TikTok/自动化实例改用 9229，且 9222 因 Chrome 136+ 默认 profile 禁调试已全 404——照抄本条时把端口换成 9229**）——其他 session 正常、本 session 不通的假象即来源于此。已修 `skills/web-access/scripts/cdp-proxy.mjs`：WS 握手失败自动回退 `/json/version` 活值重试。注意 `skills/` 与 agent-harness 仓手动同步，此修复需带过去。
