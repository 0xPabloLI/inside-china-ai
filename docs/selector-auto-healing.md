# Selector Auto-Healing Runbook (#140 P5)

> 触发：`node scripts/short-video/selector-health.mjs` 报某 CDP 源 `zero_results`（或 #200 sourceHealth 连续零结果 streak ≥3）。
> 本文档是修复 agent 的执行手册——修复是 agent 驱动的，脚本只负责发现。
>
> **动手前先看「修复步骤」的第 0 步**：判决来自四条轴（URL 可达 / 真浏览器 / 抽取 / 凭据），**一半的「源坏了」其实是「测量坏了」**——对测量动手只会把源改坏。

## 循环

```
selector-health.mjs --keys（凭据就绪）
      ↓
selector-health.mjs（发现：轴 3 抽取）
      ↓
source-url-sweep.mjs（轴 1）→ source-url-discover.mjs（轴 2+3，回收 registry 行）
      ↓                                  └─ 审计分支：--compare / --all（URL 对齐：「能用」≠「对」）
本 runbook（修复）→ selector-health.mjs --only <源>（验证）
```

## 修复步骤（对每个 failing 源）

**第 0 步先分清「谁坏了」，再动手。** 判决分四条轴（URL 可达 / 真浏览器 / 抽取 / 凭据），修复路径完全不同——**一半的「源坏了」其实是「测量坏了」**，对测量动手只会把源改坏：

| 现象                                             | 性质                       | 动作                                                                   |
| ------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------- |
| `--keys` 报某变量 MISSING                        | 测量缺陷                   | 配 key；**不要碰源**                                                   |
| `probe-no-egress`                                | 测量缺陷（无路由）         | 查代理/出口；**不要碰源**                                              |
| `probe-not-authoritative` / `login-wall`         | 测量缺陷（答复关于探针）   | 用真浏览器复核；先看请求头，再看登录态                                 |
| `extracts-despite-verdict`                       | 轴 2 误读                  | **什么都不改**；改轴 2 的判据                                          |
| `http-dead` / `redirected-home` / `still-broken` | 源侧真问题                 | 先走 **A. URL 修复**                                                   |
| `url-alive-but-extraction-empty`                 | registry 脚本腐烂          | 先走 A（URL 可能本就不对），A 出来仍是 0 条再走 **B**                  |
| 审计报 `differs`（默认模式下不会出现）           | 对齐问题，**不是**健康问题 | 见下文[《对齐审计》](#对齐审计url能用于不等于对2026-09-23)；换不换人判 |

```bash
# 凭据就绪（唯一权威检查；缺 key 时服务端答复与「端点已死」无法区分）
node scripts/short-video/selector-health.mjs --keys --env <主检出>/.env.local
```

### A. URL 模板不对 → 驱动搜索框（搜索 URL 的权威修复方式）

```bash
node scripts/short-video/source-url-discover.mjs --only <源名> --keyword-zh 人工智能 --env <主检出>/.env.local
```

终端会打印可粘贴的 registry 行，`--out` 的报告里有 `registryPatches[]`。**完成判据**：回收到的 URL 跑该源自己的 `articleScript` 抽出 ≥1 条。规则、易失参数与两种失败标签见下文[《驱动搜索框就是搜索 URL 的修复方式》](#驱动搜索框就是搜索-url-的修复方式2026-09-23-定案)。

**不要**在 A 里手写模板——那正是丢掉关键参数的环节。

**URL 已经能用、只想确认它是不是搜索 URL** → 走 `--compare` / `--all` 审计模式；命令与判定口径见下文[《对齐审计：URL「能用」不等于「对」》](#对齐审计url能用于不等于对2026-09-23)。

### B. 选择器腐烂 → 五步

> **B 的第一个坑：测的必须是 registry 里那个脚本，不能是自己重写的一半。**
> 2026-09-23 实测代价：qbitai 被判「首页列表选择器腐烂、匹配 0 项」并据此开票，但那次 triage 只复刻了 `articleScript` 的**第一阶段**（`.article-item, .post-item, .list-item` + 标题），而脚本自带第二阶段兜底（泛扫同域 `a[href]`）。真值：阶段一容器命中 **0**、泛扫命中 **33**、**整脚本返回 33** —— 源是健康的，票是错的。
> 教训与前几条同源：**「0 条」在分清「谁坏了」之前不是证据**。要测就整脚本跑（`extractFromTab(tab, source.articleScript)` 或直接 `selector-health --only <源>`），不要手搓一个子集。

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
- **守卫必须在每个入口，而它原来只长在 main.mjs 里（2026-09-23 修）**：Step 0.1 原本写在 `ensureCdpOrExit()` **内部**，那就只有走 main.mjs 的路径吃到；而 `selector-health.mjs`、`search-sources.mjs`、`source-url-discover.mjs` 都是各自调 `cdp-client.ensureCdpProxy()` 的**旁路入口**——诊断路径恰恰是最需要看真话的地方。现在守卫抽成 `cdp-preflight.ensureCdpProfileGuard()`，四个入口共用一份实现。**别在入口点重写它**：`selector-health` 现在只在选中集里真有 CDP 源时才调（纯 api 运行不该连浏览器）。
- **端口由守卫钉住，消除「选到哪个 Chrome」这件事（2026-09-23 修）**：只告警不够——代理按 `DevToolsActivePort` 探测浏览器，日常 Chrome（9222）与自动化实例（9229）同时在跑时它可能落到任意一个。`ensureCdpProfileGuard()` 现在设 `WEB_ACCESS_CDP_PORT=<automationPort()>`，这是代理的**最高优先覆盖**，且**端口没监听时硬错**——失败形态从「静默连错浏览器、给出可信但错的答案」变成「代理起不来」（响亮、可操作）。子进程继承 `process.env`，所以 `cdp-client.ensureCdpProxy()` 自己 spawn 的那条路径一并覆盖。
- **两份 `cdp-proxy.mjs` 不是同一个文件（2026-09-23 修）**：`scripts/short-video/lib/cdp-client.mjs#findCdpProxyScript()` 原来**偏好全局副本**（`~/.agents/skills/web-access/scripts/cdp-proxy.mjs`），而 `cdp-preflight.mjs` 用**仓库内副本**（`skills/web-access/scripts/cdp-proxy.mjs`）。实测两者相差 105 行——仓库内那份带本仓自己的修复（#273 并发守卫、#308 `exceptionDetails` 优先），全局那份是全局安装留下的旧版。后果：同仓两套代理，走体检/生产路径起的是**旧的那份**。现在**仓库内优先**，全局只作 fallback。

## 逐源修复方法论（#269 Phase 2 定案，2026-09-21）

> 上游 runbook 修的是**选择器**（DOM 变了、articleScript 抓空）。本节修的是更靠前的一层：**搜索 URL 模式本身死了**（404 / 被重定向回首页）。两者失败层级不同——ITHome 案例里 articleScript 完全正常，死的是 `search?word=` 端点，且兜底分支把首页 534 条链接当成「搜索结果」静默入库（#269 Phase 1 实证）。本节是这一层的执行方法论。

### 触发与对象

- **触发**：`judgeUrlProbe`（Phase 1）判 `http-status` / `redirected-home` / `redirected-off-search`，或 quarantine 名单里带这类探针证据的源。
- **对象**：按源批量清扫，**不为每个失败单独开票**；失败已有三层记录（source-health 连败名单 / quarantine 名单含探针证据 / 逐 run trajectory）。
- **前置**：先跑批量诊断 `node scripts/short-video/source-url-sweep.mjs`，产物 `output/source-url-sweep-<date>.json` 是本节五步法的输入。

### 五步法（每源）

| 步  | 动作                                                                                                                                       | 判据（怎样算成立）                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **URL 探针**：GET 该源 `url(keyword)`，跟随重定向                                                                                          | ≥400 → `http-dead`；final path ≡ 首页路径 → `redirected-home`；跨域 → `redirected-off-site`；200 但关键词 0 命中 → `alive-no-keyword`（JS 渲染或内容真空，转第 2/5 步） |
| 2   | **静态发现**：抓首页 HTML，抽 `<form action> + <input name>` 拼新搜索 URL；再看首页 search 形态链接；最后才试已知模板（`/search?q=` 等）   | 候选 200 **且**关键词命中 > 0 → 新 URL 模式确认                                                                                                                         |
| 3   | **RSS 对照探测**：首页 `<link rel=alternate type=application/rss+xml>` + 常见 feed 路径                                                    | `itemCount > 0` 且 pubDate 落在关注窗口内 → feed 形态确认                                                                                                               |
| 4   | **形态对比选优**：在确认的形态里排优先级——**RSS/API > 新 URL 模式 > 页内搜索配方**（配方依赖选择器，最脆弱，只作备选降级形态，不作主路径） | 最优做主形态，其余登记为该源 fallback                                                                                                                                   |
| 5   | **CDP 兜底**：1–4 全部无解时才上交互式 CDP（首页 → 定位搜索框 → 输入关键词 → 提交 → 收割结果链接），用于发现 JS 渲染站点的新端点           | 实测 ≥3 条且每条有 title + url，抽样 URL 真实可访问                                                                                                                     |

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

| 处置                              | 源                                                                                                                                                                                                                       | 实测                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **可修 → 已开票**                 | ithome                                                                                                                                                                                                                   | `search?word=` 404（首页 200，站点活）；首页无搜索表单（JS 渲染）；`https://www.ithome.com/rss/` 200 / 60 条 / 最新 2026-09-21T16:17Z |
| **静态无解，待 CDP → 已开票**     | xinhua、jiqizhixin                                                                                                                                                                                                       | xinhua `search/news.htm?keyword=` 404，6 个候选全死（含错误模板页误报）；jiqizhixin 200 但 0 命中（SPA，静态看不到结果）              |
| **判据缺陷（非 URL 死）→ 已开票** | core_search、gnews、reddit_search、google_search / bing_news / techmeme_search                                                                                                                                           | 429 限流 / 400 缺 key / 403 反爬 / 重定向到 consent 页，被旧判据一律归 `http-dead`                                                    |
| **登录态与反爬，按边界不修**      | weibo_search、douyin、zhihu、threads_search、tiktok_creator                                                                                                                                                              | 登录墙跳转（passport.weibo.com）/ 403 / 401 / JS+登录                                                                                 |
| **环境依赖，不修**                | searxng_search（localhost:8888 未起）、mcp_grok_search（无 url）、currents（超时）                                                                                                                                       | 自托管实例与网络                                                                                                                      |
| **健康，禁止顺手优化**            | thepaper、leiphone、zhidx(api)、xhs、sogou_weixin、bilibili、x_search、youtube_search、arxiv_search、github_search、noozra_search、openalex_search、hackernews_search、polymarket_search、digg_search、duckduckgo_search | 200 + 关键词命中 + 结果页形态                                                                                                         |

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

| 类                            | 实例                                                                   | 裸探针说的                          | 真相                                                                                           | 修法                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **主机别名跳转**              | google_search、techmeme_search、wechat_dongchabeating、threads_search  | `redirected-off-site`（4 个"故障"） | 规范域跳转（google.com→google.com.hk、threads.net→threads.com），其中 3 个带 28–148 关键词命中 | 跨主机 **且仍带词** → `alive-off-site`（`classifyProbe`）                                                                              |
| **短 ASCII 关键词按子串计数** | reddit_search 403 页                                                   | `keywordHits: 237`                  | 命中全部来自 email / certain / domain，页面无结果                                              | ASCII 关键词一律**词边界**匹配（`countKeywordHits`）                                                                                   |
| **状态码一刀切**              | bloomberg/zhihu 403、tiktok_creator 401、core_search/google_search 429 | `http-dead`                         | 浏览器里 bloomberg 就是 200/alive；其余是边缘/WAF/限流在回答探针                               | 401/403/405/429 或短响应体 → `probe-not-authoritative`（`detectBlockPage`）                                                            |
| **登录门混进"跨域跳转"**      | weibo_search                                                           | `redirected-off-site`               | 跳到 `passport.weibo.com` —— 是登录门                                                          | 登录端点/登录文案 → `login-wall`（`detectLoginWall`）                                                                                  |
| **页面自述 0 结果仍判 alive** | thepaper                                                               | `alive`（浏览器二次意见也一度误判） | 页面明文写「找到约 0 个结果」                                                                  | 页面自述结果数优先于关键词命中 → `alive-zero-results`（`detectZeroResults`，正则表 `ZERO_RESULTS_PATTERNS` 由 HTTP 与 CDP 两条链共用） |

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

| 源           | 空 profile（`~/.chrome-cdp`）             | 带登录态（`~/chrome-tiktok-profile`） | 结论                                   |
| ------------ | ----------------------------------------- | ------------------------------------- | -------------------------------------- |
| weibo_search | 跳 `passport.weibo.com` ⇒ 判 `login-wall` | **5350 字符真结果，零登录提示**       | **判据假阳**，URL 本就可用             |
| ithome       | 302 到登录页                              | **仍 302 到登录页**                   | 登录门是真的，`needsAuth: true` 站得住 |
| douyin       | 内容加载失败                              | 内容加载失败 +「登录账号」            | 仍需登录                               |
| zhihu        | 「未搜索到相关内容」                      | 同左 + 扫码提示                       | 仍需登录                               |

所以「登录门」判决**必须标注在哪个 profile 下测得**；只有带登录态的 profile 也过不去，才算站点的登录门（否则只是探针环境问题）。

（**2026-09-23 更新**：上表的 ithome / zhihu 行已过期——用户在自动化 profile 里登录后复测，两者都出真结果；douyin 的最终结论也变了。见下节。）

### 登录态复测：3/4 可用 + 两个「时序竞态 ⇒ 假判决」（2026-09-23）

用户在自动化 profile（`~/chrome-tiktok-profile`，9229）里登录 ithome / 知乎 / 抖音之后复测：

| 源           | 复测结果                                                                        | 结论                                                      |
| ------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ithome       | **64 条真结果**（落在 `/search/{kw}.html`，页眉是「软媒新友2707533 退出登录」） | ✅ 登录生效 → **功能级收口**（此前是 302 登录门）         |
| weibo_search | 16 条                                                                           | ✅ 本就可用（无需登录）                                   |
| zhihu        | 31 条（登录态：页眉有「消息 / 私信」，无「登录 / 注册」）                       | ✅ 可用；首轮报的 `zero_results` 是**判据竞态**，不是源坏 |
| douyin       | 0 条，`anti_bot:captcha`                                                        | ❌ **不可用**（见下）                                     |

两个竞态都是**测量方式**造成的假判决，已修在 `selector-health.mjs`：

1. **单发抽取 vs SPA 水合（zhihu）**：同一页面「加载后立刻抽」= 0 张卡，「1.6s 后」= 31 张 → 多源连跑时判决在 0 / 31 之间翻（实测 0、31、0、31、0）。改走生产同款 `extractWithRetry`（既有 backoff seam，只有全部重试后仍空才算 `zero_results`）。修后连跑 5 次稳定 31/31/27/31/31。
2. **反爬插页晚到 vs 前置检测（douyin）**：t+0 页面仅 106 字符、无标记；t+3.5s 起 `captcha` 稳定命中并持续到 t+10s。旧顺序会把这种页面判成 `zero_results`——那是「选择器腐烂」的 runbook，而正确指令是「别碰这个源」。新增纯函数 `verdictReason()`（带单测）：空结果 + 晚到反爬标记 ⇒ `anti_bot` 优先。

**douyin 的当轮结论已在同日被推翻**（保留原文以示判据演进）：当时写的是「登录也救不了」，依据是 `www.douyin.com/search/` 的 `scroll-list` 恒空 + `/passport/login` 返回 `{error_code:22,"非法应用"}`。真因拆开后是两个被合并的事实：`error_code:22` 只拦**登录入口**（点不动 ≠ 搜索不可用），而结果容器为空是因为**综合 tab 的结果卡没有 `<a href>`**。修订后的结论见下节，`needsAuth: true` 仍然保留（匿名档案下确实拿不到结果）。

### 驱动搜索框：找真实 URL 的权威方式（实测要点）

站点自己的搜索 UI 就是它自己的路由——**比任何模板表都权威**。ithome 的 registry 写着 `/search?word=`（404）、模板表 9 个猜测全死，而搜索框提交后落在 `/search/{kw}.html`（路径段 + `.html`，**根本没有 query 参数**）。五个实测要点：

1. **组件库的 `input[type=search]` 常常不是搜索框**：Ant Design 的 `<Select>` 隐藏过滤框就是这个类型（so.news.cn 的 `ant-select-selection-search-input`），提交它什么都不会发生 → 打分时对 `[role=combobox]` / `ant-select` / `aria-autocomplete=list` 重罚。
2. **受控输入必须走原生 setter**：React/Vue 自己存值，直接写 `el.value` 只改 DOM 不改组件状态，提交处理器读到空字符串 → 用 `HTMLInputElement.prototype.value` 的 setter + `input`/`change` 事件。
3. **提交优先级：搜索按钮 > 表单 > Enter**。按文本（`搜索`/`Search`/`Go`）或 class 找按钮并 `click()`；很多 JS 渲染的框没有表单。
4. **高级搜索面板会偷走分数**：站点搜索框通常**独占一个表单**，而高级检索面板字段多、名字更像搜索（xinhua 的 `AdvancedSearchForm_a_keyWordAll`）→ 按所在表单的 `input` 数量扣分。
5. **登录重定向里藏着答案**：被门禁的站点仍会告诉你它本来要送你去哪。ithome 的 302 参数带 `url=https%3a%2f%2fwww.ithome.com%2fsearch%2f%25e4%25ba…html`（双层编码）→ 解出来就是真实搜索 URL。`loginRedirectTarget()` 把「被登录门挡住所以看不到 URL」拆成「URL 是 X，且匿名被门禁」两个独立事实。

**已知边界**：受控组件的复杂 SPA（xinhua 的 `so.news.cn`）点不出正确 URL——工具会诚实报 `dismissed`，不会编一个模板出来。这类站点靠人工诊断补上端点（xinhua 走的就是这条路），工具只负责**验证**。

**触发条件（2026-09-23 窄化）**：只在「**URL 模式已死 且 站内搜索框还在**」时降级到驱动搜索框，不是「每次搜索失败都试」。生产路径 `search-sources.mjs` 尚未接这一层（当前驱动函数只被诊断脚本 `source-url-discover.mjs` 调用）。

**窄化的理由要修正一次**：不用「驱动搜索框依赖真实前端结构，站点改一次前端就废」当理由——那站不住。① 结构变了**是可观测的**：`source-url-discover.mjs` 本来就在真浏览器里跑，CDP 快照能告诉我们前端改成了什么样；② 驱动搜索框的选择器（`SEARCH_BOX_SELECTORS` / `buildFindSearchBoxScript()`）**也只是选择器**，和 `articleScript` 同处一个自愈循环——站点改版后由 `selector-health` 报空、走本文件的手册重新 derive 即可，这正是本文件存在的意义。

真正的理由是两个不同的东西：

1. **每次运行的代价与不确定性**：驱动搜索框要一次**有状态的真浏览器交互**（登录态、页面节奏、验证码风险、动画与提交时序），而 URL 模板是**无状态的一跳**。同一轮跑 50 个源时，前者把一个源的问题放大成整轮的抖动。
2. **契约形态**：URL 模板是可钉住的字符串（可 diff、可回归测试），UI 驱动是「一次会话的结果」。前者能进 registry 当契约，后者只能当**降级层**。

所以结论是「**作备选、不作主路径，且触发条件要窄**」——不是「不进工作流」。降级层的选择器一样要进自愈循环、一样要有健康检查。

### 驱动搜索框**就是搜索 URL 的修复方式**（2026-09-23 定案）

上一节讲的是「降级层」，容易读成「驱动搜索框只是运行时备胎」。**它不是备胎，它是 URL 修复的正路**：registry 里的 `url:` 模板一旦不对，唯一权威的正确答案只能由站点自己的搜索 UI 给出。两者是同一件事的两面——诊断侧回收 URL，修复侧把回收结果写回 registry。

修复跑一次，看三样东西：

| 阶段        | 命令                                                           | 产物                                      |
| ----------- | -------------------------------------------------------------- | ----------------------------------------- |
| 筛选        | `source-url-sweep.mjs`（轴 1）                                 | 哪些源的 URL 判决不健康                   |
| 复核 + 回收 | `source-url-discover.mjs --only <名> --keyword-zh …`（轴 2+3） | `registryPatches[]`：可粘贴的 registry 行 |
| 落库        | 手工把那一行贴进 `lib/source-registry.mjs`                     | 修好的模板                                |

`--out <path>` 的报告里 `registryPatches` 是机器可读的那一半，终端里同时打印可粘贴块：

```js
### douyin  (variant: volatile-stripped; dropped volatile: aid)
url: (keyword) => `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`,
```

**为什么要打印一整行而不是一段 JSON**：修复原来停在 JSON blob，最后「把 `…/{kw}?type=video` 变成 `url: (keyword) => …`」这一步留给了读的人。而手工誊写正是**丢掉那个起决定作用的参数**的地方（douyin 的 `?type=video`）。`registryUrlLine()` 把这一步去掉。

**三条写入规则**（都是实测踩出来的）：

1. **易失参数必须剔除，功能性参数必须保留**。驱动搜索框回来的是**地址栏原文**，而地址栏带着会话杂物——douyin 自己的落点是
   `/jingxuan/search/人工智能?aid=e5019d6d-8cc1-4251-b58f-176f8eb02438&type=general`。
   `aid` 每次访问重新生成，`type` 才决定渲染哪个 tab。把整条地址栏冻进模板 = 交付一个只对那一秒成立的 URL，下一次跑又像新坏了一次。
   `stripVolatileParams()` 按两条独立信号判：**名字**（`aid`/`spm`/`uuid`/`_t`… 自称是「本次客户端/会话的标识」）与**形状**（uuid、长 hex、长不透明串）。看起来像页面状态的（`type=video`、`page=3`、`v=2`）两条都不碰；**空值参数保留**（`?tab=` 是真开关）。
2. **剔除动作必须可回退，判决权交给抽取**。模板先用剔除版验证（它才是能入库的那个），失败再验原文版——`templateFromLandedUrl()` 同时返回 `template` 与 `templateVerbatim`，`discoverSource` 两个都试、谁 **extract > 0** 就留谁，报告里记 `variant: volatile-stripped | as-landed`。启发式只负责**提议**，源的 `articleScript` 负责**决定**。
3. **完成判据只有一个**：回收到的 URL 跑该源自己的 `articleScript` **抽到 ≥1 条**。只验到「页面打开了」等于没修——那是 douyin 的形状（前两轴全绿、源是死的）。抽 0 条时报告 `usable: false`，并区分 `url-recovered-but-login-gated`（找到对的 URL 但被门禁 → 改 `needsAuth`）与 `url-alive-but-extraction-empty`（URL 根本不是问题）。

**触发面（同日两次收紧）**：`needsSearchBoxDrive({verdict, extracted, keyword})`——① 没有关键词就不驱动（api/图库源没有搜索框可驱动）；② `extracted === 0` → 驱动；③ **`extracted > 0` → 不驱动**（见下节「抽取优先」）；④ `extracted === null`（没测/脚本抛错）才回落到「判决不健康就驱动」。**`null` 不是 `0`**，不得据「没测」定罪。

### 对齐审计：URL「能用」不等于「对」（2026-09-23）

抽取层回答的是「这个 URL 出不出得来东西」，**不是**「这个 URL 是不是搜索 URL」。一个本来就在列文章的页面自己就能抽出条目，所以**健康信号永远不会去看它的搜索 URL 长什么样**——这类源的健康是真的、URL 却不是搜索 URL。两条结论不矛盾，它们回答的是不同问题。

于是修复触发条件（`extracted > 0 → 不驱动搜索框`）**结构上无法**发现对齐问题：要审计就必须**绕过**它，而不是收紧它。

| 模式         | 命令                                                 | 问的问题                                    |
| ------------ | ---------------------------------------------------- | ------------------------------------------- |
| 修复（默认） | `source-url-discover.mjs --only <名> --keyword-zh …` | 这个 URL 抽不出东西，正确的 URL 是什么      |
| 审计         | `--compare`（配 `--only`）/ `--all`（全量）          | **已在用的 URL 是不是搜索框真实产出的那个** |

```bash
# 全量（55 源，约 13 分钟）
node scripts/short-video/source-url-discover.mjs --all --env <主检出>/.env.local

# 单源
node scripts/short-video/source-url-discover.mjs --compare --only <源名> --env <主检出>/.env.local
```

判定：把两侧 URL 归一化后逐段比（`classifyUrlDiff(configuredUrl, recoveredTemplate, keyword)`）。归一化三件事**每件都由一次假阳买来**：

1. **剔易失参数**——否则 douyin 的 `aid=<uuid>` 会让同一个 URL 每次运行都算「不一致」；
2. **关键词折成 `{kw}`**——否则**每个源**都不一致：一边是填好的 URL（`?s=%E4%BA%BA…`），一边是模板（`?s={kw}`）；
3. **尾斜杠与 host 大小写压平**。

词汇表要能分开「问了并发现不同」与「没问」——压平会让报告看起来比实际干净：

| `match`                       | 含义                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `same`                        | registry 已经指向搜索 URL                                                        |
| `differs`                     | 指向别处；`diffs` 说明差在哪（`host`/`path`/`query-keys`/`query-values`/`hash`） |
| `no-search-box`               | 驱动了，但首页候选上找不到搜索框                                                 |
| `not-measured`                | 没驱动（修复模式下 URL 出得来东西）——**不是 `same`**                             |
| `not-applicable`              | 没有搜索 URL 可对齐：无关键词源（栏目 / RSS / Telegram）或 API 直连源            |
| `no-keyword-in-recovered-url` | 框提交了，但落地 URL 里没有关键词（POST 表单 / 前端路由）                        |
| `uncomparable`                | 两侧有一侧没有可比的东西——**不猜**                                               |

`differs` 是**发现不是故障**：栏目页源可以就配在栏目页上。所以报告只列差异项与两侧抽取数（`extract now → recovered`），**换不换由人判**——回收来的 URL 反而抽得更少就不是升级。

两个坑（本轮实测踩到）：

- **别拿「栏目页型」源当反例**：我一度把 qbitai 说成「配在首页、抽出 33 条、所以 URL 不对齐」。实测它 `supportsKeyword: false`（`keywordForSource` 给它返回空串）——它是**设计上**抓栏目页的源，不是对齐失败。判「对齐」之前先确认这个源**声明了关键词**。
- **recovered 与 configured 相同就不是补丁**：审计模式会对已对齐的源照样回收出同一个 URL 并验证通过。若补丁列表只按「candidate 可用」过滤，就会产出一次**什么都不改的编辑**，还让干净的报告读起来像修了一批。`registryPatches` 必须按**对齐结果**过滤——`ithome`/`thepaper` 正是这样暴露的。

**首轮全量审计台账（2026-09-23，`--all`，55 源，keyword zh=人工智能 / en=AI，13m16s）**

| `match`                       | 数量 | 源                                                                                                                                                                                     |
| ----------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-applicable`              | 33   | 27 个 API 直连源 + 6 个无关键词源（两者都没有搜索 URL 可对齐）                                                                                                                         |
| `no-search-box`               | 13   | jiqizhixin / leiphone / bing_news / sogou_weixin / zhihu / x_search / youtube_search / threads_search / google_search / baidu_search / mcp_grok_search / digg_search / techmeme_search |
| `no-keyword-in-recovered-url` | 5    | xinhua / xhs / weibo_search / duckduckgo_search / polymarket_search                                                                                                                    |
| `same`                        | 3    | ithome / thepaper / bilibili（bilibili 是「现用 = 产出减装饰参数」，多出 `vt`/`from_source`）                                                                                          |
| `differs`                     | 1    | douyin                                                                                                                                                                                 |

**结论：`registryPatches: 0`——没有一条需要改 registry。** 唯一 `differs` 的 douyin 现用版本还**更好**：现用 `/search/{kw}?type=video` vs 搜索框产出的 `/jingxuan/search/{kw}?type=general`，Round C 实测过 20 条 vs 0 条（本轮该源 configured 也读到 0，是它已知的形态间歇，不影响 path 与 `type` 值都不同这个判定）。

**两种「没结论」要分开读，都不能当成「已对齐」**：

- `no-search-box`（13）：**未测到**。首页候选（`origin/` + `so.<域>/` + `search.<域>/`）上都找不到可驱动的搜索框——多数是 app 型或登录墙站点。这不是「对齐了」，是「这一层没有结论」，要测得更细得先扩首页候选或选择器。
- `no-keyword-in-recovered-url`（5）：**框提交了，但落地地址栏不带关键词**（xinhua 落回 `so.news.cn/`、weibo 落回 `s.weibo.com/`、duckduckgo 落回 `html.duckduckgo.com/html/`）——它们的搜索走前端路由/POST。**推论：对这 5 个源，「驱动搜索框回收 URL」这条修复路径本来就不适用**（xinhua 的 hash 形式 URL 有效，但不是从地址栏回收来的）。下次别在这几个源上白费这一跳。

### 第四个假判决：抽取层比其余两轴更权威（2026-09-23，guancha 定案）

前三条轴是按顺序加的，加完才发现它们**不是平权的**——前两轴问的是**代理问题**（「这个 URL 看起来像结果页吗」），第三轴问的是**管线真正要问的问题**（「我们的契约还能不能从这页上拿到东西」）。两者背离时，第三轴赢，理由是硬的：**拦截页无法满足一个源的抽取契约**。

两个镜像实例，同一天测出：

| 源      | 轴 1/2 判决                    | 轴 3 抽取 | 谁对 | 旧写法会怎么错               |
| ------- | ------------------------------ | --------- | ---- | ---------------------------- |
| douyin  | 轴 2 `alive`、20 张卡在屏上    | **0**     | 轴 3 | 把死源留在健康栏             |
| guancha | 轴 2 `probe-not-authoritative` | **230**   | 轴 3 | 把活源写进「真封锁、别碰」栏 |

guancha 的假封锁查出机制：snapshot 的 `blockHint` 扫的是**整页 `innerText`**，正则里有 `安全验证`，而观网页面上确实出现了这个词（页脚/导航），于是判决变成 `probe-not-authoritative` → `resolvesTo: blocked-in-browser-too`，读起来就是「封锁是真的，换 URL 也没用」。同一页，该源自己的脚本抽出 **230** 条。

修法做成 seam `resolveHealth({verdict, extracted})`，并**把背离显式标出来**而不是静默压平：

| extracted      | verdict 健康                     | verdict 不健康                            |
| -------------- | -------------------------------- | ----------------------------------------- |
| `> 0`          | `healthy-in-browser`             | **`extracts-despite-verdict`**            |
| `0`            | `url-alive-but-extraction-empty` | `still-broken`                            |
| `null`（没测） | `healthy-in-browser`             | `blocked-in-browser-too` / `still-broken` |

`extracts-despite-verdict` 是给读者看的：抽取赢了，但**轴 2 说过别的话**，值得去看一眼。同理 `usable` 判据从「verdict 健康 **且** 抽取非 0」收紧成「**抽取 > 0**」——否则轴 2 误读一次，就会把已经验证可用的替换 URL 判成不可用。

注意 `alive-no-keyword` **不入**健康集：它是「页面在、但没有这个词」，即 URL 不对，属 `still-broken`；不能借 `url-alive-but-extraction-empty` 这个标签（后者的全部含义是「URL 没问题，去看脚本」）。

### 第五个假判决：200 状态码的 JS 挑战页（2026-09-23，36kr 定案）

反爬词表只在 4xx 分支生效（`detectBlockPage` 先判 `status`），而**挑战页可以是 200**。36kr 实测两种形态交替出现：

- 挑战形态：HTTP **200**，正文是「火山引擎 正在进行安全检测… 系统正在检测当前网络环境」→ 抽出 **0** 条；
- 正常形态：同一 URL 抽出 **97** 条。

按旧判据，挑战形态会被写成 `url-alive-but-extraction-empty`——把读者送去「你的 URL 或脚本错了」的手册，而正确动作是「**离开这个源**」。修法：把 `安全检测`/`Verifying you are human`/`Checking your browser` 一类加进 snapshot 的 `blockHint`（它在页内、与状态码无关，正是 JS 插页该待的地方）。

**但词表永远是残缺的，不要把它当检测器**：它是「见过的插页」的词汇表。真正的结构性保护是上一节的抽取优先——**词表漏掉时降级的是标签，不是决策**。所以加模式的门槛是「有真页面作证」，不是「想象它可能出现」；而加了也不怕，因为 `extracts-despite-verdict` 会替抽取到的源兜住。

### 第六个假判决：轴 1 的 `network-error` 也可能是「探针没有路由」（2026-09-23）

`network-error` 是**失败判决**，会进死源台账。但「连不上」和「连上了但没内容」是两件事。实测：4 个源（`polymarket_search`/`digg_search` + 两个 Google `site:` 源）全部 `UND_ERR_CONNECT_TIMEOUT`，而**同一个出口连 `google.com` 都不通**（`curl` 超时，`gh` 却完全正常）。

修法：连接级失败时，用**同一个探针**再请求一次 `<origin>/`（裸根、无关键词、无凭据、短预算）。控制组也失败 ⇒ 记 `probe-no-egress`，**不进死源台账**；控制组通了 ⇒ 保持 `network-error`（这个 URL 不行，但主机可达）。未做控制（`null`）不猜，保持 `network-error`。

`probe-no-egress` 与 `probe-not-authoritative` **故意分开**：后者是「主机答了，答案是关于探针的」（WAF/凭据），下一步是看请求头；前者是「**根本没有回答**」，下一步是查代理/出口。轴 3 的 api 路径同样接了这条控制（`tiktok_creator` 实测 `network-error` → `probe-no-egress`：`api.scrapecreators.com` 直接 `ECONNRESET`）。

### 第三条轴：URL 可达 ≠ 可抽取（2026-09-23，douyin 定案）

前两条轴问的都是「这个 URL 是不是结果页」。决定管线生死的是第三个问题：**registry 自己的 `articleScript` 现在还抽不抽得出东西**。两者会背离——douyin 就是前两条轴全绿、源却是死的：

| 轴                                            | 测什么                           | douyin 实测                                  |
| --------------------------------------------- | -------------------------------- | -------------------------------------------- |
| 1 裸 HTTP（`source-url-sweep`）               | 状态码 / 关键词命中 / 结果页形态 | `alive-no-keyword`（SPA，HTML 里没有关键词） |
| 2 真浏览器（`source-url-discover`）           | 登录墙 / 封锁 / 落地 URL         | `alive`——**20 张带文本的真结果卡就在屏幕上** |
| 3 抽取（`selector-health` / `articleScript`） | 管线实际会拿到几条               | **0 条** ← 真正的故障                        |

第 3 轴此前只活在 `selector-health`（要单独想起才会跑），于是第 1/2 轴都说健康时 `source-url-discover` **直接跳过了驱动搜索框那步**（旧门槛：URL 不健康才驱动），源就一直待在「健康」栏里产出 0 行。

**判据修正**（都落在 seam，不在调用点）：

- `needsSearchBoxDrive({ verdict, extracted, keyword })`（`lib/source-url-heal.mjs`）：URL 不健康 **或** 抽取为空，都要驱动搜索框。`extracted === null` 是**没测**（无脚本 / 脚本抛错），不等于 0，不得据此触发。
- 新标签 `url-alive-but-extraction-empty`：把「URL 活着但抽不出」单独命名，它与 `still-broken` / `healthy-in-browser` 的后续动作各不相同。
- 候选模板的 `usable` 加了抽取条件：**渲染得出结果页 ≠ 这是修复**。只验到第 2 轴，就会把 douyin 那种「页面很漂亮、抽 0 条」的 URL 当成修复。
- `source-url-discover` 每行都跑一次该源自己的 `articleScript`，报告多一列 `extract`（`n/a` = 没测，`0` = 测了且为空）。

**douyin 实例拆解**（keyword=人工智能；2026-09-23 用 CDP 在登录态 profile 上复测四种形态）：

| URL                                       | 卡片 | 卡内 `<a href>` | registry 抽到 |
| ----------------------------------------- | ---- | --------------- | ------------- |
| `/search/{kw}`（默认综合 tab）            | 20   | **0 / 20**      | **0 条**      |
| `/search/{kw}?type=video`                 | 20   | 20 / 20         | **20 条** ✅  |
| **搜索框驱动真实落点**（首页输入 + 回车） | 20   | **0 / 20**      | 0 条          |
| `/jingxuan/search/{kw}?type=general`      | 20   | 0 / 20          | 0 条          |

搜索框驱动的地址栏原文（这就是「回收真实搜索 URL」拿回来的东西）：

```
https://www.douyin.com/jingxuan/search/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD
  ?aid=e5019d6d-8cc1-4251-b58f-176f8eb02438&type=general
```

两点从这次复测里才看清：① 驱动搜索框带回的不只是路径，还有一枚每次生成、与搜索无关的 `aid=<uuid>`——把整条地址栏当模板存下来会连一次性参数一起固化；② 直连 `/jingxuan/search/…?type=general` 时，**地址栏最终被改写成 `/search/…?type=general`**（换过路径；是 HTTP 重定向还是前端改写本轮未区分），但**唯一没变的是 `type=general`，且仍抽 0 条**。

结论：**决定可抽取性的是 `?type=video` 这个查询参数，路径（`/search/` 还是 `/jingxuan/search/`）不是决定量**。也就是说 `type=video` 是必需参数、不是可选装饰。综合 tab 的结果卡是纯 `div` + 背景图（`class="search-result-card"` 里一个锚点都没有），视频 tab 每张卡才带 `//www.douyin.com/video/{id}`。卡片类名是 CSS-module hash（`PtY9QFFE`、`VDYK8Xd7`），**不能进选择器**；标题改用「锚内最长的单个文本块」取（锚文本是「时长+播放量+标题+话题+作者+日期」的拼接，直接取会得到 `04:181195Meta的Muse…` 这种脏标题）。

**方法论教训**（比这一处修复更重要）：驱动搜索框回收的是「站点自己的路由」，但它证明的是**可达**，不是**可抽取**。douyin 的搜索框落点确实可达、也确实是站点真实路由，却照样抽 0 条——**它替代不了第 3 轴**。这次连「它是稳定路由」都不完全成立（地址栏里的路径被改写过），唯一稳定的判据只来自第 3 轴。三条轴缺任何一条，要么把测量缺陷报成源的缺陷，要么把死源留在健康栏。

### 第三轴的第二个假判决：`captcha` 容器提示（2026-09-23，**生产缺陷**）

`detectAntiBot` 的页面脚本把「存在 captcha 容器」编码成字面串 `" captcha-dom"` 拼进样本文本，再由 `matchAntiBotIndicators` 的 `includes("captcha")` 命中——于是**只要页面里有 `[class*="captcha"]` 元素就被判成反爬插页**。而合法站点为自己表单嵌入的 reCAPTCHA、或阿里云验证码配置脚本（thepaper 页面上就有 `window.AliyunCaptchaConfig`），都符合这个条件。

后果不止在诊断工具：`search-sources.mjs` 的**前置**检查命中即整层 CDP 失败、交回退链；`selector-health` 同款前置检查命中即在**抽取之前**返回（耗时 2.6–4.7s）。实测五个源被这样误杀，且**从未被真正测过**：

| 源         | 修复前（2.6–4.7s，没跑抽取） | 修复后                           |
| ---------- | ---------------------------- | -------------------------------- |
| techcrunch | `anti_bot:captcha`           | **68 条**                        |
| guancha    | `anti_bot:captcha`           | **240 条**                       |
| douyin     | `anti_bot:captcha`           | **20 条**                        |
| thepaper   | `anti_bot:captcha`           | 25 条（另修 url，见台账）        |
| xhs        | `anti_bot:验证码`            | **仍是真封锁**（可见验证码文案） |

修法（`lib/cdp-client.mjs`）——两条不对称：

1. **容器必须可见**：要求 `getBoundingClientRect()` 宽 ≥100 且高 ≥40；且不再用字符串夹带，改为结构化 `{text, captchaVisible}` + 独立标签 `captcha-dom`（`parseAntiBotSample` 保留旧字符串形态）。
2. **容器默认不作数（`allowDomHint` opt-in）**：文本证据（页面**说**「unusual traffic / 验证码 / are you a robot」）在任何位置都算；**物件**只有在「**且一条都没抽到**」时才算——techcrunch / guancha 在健康页面上也带可见容器，单看物件必假阳。调用点：`selector-health` 前置只认文本、抽取为空后的复查开 `allowDomHint`；`search-sources` 前置只认文本、抽取为空后复查开 `allowDomHint` 并返回 `status: "anti_bot"`。

另外收紧 `429`：裸子串会命中 `4290 views`、`id=1429`，改词边界 `\b429\b`。

**教训**：判决的两个来源——页面的**话**与页面的**物件**——证据强度不同，不能合并成一条 `includes`。把弱证据塞进强证据的通道，就会造出「源明明是好的、却从来没被测过」这种最难发现的假判决。

### 第三个假判决：第三轴比第一轴更不懂凭据（2026-09-23，同一课上了两遍）

`source-url-sweep`（轴 1）在 #332 上已经修过「探针带不上凭据」：入口 `loadEnv()` + `--env`。但 `selector-health`（轴 3）的 `checkApiSource()` 是**裸 `fetch(url)`——既不加载 `.env.local`，也没有 header 能力**。于是六个 api 源红了一片，而红的原因是探针，不是端点。

两条独立的缺陷叠在一起：

1. **不加载 env**：Node fetch 只认 `process.env`，`.env.local` 里的 key 从没进过进程。`apiSearch.url()` 用 `process.env.GNEWS_API_KEY` 拼 `apikey=`，拿到空串 → 服务端答「你没给 key」（gnews 400 / currents 401）。
2. **模块作用域读取 env（更隐蔽）**：`headers` 写成模块级对象字面量时，`process.env` 在 **import 时刻**就被快照了 —— 而 ESM 的 import 求值先于入口点的 `loadEnv()`（#287 规定 env 由入口加载），所以 key 在对象构造时就已经是 undefined，`headers` 冻成 `{}`。**生产 `search-sources.mjs` 也踩这个坑**：它确实传了 `api.headers`，但收到的是那个冻住的空对象。

修法：

- `resolveApiHeaders(api)`（`lib/source-registry.mjs`）：对象或 getter/函数两种形态都收，请求时解析。注册表里 `tiktok_creator` / `github_search` 的 headers 改成 **getter**，所以调用点（`search-sources`、两个探针）一行都不用改，而 key 一定在请求时读取。
- `missingApiKey(capabilities.articles)`：读 #67 已定的凭据权威（`requiresApiKey` + `apiKeyEnv`，后者来自 `API_KEY_ENV_MAP`），**只对声明必需的 key 生效**。
- `checkApiSource()`：缺 key **在发请求之前**就判 `probe-not-authoritative`；其余 4xx 交给轴 1 同款 `classifyProbe` —— 401/403/405/429/503 是「关于探针的回答」，404/410 才是「关于端点的回答」。
- `failureClass(result)` 三分类：`none` / `source`（真失败，进修复手册）/ `probe`（`anti_bot:*`、`need_login`、`login-wall`、`probe-not-authoritative`——隔离，不进台账）。**只有 `source` 才让退出码非零**，避免「缺 key」或「没登录」把健康检查染红。

实测（`checkApiSource` 直调，绕开 CDP；keyword = artificial intelligence）：

| 源             | 不带凭据                                  | 带 `.env.local`                                                      |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| gnews          | `probe-not-authoritative`（缺 GNEWS…）    | **10 条 ✅**                                                         |
| currents       | `probe-not-authoritative`（缺 CURRENTS…） | **10 条 ✅**                                                         |
| tiktok_creator | `probe-not-authoritative`（缺 SCRAPE…）   | `network-error`（key 已送出）                                        |
| github_search  | 10 条 ✅                                  | 10 条 ✅                                                             |
| openalex       | 10 条 ✅                                  | 10 条 ✅                                                             |
| core_search    | 10 条 ✅                                  | `probe-not-authoritative`（第二次调用被限流 → 正确读作「关于探针」） |
| reddit_search  | `network-error`                           | `network-error`                                                      |

**哪些源真的要 key**（可机读，`capabilities.articles.apiKeyEnv`）：只有 `gnews` → `GNEWS_API_KEY`、`currents` → `CURRENTS_API_KEY`、`tiktok_creator` → `SCRAPECREATORS_API_KEY`（付费，默认跳过）。`github_search` 的 `GITHUB_TOKEN` **不算**——缺它只是 60→5000 req/hour 的差别，所以它不在 `API_KEY_ENV_MAP` 里，也永远不会被读成「缺凭据」。其余 key（BRAVE/SERPER/TAVILY/JINA）属于 #65 的 web 搜索回退池与图片库，不在这条链上。

顺带：`source-url-sweep` 的 `keyPresence` 改为从注册表派生，不再手抄一份会漂移的清单。`selector-health` 也加了入口守卫（`import.meta.url === file://${process.argv[1]}`，与 sweep 一致），否则单测为了拿纯函数而 import 它，会顺带启动一次 CDP 全量体检。

**为什么必须用 `--env`**：`.env.local` 是 gitignored 的，**只在主检出里**，worktree 没有自己的那份。而 `loadEnv()` 的默认路径是「本仓库根」——在 worktree 里跑就是 worktree 根，等于没有。所以要么在主检出里跑，要么 `--env <主检出>/.env.local`（别把密钥拷来拷去）。

**教训**（与 `captcha` 那条同源）：**同一个假判决会在每个探针层各犯一次**。轴 1 修好凭据入口不等于轴 3 也修好了；修完轴 3 之后还要回头看轴 1 有没有同一个洞（header 型凭据 —— 有，已一并补上）。判据要落在共享 seam（`classifyProbe` / `PROBE_UNAUTHORITATIVE_VERDICTS` / `failureClass`）而不是各写一份，否则每加一条轴就多一份要同步的逻辑。

### 第七个假判决：chrome-error 落地被算成 0 条（2026-09-24，digg_search 定界）

`digg_search` 落地 `chrome-error://chromewebdata/` = **导航本身没产出页面**（DNS/代理/传输层），根本没有 DOM 可抽——旧流程照样跑抽取、把失败读成 `zero_results`，看起来像选择器腐烂。主层检查现在先查落地地址（`landedChromeError`）：命中先换新标签重试一次（网络抖动），仍错用 `networkLayerVerdict` 定界——**裸 `<origin>/` 控制组**：控制组也不通 → `probe-no-egress`（关于探针的路由，不进死源台账）；控制组通 → `network-error`（这条 URL 自己的传输失败，进失败栏）。两个值都来自 10 值判决词汇表，不新增野生值。与 §第六个假判决同一条纪律：**先分清「谁的问题」再选手册**。

### site: 兜底层自己的巡检：`selector-health --fallback`（2026-09-24，#337）

五层链的第三层（googleSiteFallback）此前只被当兜底用，**这层自己坏没坏从未单独测过**——主层检查过不了时链会落到它，若它也烂则整链静默归零。`--fallback` 模式对全部 21 个带 fallback 的源（13 auto + 8 explicit）逐源探测 `googleSiteFallback.url(keyword)` + 源自己的 `articleScript`，输出三档质量判决（`fallbackQuality`）：`real` / `low-quality`（relevance 判 invalid 或全部「标题」是裸 URL——裸 URL 行是结果数与真实文章数的错位信号）/ `zero`，相关性复用生产 seam `judgeRelevance`，不另写一套。

首轮全量审计（2026-09-24）：**17/21 健**——15 real + 2 low-quality（xhs、sogou_weixin 各 1 条裸 URL，处置 = **低质回收不入库**，别为凑数把垃圾接回主链）；**xinhua 0 = site: 层真死**（与开票基线一致，主层 `#search/0/{kw}/1/` 才是它的活路）；youtube/arxiv/github 3 源在本轮被审计自身触发 google.com 小时级限流——**审计自己就是负载**，一次全量跑完当天别复跑，判读前先看是否探针侧限流（对照当日早基线）。

### 二轮台账（2026-09-22，55 源清扫 + 10 源 CDP 复核）

清扫产物 `output/source-url-sweep-2026-09-22.json`；CDP 复核产物 `output/source-url-discover-batch1.json` / `batch2.json`。

| 处置                                          | 源                                                                                                                                                                                                                                                     | 实测证据                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **已修 + 已落库**                             | xinhua                                                                                                                                                                                                                                                 | 旧 `www.news.cn/search/news.htm?keyword=` 404；`www.news.cn/search?q=` 是 ErrorPageTemplate 假页；JSON 端点 `so.news.cn/getNews` 对 Node fetch 403（openresty，159B）、浏览器内 200 + JSON。真实页面路由 `so.news.cn/#search/0/{kw}/1/` 经双关键词证伪（量子计算→量子聚力/潘建伟，人工智能→人形机器人），结果容器 `.items`，`selector-health --only xinhua` **6 条绿** |
| **诊断收口，未改行为**                        | jiqizhixin                                                                                                                                                                                                                                             | 关键词搜索是**服务端故障**（浏览器内一样 500 +「服务器内部故障」），不是 SPA 渲染问题；存在可用的 `api/article_library/articles.json` 但**忽略一切关键词参数**（latest-flow）；机器之心内容已由 `wechat2rss_jiqizhixin` 覆盖 → 改成 listing 源只会重复入库，维持原状待裁决                                                                                             |
| **已修 + 已落库（needsAuth）**                | ithome                                                                                                                                                                                                                                                 | 真实形态 `/search/{kw}.html`；对匿名（含无 cookie 的纯 HTTP）一律 302 到 `user-login/index.htm?tip=登录以查看搜索结果` → URL 改正 + `needsAuth: true`；匿名通道是 `/rss/`（60 条，当日）。**三补轮：在带登录态的 profile 下仍被同一门禁 302 拦下**——登录门是站点侧的，不是探针环境造成的（登录表单在 `my.ruanmei.com` 的 **iframe** 内，页面上有微信扫码面板）         |
| **判据修正，无需修源**                        | bloomberg、thepaper、threads_search、reddit_search、zhihu、tiktok_creator、core_search、google_search、techmeme_search、wechat_dongchabeating、weibo_search                                                                                            | 见上表五类误判；红黑名单归属由新判决自动分流                                                                                                                                                                                                                                                                                                                           |
| **确认真实封锁，按边界不修**                  | reddit_search（浏览器内也是 network-security 拦截页）、tiktok_creator（401：探针带不上 API key 头）                                                                                                                                                    | `blocked-in-browser-too`                                                                                                                                                                                                                                                                                                                                               |
| **真 URL 已回收；weibo 在登录态下已验证可用** | weibo_search → `s.weibo.com/weibo?q={kw}&Refer=index`（**带登录态 profile 下 5350 字符真结果、零登录提示** → 旧 `login-wall` 判决系空 profile 造成的假阳）；douyin → `so.douyin.com/s?search_entrance=aweme&keyword={kw}`（内容加载失败 + 需登录账号） | weibo = **可用**，待落库裁决；douyin = `url-recovered-but-login-gated` 待裁决                                                                                                                                                                                                                                                                                          |

## 已知修复台账

| 日期               | 源                                                               | 失效原因                                                                                                                                                                                                | 修复要点                                                                                                                                                                                                           | 验证                                                                                                       |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 2026-09-24         | techmeme_search                                                  | Google SERP legacy 块（`div.g`/`.Gx5Zad`/`.fP1Qef` + 域过滤）失效抽 0；A/B 同 URL 换 `SHARED_GOOGLE_SITE_SEARCH_SCRIPT`（h3）抽 9——纯选择器腐烂，主 URL 本身就是 Google、兜底链只有 CDP 一层             | 换 h3-based 脚本：techmeme.com 域过滤 + snippet 标题兜底（permlink 结果 h3 是泛化站名 "Techmeme"、真实标题在 snippet；裸共享脚本集合 9 < `RELEVANCE_MIN_RESULTS=10` 过不了 relevance guard）                                        | A/B 复现（基线 0 条走满 3/3 重试）→ 真页 9 条 → `selector-health` 4/4 healthy（google_search/bing_news 无回归） |
| 2026-09-24         | wechat_dongchabeating                                            | 同上 Google SERP legacy 块失效（#140 P5 口径迁移漏网：注释写了新口径、脚本没换）；旧白名单还会误杀 sohu/163/ifeed 真转载                                                                                 | 直接复用 `SHARED_GOOGLE_SITE_SEARCH_SCRIPT`，删旧白名单                                                                                                                                                             | 真页 10 条 → `selector-health` 4/4 healthy；vitest 293 全绿（commit `4047051`）                           |
| 2026-09-23         | qbitai                                                           | **无源侧修复——误判撤销**。triage 只复刻了 `articleScript` 的阶段一（`.article-item/.post-item/.list-item`），得到 0 就宣布「选择器腐烂」；脚本自带阶段二泛扫兜底                                        | 不改 registry。教训写进 §B 首坑：**要测就测 registry 里那个整脚本**，别手搓子集                                                                                                                                    | 阶段一容器命中 **0** / 泛扫命中 **33** / **整脚本返回 33** → 源健康，票作废                                |
| 2026-09-23         | guancha                                                          | 轴 2 误读：snapshot 的 `blockHint` 扫**整页 `innerText`**，正则里的 `安全验证` 命中了页面自身的文本 → `probe-not-authoritative` → 「真封锁、别碰」                                                      | 新增 seam `resolveHealth({verdict, extracted})`：**抽取 > 0 时轴 3 赢**，并显式标 `extracts-despite-verdict` 而不是静默压平；候选 `usable` 判据同步收紧为「抽取 > 0」                                              | 同页 extract **230**，`resolvesTo` 由 `blocked-in-browser-too` 改为 `extracts-despite-verdict`             |
| 2026-09-23         | 36kr                                                             | **200 状态码的 JS 挑战页**（火山引擎「正在进行安全检测」）：词表只在 4xx 分支生效，200 + 挑战正文抽 0 条被读成 `url-alive-but-extraction-empty`（送错手册）。形态**间歇**出现                           | `blockHint` 词表补 `安全检测` / `Verifying you are human` / `Checking your browser`；词表残缺由上一行的抽取优先兜底                                                                                                | 挑战形态抽 0（现标为 blocked）/ 正常形态同 URL 抽 **97**，`healthy-in-browser`                             |
| 2026-09-23         | tiktok_creator、polymarket_search、digg_search、2×Google `site:` | 轴 1/3 的 `network-error` 被当失败判决：实为**探针没有到该主机的路由**（`api.scrapecreators.com` `ECONNRESET`；同出口连 `google.com` 都不通，`gh` 正常）                                                | 新增 `probe-no-egress`：连接级失败后用同探针请求裸 `<origin>/` 作控制组，也失败即改判且**不进死源台账**；轴 1（sweep）与轴 3（api）都接                                                                            | `selector-health --only tiktok_creator` 由 ❌ `network-error` 改 ⚠️ `probe-no-egress`，退出码由 1 归 0     |
| 2026-09-23         | techcrunch / guancha / douyin / thepaper / xhs                   | `detectAntiBot` 把「页面里有 captcha 容器」编码成 `" captcha-dom"` 字面串 → 被 `includes("captcha")` 命中 → **前置**检查在抽取前就判 `anti_bot`（生产里是整层 CDP 失败交回退链）                        | 页面脚本改结构化 `{text, captchaVisible}`；容器须可见（≥100×40）且仅在「抽取为空」时才算（`allowDomHint` opt-in）；`429` 改词边界                                                                                  | techcrunch **68** / guancha **240** / douyin **20** / thepaper 25；xhs 仍真封锁（`anti_bot:验证码`）       |
| 2026-09-23         | thepaper                                                         | 查询参数是 `id=` **不是** `keyword=`：`?keyword=` 是 200 +「找到约0个结果」的假页（旧探针因此只到 `alive-zero-results`）；结果链接是 `/newsDetail_forward_<id>`，容器类名是 CSP hash（`.first__TIDm_`） | url 改 `?id={kw}`；articleScript 改为按 URL 形态取锚点 + 非空标题守卫 + 就近取图                                                                                                                                   | `selector-health --only thepaper` **25 条绿**                                                              |
| 2026-09-23         | douyin                                                           | 配置 URL 少了 `?type=video`：综合 tab 的结果卡是纯 div + 背景图（卡内 `<a href>` = 0/20），旧 articleScript 恒抽 0 条                                                                                   | url 加 `?type=video`；articleScript 改为只按语义锚点 `a[href*="/video/"]` 取，标题按「锚内最长单个文本块」过滤掉时长/播放量/作者/日期的脏拼接；`loginCheckScript` 改为「无结果链接 **且** 页面在喊登录」才算未登录 | 三个候选 URL 对照（综合 0 / `?type=video` 20 / 搜索框落点 0）+ `selector-health --only douyin` **20 条绿** |
| 2026-09-22         | xinhua                                                           | `www.news.cn/search/news.htm?keyword=` 404；`search?q=` 是错误模板页；JSON 端点 `so.news.cn/getNews` 被 WAF 拦（Node 403 / 浏览器 200）                                                                 | url 换真实页面路由 `so.news.cn/#search/0/{kw}/1/`，articleScript 收到 `.items a[href*="news.cn/20"]`（含重命名兜底）                                                                                               | 双关键词证伪（量子计算/人工智能 标题随词变化）+ `selector-health --only xinhua` 绿 / 6 条                  |
| 2026-09-22         | ithome                                                           | 真实形态是 `/search/{kw}.html`（非 query 参数），且对匿名一律 302 到登录页——两个事实被旧判据混成一个 404                                                                                                | url 改为真实形态；`needsAuth: true`（登录门由用户处置）；匿名通道沿用 `/rss/`（60 条 / 当日）                                                                                                                      | CDP 驱动搜索框回收模板 + 裸 HTTP 无 cookie 复现 302                                                        |
| 2026-09-07         | google_search                                                    | Google 新新闻垂直 SERP：结果块改 `div[data-ved][data-hveid]`，标题改 `div[role="heading"]`，`div.g`/`h3` 消失                                                                                           | articleScript/imageScript 重写为新结构；缩略图为 base64 data URI，仅 http 图标记 type=image（可下载），data URI 降级 text；外链过滤 google 域 + URL 去重                                                           | health --only 1/1 绿，10 条全结构（title/url/imageUrl）                                                    |
| 2026-09-07         | leiphone                                                         | 搜索结果标题改为 `a.headTit` 链接，旧 `.article-list`/`article` 容器归零                                                                                                                                | articleScript 改为 `a.headTit[href*=".html"]` 直取                                                                                                                                                                 | health --only 绿，16 条                                                                                    |
| 2026-09-07         | wechat_dongchabeating                                            | Google 站内搜索同吃新 SERP 改版（`div.g` 归零）                                                                                                                                                         | 同 google_search 方案（新 DOM + 转载域白名单）                                                                                                                                                                     | health --only 绿，1 条                                                                                     |
| 2026-09-07         | weibo_hot                                                        | 登录墙（Sina Visitor System）                                                                                                                                                                           | **经调研破局**：切 60s 公共 API（60s.viki.moe/v2/weibo，开源可自托管），apiSearch 化                                                                                                                               | health 绿，50 条/2.3s                                                                                      |
| 2026-09-07         | zhidx                                                            | 搜索结果 XHR 渲染，CDP 抓不到                                                                                                                                                                           | **经调研破局**：站点是 WordPress，切 wp-json REST API，apiSearch 化                                                                                                                                                | health 绿，20 条/2.6s                                                                                      |
| 2026-09-07（放弃） | xinzhiyuan                                                       | DNS 解析 overdue.aliyun.com——主机欠费停放                                                                                                                                                               | 放弃；公众号内容已由 wechat2rss_zhinengyuan 覆盖                                                                                                                                                                   | —                                                                                                          |
| 2026-09-07（放弃） | baidu_news                                                       | 资讯索引功能性死亡（ns 端点空壳 218 字节，热词 0 结果）                                                                                                                                                 | 放弃；详见 docs/research/zh-source-recovery-research-2026-09.md                                                                                                                                                    | —                                                                                                          |

## CDP 代理 wsPath 陈旧坑（2026-09-07 修复）

`DevToolsActivePort` 文件缓存的浏览器级 WS 路径与 Chrome 活值脱节时，代理报「连接失败」而 `curl localhost:9222/json/version` 正常（**当时的约定端口是 9222；2026-09-07 起 TikTok/自动化实例改用 9229，且 9222 因 Chrome 136+ 默认 profile 禁调试已全 404——照抄本条时把端口换成 9229**）——其他 session 正常、本 session 不通的假象即来源于此。已修 `skills/web-access/scripts/cdp-proxy.mjs`：WS 握手失败自动回退 `/json/version` 活值重试。注意 `skills/` 与 agent-harness 仓手动同步，此修复需带过去。
