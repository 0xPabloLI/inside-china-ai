/**
 * Post-alignment TTS guards (#232 — TTS 输出质量守卫).
 *
 * Driven by the wav2vec2 forced-alignment word timings that
 * runForcedAlignment() already produces — no second model, no extra pass:
 *
 * 1. **Tail hard-cut** — kill hallucinated voice tails after the last real
 *    word. The silenceremove threshold filter cannot catch them: the
 *    dh-pilot scene-7 tail was −21dB continuous voiced sound that never
 *    dipped to the silence threshold, and it burned 2.8s of dead video.
 *    The alignment knows exactly where speech ends; anything past
 *    lastWordEnd + TAIL_PAD_SEC that exceeds TAIL_MIN_EXCESS_SEC is cut
 *    (50ms fade-out avoids the click).
 *
 *    The cut is gated on the alignment being trustworthy for that scene: a
 *    scene with crushed words has an alignment already proven unreliable, so
 *    its `lastWordEnd` is not trusted to bound live speech and the cut is
 *    skipped (#629 — see tailCutDecision).
 *
 * 2. **Crushed-word sanity** — an aligned word lasting less than its
 *    syllable budget (syllables × MIN_SEC_PER_SYLLABLE) was swallowed.
 *    Evidence: dh-pilot scene-7 aligned "53.4" at 0.13s — physically
 *    impossible for "fifty-three point four"; the user heard it as
 *    "声音被吞掉". Non-blocking WARN: the self-heal retry loop runs
 *    pre-alignment, so a crushed read here surfaces to HITL instead of
 *    triggering a regenerate.
 *
 * 3. **Verified tail cut** (2026-10-14) — the alignment is a *model output*
 *    and can be wrong, so the cut it justifies is provisional until the
 *    read-back gate confirms the trimmed take still says every word. The
 *    #629 gate above is a cheap pre-filter (self-reported crushed words);
 *    this one verifies the cut's *outcome* on every cut that proceeds.
 *    Evidence: deepseek-flash-silent-update scene 3 aligned "115,000" +
 *    "views" into 0.41s and ended at 5.93s of a 7.60s file; the cut then
 *    removed 1.52s of real speech, and the rendered video said "That clip
 *    reached 100". The crushed-word floor cannot catch this (a digit token
 *    has no vowel group, so its floor is the 0.12s minimum). The cut now
 *    runs on a temp file and is only committed when the trimmed audio still
 *    passes the same similarity / truncation / key-token checks the TTS gate
 *    applies.
 *
 * Wiring: runForcedAlignment() calls runAlignmentGuards() on the RAW
 * (pre-restore) timing data — crushed-word detection needs the spoken-form
 * words, which restoreTimingTokens() replaces with display tokens — and
 * BEFORE writeAlignmentMeta(), so the alignment signature is computed over
 * the CUT audio bytes and the next run cache-hits instead of re-cutting.
 * Idempotent by construction: a cut file has no excess tail, so a re-run
 * with --force re-aligns but never trims again.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, renameSync, rmSync, copyFileSync } from "fs";
import { ffmpegCmd, getDuration } from "./ffmpeg-cmd.mjs";
import { evaluateSceneTts, MIN_TEXT_SIMILARITY } from "./quality-gate.mjs";

const execAsync = promisify(exec);

/** Decay allowance past the last aligned word (review: 100–150ms). */
export const TAIL_PAD_SEC = 0.15;
/** Only trim when the excess tail beyond the cut point is at least this long. */
export const TAIL_MIN_EXCESS_SEC = 0.5;
/** Syllable-duration floor: 0.12s/syllable ≈ 8.3 syllables/s, a pathological
 *  speech rate — normal fast speech sits near 5 syllables/s. */
export const MIN_SEC_PER_SYLLABLE = 0.12;

/**
 * Rough syllable count via vowel-group heuristic. Alignment words are
 * spoken-form tokens ("fifty", "point") — no digits reach this.
 *
 * @param {string} word
 * @returns {number} at least 1
 */
export function estimateSyllables(word) {
  const groups = String(word)
    .toLowerCase()
    .match(/[aeiouy]+/g);
  return groups ? groups.length : 1;
}

/**
 * Flag aligned words whose duration falls below their syllable budget.
 *
 * @param {Array<{text: string, start: number, end: number}>} words - scene-local timings
 * @returns {Array<{text: string, start: number, end: number, duration: number, minDuration: number}>}
 */
export function findCrushedWords(words) {
  const crushed = [];
  for (const w of words ?? []) {
    const raw = (w.end ?? 0) - (w.start ?? 0);
    // ms precision — float subtraction noise (3.06 - 3.0 → 0.0600…005) otherwise
    const duration = Math.round(raw * 1000) / 1000;
    const minDuration = estimateSyllables(w.text) * MIN_SEC_PER_SYLLABLE;
    if (duration < minDuration) {
      crushed.push({ text: w.text, start: w.start, end: w.end, duration, minDuration });
    }
  }
  return crushed;
}

/**
 * Compute the tail cut point for one scene's audio.
 *
 * @param {number} durationSec - current audio duration
 * @param {number|null} lastWordEnd - scene-local end of the last aligned word
 * @returns {number|null} cut point in seconds, or null when there is no
 *   meaningful excess (within pad + excess budget) or no aligned words
 */
export function computeTailCut(durationSec, lastWordEnd) {
  if (lastWordEnd == null || !Number.isFinite(lastWordEnd)) return null;
  const cutPoint = lastWordEnd + TAIL_PAD_SEC;
  if (durationSec - cutPoint < TAIL_MIN_EXCESS_SEC) return null;
  return cutPoint;
}

/**
 * Decide whether one scene's tail may be cut.
 *
 * The cut point is derived from the same alignment that produced the
 * crushed-word warnings, so a scene with crushed words has an alignment
 * already proven unreliable — and an unreliable `lastWordEnd` is precisely
 * what cuts into live speech. #629: scene 8's "2027" shipped as "2000"
 * because a 1.08s trim was computed from a `lastWordEnd` (3.83s) that
 * under-reported where the speech actually ended; the same scene had already
 * logged 4 crushed words before the cut.
 *
 * The costs are asymmetric. Skipping a cut leaves a phantom tail — the #232
 * symptom, which is visible on playback and re-runnable. Cutting wrongly
 * destroys speech in a take that the gate already approved, which is silent
 * and reaches the audience before anyone notices. So a suspect alignment
 * skips the cut.
 *
 * @param {{durationSec: number, lastWordEnd: number|null, crushedCount: number}} args
 * @returns {{cut: false, reason: string}|{cut: true, cutPoint: number}}
 */
export function tailCutDecision({ durationSec, lastWordEnd, crushedCount }) {
  if (crushedCount > 0) return { cut: false, reason: "alignment-suspect" };
  const cutPoint = computeTailCut(durationSec, lastWordEnd);
  if (cutPoint == null) return { cut: false, reason: "no-excess" };
  return { cut: true, cutPoint };
}

/**
 * Hard-cut one audio file at cutSec (temp file + mv, same pattern as
 * postProcessBatch) with a short fade-out to avoid a click.
 *
 * The tmp file is probed BEFORE replacing the original, so a probe failure
 * leaves the untrimmed original intact (truthful fail-open for the caller).
 *
 * @param {string} audioPath
 * @param {number} cutSec
 * @returns {Promise<number>} duration of the trimmed file, NaN on probe
 *   failure (original left untouched)
 */
export async function trimSceneTail(audioPath, cutSec) {
  const isWav = audioPath.endsWith(".wav");
  const tmpPath = isWav
    ? audioPath.replace(/\.wav$/, "-tailcut.wav")
    : audioPath.replace(/\.mp3$/, "-tailcut.mp3");
  const fadeStart = Math.max(0, cutSec - 0.08);
  await execAsync(
    `"${ffmpegCmd}" -y -i "${audioPath}" -t "${cutSec.toFixed(3)}" ` +
      `-af "afade=t=out:st=${fadeStart.toFixed(3)}:d=0.08" -ar 44100 -b:a 320k "${tmpPath}" 2>/dev/null`,
  );
  let newDuration = NaN;
  try {
    newDuration = await getDuration(tmpPath);
  } catch {
    // exec rejection (broken/missing ffprobe) → same fail-open path as NaN
  }
  if (!Number.isFinite(newDuration)) {
    await execAsync(`rm -f "${tmpPath}"`);
    return NaN;
  }
  await execAsync(`mv "${tmpPath}" "${audioPath}"`);
  return newDuration;
}

/**
 * Read-back verification for a provisional tail cut.
 *
 * The cut exists to remove audio the alignment could not attribute to a word.
 * When the alignment was wrong, that audio was real speech and the trimmed
 * take is missing words — so re-run the read-back checks the TTS gate already
 * applies and refuse the cut when the take no longer says everything.
 *
 * Fail-SAFE, not fail-open: if the verifier cannot run (ASR unavailable), the
 * cut is refused and the untrimmed audio survives. A slightly long video beats
 * a video that silently drops a word, and the untrimmed take already passed
 * the gate once.
 *
 * @param {Object} scene - scene-data entry (the reference text lives here)
 * @param {string} audioPath - the already-trimmed take
 * @param {number} durationSec - its measured duration
 * @param {{evaluateScene?: Function}} [options] - evaluateScene injectable for tests
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function verifyTrimmedTake(scene, audioPath, durationSec, options = {}) {
  // No reference text to check against — nothing to verify, and the cut's
  // original justification (alignment said the audio was excess) stands.
  if (!scene) return { ok: true };

  const evaluate = options.evaluateScene ?? evaluateSceneTts;
  let report;
  try {
    report = await evaluate(scene, audioPath, durationSec);
  } catch (e) {
    return { ok: false, reason: `verification unavailable (${String(e?.message).slice(0, 60)})` };
  }

  if (report?.asrVerified === false) {
    return { ok: false, reason: "ASR did not run, trimmed take is unverified" };
  }
  const issues = report?.issues ?? [];
  const truncation = issues.find((i) => /truncation detected/i.test(i));
  if (truncation) return { ok: false, reason: truncation };
  const incomplete = issues.find((i) => /incomplete speech/i.test(i));
  if (incomplete) return { ok: false, reason: incomplete };
  if (typeof report?.similarity === "number" && report.similarity < MIN_TEXT_SIMILARITY) {
    return { ok: false, reason: `similarity fell to ${(report.similarity * 100).toFixed(1)}%` };
  }
  return { ok: true };
}

/**
 * Run both guards over one alignment result batch.
 * Mutates ttsResults entries' duration in place for trimmed scenes (the same
 * objects registry.generateTTSWithEngine merges and returns downstream).
 *
 * A cut that proceeds runs twice-gated: tailCutDecision() filters scenes whose
 * alignment is self-reported as suspect (#629), and the trimmed take is then
 * read back before the cut is committed (#232 verified-cut).
 *
 * @param {Array<{sceneId: number, audioPath: string, duration: number}>} ttsResults
 * @param {Array|{scenes: Array}} timingData - RAW (pre-restore) alignment data
 * @param {Array} [scenes] - scene-data entries; supplies the reference text the
 *   trimmed take is read back against. Omit to skip cut verification.
 * @param {{evaluateScene?: Function}} [options] - evaluateScene injectable for tests
 * @returns {Promise<{cuts: Array<{sceneId: number, from: number, to: number}>, crushedWords: Array<{sceneId: number, word: string, duration: number, minDuration: number}>, skippedCuts: Array<{sceneId: number, reason: string}>, refusedCuts: Array<{sceneId: number, reason: string}>}>}
 */
export async function runAlignmentGuards(ttsResults, timingData, scenes, options = {}) {
  const scenesTiming = Array.isArray(timingData) ? timingData : (timingData?.scenes ?? []);
  const cuts = [];
  const crushedWords = [];
  const skippedCuts = [];
  const refusedCuts = [];

  for (const r of ttsResults ?? []) {
    const sceneTiming = scenesTiming.find((s) => s.sceneId === r.sceneId);
    if (!sceneTiming || !r.audioPath || !existsSync(r.audioPath)) continue;

    const words = (sceneTiming.segments ?? []).flatMap((seg) => seg.words ?? []);
    if (words.length === 0) continue;

    for (const crushed of findCrushedWords(words)) {
      crushedWords.push({
        sceneId: r.sceneId,
        word: crushed.text,
        duration: crushed.duration,
        minDuration: crushed.minDuration,
      });
      console.warn(
        `  ⚠️ Scene ${r.sceneId}: aligned word "${crushed.text}" lasted ${crushed.duration.toFixed(2)}s ` +
          `(< syllable floor ${crushed.minDuration.toFixed(2)}s) — possible swallowed speech (#232)`,
      );
    }

    const lastWordEnd = Math.max(...words.map((w) => w.end ?? 0));
    const decision = tailCutDecision({
      durationSec: r.duration,
      lastWordEnd,
      crushedCount: crushedWords.filter((c) => c.sceneId === r.sceneId).length,
    });

    if (!decision.cut) {
      if (decision.reason === "alignment-suspect") {
        skippedCuts.push({ sceneId: r.sceneId, reason: decision.reason });
        console.warn(
          `  ⏸️ Scene ${r.sceneId}: tail cut skipped — this scene's alignment is suspect ` +
            `(crushed words), so its lastWordEnd (${lastWordEnd.toFixed(2)}s) is not trusted (#629)`,
        );
      }
      continue;
    }

    const scene = scenes?.find((s) => s.id === r.sceneId);
    // Keep the untrimmed take until the read-back confirms the cut did not
    // remove a word — the alignment that justifies the cut is a model output
    // and can be wrong (#232 verified-cut).
    const backupPath = `${r.audioPath}.pre-tailcut`;
    try {
      copyFileSync(r.audioPath, backupPath);
    } catch {
      // No backup → no safe revert → skip the cut entirely rather than risk
      // an unverifiable trim.
      console.warn(`  ⚠️ Scene ${r.sceneId}: could not snapshot audio, skipping tail cut (#232)`);
      continue;
    }

    let newDuration = NaN;
    try {
      newDuration = await trimSceneTail(r.audioPath, decision.cutPoint);
    } catch {
      // exec-level failure (ffmpeg/ffprobe missing or broken) → same
      // fail-open path as a NaN probe below
    }
    if (!Number.isFinite(newDuration)) {
      // Fail-open: a broken ffmpeg/ffprobe must not poison the duration
      // registry merges downstream — the untrimmed original is intact.
      rmSync(backupPath, { force: true });
      console.warn(
        `  ⚠️ Scene ${r.sceneId}: tail trim probe failed, keeping untrimmed audio (#232)`,
      );
      continue;
    }

    const verdict = await verifyTrimmedTake(scene, r.audioPath, newDuration, options);
    if (!verdict.ok) {
      // Fail-safe: the trimmed take no longer says everything, so the cut is
      // refused and the pre-cut bytes come back.
      renameSync(backupPath, r.audioPath);
      refusedCuts.push({ sceneId: r.sceneId, reason: verdict.reason });
      console.warn(
        `  ↩️ Scene ${r.sceneId}: tail cut REFUSED — ${verdict.reason} (#232 verified-cut)`,
      );
      continue;
    }

    rmSync(backupPath, { force: true });
    cuts.push({ sceneId: r.sceneId, from: r.duration, to: newDuration });
    console.log(
      `  ✂️ Scene ${r.sceneId}: trimmed ${(r.duration - newDuration).toFixed(2)}s tail ` +
        `after last word (${lastWordEnd.toFixed(2)}s + ${TAIL_PAD_SEC}s pad) (#232)`,
    );
    r.duration = newDuration;
  }

  return { cuts, crushedWords, skippedCuts, refusedCuts };
}
