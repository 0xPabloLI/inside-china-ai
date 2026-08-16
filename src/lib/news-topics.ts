/**
 * Topic taxonomy for the /news hub.
 *
 * Posts don't carry a category column, so topics are derived from keyword
 * matches on the title + excerpt. First matching topic wins; anything without
 * a match falls back to "industry".
 */
export type TopicId = "all" | "models" | "policy" | "chips" | "companies" | "industry";

export interface Topic {
  id: TopicId;
  label: string;
  /** Short blurb shown when the topic is the active filter. */
  blurb: string;
  keywords: string[];
}

export const TOPICS: Topic[] = [
  {
    id: "all",
    label: "All news",
    blurb: "Every story on China's AI industry, newest first.",
    keywords: [],
  },
  {
    id: "models",
    label: "Models & research",
    blurb: "Chinese AI model releases, benchmarks, and research breakthroughs.",
    keywords: [
      "model",
      "deepseek",
      "qwen",
      "glm",
      "kimi",
      "moonshot",
      "minimax",
      "llm",
      "benchmark",
      "open-weight",
      "open source",
      "distillation",
      "reasoning",
      "training",
    ],
  },
  {
    id: "policy",
    label: "Policy & regulation",
    blurb: "China AI regulation, export controls, and state policy.",
    keywords: [
      "policy",
      "regulation",
      "regulator",
      "law",
      "beijing",
      "government",
      "state",
      "ban",
      "export control",
      "compliance",
      "censorship",
      "license",
    ],
  },
  {
    id: "chips",
    label: "Chips & compute",
    blurb: "Silicon, data centres, and the compute gap.",
    keywords: [
      "chip",
      "nvidia",
      "gpu",
      "semiconductor",
      "huawei",
      "ascend",
      "smic",
      "compute",
      "data center",
      "data centre",
      "wafer",
      "hbm",
    ],
  },
  {
    id: "companies",
    label: "Companies & funding",
    blurb: "Labs, startups, tech giants, and the money behind them.",
    keywords: [
      "funding",
      "raise",
      "valuation",
      "ipo",
      "alibaba",
      "bytedance",
      "baidu",
      "tencent",
      "startup",
      "founder",
      "acquisition",
      "investor",
    ],
  },
  {
    id: "industry",
    label: "Industry & talent",
    blurb: "Adoption, talent, and how the industry actually works.",
    keywords: [],
  },
];

/** Topics rendered as filter chips (excludes the "all" pseudo-topic). */
export const FILTER_TOPICS = TOPICS.filter((t) => t.id !== "all");

export function getTopic(id: string | undefined): Topic {
  return TOPICS.find((t) => t.id === id) ?? TOPICS[0];
}

export interface CategorizablePost {
  title: string;
  excerpt?: string | null;
}

/** Derive the topic id for a post from its title + excerpt. */
export function topicForPost(post: CategorizablePost): TopicId {
  const haystack = `${post.title} ${post.excerpt ?? ""}`.toLowerCase();
  for (const topic of TOPICS) {
    if (topic.keywords.length === 0) continue;
    if (topic.keywords.some((k) => haystack.includes(k))) return topic.id;
  }
  return "industry";
}

/** Count of posts per topic id, for the filter chip badges. */
export function countByTopic(posts: CategorizablePost[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    const id = topicForPost(post);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  counts.all = posts.length;
  return counts;
}
