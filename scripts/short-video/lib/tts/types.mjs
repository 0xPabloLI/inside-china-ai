/**
 * Shared constants for TTS engine modules.
 *
 * Naming note (#199 2.8): despite the filename, this module holds only path
 * constants (no TS types). Keep type definitions next to their consumers
 * (e.g. the JSDoc typedefs in registry.mjs / post-process.mjs).
 *
 * ROOT_DIR is the scripts/short-video/ directory — the anchor for
 * resolving Python scripts (text-align.py, f5_mlx_batch_tts.py,
 * qwen_tts_batch.py) and voice sample files.
 */
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
// types.mjs is at lib/tts/types.mjs → go up 2 levels to scripts/short-video/
export const ROOT_DIR = resolve(dirname(__filename), "..", "..");
