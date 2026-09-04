# Widget Data: kimi-benchmark-controversy

> Exported from `src/components/widgets/distillation/data/benchmarks.ts`
> Widget type: 基准对比（benchmark comparison）— Kimi K3 vs K2.6 vs Claude 性能对比
> Last updated: 2026-08-04 (git: 2026-08-04 08:48:52 +0800)
> View component: `src/components/widgets/distillation/benchmark-controversy-view.tsx` → `BenchmarkControversyView`

## Data

### Model Metadata

| Key    | Name      | Color   |
| ------ | --------- | ------- |
| k3     | Kimi K3   | #3b82f6 |
| k26    | Kimi K2.6 | #93c5fd |
| claude | Claude    | #f59e0b |

### Benchmark Metrics (5 dimensions)

| Dimension                 | K3   | K2.6 | Claude | Unit | Higher is Better? | Note                                                                                                 |
| ------------------------- | ---- | ---- | ------ | ---- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| Accuracy (AA-Omniscience) | 46   | 33   | 72     | %    | ✅                | K3 improved from K2.6's 33% but remains far behind Claude's 72%.                                     |
| Hallucination Rate        | 51   | 39   | 14     | %    | ❌                | K3's hallucination rate climbed to 51% — worse than K2.6 and far above Claude's 14%.                 |
| Arena Frontend Code Rank  | 1    | 18   | 2      | #    | ❌                | K3 jumped 17 places to claim #1 on Arena. But Moonshot's own report shows K3 below Claude on coding. |
| Coding (SWE-bench)        | 51.5 | 40   | 69     | %    | ✅                | K3 trails Claude by ~18 points on frontier SWE benchmarks.                                           |
| Security Testing          | 30   | 35   | 85     | %    | ✅                | SCMP: K3 'significantly below' US rivals in security. Score is a rough composite.                    |

### Key Findings

- **Identity bleed**: K3 identifies as Claude in ~15% of tests (separate Hacker News finding, referenced in identity-bleed widget).
- **Arena vs official benchmarks**: K3 ranks #1 on Arena (public voting) but trails Claude on SWE-bench and accuracy metrics — suggesting either Arena gaming or different evaluation criteria.
- **Hallucination regression**: K3's hallucination rate (51%) is worse than its predecessor K2.6 (39%), suggesting distillation may have introduced quality regressions.

## Sources

- No explicit `sourceUrl` field in data.
- Benchmark data sourced from:
  - **AA-Omniscience**: Accuracy and hallucination rate benchmarks
  - **LMSYS Arena**: Frontend code ranking
  - **SWE-bench**: Software engineering benchmark
  - **SCMP (South China Morning Post)**: Security testing composite
  - Hacker News (ataoz): Identity bleed testing

## Related Articles

- Embedded in `china-llm-distillation-storm` via `<!-- widget:kimi-benchmark-controversy -->`
