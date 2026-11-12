/**
 * Pilot query set for the orthogonality bench (#457).
 *
 * Five queries, one per intent band, matching the triage ruling (Round
 * CLXXVIII): news / docs / academic / Chinese / community. They are fixed on
 * purpose — the pilot's job is to prove the metrics and the cost model, not to
 * rank intents. The full run (10-15 per band) is a follow-up ticket.
 *
 * Half the set is repo-adjacent (AI infrastructure, short-video research) and
 * half is plain technical querying, per the ticket's sampling rule.
 */
export const PILOT_QUERIES = [
  {
    id: "news-export-controls",
    intent: "news",
    text: "China AI chip export controls latest",
    note: "News intent: recency matters, wire reprints inflate URL-level breadth.",
  },
  {
    id: "docs-tanstack",
    intent: "docs",
    text: "TanStack Start server functions streaming SSR",
    note: "Technical docs intent: official docs should dominate, mirrors add nothing.",
  },
  {
    id: "academic-moe",
    intent: "academic",
    text: "mixture of experts inference latency reduction",
    note: "Academic intent: arXiv/OpenAlex are expected to carry this band.",
  },
  {
    id: "zh-inference-cost",
    intent: "zh",
    text: "国产大模型 推理成本 下降",
    note: "Chinese intent: tests whether Chinese results land in different families.",
  },
  {
    id: "community-local-llm",
    intent: "community",
    text: "local LLM 32GB Apple Silicon best model 2026",
    note: "Community intent: HN/Stack Overflow vs web engines.",
  },
];
