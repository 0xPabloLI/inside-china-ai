# China vs US token consumption — source ledger

> Story: the viral "China spends 55% of its tokens on short video / the US spends 58% on code" chart.
> Collected 2026-10-20. Every number used in the article or video must trace to one of these entries.

## 1. Primary document: Chinese Online investor relations record (the 55% figure)

- Company: 中文在线集团股份有限公司 (Chinese Online, SZ 300364)
- Document: 投资者关系活动记录表, 编号 2026-004
- Event date: 2026-06-01 to 2026-06-02 (Beijing roadshow + online call)
- Publication date: 2026-06-03
- CNINFO PDF: http://static.cninfo.com.cn/finalpage/2026-06-03/1225350332.PDF
- Local copy: `docs/refs/source-materials/china-us-token-divide-cninfo-20260603.pdf`

Exact Chinese text (Section 三, "AI 短剧成为第一大 Token 消耗场景"):

> 从行业调用数据的分布来看，Token 经济场景的消耗占比直观地印证了这一论断。在国内所有 Token 消耗份额中，AI 短剧与视频生成高居首位，占比高达 55%；其次是电商与营销（如直播带货、广告营销等），占比 24%；而此前因 Vibe Coding（氛围编程）流行而被寄予厚望的软件开发领域，在 Claude 等编程能力的推进下也仅占 15%。

Key reading:

- The 55% is stated as "国内所有 Token 消耗份额" (all domestic token consumption share), but the document gives **no sample, no data provider, no methodology, and no time window**. It only says "从行业调用数据的分布来看" (from the industry call-data distribution).
- The document is an investor-relations roadshow record from a company whose business is AI short dramas (its own monthly capacity was about 150 titles, targeting 3,000 annualized by end-2026). That does not make the number false, but it is a single company's industry claim, not a national census.
- The same document explains why video generation is token-hungry: AI photoreal drama at 1080p consumes 2-3x the tokens of 720p comic-style drama, and teams repeatedly "抽卡" (generate and discard takes) to get usable shots.

## 2. The US 58% figure: no published source located

- 潮新闻 (Tidenews), 2026-10-19, 佘宗明: "后者没有权威出处，连严谨行业调研数据都谈不上" (the US figure has no authoritative source).
  https://tidenews.com.cn/news.html?id=3590063
- 新京报, 2026-10-18, 佘宗明: "后者查无此'论'，a16z、麦肯锡、Gartner都没说过" (could not find the claim; a16z, McKinsey and Gartner did not publish it).
  https://www.bjnews.com.cn/detail/1792305444129934.html
- Baijiahao analysis, 2026-10-15: the 58% first appears in short-video creator copy with no citation, no methodology.
  https://baijiahao.baidu.com/s?id=1879073437336377927

Working formulation for our content: **the 58% has no published source or methodology that we could locate**. Do not call it fabricated; call it unsourced.

The closest real, sourced number is platform-specific, not US-wide: OpenRouter + a16z's State of AI report says coding tasks rose from 11% of that platform's tokens in early 2025 to over 50% by 2026 (cited by 新京报, above). This is what a careful version of the "US codes" story looks like: one platform, one category, not a national token census.

## 3. The official Chinese aggregate

- 国家数据局 / 新华社, 2026-03-24: China's daily token (词元) calls exceeded **140 trillion** by March 2026, up from about **100 billion** in early 2024 (more than 1,000x in two years), and up 40%+ from 100 trillion at end-2025.
  Reported by 36Kr newsflash: https://m.36kr.com/search/newsflashes/%E5%88%98%E7%83%88%E5%AE%8F
  Also 新浪: https://news.sina.cn/bignews/2026-09-17/detail-iniscvfz0364544.d.html?vt=4
- 国家数据局 at the 2026 China International Big Data Expo, 2026-08-29: by June 2026, daily token calls had exceeded **500 trillion**.
  IT之家: https://www.ithome.com/0/996/119.htm
  People's Daily: http://finance.people.com.cn/n1/2026/0829/c1004-40788542.html

## 4. The cross-platform counter-signal (CLSA / OpenRouter)

- CLSA (里昂) research note, reported 2026-10-12 by 智通财经:
  - OpenRouter weekly token consumption exceeded **146 trillion** by end-September 2026.
  - Chinese models reached about **65%** of OpenRouter token usage in September, up from **22%** in January 2026; US models fell from 65% to 31%.
  - In dollar spend, Chinese models were about **30%** vs US **70%** in September (January: 6% vs 94%), helped by roughly **80% price discounts**.
  - Chinese model weekly spend is up 27x year-to-date, driven by 67x token growth; blended token price almost halved.
  - URL: https://www.zhitongcaijing.com/content/detail/1505829.html

This is the key "token share is not revenue share" data point. It also shows the Chinese token boom is not confined to short video.

## 5. Token density: why video dominates token counts

- 新京报, 2026-10-18: a 10-minute HD AI drama consumes **80-120 million tokens** across rendering, effects, subtitles, voice and cuts; an 8-10 person engineering team using AI coding tools for a week consumes roughly **3-5 million tokens**.
  https://www.bjnews.com.cn/detail/1792305444129934.html
- The same article notes video tokens and text tokens are different billing units and cannot be compared one-for-one.
- 中文在线 IR record (above): AI photoreal drama at 1080p burns 2-3x the tokens of 720p comic-style drama; repeated takes add more.

## 6. The short-drama boom in context

- 潮新闻 / 新京报, 2026-10: 430,000 micro-dramas were released in the first eight months of 2026, 13x the whole of 2025; more than 90% had AI involvement.
- This is context, not a token-share proof.

## 7. Caveats to carry into the script

- Token consumption is a billing unit, not a measure of compute allocation; different modalities have different compute per token.
- Cross-border API calls distort national attribution: code written by Chinese developers on US APIs is counted in US token totals (潮新闻, 新京报).
- The 55% figure and the 58% figure are not a matched pair: one is a single company's claim about "all domestic tokens", the other is an unsourced share of an unspecified US denominator.
- The honest headline is not "China wastes its AI on short video". It is: China's token volume exploded, video is token-expensive by design, and token share tells you little about compute, revenue or research capacity.
