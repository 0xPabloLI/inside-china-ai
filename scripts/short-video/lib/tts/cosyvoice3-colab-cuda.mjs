/**
 * CosyVoice3 Colab CUDA engine adapter (fallback after Kaggle, 2026-11-18).
 *
 * Runs the same CosyVoice3 CUDA batch on a Google Colab T4 through
 * `google-colab-cli` (`colab --auth=adc run --gpu T4 script.py`). Colab
 * teardown is automatic, so artifacts come back as base64 lines on stdout
 * (`__COLAB_TTS_FILE__<sceneId>:<wav>`); the kernel script is
 * `scripts/short-video/colab/cosyvoice3_tts_colab.py`.
 *
 * Why this exists: Kaggle's 30h/week P100 quota is the default, Modal costs
 * money, and MLX has a verified emotion regression. Colab T4 is the same CUDA
 * emotion tier as Kaggle and free — it belongs in the chain between them.
 *
 * Cost model: every `colab run` starts a cold VM (pip + clone + ~2GB model),
 * so this engine is for samples/batches that Kaggle cannot take, not for rapid
 * iteration. Availability fails closed when the CLI, ADC credentials or the
 * reference audio are missing.
 *
 * Requirements:
 *   - `pip3 install google-colab-cli` + `jupyter-kernel-client<1.0`
 *   - `gcloud auth application-default login --scopes=...` (ADC)
 *   - the repo voice sample at scripts/short-video/voice-samples/voice-sample-24k.wav
 */

import { execFile } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { buildCV3CudaManifest } from "./cosyvoice3-kaggle-cuda.mjs";
import { resolveInstructForScene } from "./instruct.mjs";
import { postProcessBatch } from "./post-process.mjs";
import { resolveSilenceFloorMs } from "./silence-trim.mjs";
import { assertRiffWaveHeader } from "../audio/wav.mjs";

const execFileAsync = promisify(execFile);

const COLAB_TEMPLATE = join(ROOT_DIR, "colab", "cosyvoice3_tts_colab.py");
const CV3_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");
const ADC_PATH = join(homedir(), ".config", "gcloud", "application_default_credentials.json");
const COLAB_TIMEOUT_MS = Number.parseInt(process.env.COSYVOICE3_COLAB_TIMEOUT_MS || "2700000", 10);

/**
 * Seconds the Colab kernel may stay silent before `colab run` gives up. The
 * CLI's own default is 30s, and a cold VM spends minutes installing deps and
 * downloading the model without emitting a message. The outer exec timeout
 * does not help because the CLI aborts first.
 */
const COLAB_KERNEL_SILENCE_S = Number.parseInt(
  process.env.COSYVOICE3_COLAB_KERNEL_SILENCE_S || "900",
  10,
);
const COLAB_GPU = process.env.COSYVOICE3_COLAB_GPU || "T4";

/** Locate the Colab CLI without assuming PATH (it installs under ~/.local/bin). */
export function resolveColabBin(deps = {}) {
  if (deps.colabBin) return deps.colabBin;
  if (process.env.COLAB_CLI) return process.env.COLAB_CLI;
  for (const candidate of [
    join(homedir(), ".local", "bin", "colab"),
    join(homedir(), ".video-tts-env", "bin", "colab"),
    "/opt/homebrew/bin/colab",
    "/usr/local/bin/colab",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "colab";
}

async function isAvailable(deps = {}) {
  if (deps.assumeAvailable === true) return true;
  if (!existsSync(COLAB_TEMPLATE)) return false;
  if (!existsSync(deps.refAudioPath ?? CV3_REF_AUDIO)) return false;
  if (!existsSync(ADC_PATH)) return false;
  try {
    const probe = deps.execFile ?? execFileAsync;
    // `colab` has no --version flag (Click exits 2); help is the probe.
    await probe(resolveColabBin(deps), ["-h"], { timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Embed the manifest + reference audio into the kernel script.
 *
 * @param {Array<object>} manifest
 * @param {Buffer} refAudio
 * @returns {string} script source
 */
export function renderColabScript(manifest, refAudio) {
  return readFileSync(COLAB_TEMPLATE, "utf-8")
    .replaceAll("__MANIFEST_B64__", Buffer.from(JSON.stringify(manifest)).toString("base64"))
    .replaceAll("__REF_AUDIO_B64__", refAudio.toString("base64"));
}

/**
 * Parse the kernel's stdout markers.
 *
 * @param {string} stdout
 * @returns {{files: Array<{sceneId: number, wav: Buffer}>, summary: object|null}}
 */
export function parseColabOutput(stdout) {
  const files = [];
  let summary = null;
  for (const line of String(stdout ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("__COLAB_TTS_FILE__")) {
      const body = trimmed.slice("__COLAB_TTS_FILE__".length);
      const sep = body.indexOf(":");
      if (sep < 1) continue;
      const sceneId = Number.parseInt(body.slice(0, sep), 10);
      if (!Number.isFinite(sceneId)) continue;
      files.push({ sceneId, wav: Buffer.from(body.slice(sep + 1), "base64") });
    } else if (trimmed.startsWith("__COLAB_TTS_SUMMARY__")) {
      try {
        summary = JSON.parse(
          Buffer.from(trimmed.slice("__COLAB_TTS_SUMMARY__".length), "base64").toString("utf-8"),
        );
      } catch {
        summary = null;
      }
    }
  }
  return { files, summary };
}

/**
 * Create the Colab CUDA engine.
 *
 * @param {object} [deps] - injectable seams for tests
 * @returns {Promise<object|null>} null when Colab is not configured.
 */
export async function createCosyVoice3ColabCudaEngine(deps = {}) {
  if (!(await isAvailable(deps))) return null;

  const runCli = deps.execFile ?? execFileAsync;
  const postProcess = deps.postProcess ?? postProcessBatch;
  const silenceFloorMs = resolveSilenceFloorMs();

  return {
    name: "cosyvoice3-colab-cuda",
    info: `CosyVoice3-Colab-CUDA (${COLAB_GPU}, cloned from ${CV3_REF_AUDIO})`,
    useSilenceFilter: true,
    silenceFloorMs,
    resample: true,
    instructForScene: resolveInstructForScene,

    async generate(scenes, outputDir) {
      const manifest = buildCV3CudaManifest(scenes);
      const script = renderColabScript(manifest, readFileSync(deps.refAudioPath ?? CV3_REF_AUDIO));
      // The output directory is pipeline-owned, not request input, but pin it
      // to an absolute non-root path so the artifact writes cannot escape it.
      const outputRoot = resolve(String(outputDir));
      if (!isAbsolute(outputRoot) || outputRoot === "/") {
        throw new Error(`Refusing to write Colab artifacts into "${outputDir}"`);
      }
      // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
      const tempDir = join(outputRoot, ".colab-tts");
      mkdirSync(tempDir, { recursive: true });
      // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
      const scriptPath = join(tempDir, "cosyvoice3_tts_colab.py");
      writeFileSync(scriptPath, script);

      console.log(
        `  📤 Running Colab ${COLAB_GPU} (${manifest.length} segments, cold VM ~10min setup)...`,
      );
      let stdout;
      try {
        ({ stdout } = await runCli(
          resolveColabBin(deps),
          [
            "--auth=adc",
            "run",
            "--gpu",
            COLAB_GPU,
            "--timeout",
            String(COLAB_KERNEL_SILENCE_S),
            scriptPath,
          ],
          { timeout: COLAB_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 },
        ));
      } catch (e) {
        throw new Error(
          `Colab run failed (${COLAB_GPU}): ${e.message}. ` +
            `Check \`${resolveColabBin(deps)} --auth=adc run --gpu ${COLAB_GPU} <script>\` manually; ` +
            `a missing model download or an expired ADC login both surface here.`,
        );
      }

      const { files, summary } = parseColabOutput(stdout);
      if (!summary) throw new Error("Colab script produced no summary line (stdout truncated?)");
      if (files.length === 0) {
        const errors = (summary?.segments ?? [])
          .filter((s) => s.error)
          .map((s) => `scene-${s.sceneId}: ${s.error}`);
        throw new Error(
          `Colab script produced no WAV artifacts${errors.length ? `: ${errors.join("; ")}` : ""}`,
        );
      }

      const failed = (summary.segments ?? []).filter((s) => s.error);
      if (failed.length > 0) {
        console.error(
          `  ⚠️ ${failed.length} Colab segments failed: ${failed
            .map((f) => `scene-${f.sceneId}`)
            .join(", ")}`,
        );
      }

      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const results = [];
      for (const file of files) {
        const sceneId = Number(file.sceneId);
        if (!Number.isInteger(sceneId) || sceneId < 1 || sceneId > 9999) {
          throw new Error(`Colab returned an invalid scene id: ${JSON.stringify(file.sceneId)}`);
        }
        // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
        const destPath = join(outputRoot, `scene-${sceneId}.wav`);
        assertRiffWaveHeader(file.wav, `scene ${sceneId}`);
        writeFileSync(destPath, file.wav);
        const { duration } = await postProcess(destPath, {
          useSilenceFilter: true,
          silenceFloorMs,
          resample: true,
          prosody: null,
        });
        results.push({ sceneId, audioPath: destPath, duration });
        console.log(`  Scene ${file.sceneId}: ${duration.toFixed(2)}s`);
      }
      if (results.length === 0) throw new Error("No successful TTS results from Colab");
      return results;
    },
  };
}
