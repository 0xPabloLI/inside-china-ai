/**
 * Boogu Image Turbo (mflux, MLX) text-to-image runner for the B-roll stage (#155).
 *
 * Implements the same {ok, fatal, results[]} protocol as runner.mjs (the
 * FastVideo video runner) so the orchestrator can dispatch on strategy
 * without knowing either implementation. Responsibilities: dependency
 * probing (mflux binary), per-job CLI arg building, spawning the mflux CLI
 * sequentially, and translating spawn/exit/output-existence into structured
 * per-job outcomes. Never throws for expected failure modes — callers get
 * per-job { ok: false, error } and decide how to degrade.
 *
 * Backend contract (#155, #1028): `AI_IMAGE_BACKEND` selects the whole
 * backend through `IMAGE_BACKEND_SPECS` — the mflux CLI to probe, the default
 * checkpoint, the default step count and whether `--negative-prompt` is
 * encoded. `MFLUX_BIN` / `AI_IMAGE_MODEL` / `AI_IMAGE_STEPS` remain explicit
 * overrides. An unknown backend key fails closed instead of silently running
 * the Boogu default (same ruling as `BROLL_MODEL` in #922). Boogu Image Turbo
 * is guidance-distilled (CFG disabled) — mflux accepts --negative-prompt on
 * this path but warns and never encodes it. The NEGATIVE clauses still ride
 * the composed prompt from prompt-injection.mjs, where they act on CFG-capable
 * backends (Z-Image base, SD3.5); on the Turbo default path image quality is
 * backstopped by the VLM relevance gate instead. This trade-off is recorded
 * in docs/video-production-runbook.md → "AI Image (T2I) generation".
 *
 * Model: Boogu/Boogu-Image-0.1-Turbo — 10B params, Apache 2.0, CUHK + HKUST.
 * Selected via 6-model VLM comparison (2026-09-20): best prompt adherence,
 * zero "no hands" violations across 3 test prompts. ~364s/image on M2 Pro 32GB
 * with 4-bit quantization.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * #1028: one backend key decides the entire generation path. Values were
 * checked against the installed mflux 0.20.0 on 2026-11-09:
 * - `z-image` is the CFG-capable built-in of `mflux-generate-z-image`
 *   (Tongyi-MAI/Z-Image), whose mflux default is 50 steps. The Turbo sibling
 *   is guidance-distilled and would silently drop --negative-prompt.
 * - `sd3.5` has NO CLI and NO built-in model in mflux 0.20.0. The spec keeps
 *   the key wired, but dependency probing fails closed until an mflux build
 *   shipping `mflux-generate-sd3.5` is installed; its checkpoint/steps come
 *   from the #1028 triage proposal and are NOT locally verified.
 */
export const IMAGE_BACKEND_SPECS = Object.freeze({
  "mflux-boogu": Object.freeze({
    binName: "mflux-generate-boogu",
    defaultModel: "Boogu/Boogu-Image-0.1-Turbo",
    defaultSteps: 4,
    supportsNegativePrompt: false,
  }),
  "mflux-z-image": Object.freeze({
    binName: "mflux-generate-z-image",
    defaultModel: "z-image",
    defaultSteps: 50,
    supportsNegativePrompt: true,
  }),
  "sd3.5": Object.freeze({
    binName: "mflux-generate-sd3.5",
    defaultModel: "stabilityai/stable-diffusion-3.5-medium",
    defaultSteps: 20,
    supportsNegativePrompt: true,
  }),
});

export const DEFAULT_IMAGE_BACKEND = "mflux-boogu";

/** Fail-closed lookup: an unknown backend must never fall back to Boogu. */
export function imageBackendSpec(backend = DEFAULT_IMAGE_BACKEND) {
  const spec = IMAGE_BACKEND_SPECS[backend];
  if (!spec) {
    throw new Error(
      `Unknown AI_IMAGE_BACKEND "${backend}" — known backends: ${Object.keys(IMAGE_BACKEND_SPECS).join(", ")}`,
    );
  }
  return spec;
}

// Default install locations, probed in order. mflux's dependency floor
// (huggingface-hub>=1.1.6, pillow>=12.3) conflicts with the TTS packages in
// the shared ~/.video-tts-env (mlx-audio needs transformers<5, pillow<12),
// so the supported install is the dedicated ~/.video-t2i-env venv — the
// shared-venv path stays in the probe for setups where the conflict has been
// resolved deliberately. Each backend derives its own CLI name (#1028).
export function mfluxBinCandidates(backend = DEFAULT_IMAGE_BACKEND, home = homedir()) {
  const { binName } = imageBackendSpec(backend);
  return [
    join(home, ".video-t2i-env", "bin", binName),
    join(home, ".video-tts-env", "bin", binName),
  ];
}
// The default backend's list, kept for legacy consumers and tests.
export const MFLUX_BIN_CANDIDATES = mfluxBinCandidates();
// Boogu-Image-0.1-Turbo: 10B params, Apache 2.0, CUHK + HKUST.
// Requires 4-bit quantization to fit in 32GB unified memory.
export const DEFAULT_IMAGE_MODEL = IMAGE_BACKEND_SPECS[DEFAULT_IMAGE_BACKEND].defaultModel;
const DEFAULT_IMAGE_QUANTIZE = 4;
// Portrait native, matching the b-roll video's 9:16 frame.
export const DEFAULT_IMAGE_WIDTH = 832;
export const DEFAULT_IMAGE_HEIGHT = 1216;
// Measured ≈364s per 4-bit image on M2 Pro 32GB; the CLI estimate prints from this.
export const EST_SECONDS_PER_IMAGE = 364;
// One image is quick once weights are loaded, but a cold first run downloads
// several GB before the first denoise — the timeout covers that on purpose.
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * #985: audience-facing provenance per checkpoint. Keyed on the model actually
 * passed to mflux. Since #1028 the backend selects that default checkpoint,
 * so the label follows a backend switch too — but `AI_IMAGE_MODEL` still wins
 * when set explicitly. Same discipline as the video MODEL_TIERS
 * winnerSource (#298): the label follows the model that ran.
 */
const IMAGE_MODEL_SOURCE_LABELS = {
  [DEFAULT_IMAGE_MODEL]: "AI-generated (mflux Boogu Turbo)",
};

/** Resolve and validate the run-level backend key (#1028, fail-closed). */
export function resolveImageBackend(env = process.env) {
  const raw = env.AI_IMAGE_BACKEND;
  const backend = (typeof raw === "string" ? raw.trim() : raw) || DEFAULT_IMAGE_BACKEND;
  imageBackendSpec(backend);
  return backend;
}

/**
 * The checkpoint that actually runs: an explicit AI_IMAGE_MODEL wins, else
 * the selected backend's default. `backend` may be passed by callers that
 * already resolved it (the orchestrator's dependency probe does).
 */
export function resolveImageModel(env = process.env, backend = resolveImageBackend(env)) {
  const raw = env.AI_IMAGE_MODEL;
  const model = typeof raw === "string" ? raw.trim() : raw;
  return model || imageBackendSpec(backend).defaultModel;
}

/**
 * Label for a checkpoint. Unknown checkpoints derive their own label rather
 * than borrowing a known model's name — a wrong attribution is worse than an
 * unfamiliar one.
 */
export function imageModelSourceLabel(model = resolveImageModel()) {
  return IMAGE_MODEL_SOURCE_LABELS[model] ?? `AI-generated (mflux ${model})`;
}

// Every image label is `AI-generated (mflux …)`, every video label
// `AI-generated (FastVideo …)` — so the runtime prefix is what distinguishes a
// trustworthy stored image provenance from the pre-#985 video-label pollution.
const IMAGE_SOURCE_PATTERN = /^AI-generated \(mflux .+\)$/;

/** True when `source` is a label this module produces for an image model. */
export function isImageSourceLabel(source) {
  return typeof source === "string" && IMAGE_SOURCE_PATTERN.test(source);
}

/**
 * Probe the mflux dependency for the selected backend. Environment overrides:
 * - AI_IMAGE_BACKEND — backend key (default mflux-boogu); #1028: decides the
 *   CLI name, default checkpoint, default steps and negative-prompt contract.
 *   An unknown key throws instead of falling back to Boogu.
 * - MFLUX_BIN — explicit binary override, honored strictly (no fallback
 *   probing when set).
 * Without an override, probes the backend's own venv candidates
 * (~/.video-t2i-env first, then ~/.video-tts-env) then PATH (which).
 * Returns { ok, backend, bin, missing[], message }.
 */
export function resolveImageDependencies(env = process.env) {
  const backend = resolveImageBackend(env);
  const { binName } = imageBackendSpec(backend);
  const candidates = mfluxBinCandidates(backend, env.HOME || homedir());
  let bin = null;
  let missing = [];
  if (env.MFLUX_BIN) {
    bin = env.MFLUX_BIN;
    if (!existsSync(bin)) missing.push("bin");
  } else {
    bin = candidates.find((c) => existsSync(c)) ?? null;
  }
  if (!bin) {
    // PATH probe honors the caller's env (tests stub PATH).
    const which = spawnSync("which", [binName], {
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
        `mflux binary not found for backend "${backend}" (${binName}); probed MFLUX_BIN, ${candidates.join(", ")}, PATH. ` +
        "Install mflux first: python3 -m venv ~/.video-t2i-env && ~/.video-t2i-env/bin/pip install mflux " +
        "(its dependency floor conflicts with the TTS pins in ~/.video-tts-env), " +
        `or point MFLUX_BIN at ${binName}; skipping AI image generation.`,
    };
  }
  return { ok: true, backend, bin, missing, message: null };
}

/**
 * CLI args for one image job. #1028: default checkpoint/steps come from the
 * selected backend. `negativePrompt` reaches the CLI only on CFG-capable
 * backends (see module docstring for why that matters).
 */
export function buildImageArgs(opts) {
  const {
    prompt,
    outputPath,
    seed,
    width = DEFAULT_IMAGE_WIDTH,
    height = DEFAULT_IMAGE_HEIGHT,
    backend = DEFAULT_IMAGE_BACKEND,
    quantize = DEFAULT_IMAGE_QUANTIZE,
    negativePrompt = "",
  } = opts;
  const spec = imageBackendSpec(backend);
  // Explicit opts (including null → "let mflux pick") still win; otherwise
  // the defaults come from the selected backend, never from Boogu.
  const steps = opts.steps === undefined ? spec.defaultSteps : opts.steps;
  const model = opts.model === undefined ? spec.defaultModel : opts.model;
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
  if (quantize) args.push("--quantize", String(quantize));
  if (negativePrompt && spec.supportsNegativePrompt) {
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
  const resolutionEnv = opts.env ?? {};
  // #1028: the backend is a run-level decision. Resolve and validate it once
  // here (and in the dependency probe) so an unknown key cannot spawn a job
  // against a backend nobody selected.
  const backend = opts.backend ?? resolveImageBackend(resolutionEnv);
  const spec = imageBackendSpec(backend);
  const {
    bin,
    scriptPath = null,
    jobs,
    workDir,
    // Env overrides (AI_IMAGE_WIDTH / AI_IMAGE_HEIGHT / AI_IMAGE_STEPS /
    // AI_IMAGE_MODEL) sit under the explicit opts, above the backend defaults.
    width = envInt(resolutionEnv, "AI_IMAGE_WIDTH", DEFAULT_IMAGE_WIDTH),
    height = envInt(resolutionEnv, "AI_IMAGE_HEIGHT", DEFAULT_IMAGE_HEIGHT),
    steps = envInt(resolutionEnv, "AI_IMAGE_STEPS", spec.defaultSteps),
    // One derivation for the checkpoint (#985) — the provenance label reads
    // the same resolver, so the label can never disagree with what is passed.
    model = resolveImageModel(resolutionEnv, backend),
    quantize = envInt(resolutionEnv, "AI_IMAGE_QUANTIZE", DEFAULT_IMAGE_QUANTIZE),
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
          quantize,
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
        resolve({
          label: job.label,
          ok: false,
          file: job.output_path,
          error: `spawn failed: ${error.message}`,
        });
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
