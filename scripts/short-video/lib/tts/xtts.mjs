/**
 * XTTS v2 engine adapter.
 *
 * XTTS is a voice-cloning engine that loads the model once for all scenes
 * (batch mode) to avoid the 60+ minute reload penalty.
 *
 * Post-processing: uses silenceremove (SILENCE_FILTER) which includes
 * optional atempo (TTS_ATEMPO).
 */

import { exec } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch, getProsodyProfile } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const XTTS_BATCH_SCRIPT = join(ROOT_DIR, "xtts_batch_tts.py");
const XTTS_VENV = join(process.env.HOME || "", ".xtts-env");
const XTTS_LANGUAGE = "en";
const XTTS_SPEED = parseFloat(process.env.XTTS_SPEED) || 1.15;
const XTTS_SPEAKER = process.env.XTTS_SPEAKER || "Craig Gutsy";

// Voice cloning: uses multi-WAV conditioning by default (3 clips from different positions).
// Multi-WAV averaging produces more stable speaker embeddings than single clip.
// Override: TTS_SPEAKER_WAV=none → built-in speaker; TTS_SPEAKER_WAV=/path → single file;
// TTS_SPEAKER_WAV="a.wav,b.wav" → custom multi
const VOICE_SAMPLES_DIR = join(ROOT_DIR, "assets", "voice-samples");
const multiClips = existsSync(VOICE_SAMPLES_DIR)
  ? ["multi_clip1.wav", "multi_clip2.wav", "multi_clip3.wav"]
      .map((f) => join(VOICE_SAMPLES_DIR, f))
      .filter((f) => existsSync(f))
  : [];
const DEFAULT_SPEAKER_WAV = join(ROOT_DIR, "assets", "voice-sample.wav");
const XTTS_SPEAKER_WAV =
  process.env.TTS_SPEAKER_WAV === "none"
    ? null
    : process.env.TTS_SPEAKER_WAV
      ? process.env.TTS_SPEAKER_WAV
      : multiClips.length >= 2
        ? multiClips.join(",")
        : existsSync(DEFAULT_SPEAKER_WAV)
          ? DEFAULT_SPEAKER_WAV
          : null;

// Path to XTTS v2 model directory (checks if model is downloaded, not just package installed)
const XTTS_MODEL_DIR = join(
  process.env.HOME || "",
  "Library",
  "Application Support",
  "tts",
  "tts_models--multilingual--multi-dataset--xtts_v2",
);

/**
 * Check if XTTS v2 is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(XTTS_BATCH_SCRIPT)) return false;
  if (!existsSync(XTTS_VENV)) return false;
  if (!existsSync(XTTS_MODEL_DIR)) return false;
  try {
    await execAsync(`source ${XTTS_VENV}/bin/activate && python3 -c "import TTS" 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create XTTS v2 engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createXTTSEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "xtts",
    info: `XTTS v2 (${XTTS_SPEAKER_WAV ? `cloned from ${XTTS_SPEAKER_WAV}` : XTTS_SPEAKER}, speed=${XTTS_SPEED})`,
    useSilenceFilter: true,
    resample: true,

    async generate(scenes, outputDir) {
      const { writeFileSync: writeSync } = await import("fs");
      const manifestPath = join(outputDir, "xtts-manifest.json");
      const manifest = scenes.map((s) => ({
        sceneId: s.id,
        text: s.voiceover,
        output: `scene-${s.id}.mp3`,
      }));
      writeSync(manifestPath, JSON.stringify(manifest));

      const speakerArg = XTTS_SPEAKER_WAV ? `--speaker "${XTTS_SPEAKER_WAV}"` : "";
      console.log("  Loading XTTS v2 model (once for all scenes)...");
      const { stdout } = await execAsync(
        `source ${XTTS_VENV}/bin/activate && COQUI_TOS_AGREED=1 XTTS_SPEAKER="${XTTS_SPEAKER}" python3 "${XTTS_BATCH_SCRIPT}" ` +
          `--manifest "${manifestPath}" --output-dir "${outputDir}" ` +
          `--language ${XTTS_LANGUAGE} --speed ${XTTS_SPEED} ${speakerArg} 2>&1`,
      );

      // Parse results from stdout — look for JSON array of objects (not the TTS sentence-split output)
      const lines = stdout.trim().split("\n");
      // The real results array starts with [{"sceneId" — not ["sentence"]
      const jsonLine = lines.find((l) => l.trim().startsWith('[{"'));
      let batchResults = [];
      if (jsonLine) {
        try {
          batchResults = JSON.parse(jsonLine.trim());
        } catch (e) {
          console.error("  Failed to parse XTTS JSON output:", e.message);
          console.error("  JSON line:", jsonLine.substring(0, 200));
        }
      } else {
        // Fallback: try each line that looks like JSON array
        for (const line of lines) {
          const trimmed = line.trim();
          if (
            trimmed.startsWith("[") &&
            trimmed.includes("sceneId") &&
            trimmed.includes("audioPath")
          ) {
            try {
              batchResults = JSON.parse(trimmed);
              break;
            } catch {
              continue;
            }
          }
        }
      }
      if (batchResults.length === 0) {
        throw new Error("No XTTS results parsed from batch output");
      }

      // Post-process each with silenceremove + per-scene prosody
      const finalResults = [];
      for (const r of batchResults) {
        const audioPath = r.audioPath;
        const scene = scenes.find((s) => s.id === r.sceneId);
        const prosody = getProsodyProfile(scene?.visualType);
        if (prosody) {
          console.log(`  Scene ${r.sceneId}: prosody=${prosody.label}`);
        }
        const duration = await postProcessBatch(audioPath, {
          useSilenceFilter: true,
          resample: true,
          prosody,
        });
        finalResults.push({ sceneId: r.sceneId, audioPath, duration });
        console.log(`  Scene ${r.sceneId}: ${duration.toFixed(2)}s`);
      }

      return finalResults;
    },
  };
}
