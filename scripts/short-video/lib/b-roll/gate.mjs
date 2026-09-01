/**
 * B-roll matching gate.
 *
 * Scores generated candidates against the scene claim via the shared VLM
 * channel (visual-analyzer.analyzeAssetSemantics with a {voiceover, assetNeed}
 * claim) and picks a winner. The analyzer is injected so the orchestrator can
 * pass the real one while tests substitute a fake.
 */

// Same yardstick as the sourcing-side relevance gate. asset-sourcer.mjs keeps
// this as a CLI default (`--relevance-threshold`, default "60", not exported),
// so the constant is mirrored here — keep the two in sync.
export const GATE_THRESHOLD = 60;

export function buildClaim(scene) {
  return {
    voiceover: scene.voiceover ?? "",
    assetNeed: scene.aiVideo?.prompt ?? "",
  };
}

/**
 * Score candidates through the analyzer. Fail-closed: a missing/null relevance
 * or an analyzer error marks the candidate as not passed.
 *
 * @param {Array<{seed: number, file: string}>} candidates absolute file paths
 * @param {{analyzer: Function, claim: {voiceover: string, assetNeed: string},
 *   window?: {startMs: number, endMs: number, sampleFps?: number},
 *   threshold?: number}} opts
 * @returns {Promise<Array<{seed, file, relevance: number|null, reason: string|null, passed: boolean}>>}
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
    scored.push({
      ...candidate,
      relevance,
      reason,
      passed: relevance !== null && relevance >= threshold,
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
