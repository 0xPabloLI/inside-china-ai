/**
 * Token-budget estimation for composed generation prompts (#166 constraint 2,
 * #155 image path).
 *
 * Split out of prompt-injection.mjs (#922) so prompt-templates.mjs can read the
 * budget without importing the injection layer — prompt-injection imports the
 * template renderer, so keeping the budget there would close a module cycle.
 * No behaviour lives here beyond the shared estimate and its two limits.
 */
import { MAX_SEQUENCE_LENGTH } from "./runner.mjs";

// The text encoder silently truncates at max_sequence_length (runner.mjs).
// Injection appends to the tail, which is exactly what truncation eats first —
// so the composed prompt gets a hard budget with headroom below the encoder
// limit, enforced before generation.
export const MAX_PROMPT_TOKENS = MAX_SEQUENCE_LENGTH - 32;

const CJK_CHAR_PATTERN = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;

/**
 * Conservative UMT5 token estimate. Each CJK ideograph/kana/hangul counts as
 * its own token (UMT5 ≈ 1 token per CJK character); the remainder assumes
 * ~1 token per two characters, floored by the word count. Over-estimates
 * English, never discounts CJK — the budget gate fails safe.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const cjkChars = (text.match(CJK_CHAR_PATTERN) ?? []).length;
  const rest = text.replace(CJK_CHAR_PATTERN, "");
  const words = rest.trim().split(/\s+/).filter(Boolean).length;
  return cjkChars + Math.max(words, Math.ceil(rest.length / 2));
}

/** True when `text` estimates above `limit` (default: the UMT5 budget). */
export function tokenBudgetExceeded(text, limit = MAX_PROMPT_TOKENS) {
  return estimateTokens(text) > limit;
}

/**
 * Raised by a budget gate. The b-roll stage maps only this error to a report
 * refusal — a plain RangeError from inside composition is a bug and must
 * surface instead of being misreported as an over-budget scene.
 */
export class PromptBudgetError extends RangeError {}

/** One message shape for every budget gate: label, estimate, overshoot, fix. */
export function budgetOvershootReason(label, tokens, limit, hint) {
  return `${label} is ~${tokens} tokens, ${tokens - limit} over the ${limit}-token budget — ${hint}`;
}

// ─── image budget (#155) ───

// Z-Image's text encoder is a Qwen3 LLM with a far larger native context than
// UMT5's 512, and mflux exposes no per-model sequence constant to pin — so
// the T2I path reuses the same conservative 480-token estimate. It over-
// estimates and fails safe on every current and future backend (a FLUX-family
// UMT5 backend truncates at exactly this limit, tail-first, where the injected
// constants live), and image prompts are short diagram descriptions anyway.
export const IMAGE_MAX_PROMPT_TOKENS = MAX_PROMPT_TOKENS;
