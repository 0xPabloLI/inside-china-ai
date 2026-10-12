/**
 * Offline HF policy for the TTS/alignment spawns (#394).
 *
 * Pipeline runs are offline by default: huggingface_hub's etag check goes
 * through the system proxy and has hung for minutes on a dead connection
 * (qwen4-preview, 2026-08-29; runbook §F5-TTS-MLX). The default therefore
 * stays `HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1` — but the flags used to
 * be hardcoded into the shell command, so an operator who exported
 * `HF_HUB_OFFLINE=0` to fetch or upgrade a model got the opposite of what they
 * asked for (the 2026-09-27 incident: the missing vocos/wav2vec2 weights could
 * not be fetched, and the failure was opaque). This module is the single seam
 * for "default offline, explicit env wins".
 *
 * @module offline-env
 */

/**
 * Shell prefix assigning the offline flags for a child process.
 *
 * The values are interpolated into the command string, not just inherited:
 * every consumer spawns through a shell string (`source <venv> && … python3 …`),
 * and the assignment must hold even when the parent's variable was never
 * exported.
 *
 * One resolved value, written to both names. huggingface_hub ORs the two
 * (`HF_HUB_OFFLINE or TRANSFORMERS_OFFLINE`, huggingface_hub/constants.py:165)
 * and transformers 4.57 reads HF_HUB_OFFLINE (transformers/utils/hub.py:81),
 * so for the transformers consumer the pair is ONE decision, not two knobs.
 * Writing a literal `HF_HUB_OFFLINE=1` beside an operator's
 * `TRANSFORMERS_OFFLINE=0` would silently re-block the fetch they asked for —
 * the same failure this seam exists to remove. When both are set, HF_HUB_OFFLINE
 * wins: it is the knob the runbook documents, and the one transformers itself
 * reads.
 *
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env=process.env]
 * @param {boolean} [options.transformers=false] - also assign
 *   TRANSFORMERS_OFFLINE (the alignment spawn).
 * @returns {string} e.g. `"HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1"`
 */
export function offlineEnvPrefix({ env = process.env, transformers = false } = {}) {
  // HF_HUB_OFFLINE is the pipeline's knob and the name transformers reads
  // itself; TRANSFORMERS_OFFLINE is only consulted for the transformers
  // consumer, where huggingface_hub ORs it in anyway.
  const explicit = env.HF_HUB_OFFLINE ?? (transformers ? env.TRANSFORMERS_OFFLINE : undefined);
  const offline = explicit ?? "1";
  const parts = [`HF_HUB_OFFLINE=${offline}`];
  if (transformers) parts.push(`TRANSFORMERS_OFFLINE=${offline}`);
  return parts.join(" ");
}
