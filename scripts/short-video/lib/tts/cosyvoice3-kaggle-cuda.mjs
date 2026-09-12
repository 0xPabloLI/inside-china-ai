/**
 * CosyVoice3 Kaggle CUDA engine adapter.
 *
 * Runs CosyVoice3 on Kaggle P100 GPU (free, 30h/week) via the Kaggle Kernels API.
 * CUDA ExecutionProvider gives full emotion fidelity — unlike MLX/MPS which have
 * emotion regression vs CUDA baseline (verified 2026-09-07).
 *
 * Workflow:
 *   1. Build manifest from scenes (text + instruct_text with <|endofprompt|>)
 *   2. Embed manifest into Kaggle kernel script
 *   3. Push kernel via `kaggle kernels push` (ref audio from Kaggle dataset)
 *   4. Poll `kaggle kernels status` until complete
 *   5. Download output via `kaggle kernels output`
 *   6. Post-process (resample 44.1kHz) and return results
 *
 * Setup overhead: ~5 min (pip install + clone + model download) per run.
 * Inference: ~2-3 min for 6-8 segments on P100.
 * Total: ~8-10 min per batch (acceptable — user confirmed no near-real-time needed).
 *
 * Requirements:
 *   - Kaggle CLI installed + ~/.kaggle/kaggle.json configured
 *   - Internet enabled on kernel (for pip install + model download)
 *   - GPU enabled (P100)
 *
 * License: Apache-2.0 (CosyVoice3) — commercial OK.
 */

import { exec } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch, getProsodyProfile, engineTtsText } from "./post-process.mjs";
import { resolveSceneSpeed } from "./pacing.mjs";

const execAsync = promisify(exec);

// ── Config ──
const KAGGLE_KERNEL_TEMPLATE = join(ROOT_DIR, "kaggle", "cosyvoice3_cuda_kernel.py");
const KAGGLE_KERNEL_SLUG = process.env.COSYVOICE3_KAGGLE_SLUG || "cosyvoice3-cuda-batch";
const KAGGLE_KERNEL_ID = process.env.COSYVOICE3_KAGGLE_USER
  ? `${process.env.COSYVOICE3_KAGGLE_USER}/${KAGGLE_KERNEL_SLUG}`
  : null; // auto-detect from kaggle.json if not set
// 30min RUNNING budget (#241: the 20min default tripped on slow torch/model
// downloads even though pure inference is ~64s for a 10-scene batch; #250
// keeps queue wait in a separate budget).
const KAGGLE_TIMEOUT_MS = parseInt(process.env.COSYVOICE3_KAGGLE_TIMEOUT_MS || "1800000", 10);
// Queue budget (#250): Kaggle free tier runs 1 GPU session at a time, so a
// second pipeline's kernel waits in QUEUED while the first finishes
// (~10-15min). The old single 20min timeout covered queue+run and killed
// legitimately queued runs. 40min = reviewer-recommended 30-40min upper edge.
const KAGGLE_QUEUE_TIMEOUT_MS = parseInt(
  process.env.COSYVOICE3_KAGGLE_QUEUE_TIMEOUT_MS || "2400000",
  10,
); // 40 min QUEUED/waiting budget
const KAGGLE_POLL_INTERVAL_MS = 15000; // 15s
const CV3_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");

// ── Emotion instructions per visualType/refStyle ──
// Multi-dimensional best practice: Persona + Accent + Emotion + Pacing (#234)
// CUDA (PyTorch) instruct format requires <|endofprompt|> suffix.
const INSTRUCT_MAP = {
  hook: "You are a helpful assistant. You are a tech news anchor on short video. Speak in standard American English with an energetic, clear, and confident tone, breaking major news.<|endofprompt|>",
  narrative:
    "You are a helpful assistant. You are a tech documentary narrator. Speak in standard American English with a calm, engaging, and professional tone at a steady pace.<|endofprompt|>",
  data: "You are a helpful assistant. You are a tech analyst. Speak in standard American English with an authoritative, precise, and clear tone, emphasizing key metrics.<|endofprompt|>",
  cta: "You are a helpful assistant. You are a warm and engaging host. Speak in standard American English with an enthusiastic, persuasive, and welcoming tone.<|endofprompt|>",
};

/**
 * Resolve instruct_text for a scene based on visualType or refStyle.
 * Supports explicit scene.instruct override.
 * @param {{visualType?: string, refStyle?: string, instruct?: string}} scene
 * @returns {string|undefined}
 */
export function resolveInstructForScene(scene) {
  if (scene?.instruct) {
    return scene.instruct.endsWith("<|endofprompt|>")
      ? scene.instruct
      : `${scene.instruct}<|endofprompt|>`;
  }
  const style = scene?.refStyle || scene?.visualType;
  if (!style) return undefined;
  return INSTRUCT_MAP[style];
}

/**
 * Build the CosyVoice3 batch manifest for CUDA (with <|endofprompt|>).
 *
 * Baseline = the user-approved Kaggle P100 emotion samples
 * (assets/tts-comparison/cosyvoice3-kaggle-p100-cuda/, verified 2026-09-07):
 * inference_instruct2 with INSTRUCT_MAP text and ref audio, NO rubberband
 * post-processing — it distorts timbre away from the approved sound (hook
 * accent drift, CTA mismatch). Opt in via TTS_PROSODY=1.
 *
 * Per-scene native speed (#235): boost-eligible scenes (EN non-hook) carry a
 * manifest `speed` entry the kernel applies as mel interpolation — native, no
 * atempo step. Policy and clamp live in ./pacing.mjs; TTS_PROSODY=1 overrides.
 *
 * @param {Array<{id: number, voiceover?: string, ttsText?: string, visualType?: string, refStyle?: string}>} scenes
 * @returns {Array<{sceneId: number, text: string, output: string, instruct_text?: string, speed?: number}>}
 */
export function buildCV3CudaManifest(scenes) {
  const prosodyOptIn = process.env.TTS_PROSODY === "1";
  return scenes.map((s) => {
    const entry = {
      sceneId: s.id,
      text: s.ttsText || engineTtsText(s.voiceover || ""),
      output: `scene-${s.id}.wav`,
    };
    const instruct = resolveInstructForScene(s);
    if (instruct) {
      entry.instruct_text = instruct;
    }
    if (prosodyOptIn) {
      // TTS_PROSODY=1 takes manual control of per-scene pace (legacy opt-in) —
      // the pacing policy below does not apply in that mode.
      const prosody = getProsodyProfile(s.refStyle || s.visualType);
      if (prosody && prosody.tempo !== 1.0) {
        entry.speed = prosody.tempo;
      }
    } else {
      // Per-scene native pacing (#235): ZH 1.0 / EN hook 1.0 / other EN 1.2,
      // clamped ≤1.2. resolveSceneSpeed returns 1.0 for no-boost scenes.
      const speed = resolveSceneSpeed(s);
      if (speed !== 1.0) {
        entry.speed = speed;
      }
    }
    return entry;
  });
}

/**
 * Get Kaggle username from kaggle.json.
 * @returns {string|null}
 */
function getKaggleUsername() {
  if (process.env.COSYVOICE3_KAGGLE_USER) return process.env.COSYVOICE3_KAGGLE_USER;
  try {
    const kaggleJson = JSON.parse(
      readFileSync(join(process.env.HOME || "", ".kaggle", "kaggle.json"), "utf-8"),
    );
    return kaggleJson.username || null;
  } catch {
    return null;
  }
}

/**
 * Check if Kaggle CLI is available and configured.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(KAGGLE_KERNEL_TEMPLATE)) return false;
  if (!existsSync(CV3_REF_AUDIO)) return false;
  const username = getKaggleUsername();
  if (!username) return false;
  try {
    await execAsync("kaggle --version 2>/dev/null");
    return true;
  } catch {
    return false;
  }
}

/**
 * Classify a `kaggle kernels status` line into a poll phase (#250).
 *
 * @param {string} raw - stdout (or error text) from `kaggle kernels status`
 * @returns {"complete"|"error"|"cancel"|"queued"|"running"|"unknown"}
 */
export function classifyKernelStatus(raw) {
  const text = String(raw ?? "").toLowerCase();
  if (text.includes("complete")) return "complete";
  if (text.includes("error")) return "error";
  if (text.includes("cancel")) return "cancel";
  if (text.includes("queued")) return "queued";
  if (text.includes("running")) return "running";
  return "unknown";
}

/** Best-effort poll-status.json write — fail-open, bookkeeping never breaks a run. */
function writeStatusFile(filePath, payload) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  } catch {
    // fail-open
  }
}

function fmtDuration(ms) {
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Poll Kaggle kernel status until complete, with explicit QUEUED/RUNNING
 * phases and separate queue/run budgets (#250).
 *
 * Kaggle free tier allows 1 running GPU session: a kernel pushed while another
 * pipeline's kernel holds the session stays QUEUED — that is expected, not a
 * hang. Queue wait is metered against `queueTimeoutMs`; RUNNING time against
 * `runTimeoutMs`. On CLI failure (e.g. 404 while QUEUED) the raw text cannot
 * be trusted as kernel truth, so the phase becomes UNKNOWN and polling
 * continues (queued budget applies) instead of misreading a crash.
 *
 * No automatic fallback on queue timeout (ADR-0019 quality red line): the
 * error explicitly hands the decision back to the operator.
 *
 * @param {string} kernelId - e.g. "username/cosyvoice3-cuda-batch"
 * @param {object} [opts]
 * @param {number} [opts.runTimeoutMs] - budget for RUNNING state
 * @param {number} [opts.queueTimeoutMs] - budget for QUEUED/UNKNOWN wait
 * @param {number} [opts.pollIntervalMs]
 * @param {string|null} [opts.statusFile] - poll-status.json path (visibility)
 * @param {object} [deps] - injected exec/sleep/now/log for tests
 * @returns {Promise<{queuedMs: number, runningMs: number}>}
 * @throws {Error} on kernel failure, queue timeout, or run timeout
 */
export async function pollKernelStatus(kernelId, opts = {}, deps = {}) {
  const {
    runTimeoutMs = KAGGLE_TIMEOUT_MS,
    queueTimeoutMs = KAGGLE_QUEUE_TIMEOUT_MS,
    pollIntervalMs = KAGGLE_POLL_INTERVAL_MS,
    statusFile = null,
  } = opts;
  const exec = deps.exec ?? ((cmd) => execAsync(cmd));
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((msg) => console.log(msg));

  let phase = null; // null until the first status lands (so the first poll logs a transition)
  let waitStart = null; // fake-clock time the current QUEUED/UNKNOWN stretch began
  let runStart = null; // fake-clock time the current RUNNING stretch began
  let waitMs = 0;
  let runMs = 0;

  const snapshot = () => ({
    queuedMs: waitMs + (waitStart !== null ? now() - waitStart : 0),
    runningMs: runMs + (runStart !== null ? now() - runStart : 0),
  });

  while (true) {
    let raw = "";
    let execOk = false;
    try {
      const { stdout } = await exec(`kaggle kernels status ${kernelId} 2>&1`);
      raw = stdout.trim();
      execOk = true;
    } catch (e) {
      raw = (e.stdout || e.message || "unknown").trim();
    }
    const firstLine = raw.split("\n")[0];
    // Non-zero CLI exit (network hiccup, 404 while QUEUED) is not kernel truth
    // (#250 review note) — downgrade to UNKNOWN and keep polling.
    const next = execOk ? classifyKernelStatus(raw) : "unknown";

    if (next !== phase) {
      if (next === "running") {
        if (waitStart !== null) {
          waitMs += now() - waitStart;
          waitStart = null;
        }
        runStart = now();
      } else if (next === "queued" || next === "unknown") {
        if (runStart !== null) {
          runMs += now() - runStart;
          runStart = null;
        }
        if (waitStart === null) waitStart = now();
      } else {
        if (runStart !== null) {
          runMs += now() - runStart;
          runStart = null;
        }
        if (waitStart !== null) {
          waitMs += now() - waitStart;
          waitStart = null;
        }
      }
      log(`  [Kaggle] Kernel Status → ${next.toUpperCase()} (${firstLine || kernelId})`);
      phase = next;
    }

    if (statusFile) {
      writeStatusFile(statusFile, {
        kernelId,
        phase,
        status: firstLine,
        ...snapshot(),
        updatedAt: new Date(now()).toISOString(),
      });
    }

    if (phase === "complete") {
      log("  ✓ Kaggle kernel complete");
      return snapshot();
    }
    if (phase === "error" || phase === "cancel") {
      throw new Error(`Kaggle kernel failed: ${firstLine}`);
    }

    if (waitStart !== null) {
      const waited = now() - waitStart;
      if (waited > queueTimeoutMs) {
        throw new Error(
          `Kaggle kernel waiting for ${fmtDuration(waited)} — exceeded queue timeout ` +
            `(${Math.round(queueTimeoutMs / 60000)}min). Another kernel holds Kaggle's single ` +
            `free-tier GPU session (${kernelId} still ${phase.toUpperCase()}). ` +
            `NOT auto-falling back (ADR-0019 quality red line) — decide manually: ` +
            `wait and re-run, or set TTS_ENGINE explicitly.`,
        );
      }
      if (phase === "queued") {
        log(
          `  ⏳ [Kaggle] Kernel Status: QUEUED (waiting in line ${fmtDuration(waited)}, ` +
            `queue budget ${Math.round(queueTimeoutMs / 60000)}min)`,
        );
      } else {
        log(`  ⏳ [Kaggle] Kernel Status: ${phase.toUpperCase()} (${firstLine})`);
      }
    }
    if (runStart !== null) {
      const ran = now() - runStart;
      if (ran > runTimeoutMs) {
        throw new Error(
          `Kaggle kernel timed out after ${fmtDuration(ran)} of RUNNING ` +
            `(run timeout ${Math.round(runTimeoutMs / 60000)}min)`,
        );
      }
      log(`  ⏳ [Kaggle] Kernel Status: RUNNING (${fmtDuration(ran)} elapsed)`);
    }
    await sleep(pollIntervalMs);
  }
}

/**
 * Create CosyVoice3 Kaggle CUDA engine instance.
 *
 * Batch semantics (#241): ONE kernel push carries the whole manifest — the
 * ~5min kernel setup (pip install + model load) is the dominant cost, so all
 * pending scenes go up in a single push; the self-heal retry (registry) then
 * re-pushes only the failed scenes' manifest.
 *
 * @param {object} [deps] - injectable seams for tests (default: real CLI).
 * @param {(cmd: string) => Promise<{stdout: string}>} [deps.exec] - shell command runner
 * @param {typeof pollKernelStatus} [deps.poll] - kernel status poller
 * @param {typeof postProcessBatch} [deps.postProcess] - per-scene audio post-process
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createCosyVoice3KaggleCudaEngine(deps = {}) {
  if (!(await isAvailable())) return null;

  const username = getKaggleUsername();
  const kernelId = `${username}/${KAGGLE_KERNEL_SLUG}`;
  const runCmd = deps.exec ?? ((cmd) => execAsync(cmd));
  const poll = deps.poll ?? pollKernelStatus;
  const postProcess = deps.postProcess ?? postProcessBatch;

  return {
    name: "cosyvoice3-kaggle-cuda",
    info: `CosyVoice3-Kaggle-CUDA (P100, cloned from ${CV3_REF_AUDIO})`,
    useSilenceFilter: false,
    resample: true,

    async generate(scenes, outputDir) {
      const manifest = buildCV3CudaManifest(scenes);

      for (const s of scenes) {
        const instruct = resolveInstructForScene(s);
        if (instruct) {
          const style = s.refStyle || s.visualType;
          console.log(`  🎭 Scene ${s.id}: ${style} → emotion instruct (CUDA)`);
        }
      }

      // ── Prepare Kaggle kernel ──
      const template = readFileSync(KAGGLE_KERNEL_TEMPLATE, "utf-8");
      const manifestJson = JSON.stringify(manifest);

      const kernelScript = template
        .replaceAll("__MANIFEST_JSON__", manifestJson);

      const tempDir = join(outputDir, ".kaggle-kernel");
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(join(tempDir, "cosyvoice3_cuda_kernel.py"), kernelScript);
      writeFileSync(
        join(tempDir, "kernel-metadata.json"),
        JSON.stringify(
          {
            id: kernelId,
            title: KAGGLE_KERNEL_SLUG,
            code_file: "cosyvoice3_cuda_kernel.py",
            language: "python",
            kernel_type: "script",
            is_private: true,
            enable_gpu: true,
            enable_internet: true,
            dataset_sources: ["xPabloLI/tts-ref-audio", "xPabloLI/cosyvoice3-model"],
            competition_sources: [],
            kernel_sources: [],
          },
          null,
          2,
        ),
      );

      // ── Push kernel (single push for the whole manifest, #241) ──
      console.log(`  📤 Pushing Kaggle kernel (${manifest.length} segments, 1 push)...`);
      await runCmd(`kaggle kernels push -p "${tempDir}" 2>&1`);

      // ── Poll status ──
      console.log(
        `  ⏳ Waiting for Kaggle kernel (queue budget ${Math.round(KAGGLE_QUEUE_TIMEOUT_MS / 60000)}min, ` +
          `run timeout ${Math.round(KAGGLE_TIMEOUT_MS / 60000)}min)...`,
      );
      // poll-status.json: QUEUED/RUNNING phase + metering for background runs (#250)
      await poll(kernelId, { statusFile: join(tempDir, "poll-status.json") });

      // ── Download output ──
      const kaggleOutputDir = join(tempDir, "kaggle-output");
      mkdirSync(kaggleOutputDir, { recursive: true });
      console.log("  📥 Downloading Kaggle kernel output...");
      try {
        await runCmd(`kaggle kernels output ${kernelId} -p "${kaggleOutputDir}" 2>&1`);
      } catch (e) {
        throw new Error(`Failed to download Kaggle output: ${e.message}`);
      }

      // ── Read summary ──
      const summaryPath = join(kaggleOutputDir, "output", "summary.json");
      if (!existsSync(summaryPath)) {
        throw new Error("Kaggle kernel did not produce summary.json");
      }
      const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
      const failed = summary.segments.filter((s) => s.error);
      if (failed.length > 0) {
        console.error(
          `  ⚠️ ${failed.length} segments failed: ${failed.map((f) => `scene-${f.sceneId}`).join(", ")}`,
        );
      }

      // ── Post-process ──
      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const finalResults = [];
      for (const s of summary.segments) {
        if (s.error) continue;
        const srcPath = join(kaggleOutputDir, "output", s.output);
        if (!existsSync(srcPath)) {
          console.error(`  Scene ${s.sceneId}: output file missing (${s.output})`);
          continue;
        }
        const destPath = join(outputDir, s.output);
        const { copyFileSync } = await import("fs");
        copyFileSync(srcPath, destPath);

        // Rubberband prosody OFF by default: the user-approved P100 samples
        // were plain instruct2 output. Pitch/tempo shifting audibly changes
        // timbre (hook accent drift, CTA mismatch vs approved baseline).
        // Opt back in with TTS_PROSODY=1; global pace stays available via
        // TTS_ATEMPO (post-process.mjs) without touching pitch.
        const scene = scenes.find((sc) => sc.id === s.sceneId);
        const prosody =
          process.env.TTS_PROSODY === "1" && scene
            ? getProsodyProfile(scene.refStyle || scene.visualType)
            : null;
        const duration = await postProcess(destPath, {
          useSilenceFilter: false,
          resample: true,
          prosody,
        });
        finalResults.push({ sceneId: s.sceneId, audioPath: destPath, duration });
        console.log(`  Scene ${s.sceneId}: ${duration.toFixed(2)}s`);
      }

      if (finalResults.length === 0) {
        throw new Error("No successful TTS results from Kaggle kernel");
      }

      return finalResults;
    },
  };
}
