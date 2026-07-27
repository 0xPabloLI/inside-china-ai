ALTER TABLE public.posts ALTER COLUMN author_id DROP NOT NULL;

INSERT INTO public.posts (author_id, title, slug, excerpt, content, published, published_at)
VALUES (
  NULL,
  'DeepSeek''s Leaked Investor Meeting Halted a $1.4 Billion Funding Round',
  'deepseek-leaked-investor-meeting',
  'A closed-door meeting in May 2026 leaked in July. Bloomberg reports the second funding round is paused. What Liang Wenfeng actually said — on pricing, open source, AGI, talent, and the compute gap with America.',
$post$In May 2026, DeepSeek founder Liang Wenfeng held a closed-door meeting with the company's investors. He gave a lengthy presentation followed by an extended Q&A session. No press was present. No public record was intended.

On July 22, 2026, the full transcript — transcribed from a nearly four-hour audio recording — appeared online and spread rapidly across Chinese media platforms. It was removed almost immediately, particularly on WeChat, where articles were pulled within hours of publication. Screenshots continued to circulate in private group chats.

On July 25, Bloomberg reported that Liang was displeased with the leak. DeepSeek orally notified some prospective investors in its second funding round that the deal was paused, with no signing expected in the coming days. The company did not terminate the round entirely. [Bloomberg, "DeepSeek Said to Tell Backers of Funding Pause After Viral Posts," Haze Fan & Pei Li, July 25, 2026]

The first round had closed in June 2026 at approximately $7.4 billion, with participants including Tencent, CATL, JD.com, NetEase, IDG Capital, and China's national AI industry fund. The second round was targeting at least $1.4 billion at a valuation of approximately $66 billion. [Bloomberg, July 25, 2026]

What follows is a summary of the key points Liang Wenfeng made during the meeting, based on the full transcript.

## DeepSeek was never built to maximize profit

Liang opened by stating that the company was founded without any intention of maximizing financial returns. There was no IPO plan and no exit strategy. He said the first few dozen employees would not have joined if they had been motivated primarily by money.

He cited former GE CEO Jack Welch's view that a company's most important asset is its vision — not its organizational structure or performance metrics. "Vision isn't a slogan on the wall," Liang said. "Vision is how you actually operate."

He described DeepSeek's internal organization as minimal: no KPIs, no formal performance reviews, no traditional hierarchy. Decisions are made through consensus. His own authority, he said, is "built on consensus, not position."

The concept he returned to most frequently throughout the meeting was what he called "strategic discipline" (克制). He framed this not as a moral position but as a strategic calculation: the more a company grasps for short-term gains, the lower its probability of achieving AGI.

## The API is priced to recover hardware costs in ten months

The most concrete expression of this discipline is DeepSeek's pricing model. The company's API is priced so that server hardware costs are recovered within ten months — approximately a 6x margin.

To contextualize this: DeepSeek V4 Flash is priced at $0.14 per million input tokens. By comparison, Claude Sonnet 5 is priced at $3.00 per million input tokens, and GPT-5.6 Luna at $1.00. DeepSeek is roughly one-twentieth the price of Claude for comparable capability. [CSDN API pricing comparison, June 2026; developer.puter.com]

Liang acknowledged that demand at this price point is "completely inelastic" — they could double the price without losing users. They have chosen not to. He framed short-term revenue maximization as "going after the appetizers when the main course hasn't even been served yet," referring to the much larger opportunity he sees in AGI.

## The strongest models are open-sourced — same weights as production

Liang drew a direct contrast between DeepSeek's approach to open source and that of other Chinese AI labs. He characterized competitors' open-source releases as feeling "forced," while stating that for DeepSeek, open source is the original intent.

His reasoning was structural: AI will ultimately represent such a large share of global economic output — he suggested potentially ten percent of GDP — that no single entity can monopolize it. He described attempted monopoly as not merely unethical but impossible, arguing that history would "discard" any company that tried.

He confirmed that DeepSeek's strongest models are open-sourced with weights identical to those used in production. There is no inferior public version. He also stated that the company actively assists competitors in deploying its models, and that his concern is not competition but rather incorrect deployment leading to poor results.

On the business case: at a 6x margin, he argued that open source has no meaningful revenue impact, because no third party can replicate DeepSeek's deployment cost structure.

## AGI is a staircase, and the next step is continuous learning

Liang described DeepSeek's technical roadmap as a staircase with six steps, each building on the previous:

1. Language models (foundation)
2. Chain of Thought / CoT (last year's breakthrough; surpassed top humans at math and coding, but hit a ceiling)
3. Agents (this year's step; broader capability, higher intelligence ceiling)
4. Continuous learning (the next bottleneck)
5. Self-iteration (the model develops its own next version)
6. Embodied AI (AI operating in the physical world; last, not first)

He explained continuous learning with an analogy: a new employee spends two months learning a company's context and then "just gets it" — you can say "ask Xiao Wang to come over" and they know who that is. Current AI cannot do this; it requires every piece of context to be provided explicitly.

He emphasized that the order matters. Solving continuous learning first, then self-iteration, then embodied AI means the later steps essentially complete themselves — the model builds what comes next. Reversing the order would be unnecessarily difficult.

Based on this roadmap, DeepSeek does not pursue video generation or world models. Liang noted that after Sora's launch, many companies invested heavily in video generation, then quietly abandoned those projects. He characterized multimodal capability as "a component, not the mainline," and confirmed that V4 and subsequent versions will support native multimodal.

On scaling, he stated that DeepSeek has not encountered any ceiling. The constraint is compute, not algorithm.

## Users and revenue are byproducts, not the goal

Liang stated that neither consumer users nor enterprise revenue are objectives for DeepSeek. Both are, in his framing, byproducts of the AGI research path.

He noted that the company operates its API business with no sales team and no customer support. A small number of people maintain the service. He described this as a structural advantage: operating at a higher technical altitude makes lower-altitude problems comparatively easy.

On the competitive endgame, he identified three final differentiators between AI labs: cost (primary), timing (secondary), and user experience (tertiary). He also noted that if API revenue reaches $1 billion annually, it would cover all of DeepSeek's R&D and operating costs — achievable, he said, but not the priority.

## The only thing DeepSeek refuses to lose is its team

Asked to identify the company's single non-negotiable interest, Liang answered immediately: team stability. "As long as I can maintain team stability, we will achieve AGI. It's that simple." He stated that money and resources are not problems; the only existential risk is the team breaking apart.

This concern is not abstract. When DeepSeek published its V4 technical report in April 2026, it credited nearly 300 contributors and marked 10 as already departed. [DeepSeek V4 technical report, April 2026] Named departures include:

- Wang Bingxuan — core author of DeepSeek's first-generation language model; joined Tencent
- Guo Daya — R1 core researcher (DeepSeek Coder, DeepSeek Math); joined ByteDance Seed team
- Luo Fuli — core contributor to DeepSeek V2; joined Xiaomi
- Wei Haoran — core author of DeepSeek OCR model series
- Ruan Chong — core multimodal researcher; joined DeepRoute.ai

[Sina Finance, April 26, 2026; NetEase, April 27, 2026]

These departures span base models, reasoning, OCR, and multimodal — essentially every major technical line. Chinese media characterized DeepSeek as a training ground for AI talent that larger companies subsequently recruit.

Liang said the recent funding round helped mitigate this risk, as equity grants are now substantial. He noted that retention of the most senior employees is the key variable: if they stay, everyone else stays.

## The gap with America is compute, not talent

On the question of China's gap with American frontier labs, Liang was direct: the difference is compute, not talent or algorithm.

DeepSeek currently operates approximately 20,000 H-equivalent GPUs, most of which arrived in the preceding two months. To train a model at frontier American scale — 800 billion active parameters — he estimated a requirement of 200,000 cards (GB300 or Huawei 950), for training alone, excluding research compute.

He stated that even deploying the company's full capital reserves — roughly $7 billion — would be insufficient at that scale. DeepSeek is therefore focusing on maximizing experiments within the tens-of-billions activation parameter range.

His capital allocation strategy is straightforward: purchase every available GPU at a reasonable price. If the funds are fully deployed within six months, he considers that the best possible outcome.

## China's chip ecosystem problem is about to be solved

On domestic semiconductors, Liang expressed genuine optimism. He argued that Nvidia's CUDA ecosystem moat is eroding for three reasons: AI can now generate compatible ecosystem code; DeepSeek has built a high-level compiler called TileLang capable of rewriting the full CUDA software stack; and dedicated AI chips no longer require backwards compatibility with gaming GPU architectures.

He predicted that within one year, the prevailing perception that Chinese chips have an inadequate ecosystem will be disproven. Specifically regarding Huawei: the 950 supernode can match Nvidia's GB200/GB300 in all tasks, with the tradeoff that four Huawei chips equal one Nvidia chip in performance, and the generation gap is approximately two years.

He stated that DeepSeek does not intend to design its own chips, analogizing: "If you run a power plant, you don't need to manufacture the generators."

His broader view: China's long-term role in global AI will likely mirror its role in manufacturing — highest volume, lowest price, comparable quality.

## Sources

- Bloomberg, "DeepSeek Said to Tell Backers of Funding Pause After Viral Posts," Haze Fan & Pei Li, July 25, 2026
- Original meeting transcript (audio recording, May 20, 2026; AI-transcribed and cleaned, July 16, 2026)
- DeepSeek V4 technical report, April 2026
- Sina Finance, "DeepSeek V4背后，人才流失内幕," April 26, 2026
- NetEase, "DeepSeek V4技术报告现离职名单，多位核心骨干已流向腾讯字节," April 27, 2026
- CSDN, "2026年AI模型API价格多少钱？GPT/Claude/DeepSeek费用对比," June 2026
- developer.puter.com, "DeepSeek API Pricing: Full Breakdown," June 2026$post$,
  TRUE,
  '2026-07-26T12:00:00Z'
);