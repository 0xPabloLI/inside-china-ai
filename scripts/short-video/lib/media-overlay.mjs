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
import { HOOK_MEDIA_LED_LAYOUT } from "./text-slots.mjs";

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
  // Ambient background (media-density pass, 2026-11-14) — but the photo must
  // stay perceivable: at 0.65 the sourced/generated image read as "no image
  // at all" on the 2026-11-14 packs (user ruling). 0.5 keeps the number the
  // protagonist while the picture reads as a picture; the rail safe zone is
  // owned by MediaBackground's RAIL_VIGNETTE (#1315), not by this scrim, so
  // lowering it does not re-light the rail.
  "stat-reveal": 0.5,
  quote: 0.8,
});

/** Fallback for a visual type with no entry (new types, unknown strings). */
export const DEFAULT_MEDIA_OVERLAY = 0.55;

/**
 * Scrim opacity for the media-led hook, split by fit (2026-11-15).
 *
 * `contain` is the whole point of the layout: the picture gets its own band and
 * NO text is drawn over it, so the readability scrim that justifies hook's 0.5
 * has no job — 0.15 keeps the picture at near-full strength (a hair of
 * protection for the band's edges).
 *
 * `cover` renders full-bleed, and the badge + subject rows DO sit on the
 * footage above MediaScrims' top band (which ends at y 200). It therefore keeps
 * the hero-center cover value: the geometry is identical, so the scrim that
 * protects hero-center's cover hook has to protect this one too.
 */
export const MEDIA_LED_DIM = Object.freeze({
  contain: 0.15,
  cover: MEDIA_OVERLAY.hook,
});

/**
 * The media-led dim for a media object (or a scene without one yet).
 *
 * An absent `fit` reads as cover, the renderer's own default.
 *
 * @param {{fit?: string}} [media]
 * @returns {number} 0–1
 */
export function mediaLedDimFor(media) {
  return media?.fit === "contain" ? MEDIA_LED_DIM.contain : MEDIA_LED_DIM.cover;
}

/**
 * Resolve the scrim opacity for a SCENE, layout-aware.
 *
 * Only the media-led hook diverges from its visual type; every other scene
 * resolves through {@link overlayForVisualType}. The layout string comes from
 * the slot contract (HOOK_MEDIA_LED_LAYOUT) so a rename cannot desync the two.
 *
 * @param {{visualType?: string, layout?: string, media?: {fit?: string}}} [scene]
 * @returns {number} 0–1
 */
export function overlayForScene(scene) {
  if (scene?.visualType === "hook" && scene?.layout === HOOK_MEDIA_LED_LAYOUT) {
    return mediaLedDimFor(scene.media);
  }
  return overlayForVisualType(scene?.visualType);
}

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
