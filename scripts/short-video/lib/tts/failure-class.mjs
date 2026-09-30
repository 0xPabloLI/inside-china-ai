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
 * - `infra`    — the gate could not VERIFY the take (ASR unavailable: missing
 *   whisper-cli/ggml model, crashed transcriber). Repair = none: a reroll
 *   regenerates audio the same blind verifier still cannot check, so the run
 *   must stop and the operator fix the ASR leg (#415 ①). Explicitly opting out
 *   (`TTS_QUALITY_ALLOW_NO_ASR=1` / `allowAsrUnavailable`) downgrades the
 *   failure to a warning so an ASR-less machine can still render, unverified.
 *
 * Which family a given issue list belongs to is decided by `classifyFailure` in
 * `quality-gate.mjs` — that module owns the issue texts.
 */
export const FAILURE_CLASS = Object.freeze({
  PACING: "pacing",
  ACOUSTIC: "acoustic",
  INFRA: "infra",
});

/**
 * Split gate evaluations into the families the registry routes on (#415 ①).
 *
 * Lives here (not in quality-gate.mjs) so the registry can import it
 * statically: the gate module pulls in the ASR stack and is partially mocked
 * by tests, and routing must not depend on that mock surface.
 *
 * @param {Array<{passed: boolean, failureClass?: string|null}>} [evaluations]
 * @returns {{failed: Array, infra: Array, acoustic: Array, pacing: Array, unclassified: Array}}
 */
export function partitionGateFailures(evaluations) {
  const failed = (evaluations ?? []).filter((e) => !e.passed);
  const byClass = (cls) => failed.filter((e) => e.failureClass === cls);
  return {
    failed,
    infra: byClass(FAILURE_CLASS.INFRA),
    acoustic: byClass(FAILURE_CLASS.ACOUSTIC),
    pacing: byClass(FAILURE_CLASS.PACING),
    unclassified: failed.filter((e) => !e.failureClass),
  };
}

/**
 * Tag an error as fail-closed (#271). The gate catch in `registry.mjs` rethrows
 * marked errors regardless of strict mode — the non-strict "warn and continue"
 * path is reserved for failures that are not proven unshippable.
 * `TTS_SKIP_QUALITY_GATE=1` stays the explicit escape hatch.
 *
 * Lives here with the error builders so a new block error cannot be defined
 * without its marker: #415 ① shipped `infraBlockError` unmarked, and the
 * non-strict path quietly turned "the ASR leg never ran" into "render anyway".
 *
 * @param {Error} err
 * @param {string} code
 * @returns {Error}
 */
export function markFailClosed(err, code) {
  err.code = code;
  err.failClosed = true;
  return err;
}

/**
 * Fatal error for a run the gate could not verify (#415 ①). Not retryable: a
 * reroll regenerates audio the same blind verifier still cannot check.
 * Fail-closed by construction — the caller cannot forget the marker.
 *
 * @param {Array<{sceneId: number, issues?: string[]}>} infraFailed
 * @returns {Error}
 */
export function infraBlockError(infraFailed) {
  const scenes = (infraFailed ?? [])
    .map((f) => `Scene ${f.sceneId} (${(f.issues || []).join(", ")})`)
    .join("; ");
  return markFailClosed(
    new Error(
      `TTS Quality Gate could not verify the take(s): ${scenes}. ` +
        `The ASR leg (whisper.cpp + ggml model) is unavailable, so the word-level checks never ran. ` +
        `Fix the ASR infrastructure, or set TTS_QUALITY_ALLOW_NO_ASR=1 to render unverified.`,
    ),
    "TTS_INFRA_BLOCK",
  );
}
