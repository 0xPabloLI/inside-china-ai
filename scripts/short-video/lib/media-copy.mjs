/**
 * Media-page copy density — the compact contract for full-bleed evidence.
 *
 * The 2026-11-25 user review: a 16:9 work clip should own the frame, and the
 * Remotion copy under it should read as 1–2 lines, not a four-row caption
 * stack. The old four-row bar was not wrong for a text-led page, but on a
 * full-bleed picture it pushed the picture up and left the subtitle lane with
 * no visual breathing room.
 *
 * This module owns the selection, not the rendering: `compactMediaTexts()`
 * keeps the two highest-signal rows in reading order and `mediaCopyRowCount()`
 * lets preflight count a scene's declared stack. The template applies it only
 * to full-bleed evidence pages; a text-led page or a page-capture card keeps
 * its full copy block.
 *
 * @module media-copy
 */

import { mediaRoleOf, MEDIA_ROLE } from "./media-role.mjs";

/** Full-bleed media pages may render at most this many text rows. */
export const MEDIA_COPY_LIMIT = 2;

/**
 * Reading order for a compact media page. Subject first, payoff second;
 * action and attribution are the rows that can move into voiceover/caption
 * when the picture already carries the evidence.
 */
const MEDIA_COPY_ORDER = Object.freeze(["company", "result", "action", "source"]);

/**
 * Whether a scene is a full-bleed evidence page whose copy should stay compact.
 *
 * This mirrors the renderer's routing:
 *   - narrative only (the other templates have their own contracts);
 *   - media-bottom-bar / media-first (the two full-bleed narrative layouts);
 *   - evidence role and not a bounded page-capture card.
 *
 * A background still, a card, or a text-led layout keeps whatever copy block
 * its own layout declares.
 *
 * @param {{visualType?: string, layout?: string, media?: object|null, mediaRole?: string}} scene
 * @returns {boolean}
 */
export function isCompactMediaScene(scene) {
  if (scene?.visualType !== "narrative" || !scene.media) return false;
  const layout = scene.layout ?? "media-bottom-bar";
  if (layout !== "media-bottom-bar" && layout !== "media-first") return false;
  if (scene.media.mode === "card") return false;
  return mediaRoleOf(scene) === MEDIA_ROLE.EVIDENCE;
}

/**
 * The rows a full-bleed evidence page may render, in reading order.
 *
 * @param {Record<string, any>} texts
 * @returns {string[]}
 */
function mediaCopyRows(texts = {}) {
  return MEDIA_COPY_ORDER.filter((key) => {
    const value = texts?.[key];
    return typeof value === "string" ? value.trim() !== "" : Boolean(value);
  });
}

/** How many copy rows a scene declares. */
export function mediaCopyRowCount(texts = {}) {
  return mediaCopyRows(texts).length;
}

/**
 * Drop rows past the limit while keeping non-row fields (`highlight`, etc.)
 * intact. The selected subset is still a normal `texts` object, so the same
 * height functions and gates can read it without a second schema.
 *
 * @param {Record<string, any>} texts
 * @param {{limit?: number}} [options]
 * @returns {Record<string, any>}
 */
export function compactMediaTexts(texts = {}, { limit = MEDIA_COPY_LIMIT } = {}) {
  const rows = mediaCopyRows(texts);
  if (rows.length <= limit) return { ...texts };
  const keep = new Set(rows.slice(0, limit));
  const compact = { ...texts };
  for (const key of MEDIA_COPY_ORDER) {
    if (!keep.has(key)) delete compact[key];
  }
  return compact;
}
