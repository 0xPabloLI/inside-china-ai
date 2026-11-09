# Qwen 4 GameFeel leak — source ledger (2026-11-09)

Round slug: `qwen4-gamefeel`. User entry: WeChat article URL (QbitAI/量子位, published 2026-11-09 11:05).
All video/article numbers below were re-verified against primary sources on 2026-11-09, not taken from the QbitAI text.

## User-supplied source

- **QbitAI WeChat article**: https://mp.weixin.qq.com/s/vhh9D534JEUtFdek6sryvA
  - Title: 「Qwen 4疑似偷跑！游戏开发超越Opus 5.5，成本暴降85%」, byline 一水, 2026-11-09 11:05.
  - Captured via web-access CDP (logged-in automation profile), full text + 7 images + 1 embedded video cached to `scripts/short-video/content/qwen4-gamefeel/` (`research/media-cache.json`, `assets/wechat-img-1..7`).
  - Framing is explicitly 疑似 (suspected): the model identity is NOT officially confirmed by Alibaba.

## Primary sources (verified this round)

1. **Loktar demo post** — https://x.com/loktar00/status/2118782505369428117 (2026-11-07 03:08, 27.4K views at capture)
   - Text: "Qwen 4 / ARE YOU NOT ENTERTAINED!!! / This is by far my best result today, at high thinking, not xhigh or max."
   - Thread replies verified: "First shot! I ran it through a harness (Qwen Code) but since we only get so many tokens I stopped after the first output"; "Pure JS and three.js"; on whether it is Qwen4-27B: "I wish I knew, would be amazing if it was!"; on release timing: "I have 0 idea … we're being asked for feedback to improve models."
   - Embedded 30s video: 3D Colosseum (Amphitheatrum Flavium) render, burned-in caption "Qwen 4 (early access) · Qwen Code · 69k tokens", @loktar00 credit top-right. Downloaded from the WeChat CDN mirror → `content/qwen4-gamefeel/assets/loktar-3d-demo.mp4` (1920×1080, 30.47s, h264).
2. **69k tokens attribution** — the number is burned into Loktar's own demo video caption. The quote "tbh i'm most impressed that this took only 69k tokens" is **Herlon Aguiar (@mxfp0)**, Nov 7 (screenshot `wechat-img-1.png`), NOT Loktar. QbitAI's layout makes the attribution ambiguous; do not repeat that ambiguity.
3. **GameFeel Bench v1.4 (primary data)** — https://github.com/kodasdream/gamefeel-benchmark, live site https://kodasdream.github.io/gamefeel-benchmark/
   - Maintainer: follistatin (@follistatindev on X; GitHub kodasdream). One-developer benchmark, not an independent lab.
   - `data/meta.json`: standard v1.4, 27 entries, updated 2026-11-08 15:11.
   - `data/gamefeelbench.csv` fetched via gh api → `content/qwen4-gamefeel/research/gamefeelbench-v1.4.csv`. Verified rows:
     | model | effort | price_per_task_usd | avg | notes |
     |---|---|---|---|---|
     | Qwen-4-Flash-Early | Max | 0.40 | 49.9 | 1M ctx, 23 min/task, 240 tok/s, api billing |
     | Opus-5.5 | XHigh | 2.60 | 47.2 | sub billing |
     | Sonnet-5.5 | Max | 7.80 | 45.0 | |
     | Qwen-4-27B-Early | XHigh | 0.16 | 44.6 | open_weights=yes, 35GB, 1M ctx |
   - Cost ratio: 0.40/2.60 = 15.4% → 6.5× cheaper (QbitAI headline "85% cheaper" ✓).
   - Methodology (README): 12 unpublished games × 7 subcategories ≈ 60K tasks; coding/RE answer-key graded with Opus 5.5 as checker; gamefeel/ideas/visuals/audio human-rated 1–10. Measures game-dev creativity/balance, NOT overall capability.
   - Announcement post: https://x.com/follistatindev/status/2119220233751671186 (2026-11-08 08:07, 413K views): "Qwen-4-Flash-Early (codename hawk) added to GameFeel Bench! (and audio score was calculated wrong for qwen-4-27b, a genuine mistake that was fixed)".
   - Maintainer early-access confirmation: @follistatindev reply "they made me pay by the token for the early access API key they gave me" (screenshot `wechat-img-4.png`).
   - Live-site capture: `assets/gamefeel-site-overview.png` (3456×1816, CDP screenshot 2026-11-09, shows "BEST OVERALL 49.9 Qwen-4-Flash-Early · Max").
4. **Qwen official teaser** — https://x.com/Alibaba_Qwen/status/2118674834632978755 (2026-11-06): "The becoming begins." Poster: 北冥有鱼 其名为_ (庄子·逍遥游, 鲲→Qwen pun). 2.6M views / 18K likes at capture. Screenshot `wechat-img-5.png` (942×970).
5. **Loktar ongoing tests** — https://x.com/loktar00/status/2119418409264070688 (Nov 8): "Qwen 4 vs Deepseek Jungle Temple … Qwen 4 is incredibly efficient"; https://x.com/loktar00/status/2119545174799884440 (Nov 9): "my limited Qwen 4 tokens". Confirms ongoing early access, token-limited.

## Secondary context (from QbitAI article, NOT independently re-verified)

- Lineup Max/Plus/Flash/27B; Qwen Code repo identifiers `qwen4`/`qwen4-max` + 1M context adaptation (late Oct); Qwen3.8-Flash-Next architecture preview (125B total / 6B active, ~1/9 training cost of Qwen3.7-Plus) — the architecture numbers match our own 2026-08-30 `qwen4-preview` article which verified them against the official Qwen blog.
- "One More Thing" rumors (GPT-6.2 Astra in Codex stats, Fable 5.5 gray test, Gemini 4 Carbon Nov 9) — rumor-grade, excluded from the video spine.
- Chinese media echo (163/sina/mydrivers/zol, Nov 8–9): same numbers, all trace back to the same GameFeel CSV; no independent confirmation. 快科技 adds Qwen4-27B cost $0.16 ✓ matches CSV.

## Caveats that must survive into the copy

- Model identity unconfirmed: Alibaba has not said these checkpoints are Qwen 4. Loktar himself: "I wish I knew."
- One developer's benchmark; game-dev creativity only; human-rated subcategories; Opus 5.5 is both a contestant and the answer-key checker.
- Early checkpoints ≠ release performance.

## Asset prefetch dispositions (Stage 0, #293)

- `asset-gaps --query "qwen,alibaba"`: 0 open gaps.
- Loktar 3D demo video → **prefetch** (downloaded, this package; catalog entry added).
- GameFeel leaderboard evidence → **prefetch** (live-site CDP capture + CSV archive).
- Qwen teaser poster → **prefetch** (QbitAI mirror screenshot; original post verified).
- Qwen/Alibaba official logo asset → **accepted-gap** (no clean logo in library; teaser poster carries the wordmark; scenes use brand typography instead).
- Anthropic logo → **accepted-gap** (named in copy only; existing baidu_search anthropic image is a news photo, not a logo).