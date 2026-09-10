/**
 * Restore original display tokens in aligned subtitle timing.
 *
 * text-align.py aligns the SPOKEN track (scene.ttsText — "V four point one")
 * because wav2vec2's dictionary has no digit tokens. Its output words are
 * therefore spoken-form words, and burning them shows "V four point one" in
 * the subtitles. This module maps each recorded replacement
 * (scene.ttsReplacements: {spoken: [...], original}) back onto the aligned
 * word stream so subtitles display the original token ("V4.1") with the
 * union of the spoken words' timing.
 *
 * Match failure is non-fatal: unmatched runs keep their spoken words (same
 * as the pre-fix behavior, never worse).
 *
 * @module subtitles/restore-tokens
 */

/** Lowercase + strip trailing/leading punctuation for comparison. */
function normWord(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Restore original tokens in one timing array (mutates and returns it).
 *
 * @param {Array<{sceneId: number, segments: Array<{text: string, start: number, end: number, words: Array<{text: string, start: number, end: number}>}>}>} timingData
 * @param {Array<{id: number, voiceover?: string, ttsText?: string, ttsReplacements?: Array<{spoken: string[], original: string}>}>} scenes
 * @returns {Array} the same timingData
 */
export function restoreTimingTokens(timingData, scenes) {
  if (!Array.isArray(timingData)) return timingData;

  for (const timing of timingData) {
    const scene = scenes?.find((s) => s.id === timing.sceneId);
    const reps = scene?.ttsReplacements;
    if (!scene || !Array.isArray(reps) || reps.length === 0) continue;
    if (!Array.isArray(timing.segments)) continue;

    // Flatten words in order, remembering which segment each came from.
    const flat = [];
    timing.segments.forEach((seg, segIndex) => {
      for (const w of seg.words ?? []) flat.push({ ...w, _seg: segIndex });
    });
    if (flat.length === 0) continue;

    const normFlat = flat.map((w) => normWord(w.text));

    // Walk the stream, replacing spoken runs with the original token.
    const out = [];
    let i = 0;
    while (i < flat.length) {
      let matched = false;
      for (const rep of reps) {
        if (!rep?.spoken?.length) continue;
        if (i + rep.spoken.length > flat.length) continue;
        let ok = true;
        for (let k = 0; k < rep.spoken.length; k++) {
          if (normFlat[i + k] !== normWord(rep.spoken[k])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        // Carry over trailing punctuation from the last consumed word
        // ("tenth." → "0910.") so sentence punctuation survives restore.
        const lastRaw = String(flat[i + rep.spoken.length - 1].text ?? "");
        const trailing = lastRaw.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? "";
        out.push({
          text: rep.original + trailing,
          start: flat[i].start,
          end: flat[i + rep.spoken.length - 1].end,
          _seg: flat[i]._seg,
        });
        i += rep.spoken.length;
        matched = true;
        break;
      }
      if (!matched) {
        out.push(flat[i]);
        i += 1;
      }
    }

    // Rebuild segments from the restored words.
    const rebuilt = new Map();
    for (const w of out) {
      if (!rebuilt.has(w._seg)) rebuilt.set(w._seg, []);
      rebuilt.get(w._seg).push({ text: w.text, start: w.start, end: w.end });
    }
    timing.segments = timing.segments.map((seg, segIndex) => {
      const words = rebuilt.get(segIndex) ?? [];
      if (words.length === 0) {
        // Every word of this segment was consumed by a cross-segment
        // replacement — emit an empty segment so no spoken word leaks through.
        return { ...seg, text: "", words: [] };
      }
      const text = words
        .map((w) => w.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1");
      return { ...seg, text, words };
    });
  }

  return timingData;
}