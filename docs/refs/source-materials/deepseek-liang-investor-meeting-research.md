# Research Summary: Liang Wenfeng Investor Meeting Transcript

> Compiled August 8, 2026 from 1 primary source.
> Source: Audio recording of DeepSeek investor meeting (audio file `deepseek_0520.m4a`, ~3h 44min).
> Recording date: May 20, 2026. Transcript compiled: July 16, 2026.
> Transcript generated via speech recognition and AI-organized; speaker attribution not differentiated;
> bracketed timestamps `[HH:MM:SS]` indicate audio positions. Some proper nouns and numbers may contain
> recognition errors — refer to original audio for verification.

## Sources

1. **梁文锋投资者交流会 · 录音文字稿** — `docs/refs/source-materials/梁文锋投资者交流会-录音转文本.pdf` (42 pages, internal document)
   - Recording: `deepseek_0520.m4a`, total duration ~3 hours 44 minutes
   - Meeting context: Investor meeting with Liang Wenfeng (DeepSeek founder/CEO), ~May 2026
   - Note: Host requested attendees not to share sensitive figures (GPU counts, etc.) externally

## Key Facts

### Vision and Management Philosophy

- DeepSeek has **no KPIs, no org chart** — managed entirely by vision
- Liang cites Jack Welch (GE CEO) as his management idol from ~20 years ago: "the most important thing for a company is its vision"
- Vision is not a slogan on the wall — "vision is how you actually do things, not what you say"
- The vision is **not written down** — it exists in how they work and treat the world
- Company organized around "great kindness toward the world" — a money-beyond purpose
- Quote: "我们是没有组织的，就是愿景驱动的" (We have no organization — it's vision-driven)
- Two management lines: top-down (formal projects, e.g. shipping V4) and bottom-up (self-directed research). Formal work should not exceed 50% of employee time
- No overtime culture — "做研究需要一个比较松弛的环境" (research needs a relaxed environment)

### Restraint as Strategy

- "克制" (restraint) is DeepSeek's core strategic principle
- Restraint manifests in: open source, pricing, not chasing C-end traffic, not competing with internet giants
- Quote: "你越克制，可能就越容易做成" (The more restrained you are, the more likely you are to succeed)
- Last spring (2025) when users flooded in, DeepSeek did **not** monetize or lock in users — just served them well
- Quote: "去年 C 端大家都抢得头破血流，结果被一个没有去抢的人牵走了" (Last year everyone fought for C-end traffic, but the person who didn't fight walked away with it)
- C-end and B-end are **byproducts** of pursuing AGI, not the goal
- Quote: "降维打击" (dimensionality reduction attack) — standing at a higher technical level to do lower-level applications

### Open Source Strategy

- DeepSeek will **continue to open source**, including their strongest models
- Quote: "我看不到闭源什么好处" (I don't see any benefit to closed source)
- Open source and commercial revenue have **no conflict** —前提是六倍利润 (premise: 6x profit margin)
- Open-sourced model = self-deployed model (same quality, no degradation)
- Third parties **cannot** match DeepSeek's deployment costs even with open weights — "并不是我开源了，他就能够轻易地做到跟我一样的部署成本"
- Zhipu (GLM) also open-sources but it feels "forced"; for DeepSeek it's "intentional"
- Quote: "AI 这个事情足够大，最终它可能得占掉人类社会 GDP 的百分之十" (AI will eventually account for 10% of global GDP)

### API Pricing Logic

- Pricing standard: **10-month cost recovery** on equipment (GPUs)
- Corresponds to approximately **6x profit margin**
- Quote: "我们只赚取一个合理的利润，只看你的意愿，而不是利润之大"
- Pricing has **no elasticity** — doubling price wouldn't change demand significantly
- When Liang cut DDCP model price to 1/4, the team **cheered** — "公司群里面很多人是欢呼的"
- V3.2 Flash and all models priced on same 10-month recovery logic
- Competitors (Alibaba, Tencent) have deployment costs "好几倍" (several times) higher
- Quote: "如果我价格再贵一倍，我的总收入接近一倍" — but they choose not to maximize revenue

### AGI Roadmap

- AGI is the company's long-term goal — "每个人对 AI 定义不一定一样，但不妨碍我们把 AGI 当做我们的目标"
- Technical path (sequential, each step builds on previous):
  1. **Language models** (foundation)
  2. **Chain of Thought (CoT)** — "去年的阶梯" (last year's step)
  3. **Agents** — "今年的阶梯" (this year's step)
  4. **Continuous learning** — next bottleneck to solve
  5. **Self-iteration singularity** — AI develops its own next versions
  6. **Embodied AI** — enters physical world
- Quote: "这个路线图我们可以不用加班" (this roadmap means we don't need to work overtime)
- Reverse order (embodied first) would be "brutal work"
- After continuous learning, AI can accelerate AI research → non-linear progress
- Quote: "AI 可以加速 AI 的研究" (AI can accelerate AI research)
- Current position: at the Agent stage; next bottleneck is continuous learning

### Team Stability as Core Interest

- Quote: "我们最大的核心利益是要保持团队的稳定性...甚至可以认为是唯一的核心利益" (Our biggest core interest is maintaining team stability... can be considered the only core interest)
- "只要我能够保持团队的稳定性，我一定能做成 AGI" (As long as we maintain team stability, we will definitely achieve AGI)
- Money is not a problem, resources are not a problem — team stability is the only non-negotiable
- Recent funding round significantly reduced this risk (employees received substantial options)
- Talent turnover historically low compared to peers
- People join because they want to build AGI — "大家都希望在一个能够做成 AGI 的环境里面去做这个事情"

### Compute Resources and US-China Gap

- Current compute: ~**20,000 H-equivalent GPUs** (most recently arrived in past 1-2 months)
- Strategy: buy as many GPUs as possible at reasonable prices — "能买到多少卡就买多少卡"
- Quote: "如果半年之内就把钱花完，那这个太幸福了" (If we spend all the money in half a year, that would be ideal)
- US-China gap is **only about resources** (compute), not talent
  - Talent gap is fundamentally caused by compute gap (fewer experiments → less experienced researchers)
  - "人才不是瓶颈，资源是最大的瓶颈" (Talent is not the bottleneck; resources are the biggest bottleneck)
- To train models at OpenAI's scale (800B activation): would need 50,000 GB300 or 200,000 Huawei 950s — currently unaffordable
- Current scale: tens of billions activation parameters
- Next-gen target: **150-250B activation** (optimistic: start training end of 2026)
- Quote: "我们跟美国的差距...落后美国两年，然后只用美国二十分之一的算力" (We're 2 years behind the US, using 1/20th of their compute)

### Huawei Partnership and Domestic Chips

- Huawei allocated **16,000 Huawei 950 cards** to DeepSeek (vs. 100K+ for internet giants)
- 4 Huawei 950s ≈ 1 Nvidia GB300 in performance; 2-year lag
- Huawei 950 super-node can fully replace GB200/GB300 in performance and price (50-100% more expensive, acceptable)
- **TileLang** — DeepSeek's custom high-level compiler language
  - V3 already trained on Nvidia chips but **without Nvidia's CUDA ecosystem** — using TileLang instead
  - Plan: replicate the same stack on Huawei chips
  - AI is being used to write TileLang code (currently human-written, but much faster than writing CUDA)
  - Efficiency loss from TileLang vs CUDA: only **1-2%**
  - Quote: "英伟达是在掘自己的坟墓" (Nvidia is digging its own grave) — CUDA moat is rapidly eroding
- Prediction: within 1 year, domestic chip ecosystem will be proven viable
- Quote: "国产 AI 芯片的硬件和生态都没有问题，唯一有问题的是产能不够" (Domestic AI chip hardware and ecosystem are fine — the only problem is insufficient production capacity)
- Huawei card depreciation: ~3 years; Nvidia: ~5 years

### Model Plans

- Comfortable release cadence: every **2-3 months**
- Last release: end of April; next: end of June (2026)
- GCV4 (vision model): currently "quite rough," needs time
- At 50B activation scale: won't differ much from current open-source models
- 150B activation model needed to compete with larger closed models
- Quote: "150B，我觉得按照我们现在训练的进度，今年，乐观的是今年年底可以开始去训练"
- Multi-modal: V4 and subsequent versions will support native multimodality — but it's a "component, not the main line"
- Video generation and world models: **not on DeepSeek's roadmap** — "跟智能的上限没有太大的关系"
- Quote: "我们只会因为它是智能路线图上的东西，才会去做"

### Data and Post-Training

- **Half of core researchers** are currently doing data annotation
- Data annotation is very expensive — no cost advantage in China for high-quality annotation
- Quote: "有一半的核心研究员，最重要的人，有一半在标数据"
- High-quality data bottleneck is **time**, not money — even with more capital, expansion speed has a ceiling
- Prediction: within 1 year, high-quality data problem should be significantly improved in China
- Hallucination: solvable via better post-training, but "不是重点的问题" (not a priority)
- Scaling: DeepSeek hasn't hit the scaling wall — "我们离探索这个 Scaling 的上限还比较远"

### Commercial Outlook

- B-end ARR: opportunity to reach **several hundred million USD** if demand continues growing
- If ARR reaches ~$1B, company cash flow could turn positive — covering R&D and all expenses
- Quote: "最坏情况卖 API，可能都能够支撑一个上市公司" (Worst case: selling API could sustain a public company)
- China's structural advantages vs US: **cost** and **product experience**
- Quote: "中国人会把这产品做到最便宜" (Chinese companies will make products the cheapest)
- Industry consolidation prediction: China will converge to 3-4 foundation model companies
- Quote: "现在做模型的公司有点太多了...一定会收敛" (Too many model companies now... will definitely consolidate)

### Organization and Future

- DeepSeek has **no imitation model** — "我们没有模仿的对象"
- Different from Bell Labs: DeepSeek must commercialize to survive
- Quote: "我们本质上还是一个公司...只是说我们在考虑赚哪些钱、什么时候赚钱"
- Consensus-based decision making — "我并不是说我一个人决定所有事情"
- Liang's authority is built on consensus, not top-down command
- Next-gen model goal: first be useful to DeepSeek itself — "我们做的模型，第一目标不是大家用得好用，而是我们自己用得好用"
- Quote: "首先对我们自己有用...这是实现 AGI 最快的方法"

## Data Tables

### Compute Resources

| Resource | Quantity | Notes |
|----------|----------|-------|
| Current H-equivalent GPUs | ~20,000 | Most arrived in past 1-2 months |
| Huawei 950 cards | 16,000 | Allocated by Huawei; ~4K B-series equivalent |
| Needed for 800B model (Nvidia) | 50,000 GB300 | Training only, no research |
| Needed for 800B model (Huawei) | 200,000 Huawei 950 | Training only, no research |
| Huawei 950 vs GB300 ratio | 4:1 | 4 Huawei cards = 1 GB300 performance |
| Huawei 950 time lag | 2 years | vs GB300 |
| Huawei card depreciation | ~3 years | |
| Nvidia card depreciation | ~5 years | |

### Model Release Timeline

| Timeframe | Model | Notes |
|-----------|-------|-------|
| End of April 2026 | Previous release | |
| End of June 2026 | Next release (~2-3 month cadence) | |
| Current | GCV4 (vision) | "Quite rough," needs time |
| Current scale | ~50B activation | |
| Next-gen target | 150-250B activation | Optimistic: start training end of 2026 |
| Future | V4+ with native multimodality | Multimodal as component, not main line |

### AGI Technical Roadmap

| Step | Technology | Status | Description |
|------|-----------|--------|-------------|
| 1 | Language models | ✅ Completed | Foundation |
| 2 | Chain of Thought (CoT) | ✅ Completed | "Last year's step" (2025) |
| 3 | Agents | 🔄 Current | "This year's step" (2026) |
| 4 | Continuous learning | ⏳ Next bottleneck | Not yet solved globally; "摸索阶段" |
| 5 | Self-iteration singularity | 🔮 Future | AI develops own next versions |
| 6 | Embodied AI | 🔮 Future | Enters physical world |

### Pricing Economics

| Metric | Value | Notes |
|--------|-------|-------|
| Cost recovery period | 10 months | Equipment (GPU) cost |
| Profit margin | ~6x | Considered "reasonable profit" |
| Demand elasticity | None | Price doubling wouldn't change demand |
| DDCP price cut | To 1/4 | Team cheered |
| V3.2 Flash pricing | 10-month recovery | Same logic as all models |
| Competitor cost ratio | "好几倍" (several times) higher | Alibaba, Tencent deployment costs |

## Timeline

| Date | Event |
|------|-------|
| ~2023 | DeepSeek founded by Liang Wenfeng |
| Spring 2025 | DeepSeek goes viral (C-end user surge); chose not to monetize |
| May 20, 2026 | Investor meeting (this transcript) |
| Late April 2026 | Previous model release |
| ~June 2026 | Next model release expected |
| ~End of 2026 | Optimistic: start training 150B activation model |
| Within 1 year | Domestic chip ecosystem predicted viable |
| Within 1 year | High-quality data problem significantly improved |
| 5+ years | Domestic chip production capacity resolved (optimistic) |

## Cross-References

- **Article**: `articles/deepseek-art-of-restraint.md` — 3-part video series based on this transcript
- **Scene-data**: `scripts/short-video/content/restraint/pt1/` — Part 1: Vision Over KPIs
- **Scene-data**: `scripts/short-video/content/restraint/pt2/` (planned, not yet created) — Part 2: The 10-Month Rule
- **Scene-data**: `scripts/short-video/content/restraint/pt3/` — Part 3: AGI Roadmap
- **Widget**: `src/components/widgets/deepseek/` — DeepSeek company data (funding, pricing, people, keywords)
