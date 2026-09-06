# 自媒体十 Skill 调研（2026-09-06）

> 来源：《Codex 做自媒体必装的十大 Skill》（微信公众号 MaV6nwIQDDUoDCj_vh5hOA，无链接清单）。
> 逐仓验证：`gh api` 元数据 + README + 源码深挖（Horizon/Auto-Redbook 到源码级）。
> 决策级结论在 `docs/tools-catalog.md`「待评估 / GitHub 候选 Skills」区；本文保存源码级细节，供 #203-#210 实施时查阅。

## 1. Agent-Reach — 多平台读取路由 CLI

仓库：Panniantong/Agent-Reach（78,294 stars，push 2026-09-01，MIT，Python）

- 定位是"能力层"：Python CLI（`agent_reach/`），每平台一个 channel 模块（`channels/twitter.py`、`xiaohongshu.py`、`bilibili.py`、`reddit.py`、`xueqiu.py`、`v2ex.py`、`xiaoyuzhou.py` 等 13+），负责选型/安装/体检/路由；底层直接调 yt-dlp、bili-cli、gh、feedparser、`r.jina.ai`、Exa MCP，无包装层
- 每平台"首选 + 备选"多后端路由：某接入被封自动切换（案例：2026-06 yt-dlp 被 B 站风控封死 → 切 bili-cli）
- `agent-reach doctor`：全通道健康度自检
- 零配置渠道：网页（Jina Reader）、YouTube 字幕、RSS、GitHub 公开库、B 站搜索（bili-cli）、V2EX
- 需登录态渠道：Twitter（Cookie-Editor 手工导出，运行时 `TWITTER_AUTH_TOKEN`/`TWITTER_CT0`）、Reddit/Facebook/Instagram/小红书（OpenCLI 复用已有 Chrome 会话，不代登录）、雪球/小宇宙（Whisper 转录需免费 Key）
- 安装方式特殊：把 install.md URL 丢给 Agent 自行执行——prompt 注入式供应链，本仓不采用
- 吸收点（#209）：fallback 路由结构 + doctor 自检思路

## 2. Horizon — AI 新闻雷达管线

仓库：Thysrael/Horizon（9,260 stars，push 2026-09-06，MIT，Python）。不安装、不引入定时任务（用户决策 2026-09-06）。

### 抓取器（`src/scrapers/`，httpx async + feedparser/BeautifulSoup）

| 源 | 机制 | 凭证 |
|---|---|---|
| RSS | httpx 拉 feed → feedparser；URL 支持 `${ENV_VAR}` 展开传私有 token；可选 `content_extractor`（trafilatura）抓全文替换摘要 | 无 |
| Hacker News | 官方 Firebase API（`hacker-news.firebaseio.com/v0/topstories.json`），取 top N、`min_score`（默认 100）过滤，并发抓每条前 5 条评论 | 无 |
| Reddit | 三级 fallback：old.reddit HTML → www JSON listing（Chrome UA 伪装）→ RSS；评论并发限制 2；专用 `RedditBlockedError` | 无（匿名） |
| Telegram | 公开频道 web 预览页（`t.me/s/`、`telegram.me/s`、`telegram.dog/s` 三端点轮试），解析 `div.tgme_widget_message`；429 读 Retry-After | 无（仅公开频道） |
| Twitter/X | 默认 Apify `altimis/scweet` actor（需 `APIFY_TOKEN`，$49/月起）；免费模式 Playwright + 导出 cookie JSON，拦截页面 GraphQL，`x_cookies_*.json` 多账号轮询，5-10s 间隔，cookie 1-4 周过期 | 二选一 |
| GitHub | 官方 REST API：`/users/{u}/events/public` + repo releases | 可选 `GITHUB_TOKEN` |
| OpenBB | SDK `news.company()` 按 watchlist 拉；同步调用包 `asyncio.to_thread`；未装则跳过 | provider 凭证 |
| 另有 | GDELT、Google News、Ossinsight 三个 scraper（README 未列） | 无 |

### 去重（两层，无 embedding）

1. URL 级（orchestrator `_deduplication_url_key`）：scheme/host/port 归一、去默认端口，跨源同链接合并
2. 主题级 LLM 去重（`src/ai/prompting/deduplication.py`）：按分数降序把标题/tags/摘要一次性发给 LLM；prompt 规则"只有报道**同一现实事件**才算重复（'Gemma 4 released' vs 'Gemma 4 jailbroken' 算不同），不确定时保留"，返回 JSON 重复组，每组保留最高分；LLM 失败整体跳过（fail-open）

### 打分与过滤

- 每条按 profile（`profiles/*/analysis.md`，内置 tech-news / tech-blog / finance-news / ai-creator）打 0-10 分；内容截断 800/1000 字符 + 评论 + 互动元数据；JSON 解析失败指数退避重试
- 阈值按 profile 配置：`processing.profile_settings.<id>.threshold`（示例：tech-news 7.0 / tech-blog 4.0 / finance-news 7.0，null 关闭）
- rubric（`docs/scoring.md`）：9-10 范式级突破 / 7-8 重要进展 / 5-6 增量 / 3-4 低优先 / 0-2 噪音；之后有 category 配额的 balanced digest

### 输出

中英双语 Markdown 日报 → GitHub Pages / 自托管 SMTP-IMAP 邮件列表 / 飞书钉钉 Slack Discord webhook / MCP / 本地文件；交互式向导生成初始配置。

吸收点（#203/#204）：去重 prompt 规则、rubric+阈值模型、Telegram `t.me/s/` 抓取、Reddit 三级 fallback。

## 3. MediaCrawler — 中文多平台爬虫

仓库：NanmiCoder/MediaCrawler（64,492 stars，push 2026-08-14，**NON-COMMERCIAL LEARNING LICENSE 1.1：仅学习、禁商用、禁大规模爬取**，Python）

- 平台：小红书/抖音/快手/B站/微博/贴吧/知乎，含关键词搜索、指定帖子、二级评论、创作者主页、登录态缓存、IP 代理池、评论词云
- 核心技术：Playwright（默认 **CDP 模式连用户已有 Chrome**，复用真实登录态/扩展降风控）+ 登录态上下文内**执行 JS 表达式拿签名参数**（不逆向算法）；扫码登录 `--lt qrcode`
- 依赖 Python + uv + Node ≥16（部分签名）；数据可入库
- 有付费闭源兄弟 MediaCrawlerPro（断点续爬、多账号、去 Playwright），README 大幅导流
- 免责声明链接《中国爬虫违法违规案例汇总》（HiddenStrawberry/Crawler_Illegal_Cases_In_China）：四类禁区——①给黑灰产提供爬虫服务 ②抓取贩卖个人隐私 ③无版权商业数据获利 ④爬垮目标网站；主要罪名：非法获取计算机信息系统数据罪（刑法285）、破坏计算机信息系统罪（286）、侵犯公民个人信息罪（253之一）
- 本仓判定：❌ 不引入。刑事特征（卖数据/隐私/大规模/致瘫）我们均无，但许可证禁商用 + 机制与自建 CDP 路线等价

## 4. huashu-design — HTML 设计物生成

仓库：alchaincyf/huashu-design（23,906 stars，push 2026-08-25，MIT，作者"花叔"；另有 huashu-skills 52 skill 总目录）

- 纯提示词 + 前端工程 skill（agent-agnostic），输出全为单文件 HTML：交互原型（iPhone bezel、状态驱动多屏、Playwright 自动点击验证）、HTML deck、信息图
- 核心资产：60 种 HTML 原生风格库（网页/PPT/信息图各 20，纯 CSS）+ 20 设计哲学 + 三套"设计方向顾问"逻辑 + 5 维评审 prompt
- 目录结构 `references/`、`assets/`、`scripts/`、`demos/` 共 99 处引用，必须整目录安装（`npx skills add`；旧版 CLI 有只拷单文件 bug）
- 动画：自研 Stage + Sprite 时间片段模型（`useTime`/`useSprite`/`interpolate`/`Easing`），一条命令导出 MP4（25/60fps 插帧、可带 BGM）/GIF
- PPT：`html2pptx.js` 读 DOM computedStyle 逐元素翻译成 PowerPoint 真文本框对象，导出可编辑 PPTX
- 图片来源：Wikimedia/Met/Unsplash 真图（非 AI 生图）；另有 huashu-slide-codex 用 Codex 内置 image_gen 做封面
- 无安全红旗。备用场景：未来图文频道/演示/信息图

## 5. Auto-Redbook-Skills — 小红书文案+配图+发布

仓库：comeonj/Auto-Redbook-Skills（2,251 stars，push 2026-08-13，**无 license**（默认版权保留），Python + Node.js）

三段式：

1. 文案：SKILL.md 指导写小红书笔记 markdown
2. 配图：`scripts/render_xhs.py`（或 .js）Playwright 渲 HTML 模板出 1080×1440——8 套主题 CSS（terminal/retro/neo-brutalism 等）+ 4 种分页模式（separator / auto-fit / **auto-split 按渲染后实际高度自动拆卡** / dynamic），产出 cover.png + card_N.png
3. 发布：`scripts/publish_xhs.py` 从 `.env` 读 `XHS_CREATOR_COOKIE`（creator.xiaohongshu.com 手工 F12 复制），走 `vendor/xhs_publish_runtime/` 内置 **Creator 纯 HTTP 签名链路**——vendor 含逆向 JS（`sign.js`、`mns.js`、`b1.js`、`xs_common.js`、`mns_keystreams.json`）+ Node 18+ 运行时，不依赖浏览器；支持定时发布、话题、地点、代理、`--dry-run`、默认仅自己可见

红旗：README 顶部自挂小红书官方 2026-03-10《打击 AI 托管运营账号治理公告》；逆向签名随时失效；vendor 审计成本高；无 license 不得修改再分发。

处置（#206，用户 2026-09-06 决策接受平台风险）：安全审计 → 小号 dry-run → 仅自己可见试点 ≥1 周 → 使用规范（真实发布仍走 HITL，主账号不触达）。

## 6. Generative-Media-Skills — 云端生成 API 配方集

仓库：SamurAIGPT/Generative-Media-Skills（4,224 stars，push 2026-08-27，MIT，Shell/MD）

- 结构：`/core`（muapi-cli npm 包的薄包装：媒体上传、图片编辑、auth/轮询）+ `/library`（约 50 个 SKILL.md 配方：Cinema Director、Nano-Banana、Seedance 视频等，声明 inputs + Steps，Agent 读取后串联 muapi CLI）
- 底层全是 MuAPI（muapi.ai）付费聚合 API：Midjourney v7、Flux、Seedance 2.0、Kling 3.0、Veo3；`muapi auth configure` 配 key；生成素材自动上传 MuAPI CDN
- 性质：SamurAIGPT/Anil-matcha 系高频 SEO 型发布，README 带 utm 追踪/推广视频/关联仓库互链——营销渠道
- 本仓判定：❌ 不接入。学习点（#207）：①统一异步任务 API 模式（提交→task ID→轮询/回调，多模型共用接口与重试/超时约定）②Library 配方格式（SKILL.md 声明 inputs/steps 的编排描述）——只读 `/core` 源码提炼，不注册不付费

## 7. nuwa-skill（女娲）— 账号文风/心智模型提炼

仓库：alchaincyf/nuwa-skill（32,107 stars，push 2026-08-25，MIT，作者 AI 博主"AJ 胡钦"，Python 壳 + 核心为 SKILL.md + 参考文档）

四步管线（输入一个名字）：

1. 六路并行 Agent 采集：著作、播客访谈、社交媒体、批评者、决策记录、时间线
2. 三重验证提炼：观点须**跨 2+ 领域出现**、**对新问题有预测力**、**有排他性**
3. 构建新 SKILL.md：3-7 个心智模型 + 5-10 条决策启发式 + 表达 DNA + 价值观/反模式 + 诚实边界；完整方法论在 `references/extraction-framework.md`
4. 质量验证：3 个该人物公开回答过的问题测方向一致性 + 1 个没讨论过的问题测"适度不确定"

零 API key，纯本地，产出本地 SKILL.md。风险：蒸馏名人可能幻觉（验证步骤缓解）；语料不足会过拟合。

处置（#205）：方法论移植——对本账号已发布内容（约 15 个视频 slug + `articles/` 已发布文章）跑同构提炼，产出账号文风档案进 brand-system 体系。

## 8. guizang-social-card-skill — 小红书图文卡片/公众号封面

仓库：op7418/guizang-social-card-skill（6,862 stars，push 2026-07-01，**AGPL-3.0**，HTML，作者"歸藏"）

- 单文件 HTML/CSS 渲染 → Playwright 截图 PNG，无前端构建链
- 内置：2 套视觉系统（Editorial 杂志风 / Swiss 瑞士风）、3 个画板（小红书 1080×1440；公众号 2100×900 + 1080×1080 封面对）、28 个版式骨架、10 套主题
- `validate-social-deck.mjs`：Playwright DOM 测量校验溢出/字号/密度
- Live Photo 分支：用户视频装进版式 → JPG + MOV + `.pvt` 包，iPhone 端发布（小红书 5s / 微信 3s）
- 图源：优先用户图；无图时 Unsplash → Pexels → Flickr CC → Wallhaven 搜索，落本地并写 `SOURCES.md`
- AGPL 注意：原样使用做内容生产无碍；改编进闭源管线触发开源义务
- 关联场景（#208）：小红书/公众号频道立项后作为图文帖产出工具

## 9. social-auto-upload — 多平台自动发布

仓库：dreammis/social-auto-upload（14,793 stars，push 2026-09-02，MIT，Python）

- 机制：Playwright 复放各平台创作者中心上传页（非官方 API）；覆盖抖音、B站、小红书、快手、视频号、百家号、支付宝生活号、微博、虎扑、TikTok（Chrome 版）、YouTube；支持视频/图文 + 定时发布
- 登录态：本地扫码或手工导出 cookie（抖音 `export_douyin_cookie.sh`、B站 `sau bilibili login` 二维码），持久化复用
- 已 CLI 化（`sau`，uv 安装），带 Claude Code/Codex skills（douyin-upload、xiaohongshu-upload 等 SKILL.md）+ Agent Bootstrap Prompt
- 红旗：作者自认可被平台检测（在"更隐蔽更稳定"路线上迭代）；"养号/矩阵"是社区语境；持平台 cookie；2026 年初疏于维护后密集重构、接口不稳；TikTok/YouTube 有官方 API 仍走浏览器模拟
- 本仓判定：❌ 不采用（HITL 硬门 + 封号风险）。官方路线方向登记为 #210（parked）

## 10. linco-bridge — Agent 远程入口桥接

仓库：lincotalk/linco-bridge（90 stars，Alpha，push 2026-09-04，MIT，JavaScript）

- 三段式：本机 `linco-connect`（npm CLI）读取 Agent CLI（Codex CLI/Claude Code/Hermes/OpenClaw）的会话、权限请求、附件与产出文件 → 认证 WebSocket 连"频道"后端 → 远端客户端（iOS TestFlight / Android APK / H5 / 微信小程序 / 自定义 IM）收发消息、审批权限、浏览文件
- 后端三选一：官方 Linco 云（**闭源**）、自托管参考平台 `linco-bridge-platform`（NestJS + UniApp）、自定义后端；`--token "<app-id>:<app-secret>"`
- 红旗：官方云 TLS ≠ 端到端加密（README 自声明，demo 明说勿传敏感数据）——本仓工作目录含未发布稿件与 Supabase 配置，不可接受；App 与官方云闭源；90 stars 极早期
- 本仓判定：❌ 不推荐

## 结论汇总

| # | Skill | 判定 | 关联 |
|---|---|---|---|
| 1 | Agent-Reach | 机制吸收（fallback 路由 + doctor），不装 | #209 |
| 2 | Horizon | 机制吸收（去重/rubric/Telegram/Reddit fallback），不装不定时 | #203/#204 |
| 3 | MediaCrawler | ❌ 明确不做（license 禁商用 + 机制等价） | — |
| 4 | huashu-design | 收录备用（未来图文频道） | — |
| 5 | Auto-Redbook | 待评估试点（用户接受平台风险） | #206 |
| 6 | Generative-Media-Skills | ❌ 不接入本体；模式提炼 | #207 |
| 7 | nuwa-skill | 理念采纳 → 账号文风档案 | #205 |
| 8 | guizang-social-card | 收录备用（AGPL 注意） | #208 |
| 9 | social-auto-upload | ❌ 不采用；官方 API 方向 → #210 | #210 |
| 10 | linco-bridge | ❌ 明确不做（信任面 + 成熟度） | — |
