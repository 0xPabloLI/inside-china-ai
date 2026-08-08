# Company Profile: ByteDance (Seed / Doubao)

> Last updated: 2026-08-08

## Basic Info

- **Full name**: ByteDance Ltd. (incorporated in Cayman Islands; VIE structure)
- **Founded**: 2012
- **Founder**: Zhang Yiming (张一鸣)
- **Type**: Tech Giant (internet technology)
- **Headquarters**: Haidian, Beijing, China
- **Valuation**: ~$268B (secondary market, 2024 estimates; not publicly listed)
- **Employees**: ~150,000+ (estimated)
- **Key products**: TikTok, Douyin, Toutiao, CapCut, Lark

## Platform Context: TikTok Relationship

> **⚠️ For all China AI News content involving ByteDance**: ByteDance is the parent company of **TikTok** — the platform where China AI News publishes its short videos. This self-referential relationship (watching a ByteDance story on a ByteDance platform) is inherently interesting to our TikTok audience.
>
> **When to mention**: Any video or article about ByteDance's AI strategy (Seed, Doubao, distillation policy, Zhang Yiming) should briefly note the TikTok connection. Our audience discovers this content on TikTok, creating a "you're using the platform owned by the company you're watching about" moment.
>
> **How to frame**: Keep it factual — "ByteDance, the company behind TikTok..." or "ByteDance, which also owns TikTok..." — not sensationalist. The connection is particularly relevant when discussing:
> - ByteDance's regulatory scrutiny in the US (TikTok as the most scrutinized Chinese company in America)
> - The anti-distillation policy (The Information suggested the policy partly shields TikTok from regulatory heat; Guixinren contradicts this)
> - Doubao's 155M weekly active users (TikTok's global reach as distribution channel)
>
> **Brand system**: ByteDance does not have a fixed entity color in our `brand-system.md` entity color mapping. Use `--blue` (default tech/brand) or `--amber` (data highlight) for ByteDance visuals unless a specific semantic is needed.

## AI Division

- **Team name**: Seed (internal AI research division)
- **Other AI units**: Flow and Stone (as of Feb 2026)
- **Consumer brand**: **Doubao** (豆包) — China's #1 AI chatbot, 155 million weekly active users (Reuters, Feb 2026)
- **Enterprise API**: **Volcano Engine** (火山引擎) — ByteDance's cloud platform
- **Open source strategy**: Minimal — frontier models are **closed and API-only**. Smaller models released under "Seed-OSS" banner. Cannot be downloaded, self-hosted, or independently evaluated by the open-source community.
- **Commercial model**: Integrated into products (TikTok, Douyin); enterprise API via Volcano Engine; API pricing 73-84% cheaper than GPT-5.2

## Model Releases

| Date | Model | Type | Key Metrics | Source |
|------|-------|------|-------------|--------|
| May 2025 | Seed1.5-VL | Vision-language | 20B parameter multimodal with thinking capabilities | [GitHub](https://github.com/ByteDance-Seed/Seed1.5-VL) |
| Apr 2025 | Seed-Thinking-v1.5 | Reasoning model | Tech report published | [GitHub](https://github.com/ByteDance-Seed) |
| Apr 2025 | Seedream 3.0 | Image generation | Bilingual 2K text-to-image | [ThursdAI](https://thursdai.news/companies/bytedance) |
| Apr 2025 | Seaweed-7B | Video generation | 7B parameter foundation model | [ThursdAI](https://thursdai.news/companies/bytedance) |
| Dec 2025 | SeeDream 4.5 | Image generation | Multi-reference fusion | [ThursdAI](https://thursdai.news/companies/bytedance) |
| Feb 12, 2026 | **Seedance 2.0** | Video generation | Unified multimodal, 15s multi-shot clips, native stereo audio. ~80 ELO above next competitor on Arena. | [ThursdAI](https://thursdai.news/companies/bytedance) |
| Feb 14, 2026 | **Seed 2.0** (Doubao 2.0) | LLM family | Pro/Lite/Mini/Code variants. Released 2 days before Spring Festival Gala. | [Reuters](https://www.reuters.com/world/asia-pacific/chinas-bytedance-releases-doubao-20-ai-chatbot-2026-02-14/) |
| Jun 2026 | **Seed 2.1** (Doubao 2.1) | Agent-focused LLM | Shift from chatbot to general agent: multi-step workflows, project planning, end-to-end coding. | [ByteDance Seed](https://seed.bytedance.com/en/seed2_1) |
| Jul 8, 2026 | **Seedream 5.0 Pro** | Image generation | Precision editing, layer separation, 10+ language native text rendering. | [ThursdAI](https://thursdai.news/companies/bytedance) |

### Seed 2.0 Pro Benchmarks

| Benchmark | Score | Comparison |
|-----------|-------|------------|
| AIME 2025 | 98.3 | Competitive with GPT-5.2, Claude Opus 4.5 |
| AIME 2026 | 94.2 | — |
| Codeforces | 3020 | — |
| SWE-Bench Verified | 76.5% | **Trails Claude Opus 4.5 (80.9%)** |
| Terminal Bench 2.0 | 55.8 | **Trails GPT-5.2 (62.4)** |
| VideoMME | 89.5 | Surpasses human benchmark (73%) |
| LMSYS Chatbot Arena | 6th text, 3rd vision | — |

Source: [EvoLink](https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing)

### Seed 2.0 Pro Pricing (Feb 2026)

| Model | Input ($/1M tokens) | Output ($/1M tokens) |
|-------|---------------------|----------------------|
| Seed 2.0 Pro | $0.47 | $2.37 |
| Seed 2.0 Lite | $0.09 | $0.53 |
| Seed 2.0 Mini | $0.03 | $0.31 |
| GPT-5.2 High (comparison) | $1.75 | $14.00 |
| Claude Opus 4.5 (comparison) | $5.00 | $25.00 |

73-84% cheaper than GPT-5.2, ~10x cheaper than Claude Opus 4.5. Source: [EvoLink](https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing)

## Funding History

ByteDance is not publicly listed. Valuation estimates from secondary market transactions.

| Date | Event | Valuation | Source |
|------|-------|-----------|--------|
| 2012 | Founded by Zhang Yiming | — | [Wikipedia](https://en.wikipedia.org/wiki/ByteDance) |
| 2017-2020 | Multiple funding rounds | Up to $75B (2018) | Secondary market reports |
| 2024 | Secondary market estimates | ~$268B | Industry reports |

## Key People

| Name | Role | Notes | Source |
|------|------|-------|--------|
| **Zhang Yiming (张一鸣)** | Founder | Rarely speaks at Seed team meetings. Aug 2026 anti-distillation directive was notable. "Long-termism and delayed gratification." | [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502), [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival) |
| Guo Daya (郭达雅) | Seed Team Agent Lead | Joined from DeepSeek (R1 Core Researcher, Mar 2026) | Widget data — `src/components/widgets/deepseek/data/people.ts` |

## Compute Infrastructure

- **Chips**: Nvidia H20 (export-compliant alternative to B200)
- **Export restrictions**: Cannot purchase B200/Blackwell generation
- **H20 performance**: Only a fraction of B200's training performance
- **Structural disadvantage**: Grows wider with each new US chip generation
- **Cloud**: Volcano Engine (火山引擎) — ByteDance's own cloud platform

## Notable Events

### Anti-Distillation Policy (2023–present)

- **Apr 2023**: Internal requirement issued — GPT-generated material must not enter ByteDance's training data. Similarity checks conducted (sampling model outputs vs GPT responses).
- **Jan 2025 (Debate 1)**: After DeepSeek R1 release, researchers proposed incorporating GPT outputs. **Rejected.**
- **Late 2025 (Debate 2)**: "Blackwell Gap" — researchers argued distillation could compensate for compute disadvantage. **Rejected.**
- **2026 (Debate 3)**: After Kimi K3, compromise proposed (distill only open-weight models). **Zhang rejected the compromise** — "Closed models cannot be distilled. Open-weight models cannot be distilled either."
- **Aug 6, 2026**: Zhang's public directive at Seed all-hands meeting.
- **Clean record**: ByteDance was **NOT** named in Anthropic's distillation accusations (unlike DeepSeek, Moonshot, MiniMax, Alibaba, Tencent).

### Distillation Controversy Context

- **Feb 2026**: Anthropic accused DeepSeek, Moonshot, MiniMax of industrial-scale distillation. ByteDance not named.
- **Apr 2026**: The Information reported Tencent employees used Claude for fine-tuning.
- **Jun 2026**: BBC reported Anthropic separately accused Alibaba.
- **Jul 21, 2026**: Treasury Secretary Bessent threatened sanctions — "Open source AI is not open season on American AI."
- **Aug 6, 2026**: Zhang Yiming's anti-distillation statement (same day as DeepSeek's V4-Flash launch + price increase).

### TikTok Regulatory Context

- ByteDance operates TikTok, the most scrutinized Chinese company in America
- The Information suggested the anti-distillation policy partly shields TikTok from regulatory scrutiny
- Guixinren (Luo Yihang) contradicts: TikTok's future carried "almost zero" weight in the decision; Zhang's motivation is genuinely technical
- The 2023 policy predates the political controversy by two years

## Key Limitations

- Flagship models closed, API-only — limited visibility on international leaderboards
- SWE-Bench and Terminal Bench trail Western competitors
- Underperforms on hallucination avoidance
- ByteDance acknowledges these gaps
- Compute disadvantage (H20 vs B200) is structural

## Sources

- [Wikipedia — ByteDance](https://en.wikipedia.org/wiki/ByteDance)
- [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502) — Zhang Yiming's statement
- [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival) — Detailed Guixinren report
- [Reuters](https://www.reuters.com/world/china/bytedance-founder-tells-staff-avoid-ai-distillation-paper-reports-2026-08-06/) — Reuters coverage
- [EvoLink](https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing) — Seed 2.0 benchmarks and pricing
- [ByteDance Seed (Official)](https://seed.bytedance.com/en/) — Official site
- [ThursdAI](https://thursdai.news/companies/bytedance) — Model release timeline
- [Anthropic Blog](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) — Distillation accusations (ByteDance NOT named)
- Project article: `articles/bytedance-zhang-yiming-no-distillation.md`
- Project research: `docs/refs/source-materials/bytedance-zhang-yiming-no-distillation-research.md`
- Widget data: `src/components/widgets/distillation/data/news-events.ts`, `src/components/widgets/deepseek-oss-comparison/data/companies.ts`
