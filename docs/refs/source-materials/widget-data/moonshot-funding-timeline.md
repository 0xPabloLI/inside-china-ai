# Widget Data: moonshot-funding-timeline

> Exported from `src/components/widgets/distillation/data/moonshot-funding.ts`
> Widget type: 融资时间线（funding timeline）— Moonshot AI (Kimi) 融资与 IPO 进展
> Last updated: 2026-08-07 (git: 2026-08-07 09:10:11 +0800)
> View component: `src/components/widgets/distillation/moonshot-funding-view.tsx` → `MoonshotFundingView`

## Data

### Funding Events (6 events)

| Date          | Short Date | Event                   | Valuation ($B) | Status    | Detail                                                                                                                  | Source            |
| ------------- | ---------- | ----------------------- | -------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Feb 2026      | Feb        | Accused by Anthropic    | —              | product   | Anthropic accused Moonshot of 3.4M+ exchanges with Claude. Moonshot never publicly responded.                           | Anthropic Blog    |
| Jul 16, 2026  | Jul 16     | Kimi K3 Released        | —              | product   | 2.8T-parameter sparse MoE with 1M-token context. Full open weights published July 27.                                   | Hugging Face      |
| Jul 20, 2026  | Jul 20     | Subscriptions Suspended | —              | product   | Overwhelming demand pushed GPU capacity to the limit. New subscriptions suspended within 48 hours.                      | AP News           |
| Jul 29, 2026  | Jul 29     | $3.5B Raised at $35B    | 35             | completed | Bloomberg reported Moonshot AI closed a $3.5B funding round at a $35B post-money valuation.                             | Bloomberg         |
| Late Jul 2026 | Jul 30     | IPO Target: $50B        | 50             | target    | KrASIA reported Moonshot targeting $50B valuation for Hong Kong IPO. Alibaba reportedly backing with ~20K Nvidia chips. | KrASIA            |
| Aug 3, 2026   | Aug 3      | Denied Aug IPO Filing   | —              | denied    | The Standard (HK) reported Moonshot denied plans to file for IPO in August, pushing back on earlier reporting.          | The Standard (HK) |

### Summary Cards (4 metrics)

| Value | Label                  |
| ----- | ---------------------- |
| $3.5B | Raised (Jul 29)        |
| $35B  | Post-money Valuation   |
| $50B  | IPO Target (Reported)  |
| ~20K  | Nvidia Chips (Alibaba) |

### Status Types

| Status    | Label     | Description                        |
| --------- | --------- | ---------------------------------- |
| completed | Closed    | Funding round closed               |
| target    | Target    | Reported target, not yet closed    |
| denied    | Denied    | Company denied the report          |
| product   | Milestone | Product-related event, not funding |

## Sources

Each data point has explicit `url` field:

- https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks — Anthropic Blog
- https://huggingface.co/blog/ResterChed/kimi-k3-model-overview — Hugging Face (K3 model overview)
- https://apnews.com/article/kimi-k3-china-ai-model — AP News (subscription suspension)
- https://www.bloomberg.com — Bloomberg ($3.5B raise)
- https://kr-asia.com — KrASIA ($50B IPO target)
- https://www.thestandard.com.hk — The Standard (HK) (IPO denial)

## Related Articles

- Embedded in `china-llm-distillation-storm` via `<!-- widget:moonshot-funding-timeline -->`
