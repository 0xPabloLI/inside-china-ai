/**
 * B-roll matching gate.
 *
 * Scores generated candidates against the scene claim via the shared VLM
 * channel (visual-analyzer.analyzeAssetSemantics with a {voiceover, assetNeed}
 * claim) and picks a winner. The analyzer is injected so the orchestrator can
 * pass the real one while tests substitute a fake.
 */

import { isImageStrategy } from "../scene-rules.mjs";
import {
  DEFAULT_RELEVANCE_THRESHOLD,
  RELEVANCE_BAND,
  classifyRelevance,
} from "../relevance-verdict.mjs";

// Same yardstick as the sourcing-side relevance gate. #294 moved the number
// into lib/relevance-verdict.mjs; importing it here removes the hand-synced
// mirror this comment used to describe.
export const GATE_THRESHOLD = DEFAULT_RELEVANCE_THRESHOLD;

/**
 * The VLM claim the candidates are scored against. #155: image strategies
 * declare their asset need in `aiImage.prompt` — the raw declared prompt,
 * never the composed one (a NEGATIVE clause must not leak into the gate's
 * positive assetNeed).
 */
export function buildClaim(scene) {
  return {
    voiceover: scene.voiceover ?? "",
    assetNeed:
      (isImageStrategy(scene.mediaStrategy) ? scene.aiImage?.prompt : scene.aiVideo?.prompt) ?? "",
  };
}

/**
 * Score candidates through the analyzer. Fail-closed: an unadmitted candidate
 * never wins. Each candidate also carries its `band`, so a null score reads as
 * `unavailable` (the analyzer failed) rather than as a low content score —
 * #294's defect 2 landed on this gate too.
 *
 * @param {Array<{seed: number, file: string}>} candidates absolute file paths
 * @param {{analyzer: Function, claim: {voiceover: string, assetNeed: string},
 *   window?: {startMs: number, endMs: number, sampleFps?: number},
 *   threshold?: number}} opts
 * @returns {Promise<Array<{seed, file, relevance: number|null, band: string, reason: string|null, passed: boolean}>>}
 */
export async function scoreCandidates(candidates, opts) {
  const { analyzer, claim, window } = opts;
  const threshold = opts.threshold ?? GATE_THRESHOLD;
  const scored = [];
  for (const candidate of candidates) {
    let relevance = null;
    let reason = null;
    try {
      const analyzerOpts = window ? { ...window, claim } : { claim };
      const result = await analyzer(candidate.file, analyzerOpts);
      relevance = typeof result?.relevance === "number" ? result.relevance : null;
      reason = result?.relevanceReason ?? result?.reason ?? null;
    } catch (error) {
      reason = `analyzer error: ${error?.message ?? error}`;
    }
    const band = classifyRelevance(relevance, { threshold });
    scored.push({
      ...candidate,
      relevance,
      band,
      reason,
      passed: band === RELEVANCE_BAND.PASS,
    });
  }
  return scored;
}

/**
 * Winner = highest relevance among passed candidates; ties resolve to the
 * smaller seed for determinism. Returns null when nothing passed.
 */
export function pickWinner(scored) {
  const passed = scored.filter((c) => c.passed);
  if (passed.length === 0) return null;
  passed.sort((a, b) => b.relevance - a.relevance || a.seed - b.seed);
  return passed[0];
}
