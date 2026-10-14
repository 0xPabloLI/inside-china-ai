---
title: "Liang Wenfeng Is Meeting Robot Founders as DeepSeek Weighs Embodied AI"
slug: "deepseek-embodied-ai"
excerpt: "Liang Wenfeng is meeting embodied AI founders as DeepSeek weighs two paths into robotics, after buying into Unitree and moving to lead Winverse AI's seed round."
published: true
---

# Liang Wenfeng Is Meeting Robot Founders as DeepSeek Weighs Embodied AI

Liang Wenfeng has spent the past few weeks meeting founders in embodied AI, according to an exclusive report from Feng Huang Technology (iFeng) on October 12. The conversations covered robots, large models, and how AI interacts with the physical world. People familiar with the matter told iFeng that Liang is weighing whether DeepSeek should enter embodied intelligence, either by building his own team or by investing in companies that already build robots ([iFeng, Oct 12, 2026](https://original.ifeng.com/c/8x8CSYp7qr4)).

"Liang doesn't have much experience in this field either, so he's also studying it intensively," one source told iFeng. *(⚠️ Partially verified: multiple unnamed sources, no company confirmation)*

That sentence describes a company that has spent three years refusing to chase markets, now looking hard at one of the most crowded markets in China.

## Two paths, and DeepSeek has not picked one

The report lays out two routes. The first is to build a team and own the research direction, which would require DeepSeek to add robotics hardware, motion control, and real-world data collection to a company built entirely around model training and inference efficiency. The second is to buy in through investment or strategic partnership, the division of labor where a model company supplies the brain and a robot company supplies the body.

Industry people told iFeng that a model company entering robotics is not really about selling robots. It is about holding a position at the point where AI meets the physical world ([iFeng, Oct 12, 2026](https://original.ifeng.com/c/8x8CSYp7qr4)).

## The money is already moving

Two deals show which path DeepSeek has already taken, at least with its checkbook.

**Unitree.** DeepSeek (Hangzhou DeepSeek Artificial Intelligence Basic Technology Research) was allocated 933,399 shares in Unitree's Shanghai STAR Market IPO strategic placement, at about 141 million yuan ([Cailian Press, Aug 6, 2026](https://www.cls.cn/detail/2447658); [Securities Times, Aug 6, 2026](https://www.stcn.com/article/detail/4062345.html)). The shares carry a 36-month lock-up. Unitree priced the offering at 150.80 yuan per share ([Beijing News, Aug 6, 2026](https://www.bjnews.com.cn/detail/1786022430129360.html)). The arithmetic checks out: 933,399 shares at 150.80 yuan is 140.76 million yuan, which is the 141 million figure reported in Chinese coverage. On August 7, Unitree founder Wang Xingxing confirmed a strategic cooperation memorandum covering embodied intelligence work, with both companies staying independent ([Securities Times, Aug 6, 2026](https://www.stcn.com/article/detail/4062345.html); [Wen Wei Po, Aug 8, 2026](https://www.wenweipo.com/a/202608/08/AP6a763aaee4b0c1e50023f8d8.html)). *(✅ Verified: exchange filings via three outlets)*

**Winverse AI.** Bloomberg reported on October 12 that DeepSeek has agreed to lead the first funding round for Winverse AI, a months-old robotics AI startup. The seed round is worth tens of millions of dollars and values the company at about $400 million after the investment. Meituan's investment arm Long-Z has also committed. The deal is not final, and the valuation and investor list could still change ([Bloomberg, Oct 12, 2026](https://www.bloomberg.com/news/articles/2026-10-12/deepseek-backs-ex-tencent-ai-scientist-s-400-million-robot-lab); [TNW, Oct 12, 2026](https://thenextweb.com/news/deepseek-winverse-ai-robot-seed-round)). Bloomberg also reports the capital comes from DeepSeek's own $12 billion-plus financing. *(✅ Verified: Bloomberg, with Chinese outlets carrying the same figures the same day)*

## Who Hu Han is, and what Winverse actually builds

Winverse AI was founded in 2026 by Hu Han, who led Tencent's vision-language and embodied foundation model teams before leaving. He holds a PhD from Tsinghua University and worked at Microsoft Research Asia and Baidu, and he is a core author of the Swin Transformer paper, one of the most cited architecture papers in computer vision ([TNW, Oct 12, 2026](https://thenextweb.com/news/deepseek-winverse-ai-robot-seed-round); [Sina Finance, Oct 12, 2026](https://finance.sina.com.cn/stock/usstock/c/2026-10-12/doc-iniuypfc7325635.shtml)). *(✅ Verified: Bloomberg, TNW, and Chinese coverage agree on his background)*

Four days before the Bloomberg story, Leiphone reported that Hu's startup was raising tens of millions of dollars at a target valuation of several hundred million dollars, with Yuanshi Capital as financial adviser. The detail worth keeping: investors pressed him on commercialization, and his answer was that the model could be sold to large tech companies, naming DeepSeek as an example ([Leiphone, Oct 8, 2026](https://www.leiphone.com/category/ai/rMAfd0hlFnaS8F3t.html)). *(✅ Verified: Leiphone exclusive, published before the funding report)*

There is a catch. Several industry people told iFeng that Winverse "cannot be counted as a strict embodied intelligence company, it leans toward underlying infrastructure, doing model acceleration work" ([iFeng, Oct 12, 2026](https://original.ifeng.com/c/8x8CSYp7qr4)). *(⚠️ Partially verified: industry opinion, not a company statement)*

If that is accurate, DeepSeek's first robotics lead is an infrastructure bet, not a robot brain.

## The trigger: GPT-6 got hands

The pressure behind the timing is visible in benchmark results from September. GPT-6 Astra scored 95% on a robot control task, up from 40% for Claude Fable 5.1, while using 6.2 times fewer output tokens at 2.3 times lower cost ([Jay Chooi on X, Sept 5, 2026](https://x.com/chooi_jeq/status/2096064315115839904); [Machine Heart, Sept 2026](https://www.huxiu.com/article/4892584.html)). Robocurve connected Astra to a robot the day after its release and reported strong control performance with low token consumption ([Machine Heart via PEdaily, Sept 22, 2026](https://news.pedaily.cn/202609/569482.shtml)). *(✅ Verified: primary post plus multiple independent write-ups)*

The most detailed demonstration came from Stanford's Movement Lab and Caltech. Their HomeBody project put GPT Astra inside a Unitree G1 and had the robot explore an unfamiliar kitchen, then find objects, fetch medicine, throw out trash, and open drawers on command. The architecture is deliberately layered: Astra handles task understanding, skill selection, and re-planning after failure through structured tool calls, while navigation, trajectory planning, collision checking, visual servoing, and whole-body control all run locally. The local control loops run at 250 Hz and 50 Hz, with Astra's remote inference in the seconds range ([Leiphone, Sept 30, 2026](https://www.leiphone.com/category/ai/AVV9SvszqpZ3u8vU.html)). *(✅ Verified: project page and repository published by the research team)*

The same write-up lists the limits: Real2Sim adds deployment cost, remote inference introduces pauses between skills, local perception and planning needed an RTX 4090 laptop, and the skill library sets the ceiling. A robot with no wiping skill does not learn to wipe because a model reasoned about it.

Sources close to DeepSeek told iFeng that Liang has said the company still trails GPT-6 on some capability dimensions ([iFeng, Oct 12, 2026](https://original.ifeng.com/c/8x8CSYp7qr4)). *(⚠️ Partially verified: relayed remark, no public statement)*

## The field DeepSeek would be entering

China's embodied AI sector recorded more than 200 equity funding events in 2026 up to April, an average of 2.5 per day ([QbitAI, Apr 2, 2026](https://www.qbitai.com/2026/04/394626.html)). Galbot raised more than $300 million in a single round in March, at the time the sector's largest, making it China's most valuable embodied AI startup ([Securities Times, Mar 2026](https://stcn.com/article/detail/3549196.html)). Galaxea raised another 2 billion yuan in April at a valuation above 20 billion yuan, less than three years after founding ([Cailian Press, Apr 2, 2026](https://www.cls.cn/detail/2333817)). Unitree, AgiBot, Galbot, and Galaxea anchor a unicorn list that kept growing through the first half of the year.

The United States competes at the model layer. Skild AI raised close to $1.4 billion in January at a valuation above $14 billion, tripling in seven months, with SoftBank leading and Nvidia and Bezos Expeditions participating ([BusinessWire, Jan 14, 2026](https://www.businesswire.com/news/home/20260114335623/en/); [TechCrunch, Jan 14, 2026](https://techcrunch.com/2026/01/14/robotic-software-maker-skild-ai-hits-14b-valuation/)). Physical Intelligence, founded in 2024 by former Google DeepMind researchers, raised $600 million in November 2025 at a $5.6 billion valuation, and in March was reported to be discussing a further $1 billion at more than $11 billion ([Bloomberg, Mar 27, 2026](https://www.bloomberg.com/news/articles/2026-03-27/ex-deepmind-staffers-robotics-startup-in-talks-for-11-billion-valuation)). *(✅ Verified: company announcements and Bloomberg)*

China builds most of the world's robot bodies. The brains are where the valuations sit, and that is the layer DeepSeek already knows how to compete on.

## Its peers are moving too

Moonshot AI, the company behind Kimi, began recruiting for embodied intelligence in September. Employees at several robotics companies said they received calls from Kimi's HR team, and one person who interviewed said Kimi had been watching the field before GPT-6 shipped ([Sohu, Sept 19, 2026](https://www.sohu.com/a/1078278485_362225); [iHeima, Sept 2026](https://www.iheima.com/article-402176.html)). *(⚠️ Partially verified: recruiting reports from two outlets, no company confirmation)*

An industry source also told iFeng that Zhipu and Kimi both maintain embodied AI reserves ([iFeng, Oct 12, 2026](https://original.ifeng.com/c/8x8CSYp7qr4)). *(❌ Unverified: single unnamed source, no public evidence found)*

## The war chest, and the clock

DeepSeek is close to locking at least 80 billion yuan (about $12 billion) in its latest round, far above its original target, with Tencent and CATL leading and a final size that could approach 100 billion yuan, according to Bloomberg. The round is framed as preparation for an IPO planned for early 2027 ([Lianhe Zaobao, Oct 6, 2026](https://www.zaobao.com.sg/news/china/story20261006-9792305); [ITHome, Oct 6, 2026](https://www.ithome.com/1/009/990.htm); [Tencent News, Oct 6, 2026](https://news.qq.com/rain/a/20261006A0B2NO00)). The company closed its first external round in June at roughly 50 billion yuan, and the second round was paused in July after leaked remarks went viral ([Fortune, Jul 25, 2026](https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/)). *(✅ Verified: Bloomberg reporting carried by multiple outlets)*

The June round was earmarked for training and data centers. The iFeng report suggests part of the new money may now go to seeding a generation of startups that build on DeepSeek's models.

## My Take: cheap options on a strategic question

The interesting part of this story is not that DeepSeek might build robots. It is that the company which built its reputation on refusing to diversify is now buying its way into a field it admits it does not understand.

Look at the price of the option. A 141 million yuan stake in Unitree and a lead position in a seed round valued at $400 million are rounding errors against a $12 billion raise. DeepSeek can hold positions across several robotics companies and learn from all of them for less than the cost of one training run. That is not a strategy shift yet. It is a portfolio of cheap calls on a question the company cannot answer from a text corpus: whether the next jump in capability requires a body.

The restraint doctrine from Liang's May investor meeting is not obviously broken by this. He said the goal is AGI, and that applications are byproducts. If language scaling alone stops producing frontier gains, then embodied data becomes a research input rather than a business line, and the reasoning that kept DeepSeek out of consumer apps does not apply.

There is also a defensive reading. If GPT-6-class models can drive a Unitree G1 through a kitchen, then a lab without robotics partnerships risks watching the most valuable data source in AI, physical interaction, accumulate inside someone else's stack. Two Chinese peers are already recruiting for it.

What to watch, in falsifiable terms: if DeepSeek is serious about building, robotics and motion-control hires appear within two quarters, and a second or third investment follows. If by mid-2027 the record is investments and no team, then this was a financial position dressed as a research bet. The 36-month lock-up on the Unitree shares gives DeepSeek time either way.

## Sources

- iFeng Technology (Feng Huang), "Exclusive: Liang Wenfeng Meets Embodied AI Founders Intensively, DeepSeek Considers Going In Directly or Investing" (Chinese), Oct 12, 2026 - [original.ifeng.com/c/8x8CSYp7qr4](https://original.ifeng.com/c/8x8CSYp7qr4)
- Bloomberg, "DeepSeek Leads Funding for Ex-Tencent Scientist's $400 Million Robot AI Lab", Oct 12, 2026 - [bloomberg.com/news/articles/2026-10-12/deepseek-backs-ex-tencent-ai-scientist-s-400-million-robot-lab](https://www.bloomberg.com/news/articles/2026-10-12/deepseek-backs-ex-tencent-ai-scientist-s-400-million-robot-lab)
- TNW, "DeepSeek to lead seed round in $400mn robot AI start-up, Bloomberg reports", Oct 12, 2026 - [thenextweb.com/news/deepseek-winverse-ai-robot-seed-round](https://thenextweb.com/news/deepseek-winverse-ai-robot-seed-round)
- Leiphone, "Exclusive: Hu Han's Startup Progress, Target Valuation in the Hundreds of Millions of USD" (Chinese), Oct 8, 2026 - [leiphone.com/category/ai/rMAfd0hlFnaS8F3t.html](https://www.leiphone.com/category/ai/rMAfd0hlFnaS8F3t.html)
- Leiphone, "GPT-6 Runs on Unitree G1: Stanford Wraps the Robot Control Chain into a Dedicated API" (Chinese), Sept 30, 2026 - [leiphone.com/category/ai/AVV9SvszqpZ3u8vU.html](https://www.leiphone.com/category/ai/AVV9SvszqpZ3u8vU.html)
- Cailian Press, "DeepSeek, Tencent and Others Receive Unitree Strategic Placement" (Chinese), Aug 6, 2026 - [cls.cn/detail/2447658](https://www.cls.cn/detail/2447658)
- Securities Times, "DeepSeek, Tencent Capital Receive Unitree Strategic Placement" (Chinese), Aug 6, 2026 - [stcn.com/article/detail/4062345.html](https://www.stcn.com/article/detail/4062345.html)
- Beijing News, Unitree STAR Market listing announcement (Chinese), Aug 6, 2026 - [bjnews.com.cn/detail/1786022430129360.html](https://www.bjnews.com.cn/detail/1786022430129360.html)
- Wen Wei Po, "Unitree Partners with DeepSeek on Large Models and Embodied Intelligence Products" (Chinese), Aug 8, 2026 - [wenweipo.com/a/202608/08/AP6a763aaee4b0c1e50023f8d8.html](https://www.wenweipo.com/a/202608/08/AP6a763aaee4b0c1e50023f8d8.html)
- Jay Chooi on X, GPT-6 Astra robot control benchmark, Sept 5, 2026 - [x.com/chooi_jeq/status/2096064315115839904](https://x.com/chooi_jeq/status/2096064315115839904)
- Machine Heart via PEdaily, "Can GPT-6 Astra Control a Robot Directly?" (Chinese), Sept 22, 2026 - [news.pedaily.cn/202609/569482.shtml](https://news.pedaily.cn/202609/569482.shtml)
- QbitAI, "Another 2 Billion Yuan: Galaxea Lifts the Embodied AI Bar to 20 Billion" (Chinese), Apr 2, 2026 - [qbitai.com/2026/04/394626.html](https://www.qbitai.com/2026/04/394626.html)
- Cailian Press, "Galaxea Raises Another 2 Billion Yuan, Valuation Tops 20 Billion" (Chinese), Apr 2, 2026 - [cls.cn/detail/2333817](https://www.cls.cn/detail/2333817)
- Securities Times, "Galbot's New Round, the Largest Single Round in Embodied AI" (Chinese), Mar 2026 - [stcn.com/article/detail/3549196.html](https://stcn.com/article/detail/3549196.html)
- BusinessWire, "Skild AI Raises $1.4B, Now Valued Over $14B", Jan 14, 2026 - [businesswire.com/news/home/20260114335623/en/](https://www.businesswire.com/news/home/20260114335623/en/)
- TechCrunch, "Robotic software maker Skild AI hits $14B valuation", Jan 14, 2026 - [techcrunch.com/2026/01/14/robotic-software-maker-skild-ai-hits-14b-valuation/](https://techcrunch.com/2026/01/14/robotic-software-maker-skild-ai-hits-14b-valuation/)
- Bloomberg, "Ex-DeepMind Staffers' Robotics Startup in Talks for $11 Billion Valuation", Mar 27, 2026 - [bloomberg.com/news/articles/2026-03-27/ex-deepmind-staffers-robotics-startup-in-talks-for-11-billion-valuation](https://www.bloomberg.com/news/articles/2026-03-27/ex-deepmind-staffers-robotics-startup-in-talks-for-11-billion-valuation)
- Sohu, "Moonshot May Enter Embodied Intelligence" (Chinese), Sept 19, 2026 - [sohu.com/a/1078278485_362225](https://www.sohu.com/a/1078278485_362225)
- Lianhe Zaobao, "DeepSeek Said to Raise at Least 80 Billion Yuan, Tencent Among Investors" (Chinese), Oct 6, 2026 - [zaobao.com.sg/news/china/story20261006-9792305](https://www.zaobao.com.sg/news/china/story20261006-9792305)
- ITHome, "DeepSeek Said to Near Completion of at Least 80 Billion Yuan Raise" (Chinese), Oct 6, 2026 - [ithome.com/1/009/990.htm](https://www.ithome.com/1/009/990.htm)
- Fortune, "DeepSeek's Liang Wenfeng sees backers pause fundraising after viral posts", Jul 25, 2026 - [fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/](https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/)

## Verification Summary

| Status | Count | Items |
| ------ | ----- | ----- |
| ✅ Verified | 8 | Unitree placement figures; Winverse round and valuation; Hu Han's background; Leiphone pre-report; GPT-6 Astra benchmark; HomeBody project; Skild and Physical Intelligence rounds; DeepSeek's 80 billion yuan round |
| ⚠️ Partially verified | 4 | Liang's meeting schedule and learning remarks; Winverse as infrastructure rather than embodied AI; Liang's remark on GPT-6 gaps; Moonshot's embodied recruiting |
| ❌ Unverified | 1 | Zhipu and Moonshot embodied AI reserves |
| 🔴 Contradicts public data | 0 | None |

**Overall assessment**: The financial facts in this story trace to exchange filings, Bloomberg, and company announcements, and they hold up. The strategic claims, that Liang is personally exploring an entry and that DeepSeek is weighing two paths, rest on unnamed sources at a single outlet and should be read as reporting rather than confirmed strategy. No company involved responded to Bloomberg's requests for comment.
