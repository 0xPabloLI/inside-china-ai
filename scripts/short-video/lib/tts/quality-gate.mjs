/**
 * TTS Quality Gate & Self-Healing Loop (#225, #230).
 *
 * Automatically verifies TTS output using local Whisper ASR back-transcription,
 * completeness checks (e.g. ensuring "0910" / "September tenth" is not swallowed),
 * tail truncation detection, pacing bounds (WPM), and phonetic confusion guards.
 *
 * Prevents defective audio from flowing downstream into video rendering,
 * eliminating the need for manual human ear inspection on every iteration.
 *
 * @module tts/quality-gate
 */

import { existsSync, statSync } from "fs";
import { transcribeAudioWindow, closeAsrAnalyzer } from "../asr-analyzer.mjs";

// Pacing boundaries for vertical short videos (English)
export const MIN_ACCEPTABLE_WPM = 115; // Below 115 WPM indicates dragging / unnatural pause / accent drift
export const MAX_ACCEPTABLE_WPM = 225; // Above 225 WPM is too rushed for audience comprehension
export const MIN_TEXT_SIMILARITY = 0.75; // Minimum normalized token similarity threshold

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
 * Extract critical entity tokens (numbers, dates, proper nouns, and tail tokens).
 *
 * @param {string} text - expected voiceover or ttsText
 * @returns {{ criticalWords: string[], tailWords: string[] }}
 */
export function extractGuardedTokens(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { criticalWords: [], tailWords: [] };
  }

  // Tail words: the last 2 valid tokens (critical for detecting TTS truncation)
  const tailWords = tokens.slice(-2);

  // Critical words: digits, dates, key technical terms
  const dateMonthWords = new Set([
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "tenth", "10th", "eighth", "8th", "first", "second", "third", "fourth",
  ]);

  const criticalWords = [];
  for (const t of tokens) {
    if (/\d/.test(t) || dateMonthWords.has(t)) {
      criticalWords.push(t);
    }
  }

  return { criticalWords, tailWords };
}

/**
 * Check if an expected word is satisfied in the ASR token set,
 * taking numbers, digits, and ordinal equivalents into account.
 * E.g., "tenth" is satisfied by "10th" or "10"; "8" is satisfied by "eighth" or "8th".
 *
 * @param {string} expectedWord
 * @param {Set<string>} asrTokenSet
 * @returns {boolean}
 */
export function isWordInAsr(expectedWord, asrTokenSet) {
  if (asrTokenSet.has(expectedWord)) return true;
  const EQUIVALENTS = {
    "1": ["one", "first", "1st"],
    "one": ["1", "first", "1st"],
    "first": ["1", "1st", "one"],
    "1st": ["1", "first", "one"],
    "2": ["two", "second", "2nd"],
    "two": ["2", "second", "2nd"],
    "second": ["2", "2nd", "two"],
    "2nd": ["2", "second", "two"],
    "3": ["three", "third", "3rd"],
    "three": ["3", "third", "3rd"],
    "third": ["3", "3rd", "three"],
    "3rd": ["3", "third", "three"],
    "4": ["four", "fourth", "4th"],
    "four": ["4", "fourth", "4th"],
    "fourth": ["4", "4th", "four"],
    "4th": ["4", "fourth", "four"],
    "8": ["eight", "eighth", "8th"],
    "eight": ["8", "eighth", "8th"],
    "eighth": ["8", "8th", "eight"],
    "8th": ["8", "eighth", "eight"],
    "10": ["ten", "tenth", "10th"],
    "ten": ["10", "tenth", "10th"],
    "tenth": ["10", "10th", "ten"],
    "10th": ["10", "tenth", "ten"],
    "0910": ["september", "10", "10th", "tenth"],
  };
  const eqList = EQUIVALENTS[expectedWord];
  if (eqList) {
    for (const eq of eqList) {
      if (asrTokenSet.has(eq)) return true;
    }
  }
  return false;
}

/**
 * Compute token similarity between expected and ASR tokens,
 * accounting for word equivalents.
 *
 * @param {string[]} expectedTokens
 * @param {string[]} asrTokens
 * @returns {number} 0.0 - 1.0
 */
export function computeTokenSimilarity(expectedTokens, asrTokens) {
  if (expectedTokens.length === 0 && asrTokens.length === 0) return 1.0;
  if (expectedTokens.length === 0 || asrTokens.length === 0) return 0.0;

  const setB = new Set(asrTokens);
  let matches = 0;
  for (const token of expectedTokens) {
    if (isWordInAsr(token, setB)) matches++;
  }

  return matches / Math.max(expectedTokens.length, asrTokens.length);
}

/**
 * Check for typical phonetic confusion (e.g. [v] -> [b]).
 *
 * @param {string} expected
 * @param {string} asr
 * @returns {string[]} detected confusion issues
 */
export function detectPhoneticConfusion(expected, asr) {
  const issues = [];
  const expLower = expected.toLowerCase();
  const asrLower = asr.toLowerCase();

  // "v4.1" / "v four" -> "b4.1" / "b four"
  if (
    (expLower.includes("v4.1") || expLower.includes("v four") || expLower.includes("v4")) &&
    (asrLower.includes("b4.1") || asrLower.includes("b four") || asrLower.includes("b4") || asrLower.includes("be four"))
  ) {
    issues.push("Phonetic confusion: 'V4' pronounced as 'B4'");
  }

  // "multimodal" -> "multi mortem"
  if (expLower.includes("multimodal") && asrLower.includes("mortem")) {
    issues.push("Phonetic collapse: 'multimodal' recognized as 'multi mortem'");
  }

  return issues;
}

/**
 * Evaluate a single scene's generated audio against expected voiceover.
 *
 * @param {object} scene - { id, voiceover, ttsText, voiceoverTts }
 * @param {string} audioPath - path to wav/mp3 file
 * @param {number} durationSec - duration in seconds
 * @param {object} [options] - override thresholds or provide mock ASR for tests
 * @returns {Promise<object>} Evaluation result
 */
export async function evaluateSceneTts(scene, audioPath, durationSec, options = {}) {
  const {
    transcriber = transcribeAudioWindow,
    minWpm = MIN_ACCEPTABLE_WPM,
    maxWpm = MAX_ACCEPTABLE_WPM,
    minSimilarity = MIN_TEXT_SIMILARITY,
    strict = false,
  } = options;

  // 1. Verify audio file exists and has non-zero size
  if (!existsSync(audioPath) || statSync(audioPath).size === 0) {
    return {
      sceneId: scene.id,
      passed: false,
      issues: ["Audio file missing or zero bytes"],
      action: "retry",
    };
  }

  const expectedSpokenText = scene.ttsText || scene.voiceoverTts || scene.voiceover || "";
  const expectedTokens = tokenize(expectedSpokenText);
  const wordCount = expectedTokens.length;

  // 2. Measure Pacing (WPM)
  const durationMin = Math.max(0.1, durationSec) / 60;
  const wpm = Math.round(wordCount / durationMin);

  const issues = [];
  const warnings = [];

  const isLikelyEnglish = /[a-zA-Z]/.test(expectedSpokenText);
  if (isLikelyEnglish && wordCount >= 3) {
    if (wpm < minWpm) {
      issues.push(`Pacing too slow: ${wpm} WPM (minimum acceptable: ${minWpm} WPM)`);
    } else if (wpm > maxWpm) {
      warnings.push(`Pacing very fast: ${wpm} WPM (guideline max: ${maxWpm} WPM)`);
    }
  }

  // 3. ASR Back-Transcription
  let asrText = "";
  let asrOk = false;
  try {
    const asrRes = await transcriber(audioPath, { languageHint: "en" });
    if (asrRes && asrRes.ok && Array.isArray(asrRes.segments)) {
      asrText = asrRes.segments.map((s) => s.text).join(" ").trim();
      asrOk = true;
    } else {
      warnings.push("ASR back-transcription unavailable or returned degraded result");
    }
  } catch (err) {
    warnings.push(`ASR back-transcription error: ${err.message}`);
  }

  if (asrOk && asrText) {
    const asrTokens = tokenize(asrText);
    const asrTokenSet = new Set(asrTokens);

    // 4. Critical Token & Tail Boundary Verification
    const { criticalWords, tailWords } = extractGuardedTokens(expectedSpokenText);

    // Check tail words (truncation guard)
    const missingTail = tailWords.filter((w) => !isWordInAsr(w, asrTokenSet));
    if (missingTail.length > 0 && tailWords.length > 0) {
      issues.push(`Truncation detected: missing tail word(s) [${missingTail.join(", ")}]`);
    }

    // Check critical number/date tokens (completeness guard)
    const missingCritical = criticalWords.filter((w) => !isWordInAsr(w, asrTokenSet));
    if (missingCritical.length > 0) {
      issues.push(`Incomplete speech: missing key token(s) [${missingCritical.join(", ")}]`);
    }

    // 5. Similarity Score
    const similarity = computeTokenSimilarity(expectedTokens, asrTokens);
    if (similarity < minSimilarity) {
      issues.push(`Low text similarity: ${(similarity * 100).toFixed(1)}% (threshold: ${minSimilarity * 100}%)`);
    }

    // 6. Phonetic Confusion
    const phoneticIssues = detectPhoneticConfusion(expectedSpokenText, asrText);
    for (const pIssue of phoneticIssues) {
      if (strict) {
        issues.push(pIssue);
      } else {
        warnings.push(pIssue);
      }
    }

    return {
      sceneId: scene.id,
      passed: issues.length === 0,
      wpm,
      similarity,
      asrText,
      expectedText: expectedSpokenText,
      issues,
      warnings,
      action: issues.length === 0 ? "pass" : "retry",
    };
  }

  // If ASR is not available, rely on WPM and duration sanity
  return {
    sceneId: scene.id,
    passed: issues.length === 0,
    wpm,
    similarity: null,
    asrText: null,
    expectedText: expectedSpokenText,
    issues,
    warnings,
    action: issues.length === 0 ? "pass" : "retry",
  };
}

/**
 * Run TTS Quality Gate for an entire batch of generated audio results.
 *
 * @param {Array<object>} scenes
 * @param {Array<{sceneId: number, audioPath: string, duration: number}>} ttsResults
 * @param {object} [options]
 * @returns {Promise<{passed: boolean, evaluations: Array<object>, failedCount: number}>}
 */
export async function runTtsQualityGate(scenes, ttsResults, options = {}) {
  console.log(`\n🔍 Running TTS Quality Gate on ${ttsResults.length} scene(s)...`);

  const evaluations = [];
  let failedCount = 0;

  for (const r of ttsResults) {
    const scene = scenes.find((s) => s.id === r.sceneId);
    if (!scene) continue;

    const evalResult = await evaluateSceneTts(scene, r.audioPath, r.duration, options);
    evaluations.push(evalResult);

    if (!evalResult.passed) {
      failedCount++;
      console.warn(
        `  ❌ Scene ${scene.id} FAILED Quality Gate:\n` +
        `     Expected: "${evalResult.expectedText}"\n` +
        `     ASR Heard: "${evalResult.asrText || '(ASR unavailable)'}"\n` +
        `     WPM: ${evalResult.wpm} | Issues: ${evalResult.issues.join("; ")}`,
      );
    } else {
      const warnInfo = evalResult.warnings.length > 0 ? ` (⚠️  ${evalResult.warnings.join("; ")})` : "";
      console.log(
        `  ✅ Scene ${scene.id} PASSED Quality Gate: ${evalResult.wpm} WPM, ` +
        `similarity ${evalResult.similarity != null ? (evalResult.similarity * 100).toFixed(0) + "%" : "N/A"}${warnInfo}`,
      );
    }
  }

  return {
    passed: failedCount === 0,
    failedCount,
    evaluations,
  };
}
