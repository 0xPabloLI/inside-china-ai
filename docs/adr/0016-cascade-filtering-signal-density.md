# Cascade Filtering & Signal Density — Architecture Principle

The video pipeline processes 10-20 visual assets per run across multiple stages with different cost profiles — from free (keyword matching) to expensive (VLM at 20-120s per asset). Without explicit layering, expensive resources become the bottleneck.

**Adopt two rules as architecture principles across the pipeline:**

1. **Cascade** — cheap filters first, expensive processing last. Each processing stage only receives assets that passed all previous stages. The cheapest filter that can reject a candidate goes first.

2. **Signal density** — one expensive call produces multiple signals, not one signal per call. A single VLM call outputs 6 fields (description, subjects, contentKind, fit, criticalEdgeText, reason) in one pass.

## Consequences

- Applied in: RAG query (metadata → vector similarity → reranker), search-sources filter/classify, asset-sourcer download pipeline.
- **Already applied:**
  1. VLM single call produces 6 signals (description, subjects, contentKind, fit, criticalEdgeText, reason) — no 6-call cascade.
  2. Pre-download filter gate (threshold 20) rejects obviously bad candidates before any network I/O — cheaper than post-download pre-filter (threshold 30).
  3. Cascade order in `analyzeAssets()`: pre-filter (free) → detectFocus (~0.5s) → VLM (20-120s). Phase 2 only receives assets that survived Phase 1 — OpenCV never wastes time on assets that will be skipped.
  4. Cross-stage signal reuse: trend discovery's `extractScript` extracts `imageUrl` from the same DOM as article titles. Asset sourcer consumes cached URLs from `trending-topics.json` — one CDP request produces both article metadata and image URL signals.
- See ADR-0009 (VLM), ADR-0013 (Asset sourcing), ADR-0015 (Focus detection) for related architecture.
