/**
 * Subtitle verification — reads back the rendered .ass and checks it against
 * the alignment data.
 *
 * The previous version recomputed subtitle timings from the same input the
 * generator consumed, using its own (divergent) constants. That validates the
 * input against itself and cannot detect a generator bug: it stayed green while
 * 22 words were silently dropped from the rendered file.
 *
 * This version parses the artifact that will actually be burned in, so a word
 * that never made it into the .ass, or a karaoke highlight that drifted, fails.
 *
 * Usage (integrated):  called by main.mjs Step 6
 * Usage (CLI):         node verify-subtitles.mjs <video.mp4> <subtitles.ass> <subtitle-timing.json> <scene-durations.json> [output-dir]
 *                      (output-dir enables the end-to-end audio sync check;
 *                      scene audio is read from <output-dir>/audio)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { FPS, sceneTimeline, findScene } from "./timeline.mjs";
import { parseAss } from "./subtitles/ass.mjs";
import { MAX_WORDS, MIN_DURATION, GAP_THRESHOLD, CHAIN_GAP_FRAMES } from "./subtitles/cues.mjs";
import { verifyAudioSync, applyAudioSyncToSummary, AUDIO_SYNC_TOLERANCE } from "./audio/sync.mjs";
import { writeDiagnosticsBundle } from "./audio/diagnostics.mjs";

/**
 * Max acceptable distance between a word's highlight and its spoken onset.
 * Single source of truth: audio/sync.mjs — the end-to-end audio check and the
 * per-word subtitle check must share one budget.
 */
export const SYNC_TOLERANCE = AUDIO_SYNC_TOLERANCE;
/** Stretches of video longer than this with no subtitle are reported. */
export const COVERAGE_GAP_THRESHOLD = 1.0;
/** ASS timestamps are centisecond-resolution; allow for rounding at both ends. */
const ROUNDING_SLACK = 0.011;
const CHAIN_GAP = CHAIN_GAP_FRAMES / FPS;
const SILENCE_THRESHOLD = -35;
const SILENCE_MIN_DURATION = 0.3;

// ─── Pure analysis ───

/**
 * Where each aligned word should land on the final timeline.
 *
 * Deliberately simple: scene offset + word offset. It does not replicate the
 * generator's chunking or lead-in rules, so agreement between this and the
 * rendered .ass is real evidence, not a tautology.
 *
 * @param {Array} timingData - subtitle-timing.json
 * @param {Array<{sceneId: number, duration: number}>} sceneDurations
 * @returns {Array<{sceneId: number, text: string, start: number, end: number}>}
 */
export function expectedWordTimes(timingData, sceneDurations) {
  const timeline = sceneTimeline(sceneDurations);
  const expected = [];

  for (const scene of timingData ?? []) {
    const entry = findScene(timeline, scene.sceneId);
    const limit = entry.offset + entry.ttsDuration;
    for (const segment of scene.segments ?? []) {
      for (const word of segment.words ?? []) {
        const start = Math.min(Math.max(entry.offset + word.start, entry.offset), limit);
        expected.push({
          sceneId: scene.sceneId,
          text: word.text,
          start,
          end: Math.min(Math.max(entry.offset + word.end, start), limit),
        });
      }
    }
  }

  return expected;
}

function renderedWords(cues) {
  return (cues ?? []).flatMap((cue) => cue.words ?? []);
}

/**
 * Check that the rendered subtitles carry every aligned word, in order.
 *
 * @param {Array} cues - parsed .ass cues
 * @param {Array} expectedWords - from expectedWordTimes()
 */
export function compareWordSequence(cues, expectedWords) {
  const rendered = renderedWords(cues);
  const expected = expectedWords ?? [];

  let firstMismatch = null;
  const limit = Math.max(rendered.length, expected.length);
  for (let i = 0; i < limit; i++) {
    const renderedText = rendered[i]?.text ?? null;
    const expectedText = expected[i]?.text ?? null;
    if (renderedText !== expectedText) {
      firstMismatch = { index: i, expected: expectedText, rendered: renderedText };
      break;
    }
  }

  return {
    matches: firstMismatch === null,
    rendered: rendered.length,
    expected: expected.length,
    firstMismatch,
  };
}

/**
 * Compare each word's karaoke onset against when it is actually spoken.
 */
export function analyzeSync(cues, expectedWords) {
  const rendered = renderedWords(cues);
  const expected = expectedWords ?? [];
  const offenders = [];
  let maxDeviation = 0;

  for (let i = 0; i < Math.min(rendered.length, expected.length); i++) {
    // A text mismatch is a sequence error, not a sync error — don't double-report.
    if (rendered[i].text !== expected[i].text) break;

    const delta = rendered[i].onset - expected[i].start;
    maxDeviation = Math.max(maxDeviation, Math.abs(delta));
    if (Math.abs(delta) > SYNC_TOLERANCE) {
      offenders.push({
        text: expected[i].text,
        expected: expected[i].start,
        actual: rendered[i].onset,
        delta,
      });
    }
  }

  return { maxDeviation, tolerance: SYNC_TOLERANCE, offenders };
}

/**
 * Cue-to-cue gaps must be either exactly two frames (chained) or at least half
 * a second. Anything in between reads as a blink; anything negative overlaps.
 *
 * Gaps that span a scene change are exempt: a cue is deliberately cut off at
 * the shot change rather than straddling it, so the chaining rule cannot apply.
 *
 * @param {Array<{start: number, end: number}>} cues
 * @param {number[]} [sceneBoundaries] - times where the video cuts to a new scene
 */
export function analyzeGaps(cues, sceneBoundaries = []) {
  const sorted = [...(cues ?? [])].sort((a, b) => a.start - b.start);
  const violations = [];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start - sorted[i - 1].end;
    const chained = Math.abs(gap - CHAIN_GAP) <= ROUNDING_SLACK;
    const separated = gap >= GAP_THRESHOLD - ROUNDING_SLACK;
    const atSceneChange = sceneBoundaries.some(
      (t) => t >= sorted[i - 1].end - ROUNDING_SLACK && t <= sorted[i].start + ROUNDING_SLACK,
    );
    if (!chained && !separated && !atSceneChange) {
      violations.push({ index: i, gap, previousEnd: sorted[i - 1].end, start: sorted[i].start });
    }
  }

  return { violations };
}

/**
 * Cues shorter than the readable minimum.
 */
export function analyzeCueDurations(cues) {
  const tooShort = (cues ?? [])
    .filter((cue) => cue.end - cue.start < MIN_DURATION - ROUNDING_SLACK)
    .map((cue) => ({
      start: cue.start,
      duration: cue.end - cue.start,
      text: (cue.text ?? "").substring(0, 40),
    }));

  return { tooShort };
}

/**
 * Cues carrying more words than the karaoke sweep can be followed across.
 */
export function analyzeWordsPerLine(cues) {
  const overLong = (cues ?? [])
    .filter((cue) => (cue.words?.length ?? 0) > MAX_WORDS)
    .map((cue) => ({ start: cue.start, words: cue.words.length, text: cue.text ?? "" }));

  return { overLong };
}

/**
 * Stretches of the video with no subtitle on screen.
 */
export function analyzeCoverage(cues, videoDuration) {
  if (!cues || cues.length === 0) {
    return { percent: 0, gaps: [{ from: 0, to: videoDuration, duration: videoDuration }] };
  }

  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const gaps = [];
  let prevEnd = 0;

  for (const cue of sorted) {
    if (cue.start - prevEnd > COVERAGE_GAP_THRESHOLD) {
      gaps.push({ from: prevEnd, to: cue.start, duration: cue.start - prevEnd });
    }
    prevEnd = Math.max(prevEnd, cue.end);
  }

  if (videoDuration - prevEnd > COVERAGE_GAP_THRESHOLD) {
    gaps.push({ from: prevEnd, to: videoDuration, duration: videoDuration - prevEnd });
  }

  const uncovered = gaps.reduce((sum, g) => sum + g.duration, 0);
  const percent = Math.max(0, ((videoDuration - uncovered) / videoDuration) * 100);

  return { percent: Math.round(percent * 10) / 10, gaps };
}

/**
 * Combine every analysis into one report.
 *
 * Errors (fail the run): a missing/extra word, a word out of sync, a cue gap in
 * the blink band. Warnings (reported, don't fail): short cues, long lines,
 * uncovered stretches — these are style issues, not broken output.
 */
export function buildReport({
  cues,
  expectedWords,
  videoDuration,
  silenceSegments = [],
  sceneBoundaries = [],
}) {
  const wordSequence = compareWordSequence(cues, expectedWords);
  const sync = analyzeSync(cues, expectedWords);
  const gaps = analyzeGaps(cues, sceneBoundaries);
  const durations = analyzeCueDurations(cues);
  const wordsPerLine = analyzeWordsPerLine(cues);
  const coverage = analyzeCoverage(cues, videoDuration);

  const errors = (wordSequence.matches ? 0 : 1) + sync.offenders.length + gaps.violations.length;
  const warnings = durations.tooShort.length + wordsPerLine.overLong.length + coverage.gaps.length;

  return {
    videoDuration,
    totalCues: cues?.length ?? 0,
    totalWords: renderedWords(cues).length,
    wordSequence,
    sync,
    gaps,
    durations,
    wordsPerLine,
    coverage,
    silenceSegments,
    summary: { errors, warnings, passed: errors === 0 },
  };
}

/**
 * Parse FFmpeg silencedetect output into paired segments.
 */
export function parseSilenceOutput(output) {
  if (!output) return [];

  const starts = [];
  const ends = [];
  for (const line of output.split("\n")) {
    const start = line.match(/silence_start:\s*([\d.]+)/);
    if (start) {
      starts.push(parseFloat(start[1]));
      continue;
    }
    const end = line.match(/silence_end:\s*([\d.]+)/);
    if (end) ends.push(parseFloat(end[1]));
  }

  const pairs = Math.min(starts.length, ends.length);
  return Array.from({ length: pairs }, (_, i) => ({ start: starts[i], end: ends[i] }));
}

/**
 * Parse ffprobe duration output.
 */
export function parseDuration(output) {
  if (!output) return null;
  const value = parseFloat(output.trim());
  return Number.isNaN(value) ? null : value;
}

// ─── FFmpeg-backed helpers ───

export function detectSilence(videoPath) {
  try {
    const output = execSync(
      `ffmpeg -i "${videoPath}" -af silencedetect=noise=${SILENCE_THRESHOLD}dB:d=${SILENCE_MIN_DURATION} -f null - 2>&1`,
      { stdio: ["pipe", "pipe", "pipe"] },
    ).toString();
    return parseSilenceOutput(output);
  } catch {
    return [];
  }
}

export function getVideoDuration(videoPath, fallbackDuration = 0) {
  try {
    const output = execSync(
      `ffprobe -i "${videoPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
      { stdio: ["pipe", "pipe", "pipe"] },
    ).toString();
    const duration = parseDuration(output);
    if (duration !== null) return duration;
  } catch {
    // fall through to the caller's estimate
  }
  return fallbackDuration;
}

// ─── Entry point ───

/**
 * Verify the subtitles that will be burned into a video.
 *
 * @param {object} options
 * @param {string} options.videoPath
 * @param {string} options.assPath - the generated .ass file
 * @param {Array} options.timingData - subtitle-timing.json
 * @param {Array<{sceneId: number, duration: number}>} options.sceneDurations
 * @param {string|null} [options.outputDir] - where to write verification-report.json
 * @returns {object} report
 */
export function verifySubtitles({
  videoPath,
  assPath,
  timingData,
  sceneDurations,
  outputDir = null,
}) {
  const cues = parseAss(readFileSync(assPath, "utf8"));
  const expectedWords = expectedWordTimes(timingData, sceneDurations);

  const timeline = sceneTimeline(sceneDurations);
  const fallbackDuration = timeline.reduce((sum, scene) => sum + scene.clipDuration, 0);
  const videoDuration = getVideoDuration(videoPath, fallbackDuration);

  const report = buildReport({
    cues,
    expectedWords,
    videoDuration,
    silenceSegments: detectSilence(videoPath),
    sceneBoundaries: timeline.map((scene) => scene.offset + scene.clipDuration),
  });

  // End-to-end audio sync: cross-correlate each scene's voiceover against the
  // shipped video's audio track. Subtitle checks above compare the .ass to the
  // alignment timeline — both pre-assembly — and cannot see assembly-stage
  // drift; this check measures the artifact the user actually hears.
  if (outputDir) {
    report.audioSync = verifyAudioSync({ videoPath, outputDir, sceneDurations });
    report.summary = applyAudioSyncToSummary(report.summary, report.audioSync);
  }

  if (outputDir) {
    const reportPath = join(outputDir, "verification-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  📋 Verification report: ${reportPath}`);
  }

  printSummary(report, videoPath);

  // Fail-loud closure: a red exit must come with the evidence to fix the
  // SOURCE. On FAIL, drop a self-contained diagnostics bundle (drift table,
  // packet gaps, stream durations, report copy). Best-effort by contract —
  // the exit code stays driven by summary.passed, and a bundle failure must
  // never mask the FAIL.
  if (outputDir && !report.summary.passed) {
    const bundleDir = writeDiagnosticsBundle({ outputDir, report, videoPath });
    if (bundleDir) {
      console.log(`  📦 Diagnostics bundle: ${bundleDir}`);
    }
  }

  return report;
}

function printSummary(report, videoPath) {
  const { summary, wordSequence, sync, gaps, durations, wordsPerLine, coverage } = report;

  console.log(`\n📊 Subtitle Verification Report`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Video: ${videoPath}`);
  console.log(`Duration: ${report.videoDuration.toFixed(2)}s`);
  console.log(`Cues: ${report.totalCues}   Words: ${report.totalWords}`);

  console.log(
    `\n🔍 Word sequence: ${wordSequence.rendered}/${wordSequence.expected} rendered` +
      (wordSequence.matches ? " ✓" : ""),
  );
  if (!wordSequence.matches) {
    const m = wordSequence.firstMismatch;
    console.log(
      `   ✗ first mismatch at #${m.index}: expected "${m.expected}", got "${m.rendered}"`,
    );
  }

  console.log(
    `\n🔍 Sync: max deviation ${(sync.maxDeviation * 1000).toFixed(0)}ms ` +
      `(tolerance ${(sync.tolerance * 1000).toFixed(0)}ms), ${sync.offenders.length} over`,
  );
  for (const o of sync.offenders.slice(0, 5)) {
    console.log(`   ✗ "${o.text}" at ${o.actual.toFixed(2)}s, Δ ${(o.delta * 1000).toFixed(0)}ms`);
  }

  console.log(`\n🔍 Cue gaps: ${gaps.violations.length} violation(s)`);
  for (const v of gaps.violations.slice(0, 5)) {
    console.log(
      `   ✗ ${v.previousEnd.toFixed(2)}s → ${v.start.toFixed(2)}s (${(v.gap * 1000).toFixed(0)}ms)`,
    );
  }

  if (report.audioSync) {
    const a = report.audioSync;
    console.log(
      `\n🔊 Audio sync: ${a.checked} scene(s) measured, ${a.skipped} skipped, ` +
        `${a.errors} over tolerance`,
    );
    if (a.errored) {
      console.log(`   ✗ ${a.error}`);
    }
    for (const s of a.scenes ?? []) {
      if (!s.ok) {
        console.log(
          `   ✗ scene ${s.sceneId} audio starts ${s.driftMs >= 0 ? "+" : ""}${s.driftMs.toFixed(0)}ms off ` +
            `(expected ${s.expected.toFixed(2)}s, measured ${s.measured.toFixed(2)}s)`,
        );
      }
    }
    for (const f of a.failedScenes ?? []) {
      console.log(`   ✗ scene ${f.sceneId} could not be measured: ${f.reason}`);
    }
  }

  console.log(
    `\n⚠️  Warnings: ${durations.tooShort.length} short cue(s), ` +
      `${wordsPerLine.overLong.length} long line(s), ${coverage.gaps.length} coverage gap(s) ` +
      `(${coverage.percent}% covered)`,
  );

  console.log(`\n${"=".repeat(50)}`);
  if (summary.passed) {
    console.log(`✅ PASS — ${summary.warnings} warning(s)`);
  } else {
    console.log(`❌ FAIL — ${summary.errors} error(s), ${summary.warnings} warning(s)`);
  }
  console.log();
}
