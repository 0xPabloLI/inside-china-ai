# Source Materials Index

> Last updated: 2026-08-08
> This index maps all source materials → articles → video content in the China AI News content pipeline.
> For RAG indexing: materials are indexed by `##` heading; articles by `##` section; scene-data by scene.

## Materials → Articles → Videos

| Source Material | Topic | Article | Video Parts | Status |
|----------------|-------|---------|-------------|--------|
| `deepseek-liang-investor-meeting-research.md` | DeepSeek 融资/AGI 路线/算力 | `deepseek-art-of-restraint` | `deepseek` (standalone) + `restraint/pt1` + `restraint/pt3` | ✅ Published |
| `china-llm-distillation-research.md` | 蒸馏风波/加密 CoT/基准测试 | `china-llm-distillation-storm` | `distillation/pt1` + `distillation/pt2` + `distillation/pt3` | ✅ Published |
| `bytedance-zhang-yiming-no-distillation-research.md` | ByteDance 反蒸馏政策 | `bytedance-zhang-yiming-no-distillation` | `bytedance-distillation` (standalone) | ✅ Published |

### Original PDF Sources

| PDF (original) | Structured MD | Status |
|----------------|--------------|--------|
| `梁文锋投资者交流会-录音转文本.pdf` | `deepseek-liang-investor-meeting-research.md` | ✅ Structured (WP-1) |
| `china-llm-distillation-source.pdf` | `china-llm-distillation-research.md` | ✅ Structured (WP-1) |
| ~~`国内大模型蒸馏风波的来龙去脉(1).pdf`~~ | — | ❌ Deleted (duplicate of above, same MD5) |

## Company Profiles

| Company | Profile File | Key Topics | Last Updated |
|---------|-------------|------------|-------------|
| DeepSeek | `docs/refs/company-profiles/deepseek-profile.md` | AGI, open-source, funding, compute gap | 2026-08-08 |
| ByteDance (Seed/Doubao) | `docs/refs/company-profiles/bytedance-profile.md` | Anti-distillation, TikTok relationship, H20 chips | 2026-08-08 |
| Moonshot AI (Kimi) | `docs/refs/company-profiles/moonshot-profile.md` | K3, distillation accusation, $35B funding, identity bleed | 2026-08-08 |
| MiniMax | `docs/refs/company-profiles/minimax-profile.md` | Stock crash, distillation (largest volume), HKEX listing | 2026-08-08 |
| Alibaba (Qwen) | `docs/refs/company-profiles/alibaba-profile.md` | Qwen team, distillation accusation (BBC), inconsistent benchmarks | 2026-08-08 |
| Baidu (ERNIE) | `docs/refs/company-profiles/baidu-profile.md` | ERNIE team, Wenxin Yiyan | 2026-08-08 |
| Huawei (Ascend/Pangu) | `docs/refs/company-profiles/huawei-profile.md` | Ascend 950, chip export controls, CANN ecosystem | 2026-08-08 |

## Event Timelines

| Event | Timeline File | Key Period | Last Updated |
|-------|-------------|------------|-------------|
| US-China AI Distillation Dispute | `event-timelines/distillation-dispute-timeline.md` | Apr 2023 – Aug 2026 | 2026-08-08 |
| China AI Chip Export Controls | `event-timelines/chip-export-controls-timeline.md` | May 2019 – Aug 2026 | 2026-08-08 |
| DeepSeek Development | `event-timelines/deepseek-development-timeline.md` | Jul 2023 – Aug 2026 | 2026-08-08 |
| China LLM Benchmark Controversies | `event-timelines/china-llm-benchmark-leaderboard.md` | Feb 2026 – Aug 2026 | 2026-08-08 |

## Widget Data Documentation

> Widget data files document the hardcoded TypeScript data in `src/components/widgets/`.
> For RAG: widget data is NOT directly indexed. The `extract-widget-sources.mjs` script will extract `sourceUrl`/`url` fields, fetch original sources, and index those (Grill Q11 decision).

| Widget Data Doc | Widget Component | Related Article | Key Data |
|----------------|-----------------|----------------|----------|
| `widget-data/deepseek-agi-roadmap.md` | `deepseek-agi-roadmap` | deepseek-art-of-restraint | 6-step AGI path |
| `widget-data/deepseek-api-pricing.md` | `deepseek-api-pricing` | deepseek-art-of-restraint | $0.14/M tokens pricing comparison |
| `widget-data/deepseek-cloud-keywords.md` | `deepseek-cloud` | — (not embedded) | Cloud keyword analysis |
| `widget-data/deepseek-companies.md` | `deepseek-companies` | — (not embedded) | Company ecosystem comparison |
| `widget-data/deepseek-funding.md` | `deepseek-funding` | — (not embedded) | Funding history timeline |
| `widget-data/deepseek-oss-comparison.md` | `deepseek-oss-comparison` | deepseek-art-of-restraint | Open-source strategy comparison |
| `widget-data/deepseek-pricing.md` | `deepseek-pricing` | — (not embedded) | Detailed pricing breakdown |
| `widget-data/deepseek-talent.md` | `deepseek-talent` | — (not embedded) | Talent departure tracker |
| `widget-data/deepseek-vision-keywords.md` | `deepseek-vision` | — (not embedded) | Vision keyword analysis |
| `widget-data/distillation-news-coverage.md` | `distillation-news-coverage` | china-llm-distillation-storm + bytedance | News coverage timeline |
| `widget-data/kimi-benchmark-controversy.md` | `distillation-benchmark` | china-llm-distillation-storm | K3 benchmark vs reality |
| `widget-data/minimax-stock-timeline.md` | `distillation-minimax-stock` | china-llm-distillation-storm | MiniMax stock crash HK$1,330→186 |
| `widget-data/moonshot-funding-timeline.md` | `distillation-moonshot-funding` | china-llm-distillation-storm | Moonshot $3.5B funding + IPO |

## Entity Registry

| Type | Count | File | Description |
|------|-------|------|-------------|
| Companies | 18 | `docs/refs/entity-registry.yaml` | Chinese AI (7) + US AI (3) + chip (1) + other (7) |
| People | 10 | `docs/refs/entity-registry.yaml` | Founders, researchers, executives |
| Models | 26 | `docs/refs/entity-registry.yaml` | LLMs from DeepSeek, ByteDance, Moonshot, MiniMax, Alibaba, Tencent, Zhipu, Xiaomi, OpenAI, Anthropic, Google, xAI |

## Research Reports

| Report | Topic | File |
|--------|-------|------|
| Multi-Video Splitting Best Practices | TikTok multi-part video strategy | `docs/research/multi-video-splitting-best-practices.md` |
| TikTok Color Scheme Research | Visual brand consistency | `docs/research/tiktok-color-scheme-research.md` |

## TikTok Skills Reference Library

| Document | Topic | File |
|----------|-------|------|
| Content Methodology | 8-section TikTok playbook (品类战略, hook 公式, 节奏控制, etc.) | `docs/refs/tiktok-skills/content-methodology.md` |
| TikTok Best Practices | Production + publishing guidelines | `docs/tiktok/tiktok-best-practices.md` |

## Golden Query Evaluation Set

| File | Queries | Coverage |
|------|---------|----------|
| `docs/refs/rag-eval/golden-queries.yaml` | 18 | Cross-language (5) + Entity alias (4) + Data points (5) + Negative (3) + Methodology (3) |

---

## RAG Indexing Summary

| Content Type | Source | Chunking | Chunk Count (est.) | RAG Ready |
|-------------|--------|----------|-------------------|-----------|
| Articles | `articles/*.md` | By `##` section | ~15 | ✅ |
| Scene-data | `scripts/short-video/content/**/scene-data.mjs` | By scene | ~70 | ✅ (with WP-6 metadata) |
| Source materials | `docs/refs/source-materials/*.md` | By `##` section | ~20 | ✅ |
| Event timelines | `docs/refs/source-materials/event-timelines/*.md` | By `##` section | ~12 | ✅ |
| Company profiles | `docs/refs/company-profiles/*.md` | By `##` section | ~35 | ✅ |
| Research reports | `docs/research/*.md` | By `##` section | ~8 | ✅ |
| TikTok reference | `docs/refs/tiktok-skills/**/*.md` | By `##` section | ~15 | ✅ |
| Widget sources | Extracted from widget TS `sourceUrl`/`url` fields | By `##` section | TBD | ⏳ (requires extract-widget-sources.mjs) |

**Estimated total chunks**: ~175 (excluding widget sources)

> **RAG implementation threshold**: ✅ Met (2026-08-08). 60+ indexable content files / ~175 chunks.
> Phase 1 代码实施可以直接启动，读 `docs/tickets-rag.md` 从 T-10 开始。
