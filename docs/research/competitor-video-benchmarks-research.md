# TikTok 竞品视频基准调研（#300 · 阶段 1）

> **状态**：阶段 1（只读调研）完成于 2026-10-16。阶段 2 已开工——**下载路线已落地并验证**（TikTok → ytdlp，§3.2）；分析侧（WhisperX + VLM 逐 scene）与批量脚本待做，见文末「下一步」。
> **关联**：父票 #291（视觉设计）；下游消费方 #299 / #278 / #244 / #253 / #289。

本票要回答的问题：赛道头部竞品的 hook 与整条视频 scene 结构实际怎么做，作为我们 hook/scene 改进的外部参照系。
票正文把阶段 1 定义为三项 first probe（landscape、抓取能力与限制、scene-data 对接格式），本文即该阶段的产出。

---

## 1. 结论摘要

1. **英文侧是本赛道的主体，中文侧在 TikTok 上很薄。** 英文「AI 资讯」账号粉丝量 100K–4M、公司化日更；中文 AI 资讯的真实头部在抖音/快手/B站，TikTok 端未发现对应量级的纯资讯号（详见 §2）。跨语言对比若以 TikTok 为唯一取样面，中文侧样本会非常弱——这是阶段 2 抽样前必须先定的口径问题。
2. **抓取技术路线被两层限制卡住**：区域封锁（香港出口被 TikTok 拒服务）+ 反爬签名（原先验证过的 `item/detail` 免签名路线已失效）。目前**已验证可用**的只有「登录态主页列表抓取」；视频文件下载路线需要重新验证（详见 §3）。
3. **分析产出的对接格式已确定**：竞品拆解按 schema v1 落 per-video JSON；**不得替换**我们自己的 scene-data，跨条规律才上浮到下游 issue（详见 §5、§6）。

---

## 2. 赛道 landscape

### 2.1 英文组（讲 China AI / AI race / AI industry）— 主取样面

按第三方统计口径排序（粉丝量为**第三方数据**，TikTok 官方无公开账号粉丝数据）：

| #   | handle              | 显示名                      | 受众        | 粉丝量（来源 / 日期）                      | 内容形态                   |
| --- | ------------------- | --------------------------- | ----------- | ------------------------------------------ | -------------------------- |
| 1   | `@marcus.dipaola`   | Marcus DiPaola              | 英语·美国   | 4.1M（Optell，2026-10）/ 3.8M（Collabstr） | 口播新闻 / 纪录片          |
| 2   | `@synthesia_ai`     | Synthesia「AI Explains AI」 | 英语        | 700K+（团队自述，无日期）                  | 数字人播报 AI 新闻         |
| 3   | `@rileybrown.ai`    | Riley Brown                 | 英语        | 636.7K（Feedspot，2026-09）                | 口播 + 录屏，AI Agent 工具 |
| 4   | `@natebjones`       | Nate B. Jones               | 英语        | 488K（本人官网自述）                       | 口播，AI 新闻解读          |
| 5   | `@kanekallaway`     | Kane Kallaway               | 英语        | 425.1K（Feedspot，2026-09）                | 口播，Tech & AI            |
| 6   | `@maverickgpt`      | Maverick GPT                | 英语        | 409.6K（genz.ai，无日期）                  | 录屏，ChatGPT / AI 视频    |
| 7   | `@sineadbovell`     | Sinead Bovell               | 英语·加拿大 | 313.1K（Feedspot）                         | 口播，科技评论             |
| 8   | `@shedoesai`        | Johanne                     | 英语        | 227K（genz.ai）/ 220.1K（Feedspot）        | AI 教程 + 资讯             |
| 9   | `@thechriswinfield` | Chris Winfield              | 英语        | 120.7K（Feedspot）                         | 口播，「每日 90 秒 AI」    |
| 10  | `@allsiekmiller`    | Allie K. Miller             | 英语        | 112.3K（Feedspot）                         | 口播，AI 商业策略          |

**未获取项（不要当成不存在）**：`@scmpnews`、Wes Roth、Matthew Berman 取到媒体报道但 **TikTok 粉丝量未获取**（后两者以 YouTube 为主，200K–340K 订阅）。**「China AI 专题（英文）」未找到专属头部账号**——综合媒体号（如 CNA）覆盖中国 AI 但属综合新闻。这是本赛道一个真实空档，也是我们的机会窗口。

### 2.2 中文组（讲 AI 行业动态 / 公司新闻 / 技术解读）

| #   | handle            | 显示名               | 语言/受众          | 粉丝量（来源 / 日期）             | 内容形态                     |
| --- | ----------------- | -------------------- | ------------------ | --------------------------------- | ---------------------------- |
| 1   | `@aigc1459`       | AIDL（主页领工具箱） | 中文·大陆/海外华人 | 32.5K（KOLens，2026-10）          | 图文 + 录屏，AI 智能体/工具  |
| 2   | `@technology0420` | 創意新科技           | 繁体中文·台湾      | 58.6K（Heepsy，2026-09）          | 混剪 / 图文，泛科技          |
| 3   | `@ajim0422`       | 阿駿日常             | 繁体中文·台湾      | 486K（Heepsy，2026-09）           | 口播 / 混剪，泛科普（含 AI） |
| 4   | （handle 未获取） | Harry 哈利           | 繁体中文·台湾      | 132.4K（NanoInfluencer，2025-12） | 未获取，AI / 半导体          |

**关键发现**：「秋芝2046」「图灵宇宙」「U航」等大陆头部 AI 讲解号**抖音有、TikTok 未获取**。中文 AI 资讯生态集中在抖音/快手/B站/小红书，且以「工具测评 + 科普」为主，纯资讯解读号稀少（壹娱观察）。

### 2.3 信源可信度分级

- **中高（逐号 + 日期可核）**：Collabstr（2026-10-13，逐 handle 给 ER + 粉丝）、Optell（逐号，含语言/地区/月更条数）、Heepsy（按月更新，2026-09）。
- **中（口径需谨慎）**：Feedspot（2026-09-15，榜单混入「AI 工具/自动化」）、NanoInfluencer（2025-12，数据较旧且 Cloudflare 反爬）。
- **低 / 噪声**：Favikon「Top AI Influencers」实为 AI 生成形象（lilmiquela、Aitana López），与资讯赛道无关；各区「mejores tiktokers IA」博客地区局限且无可核数值；genz.ai 无更新日期。
- **一手（仅作交叉印证）**：本人 / 团队官网自述（natebjones.com、aiwithkyle.com）；TikTok 官方 newsroom 只讲产品政策、无粉丝数据。

> TikTok 官方**不提供**任何账号粉丝公开数据，上表数值均为第三方抓取结果，与实况可能存在偏差。阶段 2 抽样前应以 CDP 登录态实测校准。

**主要来源**：
`creators.feedspot.com/ai_tiktok_influencers/` · `collabstr.com/top-influencers/ai` · `optell.com`（逐号页）· `heepsy.com/top-tiktok/tech/taiwan` · `nanoinfluencer.ai/top/TikTok/AI-Industry-channels/by-followers` · `kolens.ai/k/aigc1459` · `m.thepaper.cn/newsDetail_forward_33200194`（壹娱观察）· `natebjones.com` · `timnoakes.com/synthesia`

---

## 3. 抓取能力与限制（实测）

### 3.1 区域封锁 —— 已实测，是硬约束

| 出口 | 实测（2026-10-16）                                      | 结果                                                                              |
| ---- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 香港 | Cloudflare trace `loc=HK colo=HKG`，IP `112.120.48.240` | `tiktok.com/` 与 `/search` 均跳 `/hk/about`（「已停止在港运营」），**完全不可用** |
| 日本 | Cloudflare trace `loc=JP colo=NRT`，IP `216.23.83.116`  | `tiktok.com/` 正常渲染、**已登录**（中文 UI，导航含主页/上传/消息）               |

> **操作含义**：TikTok 抓取**必须**在非 HK 出口的自动化 profile（`~/chrome-tiktok-profile`，端口 9229）上进行；开工前先跑 `npm run cdp:ensure` 与一次 trace 自测。这条应固化为抓取脚本的前置门禁（同 `docs/selector-auto-healing.md` §Chrome 安全规程 的 profile 门禁思路）。
>
> 出口实际由 macOS **系统代理**（`127.0.0.1:7890` → JP）决定，CDP 与 yt-dlp 都继承它：`ytdlpProxyArg()`（`lib/ytdlp-guard.mjs`）读系统代理并显式传给 yt-dlp，所以命令行 `yt-dlp` 不需要手写 `--proxy`。若代理切回 HK 节点，两条路线会同时失效。

### 3.2 逐路线验证状态

| 路线                                     | 状态                                 | 证据                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录态**主页视频列表**抓取               | ✅ **已验证可用**                    | CDP 打开 `tiktok.com/@marcus.dipaola`，`[data-e2e="user-post-item"]` 取到 19 条，`[data-e2e="video-views"]` 取到播放量（965 ~ 177.5K）                                                               |
| **视频文件下载（yt-dlp）**               | ✅ **已验证可用**（2026-10-16 落地） | `downloadVideo()` 经新增 ytdlp 路由：2 条样本（`@rileybrown.ai` 85s / `@marcus.dipaola` 323s）各落盘一个 1080×1920 HEVC+AAC 单文件 mp4，单条 17–27s、3.8–18.7MB                                      |
| `item/detail` 免签名 API（旧文档默认法） | ❌ **已失效（页面外）**              | 页面内 `fetch('/api/item/detail/?itemId=…&aid=1988')` 仍返回 JSON（含 `playAddr`/`stats`/`duration`）；一旦脱离页面（Node/curl/带 `aweme` 前缀）即返回 HTML/403。2026-08-24 的结论对页面外场景已过期 |
| 直接导航视频页 URL                       | ❌ **403**（预热也无效）             | 导航 `tiktok.com/@handle/video/{id}` 得 `chrome-error://chromewebdata/` + HTTP ERROR 403；先开主页预热、再同一 tab 导航仍 403                                                                        |
| 同 tab 点击卡片（SPA 模态播放）          | ⚠️ **页面可播，但取不到文件**        | 点击主页卡片不发生导航、在 SPA 内打开播放器并正常播放；被反爬拦截的是**媒体 CDN**，不是页面                                                                                                          |
| 从媒体 CDN 直下（三级都试过）            | ❌ **403**（除浏览器内带凭据）       | 捕获到的 `v16-webapp-prime.tiktok.com/...media-video-hvc1...`：Node/curl 带完整浏览器头仍 403；**页面内** `fetch(credentials:"include")` 得 206 —— 差异在客户端指纹（TLS/JA3）而非 cookie            |
| 视频文件下载（原仓储内 adapter）         | ✅ **已修复**                        | `selectStrategy` 原只覆盖 YouTube/B站/微博/xhs/抖音，TikTok 落入 `COBALT` 兜底（实测 `failed / fetch-error / 0 bytes`）；现已新增 TikTok → ytdlp 路由                                                |
| ScrapeCreators API（免登录搜索）         | ⚠️ 未重验                            | 注册表 `tiktok_creator` 走 `SCRAPECREATORS_API_KEY`（付费，key 在 `.env.local`）；`docs/selector-auto-healing.md` 记录过 `api.scrapecreators.com` 直接 `ECONNRESET`                                  |

**删除/弃用（已完成 2026-10-16）**：`item/detail` 免签名路线已在 `docs/research/reference-video-extraction.md` TikTok 段与 `asset-source-quick-reference.md` 标注为 superseded；代码侧的 `video-understand.mjs:downloadTikTokVideo`（CDP + base64 分块）已删除，TikTok 改走 yt-dlp。后续 session 不要再按旧法重跑。

### 3.3 可利用的既有资产

- `scripts/short-video/lib/video-downloaders.mjs` — 已有 `DownloadResult` 契约 + adapter 注册表；**本次新增 TikTok → ytdlp 路由**（`isTiktokUrl` + `selectStrategy` 分支 + `buildYtdlpCommand` 的 tiktok 分支），是竞品视频落盘的正式入口（命令行调 `downloadVideo(url)`，不要手写 yt-dlp）。原 CDP 取 `<video>.currentSrc` 范式（`downloadDouyinCdp`）在 TikTok 上已证不通（媒体 CDN 403）。
- `scripts/short-video/lib/ytdlp-guard.mjs` — `ytdlpProxyArg()` 提供系统代理（JP 出口）；TikTok 分支 cookieless（extractor 自解 JS challenge，实测无需 cookie）。
- `scripts/short-video/lib/tiktok-video-details.mjs` — 登录态 CDP 逐页抓取的既有实现（含最小交互纪律）。
- `docs/research/tiktok-hook-patterns-best-practices.md` — 已有 P1–P6 hook 模式体系与填空模板，是竞品 hook 编码的现成词表。
- `scripts/short-video/capture-competitor-videos.mjs`（**本次新增**）— 批量抓取入口：账号清单 → 登录态主页列视频 → 按播放量 Top N → `downloadVideo()` 落盘 → `manifest.json`。内建两道代码门禁（自动化 profile、非 HK 出口），CLI 见 `--accounts/--top/--out`。
- 分析侧：`scripts/short-video/lib/video-understand.mjs` 的 `understandVideo()`（下载 → whisper.cpp 转写 → Qwen3-VL-30B）+ `qwen38_vlm_wrapper.py`。
- `scripts/short-video/analyze-competitor-videos.mjs`（**本次新增**）— 批量拆解入口：读 `manifest.json` → 逐条 ASR（复用 `transcribeVideo()`）→ 竞品专用 VLM 提示词（`COMPETITOR_PROMPT`）→ 落 schema v1 per-video JSON（§6）。时间轴在**代码侧**由 ASR 段界推导（`anchorTimings()`），不接受模型自报的毫秒值（原因见 §3.5）。CLI：`--manifest/--out/--limit/--handles/--force/--asr-only/--vlm-only`。
- `scripts/short-video/lib/competitor-vlm-worker.py`（**本次新增**）— 行式 JSON worker：复用 `vlm_analyzer.py` 的模型装载与推理，但换用竞品提示词并回传**原始文本**（不套资产语义 schema）。只**读**`vlm_analyzer`，不改动其生产契约。

### 3.4 分析侧端到端（2026-10-16 实测）

`understandVideo()` 对已落盘的竖屏 HEVC 样本（`@rileybrown.ai`，85s）跑通，全程 208.7s（其中绝大部分是 30B 模型推理，含模型加载）：

| 环节                              | 结果                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 下载                              | `ok`，单文件 1080×1920 HEVC+AAC（走新的 ytdlp 路由）                                                                                            |
| ASR（whisper.cpp）                | 21 段，ms 级时间戳（如 `[0–7000] "Teach me about automation with AI, enter, check this out."`），末尾 `"follow for more"` 说明气口识别到了 CTA  |
| VLM（Qwen3-VL-30B，native video） | `contentKind: product_demo`、`subjects: [search engine, AI, automation, machine learning, diagrams, technology]`、`description`（一段可读摘要） |

**注意**：`understandVideo()` 产出的是**通用资产语义**（为「这条素材能不能用」设计），不是 schema v1 的竞品拆解。`relevance`/`fit` 等字段对竞品视频为空——竞品拆解需要另加一层提示词（schema v1 的 `beats`/`shots`/`learnings`）。这是阶段 2 第 6 步的工作，不在本次单样本验证范围。

### 3.5 批量拆解：三个必须知道的失效模式（2026-10-17）

第 6 步的第一次实跑（`analyze-competitor-videos.mjs`，单条 `maverickgpt/7533665407173938462`，49.1s）产出结构完整、内容可用，但暴露两个**静默失真**（加上修好后验证轮发现的第三个，共三条）：

**① 模型自报的时间戳是编造的。** 输出的 `beats` 把整条叙事压在 `0–4800ms`（占 49.1s 视频的 9%），而它同时给出的分段**内容**与 ASR 段序一一对得上。原因不是模型看漏了画面，而是 mlx_vlm 的原生视频采样**只给帧、不给时钟**（`utils.py: resolve_video_inputs` 把帧均匀铺满全片，`frames_indices` 未进提示词），模型于是按「一帧一秒」补齐。**修法**：不再让模型报毫秒——提示词只给 `VIDEO_DURATION_MS` + 带实测 start/end 的编号 ASR 段，模型只负责报每个 beat/shot 起于第几段（`anchorSegment`），毫秒由 `anchorTimings()` 按段界推导（`endMs` 取下一处不同的段起点，末项取视频时长），单调性与全覆盖由构造保证；`evidence.timing.{beats,shots}Anchored` 落盘留证。

**② 输出预算不足会静默丢掉整条记录。** 同轮 `rileybrown.ai/7309572377577393451`（31 段 ASR）在 2500 token 处被截断在字符串中间，JSON 没闭合 → 解析失败 → 整条视频无产出（`.raw.txt` 留痕）。**修法**：输出预算提到 6000 token，并在提示词里收紧冗长（单字段 ≤200 字符、shot ≤12 条、相邻同画面合并）。

**③ 语音稀疏的视频会把锚定时间轴「塌缩」到一个点。** 锚定修好后再跑 3 个账号，`rileybrown.ai`（31 段）与 `maverickgpt`（7 段）时间轴覆盖完整（`0 → 71600` / `0 → 49100`，与视频时长一致），但 `shedoesai/7372434986558934305`（15.8s，只有 **2 段** ASR——12 个工具 logo 轮播，几乎无人声）上，模型把 9 个 beat 的锚**全部指到第 1 段**，9 个 beat 的 `startMs` 全为 0。危险之处在于 `beatsAnchored` 仍报 9/9，看起来完全健康。**修法**：新增 `evidence.timing.{beats,shots}DistinctStarts` 与 `{beats,shots}Collapsed`（`total > 1 && distinctStarts <= 1`），并在 stderr 与 `index.json` 汇总里显式告警。**结论：人声稀疏/音乐主导的竞品视频，靠 ASR 段锚定拿不到镜头节奏**——其 `verdict`/`story_level`/`learnings` 仍可用，但 `beats`/`shots` 的**时点**不可用。

> 三条都属于「看起来成功、实际是错的」：① 时间轴错到只剩 9% 而报告照样成文；② 只落一个 `.raw.txt` 且 `index.json` 记 `failed`；③ 时间轴塌缩成一个点但 `beatsAnchored` 报满分。下游消费 schema v1 前必须同时看 `evidence.timing`（尤其 `*Collapsed`）与 `index.json` 的 `failed` / `collapsedTimeline` 计数。

**已知偏离（未修，供后续判断）**：提示词要求 3–8 beats，实测 `rileybrown.ai` 返回 31 beats（= ASR 段数）。内容不重复、每条意图可辨（"Establish the competitive context" → "Demonstrate object recognition" …），故未强行压缩——强行压到 8 条可能丢掉 #291 视觉设计需要的细分粒度。**beat 数量的合规性目前无法保证**，若下游按「≤8 个叙事单元」消费，需另加聚合步骤。


---

## 4. 抓取策略结论（阶段 2 采用）

1. **发现（账号 → 视频清单）**：走**登录态主页抓取**（已验证）。关键词搜索只在 ScrapeCreators API 可用时作为补充；不把「主站搜索」列入必选路线。
2. **下载（视频文件）**：**已定并已验证**——走 `downloadVideo(url)` 的 ytdlp 路由（非 HK 出口、cookieless、单文件 1080p mp4，实测 2/2 成功）。分析侧也已确认能消费这类竖屏 HEVC 文件（§3.4）。**不要**在未验证的情况下批量抓取。
3. **抽样**：票正文说抓取阶段不设上限、分析阶段再抽样。实际执行建议**每条账号按播放量取 Top N**（如 5–8），避免把长尾低质内容带进分析；N 由阶段 2 定。
4. **纪律**：单遍顺序访问、页间拟人间隔、单实例登录态贯穿、失败页记录后跳过（沿用 `docs/analytics-workflow.md` 的最小交互原则与 `tiktok-video-details.mjs` 内建行为）。
5. **不要手工逐条 shell**：阶段 2 应落一个批处理脚本（账号清单 + 每账号取样数 → 结构化目录），否则会耗在重复的一次性调用上。

---

## 5. 与 `scene-data` 的 schema 差异（对接格式）

我方现有结构（`scripts/short-video/content/<pkg>/scene-data.mjs`）是**单条视频的渲染输入**：每 scene 含文案 + `visualType`，其中 `visualType` 取值 `hook` / `narrative` / `data` / `cta`；hook 另有 P1–P6 模式词表。

竞品拆解的粒度与目的不同，**不能共用同一结构**：

| 维度      | 我们的 `scene-data`          | 竞品拆解产物                                             |
| --------- | ---------------------------- | -------------------------------------------------------- |
| 目的      | 驱动渲染（可直接播）         | 记录「对手怎么做的」（证据 + 规律）                      |
| 最小单位  | scene（渲染单元）            | shot（可观测的画面/口播段）                              |
| hook 表示 | P1–P6 词表（**我们的**体系） | 观察到的**原始**句式 / 视觉 / 情感，需要时再映射到 P1–P6 |
| 落盘      | 每包一个 `scene-data.mjs`    | **每视频一份 JSON**（见 §6）                             |

**对接原则**：竞品拆解**只读参照**，**不改动、不替换**我们的 `scene-data`。二者之间靠「规律」而不是「结构」连接——见 §6 的归属映射。

---

## 6. 竞品拆解记录 schema（v1 · 已采纳）

票评论中提出的 schema v1 经确认**采纳为阶段 2 的分析产出格式**：**每条视频一份 JSON**，按下方五层落盘；**报告只做摘要与横向对比，不重述 JSON 内容**（避免同一事实两处维护）。

- `meta` — 账号 / 语言 / 粉丝量 / 发布时间 / 时长 / 播放·点赞·评论·分享 / 内容形态
- `verdict` — 这条为什么成（一段判断，非打分）
- `story_level` — 整条的结构骨架（钩子 → 展开 → 转折 → 落点）
- `beats` — 分段叙事单元（每段的意图与信息量）
- `shots` — 可观测的画面/口播段，与 beats 对齐（供 #291 视觉设计取用）
- `learnings` — 可复用点 / 反面教训

**已定夺（阶段 2）**：

- `beats` 层的 `audienceQuestionIn` / `audienceQuestionOut`（票评论标记为「最大增量」）——**保留**，进入提示词与落盘 schema。
- **时间轴由代码推导，不接受模型自报值**（§3.5 ①）：模型只报 `anchorSegment`，`startMs`/`endMs` 由 `anchorTimings()` 按 ASR 段界算出；`endMs` 取下一处不同的段起点，末项取视频时长。
- `meta.likes/comments/shares/publishedAt` 本轮**留 `null`**——那需要登录态逐条详情页二次抓取，不在本步骤范围；禁止为凑字段编数。
- 落盘新增 `evidence.timing`（`durationMs` / `beatsAnchored` / `shotsAnchored` 等）作为时间轴可信度留证。


---

## 7. 输出归属映射

| 产出                  | 归属                                                           | 说明                                                       |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| 跨条**规律 / 模式库** | 本文档 + 下游 issue（#299 / #278 / #244 / #253 / #291 / #289） | 可执行条目下沉为对应 issue 的 L1 素材/规范；本文档只留依据 |
| 单条**视频拆解 JSON** | 阶段 2 的产物目录（如 `data/competitor-benchmarks/`）          | 证据层，不进 `docs/`                                       |
| **不产生**            | —                                                              | 不替换、不改写我们的 `scene-data`                          |

---

## 8. 票内 Open Questions 决策状态

| #   | 问题                                                 | 状态                                                                                                                                                                                                            |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 头部账号怎么识别/筛选                                | **部分**：已给候选清单；**门槛未定**（粉丝量 vs 播放量 vs 话题标签），需阶段 2 用登录态实测校准                                                                                                                 |
| 2   | TikTok 抓取技术路线                                  | **已决**：区域封锁 + 签名失效两个约束已实测；**下载路线已验证落地**（新增 ytdlp 路由，2/2 样本成功）                                                                                                            |
| 3   | 视频内容分析技术路线（VLM + whisper、逐 scene 边界） | **已验证可跑通**：`understandVideo()` 单样本（85s 竖屏 HEVC）208.7s 完成 —— whisper 21 段转写（ms 级时间戳）+ Qwen3-VL-30B 出 `contentKind`/`subjects`/`description`（§3.4）。逐 scene 边界切分质量待批量后评估 |
| 4   | 分析结果结构化 schema                                | **已决**：采纳 schema v1（§6）                                                                                                                                                                                  |
| 5   | 跨语言对比维度                                       | **已决**：只做英文侧（§9 第 1 条）                                                                                                                                                                              |
| 6   | 产出怎么 feeding 下游                                | **已决**：见 §7 归属映射                                                                                                                                                                                        |

---

## 9. 下一步（阶段 2）

1. ✅ **中文侧取样口径（Open Q5）**：**已决**——只做**英文侧**对比（中文侧在 TikTok 太薄，最大约 32.5K，与英文 100K–4M 不同量级）；中文侧若日后要做，改走抖音/B站，不在本票范围。
2. ✅ **下载路线**：**已决并落地**——TikTok → ytdlp 路由（见 §3.2 / §3.3），`downloadVideo()` 为唯一入口。
3. ✅ **端到端单样本**：**已跑通**——下载（§3.2 两样本）→ ASR 21 段 → VLM（§3.4）。
4. ✅ **头部门槛与取样数（Open Q1）**：**按阶段 2 默认执行**——取 §2.1 清单中**第三方粉丝量 ≥ 100K 的英文账号**共 9 个，每账号按**播放量 Top 5**；实测列清单 36 条、落盘 35 条。门槛与取样数的最终口径仍待阶段 3 用这批数据校准（本步不改默认）。
5. ✅ **跑批量抓取**：**已完成**——`node scripts/short-video/capture-competitor-videos.mjs`，8/9 账号成功、35 条落盘（§3.3；`@allsiekmiller` 两次 0 条列表）。
6. ⏳ **批量拆解落 schema v1 JSON → 填 `learnings` → 跨条规律上浮到对应下游 issue。** 脚本已落地（`analyze-competitor-videos.mjs` + `lib/competitor-vlm-worker.py`，见 §3.3），提示词与时间轴机制已按 §3.5 三条失效模式加固并经 3 账号验证（`rileybrown.ai` / `maverickgpt` / `shedoesai`，0 失败）；**全量 35 条的跑批与跨条规律上浮尚未完成**。

**未验证项（务必不要当成已成立）**：ScrapeCreators 是否可用；批量规模下的风控表现；`beats` 数量的提示词合规性（§3.5 已知偏离）；人声稀疏视频的镜头节奏（§3.5 ③）。

