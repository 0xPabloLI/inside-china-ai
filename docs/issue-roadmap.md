# Issue Roadmap — Open Issues 依赖关系与执行顺序

GitHub Issues 依赖关系 + 执行波次（Wave）+ 价值分层（Tier）+ 主导层级（Dominant/Satellite）+ 状态追踪。每次 triage 后更新。

> **Last inventory**: 2026-09-19（**#317 weibo_search 新源落地闭票 + web-access 阶梯 SearXNG 前移**：① `weibo_search` 入 registry（CDP 主层 + 登录墙 fail-fast 双识别 + site:weibo.com 中层 + 相对时间 fetch-time 转 publishedAt），**真实 smoke 19/19 带 publishedAt、0 degraded**；② 过程中抓到 #269 预检探针误杀登录墙源（s.weibo.com 裸探针 404 判死 → 主层被静默跳过）——修复：needsAuth 源跳过预检，fail-open 交 CDP 层 loginCheck，全 needsAuth 源受益；③ 用户裁决 web-access 阶梯重排：WebSearch → **SearXNG（本地免费）** → search-pool CLI（计费）→ CDP，先烧免费额度；④ 同日：Grok MCP（mcp-search-bridge）确认保留装进 Droid MCP 配置（LLM 直用），#320 开票（自建 wechat→RSS 登记动察Beating，proposal 阶段）；⑤ CDP profile 盘点：仅 1 个自动化罐（chrome-tiktok-profile），无冗余；⑥ 下一 frontier = W2B Tier 2（#312 coverr / #313 youtube bot-check / #315 交付门禁 / #305 pool 零结果告警 / #285 403 探针）+ #320 proposal）

> - **2026-09-19 inventory（前次）**：**#316 专属 MCP 全量退役——实测三 fallback 全死，registry 零 mcpFallback**：① 用户问卷裁决"先实测再定"→ 实测 bilibili/weibo_hot 的 python 模块从未安装（spawn 即死）、sogou_weixin uvx 服务器 MCP initialize 超时（暖缓存复现）；三者落层均静默 0 条（#305 活例），主层（CDP/site:/API）全验证可用；② 用户终裁"全部退役"——链收敛：bilibili CDP→site:→终、sogou CDP→site:→终、weibo_hot API→终；parseGrokListResult 孤儿删除、parseTweetList 保留（x_search）、mcp-client.mjs 机器保留（未来 toolcall 条款）；测试翻转 + registry 零 mcpFallback 总锁；③ 受影响 202/202 + 全量 3935/3935 + eslint 清零；④ 同日早段：#309 收尾交付闭票（research 真实抓取 3 个 environmentalSignals，`d0f2ea0`）+ #307 跟进（上游恢复实测 + mcp_grok_search 输出契约修复 `e6f7cbb`——散文响应曾解析 0 条，现契约格式/NO_RESULTS 确定性落空）；⑤ **管线程序化抓取路径上 MCP 至此彻底清零（#90 → #307 → #316 三步收口）**。下一 frontier = W2B Tier 2（#312 coverr / #313 youtube bot-check / #315 交付门禁 / #305 pool 零结果告警 / #285 403 探针））

> - **2026-09-19 inventory（前次）**：**#309 全部交付闭票——research 真实抓取 3 个 environmentalSignals**：① `selectSourcesForRun` 从 main() 内联抽出为导出函数并测试锁定——research 模式抓取全三组，3 个关键词无关背景源（weibo_hot/datacube_ai/wechat_dongchabeating）每 run 抓一次（同 tracked feeds 节奏），证据角色保持 environmental-signal 不变，trend 选择不变；② TDD red 4 → green（56/56）+ 全量 3931/3931 + eslint 清零；③ 真实 smoke：weibo_hot 50 条 / datacube_ai 50 条 / wechat_dongchabeating 1 条（Google AI Overview 块，该源抽取质量先在问题留观）；④ 同日早前：remote 同步完成（merge `1357ede` 保留本地 SHA，Lovable「AI 问答功能」2 提交并入，**#307/#309 全部提交已 push**）。**W2B Tier 1 清空——下一 frontier = W2B Tier 2 独立票（#312/#313/#315/#305/#285）**）

> - **2026-09-19 inventory（前次）**：**#307 Grok MCP 桥退役——Bigsong 直连 + 显式 pool 资格交付**：① `mcp_grok_search` 转 Bigsong 直连（`apiFallback`/searchX，同 grok-chat-fast 上游），registry 级 `promptTemplate` 落地（显式 7 天窗 + 强制日期 + 排除 wiki/评测站 + 去 China-AI 限定，grilling 裁决 3），accessMethod 改 `primary: "api"`；② `google_search` 的 Grok fallback 退役（裁决 5 同逻辑 + 用户同日质疑「Grok 不需要都做 fallback」），链止于 REST pool——`isPoolEligible` 改显式 `poolEligible: true` 声明、与 mcpFallback 解耦（#292 派生删除），pool 门升为独立链层（apiFallback → pool → 专属 MCP）；**mcp_grok_search 不进 pool 经用户签字**（OQ3 六源配额经济学前提已消失，pool 先行会埋掉独立源语义）；③ apiFallback 载体不变量 1→2（x_search + mcp_grok_search），pool-eligible 2→1（google_search）；`MCP_SEARCH_BRIDGE_SERVER`/`NODE_BIN` 常量移除（零消费者，mcp-client.mjs 保留给未来 toolcall）；④ TDD red 15 正中目标 → green，受影响 222/222 + 全量 3926 绿，eslint 清零；code-review 双轴采纳 4 项修复（CONTEXT.md Collection Layer 同步/双 JSDoc 去叠/Step 3.5 注释引测试/链序测试绑定真实源）；⑤ smoke 实测：Bigsong live-search 上游对新旧查询一律 90s+ 超时（纯 chat 4s 正常）——上游降级与改动无关，MCP 桥同受累，fail-closed 返回空。commit `2f97be9`；**#307 闭票**；同日已随 remote 同步 push（merge `1357ede`））

> - **2026-09-19 inventory（前次）**：**#315 门禁缺陷分流落位 + 闭票标签全量卫生对齐**：① **#315 triage 深度 review 与落位**：问题定位为 `.github/workflows/issue-tracker-signals.yml` 门禁单次校验不阻断、无状态机与复检机制致存量告警累积；落位 **Phase 2 · W2B / Tier 2 / Satellite / P2 / `ready-for-agent`**；Open Questions（cron vs label 状态机、告警归属 @ 谁）留实施时裁决；远端标签更新为 `["enhancement", "P2", "ready-for-agent"]`；② **闭票标签卫生全量清扫**（用户裁决）：46 张 closed 票标签净空（9 张硬违规 state label `needs-triage` ×7 / `ready-for-human` ×2 + 9 张残留 `P1`–`P3` 标签 + 33 张遗留 `comments-unread` 全部移除，仅留 category 标签）；③ **规则口径升级**：`docs/agents/issue-tracker.md` 与 `triage-labels.md` 明确规范闭票移除所有 state、priority（`P0`–`P3`）及 signal 标签（`comments-unread`），彻底消除口径矛盾；下一 frontier = #309 research 模式 3 个 environmentalSignals 抓取收尾，或 W2B Tier 2 独立票 #312/#313/#315）
>
> - **2026-09-19 inventory（前次）**：**#309 site: 推广实施 + threads 判决 + CDP-DOM 日期两档制交付**：① grilling 两问用户裁决——threads"它是特定来源，fallback 到其他 search 没有意义；先查清它为什么不可用（注册/登录/Cookie？）"+ 可选 site: 补源"全部补齐"；② **threads 弱因诊断**：live 探针（threads.net 搜索页 ×2 关键词）判定**无登录墙、无 anti-bot、CDP 层本就可用**，弱因 = 旧 articleScript 不提取 URL/日期——非注册/登录/Cookie 问题；articleScript 重写为 perma-link（quoted-post 去重）+ `time[datetime]` ISO + handle（perma-link 解析，DOM 锚点序不可靠；模板字面量吞正则反斜杠的坑已记录），链止于 CDP + 入 `AUTOGEN_EXCLUDED_SOURCES` 防死层，`mcpFallback` 删除；③ **site: 推广六源**：youtube/arxiv/github/bilibili/sogou_weixin（`site:mp.weixin.qq.com` 文章实体域）/tiktok_creator（首个真实关键词层，§D9）显式 `googleSiteFallback`（`makeGoogleSiteFallback` 工厂 + `qdr:y`），**Grok web_search fallback 退役四源、pool-eligible 6→2**（google_search + mcp_grok_search，grilling 裁决 5；"仅 x_search 携带 apiFallback"不变量不变）；④ **CDP-DOM 日期两档制**：`applyCdpPostGuards` = relevance guard → `markCdpDomDateSemantics`（articleScript 日期不动 → og-meta publishedTime 经 `normalizePublishedDate` 提升 → 无日期打 `dateDegraded`，fail-closed 显式化"不参与时效断言"）；⑤ 验证：TDD red 8 → green、受影响 215/215 + 全量 3919/3919（rate-limiter 计时 flake 隔离绿）、eslint 清零、live smoke 双通过（threads 20 条全带 permalink+日期；`site:youtube.com` 9/9 真视频 URL 同 x_search 先例）；code-review 双轴无阻塞 finding，采纳 3 项小修（工厂收敛/组合去双写/条件输出）；⑥ Threads 冷词相关性弱（返回近期热门贴）按 #286 裁决归 Stage 1 语义层不在此修。commit `bc34f67` **本地未 push（待用户授权）**；**#309 保持 open——剩余：research 模式让 3 个 environmentalSignals（weibo_hot/datacube_ai/wechat_dongchabeating）真实抓取（§C 裁决项）；下一 frontier = #309 该收尾项或 W2B Tier 2 独立票（#312/#313）**；Lovable FAQ merge（`bd66a08`）session 中途落地、零文件重叠）
>
> - **2026-09-19 inventory（前次）**：**交付记录门禁欠账清缴 + 闭票标签卫生**：① 9 张闭票补登 `交付记录` 评论（#280/#282/#290/#283/#306/#221/#273/#270/#219——证据取自 roadmap 与 git 历史；#282 细节标注待原 session 补证）；② 闭票标签卫生：#306 清至 `[bug]`（对齐 #308 先例），11 张 closed 票 `ready-for-agent` 全仓清扫（#292/#270/#221/#219/#207/#204/#203/#201/#197/#184 同批）；③ 捡票规则升级：`docs/agents/issue-tracker.md` 捡票查询加 `--state open` 过滤（存量清扫 + 规则防复发双管）；④ 开票 **#315**（交付记录门禁软提醒无人收账——`check-delivery-record` 仅 `issues.closed` 时校验一次、不复检、告警无归属；#252 为 stale 案例；复检机制形态与告警归属实施时裁决，已带 `needs-triage` 待分流）；**并行 session 的 #311 修复（`3ece3c4` / `05ec11b`）与本批文档改动均本地未 push**）
>
> - **2026-09-19 inventory（前次）**：**最新 issue 深度 review（#311/#312/#313/#314）+ roadmap 契约对齐与闭票状态同步**：① **#314**（douyin/xhs 视频素材源）吸收 2026-09-19 用户裁决补充——摘除 9 个 CDP 新闻源（qbitai/jiqizhixin/ithome/xinhua/thepaper/leiphone/zhidx/bing_news/google_search）的 `capabilities.videos` 声明（registry 仅声明已验能力，保留文章源身份），文章页改做 `<video>` + `iframe` 播放器双检测（ithome 实测 0 原生 video、走 iframe 播放器），逐站验证声明；发现入口形态实施时定；② **#313**（youtube_search bot-check 验证 Chrome cookie 通道）落位 W2B，定界只解 youtube 单源 cookie 路由、不全局切 Chrome，前置读 Chrome cookie DB 验证登录态；③ **#312**（coverr 下载链失效：params.userToken 字符串漂移 + CDN 迁 Mux 404/403）落位 W2B，定界修 parser + 摸底 Mux 签名/API 端点，若无解按 fail-closed 降级/退役；④ **#311**（claim-issue.sh `@me` assign 静默失败假成功）落位 W2B，显式 login + 回读断言 fail-closed，杜绝并行 session 重复认领；⑤ **#306 闭票状态同步**：代码已交付（commit `6d6a3bc`，`daysAgo()` 相对日期机制清除 6 恒挂），roadmap 各表同步为 `✅ 已闭票`；⑥ 全量对齐：Execution Waves W2B/W3B candidates 补入 #311/#312/#313/#314、Triage Inbox 补登分流记录、Conflict Risk Matrix 补登 video-downloaders 与 claim 脚本；**下一 frontier = W2B Tier 1 的 #309 剩余项（site: 推广与 threads 方案裁决）或 W2B Tier 2 独立工具票 #311**）
>
> - **2026-09-17 inventory（前次）**：**#309 weibo 复测判决 + yt-dlp 412 持久退避落地**：① weibo 复测成功——Chrome cookie 通道（978 cookies，Keychain 静默授权）破登录墙，CDP 页内 fetch 验证 `playback_list` 锁定真视频帖，**live-fire 下载 517KB/8s mp4 落盘**，判决路由成、可进白名单（条件：有效 cookie 源——`document.cookie` 拿不到 HttpOnly 的 `SUB`；选样前置视频判定——extractor 对非视频帖只报 `No video formats found`）；报告 §F.3 改判 + §F.4 bilibili 行后记，commit `51c1f9d`；② bilibili 412 双层定性（buvid3 前置条件 + 频次罚站，升级/登录/cookie 有无均排除——新旧版本、直连代理、A/B 全对照）→ **持久退避 guard 落地**：`lib/ytdlp-guard.mjs`（指数 1h→24h 封顶、状态落盘 `output/yt-dlp-412-state.json` 跨 session、`YTDLP_GUARD_DISABLED` 逃生口）+ 三调用点接线（gate/record/clear）+ 浏览器 UA（#16571 证据），实战验收：真 412 当场记 60min 罚站窗，TDD 16/16 + 受影响 362 绿，commits `319dd8c` + `78a7952` 已推 main（push 经 7897 代理过 osv-scanner pre-push）；③ 新票 **#313**（youtube bot-check × Chrome cookie 通道验证）+ **#314**（douyin/xhs 视频发现入口——CDP 下载适配器已备，缺发现层 + 白名单语义）；④ 60s API 复测：429 已恢复（50 条），条目仅 `title/link/hot_value`，**无条目级时间戳也无顶层 update_time**——weibo_hot fetch 时间戳语义维持，**2026-09-19 用户签字确认**；⑤ 帖子级相对时间（"X 分钟前"）已在微博搜索结果页实测可得（20 卡全带，格式可解析），收割 + 本地换算归 #314 设计；⑥ session 收尾：`.codebuddy/` 入 .gitignore，pilot-log 补登（#17）
>
> - **2026-09-16 live 探针轮交付（前次 inventory）**：四项探针完成——① 引擎 news 参数对比（Serper `tbs`/Tavily `topic:news`/Brave `freshness` 全部 100% 带日期字段，Tavily 新闻性最好，参数映射定案三引擎全启用）；② Jina **退出 fail-closed 新闻链**（date 仅 62.5% + 单次 5.9 万 token ≈ 月配额 6%）；③ weibo yt-dlp 4/4 真实样本失败（`WEIBO_COOKIE` 未到位，#75 cookie 管线未被行使，删路由判决延后待复测）；④ video capability **2/14 拿到**（baidu vsearch 垂直页 + pexels API；9 个 CDP 源结构性 0 候选——搜索页不嵌播放器，视频在文章页；youtube bot-check；bilibili 本机直连 SSL 掐断、走代理全通；coverr 下载链漂移待小票）。**新闻契约最短路径已实施**（TDD）：三 parser 日期映射 + pool `toArticle` ISO 归一化 + 引擎 news 参数（Jina fail-closed 跳过）+ pool 接线 7 天窗；326+434 测试全绿；报告 §F 已补。**#309 剩余**：site: 推广实施、threads 方案裁决；URL 层实施后置不变）
>
> - **2026-09-16 triage session（前次 inventory）**：五张待分流票全部落位——**#309**（**P1**，Phase 2 · **W2B** 🎯 Dominant，静态审计已交付 commit `f17daba` / main `4313e29`，剩 live 探针）/ **#307**（P2，W2B）/ **#310**（P2，Phase 3 · **W3B** 🎯 Dominant，#288+#301 并入）/ **#306**（P2 bug，W2B，建议首批以清干净验收基线）/ **#305**（P2，W2B，A/B 并入统一 source-health，C 项 CI 自动开票待授权）；#308 已闭票。**下一 frontier = W2B Tier 1 的 #309**（纯代码子项优先：publishedAt 三 parser 映射 + pool `toArticle` 日期保留 + 引擎 news 参数）
>
> - **2026-09-16 triage 轮次**：Triage Inbox 五张票（#309/#307/#310/#306/#305）全部完成分流落位，无新增重复项；新增三条吸收关系：**#288 + #301 → #310**（素材库体系统一承接，2026-09-15 grilling 裁决）、**#286 → #309**（trend 模式相关性护栏并入 #309 新闻参数落地，同日裁决）。冲突判定：`source-registry.mjs` + `search-sources.mjs` 上 **#309 → #307 必须串行**（同一 fallback 配置字段：先按用途定链、后改调用形态）；**#306 建议排在 #307/#285 之前**——6 个恒挂用例会让后续每一轮 green 验收都带噪声。远程标签变更（加 P 标签 + `ready-for-agent`、清 `needs-triage`）与 #288/#301/#286 的休眠动作**已于同日获授权执行**（#309=P1、#307/#310/#306/#305=P2，五票 `ready-for-agent` 并清 `needs-triage`；#288/#301/#286 改 `dormant`、摘掉 `ready-for-agent` 与 P 标签）。**#306 在标签写入后发现已被并行 session 认领实施**（assignee `0xPabloLI`，工作区三个测试文件可见 `daysAgo()` 改动），roadmap 已标注，本 session 未参与。
>
> - **#292 challenge 第三轮：六源用途语义 + 治理定界**（用户 challenge「YouTube 切 pool/Grok 有什么用？YouTube 要下载视频的呀」——**成立**：`youtube_search` 带 `capabilities.videos={method:ytdlp}`、youtube 在 `SUPPORTED_YTDLP_PLATFORMS`，是素材源；pool/Grok 返回网页文章对素材管线无用。6 源按用途两类：**素材/研究源**（youtube/arxiv/github/threads——`site:` fallback 保平台约束更合理，threads 无索引需单独方案）vs **通用发现源**（google_search=Google News 垂直页 tbm=nws、mcp_grok_search——pool 合理）。**用户裁决**：① 每源像 x_search 一样重捋 + 常设报警机制 → 开票 **#309**（逐源链路审计，62 源按用途定链，作 grilling 输入）+ **#308**（脚本错误显性化报警，proxy 透传/不吞错/script-error 轨迹，#269 Phase 2 地基）；② URL search 层（API → 纯 HTTP → CDP，#66 fetch-page 复活）批准开票走 proposal-review；③ Grok 重新定位倾向：独立事实核查源、不再当 fallback；④ **下一 session 约定 #292/#269/#200 联合 grilling 会**，核心输入 = #309 审计。#292 范围界定：路由语义（已收口，open 待复核闭票），报警/审计/新层均不塞回。**执行顺序与新闻性证据**：`docs/handoffs/handoff-source-chain-rework.md`（pool 关键词原样透传、adapters 无新闻参数、pool 文章无 publishedAt——"每源保证是新闻"当前无系统级保证，待 grilling 裁决）。
>
> - **#292 challenge 深挖第二层：googleSiteFallback 死层根因修复**（用户连问「fallback 有用吗」→ 探针 + 隔离测试定根因）：Google `site:x.com` 索引本身健康（9 h3 + 真实推文 URL，无 consent/captcha），但真实管线恒 0——**根因**：`collectFromCdp` 按 #199 规则读 `cap?.url ?? source.url`（cap 优先），而 Step 2 合成的 fallbackSource `...source` 展开继承了原源 `capabilities.articles`（x.com url + X SPA 脚本），顶层 Google 覆盖被 cap 静默遮蔽——**所有 googleSiteFallback 源自 capabilities enrichment 时代起 fallback 实际重抓原页面、恒 0**（proxy 的 `{"error":"Uncaught"}` 被 extractFromTab 吞成空数组，轨迹只见 zero-results）。修复 `f3d10ba`：fallbackSource 同步覆盖 capabilities.articles 四字段；真实 smoke **首次跑通**：`cdp 0 → google-fallback 9`（9 条真实 X 帖子，免登录零 pool credit）。red 1 → green 211/211。
> - **#292 同日 challenge 裁决（交付修订）**：用户 challenge「x_search 为什么需要 googleSiteFallback / 它跟 Tavily 命中什么关系」——**成立**：smoke 实证 pool 命中 13 条全非 x.com 内容却挂 `source: "x_search"` 标签，且抢占更高质量的 Bigsong 推文；根因是 #65 七源名单写于 #90 之前（当时 x_search fallback 是通用 Grok MCP）。**用户裁决**：① x_search 退出 pool，平台保真链 `CDP → site:x.com → Bigsong`，triage 规则 1 精神优先于 #65 字面；② 6 个 web_search 源的 mcp-search-bridge fallback 转直连 Bigsong API（推广 #90 同 upstream/system prompt/env 模式，MCP 保留给大模型消费方）→ 开票 **#307**。代码修订：`isPoolEligible` 回滚 apiFallback 分支（pool-eligible = 6 源）、层级次序还原（apiFallback → pool → 专用 MCP）。裁决评论 issuecomment-5673271677。
> - **#292 交付**（W2B 🎯 Dominant，Tier 1）：search-sources 体系性重审——对照 triage 裁决逐条核实：Step 3 路由（pool 先于 Grok MCP、平台专用源直走专用 MCP）与 toolName 动态判定**已符合裁决**（测试已锁），真正缺口是 x_search：其 Grok 访问为直连 Bigsong apiFallback（#90；用户裁定 **Bigsong ≡ mcp-search-bridge 后端**）且无 mcpFallback 配置 → 旧 `isPoolEligible` 判否，全链空后 pool 永不触达。第一版修复让 x_search 经 Bigsong 桥进 pool 并重排 pool 先于 Grok；**同日被用户 challenge 推翻，终版见上条裁决**（x_search 平台保真、不进 pool）。审计副产品：registry 级不变量「仅 x_search 携带 apiFallback」已锁死；真实数据 smoke 方法与 #200 轨迹留档。Session-Id `20260915-pool-before-grok-29496e`，commits `d34b207` + `1b571ac` + 修订 commit（见 pilot-log）。**附带发现：brief-builder 测试日期衰减缺陷**（fixture 硬编码 2026-08-15 + 30 天真实时钟过滤，2026-09-15 起恒挂，与本票无关）→ 已开票 **#306**。**W2B 无剩余 Tier 1，下一 frontier = W2B Tier 2 卫星票（#285/#284/#276/#286/#269，#231 T3）。**
> - **#281 交付闭票**（Wave 2A, Tier 3 调研票 + 用户批准顺手修）：Search Pool 引擎可用性复测双定性——**Serper 完全可用**，"恒 0 results" 根因是 pool 适配层 `parseArticles` 字段映射 bug（Serper 返回 `link`/`snippet`，seam 读 `e?.url`/`e?.description`，条目全被丢弃；raw curl 同参数 HTTP 200 + 8 条对照实证），全链每次白烧 1 credit 后假性降级。**Brave 当前可用**：2026-08 TUN fake-ip DNS 故障未复现（fake-ip DNS 仍在 198.18.x，Node fetch HTTP 200 + 20 条）；故障特征与绕行方法（代理规则走代理非 DIRECT / DoH 真实 IP `curl --resolve`）已留档 `search-pool.mjs` 头注与 `skills/search-pool/SKILL.md`。修复内容：`parseArticles` 归一化双词表（`e?.url ?? e?.link` / `e?.description ?? e?.snippet ?? e?.content`），测试 fixture 换真实 API 契约（原 fixture 镜像 bug 致测试恒绿——red 先命中 2 个 Serper 用例后 green 42/42）；修复后真实数据 smoke 全链由 Serper 链头直击命中、无降级。Tavily 沿既有证据（#265 命中 / #287 smoke）可用；Jina 复测亦可用（pool CLI HTTP 200 + 9 条，5.7s 偏慢）——首轮"未配置"为探针 grep 前缀笔误（`JINA_API_KEY` 实际一直在 `.env.local`），勘误见 #281 勘误评论。Session-Id `20260914-pool-engine-281-a3f7c2`。
> - **#287 代码与测试已交付**（Wave 2A 🎯 Dominant，Tier 1）：统一入口 env 加载 `scripts/short-video/lib/load-env.mjs`（Node ≥20.12 内置 `process.loadEnvFile()`，无 dotenv 依赖；ENOENT 静默 fail-open、其他加载错误告警一次后继续启动、真实环境变量优先——后两者经子进程测试与运行时探针实证）。三个入口接线：`main.mjs` 顶层、`search-sources.mjs` 与 search-pool CLI 的 `isMainModule` 守卫内；弃用的 `search-pool-server.mjs` 一并换 helper（其 `loadEnv()` 在 `main()` 内，import 无副作用，边界测试裁决其入口身份）。**库内 `loadDotEnv()` 导出删除，#275 缺陷根除**。改动前实测基线：库 import `search-pool.mjs` 时 4 个 pool key 全 MISSING（`.env.local` 有 key，env -u 净化子进程复现）；修复后真实数据 smoke：pool CLI 入口对 Serper 完成认证成功调用（attempts=`0 results` 而非 `missing SERPER_API_KEY`）。库边界不变量测试覆盖两个 lib 模块（7/7 绿）；全量 3853 用例中 62 个失败经主 checkout 同清单对照 + `test-env-baseline.md` 定责为环境性（无一涉及改动模块）。Review 双轴（Standards/Spec）无硬违规；遗留 nit：两个 `isMainModule` 守卫 matcher 写法不一致（`=== fileURLToPath` vs `.endsWith`，先于本票存在）。Session-Id `20260914-env-load-entry-287-4d21a3`，commits `9090484` + `0d534c2` + `aa82b75` 已 push 到 `main`；**#287 与 #275 均已闭票**（交付记录 issuecomment-5666133649 / 5666137926）。
> - **#304 开票登记**（同日）：T2I 生成工具横评（M2 Pro 32GB 适配与 mflux 协议适配度）——用户裁决开票排期 W2A 之后；范围 = 本地 MLX/MPS 为主 + Kaggle T4 免费云参照，纯调研不改管线代码。triage 落位 **Phase 3 · W3A / Tier 3 / `ready-for-agent`**（与 #298 T2V 横评同模式）。
> - **#274 交付闭票**（W1B，Tier 3）：filipstrand 4bit 量化版的 `tongyi-qianwen-license` 标注为**误标**——上游 `Tongyi-MAI/Z-Image-Turbo` 为 Apache-2.0（HF tag + README frontmatter + GitHub LICENSE 三源一致），且 tongyi-qianwen-license §1(e) 定义只覆盖 Qwen 大语言模型系列，Z-Image 不在其内；量化衍生作品不得对基础权重施加更严条款（Apache-2.0 §4），最坏情况解读下当前本地推理商用也远低于 1 亿 MAU 门槛。**裁定维持现状**（`DEFAULT_IMAGE_MODEL` 不变）；`andrevp/Z-Image-Turbo-MLX-4bit`（标注干净但 mflux 兼容未验证）与官方权重自行量化（mflux 原生 `quantize=4`）记录为备选。结论回写 `docs/research/model-sources-reference.md`，Session-Id `20260914-zimage-license-2a71a5`。
> - **#270 代码与测试已交付**（Wave 1B 🎯 Dominant，Tier 2）：instruct 单一来源 `scripts/short-video/lib/tts/instruct.mjs`（`INSTRUCT_STANDARD` + `buildInstruct` + `createInstructResolver` + `validateInstructSignature`），四个 CosyVoice3 adapter 删除各自的 `INSTRUCT_MAP` 并按引擎族绑定格式（PyTorch/CUDA/NPU 带后缀、MLX 不带）；三层门控 = manifest 构建时抛错（不耗 GPU）→ pre-render gate `checkInstructCoverage`（吸收 #273 P1.3）→ Quality Gate 复验告警。**改动前实测基线：9/9 visualType 的 instruct 跨引擎发散，5/9 有引擎完全无 instruct**。产线 Kaggle-CUDA manifest 与改动前逐字节一致（真实内容 `deepseek-v41-flash`），改的只是文案出处，不是已认可音色。Session-Id `20260914-tts-instruct-single-source-83a324`，6 commits 已 push 到 `main`。
> - **#270 一条验收标准由用户裁决豁免**：AC3「#257 重生成的情绪参考使用该单一来源产出，听感无印度口音（人工验收）」——#257 的 Spark-TTS 实验脚本与 `refs-manifest.json` 已不在仓库（磁盘无、git 历史无）且 #257 已闭票，路径不可复现；**用户确认 Spark 在此前验证时已排除**，该项豁免，无需另立票。单一来源对任何新实验路径可用（`createInstructResolver` 即实验脚本的合法入口）。
> - **#271 交付闭票**（Wave 1A 🎯 Dominant，Tier 1）：Quality Gate 失败按 `failureClass` 语义分流——**pacing 类**（音素正确、仅实测 WPM 偏低）进 #252 补差环，补差仍不合格 → `TTS_PACING_FLOOR_BLOCK`；**acoustic 类**（截断/漏词/相似度低/无音频）禁入补差环、重抽 ≤2 次后 → `TTS_ACOUSTIC_HARD_BLOCK`；两类在 strict/non-strict 下均阻断。**硬阻断 ≠ 锁死语速**：成品语速杠杆见 `docs/content-pipeline.md` → Gate 失败语义分流（`scene.ttsSpeed` / `TTS_SPEED` / `TTS_ATEMPO`）。
> - **#272 交付闭票**（Wave 1A 剩余卫星票，Tier 1）：新增 `lib/avatar-guard.mjs` 作为 avatar 契约的单一实现——片段时长必须 ≥ 该 scene **当前** TTS 音频时长；`main.mjs` Step 2.5（TTS 后）与渲染 staging 双门控，错误给出可自愈的 `--force` 重生成路径。实证：`content/dh-pilot-qwen4` scene-10 的 5.00s 片段 vs 7.24s 旁白。
> - **#273 交付闭票**（Wave 1B，Tier 2）：**P0.2 CDP proxy 并发守卫**——新增 `skills/web-access/scripts/cdp-concurrency.mjs`（限制在飞浏览器操作数 + 排队 + 超时 503 + 同 target busy lock，纯逻辑 11 用例直测），`cdp-proxy.mjs` 在 connect 后取 slot、响应关闭时释放，`/health` 带 `scheduler` 统计；`cdp-client.cdpNewTab` 把 `CDP_PROXY_QUEUE_FULL/TIMEOUT` 映射为 `RateLimitedSkipError`（临时耗尽走 fallback 链，不当成源永久失效）。**P2 并行操作规范**写入 `docs/video-production-runbook.md`（先串行建缓存再并行 + 分阶段并行安全表）。commits `8e8dd90` + `c6e7701` 已随 `335718d` 推送到 main。CI 口径全量 179 文件 / 3525 用例绿。
> - **W1B 剩余**：#273 闭票，W1B 收口；**#279**（语速整体上探）与 **#278**（Hook 文案句式规范）均为 `ready-for-human`，待用户；**#274 已交付闭票（同日，裁定误标、维持现状）**——W1B 无剩余 agent 可做项，下一 frontier 为 W2A。
> - **上一轮（同日下午）**：Wave 1A 收口（#271 + #272 双门控交付）+ Wave-Tier 双维执行体系落地。
> - 本轮未新增 issue，无新增重复项。

---

## Dominant & Satellite Issue Hierarchy（主导与卫星 Issue 层级）

在 Phase / Wave → Task → Issue 三层架构中，**Dominant Issue（主导 Issue / 锚点 Issue，标有 🎯）** 负责**定标准、定架构、立契约、设 Gate 或承接 Wayfinder Map**；**Satellite Issues（卫星 Issue / 子任务）** 围绕它展开并向其交付。

| Phase                                                | Dominant Issue (🎯 主导票)                                                                                                                                                  | Satellite Issues (挂靠卫星票)                                                                                                                                                                                                                                                                                                                                                                                                                                   | 架构定位与统领关系                                                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1: 管线可靠性与安全闭环**                    | ✅ **#271** TTS Quality Gate 语义分流与出片阻断 (P1, 已闭票)<br>✅ **#272** Avatar 唇同步时长一致性 Gate (P1, 已闭票)<br>✅ **#270** TTS instruct 标准机制级化 (P2, 已闭票) | → **#279** (语速整体上探与耦合, P2)<br>→ **#278** (Hook 文案句式规范, P2)<br>→ **#273** (并行经验与 CDP 并发锁, P2)<br>→ **#274** (Z-Image-Turbo 许可排查, P3)                                                                                                                                                                                                                                                                                                  | #271 + #272 + #270 均已交付（Fail-closed 语义分流 + avatar 片段时长一致性 + instruct 单一来源三层门控）；#270 改动前实测 9/9 visualType instruct 跨引擎发散、5/9 无 instruct，现由 `lib/tts/instruct.mjs` 单一来源收口。 |
| **Phase 2: 检索体系与运行环境固化**                  | ✅ **#292** search-sources 体系性重审与通用/专用分流 (P1, 已闭票——grilling 裁决收口)<br>✅ **#287** 管线入口统一加载 .env.local (P1, 已闭票)<br>✅ **#309** 62 源用途定链审计 (P1, 已闭票——两条契约定链执行全部交付 `bc34f67`+`d0f2ea0`)                                                    | ✅ **#307** (Bigsong 直连 + Grok promptTemplate, P2, 已闭票)<br>✅ **#306** (brief-builder 测试日期衰减, P2 bug, 已闭票)<br>✅ **#311** (claim 脚本 @me assign 静默失败, P2 bug, 已闭票)<br>→ **#312** (coverr 下载链失效, P2 bug)<br>→ **#313** (youtube bot-check 验证 Chrome cookie, P2 bug)<br>→ **#315** (交付记录门禁软提醒闭环与复检机制, P2)<br>→ **#305** (pool 静默零结果 A/B, P2——并入统一 source-health)<br>→ **#275** (全链路不自载缺陷, 由 #287 闭环)<br>→ **#285** (needsAuth 403 探针放宽, P2)<br>→ **#284** (Route C 循环引用消除, P2)<br>→ **#276** (web-deep-research 路由接入, P2)<br>→ **#286** (trend 模式相关性护栏, P2——裁决并入 #309 新闻参数)<br>→ **#281** (Search Pool 引擎可用性复测, P2)<br>→ **#269** (死源自动修复 Phase 2, P2——统一 source-health)<br>→ **#231** (环境固化真机验收, P3)                                                                                                            | #292 主导搜索链路宏观分流架构（已闭票，grilling 七项裁决落 #309/#307/#269/#310）；#287 主导环境变量单一入口加载契约，闭环 #275。                                                                       |
| **Phase 3: 视觉设计系统与媒体素材重构**              | 🎯 **#291** 短视频模板视觉设计体系重做 (P1, `wayfinder:map`)<br>🎯 **#310** 素材库体系——统一素材库 + 文字描述索引 + 收获率 log (P2, 吸收 **#288**/**#301**)<br>🎯 **#298** B-roll T2V 模型画质评测升级 (P1)            | → **#300** (外部赛道爆款解构基准, P2)<br>→ **#302** (外部开源 Repo 逐个深度追踪, P2)<br>→ **#301** (实拍库存视频优先策略改造, P2——并入 **#310**)<br>→ **#314** (douyin/xhs 视频素材源 + CDP 新闻源视频能力重构, P2)<br>→ **#299** (Hook 前 3 秒专属视觉策略, P2)<br>→ **#289** (Scene->Prompt->Video 适配层, P2)<br>→ **#293** (Stage 0 素材预获取与缺口回流, P2)<br>→ **#297** (素材匹配 Fail-closed 留空, P1)<br>→ **#294** (VLM borderline 二度校验, P2)<br>→ **#295** (写稿 scene-data 概念泛化, P2)<br>→ **#253** (行业坐标系+hook 版式, P2)<br>→ **#304** (T2I 工具横评, P3) | #291 为视觉重做总指挥与 S3 Map，以 #300 竞品解构与 #302 开源调研为输入；#288 主导官方素材库结构；#298 主导生成画质横评与跃迁（吸收关闭 #290）；#297 守住不塞无关图底线。                                                 |
| **Phase 4: 多平台发布通道与中文内容生态 (最终阶段)** | 🎯 **#296** 中文多平台发布架构 (P2, `wayfinder:map`)<br>🎯 **#268** 中文内容轨首包产出 (P2)                                                                                 | → **#216** (视频号人工扫码 5 项实测, P2)<br>→ **#217** (管线适配视频号发布包, P2)<br>→ **#218** (视频号 CDP 自动化发布, P2)<br>→ **#220** (抖音发布通道落地, P2)<br>→ **#223** (小红书图文频道立项, P2)<br>→ **#206** (Auto-Redbook 试点, P3)<br>→ **#208** (降级图文帖路径, P3)<br>→ **#210** (TikTok 官方 API 发布, P3)                                                                                                                                       | #296 为全渠道发布总图与 S3 Map，主导自研 vs Relay 架构决策；#268 产出合规中文样片物料，作为 #216 扫码实测的必要物料。                                                                                                    |

---

## Duplicate & Absorption Notes

| Issue                                       | Absorbed by                                  | Status & Action                                                         |
| ------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| **#283** (fallback 链语义重审)              | **#292** (search-sources 体系性重审)         | ✅ **CLOSED (Duplicate)**：全部议题由上游大盘票 #292 完整覆盖吸收。     |
| **#290** (Wan1.3B 文字数字视频效果差)       | **#298** (B-roll T2V 模型画质评测升级)       | ✅ **CLOSED (Duplicate)**：文字与数字测试集并入 #298 评测矩阵统一推进。 |
| **#275** (search-sources 不自载 .env.local) | **#287** (入口统一加载 .env.local)           | ✅ **CLOSED (Delivered)**：#287 落地（`lib/load-env.mjs` + 三入口），联动闭票。 |
| **#247** (Hook bigNumber 缺乏上下文)        | **#253** (行业知识层 Ontology + hook 版式库) | ⏩ **Dormant**：待 #253 交付后覆盖关闭。                                |
| **#288** (媒体素材补全与 RAG 兜底 Catalog) | **#310** (素材库体系)                       | ⏩ **并入**：2026-09-15 grilling 裁决——实体图库与官方肖像由 #310「统一素材库 + 文字描述索引」承接。待 #310 交付后覆盖关闭。 |
| **#301** (实拍库存视频优先策略改造)        | **#310** (素材库体系)                       | ⏩ **并入**：2026-09-15 grilling 裁决——stock-video-first 属素材获取策略，与 #288 同为 #310 的切片。待 #310 交付后覆盖关闭。 |
| **#286** (trend 模式相关性护栏盲区)        | **#309** (62 源用途定链审计)                | ⏩ **并入**：2026-09-15 grilling 裁决——相关性护栏并入 #309 新闻参数（publishedAt 两档 + 7 天窗）一并落地。待 #309 交付后覆盖关闭。 |
| **#280** (search-sources 不自载 .env.local) | **#275**                                     | ✅ **CLOSED (Duplicate)**                                               |
| **#282** (search-pool skill 跨 repo 同步)   | —                                            | ✅ **CLOSED (Superseded)**：已由前序 commit 同步闭环。                  |

---

## Execution Waves（执行波次总表 — 含调研先行架构）

**工作模式与选票规则**：

- **每个 session 集中攻坚一个 issue**。
- **波次序次（Wave Sequence）**：严格按照 **Wave 1A → 1B → 2A → 2B → 3A → 3B → 3C → 4A → 4B** 推进。
- **调研先行（Research-First）**：每阶段的 **A 波次（Wave 2A / 3A / 4A）为深度调研、基准测试与真机摸底**，未产生明确输入与标准前，严禁盲目开工下游 B/C 波次的代码重构。
- **选票规则**：从最早未完成的 Wave 中，选取无 hard blocker 且 Tier 最高的候选 issue（同 Wave 内 Tier 1 优先于 Tier 2）。
- **并发仲裁**：跨 issue 或跨 session 并行前，**必须以文末 Conflict Risk Matrix 为准**。

| Wave        | 阶段与主题                                                          | Shared Context                                                                                           | Session Candidates (含 Tier)                                                                                                                                                                                                                                                                                                                                    | Dependencies & 前置调研要求                                                                                                                                                                                                                                                        | 并行与冲突规则                                                                                                          |
| ----------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **W1A**     | **Phase 1: 管线可靠性即时门控**                                     | `scripts/short-video/lib/tts/quality-gate.mjs`<br>`scripts/short-video/main.mjs`                         | ✅ **#271** (TTS Quality Gate 语义分流与出片阻断, **T1**, 已闭票)<br>✅ **#272** (Avatar 唇同步时长一致性 Gate, **T1**, 已闭票)                                                                                                                                                                                                                                 | **Wave 1A 已完成（#271 + #272 双双闭票）**：两票均为阻断脏出片与唇同步 stale 的紧急安全门控，出片双重保险到位。                                                                                                                                                                    | 已全部落地：#271 动 quality-gate.mjs / pacing.mjs；#272 新增 lib/avatar-guard.mjs 并动 main.mjs + render-remotion.mjs。 |
| **W1B**     | **Phase 1: 参数标准化与语速规范**                                   | `lib/tts/`<br>`docs/content-pipeline.md`<br>`skills/web-access/scripts/cdp-proxy.mjs`                    | ✅ **#270** (TTS instruct 标准机制级化, **T2**, 已闭票)<br>**#279** (语速整体上探与 narrative 耦合, **T2**)<br>**#278** (Hook 文案句式规范, **T2**)<br>**#273** (管线并行经验总结与 CDP 并发锁, **T2**)<br>✅ **#274** (Z-Image-Turbo 许可与量化调研, **T3**, 已闭票)                                                                                                      | ✅ **#270 已交付**：单一来源 `lib/tts/instruct.mjs` + 三层门控（manifest 抛错 → preflight FAIL → gate 告警），实测基线 9/9 发散、5/9 无 instruct 已收口；AC3（#257 情绪参考听感验收）由用户裁决豁免——Spark 此前验证时已排除。**#273 与 #274 均已闭票，W1B 全部收口**。 | #279 与 #278 为文案与语速协同（均 `ready-for-human`）；#273 与 #274 可由 agent 并行推进。                               |
| **W2A**     | **Phase 2: 搜源可用性摸底与环境入口**<br>_(【调研先行】探针与底座)_ | `skills/search-pool/`<br>`scripts/short-video/main.mjs`<br>`lib/load-env.mjs`                            | ✅ **#281** (Search Pool 引擎可用性复测调研, **T3**, 已闭票)<br>✅ **#287** (管线入口统一加载 .env.local, **T1** — 覆盖 **#275**, 已闭票)                                                                                                                                                                                                                        | ✅ **W2A 已完成（#287 + #281 均闭票）**：env 单一入口底座 + 双引擎定性（Serper 可用并修复映射 bug、Brave TUN 故障未复现），W2B 解锁。                                                                                  | 零代码冲突：#281 仅为调研脚本测试，与 #287 环境变量改造完全解耦，可并行。#287 闭票后 W2A 剩 #281。                        |
| **W2B**     | **Phase 2: 搜源架构重审与分流落地**                                 | `scripts/short-video/lib/search-sources.mjs`<br>`skills/search-pool/SKILL.md`<br>`skills/web-access/`<br>`.github/workflows/`    | ✅ **#292** (search-sources 体系性重审与通用/专用分流, **T1**, 已闭票——grilling 七项裁决收口，执行移交 #309/#307)<br>✅ **#309** (62 源用途定链审计, **T1**, 已闭票——静态审计 + live 探针 + 新闻契约最短路径 + site: 推广（pool 6→2）/threads 判决/CDP-DOM 日期两档制交付 `bc34f67`；research environmentalSignals 3 源真实抓取收尾交付 `d0f2ea0`)<br>✅ **#307** (Bigsong 直连 + Grok promptTemplate, **T2**, 已闭票——mcp_grok_search 直连独立源（promptTemplate 四要素）+ google_search Grok 退役链止 pool；pool 资格显式化与 mcpFallback 解耦；mcp_grok_search 不进 pool 经用户签字；commit `2f97be9`，已 push)<br>✅ **#316** (专属 MCP 全量退役, **T2**, 已闭票——实测三 fallback 全死（两模块未装/sogou init 超时暖复现），registry 零 mcpFallback 总锁；mcp-client.mjs 机器保留；commit `e982c94`)<br>✅ **#306** (brief-builder 测试日期衰减, **T2** bug, 已闭票)<br>✅ **#311** (claim 脚本 @me assign 静默失败, **T2** bug, 已闭票)<br>**#312** (coverr 下载链失效, **T2** bug)<br>**#313** (youtube_search bot-check 验证 Chrome cookie, **T2** bug)<br>**#315** (交付记录门禁软提醒闭环与复检机制, **T2**)<br>**#305** (pool 静默零结果 A/B, **T2**——并入统一 source-health；C 项待授权)<br>**#285** (login-gated 站点 403 探针放宽, **T2**)<br>**#284** (Route C 循环引用消除, **T2**)<br>**#276** (web-deep-research 接入 Search Pool CLI, **T2**)<br>**#286** (trend 模式相关性护栏, **T2**)<br>**#269** (死源自动修复 Phase 2, **T2**)<br>**#231** (TTS/渲染环境固化真机验收, **T3**) | 依赖 W2A 的 #287 确保环境变量正常；#292 大盘票已闭（平台保真链 + pool 六源资格 + 两条契约为终版裁决）；#309 审计为下一执行入口，URL 层实施后置；#311 为脚本工具修复已闭票；#312 (coverr) 与 #313 (youtube) 为下载层修复，与 #309 live 探针结论呼应；#315 修复 CI 交付记录门禁与复检机制。                                                                                                                                                                                       | ⚠️ `source-registry.mjs` + `search-sources.mjs`（**#309 → #307 → #285**）**严格串行**：先按用途定链、再改调用形态；`video-downloaders.mjs` 下载层（#312, #313）共用模块须串行；`scripts/claim-issue.sh`（#311）工具脚本独立；`.github/workflows/`（#315）CI 自动化独立；技能文档（#284, #276）可独立并行。                              |
| **W3A**     | **Phase 3: 视觉与竞品深度调研**<br>_(【深度调研先行，基准确立】)_   | `docs/research/`<br>`skills/web-access/`<br>`scripts/short-video/lib/b-roll/`                            | **#300** (头部竞品短视频分镜解构基准, **T2**)<br>**#302** (外部开源 Repo 逐个深度学习吸收追踪, **T2**)<br>🎯 **#298** (B-roll T2V 模型画质评测升级, **T1** — 吸收 **#290**)<br>🎯 **#291** (短视频视觉体系重做 S3 Wayfinder Map, **T1**)<br>**#304** (T2I 生成工具横评, **T3**)                                                                                                                        | **【深度调研先行】**在改动任何视觉代码前：<br>1. **#300** 抓取头部竞品解构音视频分镜与节奏基准；<br>2. **#302** 深度拆解外部开源项目的模板设计与图层调度；<br>3. **#298** 完成本地/免费云/付费云 T2V 模型横评；<br>4. **#291** 汇总上述三项调研产出，形成新视觉规范总图。          | 🟢 **全部支持并行**：#300, #302, #298 均为只读调研与实验评估，相互无文件冲突，可多 session 并发推进。                   |
| **W3B**     | **Phase 3: 媒体底座与素材兜底**                                     | `scripts/short-video/asset-sourcer.mjs`<br>`knowledge/media-catalog.json`<br>`knowledge/asset-gaps.json` | **#297** (素材匹配 Fail-closed 留空, **T1**)<br>🎯 **#310** (素材库体系, **T2**——吸收 **#288**/**#301**；收获率 log 先行)<br>**#314** (douyin/xhs 视频素材源 + 9 CDP 新闻源 videos 摘除与 iframe 双检, **T2**)<br>**#293** (Stage 0 素材预获取与缺口回流, **T2**)<br>~~#301~~ (已并入 **#310**)                                                                                                                                                         | #310 的素材源清单依赖 **#309 审计**（用途定链）结论，但收获率 log 不依赖、可先行；#314 吸收 2026-09-19 用户裁决，9 个 CDP 新闻源摘除视频声明（registry 仅声明已验能力），文章页双检 `<video>` + `<iframe>`；#310 建立统一素材库，由 #293 接入 Stage 0；#297 重构素材匹配流水线（与 #310 串行）。                                                                                                                                                                                  | 数据文件（#288, #293）与代码逻辑解耦；`asset-sourcer.mjs`（#297, #301）必须串行改动。                                   |
| **W3C**     | **Phase 3: 画面适配与智能生成**                                     | `scripts/short-video/scene-data.mjs`<br>`lib/visual-analyzer.mjs`<br>`lib/data/industry-knowledge.json`  | **#289** (Scene->Prompt->Video 适配层, **T2**)<br>**#299** (Hook 场景前 3 秒专属视觉策略, **T2**)<br>**#294** (VLM borderline 二度校验, **T2**)<br>**#295** (写稿 scene-data 概念泛化, **T2**)<br>**#253** (行业知识层 Ontology + hook 版式, **T2**)<br>**#244** / **#256** / **#263** (策略与创意 HITL, **T2**)                                                | 依赖 W3A 模型选型（#298）与 W3B 素材流；#289 针对胜出 T2V 定制 prompt 模板；#299 承接 #300 留存结论。                                                                                                                                                                              | Prompt 模板与知识层（#289, #253）可并行；渲染与写稿联动改动需核对 Scene Data 契约。                                     |
| **W4A**     | **Phase 4: 平台架构调研与真机实测**<br>_(【架构与真机摸底先行】)_   | 微信视频号后台<br>`docs/research/`<br>`content/` 首包目录                                                | 🎯 **#296** (中文多平台发布架构 S3 Wayfinder Map, **T2**)<br>🎯 **#268** (中文内容轨首包样片物料产出, **T2**)<br>**#216** (微信视频号 5 项规格人工扫码实测, **T1/T2**)                                                                                                                                                                                          | **【真机实测先行】**：<br>1. **#296** 深度调研 AiToEarn Relay 与自研 CDP 混合架构；<br>2. **#268** 跑通管线产出合规 zh-CN 样片；<br>3. **#216** 用户扫码实测 200MB 限制、封面裁切、AI 声明 5 项真实参数。                                                                          | #296 架构研究与 #268 内容制作互不干扰，可并行推进。                                                                     |
| **W4B**     | **Phase 4: 发布包适配与渠道接入**                                   | `scripts/short-video/lib/platforms/`<br>`publish-wechat-channels.mjs`                                    | **#217** (管线适配视频号发布包, **T2**)<br>**#218** (视频号 CDP 自动化发布沙盒, **T2**)<br>**#220** (抖音发布通道落地, **T2**)<br>**#223** (小红书图文频道立项, **T2**)<br>**#206** / **#208** / **#210** (图文与官方 API 扩展, **T3**)                                                                                                                         | **严格硬前置**：必须等待 W4A 的 #216 扫码实测数据完整出炉，且获得用户明确立项授权后方可解锁。                                                                                                                                                                                      | 各平台独立适配器（#217, #220, #223）可并行开发，实测发布必须单会话串行。                                                |
| **Dormant** | **未达触发条件 / 等待外部输入**                                     | 跨模块                                                                                                   | #21/#157/#158（素材规模/高质量需求）· #224（等用户半身照）· #230（等渲染停手）· #228（等冷跑瓶颈）· #222（等独立 repo 阶段）                                                                                                                                                                                                                                    | 见各 Issue 触发条件，未满足前绝不进入执行 Wave。                                                                                                                                                                                                                                   | 不占用实现排期。                                                                                                        |

---

### Execution Semantics（三层执行语义规范）

三层结构各司其职，紧密联动：

1. **Wave（波次）**：**执行摘要与全局推进顺序**。基于技术依赖、业务里程碑与「调研先行」原则合成。新 session 启动时，**首先查看当前最早未完成的 Wave**。
2. **Tier（分级）**：**完整 Issue 资产库的权威价值位置**。按对生产力与内容质量的实质推动力划分（Tier 1 核心底线 > Tier 2 能力增强 > Tier 3 工具合规 > Dormant 冻结）。同一 Wave 内选票时，**Tier 1 绝对优先于 Tier 2/3**。
3. **Conflict Risk Matrix（并发风险矩阵）**：**多 session 或跨 issue 并行的唯一终审裁决来源**。Wave 表中的并行说明仅为业务初筛；任何具体代码编写前，**必须核对文件级冲突矩阵**。

---

## Detailed Phase Roadmaps（阶段执行分解）

### Phase 1: 管线可靠性与核心安全门控 (Pipeline Stability & Core Guardrails)

- **阶段目标**：杜绝坏 take 静默出片，解决 TTS 与 Avatar 唇同步时长一致性，消除参数隐患，建立坚不可摧的生产安全底线。
- **划分波次**：
  - **Wave 1A（即时门控，✅ 本波次完成）**：✅ **#271**（TTS Quality Gate 语义分流与 fail-closed 阻断）+ ✅ **#272**（Avatar 视频有效时长 ≥ TTS 时长强校验 Gate）——出片双重保险到位，下一波次为 Wave 1B。
  - **Wave 1B（标准化与语速规范，✅ Dominant 已交付）**：✅ **#270**（TTS instruct 单一来源 `lib/tts/instruct.mjs` + manifest 抛错 / preflight 覆盖检查 / gate 签名告警三层门控，实测基线 9/9 发散已收口）+ **#279**（语速整体微调 + narrative 耦合，下一 frontier，`ready-for-human`）+ **#278**（Hook 文案具象化对比规范，`ready-for-human`）+ **#273**（CDP 并发锁与经验沉淀）+ ✅ **#274**（Z-Image-Turbo 许可核查，已交付：裁定误标、维持现状）。

---

### Phase 2: 检索体系与运行环境固化 (Search & Retrieval Architecture)

- **阶段目标**：理顺检索降级链，消除环境变量自载缺陷与 Agent 路由循环引用，固化跨平台运行环境。
- **划分波次**：
  - **Wave 2A（【调研先行】探针摸底与环境底座，✅ 本波次完成）**：✅ **#281**（Search Pool 引擎可用性复测：Serper 可用并修复 `parseArticles` 映射 bug、Brave TUN 故障未复现，绕行方法留档）+ ✅ **#287**（管线入口顶层统一加载 `.env.local`，彻底闭环 **#275**，已闭票）。
  - **Wave 2B（搜源分流架构与去环落地）**：✅ **#292**（专用源直连平台 MCP vs 通用源 L3 Pool 分流总图，吸收 **#283**，已闭票——grilling 七项裁决收口，执行移交 #309/#307/#269/#310）+ **#309**（62 源用途定链审计，✅ `bc34f67` + `d0f2ea0` 交付，已闭票）+ **#307**（Bigsong 直连 + Grok promptTemplate，✅ commit `2f97be9` 交付，已闭票）+ **#306**（brief-builder 测试日期衰减基线修复，✅ commit `f7e2731` 交付）+ **#305**（pool 静默零结果 A/B 告警与 streak，C 项 CI 自动开票待授权）+ **#285**（needsAuth 403 探针放宽）+ **#284**（Route C 循环引用消除）+ **#276**（web-deep-research 接入 Search Pool）+ **#286**（trend 模式相关性护栏）+ **#269**（死源自动修复 Phase 2）+ **#231**（Kaggle wheels 挂载真机终验）。

---

### Phase 3: 视觉设计系统与媒体素材重构 (Visual Redesign & Media Pipeline)

- **阶段目标**：重构短视频视觉体系达到顶尖商业新闻质感，引入实拍库存优先与实体 Catalog，升级 B-roll 生成模型画质。
- **划分波次**：
  - **Wave 3A（【深度调研先行，基准确立】）**：
    - **#300**：CDP 抓取头部竞品解构音视频分镜与节奏基准，产出分析报告；
    - **#302**：深度学习吸收外部开源项目（MoneyPrinterTurbo 等）在分镜和调度上的成熟经验；
    - 🎯 **#298**：本地 MLX → 免费云端（AtomGit/Kaggle）→ 付费云端（Modal L4）模型画质横评（吸收 **#290** 文字测试集）；
    - 🎯 **#291**：汇总调研成果，确立 S3 视觉重做 Wayfinder Map。
  - **Wave 3B（媒体底座与素材兜底）**：🎯 **#310**（素材库体系统一——统一素材库 + 文字描述索引 + **收获率搜索 log（第一交付物，可先行）** + 素材关键词体系；**吸收 #288 + #301**）+ **#297**（素材匹配 Fail-closed 留空绝不硬塞无关图）+ **#293**（Stage 0 素材预获取与缺口回流）。
  - **Wave 3C（画面适配与智能生成）**：**#289**（专属 aiVideo.prompt 适配层）+ **#299**（Hook 前 3 秒专属视觉）+ **#294**（VLM borderline 二度校验）+ **#295**（写稿 scene-data 概念泛化）+ **#253**（行业坐标系与版式库）+ **#244**/**#256**/**#263**（策略与创意 HITL）。

---

### Phase 4: 多平台发布通道与中文内容生态 (Multi-Platform Publishing - 最终阶段)

- **阶段目标**：在内核稳定与画质达标后，打通国内主流短视频发布渠道（视频号、抖音、小红书），完成首发中文包与实测闭环。
- **划分波次**：
  - **Wave 4A（【平台架构调研与真机实测先行】）**：
    - 🎯 **#296**：调研自研 CDP 与 AiToEarn Relay 混合调度架构（S3 Wayfinder Map）；
    - 🎯 **#268**：产出首个 zh-CN 旁白中文短视频样片物料；
    - **#216**：用户用样片在微信视频号人工扫码实测 5 项关键技术参数（200MB、封面、AI 声明等）。
  - **Wave 4B（发布包适配与渠道接入）**：依据 #216 实测结论解锁 **#217**（视频号发布包适配）→ **#218**（CDP 自动化发布沙盒）→ **#220**（抖音发布通道）→ **#223**（小红书图文频道）→ **#206**/**#208**/**#210**（扩展通道）。

---

## Execution Tiers（权威资产分类清单）

按对生产管线的实质推动力分层。**新增、关闭或调整 Issue 时首先在此更新**。

### Tier 1 — 核心阻断与出片质量基线（优先攻坚）

| #        | Issue                                       | Phase & Wave      | Role        | Status            | Notes                                                           |
| -------- | ------------------------------------------- | ----------------- | ----------- | ----------------- | --------------------------------------------------------------- |
| **#287** | 入口统一加载 .env.local（彻底解决 #275）    | Phase 2 · **W2A** | 🎯 Dominant | **已闭票**        | P1 bug：`lib/load-env.mjs`（`process.loadEnvFile`，fail-open）+ 三入口接线，`loadDotEnv` 导出已删。 |
| **#275** | search-sources 全链路不自载 .env.local      | Phase 2 · **W2A** | Satellite   | **已闭票**        | P1 bug：#287 落地后联动关闭（边界不变量测试固化契约）。         |
| **#292** | search-sources 体系性重审与通用/专用分流    | Phase 2 · **W2B** | 🎯 Dominant | ✅ 已闭票 (2026-09-15) | P1 enhancement：专用源平台 MCP vs 通用源 L3 Pool，已吸收 #283；审计 + 同日 challenge 终版裁决——x_search 平台保真链不进 pool，pool-eligible = 6 通用源；**grilling 七项裁决收口**（两条契约、Grok 定位、统一 source-health、素材库新票 #310、双轨成文），执行移交 #309/#307/#269/#310（裁决评论 issuecomment-5681437817）。 |
| **#309** | 62 源 fallback 逐源重捋（两条契约下按用途定链） | Phase 2 · **W2B** | 🎯 Dominant | ✅ 已闭票 (2026-09-19) | P1 audit：新闻契约/素材契约分类定链。**全部交付**（62/62 源分类 + CSE 删除 `4313e29`；探针与最短路径 `0f27a56`/`012057f`/`06bcdbf`；site: 推广 + threads 判决 + CDP-DOM 日期两档制 `bc34f67`——pool-eligible 6→2，Grok web_search fallback 退役四源，threads 链止于 CDP；research 模式 3 个 environmentalSignals 真实抓取收尾 `d0f2ea0`——`selectSourcesForRun` 抽出测试锁定，smoke weibo_hot 50/datacube_ai 50 条；报告 §A/§C/§F 同步）。 |
| **#316** | 三个专属 MCP fallback 退役 | Phase 2 · **W2B** | Satellite   | ✅ 已闭票 (2026-09-19) | P2 refactor：实测三 mcpFallback 全死（bilibili/weibo_hot python 模块未装即死、sogou uvx init 超时暖复现）——静默 0 条类（#305 活例），主层（CDP/site:/API）全验证可用；用户裁决全部退役。**registry 零 mcpFallback 总锁**；parseGrokListResult 孤儿删除；mcp-client.mjs 机器保留（未来 toolcall 条款）。commit `e982c94`（已 push）。 |
| **#317** | 新增 weibo_search 关键词搜索源 | Phase 2 · **W2B** | Satellite   | ✅ 已闭票 (2026-09-19) | P2 enhancement：CDP 主层（s.weibo.com/weibo?q=，Chrome cookie 通道）+ 登录墙 fail-fast 双识别 + site:weibo.com 中层；相对时间 fetch-time 转 publishedAt（#309 两档制 CDP 主层首例满配）。**真实 smoke 19/19 带 publishedAt、0 degraded**。**附带修复 #269 预检误杀**：needsAuth 源跳过预检（裸探针 404 误判）。commits `32d173e` + `f7e18df`（已 push）。 |
| **#291** | 短视频模板视觉设计体系重做                  | Phase 3 · **W3A** | 🎯 Dominant | `wayfinder:map`   | P1 enhancement：S3 视觉重做总指挥 Map，统领全套视觉升级。       |
| **#298** | B-roll T2V 模型画质评测升级（替代 Wan1.3B） | Phase 3 · **W3A** | 🎯 Dominant | `ready-for-agent` | P1 enhancement：梯队横评，吸收 #290 文字与数字测试集。          |
| **#297** | 素材匹配 Fail-closed 留空（杜绝无关图片）   | Phase 3 · **W3B** | Satellite   | `ready-for-agent` | P1 bug：无高置信度结果禁止字符匹配强塞，留空触发 B-roll。       |
| **#216** | 视频号人工发布试点（实测 5 项规格）         | Phase 4 · **W4A** | Satellite   | `ready-for-human` | P2 enhancement：等开通与 #268 中文首包后用户扫码实测。          |

---

### Tier 2 — 架构深化与能力增强（稳步推进）

| #        | Issue                                      | Phase & Wave      | Role        | Status            | Notes                                                                                                                                                              |
| -------- | ------------------------------------------ | ----------------- | ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **#270** | TTS instruct 标准机制级化（单一来源+校验） | Phase 1 · **W1B** | 🎯 Dominant | **已闭票**        | P2 enhancement：单一来源 `lib/tts/instruct.mjs` + manifest 抛错 / preflight 覆盖检查 / gate 签名告警。AC3（#257 情绪参考听感）由用户豁免——Spark 此前验证时已排除。 |
| **#279** | 语速整体上探与 narrative 速度耦合          | Phase 1 · **W1B** | Satellite   | `ready-for-human` | P2 enhancement：写稿控词 + 1.05~1.1x 微调 + 85% 速度门。                                                                                                           |
| **#278** | Hook 文案句式规范与情感驱动写稿            | Phase 1 · **W1B** | Satellite   | `ready-for-human` | P2 enhancement：首句 1.5s 冲突 + 核心数字具象化对比。                                                                                                              |
| **#273** | 短视频管线并行运行经验总结与并发锁         | Phase 1 · **W1B** | Satellite   | `documentation`   | P2 docs：CDP 并发锁与 runbook 并行文档规范。                                                                                                                       |
| **#285** | login-gated 站点 403 探针误杀面放宽        | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 enhancement：复用 needsAuth 避免知乎等登录源被误杀。                                                                                                            |
| **#284** | Route C 与 web-access 双向引用消除         | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 bug：消除 Agent 路由指令循环引用。                                                                                                                              |
| **#276** | web-deep-research 接入 search-pool CLI     | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 enhancement：统一降级链并补回 Grok 桥。                                                                                                                         |
| **#286** | trend 模式关键词相关性护栏盲区             | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 enhancement：保持探针判死，相关性交 Stage 1 语义层。**2026-09-15 裁决：并入 #309 新闻参数一并落地（见 Absorption 表）。**                                                                                                            |
| **#307** | 6 源 mcp-search-bridge fallback 转直连 Bigsong + Grok promptTemplate | Phase 2 · **W2B** | Satellite   | ✅ 已闭票 (2026-09-19) | P2 enhancement：#309 交付后收敛为两源（google_search/mcp_grok_search）——① mcp_grok_search 转 Bigsong 直连独立源 + promptTemplate（7 天窗+强制日期+排除 wiki/评测+去 China-AI 限定）；② google_search Grok fallback 退役、链止 REST pool；③ pool 资格显式 `poolEligible` 声明（与 mcpFallback 解耦），mcp_grok_search 不进 pool 经用户签字（OQ3 前提消失）；apiFallback 载体 1→2、pool-eligible 2→1。commit `2f97be9`（本地未 push 待授权）。 |
| **#306** | brief-builder fixture 日期衰减（测试基线恒挂 6 例） | Phase 2 · **W2B** | Satellite   | **已闭票**        | P2 bug：fixture 硬编码 2026-08-15 撞真实时钟 30 天窗口，5 例 + `e2e-pipeline` 1 例恒挂。**已交付闭票**（commit `6d6a3bc` / `f7e2731`，`daysAgo()` 相对日期机制，覆盖 `brief-builder` / `claim-auditor` / `e2e-pipeline`，research 148 单测全绿，净化全量验收基线）。 |
| **#305** | Search Pool 静默零结果自动发现（A 告警 / B streak / C CI canary） | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 enhancement：A（parse-drop 精确告警）+ B（零结果 streak）并入统一 source-health（grilling 第 7 项，与 #308 script-error 信号汇合）；C（CI canary 自动开票）含 cron 频率、dedup 与**授权边界** Open Question，pickup 时先裁决再实施。 |
| **#269** | 搜索源失效自动修复闭环 (Phase 2)           | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 enhancement：基于 quarantine 证据沉淀自动化修复。                                                                                                               |
| **#311** | claim 脚本用 @me assign 静默失败（claim 假成功）       | Phase 2 · **W2B** | Satellite   | **已闭票**        | P2 bug：`scripts/claim-issue.sh:49` 传 `assignees[]=@me` 被端点忽略（返回 201 但 assignee 空）+ stdout 丢弃 + 无条件打印 ✅ → 并行 session 判重失效、同一票被重复认领。修法：显式 login + 回读断言 + fail-closed。发现于 #306 claim 过程。**已交付闭票**（commit `3ece3c4`：显式 login + 回读断言 fail-closed + `GH_CMD` 注入 fake-gh 测试 13 场景 + real-data smoke 认领 #311 回读 `0xPabloLI`）。 |
| **#312** | coverr 下载链失效（userToken 词表漂移 + CDN 迁 Mux 旧直链 404） | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 bug：#309 探针 4 发现——搜索 API 活但下载链两处漂移（`data.params.userToken` 变字符串取不到 token；旧 CDN URL 对正确 token 也 404，hit 内 `playback_id` 表明已迁 Mux 需签名）→ 需修 parser + 换下载模式。 |
| **#313** | youtube_search bot-check 验证 Chrome 登录 cookie 通道 | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 bug：探针 4 中 `ytsearch10` 搜到 10 条但下载全撞 bot-check（firefox 无 YouTube 登录态）。Chrome 通道已在本机实证可用（weibo 复测），验证 youtube 路由换 cookie 源能否解；管线默认 firefox 不全局动。 |
| **#315** | 交付记录门禁软提醒无人收账（缺失不复检、告警无归属） | Phase 2 · **W2B** | Satellite   | `ready-for-agent` | P2 enhancement：`issue-tracker-signals.yml` 门禁仅闭票单次校验，缺失告警无人收账且无复检机制。Open Questions（cron 复检 vs label 状态机、告警归属 @ 谁）实施时裁决，与搜源/短视频零冲突可独立推进。 |
| **#300** | 头部竞品短视频音视频分镜结构解构基准       | Phase 3 · **W3A** | Satellite   | `ready-for-agent` | P2 enhancement：【调研先行】CDP 抓取 + Whisper + VLM 解构报告。                                                                                                    |
| **#302** | 外部开源 Repo 逐个深度学习吸收追踪         | Phase 3 · **W3A** | Satellite   | `ready-for-agent` | P2 docs：【调研先行】追踪 A-E 维度研究结论，沉淀经验。                                                                                                             |
| **#310** | 素材库体系（统一素材库 + 文字描述索引 + 收获率 log + 素材关键词） | Phase 3 · **W3B** | 🎯 Dominant | `ready-for-agent` | P2 enhancement：**吸收 #288 + #301**（2026-09-15 grilling 裁决）。四件套定案 = ① 统一素材库（cache key 从 keyword-scoped 改 contentId-scoped，衔接 `docs/media-asset-management.md`）② 文字描述索引（VLM 打标 → bge-m3 向量化，复用 RAG 基建）③ **收获率搜索 log = 第一交付物**（素材链路的 #308，不依赖 #309 审计，可先行）④ 素材关键词体系。与 #295 边界：#295 = 写稿侧 searchHints，本票第 4 项 = 素材搜索侧关键词（#295 延伸不阻塞）。 |
| **#293** | Stage 0 素材预获取与缺口回流机制           | Phase 3 · **W3B** | Satellite   | `ready-for-agent` | P2 enhancement：Stage 0 预热 + 720p 超分 + 缺口回流。                                                                                                              |
| **#301** | 实拍库存视频优先策略改造                   | Phase 3 · **W3B** | Satellite   | `ready-for-agent` | P2 enhancement：pixabay-video 接入 + 叙事全屏库存优先。**2026-09-15 裁决：并入 #310 素材库体系**。                                                                                                            |
| **#314** | douyin/xhs 视频素材源——搜索发现入口 + registry 白名单 | Phase 3 · **W3B** | Satellite   | `ready-for-agent` | P2 enhancement：用户方向性确认抖音/小红书应成素材源。**2026-09-19 用户裁决补充**：① 摘除 9 个 CDP 新闻源（qbitai/jiqizhixin/ithome/xinhua/thepaper/leiphone/zhidx/bing_news/google_search）的 `capabilities.videos` 声明（registry 仅声明已验能力，保留文章源身份）；② 文章页改做 `<video>` + `<iframe>` 播放器双检测（ithome 实测 0 原生 video、走 iframe 播放器），逐站验证声明；③ 发现入口形态实施时定。下载层已存在（#75 批次 4 适配器），缺口在发现入口与白名单语义收敛。 |
| **#289** | Scene 数据与生成视频画面适配               | Phase 3 · **W3C** | Satellite   | `ready-for-agent` | P2 enhancement：Stage 2/3 LLM 生成专属 aiVideo.prompt。                                                                                                            |
| **#299** | Hook 场景前 3 秒专属视觉策略               | Phase 3 · **W3C** | Satellite   | `ready-for-human` | P2 enhancement：官方主视觉 / 暗调库存 / 定制 T2V 优先。                                                                                                            |
| **#294** | VLM borderline 评分二度校验与降级          | Phase 3 · **W3C** | Satellite   | `ready-for-agent` | P2 enhancement：40-60 分构图主体复核，不通过降级。                                                                                                                 |
| **#295** | 写稿 scene-data 概念泛化 searchHints       | Phase 3 · **W3C** | Satellite   | `ready-for-agent` | P2 enhancement：LLM 写稿时注入搜索实体提示词。                                                                                                                     |
| **#253** | 行业知识层 Ontology + hook 版式库          | Phase 3 · **W3C** | Satellite   | `ready-for-human` | P2 enhancement：行业坐标系 + hook ≥3 版式（覆盖 #247）。                                                                                                           |
| **#244** | Hook scene emotion 不足（听感/文案）       | Phase 3 · **W3C** | Satellite   | `ready-for-human` | P2 enhancement：情感表现力写稿规范与 ref 音频选型。                                                                                                                |
| **#256** | 数字人决策权变更与白/黑名单重审            | Phase 3 · **W3C** | Satellite   | `ready-for-human` | P2 enhancement：Agent 自主判断 + 理由义务。                                                                                                                        |
| **#263** | TikTok 成片时长目标重审（双轨机制）        | Phase 3 · **W3C** | Satellite   | `ready-for-human` | P2 enhancement：30-45s 快讯 vs 60-75s 拆解双轨方案。                                                                                                               |
| **#296** | 中文多平台发布架构（Wayfinder Map）        | Phase 4 · **W4A** | 🎯 Dominant | `wayfinder:map`   | P2 enhancement：【调研先行】S3 混合调度引擎架构决策。                                                                                                              |
| **#268** | 中文内容轨首包产出（首个 zh-CN 样片包）    | Phase 4 · **W4A** | 🎯 Dominant | `ready-for-human` | P2 enhancement：首期中文选题与成品包，解锁 #216。                                                                                                                  |

---

### Tier 3 — 低重要性 / 工具链与合规排查

| #        | Issue                                 | Phase & Wave      | Role      | Status            | Notes                                                    |
| -------- | ------------------------------------- | ----------------- | --------- | ----------------- | -------------------------------------------------------- |
| **#274** | Z-Image-Turbo 许可矛盾排查            | Phase 1 · **W1B** | Satellite | **已闭票**        | P3 调研：filipstrand 4bit 标注为误标，维持现状；结论见 `model-sources-reference.md`。 |
| **#281** | Search Pool 引擎可用性复测            | Phase 2 · **W2A** | Satellite | **已闭票**        | P2 调研：Serper 可用（"0 results" = parseArticles 映射 bug，本票顺手修）；Brave TUN 故障未复现，绕行方法留档。 |
| **#231** | TTS/渲染环境固化（余真机构建验证）    | Phase 2 · **W2B** | Satellite | `ready-for-agent` | P3 enhancement：Kaggle wheels dataset 真机挂载验证。     |
| **#257** | Spark-TTS MLX 情绪验证（等听感 HITL） | Phase 1 · **W1B** | Satellite | `ready-for-human` | 客观实验已完成，等用户听感定去留。                       |
| **#304** | T2I 生成工具横评                      | Phase 3 · **W3A** | Satellite | `ready-for-agent` | P3 enhancement：本地 MLX/MPS 为主 + Kaggle T4 参照；纯调研不改代码。 |

---

### Dormant — 触发条件未满足（暂缓占用排期）

| #        | Issue                              | Phase   | Blocked by / Trigger condition                   |
| -------- | ---------------------------------- | ------- | ------------------------------------------------ |
| **#224** | 数字人半身像支持                   | Phase 3 | 等用户提供合适半身照，到位后转 ready-for-agent   |
| **#230** | 字幕短 cue 两行版式合并救援        | Phase 3 | 等并行渲染停手 + 工作区干净                      |
| **#217** | 管线适配视频号发布包               | Phase 4 | Blocked by #216 试点规格确认                     |
| **#218** | 视频号 CDP 自动化发布路线          | Phase 4 | Blocked by #216/#217 + 需另行授权                |
| **#220** | 抖音发布通道落地                   | Phase 4 | Blocked by 大陆实名资源配置决策                  |
| **#223** | 小红书图文频道立项                 | Phase 4 | Blocked by 账号资源与发布方式决策                |
| **#206** | Auto-Redbook 试点与发布链路        | Phase 4 | Blocked by 小红书立项与 dry-run 授权             |
| **#208** | 视频降级图文帖路径                 | Phase 4 | 等小红书图文频道立项（#223）                     |
| **#210** | 调研 TikTok Content Posting API    | Phase 4 | 等扩分发/自动化授权时解锁                        |
| **#21**  | 多模态 RAG                         | Phase 3 | 等素材库规模达到多模态检索门槛                   |
| **#157** | B-roll 高质量模型横评              | Phase 3 | 等高质量 B-roll 需求触发                         |
| **#158** | B-roll ComfyUI / MCP 迭代式后端    | Phase 3 | 等 #157 横评定案                                 |
| **#228** | 管线提速二期（scene batch/daemon） | Phase 1 | 数据驱动触发：等下次真实冷跑 profile 出现新瓶颈  |
| **#222** | 抽象短视频引擎为独立 repo          | Phase 4 | 前置：落地并行工作 → Email POC 视频跑通 → 再抽取 |

---

## Triage Inbox & Recent Log（隔离区与最近分流台账）

新开 issue 先带 `needs-triage` 标签登记在此隔离区；分流完成时迁入对应 Phase、Wave 与 Tier，并在本表同步记录分流裁决作为最近追踪历史台账（滚动保留近两周记录）。

| #    | 开票日     | 一句话描述                                                                               | 分流结果                                              |
| ---- | ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **#315** | 2026-09-19 | ci: 交付记录门禁软提醒无人收账——`check-delivery-record` 仅 `issues.closed` 时校验一次，缺失只留言不复检、告警无归属；存量 10 张告警（9 张缺记录 2026-09-19 已补登 + #252 stale 案例） | ✅ **已分流**：Phase 2 · **W2B** / Tier 2 / Satellite / `ready-for-agent`。问题在 issue-tracker-signals.yml 门禁设计；复检机制形态与告警归属实施时裁决，与搜源零冲突可独立推进 |
| **#314** | 2026-09-17 | feat: 抖音与小红书视频素材源——搜索发现入口 + registry 声明白名单语义；**2026-09-19 用户裁决**：9 个 CDP 新闻源摘除 capabilities.videos 声明，文章页改做 `<video>` + `<iframe>` 播放器双检测 | ✅ **已分流**：Phase 3 · **W3B** / Tier 2 / Satellite / `ready-for-agent`。下载层已备，缺发现层与白名单语义收敛 |
| **#313** | 2026-09-17 | fix: youtube_search bot-check 验证 Chrome 登录 cookie 通道——探针 4 发现 ytsearch10 命中了 10 条但下载全撞 bot-check（firefox 无登录态），验证 youtube 路由换 Chrome cookie 能否解 | ✅ **已分流**：Phase 2 · **W2B** / Tier 2 / Satellite（bug）/ `ready-for-agent`。定界只解 youtube 单源，不全局动 firefox 默认管线 |
| **#312** | 2026-09-16 | fix: coverr 下载链失效——#309 探针 4 发现 `data.params.userToken` 词表漂移（取不到 token）+ CDN 迁 Mux 旧直链 404/403，需修 parser + 摸底 Mux 签名/API 端点 | ✅ **已分流**：Phase 2 · **W2B** / Tier 2 / Satellite（bug）/ `ready-for-agent`。若 Mux 签名无解则 fail-closed 降级/退役 |
| **#311** | 2026-09-16 | fix: `scripts/claim-issue.sh` 用 @me assign 静默失败——端点返回 201 但 assignee 为空 + stdout 丢弃 + 无条件打印 ✅ claimed，导致并行 session 重复认领同一票 | ✅ **已闭票**：Phase 2 · **W2B** / Tier 2 / Satellite（bug）。修法：显式 login（`gh api user --jq .login`）+ 回读断言 + fail-closed。代码交付 commit `3ece3c4`，已推 main 并闭票 |
| **#310** | 2026-09-15 | feat: 素材库体系——统一素材库 + 文字描述索引（VLM 打标 + bge-m3 复用 RAG）+ 收获率搜索 log（第一交付物，素材链路的 #308）+ 素材关键词体系；#288/#301 并入（grilling 收口裁决，用户授权开票） | ✅ **已分流**：Phase 3 · **W3B** / Tier 2 / 🎯 Dominant / `ready-for-agent`。**#288 + #301 并入本票**（absorbed）；收获率 log 不依赖 #309 审计可先行 |
| **#309** | 2026-09-15 | audit: 62 源 fallback 链路逐源重捋——按用途（素材/研究/发现）定链，x_search 模式推广；6 源 challenge 实证。**grilling 裁决定纲**（2026-09-15）：两条契约分类 + 七项扩充（Jina 配额/date 实测、weibo yt-dlp 真实样本、CSE 死代码删除、引擎排序对比、site: 逐源清单、research 16 源纳入、video capability 14 源验收） | ✅ **已闭票 (2026-09-19)**：Phase 2 · **W2B** / Tier 1 / 🎯 Dominant。全部分段交付——静态审计（`4313e29`）、live 探针四项 + 新闻契约最短路径（`0f27a56`/`012057f`/`06bcdbf`）、site: 推广 + threads 判决 + CDP-DOM 日期两档制（`bc34f67`）、research environmentalSignals 3 源真实抓取（`d0f2ea0`）。 |
| **#316** | 2026-09-19 | refactor: 退役三个专属 MCP fallback（实测全部失效——bilibili/weibo_hot python 模块未装即死、sogou uvx init 超时暖复现；静默 0 条类 #305 活例，主层全验证可用） | ✅ **已闭票 (2026-09-19)**：Phase 2 · **W2B** / Tier 2 / Satellite。registry 零 mcpFallback 总锁，parseGrokListResult 孤儿删除，mcp-client.mjs 机器保留；commit `e982c94`。 |
| **#317** | 2026-09-19 | enhancement: 新增 weibo_search 关键词搜索源（CDP + Chrome cookie 通道）——主层 19/19 带 publishedAt；附带修复 #269 预检对 needsAuth 源的误杀 | ✅ **已闭票 (2026-09-19)**：Phase 2 · **W2B** / Tier 2 / Satellite。commits `32d173e` + `f7e18df`。 |
| **#307** | 2026-09-15 | 6 个 web_search 源的 mcp-search-bridge fallback 转直连 Bigsong API（推广 #90 模式，去掉 MCP 子进程跳）；**grilling 补充**：Grok 独立源保留 + fallback 退役，mcp_grok_search 直连改写，promptTemplate 化（7 天窗+日期+排除 wiki/评测） | ✅ **已闭票 (2026-09-19)**：#309 后收敛为两源交付——mcp_grok_search 直连 + promptTemplate，google_search 链止 pool（poolEligible 显式化），mcp_grok_search 不进 pool 经用户签字；commit `2f97be9` 本地未 push |
| **#306** | 2026-09-15 | brief-builder 测试日期衰减：fixture 硬编码 2026-08-15 + 30 天真实时钟过滤，2026-09-15 起恒挂 6 例（#292 review 期间发现，与搜源改动无关） | ✅ **已闭票**：代码交付 commit `6d6a3bc` / `f7e2731`（`daysAgo()` 相对日期机制消除 6 例恒挂，research 148 单测全绿） |
| **#305** | 2026-09-14 | Search Pool 引擎静默零结果自动发现：parse-drop 告警（A）+ 零结果 streak（B）+ CI canary 自动开票（C）——#281 静默烧 credit 三周的教训，用户已批准三层方向 | ✅ **已分流**：Phase 2 · **W2B** / Tier 2 / Satellite / `ready-for-agent`。A/B 并入统一 source-health（grilling 第 7 项）；C 项 CI 自动开票含授权边界，pickup 时先裁决再实施 |
| **#304** | 2026-09-14 | T2I 生成工具横评：M2 Pro 32GB 适配与 mflux 协议适配度（本地 MLX/MPS 为主 + Kaggle T4 参照；纯调研不改代码） | ✅ 已分流：Phase 3 · **W3A** / Tier 3 / `ready-for-agent` |
| **#308** | 2026-09-15 | fix: CDP 提取脚本错误显性化——proxy 异常透传 + extractFromTab 不吞错 + script-error 轨迹与 streak（#269 Phase 2 地基） | ✅ **已闭票**：代码交付 commit `263d9f6` / `b28bdbf`（script-error 全链显性化 + streak/quarantineReason 落 source-health）；远程标签已清理（移除 needs-triage 与 comments-unread，仅保留 bug） |

---

## Conflict Risk Matrix（文件并发风险矩阵）

同时修改同一文件的 Issue **严禁并行，必须串行执行**：

| 文件 / 模块                                        | 涉及 Issues                            | 风险与并发控制规则                                                                                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/short-video/main.mjs`                     | **#287**, **#293**, #228               | 🔴 **最高**——管线生命周期入口。#287（env 加载最顶层）、#293（Stage 0 素材预获取）修改逻辑紧密相邻，**必须严格串行执行**（#272 的 Step 2.5 已落地闭票）。                                                                                      |
| `scripts/short-video/lib/source-registry.mjs`<br>`scripts/short-video/lib/search-sources.mjs` | **#309**✅, **#307**✅, **#285**, **#314**, ~~#301~~→**#310** | 🔴 **最高**——核心搜源调度与源配置。#309（按用途重写 fallback 定链，已交付 `bc34f67`）、#307（fallback MCP→Bigsong 直连 + promptTemplate，已交付 `2f97be9`）、#285（needsAuth 放宽）、#314（9 个 CDP 新闻源摘除 videos 声明）共享 registry 与 collect 流程，**按 #309 → #307 → #285 严格串行执行（#309/#307 已完成，下一 = #285；#314 在 W3B 实施）**。 |
| `scripts/short-video/lib/research/brief-builder.mjs`<br>`scripts/short-video/__tests__/research/` | **#306** | 🟢 **低**——测试基线修复，与生产逻辑零交叉；已交付闭票（commit `6d6a3bc`）。 |
| `scripts/claim-issue.sh`                           | **#311**                               | 🟢 **低**——独立工具脚本。修复 `@me` assign 静默失败为显式 login（`gh api user --jq .login`）+ 回读断言 fail-closed；与其他业务代码与文档零交叉，可随时独立推进。**已交付闭票**（commit `3ece3c4`）。 |
| `.github/workflows/issue-tracker-signals.yml`      | **#315**                               | 🟢 **低**——CI 自动化门禁工作流。修补交付记录单次校验不阻断、增加复检机制与告警归属规则；独立于短视频与检索业务代码，随时可安全推进。 |
| `scripts/short-video/lib/video-downloaders.mjs`     | **#312**, **#313**, **#314**           | 🟡 **中**——视频下载适配器层。#312（coverr parser 与 Mux 适配）与 #313（youtube Chrome cookie 通道路由）修改同一下载器模块，**必须串行推进**；#314 涉及 douyin/xhs 视频下载适配器时亦同在此模块排队。 |
| `scripts/short-video/lib/tts/quality-gate.mjs`     | **#270**                               | 🟡 **中**——TTS 质量防线。#271（语义分流与 fail-closed）已闭票；#270 已交付（`collectInstructWarnings` 复验引擎实际解析的 instruct，只告警不阻断以保住 #271 重抽预算与 failure 家族命名），后续 instruct 文案改动只动 `lib/tts/instruct.mjs`。 |
| `scripts/short-video/asset-sourcer.mjs`            | **#297**, **#301**, **#294**, **#299** | 🟡 **中**——素材匹配与评分。#297（留空 fail-closed）、#301（实拍视频优先）、#294（borderline 二度校验）修改同一套评分流水线，须串行推进。                                                                                                      |
| `scripts/short-video/lib/source-health.mjs`<br>`scripts/short-video/lib/search-pool.mjs` | **#305**, **#285**, **#286**, **#269**, **#309**  | 🟡 **中**——统一信号事实源（grilling 第 7 项：#308 script-error + #209 doctor + #309 用途分类 + #305 pool streak 全部汇入 `source-health.json`）。多票同指向一个文件，**串行推进**；改动仍遵循 fail-open。 |
| `skills/search-pool/` / `skills/web-access/`       | **#284**, **#276**, **#281**           | 🟢 **低**——Agent 技能文档与工具定义。零代码风险，注意同步各 repo。                                                                                                                                                                            |
| `knowledge/media-catalog.json` / `asset-gaps.json`<br>素材库新模块 / `asset-sourcer.mjs` | **#310**, **#297**, **#293**, **#294**, **#299** | 🟡 **中**——#310（统一素材库 + 文字描述索引 + 收获率 log）为 W3B Dominant，吸收 #288/#301 后会动 `asset-sourcer.mjs` 与 catalog 结构；#297/#293/#294/#299 同在该流水线，**须串行**。收获率 log（第一交付物）与这些改动低耦合，可先行。 |
| `scripts/short-video/lib/b-roll/`                  | **#298**, **#289**, #304               | 🟡 **中**——视频/图像生成模型调用。#298 确定模型选型后，#289 定制专有 prompt 模板，顺序推进；#304（T2I 横评）为只读调研票，不改 lib 代码，与两者并行安全，其结论的实现票落地时才需串行。                                                                                                                                                       |

---

## Design Decisions

### 1. 深度调研与基准先行（Research-First 驱动）

- **决策背景**：在复杂的多模态管线演进中，若未摸清竞品分镜节奏、外部开源经验及模型真实生成画质，直接动手修改业务代码会导致频繁推倒重来。
- **裁定规范**：
  - 视觉升级线（Phase 3）：必须先在 **Wave 3A** 完成 **#300**（竞品分镜结构解构）、**#302**（外部开源 Repo 深度学习）及 **#298**（T2V 模型横评），将调研结论凝练为 **#291** S3 Map 规范后，方可开展 Wave 3B（素材底座）与 Wave 3C（代码与模板适配）。
  - 多平台发布线（Phase 4）：必须先在 **Wave 4A** 完成 **#296**（调度架构调研）与 **#216**（微信视频号 5 项核心技术规格人工扫码实测），摸清真机限制与封号风控线后，方可解锁 Wave 4B 的自动化发布脚本。
  - 检索体系（Phase 2）：必须先在 **Wave 2A** 完成 **#281**（单引擎连通性与 DNS 摸底），再推进 Wave 2B 的搜源分流大盘改造。

### 2. Wave-Tier 双维协同架构

- **决策背景**：单维度的列表无法同时兼顾“时序推进次序（When to do）”与“业务价值高低（Why it matters）”。
- **裁定规范**：
  - **Wave 为全局推进时序**：按前置依赖与调研门控组织，定义从 Wave 1A 到 Wave 4B 的线性波次。
  - **Tier 为业务价值与出片保障分层**：Tier 1 聚焦阻断脏数据与出片硬底线，Tier 2 聚焦能力提升，Tier 3 聚焦工具排查。同 Wave 内选票严格遵循 Tier 1 > Tier 2 > Tier 3。
  - **Conflict Risk Matrix 为最终裁决**：任何跨票并行必须以文件冲突矩阵为准。

### 3. Dominant Issue (🎯) 统领与契约设立

- **决策背景**：单 session 逐票推进时，若无阶段性标准锚点，卫星任务容易各行其是。
- **裁定规范**：每个阶段设立 Dominant Issue 作为质量门禁或架构总图（如 #271 出片门控、#292 搜源分流、#291 视觉 Map、#296 发布 Map），卫星票必须向其交付具体切片并遵循其设立的接口契约。

### 4. Fail-Closed 门控底线优先于功能扩充

- **决策背景**：此前偶发 TTS 失败 take 或音画失步依然出片的问题，以及素材搜索在无匹配时强塞无关图片的降级行为。
- **裁定规范**：
  - TTS 出片门控（#271，已交付闭票）：失败按族分流后一律 fail-closed——**pacing 类**（音素正确、仅实测 WPM 偏低）先经 #252 补差，补差仍低于下限 → `TTS_PACING_FLOOR_BLOCK`；**acoustic 类**（截断/漏词/相似度低/无音频）禁入补差环、重抽 ≤2 次后 → `TTS_ACOUSTIC_HARD_BLOCK`。两类硬阻断均不受 strict/non-strict 影响（仅 gate 未分类的失败保留旧非 strict 语义），唯一逃生门 `TTS_SKIP_QUALITY_GATE=1`。用户裁决记录见 issue #271 交付记录。
  - 音频与视觉同步（#272，已交付）：avatar 片段时长 < 该 scene **当前** TTS 音频时长 → 阻断出片（`main.mjs` Step 2.5 与渲染 staging 双门控，单实现 `lib/avatar-guard.mjs`），杜绝唇同步 stale 流入渲染流水线。
  - 素材匹配（#297）：素材搜索无高置信度结果时严格 fail-closed 留空，交由下游 B-roll 生成或纯版式卡片承接，绝不强塞无关图片。

### 5. 统一环境加载入口，杜绝库模块自载

- **决策背景**：#275 暴露出库文件（如 `search-sources.mjs`）假定调用方未加载 `.env.local` 而缺乏必要环境变量的问题。
- **裁定规范**：采纳 #287 设计，由管线入口顶层（`main.mjs`, CLI 等）统一单次加载 `.env.local`，所有底层库模块严禁自载，消除隐式依赖与加载竞争。

### 6. 通用/专用源分流与平台保真链（#292，2026-09-15 终版裁决）

- **决策背景**：#292 重审发现 x_search 链条语义分裂——通用 pool 插进平台保真链中间，命中结果非 X 内容却挂 x_search 标签并抢占更高质量的 Bigsong 推文（smoke 实证）。
- **裁定规范**（用户裁决，2026-09-15）：
  - **平台保真链**：平台专用源（x_search/xhs/sogou_weixin/weibo_hot/bilibili 等）全链只用平台忠实层——x_search = `CDP → googleSiteFallback(site:x.com) → Bigsong 直连`，**不进通用 pool**；triage 规则 1 精神优先于 #65 的七源字面名单（该名单写于 #90 平台化之前，已过时）。googleSiteFallback 的死层根因（capabilities 遮蔽）已修复（#292，`f3d10ba`），真实 smoke 首次提取成功。
  - **pool 资格**：仅 `mcpFallback.toolName === "web_search"` 的 6 个通用源（youtube/arxiv/github/threads/google/mcp_grok_search）；pool（Serper > Brave > Tavily > Jina）先于 Grok MCP 兜底。
  - **Bigsong ≡ mcp-search-bridge 后端**（用户裁定，#90 实证：same upstream/system prompt/env，minus subprocess）；程序化抓取优先直连 API，MCP 协议保留给大模型/Agent 消费方——推广转换见 #307。
  - **不变量**：仅 x_search 携带 apiFallback（registry 级测试锁死）；apiFallback = 平台 Bigsong 桥专属槽位。

---

## 历史轮次下沉说明

历史轮次（第三十八 session 及更早共 56 轮轮换历史与已关闭的 100+ issues 清单）已规范下沉至：

- `docs/archive/tracker-rotation-history-2026-09-06.md`
- `docs/archive/reviews/issue-roadmap-review-2026-09-10.md`
