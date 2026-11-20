/**
 * Display-side token joining (#1466).
 *
 * The cue builder was written against whitespace-separated English words, so
 * every token was joined with a space. Chinese alignment tokens carry no
 * separator of their own, and joining them that way renders 中文 as 「中 文」.
 * One join rule lives here so the cue builder and the cross-segment token
 * restorer cannot drift apart.
 *
 * Rule: a space is inserted between two tokens unless either side is CJK.
 * That keeps Latin words spaced, keeps CJK compact, and leaves mixed runs
 * ("发布Qwen4", "下降62%") compact — subtitle pages are width-constrained, and
 * the inter-script space the typographic guides recommend costs a whole
 * character of lane width per boundary.
 */

/** Han, Kana and Hangul blocks — the scripts that are written without word spaces. */
const CJK_CHAR =
  /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/;

function chars(text) {
  return [...String(text ?? "")];
}

function needsSpace(previous, next) {
  const last = chars(previous).pop() ?? "";
  const first = chars(next)[0] ?? "";
  if (CJK_CHAR.test(last) || CJK_CHAR.test(first)) return false;
  return true;
}

/**
 * Join display tokens into one line.
 *
 * @param {Array<string|{text: string}>} tokens
 * @returns {string}
 */
export function joinTokens(tokens) {
  const parts = [];
  for (const token of tokens) {
    const text = typeof token === "string" ? token : (token?.text ?? "");
    if (text === "") continue;
    if (parts.length > 0 && needsSpace(parts[parts.length - 1], text)) parts.push(" ");
    parts.push(text);
  }
  // Punctuation never carries a leading space — same contract the English
  // joiner enforced, extended to the CJK forms.
  return parts.join("").replace(/\s+([,.;:!?，。！？；：、…])/g, "$1");
}
