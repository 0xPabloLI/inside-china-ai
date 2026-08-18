# Cascade Filtering & Signal Density — Architecture Principle

## Context

The video production pipeline processes 10-20 visual assets per run across multiple stages: search, download, focus detection, VLM semantic analysis, scene matching, rendering. Each stage has different cost profiles:

| Stage | Cost | Throughput |
|-------|------|------------|
| Keyword/regex matching | ~0ms | 1000s/s |
| Metadata scoring (file size, resolution, title) | ~0ms | 1000s/s |
| OpenCV (Haar Cascade + Saliency) | ~500ms | 2/s |
| VLM (Qwen3-VL-8B via mlx-vlm) | 20-120s | <0.05/s |
| RAG embedding (bge-m3 via Ollama) | ~200ms | 5/s |
| RAG reranker (bge-reranker-base) | ~100ms/result | 10/s |

Without explicit layering, the expensive resources (VLM, reranker) become the bottleneck — 20 assets × 40s each = 13min+ just for VLM analysis.

## Decision

**Adopt Viola-Jones cascade filtering as an explicit architecture principle** across the pipeline. Two rules govern the design:

### Rule 1: Cascade — cheap filters first, expensive processing last

Each processing stage only receives assets that passed all previous stages. The cheapest filter that can reject a candidate goes first.

```
Asset flow:
  Layer 0 (free):    file existence → reject missing
  Layer 1 (cheap):   metadata score (0-70) → reject <30
  Layer 2 (medium):  OpenCV focus detection (~0.5s) → annotate
  Layer 3 (expensive): VLM semantic analysis (20-30s) → only survivors
  Layer 4 (free):    semantic re-scoring using VLM output → rank + match
```

### Rule 2: Signal density — one call produces multiple signals

A single expensive call should produce as many signals as possible, not one signal per call. The VLM call outputs 6 fields (description, subjects, contentKind, fit, criticalEdgeText, reason) in one pass — not 6 separate calls.

This is "merge calls" by another name: not just fewer calls, but maximizing the signal-per-call ratio of expensive resources.

## Status

Proposed (2026-08-18). First applied in P3 (spec-vlm-semantic-merge).

## Consequences

### Already applied (3 places)

1. **RAG query** (`scripts/rag/query.mjs`): metadata filter → vector similarity → noise filter → reranker (only for >3 results). Cascade in place. Optimization opportunity: add BM25/keyword pre-filter before reranker.

2. **search-sources filter/classify** (`trends-utils.mjs`): `filterChinaAI` (keyword reject) → `classifyTopic` (keyword classify) → `deduplicateTopics` (Jaccard). Cascade in place.

3. **asset-sourcer download pipeline**: search API ranking → `computeTechnicalScore` (metadata) → VLM (P3 cascade layer). P3 adds the pre-filter gate.

### Applicable but not yet applied (2 places)

4. **caption/hashtag generation** (`caption-utils.mjs`): Currently pure rule matching. If LLM is added for caption generation, rules should run first — LLM only for fallback on unmatched content.

5. **scene-asset matching** (`recommendScene`): Currently keyword matching. P3's VLM `contentKind` + `subjects` enable semantic matching — this is P3's Layer 4 (free, reuses VLM output).

### Guidance for P4-P8

- **P4 (video temporal windowing)**: OpenCV shot detection (cheap) → VLM keyframe analysis (expensive, only shot-boundary frames)
- **P7 (content-addressed caching)**: hash lookup → full skip. Effectively "Layer -1" before the cascade.
- **P8 (focus Phase 2)**: saliency map (cheap) → VLM protection analysis (expensive, only for assets with edge content)

## References

- Viola, P. & Jones, M. (2001). "Rapid Object Detection using a Boosted Cascade of Simple Features"
- ADR-0009: VLM Analysis Layer (Qwen3-VL-8B via mlx-vlm)
- ADR-0013: Asset Sourcing Three-Layer Architecture
- ADR-0015: OpenCV Focus Detection
- Spec: `docs/specs/spec-vlm-semantic-merge.md` (P3 implementation)
