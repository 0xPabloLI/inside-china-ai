/**
 * F5-TTS-MLX engine adapter.
 *
 * F5-TTS-MLX is a Flow Matching model on Apple Silicon that generates audio
 * at a controlled duration — no atempo post-processing needed for speed control.
 * The `duration` parameter in the Python script sets the target length, so
 * the output is already at natural speaking speed.
 *
 * Post-processing: F5 generates clean WAV — NO FFmpeg audio filters are applied.
 * silenceremove, prosody, highpass, and denoise are ALL SKIPPED.
 * The only FFmpeg role is resample (24kHz → 44.1kHz) for assembly compatibility.
 * F5 outputs WAV directly (no MP3 conversion) to avoid double lossy encoding.
 * loudnorm is applied at the final video level in assemble.mjs.
 */

import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const F5_MLX_BATCH_SCRIPT = join(ROOT_DIR, "f5_mlx_batch_tts.py");
const F5_MLX_VENV = join(process.env.HOME || "", ".video-tts-env");
const F5_MLX_SPEED = parseFloat(process.env.F5_SPEED) || 1.0;
const F5_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");
const F5_REF_TEXT_FILE = join(ROOT_DIR, "voice-samples", "voice-sample-ref-text.txt");

// ── Per-visualType reference audio (#35, 方案 B) ──
// Prosody is learned from the reference audio; different scene types deserve
// different delivery. Reference clips are user-recorded into
// voice-samples/ref-styles/ (gitignored) — a style participates only when
// BOTH its wav and its ref-text exist, so an unrecorded or typo'd refStyle
// always falls back to the default sample instead of failing the run.
const REF_STYLES_DIR = join(ROOT_DIR, "voice-samples", "ref-styles");

/**
 * refStyle name → {audioPath, refTextPath}.
 * @type {Record<string, {audioPath: string, refTextPath: string}>}
 */
export const REF_AUDIO_MAP = Object.fromEntries(
  ["hook", "narrative", "data", "cta"].map((style) => [
    style,
    {
      audioPath: join(REF_STYLES_DIR, `${style}.wav`),
      refTextPath: join(REF_STYLES_DIR, `${style}-ref-text.txt`),
    },
  ]),
);

/**
 * Resolve the reference audio for one scene (#35).
 *
 * F5 hard limit: reference audio ≤ 15s. The caller passes injectable
 * `fileExists` for tests; production uses existsSync.
 *
 * @param {{refStyle?: string}} scene
 * @param {object} [opts]
 * @param {Record<string, {audioPath: string, refTextPath: string}>} [opts.map]
 * @param {string} [opts.defaultRef]
 * @param {string} [opts.defaultRefTextPath]
 * @param {(p: string) => boolean} [opts.fileExists]
 * @returns {{style: string, audioPath: string, refTextPath: string, warning?: string}}
 */
export function resolveRefForScene(
  scene,
  {
    map = REF_AUDIO_MAP,
    defaultRef = F5_REF_AUDIO,
    defaultRefTextPath = F5_REF_TEXT_FILE,
    fileExists = existsSync,
  } = {},
) {
  const style = scene?.refStyle;
  if (!style) {
    return { style: "default", audioPath: defaultRef, refTextPath: defaultRefTextPath };
  }
  const entry = map[style];
  if (!entry) {
    return {
      style: "default",
      audioPath: defaultRef,
      refTextPath: defaultRefTextPath,
      warning: `unknown refStyle "${style}" — using default reference`,
    };
  }
  if (!fileExists(entry.audioPath) || !fileExists(entry.refTextPath)) {
    return {
      style: "default",
      audioPath: defaultRef,
      refTextPath: defaultRefTextPath,
      warning: `refStyle "${style}" not recorded yet (missing wav/ref-text) — using default reference`,
    };
  }
  return { style, audioPath: entry.audioPath, refTextPath: entry.refTextPath };
}

/**
 * Build the F5 batch manifest. Scenes whose resolved style is non-default
 * carry `ref_audio` (path) and `ref_text` (transcription content) so the
 * python script clones that style for the scene; default-only runs produce
 * the exact pre-#35 manifest shape (no ref fields, python env defaults).
 *
 * @param {Array<{id: number, voiceover: string}>} scenes
 * @param {(scene: object) => {style: string, audioPath: string, refTextPath: string, warning?: string}} resolve
 * @param {(p: string) => string} [readText]
 * @returns {Array<{sceneId: number, text: string, output: string, ref_audio?: string, ref_text?: string}>}
 */
export function buildF5Manifest(
  scenes,
  resolve,
  readText = (p) => readFileSync(p, "utf-8").trim(),
) {
  return scenes.map((s) => {
    const ref = resolve(s);
    const entry = {
      sceneId: s.id,
      text: s.ttsText || s.voiceover,
      output: `scene-${s.id}.wav`,
    };
    if (ref.style !== "default") {
      entry.ref_audio = ref.audioPath;
      entry.ref_text = readText(ref.refTextPath);
    }
    return entry;
  });
}

/**
 * Check if F5-TTS-MLX is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(F5_MLX_BATCH_SCRIPT)) return false;
  if (!existsSync(F5_MLX_VENV)) return false;
  if (!existsSync(F5_REF_AUDIO)) return false;
  try {
    await execAsync(
      `source ${F5_MLX_VENV}/bin/activate && python3 -c "import f5_tts_mlx" 2>/dev/null`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Create F5-TTS-MLX engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createF5MLXEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "f5-mlx",
    info: `F5-TTS-MLX (cloned from ${F5_REF_AUDIO}, speed=${F5_MLX_SPEED})`,
    useSilenceFilter: false,
    resample: true,

    async generate(scenes, outputDir) {
      const manifestPath = join(outputDir, "f5-manifest.json");
      // Per-scene reference resolution (#35): styled scenes carry their own
      // ref_audio/ref_text; default scenes keep the pre-#35 manifest shape.
      const resolve = (s) => resolveRefForScene(s);
      const manifest = buildF5Manifest(scenes, resolve);
      for (const s of scenes) {
        const r = resolve(s);
        if (r.warning) console.log(`  ⚠️  Scene ${s.id}: ${r.warning}`);
        else if (r.style !== "default") console.log(`  🎭 Scene ${s.id}: refStyle=${r.style}`);
      }
      const { writeFileSync: writeSync } = await import("fs");
      writeSync(manifestPath, JSON.stringify(manifest));

      const refText = readFileSync(F5_REF_TEXT_FILE, "utf-8").trim();

      console.log("  Loading F5-TTS-MLX model (once for all scenes)...");
      const { stdout } = await execAsync(
        `source ${F5_MLX_VENV}/bin/activate && HF_HUB_OFFLINE=1 HF_HUB_DISABLE_XET=1 PYTHONUNBUFFERED=1 F5_REF_AUDIO="${F5_REF_AUDIO}" F5_REF_TEXT="${refText.replace(/"/g, '\\"')}" python3 "${F5_MLX_BATCH_SCRIPT}" ` +
          `--manifest "${manifestPath}" --output-dir "${outputDir}" --speed ${F5_MLX_SPEED} 2>&1`,
      );

      // Parse results from stdout
      const lines = stdout.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("[{"));
      let batchResults = [];
      if (jsonLine) {
        try {
          batchResults = JSON.parse(jsonLine.trim());
        } catch (e) {
          console.error("  Failed to parse F5-MLX JSON output:", e.message);
        }
      }
      if (batchResults.length === 0) {
        throw new Error("No F5-MLX results parsed from batch output");
      }

      // Post-process each: F5 generates clean audio, no silenceremove needed.
      // F5 prosody DISABLED (2026-08-14): rubberband post-hoc pitch/tempo
      // shift introduces mechanical artifacts on F5's already-natural output.
      // F5's internal duration control provides natural pacing — no post-hoc
      // pitch/tempo manipulation needed.
      // highpass/denoise hardcoded off (A/B test confirmed no effect on F5).
      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const finalResults = [];
      for (const r of batchResults) {
        const audioPath = r.audioPath;
        if (!audioPath) {
          console.error(`  Scene ${r.sceneId}: no output, skipping`);
          continue;
        }
        // F5 post-processing: ONLY resample (24kHz → 44.1kHz).
        const duration = await postProcessBatch(audioPath, {
          useSilenceFilter: false,
          resample: true,
          prosody: null,
        });
        finalResults.push({ sceneId: r.sceneId, audioPath, duration });
        console.log(`  Scene ${r.sceneId}: ${duration.toFixed(2)}s`);
      }

      return finalResults;
    },
  };
}
