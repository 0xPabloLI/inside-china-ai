/**
 * Visual Analyzer — VLM-powered asset understanding + OpenCV focus detection.
 *
 * Wraps two independent Python subprocesses:
 *   1. vlm_analyzer.py  — mlx-vlm Qwen3-VL-8B (analyzeAssetSemantics)
 *   2. focus_detector.py — OpenCV Haar Cascade + Saliency (detectFocus)
 *
 * API:
 *   analyzeAssetSemantics(assetPath) -> Promise<AssetSemantics>
 *   detectFocus(assetPath)          -> Promise<FocusResult>
 *   closeFocusDetector()            -> Promise<void>
 *   closeVisualAnalyzer()           -> Promise<void>  (closes both)
 *
 * Lifecycle:
 *   - Each subprocess spawns on first call, reuses for subsequent calls.
 *   - If process exits (crash/idle timeout), respawns on next call.
 *   - VLM requests are queued serially (one at a time).
 *   - Focus requests use requestId-based pending Map (concurrent-safe).
 *   - closeVisualAnalyzer() sends exit + kills both subprocesses.
 *
 * Graceful degradation:
 *   - VLM: Python not found / model load fails -> warn + return degraded AssetSemantics.
 *   - Focus: NEVER rejects. Returns schema-complete degraded result.
 *
 * @module visual-analyzer
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───

const PYTHON_SCRIPT = join(__dirname, "vlm_analyzer.py");
const FOCUS_SCRIPT = join(__dirname, "focus_detector.py");
const HOME = process.env.HOME || "/Users/pabloli";
const PYTHON_BIN = join(HOME, ".video-tts-env", "bin", "python3");

const RESPONSE_TIMEOUT_MS = 180_000; // 180s per VLM asset (video analysis can take 100s+)
const FOCUS_RESPONSE_TIMEOUT_MS = 10_000; // 10s per focus detection (target <1s)

// ─── Degraded result ───

/**
 * Schema-complete degraded result for VLM analysis failures.
 * Used when Python is unavailable, returns error, or produces malformed output.
 */
const DEGRADED_RESULT = Object.freeze({
  description: "",
  subjects: [],
  contentKind: null,
  fit: null,
  criticalEdgeText: null,
  reason: null,
});

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
        console.debug(`[visual-analyzer:py] ${line}`);
      }
    }
  });

  // Handle process exit
  proc.on("exit", (code, signal) => {
    pythonProc = null;
    vlmAvailable = null; // reset: next call will retry

    // If a request is being processed, resolve it with degraded result
    if (processing && requestQueue.length > 0) {
      const req = requestQueue.shift();
      processing = false;
      req.resolve({ ...DEGRADED_RESULT });
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
      const req = requestQueue.shift();
      processing = false;
      req.resolve({ ...DEGRADED_RESULT });
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
 *
 * Parses JSON response. If response has an error field, resolves with
 * degraded result. Otherwise resolves with the response object (minus
 * the error field, which is removed if null).
 */
function handleResponse(line) {
  if (requestQueue.length === 0) return;

  const request = requestQueue.shift();
  const { resolve } = request;
  processing = false;

  let response;
  try {
    response = JSON.parse(line);
  } catch {
    // Malformed JSON — resolve with degraded result
    resolve({ ...DEGRADED_RESULT });
    processQueue();
    return;
  }

  vlmAvailable = true;

  if (response.error) {
    console.warn(`AI analysis error: ${response.error}`);
    resolve({ ...DEGRADED_RESULT });
  } else {
    // Remove error field (null) and resolve with the rest
    const { error: _error, ...result } = response;
    resolve(result);
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
      const req = requestQueue.shift();
      req.resolve({ ...DEGRADED_RESULT });
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
    request.resolve({ ...DEGRADED_RESULT });
    processQueue();
    return;
  }

  // Timeout safety
  setTimeout(() => {
    if (processing && requestQueue.length > 0 && requestQueue[0] === request) {
      requestQueue.shift();
      processing = false;
      request.resolve({ ...DEGRADED_RESULT });
      processQueue();
    }
  }, RESPONSE_TIMEOUT_MS);
}

// ─── Public API ───

/**
 * Analyze an asset (image or video) using the VLM in a single call.
 *
 * Sends an `analyze_semantics` action to the Python subprocess. The VLM
 * examines the asset and returns a structured object with:
 * - description (string)
 * - subjects (string[])
 * - contentKind (string)
 * - fit ("cover" | "contain" | null) — images only, null for videos
 * - criticalEdgeText (string | null) — images only
 * - reason (string | null) — images only
 *
 * On any failure (VLM unavailable, parse error, timeout), resolves with
 * a degraded result where all fields are empty/null.
 *
 * @param {string} assetPath - Absolute path to the image/video file.
 * @returns {Promise<{description: string, subjects: string[], contentKind: string|null,
 *   fit: string|null, criticalEdgeText: string|null, reason: string|null}>}
 */
export function analyzeAssetSemantics(assetPath) {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      resolve,
      reject,
      action: "analyze_semantics",
      path: assetPath,
    });
    processQueue();
  });
}

/**
 * Close the analyzer subprocess.
 * Sends an exit command, then kills the process.
 * Also closes the focus detector subprocess if running.
 *
 * @returns {Promise<void>}
 */
export function closeVisualAnalyzer() {
  return new Promise((resolve) => {
    // Close focus detector first (lightweight, fast to exit)
    closeFocusDetector().then(() => {
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
  });
}

// ═══════════════════════════════════════════════════════════════
// ─── Focus Detector Subsystem (OpenCV) ──────────────────────
// ═══════════════════════════════════════════════════════════════

/**
 * Schema-complete degraded result for focus detection failures.
 * Used for timeout, worker reset, and protocol errors.
 */
function _focusDegraded(errorCode) {
  return {
    status: "degraded",
    errorCode,
    frame: null,
    protectedRegions: [],
    saliency: { available: false, dispersion: 0.0, centroid: [0.5, 0.5] },
  };
}

/** @type {import('child_process').ChildProcess | null} */
let focusProc = null;

/** @type {boolean} */
let focusAvailable = null;

/**
 * pending Map: requestId -> { resolve, timer, workerGeneration }
 * Each analyze request gets a unique requestId. Response is matched by requestId.
 */
/** @type {Map<string, {resolve: Function, timer: ReturnType<typeof setTimeout>, workerGeneration: number}>} */
const focusPending = new Map();

/**
 * Worker generation counter. Incremented on every respawn.
 * Old worker responses are discarded if generation doesn't match.
 */
let focusWorkerGeneration = 0;

/**
 * Spawn the focus detector Python subprocess.
 * Returns the process or null on failure.
 */
function spawnFocusDetector() {
  if (!existsSync(PYTHON_BIN)) {
    console.warn(`Focus detector not available: Python not found at ${PYTHON_BIN}`);
    focusAvailable = false;
    return null;
  }

  if (!existsSync(FOCUS_SCRIPT)) {
    console.warn(`Focus detector not available: Script not found at ${FOCUS_SCRIPT}`);
    focusAvailable = false;
    return null;
  }

  focusWorkerGeneration++;
  const myGen = focusWorkerGeneration;

  const proc = spawn(PYTHON_BIN, [FOCUS_SCRIPT], {
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
      handleFocusResponse(line, myGen);
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
        console.debug(`[focus-detector:py] ${line}`);
      }
    }
  });

  // Handle process exit — settle all pending from this generation
  proc.on("exit", (code, signal) => {
    if (focusProc === proc) {
      focusProc = null;
      focusAvailable = null; // reset: next call will retry
    }
    // Settle all pending requests from this worker generation
    settlePendingFocus(myGen, "focus_worker_reset");
  });

  // Handle spawn errors
  proc.on("error", (err) => {
    console.warn(`Focus detector not available: ${err.message}`);
    if (focusProc === proc) {
      focusProc = null;
      focusAvailable = false;
    }
    settlePendingFocus(myGen, "focus_worker_reset");
  });

  focusProc = proc;
  focusAvailable = null; // will be confirmed on first successful response
  return proc;
}

/**
 * Ensure the focus detector subprocess is running (spawn if needed).
 * Returns true if running, false if unavailable.
 */
function ensureFocusProcess() {
  if (focusProc && !focusProc.killed && focusProc.exitCode === null) {
    return true;
  }

  if (focusAvailable === false) {
    return false;
  }

  const proc = spawnFocusDetector();
  return proc !== null;
}

/**
 * Handle a response line from the focus detector subprocess.
 * Matches by requestId. Discards responses from old worker generations.
 */
function handleFocusResponse(line, workerGen) {
  let response;
  try {
    response = JSON.parse(line);
  } catch {
    // Non-JSON stdout — discard
    return;
  }

  const id = response.requestId;
  if (!id || !focusPending.has(id)) {
    // Unknown requestId or already settled — discard stale response
    return;
  }

  const entry = focusPending.get(id);
  if (entry.workerGeneration !== workerGen) {
    // Response from old worker generation — discard
    return;
  }

  clearTimeout(entry.timer);
  focusPending.delete(id);
  focusAvailable = true;

  const result = response.result || _focusDegraded("focus_protocol_error");
  entry.resolve(result);
}

/**
 * Settle all pending focus requests from a specific worker generation.
 * Each pending Promise resolves with the given errorCode degraded result.
 */
function settlePendingFocus(workerGen, errorCode) {
  for (const [id, entry] of focusPending) {
    if (entry.workerGeneration === workerGen) {
      clearTimeout(entry.timer);
      focusPending.delete(id);
      entry.resolve(_focusDegraded(errorCode));
    }
  }
}

/**
 * Settle ALL pending focus requests regardless of generation.
 * Used by closeFocusDetector().
 */
function settleAllPendingFocus(errorCode) {
  for (const [id, entry] of focusPending) {
    clearTimeout(entry.timer);
    focusPending.delete(id);
    entry.resolve(_focusDegraded(errorCode));
  }
}

/**
 * Detect focus regions and protected areas in an image.
 * Uses OpenCV Saliency + Face Detection (lightweight subprocess).
 * Independent from VLM — does NOT load the 11GB model.
 *
 * NEVER rejects. On failure, returns a schema-complete empty result
 * with status="degraded" or "unsupported".
 *
 * status ∈ {"ok", "partial", "low_information", "degraded", "unsupported"}
 * errorCode ∈ {null, "opencv_not_available", "pillow_not_available",
 *   "numpy_not_available", "focus_dependency_not_available",
 *   "classifier_load_failed", "cannot_read_image",
 *   "saliency_compute_failed", "focus_timeout",
 *   "focus_worker_reset", "focus_protocol_error",
 *   "focus_internal_error",
 *   "video_not_supported", "unsupported_media_type"}
 *
 * Phase 1a: only supports static images. Video files return
 * status="unsupported" without calling cv2.imread().
 *
 * @param {string} assetPath - Absolute path to image file.
 * @returns {Promise<{status: string, errorCode: string|null, frame: Object|null,
 *   protectedRegions: Array, saliency: Object}>}
 */
export function detectFocus(assetPath) {
  return new Promise((resolve) => {
    if (!ensureFocusProcess()) {
      resolve(_focusDegraded("focus_dependency_not_available"));
      return;
    }

    const requestId = randomUUID();
    const myGen = focusWorkerGeneration;

    // Timeout safety
    const timer = setTimeout(() => {
      if (focusPending.has(requestId)) {
        focusPending.delete(requestId);
        resolve(_focusDegraded("focus_timeout"));
      }
    }, FOCUS_RESPONSE_TIMEOUT_MS);

    focusPending.set(requestId, { resolve, timer, workerGeneration: myGen });

    const jsonStr = JSON.stringify({
      requestId,
      action: "analyze",
      path: assetPath,
    });

    try {
      focusProc.stdin.write(jsonStr + "\n");
    } catch (_err) {
      // Pipe write failed — settle this request
      if (focusPending.has(requestId)) {
        clearTimeout(timer);
        focusPending.delete(requestId);
        resolve(_focusDegraded("focus_worker_reset"));
      }
    }
  });
}

/**
 * Close the focus detector subprocess.
 * Does NOT close the VLM subprocess.
 * Idempotent — multiple calls don't throw.
 *
 * @returns {Promise<void>}
 */
export function closeFocusDetector() {
  return new Promise((resolve) => {
    // Settle all pending requests first
    settleAllPendingFocus("focus_worker_reset");

    if (!focusProc) {
      resolve();
      return;
    }

    try {
      focusProc.stdin.write(JSON.stringify({ action: "exit" }) + "\n");
    } catch (_e) {
      // ignore
    }

    setTimeout(() => {
      if (focusProc && !focusProc.killed) {
        try {
          focusProc.kill("SIGTERM");
        } catch (_e) {
          // ignore
        }
      }
      focusProc = null;
      focusAvailable = null;
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
  if (focusProc && !focusProc.killed) {
    try {
      focusProc.kill("SIGTERM");
    } catch (_e) {
      // ignore
    }
  }
});
