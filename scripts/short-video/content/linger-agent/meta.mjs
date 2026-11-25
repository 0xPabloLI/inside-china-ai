export const meta = {
  article: "linger-simplex-ai",
  subject: "linger",
  pipelineId: "linger-agent",
  title: "DeepSeek Alum Puts a 125B Agent on a 12GB GPU",
  renderer: "remotion",
  createdAt: "2026-11-22",
  // Measured from content/linger-agent/assets/ on 2026-11-22:
  // 1 motion clip (10s counted from 28.5s), 7 usable stills.
  // Hook uses the official Linger story clip as evidence media.
  videoFit: 4,
  videoFitFormat: "explainer",
  videoFitHook:
    "Official Linger story clip at 0s, with 125B and 12GB text overlays and the founder name by 2s.",
  videoFitEvidence:
    "assets/linger-story.mp4 28.5s, 10.0 counted seconds; stills: founder-tony-zhang.jpg, linger-product-shot.jpg, feature-local-moe.png, card-memory.png, feature-locomo.png, linger-story-poster.jpg; hook is linger-story.mp4 with mediaRole evidence.",
  storySpine: {
    phenomenon:
      "Tony Zhang, former project lead of DeepSeek-VL and a researcher on DeepSeek's first language model, left DeepSeek in March 2024, later founded Simplex AI, and on November 19 open-sourced Linger, a personal agent that runs local models on consumer PCs.",
    caveat:
      "The 125B-on-12GB result is a company test, not third-party verified; the 125B model does not fit entirely in 12GB VRAM and relies on 64GB system RAM plus SSD; external apps can still send data off the machine; the modified Apache license restricts unauthorized hosted services.",
    storyType: "phenomenon",
  },
  topics: [
    "china-ai",
    "deepseek",
    "linger",
    "simplex-ai",
    "personal-agent",
    "local-llm",
    "poly-strata",
    "open-source",
  ],
  keyEntities: {
    companies: ["simplex-ai", "deepseek"],
    people: ["tony-zhang"],
    models: ["qwen3.8-flash-next", "poly-strata", "another-me"],
  },
  dataPoints: [
    "36Kr, 2026-11-21: Zhang Bo (Tony Zhang) was DeepSeek-VL project lead and a participant in DeepSeek's first language model; he left DeepSeek in March 2024 and later founded Simplex AI.",
    "36Kr, 2026-11-21: Simplex AI raised a $6 million seed round led by GL Ventures; Linger launched on November 19, 2026.",
    "GitHub API, 2026-11-22: simplexai-labs/linger has 3,430 stars and 320 forks; the repository describes Linger as an open-source personal agent that runs fully on your PC.",
    "Linger README, 2026-11-22: Qwen3.8-Flash-Next, a 125B model with a 39GB 2-bit file, runs on a 12GB RTX 3060 with 64GB RAM at 45.5 tokens per second using PolyStrata.",
    "Linger README, 2026-11-22: Linger reports 95% on LoCoMo, versus Zep 94.7%, Mem0 92.5%, and GPT-4o-mini full context 72.9%.",
    "36Kr, 2026-11-21: the speed result is company data without full third-party verification; install bugs were reported; phone support is planned within a month.",
    "Linger LICENSE, 2026-11-22: modified Apache 2.0; unauthorized hosted or managed services need a commercial license; frontend logo and copyright notices may not be removed.",
  ],
  hashtags: ["#deepseek", "#aiagents", "#opensource", "#chinaai", "#ainews"],
};
