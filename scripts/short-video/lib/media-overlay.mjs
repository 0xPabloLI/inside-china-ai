/**
 * Media layer scrim — one decision, three writers (#1305).
 *
 * The value lived in three places with the same numbers hardcoded:
 * `recommendScene` (recommendation), `assignAssetsToScenes` (allocation) and
 * the B-roll orchestrator (generated frames). They agreed by luck, not by
 * construction, and they all sat at 0.7–0.8.
 *
 * Measured on the 2026-11-13 batch: a full-frame flat scrim at 0.7 stacked with
 * the text card's own `rgba(10,10,20,0.6)` background left roughly a tenth of
 * the photo's light. The picture was there — `MediaBackground` had drawn it —
 * and the operator's verdict was "有画面但偏暗、字小". A scrim only has to
 * protect the text block; at 0.7 it was also protecting the viewer from the
 * image.
 *
 * `fullscreen` deliberately has no entry: `MediaBackground` maps that mode to
 * overlay 0, because choosing it by hand means "the picture carries this shot".
 *
 * @module media-overlay
 */

/**
 * Scrim opacity per visual type. Lower = more of the image shows through.
 *
 * `quote` keeps a heavy scrim: it is a text-forward layout where a long pull
 * quote has to stay readable over whatever the source sent.
 */
export const MEDIA_OVERLAY = Object.freeze({
  hook: 0.5,
  narrative: 0.55,
  context: 0.55,
  contrast: 0.55,
  "info-card": 0.65,
  // Ambient-only background (media-density pass, 2026-11-14): the number is
  // the protagonist and the label carries the focus, so the photo stays a
  // texture behind them — same reasoning as info-card.
  "stat-reveal": 0.65,
  quote: 0.8,
});

/** Fallback for a visual type with no entry (new types, unknown strings). */
export const DEFAULT_MEDIA_OVERLAY = 0.55;

/**
 * Resolve the scrim opacity for a scene's visual type.
 *
 * An own-key check rather than `MEDIA_OVERLAY[visualType] ?? default`: a
 * prototype key such as `constructor` would otherwise resolve to a function
 * and be written into scene data as `overlay: undefined`.
 *
 * @param {string} visualType
 * @returns {number} 0–1
 */
export function overlayForVisualType(visualType) {
  if (typeof visualType !== "string" || visualType === "") return DEFAULT_MEDIA_OVERLAY;
  return Object.hasOwn(MEDIA_OVERLAY, visualType)
    ? MEDIA_OVERLAY[visualType]
    : DEFAULT_MEDIA_OVERLAY;
}
