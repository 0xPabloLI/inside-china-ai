# Widget Data: deepseek-pricing

> Exported from `src/components/widgets/deepseek/data/pricing.ts`
> Widget type: API 价格对比（price comparison matrix）— DeepSeek vs 竞品 API 定价
> Last updated: 2026-07-28 (git: 2026-07-28 18:53:54 +0800)
> View component: `src/components/widgets/deepseek/pricing-view.tsx` → `PricingView`

## Data

### DeepSeek Pricing (3 models)

| Model               | Input ($/M tokens) | Output ($/M tokens) | Context | Notes                          |
| ------------------- | ------------------ | ------------------- | ------- | ------------------------------ |
| DeepSeek-V3         | 0.14               | 0.28                | 128K    | Flagship reasoning model       |
| DeepSeek-Coder      | 0.07               | 0.14                | 16K     | Code-specialized model         |
| DeepSeek-V3.2 Flash | 0.01               | 0.02                | 64K     | Fast inference, cost-optimized |

### Competitor Pricing (4 vendors, 6 models)

| Vendor             | Model             | Input ($/M tokens) | Output ($/M tokens) | Context | Notes                   |
| ------------------ | ----------------- | ------------------ | ------------------- | ------- | ----------------------- |
| OpenAI             | GPT-4o            | 2.50               | 10.00               | 128K    | Frontier model          |
| OpenAI             | GPT-4o-mini       | 0.15               | 0.60                | 128K    | Cost-optimized          |
| Anthropic          | Claude 3.5 Sonnet | 3.00               | 15.00               | 200K    | Balanced performance    |
| Anthropic          | Claude 3 Haiku    | 0.25               | 1.25                | 200K    | Fast, low-cost          |
| Moonshot AI (Kimi) | Kimi K3           | 0.12               | 0.24                | 1M      | Long-context specialist |
| Alibaba (Qwen)     | Qwen2.5-72B       | 0.08               | 0.16                | 32K     | Open-source available   |

### Price Comparison Highlights

- DeepSeek V3 input ($0.14) is **18x cheaper** than GPT-4o ($2.50) and **21x cheaper** than Claude 3.5 Sonnet ($3.00).
- DeepSeek V3.2 Flash ($0.01 input) is the cheapest model in the comparison.
- Only Kimi K3 ($0.12) approaches DeepSeek V3's pricing among competitors.

## Sources

- No explicit `sourceUrl` field in data.
- Pricing data sourced from official API pricing pages:
  - DeepSeek: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
  - OpenAI: https://platform.openai.com/docs/pricing
  - Anthropic: https://docs.anthropic.com/en/docs/about-claude/pricing
  - Moonshot: https://platform.kimi.com/docs/pricing/chat-k3
  - Alibaba: https://help.aliyun.com/zh/model-studio/model-pricing

> ⚠️ **Note**: This widget predates the `deepseek-api-pricing` widget (which has more current model versions). Both are retained — this one covers the original V3-era pricing, `deepseek-api-pricing` covers V4-era pricing.

## Related Articles

- Not embedded in any published article via `<!-- widget:deepseek-pricing -->`.
- Content relates to `deepseek-art-of-restraint` (DeepSeek pricing strategy section).
