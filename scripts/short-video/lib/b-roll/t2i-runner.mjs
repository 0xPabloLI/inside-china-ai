/**
 * Z-Image Turbo (mflux, MLX) text-to-image runner for the B-roll stage (#155).
 *
 * Implements the same {ok, fatal, results[]} protocol as runner.mjs (the
 * FastVideo video runner) so the orchestrator can dispatch on strategy
 * without knowing either implementation. Responsibilities: dependency
 * probing (mflux binary), per-job CLI arg building, spawning the mflux CLI
 * sequentially, and translating spawn/exit/output-existence into structured
 * per-job outcomes. Never throws for expected failure modes — callers get
 * per-job { ok: false, error } and decide how to degrade.
 *
 * Backend contract (#155): `negative_prompt` is carried in the job spec and
 * passed to the CLI ONLY when the backend actually encodes it. Z-Image Turbo
 * is guidance-distilled (CFG disabled) — mflux accepts --negative-prompt on
 * this path but warns and never encodes it (the same architectural drop as
 * FLUX schnell/dev, mflux issue #498). The NEGATIVE clauses still ride the
 * composed prompt from prompt-injection.mjs, where they act on CFG-capable
 * backends (Z-Image base, SD3.5); on the Turbo default path image quality is
 * backstopped by the VLM relevance gate instead. This trade-off is recorded
 * in docs/video-workflow.md → "AI Image (T2I) generation".
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_IMAGE_BACKEND = "mflux-z-image-turbo";
// Default install locations, probed in order. mflux's dependency floor
// (huggingface-hub>=1.1.6, pillow>=12.3) conflicts with the TTS packages in
// the shared ~/.video-tts-env (mlx-audio needs transformers<5, pillow<12),
// so the supported install is the dedicated ~/.video-t2i-env venv — the
// shared-venv path stays in the probe for setups where the conflict has been
// resolved deliberately.
export const MFLUX_BIN_CANDIDATES = [
  join(homedir(), ".video-t2i-env", "bin", "mflux-generate-z-image-turbo"),
  join(homedir(), ".video-tts-env", "bin", "mflux-generate-z-image-turbo"),
];
export const DEFAULT_MFLUX_BIN = MFLUX_BIN_CANDIDATES[0];
// The pre-quantized 4-bit checkpoint — a fraction of the ~31 GB full-precision
// Z-Image weights, and the variant the M3 Max ~30s/image measurement used.
export const DEFAULT_IMAGE_MODEL = "filipstrand/Z-Image-Turbo-mflux-4bit";
// Portrait native, matching the b-roll video's 9:16 frame.
export const DEFAULT_IMAGE_WIDTH = 832;
export const DEFAULT_IMAGE_HEIGHT = 1216;
// Z-Image Turbo is distilled to 9 steps (mflux README example).
export const DEFAULT_IMAGE_STEPS = 9;
// Measured ≈30s per 4-bit image on M3 Max; the CLI estimate prints from this.
export const EST_SECONDS_PER_IMAGE = 30;
// One image is quick once weights are loaded, but a cold first run downloads
// several GB before the first denoise — the timeout covers that on purpose.
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

// Backends whose sampler actually encodes a negative prompt (CFG-capable).
// Anything distilled (Turbo variants, FLUX schnell/dev) must NOT receive the
// flag — mflux would print an "ignored option" warning on every job.
const NEGATIVE_PROMPT_BACKENDS = new Set(["mflux-z-image", "sd3.5"]);

export function supportsNegativePrompt(backend) {
  return NEGATIVE_PROMPT_BACKENDS.has(backend);
}

/**
 * Probe the mflux dependency. Environment overrides:
 * - AI_IMAGE_BACKEND — backend key (default mflux-z-image-turbo); decides the
 *   negative-prompt contract, not the binary.
 * - MFLUX_BIN — explicit binary override, honored strictly (no fallback
 *   probing when set).
 * Without an override, probes MFLUX_BIN_CANDIDATES (~/.video-t2i-env first,
 * then ~/.video-tts-env) then PATH (which).
 * Returns { ok, backend, bin, missing[], message }.
 */
export function resolveImageDependencies(env = process.env) {
  const backend = env.AI_IMAGE_BACKEND || DEFAULT_IMAGE_BACKEND;
  let bin = null;
  let missing = [];
  if (env.MFLUX_BIN) {
    bin = env.MFLUX_BIN;
    if (!existsSync(bin)) missing.push("bin");
  } else {
    bin = MFLUX_BIN_CANDIDATES.find((c) => existsSync(c)) ?? null;
  }
  if (!bin) {
    // PATH probe honors the caller's env (tests stub PATH).
    const which = spawnSync("which", ["mflux-generate-z-image-turbo"], {
      encoding: "utf8",
      env: { ...env },
    });
    bin = which.status === 0 ? which.stdout.trim().split("\n")[0] : null;
    if (!bin) missing.push("bin");
  }
  if (missing.length > 0) {
    return {
      ok: false,
      backend,
      bin,
      missing,
      message:
        `mflux binary not found (probed MFLUX_BIN, ${MFLUX_BIN_CANDIDATES.join(", ")}, PATH). ` +
        "Install mflux first: python3 -m venv ~/.video-t2i-env && ~/.video-t2i-env/bin/pip install mflux " +
        "(its dependency floor conflicts with the TTS pins in ~/.video-tts-env), " +
        "or point MFLUX_BIN at mflux-generate-z-image-turbo; skipping AI image generation.",
    };
  }
  return { ok: true, backend, bin, missing, message: null };
}

/**
 * CLI args for one image job. `negativePrompt` reaches the CLI only on
 * CFG-capable backends (see module docstring for why that matters).
 */
export function buildImageArgs(opts) {
  const {
    prompt,
    outputPath,
    seed,
    width = DEFAULT_IMAGE_WIDTH,
    height = DEFAULT_IMAGE_HEIGHT,
    steps = DEFAULT_IMAGE_STEPS,
    model = DEFAULT_IMAGE_MODEL,
    backend = DEFAULT_IMAGE_BACKEND,
    negativePrompt = "",
  } = opts;
  const args = [
    "--prompt",
    prompt,
    "--output",
    outputPath,
    "--seed",
    String(seed),
    "--width",
    String(width),
    "--height",
    String(height),
    "--steps",
    String(steps),
  ];
  // Unset model → mflux resolves its own default checkpoint.
  if (model) args.push("--model", model);
  if (negativePrompt && supportsNegativePrompt(backend)) {
    args.push("--negative-prompt", negativePrompt);
  }
  return args;
}

function envInt(env, name, fallback) {
  const raw = env?.[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Run one image generation batch: jobs spawn sequentially (one mflux process
 * per job — the CLI loads the model per invocation, and a failed job must not
 * cost its siblings). `bin` and `scriptPath` are injectable so tests can
 * substitute node + a stub script.
 *
 * @returns {Promise<{ok: boolean, fatal: string|null,
 *   results: Array<{label: string, ok: boolean, file: string, error: string|null}>}>}
 */
export function runImageGeneration(opts) {
  const {
    bin,
    scriptPath = null,
    backend = DEFAULT_IMAGE_BACKEND,
    jobs,
    workDir,
    // Env overrides (AI_IMAGE_WIDTH / AI_IMAGE_HEIGHT / AI_IMAGE_STEPS /
    // AI_IMAGE_MODEL) sit under the explicit opts, above the module defaults.
    width = envInt(opts.env, "AI_IMAGE_WIDTH", DEFAULT_IMAGE_WIDTH),
    height = envInt(opts.env, "AI_IMAGE_HEIGHT", DEFAULT_IMAGE_HEIGHT),
    steps = envInt(opts.env, "AI_IMAGE_STEPS", DEFAULT_IMAGE_STEPS),
    model = opts.env?.AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    negativePrompt = "",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onProgress = null,
    env = process.env,
  } = opts;

  mkdirSync(workDir, { recursive: true });

  function runOne(job) {
    return new Promise((resolve) => {
      const args = [
        ...(scriptPath ? [scriptPath] : []),
        ...buildImageArgs({
          prompt: job.prompt,
          outputPath: job.output_path,
          seed: job.seed,
          width,
          height,
          steps,
          model,
          backend,
          negativePrompt,
        }),
      ];

      let stderr = "";
      let settled = false;
      const child = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        // Offline by default, same rationale as the video runner: a warm HF
        // cache must never silently re-download. First-time setup opts out
        // with HF_HUB_OFFLINE=0 (or pre-downloads the checkpoint).
        env: { ...env, HF_HUB_OFFLINE: env.HF_HUB_OFFLINE || "1" },
      });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          child.kill("SIGKILL");
        } catch (_e) {
          // ignore
        }
        resolve({
          label: job.label,
          ok: false,
          file: job.output_path,
          error: `generation timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      child.stdout.on("data", (d) => {
        if (!onProgress) return;
        for (const raw of d.toString().split("\n")) {
          const line = raw.trimEnd();
          if (line) onProgress(line);
        }
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ label: job.label, ok: false, file: job.output_path, error: `spawn failed: ${error.message}` });
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          const tail = stderr.split("\n").filter(Boolean).slice(-5).join("\n");
          resolve({
            label: job.label,
            ok: false,
            file: job.output_path,
            error: `mflux exited with code ${code}: ${tail}`,
          });
          return;
        }
        if (!existsSync(job.output_path)) {
          resolve({
            label: job.label,
            ok: false,
            file: job.output_path,
            error: "output file missing",
          });
          return;
        }
        resolve({ label: job.label, ok: true, file: job.output_path, error: null });
      });
    });
  }

  return (async () => {
    const results = [];
    for (const job of jobs) {
      results.push(await runOne(job));
    }
    // Batch-level ok stays true: failures are per-job outcomes the
    // orchestrator reads off results[] (same shape the video runner emits
    // for individually failed jobs).
    return { ok: true, fatal: null, results };
  })();
}
