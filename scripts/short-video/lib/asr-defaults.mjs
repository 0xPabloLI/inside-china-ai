/**
 * Single source of truth for ASR model defaults — ADR-0020.
 *
 * All ASR paths in this repo default to max-effort models. No module may
 * hardcode a sub-max default (base/tiny/small/medium). The CI guard
 * (scripts/lint-asr-model-defaults.mjs) enforces this.
 *
 * @module asr-defaults
 */

/** WhisperX (faster-whisper) transcription model — CPU backend. */
export const DEFAULT_WHISPERX_MODEL = "large-v3";

/** whisper.cpp model name (binary in ~/.cache/whisper/ggml-<name>.bin). */
export const DEFAULT_WHISPER_CPP_MODEL_NAME = "large-v3-turbo";