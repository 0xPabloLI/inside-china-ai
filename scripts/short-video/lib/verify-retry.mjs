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
 * Categories whose repair cannot change the verdict, so the loop must not
 * spend a retry on them. The value is the reason printed to the operator.
 *
 * `subtitle-alignment` is here by measurement, not by assumption (#818). The
 * check compares the rendered `.ass` against `expectedWordTimes(timingData)`,
 * and that `.ass` is generated from the same `timingData` — so a mismatch is a
 * deterministic disagreement inside the generation pipeline (chunking /
 * restore), not stale state a second pass could refresh. The only lever the
 * repair had was re-running forced alignment, and re-running it on unchanged
 * inputs reproduces `subtitle-timing.json` byte-for-byte (measured: two real
 * packages, 20 takes, identical sha256 — #818). The repair also called a
 * `generateSubtitles` that main.mjs never imported, so it threw before writing
 * anything at all.
 */
const NON_RETRYABLE = new Map([
  ["unknown", "the failure could not be classified"],
  ["audio-sync-skipped", "no audio-sync measurement to compensate"],
  [
    "subtitle-alignment",
    "the .ass is generated from the same timing this check compares against — " +
      "re-aligning cannot change the verdict",
  ],
]);

/**
 * Can the retry loop do anything about this failure category?
 *
 * The loop asks this itself; it is exported so tests and the real-data smoke
 * script can assert the classification directly instead of inferring it from
 * log text. The caller (main.mjs) fails closed on the returned report and does
 * not branch on it.
 *
 * @param {string} category - from classifyFailure()
 * @returns {boolean}
 */
export function isRetryable(category) {
  return !NON_RETRYABLE.has(category);
}

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
 * The loop stops early — without spending the rest of the budget — in two
 * cases, because a retry could only produce a misleading verdict (#818):
 * the category is non-retryable (see NON_RETRYABLE), or the repair did not run
 * (returned `success: false`, or crashed) so nothing on disk changed.
 *
 * @param {object} options
 * @param {Function} options.verifyFn - ({ videoPath, assPath }) => report (verifySubtitles or mock)
 * @param {Function} [options.repairFn] - (category, report, { videoPath, assPath }) => { success, videoPath?, assPath? }
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
  let report = verifyFn({ videoPath, assPath });
  let prevErrors = report.summary?.errors ?? 0;

  if (report.summary?.passed) {
    return { report, videoPath, assPath };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const category = classifyFailure(report);
    console.log(`  🔄 Retry ${attempt}/${maxRetries}: failure category "${category}"`);

    const reason = NON_RETRYABLE.get(category);
    if (reason) {
      // No repair is dispatched and no re-verify is spent: the failure is
      // deterministic for this category, so a retry can only reproduce it.
      // The caller fails closed on the returned report.
      console.log(`  ⏭️  ${category} — not retryable (${reason}); no repair attempted`);
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
      // A repair that reports failure has either written nothing (it threw
      // before touching disk) or stopped half-way — main.mjs's repairs rewrite
      // the .ass and only then re-burn the video, so a failed burn leaves a
      // new .ass beside the old video. Re-verifying is wrong in both cases: in
      // the first it can only reproduce this report, and in the second a
      // "pass" would describe an artifact the repair never produced (the
      // shipped video still carries the old subtitles). Stop and let the
      // caller fail closed on the pre-repair report (#818).
      console.log(`  ⏹️  Repair did not run (attempt ${attempt}) — stopping, not re-verifying`);
      break;
    }

    // The repaired artifact is what must be re-verified (#870). Candidate paths
    // are promoted only if the repair is accepted, so a rolled-back attempt
    // cannot leak its paths into the next dispatch or the final return.
    const nextVideoPath = repairResult?.videoPath || videoPath;
    const nextAssPath = repairResult?.assPath || assPath;

    const newReport = verifyFn({ videoPath: nextVideoPath, assPath: nextAssPath });
    const newErrors = newReport.summary?.errors ?? 0;

    console.log(
      `  📊 Errors: ${prevErrors} → ${newErrors} ` +
        `(${newErrors < prevErrors ? "accepted" : "rolled back"})`,
    );

    if (newErrors < prevErrors) {
      // Accept the repair
      report = newReport;
      prevErrors = newErrors;
      videoPath = nextVideoPath;
      assPath = nextAssPath;
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
