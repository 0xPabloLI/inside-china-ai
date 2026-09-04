# Research Angle Templates

Load this file during Phase 2 (PLAN) when the research topic matches a domain below.
Pick the angles that apply — don't use all of them blindly. Each angle maps to
2-4 search queries to seed Phase 3 (RETRIEVE).

## TikTok / Short-Form Video

Use when researching TikTok, Instagram Reels, YouTube Shorts, or short-form
video strategy.

| Angle                     | Search queries (examples)                                                                               | Key sources                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Algorithm & ranking**   | "tiktok algorithm 2026 ranking signals", "tiktok for you page how it works 2025 2026"                   | Hootsuite, Sprout Social, PostEverywhere, Darkroom Agency |
| **Hook & retention**      | "tiktok first 3 seconds hook best practices", "short form video completion rate 2025 2026"              | TikTok official, Buffer, Social Media Examiner            |
| **Visual design & color** | "tiktok video color strategy dark vs light background", "color psychology social media video marketing" | Art of Styleframe, AlmostZero, Instagram Growth Coach     |
| **SEO & discoverability** | "tiktok seo keywords hashtags 2026", "tiktok search value captions"                                     | Buffer, Hootsuite, Search Engine Journal                  |
| **Publishing strategy**   | "tiktok best posting frequency 2026", "tiktok off-peak posting engagement"                              | Buffer, Sprout Social                                     |
| **Content format**        | "tiktok motion graphics vs UGC performance", "data visualization short form video engagement"           | Art of Styleframe, goviral global, Archive App            |
| **Technical specs**       | "tiktok video resolution fps format requirements 2025"                                                  | TikTok official help center                               |
| **Algorithm penalties**   | "tiktok content not recommended 2026", "tiktok 200 view jail"                                           | Hootsuite, Sprout Social                                  |

**Platform-specific sources to prioritize**:

- TikTok official: business.tiktok.com, TikTok for Business blog
- Analytics firms: Sprout Social, Hootsuite, Buffer, Influencer Marketing Hub
- Design/creative: Art of Styleframe, Darkroom Agency, Canva

## China AI / Tech Industry

Use when researching Chinese AI companies, tech policy, or China tech market.

| Angle                      | Search queries (examples)                                                       | Key sources                                        |
| -------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Company fundamentals**   | "[company] funding valuation 2025 2026", "[company] products technology"        | 天眼查, 企查查, Wikipedia, company official        |
| **Market analysis**        | "china ai market size 2026", "china ai policy regulation 2025 2026"             | Bloomberg, Reuters, FT, 36氪, 快科技               |
| **Technical capabilities** | "[company] model benchmark performance", "[company] open source vs proprietary" | arXiv papers, Hugging Face, company technical blog |
| **Geopolitical context**   | "us china ai chip export control 2026", "china ai self-sufficiency"             | Reuters, Bloomberg, CSIS, Brookings                |
| **Talent & org**           | "[company] key researchers executives", "china ai talent flow 2025 2026"        | LinkedIn, company about pages, media profiles      |

**Source access notes**:

- 天眼查/企查查 search pages: accessible via CDP, detail pages need login
- 国家企业信用信息公示系统: needs browser interaction, not headless-accessible
- Wikipedia REST API: `curl` accessible if DNS resolves; otherwise use CDP
- English media (Bloomberg, Reuters, FT): partial paywall — CDP with login state helps

## ML/AI Model Selection

Use when researching which ML/AI model to use for a specific task (VLM, TTS,
ASR, digital human, embedding, etc.).

| Angle                        | Search queries (examples)                                                | Key sources                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Task match & benchmark**   | `[model] [target task] benchmark`, `[model] technical report`            | Official tech reports, model cards, task-specific leaderboards. Record eval set, version, settings, date.                           |
| **Real workload evaluation** | `[model] [project workload] quality latency`                             | Reproducible tests on project samples. Record hardware, runtime, quantization, preprocessing, metrics.                              |
| **Apple Silicon / runtime**  | `[model] MLX support`, `[model] llama.cpp GGUF`, `[model] Apple Silicon` | Runtime official docs, model repos, local smoke test. Distinguish "downloadable" from "actually runs on target hardware".           |
| **License & supply chain**   | `[model] license commercial use`, `[model] LICENSE`                      | Model card, repo `LICENSE`, upstream weights & dependency licenses. Record commercial restrictions, redistribution limits, version. |
| **Toolchain & quantization** | `[model] 4bit MLX`, `[model] GGUF`, `[model] runtime support`            | Official/maintainer repos, quantization release pages, local load test. Record format, quant method, maintenance status.            |
| **Risk & maintenance**       | `[model] issue`, `[model] regression`, `[model] release notes`           | Upstream issues, release notes, project tests. Distinguish fixed, avoidable, and unverified risks.                                  |

**Decision rule**: Public benchmarks are screening evidence only — they cannot
replace real-world testing on target hardware with actual project workloads.
Conclusions must explain "why this model fits this task" and retain uncertainty
for unverified items.

## China AI Coding Tools（国产 AI 编程 IDE / Agent 工具）

Use when researching 国内 AI 编程工具、AI IDE、Coding Agent、模型 credits 额度、国内外版本定价。

| Angle                    | Search queries（已验证有效）                                                 | Key sources                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **产品全景**             | "国产 AI 编程工具 2026 盘点"、"[厂商] AI 编程 IDE 发布"                      | IT之家 20 款横评、CSDN 系列盘点、aihub.cn 工具库                                                                 |
| **长尾/遗漏产品**        | "SolonCode AiXcoder CodeFuse 蚂蚁 开源 AI编程"、"除了Trae 通义灵码 还有哪些" | 长尾盘点是最大盲区 —— 大厂五强之外还有 ZCode、JoyCode、Marvis、QClaw、CodeFuse、SolonCode、AiXcoder、Fitten Code |
| **免费额度与计费口径**   | "[工具] 免费额度 credits 每月 限制"、"[工具] 计费模式 公告"                  | **阿里云/腾讯云官方公告页最准**；社区实测与官方口径常冲突，必须并列                                              |
| **模型倍率（隐藏变量）** | "[工具] 模型倍率 credits 消耗"、"[工具] Credits 调整 降价"                   | 月费便宜 ≠ 划算。Qoder CN 曾因倍率 3x vs 国际 0.6x 导致真实成本反超 2 倍                                         |
| **厂商产品矩阵**         | "[厂商] AI 产品 矩阵 发布 2026"、"[厂商] 效率智能体 工具集"                  | 大厂同名/近名产品极多（腾讯有 CodeBuddy/WorkBuddy/Marvis/QClaw/NPC）                                             |
| **模型代际与免费天花板** | "[模型] 发布日期 benchmark AA 指数"、"[工具] 支持哪些模型"                   | Artificial Analysis、SWE-bench、Terminal-Bench、官方发布稿                                                       |
| **国内版 vs 国际版**     | "[工具] 国际版 国内版 区别 价格"                                             | 两站体系常不互通（账号/Credits/订阅分离），不可直接比价                                                          |

**Tier 1 sources worth returning to**:

- 阿里云公告 `aliyun.com/notice/*`、帮助中心 `help.aliyun.com` —— 计费调整最权威
- 腾讯云文档 `cloud.tencent.com/document/product/*`、国际站 `intl.cloud.tencent.com`
- 厂商官网发布稿（meituan.com/news、tencent.com、zhipu 官方）
- 聚合比对站：`codingplan.org`、`llmrates.ai`、`vibetokenplan.com`（引官方但需复核）

**Verified pitfalls**:

- 免费额度常有多个互相冲突的口径（官方 vs 社区实测），**必须以账号内"用量统计"页为准**，报告中并列标注
- "限时加赠"会退坡，"限免期"常无截止日期 —— 标注为风险而非既成事实
- 新模型跑分多为厂商自选基准，等 Artificial Analysis 收录（通常 1–2 周）才算第三方验证
- 社区评测（CSDN/头条/公众号）常带厂商倾向，需 T1 交叉验证

## General / Cross-Domain

For topics that don't fit a specific template above. Generate angles from these
default perspectives:

| Angle               | Focus                                  | Default queries                                           |
| ------------------- | -------------------------------------- | --------------------------------------------------------- |
| **Overview**        | Definitions, scope, current state      | "[topic] overview 2025 2026", "what is [topic]"           |
| **Technical**       | How it works, implementation, specs    | "[topic] technical architecture", "[topic] how it works"  |
| **Market**          | Size, trends, key players, competition | "[topic] market size 2026", "[topic] industry report"     |
| **Contrarian**      | Criticism, limitations, failure cases  | "[topic] criticism problems", "[topic] failed"            |
| **Primary sources** | Official docs, specs, first-party      | "[topic] official documentation", "[topic] specification" |

## Creating Custom Angle Templates

If you research a domain repeatedly and it's not covered above, create a new
section here after a successful research run. Document:

1. The angles that proved useful (not the ones you planned, the ones that delivered)
2. The search queries that found the best sources
3. The sources that were Tier 1 (worth returning to)

This file grows into a domain knowledge base — each research run makes the next one faster.
