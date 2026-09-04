# Company Profile: Huawei (Ascend / Pangu)

> Last updated: 2026-08-08

## Basic Info

- **Full name**: Huawei Technologies Co., Ltd. (华为技术有限公司)
- **Founded**: 1987
- **Founder**: Ren Zhengfei (任正非)
- **Type**: Multinational technology (telecom equipment, consumer electronics, AI chips, cloud)
- **Headquarters**: Longgang, Shenzhen, Guangdong
- **Ownership**: Private (employee shareholding scheme; not publicly listed)
- **Employees**: ~207,000+ (2023)

## AI Division

Huawei's AI efforts span two divisions:

### 1. Ascend (昇腾) — AI Chip Division

- **Product line**: Ascend series AI processors (NPUs)
- **Key chips**: Ascend 910, 910B, **950** (latest, 2025-2026)
- **Super-node**: Huawei 950 super-node system — can replace Nvidia GB200/GB300 in performance and price (50-100% more expensive, acceptable)
- **Ecosystem**: CANN (Compute Architecture for Neural Networks) — alternative to Nvidia CUDA
- **Production capacity**: Limited — the primary bottleneck for domestic AI chip adoption

### 2. Pangu Team — AI Model Division

- **Team name**: Pangu (盘古) Team
- **Products**: Pangu series large language models
- **Enterprise API**: Huawei Cloud
- **Open source strategy**: Limited — primarily enterprise-focused
- **Commercial model**: Enterprise cloud + government partnerships + telecom infrastructure

## AI Chip Performance (from DeepSeek Partnership)

> The following data comes from Liang Wenfeng's investor meeting (May 2026), providing the most detailed public assessment of Huawei's AI chip capabilities by a major customer.

| Metric                | Huawei 950              | Nvidia GB300 | Ratio/Lag                           |
| --------------------- | ----------------------- | ------------ | ----------------------------------- |
| Performance ratio     | 1                       | 4            | **4 Huawei = 1 Nvidia**             |
| Technology lag        | —                       | —            | **2 years behind**                  |
| Price premium         | —                       | —            | 50-100% more expensive (acceptable) |
| Depreciation          | ~3 years                | ~5 years     | Shorter lifespan                    |
| Super-node capability | Can replace GB200/GB300 | Baseline     | Performance + price competitive     |

Source: `docs/refs/source-materials/deepseek-liang-investor-meeting-research.md`

### Huawei–DeepSeek Partnership

- Huawei allocated **16,000 Huawei 950 cards** to DeepSeek (vs 100K+ for internet giants)
- DeepSeek participates deeply in Huawei's ecosystem
- DeepSeek building **TileLang** (custom high-level compiler) to replace CUDA on Huawei chips
- V3 already trained on Nvidia chips **without CUDA** (using TileLang) — efficiency loss only 1-2%
- Plan: replicate the same stack on Huawei chips
- Quote: "Our purpose in buying Huawei 950 is to help Huawei build a good ecosystem" — Liang Wenfeng

### Key Quote on Huawei's Moat

> "Nvidia's CUDA moat is being rapidly dismantled. We can build an ecosystem identical to Nvidia's." — Liang Wenfeng

> "Nvidia is digging its own grave" — by restricting chip access, forcing everyone to develop domestic alternatives

## Model Releases

| Date | Model          | Type    | Key Details                                             | Source                    |
| ---- | -------------- | ------- | ------------------------------------------------------- | ------------------------- |
| 2021 | Pangu α        | LLM     | 200B parameters                                         | Huawei announcements      |
| 2023 | Pangu Series 2 | LLM     | Industry-specific models (mining, railway, meteorology) | Huawei Cloud              |
| 2024 | Pangu 3.0      | LLM     | Improved industry models                                | Huawei Cloud              |
| 2025 | Ascend 950     | AI Chip | Latest generation, 4:1 vs Nvidia GB300                  | DeepSeek investor meeting |

## Funding History

Huawei is private (employee-owned). No external funding rounds. Revenue funds R&D.

| Year | Revenue           | Notes                                                |
| ---- | ----------------- | ---------------------------------------------------- |
| 2023 | ~$99B (700B RMB)  | Despite US sanctions                                 |
| 2024 | ~$118B (860B RMB) | Strong recovery, driven by smartphone + auto + cloud |

## Key People

| Name                      | Role                     | Notes                                                   | Source                                            |
| ------------------------- | ------------------------ | ------------------------------------------------------- | ------------------------------------------------- |
| **Ren Zhengfei (任正非)** | Founder                  | Former PLA officer. Founded Huawei in 1987 with $5,000. | [Wikipedia](https://en.wikipedia.org/wiki/Huawei) |
| Meng Wanzhou (孟晚舟)     | CFO, Rotating Chairwoman | Ren's daughter. Detained in Canada 2018-2021.           | [Wikipedia](https://en.wikipedia.org/wiki/Huawei) |

## Compute Infrastructure

- **Chips**: Self-designed Ascend series (910, 910B, 950)
- **Export restrictions**: Huawei on US Entity List since 2019 — cannot purchase advanced Nvidia chips or manufacturing equipment
- **Manufacturing**: Relies on domestic semiconductor supply chain (SMIC for advanced nodes)
- **Production capacity**: The primary bottleneck — "Huawei's problem is still insufficient production capacity" (Liang Wenfeng)
- **Cloud**: Huawei Cloud — major Chinese cloud provider

## Notable Events

- **2019**: Added to US Entity List — restricted from buying US technology (chips, software)
- **2020**: Sanctions tightened — restricted access to foreign semiconductor manufacturing
- **2023**: Mate 60 Pro launch with domestic 7nm chip — surprised the world
- **2025**: Ascend 950 deployed — 4:1 performance ratio vs Nvidia GB300
- **2025-2026**: DeepSeek partnership — TileLang ecosystem development
- **Jul 2026**: Liang Wenfeng prediction — "within 1 year, domestic chip ecosystem will be proven viable"

### US-China Chip Gap Assessment (from Liang Wenfeng)

> "Our gap with the US in chips: no ecosystem gap going forward, but in hardware it's 4x plus 2 years."

> "Domestic AI chip hardware and ecosystem are fine — the only problem is insufficient production capacity."

> "In a normal commercial environment where NVIDIA cards are available, domestic substitution is hard. But when you can't buy NVIDIA, everyone is forced to use domestic chips."

Source: `docs/refs/source-materials/deepseek-liang-investor-meeting-research.md`

## Brand System Note

Huawei is listed in the `brand-system.md` entity color mapping as **Red** (`--red` `#ef4444`) — semantic: threat/breaking, reflecting US sanctions and geopolitical tension context.

## Sources

- [Wikipedia — Huawei](https://en.wikipedia.org/wiki/Huawei)
- DeepSeek investor meeting transcript — `docs/refs/source-materials/deepseek-liang-investor-meeting-research.md` (primary source for chip performance data)
- Widget data: `src/components/widgets/deepseek/data/companies.ts` (Huawei quotes from Liang Wenfeng)
- `docs/brand-system.md` — Entity color mapping
