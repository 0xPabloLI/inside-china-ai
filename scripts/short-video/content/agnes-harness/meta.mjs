export const meta = {
  article: "agnes-harness",
  subject: "agnes",
  pipelineId: "agnes-harness",
  title: "China's Agnes Puts a 9B Brain Inside an Agent Stack",
  renderer: "remotion",
  createdAt: "2026-11-21",
  // Measured from content/agnes-harness/assets/ on 2026-11-21:
  // 3 motion clips (10s + 10s + 10s counted), 5 usable stills.
  // Hook uses agnes-mars-demo-01.mp4, marked mediaRole:"evidence".
  videoFit: 5,
  videoFitFormat: "demo-led",
  videoFitHook:
    "Agnes Mars rescue demo clip, first 10 seconds, followed by 21.7% ALE pass rate and 42.7 score overlays (assets/agnes-mars-demo-01.mp4).",
  videoFitEvidence:
    "assets/agnes-mars-demo-01.mp4 10.0s + assets/agnes-mars-demo-02.mp4 10.0s + assets/agnes-mars-demo.mp4 10.0 counted seconds = 30s; stills: agnes-ale.png, agnes-architecture.png, agnes-banner.png, agnes-hero.png, agnes-mars-rescue.png; hook is the official Mars rescue clip and mediaRole:evidence.",
  storySpine: {
    phenomenon:
      "Agnes AI open-sourced Agnes, an agent stack that puts a 9B judgment model (Sys1) beside a large language model. On QbitAI's report, Sys1 cuts step latency 14.3x and per-decision cost 27x in two controlled tests, and the stack reached a 21.7% pass rate and 42.7 score on the public ALE leaderboard.",
    caveat:
      "The speed, cost and benchmark numbers are Agnes's own or run under its settings; the project is a developer preview, MHS device integration is still an official plugin in progress, and ordinary plugins are not sandboxed.",
    storyType: "phenomenon",
  },
  topics: [
    "china-ai",
    "agnes",
    "agent",
    "agent-stack",
    "sys1",
    "open-source",
    "ale-benchmark",
  ],
  keyEntities: {
    companies: ["agnes-ai"],
    people: [],
    models: ["agnes-sys1", "agnes-2.5-pro-beta"],
  },
  dataPoints: [
    "Agnes official README, 2026-11-20: Agnes is an Apache-2.0 open-source agent stack; the LLM is the brain, Agnes Sys1 is the judgment layer, memory is the runtime, and MHS is the body.",
    "Agnes official README: the public ALE leaderboard shows Agnes with Agnes 2.5 Pro Beta at 21.7% overall pass rate and 42.7 overall score.",
    "QbitAI, 2026-11-20: Agnes Sys1 is a 9B decision model; in a home-leak test it answered in 0.53s versus 7.6s for a large model, 14.3x faster.",
    "QbitAI: in a luggage-room test, 100 online LLM calls cost about $0.00247 each; Sys1 cost about $0.000091 each, roughly 1/27.",
    "QbitAI: the official nine-benchmark sheet has first place on six tests, plus one tie with Codex; DeepPlanning 87.07, BigCodeBench-Hard V1 40.69.",
    "QbitAI: the Mars rescue demo sends a hopper to find an astronaut, then coordinates a robot and airlock; the demo was recorded on the previous release.",
    "Agnes official README: this is a developer preview (pre-alpha); MHS device integration is an official plugin in progress, and ordinary plugins run as trusted in-process code, not a sandbox.",
  ],
  hashtags: ["#chinaai", "#agnes", "#aiagents", "#opensource", "#ainews"],
};
