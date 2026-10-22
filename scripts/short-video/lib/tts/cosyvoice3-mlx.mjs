/**
 * CosyVoice3-MLX engine adapter.
 *
 * CosyVoice3-MLX is a multilingual TTS model on Apple Silicon that supports
 * voice cloning (ref_audio) + emotion control (instruct_text) + speed control
 * simultaneously. Apache-2.0 license (commercial OK).
 *
 * Key differences from F5-TTS-MLX:
 * - Supports instruct_text for emotion/style control (F5 has no emotion control)
 * - No duration parameter needed (CosyVoice3 auto-determines length)
 * - MLX version auto-appends <|endofprompt|> — do NOT include it in instruct_text
 * - Same venv as F5 (~/.video-tts-env, Python 3.12)
 *
 * Post-processing: same as F5 — resample only, no silenceremove/prosody/denoise.
 */

import { exec } from "child_process";
import { existsSync, readFileSync, statSync, symlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { containedPath } from "../path-safety.mjs";
import { postProcessBatch, engineTtsText } from "./post-process.mjs";
import { INSTRUCT_FORMAT, createInstructResolver } from "./instruct.mjs";
import { offlineEnvPrefix } from "./offline-env.mjs";

const execAsync = promisify(exec);

// ── Config ──
const CV3_MLX_BATCH_SCRIPT = join(ROOT_DIR, "cosyvoice3_mlx_batch_tts.py");
const CV3_MLX_VENV = join(process.env.HOME || "", ".video-tts-env");
const CV3_MLX_SPEED = parseFloat(process.env.COSYVOICE3_SPEED) || 1.0;
const CV3_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");
const CV3_REF_TEXT_FILE = join(ROOT_DIR, "voice-samples", "voice-sample-ref-text.txt");

// #327: models live under ~/models/. The pre-#327 install used a hidden
// dot-directory; the resolver keeps that working as a fallback so an existing
// checkout does not have to be moved (and nothing is deleted).
const CV3_MODEL_SEGMENTS = ["models", "cosyvoice3-mlx"];
const CV3_LEGACY_MODEL_DIRNAME = ".cosyvoice3-mlx-model";

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve the CosyVoice3-MLX model directory (#327). Resolved per call — the
 * model-dir default must not be frozen at module load, or a test/worker with a
 * different HOME (and an upgraded install) would keep pointing at the stale path.
 *
 * Priority:
 * 1. `COSYVOICE3_MLX_MODEL_DIR` — explicit, used verbatim (no existence probe:
 *    a wrong path must fail loudly at model load, not silently fall back).
 * 2. `<home>/models/cosyvoice3-mlx` when it exists.
 * 3. `<home>/.cosyvoice3-mlx-model` when it exists (pre-#327 install).
 * 4. `<home>/models/cosyvoice3-mlx` — canonical default, so the eventual error
 *    names the location the model is expected to live in.
 *
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env=process.env]
 * @param {string} [options.home] - overrides HOME (tests)
 * @param {(path: string) => boolean} [options.isDir] - directory probe (tests)
 * @returns {string}
 */
export function resolveCV3ModelDir({ env = process.env, home, isDir = isDirectory } = {}) {
  const explicit = env.COSYVOICE3_MLX_MODEL_DIR;
  if (explicit) return explicit;

  const homeDir = home || env.HOME || homedir();
  const candidates = [
    containedPath(homeDir, ...CV3_MODEL_SEGMENTS),
    containedPath(homeDir, CV3_LEGACY_MODEL_DIRNAME),
  ];
  return candidates.find(isDir) ?? candidates[0];
}

// mlx_audio's S3TokenizerV3.from_pretrained() defaults to repo_id="/tmp/s3-tokenizer",
// a LOCAL dir it does not create. When it is missing, the hand-patched fetch_from_hub
// in the venv's model_v3.py crashes (NameError) and every scene silently renders as
// 0.0s audio. /tmp is periodically cleaned by macOS, so ensure it exists before every
// run, restoring from the HF cache snapshot (2026-09-10 incident).
const S3_TOKENIZER_DIR = "/tmp/s3-tokenizer";
const S3_TOKENIZER_HF_SNAPSHOT = join(
  process.env.HOME || "",
  ".cache/huggingface/hub/models--mlx-community--S3TokenizerV3/snapshots/main",
);

function ensureS3Tokenizer() {
  if (existsSync(join(S3_TOKENIZER_DIR, "model.safetensors"))) return;
  if (!existsSync(join(S3_TOKENIZER_HF_SNAPSHOT, "model.safetensors"))) {
    throw new Error(
      `S3 tokenizer missing at both ${S3_TOKENIZER_DIR} and ${S3_TOKENIZER_HF_SNAPSHOT} — ` +
        `restore it (huggingface-cli download mlx-community/S3TokenizerV3) before running CosyVoice3-MLX.`,
    );
  }
  symlinkSync(S3_TOKENIZER_HF_SNAPSHOT, S3_TOKENIZER_DIR, "dir");
  console.log(`  🔗 Restored ${S3_TOKENIZER_DIR} → ${S3_TOKENIZER_HF_SNAPSHOT} (symlink)`);
}

// ── Emotion instructions ──
// #270: the instruct standard (Persona + Accent + Emotion + Pacing, #234) has
// ONE source — ./instruct.mjs. This adapter used to carry its own 4-entry
// INSTRUCT_MAP, so the five styles it lacked (contrast / info-card /
// stat-reveal / quote / context) reached the kernel with no instruct at all
// (#273 P1.3). MLX auto-appends <|endofprompt|>, so the resolver is bound to
// the MLX format and the shared text is sent without the terminator.
export const resolveInstructForScene = createInstructResolver({
  format: INSTRUCT_FORMAT.MLX,
});

/**
 * Build the CosyVoice3 batch manifest. Each entry carries instruct_text
 * when the scene has a recognized visualType/refStyle.
 *
 * @param {Array<{id: number, voiceover: string, visualType?: string, refStyle?: string}>} scenes
 * @returns {Array<{sceneId: number, text: string, output: string, instruct_text?: string}>}
 */
export function buildCV3Manifest(scenes) {
  return scenes.map((s) => {
    const entry = {
      sceneId: s.id,
      text: s.ttsText || engineTtsText(s.voiceover),
      output: `scene-${s.id}.wav`,
    };
    const instruct = resolveInstructForScene(s);
    if (instruct) {
      entry.instruct_text = instruct;
    }
    return entry;
  });
}

/**
 * Build the CosyVoice3-MLX batch shell command.
 *
 * Offline by default; an explicit `HF_HUB_OFFLINE` from the parent wins
 * (#394), matching the F5 and alignment spawns. `HF_HUB_DISABLE_XET=1` stays
 * unconditional (xet-transport workaround, not an offline policy).
 *
 * Unlike those two spawns, this one carries NO offline cache-miss hint, and
 * that is deliberate: the weights load from the local `--model-dir`
 * (`~/models/cosyvoice3-mlx`, with the legacy `~/.cosyvoice3-mlx-model`
 * auto-detected), and the one HF-cached dependency
 * (mlx-community/S3TokenizerV3) is checked before the spawn by
 * `ensureS3Tokenizer()`, which already throws with the restore command. The
 * offline flag here is defensive — do not "fix" the missing hint by adding a
 * fetch command that the failure path can never reach.
 *
 * @param {object} options
 * @param {string} options.manifestPath
 * @param {string} options.outputDir
 * @param {string} options.refText - default reference transcription
 * @param {number} [options.speed=CV3_MLX_SPEED]
 * @param {NodeJS.ProcessEnv} [options.env=process.env]
 * @param {string} [options.modelDir] - defaults to resolveCV3ModelDir({ env });
 *   empty/omitted resolves at call time so the passed `env` wins
 * @returns {string}
 */
export function buildCV3BatchCommand({
  manifestPath,
  outputDir,
  refText,
  speed = CV3_MLX_SPEED,
  env = process.env,
  modelDir,
}) {
  const resolvedModelDir = modelDir || resolveCV3ModelDir({ env });
  return (
    `source ${CV3_MLX_VENV}/bin/activate && ${offlineEnvPrefix({ env })} HF_HUB_DISABLE_XET=1 PYTHONUNBUFFERED=1 ` +
    `python3 "${CV3_MLX_BATCH_SCRIPT}" ` +
    `--manifest "${manifestPath}" --output-dir "${outputDir}" ` +
    `--ref-audio "${CV3_REF_AUDIO}" --ref-text "${refText.replace(/"/g, '\\"')}" ` +
    `--speed ${speed} --model-dir "${resolvedModelDir}" 2>&1`
  );
}

/**
 * Check if CosyVoice3-MLX is available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(CV3_MLX_BATCH_SCRIPT)) return false;
  if (!existsSync(CV3_MLX_VENV)) return false;
  if (!existsSync(CV3_REF_AUDIO)) return false;
  if (!existsSync(resolveCV3ModelDir())) return false;
  try {
    await execAsync(
      `source ${CV3_MLX_VENV}/bin/activate && python3 -c "import mlx_audio" 2>/dev/null`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Create CosyVoice3-MLX engine instance.
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createCosyVoice3MLXEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "cosyvoice3-mlx",
    info: `CosyVoice3-MLX (cloned from ${CV3_REF_AUDIO}, speed=${CV3_MLX_SPEED})`,
    useSilenceFilter: false,
    resample: true,
    // #244: cache-key seam — see cosyvoice3-kaggle-cuda.mjs.
    instructForScene: resolveInstructForScene,

    async generate(scenes, outputDir) {
      const manifestPath = join(outputDir, "cv3-manifest.json");
      const manifest = buildCV3Manifest(scenes);
      for (const s of scenes) {
        const instruct = resolveInstructForScene(s);
        if (instruct) {
          const style = s.refStyle || s.visualType;
          console.log(`  🎭 Scene ${s.id}: ${style} → emotion instruct`);
        }
      }
      const { writeFileSync: writeSync } = await import("fs");
      writeSync(manifestPath, JSON.stringify(manifest));

      const refText = readFileSync(CV3_REF_TEXT_FILE, "utf-8").trim();

      ensureS3Tokenizer();

      console.log("  Loading CosyVoice3-MLX model (once for all scenes)...");
      const { stdout } = await execAsync(
        buildCV3BatchCommand({ manifestPath, outputDir, refText }),
      );

      const lines = stdout.trim().split("\n");
      const jsonLine = lines.find((l) => l.trim().startsWith("[{"));
      let batchResults = [];
      if (jsonLine) {
        try {
          batchResults = JSON.parse(jsonLine.trim());
        } catch (e) {
          console.error("  Failed to parse CosyVoice3-MLX JSON output:", e.message);
        }
      }
      if (batchResults.length === 0) {
        throw new Error("No CosyVoice3-MLX results parsed from batch output");
      }

      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const finalResults = [];
      for (const r of batchResults) {
        // mlx_audio's generate_audio auto-suffixes chunked output as
        // `<prefix>_000.wav` while the manifest reports `<prefix>.wav`. If the
        // reported path is missing (or older than the _000 chunk), adopt the
        // chunk as the real take — otherwise post-process would rework a STALE
        // cached file and silently discard the fresh generation
        // (2026-09-10: scene-7 fresh 11.3s take ignored in favour of a stale
        // 3.7s hand-trimmed file; Gate then failed 3x on the stale audio).
        let audioPath = r.audioPath;
        if (!audioPath) {
          console.error(`  Scene ${r.sceneId}: no output, skipping`);
          continue;
        }
        const chunkPath = audioPath.replace(/\.wav$/, "_000.wav");
        const { renameSync } = await import("fs");
        if (existsSync(chunkPath)) {
          const chunkM = statSync(chunkPath).mtimeMs;
          const reportedM = existsSync(audioPath) ? statSync(audioPath).mtimeMs : -1;
          if (!existsSync(audioPath) || chunkM > reportedM) {
            renameSync(chunkPath, audioPath);
          }
        }
        const { duration } = await postProcessBatch(audioPath, {
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
