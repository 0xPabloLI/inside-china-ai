# Company Profile: Alibaba (Qwen)

> Last updated: 2026-08-08

## Basic Info

- **Full name**: Alibaba Group Holding Limited (阿里巴巴集团控股有限公司)
- **Founded**: June 28, 1999
- **Founder**: Jack Ma (马云)
- **Type**: Tech Giant (e-commerce, cloud, AI)
- **Headquarters**: Hangzhou, Zhejiang
- **Listing**: NYSE: BABA / HKEX: 9988
- **Employees**: ~200,000+

## AI Division

- **Team name**: Qwen Team (under Alibaba Cloud)
- **Consumer brand**: **通义千问** (Tongyi Qianwen / Qwen)
- **Enterprise API**: Alibaba Cloud (Bailian / 百炼 platform)
- **Open source strategy**: Hybrid — tiered releases. Many Qwen models distributed under Apache License (free and open-source) or Qwen License (source-available). Larger models may have gated access. Some proprietary models served through Alibaba Cloud only.
- **Commercial model**: API + cloud integration + enterprise solutions. Qwen2.5-72B API: $0.08/$0.16 per 1M tokens.

## Model Releases

| Date | Model | Type | Key Details | Source |
|------|-------|------|-------------|--------|
| 2023 | Qwen-1.x | LLM | Initial release, open-source | [Wikipedia](https://en.wikipedia.org/wiki/Qwen) |
| 2024 | Qwen2 / Qwen2.5 | LLM family | Up to 72B parameters. Open weights (Apache 2.0). Qwen2.5-72B: $0.08/$0.16 per 1M tokens. | [Alibaba Cloud](https://www.alibabacloud.com/) |
| 2024 | Qwen2-VL | Vision-language | Multimodal model | [Hugging Face](https://huggingface.co/Qwen) |
| 2025 | Qwen2.5-Max | LLM | Proprietary, API-only, MoE architecture | [Alibaba Cloud](https://www.alibabacloud.com/) |
| 2026 | Qwen3 | LLM | Next-generation (anticipated) | Industry reports |

## Funding History

Alibaba is publicly listed. AI division funded internally.

| Date | Event | Notes |
|------|-------|-------|
| Sep 2014 | NYSE IPO | Largest US IPO at the time ($25B) |
| Nov 2019 | HKEX secondary listing | — |
| 2023-2026 | AI investment | Internal funding for Qwen team; cloud infrastructure investment |

## Key People

| Name | Role | Notes | Source |
|------|------|-------|--------|
| **Jack Ma (马云)** | Founder |stepped back from operational roles; returned to public life in 2023-2024 |
| Eddie Wu (吴泳铭) | CEO (Alibaba Group) | Took over as CEO in 2023 | Industry reports |
| **Qwen Team** | AI research | Based within Alibaba Cloud | [Wikipedia](https://en.wikipedia.org/wiki/Qwen) |

## Compute Infrastructure

- **Chips**: Large-scale Nvidia GPU clusters (exact numbers not disclosed)
- **Export restrictions**: Subject to US export controls; reportedly has access to ~20K Nvidia chips (as Moonshot backer)
- **Cloud**: Alibaba Cloud — China's largest cloud provider by market share
- **Domestic chips**: Exploring Huawei Ascend as alternative (industry reports)

## Notable Events

- **Jun 2026**: BBC reported Anthropic separately accused Alibaba of using fraudulent accounts to access Claude data — a separate accusation from the February charges against DeepSeek, Moonshot, and MiniMax
- **Jul 2026**: Reportedly backing Moonshot AI with ~20,000 Nvidia chips for Kimi K3 training
- **Jul 21, 2026**: Treasury Secretary Bessent threatened sanctions against Chinese AI companies — Alibaba potentially affected
- **Distillation allegations**: Insider account (Reddit r/LocalLLM) claimed Qwen was simultaneously distilling both Claude and GPT; ❌ Unverified

### Distillation Controversy Role

- NOT named in Anthropic's February 2026 blog post (unlike DeepSeek, Moonshot, MiniMax)
- Separately accused by Anthropic in June 2026 (BBC report) — using fraudulent accounts to access Claude
- The Information reported Tencent employees used Claude; Alibaba was a later, separate case
- Insider account claims Qwen absorbed former Kimi RL team members — ❌ Unverified

## Open Source Impact

Qwen is one of the most popular open-source LLM families globally:
- Apache 2.0 license for many models
- Active Hugging Face community
- Widely used by third-party developers
- Considered a benchmark for Chinese open-source AI

Source: [Wikipedia — Qwen](https://en.wikipedia.org/wiki/Qwen)

## Sources

- [Wikipedia — Alibaba Group](https://en.wikipedia.org/wiki/Alibaba_Group)
- [Wikipedia — Qwen](https://en.wikipedia.org/wiki/Qwen)
- [BBC](https://www.bbc.com/news/articles/c5ye2gyz0x4o) — Anthropic accusation
- [Anthropic Blog](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) — Distillation (Alibaba not in original Feb post)
- Project article: `articles/china-llm-distillation-scandal.md`
- Widget data: `src/components/widgets/deepseek-oss-comparison/data/companies.ts`, `src/components/widgets/deepseek-api-pricing/data/pricing.ts`, `src/components/widgets/distillation/data/news-events.ts`
