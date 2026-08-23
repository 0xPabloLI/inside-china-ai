/**
 * Trend discovery utilities for China AI news monitoring.
 *
 * Pure functions — no network IO, no side effects.
 * Used by search-sources.mjs and testable in isolation.
 */

// ─── China AI filter keywords ───

const CHINA_AI_KEYWORDS = [
  // English
  "ai",
  "artificial intelligence",
  "china ai",
  "deepseek",
  "bytedance",
  "baidu",
  "alibaba",
  "tencent",
  "huawei",
  "chip",
  "semiconductor",
  "qwen",
  "ernie",
  "kimi",
  "zhipu",
  "moonshot",
  // Chinese
  "ai",
  "人工智能",
  "大模型",
  "deepseek",
  "深度求索",
  "字节跳动",
  "百度",
  "阿里",
  "腾讯",
  "华为",
  "芯片",
  "算力",
  "智谱",
  "月之暗面",
  "kimi",
  "通义千问",
  "文心一言",
  // Self-media common expressions (TE-T1)
  "蒸馏",
  "微调",
  "推理",
  "训练",
  "开源模型",
  "智能体",
  "agent",
  "rag",
  "多模态",
  // #51 V1a: People names (Chinese)
  "梁文锋",
  "戴文渊",
  "王小川",
  "李彦宏",
  "刘庆峰",
  "朱啸虎",
  "沈向洋",
  "周杰",
  "杨植麟",
  "闫俊杰",
  // #51 V1a: People names (English)
  "Liang Wenfeng",
  "Dai Wenyuan",
  "Wang Xiaochuan",
  "Robin Li",
  "Yan Junjie",
  // #51 V1a: Company aliases (Chinese)
  "幻方",
  "百川智能",
  "零一万物",
  "商汤",
  "旷视",
  "地平线",
  "寒武纪",
  "燧原",
  "壁仞",
  "天数智芯",
  "摩尔线程",
  "芯擎",
  "思谋",
  "第四范式",
  "云从",
  "依图",
  "出门问问",
  // #51 V1a: Company aliases (English)
  "High-Flyer",
  "MiniMax",
  "Baichuan AI",
  "01.AI",
  "SenseTime",
  "Megvii",
  "Horizon Robotics",
  "Cambricon",
  "Enflame",
  "Biren",
  "Moore Threads",
  // #51 V1a: Product/Model names
  "豆包",
  "元宝",
  "文心",
  "通义",
  "混元",
  "盘古",
  "星火",
  "天工",
  "ChatGLM",
  "GLM-4",
  "Doubao",
  "Ernie Bot",
  "Hunyuan",
  "Spark Desk",
  // #51 V1a: Policy/Concept terms
  "国产替代",
  "信创",
  "新质生产力",
  "东数西算",
  "具身智能",
  "智算中心",
  "算力基础设施",
];

// ─── Classification keyword tables ───

const CATEGORY_PRIORITY = ["breaking", "data", "fermenting", "explainer"];

const CLASSIFY_KEYWORDS = {
  breaking: {
    zh: ["突发", "刚刚", "最新", "快讯", "泄露", "暂停", "宣布", "breaking"],
    en: ["breaking", "just in", "leaked", "paused", "announces", "reveals", "just announced"],
  },
  data: {
    zh: ["报告", "数据", "亿", "%", "增长", "下降", "融资", "估值", "$"],
    en: [
      "report",
      "data",
      "billion",
      "million",
      "%",
      "growth",
      "decline",
      "funding",
      "valuation",
      "$",
    ],
  },
  fermenting: {
    zh: ["解读", "分析", "深度", "背后", "评论", "发酵"],
    en: ["analysis", "deep dive", "breakdown", "explainer", "behind", "commentary"],
  },
  explainer: {
    zh: ["科普", "入门", "指南", "教程", "什么是"],
    en: ["how to", "guide", "tutorial", "what is", "101"],
  },
};

// ─── Functions ───

/**
 * Check if a title contains a keyword.
 * - Multi-word keywords: substring match
 * - Single English words: whole-word match (avoids 'ai' matching 'training')
 * - Chinese keywords: substring match
 */
function titleMatchesKeyword(title, kw) {
  const lowerKw = kw.toLowerCase();
  // Multi-word keyword (e.g., "china ai", "artificial intelligence")
  if (kw.includes(" ")) {
    return title.includes(lowerKw);
  }
  // Single ASCII word — match as whole word
  if (/^[a-z0-9]+$/i.test(kw)) {
    const words = title.split(/[\s,.;:!?'"\-()\[\]{}]+/);
    return words.includes(lowerKw);
  }
  // Chinese or mixed — substring match
  return title.includes(lowerKw);
}

/**
 * Filter articles to only those related to China AI.
 *
 * @param {Array} articles - Array of { title, source, url }
 * @returns {Array} Filtered articles
 */
/**
 * Keep entries whose publication date falls within a source-local freshness window.
 * Sources without a tracking window retain their current behavior unchanged.
 */
export function filterRecentTrackedArticles(articles, tracking, now = new Date()) {
  const windowDays = tracking?.freshnessWindowDays;
  if (!Number.isFinite(windowDays) || windowDays <= 0) return articles;
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return articles.filter((article) => {
    const publishedAt = new Date(article.publishedAt).getTime();
    return Number.isFinite(publishedAt) && publishedAt >= cutoff;
  });
}

export function filterChinaAI(articles) {
  return articles.filter((article) => {
    const title = (article.title || "").toLowerCase();
    return CHINA_AI_KEYWORDS.some((kw) => titleMatchesKeyword(title, kw));
  });
}

/**
 * Classify a topic title into one of 4 categories.
 * Priority: breaking > data > fermenting > explainer.
 * Defaults to "fermenting" if no keywords match.
 *
 * @param {string} title - Article title
 * @returns {"breaking" | "data" | "fermenting" | "explainer"}
 */
export function classifyTopic(title) {
  const lower = title.toLowerCase();

  for (const category of CATEGORY_PRIORITY) {
    const { zh, en } = CLASSIFY_KEYWORDS[category];
    const allKeywords = [...zh, ...en];
    if (allKeywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return category;
    }
  }

  // T10: default to fermenting
  return "fermenting";
}

/**
 * Tokenize a title into a set of normalized tokens.
 * Numbers are normalized to "NUM" so "$1.4B" and "1.4 billion" tokenize identically.
 */
function tokenize(s) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => (/[0-9]/.test(t) ? "NUM" : t)),
  );
}

/**
 * Calculate Jaccard similarity between two title strings.
 * Numbers are normalized to "NUM" so "$1.4B" ≈ "1.4 billion".
 *
 * @param {string} a - First title
 * @param {string} b - Second title
 * @returns {number} Similarity score [0, 1]
 */
function jaccardSimilarity(a, b) {
  const setA = tokenize(a);
  const setB = tokenize(b);

  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Calculate containment coefficient: what fraction of the shorter
 * title's tokens appear in the longer title.
 * If the shorter title is a subset of the longer, returns 1.0.
 */
function containment(a, b) {
  const setA = tokenize(a);
  const setB = tokenize(b);
  const [shorter, longer] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  if (shorter.size === 0) return 0;
  let intersection = 0;
  for (const w of shorter) {
    if (longer.has(w)) intersection++;
  }
  return intersection / shorter.size;
}

/**
 * Deduplicate articles by title similarity.
 * Articles with >= 80% Jaccard similarity are merged.
 * Merged articles keep the longer title and combine sources/urls.
 *
 * @param {Array} articles - Array of { title, source, url }
 * @returns {Array} Deduplicated articles with { title, sources[], urls[] }
 */
export function deduplicateTopics(articles) {
  const JACCARD_THRESHOLD = 0.8;
  const CONTAINMENT_THRESHOLD = 0.9;
  const result = [];

  for (const article of articles) {
    let merged = false;
    for (const existing of result) {
      const sim = jaccardSimilarity(article.title, existing.title);
      const cont = containment(article.title, existing.title);
      if (sim >= JACCARD_THRESHOLD || cont >= CONTAINMENT_THRESHOLD) {
        // Merge into existing
        // Keep longer title
        if (article.title.length > existing.title.length) {
          existing.title = article.title;
        }
        // Merge sources and urls
        if (!existing.sources.includes(article.source)) {
          existing.sources.push(article.source);
        }
        if (!existing.urls.includes(article.url)) {
          existing.urls.push(article.url);
        }
        merged = true;
        break;
      }
    }
    if (!merged) {
      result.push({
        title: article.title,
        sources: [article.source],
        urls: [article.url],
        category: article.category,
      });
    }
  }

  return result;
}

/**
 * Build the final output JSON structure.
 *
 * @param {Array} articles - Array of { title, source, url, category }
 * @returns {Object} { scrapedAt, totalTopics, sourceStats, topics: { breaking, fermenting, data, explainer } }
 */
export function buildOutputJson(articles) {
  const sourceStats = {};
  const topics = {
    breaking: [],
    fermenting: [],
    data: [],
    explainer: [],
  };

  for (const article of articles) {
    // Count sources (handle both singular source and plural sources array)
    const sources = article.sources || [article.source].filter(Boolean);
    for (const src of sources) {
      if (sourceStats[src] === undefined) {
        sourceStats[src] = 0;
      }
      sourceStats[src]++;
    }

    // Group by category (re-classify if missing)
    const category = article.category || classifyTopic(article.title);
    if (topics[category]) {
      const topicEntry = {
        title: article.title,
        sources: article.sources || [article.source],
        urls: article.urls || [article.url],
        keywords: extractKeywords(article.title),
        summary: "",
      };

      // T03 (#55): Extract imageUrl from article for cross-stage image caching
      // Asset sourcer (Stage 4) reads these cached URLs to skip redundant CDP requests
      if (article.imageUrl) {
        topicEntry.images = [
          {
            url: article.imageUrl,
            sourceArticle: article.url || (article.urls && article.urls[0]) || null,
          },
        ];
      }

      topics[category].push(topicEntry);
    }
  }

  return {
    scrapedAt: new Date().toISOString(),
    totalTopics: articles.length,
    sourceStats,
    topics,
  };
}

/**
 * Extract China AI keywords from a title for the "keywords" field.
 *
 * @param {string} title
 * @returns {string[]} Array of matched keywords
 */
function extractKeywords(title) {
  const lower = title.toLowerCase();
  const matched = [];
  for (const kw of CHINA_AI_KEYWORDS) {
    if (lower.includes(kw.toLowerCase()) && !matched.includes(kw)) {
      matched.push(kw);
    }
  }
  return matched;
}

// ─── TE-T1: cleanTitle ───

/**
 * Emoji regex — covers main Unicode emoji ranges.
 * Includes: emoticons, symbols & pictographs, transport & map, flags, etc.
 */
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{1F200}-\u{1F251}]/gu;

/**
 * Clean a title from self-media platforms.
 *
 * - Removes emoji
 * - Removes #hashtag# format (XHS style)
 * - Removes 【】brackets and their content (Bilibili style)
 * - Collapses multiple spaces into one
 * - Trims leading/trailing whitespace
 * - Truncates to 200 characters
 * - Returns empty string for null/undefined/empty input
 *
 * @param {string|null|undefined} title - Raw title from social platform
 * @returns {string} Cleaned title
 */
export function cleanTitle(title) {
  if (!title || typeof title !== "string") {
    return "";
  }

  let cleaned = title;

  // Remove emoji
  cleaned = cleaned.replace(EMOJI_REGEX, "");

  // Remove #hashtag# format (XHS style: #topic# pairs)
  // Repeatedly remove paired #...# until no more matches
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/#[^#\s]+#/g, "");
  } while (cleaned !== prev);
  // Remove remaining lone # characters (trailing/leading/orphans)
  cleaned = cleaned.replace(/#/g, "");

  // Remove 【】brackets and their content (Bilibili style)
  cleaned = cleaned.replace(/【[^】]*】/g, "");

  // Collapse multiple spaces into one
  cleaned = cleaned.replace(/\s+/g, " ");

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  // Truncate to 200 characters
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 200);
  }

  return cleaned;
}
