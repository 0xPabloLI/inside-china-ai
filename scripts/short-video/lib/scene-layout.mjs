/**
 * Slot layout system (spec D3) — the antidote to hand-rolled full-screen
 * flex layouts that drifted ("space-between + bottom padding" stretched
 * scenes into three islands with dead space in the middle and content in
 * the subtitle lane).
 *
 * The canvas is divided into fixed vertical slots; every scene composes its
 * content into slots via sceneFrame(). Slots are anchored constants — the
 * same values the render-time gates enforce (TextGate / safe zones), so a
 * scene either fits the grid or the pipeline refuses to ship it.
 *
 *   brandHeader 60-200    channel chrome zone (watermark 60-115 / brand bar 140-188)
 *   kickerTitle 220-400   badge / section title
 *   hero        400-950   main visual (numbers, cards, comparisons), centered
 *   support     950-1150  source / conclusion / supporting detail
 *   [subtitle lane 1188-1350 — content never enters; see safe-zones.mjs]
 *
 * The content band ends at y=1150 (recalibrated) so the larger 60px subtitle
 * lane starting at y1188 has clearance; hero/support were re-flowed into the
 * tighter 400-1150 span. All values derive from lib/safe-zones.mjs.
 *
 * The brand bar sits at top:140 (below the TikTok LIVE button at y≤138) and
 * right:200 (matching SAFE_ZONES.right, clearing the search icon at x≥969).
 * See IMG_7975.PNG OCR calibration in docs/brand-system.md.
 */

import { CANVAS, SAFE_ZONES } from "./safe-zones.mjs";

/** Content band bottom edge — must equal 1920 − SAFE_ZONES.bottom (1150). */
const CONTENT_BOTTOM = CANVAS.height - SAFE_ZONES.bottom;

/**
 * Vertical slots. `bottom` is the slot's own band edge (not canvas inset);
 * slots touch each other (bottom of one == top of the next).
 */
export const SLOTS = {
  /** Channel chrome zone (brand bar / watermark). Not content. */
  brandHeader: { top: 60, bottom: 200 },
  /** Badge / section title band. */
  kickerTitle: { top: SAFE_ZONES.top, bottom: 400 },
  /** Main visual band — biggest slot, content centers within it. */
  hero: { top: 400, bottom: 950 },
  /** Source / conclusion / supporting detail band. */
  support: { top: 950, bottom: CONTENT_BOTTOM },
};

/** Horizontal content band, from SAFE_ZONES (x ∈ [60, 880] on 1080 canvas). */
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
  const slot = (cls, top, height, justify = "center") =>
    `.${cls} { position: absolute; left: ${SLOT_X.left}px; right: ${CANVAS.width - SLOT_X.right}px; ` +
    `top: ${top}px; height: ${height}px; display: flex; flex-direction: column; ` +
    `justify-content: ${justify}; align-items: center; }`;
  return `
    /* ── Slot layout system (lib/scene-layout.mjs) ── */
    ${slot("slot-kicker", SLOTS.kickerTitle.top, SLOTS.kickerTitle.bottom - SLOTS.kickerTitle.top, "space-evenly")}
    ${slot("slot-hero", SLOTS.hero.top, SLOTS.hero.bottom - SLOTS.hero.top, "space-evenly")}
    ${slot("slot-support", SLOTS.support.top, SLOTS.support.bottom - SLOTS.support.top, "center")}
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
