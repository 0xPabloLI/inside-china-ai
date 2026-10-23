/**
 * Text slot contract — single source of truth for dynamic text layout.
 *
 * Three consumers read this module, and they must never disagree:
 *   - Remotion scene components (what size to render / shrink to)
 *   - the content-hint character budget
 *   - the verifier (what to assert the DOM against)
 *
 * (A fourth consumer, the HTML scene templates of the retired Playwright
 * path, was removed on 2026-09-01; the archive itself was deleted on
 * 2026-09-20 — see git history.)
 *
 * Before this module existed each of those hardcoded its own sizes, which is how
 * the same scene-data ended up rendering at 64px on one path and 80px on the
 * other, and how a clipped "THAT'S THE WHOLE POIN" passed every check.
 */
import { BRAND_FONT_STACK } from "./safe-zones.mjs";

/**
 * Per-field typography defaults.
 *
 * `shrinkPriority` decides who gives up size first when a slot's fields no
 * longer fit: lowest shrinks first, so body detail goes before the headline.
 *
 * Readability floors (#688, user decision 2026-10-23). Before this the
 * contract carried the templates' own first-draft sizes: most on-screen copy
 * rendered at 20-36px, i.e. 2-3% of the 1080px frame. Measured against the 26
 * shipped content packs (1080 real text instances), 62% sat below the
 * platform's must-read floor of 48px (~4.4% of frame width) and below this
 * repo's own brand-system type scale (Labels 22-28 / Body 28-40) — "too small"
 * was a contract property, not a shrink-ladder accident. The copy class now
 * starts at 48px and the metadata class (source / badge / attribution /
 * verified) at 40px. The floor rule is round(0.72 x preferred) (decision 46)
 * with FIVE standing exceptions the fields carry inline. Above the rule
 * (stricter): subject 64 -> 48 (rule 46), numberLabel 48 -> 36 (35), stat
 * 240 -> 180 (173). Below it (relaxed): revealText 80 -> 56 (58), bigNumber
 * 240 -> 150 (173, decision 72). Every other field satisfies the rule exactly.
 *
 * The lead class moved up with it where — and only where — the loop's
 * hierarchy-ratio rule (docs/conventions/visual-design-loop.md: adjacent
 * levels >= 1.25x) demands it: company 48 -> 60 (60 / 48 copy = 1.25), title
 * 48 -> 60, label 36 -> 60, result 56 -> 64, statCard 56 -> 64 (64 / 48
 * numberLabel = 1.33). Without these a title would sit at the SAME size as
 * its own body text. subject (64) and brand (72) were left alone: their
 * adjacent ratios already hold (badge 40 -> 64 = 1.6; brand 72 -> tagline
 * 48 = 1.5), and the hero band they share is the binding vertical constraint.
 * hero/giant anchors (hookText 78, revealText 80, bigNumber/stat 240) keep
 * their sizes; the template-derived floors on bigNumber (150, decision 72)
 * and stat (180) stand.
 *
 * Raising a preferredSize also tightens the writing budget: slotCharBudget()
 * divides the measured box width by it, so a 22 -> 48px move roughly halves
 * the chars a slot can hold. That is the intended trade — bigger type means
 * shorter copy — and the budget stays a warn-level hint; the render-time
 * TextGate remains the hard gate.
 */
export const SLOT_FIELDS = {
  // Narrative body fields
  result: { preferredSize: 64, minSize: 46, fontWeight: 900, shrinkPriority: 40 },
  company: { preferredSize: 60, minSize: 43, fontWeight: 900, shrinkPriority: 30 },
  action: { preferredSize: 48, minSize: 35, fontWeight: 700, shrinkPriority: 20 },
  context: { preferredSize: 48, minSize: 35, fontWeight: 600, shrinkPriority: 10 },
  source: {
    preferredSize: 40,
    minSize: 29,
    fontWeight: 600,
    shrinkPriority: 5,
    required: false,
    tier: "metadata",
  },

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
  quote: { preferredSize: 48, minSize: 35, fontWeight: 600, shrinkPriority: 35 },
  title: { preferredSize: 60, minSize: 43, fontWeight: 900, shrinkPriority: 35 },
  attribution: {
    preferredSize: 40,
    minSize: 29,
    fontWeight: 700,
    shrinkPriority: 10,
    tier: "metadata",
  },
  tagline: { preferredSize: 48, minSize: 35, fontWeight: 600, shrinkPriority: 15 },
  topic: { preferredSize: 48, minSize: 35, fontWeight: 700, shrinkPriority: 15 },
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
  // contract. Preferred sizes were the templates' current sizes at T5 and are
  // the copy/metadata readability floors as of #688; floors follow the
  // round(0.72 × preferred) rule (spec decision 46).
  badge: { preferredSize: 40, minSize: 29, fontWeight: 900, shrinkPriority: 8, tier: "metadata" },
  brand: { preferredSize: 72, minSize: 52, fontWeight: 900, shrinkPriority: 38 },
  label: { preferredSize: 60, minSize: 43, fontWeight: 700, shrinkPriority: 25 },
  subtext: { preferredSize: 48, minSize: 35, fontWeight: 600, shrinkPriority: 12 },
  detail: { preferredSize: 48, minSize: 35, fontWeight: 600, shrinkPriority: 8 },
  subtitle: { preferredSize: 48, minSize: 35, fontWeight: 700, shrinkPriority: 12 },
  note: { preferredSize: 48, minSize: 35, fontWeight: 600, shrinkPriority: 10 },
  // Contrast chip columns; each entry gates as left[i] / right[i].
  left: { preferredSize: 48, minSize: 35, fontWeight: 700, shrinkPriority: 15 },
  right: { preferredSize: 48, minSize: 35, fontWeight: 700, shrinkPriority: 15 },
  vs: { preferredSize: 48, minSize: 35, fontWeight: 900, shrinkPriority: 8 },
  verified: {
    preferredSize: 40,
    minSize: 29,
    fontWeight: 700,
    shrinkPriority: 8,
    tier: "metadata",
  },
  points: { preferredSize: 48, minSize: 35, fontWeight: 700, shrinkPriority: 15 },
  // One hook stat card, gated WHOLE: num and unit share a nowrap row, so their
  // widths compete and cannot be gated independently. The gate injects the
  // card's number size; unit/label render at fixed ratios (0.5× / 0.5×).
  statCard: { preferredSize: 64, minSize: 46, fontWeight: 900, shrinkPriority: 40 },
};

/** Slot defaults applied to every field unless the field overrides them. */
const SLOT_DEFAULTS = {
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
  tier: "copy",
};

/**
 * Readability tiers (#688) — the floor a field's preferredSize must clear.
 *
 * `copy` is the default: everything a viewer must actually read. `metadata` is
 * for text that is context rather than message. The tier lives on the contract
 * (not in a test list) so adding a field forces its author to pick a floor, and
 * omitting the tier fails safe to the stricter one.
 */
export const READABILITY_TIERS = { copy: 48, metadata: 40 };

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
  "hook.hero-center.subtitle": 820,
  "hook.hero-center.subtitleHighlight": 820,
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

/**
 * Measured group budgets: the vertical content-box height a multi-field band
 * may occupy before the group gate starts shrinking fields (T9, decision 68).
 *
 * Like the widths above these are constraints the surroundings grant, not the
 * content's own height — keyed by the group id the template puts on its
 * `data-text-group` band. Current calibration (media-overlay, safe zone
 * y ∈ [220, 1150]):
 *   - bottom band 336 — the pipeline's established bottom-band budget, the
 *     same text-bar height media-bottom-bar anchors at y=1150;
 *   - top band 594 — from the safe-zone top (220) down to the bottom band's
 *     highest possible top edge (1150 − 336 = 814), so the two overlay bands
 *     can never overlap.
 */
const MEASURED_MAX_HEIGHT = {
  "narrative.media-overlay.top-band": 594,
  "narrative.media-overlay.bottom-band": 336,
};

/**
 * Hook subject row geometry (#422).
 *
 * `texts.subjectLogo` renders a logo in the SAME flex row as the subject gate,
 * so the row's budget is shared: the logo's box and the row gap are already
 * spent before the text starts. The slot contract measures the BAND (820); the
 * text may only use what is left.
 *
 * Sizes are the row's current design (brand-system.md's logo ≥120px target is
 * a #291 redesign question, not this fix's scope).
 */
export const HOOK_SUBJECT_ROW = { logoSize: 96, gap: 24 };

/**
 * Content-box width the hook subject text actually has to render into.
 *
 * Single source for the scene component and the contract test — the component
 * must not re-derive the subtraction, or the two drift and the row overflows
 * the band again (which is exactly what cancelled the render in #422).
 *
 * @param {{hasLogo?: boolean}} [opts]
 * @returns {number}
 */
export function hookSubjectTextWidth({ hasLogo = false } = {}) {
  const band = MEASURED_MAX_WIDTH["hook.hero-center.subject"];
  if (!band) {
    throw new Error(
      "hook.hero-center.subject has no measured width — measure the band before deriving the logo row",
    );
  }
  return hasLogo ? band - HOOK_SUBJECT_ROW.logoSize - HOOK_SUBJECT_ROW.gap : band;
}

/**
 * Resolve a band's group contract. Throws rather than guessing, exactly like
 * `getSlot` does for unmeasured widths.
 *
 * @param {string} groupId
 * @param {{maxHeight?: number}} [overrides] fixture-only budget override
 * @returns {{groupId: string, maxHeight: number}}
 */
export function getGroup(groupId, overrides = {}) {
  const maxHeight = overrides.maxHeight ?? MEASURED_MAX_HEIGHT[groupId];
  if (maxHeight === undefined) {
    throw new Error(
      `Group ${groupId} has no measured maxHeight — measure the band's vertical ` +
        "budget and add it to MEASURED_MAX_HEIGHT (do not derive it from padding maths)",
    );
  }
  return { groupId, maxHeight };
}

/** Layout the Remotion narrative template has always fallen back to. */
export const DEFAULT_NARRATIVE_LAYOUT = "media-bottom-bar";

/**
 * The layout the render layer actually uses for `scene` — the resolution
 * ShortVideo.tsx's renderScene performs before assertKnownTextFields.
 *
 * Narrative is the only type that consumes scene.layout; fullscreen always
 * renders "media"; every other template renders "hero-center" regardless of
 * what scene-data says. Contract validation (preflight and render) must
 * resolve through this function so both sides judge the same contract (#190).
 *
 * @param {{visualType: string, layout?: string}} scene
 * @returns {string}
 */
export function resolveRenderLayout(scene) {
  if (scene.visualType === "narrative") {
    return scene.layout ?? DEFAULT_NARRATIVE_LAYOUT;
  }
  if (scene.visualType === "fullscreen") return "media";
  return "hero-center";
}

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
      // `highlight` (T8) is structured — { field, text } — and only annotates
      // a fragment of hookText when its field targets that claim.
      control: ["subjectLogo", "numberHighlight", "color", "stats", "highlight"],
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
const FIELD_ALIASES = {
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
  // T8: `highlight` is structured — { field, text }. The renderer splits the
  // named field's copy around `text` and annotates ONLY that fragment; a
  // fragment that is not a substring of the field would silently render no
  // annotation (the old world wrapped the WHOLE field instead), so the render
  // fails with the offending data. The target field must itself be a known
  // string text — unknown names are caught by the key loop above, arrays
  // (stats/left/…) are not annotatable.
  const h = t.highlight;
  if (h !== undefined && h !== null) {
    if (
      typeof h !== "object" ||
      Array.isArray(h) ||
      typeof h.field !== "string" ||
      h.field === "" ||
      typeof h.text !== "string" ||
      h.text === ""
    ) {
      throw new Error(
        `highlight must be { field, text } — the texts field holding the copy and the ` +
          `exact substring to annotate (visualType "${visualType}", layout "${layout}"); ` +
          `got ${JSON.stringify(h)}`,
      );
    }
    const target = t[h.field];
    if (typeof target !== "string") {
      throw new Error(
        `highlight.field "${h.field}" is not a string text in this scene's texts ` +
          `(visualType "${visualType}", layout "${layout}") — set it, or point the ` +
          "highlight at the field that carries the copy",
      );
    }
    if (!target.includes(h.text)) {
      throw new Error(
        `highlight.text ${JSON.stringify(h.text)} is not a substring of texts.${h.field} ` +
          `${JSON.stringify(target)} (visualType "${visualType}", layout "${layout}") — ` +
          "the fragment must appear in the field verbatim",
      );
    }
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

// Approximates the uppercase advance width of the serif fallback face
// (≈0.55em, wider than the sans design metrics). It only converts measured
// pixels into an advisory char count; being off does not create false
// security — the TextGate geometry layer still fails real overflow.
const AVG_UPPERCASE_EM = 0.55;

/**
 * Advisory character budget for a slot, derived from the slot contract
 * (MEASURED_MAX_WIDTH real content-box width ÷ SLOT_FIELDS preferredSize, per
 * spec decision 14/71). Single source for the content-hint budget in
 * scene-rules.mjs — do not rebuild the width/size arithmetic at call sites.
 *
 * Returns null when the slot has no measured width or the field declares no
 * preferredSize: callers must skip the field, never guess.
 *
 * @param {{visualType: string, layout?: string, field: string}} parts
 * @returns {number|null}
 */
export function slotCharBudget({ visualType, layout, field }) {
  const id = slotId({ visualType, layout, field });
  const maxWidth = MEASURED_MAX_WIDTH[id];
  if (!maxWidth) return null;
  const preferredSize = SLOT_FIELDS[field]?.preferredSize;
  if (!preferredSize) return null;
  return Math.floor(maxWidth / (preferredSize * AVG_UPPERCASE_EM));
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
