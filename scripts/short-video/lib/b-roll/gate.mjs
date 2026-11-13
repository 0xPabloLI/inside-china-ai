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
  BORDERLINE_FLOOR,
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
export function buildClaim(scene, { prompt } = {}) {
  const declared =
    typeof prompt === "string"
      ? prompt
      : ((isImageStrategy(scene.mediaStrategy) ? scene.aiImage?.prompt : scene.aiVideo?.prompt) ??
        "");
  return {
    voiceover: scene.voiceover ?? "",
    assetNeed: declared,
  };
}

/**
 * Score candidates through the analyzer. Fail-closed: an unadmitted candidate
 * never wins. Each candidate also carries its `band`, so a null score reads as
 * `unavailable` (the analyzer failed) rather than as a low content score —
 * #294's defect 2 landed on this gate too.
 *
 * Second pass (`opts.secondPass`): generated frames cannot answer the first
 * question. That question asks whether the image depicts the claim's *specific*
 * entity, and every T2I prompt carries `no logos, no text, no watermark` (a
 * recognisable brand mark is both a copyright and a platform problem), so the
 * honest answer for a perfectly correct frame is "no identifiable company".
 * Measured 2026-11-13 on baidu-token-exchange: keynote stage 0/0,
 * data-centre aisle 50/50, fingerprint 80/80 — the two rejected frames were
 * exactly what their prompts asked for. This is the same defect #294 fixed on
 * the sourcing side ("a topically correct stock photo cannot pass that test"),
 * so it gets the same fix: a narrower, answerable question, asked once.
 *
 * One deliberate difference from the sourcing gate: the second pass asks about
 * `assetNeed` alone, never the voiceover. The prompt *is* the spec handed to
 * the generator; a voiceover can name a person we are not allowed to draw.
 *
 * `floor` defaults to the borderline band, because a stock photo scoring 50
 * means "topically right". The b-roll caller passes 0: a generated frame is
 * scored against a prompt we wrote, so even a low first-pass score is worth the
 * subject question (0 means "no identifiable entity", which is expected here).
 * A null score still never triggers the pass — a failed analysis must stay
 * closed, or the retry hides the tool failure.
 *
 * @param {Array<{seed: number, file: string}>} candidates absolute file paths
 * @param {{analyzer: Function, claim: {voiceover: string, assetNeed: string},
 *   window?: {startMs: number, endMs: number, sampleFps?: number},
 *   threshold?: number, secondPass?: {claim: {assetNeed: string}, floor?: number}}} opts
 * @returns {Promise<Array<{seed, file, relevance: number|null, band: string, reason: string|null, passed: boolean}>>}
 */
export async function scoreCandidates(candidates, opts) {
  const { analyzer, claim, window, secondPass } = opts;
  const threshold = opts.threshold ?? GATE_THRESHOLD;
  const scored = [];
  for (const candidate of candidates) {
    let relevance = null;
    let reason = null;
    try {
      const analyzerOpts = window ? { ...window, claim } : { claim };
      const result = await analyzer(candidate.file, analyzerOpts);
      relevance = typeof result?.relevance === "number" ? result.relevance : null;
      // #990: only the claim-mode explanation. The retired image-semantics
      // `reason` never reaches this gate (it runs without `relevanceCheck`),
      // so a fallback to it would only resurrect a dead field.
      reason = result?.relevanceReason ?? null;
    } catch (error) {
      reason = `analyzer error: ${error?.message ?? error}`;
    }
    const band = classifyRelevance(relevance, { threshold });
    let passed = band === RELEVANCE_BAND.PASS;
    let admission = passed ? "score" : null;
    let secondPassResult = null;
    if (
      secondPass &&
      !passed &&
      relevance !== null &&
      relevance >= (secondPass.floor ?? BORDERLINE_FLOOR)
    ) {
      secondPassResult = await runSecondPass(analyzer, candidate.file, secondPass.claim, window);
      if (secondPassResult.verdict === "match") {
        passed = true;
        admission = "second-pass";
      }
    }
    scored.push({
      ...candidate,
      relevance,
      band,
      reason,
      passed,
      ...(admission ? { admission } : {}),
      ...(secondPassResult ? { secondPass: secondPassResult } : {}),
    });
  }
  return scored;
}

/**
 * The #294 subject question, reused verbatim by the b-roll channel. Fail-closed
 * on every non-`match` outcome, including a throwing analyzer: an unparseable
 * verdict is a tool outcome, never an admission.
 *
 * @returns {Promise<{verdict: string|null, reason: string|null}>}
 */
async function runSecondPass(analyzer, file, claim, window) {
  try {
    const result = await analyzer(file, {
      claim,
      relevanceCheck: true,
      ...(window ? window : {}),
    });
    // #990: `subjectMatchReason` is the #294 check's own explanation; pre-rename
    // .vlm-cache entries still carry it as `reason`.
    return {
      verdict: result?.subjectMatch ?? null,
      reason: result?.subjectMatchReason ?? result?.reason ?? null,
    };
  } catch (error) {
    return { verdict: null, reason: `second pass error: ${error?.message ?? error}` };
  }
}

/**
 * Winner = highest relevance among passed candidates; ties resolve to the
 * smaller seed for determinism. Returns null when nothing passed.
 *
 * A first-pass admission outranks a second-pass one at equal relevance: the
 * second pass is the narrower question, so a candidate that cleared the
 * broader one is the stronger evidence.
 */
export function pickWinner(scored) {
  const passed = scored.filter((c) => c.passed);
  if (passed.length === 0) return null;
  passed.sort(
    (a, b) =>
      b.relevance - a.relevance ||
      (a.admission === "second-pass" ? 1 : 0) - (b.admission === "second-pass" ? 1 : 0) ||
      a.seed - b.seed,
  );
  return passed[0];
}
