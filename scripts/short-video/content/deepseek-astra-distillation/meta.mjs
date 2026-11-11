export const meta = {
  subject: "deepseek",
  pipelineId: "deepseek-astra-distillation",
  title: "Four Points, One Update: The Information Says DeepSeek Learned Them From Astra",
  article: "deepseek-astra-distillation",
  renderer: "remotion",
  createdAt: "2026-10-29",
  topics: [
    "deepseek",
    "distillation",
    "gpt-6-astra",
    "the-information",
    "liang-wenfeng",
    "moonshot",
    "kimi-k3-1-pro",
    "anthropic",
    "china-ai",
  ],
  keyEntities: {
    companies: ["deepseek", "openai", "moonshot-ai", "anthropic", "zhipu-ai"],
    people: ["liang-wenfeng"],
    models: [
      "deepseek-v4.1-flash-1017",
      "deepseek-v4.1-flash",
      "gpt-6-astra",
      "kimi-k3.1-pro",
      "glm-5.3",
      "claude",
    ],
  },
  // Every number that appears in the hook, the body and the close. checkLoopClose
  // tries a numeric loop first, but numericAnchors drops integer anchors below 10,
  // so the closing line's spelled "four" never matches this list: the check falls
  // back to the word-match branch and reports the advisory warn. The loop is
  // carried by the hook's framing ("four points" -> "four points up"), not by a
  // numeric anchor.
  dataPoints: [
    "2026-10-17: DeepSeek ships V4.1-Flash-1017 as a point update, same API price, open MIT weights",
    "Browser Use Bench v2.1 runs 180 live-website tasks, page updated 2026-10-17",
    "GPT-6 Astra medium scores 77.9 at $10.77 of model cost per task (Browser Use leaderboard)",
    "DeepSeek V4.1-Flash-1017 max scores 75.0 at 22 cents per task, up from 70.9 for the previous Flash",
    "75.0 vs 77.9 is 2.9 points apart; 70.9 to 75.0 is a 4.1-point jump in one point update",
    "$10.77 / $0.22 = 48.95, so the cost ratio is about 49x at equal-ish score",
    "2026-10-28: The Information reports DeepSeek and Moonshot heavily used GPT-6 Astra outputs for distillation",
    "2026-10-24: Moonshot ships Kimi K3.1 Pro (2.8T params, weights promised by 2026-11-04)",
    "The Information's sources are described as people with direct knowledge; no logs, prompts or token counts were published",
    "Claude had been the main distillation target; Anthropic tightened reasoning-trace protections over the previous two months",
    "The report says Liang Wenfeng had ruled out relying on distillation for V4 and yielded to competitive pressure after Zhipu's gains",
    "A viral ModelTrace run scored V4.1-Flash-1017 at 84.66% GPT-6 Astra, but the tool's database has no DeepSeek model",
  ],
  hashtags: ["#deepseek", "#chinaai", "#ainews", "#openai", "#technews"],
};
