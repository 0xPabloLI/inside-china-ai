# Research Angle Templates

Load this file during Phase 2 (PLAN) when the research topic matches a domain below.
Pick the angles that apply — don't use all of them blindly. Each angle maps to
2-4 search queries to seed Phase 3 (RETRIEVE).

## TikTok / Short-Form Video

Use when researching TikTok, Instagram Reels, YouTube Shorts, or short-form
video strategy.

| Angle | Search queries (examples) | Key sources |
|-------|--------------------------|-------------|
| **Algorithm & ranking** | "tiktok algorithm 2026 ranking signals", "tiktok for you page how it works 2025 2026" | Hootsuite, Sprout Social, PostEverywhere, Darkroom Agency |
| **Hook & retention** | "tiktok first 3 seconds hook best practices", "short form video completion rate 2025 2026" | TikTok official, Buffer, Social Media Examiner |
| **Visual design & color** | "tiktok video color strategy dark vs light background", "color psychology social media video marketing" | Art of Styleframe, AlmostZero, Instagram Growth Coach |
| **SEO & discoverability** | "tiktok seo keywords hashtags 2026", "tiktok search value captions" | Buffer, Hootsuite, Search Engine Journal |
| **Publishing strategy** | "tiktok best posting frequency 2026", "tiktok off-peak posting engagement" | Buffer, Sprout Social |
| **Content format** | "tiktok motion graphics vs UGC performance", "data visualization short form video engagement" | Art of Styleframe, goviral global, Archive App |
| **Technical specs** | "tiktok video resolution fps format requirements 2025" | TikTok official help center |
| **Algorithm penalties** | "tiktok content not recommended 2026", "tiktok 200 view jail" | Hootsuite, Sprout Social |

**Platform-specific sources to prioritize**:
- TikTok official: business.tiktok.com, TikTok for Business blog
- Analytics firms: Sprout Social, Hootsuite, Buffer, Influencer Marketing Hub
- Design/creative: Art of Styleframe, Darkroom Agency, Canva

## China AI / Tech Industry

Use when researching Chinese AI companies, tech policy, or China tech market.

| Angle | Search queries (examples) | Key sources |
|-------|--------------------------|-------------|
| **Company fundamentals** | "[company] funding valuation 2025 2026", "[company] products technology" | 天眼查, 企查查, Wikipedia, company official |
| **Market analysis** | "china ai market size 2026", "china ai policy regulation 2025 2026" | Bloomberg, Reuters, FT, 36氪, 快科技 |
| **Technical capabilities** | "[company] model benchmark performance", "[company] open source vs proprietary" | arXiv papers, Hugging Face, company technical blog |
| **Geopolitical context** | "us china ai chip export control 2026", "china ai self-sufficiency" | Reuters, Bloomberg, CSIS, Brookings |
| **Talent & org** | "[company] key researchers executives", "china ai talent flow 2025 2026" | LinkedIn, company about pages, media profiles |

**Source access notes**:
- 天眼查/企查查 search pages: accessible via CDP, detail pages need login
- 国家企业信用信息公示系统: needs browser interaction, not headless-accessible
- Wikipedia REST API: `curl` accessible if DNS resolves; otherwise use CDP
- English media (Bloomberg, Reuters, FT): partial paywall — CDP with login state helps

## ML/AI Model Selection

Use when researching which ML/AI model to use for a specific task (VLM, TTS,
ASR, digital human, embedding, etc.).

| Angle | Search queries (examples) | Key sources |
|-------|---------------------------|-------------|
| **Task match & benchmark** | `[model] [target task] benchmark`, `[model] technical report` | Official tech reports, model cards, task-specific leaderboards. Record eval set, version, settings, date. |
| **Real workload evaluation** | `[model] [project workload] quality latency` | Reproducible tests on project samples. Record hardware, runtime, quantization, preprocessing, metrics. |
| **Apple Silicon / runtime** | `[model] MLX support`, `[model] llama.cpp GGUF`, `[model] Apple Silicon` | Runtime official docs, model repos, local smoke test. Distinguish "downloadable" from "actually runs on target hardware". |
| **License & supply chain** | `[model] license commercial use`, `[model] LICENSE` | Model card, repo `LICENSE`, upstream weights & dependency licenses. Record commercial restrictions, redistribution limits, version. |
| **Toolchain & quantization** | `[model] 4bit MLX`, `[model] GGUF`, `[model] runtime support` | Official/maintainer repos, quantization release pages, local load test. Record format, quant method, maintenance status. |
| **Risk & maintenance** | `[model] issue`, `[model] regression`, `[model] release notes` | Upstream issues, release notes, project tests. Distinguish fixed, avoidable, and unverified risks. |

**Decision rule**: Public benchmarks are screening evidence only — they cannot
replace real-world testing on target hardware with actual project workloads.
Conclusions must explain "why this model fits this task" and retain uncertainty
for unverified items.

## General / Cross-Domain

For topics that don't fit a specific template above. Generate angles from these
default perspectives:

| Angle | Focus | Default queries |
|-------|-------|----------------|
| **Overview** | Definitions, scope, current state | "[topic] overview 2025 2026", "what is [topic]" |
| **Technical** | How it works, implementation, specs | "[topic] technical architecture", "[topic] how it works" |
| **Market** | Size, trends, key players, competition | "[topic] market size 2026", "[topic] industry report" |
| **Contrarian** | Criticism, limitations, failure cases | "[topic] criticism problems", "[topic] failed" |
| **Primary sources** | Official docs, specs, first-party | "[topic] official documentation", "[topic] specification" |

## Creating Custom Angle Templates

If you research a domain repeatedly and it's not covered above, create a new
section here after a successful research run. Document:
1. The angles that proved useful (not the ones you planned, the ones that delivered)
2. The search queries that found the best sources
3. The sources that were Tier 1 (worth returning to)

This file grows into a domain knowledge base — each research run makes the next one faster.
