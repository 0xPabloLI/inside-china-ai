/**
 * _gate-smoke — T5 gate smoke pack (spec decision 47).
 *
 * Dedicated smoke carrier for FUTURE content: the TextGate contract is only
 * guaranteed for content generated from now on, never for legacy packs. This
 * pack's scene-data exercises every gated Remotion template with legal copy,
 * so `render-only` + frame checks running green proves the pipeline produces
 * overflow-free video end to end.
 */
export const meta = {
  subject: "gate-smoke",
  pipelineId: "_gate-smoke",
  title: "T5 Gate Smoke Pack",
  article: "gate-smoke",
  createdAt: "2026-09-01",
  topics: ["gate-smoke", "text-overflow-hardening", "remotion"],
  keyEntities: {
    companies: ["frontier-lab", "cloud-giant"],
    people: [],
    models: ["smoke-model"],
  },
  dataPoints: [
    "9 gated scene templates",
    "every slot under the text contract",
    "zero clipped lines",
  ],
};
