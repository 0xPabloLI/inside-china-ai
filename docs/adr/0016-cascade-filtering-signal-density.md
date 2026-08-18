# Cascade Filtering & Signal Density — Architecture Principle

The video pipeline processes 10-20 visual assets per run across multiple stages with different cost profiles — from free (keyword matching) to expensive (VLM at 20-120s per asset). Without explicit layering, expensive resources become the bottleneck.

**Adopt two rules as architecture principles across the pipeline:**

1. **Cascade** — cheap filters first, expensive processing last. Each processing stage only receives assets that passed all previous stages. The cheapest filter that can reject a candidate goes first.

2. **Signal density** — one expensive call produces multiple signals, not one signal per call. A single VLM call outputs 6 fields (description, subjects, contentKind, fit, criticalEdgeText, reason) in one pass.

## Consequences

- Applied in: RAG query (metadata → vector similarity → reranker), search-sources filter/classify, asset-sourcer download pipeline.
- See ADR-0009 (VLM), ADR-0013 (Asset sourcing), ADR-0015 (Focus detection) for related architecture.
