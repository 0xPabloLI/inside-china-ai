/**
 * BM25 Pre-filter Module. ADR-0016 Layer 3.
 */
export function tokenize(text) {
  if (!text || typeof text !== "string") return [];
  const tokens = [];
  const normalized = text
    .toLowerCase()
    .replace(/([a-z0-9])([^a-z0-9\s])/g, "$1 $2")
    .replace(/([^a-z0-9\s])([a-z0-9])/g, "$1 $2");
  const words = normalized.split(/[\s.,;:!?,。；：！？、“”‘’\(\)（）\[\]【】\-—–·`'"]+/);
  for (const word of words) {
    if (!word) continue;
    if (/^[a-z0-9]+$/.test(word)) {
      tokens.push(word);
    } else {
      for (const char of word) {
        if (char.trim()) tokens.push(char);
      }
    }
  }
  return tokens;
}
export function computeIDF(term, docFreqs, numDocs) {
  const n = docFreqs.get(term) || 0;
  return Math.max(0, Math.log(1 + (numDocs - n + 0.5) / (n + 0.5)));
}
export function bm25Score(
  queryTerms,
  docTerms,
  docFreqs,
  numDocs,
  avgDocLength,
  k1 = 1.5,
  b = 0.75,
) {
  if (!queryTerms || queryTerms.length === 0) return 0;
  const docLength = docTerms.length;
  if (docLength === 0) return 0;
  const termFreqs = new Map();
  for (const t of docTerms) {
    termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
  }
  let score = 0;
  for (const term of queryTerms) {
    const tf = termFreqs.get(term) || 0;
    if (tf === 0) continue;
    const idf = computeIDF(term, docFreqs, numDocs);
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docLength) / avgDocLength));
    score += idf * tfNorm;
  }
  return score;
}
export function bm25PreFilter(query, results, topK = 10) {
  if (!results || results.length === 0) return [];
  if (topK === 0) return [];
  const queryTerms = tokenize(query);
  const docTermsList = results.map((r) => tokenize(r.chunk_text || ""));
  const docFreqs = new Map();
  for (const terms of docTermsList) {
    const seen = new Set();
    for (const t of terms) {
      if (!seen.has(t)) {
        seen.add(t);
        docFreqs.set(t, (docFreqs.get(t) || 0) + 1);
      }
    }
  }
  const numDocs = results.length;
  const totalLength = docTermsList.reduce((sum, terms) => sum + terms.length, 0);
  const avgDocLength = numDocs > 0 ? totalLength / numDocs : 1;
  const scored = results.map((r, i) => ({
    ...r,
    _bm25Score: bm25Score(queryTerms, docTermsList[i], docFreqs, numDocs, avgDocLength),
  }));
  scored.sort((a, b) => b._bm25Score - a._bm25Score);
  return scored.slice(0, topK).map(({ _bm25Score, ...rest }) => rest);
}
