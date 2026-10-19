/**
 * Text normalisation and tokenisation for TTS verification (#415 pattern,
 * #786 extraction).
 *
 * These two helpers are the single source of the Quality Gate's word count —
 * the WPM the gate measures, the pacing ladder compensates toward, and the
 * WPM of an already-approved cached take all have to come from the same
 * tokenizer or the three disagree on the same audio.
 *
 * They live in a leaf module so the registry can import them without loading
 * quality-gate.mjs's ASR stack (transcriber, vocabulary guards). Same reason
 * the failure-class routing helpers moved out (#415).
 */

/**
 * Standardize text for phonetic & token comparison:
 * lowercase, strip punctuation, normalize whitespaces.
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanText(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s\d]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract tokens from text.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const cleaned = cleanText(text);
  return cleaned ? cleaned.split(" ") : [];
}

/**
 * The text a take actually speaks.
 *
 * Three call sites have to agree on this or they measure different things on
 * the same audio: the Quality Gate's WPM, the pacing ladder's compensation, and
 * the re-judgement of an approved cached take. The order is the gate's
 * (`voiceoverTts` is the legacy normalised track) — it lives here so a fourth
 * caller cannot invent a fourth order.
 *
 * @param {{ttsText?: string, voiceoverTts?: string, voiceover?: string}} scene
 * @returns {string}
 */
function resolveSpeechText(scene) {
  return scene?.ttsText || scene?.voiceoverTts || scene?.voiceover || "";
}

/**
 * Words-per-minute for a take, using the Quality Gate's own metric: tokenized
 * expected words over measured audio duration, rounded.
 *
 * @param {string} text - expected spoken text
 * @param {number} durationSec - measured audio duration
 * @returns {number} WPM (0 when there is no text/duration)
 */
function measureWpm(text, durationSec) {
  const words = tokenize(text).length;
  const minutes = Math.max(0.1, Number(durationSec)) / 60;
  if (!Number.isFinite(minutes) || minutes <= 0 || words === 0) return 0;
  return Math.round(words / minutes);
}

/**
 * WPM for a scene's take, resolving the spoken text the same way the gate does.
 *
 * @param {object} scene
 * @param {number} durationSec
 * @returns {number}
 */
export function measureSceneWpm(scene, durationSec) {
  return measureWpm(resolveSpeechText(scene), durationSec);
}
