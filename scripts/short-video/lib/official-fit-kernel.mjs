/**
 * Pure decision kernel for the official layout-utils fit seed (T12).
 *
 * T12 (spec decisions 57/63) replaces the TextGate candidate generation's
 * blind linear step-down with a walk seeded by the official
 * `@remotion/layout-utils` measurement (`fitText` for single-line text,
 * `fitTextOnNLines` for wrapping text). The official output is ONLY a
 * candidate: the browser helper (remotion/src/components/official-fit.ts)
 * measures,
 * this kernel turns predictions into the seed and the candidate order, and
 * the TextGate's real-geometry terminal validation (Range rects + ink) stays
 * the gate — the official functions never verify their own result.
 *
 * Outcome equivalence (why this is a safe replacement): the seeded candidate
 * sequence is a REORDERING of the old `fitCandidates` lattice. Every lattice
 * size from preferredSize down to minSize still appears exactly once, so for
 * monotonic text fitting (larger size → wider box → no more likely to fit)
 * the "first candidate that fits" loop returns the same size as the old full
 * ladder — the official seed only decides where the walk starts, i.e. how
 * many probes a typical render needs. A wrong prediction can never change
 * the chosen size; it can only cost probes.
 *
 * Measured seed quality (real Chromium, Times stack, 2026-09-02, T12): the
 * official linear extrapolation is accurate to 0.01px on the Times-900
 * uppercase cases (well under EPS 0.5 - no extra refinement step), but
 * breaks by 89.9px on fixed-px letterSpacing (-10px focus numbers), which
 * is why the helper routes those through solveSingleLinePxLetterSpacing
 * (corrected error: 0.02px).
 *
 * Browser-independent on purpose: everything here operates on numbers so the
 * contract tests can run in node (vitest), same split as text-geometry.mjs.
 */

/**
 * Turn a raw official prediction into the seed candidate size.
 *
 *  - non-finite / non-positive predictions (empty text → Infinity, degenerate
 *    measurements → NaN, "nothing fits" from fitTextOnNLines → 0.1) fall back
 *    to `preferredSize`, which makes the sequence identical to the old full
 *    linear ladder;
 *  - the prediction is clamped to the contract band `[minSize, preferredSize]`
 *    (official `fitText` has no min/max concept — the official docs' own
 *    examples have the caller clamp with Math.min);
 *  - the clamped value is rounded onto the ladder's step grid so the walk
 *    covers the same lattice the old `fitCandidates` ladder did.
 *
 * @param {number} predicted raw official prediction (gate-size units)
 * @param {{minSize: number, preferredSize: number, step?: number}} slot
 * @returns {number} seed candidate, `minSize <= seed <= preferredSize`
 */
export function officialSeedSize(predicted, { minSize, preferredSize, step = 2 }) {
  if (!Number.isFinite(predicted) || predicted <= 0) {
    return preferredSize;
  }
  const clamped = Math.min(preferredSize, Math.max(minSize, predicted));
  const rounded = Math.round(clamped / step) * step;
  return Math.min(preferredSize, Math.max(minSize, rounded));
}

/**
 * Candidate sequence for a seeded walk: the lattice region ABOVE the seed
 * (largest first), then the seed itself down to the hard floor.
 *
 * This is the old `fitCandidates` sequence reordered so that the first
 * fitting candidate is still the LARGEST fitting lattice size (see the
 * equivalence note in the module docstring), while a accurate seed ends the
 * walk within a probe or two.
 *
 * @param {{preferredSize: number, minSize: number}} slot
 * @param {number} [seed] official seed; defaults to preferredSize, which
 *   reproduces `fitCandidates(slot)` exactly
 * @param {number} [step]
 * @returns {number[]}
 */
export function fitCandidatesFromSeed(slot, seed = slot.preferredSize, step = 2) {
  const s = officialSeedSize(seed, slot);
  const above = [];
  for (let size = slot.preferredSize; size > s; size -= step) {
    above.push(size);
  }
  const below = [];
  for (let size = s; size > slot.minSize; size -= step) {
    below.push(size);
  }
  below.push(slot.minSize);
  return [...above, ...below];
}

/**
 * Most constraining block wins: a gate whose text element lays out several
 * blocks (e.g. statCard's nowrap number row above a wrapping label) fits at
 * whichever block needs the smallest gate size.
 *
 * @param {number[]} seeds per-container predictions in gate-size units
 * @returns {number|null} the minimum, or null when no container produced a
 *   usable prediction (caller falls back to the full linear ladder)
 */
export function minContainerSeed(seeds) {
  const usable = seeds.filter((s) => Number.isFinite(s) && s > 0);
  if (usable.length === 0) return null;
  return Math.min(...usable);
}

/**
 * Single-line size for a text run whose `letter-spacing` is a FIXED pixel
 * value (the templates use px letterSpacing — `-10px` on the focus numbers,
 * `1px`/`2px`/`4px` on labels). Fixed px spacing does NOT scale with font
 * size, which breaks `fitText`'s pure linear extrapolation
 * (`width@100px × size/100`); this solves the width model exactly instead:
 *
 *   width(size) = advance(100px) × size/100 + letterSpacingTotal
 *
 * where `letterSpacingTotal` is the font-size-independent spacing
 * contribution measured at the probe size (px spacing contributes the same
 * pixels at any size). Returns the size that makes the width equal
 * `maxWidth`, or null when the inputs are degenerate (no measurable
 * advance, or the spacing alone already fills the box).
 *
 * @param {{adv100: number, letterSpacingTotal: number, maxWidth: number}} p
 * @returns {number|null}
 */
export function solveSingleLinePxLetterSpacing({ adv100, letterSpacingTotal, maxWidth }) {
  if (!Number.isFinite(adv100) || adv100 <= 0) return null;
  if (!Number.isFinite(letterSpacingTotal)) return null;
  const usable = maxWidth - letterSpacingTotal;
  if (!Number.isFinite(usable) || usable <= 0) return null;
  return (usable / adv100) * 100;
}
