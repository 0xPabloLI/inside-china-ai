# Trends 选题去重与评分（Horizon 机制移植）

> 来源：Thysrael/Horizon（MIT）的两个纯提示词机制，2026-09-06 由 #203 移植。不安装 Horizon 本体、不引入定时任务；只在 Agent 交叉比对选题时手动执行。原文参考：去重 prompt 源码 https://github.com/Thysrael/Horizon/blob/main/src/ai/prompting/deduplication.py 、打分 rubric https://github.com/Thysrael/Horizon/blob/main/docs/scoring.md 。

选题交叉比对（`search-sources.mjs` → trending-topics.json + last30days → Agent）的固定四步：**去重 → 打分 → 按阈值过滤 → 视频适配度（videoFit 潜力分 + assetReady）与两条列表**。产物（选中的 topic 记录）必须为每条留痕：去重组归属 + 0-10 分数 + `videoFit` + `assetReady` + `assetEvidence` + `format` + `hook` + 一句理由。

## 0. 已建包选题排除（先于去重）

趋势脚本只看得见外部世界，不知道哪些选题已经做过内容包——2026-11-17 的选题因此重新推荐了 `minimax-h3-image` 与 `qwen4-gamefeel`（两者都已建包并发布）。所以四步之前先拿排除表：`search-sources.mjs --trend` 在写完 `output/trending-topics.json` 后，同目录落一份 `output/used-topics.json`（失败时不阻塞趋势抓取，只打印 warn）。也可单独跑：

```bash
node scripts/short-video/used-topics.mjs            # 人读列表
node scripts/short-video/used-topics.mjs --json --out /tmp/used.json
```

排除表来自 `scripts/short-video/content/` 每个包的 `meta.mjs`（topics + keyEntities）与 `output/pending-analysis.json` 的发布标记；`exclusionTokens` 是 slug 分词、topics、公司/模型/人名的小写词表。

判定规则：候选 topic 命中任一 `exclusionTokens` 即标 **used**，不进第 4 步的 Video-ready 短名单；命中但确属新事件（同一产品的新进展）可保留，必须在留痕里写明「同产品不同事件」的理由。不做模糊匹配——误判会把真正的新选题直接删掉。

## 1. 同事件判定去重

交叉比对拿到两份 JSON 合并后，先按分数降序排序，再执行下面的去重判定（自己执行，无需另调 LLM）：

```text
你是新闻去重助手。找出报道【同一个现实事件】的新闻条目组。

规则：
- 仅当两条目报道的是同一事件（同一产品发布、同一事故、同一官方公告）才归为一组
- 同一产品但不同事件 ≠ 重复：「Gemma 4 发布」vs「Gemma 4 被越狱」是两条独立新闻
- 不确定时保留为独立条目（宁可少合并）
- 判定失败/无法确定时跳过该组（fail-open：去重失败不阻塞选题流程）
```

输出格式：每组重复项给出 `[保留主条目, 重复条目, ...]` 的索引组；主条目取分数最高者，其余条目合并进主条目的 sources/urls（沿用 trending-topics 的同构合并），不删除证据。合并时**每条要带上自己的 `refs: {title, url, source}`**（`deduplicateTopics` 已按此产出），因为只留 `urls` 数组时读的人分不清哪个链接对应哪个标题——`urls[0]` 是**当前标题来源那一篇**，不是最先到的那一篇（#1355）。

## 2. 0-10 评分 rubric

对去重后的每条 topic 打分（0-10，可半分）：

| 分数 | 档位   | 判据                                                         |
| ---- | ------ | ------------------------------------------------------------ |
| 9-10 | 范式级 | 重大突破、范式转移、大版本发布、重要研究、改变行业格局的公告 |
| 7-8  | 高价值 | 重要进展、技术深挖、新颖方法、有洞见的分析、有价值的工具     |
| 5-6  | 增量   | 渐进改进、有用教程、中等社区热度、有用但不紧急               |
| 3-4  | 低优先 | 例行更新、常识性内容、浅层报道、推广软文                     |
| 0-2  | 噪音   | 垃圾、离题、琐碎更新、纯广告                                 |

打分考量维度：技术深度、新颖性、影响面、信源质量、与本仓选题（中国 AI）相关性、具体证据（数据/引用/实机演示）、社区讨论实质度。

## 3. 按类阈值过滤

| 内容类型  | 默认阈值 | 说明                                                         |
| --------- | -------- | ------------------------------------------------------------ |
| tech-news | 7.0      | 时效新闻类视频/文章（ Horizon 默认 8.0，本仓起步放宽到 7.0） |
| tech-blog | 4.0      | 深度博客/教程类                                              |

- 阈值按类型独立配置，**可复盘可调整**：调整时在本文件下方的调参记录表追加一行，注明日期与理由。
- 低于阈值的条目不入选题，但保留在产物附注中（score + 弃选理由），供回溯。

## 4. 视频适配度（videoFit）

0-10 分只回答「这条新闻有多重要」，不回答「能不能做成好看的短视频」。两者分开打分：既避免把「重要但纯文字」的新闻系统性压低，也避免把「有 demo 但新闻价值一般」的 topic 抬进 Big News（9-10 档）。

**选题阶段的 `videoFit` 是「可获取素材潜力分」，不是库存分。** 它回答的是：围绕这条新闻的实体，能不能找到足够的视觉素材，剪出 30-60 秒竖屏视频。素材不要求已经下载到 `content/<slug>/assets/`；官方 demo、产品页、发布会/活动录屏、创始人或团队公开照片、公司总部/展台、产品图、品牌 logo、财报图表、benchmark 图、AMA 截图都算，只要和新闻中的企业、人物、产品或数据直接相关。素材可以与具体事件无关（例如人物旧照、公司大楼），但不能编造，也不能拿一条没有来源的“示意图”充数。

同一批实体素材可以在多个选题里复用：常出现的公司、人物放进共享实体库（例如 `content/_entities/tencent/`、`content/_entities/people/yao-shunyu/`），选题时写本地路径即可。复用不降低分数，但 `assetEvidence` 必须写出实际路径。

| 分  | 潜力判据（至少满足一档；3 分以上还须 hook 不是纯文字）                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------- |
| 5   | 官方 demo/发布会/现场录屏等**官方动态素材** ≥1，加上 ≥3 个可验证的实体视觉（人物/产品/公司/图表），hook 能直接落在动态素材上 |
| 4   | 可获取的动态素材 ≥1，加上 ≥2 个实体视觉（合计 ≥3 个素材），hook 可以是人物/产品/图表的静图首帧                               |
| 3   | ≥3 个实体视觉（人物/公司/产品/图表），能做成 explainer；或 1 个动态素材 + 2 个实体视觉                                       |
| 2   | 只有 1-2 个可验证素材；或只有 logo/头像/通用空镜                                                                             |
| 1   | 只有文字卡/数据卡，没有可验证的人物、公司、产品或图表                                                                        |
| 0   | 没有可验证的视觉素材，或素材会误导观众（未证实爆料、法律纠纷、张冠李戴）                                                     |

硬上限：素材少于 3 个时最高 2 分；hook 写成 `TEXT CARD: ...` 或纯文字时最高 2 分；`assetEvidence` 为空或只有一句“官方 demo”而没有任何 URL/路径时记 0。`videoFit ≥3` 要求 hook 首帧能出现人物脸、产品、logo、图表或“人物 + 数据 overlay”，不能是纯文字版式。

`videoFit` 必须带这些字段：

- `assetEvidence`：每个计分素材的 `type:label (official/third-party, dynamic/still) URL 或本地绝对路径`，用 `;` 分隔；没有就写 `none`。官方 demo 或产品页 URL 可以直接作为证据；不要求已下载。只有 URL 没有本地文件仍可计潜力分，但 `assetReady` 必须为 0。
- `assetReady`：0/1，**只表示素材是否已经落盘、能否进入生产**；由 `content/<slug>/assets/` 的实测库存决定，不由选题阶段的 URL 决定。0 表示“可以做，但还没备料”；1 表示“素材已够开工”。
- `format`（视频形态）：`demo-led` / `chart-led` / `data-reveal` / `explainer` / `text-led`。`demo-led` 要求 `videoFit ≥4`，且至少有一个可获取的动态素材作为 hook 候选。
- `hook`：一句话写前 1-2 秒给观众看什么，并写出素材类型或标签。写不出来，分数上限 2。

`format` 是选题阶段的画面抓手，不替代 `skills/short-video-pipeline/SKILL.md` 的新闻形式判断；最终形式仍按该 skill 的 Decision framework 决定。对应关系：

| `format`      | 对应形式 / 用途                                       |
| ------------- | ----------------------------------------------------- |
| `demo-led`    | 第一方 demo 驱动（通常落在 Breaking / Deep Analysis） |
| `chart-led`   | 图表驱动（通常落在 Data Reveal）                      |
| `data-reveal` | Data Reveal                                           |
| `explainer`   | Explainer                                             |
| `text-led`    | 纯文字/版式（通常落在 Deep Analysis / Explainer）     |

选题阶段用 `lib/topic-video-fit.mjs` 打分：

```bash
npx vitest run scripts/short-video/__tests__/topic-video-fit.test.mjs
```

### 4.1 生产阶段的 assetReady / assetFit（与选题 videoFit 分开）

选题的 `videoFit` 是潜力，不代表素材已经能剪。建包后必须把素材下载到 `content/<slug>/assets/`，再用库存硬分复核：

```bash
node scripts/short-video/lib/video-fit.mjs --content <slug>   # 打印实测 assetFit
```

库存硬分沿用 2026-11-20 的门禁口径（视频段数/计分总时长/静图数）：5 = ≥2 段动态、计分 ≥15s、≥4 张静图；4 = ≥1 段动态、计分 ≥8s、≥3 张静图；3 = ≥3s 动态 + ≥2 张静图，或无动态但 ≥6 张静图；2 = ≥3 张静图；1 = 1-2 张静图；0 = 无可用素材。每段视频最多计 10 秒，只统计 ≥640×360 的 mp4/mov/webm/m4v 与 jpg/png/webp/avif；logo、图标、低清截图不计。

- `assetReady` 由实测 `assetFit ≥2` 得出（至少 3 张可用静图，或 1 段 ≥3s 动态 + 2 张静图）；`assetReady=0` 时不能进入渲染。
- `meta.videoFit` 仍保留为**生产库存分**字段（历史兼容，等价于 `assetFit`），不表示选题潜力。声明高于实测即 preflight FAIL；`2026-11-20` 及之后创建的包没有 `meta.videoFit` 直接 FAIL。
- `assetFit ≥3` 要求：非 CTA 场次媒体覆盖 ≥60%（图片或视频均可）。`assetFit ≥4` 还要求：hook 有可渲染的 evidence media（`mediaRole:"evidence"`；只有 path 不够，background/card 在 hook 里不渲染，首帧仍是文字）、场景里实际用到 ≥1 段（5 分要求 ≥2 段）动态素材。素材躺在 `assets/` 但没绑进 scene，不算交付。
- 开场视觉优先级（#1542）：包内只要绑定了 motion clip，第一段必须出现在 scene 1-2；若第一段视频只在 scene 3+，`checkHookVisualPriority` 只报 editorial WARN。例外写 `meta.hookVisualPriorityReason`（剧透/事实不匹配/版权或原声限制），完整 demo 仍留 payoff。

核实第一方素材时看官方 X / YouTube / Bilibili / 视频号 / 官网 newsroom。选题阶段可以只登记 URL；进入生产必须把 mp4 下载到 `content/<slug>/assets/` 并用 `ffprobe` 读出时长才算库存。`trending-topics.json` 的 `videos[]` 是页面级信号（整页视频会赋给每条文章），只能当线索；DOM 里没有 `<video>` 也不代表没有素材，要查 `films.js`、播放器配置或页面 bundle 里的真实清单。

### 4.2 官方产品页动态素材探针（#1551）

选题阶段最常见的错分不是 rubric 不认动态，而是**证据采集只到品牌页/新闻稿**：官方产品页里明明嵌着 1080p clips，`assetEvidence` 却只有一行 `product:… (official, still)`，而 `product` 默认 `dynamic:false`。智元 AIMA 在 2026-11-26 就是这样从 5 分掉到 3 分（证据链见 `scripts/short-video/output/videofit-rescore-20261126.md`）。

**强制动作**：`videoFit <= 3` 且证据中出现官方产品页（或编辑已找到该实体的官方产品页）时，定稿前必须探一次页内媒体：

```bash
node scripts/short-video/official-media-probe.mjs \
  --url https://www.agibot.com.cn/products/A3Ultra --official
```

- `--official` 表示页面是第一方；第三方转载页必须用 `--third-party`。探针不猜页面归属，这个 flag 就是编辑的归属判决。
- 能识别：`<video>` / `<source>` 的 `.mp4` / `.mov` / `.webm` / `.m3u8`、`og:video`、内联 JSON 与页面 bundle 里的媒体 URL，以及页内 YouTube / Bilibili / 抖音 / 优酷 / 视频号 embed。
- 静图（`.jpg` / `.png` / `.webp`）不算动态；第三方转载页的视频即使可播放，也只能写 `official:false`，不得按官方动态计分。

探到的媒体按既有证据格式写进 `assetEvidence`，**保留原来的 product 静图行**：

```text
demo:A3 Ultra reliability (official, dynamic) https://cms-tos.agibot.com/…/reliability.mp4
```

**探不到怎么办**：页面没有可播放媒体（或静态 HTML 里只有图片）时，保留原分并在审计里写「官方产品页未探到可播放动态」。JS 渲染后才创建播放器的页面，静态探针同样返回 0——不能据此断言「没有动态」，也不能凭这个升分；这类页面升级浏览器探针是后续票，不属于本轮。

**重打分只走审计，不全量重打**。把需要复核的 topic 写成 JSON（`assets` + 可选 `probePages` + `probe.format/hook`），跑：

```bash
node scripts/short-video/videofit-rescore.mjs --input /tmp/videofit-topics.json \
  --out scripts/short-video/output/videofit-rescore-<YYYY-MM-DD>.md
```

- 只对 `videoFit <= 3` 且存在官方产品页的 topic 探针；4–5 分 topic 不重打。
- 探到动态且编辑把 hook/format 落到动态素材上才升分；审计逐条写「原分 / 新分 / 证据变化 / 未升分原因」。
- 产出文件随下一轮 Trend 报告一起给出（与 `topic-selection.md` 同目录）。
- embed 的官方性按**载体页面归属**判定，不额外校验 YouTube/Bilibili/视频号账号：官方页面里的 embed 记 `official:true`，第三方转载页里的同一 embed 仍记 `official:false`。
- 本轮是**软门禁**：定稿前由编辑跑探针并把结果写进审计；它不阻断 CI，也不给旧报告做 grandfather。历史报告只复核当轮 `videoFit <= 3` 的 topic，不一次性回扫最近 N 天。

### 两条列表

阈值不变，选题报告同时输出两条列表：

- **News-first**：按 0-10 分降序；分数相同时 `videoFit` 高的在前。跨分不翻转——视频优先的跨分排序由 Video-ready 承担。
- **Video-ready**：只收达到类型阈值的 topic，按 `videoFit` 降序、0-10 分降序。这是「本周最适合做视频」的短名单，不替代 News-first 的编辑判断。

每条 topic 的留痕至少包含：去重组归属、0-10 分、`videoFit`、`assetReady`、`assetEvidence`、`format`、`hook`、一句理由。低于阈值的 topic 仍保留在附注中，不进入两条列表。

`Video-ready` 的入选条件是 `videoFit ≥3` 且 `assetReady=0`（可以做、还没备料）——这表示“值得进入生产备料”，不是“现在就能渲染”。备料后 `assetReady=1` 才能进入渲染。

### 选题报告位置

把两条列表写到 `scripts/short-video/output/topic-selection.md`（与 `trending-topics.json` 同目录，gitignored），两张表共用字段：

| 去重组归属 | Topic | 0-10 | videoFit | assetReady | assetEvidence | format | hook | 理由 |
| ---------- | ----- | ---- | -------- | ---------- | ------------- | ------ | ---- | ---- |

Agent 在选话题的回复里贴出两张表，并给出文件路径。

## 调参记录

| 日期       | 类型      | 变更                                                                  | 理由                                                                                                                                     |
| ---------- | --------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-06 | tech-news | 初始 7.0                                                              | Horizon 默认 8.0 对起步期选题过严                                                                                                        |
| 2026-09-06 | tech-blog | 初始 4.0                                                              | Horizon 默认                                                                                                                             |
| 2026-11-16 | videoFit  | 新增 0-5 标注与同分调序                                               | 官方 demo 类选题在同等新闻价值下优先；不改 0-10 阈值                                                                                     |
| 2026-11-20 | videoFit  | 改为素材库存硬分 + preflight 门禁                                     | 两条已发布视频 3/2 张静图、0 段视频却自称 video fit；改为按落盘素材数量/时长计分，声明高于实测即 FAIL                                    |
| 2026-11-21 | videoFit  | 选题阶段改为“可获取实体素材潜力分”；新增 `assetReady`/`assetFit` 分层 | 旧口径只认已落盘文件，导致所有新 topic 都是 0、Video-ready 永远为空；选题需要先判断“能不能找到人物/企业/产品/图表素材”，生产再按库存复核 |
