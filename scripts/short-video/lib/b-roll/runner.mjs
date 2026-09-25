/**
 * FastVideo (MLX) generation runner for the B-roll stage.
 *
 * Responsibilities: dependency probing (repo + python), jobs-file writing,
 * spawning the tier's batch driver (mlx_wan22_batch.py for the 5B default,
 * mlx_wan_batch.py for the legacy 1.3B), and translating the result protocol
 * into structured per-job outcomes. Never throws for expected failure modes —
 * callers get { ok: false, fatal } and decide how to degrade.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BROLL_DIR = dirname(fileURLToPath(import.meta.url));
const SHORT_VIDEO_DIR = join(BROLL_DIR, "..", "..");
export const DEFAULT_REPO = join(SHORT_VIDEO_DIR, "experiments", "fastvideo-spike", "repo");
export const DEFAULT_PYTHON = join(DEFAULT_REPO, ".venv", "bin", "python3");
const FALLBACK_PYTHON = join(homedir(), ".video-tts-env", "bin", "python3");
export const DEFAULT_SCRIPT = join(BROLL_DIR, "mlx_wan_batch.py");
export const JOBS_FILENAME = "b-roll-jobs.json";
// The batch script's machine-readable summary line — never forwarded as
// human progress.
const RESULTS_PREFIX = "[batch][results]";
export const RESULT_PREFIX = `${RESULTS_PREFIX} `;

// Text-encoder token limit — the batch script truncates silently at this
// length. prompt-injection.mjs derives its generation-side budget from it.
export const MAX_SEQUENCE_LENGTH = 512;

/**
 * Model tiers (#298). `fastmetal-5b` (Wan2.2 TI2V 5B) is the pipeline default
 * after the #298 eval (claim gate 85.0 vs 83.75, quality 76/80 vs 73/80,
 * native 720p); `fastmetal-1.3b` stays selectable as the legacy escape hatch.
 * `winnerSource` labels the report's generated-media provenance.
 */
export const DEFAULT_MODEL_TIER = "fastmetal-5b";
export const MODEL_TIERS = {
  "fastmetal-5b": {
    script: join(BROLL_DIR, "mlx_wan22_batch.py"),
    height: 1280,
    width: 704,
    numFrames: 121,
    fps: 24,
    flowShift: 5.0,
    mlxQuantization: null, // FastMetal-5B-QAD ships pre-quantized
    maxSequenceLength: null, // the 5B driver pins 512 internally
    // M2 Pro measured: 459-595s/clip + model load + decode margin.
    estSecondsPerClip: 600,
    winnerSource: "AI-generated (FastVideo FastMetal-5B-QAD)",
    // The taehv decoder weights live outside the HF cache and are fetched
    // from raw.githubusercontent.com at runtime — not covered by
    // HF_HUB_OFFLINE, so the offline contract needs them prefetched.
    taehvDecoder: "taew2_2.pth",
    // The 5B driver has no --model-root flag; the pinned model root instead
    // doubles as the UMT5 text-encoder root WHEN it actually ships encoder
    // weights (our 5B snapshot ships text_encoder/ config only — see
    // #298 eval report). Guarded by hasTextEncoderWeights().
    usesModelRoot: false,
  },
  "fastmetal-1.3b": {
    script: DEFAULT_SCRIPT,
    height: 832,
    width: 480,
    numFrames: 81,
    fps: 16,
    flowShift: 8.0,
    mlxQuantization: "int8",
    maxSequenceLength: MAX_SEQUENCE_LENGTH,
    // Spike-measured wall time per clip on M3 Max (int8/taehv, 832x480x81f).
    estSecondsPerClip: 240,
    winnerSource: "AI-generated (FastVideo FastMetal-1.3B-QAD)",
    taehvDecoder: "taew2_1.pth",
    usesModelRoot: true,
  },
};

export function resolveModelTier(env = process.env) {
  const requested = env.BROLL_MODEL || DEFAULT_MODEL_TIER;
  return MODEL_TIERS[requested] ? requested : DEFAULT_MODEL_TIER;
}

/**
 * Per-tier clip time estimate for the CLI's total-time printout (#298: 5B
 * measures ~600s/clip on M2 Pro vs 240s for the 1.3B).
 */
export function estSecondsPerClip(tier = DEFAULT_MODEL_TIER) {
  return (MODEL_TIERS[tier] ?? MODEL_TIERS[DEFAULT_MODEL_TIER]).estSecondsPerClip;
}
// 6 clips x ~4-5min + model load + decode margin.
const DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000;
// Markers of a packed MLX DiT directory. Mirrors
// fastvideo.mlx_runtime.checkpoint_compat so a misconfigured
// BROLL_MLX_CHECKPOINT fails here with a readable message instead of deep
// inside the python run (or, worse, after a fresh 1.5 GB download).
const MLX_DIT_MANIFEST = "mlx_dit.json";
const MLX_DIT_WEIGHTS = "mlx_dit.safetensors";

function isPackedMlxCheckpoint(dir) {
  return existsSync(join(dir, MLX_DIT_MANIFEST)) && existsSync(join(dir, MLX_DIT_WEIGHTS));
}

/**
 * True when dir/text_encoder/ actually holds weight shards (not just config).
 * Our FastMetal-5B-QAD cache ships the encoder directory with config only —
 * the 11.4GB of UMT5 shards were deliberately skipped (#298 eval report).
 */
function hasTextEncoderWeights(dir) {
  if (!dir) return false;
  const encoderDir = join(dir, "text_encoder");
  if (!existsSync(encoderDir)) return false;
  try {
    return readdirSync(encoderDir).some((f) => f.endsWith(".safetensors"));
  } catch {
    return false;
  }
}

/**
 * Probe FastVideo dependencies. Environment overrides: FASTVIDEO_REPO,
 * FASTVIDEO_PYTHON (an explicit python override is honored strictly — no
 * fallback probing when it is set), BROLL_MODEL_ROOT, BROLL_MLX_CHECKPOINT
 * (the last two pin the weights instead of re-resolving the HF cache every
 * batch), and BROLL_MODEL (tier: "fastmetal-5b" default | "fastmetal-1.3b").
 * Without an override, probes <repo>/.venv/bin/python3 then
 * ~/.video-tts-env/bin/python3.
 * Returns { ok, tier, repo, python, modelRoot, mlxCheckpoint, missing[], message };
 * modelRoot/mlxCheckpoint are null when unpinned. For the 5B tier the taehv
 * decoder weights (taew2_2.pth, runtime-fetched outside the HF cache) must be
 * prefetched or the offline batch fails deep inside the python run.
 */
export function resolveDependencies(env = process.env) {
  const repo = env.FASTVIDEO_REPO || DEFAULT_REPO;
  const python = env.FASTVIDEO_PYTHON
    ? env.FASTVIDEO_PYTHON
    : ([join(repo, ".venv", "bin", "python3"), FALLBACK_PYTHON].find((p) => existsSync(p)) ??
      DEFAULT_PYTHON);
  const modelRoot = env.BROLL_MODEL_ROOT || null;
  const mlxCheckpoint = env.BROLL_MLX_CHECKPOINT || null;
  const tier = resolveModelTier(env);
  const missing = [];
  const parts = [];
  if (!existsSync(repo)) {
    missing.push("repo");
    parts.push(`FastVideo repo not found at ${repo}`);
  }
  if (!existsSync(python)) {
    missing.push("python");
    parts.push(`python interpreter not found at ${python}`);
  }
  if (modelRoot && !existsSync(modelRoot)) {
    missing.push("modelRoot");
    parts.push(`BROLL_MODEL_ROOT not found at ${modelRoot}`);
  }
  if (mlxCheckpoint && !isPackedMlxCheckpoint(mlxCheckpoint)) {
    missing.push("mlxCheckpoint");
    parts.push(
      `BROLL_MLX_CHECKPOINT at ${mlxCheckpoint} is not a packed MLX DiT ` +
        `(expected ${MLX_DIT_MANIFEST} and ${MLX_DIT_WEIGHTS})`,
    );
  }
  // 5B-only probe (the 1.3B path predates the offline contract and is left
  // untouched): the taehv decoder lives outside the HF cache. Uses the
  // RESOLVED tier — an invalid BROLL_MODEL value must not silently skip it.
  if (tier === DEFAULT_MODEL_TIER) {
    const decoder = join(homedir(), ".cache", "fastvideo", "taehv", MODEL_TIERS[tier].taehvDecoder);
    if (!existsSync(decoder)) {
      missing.push("taehvDecoder");
      parts.push(
        `taehv decoder weights not found at ${decoder} ` +
          "(the 5B batch runs with HF_HUB_OFFLINE=1; prefetch per the #298 eval report)",
      );
    }
  }
  if (missing.length > 0) {
    const hints = [];
    if (missing.includes("repo") || missing.includes("python")) {
      hints.push(
        "Set FASTVIDEO_REPO / FASTVIDEO_PYTHON or install the fastvideo-spike environment",
      );
    }
    if (missing.includes("modelRoot") || missing.includes("mlxCheckpoint")) {
      hints.push(
        "fix or unset BROLL_MODEL_ROOT / BROLL_MLX_CHECKPOINT to fall back to the HF cache",
      );
    }
    if (missing.includes("taehvDecoder")) {
      hints.push("prefetch the taehv decoder weights (see lib/b-roll/t2v-eval / #298)");
    }
    return {
      ok: false,
      tier,
      repo,
      python,
      modelRoot,
      mlxCheckpoint,
      missing,
      message: `${parts.join("; ")}. ${hints.join("; ")}; skipping B-roll generation.`,
    };
  }
  return { ok: true, tier, repo, python, modelRoot, mlxCheckpoint, missing, message: null };
}

/**
 * Tier A (M3 Max safe) defaults: portrait 480x832, 81 frames, int8, taehv,
 * DMD 3-step schedule. Null-valued mlxQuantization/maxSequenceLength omit
 * the flag entirely (the 5B driver ships pre-quantized and pins 512
 * internally); flowShift is only passed when provided.
 */
export function buildPythonArgs(opts) {
  const {
    repo,
    jobsFile,
    height = 832,
    width = 480,
    numFrames = 81,
    fps = 16,
    mlxQuantization = "int8",
    decodeBackend = "taehv",
    dmdDenoisingSteps = "1000,757,522",
    maxSequenceLength = MAX_SEQUENCE_LENGTH,
    flowShift = null,
    textEncoderRoot = null,
    modelRoot = null,
    mlxCheckpoint = null,
  } = opts;
  // Omitted when unset so python falls back to resolve_model_root(None), which
  // reads whatever snapshot the local HF cache already holds.
  const modelArgs = [
    ...(modelRoot ? ["--model-root", modelRoot] : []),
    ...(mlxCheckpoint ? ["--mlx-checkpoint", mlxCheckpoint] : []),
    ...(textEncoderRoot ? ["--text-encoder-root", textEncoderRoot] : []),
    ...(flowShift !== null ? ["--flow-shift", String(flowShift)] : []),
  ];
  return [
    "--repo",
    repo,
    "--jobs",
    jobsFile,
    ...modelArgs,
    "--height",
    String(height),
    "--width",
    String(width),
    "--num-frames",
    String(numFrames),
    "--fps",
    String(fps),
    ...(mlxQuantization !== null
      ? ["--mlx-quantization", mlxQuantization]
      : []),
    "--decode-backend",
    decodeBackend,
    "--dmd-denoising-steps",
    dmdDenoisingSteps,
    ...(maxSequenceLength !== null
      ? ["--max-sequence-length", String(maxSequenceLength)]
      : []),
  ];
}

function parseResultsLine(stdout) {
  const lines = stdout.split("\n").filter((l) => l.startsWith(RESULT_PREFIX));
  if (lines.length === 0) return null;
  try {
    const parsed = JSON.parse(lines[lines.length - 1].slice(RESULT_PREFIX.length));
    if (!parsed || !Array.isArray(parsed.ok) || !Array.isArray(parsed.failed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Run one generation batch. `python` and `scriptPath` are injectable so tests
 * can substitute a stub that speaks the result protocol. Tier defaults
 * (geometry, script, flow-shift, quantization) come from MODEL_TIERS via
 * opts.tier / BROLL_MODEL; explicit opts override the tier.
 *
 * @returns {Promise<{ok: boolean, fatal: string|null,
 *   results: Array<{label: string, ok: boolean, file: string, error: string|null}>}>}
 */
export function runGeneration(opts) {
  const {
    python,
    scriptPath = null,
    repo,
    jobs,
    workDir,
    height = null,
    width = null,
    numFrames = null,
    fps = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onProgress = null,
    env = process.env,
    modelRoot = null,
    mlxCheckpoint = null,
    textEncoderRoot = null,
    tier = resolveModelTier(env),
  } = opts;
  const t = MODEL_TIERS[tier] ?? MODEL_TIERS[DEFAULT_MODEL_TIER];

  mkdirSync(workDir, { recursive: true });
  const jobsFile = join(workDir, JOBS_FILENAME);
  writeFileSync(jobsFile, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");

  // 5B: the pinned model root doubles as the UMT5 encoder root ONLY when it
  // actually ships encoder weights. A user pinning BROLL_MODEL_ROOT at the
  // 5B snapshot (config-only text_encoder/ in our cache) must fall back to
  // the driver's own 1.3B-encoder resolution, not crash offline.
  const encoderRoot =
    textEncoderRoot ??
    (t.usesModelRoot ? null : hasTextEncoderWeights(modelRoot) ? modelRoot : null);

  const args = [
    scriptPath ?? t.script,
    ...buildPythonArgs({
      repo,
      jobsFile,
      height: height ?? t.height,
      width: width ?? t.width,
      numFrames: numFrames ?? t.numFrames,
      fps: fps ?? t.fps,
      mlxQuantization: t.mlxQuantization,
      maxSequenceLength: t.maxSequenceLength,
      flowShift: t.flowShift,
      // 5B only: the 1.3B driver has no --text-encoder-root flag.
      textEncoderRoot: t.usesModelRoot ? null : encoderRoot,
      modelRoot: t.usesModelRoot ? modelRoot : null, // the 5B driver has no --model-root
      mlxCheckpoint,
    }),
  ];

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const failAll = (fatal) => ({
      ok: false,
      fatal,
      results: jobs.map((j) => ({
        label: j.label,
        ok: false,
        file: j.output_path,
        error: fatal,
      })),
    });

    const child = spawn(python, args, {
      stdio: ["ignore", "pipe", "pipe"],
      // Offline by default: the FastVideo model lives in the local HF cache,
      // and without this every batch pays a revision check to huggingface.co
      // (and a cache miss would silently download weights). HF_HUB_OFFLINE=0
      // opts back in.
      env: { ...env, PYTHONUNBUFFERED: "1", HF_HUB_OFFLINE: env.HF_HUB_OFFLINE || "1" },
    });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill("SIGKILL");
        } catch (_e) {
          // ignore
        }
        resolve(failAll(`generation timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    let stdTail = "";
    child.stdout.on("data", (d) => {
      const text = d.toString();
      stdout += text;
      if (!onProgress) return;
      stdTail += text;
      const lines = stdTail.split("\n");
      stdTail = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (line && !line.startsWith(RESULTS_PREFIX)) onProgress(line);
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(failAll(`spawn failed: ${error.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        const tail = (stderr || stdout).split("\n").filter(Boolean).slice(-5).join("\n");
        resolve(failAll(`generation exited with code ${code}: ${tail}`));
        return;
      }

      const parsed = parseResultsLine(stdout);
      const failedByLabel = new Map();
      if (parsed) {
        for (const f of parsed.failed) {
          failedByLabel.set(f.label, f.error ?? "unknown error");
        }
      }

      const results = jobs.map((job) => {
        if (failedByLabel.has(job.label)) {
          return {
            label: job.label,
            ok: false,
            file: job.output_path,
            error: failedByLabel.get(job.label),
          };
        }
        if (parsed && !parsed.ok.includes(job.label)) {
          return {
            label: job.label,
            ok: false,
            file: job.output_path,
            error: "not reported by batch runner",
          };
        }
        if (!existsSync(job.output_path)) {
          return {
            label: job.label,
            ok: false,
            file: job.output_path,
            error: "output file missing",
          };
        }
        return { label: job.label, ok: true, file: job.output_path, error: null };
      });

      resolve({ ok: true, fatal: null, results });
    });
  });
}

/** Read back a jobs file (used by report/debug tooling). */
export function readJobsFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
