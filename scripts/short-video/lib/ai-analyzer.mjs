/**
 * AI Analyzer — VLM-powered asset understanding (Node.js library).
 *
 * Wraps a Python subprocess (ai_analyzer.py) running mlx-vlm with
 * Qwen3-VL-8B-Instruct-8bit. Communicates via line-delimited JSON
 * over stdin/stdout.
 *
 * API:
 *   describeImage(imagePath)  -> Promise<string>
 *   describeVideo(videoPath) -> Promise<string>
 *   closeAnalyzer()           -> Promise<void>
 *
 * Lifecycle:
 *   - Spawns Python on first call, reuses for subsequent calls.
 *   - If process exits (crash/idle timeout), respawns on next call.
 *   - Requests are queued serially (one at a time).
 *   - closeAnalyzer() sends exit command + kills subprocess.
 *
 * Graceful degradation:
 *   - Python not found / model load fails -> warn + return "".
 *
 * @module ai-analyzer
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───

const PYTHON_SCRIPT = join(__dirname, "ai_analyzer.py");
const HOME = process.env.HOME || "/Users/pabloli";
const PYTHON_BIN = join(HOME, ".video-tts-env", "bin", "python3");

const RESPONSE_TIMEOUT_MS = 180_000; // 180s per asset (video analysis can take 100s+)

// ─── Module state ───

/** @type {import('child_process').ChildProcess | null} */
let pythonProc = null;

/** @type {boolean} — null = unknown, true = available, false = unavailable */
let vlmAvailable = null;

/** @type {Array<{resolve: Function, reject: Function, action: string, path: string}>} */
let requestQueue = [];

/** @type {boolean} — true if currently processing a request */
let processing = false;

// ─── Internal: subprocess management ───

/**
 * Spawn the Python subprocess.
 * Sets up stdout line reader and exit listener.
 * Returns the process or null on failure.
 */
function spawnPython() {
  if (!existsSync(PYTHON_BIN)) {
    console.warn(`AI analysis layer not available: Python not found at ${PYTHON_BIN}`);
    vlmAvailable = false;
    return null;
  }

  if (!existsSync(PYTHON_SCRIPT)) {
    console.warn(`AI analysis layer not available: Script not found at ${PYTHON_SCRIPT}`);
    vlmAvailable = false;
    return null;
  }

  const proc = spawn(PYTHON_BIN, [PYTHON_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Line buffer for stdout
  let stdoutBuffer = "";
  proc.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop(); // keep partial line

    for (const line of lines) {
      if (!line.trim()) continue;
      handleResponse(line);
    }
  });

  // stderr for debugging
  let stderrBuffer = "";
  proc.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
    const lines = stderrBuffer.split("\n");
    stderrBuffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        console.debug(`[ai-analyzer:py] ${line}`);
      }
    }
  });

  // Handle process exit
  proc.on("exit", (code, signal) => {
    pythonProc = null;
    vlmAvailable = null; // reset: next call will retry

    // If a request is being processed, resolve it with empty
    if (processing && requestQueue.length > 0) {
      const { resolve } = requestQueue.shift();
      processing = false;
      resolve("");
    }

    processing = false;
    processQueue();
  });

  // Handle spawn errors
  proc.on("error", (err) => {
    console.warn(`AI analysis layer not available: ${err.message}`);
    pythonProc = null;
    vlmAvailable = false;

    if (processing && requestQueue.length > 0) {
      const { resolve } = requestQueue.shift();
      processing = false;
      resolve("");
    }

    processQueue();
  });

  pythonProc = proc;
  vlmAvailable = null; // will be confirmed on first successful response
  return proc;
}

/**
 * Ensure the Python subprocess is running (spawn if needed).
 * Returns true if running, false if unavailable.
 */
function ensureProcess() {
  if (pythonProc && !pythonProc.killed && pythonProc.exitCode === null) {
    return true;
  }

  if (vlmAvailable === false) {
    return false;
  }

  const proc = spawnPython();
  return proc !== null;
}

/**
 * Handle a response line from Python subprocess.
 */
function handleResponse(line) {
  if (requestQueue.length === 0) return;

  const { resolve } = requestQueue.shift();
  processing = false;

  let response;
  try {
    response = JSON.parse(line);
  } catch {
    resolve("");
    processQueue();
    return;
  }

  vlmAvailable = true;

  if (response.error) {
    console.warn(`AI analysis error: ${response.error}`);
    resolve("");
  } else {
    resolve(response.description || "");
  }

  processQueue();
}

/**
 * Process the next request in the queue.
 */
function processQueue() {
  if (processing || requestQueue.length === 0) return;

  if (!ensureProcess()) {
    while (requestQueue.length > 0) {
      const { resolve } = requestQueue.shift();
      resolve("");
    }
    return;
  }

  const request = requestQueue[0];
  processing = true;

  const jsonStr = JSON.stringify({
    action: request.action,
    path: request.path,
  });

  try {
    pythonProc.stdin.write(jsonStr + "\n");
  } catch (_err) {
    requestQueue.shift();
    processing = false;
    request.resolve("");
    processQueue();
    return;
  }

  // Timeout safety
  setTimeout(() => {
    if (processing && requestQueue.length > 0 && requestQueue[0] === request) {
      requestQueue.shift();
      processing = false;
      request.resolve("");
      processQueue();
    }
  }, RESPONSE_TIMEOUT_MS);
}

// ─── Public API ───

/**
 * Describe an image using the VLM.
 *
 * @param {string} imagePath - Absolute path to the image file.
 * @returns {Promise<string>} Description (1-2 sentences) or empty string on failure.
 */
export function describeImage(imagePath) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, action: "describe_image", path: imagePath });
    processQueue();
  });
}

/**
 * Describe a video using the VLM.
 *
 * @param {string} videoPath - Absolute path to the video file.
 * @returns {Promise<string>} Description (1-2 sentences) or empty string on failure.
 */
export function describeVideo(videoPath) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, action: "describe_video", path: videoPath });
    processQueue();
  });
}

/**
 * Close the analyzer subprocess.
 * Sends an exit command, then kills the process.
 *
 * @returns {Promise<void>}
 */
export function closeAnalyzer() {
  return new Promise((resolve) => {
    if (!pythonProc) {
      resolve();
      return;
    }

    try {
      pythonProc.stdin.write(JSON.stringify({ action: "exit" }) + "\n");
    } catch (_e) {
      // ignore
    }

    setTimeout(() => {
      if (pythonProc && !pythonProc.killed) {
        try {
          pythonProc.kill("SIGTERM");
        } catch (_e) {
          // ignore
        }
      }
      pythonProc = null;
      processing = false;
      requestQueue = [];
      resolve();
    }, 100);
  });
}

// ─── Cleanup on process exit ───

process.on("exit", () => {
  if (pythonProc && !pythonProc.killed) {
    try {
      pythonProc.kill("SIGTERM");
    } catch (_e) {
      // ignore
    }
  }
});
