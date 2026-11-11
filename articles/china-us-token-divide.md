---
title: "China's AI Tokens Are Going to Short Video"
slug: "china-us-token-divide"
excerpt: "More than half of China's AI tokens go to short video and AI drama. The exact split is soft, but the entertainment sink is real."
published: false
---

# China's AI Tokens Are Going to Short Video

More than half of China's AI tokens go to short video and AI short drama. That is the fact behind a two-bar chart that went viral in Chinese tech circles in mid-October. The exact split is softer than the chart suggests. The shift it describes is not.

The China bar said 55% of the country's tokens went to short video and AI short drama, 24% to e-commerce and marketing, and 15% to software development. The United States bar said 58% went to code generation and enterprise automation.

The conclusion wrote itself: one country uses AI to make entertainment, the other uses it to build tools. A line from Chinese social media summed it up: the West uses gunpowder for weapons, China uses it for fireworks.

The chart is not a measurement of either country. One number has a real filing behind it but no method. The other has no published source that we could find. And token counts are not compute, revenue, or research capacity. Each of those points matters more than the culture-war framing.

## Where the 55 percent comes from

The China number traces to a document filed with Shenzhen's stock exchange by Chinese Online (SZ 300364), a listed company that produces digital content and AI short dramas. The document is an investor relations record, number 2026-004, covering a roadshow and conference call held on June 1 and 2, 2026. It was published on June 3, 2026, and is available on the CNINFO disclosure system ([CNINFO, June 3, 2026](http://static.cninfo.com.cn/finalpage/2026-06-03/1225350332.PDF)).

The relevant passage, in translation, reads:

> Looking at the distribution of industry call data, among all domestic token consumption, AI short drama and video generation ranks first at 55%; e-commerce and marketing, such as livestream selling and advertising, is 24%; and software development, despite the spread of vibe coding and Claude's coding ability, is only 15%.

That is the entire basis for the headline. The record does not name a data provider, a sample, a time window, or a definition of "domestic token consumption." It says "industry call data" and nothing more.

The context of the document is also worth stating plainly. This is an investor roadshow by a company whose growth story is AI short drama. The same record says Chinese Online had monthly capacity of about 150 titles and aimed for 3,000 annualized by the end of 2026. That does not make the 55% false. It makes it one company's view of an industry, presented to investors, rather than a national census.

## What the filing does not say

A share is meaningless without a denominator and a boundary. The Chinese Online record does not say whether it counted only public cloud API calls, or also private enterprise deployments; whether it included consumer apps, advertising tools, and internal research; or which providers it sampled.

Those choices change the answer. If the sample is weighted toward content-generation APIs sold by video-model vendors, video will look large. If it includes enterprise software teams running coding assistants inside private clouds, software will look larger. The filing gives the reader no way to tell which world it measured.

The record also mixes two kinds of claims. Its explanation of why video consumes so many tokens is grounded in how the business works: photoreal AI drama at 1080p uses two to three times the tokens of a 720p comic-style drama, and production teams repeatedly generate and discard takes to get usable shots. The 55% share is a different kind of claim. It is an industry-wide estimate with no visible arithmetic. The first is useful. The second is an assertion in an investor document.

*(⚠️ Partially verified: the share is stated in the filing, but the filing discloses no methodology, sample, or data provider)*

## Where the 58 percent comes from

We looked for the US figure in English and Chinese. We could not find a published study, survey, filing, or dataset behind it.

Chinese fact-check commentaries reached the same conclusion. Tidenews wrote on October 19 that the Chinese number is "a listed company's one-sided statement" and the US number has "no authoritative source" ([Tidenews, October 19, 2026](https://tidenews.com.cn/news.html?id=3590063)). Beijing News published a longer analysis on October 18 saying the claim could not be found at a16z, McKinsey, or Gartner ([Beijing News, October 18, 2026](https://www.bjnews.com.cn/detail/1792305444129934.html)). An earlier Chinese analysis traced the 58% to short-video creator copy with no citation ([Baijiahao, October 15, 2026](https://baijiahao.baidu.com/s?id=1879073437336377927)).

The closest sourced number is much narrower. OpenRouter and a16z's State of AI report found that coding tasks rose from 11% of that platform's tokens in early 2025 to more than 50% in 2026, according to Beijing News ([Beijing News, October 18, 2026](https://www.bjnews.com.cn/detail/1792305444129934.html)). That is one routing platform's traffic, not the United States. It is also a useful number. It just is not the number in the chart.

Attribution is another problem. A Chinese developer who writes code through a US API is counted in US token totals. A US company that runs inference on a Chinese open-weight model through a third-party cloud may be counted somewhere else. A national token ledger does not exist, and the chart does not pretend to have one.

<!-- widget:token-split-reality-check -->

## Token is not compute

The chart invites readers to read token share as compute share. That is not what a token measures.

A token is a billing unit. The compute behind one token depends on the model, the modality, the context length, the batch size, and the hardware. Video generation produces many tokens per second of output because pixels, motion, and repeated takes are expensive. Text generation produces far fewer tokens for a task that may be just as valuable.

Beijing News put numbers on the gap. A 10-minute high-definition AI drama, including rendering, effects, subtitles, voice, and cuts, consumes 80 million to 120 million tokens. An 8-to-10-person engineering team using AI coding tools for a week consumes roughly 3 million to 5 million tokens ([Beijing News, October 18, 2026](https://www.bjnews.com.cn/detail/1792305444129934.html)).

On those figures, one 10-minute drama can out-token a team-week by roughly 16 to 40 times. That is a property of the medium, not evidence that a country has stopped doing research. The same article notes that video tokens and text tokens are different billing units and cannot be compared one-for-one.

## The denominator nobody put on the chart

The chart compares shares. It never shows the size of the pool.

China's official figures do. At a press conference on March 24, 2026, the National Data Administration said daily token calls had reached more than 140 trillion, up from about 100 billion in early 2024 and 100 trillion at the end of 2025, an increase of more than 1,000 times in two years ([Sina BigNews, September 17, 2026](https://news.sina.cn/bignews/2026-09-17/detail-iniscvfz0364544.d.html?vt=4)). At the China International Big Data Expo on August 29, 2026, the administration said the daily figure had passed 500 trillion by June ([IT Home, August 30, 2026](https://www.ithome.com/0/996/119.htm); [People's Daily, August 29, 2026](http://finance.people.com.cn/n1/2026/0829/c1004-40788542.html)).

If software were 15% of a 500-trillion-token day, that would be 75 trillion tokens a day on software, assuming the share held. The filing does not say it held, and the June figure covers a later period. But the arithmetic shows why a share without a total is a poor scoreboard. A small slice of a very large pool can still be enormous.

## The counter-signal: 65 percent of tokens, 30 percent of spend

The most useful comparison in the same news cycle did not come from a national ledger. It came from OpenRouter, a platform that routes requests across models.

A CLSA research note reported on October 12, 2026, found that OpenRouter's weekly token consumption exceeded 146 trillion by the end of September. Chinese models accounted for about 65% of token usage and 30% of dollar spend. US models took 31% of tokens and 70% of spend. In January, the split was 22% and 65% of tokens, and 6% and 94% of spend ([Zhitong Finance, October 12, 2026](https://www.zhitongcaijing.com/content/detail/1505829.html)).

The driver was price. The note estimates Chinese models were about 80% cheaper per token than US rivals. Chinese model weekly spend rose 27 times this year, driven by a 67-times increase in token volume, while the blended token price nearly halved ([Zhitong Finance, October 12, 2026](https://www.zhitongcaijing.com/content/detail/1505829.html)).

That is the number the chart should have been paired with. Usage share and revenue share move in different directions when prices differ by a factor of five. A 65% token share does not mean Chinese labs captured 65% of the value, and a 30% spend share does not mean they are marginal. It means the market is price-sensitive.

## What the chart gets right

The chart is wrong about the comparison. It is not wrong that AI video has become a huge token sink in China.

Chinese media reported that 430,000 micro-dramas were released in the first eight months of 2026, 13 times the whole of 2025, with more than 90% involving AI in production ([Tidenews, October 19, 2026](https://tidenews.com.cn/news.html?id=3590063); [Beijing News, October 18, 2026](https://www.bjnews.com.cn/detail/1792305444129934.html)). That is an industrial phenomenon, not a rumor.

It is also a market outcome. China has the largest content-consuming market and a mature short-drama supply chain. When video models became good enough and cheap enough, the first large-scale use case was content that millions of people already pay for. A country with a different consumer market might have found a different first use case. That is not a moral failing, and it is not proof of a research gap.

## The accounting problem

The useful question is not which country's tokens look more serious. It is what a token buys.

Video generation spends tokens to produce pixels. Code generation spends fewer tokens per task because text is compact and because a correct line of code can replace hours of work. A country can have a high token share in video and still run a large software sector. A country can have a high token share in code and still import much of its compute.

Better public accounting would report tokens by modality, dollar spend, compute hours, and output. It would separate consumer and enterprise demand. It would count cross-border API use at the point of consumption. Until then, the chart is a receipt, not a scoreboard.

The 55% figure deserves scrutiny because its source is a single company with an interest in the story. The 58% figure deserves to be retired until someone publishes it. The larger story, that China's token volume exploded while prices collapsed, and that the first mass use case was entertainment, is more interesting than either number and harder to fit into a two-bar chart.

## Sources

- Chinese Online investor relations record 2026-004, CNINFO, June 3, 2026: http://static.cninfo.com.cn/finalpage/2026-06-03/1225350332.PDF
- Tidenews, "Do not be fooled by the so-called China-US token comparison chart," October 19, 2026: https://tidenews.com.cn/news.html?id=3590063
- Beijing News, "Is 'the US uses AI for productivity, China uses AI for dopamine' a false premise?" October 18, 2026: https://www.bjnews.com.cn/detail/1792305444129934.html
- Baijiahao, "The China-US AI token comparison is missing its data," October 15, 2026: https://baijiahao.baidu.com/s?id=1879073437336377927
- Sina BigNews, daily token calls exceed 140 trillion, September 17, 2026: https://news.sina.cn/bignews/2026-09-17/detail-iniscvfz0364544.d.html?vt=4
- IT Home, National Data Administration on 500 trillion daily tokens, August 30, 2026: https://www.ithome.com/0/996/119.htm
- People's Daily, National Data Administration on the token economy, August 29, 2026: http://finance.people.com.cn/n1/2026/0829/c1004-40788542.html
- Zhitong Finance, CLSA on Chinese models' OpenRouter share, October 12, 2026: https://www.zhitongcaijing.com/content/detail/1505829.html

## Verification Summary

| Status | Claim | Basis |
|---|---|---|
| ✅ Verified | Chinese Online's June 3, 2026 record states 55% / 24% / 15% | Original CNINFO PDF |
| ✅ Verified | China's daily token calls reached 140 trillion by March 2026 and 500 trillion by June 2026 | National Data Administration statements via Xinhua, IT Home, and People's Daily |
| ✅ Verified | Chinese models held about 65% of OpenRouter tokens and 30% of spend in September 2026 | CLSA note via Zhitong Finance |
| ⚠️ Partially verified | The 55% is a national share | The filing states it but discloses no methodology, sample, or data provider |
| ⚠️ Partially verified | A 10-minute AI drama consumes 80-120 million tokens; a team-week of AI coding consumes 3-5 million | Industry estimates reported by Beijing News, not a published measurement |
| ❌ Unverified | The US figure of 58% | No published source located by this publication, Tidenews, or Beijing News |

The 55% may be roughly right. The 58% may also be roughly right. Neither number can carry the argument that the chart is used to make, because neither is a matched measurement of the same thing. That is the story.
