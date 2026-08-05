/**
 * TTS voiceover generation — re-export from the engine registry.
 *
 * The actual implementation lives in lib/tts/ (engine adapters + registry).
 * This thin shim preserves the import path for main.mjs and other callers.
 *
 * @see ./tts/registry.mjs
 */
export { generateTTS } from "./tts/registry.mjs";
