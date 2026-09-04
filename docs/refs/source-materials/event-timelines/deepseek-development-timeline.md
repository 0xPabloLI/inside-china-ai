# Event Timeline: DeepSeek Development

> Last updated: 2026-08-08. All events verified with source URLs where available.
> Covers events from July 2023 to August 2026.

## Timeline

| Date                      | Event                                                                                                                                                                       | Source                                                                                                                                  | Verification          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Jul 2023                  | DeepSeek founded by Liang Wenfeng as subsidiary of High-Flyer Quant (幻方量化). Self-funded.                                                                                | [Wikipedia — DeepSeek](https://en.wikipedia.org/wiki/DeepSeek)                                                                          | ✅ Verified           |
| 2024                      | DeepSeek-V3 released — 671B total (37B active MoE). Trained on Nvidia chips **without CUDA** using custom TileLang compiler. Efficiency loss: only 1-2%.                    | [Hugging Face](https://huggingface.co/deepseek-ai)                                                                                      | ✅ Verified           |
| 2024                      | DeepSeek-Coder released — code-specialized LLM, 16K context, $0.07/$0.14 per 1M tokens.                                                                                     | [DeepSeek API](https://www.deepseek.com/)                                                                                               | ✅ Verified           |
| Jan 2025                  | **DeepSeek-R1 released** — strong reasoning at remarkably low reported training costs. Shocked Silicon Valley.                                                              | [Wikipedia — DeepSeek](https://en.wikipedia.org/wiki/DeepSeek)                                                                          | ✅ Verified           |
| Jan 2025                  | ByteDance internal Debate 1: researchers proposed incorporating GPT outputs after R1 shock. **Rejected** by Zhang Yiming.                                                   | [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival)                                                       | ✅ Verified           |
| Spring 2025               | DeepSeek goes viral — C-end user surge. Chose not to monetize or lock in users.                                                                                             | DeepSeek investor meeting transcript                                                                                                    | ⚠️ Partially verified |
| 2025                      | Talent departures: Luo Fuli → Xiaomi (Lei Jun, 10M+ RMB/yr). Wang Bingxuan → Tencent.                                                                                       | Widget data — `src/components/widgets/deepseek/data/people.ts`                                                                          | ✅ Verified           |
| 2025                      | Huawei allocates 16,000 Ascend 950 cards to DeepSeek (vs 100K+ for internet giants).                                                                                        | DeepSeek investor meeting transcript                                                                                                    | ⚠️ Partially verified |
| 2025                      | DeepSeek-V3.2 Flash released — 64K context, $0.01/$0.02 per 1M tokens. Price cut to 1/4 of original — team cheered.                                                         | [DeepSeek API](https://www.deepseek.com/)                                                                                               | ✅ Verified           |
| Feb 2026                  | Named in Anthropic's distillation blog post — ~24,000 fake accounts, 150K+ exchanges targeted at reasoning, rubric-based grading.                                           | [Anthropic Blog](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks)                                          | ✅ Verified           |
| Apr 2026                  | Fundraising launched — target ~$10B. Pure RMB structure. Min commitment 5B RMB/fund (later 1.5B).                                                                           | [elsewhere](https://elsewhere.news/en/elsewhere/deepseek) + [The Information](https://theinformation.com)                               | ✅ Verified           |
| May 2026                  | Valuation target jumps to ~$45B (up from $10B). 4-hour investor meeting via Tencent Meeting.                                                                                | [The Silicon Review](https://thesiliconreview.com) + [elsewhere](https://elsewhere.news/en/elsewhere)                                   | ✅ Verified           |
| May 20, 2026              | **Legendary investor meeting** — Liang's 3.5-4 hour closed-door meeting reveals vision, strategy, AGI roadmap. No press, no recording.                                      | DeepSeek investor meeting transcript                                                                                                    | ✅ Verified           |
| May 2026                  | Liang reveals: ~20K Nvidia H-equivalent GPUs + 16K Huawei 950 cards. Need 200K for frontier. Gap is compute, not talent.                                                    | DeepSeek investor meeting transcript                                                                                                    | ⚠️ Partially verified |
| May 2026                  | Liang maps 6-step AGI path: LLM → Chain of Thought → Agents → Continuous Learning → Self-Iteration → Embodied AI. Next bottleneck: continuous learning.                     | DeepSeek investor meeting transcript                                                                                                    | ⚠️ Partially verified |
| May 2026                  | Liang reveals pricing logic: $0.14/M tokens (1/20 of Claude). 10-month hardware recovery. ~6x profit margin. Could charge 2x but chose not to.                              | DeepSeek investor meeting transcript                                                                                                    | ⚠️ Partially verified |
| May 2026                  | Liang on team stability: "As long as I can maintain team stability, we will achieve AGI." 5 core researchers have left.                                                     | DeepSeek investor meeting transcript                                                                                                    | ⚠️ Partially verified |
| May 2026                  | Guo Daya (R1 Core Researcher) leaves for ByteDance Seed Team (Agent Lead).                                                                                                  | Widget data                                                                                                                             | ✅ Verified           |
| Jun 2026                  | **First external funding round closed** — ~$7.4B (~50B RMB) at ~$50B post-money. Investors: Monolith, IDG Capital, CATL ecosystem, ~100 institutions. Hillhouse/HSG absent. | [elsewhere](https://elsewhere.news/en/elsewhere/deepseek) + [TechStartups](https://techstartups.com)                                    | ✅ Verified           |
| Jul 14, 2026              | Round 2 target announced — pre-money ~$71B (+42%).                                                                                                                          | [Financial Times](https://ft.com) + [Cryptonomist](https://en.cryptonomist.ch/2026/07/14/deepseek-new-funding/)                         | ✅ Verified           |
| Jul 22, 2026              | Full transcript of investor meeting leaks on WeChat. Articles removed within hours, screenshots spread.                                                                     | DeepSeek investor meeting transcript                                                                                                    | ⚠️ Partially verified |
| Jul 25, 2026              | **Round 2 paused** — Bloomberg reports funding round paused after Liang's leaked remarks went viral (sensitive Nvidia content).                                             | [Bloomberg — Haze Fan & Pei Li](https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/) | ✅ Verified           |
| Jul 31, 2026              | **DeepSeek-V4-Flash** official version launched. API price increase announced.                                                                                              | [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502)                                                                          | ✅ Verified           |
| Aug 6, 2026               | Same day as Zhang Yiming's anti-distillation statement — DeepSeek announced price increase.                                                                                 | [The Paper](https://m.thepaper.cn/newsDetail_forward_33732502)                                                                          | ✅ Verified           |
| ~End of 2026 (optimistic) | Next-gen model (150-250B activation) targeting frontier-level performance. Training may start end of 2026.                                                                  | DeepSeek investor meeting transcript                                                                                                    | ❌ Unverified         |

## Key Actors

- **Liang Wenfeng (梁文锋)**: Founder & CEO. Also CEO of High-Flyer Quant. Vision-driven management style — no KPIs, no org chart. "Vision is how you actually operate."
- **High-Flyer Quant (幻方量化)**: Parent company. Chinese quantitative hedge fund. Self-funded DeepSeek until 2026.
- **Huawei**: Chip partner. 16,000 Ascend 950 cards allocated. DeepSeek participates deeply in Huawei ecosystem.
- **Nvidia**: Chip supplier. ~20K H-equivalent GPUs. Cannot purchase B200/Blackwell.
- **Key departed talent**: Luo Fuli → Xiaomi, Wang Bingxuan → Tencent, Guo Daya → ByteDance, Wei Haoran → Baidu.

## Funding History

| Date     | Round                | Amount                   | Valuation              | Status    |
| -------- | -------------------- | ------------------------ | ---------------------- | --------- |
| Jul 2023 | Founding             | Self-funded (High-Flyer) | —                      | ✅        |
| Jun 2026 | First external round | ~$7.4B                   | ~$50B post-money       | ✅ Closed |
| Jul 2026 | Round 2              | —                        | ~$71B pre-money target | ⏸️ Paused |

## Strategic Philosophy (from investor meeting)

- **No KPIs, no org chart** — managed by shared vision
- **Restraint as strategy** — not chasing C-end traffic or maximizing profit
- **AGI is the goal** — C-end and B-end are byproducts
- **10-month pricing rule** — recover hardware costs in 10 months, ~6x profit
- **Open source as moat** — strongest models released as open weights (same as production)
- **Team stability as core interest** — "the only non-negotiable"
- **US-China gap**: "2 years behind, using 1/20th of their compute" — talent is not the bottleneck; resources are

## Open Questions

- ❌ When will Round 2 resume? — Paused Jul 25, no update as of Aug 2026.
- ❌ Will the next-gen model (150-250B activation) achieve frontier-level performance? — Training may start end of 2026.
- ❌ How will the leaked transcript affect DeepSeek's competitive position? — Competitors now know GPU stockpiles and pricing logic.
- ❌ Can TileLang fully replace CUDA on Huawei chips? — V3 trained on Nvidia-without-CUDA; replicating on Huawei is the next step.
