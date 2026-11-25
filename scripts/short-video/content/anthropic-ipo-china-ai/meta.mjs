export const meta = {
  article: "anthropic-ipo-china-ai",
  subject: "anthropic",
  pipelineId: "anthropic-ipo-china-ai",
  title: "Anthropic's $107B IPO Helped Reprice China's AI Stocks",
  renderer: "remotion",
  createdAt: "2026-11-22",
  // Measured from content/anthropic-ipo-china-ai/assets/ on 2026-11-22:
  // no motion clips, 4 usable stills. Chart-led package.
  videoFit: 2,
  videoFitFormat: "chart-led",
  // This package is a market-day analysis with 7 scenes; the measured
  // voiceover lands near 75s, so the package declares its own ceiling
  // instead of being forced into the 70s default.
  scenePlan: { minScenes: 6, maxScenes: 7, maxVoiceoverWords: 175, maxDurationSec: 78 },
  videoFitHook:
    "Anthropic's Nasdaq photo at 0s, with $107.3B raised and a 1.27T market cap on screen before the first turn.",
  videoFitEvidence:
    "stills: anthropic-ipo-photo.jpg, minimax-h3-en-overview-1785756177531.png, zhipu-stock-chart.png, hkex-towers-night.jpg; no motion clip; hook is a still photo plus native chart scenes.",
  storySpine: {
    phenomenon:
      "Anthropic raised $107.3 billion in its Nasdaq IPO and closed its first day up 17.07% at a $1.27 trillion market cap. The next day Hong Kong sold the model trade: MiniMax fell 10.8%, Zhipu fell 7.17%, and Hang Seng Tech dropped more than 4% intraday.",
    caveat:
      "One trading day is not a trend. The AI selloff began before Anthropic's debut, and Anthropic still reported a 2025 operating loss of $8.06 billion. The repricing thesis is an interpretation, not a confirmed causal link.",
    storyType: "phenomenon",
  },
  topics: ["china-ai", "anthropic", "ipo", "minimax", "zhipu", "hong-kong", "ai-valuation"],
  keyEntities: {
    companies: ["anthropic", "minimax", "zhipu", "hang-seng-tech"],
    people: [],
    models: ["claude"],
  },
  dataPoints: [
    "36Kr / Times Weekly, 2026-11-21: Anthropic's IPO raised about $81.3 billion; with a $26 billion private placement, total proceeds were $107.3 billion, a global IPO record.",
    "36Kr: Anthropic closed its first day at a $1.27 trillion market cap, up 17.07% from the IPO price; its high was $115.10.",
    "36Kr: on November 19, the Nasdaq fell 2.25%, the S&P 500 fell 2.02%, and the Dow fell 2.19%.",
    "36Kr: on November 20, Hang Seng Tech fell more than 4% intraday; MiniMax closed down 10.8% and Zhipu down 7.17%.",
    "36Kr: Anthropic's 2025 revenue was $4.59 billion, up 1,088%; its operating loss widened to $8.06 billion; infrastructure spend was $7.33 billion, 58% of operating expenses.",
    "36Kr: Anthropic was founded in 2021, raised a $13 billion F round at a $183 billion valuation in September 2025, and reached a $965 billion pre-IPO valuation.",
    "36Kr: analysts said the market may shift from model scores to revenue durability, gross margin, cash flow and customer retention; the causal effect on China's listings is not established.",
  ],
  hashtags: ["#anthropic", "#zhipu", "#minimax", "#chinaai", "#ainews"],
};
