/**
 * Retrieval for the reader-facing grounded Q&A ("Ask China AI").
 *
 * The RAG embedding index (`content_embeddings`) is built offline with a local
 * bge-m3 model (1024-dim), so it cannot be queried from the edge runtime at
 * request time — no compatible embedding model is reachable there. Instead we
 * do lexical retrieval over published posts: a small BM25-style term score over
 * title / excerpt / body, then extract the best matching passage per post.
 */

import { createPublicClient } from "@/integrations/supabase/public-client";

export interface RetrievedSource {
  slug: string;
  title: string;
  publishedAt: string | null;
  /** Passage of the article body most relevant to the question. */
  passage: string;
  score: number;
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","than","that","this","these","those","of","in","on",
  "at","to","for","with","without","from","by","as","is","are","was","were","be","been","being",
  "do","does","did","doing","have","has","had","it","its","about","into","over","under","how","what",
  "which","who","whom","when","where","why","can","could","should","would","will","shall","may",
  "might","i","you","he","she","we","they","me","my","your","their","there","here","not","no","yes",
  "vs","versus","best","most","new","latest",
]);

const MAX_PASSAGE_CHARS = 1600;
const PASSAGE_WINDOW = 1400;

/** Split a question into scoring terms: latin words plus CJK bigrams. */
function extractTerms(question: string): string[] {
  const lower = question.toLowerCase();
  const terms = new Set<string>();

  for (const word of lower.match(/[a-z0-9][a-z0-9+.\-]*/g) ?? []) {
    const clean = word.replace(/[.\-+]+$/, "");
    if (clean.length >= 2 && !STOPWORDS.has(clean)) terms.add(clean);
  }

  // CJK: no whitespace boundaries, so use character bigrams.
  for (const run of lower.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let i = 0; i < run.length - 1; i += 1) terms.add(run.slice(i, i + 2));
  }

  return [...terms].slice(0, 24);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < 50) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Pick the body window with the highest term density. */
function bestPassage(content: string, terms: string[]): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= MAX_PASSAGE_CHARS) return text;

  const lower = text.toLowerCase();
  const step = 350;
  let bestStart = 0;
  let bestScore = -1;

  for (let start = 0; start < lower.length; start += step) {
    const window = lower.slice(start, start + PASSAGE_WINDOW);
    let score = 0;
    for (const term of terms) score += countOccurrences(window, term);
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  const slice = text.slice(bestStart, bestStart + PASSAGE_WINDOW);
  return (bestStart > 0 ? "… " : "") + slice + (bestStart + PASSAGE_WINDOW < text.length ? " …" : "");
}

/**
 * Find the published posts most relevant to `question`.
 * Returns at most `limit` sources, highest score first, or `[]` when nothing matches.
 */
export async function retrieveSources(question: string, limit = 4): Promise<RetrievedSource[]> {
  const terms = extractTerms(question);
  if (terms.length === 0) return [];

  const sb = createPublicClient();
  const { data, error } = await sb
    .from("posts")
    .select("title, slug, excerpt, content, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const scored: RetrievedSource[] = [];

  for (const post of data ?? []) {
    const title = (post.title ?? "").toLowerCase();
    const excerpt = (post.excerpt ?? "").toLowerCase();
    const content = (post.content ?? "").toLowerCase();

    let score = 0;
    let matchedTerms = 0;
    for (const term of terms) {
      const inTitle = countOccurrences(title, term);
      const inExcerpt = countOccurrences(excerpt, term);
      const inBody = countOccurrences(content, term);
      if (inTitle + inExcerpt + inBody === 0) continue;
      matchedTerms += 1;
      // Saturating body term frequency keeps long posts from dominating.
      score += inTitle * 6 + inExcerpt * 3 + Math.min(inBody, 8);
    }
    if (matchedTerms === 0) continue;
    // Reward covering more of the question, not just repeating one term.
    score *= 1 + matchedTerms / terms.length;

    scored.push({
      slug: post.slug,
      title: post.title,
      publishedAt: post.published_at,
      passage: bestPassage(post.content ?? post.excerpt ?? "", terms),
      score,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
