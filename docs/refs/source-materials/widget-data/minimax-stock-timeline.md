# Widget Data: minimax-stock-timeline

> Exported from `src/components/widgets/distillation/data/minimax-stock.ts`
> Widget type: 股价时间线（stock price timeline）— MiniMax 上市后股价暴跌轨迹
> Last updated: 2026-08-06 (git: 2026-08-06 11:23:25 +0800)
> View component: `src/components/widgets/distillation/minimax-stock-view.tsx` → `MinimaxStockView`

## Data

### Stock Price Points (6 events)

| Date          | Short Date | Price (HK$) | Event                        | Detail                                                                                                                                                                     | Source           | Highlight? |
| ------------- | ---------- | ----------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| Feb 2026      | Feb        | —           | Accused by Anthropic         | MiniMax accused of 13M+ exchanges with Claude — the largest distillation volume among the three named labs.                                                                | Anthropic Blog   |            |
| Mar 2026      | Mar        | 1,330       | Peak Stock Price             | MiniMax Group Inc (HKEX: 0100.HK) reached its all-time high of HK$1,330, riding the AI boom.                                                                               | Google Finance   | ✅         |
| Jul 9, 2026   | Jul 9      | 1,090       | Lock-up Expiry → 18% Drop    | Lock-up expiry released ~153M shares (~48.9% of capital), triggering an 18% single-day drop. Beginning of accelerated decline.                                             | HKEX filings     | ✅         |
| Jul 2026      | Jul        | 600         | M3 Price Cut + Capital Raise | M3 model permanently cut price within a week of launch. Emergency HK$16B capital raise conducted amid the stock collapse.                                                  | Industry reports |            |
| Late Jul 2026 | Jul 28     | 186         | Stock Hits Low — 86% Decline | MiniMax stock fell to ~HK$186, a decline of over 80% from peak. Drivers: distillation accusations, M3 price cut, low margins, new AI companion regulations, annual losses. | Google Finance   | ✅         |
| Aug 3, 2026   | Aug 3      | 247         | Partial Recovery             | Stock partially recovered to ~HK$247, but remained 81% below peak. Moonshot IPO preparations continued to pressure the stock.                                              | Google Finance   |            |

### Summary Cards (4 metrics)

| Value    | Label           |
| -------- | --------------- |
| HK$1,330 | Peak (Mar)      |
| HK$186   | Low (Jul)       |
| -86%     | Peak Decline    |
| HK$16B   | Emergency Raise |

## Sources

Each data point has explicit `url` field:

- https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks — Anthropic Blog (distillation accusations)
- https://www.google.com/finance/quote/0100:HKG — Google Finance (stock prices, multiple references)
- HKEX filings — Lock-up expiry data
- Industry reports — M3 price cut and capital raise

## Related Articles

- Embedded in `china-llm-distillation-storm` via `<!-- widget:minimax-stock-timeline -->`
