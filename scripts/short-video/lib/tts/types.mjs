/**
 * Shared types and constants for TTS engine adapters.
 *
 * Each engine adapter is a factory function that returns a TTSEngine object
 * or null if the engine is not available on this system.
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Paths ──
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Root of the short-video pipeline: scripts/short-video/ */
export const ROOT_DIR = join(__dirname, "..", "..");

// ── Type definitions (JSDoc) ──

/**
 * @typedef {Object} TTSResult
 * @property {number} sceneId
 * @property {string} audioPath
 * @property {number} duration
 */

/**
 * @typedef {Object} TTSEngine
 * @property {string} name        - Machine-readable engine name
 * @property {string} info        - Human-readable description for logging
 * @property {boolean} useSilenceFilter - Whether to apply silenceremove in post-process
 * @property {boolean} resample   - Whether to resample to 44100/192k in post-process
 * @property {(scenes: Array, outputDir: string) => Promise<TTSResult[]>} generate
 */
