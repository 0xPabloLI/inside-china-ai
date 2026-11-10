/**
 * Three-tier information type scale + empty-field rule (#739).
 *
 * Source: anything2explainer `reference/composition-and-light.md` §1/§6
 * (1280×720 landscape, PolyForm Noncommercial — the RULES only, no code,
 * template, font or sample frame is copied; see
 * `docs/research/repo-survey-tracking.md` §C):
 *
 *   hero ≥170px · supporting 60–110 · labels 22–30 · no fourth size
 *   content-area largest object <110px for >45 frames → mid-level defect
 *
 * Portrait recalibration for our 1080×1920 canvas (issue #739, HITL
 * 2026-11-09 chose the scale + empty-field scope only):
 *
 * - hero: 170 × 1080/1280 = 143.4 → the contract's own hero floor,
 *   `SLOT_FIELDS.bigNumber.minSize` (150). Preferred hero anchors are 240
 *   (`stat` / `bigNumber`).
 * - supporting: kept at 60–110. Our lead class renders at 60–80, inside the
 *   band, and 110 is the source's empty-field line — the band's upper bound is
 *   also the defect threshold.
 * - labels: 22–30 × 1080/1280 = 19–25px, below the must-read floors the user
 *   set in #688 (copy 48 / metadata 40). #688 supersedes the source value —
 *   a 25px label is unreadable on a phone — so the label band re-anchors on
 *   those floors (`READABILITY_TIERS`).
 * - the source's second hero form — "big text ≥96px on a line ≥300px wide" —
 *   is NOT adopted. Rescaled it is ~81px on a ≥253px line, squarely inside the
 *   supporting band, and every 60–110px full-width headline would qualify,
 *   which voids the empty-field rule for exactly the "small copy" defect it
 *   exists to catch. The portrait contract keeps ONE hero floor (150px); a
 *   width-qualified hero belongs to the four information-graphic topologies
 *   (the deferred half of #739), where a layout — not a bare font size —
 *   defines the focal object.
 *
 * The bands leave two deliberate gaps (49–59 and 111–149): "no fourth size"
 * means a declared size must land inside a band, and the gaps make a stray
 * intermediate size detectable instead of plausible. The gaps are enforced by
 * the contract test (`__tests__/type-scale.test.mjs`) over the DESIGN sizes
 * (`SLOT_FIELDS[*].preferredSize`), not the shrink ladder — shrinking a long
 * line through 52px is TextGate fit, not a design choice. There is no runtime
 * gate: the renderer reads only declared sizes, so the test is the guard.
 *
 * This module is the single source for both consumers: the renderer's token
 * layer (`remotion/src/tokens.ts` re-exports it as `TYPE.tiers`) and the
 * preflight gate (`scene-rules.mjs` `checkEmptyField`). It has no `remotion`
 * import, so it is testable in plain Node like `safe-zones.mjs`.
 */
import { READABILITY_TIERS, SLOT_FIELDS } from "./text-slots.mjs";

/**
 * The three size bands, px on the 1080×1920 canvas.
 *
 * `max: null` means unbounded above (the hero tier has no ceiling: a bigger
 * number is the point of a set piece).
 *
 * @typedef {{min: number, max: number|null}} TypeBand
 */
export const TYPE_TIERS = {
  /** Labels, chips, metadata — the #688 floors, not the source's 22–30. */
  label: { min: READABILITY_TIERS.metadata, max: READABILITY_TIERS.copy },
  /** Lead copy and supporting objects, 60–110. */
  supporting: { min: 60, max: 110 },
  /** Focal object: the one thing the shot is about. */
  hero: { min: SLOT_FIELDS.bigNumber.minSize, max: null },
};

/**
 * Empty-field rule.
 *
 * A scene whose largest content object stays below the supporting band's upper
 * bound has no hero: it is the "small copy + small chip" defect the source
 * names. `minFrames` is the persistence window (45 frames at 30fps = 1.5s);
 * the predicate is strict on both sides — exactly 110px is not "below", and
 * exactly 45 frames is not "more than".
 *
 * Persistence is judged per scene: a scene's declared sizes are constant for
 * the whole shot (entrance animations settle by frame 40, they do not change
 * the object's size class). Callers that know real scene durations pass them
 * through `opts.sceneDurations`, and scenes at or under the window are skipped
 * — the window only matters for very short shots.
 *
 * Scope is the information grammar this ticket governs (the five templates the
 * survey named), not the whole catalogue: the brand CTA and the hook are
 * deliberately small-copy formats and are judged by their own gates. The rule
 * measures TEXT objects only — a scene whose template draws a media layer is
 * not empty, and that exemption belongs to the caller: it only counts a media
 * path the template actually renders (`data`/`stat-reveal` ignore media) and
 * skips those scenes before calling `isEmptyField`.
 */
export const EMPTY_FIELD = {
  /** Largest-object threshold, px — the source's 110, kept after rescaling. */
  maxObjectPx: 110,
  /** Persistence window, frames at 30fps; the rule requires MORE than this. */
  minFrames: 45,
  /** visualTypes governed by the rule (#739 scope). */
  visualTypes: ["data", "stat-reveal", "contrast", "info-card", "context"],
};

/**
 * Which band a declared size belongs to, or null when it sits in a gap.
 *
 * @param {number} px
 * @returns {"label"|"supporting"|"hero"|null}
 */
export function tierForSize(px) {
  for (const [name, band] of Object.entries(TYPE_TIERS)) {
    if (px >= band.min && (band.max === null || px <= band.max)) {
      return /** @type {"label"|"supporting"|"hero"} */ (name);
    }
  }
  return null;
}

/**
 * Whether the empty-field rule fires for a scene.
 *
 * @param {{largestObjectPx: number|null|undefined, frames?: number|null}} input
 *   `frames` is the scene's rendered length when known; omit it when the gate
 *   runs before TTS (the whole shot is then the persistence window).
 * @returns {boolean}
 */
export function isEmptyField({ largestObjectPx, frames = null }) {
  if (!Number.isFinite(largestObjectPx) || largestObjectPx <= 0) return false;
  if (Number.isFinite(frames) && frames <= EMPTY_FIELD.minFrames) return false;
  return largestObjectPx < EMPTY_FIELD.maxObjectPx;
}
