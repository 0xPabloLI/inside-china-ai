/**
 * Text slot contract — single source of truth for dynamic text layout.
 *
 * Four consumers read this module, and they must never disagree:
 *   - Remotion scene components (what size to render / shrink to)
 *   - HTML scene templates (the Playwright path)
 *   - the content-hint character budget
 *   - the verifier (what to assert the DOM against)
 *
 * Before this module existed each of those hardcoded its own sizes, which is how
 * the same scene-data ended up rendering at 64px on one path and 80px on the
 * other, and how a clipped "THAT'S THE WHOLE POIN" passed every check.
 */
import { BRAND_FONT_STACK, CANVAS, SAFE_ZONES } from "./safe-zones.mjs";

/**
 * Per-field typography defaults.
 *
 * `shrinkPriority` decides who gives up size first when a slot's fields no
 * longer fit: lowest shrinks first, so body detail goes before the headline.
 */
export const SLOT_FIELDS = {
  // Narrative body fields
  result: { preferredSize: 56, minSize: 40, fontWeight: 900, shrinkPriority: 40 },
  company: { preferredSize: 48, minSize: 36, fontWeight: 900, shrinkPriority: 30 },
  action: { preferredSize: 32, minSize: 24, fontWeight: 700, shrinkPriority: 20 },
  context: { preferredSize: 24, minSize: 18, fontWeight: 600, shrinkPriority: 10 },
  source: { preferredSize: 20, minSize: 16, fontWeight: 600, shrinkPriority: 5, required: false },

  // Hook fields
  subject: { preferredSize: 64, minSize: 48, fontWeight: 900, shrinkPriority: 35 },
  bigNumber: {
    preferredSize: 240,
    minSize: 180,
    fontWeight: 900,
    letterSpacing: -10,
    shrinkPriority: 45,
    // rough-notation circles this number; the annotation is part of the slot.
    annotationPolicy: "circle",
    maxLines: 1,
    wrapPolicy: "none",
  },
  numberLabel: { preferredSize: 48, minSize: 36, fontWeight: 800, shrinkPriority: 25 },
  hookText: { preferredSize: 78, minSize: 56, fontWeight: 900, shrinkPriority: 35 },
  revealText: { preferredSize: 80, minSize: 56, fontWeight: 900, shrinkPriority: 35 },

  // Other templates
  quote: { preferredSize: 36, minSize: 26, fontWeight: 600, shrinkPriority: 35 },
  title: { preferredSize: 48, minSize: 36, fontWeight: 900, shrinkPriority: 35 },
  attribution: { preferredSize: 24, minSize: 18, fontWeight: 700, shrinkPriority: 10 },
  tagline: { preferredSize: 32, minSize: 24, fontWeight: 600, shrinkPriority: 15 },
  topic: { preferredSize: 36, minSize: 26, fontWeight: 700, shrinkPriority: 15 },
  stat: { preferredSize: 56, minSize: 40, fontWeight: 900, shrinkPriority: 40 },
};

/** Slot defaults applied to every field unless the field overrides them. */
export const SLOT_DEFAULTS = {
  fontFamily: BRAND_FONT_STACK,
  fontWeight: 700,
  letterSpacing: 0,
  lineHeight: 1.15,
  maxLines: 2,
  wrapPolicy: "wrap",
  annotationPolicy: "none",
  /** Frame by which entrance animations and annotations have settled. */
  settledFrame: 40,
  required: true,
};

/**
 * Measured content-box widths, keyed by slot id.
 *
 * These are measured, not derived: `maxWidth` in the components applies to the
 * content box (no box-sizing reset in Remotion), so subtracting padding again
 * would understate the space available and shrink text that actually fits.
 */
export const MEASURED_MAX_WIDTH = {
  // media-overlay bottom band: maxWidth 820 - 2*SPACING['2xl'] = 756
  "narrative.media-overlay.result": 756,
  "narrative.media-overlay.context": 756,
  "narrative.media-overlay.source": 756,
  // media-overlay top band: maxWidth 820, no padding
  "narrative.media-overlay.company": 820,
  "narrative.media-overlay.action": 820,
  // media-split right column: width 420 capped by maxWidth 420 - 2*SPACING.xl
  "narrative.media-split.result": 372,
  "narrative.media-split.context": 372,
  "narrative.media-split.source": 372,
  "narrative.media-split.company": 372,
  "narrative.media-split.action": 372,

  // Slot-based templates: `left: SAFE_ZONES.left` + `right: SAFE_ZONES.right`
  // gives every slot a content box of 1080 - 60 - 200 = 820.
  "hook.hero-center.subject": 820,
  "hook.hero-center.bigNumber": 820,
  "hook.hero-center.numberLabel": 820,
  "hook.hero-center.hookText": 820,
  "hook.hero-center.revealText": 820,
  "hook.hero-center.source": 820,
  "stat-reveal.hero-center.bigNumber": 820,
  "stat-reveal.hero-center.numberLabel": 820,
  "stat-reveal.hero-center.source": 820,
  "cta.hero-center.subject": 820,
  "cta.hero-center.tagline": 820,
  "cta.hero-center.topic": 820,
  "callout.hero-center.title": 820,
  "callout.hero-center.quote": 820,
  "callout.hero-center.attribution": 820,

  // FullscreenMedia anchors the source label at `left: SAFE_ZONES.left` with no
  // right bound today, so a long source can run under the action rail. The
  // contract caps it at the safe-zone width; T5 makes the component honour it.
  "fullscreen.source": 820,
};

/** Layout the Remotion narrative template has always fallen back to. */
export const DEFAULT_NARRATIVE_LAYOUT = "media-bottom-bar";

/**
 * Slot ids rendered by each HTML template, by visualType.
 *
 * The HTML renderer does not consume `scene.layout` — one template serves every
 * layout variant — so this mapping is keyed by visualType only. Adding an HTML
 * layout variant means adding entries here and measuring their widths.
 */
export const HTML_SLOT_MAP = {
  hook: [
    "hook.hero-center.subject",
    "hook.hero-center.bigNumber",
    "hook.hero-center.numberLabel",
    "hook.hero-center.hookText",
    "hook.hero-center.revealText",
    "hook.hero-center.source",
  ],
  narrative: [
    `narrative.${DEFAULT_NARRATIVE_LAYOUT}.company`,
    `narrative.${DEFAULT_NARRATIVE_LAYOUT}.action`,
    `narrative.${DEFAULT_NARRATIVE_LAYOUT}.result`,
    `narrative.${DEFAULT_NARRATIVE_LAYOUT}.context`,
    `narrative.${DEFAULT_NARRATIVE_LAYOUT}.source`,
  ],
  "stat-reveal": [
    "stat-reveal.hero-center.bigNumber",
    "stat-reveal.hero-center.numberLabel",
    "stat-reveal.hero-center.source",
  ],
  cta: ["cta.hero-center.subject", "cta.hero-center.tagline", "cta.hero-center.topic"],
  callout: [
    "callout.hero-center.title",
    "callout.hero-center.quote",
    "callout.hero-center.attribution",
  ],
  // FullscreenMedia renders media.source — the one dynamic text that comes from
  // the media block instead of scene.texts, and the easiest one to overlook.
  fullscreen: ["fullscreen.source"],
};

/**
 * Build a slot id.
 *
 * @param {{visualType: string, layout?: string, field: string, index?: number}} parts
 * @returns {string}
 */
export function slotId({ visualType, layout, field, index }) {
  const resolvedLayout =
    layout ?? (visualType === "narrative" ? DEFAULT_NARRATIVE_LAYOUT : "hero-center");
  return `${visualType}.${resolvedLayout}.${field}${index === undefined ? "" : `[${index}]`}`;
}

/** Split `visualType.layout.field[index]` back into its parts. */
export function parseSlotId(id) {
  const match = /^([^.]+)\.([^.]+)\.([^[\]]+)(\[(\d+)\])?$/.exec(id);
  if (!match) {
    throw new Error(`Malformed slot id: ${id}`);
  }
  return {
    visualType: match[1],
    layout: match[2],
    field: match[3],
    index: match[5] === undefined ? undefined : Number(match[5]),
  };
}

/**
 * Resolve a slot's contract: field defaults, slot defaults and the measured
 * width, with any per-slot overrides applied last.
 *
 * Throws rather than guessing: an unmeasured width silently produces a slot
 * that either never shrinks or always shrinks.
 *
 * @param {string} id
 * @param {Partial<Record<string, unknown>>} [overrides]
 * @returns {Record<string, unknown>}
 */
export function getSlot(id, overrides = {}) {
  const { field } = parseSlotId(id);
  const fieldDefaults = SLOT_FIELDS[field];
  if (!fieldDefaults) {
    throw new Error(
      `Unknown text field "${field}" (slot ${id}) — add it to SLOT_FIELDS before rendering it`,
    );
  }

  const maxWidth = MEASURED_MAX_WIDTH[id];
  if (!maxWidth) {
    throw new Error(
      `Slot ${id} has no measured maxWidth — measure the container's content box ` +
        "and add it to MEASURED_MAX_WIDTH (do not derive it from padding maths)",
    );
  }

  const slot = {
    ...SLOT_DEFAULTS,
    ...fieldDefaults,
    container: id,
    maxWidth,
    maxHeight: null,
    ...overrides,
  };

  // rough-notation wraps its text in an inline-block with white-space:pre, so
  // annotated text can never wrap — it has to shrink instead.
  if (slot.annotationPolicy && slot.annotationPolicy !== "none") {
    slot.maxLines = 1;
    slot.wrapPolicy = "none";
  }

  return slot;
}

/**
 * Candidate sizes to try, from `preferredSize` down to the hard floor.
 *
 * The ladder stops dead at `minSize` — there is deliberately no "one more
 * notch" escape (an earlier draft allowed `minSize * 0.9`). Text that does not
 * fit at the floor is a content problem: callers must fail the render and let
 * the copy be rewritten, not quietly render something unreadable.
 *
 * @param {{preferredSize: number, minSize: number}} slot
 * @param {number} [step]
 * @returns {number[]}
 */
export function fitCandidates(slot, step = 2) {
  const sizes = [];
  for (let size = slot.preferredSize; size > slot.minSize; size -= step) {
    sizes.push(size);
  }
  sizes.push(slot.minSize);
  return sizes;
}

/**
 * Order slots by who gives up size first (lowest shrinkPriority first).
 *
 * @param {string[]} ids
 * @returns {string[]}
 */
export function shrinkOrder(ids) {
  return [...ids].sort((a, b) => {
    const pa = SLOT_FIELDS[parseSlotId(a).field]?.shrinkPriority ?? Number.MAX_SAFE_INTEGER;
    const pb = SLOT_FIELDS[parseSlotId(b).field]?.shrinkPriority ?? Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}

/**
 * Slot ids an HTML template renders.
 *
 * @param {string} visualType
 * @returns {string[]}
 */
export function htmlSlotsFor(visualType) {
  const slots = HTML_SLOT_MAP[visualType];
  if (!slots) {
    throw new Error(
      `No HTML slot mapping for visualType "${visualType}" — declare it in HTML_SLOT_MAP ` +
        "so the contract covers every dynamic text the template renders",
    );
  }
  return [...slots];
}

/** Canvas and safe-zone frame the contract measures against. */
export const SLOT_FRAME = {
  canvas: CANVAS,
  safeZones: SAFE_ZONES,
};
