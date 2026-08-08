# Widget Data: distillation-news-coverage

> Exported from `src/components/widgets/distillation/data/news-events.ts`
> Widget type: 事件矩阵（event matrix）— 中国 AI 蒸馏争端新闻事件时间线
> Last updated: 2026-08-07 (git: 2026-08-07 23:28:14 +0800)
> View component: `src/components/widgets/distillation/news-coverage-view.tsx` → `NewsCoverageView`

## Data

### Companies Tracked (6)

| Company | Short Name |
|---------|-----------|
| DeepSeek | DeepSeek |
| Moonshot AI (Kimi) | Moonshot |
| MiniMax | MiniMax |
| Alibaba (Qwen) | Alibaba |
| Tencent (Hunyuan) | Tencent |
| ByteDance (Seed) | ByteDance |

### Months Covered

Feb, Mar, Apr, May, Jun, Jul, Aug (7 months, Feb–Aug 2026)

### Event Types

| Type | Label | Color |
|------|-------|-------|
| accusation | Accusation | var(--color-danger) |
| product | Product Launch | var(--color-brand) |
| funding | Funding / IPO | var(--color-success) |
| political | Political | #a855f7 |
| technical | Technical | var(--color-warning) |

### News Events (18 events)

| # | Company | Month | Type | Headline | Detail | Source | URL |
|---|---------|-------|------|----------|--------|--------|-----|
| 1 | DeepSeek | Feb | accusation | Named in Anthropic's distillation blog post | ~24,000 accounts, 16M+ exchanges across coding, reasoning, and tool use. | Anthropic Blog | [link](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) |
| 2 | Moonshot | Feb | accusation | Accused of 3.4M+ exchanges with Claude | Targeted: agentic reasoning, tool use, coding, data analysis. | Anthropic Blog | [link](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) |
| 3 | MiniMax | Feb | accusation | Largest distillation volume: 13M+ exchanges | Largest distillation volume among the three named labs. | Anthropic Blog | [link](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) |
| 4 | MiniMax | Mar | funding | Stock peaks at HK$1,330 | MiniMax Group Inc (HKEX: 0100.HK) reached its all-time high. | Google Finance | [link](https://www.google.com/finance/quote/0100:HKG) |
| 5 | Tencent | Apr | accusation | Leaked records show Claude usage for fine-tuning | The Information reported Tencent employees used Claude to evaluate and fine-tune internal models. | The Information | [link](https://theinformation.com) |
| 6 | Alibaba | Jun | accusation | Accused of using fraudulent accounts | BBC reported Anthropic separately accused Alibaba of using fraudulent accounts to access Claude data. | BBC | [link](https://www.bbc.com) |
| 7 | Moonshot | Jul | product | Kimi K3 released — 2.8T MoE, 1M context | Full open weights published July 27. | Hugging Face | [link](https://huggingface.co/blog/ResterChed/kimi-k3-model-overview) |
| 8 | Moonshot | Jul | product | Subscriptions suspended within 48 hours | Overwhelming demand pushed GPU capacity to the limit. | AP News | [link](https://apnews.com/article/kimi-k3-china-ai-model) |
| 9 | Moonshot | Jul | funding | $3.5B raise at $35B valuation | Bloomberg reported Moonshot AI closed a $3.5B funding round at $35B post-money. | Bloomberg | [link](https://www.bloomberg.com) |
| 10 | Moonshot | Jul | political | White House: 'cloning US tech' | A White House official publicly accused Kimi K3 of 'cloning US tech.' Microsoft and Nvidia CEOs subsequently backed Moonshot. | PCMag | [link](https://www.pcmag.com/news/chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech) |
| 11 | Moonshot | Jul | technical | K3 identifies as Claude in ~15% of tests | Hacker News user ataoz posted results showing K3 responds 'I'm Claude, an AI assistant created by Anthropic.' | Hacker News | [link](https://news.ycombinator.com/item?id=49076001) |
| 12 | MiniMax | Jul | funding | Stock crashes 80%+ from peak | MiniMax stock fell to ~HK$186. Emergency HK$16B capital raise conducted amid the collapse. | Google Finance | [link](https://www.google.com/finance/quote/0100:HKG) |
| 13 | Moonshot | Aug | funding | Denies August IPO filing; targets $50B | The Standard (HK) reported Moonshot denied plans to file for IPO in August. Earlier reports suggested $50B target. | The Standard (HK) | [link](https://www.thestandard.com.hk) |
| 14 | MiniMax | Aug | funding | Partial recovery to ~HK$247 | Stock partially recovered but remained 81% below peak. Moonshot IPO preparations continued to pressure the stock. | Google Finance | [link](https://www.google.com/finance/quote/0100:HKG) |
| 15 | Moonshot | Jul | political | Bessent threatens sanctions over AI 'theft' | US Treasury Secretary Scott Bessent warned Chinese AI companies could face financial sanctions. 'Open source AI is not open season on American AI.' | CNBC | [link](https://www.cnbc.com/2026/07/21/bessent-china-ai-sanctions.html) |
| 16 | Moonshot | Jul | political | China accuses US of 'AI hegemonism' | Beijing accused Washington of 'AI hegemonism' and threatened countermeasures, escalating the dispute into a diplomatic confrontation. | Reuters | [link](https://www.reuters.com/world/china/china-accuses-us-ai-hegemonism-threatens-countermeasures-over-potential-probes-2026-07-27/) |
| 17 | ByteDance | Aug | political | Zhang Yiming: 'No distillation, even if behind' | ByteDance founder told Seed team to pursue 'long-termism' over distillation. Internal policy dates to 2023. | The Paper / Pekingnology | [link](https://m.thepaper.cn/newsDetail_forward_33732502) |
| 18 | ByteDance | Aug | technical | Not accused by Anthropic — clean record | Unlike 5 other companies, ByteDance was NOT named in Anthropic's accusations. Anti-distillation policy enforced since 2023. | Anthropic Blog | [link](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) |

### Event Distribution by Company

| Company | Accusation | Product | Funding | Political | Technical | Total |
|---------|-----------|---------|---------|-----------|-----------|-------|
| DeepSeek | 1 | — | — | — | — | 1 |
| Moonshot | 1 | 2 | 1 | 2 | 1 | 7 |
| MiniMax | 1 | — | 2 | — | — | 3 |
| Alibaba | 1 | — | — | — | — | 1 |
| Tencent | 1 | — | — | — | — | 1 |
| ByteDance | — | — | — | 1 | 1 | 2 |
| **Total** | **5** | **2** | **5** | **3** | **3** | **18** |

## Sources

Each event has explicit `url` field:

- https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks — Anthropic Blog (events 1, 2, 3, 18)
- https://www.google.com/finance/quote/0100:HKG — Google Finance / MiniMax stock (events 4, 12, 14)
- https://theinformation.com — The Information (event 5, Tencent fine-tuning)
- https://www.bbc.com — BBC (event 6, Alibaba accusation)
- https://huggingface.co/blog/ResterChed/kimi-k3-model-overview — Hugging Face (event 7, K3 release)
- https://apnews.com/article/kimi-k3-china-ai-model — AP News (event 8, subscription suspension)
- https://www.bloomberg.com — Bloomberg (event 9, $3.5B raise)
- https://www.pcmag.com/news/chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech — PCMag (event 10, White House)
- https://news.ycombinator.com/item?id=49076001 — Hacker News (event 11, identity bleed)
- https://www.thestandard.com.hk — The Standard HK (event 13, IPO denial)
- https://www.cnbc.com/2026/07/21/bessent-china-ai-sanctions.html — CNBC (event 15, Bessent sanctions threat)
- https://www.reuters.com/world/china/china-accuses-us-ai-hegemonism-threatens-countermeasures-over-potential-probes-2026-07-27/ — Reuters (event 16, China countermeasures)
- https://m.thepaper.cn/newsDetail_forward_33732502 — The Paper / Pekingnology (event 17, Zhang Yiming policy)

## Related Articles

- Embedded in `china-llm-distillation-storm` via `<!-- widget:distillation-news-coverage -->`
- Embedded in `bytedance-zhang-yiming-no-distillation` via `<!-- widget:distillation-news-coverage -->`
