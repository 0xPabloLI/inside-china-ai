/**
 * Episode Evaluator — determines if an article should be split into multiple videos.
 *
 * Pure function — accepts markdown text, returns recommendation.
 * Agent calls this, then makes narrative design decisions.
 */

const WORDS_PER_SECOND = 2.5; // F5-TTS average
const MAX_PARTS = 5;

/**
 * Strip frontmatter (--- delimited) from markdown.
 */
function stripFrontmatter(text) {
  const fmRegex = /^---\n[\s\S]*?\n---\n?/;
  return text.replace(fmRegex, "");
}

/**
 * Strip markdown formatting to get plain text for word counting.
 */
function stripMarkdown(text) {
  return (
    text
      // Remove widget markers
      .replace(/<!--\s*widget:[\w-]+\s*-->/g, "")
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      // Remove links, keep text
      .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
      // Remove inline code
      .replace(/`[^`]+`/g, "")
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      // Remove headings markers (keep text)
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
      // Remove blockquote markers
      .replace(/^>\s+/gm, "")
      // Remove list markers
      .replace(/^[-*+]\s+/gm, "")
      // Remove horizontal rules
      .replace(/^---+$/gm, "")
      .trim()
  );
}

/**
 * Count words in a plain text string.
 */
function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Count ## level headings (chapters).
 */
function countChapters(text) {
  const matches = text.match(/^##\s+/gm);
  return matches ? matches.length : 0;
}

/**
 * Count data points: numbers, percentages, dollar amounts.
 */
function countDataPoints(text) {
  // Match: $1.4, $1.4B, 50%, 20000, 1.4 billion, etc.
  const patterns = [
    /\$\d[\d,.]*\s*(?:billion|million|B|M)?/gi,
    /\d[\d,.]*%/g,
    /\d[\d,.]*\s*(?:billion|million|thousand)/gi,
    /\b\d{3,}\b/g, // 3+ digit numbers
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Determine split method based on chapter count and duration.
 */
function determineSplitMethod(chapterCount, recommendedParts) {
  if (recommendedParts <= 1) return "none";
  return chapterCount >= 2 ? "thematic" : "narrative";
}

/**
 * Build human-readable reasoning array.
 */
function buildReasoning(
  wordCount,
  estimatedDuration,
  recommendedParts,
  chapterCount,
  dataPointCount,
  splitMethod,
) {
  const reasons = [];

  if (recommendedParts > 1) {
    reasons.push(`Core narrative requires ~${Math.round(estimatedDuration)}s, exceeding 60s limit`);
  } else {
    reasons.push(`Core narrative fits in ~${Math.round(estimatedDuration)}s, within 60s limit`);
  }

  if (chapterCount >= 2) {
    reasons.push(
      `Article has ${chapterCount} independent subtopics, suitable for ${splitMethod} split`,
    );
  } else if (recommendedParts > 1) {
    reasons.push(
      `Single narrative thread, suitable for ${splitMethod} split by causality breakpoints`,
    );
  }

  if (dataPointCount > 8 && recommendedParts > 1) {
    reasons.push(
      `${dataPointCount} data points detected, distributing ~${Math.ceil(dataPointCount / recommendedParts)} per episode`,
    );
  }

  return reasons;
}

/**
 * Evaluate an article and recommend whether to split into multiple videos.
 *
 * @param {string} markdownText - Article markdown text (with optional frontmatter)
 * @returns {Object} {
 *   wordCount: number,
 *   estimatedDuration: number,
 *   recommendedParts: number,
 *   splitMethod: string,
 *   chapterCount: number,
 *   dataPointCount: number,
 *   reasoning: string[],
 * }
 */
export function evaluateArticle(markdownText) {
  if (!markdownText || typeof markdownText !== "string") {
    return {
      wordCount: 0,
      estimatedDuration: 0,
      recommendedParts: 1,
      splitMethod: "none",
      chapterCount: 0,
      dataPointCount: 0,
      reasoning: ["Empty or invalid input, defaulting to single video"],
    };
  }

  // Strip frontmatter
  const withoutFm = stripFrontmatter(markdownText);

  // Strip markdown for word count
  const plainText = stripMarkdown(withoutFm);
  const wordCount = countWords(plainText);

  // Count chapters
  const chapterCount = countChapters(withoutFm);

  // Count data points (from plain text, before stripping — numbers in original text)
  const dataPointCount = countDataPoints(withoutFm);

  // Estimate duration
  const estimatedDuration = wordCount / WORDS_PER_SECOND;

  // Determine recommended parts
  let recommendedParts;
  if (estimatedDuration <= 60) {
    recommendedParts = 1;
  } else if (estimatedDuration <= 120) {
    recommendedParts = 2;
  } else if (estimatedDuration <= 180) {
    recommendedParts = 3;
  } else if (estimatedDuration <= 240) {
    recommendedParts = 4;
  } else {
    recommendedParts = MAX_PARTS;
  }

  // Determine split method
  const splitMethod = determineSplitMethod(chapterCount, recommendedParts);

  // Build reasoning
  const reasoning = buildReasoning(
    wordCount,
    estimatedDuration,
    recommendedParts,
    chapterCount,
    dataPointCount,
    splitMethod,
  );

  return {
    wordCount,
    estimatedDuration,
    recommendedParts,
    splitMethod,
    chapterCount,
    dataPointCount,
    reasoning,
  };
}
