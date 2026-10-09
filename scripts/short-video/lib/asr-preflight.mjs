/**
 * ASR Preflight — Step 0.3 hard gate (#418).
 *
 * The TTS quality gate word-verifies every take with whisper.cpp ASR and
 * fails closed as INFRA when the model is missing (#415 ①) — but that
 * judgement lands AFTER the TTS spend. Before this gate the missing model
 * only produced `console.warn` + a null transcript from `transcribeVideo`
 * (graceful degradation, by design for the standalone understanding tool),
 * so the pipeline burned a remote-GPU TTS batch before discovering the hole.
 *
 * Same judgement, moved to pipeline start: missing model → exit(1) with the
 * fix hint. The gate's explicit opt-outs are the gate's own escape hatches —
 * `TTS_QUALITY_ALLOW_NO_ASR=1` (render unverified) or
 * `TTS_SKIP_QUALITY_GATE=1` (no gate at all); both keep the pipeline running
 * with a warning, never silently.
 *
 * @module asr-preflight
 */

import { asrAvailability } from "./video-understand.mjs";

/**
 * Explicit opt-outs that make ASR unnecessary for this run.
 *
 * @returns {boolean}
 */
export function asrOptOut() {
  return (
    process.env.TTS_QUALITY_ALLOW_NO_ASR === "1" || process.env.TTS_SKIP_QUALITY_GATE === "1"
  );
}

/**
 * Ensure whisper.cpp ASR is installed, or terminate the pipeline.
 * Called from main.mjs right after the CDP gate — fail fast, never degrade.
 *
 * @param {object} [options]
 * @param {ReturnType<typeof asrAvailability>} [options.availability] - test seam
 * @param {Function} [options.exit] - test seam (default process.exit)
 * @param {boolean} [options.optOut] - test seam (default reads the env opt-outs)
 * @returns {{ok: boolean, optedOut?: boolean, exited?: boolean}}
 */
export function ensureAsrOrExit({
  availability = asrAvailability(),
  exit = process.exit,
  optOut = asrOptOut(),
} = {}) {
  if (availability.ok) {
    console.log(`✅ Step 0.3: ASR available (whisper.cpp + ${availability.model})`);
    return { ok: true };
  }

  const missing = [
    !availability.cliFound ? `cli ${availability.cli}` : null,
    !availability.modelFound ? `model ${availability.model}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  if (optOut) {
    console.warn(
      `⚠️  Step 0.3: ASR unavailable (${missing}) — proceeding unverified (explicit opt-out)`,
    );
    return { ok: false, optedOut: true };
  }

  console.error(`❌ Step 0.3: ASR unavailable (${missing})`);
  console.error(
    "   The TTS quality gate word-verifies every take with whisper.cpp ASR; without it the gate fails closed (#415 ①) — after the TTS spend. Failing at pipeline start instead.",
  );
  console.error(
    "   Fix: brew install whisper.cpp, then place ggml-large-v3-turbo.bin in ~/.cache/whisper/",
  );
  console.error("   Explicit opt-out (render unverified): TTS_QUALITY_ALLOW_NO_ASR=1");
  exit(1);
  return { ok: false, exited: true };
}
