/**
 * Dual-track restoration invariant (#753).
 *
 * The pipeline keeps two text tracks:
 *   - `scene.voiceover` — display form ("GPT-5.6"), what subtitles must show;
 *   - `scene.ttsText`   — spoken form ("GPT-five point six"), what TTS reads.
 *
 * `restore-tokens.mjs` maps the aligned spoken words back to the display
 * tokens by matching WHOLE whitespace tokens, and it fails soft: an
 * unconsumed run keeps its spoken words, which are then burned into the
 * video. That soft failure is how "GPT-5.6" shipped as "GPT-five".
 *
 * This module turns that soft failure into a checkable invariant:
 *
 *   1. static  — every recorded replacement must be consumable in the scene's
 *                 own `ttsText` (checked before the ASS is generated);
 *   2. dynamic — the restored timing must not still contain a spoken run.
 *
 * Both are cheap, pure and side-effect free so callers can decide whether to
 * throw (render boundary) or warn (diagnostics).
 *
 * @module subtitles/dual-track
 */

/** Lowercase + strip leading/trailing non-letter/digit characters. */
export function normWord(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Whitespace tokens of a track. text-align.py emits the spoken track's own
 * whitespace tokens as its word stream, so this is the unit both the aligner
 * and the restore step agree on.
 *
 * Module-private: every consumer is in this file, so it is not part of the
 * public surface (knip fails the build on unused exports).
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitSpokenTokens(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

/** Stable identity of a replacement — duplicates must collapse when counted. */
function replacementKey(rep) {
  return `${rep?.original ?? ""}\u0000${(rep?.spoken ?? []).join("\u0001")}`;
}

/**
 * Replacements ordered longest-run-first.
 *
 * Shared with `restore-tokens`: a scene can record both `2` → ["two"] and
 * `2030` → ["two","thousand","thirty"], and trying the shorter run first split
 * "two thousand thirty" into "2 thousand thirty" (alibaba-ai-megabet scene 6,
 * #753 real-package smoke). One ordering function means the static check and
 * the runtime restore cannot disagree about what a track can consume.
 *
 * @param {Array<{spoken?: string[]}>} reps
 * @returns {Array<{rep: object, index: number}>}
 */
export function orderReplacements(reps) {
  return (reps ?? [])
    .map((rep, index) => ({ rep, index }))
    .sort((a, b) => (b.rep?.spoken?.length ?? 0) - (a.rep?.spoken?.length ?? 0));
}

/**
 * The ordered replacement whose spoken run starts at `start`, or null.
 *
 * @param {string[]} normWords - already normalized words
 * @param {number} start
 * @param {Array<{rep: {spoken?: string[]}, index: number}>} ordered
 * @returns {{rep: object, index: number}|null}
 */
export function findRunAt(normWords, start, ordered) {
  for (const entry of ordered) {
    const run = entry.rep?.spoken;
    if (!Array.isArray(run) || run.length === 0) continue;
    if (start + run.length > normWords.length) continue;
    let ok = true;
    for (let k = 0; k < run.length; k++) {
      if (normWords[start + k] !== normWord(run[k])) {
        ok = false;
        break;
      }
    }
    if (ok) return entry;
  }
  return null;
}

/**
 * Walk `tokens` the way `restoreTimingTokens` does and report which
 * replacement identities were consumed at least once.
 *
 * Identity (not index) is the unit: the same token can appear twice in one
 * line ("V4.1 … until V4.1 Pro ships"), and the restore loop legitimately
 * reuses the first matching entry both times. Counting by index reported the
 * never-inspected duplicate as a leak (#753 real-package smoke). A line where
 * only the first of two occurrences is consumable therefore passes the static
 * check; `findLeakedSpokenRuns` is the backstop for that case.
 *
 * @param {string[]} tokens
 * @param {Array<{spoken?: string[]}>} reps
 * @returns {Set<string>}
 */
function consumedReplacementKeys(tokens, reps) {
  const norm = tokens.map(normWord);
  const ordered = orderReplacements(reps);
  const consumed = new Set();
  let i = 0;
  while (i < tokens.length) {
    const match = findRunAt(norm, i, ordered);
    if (match) {
      consumed.add(replacementKey(match.rep));
      i += match.rep.spoken.length;
    } else {
      i += 1;
    }
  }
  return consumed;
}

/**
 * Replacements that cannot be consumed in `ttsText` — i.e. the spoken words
 * are glued to unrewritten text, so the restore step will leak them.
 *
 * @param {string} ttsText
 * @param {Array<{original: string, spoken: string[]}>} reps
 * @returns {Array<{original: string, spoken: string[]}>}
 */
export function findLeaksInTrack(ttsText, reps) {
  if (!Array.isArray(reps) || reps.length === 0) return [];
  const consumed = consumedReplacementKeys(splitSpokenTokens(ttsText), reps);
  return reps.filter((rep) => !consumed.has(replacementKey(rep)));
}

/**
 * Keep only the replacements that `ttsText` can actually consume.
 *
 * Used on the author-authored path (`scene.voiceoverTts`): the author decides
 * which tokens to expand, so a rule-derived replacement that is absent from
 * their spoken track describes a token they left in display form — dropping it
 * is correct, whereas failing the line would block valid content.
 *
 * @param {string} ttsText
 * @param {Array<{original: string, spoken: string[]}>} reps
 * @returns {Array<{original: string, spoken: string[]}>}
 */
export function filterConsumableReplacements(ttsText, reps) {
  if (!Array.isArray(reps) || reps.length === 0) return [];
  const consumed = consumedReplacementKeys(splitSpokenTokens(ttsText), reps);
  return reps.filter((rep) => consumed.has(replacementKey(rep)));
}

/**
 * Static check across scenes: every `ttsReplacements` entry must be
 * consumable in its scene's `ttsText`.
 *
 * @param {Array<{id: number, ttsText?: string, ttsReplacements?: Array}>} scenes
 * @returns {Array<{sceneId: number, original: string, spoken: string[], ttsText: string}>}
 */
export function findUnrestorableReplacements(scenes) {
  const leaks = [];
  for (const scene of scenes ?? []) {
    const reps = scene?.ttsReplacements;
    if (!Array.isArray(reps) || reps.length === 0) continue;
    const ttsText = String(scene.ttsText ?? "");
    for (const rep of findLeaksInTrack(ttsText, reps)) {
      leaks.push({
        sceneId: scene.id,
        original: rep.original,
        spoken: rep.spoken,
        ttsText,
      });
    }
  }
  return leaks;
}

/**
 * Does `word` carry `token` — either as the whole token or as one hyphen/slash
 * segment of a compound? A leaked spoken word is glued exactly this way:
 * "two-Speciale" is the leftover of "V3.2-Speciale" after a partial rewrite.
 */
function wordCarriesToken(word, token) {
  if (word === token) return true;
  return word.split(/[-/]/).some((segment) => segment === token);
}

/**
 * Dynamic check: the restored timing must not still carry a spoken run.
 *
 * A run that is still present means restore could not map it (glued token,
 * drifted alignment) and the render would burn the spoken form. The last word
 * of the run is matched segment-wise because a failed restore leaves it glued
 * to the unrewritten half ("two-Speciale").
 *
 * @param {Array<{id: number, ttsReplacements?: Array}>} scenes
 * @param {Array|{scenes: Array}} timingData
 * @returns {Array<{sceneId: number, original: string, spoken: string[]}>}
 */
export function findLeakedSpokenRuns(scenes, timingData) {
  const timing = Array.isArray(timingData) ? timingData : (timingData?.scenes ?? []);
  const leaks = [];
  for (const sceneTiming of timing) {
    const scene = (scenes ?? []).find((s) => s.id === sceneTiming?.sceneId);
    const reps = scene?.ttsReplacements;
    if (!Array.isArray(reps) || reps.length === 0) continue;

    const words = (sceneTiming.segments ?? []).flatMap((seg) =>
      (seg.words ?? []).map((w) => normWord(w.text)),
    );
    if (words.length === 0) continue;

    for (const rep of reps) {
      const run = rep?.spoken;
      if (!Array.isArray(run) || run.length === 0) continue;
      const normRun = run.map(normWord);
      for (let i = 0; i + normRun.length <= words.length; i++) {
        let ok = true;
        for (let k = 0; k < normRun.length; k++) {
          const isLast = k === normRun.length - 1;
          const hit = isLast
            ? wordCarriesToken(words[i + k], normRun[k])
            : words[i + k] === normRun[k];
          if (!hit) {
            ok = false;
            break;
          }
        }
        if (ok) {
          leaks.push({ sceneId: scene.id, original: rep.original, spoken: run });
          break;
        }
      }
    }
  }
  return leaks;
}

/** One-line description of a leak, used in logs and error messages. */
export function formatLeak(leak) {
  return `scene ${leak.sceneId}: "${leak.original}" → [${(leak.spoken ?? []).join(" ")}]`;
}

/**
 * Scenes whose spoken track differs from the display track at the word level
 * but carry no replacement explaining the difference — an author-written
 * `voiceoverTts: "GPT five point six"` is the typical shape. Restore has
 * nothing to map, so the spoken form reaches the subtitles and no invariant
 * can see it (both checks skip scenes with no replacements).
 *
 * Reported as a warning rather than an error: punctuation-only drift
 * ("Flash with" → "Flash, with") normalizes to the same word sequence and is
 * legitimate, and an author may deliberately ship a spoken-looking line.
 *
 * @param {Array<{id: number, voiceover?: string, ttsText?: string, ttsReplacements?: Array}>} scenes
 * @returns {Array<{sceneId: number, voiceover: string, ttsText: string}>}
 */
export function findUnmappedSpokenScenes(scenes) {
  const unmapped = [];
  for (const scene of scenes ?? []) {
    if (!scene?.voiceover || !scene?.ttsText) continue;
    if (Array.isArray(scene.ttsReplacements) && scene.ttsReplacements.length > 0) continue;
    const display = splitSpokenTokens(scene.voiceover).map(normWord).join(" ");
    const spoken = splitSpokenTokens(scene.ttsText).map(normWord).join(" ");
    if (display !== spoken) {
      unmapped.push({ sceneId: scene.id, voiceover: scene.voiceover, ttsText: scene.ttsText });
    }
  }
  return unmapped;
}

/**
 * Fail-closed gate for the render boundary: no unconsumed spoken run may
 * reach the .ass file.
 *
 * @param {object} options
 * @param {Array} options.scenes
 * @param {Array|{scenes: Array}} [options.timingData] - restored timing, when available
 * @throws {Error} listing every leak found
 */
export function assertDualTrackRestorable({ scenes, timingData } = {}) {
  const unmapped = findUnmappedSpokenScenes(scenes);
  if (unmapped.length > 0) {
    console.warn(
      `  ⚠️  ${unmapped.length} scene(s) ship a spoken-looking ttsText with no restore mapping ` +
        `(${unmapped.map((s) => `scene ${s.sceneId}`).join(", ")}) — subtitles will show the ` +
        `spoken form. Rewrite them through the derived form, or confirm the display line (#753).`,
    );
  }

  const staticLeaks = findUnrestorableReplacements(scenes);
  const dynamicLeaks = timingData ? findLeakedSpokenRuns(scenes, timingData) : [];

  if (staticLeaks.length === 0 && dynamicLeaks.length === 0) return;

  const lines = [];
  if (staticLeaks.length > 0) {
    lines.push(
      `${staticLeaks.length} replacement(s) cannot be consumed in ttsText (glued token):`,
      ...staticLeaks.map((leak) => `  - ${formatLeak(leak)}\n    ttsText: ${leak.ttsText}`),
    );
  }
  if (dynamicLeaks.length > 0) {
    lines.push(
      `${dynamicLeaks.length} spoken run(s) survived restoration in the timing data:`,
      ...dynamicLeaks.map((leak) => `  - ${formatLeak(leak)}`),
    );
  }
  throw new Error(
    `Dual-track restoration invariant violated — refusing to burn spoken form into subtitles (#753).\n` +
      `${lines.join("\n")}\n` +
      `Fix the normalization rule (a replacement must cover whole whitespace tokens) ` +
      `or set scene.voiceoverTts explicitly for this line.`,
  );
}
