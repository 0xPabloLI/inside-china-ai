/**
 * Media-strategy vocabulary — the single literal source for the five per-scene
 * `mediaStrategy` values and their generating subsets.
 *
 * A leaf module on purpose: scene-rules owns the contract checks, the asset gap
 * ledger derives its "never buys stock" set, the B-roll orchestrator gates
 * Step 1.5 sourcing, and claim-keywords (#354) decides whether a scene derives
 * a claim — all four read the same values without an import cycle.
 */

export const MEDIA_STRATEGIES = [
  "asset",
  "b-roll",
  "asset-then-broll",
  "ai-image",
  "asset-then-ai-image",
];

// Strategies whose prompt targets a still image (T2I, #155). Their contract
// field is `aiImage.prompt` (6 dimensions = the video template minus
// CAMERA/MOTION); every other generating strategy reads `aiVideo.prompt`.
export const IMAGE_GENERATING_STRATEGIES = new Set(["ai-image", "asset-then-ai-image"]);

export const GENERATING_STRATEGIES = new Set([
  "b-roll",
  "asset-then-broll",
  ...IMAGE_GENERATING_STRATEGIES,
]);

/**
 * Strategies that never buy stock: the generating vocabulary minus the
 * `asset-then-*` ones, which try the library first. Derived from
 * {@link GENERATING_STRATEGIES}, so a new strategy lands on the correct side
 * without a second literal set to keep in sync.
 */
export const GENERATION_ONLY_STRATEGIES = new Set(
  [...GENERATING_STRATEGIES].filter((strategy) => !strategy.startsWith("asset-then-")),
);

/**
 * Step 1.5 sourcing rule: a scene that chose pure generation (b-roll or
 * ai-image) must not buy stock assets; `asset-then-*` strategies still source
 * first and only fall back to generation when sourcing left it without media.
 */
export function shouldSourceStock(scene) {
  return !GENERATION_ONLY_STRATEGIES.has(scene?.mediaStrategy ?? "asset");
}
