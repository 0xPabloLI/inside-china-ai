/**
 * Subtitle cue construction — alignment data → cues on the final video timeline.
 *
 * Two invariants drive this module:
 *
 * 1. A cue's text is always derived from its own word list. They are never
 *    stored independently, so a word can never be present in the text but
 *    missing from the karaoke timing (or vice versa).
 * 2. Scene offsets come from lib/timeline.mjs, the same module the assembler
 *    uses to size each clip, so cue times cannot drift from the rendered video.
 *
 * Timing rules follow the Netflix Timed Text Style Guide, converted to 30fps:
 * lead-in of 2 frames, minimum 0.8s on screen, out-time held 0.5s past the
 * speech, and gaps that are either exactly 2 frames or at least 0.5s (gaps in
 * between read as a blink).
 */

import { FPS, sceneTimeline, findScene } from "../timeline.mjs";
import { SUBTITLE_LANE } from "../safe-zones.mjs";
import { measureWidth } from "./measure.mjs";

/** Maximum words per cue — beyond this the karaoke sweep is too fast to track. */
export const MAX_WORDS = 6;
/** Soft pixel limit: break here only if it doesn't orphan the last word. */
export const SOFT_PX = 820;
/** Hard pixel limit: a line never exceeds this (lanes stay single-line normal case). */
export const HARD_PX = SUBTITLE_LANE.maxWidth;
/** Minimum time a cue stays on screen, in seconds. */
export const MIN_DURATION = 0.8;
/** How long a cue lingers after its last word, when there is room. */
export const HOLD_OUT = 0.5;
/** Gaps shorter than this are closed to exactly CHAIN_GAP. */
export const GAP_THRESHOLD = 0.5;
/** Cue appears this many frames before its first word. */
export const LEAD_IN_FRAMES = 2;
/** Mandatory separation between consecutive cues, in frames. */
export const CHAIN_GAP_FRAMES = 2;

const LEAD_IN = LEAD_IN_FRAMES / FPS;
const CHAIN_GAP = CHAIN_GAP_FRAMES / FPS;
const ONE_FRAME = 1 / FPS;

const SENTENCE_END = /[.!?:;]$/;

/**
 * Render a word list as display text.
 *
 * @param {Array<{text: string}>} words
 * @returns {string}
 */
export function joinWords(words) {
  return words
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1");
}

function makeChunk(words) {
  return { text: joinWords(words), words: [...words] };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Merge an orphaned trailing single-word chunk back into the previous chunk.
 *
 * A one-word chunk that our own splitting created reads as a blink; a one-word
 * chunk that is genuinely its own sentence ("Exactly.") is left alone.
 */
function mergeTrailingOrphan(chunks) {
  if (chunks.length < 2) return chunks;

  const last = chunks[chunks.length - 1];
  if (last.words.length !== 1) return chunks;

  const prev = chunks[chunks.length - 2];
  const combined = [...prev.words, ...last.words];
  if (combined.length > MAX_WORDS) return chunks;
  if (measureWidth(joinWords(combined)) > HARD_PX) return chunks;

  return [...chunks.slice(0, -2), makeChunk(combined)];
}

/**
 * Group word timings into subtitle-sized chunks.
 *
 * @param {Array<{text: string, start: number, end: number}>} wordList
 * @returns {Array<{text: string, words: Array<{text: string, start: number, end: number}>}>}
 */
export function chunkWords(wordList) {
  if (!wordList || wordList.length === 0) return [];

  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length > 0) {
      chunks.push(makeChunk(current));
      current = [];
    }
  };

  for (let i = 0; i < wordList.length; i++) {
    const word = wordList[i];

    if (current.length > 0) {
      const projected = measureWidth(joinWords([...current, word]));
      const remainingAfter = wordList.length - (i + 1);
      const hardBreak = current.length >= MAX_WORDS || projected > HARD_PX;
      // Only break on the soft limit if the next chunk won't be a lone word.
      const softBreak = projected > SOFT_PX && remainingAfter >= 1;
      if (hardBreak || softBreak) flush();
    }

    current.push(word);

    // The sentence-final word belongs to the chunk it ends, not the next one.
    if (SENTENCE_END.test(word.text)) flush();
  }

  flush();

  return mergeTrailingOrphan(chunks);
}

/**
 * Convert per-scene alignment data into raw cues on the absolute timeline.
 */
function collectRawCues(timingData, timeline) {
  const raw = [];

  for (const scene of timingData ?? []) {
    const entry = findScene(timeline, scene.sceneId);
    const speechLimit = entry.offset + entry.ttsDuration;
    const clipEnd = entry.offset + entry.clipDuration;

    for (const segment of scene.segments ?? []) {
      const segmentWords = (segment.words ?? []).map((w) => {
        const start = clamp(entry.offset + w.start, entry.offset, speechLimit);
        // Alignment occasionally emits end < start; a word never plays backwards.
        const end = clamp(entry.offset + w.end, start, speechLimit);
        return { text: w.text, start, end };
      });

      if (segmentWords.length > 0) {
        for (const chunk of chunkWords(segmentWords)) {
          raw.push({
            sceneId: scene.sceneId,
            clipEnd,
            text: chunk.text,
            words: chunk.words,
            speechStart: chunk.words[0].start,
            speechEnd: chunk.words[chunk.words.length - 1].end,
          });
        }
        continue;
      }

      // Alignment produced no word timings — keep the text, drop the karaoke.
      const text = (segment.text ?? "").trim();
      if (!text) continue;
      const start = clamp(entry.offset + (segment.start ?? 0), entry.offset, speechLimit);
      const end = clamp(entry.offset + (segment.end ?? 0), start, speechLimit);
      raw.push({
        sceneId: scene.sceneId,
        clipEnd,
        text,
        words: [],
        speechStart: start,
        speechEnd: end,
      });
    }
  }

  return raw.sort((a, b) => a.speechStart - b.speechStart);
}

function displayStart(cue) {
  return Math.max(cue.speechStart - LEAD_IN, 0);
}

function canMerge(a, b) {
  if (a.sceneId !== b.sceneId) return false;
  if ((a.words.length === 0) !== (b.words.length === 0)) return false;
  if (a.words.length + b.words.length > MAX_WORDS) return false;
  const text = a.words.length > 0 ? joinWords([...a.words, ...b.words]) : `${a.text} ${b.text}`;
  return measureWidth(text) <= HARD_PX;
}

function mergeCues(a, b) {
  const words = [...a.words, ...b.words];
  return {
    sceneId: a.sceneId,
    clipEnd: b.clipEnd,
    words,
    text: words.length > 0 ? joinWords(words) : `${a.text} ${b.text}`,
    speechStart: a.speechStart,
    speechEnd: b.speechEnd,
  };
}

/**
 * Netflix "borrowing time": when a cue cannot reach the minimum duration
 * without overlapping its neighbour, merge the two rather than flash it.
 */
function borrowTime(rawCues) {
  let cues = rawCues;
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < cues.length - 1; i++) {
      const window = displayStart(cues[i + 1]) - CHAIN_GAP - displayStart(cues[i]);
      if (window >= MIN_DURATION) continue;
      if (!canMerge(cues[i], cues[i + 1])) continue;
      cues = [...cues.slice(0, i), mergeCues(cues[i], cues[i + 1]), ...cues.slice(i + 2)];
      changed = true;
      break;
    }
  }

  return cues;
}

/**
 * Assign display in/out times to raw cues.
 */
function layoutCues(rawCues) {
  const starts = rawCues.map(displayStart);
  const cues = [];

  for (let i = 0; i < rawCues.length; i++) {
    const raw = rawCues[i];
    const previous = cues[cues.length - 1];

    let start = starts[i];
    if (previous) start = Math.max(start, previous.end + CHAIN_GAP);

    let end = raw.speechEnd + HOLD_OUT;

    const hasNext = i + 1 < rawCues.length;
    if (hasNext && starts[i + 1] - end < GAP_THRESHOLD) {
      // Close the gap to exactly two frames, extending or trimming as needed.
      end = starts[i + 1] - CHAIN_GAP;
    }

    // A scene change is a shot change: don't let a cue straddle it.
    end = Math.min(end, raw.clipEnd);

    const ceiling = hasNext ? starts[i + 1] - CHAIN_GAP : Infinity;
    end = Math.min(Math.max(end, start + MIN_DURATION), ceiling);
    end = Math.max(end, start + ONE_FRAME);

    cues.push({ start, end, text: raw.text, words: raw.words });
  }

  return cues;
}

/**
 * Build display-ready cues from alignment data.
 *
 * @param {Array<{sceneId: number, segments: Array}>} timingData - subtitle-timing.json
 * @param {Array<{sceneId: number, duration: number}>} sceneDurations - scene-durations.json
 * @returns {Array<{start: number, end: number, text: string, words: Array}>}
 */
export function buildCues(timingData, sceneDurations) {
  const timeline = sceneTimeline(sceneDurations);
  return layoutCues(borrowTime(collectRawCues(timingData, timeline)));
}
