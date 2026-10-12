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
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env=process.env]
 * @param {boolean} [options.transformers=false] - also assign
 *   TRANSFORMERS_OFFLINE (the alignment spawn). transformers 4.57 reads
 *   HF_HUB_OFFLINE (transformers/utils/hub.py:81) and huggingface_hub ORs the
 *   two vars (huggingface_hub/constants.py:165), so mirroring the HF value
 *   keeps a single `HF_HUB_OFFLINE=0` opt-out working for both.
 * @returns {string} e.g. `"HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1"`
 */
export function offlineEnvPrefix({ env = process.env, transformers = false } = {}) {
  const hf = env.HF_HUB_OFFLINE || "1";
  const parts = [`HF_HUB_OFFLINE=${hf}`];
  if (transformers) parts.push(`TRANSFORMERS_OFFLINE=${env.TRANSFORMERS_OFFLINE || hf}`);
  return parts.join(" ");
}
