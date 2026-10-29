/**
 * Media-strategy vocabulary — the single literal source for the per-scene
 * `mediaStrategy` overrides and their resolving plan.
 *
 * #355: the field stopped being a five-way manual choice. A scene that omits
 * it (or keeps the legacy default `"asset"`) follows ONE fallback chain:
 * source stock first, then generate. The generating form is decided by the
 * chain (T2I fast path by default, T2V when the scene declares a motion prompt
 * and the run's video budget allows it), not by the writer. The remaining
 * values are overrides:
 *
 *   asset / (absent)     default chain — source, then budgeted generation
 *   source-only          source stock only; never generate
 *   asset-then-broll     source first, fall back to a generated video
 *   asset-then-ai-image  source first, fall back to a generated image
 *   b-roll               skip sourcing, always generate a video
 *   ai-image             skip sourcing, always generate a still image
 *
 * A leaf module on purpose: scene-rules owns the contract checks, the asset gap
 * ledger derives its "never buys stock" set, the B-roll orchestrator gates
 * Step 1.5 sourcing, and claim-keywords (#354) decides whether a scene derives
 * a claim — all read the same values without an import cycle.
 */

export const MEDIA_STRATEGIES = [
  "asset",
  "source-only",
  "b-roll",
  "asset-then-broll",
  "ai-image",
  "asset-then-ai-image",
];

/** The absent-field value. Kept as an alias so old scene-data stays valid. */
export const DEFAULT_MEDIA_STRATEGY = "asset";

/** Strategies whose prompt targets a still image (T2I, #155). */
export const IMAGE_GENERATING_STRATEGIES = new Set(["ai-image", "asset-then-ai-image"]);

/** Strategies whose prompt targets a video clip (T2V). */
export const VIDEO_GENERATING_STRATEGIES = new Set(["b-roll", "asset-then-broll"]);

/** Explicit generation overrides only — the default chain is not a member. */
export const GENERATING_STRATEGIES = new Set([
  ...VIDEO_GENERATING_STRATEGIES,
  ...IMAGE_GENERATING_STRATEGIES,
]);

/**
 * Strategies that never buy stock: the explicit generating vocabulary minus
 * the `asset-then-*` ones, which try the library first. Derived from
 * {@link GENERATING_STRATEGIES}, so a new strategy lands on the correct side
 * without a second literal set to keep in sync.
 */
export const GENERATION_ONLY_STRATEGIES = new Set(
  [...GENERATING_STRATEGIES].filter((strategy) => !strategy.startsWith("asset-then-")),
);

/** Per-content automatic-generation caps (#355 D5). Explicit overrides are
 *  author-decided and not counted against these; they only bound the new
 *  implicit rung so a sourced-out package cannot burn GPU silently. */
export const DEFAULT_AUTO_SCENE_BUDGET = 4;
export const DEFAULT_AUTO_VIDEO_BUDGET = 1;

/**
 * The plan one scene's strategy resolves to.
 *
 * `generate`:
 *   "never"    — sourcing only (`source-only`)
 *   "always"   — explicit generation override
 *   "fallback" — source first; generate only when sourcing left no media
 *
 * `form`: "video" | "image" | "auto". "auto" means the chain selects by
 * budget and the scene's declared prompts (see selectAutoForm).
 */
export function resolveMediaPlan(scene) {
  const strategy = scene?.mediaStrategy ?? DEFAULT_MEDIA_STRATEGY;
  switch (strategy) {
    case "asset":
      return {
        strategy,
        kind: "chain",
        sourceStock: true,
        generate: "fallback",
        form: "auto",
        auto: true,
      };
    case "source-only":
      return {
        strategy,
        kind: "source-only",
        sourceStock: true,
        generate: "never",
        form: null,
        auto: false,
      };
    case "b-roll":
      return {
        strategy,
        kind: "always-generate",
        sourceStock: false,
        generate: "always",
        form: "video",
        auto: false,
      };
    case "ai-image":
      return {
        strategy,
        kind: "always-generate",
        sourceStock: false,
        generate: "always",
        form: "image",
        auto: false,
      };
    case "asset-then-broll":
      return {
        strategy,
        kind: "source-then-generate",
        sourceStock: true,
        generate: "fallback",
        form: "video",
        auto: false,
      };
    case "asset-then-ai-image":
      return {
        strategy,
        kind: "source-then-generate",
        sourceStock: true,
        generate: "fallback",
        form: "image",
        auto: false,
      };
    default:
      // Preflight fails unknown values; runtime stays source-first and lets the
      // chain pick a form rather than silently generating a video.
      return {
        strategy,
        kind: "unknown",
        sourceStock: true,
        generate: "fallback",
        form: "auto",
        auto: true,
        unknown: true,
      };
  }
}

/**
 * Step 1.5 sourcing rule: a scene that chose pure generation (b-roll or
 * ai-image) must not buy stock assets; every other strategy sources first and
 * only falls back to generation when sourcing left it without media.
 */
export function shouldSourceStock(scene) {
  return resolveMediaPlan(scene).sourceStock;
}

/** Whether the scene carries a declared motion prompt (T2V semantics). */
export function hasDeclaredVideoPrompt(scene) {
  return typeof scene?.aiVideo?.prompt === "string" && scene.aiVideo.prompt.trim() !== "";
}

/**
 * The prompt the chain would generate from, or null when the scene has none.
 *
 * Declared prompts win per form. The default chain may also derive a still
 * prompt from `assetNeed` (explicit or #354-derived) or the voiceover — that
 * is D2's "claim is the supply" applied to the generation rung. Explicit
 * overrides never derive: their contract still requires a declared prompt
 * (preflight fails a blank one).
 *
 * @param {object} scene
 * @param {"video"|"image"} form
 * @param {{allowDerived?: boolean}} [opts]
 * @returns {{prompt: string, source: string}|null}
 */
export function resolveGenerationPrompt(scene, form, opts = {}) {
  const allowDerived = opts.allowDerived === true;
  if (form === "video") {
    const declared = typeof scene?.aiVideo?.prompt === "string" ? scene.aiVideo.prompt : "";
    // Preserve the declared string verbatim: the report's cache migration
    // compares hashes of the author's exact prompt, so a trim here would make
    // a legacy winner look "changed" and regenerate it.
    return declared.trim() ? { prompt: declared, source: "aiVideo.prompt" } : null;
  }
  const declaredImage = typeof scene?.aiImage?.prompt === "string" ? scene.aiImage.prompt : "";
  if (declaredImage.trim()) return { prompt: declaredImage, source: "aiImage.prompt" };
  if (!allowDerived) return null;
  const assetNeed = typeof scene?.assetNeed === "string" ? scene.assetNeed.trim() : "";
  if (assetNeed) return { prompt: assetNeed, source: "assetNeed" };
  const voiceover = typeof scene?.voiceover === "string" ? scene.voiceover.trim() : "";
  if (voiceover) return { prompt: voiceover, source: "voiceover" };
  return null;
}

/**
 * The chain's generation-form picker (D1b): T2I + ken-burns is the fast path;
 * T2V only when the scene declares motion semantics (`aiVideo.prompt`) AND the
 * per-content video budget still has room. Anything else stays on the image
 * path, even if the video budget is exhausted.
 */
export function selectAutoForm(scene, videoBudgetRemaining = 0) {
  if (hasDeclaredVideoPrompt(scene) && videoBudgetRemaining > 0) return "video";
  return "image";
}
