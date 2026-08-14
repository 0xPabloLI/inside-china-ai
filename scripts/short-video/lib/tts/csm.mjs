/**
 * CSM (Sesame) TTS engine adapter — voice cloning with 1B model.
 *
 * Uses standalone CSM script with ckpt.pt + Mimi codec from transformers.
 * Batch mode: model loaded once for all scenes.
 */

import { exec } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch, getProsodyProfile } from "./post-process.mjs";

const execAsync = promisify(exec);

const CSM_SCRIPT = join(ROOT_DIR, "csm_standalone_tts.py");
const CSM_VENV = join(process.env.HOME || "", ".qwen-tts-env");
const CSM_SRC = "/tmp/csm-src";
const CSM_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");
const CSM_REF_TEXT_FILE = join(ROOT_DIR, "voice-samples", "voice-sample-ref-text.txt");
const CSM_MAX_AUDIO_MS = parseInt(process.env.CSM_MAX_AUDIO_MS || "15000", 10);

async function isAvailable() {
  if (!existsSync(CSM_SCRIPT)) return false;
  if (!existsSync(CSM_VENV)) return false;
  if (!existsSync(CSM_SRC)) return false;
  if (!existsSync(CSM_REF_AUDIO)) return false;
  try {
    await execAsync(
      `source ${CSM_VENV}/bin/activate && python3 -c "import torchtune; from transformers import MimiModel" 2>/dev/null`,
    );
    return true;
  } catch {
    return false;
  }
}

export async function createCSMEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "csm",
    info: `CSM 1B (cloned from ${CSM_REF_AUDIO}, standalone ckpt.pt + Mimi codec)`,
    useSilenceFilter: true,
    resample: true,

    async generate(scenes, outputDir) {
      const manifestPath = join(outputDir, "csm-manifest.json");
      const manifest = scenes.map((s) => ({
        sceneId: s.id,
        text: s.voiceover,
        output: `scene-${s.id}.wav`,
      }));
      writeFileSync(manifestPath, JSON.stringify(manifest));

      const refText = existsSync(CSM_REF_TEXT_FILE)
        ? readFileSync(CSM_REF_TEXT_FILE, "utf-8").trim()
        : "";

      console.log("  Loading CSM 1B model (once for all scenes)...");
      const cmd =
        `source ${CSM_VENV}/bin/activate && PYTHONPATH=${CSM_SRC} ` +
        `python3 "${CSM_SCRIPT}" ` +
        `--manifest "${manifestPath}" --output-dir "${outputDir}" ` +
        `--ref-audio "${CSM_REF_AUDIO}" ` +
        (refText ? `--ref-text "${refText.replace(/"/g, '\\"')}" ` : "") +
        `--max-audio-ms ${CSM_MAX_AUDIO_MS} --device mps 2>&1`;
      const { stdout } = await execAsync(cmd);

      const lines = stdout.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("[{"));
      let batchResults = [];
      if (jsonLine) {
        try {
          batchResults = JSON.parse(jsonLine.trim());
        } catch (e) {
          console.error("  Failed to parse CSM JSON output:", e.message);
        }
      }
      if (batchResults.length === 0) {
        throw new Error("No CSM results parsed from batch output");
      }

      const finalResults = [];
      for (const r of batchResults) {
        const audioPath = r.audioPath;
        if (!audioPath) {
          console.error(`  Scene ${r.sceneId}: no output, skipping`);
          continue;
        }
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
