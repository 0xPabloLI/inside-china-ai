# Source ledger — The Information: Astra becomes the top distillation target (2026-10-28)

Compiled 2026-10-29 for the `deepseek-astra-distillation` video pack.
User-supplied source: WeChat screenshot of a BlockBeats flash (11:39, 2026-10-29).

## 1. Primary source

| Field | Value |
| --- | --- |
| Outlet | The Information |
| Title | "OpenAI's Astra Model Becomes Top Distillation Target for China's AI Labs" |
| URL | https://www.theinformation.com/articles/openais-astra-model-becomes-top-distillation-target-chinas-ai-labs |
| Byline | Jing Yang, Juro Osawa, Qianer Liu |
| Published | 2026-10-28, 6:00pm PDT (paywalled; only the headline, byline and timestamp were readable) |

Read status: **headline + byline verified on the live page; body paywalled.** Every claim below
attributed to "The Information" reaches us through Chinese relay coverage, not through the
article body. This is recorded so the video never presents a relay as the original.

## 2. Relay coverage (what the claim actually says)

- **BlockBeats flash 374297** — https://m.theblockbeats.info/flash/374297 (fetched 2026-10-29).
  The user's screenshot. Key statements:
  - DeepSeek's V4.1-Flash-1017 (shipped 2026-10-17) and Moonshot's Kimi K3.1 Pro both "heavily
    used OpenAI GPT-6 Astra outputs for distillation during training", per multiple people with
    direct knowledge.
  - Browser Use's 180 real-web-task test: DeepSeek 70.9 → 75.0, close to Astra's 77.9; per-task
    model cost $0.22 vs Astra's $10.77, "nearly 49×".
  - Claude had been the main target; Anthropic tightened protections over the past two months,
    making reasoning extraction much harder, so Chinese labs turned to Astra.
  - Liang Wenfeng had not wanted V4 to depend on distillation; after seeing Zhipu GLM and other
    Chinese competitors progress through it, he yielded to competitive pressure.
- **Baijiahao commentary (2026-10-28)** — https://baijiahao.baidu.com/s?id=1880362865828817184
  Corroborates the report's existence, date and framing, and states the reporting published no
  data, logs or verifiable material and relied on anonymous sources. Also supplies the policy
  timeline: Feb 2026 OpenAI memo to Congress; 2026-09-08 NSA/FBI/CISA joint advisory naming six
  Chinese AI companies for "industrial-scale distillation"; 2026-09-30 OpenAI says it disrupted an
  "adversarial distillation" operation linked to Moonshot; 2026-10-19 DHS order to remove DeepSeek
  from federal civilian systems.
- **TMT Post (2026-10, on the earlier fingerprint accusation)** — https://www.tmtpost.com/8174789.html
  Before The Information's story, developers ran V4.1-Flash-1017 through ModelTrace and circulated
  a screenshot showing 84.66% GPT-6 Astra / 90.71% GPT family. TMT Post's debunk: ModelTrace's
  reference database is mostly GPT and Claude models and contains **no DeepSeek entry**, and the
  tool itself warns that a model absent from its database cannot be identified from its output.

## 3. Independent verification of the numbers (not from the relays)

**Browser Use Bench v2.1 leaderboard** — https://browser-use.com/leaderboard (fetched 2026-10-29;
page states "180 tasks | October 17, 2026"):

| Model | Score / 100 | Model cost / task | Median time |
| --- | --- | --- | --- |
| GPT-6.1 Sol medium | 79.6 | $1.30 | 8 min |
| GPT-6 Astra medium | 77.9 | $10.77 | 9 min |
| DeepSeek V4.1 Flash 1017 max | 75.0 | $0.22 (22¢) | 17 min † |
| Claude Opus 5.5 high | 75.0 | $2.35 | 12 min |
| DeepSeek V4.1 Flash max (previous) | 70.9 | $0.18 (18¢) | 18 min |

† different CI runners, so the time is not comparable. 10.77 / 0.22 = 48.95, so "49×" holds.
75.0 vs 77.9 = 2.9 points apart; 70.9 → 75.0 = +4.1.

## 4. Context verified elsewhere

- **Kimi K3.1 Pro** shipped 2026-10-24: 2.8T params, ~104B active, 1M context, weights promised by
  2026-11-04; Artificial Analysis Intelligence Index 55 (4th, highest open-weight); Terminal-Bench
  4.0 65.7% vs GPT-6 Astra 58.2% and Claude Opus 5.5 66.4% (self-reported, via China Daily
  2026-10-27 and multiple Chinese outlets).
- **GPT-6 Astra** shipped 2026-09 (GPT-6.1 Sol followed); API pricing quoted at $10 input / $50
  output per million tokens in secondary coverage.
- **Artificial Analysis Intelligence Index v5** (2026-10-28): DeepSeek V4.1 Flash 1017 scores 32 vs
  Claude Opus 5.5's 58. Not used in the video; noted so the pack does not imply the 75.0 Browser
  Use score is a general capability score.

## 5. Editorial decisions for this pack

1. **The accusation is reported, never asserted.** Every sentence that states distillation is
   framed with "The Information reported / the report says".
2. **The evidentiary status is a scene, not a footnote.** Anonymous sources and the ModelTrace
   database gap both appear on screen.
3. **The 49× is a cost-per-task ratio, not a training-cost ratio.** The video says "per task".
4. **No claim that either company responded or declined.** No public statement from DeepSeek or
   Moonshot was found in the search window; absence of a statement was not verifiable enough to
   put on screen.
5. **Not used:** BlockBeats' AI summary line calling this Liang's "second concession" (the July
   funding round). That is commentary, not reporting, and the funding figure is unverified here.
