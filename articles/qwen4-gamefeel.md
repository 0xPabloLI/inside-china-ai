---
title: "Unreleased Qwen 4 Beats Claude Opus 5.5 at Game Development, at 15% of the Cost"
slug: "qwen4-gamefeel"
excerpt: "Unreleased Qwen 4 checkpoints topped GameFeel Bench v1.4: 49.9 vs Opus 5.5's 47.2, at $0.40/task vs $2.60. One dev's benchmark; identity unconfirmed."
published: true
widgetPlan:
  status: new-dev
  backlog: "#1189"
  note: "GameFeel v1.4 score-vs-price chart (4 models, avg + price_per_task_usd). Registered qwen4-benchmarks covers Qwen3.8-Flash-Next official scores (Aug 26) — different entity, metric and source, not compatible."
---

# Unreleased Qwen 4 Beats Claude Opus 5.5 at Game Development, at 15% of the Cost

Alibaba has not released Qwen 4. But two early checkpoints labeled **Qwen-4-Flash-Early** and **Qwen-4-27B-Early** just appeared at the top of a game-development benchmark, ahead of Anthropic's Claude Opus 5.5, at a fraction of the price ([GameFeel Bench v1.4 data](https://github.com/kodasdream/gamefeel-benchmark/blob/main/data/gamefeelbench.csv), updated Nov 8, 2026).

The scores are real, published, and downloadable as CSV. What they mean is the interesting part: this is one developer's creativity benchmark, the models are unreleased, and Alibaba has not officially confirmed that the checkpoints are Qwen 4 at all. *(⚠️ Partially verified: scores and prices verified against the benchmark's open CSV; model identity rests on the benchmark maintainer's labeling and tester reports, not an Alibaba announcement.)*

## The demo that started the week

On November 7, developer **Loktar** ([@loktar00](https://x.com/loktar00/status/2118782505369428117)), a member of the House of Qwen ambassador program, posted a 30-second video of a 3D Colosseum packed with animated crowds and torchlight. His caption: "Qwen 4. ARE YOU NOT ENTERTAINED!!!"

The details he confirmed in the thread make it more interesting than the render itself ([Loktar's replies, Nov 7](https://x.com/loktar00/status/2118782505369428117)):

- **One shot, zero tuning.** "First shot! I ran it through a harness (Qwen Code) but since we only get so many tokens I stopped after the first output because it was so good."
- **Pure JavaScript and Three.js.** No Blender, no MCP pipeline.
- **69,000 tokens**, a figure burned into the demo video's own caption ("Qwen 4 (early access) · Qwen Code · 69k tokens"). Developer Herlon Aguiar ([@mxfp0](https://x.com/mxfp0)) flagged it as the most impressive part: 3D scenes normally burn far more.
- **Thinking set to High**, not the higher XHigh or Max tiers.

Loktar says the API came with no model name or specs. Asked whether it was Qwen4-27B, he answered: "I wish I knew, would be amazing if it was!" He's still testing: on November 9 he posted about his "limited Qwen 4 tokens" ([@loktar00](https://x.com/loktar00/status/2119545174799884440)). *(✅ Verified: all quotes read directly from the public X thread, Nov 9, 2026.)*

## What GameFeel Bench actually measures

GameFeel Bench is built and maintained by one developer, **follistatin** ([@follistatindev](https://x.com/follistatindev), GitHub: [kodasdream/gamefeel-benchmark](https://github.com/kodasdream/gamefeel-benchmark)). It is not a general-capability leaderboard like AA or Arena, and it does not pretend to be.

The methodology, from the [project README](https://github.com/kodasdream/gamefeel-benchmark):

- **12 real but unpublished game projects** (roguelikes, MMORPGs, single-player RPGs, survival/sandbox), chosen so no model can have seen them in training.
- **7 subcategories**: coding create, coding bugfix, gamefeel, creativity ideas, visuals, audio, and reverse-evaluation. Roughly 60,000 tasks in total.
- Models are told to add 30 to 100 new items, mechanics and balance changes per game, then graded on whether the additions actually work and stay balanced.
- Coding and reverse-evaluation are answer-key graded, with **Opus 5.5 as the checker**. Gamefeel and creativity are **human-rated**, 1 to 10 per task.

That last point cuts both ways: human rating catches things pass/fail tests miss, but it is one evaluator's taste, and the answer-key checker is itself a contestant. *(✅ Verified: methodology quoted from the project README, Nov 9, 2026.)*

## The scores: Qwen 4 Flash first, Opus 5.5 second

The v1.4 overall table (average of all seven subcategories), verified row by row against the [published CSV](https://github.com/kodasdream/gamefeel-benchmark/blob/main/data/gamefeelbench.csv):

| Model | Effort | Overall score | Price per task |
| --- | --- | --- | --- |
| Qwen-4-Flash-Early | Max | **49.9** | **$0.40** |
| Claude Opus 5.5 | XHigh | 47.2 | $2.60 |
| Claude Sonnet 5.5 | Max | 45.0 | $7.80 |
| Qwen-4-27B-Early | XHigh | 44.6 | $0.16 |

The maintainer [announced the addition on November 8](https://x.com/follistatindev/status/2119220233751671186): "Qwen-4-Flash-Early (codename hawk) added to GameFeel Bench!" The post drew 413K views in a day. He also corrected an audio-score calculation error for the 27B entry in the same update, and says he paid per token for his own early-access API key ([reply screenshot](https://mp.weixin.qq.com/s/vhh9D534JEUtFdek6sryvA)). *(✅ Verified: announcement post and CSV agree; the CSV also lists the Flash checkpoint at 1M context, 240 tokens/sec, 23 minutes per task.)*

The cost gap is the number developers will care about: **$0.40 vs $2.60 per task is 6.5 times cheaper** for the top score. The 27B checkpoint, listed as open-weight at 35GB, scored within 0.4 points of Sonnet 5.5 at **$0.16 per task**, one forty-eighth of Sonnet's $7.80. *(✅ Verified: computed from the CSV's price_per_task_usd column.)*

## What Alibaba has actually confirmed

Very little, so far. The official Qwen account posted a teaser on November 6: "**The becoming begins**," over a poster quoting the classical Zhuangzi line about a giant fish in the northern darkness whose name is left blank. The missing word is "kun," a pun on Qwen. The post passed 2.6M views ([@Alibaba_Qwen](https://x.com/Alibaba_Qwen/status/2118674834632978755)). *(✅ Verified: post read directly, Nov 9, 2026.)*

Chinese media report the family will include Max, Plus, Flash and 27B variants, and that Qwen Code repository updates in late October already referenced `qwen4` and `qwen4-max` identifiers with million-token context support ([QbitAI, Nov 9](https://mp.weixin.qq.com/s/vhh9D534JEUtFdek6sryvA); [Kuai Keji, Nov 8](https://m.mydrivers.com/newsview/1164109.html)). *(⚠️ Partially verified: consistent across outlets but tracing to the same leaks; no Alibaba announcement.)*

The technical direction is public. In August, Alibaba open-sourced **Qwen3.8-Flash-Next** as an explicit preview of the Qwen 4 architecture: 125B total parameters with 6B active, hybrid sparse attention, gated residuals, N-gram embeddings and the Muon optimizer, trained at about 1/9 the cost of Qwen3.7-Plus ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next); see our [August analysis](/posts/qwen4-preview)). If the early checkpoints hold up, that architecture is what produced them.

## The caveats that belong next to the scores

Three limits are easy to lose when a chart goes viral:

1. **Identity is unconfirmed.** The "Qwen-4" names come from the benchmark's labels and tester speculation. Loktar himself does not know which model he is running.
2. **One benchmark, one domain.** GameFeel measures game-development creativity and balance. It says nothing about reasoning, math, or general coding, and its human-rated categories reflect one evaluator.
3. **Early checkpoints are not releases.** Scores can move in either direction before launch, and the maintainer has already corrected one scoring error mid-week.

What survives the caveats is still notable: a Chinese lab's unreleased model is trading blows with Anthropic's best on a public, reproducible test, at 15% of the cost, and the data is open for anyone to check.

## Sources

- [Loktar's demo post and thread](https://x.com/loktar00/status/2118782505369428117) — Nov 7, 2026
- [GameFeel Bench repository and CSV data](https://github.com/kodasdream/gamefeel-benchmark) — v1.4, updated Nov 8, 2026
- [follistatin's announcement](https://x.com/follistatindev/status/2119220233751671186) — Nov 8, 2026
- [Qwen official teaser](https://x.com/Alibaba_Qwen/status/2118674834632978755) — Nov 6, 2026
- [QbitAI's report](https://mp.weixin.qq.com/s/vhh9D534JEUtFdek6sryvA) — Nov 9, 2026 (Chinese)
- [Qwen3.8-Flash-Next official blog](https://qwen.ai/blog?id=qwen3.8-flash-next) — Aug 26, 2026

**Verification summary**: 5 claims ✅ verified against primary public sources (X threads, benchmark CSV/README, official teaser); 2 claims ⚠️ partially verified (model identity, family lineup — no Alibaba confirmation); 0 ❌ unverified; 0 🔴 contradictions. Overall: the benchmark data is solid and open; the "Qwen 4" framing remains an unconfirmed label until Alibaba ships.