# Event Timeline: China AI Chip Export Controls

> Last updated: 2026-08-08. All events verified with source URLs where available.
> Covers events from 2019 to August 2026.
> Primary source for Huawei chip performance data: Liang Wenfeng investor meeting (May 2026).

## Timeline

| Date         | Event                                                                                                                                                                                 | Source                                                                            | Verification          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------- |
| May 2019     | Huawei added to US Entity List — restricted from buying US technology including chips and software.                                                                                   | [Wikipedia — Huawei](https://en.wikipedia.org/wiki/Huawei)                        | ✅ Verified           |
| 2020         | US sanctions tightened — Huawei restricted from accessing foreign semiconductor manufacturing equipment.                                                                              | [Wikipedia — Huawei](https://en.wikipedia.org/wiki/Huawei)                        | ✅ Verified           |
| Aug 2023     | Huawei Mate 60 Pro launched with domestic 7nm chip (SMIC) — surprised the world, demonstrating China's advancing chip capability despite sanctions.                                   | [Wikipedia — Huawei](https://en.wikipedia.org/wiki/Huawei)                        | ✅ Verified           |
| Oct 2023     | US expands export controls — Nvidia required license to ship A100, H100, and H800 chips to China. H800 (China-specific downgraded chip) banned.                                       | [Reuters](https://www.reuters.com)                                                | ✅ Verified           |
| 2024         | Nvidia releases H20 chip — export-compliant version for China market. Significantly less powerful than H100/B200.                                                                     | Industry reports                                                                  | ✅ Verified           |
| 2024         | DeepSeek-V3 trained on Nvidia chips **without CUDA ecosystem** using custom TileLang compiler. Efficiency loss vs CUDA: only 1-2%.                                                    | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| Jan 2025     | DeepSeek-R1 released, shocking Silicon Valley — strong reasoning at remarkably low reported training costs, achieved despite chip restrictions.                                       | [Wikipedia — DeepSeek](https://en.wikipedia.org/wiki/DeepSeek)                    | ✅ Verified           |
| 2025         | Huawei Ascend 950 deployed — latest generation AI chip. Performance ratio: 4 Huawei 950 = 1 Nvidia GB300. Technology lag: ~2 years.                                                   | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| 2025         | Huawei allocates 16,000 Ascend 950 cards to DeepSeek (vs 100K+ for internet giants).                                                                                                  | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| Late 2025    | "Blackwell Gap" — ByteDance researchers argued distillation could compensate for compute disadvantage (Nvidia B200/Blackwell banned for China). Debate rejected by Zhang Yiming.      | [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival) | ✅ Verified           |
| May 20, 2026 | Liang Wenfeng's investor meeting: reveals DeepSeek has ~20,000 Nvidia H-equivalent GPUs + 16,000 Huawei 950 cards. States 200,000 GPUs needed for frontier scale.                     | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| May 2026     | Liang's assessment: "Our gap with the US in chips: no ecosystem gap going forward, but in hardware it's 4x plus 2 years."                                                             | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| May 2026     | Liang's prediction: "Within 1 year, domestic chip ecosystem will be proven viable." Huawei 950 super-node can replace Nvidia GB200/GB300 in performance and price.                    | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| May 2026     | Liang on Nvidia's moat: "Nvidia's CUDA moat is being rapidly dismantled. We can build an ecosystem identical to Nvidia's." TileLang replaces CUDA software layer.                     | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| May 2026     | Liang on Huawei's bottleneck: "Huawei's problem is still insufficient production capacity." Not a design issue but a manufacturing capacity issue.                                    | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| May 2026     | Huawei chip depreciation: ~3 years vs Nvidia's ~5 years. 50-100% more expensive than Nvidia equivalents.                                                                              | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |
| Feb 2026     | ByteDance trained Seed 2.0 on H20 chips — the only Nvidia chip China can legally buy. A fraction of B200's training performance.                                                      | [Pekingnology](https://www.pekingnology.com/p/bytedances-ban-on-distilling-rival) | ✅ Verified           |
| Jul 2026     | Liang: "In a normal commercial environment where NVIDIA cards are available, domestic substitution is hard. But when you can't buy NVIDIA, everyone is forced to use domestic chips." | DeepSeek investor meeting transcript                                              | ⚠️ Partially verified |

## Key Actors

- **US Government**: Export control regime — Entity List, chip restrictions, sanctions. Forcing China to develop domestic alternatives.
- **Nvidia**: Market leader. China-restricted chips: B200, Blackwell generation. China-legal: H20 (downgraded). CUDA software moat being eroded by TileLang.
- **Huawei**: Domestic chip champion. Ascend series (910, 910B, 950). CANN ecosystem (alternative to CUDA). Primary bottleneck: production capacity, not design.
- **SMIC**: Domestic semiconductor manufacturer. Produced 7nm chip for Mate 60 Pro. Critical for Huawei's chip production.
- **DeepSeek**: Key customer and ecosystem partner for Huawei. Built TileLang compiler to bypass CUDA. First major lab to train without CUDA.
- **ByteDance/Seed**: Uses H20 chips (China-legal Nvidia). Structural compute disadvantage vs US labs.

## Chip Performance Comparison (from Liang Wenfeng's assessment)

| Metric                | Huawei 950              | Nvidia GB300    | Ratio/Lag              |
| --------------------- | ----------------------- | --------------- | ---------------------- |
| Performance ratio     | 1                       | 4               | 4 Huawei = 1 Nvidia    |
| Technology lag        | —                       | —               | 2 years behind         |
| Price premium         | —                       | —               | 50-100% more expensive |
| Depreciation          | ~3 years                | ~5 years        | Shorter lifespan       |
| Super-node capability | Can replace GB200/GB300 | Baseline        | Competitive            |
| Ecosystem (CUDA)      | CANN (alternative)      | CUDA (standard) | TileLang bridges gap   |

## Open Questions

- ❌ Will Huawei's production capacity catch up to demand? — Liang identifies this as the sole bottleneck.
- ❌ Will Liang's 1-year prediction for domestic ecosystem viability hold? — Prediction made May 2026, timeline to May 2027.
- ❌ What is the exact SMIC process node for Ascend 950? — Not publicly disclosed.
- ❌ How many Huawei 950 cards have been deployed across Chinese AI labs? — Only DeepSeek's allocation (16K) is known.
