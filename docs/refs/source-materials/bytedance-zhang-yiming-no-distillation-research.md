# Research Summary: Zhang Yiming's Anti-Distillation Directive

> Compiled August 7, 2026 from multiple Chinese and English sources.

## Sources

1. **The Paper (澎湃新闻)** — https://m.thepaper.cn/newsDetail_forward_33732502 (Aug 6, 2026, 22:50)
2. **Beijing News (新京报)** — https://www.bjnews.com.cn/detail/1785995424129904.html (Aug 6, 2026, 13:54)
3. **Reuters** — https://www.reuters.com/world/china/bytedance-founder-tells-staff-avoid-ai-distillation-paper-reports-2026-08-06/
4. **TechNode** — https://technode.com/2026/08/06/zhang-yiming-says-bytedances-seed-team-wont-rely-on-ai-distillation/
5. **Pekingnology** (summarizing Guixinren/硅星人 report by Luo Yihang) — https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival
6. **The Information** — https://www.theinformation.com/articles/bytedances-founder-rules-distillation-ai-models
7. **Sina Finance** — https://finance.sina.cn/2026-08-06/detail-inimkfvf4587534.d.html
8. **East Money (东方财富)** — https://wap.eastmoney.com/a/202608063834123153.html
9. **TechNews (Taiwan)** — https://technews.tw/2026/08/06/bytedance-zhang-yiming-no-ai-distillation-model-lag/
10. **Zaobao (联合早报)** — https://www.zaobao.com.sg/news/china/story20260806-9481691
11. **Reuters (Doubao 2.0)** — https://www.reuters.com/world/asia-pacific/chinas-bytedance-releases-doubao-20-ai-chatbot-2026-02-14/
12. **EvoLink (Seed 2.0 Review)** — https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing
13. **AITraining2U (Doubao & Seed)** — https://www.aitraining2u.com/bytedance-doubao-seed-explained-2026.html
14. **ThursdAI (ByteDance Releases)** — https://thursdai.news/companies/bytedance
15. **ByteDance Seed (Official)** — https://seed.bytedance.com/en/
16. **ByteDance Seed 2.1 (Official)** — https://seed.bytedance.com/en/seed2_1
17. **ByteDance-Seed GitHub** — https://github.com/ByteDance-Seed/Seed1.5-VL
18. **CNBC (Bessent sanctions)** — https://www.cnbc.com/2026/07/21/bessent-china-ai-sanctions.html
19. **Reuters (China AI hegemonism)** — https://www.reuters.com/world/china/china-accuses-us-ai-hegemonism-threatens-countermeasures-over-potential-probes-2026-07-27/
20. **BBC (Anthropic vs Alibaba)** — https://www.bbc.com/news/articles/c5ye2gyz0x4o
21. **Anthropic Blog (Distillation)** — https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks
22. **ChooseAI (ByteDance AI org)** — https://www.chooseai.net/news/2664/

## Key Facts

### Zhang Yiming's Statement (August 2026)

- Zhang Yiming, ByteDance founder, made rare statement at Seed team internal meeting
- Quote: "做模型要坚持长期主义、延迟满足感，而不是用别人的输出，换一时的榜单排名" (AI model development requires long-termism and delayed gratification, rather than using others' output to achieve short-term leaderboard rankings)
- Quote: "应该愿意为长期目标牺牲一部分短期收益" (should be willing to sacrifice some short-term gains for long-term goals)
- Quote (Guixinren): "We can accept being temporarily behind, but do not distill"
- Even if temporarily behind competitors, Seed won't use AI distillation
- Zhang rarely speaks at Seed team meetings — this was notable

### ByteDance's Anti-Distillation Policy

- Policy dates back to 2023, NOT related to US regulatory pressure (per Guixinren)
- Self-distillation from own models IS allowed
- Cannot use competitors' models (closed OR open-weight) as "teachers"
- API detection and technical checks used to enforce
- Zhang rejected compromise of only distilling open-weight models
- In 2023, engineers used GPT API data for a smaller model; April 2023: internal requirement issued that GPT-generated material must not be in training data
- ByteDance conducted similarity checks: sampling model outputs vs GPT responses to detect if annotators privately used GPT

### Three Internal Debates (from Guixinren report)

1. **Debate 1 (January 2025)**: After DeepSeek R1 release
   - R1's strong performance + low training costs shook Silicon Valley
   - Seed researchers believed ByteDance had comparable talent/resources but failed to produce similarly strong reasoning model
   - Speculation that DeepSeek used synthetic data from US frontier models
   - Proposal: incorporate GPT outputs into Seed's training as supplement
   - **Rejected**

2. **Debate 2 (late 2025 / early 2026)**: "The Blackwell Gap"
   - Nvidia Blackwell (B200) deployed at scale by US labs
   - US export restrictions prevented Chinese companies from purchasing B200
   - ByteDance trained Seedance 2.0 using Nvidia H20 chips (export-compliant, lower performance)
   - H20 overall training performance only a fraction of B200
   - Researchers argued distillation could compensate for compute disadvantage
   - Argument: "if all else fails, we should distill" gained broader support
   - **Rejected** by top management

3. **Debate 3 (2026)**: After Kimi K3 release
   - Moonshot AI (smaller company, fewer resources) produced near-frontier open-weight model
   - Seed, despite greater investment, had not produced comparable language model
   - Proposal: systematic use of frontier model outputs (reasoning traces, code, tool-use examples)
   - Compromise proposed: limit to open-weight models only (fewer legal/commercial risks)
   - Zhang **rejected the compromise**: "Closed models cannot be distilled. Open-weight models cannot be distilled either."
   - This led to the Seed all-hands meeting where Zhang spoke

### US-China Distillation Controversy Timeline

- **Feb 2026**: Anthropic accused DeepSeek, Moonshot AI, MiniMax of industrial-scale distillation (blog post)
  - DeepSeek: ~24,000 accounts, 16M+ exchanges
  - Moonshot: 3.4M+ exchanges
  - MiniMax: 13M+ exchanges (largest volume)
  - ByteDance was NOT named
- **Apr 2026**: The Information reported Tencent employees used Claude for fine-tuning
- **Jun 2026**: Anthropic separately accused Alibaba of using fraudulent accounts
- **Jul 21, 2026**: Treasury Secretary Scott Bessent threatened sanctions over AI "theft" — "open source AI is not 'open season' on American AI"
- **Jul 27, 2026**: China accused US of "AI hegemonism", threatened countermeasures
- **Late Jul 2026**: White House OSTP director Michael Kratsios accused Moonshot of using Anthropic's model to train Kimi K3
- **Aug 6, 2026**: Zhang Yiming's statement

### Distillation Background

- Named by Geoffrey Hinton et al. in 2015
- Core logic: large model ("teacher") trains smaller model ("student") via input/output observation
- Standard technique used by Google, OpenAI, Amazon
- Neutral technology method for AI development
- Reduces compute requirements while approaching frontier performance

### DeepSeek Same-Day News

- DeepSeek announced API price increase (same day as Zhang's statement)
- DeepSeek-V4-Flash official version launched July 31
- V4-Pro expected soon
- Price increase signals strong demand and upcoming more powerful model

### ByteDance Seed Model Lineup

#### Overview
- Seed is ByteDance's internal AI research division
- Consumer brand: **Doubao** (豆包) — China's #1 AI chatbot, 155 million weekly active users (Reuters, Feb 2026)
- Enterprise API: **Volcano Engine** (火山引擎)
- Flagship models are **closed and API-only** (no open weights for frontier models)
- Smaller open models released under "Seed-OSS" banner
- Source: https://www.aitraining2u.com/bytedance-doubao-seed-explained-2026.html

#### Model Release Timeline

| Date | Model | Type | Key Details |
|------|-------|------|-------------|
| May 2025 | Seed1.5-VL | Vision-language | 20B params, thinking capabilities. GitHub: https://github.com/ByteDance-Seed/Seed1.5-VL |
| Feb 14, 2026 | **Seed 2.0** (Doubao 2.0) | LLM family | Pro/Lite/Mini/Code variants. Released 2 days before Spring Festival Gala. Source: https://www.reuters.com/world/asia-pacific/chinas-bytedance-releases-doubao-20-ai-chatbot-2026-02-14/ |
| Feb 12, 2026 | **Seedance 2.0** | Video generation | Unified multimodal, 15s multi-shot clips, native stereo audio. ~80 ELO above next competitor on Arena. Source: https://thursdai.news/companies/bytedance |
| Jun 2026 | **Seed 2.1** (Doubao 2.1) | Agent-focused LLM | Shift from chatbot to general agent. Source: https://seed.bytedance.com/en/seed2_1 |
| Jul 8, 2026 | **Seedream 5.0 Pro** | Image generation | Precision editing, layer separation, 10+ language text. Source: https://thursdai.news/companies/bytedance |
| Apr 2025 | Seed-Thinking-v1.5 | Reasoning model | Tech report published (GitHub) |
| Apr 2025 | Seedream 3.0 | Image generation | Bilingual 2K text-to-image |
| Apr 2025 | Seaweed-7B | Video generation | 7B parameter foundation model |
| Mar 2025 | DAPO | RL method | Improvement over GRPO, open GitHub |
| Dec 2025 | SeeDream 4.5 | Image generation | Multi-reference fusion |
| Sep 2025 | HuMo (with Tsinghua) | Video generation | Human-centric, open weights on HF |

#### Seed 2.0 Pro Benchmarks

| Benchmark | Score | Comparison |
|-----------|-------|------------|
| AIME 2025 | 98.3 | Competitive with GPT-5.2, Claude Opus 4.5 |
| AIME 2026 | 94.2 | |
| GPQA Diamond | 88.9 | |
| MMLU-Pro | 87 | |
| Codeforces | 3020 | |
| LiveCodeBench v6 | 87.8 | |
| SWE-Bench Verified | 76.5% | **Trails Claude Opus 4.5 (80.9%)** |
| Terminal Bench 2.0 | 55.8 | **Trails GPT-5.2 (62.4)** |
| VideoMME | 89.5 | Surpasses human benchmark (73%) |
| MathVision | 88.8 | SOTA |
| MMMU | 85.4 | |
| BrowseComp | 77.3 | |
| tau2-Bench (Retail) | 90.4 | |
| tau2-Bench (Telecom) | 94.2 | |
| WideSearch | 74.7 | |
| LMSYS Chatbot Arena | 6th text, 3rd vision | |

- IMO: 35/42 points (gold medals), CMO gold, all 5 ICPC competitions
- Source: https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing

#### Seed 2.0 Pro Pricing (Feb 2026)

| Model | Input ($/1M tokens) | Output ($/1M tokens) |
|-------|---------------------|----------------------|
| Seed 2.0 Pro | $0.47 | $2.37 |
| Seed 2.0 Lite | $0.09 | $0.53 |
| Seed 2.0 Mini | $0.03 | $0.31 |
| GPT-5.2 High | $1.75 | $14.00 |
| Claude Opus 4.5 | $5.00 | $25.00 |

- 73-84% cheaper than GPT-5.2, ~10x cheaper than Claude Opus 4.5
- Source: https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing

#### Compute Constraints
- ByteDance trained Seedance 2.0 using Nvidia H20 chips (export-compliant for China)
- H20 overall training performance only a fraction of B200
- US export restrictions prevent purchase of B200/Blackwell
- Source: https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival

#### ByteDance AI Organization (Feb 2026 update)
- Seed team = internal AI research
- Flow and Stone = other AI-related units
- Source: https://www.chooseai.net/news/2664/

#### Key Limitations
- Flagship models closed, API-only (no open weights)
- SWE-Bench and Terminal Bench trail Western competitors
- Underperforms on hallucination avoidance
- Limited visibility on international leaderboards
- ByteDance acknowledges these gaps
- Source: https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing

### Guixinren vs The Information

- The Information reported the ban is partly to shield ByteDance from US regulatory scrutiny (TikTok connection)
- Guixinren (Luo Yihang) contradicts: TikTok's future carried "almost zero" weight in the decision
- Guixinren says Zhang's "long-term goals" = developing genuine frontier intelligence, NOT protecting TikTok
