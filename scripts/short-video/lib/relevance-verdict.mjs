/**
 * Relevance verdict seam (#294).
 *
 * The VLM relevance judgment is not a single threshold. Three facts from real
 * packages forced this module to exist:
 *
 *   - `null` (analysis failed, or the model's score could not be parsed) is
 *     not a content verdict. It used to be recorded as "failed", which put a
 *     tool failure and an unrelated image in the same bucket.
 *   - 40–60 is a band, not a verdict: the first-pass prompt asks whether the
 *     image depicts the claim's *specific* event, and a topically correct
 *     stock photo cannot pass that test. Candidates in this band get a
 *     second, subject-focused VLM check (`relevanceCheck`).
 *   - satisfiability is a property of the candidate pool, not of one asset.
 *     When no candidate for a scene is admissible, the right output is
 *     "unsatisfiable → escalate to B-roll/human", not "pick the least-bad
 *     photo".
 *
 * This module owns the bands, the pool verdict and the admission rule so
 * asset-sourcer, the B-roll gate and evaluate-stock-relevance.mjs cannot drift
 * apart. It is a leaf: no imports, no I/O.
 */

/**
 * Default admission threshold. Kept identical to the historical 60 so this
 * seam changes classification, not the bar.
 */
export const DEFAULT_RELEVANCE_THRESHOLD = 60;

/**
 * Lowest score that earns a second look. 40 is the lower bound of the
 * borderline band the 2026-09-14 scope decision named for this ticket.
 */
export const BORDERLINE_FLOOR = 40;

/** Relevance bands. `unavailable` is a tool/parse outcome, never a content verdict. */
export const RELEVANCE_BAND = {
  PASS: "pass",
  BORDERLINE: "borderline",
  LOW: "low",
  UNAVAILABLE: "unavailable",
};

/** Pool-level verdicts for one scene's candidate set. */
export const POOL_VERDICT = {
  SATISFIABLE: "satisfiable",
  UNSATISFIABLE: "unsatisfiable",
  UNAVAILABLE: "unavailable",
};

const isScore = (value) => typeof value === "number" && Number.isFinite(value);

/** A pool member is either a bare score or an asset-like candidate. */
const candidateScore = (candidate) =>
  isScore(candidate)
    ? candidate
    : isScore(candidate?.relevanceScore)
      ? candidate.relevanceScore
      : null;

const candidateAdmitted = (candidate, opts) =>
  isScore(candidate)
    ? candidate >= (opts.threshold ?? DEFAULT_RELEVANCE_THRESHOLD)
    : isRelevanceAdmitted(candidate, opts);

/**
 * Classify one VLM score.
 *
 * @param {number|null|undefined} score - VLM relevance (0-100), null when the
 *   analysis failed or the score could not be parsed.
 * @param {{threshold?: number, borderlineFloor?: number}} [opts]
 * @returns {"pass"|"borderline"|"low"|"unavailable"}
 */
export function classifyRelevance(score, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_RELEVANCE_THRESHOLD;
  const borderlineFloor = opts.borderlineFloor ?? BORDERLINE_FLOOR;
  if (!isScore(score)) return RELEVANCE_BAND.UNAVAILABLE;
  if (score >= threshold) return RELEVANCE_BAND.PASS;
  if (score >= borderlineFloor) return RELEVANCE_BAND.BORDERLINE;
  return RELEVANCE_BAND.LOW;
}

/**
 * Whether a first-pass score earns the second, subject-focused check.
 * An asset that already carries a `relevanceCheck` is not re-checked.
 *
 * @param {{relevanceScore: number|null|undefined, relevanceCheck?: {verdict?: string}|null}} asset
 * @param {{threshold?: number, borderlineFloor?: number}} [opts]
 */
export function needsSecondPass(asset, opts = {}) {
  if (asset?.relevanceCheck) return false;
  return classifyRelevance(asset?.relevanceScore, opts) === RELEVANCE_BAND.BORDERLINE;
}

/**
 * Pool verdict for one scene. Satisfiability is decided by admission, not by
 * the ceiling alone: a pool whose best candidate sits at 50 but passed its
 * subject check *is* satisfiable, and saying otherwise would tell the caller
 * to escalate on a scene that already has an accepted asset.
 *
 * `unavailable` means the pool had candidates but none produced a parseable
 * score — again a tool outcome, not "all irrelevant".
 *
 * @param {Array<number|null|undefined|{relevanceScore?: number|null, relevanceCheck?: {verdict?: string}|null}>} candidates
 *   Bare scores, or the asset-shaped candidates assignment and the report
 *   already hold.
 * @param {{threshold?: number, borderlineFloor?: number}} [opts]
 * @returns {{verdict: "satisfiable"|"unsatisfiable"|"unavailable", ceiling: number|null, count: number, admitted: number}}
 */
export function classifyPool(candidates, opts = {}) {
  const scored = (Array.isArray(candidates) ? candidates : []).filter(
    (candidate) => candidateScore(candidate) !== null,
  );
  if (scored.length === 0) {
    return { verdict: POOL_VERDICT.UNAVAILABLE, ceiling: null, count: 0, admitted: 0 };
  }
  const admitted = scored.filter((candidate) => candidateAdmitted(candidate, opts)).length;
  return {
    verdict: admitted > 0 ? POOL_VERDICT.SATISFIABLE : POOL_VERDICT.UNSATISFIABLE,
    ceiling: Math.max(...scored.map(candidateScore)),
    count: scored.length,
    admitted,
  };
}

/**
 * The single admission rule consumed by assignment.
 *
 * A first-pass pass admits. A borderline score admits only when the
 * subject-focused second pass returned an explicit `match`; anything else
 * (no second pass, `no_match`, a failed/unparseable check) stays closed.
 *
 * @param {{relevanceScore?: number|null, relevanceCheck?: {verdict?: string}|null}} asset
 * @param {{threshold?: number, borderlineFloor?: number}} [opts]
 * @returns {boolean}
 */
export function isRelevanceAdmitted(asset, opts = {}) {
  return admissionSource(asset, opts) !== null;
}

/**
 * Why an asset was admitted, recorded on the patch entry for auditability.
 * Returns null when it was not admitted.
 *
 * @param {{relevanceScore?: number|null, relevanceCheck?: {verdict?: string}|null}} asset
 * @param {{threshold?: number, borderlineFloor?: number}} [opts]
 * @returns {"score"|"second-pass"|null}
 */
export function admissionSource(asset, opts = {}) {
  const band = classifyRelevance(asset?.relevanceScore, opts);
  if (band === RELEVANCE_BAND.PASS) return "score";
  if (band === RELEVANCE_BAND.BORDERLINE && asset?.relevanceCheck?.verdict === "match") {
    return "second-pass";
  }
  return null;
}
