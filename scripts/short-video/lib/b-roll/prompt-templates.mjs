/**
 * Per-family T2V prompt templates (#757) — template data plus a pure renderer.
 *
 * NOT wired into generation: no caller imports this module yet, and wiring is a
 * separate ticket (see docs/research/t2v-model-prompt-templates.md §5). The
 * module exists so the per-model contract (slot order, camera vocabulary, token
 * budget, negative capability) has a single executable source instead of prose.
 *
 * Ownership stays as in prompt-injection.mjs:
 * - BRAND / NEGATIVE are code-owned and never accepted here — the renderer
 *   rejects them by name so a caller cannot move that ownership by accident.
 * - The six declared dimensions (SUBJECT / VISUAL METAPHOR / REFERENCE /
 *   CAMERA / MOTION / LIGHTING) are agent-written clauses; this module only
 *   orders them per family.
 *
 * Sources: Alibaba Model Studio prompt guide, Volcano Engine Seedance prompt
 * guide. Both are recorded with tiers in the research note above.
 */
import { MAX_PROMPT_TOKENS, estimateTokens } from "./prompt-injection.mjs";

/** Agent-written dimensions the renderer accepts. */
export const PROMPT_SLOTS = Object.freeze([
  "subject",
  "visualMetaphor",
  "reference",
  "camera",
  "motion",
  "lighting",
]);

/** Dimensions prompt-injection.mjs owns — rejected by the renderer. */
const CODE_OWNED_SLOTS = Object.freeze(["brand", "negative"]);

// Official Wan camera phrasing. The guide documents short labels in its prompt
// dictionary, but every formula example uses the full "camera ..." sentence, so
// the template carries that form only.
const WAN_CAMERA_MOVEMENTS = Object.freeze([
  "camera pushes in",
  "camera pulls back",
  "camera moves left",
  "camera moves right",
  "camera moves up",
  "camera moves down",
  "camera tilts up",
  "camera tilts down",
  "camera pans left",
  "camera pans right",
  "camera orbits the subject",
  "camera follows the subject",
  "camera rotates 360 degrees",
  "fixed camera",
]);

/**
 * familyId → template. Only admitted families are listed: Wan2.2/Wan2.1 are the
 * two live generation tiers, Seedance is the only cloud candidate with its own
 * official prompt contract. HunyuanVideo 1.5 and CogVideoX were researched and
 * refused (license / staleness) — see the research note §2.3–§2.4 and §6.
 */
export const PROMPT_TEMPLATES = Object.freeze({
  "wan2.2": {
    id: "wan2.2",
    label: "Wan 2.2 TI2V-5B (FastVideo FastMetal-5B-QAD)",
    integration: "pipeline",
    modelTiers: ["fastmetal-5b"],
    promptLanguage: "en",
    promptFormula: "Entity + Scene + Motion + Aesthetic control + Stylization",
    // Entity → Scene → Motion → aesthetic control (lighting, then camera);
    // REFERENCE is a production note, not part of the official formula, so last.
    slotOrder: ["subject", "visualMetaphor", "motion", "lighting", "camera", "reference"],
    // The 5B driver pins 512 internally; the shared 480 budget is the
    // conservative gate both tiers use (prompt-injection.mjs derives it).
    maxPromptTokens: MAX_PROMPT_TOKENS,
    negativeMode: "prompt-clause",
    // Cloud Wan (2.1–2.6) also accepts a native parameter; the local MLX
    // driver does not, so the pipeline path stays on prompt clauses.
    negativeApiParam: "negative_prompt",
    cameraVocabulary: { movements: WAN_CAMERA_MOVEMENTS },
    source: "https://help.aliyun.com/en/model-studio/text-to-video-prompt",
  },
  "wan2.1": {
    id: "wan2.1",
    label: "Wan 2.1 T2V-1.3B (FastVideo FastMetal-1.3B-QAD)",
    integration: "pipeline",
    modelTiers: ["fastmetal-1.3b"],
    promptLanguage: "en",
    promptFormula: "Entity + Scene + Motion + Aesthetic control + Stylization",
    slotOrder: ["subject", "visualMetaphor", "motion", "lighting", "camera", "reference"],
    maxPromptTokens: MAX_PROMPT_TOKENS,
    negativeMode: "prompt-clause",
    negativeApiParam: "negative_prompt",
    cameraVocabulary: { movements: WAN_CAMERA_MOVEMENTS },
    source: "https://help.aliyun.com/en/model-studio/text-to-video-prompt",
  },
  seedance: {
    id: "seedance",
    label: "Seedance 1.0 pro (Volcano Engine, cloud API)",
    integration: "candidate",
    modelTiers: [],
    promptLanguage: "zh",
    promptFormula:
      "(camera language + lighting) + subject + subject motion + scene + (atmosphere) + (style)",
    // Official formula puts camera/lens language before the subject.
    slotOrder: ["camera", "lighting", "subject", "motion", "visualMetaphor", "reference"],
    // No local encoder; the commercial API owns its own truncation.
    maxPromptTokens: null,
    negativeMode: "none",
    negativeApiParam: null,
    cameraVocabulary: {
      movements: Object.freeze(["推", "拉", "摇", "移", "环绕", "跟随", "升", "降", "变焦"]),
      shotSizes: Object.freeze(["远景", "全景", "中景", "近景", "特写"]),
      viewpoints: Object.freeze([
        "水下镜头",
        "航拍镜头",
        "高机位俯拍",
        "低机位仰拍",
        "微距摄影",
        "以xx为前景的镜头",
      ]),
    },
    source: "https://www.volcengine.com/docs/82379/1631633",
  },
});

/**
 * Live generation tier → family, derived from each template's `modelTiers` so
 * the relation has one source (runner.mjs MODEL_TIERS stays the source of tier
 * IDs). Built at import time and checked for collisions: a tier claimed by two
 * families would otherwise collapse silently into the last one.
 */
export const MODEL_TIER_FAMILIES = (() => {
  const byTier = new Map();
  for (const template of Object.values(PROMPT_TEMPLATES)) {
    for (const tier of template.modelTiers) {
      if (byTier.has(tier)) {
        throw new Error(
          `Model tier "${tier}" is claimed by both "${byTier.get(tier)}" and "${template.id}"`,
        );
      }
      byTier.set(tier, template.id);
    }
  }
  return Object.freeze(Object.fromEntries(byTier));
})();

export function familyForModelTier(modelTier) {
  const familyId = MODEL_TIER_FAMILIES[modelTier];
  if (!familyId) {
    throw new Error(
      `Unknown model tier "${modelTier}" — known: ${Object.keys(MODEL_TIER_FAMILIES).join(", ")}`,
    );
  }
  return familyId;
}

export function getPromptTemplate(familyId) {
  const template = PROMPT_TEMPLATES[familyId];
  if (!template) {
    throw new Error(
      `Unknown T2V prompt family "${familyId}" — known: ${Object.keys(PROMPT_TEMPLATES).join(", ")}`,
    );
  }
  return template;
}

/**
 * Order the agent's dimension clauses for one family and return the prompt that
 * family expects. Pure: no IO, no scene mutation, no BRAND/NEGATIVE injection.
 * Empty / missing clauses are skipped; an all-empty input returns "" (same
 * contract as composePrompt — the caller owns "blank prompt" reporting).
 *
 * Throws instead of truncating when the rendered prompt exceeds the family's
 * token budget (Wan only; Seedance declares null).
 */
export function renderPromptForModel(parts, familyId) {
  const template = getPromptTemplate(familyId);
  const input = parts ?? {};

  for (const key of Object.keys(input)) {
    if (CODE_OWNED_SLOTS.includes(key)) {
      throw new Error(
        `"${key}" is code-owned by prompt-injection.mjs and must not be passed to renderPromptForModel`,
      );
    }
    if (!PROMPT_SLOTS.includes(key)) {
      throw new Error(`Unknown prompt slot "${key}" — accepted slots: ${PROMPT_SLOTS.join(", ")}`);
    }
  }

  const clauses = template.slotOrder
    .map((slot) => (typeof input[slot] === "string" ? input[slot].trim() : ""))
    .map((clause) => clause.replace(/[.\s]+$/, ""))
    .filter(Boolean);

  if (clauses.length === 0) return "";

  const prompt = clauses.join(", ");
  if (template.maxPromptTokens !== null) {
    const tokens = estimateTokens(prompt);
    if (tokens > template.maxPromptTokens) {
      throw new RangeError(
        `${familyId} prompt is ~${tokens} tokens, over the ${template.maxPromptTokens}-token budget — shorten the declared clauses instead of relying on tail truncation`,
      );
    }
  }
  return prompt;
}
