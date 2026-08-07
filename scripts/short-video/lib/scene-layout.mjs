/**
 * Slot layout system (spec D3) — the antidote to hand-rolled full-screen
 * flex layouts that drifted ("space-between + bottom padding" stretched
 * scenes into three islands with dead space in the middle and content in
 * the subtitle lane).
 *
 * The canvas is divided into fixed vertical slots; every scene composes its
 * content into slots via sceneFrame(). Slots are anchored constants — the
 * same values the DOM verifier (verify-scene-dom.mjs) enforces, so a scene
 * either fits the grid or the pipeline refuses to ship it.
 *
 *   brandHeader 60-140    channel chrome zone (watermark / brand bar)
 *   kickerTitle 220-400   badge / section title
 *   hero        400-1080  main visual (numbers, cards, comparisons), centered
 *   support     1080-1340 source / conclusion / supporting detail
 *   [subtitle lane 1416-1530 — content never enters; see safe-zones.mjs]
 *
 * All values derive from lib/safe-zones.mjs (single source of truth).
 */

import { CANVAS, SAFE_ZONES } from "./safe-zones.mjs";

/** Content band bottom edge — must equal 1920 − SAFE_ZONES.bottom (1340). */
const CONTENT_BOTTOM = CANVAS.height - SAFE_ZONES.bottom;

/**
 * Vertical slots. `bottom` is the slot's own band edge (not canvas inset);
 * slots touch each other (bottom of one == top of the next).
 */
export const SLOTS = {
  /** Channel chrome zone (brand bar / watermark). Not content. */
  brandHeader: { top: 60, bottom: 140 },
  /** Badge / section title band. */
  kickerTitle: { top: SAFE_ZONES.top, bottom: 400 },
  /** Main visual band — biggest slot, content centers within it. */
  hero: { top: 400, bottom: 1080 },
  /** Source / conclusion / supporting detail band. */
  support: { top: 1080, bottom: CONTENT_BOTTOM },
};

/** Horizontal content band, from SAFE_ZONES (x ∈ [60, 920] on 1080 canvas). */
export const SLOT_X = {
  left: SAFE_ZONES.left,
  right: CANVAS.width - SAFE_ZONES.right,
};

/**
 * CSS for the slot container classes. Slots are absolutely positioned
 * (fixed anchors — never flex at the scene level, which drifts with
 * dynamic content) and center their contents; alignment variants shift
 * content to the band start/end.
 * @returns {string} CSS string
 */
export function slotCss() {
  const slot = (cls, top, height) =>
    `.${cls} { position: absolute; left: ${SLOT_X.left}px; right: ${CANVAS.width - SLOT_X.right}px; ` +
    `top: ${top}px; height: ${height}px; display: flex; flex-direction: column; ` +
    `justify-content: center; align-items: center; }`;
  return `
    /* ── Slot layout system (lib/scene-layout.mjs) ── */
    ${slot("slot-kicker", SLOTS.kickerTitle.top, SLOTS.kickerTitle.bottom - SLOTS.kickerTitle.top)}
    ${slot("slot-hero", SLOTS.hero.top, SLOTS.hero.bottom - SLOTS.hero.top)}
    ${slot("slot-support", SLOTS.support.top, SLOTS.support.bottom - SLOTS.support.top)}
    .slot-align-start { justify-content: flex-start; }
    .slot-align-end { justify-content: flex-end; }
  `;
}

function slotHtml(name, cls, content, align) {
  if (!content) return "";
  const variant = align ? ` slot-align-${align}` : "";
  return `<div class="${cls}${variant}">${content}</div>`;
}

/**
 * Assemble a scene's content into the fixed slots, in vertical order.
 * Empty slots are omitted (no empty containers in the DOM).
 *
 * @param {object} frame - { kicker, hero, support, align }
 *   kicker/hero/support: HTML strings for each band ("" omits the band)
 *   align: { kicker?: "start"|"end", hero?: "start"|"end", support?: "start"|"end" }
 * @returns {string} HTML
 */
export function sceneFrame({ kicker = "", hero = "", support = "", align = {} } = {}) {
  return [
    slotHtml("kicker", "slot-kicker", kicker, align.kicker),
    slotHtml("hero", "slot-hero", hero, align.hero),
    slotHtml("support", "slot-support", support, align.support),
  ].join("");
}
