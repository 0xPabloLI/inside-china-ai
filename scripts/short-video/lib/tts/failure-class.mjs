/**
 * Quality-Gate failure families (#271) — the shared vocabulary the gate assigns
 * and the pipeline routes on.
 *
 * This is a leaf module on purpose: `quality-gate.mjs` pulls in the ASR stack,
 * `pacing.mjs` must stay dependency-free, and both the pacing ladder and the
 * registry need to compare against the same two strings. Hoisting the
 * vocabulary here gives all three one source of truth without making the
 * consumers load the gate.
 *
 * - `pacing`   — the take is phonetically clean but its measured WPM is out of
 *   band. Repair = native speed compensation (#252 loop). A reroll cannot help:
 *   it regenerates the same text at the same speed.
 * - `acoustic` — anything that questions the WORDS (truncation, missing
 *   tokens, low similarity, missing audio). Repair = reroll; once that budget
 *   is spent the take is fail-closed, never compensated (extra speed would only
 *   smear already-garbled speech).
 *
 * Which family a given issue list belongs to is decided by `classifyFailure` in
 * `quality-gate.mjs` — that module owns the issue texts.
 */
export const FAILURE_CLASS = Object.freeze({ PACING: "pacing", ACOUSTIC: "acoustic" });
