# Article Humanize Patterns — MRL-1 B9/W7/W8/W9 与 W1 阈值依据（L2）

> 研究依据文档：新增检查条目的模式来源、语料实测与阈值推导。执行规则本身在
> `docs/article-production-guide.md` MRL-1（唯一权威版本），本文不重复执行指令。

## 来源

- Wikipedia ["Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)（WikiProject AI Cleanup 维护）的 35 条模式清单。
- [`blader/humanizer`](https://github.com/blader/humanizer)（MIT，v2.11.2）：同一清单的 agent-skill 实现，纯 Markdown 提示词、无运行时代码。

评估结论：**不引入 humanizer skill 本体**，只把 MRL-1 尚未覆盖的增量模式写成检查条目。理由：词汇层已被 B8 覆盖；本仓库文章的格式约束（frontmatter、widget 标记、验证标注、来源清单）需要定制保留规则，外部工具的 file mode 不了解这些约束（见下文风险节）。

## 模式采纳/拒绝清单

| humanizer 模式                                         | 处置                | 理由                                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #7 AI 高频词                                           | 已覆盖              | B8 Tier 2 黑名单。语料实测：delve / testament / pivotal / crucial / robust / seamless / tapestry 在 10 篇文章中全部 0 次，landscape / leverage / underscore / showcas 各 1 次，词汇层已干净 |
| #14 em-dash                                            | 采纳 → W7（密度版） | 全库 128 个，集中 4 篇（57 / 29 / 16 / 15）。不做硬禁：em-dash 是既定修辞，只限密度                                                                                                         |
| #1–#6 内容层套路                                       | 采纳 → W8           | 拔高意义、name-dropping、浅层 -ing 分析串、销售腔、模糊归因、challenges-and-outlook 模板。B8 只管词汇，不管结构                                                                             |
| #11 同义换名与重复句首                                 | 采纳 → W8           |                                                                                                                                                                                             |
| #20–#22 chatbot 残留                                   | 采纳 → B9           | 机械可查且无豁免场景，所以是 Blocker 不是 Warning                                                                                                                                           |
| #31 假高潮短句连排                                     | 采纳 → W8           |                                                                                                                                                                                             |
| #34/#35 信息密度判定法                                 | 采纳 → W9           | 「每句必须提供前文没有的信息」作为压缩判定器                                                                                                                                                |
| #16–#19 排版层（sentence case 标题、emoji、bold 列表） | 拒绝                | 与现行标题体例（Title Case）和既有格式规范冲突                                                                                                                                              |
| #23–#25 filler / qualifiers / 通用结尾                 | 暂缓                | 与 B8 相邻、边际小；观察 W8 运行情况后再议                                                                                                                                                  |
| #12 假 from-X-to-Y、#13 被动语态                       | 暂缓                | 判定主观、误报率高，无法稳定人工复核                                                                                                                                                        |

## 语料实测（2026-09-04，`articles/*.md` 共 10 篇）

| 文章                                   | 词数 | em-dash |
| -------------------------------------- | ---- | ------- |
| china-llm-distillation-scandal         | 3063 | 57      |
| bytedance-zhang-yiming-no-distillation | 2538 | 3       |
| deepseek-art-of-restraint              | 1515 | 29      |
| zhipu-glm6-self-training               | 1382 | 0       |
| qwen4-preview                          | 1246 | 15      |
| kimi-k3-sandbox-escape                 | 1167 | 0       |
| unitree-ipo-debut                      | 1074 | 0       |
| kimi-ipo-50b                           | 997  | 16      |
| alibaba-80b-ai-megabet                 | 886  | 4       |
| doubao-work-bytedance-enterprise-agent | 800  | 4       |

## 阈值推导

### W1 正文字数：3000 → 2500

试验：对最长的 china-llm-distillation-scandal（3063 词 / 57 dash）做**保留全部声明、验证标注、表格、widget 标记与链接**的保守重写，结果 3043 词；57 个 dash 清到 38 个，且残余 38 个全部位于 Sources 列表「媒体 — 标题」引用格式，正文散文段为 0。

结论：这篇的长度是**结构性的**——验证标注（B6）、内联源引用（B4）与数据表格都是管线硬性要求，claims-preserving 的改写减不了重。2000 阈值会永久标记所有数据密集文章（Warning 噪声化）；2500 只标记异常值（3063、2538 两篇越线，8/10 通过），配合 W9 的段落级压缩，散文层仍有实际收紧空间。

### W7 em-dash 密度：≤ 3 个/千字

试验中正文密度从 18.6/千字 降到 0，说明清零可达成；3/千字 留出正常修辞余量，同时拦住 AI 典型的 15+/千字 密集用法。豁免：直接引语、Sources 列表「媒体 — 标题」引用格式。

### B9 / W8 / W9 无数值阈值

按模式判定，逐条样例见 Wikipedia 原文与 humanizer README 的 before/after 表。

## 引入外部改写工具的前置风险

humanizer 的 file mode 只承诺保留 code blocks / YAML metadata / data / link targets，**未提 HTML 注释**。本仓库文章含 `<!-- widget:xxx -->` 标记（试验文 4 个、全库 12 个）与 ✅/⚠️/❌/🔴 验证标注。未来若引入任何外部 humanize/改写工具，先验证这两类标记完整保留，否则禁止对 `articles/` 文件直接跑 file mode。

## 试验记录

- 2026-09-04：china-llm-distillation-scandal 保守重写试验（产出候选稿，未替换 `articles/` 原文，替换属内容 HITL 决定）。改写同时修正一处原文笔误：K3 架构表 4 行但导语写「two architectural innovations」，改为「four」。
