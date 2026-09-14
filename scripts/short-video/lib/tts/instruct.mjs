/**
 * TTS instruct standard — the single source of truth (#270).
 *
 * ## Why this module exists
 *
 * #234 fixed the Indian-accent regression with a four-dimensional instruct
 * standard (Persona + Accent + Emotion + Pacing), but only at ONE call site:
 * the production adapter's `INSTRUCT_MAP`. Two days later the #257 Spark-TTS
 * experiment hand-wrote its own reference manifest, fell back to the pre-#234
 * wording (no persona, no "standard American English", no `<|endofprompt|>`),
 * and reproduced the accent regression on a brand-new generation path. The fix
 * was call-site-scoped, not mechanism-scoped.
 *
 * This module makes it mechanism-scoped. Every engine resolves its instruct
 * from the table below, and a hand-written instruct that does not meet the
 * standard is refused instead of being shipped to a GPU.
 *
 * ## Where each guard lives, and why there
 *
 * 1. **Prevent** — `resolveInstructForScene()` is the only producer of instruct
 *    text. An unknown style throws; a non-compliant explicit override throws.
 *    Both fail BEFORE a manifest reaches remote GPU time, which is the cheap
 *    end of the pipeline.
 * 2. **Detect early** — the pre-render gate (`lib/scene-rules.mjs` →
 *    `checkInstructCoverage`) fails the run when a scene's style has no entry,
 *    so a visualType added to the Remotion dispatch table cannot silently
 *    degrade to "no instruct" (the exact #273 P1.3 failure).
 * 3. **Detect late** — the Quality Gate re-validates whatever the engine
 *    actually resolved (`evaluateSceneTts({ instructForScene })`) and warns.
 *    It deliberately does not block: at gate time the take already exists, and
 *    re-classifying a configuration error as an acoustic failure would spend
 *    the #271 reroll budget on a take whose *instruct* is the problem and then
 *    misname the family in the hard-block message.
 *
 * ## The standard (#234, `docs/tts-indian-accent-handoff.md`)
 *
 * Every entry keeps the system prefix and gives POSITIVE accent guidance —
 * negative prompting ("avoid Indian accent") is documented to backfire (latent
 * pink-elephant effect) and is refused by the validator.
 *
 * `format` is an engine-family concern, not a content concern:
 *   - PyTorch/CUDA and NPU (`inference_instruct2`) require the
 *     `<|endofprompt|>` suffix;
 *   - MLX auto-appends it, so the same text must be sent WITHOUT the suffix.
 * The two formats therefore share one table and differ only in the suffix.
 *
 * @module tts/instruct
 */

/** How the selected engine family expects the instruct string to be terminated. */
export const INSTRUCT_FORMAT = Object.freeze({
  /** CosyVoice3 `inference_instruct2` (Kaggle CUDA, Modal CUDA, Ascend NPU). */
  PYTORCH: "pytorch",
  /** CosyVoice3-MLX — the runtime appends the terminator itself. */
  MLX: "mlx",
});

/** Terminator the PyTorch-format engines require. */
export const PYTORCH_SUFFIX = "<|endofprompt|>";

const FORMATS = new Set(Object.values(INSTRUCT_FORMAT));

/**
 * Clauses shared by several styles, hoisted so they cannot drift apart
 * (stat-reveal = data, quote/context = narrative, per the #234 table).
 */
const STYLE_SPECS = Object.freeze({
  narrator: Object.freeze({
    persona: "You are a tech documentary narrator.",
    emotion: "with a calm, engaging, and professional tone",
    pacing: "at a steady pace.",
  }),
  analyst: Object.freeze({
    persona: "You are a tech analyst.",
    emotion: "with an authoritative, precise, and clear tone,",
    pacing: "emphasizing key metrics.",
  }),
});

/**
 * The instruct standard: one language block, one entry per style.
 *
 * `styles` is keyed by `visualType` (which doubles as `refStyle` for the styles
 * that have one). Adding a `visualType` to the Remotion dispatch table without
 * adding it here fails the pre-render gate and throws at manifest build time.
 */
export const INSTRUCT_STANDARD = Object.freeze({
  language: "en",
  /** Mandatory system prefix — without it instruct words leak into the text. */
  systemPrefix: "You are a helpful assistant.",
  /** Positive accent guidance — the clause that suppressed the #234 regression. */
  accent: "Speak in standard American English",
  styles: Object.freeze({
    // #244 (2026-09-13 HITL): anchor instruct won three A/B rounds — a
    // confident/dynamic read beat "energetic, clear, confident", and the old
    // "shocked" variant is banned (accent). Validated against
    // output/_hook_ab_test2 scene-303 / _hook_ab_test3 rounds.
    hook: Object.freeze({
      emotion: "with a confident, dynamic, and clear tone,",
      pacing: "as if breaking major tech news.",
    }),
    narrative: Object.freeze({ ...STYLE_SPECS.narrator }),
    data: Object.freeze({ ...STYLE_SPECS.analyst }),
    cta: Object.freeze({
      persona: "You are a warm and engaging host.",
      emotion: "with an enthusiastic, persuasive, and welcoming tone.",
    }),
    contrast: Object.freeze({
      persona: "You are a tech commentator.",
      emotion: "with a pointed, thought-provoking tone that highlights tension between two sides.",
    }),
    "info-card": Object.freeze({
      persona: "You are a tech educator.",
      emotion: "with a clear, structured, and explanatory tone,",
      pacing: "breaking down concepts step by step.",
    }),
    "stat-reveal": Object.freeze({ ...STYLE_SPECS.analyst }),
    quote: Object.freeze({ ...STYLE_SPECS.narrator }),
    context: Object.freeze({ ...STYLE_SPECS.narrator }),
  }),
});

/** Styles that have a standard instruct entry — the coverage contract. */
export const SUPPORTED_INSTRUCT_STYLES = Object.freeze(Object.keys(INSTRUCT_STANDARD.styles));

/**
 * Negative accent prompting is a documented anti-pattern (#234): naming the
 * accent to avoid activates it in the model's latent space.
 */
const NEGATIVE_ACCENT_PATTERN = /\b(?:avoid|avoiding|without|no|not|don't|do not)\b[^.]*\baccent/i;

/** Emotion clause shape: "with a/an … tone" (the #234 Emotion dimension). */
const EMOTION_PATTERN = /\bwith\s+(?:a|an)\b[^.]*\btone\b/i;

/**
 * @param {string} style
 * @param {object} [standard]
 * @returns {boolean} whether the style has a standard entry
 */
export function hasInstructStyle(style, standard = INSTRUCT_STANDARD) {
  return Boolean(style) && Object.prototype.hasOwnProperty.call(standard.styles, style);
}

/** Strip any engine terminator and surrounding whitespace. @param {string} text */
export function stripInstructSuffix(text) {
  return String(text ?? "")
    .replace(/<\|endofprompt\|>\s*$/g, "")
    .trim();
}

/**
 * Terminate the text the way the target engine family expects.
 *
 * @param {string} text
 * @param {string} format - INSTRUCT_FORMAT value
 * @returns {string}
 */
export function applyInstructFormat(text, format) {
  if (!FORMATS.has(format)) {
    throw new Error(
      `Unknown instruct format "${format}" — expected one of: ${[...FORMATS].join(", ")}.`,
    );
  }
  const body = stripInstructSuffix(text);
  return format === INSTRUCT_FORMAT.MLX ? body : `${body}${PYTORCH_SUFFIX}`;
}

/**
 * Build the standard instruct for a style.
 *
 * @param {string} style - visualType / refStyle
 * @param {object} [opts]
 * @param {string} [opts.format] - INSTRUCT_FORMAT value (default PYTORCH)
 * @param {typeof INSTRUCT_STANDARD} [opts.standard]
 * @returns {string} instruct text in the requested engine format
 * @throws {Error} when the style has no standard entry — fail before any GPU
 *   push rather than letting a manifest reach the kernel with no instruct
 *   (which is how #273's missing contrast/info-card entries surfaced).
 */
export function buildInstruct(
  style,
  { format = INSTRUCT_FORMAT.PYTORCH, standard = INSTRUCT_STANDARD } = {},
) {
  const spec = standard.styles?.[style];
  if (!spec) {
    throw new Error(
      `No TTS instruct for style "${style}" (#270). The instruct standard is the single ` +
        `source in scripts/short-video/lib/tts/instruct.mjs — add a "${style}" entry there ` +
        `(Persona + Accent + Emotion + Pacing) instead of hand-writing instruct text at the ` +
        `call site. Known styles: ${Object.keys(standard.styles ?? {}).join(", ")}.`,
    );
  }
  const parts = [standard.systemPrefix];
  if (spec.persona) parts.push(spec.persona);
  parts.push(standard.accent);
  let body = `${parts.join(" ")} ${spec.emotion}`;
  if (spec.pacing) body += ` ${spec.pacing}`;
  return applyInstructFormat(body, format);
}

/**
 * Validate an instruct string against the four-dimensional standard (#234).
 *
 * Hard issues block (they change what the model actually says or how it sounds);
 * soft issues are advisory (Persona is legitimately absent for hook/cta).
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {typeof INSTRUCT_STANDARD} [opts.standard]
 * @returns {{ok: boolean, issues: Array<{code: string, severity: "hard"|"soft", detail: string, fix?: string}>, hardIssues: Array<object>, softIssues: Array<object>, dimensions: {systemPrefix: boolean, accent: boolean, persona: boolean, emotion: boolean, pacing: boolean}}}
 */
export function validateInstructSignature(text, { standard = INSTRUCT_STANDARD } = {}) {
  const body = stripInstructSuffix(text);
  const lower = body.toLowerCase();
  const withoutPrefix = lower.replace(standard.systemPrefix.toLowerCase(), "");
  const pacingMarkers = Object.values(standard.styles ?? {})
    .map((s) => s.pacing)
    .filter(Boolean)
    .map((p) => p.toLowerCase());

  const dimensions = {
    systemPrefix: lower.includes(standard.systemPrefix.toLowerCase()),
    accent: lower.includes(standard.accent.toLowerCase()),
    persona: /\byou are\b/i.test(withoutPrefix),
    emotion: EMOTION_PATTERN.test(body),
    pacing: pacingMarkers.some((marker) => lower.includes(marker)),
  };

  const issues = [];
  if (!dimensions.systemPrefix) {
    issues.push({
      code: "missing_system_prefix",
      severity: "hard",
      detail: `the "${standard.systemPrefix}" prefix is mandatory (#234) — without it instruct words are read as content`,
      fix: `prepend "${standard.systemPrefix}"`,
    });
  }
  if (!dimensions.accent) {
    issues.push({
      code: "missing_accent_guidance",
      severity: "hard",
      detail: `positive accent guidance ("${standard.accent}") is mandatory — it is the clause that suppressed the #234 Indian-accent regression`,
      fix: `add "${standard.accent}"`,
    });
  }
  if (!dimensions.emotion) {
    issues.push({
      code: "missing_emotion_intensity",
      severity: "hard",
      detail:
        "no emotion clause — the four-dimensional standard requires an explicit emotional intensity",
      fix: 'add an emotion clause, e.g. "with a calm, engaging, and professional tone"',
    });
  }
  if (NEGATIVE_ACCENT_PATTERN.test(body)) {
    issues.push({
      code: "negative_accent_prompting",
      severity: "hard",
      detail:
        "negative accent prompting backfires (latent pink-elephant effect, #234) — state the target accent positively",
      fix: `replace the negation with "${standard.accent}"`,
    });
  }
  if (!dimensions.persona) {
    issues.push({
      code: "missing_persona",
      severity: "soft",
      detail:
        "no persona clause — Persona is the weakest of the four dimensions and is legitimately absent for hook/cta",
    });
  }

  return {
    ok: !issues.some((i) => i.severity === "hard"),
    issues,
    hardIssues: issues.filter((i) => i.severity === "hard"),
    softIssues: issues.filter((i) => i.severity === "soft"),
    dimensions,
  };
}

/**
 * Normalize an explicit `scene.instruct` override into the engine format.
 *
 * This is the only remaining hand-written path into a TTS manifest, so it is
 * validated here: a non-compliant override throws instead of quietly producing
 * the pre-#234 read (#257 reproduced exactly that).
 *
 * @param {string} text
 * @param {object} [opts]
 * @returns {string}
 * @throws {Error} when the override fails the standard
 */
export function normalizeExplicitInstruct(
  text,
  { format = INSTRUCT_FORMAT.PYTORCH, standard = INSTRUCT_STANDARD } = {},
) {
  const report = validateInstructSignature(text, { standard });
  if (!report.ok) {
    throw new Error(
      `TTS instruct override rejected (#270): ${report.hardIssues.map((i) => i.code).join(", ")}. ` +
        `Hand-written instruct text must not reach a TTS manifest — declare the style in ` +
        `scripts/short-video/lib/tts/instruct.mjs (INSTRUCT_STANDARD) instead, or fix the ` +
        `override. Details: ${report.hardIssues.map((i) => `${i.code} (${i.detail})`).join("; ")}. ` +
        `See docs/tts-indian-accent-handoff.md.`,
    );
  }
  return applyInstructFormat(text, format);
}

/**
 * Resolve the instruct for one scene.
 *
 * Precedence: explicit `scene.instruct` (validated) > `refStyle`/`visualType`
 * standard entry > no instruct (engines without an instruct concept, or scenes
 * with no style at all — plain clone).
 *
 * @param {{visualType?: string, refStyle?: string, instruct?: string}} scene
 * @param {object} [opts]
 * @param {string} [opts.format]
 * @param {typeof INSTRUCT_STANDARD} [opts.standard]
 * @returns {string|undefined}
 */
export function resolveInstructForScene(
  scene,
  { format = INSTRUCT_FORMAT.PYTORCH, standard = INSTRUCT_STANDARD } = {},
) {
  const override = typeof scene?.instruct === "string" ? scene.instruct.trim() : "";
  if (override) return normalizeExplicitInstruct(override, { format, standard });

  const style = scene?.refStyle || scene?.visualType;
  if (!style) return undefined;
  return buildInstruct(style, { format, standard });
}

/**
 * Bind one engine family's format into a resolver — the per-engine seam
 * (`engine.instructForScene`, also used as the #244 cache-key input).
 *
 * @param {object} [opts]
 * @param {string} [opts.format]
 * @param {typeof INSTRUCT_STANDARD} [opts.standard]
 * @returns {(scene: object) => string|undefined}
 */
export function createInstructResolver({
  format = INSTRUCT_FORMAT.PYTORCH,
  standard = INSTRUCT_STANDARD,
} = {}) {
  return (scene) => resolveInstructForScene(scene, { format, standard });
}
