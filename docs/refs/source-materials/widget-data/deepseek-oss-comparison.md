# Widget Data: deepseek-oss-comparison

> Exported from `src/components/widgets/deepseek-oss-comparison/data/companies.ts`
> Widget type: 开源策略对比表（OSS strategy comparison table）— 5 家中国 AI 公司开源策略
> Last updated: 2026-08-07 (git: 2026-08-07 23:28:14 +0800)
> View component: `src/components/widgets/deepseek-oss-comparison/oss-comparison-view.tsx` → `OSSComparisonView`

## Data

### Companies (5 entries)

| Company | Open Source Strategy | Flagship Models | Community Engagement | Commercial Model |
|---------|---------------------|-----------------|----------------------|-----------------|
| DeepSeek | Core strategy — models are intentionally open-sourced as part of company vision | DeepSeek-V3, DeepSeek-Coder, DeepSeek-MoE | Active — provides deployment help, encourages third-party use | API at 10-month hardware cost recovery (6x profit), enterprise hosting |
| Zhipu AI (GLM) | Reactive — open-sources after closed-source commercial releases | GLM-4, GLM-5.2 (744B MoE) | Moderate — releases weights but limited support | API + enterprise licensing + cloud services |
| Alibaba (Qwen) | Hybrid — tiered releases with gated access for larger models | Qwen2.5-72B, Qwen2-VL | Limited — some open weights, heavy enterprise focus | API + cloud integration + enterprise solutions |
| ByteDance (Doubao) | Minimal — primarily closed-source, internal use | Doubao (internal), limited public releases | None — models not available to public | Integrated into products (TikTok, Douyin), enterprise API |
| Moonshot AI (Kimi) | Selective — open-sourced K3 after closed-source period | Kimi K3 (2.8T MoE) | Limited — open weights but focused on product | C-end app + API + enterprise solutions |

## Sources

- No explicit `sourceUrl` field in data.
- Comparison data derived from:
  - 梁文锋投资者交流会-录音转文本 (DeepSeek's own open source philosophy statements)
  - Public model releases and announcements from each company
  - Hugging Face model pages (for open weight availability verification)

## Related Articles

- Embedded in `deepseek-art-of-restraint` via `<!-- widget:deepseek-oss-comparison -->`
