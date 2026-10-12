/**
 * Missing-weight diagnosis for the offline spawns (#394).
 *
 * The 2026-09-27 incident: the HF cache held only part of the wav2vec2
 * alignment snapshot and none of F5's vocos vocoder; with offline mode on,
 * both died with messages that do not tell an operator "the weights are not
 * cached, fetch them once". whisperx's align loader swallows the real cause
 * and reports `could not be found in huggingface or torchaudio`, and
 * huggingface_hub reports `LocalEntryNotFoundError` /
 * `OfflineModeIsEnabled` — none of which names the fix.
 *
 * The signatures below are the REAL messages captured on 2026-10-12 (venv
 * `~/.video-tts-env`, offline mode, missing cache); the fixtures in
 * `__tests__/tts-offline-model-hints.test.mjs` keep them pinned.
 *
 * @module offline-model-hints
 */

/**
 * Models F5-TTS-MLX loads from the HF cache: the DiT weights
 * (`lucasnewman/f5-tts-mlx`, f5_tts_mlx/cfm.py) and the vocos vocoder
 * (`lucasnewman/vocos-mel-24khz`, vocos_mlx/model.py:282).
 */
export const F5_OFFLINE_MODELS = ["lucasnewman/f5-tts-mlx", "lucasnewman/vocos-mel-24khz"];

/** text-align.py's ALIGN_MODEL — the forced-alignment wav2vec2 checkpoint. */
export const ALIGN_OFFLINE_MODELS = ["facebook/wav2vec2-large-960h-lv60-self"];

/**
 * Error-text signatures of an offline cache miss. Deliberately narrow:
 * matching on the fix ("set HF_HUB_OFFLINE=0") or on a generic "model not
 * found" would annotate unrelated failures.
 */
const CACHE_MISS_SIGNATURES = [
  // huggingface_hub: no snapshot at all for the revision.
  "LocalEntryNotFoundError",
  "Cannot find an appropriate cached snapshot folder",
  // huggingface_hub: the API lookup was attempted while offline.
  "offline mode is enabled",
  // whisperx align loader (whisperx/alignment.py) — swallows the transformers
  // error and reports this for both a missing cache and a partial one.
  "could not be found in huggingface",
];

/**
 * @param {unknown} text - stderr / error message of a failed spawn
 * @returns {boolean}
 */
export function detectOfflineCacheMiss(text) {
  const s = String(text ?? "");
  if (s === "") return false;
  return CACHE_MISS_SIGNATURES.some((sig) => s.includes(sig));
}

/**
 * Build the actionable fix: one one-time fetch command per model.
 *
 * @param {Array<string>} models - HF repo ids
 * @returns {string} multi-line hint
 */
export function formatOfflineModelHint(models) {
  const lines = [
    "  ❌ Offline HF cache miss — the model weights are not in the local HF cache and offline mode (HF_HUB_OFFLINE=1) blocks the download.",
    "     Fetch the missing model(s) once (needs network), then re-run:",
  ];
  for (const model of models) {
    lines.push(
      `       HF_HUB_OFFLINE=0 HF_HUB_DISABLE_XET=1 ~/.video-tts-env/bin/python3 -c "from huggingface_hub import snapshot_download; snapshot_download('${model}')"`,
    );
  }
  return lines.join("\n");
}

/**
 * Detect an offline cache miss on a spawn error and print the fix hint.
 *
 * Every consumer spawns with `2>&1` (the pipeline wants one interleaved log),
 * so the diagnosis lands in `error.stdout`, NOT `error.stderr` — measured on
 * the real alignment miss 2026-10-12: `stderr` was empty and the whisperx
 * ValueError sat in `stdout`. All three fields are scanned.
 *
 * @param {unknown} error - the spawn rejection (exec error: `stdout`/`stderr`/`message`)
 * @param {Array<string>} models - HF repo ids to offer for fetching
 * @param {object} [options]
 * @param {Function} [options.log=console.error]
 * @returns {boolean} true when the error was classified and the hint printed
 */
export function reportOfflineCacheMiss(error, models, { log = console.error } = {}) {
  const text = [error?.stdout, error?.stderr, error?.message]
    .filter((v) => v !== undefined && v !== null)
    .map(String)
    .join("\n");
  if (!detectOfflineCacheMiss(text)) return false;
  log(formatOfflineModelHint(models));
  return true;
}
