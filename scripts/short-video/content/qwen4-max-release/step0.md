# Qwen4-Max Step 0 报告

- 内容包：`scripts/short-video/content/qwen4-max-release`
- 日期：2026-11-19
- 选题：阿里 Qwen4-Max 正式发布（2026-11-16）
- 叙事类型：Breaking release + data-led analysis
- Hook family：`result-first`
- 分集结论：`recommendedParts = 1`。预估正文约 60 秒，加 TTS 句间断句后仍在 70 秒内，不拆集。

## 1. Hook 预览

**Hook voiceover（逐字稿）**

> Alibaba's new flagship just cut task cost by nearly two-thirds from its last model.

**独立可理解论证（陌生观众听这一句能否听懂发生了什么）**

> Alibaba released Qwen4-Max, a 2.4-trillion-parameter model that activates 71 billion parameters per token and, according to Alibaba, completes the same work at 62% lower cost than its previous model.

**四轴自评**

| 轴 | 判定 | 理由 |
| --- | --- | --- |
| 1 首句冲突密度 | PASS | 首分句落在结果「cut task cost by nearly two-thirds」，不是「Qwen4-Max 发布了」这种中性产品名开场。 |
| 2 可感知比较锚点 | PASS | 「two-thirds」在同句给出基线「from its last model」；屏幕大字 `-62%` 的副标题直接写 `TASK COST VS QWEN3.8-MAX`，subject 明确为 QWEN4-MAX。 |
| 3 三轨同频 | PASS | 口播讲 task cost 下降，屏幕大字 `-62%` + 副标题 `TASK COST VS QWEN3.8-MAX`，subject 是 QWEN4-MAX，指向同一对象与同一基线。3b 采用显式 `media: null`，纯文字 hook，不走素材背景。 |
| 4 首句句子族与时长 | PASS | 4a 命中 `result-first`（`just` + 事件 + 数量锚点）。4b「two-thirds」有官方 $4.43 → $1.67 的 62% 降幅兜底。4c 14 词，按 2.75 词/秒约 5.1 秒，在 4.1–6.6 秒可接受带内。 |

## 2. 全片脚本预览表

| # | id (layout) | 预估秒数 | voiceover（逐字稿） | texts（字段名照 REMOTION_SLOT_MAP） | 计划素材 / 证据源 |
| --- | --- | --- | --- | --- | --- |
| 1 | hook (hero-center) | 5.1 | Alibaba's new flagship just cut task cost by nearly two-thirds from its last model. | `badge` CHINA AI · NOV 16; `subject` QWEN4-MAX; `bigNumber` -62%; `numberLabel` TASK COST VS QWEN3.8-MAX; `stats` 2.4T TOTAL PARAMS / 1M TOKEN CONTEXT; `source` QWEN OFFICIAL BLOG, NOV 16, 2026 | `media: null`（纯文字 hook，避免官方海报中文压住 -62% 大字） |
| 2 | spec (media-bottom-bar) | 5.1 | Qwen 4 Max is a 2.4-trillion-parameter model. Each token activates only 71 billion of those parameters. | `company` 2.4T TOTAL PARAMS; `action` 71B ACTIVE / TOKEN; `result` 328B N-GRAM; `source` QWEN OFFICIAL BLOG | `assets/qwen4max-launch.jpg`，Qwen 官方发布视觉，`fit: contain` |
| 3 | architecture (media-bottom-bar) | 6.5 | The trick is the attention stack: three of every four layers compress history, and the fourth searches it. | `company` GDN + QSA; `action` 3 LAYERS COMPRESS; `result` 1 LAYER SEARCHES; `source` QWEN ARCHITECTURE | `assets/qwen4max-architecture.jpg`，官方架构图，`fit: contain` |
| 4 | context-window (stat-reveal hero-center) | 6.2 | It reads a million tokens and sees images natively. Long documents and screenshots fit in one context. | `bigNumber` 1M; `label` TOKEN CONTEXT; `subtext` NATIVE VISION · TEXT / IMAGE / VIDEO; `source` QIANWEN MODEL PAGE, NOV 2026 | 无媒体，纯数字揭示；官方模型页 |
| 5 | work360 (media-bottom-bar) | 6.5 | Alibaba reported its own Work360 test covers 721 job types. Qwen 4 Max scores 52.69, up from 47.74. That is 10% higher. | `company` WORK360; `action` 721 JOB TYPES; `result` 52.69 VS 47.74; `source` ALIBABA'S WORK360 | `assets/qwen4max-work360.jpg`，官方 Work360 图，`fit: contain` |
| 6 | agent-bench (stat-reveal hero-center) | 5.1 | On CodeArena's front-end leaderboard it ranks sixth. On Agents' Last Exam it scores 46.7 on that test. | `bigNumber` 46.7; `label` AGENTS' LAST EXAM; `subtext` CODEARENA WEBDEF RANK #6; `source` CODEARENA / QWEN OFFICIAL | 无媒体；CodeArena 榜单 + 官方博客 |
| 7 | industrial (media-bottom-bar) | 6.2 | In car-parts manufacturing, programming one workpiece fell from 475 minutes to 24. Alibaba reported a 95% cut. | `company` CAR-PART CNC; `action` TIME PER WORKPIECE; `result` 475 MIN → 24 MIN; `source` QWEN OFFICIAL BLOG | `assets/qwen4max-industrial.jpg`，官方工业交付图，`fit: contain` |
| 8 | live-delivery (stacked-cards) | 6.5 | It does not wait for a perfect answer. It ships a usable first version, then keeps improving it. | `badge` LIVE DELIVERY; `company` SHIP A USABLE V1; `action` THEN IMPROVE IT; `context` USER STAYS IN CONTROL; `result` OPEN-SOURCE PLUGIN; `source` QWEN OFFICIAL BLOG | 无媒体；官方 Live Delivery 段落 |
| 9 | caveat (stacked-cards) | 6.2 | Two caveats: these numbers are Alibaba's own, and Qwen 4 Max is closed. Smaller Qwen 4 models promised open. | `badge` THE CAVEAT; `company` VENDOR-REPORTED; `action` WORK360 IS ALIBABA'S OWN; `context` MAX IS CLOSED; `result` SMALL QWEN4 OPEN; `source` QWEN OFFICIAL BLOG | 无媒体；官方博客 + 模型页 |
| 10 | cta (cta) | 6.2 | The price of finishing a task just fell by 62%. The question is who gets the credit. | `brand` CHINA AI NEWS; `brandHighlight` AI; `tagline` CHINA AI, DECODED; `action` FOLLOW FOR MORE; `topic` QWEN4-MAX · 62% CHEAPER | 标准 CTA 组件 |

预估总时长：约 60.0 秒（按 2.75 词/秒，不含 TTS 自然停连；成片按实际 TTS 时长驱动）。

## 3. 数据口径与货币规则

- 官方英文博客：cost per task **$4.43 → $1.67**，降幅 **62%**。
- 部分中文稿写 **26.58 元 → 11.16 元、58%**，是人民币口径，与官方英文博客的美元口径不同。视频统一使用官方美元口径，不复述人民币数字，避免货币规则漏项。
- Work360 是阿里自建基准，视频第 5 与第 9 场景明确写「ALIBABA'S OWN」和「VENDOR-REPORTED」，不把它说成独立第三方。
- CodeArena 是第三方盲测榜；ALE 是第三方智能体评测。第 6 场景分别标注来源。

## 4. 素材与证据

- Stage 0 `asset-gaps --query "qwen,qwen4-max,alibaba"`：0 个 open gap。
- 新落地 5 张官方/一手发布图到 `assets/`：launch、platform、work360、industrial、architecture。
- RAG 语义检索本轮不可用：Ollama 未运行，`scripts/rag/query.mjs` 返回 “Ollama is not running”。已按文档降级为人工盘点既有 `qwen4-preview` / `qwen4-gamefeel` / `dh-pilot-qwen4` 资产，未用检索结果凑数。
- 未复用 `qwen4-gamefeel` 的 GameFeel 榜与 Loktar demo：本轮是正式发布 + 官方规格 + 成本，不复用上一包的第三方早期 demo 结论。

## 5. 待确认

请确认这个角度与 hook。确认后我会：
1. 写 `scene-data.mjs`，跑 preflight / MRL-2；
2. 跑 TTS 前先实测 `media-bottom-bar` 字段宽度，避免 `container-overflow`；
3. 按管线跑 TTS → Remotion → `verify-video.mjs --tiktok`；
4. 产出成片与 HITL 审阅包，不自动发布。
