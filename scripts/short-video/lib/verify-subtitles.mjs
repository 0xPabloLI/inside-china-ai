/**
 * Subtitle Verification System
 *
 * Analyzes subtitle coverage, duration, and audio-sync alignment
 * for pipeline-produced videos. Outputs JSON report + console summary.
 *
 * Usage (integrated):  called by main.mjs Step 6
 * Usage (CLI):         node verify-subtitles.mjs <video.mp4> <subtitle-timing.json> [scene-durations.json]
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// ─── Constants ───
const START_OFFSET = -0.3; // subtitles appear 0.3s before audio (matches generate-srt.mjs)
const SCENE_BUFFER = 0.5; // 0.5s between scenes (matches assemble.mjs)
const GAP_THRESHOLD = 1.0; // gaps > 1.0s are flagged
const MIN_SUB_DURATION = 0.5; // subtitles < 0.5s are flagged
const SYNC_TOLERANCE = 0.5; // sync deviations > 0.5s are flagged
const SILENCE_THRESHOLD = -35; // dB threshold for silencedetect
const SILENCE_MIN_DURATION = 0.3; // minimum silence duration to detect

// ─── Pure Functions (no external dependencies) ───

/**
 * Convert per-scene timing data to absolute timestamps.
 * Must match generate-srt.mjs logic: sceneOffset + START_OFFSET, 0.5s buffer.
 *
 * @param {Array<{sceneId, segments: Array<{text, start, end}>}>} timingData
 * @param {Array<{sceneId, duration}>} sceneDurations
 * @returns {Array<{sceneId, start, end, text}>}
 */
export function computeAbsoluteTimestamps(timingData, sceneDurations) {
  if (!timingData || timingData.length === 0) return [];

  const subtitles = [];
  let sceneOffset = 0;

  for (const scene of timingData) {
    const sceneId = scene.sceneId;
    const sceneDur = sceneDurations.find((s) => s.sceneId === sceneId)?.duration || 0;

    for (const seg of scene.segments || []) {
      const startAbs = Math.max(sceneOffset + seg.start + START_OFFSET, 0);
      const endAbs = sceneOffset + Math.min(seg.end, sceneDur);
      subtitles.push({
        sceneId,
        start: startAbs,
        end: endAbs,
        text: seg.text || "",
      });
    }
    sceneOffset += sceneDur + SCENE_BUFFER;
  }

  return subtitles;
}

/**
 * Analyze subtitle coverage — find gaps where audio plays but no subtitle.
 *
 * @param {Array<{start, end, sceneId, text}>} subtitles - sorted or unsorted
 * @param {number} videoDuration - total video duration in seconds
 * @returns {{percent: number, gaps: Array<{from, to, duration}>}}
 */
export function analyzeCoverage(subtitles, videoDuration) {
  if (!subtitles || subtitles.length === 0) {
    return {
      percent: 0,
      gaps: [{ from: 0, to: videoDuration, duration: videoDuration }],
    };
  }

  const sorted = [...subtitles].sort((a, b) => a.start - b.start);
  const gaps = [];
  let prevEnd = 0;

  for (const sub of sorted) {
    if (sub.start - prevEnd > GAP_THRESHOLD) {
      gaps.push({
        from: prevEnd,
        to: sub.start,
        duration: sub.start - prevEnd,
      });
    }
    prevEnd = Math.max(prevEnd, sub.end);
  }

  // Check gap at end
  if (videoDuration - prevEnd > GAP_THRESHOLD) {
    gaps.push({
      from: prevEnd,
      to: videoDuration,
      duration: videoDuration - prevEnd,
    });
  }

  const totalGapDuration = gaps.reduce((sum, g) => sum + g.duration, 0);
  const percent = Math.max(0, ((videoDuration - totalGapDuration) / videoDuration) * 100);

  return {
    percent: Math.round(percent * 10) / 10,
    gaps,
  };
}

/**
 * Analyze subtitle durations — flag subtitles shorter than threshold.
 *
 * @param {Array<{start, end, sceneId, text}>} subtitles
 * @returns {{tooShort: Array<{sceneId, duration, text}>}}
 */
export function analyzeDurations(subtitles) {
  if (!subtitles || subtitles.length === 0) {
    return { tooShort: [] };
  }

  return {
    tooShort: subtitles
      .filter((s) => s.end - s.start < MIN_SUB_DURATION)
      .map((s) => ({
        sceneId: s.sceneId,
        duration: Math.round((s.end - s.start) * 100) / 100,
        text: (s.text || "").substring(0, 40),
      })),
  };
}

/**
 * Compare subtitle timestamps to audio silence segments.
 * For each silence, checks if a subtitle starts near silence_end (speech resume).
 *
 * @param {Array<{start, end}>} subtitles
 * @param {Array<{start, end}>} silenceSegments
 * @returns {{deviations: Array<{subtitleStart, silenceStart, delta}>}}
 */
export function compareSync(subtitles, silenceSegments) {
  if (!subtitles?.length || !silenceSegments?.length) {
    return { deviations: [] };
  }

  const deviations = [];

  for (const sil of silenceSegments) {
    // Find subtitle whose start is nearest to silence_end
    let nearestSub = null;
    let minDelta = Infinity;

    for (const sub of subtitles) {
      const delta = Math.abs(sub.start - sil.end);
      if (delta < minDelta) {
        minDelta = delta;
        nearestSub = sub;
      }
    }

    if (minDelta > SYNC_TOLERANCE && nearestSub) {
      deviations.push({
        subtitleStart: nearestSub.start,
        silenceStart: sil.start,
        delta: Math.round(minDelta * 100) / 100,
      });
    }
  }

  return { deviations };
}

/**
 * Parse FFmpeg silencedetect stderr output into silence segments.
 * Only returns paired start/end segments.
 *
 * @param {string} output - ffmpeg stderr
 * @returns {Array<{start: number, end: number}>}
 */
export function parseSilenceOutput(output) {
  if (!output) return [];

  const starts = [];
  const ends = [];

  for (const line of output.split("\n")) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      starts.push(parseFloat(startMatch[1]));
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (endMatch) {
      ends.push(parseFloat(endMatch[1]));
    }
  }

  // Pair starts with ends (only complete pairs)
  const pairCount = Math.min(starts.length, ends.length);
  const segments = [];
  for (let i = 0; i < pairCount; i++) {
    segments.push({ start: starts[i], end: ends[i] });
  }

  return segments;
}

/**
 * Parse ffprobe duration output.
 *
 * @param {string} output - ffprobe stdout
 * @returns {number|null}
 */
export function parseDuration(output) {
  if (!output) return null;
  const num = parseFloat(output.trim());
  return isNaN(num) ? null : num;
}

/**
 * Generate a combined report from all analysis functions.
 *
 * @param {Array<{start, end, sceneId, text}>} subtitles
 * @param {number} videoDuration
 * @param {Array<{start, end}>} silenceSegments
 * @returns {object} full report
 */
export function generateReport(subtitles, videoDuration, silenceSegments) {
  const coverage = analyzeCoverage(subtitles, videoDuration);
  const durations = analyzeDurations(subtitles);
  const sync = compareSync(subtitles, silenceSegments);

  const totalIssues = coverage.gaps.length + durations.tooShort.length + sync.deviations.length;

  return {
    videoDuration,
    totalSubtitles: subtitles.length,
    coverage,
    durations,
    sync: {
      silenceSegments,
      deviations: sync.deviations,
    },
    summary: {
      totalIssues,
      passed: totalIssues === 0,
    },
  };
}

// ─── FFmpeg-dependent Functions ───

/**
 * Detect silence segments in video audio via FFmpeg.
 *
 * @param {string} videoPath
 * @returns {Array<{start, end}>}
 */
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

/**
 * Get video duration via ffprobe.
 * Falls back to sum of scene durations + buffers if ffprobe fails.
 *
 * @param {string} videoPath
 * @param {number} fallbackDuration
 * @returns {number}
 */
export function getVideoDuration(videoPath, fallbackDuration = 0) {
  try {
    const output = execSync(
      `ffprobe -i "${videoPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
      { stdio: ["pipe", "pipe", "pipe"] },
    ).toString();
    const dur = parseDuration(output);
    if (dur !== null) return dur;
  } catch {
    // ffprobe failed
  }
  return fallbackDuration;
}

// ─── Main Entry ───

/**
 * Run full subtitle verification on a pipeline-produced video.
 * Writes JSON report + prints console summary.
 *
 * @param {string} videoPath - path to final video
 * @param {Array} timingData - subtitle-timing.json content
 * @param {Array<{sceneId, duration}>} sceneDurations
 * @param {string|null} outputDir - directory for verification-report.json
 * @returns {object} verification report
 */
export function verifySubtitles(videoPath, timingData, sceneDurations, outputDir = null) {
  const subtitles = computeAbsoluteTimestamps(timingData, sceneDurations);

  // Fallback duration: sum of scene durations + 0.5s buffers
  const fallbackDuration = sceneDurations.reduce(
    (sum, s) => sum + (s.duration || 0) + SCENE_BUFFER,
    0,
  );
  const videoDuration = getVideoDuration(videoPath, fallbackDuration);

  const silenceSegments = detectSilence(videoPath);
  const report = generateReport(subtitles, videoDuration, silenceSegments);

  // Write JSON report
  if (outputDir) {
    const reportPath = join(outputDir, "verification-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  📋 Verification report: ${reportPath}`);
  }

  // Console summary
  printSummary(report, videoPath);

  return report;
}

/**
 * Print human-readable summary to console.
 */
function printSummary(report, videoPath) {
  const { summary, coverage, durations, sync, videoDuration, totalSubtitles } = report;

  console.log(`\n📊 Subtitle Verification Report`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Video: ${videoPath}`);
  console.log(`Duration: ${videoDuration.toFixed(1)}s`);
  console.log(`Subtitles: ${totalSubtitles} chunks`);

  // Coverage
  console.log(`\n🔍 Coverage: ${coverage.percent}% (${coverage.gaps.length} gap${coverage.gaps.length !== 1 ? "s" : ""})`);
  if (coverage.gaps.length > 0) {
    for (const g of coverage.gaps) {
      console.log(`   ${g.from.toFixed(1)}s - ${g.to.toFixed(1)}s (${g.duration.toFixed(1)}s gap)`);
    }
  }

  // Durations
  console.log(`\n🔍 Duration: ${durations.tooShort.length} too short`);
  if (durations.tooShort.length > 0) {
    for (const s of durations.tooShort) {
      console.log(`   Scene ${s.sceneId}: ${s.duration}s — "${s.text}"`);
    }
  }

  // Sync
  console.log(`\n🔍 Sync: ${sync.deviations.length} deviation${sync.deviations.length !== 1 ? "s" : ""}`);
  if (sync.deviations.length > 0) {
    for (const d of sync.deviations) {
      console.log(`   Subtitle ${d.subtitleStart.toFixed(1)}s vs silence ${d.silenceStart.toFixed(1)}s (Δ ${d.delta}s)`);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  if (summary.passed) {
    console.log(`✅ PASS — No issues found`);
  } else {
    console.log(`❌ FAIL — ${summary.totalIssues} issue(s) found`);
  }
  console.log();
}
