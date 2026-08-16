#!/usr/bin/env node

/**
 * Cloud GPU Fallback Pool — unified runner for GPU-intensive Python scripts.
 *
 * Fallback chain:
 *   1. Colab CLI  (preferred — one-shot `colab run --gpu T4`)
 *   2. Kaggle     (push → poll status → download output)
 *   3. Manual     (inform user to use Colab CDP or AutoDL)
 *
 * Usage:
 *   node scripts/cloud-gpu/run-gpu.mjs <script.py> [--output <dir>] [--timeout <sec>]
 *
 * Returns a JSON summary on stdout.
 */

import { exec } from "child_process";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "fs";
import { basename, join, dirname, resolve } from "path";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───

/** Kaggle username from ~/.kaggle/kaggle.json */
export const KAGGLE_USERNAME = "xPabloLI";

/** Default timeout: 30 minutes (1800 seconds) */
export const DEFAULT_TIMEOUT_SEC = 1800;

/** Kaggle status poll interval in seconds */
export const KAGGLE_POLL_INTERVAL_SEC = 30;

/** Keywords in Kaggle error messages that indicate GPU quota exhaustion */
export const QUOTA_KEYWORDS = [
  "quota",
  "exceeded",
  "limit reached",
  "weekly gpu",
  "gpu hours",
  "ran out of gpu",
  "not enough gpu",
];

// ─── Argument Parsing ───

/**
 * Parse CLI arguments.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ scriptPath: string, outputDir: string, timeoutSec: number }}
 * @throws if script path is missing or not a .py file
 */
export function parseArgs(argv) {
  if (argv.length === 0) {
    throw new Error("Usage: run-gpu.mjs <script.py> [--output <dir>] [--timeout <sec>]");
  }

  const scriptPath = argv[0];

  if (!scriptPath.endsWith(".py")) {
    throw new Error(`Script must be a .py file, got: ${scriptPath}`);
  }

  let outputDir = "./output";
  let timeoutSec = DEFAULT_TIMEOUT_SEC;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output" && i + 1 < argv.length) {
      outputDir = argv[++i];
    } else if (arg === "--timeout" && i + 1 < argv.length) {
      timeoutSec = parseInt(argv[++i], 10);
      if (isNaN(timeoutSec) || timeoutSec <= 0) {
        throw new Error(`Invalid timeout: ${argv[i]}`);
      }
    }
  }

  return { scriptPath, outputDir, timeoutSec };
}

// ─── Kaggle Metadata ───

/**
 * Generate kernel-metadata.json content for a Kaggle kernel.
 * @param {string} slug - Kernel slug (will be used as kernel name + code_file)
 * @returns {Object} Metadata object
 */
export function generateKernelMetadata(slug) {
  return {
    id: `${KAGGLE_USERNAME}/${slug}`,
    title: slug,
    code_file: `${slug}.py`,
    language: "python",
    kernel_type: "script",
    is_private: true,
    enable_gpu: true,
    enable_tpu: false,
    enable_internet: true,
    dataset_sources: [],
    kernel_sources: [],
    competition_sources: [],
  };
}

// ─── Quota Detection ───

/**
 * Check if a Kaggle error message indicates GPU quota exhaustion.
 * @param {string} stderr - Error message from Kaggle CLI
 * @returns {boolean}
 */
export function isKaggleQuotaExhausted(stderr) {
  if (!stderr) return false;
  const lower = stderr.toLowerCase();
  return QUOTA_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Colab CLI Runner ───

/**
 * Run a Python script on Colab CLI.
 *
 * Uses `colab --auth=adc run --gpu T4 <script.py>`.
 * Colab auto-provisions a VM, executes the script, and tears down.
 *
 * @param {string} scriptPath - Path to .py file
 * @param {{ timeoutSec: number, outputDir: string }} options
 * @returns {Promise<{ platform: string, success: boolean, outputDir: string, stdout: string, stderr: string, elapsedSec: number }>}
 */
export function runColab(scriptPath, { timeoutSec, outputDir }) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const cmd = `colab --auth=adc run --gpu T4 "${scriptPath}"`;
    const timeoutMs = timeoutSec * 1000;

    let timeoutHandle = null;
    let child = null;

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (child && child.pid) {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already dead
        }
      }
    };

    timeoutHandle = setTimeout(() => {
      cleanup();
      resolve({
        platform: "colab",
        success: false,
        outputDir,
        stdout: "",
        stderr: `Colab CLI timeout after ${timeoutSec}s`,
        elapsedSec: (Date.now() - startTime) / 1000,
      });
    }, timeoutMs);

    try {
      child = exec(
        cmd,
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          cleanup();
          const elapsedSec = (Date.now() - startTime) / 1000;
          const success = !err || err.code === 0;

          resolve({
            platform: "colab",
            success,
            outputDir,
            stdout: stdout || "",
            stderr: stderr || (err ? err.message : ""),
            elapsedSec,
          });
        },
      );
    } catch (e) {
      cleanup();
      resolve({
        platform: "colab",
        success: false,
        outputDir,
        stdout: "",
        stderr: `Colab CLI failed to start: ${e.message}`,
        elapsedSec: (Date.now() - startTime) / 1000,
      });
    }
  });
}

// ─── Kaggle Runner ───

/**
 * Run a Python script on Kaggle.
 *
 * Flow:
 *   1. Create a temp directory with kernel-metadata.json + script copy
 *   2. `kaggle kernels push -p <dir>`
 *   3. Poll `kaggle kernels status <username/slug>` until complete/failed
 *   4. `kaggle kernels output <username/slug> -p <outputDir>`
 *   5. Clean up temp dir
 *
 * @param {string} scriptPath - Path to .py file
 * @param {{ timeoutSec: number, outputDir: string, pollIntervalSec?: number }} options
 * @returns {Promise<{ platform: string, success: boolean, outputDir: string, stdout: string, stderr: string, elapsedSec: number, quotaExhausted?: boolean }>}
 */
export async function runKaggle(
  scriptPath,
  { timeoutSec, outputDir, pollIntervalSec = KAGGLE_POLL_INTERVAL_SEC },
) {
  const startTime = Date.now();
  const scriptBasename = basename(scriptPath, ".py");
  const slug = `${scriptBasename}-${randomBytes(4).toString("hex")}`;
  const tempDir = join(__dirname, ".kaggle-tmp", slug);

  try {
    // Prepare temp directory
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    // Write kernel-metadata.json
    const metadata = generateKernelMetadata(slug);
    // Override code_file to match the actual script
    metadata.code_file = basename(scriptPath);
    writeFileSync(join(tempDir, "kernel-metadata.json"), JSON.stringify(metadata, null, 2));

    // Copy script to temp dir
    copyFileSync(scriptPath, join(tempDir, basename(scriptPath)));

    // Push kernel
    let pushStdout = "";
    try {
      pushStdout = execSync(`kaggle kernels push -p "${tempDir}"`, {
        encoding: "utf-8",
        timeout: 60000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      const stderr = e.stderr ? e.stderr.toString() : e.message;
      if (isKaggleQuotaExhausted(stderr)) {
        return {
          platform: "kaggle",
          success: false,
          outputDir,
          stdout: "",
          stderr,
          elapsedSec: (Date.now() - startTime) / 1000,
          quotaExhausted: true,
        };
      }
      return {
        platform: "kaggle",
        success: false,
        outputDir,
        stdout: "",
        stderr: `Kaggle push failed: ${stderr}`,
        elapsedSec: (Date.now() - startTime) / 1000,
      };
    }

    // Poll status
    const kernelId = `${KAGGLE_USERNAME}/${slug}`;
    const deadlineMs = startTime + timeoutSec * 1000;
    let finalStatus = "unknown";
    let statusStdout = "";

    while (Date.now() < deadlineMs) {
      await sleep(pollIntervalSec * 1000);

      try {
        statusStdout = execSync(`kaggle kernels status ${kernelId}`, {
          encoding: "utf-8",
          timeout: 30000,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        // Status query failed, retry
        continue;
      }

      const statusLower = statusStdout.toLowerCase();

      if (statusLower.includes("complete")) {
        finalStatus = "complete";
        break;
      } else if (statusLower.includes("error") || statusLower.includes("cancel")) {
        finalStatus = "error";
        break;
      }
      // Still running, continue polling
    }

    if (finalStatus !== "complete") {
      return {
        platform: "kaggle",
        success: false,
        outputDir,
        stdout: statusStdout,
        stderr:
          finalStatus === "error"
            ? `Kaggle kernel finished with status: ${finalStatus}`
            : `Kaggle timeout after ${timeoutSec}s (last status: ${finalStatus})`,
        elapsedSec: (Date.now() - startTime) / 1000,
      };
    }

    // Download output
    try {
      execSync(`kaggle kernels output ${kernelId} -p "${outputDir}"`, {
        encoding: "utf-8",
        timeout: 120000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      // Output download failure is non-fatal — kernel succeeded
      // but we couldn't retrieve results
      return {
        platform: "kaggle",
        success: false,
        outputDir,
        stdout: statusStdout,
        stderr: `Kaggle output download failed: ${e.message}`,
        elapsedSec: (Date.now() - startTime) / 1000,
      };
    }

    return {
      platform: "kaggle",
      success: true,
      outputDir,
      stdout: statusStdout,
      stderr: "",
      elapsedSec: (Date.now() - startTime) / 1000,
    };
  } finally {
    // Clean up temp dir
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Non-fatal cleanup failure
    }
  }
}

// ─── Fallback Chain ───

/**
 * Run a script through the full fallback chain.
 *
 * Tries Colab CLI first, falls back to Kaggle, then provides manual instructions.
 *
 * @param {string} scriptPath - Path to .py file
 * @param {{ timeoutSec: number, outputDir: string, pollIntervalSec?: number }} options
 * @returns {Promise<{ results: Array, manualMessage: string|null }>}
 */
export async function fallbackChain(scriptPath, { timeoutSec, outputDir, pollIntervalSec }) {
  const results = [];

  // 1. Colab CLI
  console.log(`\n[1/2] Trying Colab CLI...`);
  const colabResult = await runColab(scriptPath, { timeoutSec, outputDir });
  results.push(colabResult);
  console.log(
    `  → ${colabResult.success ? "✅ Success" : "❌ Failed"} (${colabResult.elapsedSec.toFixed(1)}s)`,
  );

  if (colabResult.success) {
    return { results, manualMessage: null };
  }

  console.log(`  stderr: ${colabResult.stderr.slice(0, 200)}`);

  // 2. Kaggle
  console.log(`\n[2/2] Trying Kaggle...`);
  const kaggleResult = await runKaggle(scriptPath, { timeoutSec, outputDir, pollIntervalSec });
  results.push(kaggleResult);
  console.log(
    `  → ${kaggleResult.success ? "✅ Success" : "❌ Failed"} (${kaggleResult.elapsedSec.toFixed(1)}s)`,
  );

  if (kaggleResult.success) {
    return { results, manualMessage: null };
  }

  console.log(`  stderr: ${kaggleResult.stderr.slice(0, 200)}`);

  // 3. Manual fallback
  const manualMessage = [
    "═══════════════════════════════════════════════════",
    "  All automated GPU platforms failed.",
    "  Manual options:",
    "",
    "  1. Colab CDP: Use web-access skill to operate browser manually",
    "     → Navigate to https://colab.research.google.com",
    "     → Create a T4 runtime, upload the script, run it",
    "",
    "  2. AutoDL (paid): Rent RTX 4090 24GB at ¥1.88/h",
    "     → https://www.autodl.com",
    "     → Upload script + model files, run manually",
    "",
    "═══════════════════════════════════════════════════",
  ].join("\n");

  console.log(`\n${manualMessage}`);

  return { results, manualMessage };
}

// ─── Helpers ───

/**
 * Sleep for the given milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── CLI Entry ───

async function main() {
  const { scriptPath, outputDir, timeoutSec } = parseArgs(process.argv.slice(2));

  if (!existsSync(scriptPath)) {
    console.error(`Error: Script not found: ${scriptPath}`);
    process.exit(1);
  }

  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║     Cloud GPU Fallback Pool Runner           ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log(`  Script:  ${scriptPath}`);
  console.log(`  Output:  ${outputDir}`);
  console.log(`  Timeout: ${timeoutSec}s (${(timeoutSec / 60).toFixed(0)}min)`);
  console.log("");

  const { results, manualMessage } = await fallbackChain(scriptPath, { timeoutSec, outputDir });

  const summary = {
    script: scriptPath,
    outputDir,
    timeoutSec,
    platforms: results.map((r) => ({
      platform: r.platform,
      success: r.success,
      elapsedSec: parseFloat(r.elapsedSec.toFixed(2)),
      quotaExhausted: r.quotaExhausted || undefined,
    })),
    overallSuccess: results.some((r) => r.success),
    manualFallback: manualMessage ? true : false,
  };

  console.log("\n─── Summary ───");
  console.log(JSON.stringify(summary, null, 2));

  // Write summary to output dir
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "gpu-run-summary.json"), JSON.stringify(summary, null, 2));

  process.exit(summary.overallSuccess ? 0 : 1);
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`Fatal error: ${e.message}`);
    process.exit(1);
  });
}
