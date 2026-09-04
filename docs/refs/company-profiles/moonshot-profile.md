# Company Profile: Moonshot AI (Kimi)

> Last updated: 2026-08-08

## Basic Info

- **Full name**: Moonshot AI (月之暗面)
- **Founded**: 2023
- **Founder**: Yang Zhilin (杨植麟)
- **Type**: AI Startup (one of China's 6 "AI Tigers")
- **Headquarters**: Beijing, China
- **Valuation**: $35B post-money (July 2026); $50B IPO target (reported)
- **Employees**: ~500-1000 (estimated)

## AI Division

- **Team name**: Moonshot AI (same as company)
- **Consumer brand**: **Kimi** (AI chatbot, long-context specialist)
- **Enterprise API**: Kimi API ($0.12/$0.24 per 1M tokens for K3)
- **Open source strategy**: Selective — K3 open-sourced after a closed-source period. Full open weights published July 27, 2026.
- **Commercial model**: C-end app (Kimi chatbot) + API + enterprise solutions

## Model Releases

| Date         | Model       | Type                        | Key Metrics                                                                                     | Source                                                                                                        |
| ------------ | ----------- | --------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 2023-2024    | Kimi K1.x   | LLM                         | Long-context pioneer (200K-2M tokens)                                                           | [Business Insider](https://www.businessinsider.com/who-is-yang-zhilin-ceo-founder-moonshot-ai-kimi-k3-2026-7) |
| 2025         | Kimi K2.x   | LLM                         | Improved reasoning, RL sandbox (AgentENV)                                                       | Various                                                                                                       |
| Jul 16, 2026 | **Kimi K3** | LLM (2.8T MoE, ~50B active) | 896 experts (16 active + 2 shared), 1M context, multimodal via MoonViT-V2. Open weights Jul 27. | [Hugging Face](https://huggingface.co/blog/ResterChed/kimi-k3-model-overview)                                 |

### K3 Architecture Innovations

| Technology                    | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| Kimi Delta Attention (KDA)    | Hybrid linear attention; ~2.5x decoding speedup at 1M context |
| Attention Residuals (AttnRes) | Layers can retrieve representations from any earlier layer    |
| Quantile Balancing            | Expert assignment from router-score quantiles                 |
| Per-Head Muon                 | Independent optimization per attention head                   |

### K3 Benchmark Performance

| Metric                    | K3    | K2.6 | Claude | Notes                                  |
| ------------------------- | ----- | ---- | ------ | -------------------------------------- |
| Accuracy (AA-Omniscience) | 46%   | 33%  | 72%    | Improved but far behind Claude         |
| Hallucination Rate        | 51%   | 39%  | 14%    | **Worse** than K2.6                    |
| Arena Frontend Code Rank  | #1    | #18  | #2     | Jumped 17 places                       |
| Coding (SWE-bench)        | 51.5% | 40%  | 69%    | Trails Claude by ~18 pts               |
| Security Testing          | 30%   | 35%  | 85%    | "Significantly below" US rivals (SCMP) |

Source: [Artificial Analysis](https://artificialanalysis.ai/articles/kimi-k3-achieves-3-in-the-artificial-analysis-intelligence-index-comparable-to-opus-4-8-and-gpt-5-5), [SCMP](https://www.scmp.com/tech/tech-war/article/3361711/chinas-kimi-k3-significantly-below-us-rivals-hacking-power-uk-us-study-shows)

## Funding History

| Date          | Round           | Amount | Valuation       | Investors                                                             | Source                                               |
| ------------- | --------------- | ------ | --------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| 2023-2024     | Early rounds    | —      | —               | Alibaba, Sequoia China, ZhenFund,红杉中国                             | Industry reports                                     |
| Jul 29, 2026  | **$3.5B raise** | $3.5B  | $35B post-money | Bloomberg reported; Alibaba reportedly backing with ~20K Nvidia chips | [Bloomberg](https://www.bloomberg.com/technology-ai) |
| Late Jul 2026 | IPO target      | —      | $50B target     | KrASIA reported Hong Kong IPO targeting $50B                          | [KrASIA](https://kr-asia.com)                        |
| Aug 3, 2026   | **IPO denied**  | —      | —               | Moonshot denied plans to file for IPO in August                       | [The Standard (HK)](https://www.thestandard.com.hk)  |

## Key People

| Name                     | Role          | Notes                                            | Source                                                                                                        |
| ------------------------ | ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Yang Zhilin (杨植麟)** | Founder & CEO | Leads RL and agentic capabilities. PhD from CMU. | [Business Insider](https://www.businessinsider.com/who-is-yang-zhilin-ceo-founder-moonshot-ai-kimi-k3-2026-7) |

## Compute Infrastructure

- **Chips**: ~20,000 Nvidia chips (reportedly backed by Alibaba with chip access)
- **Export restrictions**: Subject to US export controls; specific chip models not disclosed
- **GPU capacity crisis**: K3 launch demand pushed GPU capacity to limit — subscriptions suspended within 48 hours

## Notable Events

- **Feb 2026**: Accused by Anthropic of 3.4M+ exchanges with Claude (targeted: agentic reasoning, tool use, coding, data analysis). **Never publicly responded.**
- **Jul 16, 2026**: K3 released — 2.8T MoE, 1M context
- **Jul 20, 2026**: Subscriptions suspended within 48 hours (GPU capacity overwhelmed)
- **Jul 22, 2026**: White House official publicly accused K3 of "cloning US tech" — Microsoft and Nvidia CEOs subsequently backed Moonshot
- **Jul 24, 2026**: SCMP reported K3 "significantly below" US rivals in security testing
- **Jul 27, 2026**: K3 open weights published
- **Jul 29, 2026**: $3.5B funding round closed at $35B valuation
- **Aug 3, 2026**: Denied August IPO filing plans

### Identity Bleed Controversy

K3 was reported to identify itself as "I'm Claude, an AI assistant created by Anthropic" in approximately 15% of interactions. GLM 5.2 exhibited similar behavior. The technical community split on interpretation — some called it normal training data leakage, others viewed it as indirect evidence of distillation.

Source: [Hacker News](https://news.ycombinator.com/item?id=49076001), [LessWrong](https://www.lesswrong.com/posts/dQyKzHaGqvdqpekJr/does-distilling-claude-carry-the-persona-with-it)

## Sources

- [Wikipedia — Moonshot AI](https://en.wikipedia.org/wiki/Moonshot_AI)
- [Bloomberg](https://www.bloomberg.com/technology-ai) — $35B funding round
- [Hugging Face — K3 Model Overview](https://huggingface.co/blog/ResterChed/kimi-k3-model-overview) — Architecture specs
- [AP News](https://apnews.com/article/kimi-k3-china-ai-model) — Subscription suspension
- [PCMag](https://www.pcmag.com/news/white-house-chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech) — White House accusation
- [SCMP](https://www.scmp.com/tech/tech-war/article/3361711/chinas-kimi-k3-significantly-below-us-rivals-hacking-power-uk-us-study-shows) — Security testing
- [Artificial Analysis](https://artificialanalysis.ai/articles/kimi-k3-achieves-3-in-the-artificial-analysis-intelligence-index-comparable-to-opus-4-8-and-gpt-5-5) — Hallucination rate
- [Business Insider](https://www.businessinsider.com/who-is-yang-zhilin-ceo-founder-moonshot-ai-kimi-k3-2026-7) — CEO profile
- [The Standard (HK)](https://www.thestandard.com.hk) — IPO denial
- Project article: `articles/china-llm-distillation-scandal.md`
- Widget data: `src/components/widgets/distillation/data/moonshot-funding.ts`, `src/components/widgets/distillation/data/benchmarks.ts`
