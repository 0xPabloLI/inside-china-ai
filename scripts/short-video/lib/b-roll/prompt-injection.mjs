/**
 * Constant injection for the fixed dimensions of the 8-dimension b-roll
 * prompt (#166 layer 2). docs/video-production-runbook.md → "The 8-dimension prompt".
 *
 * Ownership split:
 * - NEGATIVE — fully code-owned: semantic groups missing from the declared
 *   prompt are appended at generation time (word-boundary matched, never
 *   duplicated). The agent stops hand-writing them.
 * - BRAND — base palette and entity accent color are appended unless the
 *   agent already art-directed the scene (a background/palette declaration
 *   in the prompt wins — defaults, not overrides).
 * - CAMERA / MOTION / LIGHTING — advisory defaults per visualType, exported
 *   for the agent to copy. Never injected.
 * - SUBJECT / VISUAL METAPHOR / REFERENCE — pure creation, stays 100% agent.
 *
 * Gate separation: the VLM claim keeps using the declared prompt (raw), only
 * the generation jobs receive the composed string — a negative clause must
 * never leak into the gate's positive assetNeed.
 */
import { MAX_SEQUENCE_LENGTH } from "./runner.mjs";
import { NEGATIVE_GROUPS, coversNegativeGroup } from "../scene-rules.mjs";

// Bumped whenever the injected constants change shape: report entries record
// it so cache decisions can tell pre-injection winners from post-injection
// ones without regenerating them (see migrateLegacyEntry in orchestrator.mjs).
export const PROMPT_INJECTION_VERSION = 1;

// One canonical clause per NEGATIVE group (key order = NEGATIVE_GROUPS key
// order). The clause chosen for a group must satisfy that group's own
// coverage check.
export const NEGATIVE_CLAUSES = {
  TEXT: "no text",
  HANDS: "no hands",
  ARTIFACT: "no watermark",
};

export const NEGATIVE_CONSTANTS = Object.values(NEGATIVE_CLAUSES).join(", ");

// Fail at import time, not as a literal "undefined" inside a generation
// prompt: NEGATIVE_GROUPS is scene-rules' to extend (e.g. a future FACE
// group), and every new group needs a canonical clause here on the same day.
for (const group of Object.keys(NEGATIVE_GROUPS)) {
  if (!NEGATIVE_CLAUSES[group]) {
    throw new Error(
      `NEGATIVE_CLAUSES is missing a canonical clause for group "${group}" — ` +
        "extend it together with NEGATIVE_GROUPS in scene-rules.mjs",
    );
  }
}

export const BRAND_BASE_PROMPT =
  "dark #0a0a14 studio background, blue-cyan tech gradient lighting, high contrast";

// Mirror of docs/brand-system.md → "Entity Color Mapping" (single source of
// truth for the palette; this table is the generation-side projection).
export const ENTITY_COLORS = {
  deepseek: { label: "DeepSeek", color: "blue", hex: "#4d8bff" },
  huawei: { label: "Huawei", color: "red", hex: "#ef4444" },
  zhipu: { label: "Zhipu", color: "blue", hex: "#4d8bff" },
  baidu: { label: "Baidu", color: "blue", hex: "#4d8bff" },
  alibaba: { label: "Alibaba", color: "amber", hex: "#f59e0b" },
  tencent: { label: "Tencent", color: "green", hex: "#34d399" },
};

// Model names inherit their parent company's entity color (Qwen → Alibaba).
// Values are ENTITY_COLORS keys.
const ENTITY_ALIASES = {
  deepseek: "deepseek",
  huawei: "huawei",
  zhipu: "zhipu",
  glm: "zhipu",
  baidu: "baidu",
  ernie: "baidu",
  alibaba: "alibaba",
  qwen: "alibaba",
  tencent: "tencent",
  hunyuan: "tencent",
};

// No trailing \b: "Qwen3.7-Plus" must match, so the boundary sits at the
// start only. Leftmost mention wins (the earliest entity named is the
// subject); ties fall back to table order.
const ENTITY_PATTERN = new RegExp(`\\b(${Object.keys(ENTITY_ALIASES).join("|")})`, "i");

/**
 * Detect the scene's subject entity from title / voiceover / texts.
 * Returns the ENTITY_COLORS entry, or null when no known entity appears.
 * Heuristic: the leftmost mention wins — a comparison scene naming two
 * companies picks the first-named one, which is the subject in practice but
 * not guaranteed.
 */
export function detectEntityColor(scene) {
  const haystack = [scene?.title, scene?.voiceover, JSON.stringify(scene?.texts ?? {})]
    .filter((v) => typeof v === "string" && v !== "")
    .join(" ");
  if (!haystack) return null;
  const match = ENTITY_PATTERN.exec(haystack);
  if (!match) return null;
  return ENTITY_COLORS[ENTITY_ALIASES[match[1].toLowerCase()]] ?? null;
}

// The agent's own art direction wins: a prompt that already declares a
// background, palette or any color keeps the BRAND constants out. Skips are
// conservative — a metaphorical "dark future" also skips, leaving the agent
// in control rather than double-injecting.
const ART_DIRECTION_PATTERN =
  /\bdark\b|\bpalette\b|aesthetic|background|backdrop|gradient|#[0-9a-f]{6}|\b(?:blue|cyan|red|amber|green|purple|orange|pink|gold|white|gray|grey|monochrome)\b/i;

export function declaresOwnArtDirection(prompt) {
  return ART_DIRECTION_PATTERN.test(prompt);
}

/**
 * The declared prompt with every known NEGATIVE clause (and trailing
 * punctuation) removed — the fingerprint of everything the injection layer
 * owns. Two prompts that differ only in NEGATIVE clauses strip to the same
 * string, which is what legacy cache migration compares.
 */
export function stripNegativeClauses(prompt) {
  let out = prompt ?? "";
  for (const phrases of Object.values(NEGATIVE_GROUPS)) {
    for (const phrase of phrases) {
      out = out.replace(new RegExp(`,?\\s*\\b${phrase}\\b`, "gi"), "");
    }
  }
  return out.replace(/[.\s]+$/, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Advisory per-visualType defaults for the three semi-auto dimensions.
 * Suggestions for the agent — composeGenerationPrompt never injects them.
 */
export const VISUAL_TYPE_DIMENSION_DEFAULTS = {
  narrative: {
    camera: "slow cinematic dolly-in",
    motion: "continuous fluid motion with one clear directional flow",
    lighting: "dark studio, blue-cyan rim lighting on the subject",
  },
  "stat-reveal": {
    camera: "locked-off shot with a slow push-in on the reveal",
    motion: "one decisive growth moment, then hold",
    lighting: "dark background, warm key light on the focal element",
  },
  hook: {
    camera: "fast push-in from wide to close",
    motion: "a single bold movement that lands within the first second",
    lighting: "high contrast, amber accent glow on the focal element",
  },
  data: {
    camera: "slow lateral tracking along the data flow",
    motion: "steady directional flow, left to right",
    lighting: "dark background, cool blue-cyan glow on data elements",
  },
  comparison: {
    camera: "static symmetrical framing, then a slow zoom to the winner",
    motion: "two mirrored motions resolving into one",
    lighting: "even split lighting, one side per competitor color",
  },
  contrast: {
    camera: "whip-pan between the two sides",
    motion: "sharp alternating movement, big vs small",
    lighting: "split warm/cool to separate the two sides",
  },
  cta: {
    camera: "gentle pull-back to settle the frame",
    motion: "calm, looping ambience",
    lighting: "dark studio, brand blue-cyan gradient wash",
  },
};

export function dimensionDefaultsFor(visualType) {
  return VISUAL_TYPE_DIMENSION_DEFAULTS[visualType] ?? VISUAL_TYPE_DIMENSION_DEFAULTS.narrative;
}

function entityClause(entity) {
  return `protagonist element glowing in ${entity.label} brand ${entity.color} (${entity.hex})`;
}

/**
 * Compose the prompt that actually reaches the generator: declared prompt
 * first, then BRAND base, entity accent, and the missing NEGATIVE clauses —
 * in that order, comma-joined. Deterministic; never mutates the scene.
 * Returns "" for an empty declared prompt (the contract check owns
 * blank-prompt reporting; this module adds nothing to nothing).
 *
 * Shared by both generation surfaces (#155): video strategies compose from
 * `aiVideo.prompt`, image strategies from `aiImage.prompt` — same BRAND /
 * entity / NEGATIVE ownership, no CAMERA/MOTION involvement on either side
 * (those dimensions were always advisory-only, never injected).
 */
function composePrompt(declared, scene) {
  if (!declared) return "";
  const parts = [declared];

  if (!declaresOwnArtDirection(declared)) {
    parts.push(BRAND_BASE_PROMPT);
    const entity = detectEntityColor(scene);
    if (entity) parts.push(entityClause(entity));
  }

  const missing = Object.keys(NEGATIVE_GROUPS).filter(
    (group) => !coversNegativeGroup(declared, NEGATIVE_GROUPS[group]),
  );
  if (missing.length > 0) {
    parts.push(missing.map((group) => NEGATIVE_CLAUSES[group]).join(", "));
  }

  if (parts.length > 1) {
    // The declared prompt's full-stop would otherwise dangle mid-string
    // ("high detail., no text") — it only belongs at the very end.
    parts[0] = parts[0].replace(/[.\s]+$/, "");
  }

  return parts.join(", ");
}

export function composeGenerationPrompt(scene) {
  return composePrompt((scene?.aiVideo?.prompt ?? "").trim(), scene);
}

export function composeImagePrompt(scene) {
  return composePrompt((scene?.aiImage?.prompt ?? "").trim(), scene);
}

// ─── token budget (#166 constraint 2: no silent 512 truncation) ───

// The text encoder silently truncates at max_sequence_length (runner.mjs).
// Injection appends to the tail, which is exactly what truncation eats first —
// so the composed prompt gets a hard budget with headroom below the encoder
// limit, enforced before generation.
export const MAX_PROMPT_TOKENS = MAX_SEQUENCE_LENGTH - 32;

/**
 * Conservative UMT5 token estimate. Each CJK ideograph/kana/hangul counts as
 * its own token (UMT5 ≈ 1 token per CJK character); the remainder assumes
 * ~1 token per two characters, floored by the word count. Over-estimates
 * English, never discounts CJK — the budget gate fails safe.
 */
const CJK_CHAR_PATTERN = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;

export function estimateTokens(text) {
  if (!text) return 0;
  const cjkChars = (text.match(CJK_CHAR_PATTERN) ?? []).length;
  const rest = text.replace(CJK_CHAR_PATTERN, "");
  const words = rest.trim().split(/\s+/).filter(Boolean).length;
  return cjkChars + Math.max(words, Math.ceil(rest.length / 2));
}

export function tokenBudgetExceeded(text, limit = MAX_PROMPT_TOKENS) {
  return estimateTokens(text) > limit;
}

// ─── image budget (#155) ───

// Z-Image's text encoder is a Qwen3 LLM with a far larger native context than
// UMT5's 512, and mflux exposes no per-model sequence constant to pin — so
// the T2I path reuses the same conservative 480-token estimate. It over-
// estimates and fails safe on every current and future backend (a FLUX-family
// UMT5 backend truncates at exactly this limit, tail-first, where the injected
// constants live), and image prompts are short diagram descriptions anyway.
export const IMAGE_MAX_PROMPT_TOKENS = MAX_PROMPT_TOKENS;
