/**
 * DeepInfer scene data. 10 scenes, target ~65s.
 *
 * Spine (Step 0 review, user choice 2026-10-20): the subject is the release
 * itself — DeepSeek open-sourced DeepInfer, the framework that serves its
 * models. The turn is the release boundary, which DeepSeek writes down itself:
 * the README lists a KV cache system, P/D disaggregation and replica load
 * balancing as required for a complete service and not included. Tone is a
 * check, not an accusation: DeepSeek states the limit in its own docs and
 * promises future models will keep landing in DeepInfer.
 *
 * Hook (revised 2026-10-21 after user review): the first cut led with "155
 * trillion tokens a day". That number is inert for a cold viewer — it needs
 * token/day units, cluster context and inference-throughput background the
 * video has not supplied yet, and it frames the piece as a specs reel while
 * the payoff is governance. The hook now leads with the subject and the
 * reversal; 155 trillion stays in scene 6, where it has context and is
 * labelled self-reported plus a per-second calculation.
 *
 * Sources: DeepSeek WeChat post 2026-10-20 16:54; Zhihu technical report same
 * day; github.com/deepseek-ai/DeepInfer README + doc/inference_deployment_qa.md;
 * GitHub API for stars and license. Ledger:
 * docs/refs/source-materials/deepinfer-open-source-2026-10-20.md
 *
 * Deliberately excluded: the 77K average input, 400ms TTFT, 230 tokens/s and
 * 96% cache hit figures that circulated via 36kr. They are attributed to
 * "official online stats" but do not appear in the WeChat post, the Zhihu
 * report or the deployment Q&A, so they do not go in the video.
 *
 * 1.8 billion tokens per second is a calculation from 155 trillion per day,
 * and every scene that uses it says so on screen.
 *
 * Digital human (Step 8c): NOT declared. The hook is on the blacklist, the
 * middle is data narration, and the only whitelist-qualifying segment would be
 * the CTA. One qualifying segment does not justify a 2 to 4 segment budget.
 *
 * Visual strategy: CSS-only. The evidence is textual (a README list), so the
 * caveat is carried by the info-card and context components rather than a
 * screenshot capture.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    narrativeRole: "S",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "DeepSeek open-sourced the code that runs its models. The 3 pieces a complete service needs are not included.",
    texts: {
      badge: "CHINA AI",
      subject: "DEEPSEEK",
      hookText: "THE CODE IS OPEN.",
      revealText: "3 PIECES ARE NOT.",
      source: "SOURCE: DEEPSEEK README, OCT 20",
    },
  },
  {
    id: 2,
    name: "what-shipped",
    visualType: "info-card",
    layout: "hero-center",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "It's DeepInfer. Fully permissive license, 6,300 stars already. And one obvious catch.",
    texts: {
      title: "WHAT SHIPPED",
      subtitle: "APACHE 2.0 + MIT",
      points: ["DEEPINFER FRAMEWORK", "DEEPSEEK-RECIPE TOKENS", "6.3K STARS ALREADY"],
    },
  },
  {
    id: 3,
    name: "whats-missing",
    visualType: "info-card",
    layout: "hero-center",
    narrativeRole: "T",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "According to DeepSeek's own README, three things a complete service needs are not in this release.",
    texts: {
      title: "WHAT'S MISSING",
      subtitle: "REQUIRED, NOT INCLUDED",
      points: ["KV CACHE SYSTEM", "PREFILL / DECODE SPLIT", "REPLICA LOAD BALANCING"],
    },
  },
  {
    id: 4,
    name: "why-it-matters",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Those three are what keep a cluster busy. DeepSeek says they are too tangled with its internal systems to open.",
    texts: {
      badge: "WHY IT MATTERS",
      title: "WHAT KEEPS A CLUSTER ",
      titleHighlight: "FULL",
      context: "CACHE, ROUTING, BALANCE",
      detail: "OPEN RELEASE IS OFFLINE ONLY",
    },
  },
  {
    id: 5,
    name: "what-you-get",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "What you do get is the core. DeepSeek's kernels, its own speculative decoding, and a replay trick that cuts prefill compute nearly in half.",
    texts: {
      stat: "~50%",
      statLabel: "LESS PREFILL COMPUTE",
      subtext: "DECODER SWA BOUNDED REPLAY",
      source: "SOURCE: DEEPSEEK ZHIHU POST, OCT 20",
    },
  },
  {
    id: 6,
    name: "scale",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover: "One cluster, 155 trillion tokens a day. That is 1.8 billion every second.",
    texts: {
      stat: "1.8B",
      statLabel: "TOKENS PER SECOND",
      subtext: "155T PER DAY. CALCULATED.",
      source: "SOURCE: DEEPSEEK / CALCULATED",
    },
  },
  {
    id: 7,
    name: "unit-economics",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover: "According to DeepSeek, the business runs at 38 dollars per GPU hour, off-peak.",
    texts: {
      stat: "$38",
      statLabel: "PER GPU HOUR",
      subtext: "REVENUE, NOT PROFIT. OFF-PEAK.",
      source: "SOURCE: DEEPSEEK, OCT 20",
    },
  },
  {
    id: 8,
    name: "caveat",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Every number here is DeepSeek's own. No outside lab has benchmarked this stack yet.",
    texts: {
      badge: "ONE CAVEAT",
      title: "ALL OF IT IS ",
      titleHighlight: "SELF-REPORTED",
      context: "NO OUTSIDE BENCHMARK",
      detail: "VENDOR NUMBERS ONLY",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "The engine is open. The serving layer is not. DeepSeek shipped the recipe and kept the kitchen.",
    texts: {
      badge: "THE CLOSE",
      company: "OPEN ENGINE",
      context: "SERVING LAYER CLOSED",
      action: "RECIPE SHIPPED",
      result: "KITCHEN KEPT",
      source: "SOURCES: DEEPSEEK, GITHUB",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover: "Follow China AI News for the numbers behind the release.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "DEEPINFER",
    },
  },
];

export const metadata = {
  title: "DeepSeek Open-Sourced Its Engine. Three Pieces Missing.",
  description: `DeepSeek open-sourced DeepInfer, the inference framework behind V4.1 Flash. DeepSeek says one cluster serves 155 trillion tokens a day, about 1.8 billion every second, at 38 dollars of revenue per GPU hour off-peak. But the README lists what is not in the box: a KV cache system, prefill and decode split across machines, and load balancing across replicas. Those are the parts that keep a cluster full, and DeepSeek says they are too tied to internal infrastructure to open. What you do get is the core, including a replay trick that nearly halves prefill compute. Every number is self-reported. Follow for more China AI news.`,
  commentHook:
    "DeepSeek open-sourced its production inference engine, minus the KV cache, P/D split and load balancing. Does that count as open source?",
  trendingChecked: true,
  trendingHashtags: [],
};
