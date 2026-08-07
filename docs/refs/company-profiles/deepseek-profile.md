# Company Profile: DeepSeek

> Last updated: 2026-08-08

## Basic Info

- **Full name**: Hangzhou DeepSeek Artificial Intelligence Basic Technology Research Co., Ltd. (杭州深度求索人工智能基础技术研究有限公司)
- **Founded**: July 2023
- **Founder**: Liang Wenfeng (梁文锋)
- **Type**: AI Lab (subsidiary of High-Flyer Quant)
- **Headquarters**: Hangzhou, Zhejiang
- **Valuation**: ~$50B post-money (June 2026 first external round); $71B pre-money target for second round (paused July 2026)
- **Employees**: ~200-300 (estimated; no official disclosure)
- **Parent**: High-Flyer (幻方量化), a Chinese quantitative hedge fund

## AI Division

- **Team name**: DeepSeek (same as company name)
- **Consumer brand**: DeepSeek (chatbot + API)
- **Enterprise API**: DeepSeek API (direct, not through a cloud platform)
- **Open source strategy**: Core strategy — models are intentionally open-sourced as part of company vision. "For us, open source is intentional, not forced." Strongest models released as open weights (same as production, not watered down). MIT license.
- **Commercial model**: API priced at 10-month hardware cost recovery (~6x profit margin). Enterprise hosting available but not the focus.

## Platform Context

> **For China AI News content**: DeepSeek is our most-covered company. Key narrative angles: open-source ethos, restraint as strategy, AGI vision, pricing disruption ($0.14/M tokens vs $3.00/M for Claude), and the US-China compute gap. Liang Wenfeng's investor meeting (May 2026) is our primary source — see `docs/refs/source-materials/deepseek-liang-investor-meeting-research.md`.

## Model Releases

| Date | Model | Type | Key Metrics | Source |
|------|-------|------|-------------|--------|
| 2024 | DeepSeek-V3 | LLM (671B total, 37B active MoE) | Flagship reasoning model. Trained on Nvidia chips without CUDA ecosystem (using TileLang). | [Hugging Face](https://huggingface.co/deepseek-ai) |
| 2024 | DeepSeek-Coder | Code-specialized LLM | 16K context, $0.07/$0.14 per 1M tokens | [DeepSeek API](https://www.deepseek.com/) |
| Jan 2025 | **DeepSeek-R1** | Reasoning model | Strong reasoning at remarkably low reported training costs. Shocked Silicon Valley. | [Wikipedia](https://en.wikipedia.org/wiki/DeepSeek) |
| 2026 | DeepSeek-V3.2 Flash | Fast inference LLM | 64K context, $0.01/$0.02 per 1M tokens. Price cut to 1/4 of original — team cheered. | [DeepSeek API](https://www.deepseek.com/) |
| Jul 31, 2026 | **DeepSeek-V4-Flash** | LLM | Official version launched. Price increase announced same day as Zhang Yiming's anti-distillation statement. | [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502) |
| ~End of 2026 (optimistic) | Next-gen (150-250B activation) | LLM | Targeting frontier-level performance. Training may start end of 2026. | Investor meeting transcript |

## Funding History

| Date | Round | Amount | Valuation | Investors | Source |
|------|-------|--------|-----------|-----------|--------|
| Jul 2023 | Founding | N/A (self-funded by High-Flyer) | No external valuation | High-Flyer Quant (幻方量化) | [Wikipedia](https://en.wikipedia.org/wiki/DeepSeek) |
| Apr 2026 | Fundraising launched | Target ~$10B | Pure RMB structure. Min commitment 5B RMB/fund (later 1.5B). | Whitelist funds | [elsewhere](https://elsewhere.news/en/elsewhere/deepseek) + [The Information](https://theinformation.com) |
| May 2026 | Valuation jump | — | Target ~$45B (up from $10B) | 4-hour investor meeting via Tencent Meeting | [The Silicon Review](https://thesiliconreview.com) + [elsewhere](https://elsewhere.news/en/elsewhere) |
| Jun 2026 | **First external round closed** | ~$7.4B (~50B RMB) | Post-money ~$50B | Monolith (3B RMB), IDG Capital (3B RMB), CATL ecosystem (Puquan Capital), Loyal Valley Capital, Guozhi Investment (980M RMB), ~100 institutions total. Hillhouse/HSG absent. | [elsewhere](https://elsewhere.news/en/elsewhere/deepseek) + [TechStartups](https://techstartups.com) |
| Jul 14, 2026 | Round 2 target | — | Pre-money ~$71B (+42%) | TBD | [Financial Times](https://ft.com) + [Cryptonomist](https://en.cryptonomist.ch/2026/07/14/deepseek-new-funding/) |
| Jul 25, 2026 | **Round 2 paused** | — | $71B target (paused) | — | [Bloomberg](https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/) (Haze Fan & Pei Li) |

**Liang's key funding requirement**: "Don't poach DeepSeek's people." Team stability is the #1 non-negotiable.

## Key People

| Name | Role | Notes | Source |
|------|------|-------|--------|
| **Liang Wenfeng (梁文锋)** | Founder & CEO | Also CEO of High-Flyer Quant. No KPIs, no org chart philosophy. Vision-driven management. | Investor meeting transcript |
| Luo Fuli (罗福莉) | V2 Core Contributor | Left for Xiaomi (Lei Jun, 10M+ RMB/yr, 2025) | Widget data — `src/components/widgets/deepseek/data/people.ts` |
| Wang Bingxuan (王炳宣) | First-gen LLM Core Author | Left for Tencent (H2 2025, est. 8-fig package) | Widget data |
| Guo Daya (郭达雅) | R1 Core Researcher / Coder / Math | Left for ByteDance Seed Team (Agent Lead, Mar 2026) | Widget data |
| Wei Haoran (魏浩然) | OCR Series Core Author | Left for Baidu (suspected, around CNY 2026) | Widget data |

> **Talent retention note**: Despite departures, Liang states turnover is historically low. First funding round significantly reduced retention risk via substantial employee equity. "As long as the team stays, we'll build AGI."

## Compute Infrastructure

- **Current GPUs**: ~20,000 H-equivalent Nvidia GPUs (most arrived in past 1-2 months as of May 2026)
- **Huawei 950 cards**: 16,000 allocated by Huawei (vs 100K+ for internet giants)
- **Huawei 950 vs Nvidia GB300**: 4:1 performance ratio, 2-year lag
- **Export restrictions**: Cannot purchase Nvidia B200/Blackwell. Uses H20 (export-compliant) and H-equivalent chips.
- **TileLang**: Custom high-level compiler language replacing CUDA. V3 trained on Nvidia chips without CUDA ecosystem. Efficiency loss vs CUDA: only 1-2%.
- **Next-gen compute target**: 50,000 GB300 (Nvidia) or 200,000 Huawei 950 needed for 800B activation model — currently unaffordable
- **Depreciation**: Nvidia cards ~5 years; Huawei cards ~3 years

## Notable Events

- **Jan 2025**: DeepSeek-R1 released, shocking Silicon Valley with strong reasoning at low training costs
- **Spring 2025**: DeepSeek goes viral (C-end user surge); chose not to monetize or lock in users
- **Feb 2026**: Named in Anthropic's distillation blog post (~24,000 accounts, 150K+ exchanges targeted at reasoning, rubric-based grading)
- **May 20, 2026**: Legendary 4-hour investor meeting — Liang's vision, strategy, and AGI roadmap revealed
- **Jun 2026**: First external funding round closed (~$7.4B at ~$50B)
- **Jul 25, 2026**: Second round paused after Liang's leaked remarks went viral (sensitive Nvidia content)
- **Jul 31, 2026**: V4-Flash official version launched; API price increase announced
- **Aug 6, 2026**: Same day as Zhang Yiming's anti-distillation statement — DeepSeek announced price increase

## Strategic Philosophy

> "Vision isn't a slogan on the wall. Vision is how you actually do things, not what you say." — Liang Wenfeng

- **No KPIs, no org chart** — managed entirely by shared vision
- **Restraint as strategy** — not chasing C-end traffic, not maximizing profit, not competing with internet giants
- **AGI is the goal** — C-end and B-end are byproducts
- **10-month pricing rule** — recover hardware costs in 10 months, ~6x profit
- **Open source as moat** — by not trying to own everything, reduce resistance to adoption
- **Team stability as core interest** — "the only non-negotiable"
- **US-China gap**: "2 years behind, using 1/20th of their compute" — but talent is not the bottleneck; resources are

## Sources

- [Wikipedia — DeepSeek](https://en.wikipedia.org/wiki/DeepSeek)
- [DeepSeek Investor Meeting Transcript](https://inside-china-ai.com/posts/deepseek-art-of-restraint/) — May 20, 2026
- [elsewhere — DeepSeek coverage](https://elsewhere.news/en/elsewhere/deepseek)
- [Financial Times](https://ft.com) — Round 2 valuation
- [Bloomberg — Haze Fan & Pei Li](https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/) — Round 2 pause
- [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502) — V4-Flash + price increase
- [Anthropic Blog](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) — Distillation accusations
- Project articles: `articles/deepseek-art-of-restraint.md`
- Project research: `docs/refs/source-materials/deepseek-liang-investor-meeting-research.md`
- Widget data: `src/components/widgets/deepseek/`
