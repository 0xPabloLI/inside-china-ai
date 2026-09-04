# Widget Data: deepseek-api-pricing

> Exported from `src/components/widgets/deepseek-api-pricing/data/pricing.ts`
> Widget type: API 价格对比（API price comparison）— DeepSeek V4 时代 API 定价 vs 竞品
> Last updated: 2026-08-07 (git: 2026-08-07 23:28:14 +0800)
> View component: `src/components/widgets/deepseek-api-pricing/api-pricing-view.tsx` → `APIPricingView`

## Data

### DeepSeek Pricing (3 models)

| Model    | Input (¥/M tokens) | Output (¥/M tokens) | Context | Tier            | Source                |
| -------- | ------------------ | ------------------- | ------- | --------------- | --------------------- |
| V4-Pro   | 3                  | 6                   | 1M      | 旗舰 / Flagship | api-docs.deepseek.com |
| V4-Flash | 1                  | 2                   | 1M      | 专业 / Pro      | api-docs.deepseek.com |

> Note: Prices in RMB (¥) for domestic models, USD ($) for overseas models.

### Full Market Comparison (12 vendors, 24 models)

#### Domestic (RMB)

| Vendor           | Model               | Input (¥/M) | Output (¥/M) | Context | Tier     | Source                |
| ---------------- | ------------------- | ----------- | ------------ | ------- | -------- | --------------------- |
| DeepSeek         | V4-Pro              | 3           | 6            | 1M      | Flagship | api-docs.deepseek.com |
| DeepSeek         | V4-Flash            | 1           | 2            | 1M      | Pro      | api-docs.deepseek.com |
| Zhipu AI         | GLM-5.2             | 8           | 28           | 1M      | Flagship | open.bigmodel.cn      |
| Zhipu AI         | GLM-5.1             | 6           | 24           | 128K    | Pro      | open.bigmodel.cn      |
| Kimi (Moonshot)  | K3                  | 20          | 100          | 1M      | Flagship | platform.kimi.com     |
| Kimi (Moonshot)  | K2.7 Code           | 6.5         | 27           | 256K    | Pro      | platform.kimi.com     |
| Xiaomi MiMo      | MiMo-V2.5-Pro       | 3           | 6            | 1M      | Flagship | mimo.mi.com           |
| Xiaomi MiMo      | MiMo-V2.5           | 1           | 2            | 1M      | Pro      | mimo.mi.com           |
| MiniMax          | M3                  | 4.2         | 16.8         | 512K    | Flagship | platform.minimaxi.com |
| MiniMax          | M2.7                | 2.1         | 8.4          | 245K    | Pro      | platform.minimaxi.com |
| Qwen (Alibaba)   | Qwen3.7-Max         | 12          | 36           | 1M      | Flagship | help.aliyun.com       |
| Qwen (Alibaba)   | Qwen3.6-Max-Preview | 9           | 54           | 256K    | Pro      | help.aliyun.com       |
| Tencent Hunyuan  | Hunyuan-role-latest | 2.4         | 9.6          | 256K    | Flagship | cloud.tencent.com     |
| Tencent Hunyuan  | Hunyuan-a13b        | 0.5         | 2.0          | 256K    | Pro      | cloud.tencent.com     |
| ByteDance Doubao | Seed-Evolving       | 6           | 30           | 256K    | Flagship | volcengine.com        |
| ByteDance Doubao | Seed-2.1-Turbo      | 3           | 15           | 128K    | Pro      | volcengine.com        |

#### Overseas (USD)

| Vendor        | Model                  | Input ($/M) | Output ($/M) | Context | Tier     | Source              |
| ------------- | ---------------------- | ----------- | ------------ | ------- | -------- | ------------------- |
| OpenAI        | GPT-5.6-Sol            | 5           | 30           | 1M      | Flagship | platform.openai.com |
| OpenAI        | GPT-5.6-Terra          | 2.5         | 15           | 1M      | Pro      | platform.openai.com |
| Anthropic     | Claude Fable 5         | 10          | 50           | 1M      | Flagship | docs.anthropic.com  |
| Anthropic     | Claude Opus 5          | 5           | 25           | 1M      | Pro      | docs.anthropic.com  |
| Google Gemini | Gemini 3.1 Pro Preview | 2           | 12           | 1M      | Flagship | ai.google.dev       |
| Google Gemini | Gemini 2.5 Pro         | 1.25        | 10           | 1M      | Pro      | ai.google.dev       |
| xAI (Grok)    | Grok 4.5               | 2           | 6            | 500K    | Flagship | docs.x.ai           |
| xAI (Grok)    | Grok 4.3               | 1.25        | 2.5          | 1M      | Pro      | docs.x.ai           |

## Sources

Each model entry has explicit `sourceUrl` and `sourceName` fields in the data:

- https://api-docs.deepseek.com/zh-cn/quick_start/pricing — DeepSeek
- https://open.bigmodel.cn/pricing — Zhipu AI
- https://platform.kimi.com/docs/pricing/chat-k3 — Kimi K3
- https://platform.kimi.com/docs/pricing/chat-k27-code — Kimi K2.7 Code
- https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go — Xiaomi MiMo
- https://platform.minimaxi.com/docs/guides/pricing-paygo — MiniMax
- https://help.aliyun.com/zh/model-studio/model-pricing — Alibaba Qwen
- https://cloud.tencent.com/document/product/1729/97731 — Tencent Hunyuan
- https://www.volcengine.com/docs/82379/1099320 — ByteDance Doubao
- https://platform.openai.com/docs/pricing — OpenAI
- https://docs.anthropic.com/en/docs/about-claude/pricing — Anthropic
- https://ai.google.dev/pricing — Google Gemini
- https://docs.x.ai/developers/pricing — xAI Grok

## Related Articles

- Embedded in `deepseek-art-of-restraint` via `<!-- widget:deepseek-api-pricing -->`
