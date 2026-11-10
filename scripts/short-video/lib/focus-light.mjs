/**
 * Protagonist light — three tiers, one focus per frame, 8-frame extinguish
 * (#738).
 *
 * Source: anything2explainer `reference/composition-and-light.md` §2, read
 * through `docs/research/repo-survey-tracking.md` §C. The licence is PolyForm
 * Noncommercial 1.0.0 (commercial use needs a separate grant), so the RULES are
 * rewritten here and no code, template, font or sample frame is copied. Its
 * purple key colour is not adopted either: the tones are our own brand tokens
 * (amber / blue, plus red for the narrative "danger" register).
 *
 * The source's rule, and what it replaced in this repo:
 *
 *   主角必带光（图形双层柔光、大字 TEXT_GLOW + 硬投影、橙色指标数字专属发光）
 *   配角默认不发光
 *   一帧内重点 ≤1 处
 *   重点转移时前一处 8 帧灭灯
 *   光只有三层：白 bloom（结构线条常驻）< 柔光（主角常亮 + 当前重点）< 白闪（3–6 帧事件）
 *
 * Before this module every scene drew `<FrameGlow variant>` — a full-frame
 * border plus a 40px inset wash. That is ambient bloom with no subject: it has
 * no tiers, no budget and no transfer, so the frame's brightest coloured area
 * was the same in a close-up and in a wide shot. The wash is gone (the 3px
 * structure line stays) and the light now lands on the object the shot is
 * about.
 *
 * ## Where the light lives
 *
 * The light is a STYLE on the element itself — `textShadow` for text,
 * `boxShadow` for a card — not an extra positioned layer. (No template's
 * subject is a bare graphic today: the CTA logo rides inside the `brand` text
 * lockup and the hook's mark is supporting cast. When one is, it takes the same
 * path with `filter: drop-shadow()`, which is why `kind` exists at all.) Three
 * reasons, all of them structural rather than cosmetic:
 *
 * 1. It follows the object by construction. A glow div would need the object's
 *    box, and Remotion renders in Node with no layout pass: any measurement is
 *    either absent or a second source of truth.
 * 2. It cannot move anything. `textShadow` / `boxShadow` / ink overflow do not
 *    participate in layout, so the TextGate's fit contract (#688 / T5) sees the
 *    exact same boxes it saw before this ticket.
 * 3. The 8-frame extinguish is expressible: the shadow alpha is a per-frame
 *    number, so the light fades while the object stays fully opaque. Fading the
 *    element itself would dim the content — the opposite of the rule.
 *
 * ## Who is the protagonist
 *
 * HITL 2026-11-09 (#738 comment): the scene declares it explicitly. There is no
 * auto-detection from `focusAnalysis` / `protectedRegions` — those describe
 * where a crop should sit, not what the shot is about, and a VLM's idea of the
 * subject is not a design decision. `LIGHT_PLANS` below is that declaration,
 * one entry per template, next to `REMOTION_SLOT_MAP` (who draws which field).
 *
 * A template that renders mutually exclusive heroes (the hook's `bigNumber` OR
 * `hookText`) lists them in priority order; the first one the scene actually
 * declares is the protagonist. Exactly one light is ever applied because the
 * template itself only draws one — the order here mirrors the template's own
 * branch, and `checkFocusLight` reads the same order.
 *
 * ## What is verifiable
 *
 * `resolveLightTimeline()` is the single source both consumers read: the
 * renderer (`remotion/src/components/focus-light.tsx`) turns it into CSS per
 * frame, and `checkFocusLight()` (scene-rules.mjs) binds it to the content that
 * will actually render.
 *
 * The budget holds BY CONSTRUCTION, which is why there is no runtime branch
 * counting lights: a beat's window runs to the next beat's start, beats are
 * validated to be at least `transferOffFrames` apart and each target may carry
 * one beat, so at most one target is ever at `level 1` on any frame
 * (`maxConcurrent` names that rule for the gate and the docs). The outgoing
 * light then takes exactly `transferOffFrames` to reach its resting level, and
 * a flash is an integer 3–6 frames.
 *
 * There is no `remotion` import here, so the contract is testable in plain Node
 * (`__tests__/focus-light.test.mjs`) like `type-scale.mjs`.
 *
 * Scope boundary (#738): this module owns LIGHT only. Easing, camera and the
 * hold budget belong to #731; frame-level quantification of the whole picture
 * belongs to #735/#1212.
 */
import { FPS } from "./timeline.mjs";

/**
 * Tone → RGB. Mirrors `COLOR` in `remotion/src/tokens.ts`; the contract test
 * asserts the two agree, so a palette change cannot leave a stale copy here.
 *
 * @type {{amber: [number, number, number], blue: [number, number, number], red: [number, number, number]}}
 */
export const LIGHT_TONES = {
  amber: [245, 158, 11],
  blue: [77, 139, 255],
  red: [239, 68, 68],
};

/**
 * The three tiers, in layer order. Nothing else is allowed to glow.
 *
 * `bloom` is the structure line — the frame edge that is always on in every
 * scene. It is deliberately part of the tier table: the previous
 * `FrameGlow` wash was the same idea at the wrong altitude (a whole-frame
 * wash), and naming the tier is what keeps the next decorative glow from
 * being added "because the frame feels empty".
 *
 * `soft` has two levels: `focus` (the target of the current beat, full) and
 * `protagonist` (the shot's subject at rest, a fraction of focus). The ratio is
 * expressed as `level`, a 0–1 multiplier over `focus.alpha`, so the renderer
 * has one alpha to compute and the fade is a linear ramp between `1` and
 * `level`.
 *
 * `flash` is white and event-shaped: 3–6 frames at a beat, decaying within
 * that window. It is the only tier that is not tone-coloured.
 */
export const LIGHT_TIERS = {
  bloom: {
    /**
     * Structure-line border width, px (unchanged from the retired wash).
     *
     * The source calls this tier "白 bloom" because its own design is white
     * line-art on black. Ours is not: the frame line is brand chrome, and the
     * palette deviation is the same one that refuses its purple key colour.
     * What the tier MEANS — always on, no subject, the lowest of the three —
     * is what is copied, and `borderAlpha` is what keeps it lowest.
     */
    borderPx: 3,
    /** Border alpha per tone — visible in every shot, never an emphasis. */
    borderAlpha: 0.2,
  },
  soft: {
    focus: {
      /** Inner soft-light blur radius, px. */
      blurPx: 24,
      /** Outer soft-light blur radius, px. */
      farBlurPx: 80,
      /** Peak alpha at level 1 (inner). */
      alpha: 0.62,
      /** Outer halo alpha at level 1 — the second layer of 双层柔光. */
      farAlpha: 0.3,
      /** Hard drop shadow under the glyphs (大字硬投影), px / alpha. */
      hardShadow: { y: 4, blurPx: 12, alpha: 0.55 },
    },
    protagonist: {
      /**
       * Resting level = a fraction of `focus.alpha` (主角常亮，但不抢当前重点).
       * The blur radii are the focus tier's: the protagonist differs only in
       * how hard it glows, not in the shape of the glow — a second pair of
       * radii would be a second look, not a second tier.
       */
      level: 0.55,
    },
  },
  flash: {
    blurPx: 18,
    /** Flash is white; this is the peak alpha at the beat frame. */
    alpha: 0.9,
  },
};

/**
 * The budget. Every number here is a rule from the source, not a taste knob.
 */
export const FOCUS_LIGHT = {
  /** 一帧内重点光 ≤1 处. */
  maxConcurrent: 1,
  /** 重点转移时前一处 8 帧灭灯 (30fps). */
  transferOffFrames: 8,
  /** 白闪 3–6 帧事件 (inclusive). */
  flashFrames: { min: 3, max: 6 },
};

/**
 * Per-template light plans — the explicit protagonist declaration.
 *
 * `target` names are contract field names (`REMOTION_SLOT_MAP` /
 * `SLOT_FIELDS`), so the gate can ask whether the scene actually renders the
 * field it lights.
 *
 * `at` is the frame the element SETTLES — its entrance delay plus duration, not
 * the frame it starts moving. Two reasons: the focus light should land on
 * something the viewer can already read, and a white flash fired at 20%
 * entrance opacity is a flash nobody sees. The scene keeps its own entrance
 * timing; this table is the choreography of the light that follows it.
 *
 * Beats must be at least `transferOffFrames` apart so a light never starts
 * while the previous one is still going out. `flash` is the optional white
 * event at the beat frame; `tone` overrides the plan's colour for one target
 * (the CTA's amber ask inside a blue end card, the contrast's blue answer card
 * inside an amber frame) and `kind` overrides the CSS family for one target (a
 * card that takes the focus in a text plan).
 *
 * @type {Record<string, {protagonist: string[], tone: keyof typeof LIGHT_TONES, kind: "text"|"box", beats: Array<{target: string, at: number, flash?: number, kind?: "text"|"box", tone?: keyof typeof LIGHT_TONES}>}>}
 */
export const LIGHT_PLANS = {
  /** The hook's focal claim/number is the subject; the reveal is the event. */
  hook: {
    protagonist: ["bigNumber", "hookText"],
    tone: "amber",
    kind: "text",
    // revealText: stampIn 0.8s + 0.5s.
    beats: [{ target: "revealText", at: 1.3, flash: 5 }],
  },
  /** Data: the stat lands (flash), then the label takes the focus. */
  data: {
    protagonist: ["stat"],
    tone: "amber",
    kind: "text",
    // stat: stampIn 0.2 + 0.5; statLabel: slideUp 0.5 + 0.5.
    beats: [
      { target: "stat", at: 0.7, flash: 4 },
      { target: "statLabel", at: 1.0 },
    ],
  },
  /** Stat reveal: same grammar as data, slower (the number is a set piece). */
  "stat-reveal": {
    protagonist: ["bigNumber"],
    tone: "amber",
    kind: "text",
    // bigNumber: stampIn 0.2 + 0.6; label: slideUp 0.6 + 0.5.
    beats: [
      { target: "bigNumber", at: 0.8, flash: 4 },
      { target: "label", at: 1.1 },
    ],
  },
  /** Quote: the quotation is the subject, then the attribution lights. */
  quote: {
    protagonist: ["quote"],
    tone: "blue",
    kind: "text",
    // quote: slideUp 0.5 + 0.6; source: fadeIn 1.3 + 0.5.
    beats: [
      { target: "quote", at: 1.1, flash: 4 },
      { target: "source", at: 1.8 },
    ],
  },
  /** Context: the card title is the subject; the detail is copy, not a light. */
  context: {
    protagonist: ["title"],
    tone: "blue",
    kind: "text",
    // title: slideUp 0.4 + 0.5.
    beats: [{ target: "title", at: 0.9, flash: 4 }],
  },
  /** Info card: the points card is the object (box light), not any one bullet. */
  "info-card": {
    protagonist: ["points"],
    tone: "blue",
    kind: "box",
    // First bullet: staggerLines 0.5 + 0.4 — the card is already on screen, so
    // the light lands with the content that fills it.
    beats: [{ target: "points", at: 0.9 }],
  },
  /** Contrast: the framing claim lights, then the right-hand answer card. */
  contrast: {
    protagonist: ["title"],
    tone: "amber",
    kind: "text",
    // title: slideUp 0.2 + 0.5; the right card's last chip settles at 0.9 + 0.4.
    beats: [
      { target: "title", at: 0.7, flash: 4 },
      // The answer card is blue and glows blue — an amber halo on a blue card
      // reads as a colour mistake, not as emphasis.
      { target: "right", at: 1.3, kind: "box", tone: "blue" },
    ],
  },
  /** CTA: the brand is the subject; the action stamp is the ask. */
  cta: {
    protagonist: ["brand"],
    tone: "blue",
    kind: "text",
    // brand: scaleIn 0.3 + 0.6; action: stampIn 1.0 + 0.5.
    beats: [
      { target: "brand", at: 0.9, flash: 4 },
      // The ask is amber inside the blue end card, so its light is amber too.
      { target: "action", at: 1.5, tone: "amber" },
    ],
  },
  /**
   * Narrative: `result` is the payoff and the only field every layout draws.
   * The company line lights first, the result takes over — the same
   * company → action → result reading order the entrance delays already use.
   */
  narrative: {
    protagonist: ["result"],
    tone: "amber",
    kind: "text",
    // company: slideUpFromBottom 0.2 + 0.5; result: stampIn 0.6 + 0.5.
    beats: [
      { target: "company", at: 0.7 },
      { target: "result", at: 1.1, flash: 4 },
    ],
  },
};

/**
 * The plan for a template, or null when the template draws no light (only the
 * fullscreen-media scene, which has no text frame to light).
 *
 * @param {string} visualType
 */
export function lightPlanFor(visualType) {
  return LIGHT_PLANS[visualType] ?? null;
}

/**
 * The CSS property family a target glows through: its own beat's `kind` when it
 * declares one, else the plan's. A template can mix them — a text headline and
 * a card that takes the focus later (contrast).
 *
 * @param {{kind: "text"|"box", beats: Array<{target: string, kind?: "text"|"box"}>}} plan
 * @param {string} target
 * @returns {"text"|"box"}
 */
export function lightKindFor(plan, target) {
  const beat = plan.beats?.find((entry) => entry.target === target);
  return beat?.kind ?? plan.kind;
}

/**
 * The colour a target glows in: its own beat's `tone` when it declares one,
 * else the plan's. A plan can mix tones — the CTA's amber ask inside a blue end
 * card would otherwise wear a blue halo.
 *
 * @param {{tone: keyof typeof LIGHT_TONES, beats: Array<{target: string, tone?: keyof typeof LIGHT_TONES}>}} plan
 * @param {string} target
 * @returns {keyof typeof LIGHT_TONES}
 */
export function lightToneFor(plan, target) {
  const beat = plan.beats?.find((entry) => entry.target === target);
  return beat?.tone ?? plan.tone;
}

/**
 * Seconds → frames, the same rounding `secToFrames()` uses. Kept local so the
 * module stays free of the remotion-facing helpers.
 *
 * @param {number} seconds
 * @param {number} fps
 */
function toFrame(seconds, fps) {
  return Math.round(seconds * fps);
}

/**
 * The light as CSS declarations for one target on one frame.
 *
 * `kind` picks the property: text glows through `textShadow` (so the light
 * follows the glyph outline, and the hard drop shadow stays legible over a
 * bright frame), a card through `boxShadow`. The flash is white and sits on top
 * of the tone.
 *
 * Alphas are rounded to 1/1000 so the declaration is stable frame to frame
 * (the same input always produces the same string — #734's determinism
 * contract compares rendered bytes).
 *
 * Returns `{}` when the target is dark, so an unlit element keeps exactly the
 * style it had before this ticket.
 *
 * @param {{tone: keyof typeof LIGHT_TONES, kind: "text"|"box"}} spec
 * @param {{level: number, flash: number}} state
 * @returns {{textShadow?: string, boxShadow?: string, filter?: string}}
 */
export function focusLightStyle(spec, state) {
  const { level, flash } = state;
  if (!(level > 0) && !(flash > 0)) return {};
  const [r, g, b] = LIGHT_TONES[spec.tone] ?? LIGHT_TONES.amber;
  const soft = LIGHT_TIERS.soft.focus;
  const layers = [];
  if (flash > 0) {
    layers.push(`0 0 ${LIGHT_TIERS.flash.blurPx}px rgba(255,255,255,${round3(flash)})`);
  }
  if (level > 0) {
    layers.push(`0 0 ${soft.blurPx}px rgba(${r},${g},${b},${round3(level * soft.alpha)})`);
    layers.push(`0 0 ${soft.farBlurPx}px rgba(${r},${g},${b},${round3(level * soft.farAlpha)})`);
  }
  if (spec.kind === "box") return { boxShadow: layers.join(", ") };
  // Text keeps a hard drop shadow under the glow: white copy over footage needs
  // the contrast, and the source's 大字 form asks for it explicitly.
  const hard = soft.hardShadow;
  layers.push(`0 ${hard.y}px ${hard.blurPx}px rgba(0,0,0,${hard.alpha})`);
  return { textShadow: layers.join(", ") };
}

/**
 * @param {number} value
 * @returns {number}
 */
function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Static validation of one plan. Returns human-readable errors; an empty array
 * means the plan obeys the budget.
 *
 * @param {{protagonist?: unknown, tone?: unknown, kind?: unknown, beats?: unknown}} plan
 * @param {{fps?: number, durationFrames?: number}} [opts]
 * @returns {string[]}
 */
export function validateLightPlan(plan, opts = {}) {
  const fps = opts.fps ?? FPS;
  const durationFrames = opts.durationFrames ?? null;
  const errors = [];
  if (!plan || typeof plan !== "object") return ["plan is not an object"];

  const protagonist = plan.protagonist;
  if (!Array.isArray(protagonist) || protagonist.length === 0) {
    errors.push("protagonist must be a non-empty array of contract field names");
  } else if (new Set(protagonist).size !== protagonist.length) {
    errors.push("protagonist candidates must be distinct");
  }
  if (!(plan.tone in LIGHT_TONES)) {
    errors.push(
      `tone "${String(plan.tone)}" is not one of ${Object.keys(LIGHT_TONES).join(" / ")}`,
    );
  }
  if (!["text", "box"].includes(plan.kind)) {
    errors.push(`kind "${String(plan.kind)}" must be text / box`);
  }

  const beats = plan.beats;
  if (!Array.isArray(beats)) return [...errors, "beats must be an array (empty is allowed)"];
  const seen = new Set();
  beats.forEach((beat, index) => {
    const where = `beat[${index}]`;
    if (!beat || typeof beat !== "object") {
      errors.push(`${where} is not an object`);
      return;
    }
    if (typeof beat.target !== "string" || beat.target === "") {
      errors.push(`${where}.target must be a contract field name`);
    } else if (seen.has(beat.target)) {
      errors.push(`${where}.target "${beat.target}" is lit twice — one beat per target`);
    } else {
      seen.add(beat.target);
    }
    if (!Number.isFinite(beat.at) || beat.at < 0) {
      errors.push(`${where}.at must be a finite number of seconds ≥ 0`);
    }
    if (beat.flash !== undefined) {
      const { min, max } = FOCUS_LIGHT.flashFrames;
      if (!Number.isInteger(beat.flash) || beat.flash < min || beat.flash > max) {
        errors.push(`${where}.flash must be an integer ${min}–${max} frames`);
      }
    }
    if (beat.kind !== undefined && !["text", "box"].includes(beat.kind)) {
      errors.push(`${where}.kind must be text / box when present`);
    }
    if (beat.tone !== undefined && !(beat.tone in LIGHT_TONES)) {
      errors.push(
        `${where}.tone must be one of ${Object.keys(LIGHT_TONES).join(" / ")} when present`,
      );
    }
    const previous = beats[index - 1];
    if (previous && Number.isFinite(previous.at) && Number.isFinite(beat.at)) {
      const gap = toFrame(beat.at, fps) - toFrame(previous.at, fps);
      if (gap < FOCUS_LIGHT.transferOffFrames) {
        errors.push(
          `${where} starts ${gap} frame(s) after beat[${index - 1}] — the outgoing light needs ` +
            `${FOCUS_LIGHT.transferOffFrames} frames to go out before the next one lights`,
        );
      }
    }
    if (Number.isFinite(beat.at) && durationFrames !== null) {
      const at = toFrame(beat.at, fps);
      if (at >= durationFrames) {
        errors.push(`${where}.at is frame ${at}, at or past the scene end (${durationFrames})`);
      }
    }
  });
  return errors;
}

/**
 * Resolve a plan into frames. Throws on a plan that breaks the ORDERING budget:
 * this runs inside the renderer, so a broken schedule must fail the render, not
 * silently ship.
 *
 * Beats at or past the scene end are DROPPED, not an error. A scene is as long
 * as its voiceover, so a short quote or a fast hook legitimately ends before the
 * template's later beats; blocking that render over a light that has nowhere to
 * land would trade a stylistic detail for a lost video. `validateLightPlan`
 * still reports those beats when a caller passes `durationFrames` explicitly
 * (the preflight gate does).
 *
 * Each beat keeps its full-lit window `[litFrom, litFrom + hold)`. `hold` runs
 * to the next beat's start (the next light takes over at its own frame), or to
 * the scene end for the last beat. The extinguish window follows the hold.
 *
 * @param {object} plan
 * @param {{fps?: number, durationFrames?: number}} [opts]
 */
export function resolveLightTimeline(plan, opts = {}) {
  const fps = opts.fps ?? FPS;
  const errors = validateLightPlan(plan, { fps });
  if (errors.length > 0) {
    throw new Error(`Invalid light plan:\n- ${errors.join("\n- ")}`);
  }
  const durationFrames = opts.durationFrames ?? Infinity;
  const inRange = plan.beats
    .map((beat) => ({ ...beat, litFrom: toFrame(beat.at, fps) }))
    .filter((beat) => beat.litFrom < durationFrames);
  return {
    plan,
    fps,
    durationFrames,
    beats: inRange.map((beat, index) => {
      const next = inRange[index + 1];
      const litTo = next ? next.litFrom : durationFrames;
      return { ...beat, hold: litTo - beat.litFrom };
    }),
  };
}

/**
 * The light state of one target on one frame.
 *
 * `level` is a 0–1 multiplier over the soft tier's `alpha`: 1 while the target
 * holds the focus, the protagonist's resting level when it is the subject at
 * rest, and a linear ramp between the two across `transferOffFrames`. Anything
 * else is 0 — 配角默认不发光.
 *
 * `flash` is the white event's alpha (0 when no flash is running). It decays
 * across the flash window, so a 3-frame flash is gone by its fourth frame.
 *
 * @param {ReturnType<typeof resolveLightTimeline>} timeline
 * @param {string} target
 * @param {number} frame
 * @returns {{level: number, flash: number}}
 */
export function lightStateAt(timeline, target, frame) {
  const resting = timeline.plan.protagonist.includes(target)
    ? LIGHT_TIERS.soft.protagonist.level
    : 0;
  const offFrames = FOCUS_LIGHT.transferOffFrames;

  for (const beat of timeline.beats) {
    if (beat.target !== target) continue;
    let level = resting;
    if (frame >= beat.litFrom && frame < beat.litFrom + beat.hold) {
      level = 1;
    } else if (frame >= beat.litFrom + beat.hold) {
      const elapsed = frame - (beat.litFrom + beat.hold);
      if (elapsed < offFrames) {
        // 灭灯: linear from full to the resting level across the window. The
        // transfer frame is the window's FIRST frame, not its last full one —
        // otherwise the outgoing light would still be at 1.0 on the frame the
        // next one lights, i.e. two full lights in one frame.
        level = 1 - (1 - resting) * ((elapsed + 1) / offFrames);
      }
    }
    let flash = 0;
    const flashFrames = beat.flash ?? 0;
    if (flashFrames > 0 && frame >= beat.litFrom && frame < beat.litFrom + flashFrames) {
      flash = LIGHT_TIERS.flash.alpha * (1 - (frame - beat.litFrom) / flashFrames);
    }
    return { level, flash };
  }
  return { level: resting, flash: 0 };
}
