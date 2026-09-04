/**
 * Verify-retry loop — bounded auto-repair for subtitle verification failures.
 *
 * On FAIL, classify the failure, dispatch the appropriate repair, re-verify.
 * Only accept repairs where summary.errors strictly decreased; otherwise
 * rollback. After max retries, fall through to exit(1) + diagnostics.
 */

// ─── Failure classifier ───

/**
 * Priority order for tie-breaking when multiple categories have equal errors.
 * Earlier = higher priority.
 */
const PRIORITY = ["audio-sync-drift", "subtitle-alignment", "cue-gaps"];

/**
 * Classify a verification report's failure into a repair category.
 *
 * Returns null when the report passes. When multiple categories fail, picks
 * the one with the most errors; ties broken by PRIORITY order.
 *
 * @param {object|null} report - verification report from verifySubtitles()
 * @returns {string|null} category or null
 */
export function classifyFailure(report) {
  if (!report || !report.summary) return "unknown";
  if (report.summary.passed) return null;

  const candidates = [];

  // Audio-sync drift: scenes measured but some out of tolerance
  const a = report.audioSync;
  if (a && a.checked === 0 && a.skipped > 0) {
    return "audio-sync-skipped";
  }
  if (a && a.errors > 0) {
    candidates.push({ category: "audio-sync-drift", errors: a.errors });
  }

  // Subtitle alignment: word sequence mismatch
  const w = report.wordSequence;
  if (w && !w.matches) {
    candidates.push({ category: "subtitle-alignment", errors: 1 });
  }

  // Cue gaps: violations in the blink band
  const g = report.gaps;
  if (g && g.violations && g.violations.length > 0) {
    candidates.push({ category: "cue-gaps", errors: g.violations.length });
  }

  if (candidates.length === 0) return "unknown";

  // Pick the category with the most errors; tie-break by priority
  candidates.sort((a, b) => {
    if (b.errors !== a.errors) return b.errors - a.errors;
    return PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category);
  });

  return candidates[0].category;
}

// ─── Audio-sync drift compensation ───

/**
 * Shift subtitle cue timestamps by per-scene drift values.
 *
 * Each cue's start, end, and all word onsets are shifted by the drift
 * measured for that cue's scene. Cues with no scene in the drift map are
 * returned unchanged. The input array is never mutated.
 *
 * @param {Array} cues - subtitle cues from buildCues()
 * @param {Record<number, number>} driftMap - { sceneId: driftSeconds }
 * @returns {Array} new cues with corrected timestamps
 */
export function applyDriftCorrection(cues, driftMap) {
  if (!cues || cues.length === 0) return [];
  if (!driftMap || Object.keys(driftMap).length === 0) {
    return cues.map((c) => ({ ...c, words: (c.words ?? []).map((w) => ({ ...w })) }));
  }

  return cues.map((cue) => {
    const drift = driftMap[cue.sceneId];
    if (drift === undefined || drift === 0) {
      return { ...cue, words: (cue.words ?? []).map((w) => ({ ...w })) };
    }
    return {
      ...cue,
      start: cue.start + drift,
      end: cue.end + drift,
      words: (cue.words ?? []).map((w) => ({ ...w, onset: w.onset + drift })),
    };
  });
}

// ─── Cue gap relaxation ───

/** Default gap parameters (from lib/subtitles/cues.mjs). */
const DEFAULT_GAP_THRESHOLD = 0.5;
const DEFAULT_CHAIN_GAP_FRAMES = 2;

/**
 * Return relaxed gap parameters for the given retry attempt.
 *
 * Attempt 0: defaults. Attempt 1: +0.1s threshold. Attempt 2: 1-frame chain.
 * Attempt 3+: null (exhausted — no further relaxation).
 *
 * @param {number} attempt
 * @returns {{GAP_THRESHOLD: number, CHAIN_GAP_FRAMES: number}|null}
 */
export function relaxGapParams(attempt) {
  if (attempt < 0) return null;
  if (attempt === 0)
    return { GAP_THRESHOLD: DEFAULT_GAP_THRESHOLD, CHAIN_GAP_FRAMES: DEFAULT_CHAIN_GAP_FRAMES };
  if (attempt === 1)
    return {
      GAP_THRESHOLD: DEFAULT_GAP_THRESHOLD + 0.1,
      CHAIN_GAP_FRAMES: DEFAULT_CHAIN_GAP_FRAMES,
    };
  if (attempt === 2) return { GAP_THRESHOLD: DEFAULT_GAP_THRESHOLD + 0.2, CHAIN_GAP_FRAMES: 1 };
  return null;
}

// ─── Verify-retry loop ───

/**
 * Run verifySubtitles with bounded auto-repair retries.
 *
 * On FAIL: classify the failure, dispatch the repair, re-verify. Only accept
 * repairs where summary.errors strictly decreased; otherwise rollback. After
 * maxRetries, return the final report (caller decides exit).
 *
 * @param {object} options
 * @param {Function} options.verifyFn - () => report (verifySubtitles or mock)
 * @param {Function} [options.repairFn] - (category, report, state) => { success, videoPath?, assPath? }
 * @param {number} [options.maxRetries=2] - max repair attempts
 * @param {string} options.videoPath - initial video path
 * @param {string} options.assPath - initial .ass path
 * @returns {Promise<{report: object, videoPath: string, assPath: string}>}
 */
export async function verifyWithRetry({
  verifyFn,
  repairFn = null,
  maxRetries = 2,
  videoPath: initialVideoPath,
  assPath: initialAssPath,
}) {
  let videoPath = initialVideoPath;
  let assPath = initialAssPath;
  let report = verifyFn();
  let prevErrors = report.summary?.errors ?? 0;

  if (report.summary?.passed) {
    return { report, videoPath, assPath };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const category = classifyFailure(report);
    console.log(`  🔄 Retry ${attempt}/${maxRetries}: failure category "${category}"`);

    if (category === "unknown" || category === "audio-sync-skipped") {
      console.log(`  ⏭️  ${category} — not retryable, skipping repair`);
      break;
    }

    let repairResult;
    try {
      repairResult = repairFn
        ? await repairFn(category, report, { videoPath, assPath })
        : { success: false };
    } catch (e) {
      console.log(`  ⚠️  Repair crashed: ${e.message}`);
      repairResult = { success: false };
    }

    if (!repairResult?.success) {
      console.log(`  ↩️  Repair did not reduce errors (attempt ${attempt})`);
      // Re-verify anyway (repair may have partially helped)
    }

    // Use repaired paths if provided
    if (repairResult?.videoPath) videoPath = repairResult.videoPath;
    if (repairResult?.assPath) assPath = repairResult.assPath;

    const newReport = verifyFn();
    const newErrors = newReport.summary?.errors ?? 0;

    console.log(
      `  📊 Errors: ${prevErrors} → ${newErrors} ` +
        `(${newErrors < prevErrors ? "accepted" : "rolled back"})`,
    );

    if (newErrors < prevErrors) {
      // Accept the repair
      report = newReport;
      prevErrors = newErrors;
      if (report.summary?.passed) {
        return { report, videoPath, assPath };
      }
    } else {
      // Rollback: don't update report or paths (keep best-known state)
      // The retry counter still increments
    }
  }

  return { report, videoPath, assPath };
}
