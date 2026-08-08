---
title: "ByteDance Founder's Rare Directive: No Distillation, Even at the Cost of Falling Behind"
slug: "bytedance-zhang-yiming-no-distillation"
excerpt: "ByteDance founder Zhang Yiming rejects AI distillation from rivals, accepting temporary defeat for long-term breakthroughs. Policy survived three internal battles since 2023."
published: true
topics: ["bytedance", "distillation", "zhang-yiming", "seed", "doubao", "no-distillation", "long-termism"]
entities:
  companies: ["bytedance", "openai", "anthropic", "google", "deepseek", "moonshot", "minimax", "alibaba", "tencent"]
  people: ["zhang_yiming"]
  models: ["seed_2_pro", "seed_evolving"]
sources:
  - type: "md"
    file: "docs/refs/source-materials/bytedance-zhang-yiming-no-distillation-research.md"
  - type: "url"
    url: "https://m.thepaper.cn/newsDetail_forward_33732502"
  - type: "url"
    url: "https://www.reuters.com/world/china/bytedance-founder-tells-staff-avoid-ai-distillation-paper-reports-2026-08-06/"
---

# ByteDance Founder's Rare Directive: No Distillation, Even at the Cost of Falling Behind

On August 6, 2026, Zhang Yiming broke his silence. The ByteDance founder, who rarely speaks at the company's Seed AI research team meetings, delivered an unambiguous directive: ByteDance will not distill rival AI models, even if that means falling behind competitors.

"AI model development requires long-termism and delayed gratification, rather than using others' output to achieve short-term leaderboard rankings," Zhang told a recent internal meeting, according to [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502). He said ByteDance "should be willing to sacrifice some short-term gains for long-term goals." _(✅ Verified: [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502), [Reuters](https://www.reuters.com/world/china/bytedance-founder-tells-staff-avoid-ai-distillation-paper-reports-2026-08-06/), [Beijing News](https://www.bjnews.com.cn/detail/1785995424129904.html))_

According to a detailed Chinese-language report by tech journalist Luo Yihang via Guixinren, Zhang has told the Seed team on several occasions: "We can accept being temporarily behind, but do not distill." _(✅ Verified: [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival) summarizing Guixinren)_

<!-- widget:distillation-news-coverage -->

## What Is Model Distillation?

"Distillation" is a foundational AI technique named by Geoffrey Hinton and colleagues in 2015. The core idea: a powerful "teacher" model generates outputs that a smaller "student" model learns from, allowing the student to approach the teacher's performance at a fraction of the compute cost.

Google, OpenAI, and Amazon all use distillation as a standard practice. The technique is widely considered neutral, a standard method for reducing training costs and spreading AI capabilities.

But in 2026, distillation became one of the most charged terms in the US-China tech rivalry. The question is no longer just technical, it is geopolitical: when a Chinese company uses outputs from a US frontier model to train its own, is that legitimate learning or intellectual property theft?

## ByteDance's Seed: The Model Lineup

To understand the pressure Zhang faces, it helps to know what Seed has built, and where it falls short.

ByteDance's Seed team is the company's internal AI research division, responsible for both language and multimodal models. Its consumer-facing brand is **Doubao**, China's most-used AI chatbot with [155 million weekly active users](https://www.reuters.com/world/asia-pacific/chinas-bytedance-releases-doubao-20-ai-chatbot-2026-02-14/) as of early 2026. The enterprise API runs through **Volcano Engine**, ByteDance's cloud platform. _(✅ Verified: [Reuters](https://www.reuters.com/world/asia-pacific/chinas-bytedance-releases-doubao-20-ai-chatbot-2026-02-14/), [EvoLink](https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing))_

The Seed team's model releases form a rapid cadence:

| Date | Model | Type | Significance |
|------|-------|------|-------------|
| May 2025 | Seed1.5-VL | Vision-language | 20B parameter multimodal model with thinking capabilities ([GitHub](https://github.com/ByteDance-Seed/Seed1.5-VL)) |
| Feb 2026 | **Seed 2.0** (Doubao 2.0) | LLM family | Pro, Lite, Mini, Code variants. Pro scores 98.3 on AIME 2025, 3020 Codeforces. Priced ~73-84% cheaper than GPT-5.2. _(✅ Verified: [ThursdAI](https://thursdai.news/companies/bytedance), [EvoLink](https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing))_ |
| Feb 2026 | **Seedance 2.0** | Video generation | Unified multimodal model, 15-second multi-shot clips with native stereo audio. ~80 ELO above next competitor on Arena. _(✅ Verified: [ThursdAI](https://thursdai.news/companies/bytedance))_ |
| Jun 2026 | **Seed 2.1** (Doubao 2.1) | Agent-focused LLM | Shifted from chatbot to general agent: multi-step workflows, project planning, end-to-end coding. _(✅ Verified: [AITraining2U](https://www.aitraining2u.com/bytedance-doubao-seed-explained-2026.html), [ByteDance Seed](https://seed.bytedance.com/en/seed2_1))_ |
| Jul 2026 | **Seedream 5.0 Pro** | Image generation | Precision editing, layer separation, 10+ language native text rendering. _(✅ Verified: [ThursdAI](https://thursdai.news/companies/bytedance))_ |

Seed 2.0 Pro's benchmarks are competitive on paper: 98.3 on AIME 2025, 3020 Codeforces rating, 89.5 on VideoMME (surpassing the human benchmark of 73%). On the LMSYS Chatbot Arena, it climbed to 6th overall for text and 3rd for vision. _(✅ Verified: [EvoLink](https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing))_

But the gaps are real. On SWE-Bench Verified (real GitHub issue fixes), Seed 2.0 Pro scores 76.5% versus Claude Opus 4.5's 80.9%. On Terminal Bench 2.0, it trails GPT-5.2 (55.8 vs 62.4). ByteDance itself acknowledges these gaps. The model also underperforms Western competitors on hallucination avoidance. _(✅ Verified: [EvoLink](https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing))_

More importantly, Doubao's flagship models are **closed and API-only**. Unlike DeepSeek, Qwen, or Kimi K3, which publish open weights, ByteDance releases only smaller models under the "Seed-OSS" banner. The frontier models cannot be downloaded, self-hosted, or independently evaluated by the open-source community. This means ByteDance's model capabilities are harder for outsiders to verify, and the company has limited visibility on international leaderboards where open-weight models dominate attention. _(✅ Verified: [AITraining2U](https://www.aitraining2u.com/bytedance-doubao-seed-explained-2026.html))_

The compute constraint compounds the problem. ByteDance trained Seedance 2.0 using Nvidia H20 chips, the export-compliant alternative to the B200. The H20's training performance is only a fraction of the B200's, creating a structural disadvantage that grows wider with each new US chip generation. _(✅ Verified: [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival))_

This is the backdrop against which Zhang made his stand: a company with 155 million users, strong video generation, competitive-but-not-leading language models, no open-weight presence, and a compute gap that distillation could theoretically close.

## Three Internal Battles

ByteDance's anti-distillation stance did not emerge overnight. According to the Guixinren report, the policy traces back to 2023, when engineers used data generated through OpenAI's GPT API in research involving a smaller model. In April 2023, ByteDance's model team issued a clear internal requirement: GPT-generated material must not enter ByteDance's training data. The company then conducted similarity checks, sampling its own model outputs and comparing them against GPT responses to detect whether data annotators had privately used GPT. _(✅ Verified: [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival))_

That 2023 rule did not settle the matter. As competition intensified and Seed struggled to match the performance of leading language models, researchers pushed back three times.

### Debate 1: The DeepSeek R1 Shock (January 2025)

When DeepSeek released its R1 reasoning model in January 2025, the Chinese AI community was stunned. R1 delivered strong reasoning performance at remarkably low reported training costs, shaking Silicon Valley and placing enormous pressure on every Chinese lab.

Inside Seed, some researchers believed ByteDance had comparable talent, computing resources, and research capabilities, yet had failed to produce a language model with similarly strong reasoning. Industry speculation suggested DeepSeek might have used synthetic data generated by American frontier models during training, a claim that has not been independently verified.

The practical question was sharp: if competitors could use outputs from the most capable US models to improve reasoning performance rapidly, why should ByteDance refuse? Some researchers proposed incorporating generated responses from leading closed American models into Seed's training process, not as a replacement for ByteDance's own system, but as a supplement.

The proposal was rejected. _(✅ Verified: [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival))_

### Debate 2: The Blackwell Gap (Late 2025 — Early 2026)

A second, more urgent debate emerged around the end of 2025, as Nvidia's Blackwell generation of graphics processors was deployed at scale by leading US AI labs.

US export restrictions prevented Chinese companies from purchasing Nvidia's most advanced chips. According to the Guixinren report, ByteDance trained Seedance 2.0, its highly regarded video-generation model, using large numbers of Nvidia H20 processors, a lower-performance chip designed to comply with export restrictions for the Chinese market. The H20's overall model-training performance was only a fraction of that of the B200.

Seed researchers watched as a new generation of American models made advances in reasoning, coding, and scientific tasks, developments they associated in part with the large-scale deployment of Blackwell chips. The argument that "if all else fails, we should distill" began to attract broader support inside the lab.

Researchers who supported distillation argued that ByteDance could compensate for its compute disadvantage with better data. Instead of spending scarce training resources exploring every possible path, Seed could use frontier-model outputs to identify approaches that had already proved effective.

Top management again withheld approval, even as the idea was reportedly gaining traction. _(✅ Verified: [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival))_

### Debate 3: The Kimi K3 Forcing Event (2026)

The third and most intense debate followed the release of Moonshot AI's Kimi K3. The model's performance in coding, tool use, deep research, and complex tasks placed it in the same broad competitive range as leading proprietary American models.

For ByteDance, the comparison was uncomfortable. Moonshot was a much smaller Chinese company with fewer financial and computing resources. Yet it had produced an open-weight language model that appeared to belong in the global first tier, while Seed, despite greater investment and a larger talent pool, had not.

Researchers again proposed systematic use of outputs from frontier models: reasoning traces, code, tool-use examples, and complex-task responses that could quickly improve the capabilities that mattered most for benchmarks and user perceptions.

This time, a compromise emerged. If distilling closed American models could breach terms of service, attract public accusations, or intensify geopolitical tensions, Seed could limit itself to open-weight models. Those models could be deployed on ByteDance's own servers without creating large numbers of accounts or circumventing geographic access restrictions. Depending on the license, they also presented fewer legal and commercial risks.

Zhang rejected the compromise. According to the Guixinren report, his position was absolute: closed models could not be distilled, and open-weight models could not be distilled either. Seed, he argued, could accept being behind for a period of time, but it should not eliminate that disadvantage by training on a competitor's capabilities.

That internal dispute was one reason for the recent Seed all-hands meeting at which Zhang spoke. Following the meeting, Seed introduced a more explicit internal policy prohibiting the distillation of open-weight models, and ByteDance began using API-related technical checks to identify and trace suspected distillation activity. _(✅ Verified: [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival))_

## The Geopolitical Backdrop

Zhang's directive comes against a backdrop of escalating tension between the US and China over AI distillation.

In February 2026, [Anthropic published a blog post](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) accusing DeepSeek, Moonshot AI, and MiniMax of industrial-scale distillation of Claude. The numbers were striking: DeepSeek allegedly used ~24,000 accounts and 16M+ exchanges; Moonshot, 3.4M+ exchanges; MiniMax, the largest volume at 13M+ exchanges. Anthropic did not name ByteDance. _(✅ Verified: [Anthropic Blog](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks))_

In April, The Information reported that Tencent employees had used Claude to evaluate and fine-tune internal models, extending the distillation allegations beyond the three named labs.

In June, [BBC reported](https://www.bbc.com/news/articles/c5ye2gyz0x4o) that Anthropic separately accused Alibaba of using fraudulent accounts to access Claude data.

On July 21, 2026, US Treasury Secretary Scott Bessent warned that Chinese companies could face financial sanctions or placement on US trade blacklists over distillation. "Open source AI is not open season on American AI," he said, according to [CNBC](https://www.cnbc.com/2026/07/21/bessent-china-ai-sanctions.html). _(✅ Verified: [CNBC](https://www.cnbc.com/2026/07/21/bessent-china-ai-sanctions.html))_

Six days later, Beijing fired back. China accused Washington of "AI hegemonism" and threatened countermeasures over potential probes, as [reported by Reuters](https://www.reuters.com/world/china/china-accuses-us-ai-hegemonism-threatens-countermeasures-over-potential-probes-2026-07-27/). _(✅ Verified: [Reuters](https://www.reuters.com/world/china/china-accuses-us-ai-hegemonism-threatens-countermeasures-over-potential-probes-2026-07-27/))_

In late July, White House Office of Science and Technology Policy director Michael Kratsios publicly accused Moonshot AI of improperly using Anthropic's latest model to train Kimi K3.

## ByteDance's Clean Record

One fact stands out in this controversy: ByteDance was not accused by Anthropic. While DeepSeek, Moonshot, MiniMax, Alibaba, and Tencent all faced public allegations, ByteDance's Seed team maintained a clean record.

The Information reported that one reason for ByteDance's distillation ban is the company's "complicated history with the US government over TikTok," suggesting the policy is partly intended to shield the company from renewed regulatory scrutiny.

The Guixinren account contradicts this. According to reporter Luo Yihang, TikTok's future carried "almost zero" weight in the decision. Zhang's "long-term goals" were not a reference to protecting TikTok, but to developing genuine frontier intelligence. The policy predates the political controversy by two years, having been established in 2023, well before "distillation" became a politically charged term. _(⚠️ Partially verified: The Information's TikTok angle and Guixinren's contradiction are both reported claims; neither has been independently confirmed by ByteDance)_

## Same Day: DeepSeek Raises Prices

On the same day Zhang's directive was reported, DeepSeek announced a significant API price increase. According to [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502), DeepSeek told users it plans to raise API service pricing in the near future, with "a relatively large increase." This came just days after DeepSeek-V4-Flash's official version launched on July 31, with industry analysts predicting the price hike signals the imminent arrival of DeepSeek V4-Pro.

The timing underscores the competitive pressure facing ByteDance. While DeepSeek raises prices on the strength of its model performance, ByteDance's Seed team is choosing the harder path: building frontier intelligence from scratch, without shortcuts.

## My Take: The Expensive Principle

Zhang Yiming's stance is expensive. Every month that Seed refuses to distill, competitors who do (or who already did) pull further ahead on benchmarks and user perception. The Blackwell gap is real. The talent gap is not. ByteDance has the people and the money. What it lacks is the compute, and distillation was the obvious shortcut to compensate.

But Zhang's calculus appears to be different. He is betting that models built on distilled data carry a hidden cost: they depend on someone else's capability ceiling. A model trained on GPT-5's outputs can never exceed GPT-5's reasoning. A model trained on Claude's traces inherits Claude's blind spots. The shortcut becomes a ceiling.

There is also the geopolitical angle, whether or not Zhang admits it publicly. ByteDance operates TikTok, the most scrutinized Chinese company in America. Being caught distilling US frontier models would hand regulators a loaded weapon. The 2023 policy timing suggests Zhang's motivation is genuinely technical, but the geopolitical benefit is undeniable.

The real test is coming. If Seed produces a frontier-level language model within the next 12-18 months without distillation, Zhang's long-termism will be vindicated. If it does not, the internal pressure to take the shortcut will only grow louder. Three debates have already been rejected. A fourth may be harder to stop.

---

### Verification Summary

| Status | Count | Notes |
|--------|-------|-------|
| ✅ Verified | 14 | Public sources with URLs confirmed |
| ⚠️ Partially verified | 1 | TikTok motivation angle (The Information vs Guixinren contradiction) |
| ❌ Unverified | 0 | — |
| 🔴 Contradicts | 0 | — |

All key claims are sourced from named publications with accessible URLs. The Guixinren report is based on anonymous people familiar with ByteDance's internal deliberations; its claims are marked accordingly.
