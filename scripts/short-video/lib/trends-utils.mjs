/**
 * Trend discovery utilities for China AI news monitoring.
 *
 * Pure functions — no network IO, no side effects.
 * Used by search-sources.mjs and testable in isolation.
 */

import { canonicalizeUrl } from "./url-normalizer.mjs";

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
  // 2026-11-16: China robotics companies. A demo headline ("Unitree H2
  // backflip") often carries no "AI" token, and a token embedded in Chinese
  // text ("对AI的") is missed by the old whole-word matcher. These are the most
  // video-ready topics in the pool. Company names keep recall up without a
  // bare "robot" / "机器人" keyword, which would also pull in non-China
  // robotics stories. This is a recall aid, not an exhaustive registry:
  // unlisted companies can still enter through other keywords or a manual
  // addition. See trend-selection-dedup-scoring.md §4.
  "宇树",
  "Unitree",
  "智元",
  "AgiBot",
  "优必选",
  "UBTECH",
  "银河通用",
  "Galbot",
  "傅利叶",
  "Fourier Intelligence",
  "云深处",
  "Deep Robotics",
  "星动纪元",
  "Robot Era",
  "众擎",
  "EngineAI",
  "逐际动力",
  "LimX Dynamics",
  "松延动力",
  "达闼",
  "CloudMinds",
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
 * - Single English words: whole-word match at ASCII word boundaries, so "AI"
 *   matches "对AI的" but not "training" or "OpenAI"
 * - Chinese keywords: substring match
 */
function titleMatchesKeyword(title, kw) {
  const lowerKw = kw.toLowerCase();
  // Multi-word keyword (e.g., "china ai", "artificial intelligence")
  if (kw.includes(" ")) {
    return title.includes(lowerKw);
  }
  // Single ASCII word — match at ASCII word boundaries
  if (/^[a-z0-9]+$/i.test(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(title);
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
 * Normalize a numeric token so "$1.4B" and "1.4 billion" compare alike.
 *
 * #1355: the previous rule replaced the WHOLE token with "NUM" whenever it
 * contained a digit. A spaceless Chinese headline is one token, so
 * 「中国拟新增23项AI技术出口管制」和「英伟达第三季度营收570亿美元」both collapsed
 * to the literal {"NUM"} — identical token sets, so two unrelated stories
 * merged (and, because containment is 1.0 for a one-token set, they also
 * swallowed every other digit-bearing headline in the run).
 *
 * Now only a token that *is* a number (with an optional unit suffix) becomes
 * "NUM"; a token that merely contains digits keeps its words and normalizes
 * the digits in place.
 */
function normalizeNumericToken(token) {
  if (/^[0-9][0-9.,]*[a-z%]*$/.test(token)) return "NUM";
  return /[0-9]/.test(token) ? token.replace(/[0-9]+(?:\.[0-9]+)?/g, "NUM") : token;
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
      .map(normalizeNumericToken),
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
 * A one-token title shorter than this is an entity label ("deepseek",
 * "openai"), not a topic statement.
 */
const MIN_SINGLE_TOKEN_CHARS = 10;

/**
 * Whether containment may judge a pair at all.
 *
 * #1355: containment divides by the *shorter* set, so a one-token title scores
 * 1.0 against every title that contains the word — "DeepSeek" swallowed
 * "DeepSeek V5 或将成为首个完全基于国产芯片预训练的顶级大模型". A short single
 * token is an entity name and is only ever merged on exact/Jaccard equality;
 * a long single token is a spaceless Chinese sentence (tokenize() cannot split
 * it) and carries enough information to stay comparable.
 */
function isContainmentComparable(tokenSet) {
  if (tokenSet.size >= 2) return true;
  const [only] = tokenSet;
  // A title that is nothing but a normalized number is not an entity label;
  // this keeps the documented "$1.4B" ≈ "1.4 billion" equivalence.
  if (only === "NUM") return true;
  return typeof only === "string" && only.length >= MIN_SINGLE_TOKEN_CHARS;
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
  if (!isContainmentComparable(shorter)) return 0;
  let intersection = 0;
  for (const w of shorter) {
    if (longer.has(w)) intersection++;
  }
  return intersection / shorter.size;
}

/**
 * Record one contributing article on the topic's refs.
 *
 * A ref is keyed by (url, source): the same page reported by two sources keeps
 * two refs, so `sources` still lists both and `sourceStats` does not go down.
 * When the same page arrives twice with different titles (feed re-titles, CDP
 * markup vs API text), the ref keeps the longer title — that is the title the
 * topic may adopt, so the pairing must not be dropped on the floor.
 *
 * @param {Object} topic - topic whose refs are extended
 * @param {{title: string, url: string, source: string}} article
 */
function recordRef(topic, article) {
  const existingRef = topic.refs.find(
    (ref) => ref.url === article.url && ref.source === article.source,
  );
  if (existingRef) {
    if (article.title.length > existingRef.title.length) {
      existingRef.title = article.title;
    }
    return;
  }
  topic.refs.push({ title: article.title, url: article.url, source: article.source });
}

/**
 * Re-derive `sources` and `urls` from `refs` so the flat arrays always agree
 * with the per-article pairs.
 *
 * `urls[0]` is the url the surviving title came from: readers of the brief use
 * it as the citation for that title, and before #1355 it was whichever article
 * arrived first, which is how a topic ended up citing an unrelated page.
 * `urls` stays de-duplicated even when two sources contribute the same page.
 *
 * @param {Object} topic - mutated in place
 */
function syncTopicMembership(topic) {
  const titled = topic.refs.filter((ref) => ref.title === topic.title);
  const rest = topic.refs.filter((ref) => ref.title !== topic.title);
  topic.urls = [...new Set([...titled, ...rest].map((ref) => ref.url))];
  topic.sources = [...new Set(topic.refs.map((ref) => ref.source))];
}

/**
 * Deduplicate articles by title similarity.
 * Articles with >= 80% Jaccard similarity are merged, and so are articles whose
 * shorter title is fully contained in the longer one (see `containment`).
 * Merged topics keep the longest title, and keep every contributing article as
 * a `{ title, url, source }` ref so the title↔url pairing survives the merge
 * (#1355). `sources` / `urls` are derived from `refs`, with `urls[0]` pointing
 * at the article the surviving title came from.
 *
 * @param {Array} articles - Array of { title, source, url }
 * @returns {Array} Deduplicated articles with { title, sources[], urls[], refs[] }
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
        // Merge into existing: record the article's own title/url/source pair
        // before the topic title can be replaced by a longer one.
        recordRef(existing, article);
        // Keep longer title
        if (article.title.length > existing.title.length) {
          existing.title = article.title;
        }
        syncTopicMembership(existing);
        merged = true;
        break;
      }
    }
    if (!merged) {
      const refs = [{ title: article.title, url: article.url, source: article.source }];
      result.push({
        title: article.title,
        sources: [article.source],
        urls: [article.url],
        refs,
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
        // #1355: the merge keeps every contributing article's own title next to
        // its url, so a reader (or the brief) can tell which page said what
        // instead of trusting `urls[0]`. `urls[0]` is the url whose title won.
        refs:
          article.refs ||
          [{ title: article.title, url: article.url, source: article.source }].filter(
            (ref) => ref.url,
          ),
        keywords: extractKeywords(article.title),
        summary: "",
      };

      // T03 (#55): Extract imageUrl from article for cross-stage image caching.
      // NOTE: the asset sourcer's Phase 0 read of these cached URLs via
      // loadCachedImages() was retired by #356 (unowned fallback pool) — this
      // entry shape is retained but has no production caller from the sourcer.
      if (article.imageUrl) {
        topicEntry.images = [
          {
            url: article.imageUrl,
            sourceArticle: article.url || (article.urls && article.urls[0]) || null,
          },
        ];
      }

      // SVE (#114): Extract videoUrls from article for cross-stage video caching
      if (Array.isArray(article.videoUrls) && article.videoUrls.length > 0) {
        topicEntry.videos = article.videoUrls.map((url) => ({
          url,
          sourceArticle: article.url || (article.urls && article.urls[0]) || null,
        }));
      }

      // SVE (#114): Extract metadata (og:image, og:title, published_time) for
      // cross-stage enrichment
      if (article.metadata) {
        topicEntry.metadata = { ...article.metadata };
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
    if (titleMatchesKeyword(lower, kw) && !matched.includes(kw)) {
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

// ─── #63: dedupByUrl ───

/**
 * Deduplicate articles by canonical URL.
 *
 * Uses `canonicalizeUrl()` from url-normalizer.mjs (VDL #75) to normalize
 * URLs before comparison. Articles with empty/undefined URLs are kept
 * (not deduped against each other).
 *
 * When multiple articles share the same canonical URL, only the first
 * one is kept. The `source` field is NOT merged — URL dedup is exact
 * (same URL = same article); cross-URL semantic dedup is handled by
 * `deduplicateTopics()` downstream.
 *
 * @param {Array<{url?: string}>} articles
 * @returns {Array} Deduplicated array (first occurrence wins)
 */
export function dedupByUrl(articles) {
  const seen = new Set();
  const result = [];

  for (const article of articles) {
    const canonical = canonicalizeUrl(article.url);

    // Empty canonical URL — keep article, don't add to seen set
    if (!canonical) {
      result.push(article);
      continue;
    }

    if (!seen.has(canonical)) {
      seen.add(canonical);
      result.push(article);
    }
  }

  return result;
}
