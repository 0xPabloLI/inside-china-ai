/**
 * TTS engine registry — selection + delegation.
 *
 * selectEngine() tries engines in priority order (or respects TTS_ENGINE
 * env override). generateTTS() delegates to the selected engine and runs
 * subtitle alignment afterwards.
 *
 * Engine priority:
 *   1. CosyVoice 3 (voice cloning, Flow Matching, best quality)
 *   2. Qwen3-TTS (voice cloning, MPS, fast fallback)
 *   3. edge-tts (Microsoft neural TTS, no cloning)
 *   4. macOS `say` (last resort, no cloning)
 */

import { createCosyVoiceEngine } from "./cosyvoice.mjs";
import { createQwenTTSEngine } from "./qwen-tts.mjs";
import { createEdgeTTSEngine } from "./edge-tts.mjs";
import { createSayEngine } from "./say.mjs";
import { runWhisperAlignment, getAtempo } from "./post-process.mjs";

/**
 * Engine factory map. Keys are both the canonical name and TTS_ENGINE aliases.
 * @type {Record<string, () => Promise<TTSEngine|null>>}
 */
const ENGINE_FACTORIES = {
  cosyvoice: createCosyVoiceEngine,
  "cosyvoice3": createCosyVoiceEngine,
  "qwen-tts": createQwenTTSEngine,
  qwen: createQwenTTSEngine,
  "edge-tts": createEdgeTTSEngine,
  say: createSayEngine,
};

/** Priority order for automatic selection (no TTS_ENGINE env). */
const PRIORITY = ["cosyvoice", "qwen-tts", "edge-tts", "say"];

/**
 * Select a TTS engine.
 *
 * If TTS_ENGINE env is set to a known engine name, try that engine first.
 * If it's unavailable (or no env override), fall back to priority order.
 *
 * @returns {Promise<TTSEngine>}
 * @throws {Error} If no engine is available.
 */
export async function selectEngine() {
  const forceEngine = process.env.TTS_ENGINE || null;

  // Try forced engine first
  if (forceEngine && ENGINE_FACTORIES[forceEngine]) {
    const engine = await ENGINE_FACTORIES[forceEngine]();
    if (engine) return engine;
    console.log(
      `  ⚠️ Forced engine "${forceEngine}" not available, falling back to priority order...`,
    );
  }

  // Try engines in priority order
  for (const key of PRIORITY) {
    const engine = await ENGINE_FACTORIES[key]();
    if (engine) return engine;
  }

  throw new Error(
    "No TTS engine available. Install CosyVoice 3 (~/.cosyvoice-env), Qwen3-TTS (~/.qwen-tts-env), edge-tts, or run on macOS.",
  );
}

/**
 * Generate TTS voiceover for all scenes.
 *
 * Delegates to the selected engine, then runs subtitle alignment.
 *
 * @param {Array} scenes - Scene objects with {id, voiceover}
 * @param {string} outputDir - Audio output directory
 * @returns {Promise<TTSResult[]>}
 */
export async function generateTTS(scenes, outputDir) {
  const engine = await selectEngine();

  const atempo = getAtempo();
  console.log(`  TTS engine: ${engine.info}`);
  console.log(
    `  Post-process: FFmpeg silenceremove (compress pauses >0.25s → 0.08s)${atempo ? ` + atempo ${atempo}x` : ""}`,
  );

  const results = await engine.generate(scenes, outputDir);

  // Run subtitle alignment for accurate timing
  await runWhisperAlignment(scenes, results, outputDir);

  return results;
}
