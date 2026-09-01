/**
 * FastVideo (Wan 1.3B, MLX) generation runner for the B-roll stage.
 *
 * Responsibilities: dependency probing (repo + python), jobs-file writing,
 * spawning lib/b-roll/mlx_wan_batch.py, and translating its result protocol
 * into structured per-job outcomes. Never throws for expected failure modes —
 * callers get { ok: false, fatal } and decide how to degrade.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
// Spike-measured wall time per clip on M3 Max (int8/taehv, 832x480x81f).
export const EST_SECONDS_PER_CLIP = 240;
// 6 clips x ~4-5min + model load + decode margin.
const DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/**
 * Probe FastVideo dependencies. Environment overrides: FASTVIDEO_REPO,
 * FASTVIDEO_PYTHON (an explicit python override is honored strictly — no
 * fallback probing when it is set). Without an override, probes
 * <repo>/.venv/bin/python3 then ~/.video-tts-env/bin/python3.
 * Returns { ok, repo, python, missing[], message }.
 */
export function resolveDependencies(env = process.env) {
  const repo = env.FASTVIDEO_REPO || DEFAULT_REPO;
  const python = env.FASTVIDEO_PYTHON
    ? env.FASTVIDEO_PYTHON
    : ([join(repo, ".venv", "bin", "python3"), FALLBACK_PYTHON].find((p) => existsSync(p)) ??
      DEFAULT_PYTHON);
  const missing = [];
  if (!existsSync(repo)) missing.push("repo");
  if (!existsSync(python)) missing.push("python");
  if (missing.length > 0) {
    const parts = [];
    if (missing.includes("repo")) parts.push(`FastVideo repo not found at ${repo}`);
    if (missing.includes("python")) parts.push(`python interpreter not found at ${python}`);
    return {
      ok: false,
      repo,
      python,
      missing,
      message:
        `${parts.join("; ")}. Set FASTVIDEO_REPO / FASTVIDEO_PYTHON or install ` +
        `the fastvideo-spike environment; skipping B-roll generation.`,
    };
  }
  return { ok: true, repo, python, missing, message: null };
}

/**
 * Tier A (M3 Max safe) defaults: portrait 480x832, 81 frames, int8, taehv,
 * DMD 3-step schedule.
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
    maxSequenceLength = 512,
  } = opts;
  return [
    "--repo",
    repo,
    "--jobs",
    jobsFile,
    "--height",
    String(height),
    "--width",
    String(width),
    "--num-frames",
    String(numFrames),
    "--fps",
    String(fps),
    "--mlx-quantization",
    mlxQuantization,
    "--decode-backend",
    decodeBackend,
    "--dmd-denoising-steps",
    dmdDenoisingSteps,
    "--max-sequence-length",
    String(maxSequenceLength),
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
 * can substitute a stub that speaks the result protocol.
 *
 * @returns {Promise<{ok: boolean, fatal: string|null,
 *   results: Array<{label: string, ok: boolean, file: string, error: string|null}>}>}
 */
export function runGeneration(opts) {
  const {
    python,
    scriptPath = DEFAULT_SCRIPT,
    repo,
    jobs,
    workDir,
    height,
    width,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onProgress = null,
    env = process.env,
  } = opts;

  mkdirSync(workDir, { recursive: true });
  const jobsFile = join(workDir, JOBS_FILENAME);
  writeFileSync(jobsFile, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");

  const args = [scriptPath, ...buildPythonArgs({ repo, jobsFile, height, width })];

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
