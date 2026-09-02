/**
 * Text slot contract — single source of truth for dynamic text layout.
 *
 * Three consumers read this module, and they must never disagree:
 *   - Remotion scene components (what size to render / shrink to)
 *   - the content-hint character budget
 *   - the verifier (what to assert the DOM against)
 *
 * (A fourth consumer, the HTML scene templates of the retired Playwright
 * path, was removed on 2026-09-01 — see retired-html-path/README.md.)
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
    minSize: 150,
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
  // Focus number family: bigNumber and stat are the same concept (one giant
  // number the whole scene is about). T5 unified them at 240/180 single-line.
  stat: {
    preferredSize: 240,
    minSize: 180,
    fontWeight: 900,
    letterSpacing: -10,
    shrinkPriority: 45,
    // DataScene draws an animated circle around the number.
    annotationPolicy: "circle",
    maxLines: 1,
    wrapPolicy: "none",
  },

  // T5 registrations: fields the Remotion templates already render, now under
  // contract. Preferred sizes are the templates' current sizes; floors follow
  // the round(0.72 × preferred) rule (spec decision 46).
  badge: { preferredSize: 22, minSize: 16, fontWeight: 900, shrinkPriority: 8 },
  brand: { preferredSize: 72, minSize: 52, fontWeight: 900, shrinkPriority: 38 },
  label: { preferredSize: 36, minSize: 26, fontWeight: 700, shrinkPriority: 25 },
  subtext: { preferredSize: 26, minSize: 19, fontWeight: 600, shrinkPriority: 12 },
  detail: { preferredSize: 22, minSize: 16, fontWeight: 600, shrinkPriority: 8 },
  subtitle: { preferredSize: 22, minSize: 16, fontWeight: 700, shrinkPriority: 12 },
  note: { preferredSize: 22, minSize: 16, fontWeight: 600, shrinkPriority: 10 },
  // Contrast chip columns; each entry gates as left[i] / right[i].
  left: { preferredSize: 22, minSize: 16, fontWeight: 700, shrinkPriority: 15 },
  right: { preferredSize: 22, minSize: 16, fontWeight: 700, shrinkPriority: 15 },
  vs: { preferredSize: 22, minSize: 16, fontWeight: 900, shrinkPriority: 8 },
  verified: { preferredSize: 24, minSize: 17, fontWeight: 700, shrinkPriority: 8 },
  points: { preferredSize: 26, minSize: 19, fontWeight: 700, shrinkPriority: 15 },
  // One hook stat card, gated WHOLE: num and unit share a nowrap row, so their
  // widths compete and cannot be gated independently. The gate injects the
  // card's number size; unit/label render at fixed ratios (0.5× / 0.36×).
  statCard: { preferredSize: 56, minSize: 40, fontWeight: 900, shrinkPriority: 40 },
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
  // media-overlay bottom band: band width 820 - 2*SPACING['2xl'] = 756,
  // minus its own horizontal padding 2*SPACING['2xl'] = 64 → content box 692.
  "narrative.media-overlay.result": 692,
  "narrative.media-overlay.context": 692,
  "narrative.media-overlay.source": 692,
  // media-overlay top band: maxWidth 820, no padding
  "narrative.media-overlay.company": 820,
  "narrative.media-overlay.action": 820,
  // media-split right column: measured content box 372 (column maxWidth
  // 420 − 2*SPACING.xl, no padding), verified by measure-slot-widths.mjs.
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
  // Remotion fullscreen uses the media layout; same measured cap as the HTML
  // path — T5 makes FullscreenMedia honour the right bound.
  "fullscreen.media.source": 820,

  // T5: widths for the newly registered templates. Every value below was
  // verified in a real Chromium render by measure-slot-widths.mjs (Ticket D):
  // the probe reports the constraint each gate's surroundings actually grant.
  // media-bottom-bar: the bar IS the [data-text-container]; its content box
  // (maxWidth 772 minus horizontal padding 2*SPACING.xl) measured at 724.
  "narrative.media-bottom-bar.company": 724,
  "narrative.media-bottom-bar.action": 724,
  "narrative.media-bottom-bar.result": 724,
  "narrative.media-bottom-bar.source": 724,
  "narrative.media-overlay.badge": 820,
  // stacked-cards: card fields sit inside padded+bordered cards inside the
  // 820 band (measured 752); source renders OUTSIDE the cards, so it gets
  // the full band width.
  "narrative.stacked-cards.company": 752,
  "narrative.stacked-cards.context": 752,
  "narrative.stacked-cards.action": 752,
  "narrative.stacked-cards.result": 752,
  "narrative.stacked-cards.source": 820,
  // The badge chip sits directly in the 820 band container (the gate wraps
  // the chip, so its padding/border stay inside the slot) — measured by
  // measure-slot-widths.mjs (T9, decision 65).
  "narrative.stacked-cards.badge": 820,
  "hook.hero-center.badge": 820,
  // One stat card's content box (three flex:1 cards in the 820 support band,
  // each with its own border+padding) — measured 200.
  "hook.hero-center.statCard": 200,
  "stat-reveal.hero-center.label": 820,
  "stat-reveal.hero-center.subtext": 820,
  "cta.hero-center.brand": 820,
  // The action stamp's border+padding lives OUTSIDE the gate, so the honest
  // available width is the safe band minus that decoration — measured 736.
  "cta.hero-center.action": 736,
  "quote.hero-center.quote": 820,
  "quote.hero-center.source": 820,
  "quote.hero-center.verified": 820,
  "context.hero-center.badge": 820,
  // Context hero card content box (820 band − card padding/border) — measured 744.
  "context.hero-center.title": 744,
  "context.hero-center.context": 744,
  "context.hero-center.detail": 744,
  "contrast.hero-center.title": 820,
  "contrast.hero-center.vs": 820,
  "contrast.hero-center.note": 820,
  // Contrast chips sit in a wrapping flex row inside their card; each chip's
  // gate may span the whole card content box — measured 768.
  "contrast.hero-center.left": 768,
  "contrast.hero-center.right": 768,
  "data.hero-center.stat": 820,
  "data.hero-center.label": 820,
  "data.hero-center.subtext": 820,
  "data.hero-center.source": 820,
  "info-card.hero-center.title": 820,
  "info-card.hero-center.subtitle": 820,
  // Info card content box (820 band − card padding/border) — measured 752.
  "info-card.hero-center.points": 752,
};

/** Layout the Remotion narrative template has always fallen back to. */
export const DEFAULT_NARRATIVE_LAYOUT = "media-bottom-bar";

/**
 * `HTML_SLOT_MAP`/`htmlSlotsFor()` were removed on 2026-09-02 with the
 * retired Playwright renderer (decision 59) — they had zero remaining
 * consumers in the live pipeline.
 *
 * Field classification for every Remotion template, by visualType + layout.
 *
 * Four categories per layout (spec decision 50):
 *   rendered            — always present; gated whenever it renders
 *   optional            — may be absent; gated whenever it renders
 *   control             — steer rendering (highlights, opt-outs), never gated
 *   intentionallyOmitted — the template deliberately does not render these
 *
 * Every rendered/optional field must carry a SLOT_FIELDS entry and a measured
 * width; the contract tests enforce both. This map is the single authority for
 * "which fields does a template know about" — anything else in a scene-data
 * texts block is a typo the render layer must reject (decision 51).
 */
export const REMOTION_SLOT_MAP = {
  narrative: {
    // `mediaOptOut` is deliberately absent from every texts list below: it is
    // a scene-level field (scene-rules, final-media-gate and the b-roll
    // orchestrator all read scene.mediaOptOut), not a text (decision 66).
    "media-bottom-bar": {
      rendered: ["company", "action", "result"],
      control: ["highlight"],
      optional: ["source"],
      intentionallyOmitted: [],
    },
    "media-overlay": {
      rendered: ["company", "action", "result"],
      control: ["highlight"],
      optional: ["context", "source", "badge"],
      intentionallyOmitted: [],
    },
    "media-split": {
      rendered: ["company", "action", "result"],
      control: ["highlight"],
      optional: ["context", "source"],
      intentionallyOmitted: [],
    },
    "stacked-cards": {
      // Cards read label/value from company+context and action+result.
      rendered: ["company", "context", "action", "result"],
      control: ["highlight"],
      optional: ["source", "badge"],
      intentionallyOmitted: [],
    },
  },
  hook: {
    "hero-center": {
      // Mutually exclusive variants: exactly one renders per scene, so none is
      // "always present" — all go to optional and each is gated when present.
      rendered: [],
      // `stats` is a structural container: each card gates whole as
      // statCard[i] (num+unit share a nowrap row and cannot gate apart).
      control: ["subjectLogo", "numberHighlight", "color", "stats"],
      optional: [
        "subject",
        "bigNumber",
        "numberLabel",
        "hookText",
        "revealText",
        "source",
        "badge",
        "statCard",
      ],
      intentionallyOmitted: [],
    },
  },
  "stat-reveal": {
    "hero-center": {
      rendered: ["bigNumber"],
      control: [],
      optional: ["label", "subtext", "source"],
      intentionallyOmitted: [],
    },
  },
  cta: {
    "hero-center": {
      rendered: ["brand", "tagline"],
      control: ["brandHighlight"],
      optional: ["action", "topic"],
      intentionallyOmitted: [],
    },
  },
  quote: {
    "hero-center": {
      rendered: ["quote"],
      control: [],
      optional: ["source", "verified"],
      intentionallyOmitted: [],
    },
  },
  context: {
    "hero-center": {
      rendered: ["title", "context"],
      control: ["titleHighlight"],
      optional: ["badge", "detail"],
      intentionallyOmitted: [],
    },
  },
  contrast: {
    "hero-center": {
      // left/right are string arrays; each entry gates as left[i] / right[i].
      rendered: ["title", "left", "right"],
      control: ["noteHighlight"],
      optional: ["vs", "note"],
      intentionallyOmitted: [],
    },
  },
  data: {
    "hero-center": {
      rendered: ["stat"],
      // `circle` toggles the animated annotation ring, not a text. The scene
      // field is spelled statLabel in scene-data; the contract field is
      // `label` (same typography family as stat-reveal's label).
      control: ["circle"],
      optional: ["label", "subtext", "source"],
      intentionallyOmitted: [],
    },
  },
  "info-card": {
    "hero-center": {
      rendered: ["title", "subtitle", "points"],
      control: [],
      optional: [],
      intentionallyOmitted: [],
    },
  },
  fullscreen: {
    media: {
      rendered: [],
      control: [],
      optional: ["source"],
      intentionallyOmitted: [],
    },
  },
};

/**
 * scene-data text keys that map to a differently spelled contract field.
 * DataScene's `statLabel` renders through the `label` slot (the large label
 * under a focus number), same typography family as stat-reveal's label.
 */
export const FIELD_ALIASES = {
  data: { statLabel: "label" },
};

/**
 * Reject text fields a template does not know about (spec decision 51).
 *
 * A typo'd field would otherwise be silently ignored — the template renders
 * the fields it knows and drops the rest, which is exactly how bad copy used
 * to ship. Unknown fields make the render fail with the field name and a
 * registration pointer; `getSlot` produces that error for fields missing from
 * SLOT_FIELDS, the fallback throw covers fields that exist but were never
 * declared for this template.
 *
 * @param {string} visualType
 * @param {string} layout
 * @param {Record<string, unknown>} [texts]
 */
export function assertKnownTextFields(visualType, layout, texts) {
  const groups = remotionSlotsFor(visualType, layout);
  const known = new Set([
    ...groups.rendered,
    ...groups.optional,
    ...groups.control,
    ...groups.intentionallyOmitted,
  ]);
  const aliases = FIELD_ALIASES[visualType] ?? {};
  const t = texts ?? {};
  // Rendered fields are contract-promised: the template draws them
  // unconditionally, so absent data would ship a hollow scene (T9, spec
  // audit of the T5 claim). Only ABSENCE fails — an empty string or empty
  // array present under its key stays a deliberate "render nothing" (#34).
  const missing = groups.rendered.filter((field) => {
    if (t[field] !== undefined && t[field] !== null) return false;
    return !Object.entries(aliases).some(
      ([key, aliased]) => aliased === field && t[key] !== undefined && t[key] !== null,
    );
  });
  if (missing.length > 0) {
    throw new Error(
      `Rendered text field(s) ${missing.map((f) => `"${f}"`).join(", ")} missing from ` +
        `scene-data texts for visualType "${visualType}" (layout "${layout}") — the ` +
        "template renders them unconditionally; add the data or move the field to optional",
    );
  }
  for (const key of Object.keys(t)) {
    const field = aliases[key] ?? key;
    if (known.has(field)) continue;
    // Throws "Unknown text field …" when the field is not registered at all.
    getSlot(slotId({ visualType, layout, field }));
    throw new Error(
      `Unknown text field "${key}" for visualType "${visualType}" (layout "${layout}") — ` +
        "declare it in REMOTION_SLOT_MAP or remove it from scene-data",
    );
  }
}

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
  const { field, visualType, layout, index } = parseSlotId(id);
  const fieldDefaults = SLOT_FIELDS[field];
  if (!fieldDefaults) {
    throw new Error(
      `Unknown text field "${field}" (slot ${id}) — add it to SLOT_FIELDS before rendering it`,
    );
  }

  // Indexed slots (left[0], points[2], …) share their base field's width:
  // every entry of a repeated field renders in the same container.
  let maxWidth = MEASURED_MAX_WIDTH[id];
  if (!maxWidth && index !== undefined) {
    maxWidth = MEASURED_MAX_WIDTH[`${visualType}.${layout}.${field}`];
  }
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
 * T12 keeps this lattice as the fallback: remotion/src/components/
 * official-fit.ts may reorder it around an official layout-utils seed via
 * fitCandidatesFromSeed (same sizes, better probe order).
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
 * Field classification of a Remotion template.
 *
 * With `layout` omitted, returns the whole layout map for the visualType.
 *
 * @param {string} visualType
 * @param {string} [layout]
 * @returns {Record<string, string[]> | Record<string, Record<string, string[]>>}
 */
export function remotionSlotsFor(visualType, layout) {
  const layouts = REMOTION_SLOT_MAP[visualType];
  if (!layouts) {
    throw new Error(
      `No Remotion slot mapping for visualType "${visualType}" — declare it in ` +
        "REMOTION_SLOT_MAP so the contract covers every field the template renders",
    );
  }
  if (layout !== undefined) {
    const groups = layouts[layout];
    if (!groups) {
      throw new Error(
        `No Remotion slot mapping for layout "${layout}" of visualType "${visualType}" — ` +
          "declare it in REMOTION_SLOT_MAP",
      );
    }
    return groups;
  }
  return layouts;
}

/** Canvas and safe-zone frame the contract measures against. */
export const SLOT_FRAME = {
  canvas: CANVAS,
  safeZones: SAFE_ZONES,
};
