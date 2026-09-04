/**
 * Visual Analyzer — VLM-powered asset understanding + OpenCV focus detection.
 *
 * Wraps two independent Python subprocesses:
 *   1. vlm_analyzer.py  — mlx-vlm Qwen3-VL-2B-Instruct-4bit (analyzeAssetSemantics)
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
 *   - VLM runs as a pool of VLM_CONCURRENCY (default 2) subprocesses (#189);
 *     requests are dispatched from a shared queue to idle workers, one
 *     in-flight request per worker.
 *   - Focus requests use requestId-based pending Map (concurrent-safe).
 *   - closeVisualAnalyzer() sends exit + kills all pool subprocesses.
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

const PYTHON_SCRIPT = process.env.VLM_ANALYZER_SCRIPT || join(__dirname, "vlm_analyzer.py");
const FOCUS_SCRIPT = join(__dirname, "focus_detector.py");
const HOME = process.env.HOME || "/Users/pabloli";
const PYTHON_BIN =
  process.env.VLM_ANALYZER_PYTHON_BIN || join(HOME, ".video-tts-env", "bin", "python3");

const RESPONSE_TIMEOUT_MS = Number(process.env.VLM_RESPONSE_TIMEOUT_MS) || 180_000; // 180s per VLM asset (video analysis can take 100s+)
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
  relevance: null,
  relevanceReason: null,
});

// ─── Module state ───

/**
 * Pool size (#189): number of concurrent VLM subprocesses. Each worker
 * handles one request at a time — the legacy Python main loop stays
 * unchanged (one in-flight request per process, FIFO fallback safe).
 */
const VLM_CONCURRENCY = Math.max(1, Number(process.env.VLM_CONCURRENCY) || 2);

/**
 * A VLM worker owns one Python subprocess, its own pending map and
 * generation counter. Responses are read from that worker's stdout only,
 * so per-worker pending size is at most 1 and the legacy FIFO fallback
 * (no requestId echo) routes correctly.
 */
function createVlmWorker() {
  return {
    /** @type {import('child_process').ChildProcess | null} */
    proc: null,
    /** @type {boolean|null} — null = unknown, true = available, false = unavailable */
    available: null,
    /** Generation counter, incremented on every respawn of this worker. */
    generation: 0,
    /** Pending Map: requestId -> { resolve, timer, workerGeneration, window } */
    pending: new Map(),
  };
}

/** @type {Array<ReturnType<createVlmWorker>>} */
const vlmWorkers = Array.from({ length: VLM_CONCURRENCY }, createVlmWorker);

/**
 * Request queue: requests waiting to be dispatched to an idle worker.
 * A request is shifted from here, sent to a worker with a requestId,
 * and tracked in that worker's pending map until the response arrives.
 */
let requestQueue = [];

// ─── Internal: subprocess management ───

/**
 * Spawn the Python subprocess for a pool worker.
 * Sets up stdout line reader and exit listener.
 * Returns the process or null on failure.
 */
function spawnPython(worker) {
  if (!existsSync(PYTHON_BIN)) {
    console.warn(`AI analysis layer not available: Python not found at ${PYTHON_BIN}`);
    worker.available = false;
    return null;
  }

  if (!existsSync(PYTHON_SCRIPT)) {
    console.warn(`AI analysis layer not available: Script not found at ${PYTHON_SCRIPT}`);
    worker.available = false;
    return null;
  }

  worker.generation++;
  const myGen = worker.generation;

  const proc = spawn(PYTHON_BIN, [PYTHON_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    // Offline by default: both VLMs are in the local HF cache; without this
    // every spawn pays a revision check to huggingface.co. HF_HUB_OFFLINE=0
    // opts back in.
    env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE || "1" },
  });

  // Line buffer for stdout
  let stdoutBuffer = "";
  proc.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop(); // keep partial line

    for (const line of lines) {
      if (!line.trim()) continue;
      handleResponse(line, worker, myGen);
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
    if (worker.proc === proc) {
      worker.proc = null;
      worker.available = null; // reset: next call will retry
    }
    // R1 fix: settle all pending requests from this worker generation
    settlePendingVlm(worker, myGen, { ...DEGRADED_RESULT });
    dispatchQueue();
  });

  // Handle spawn errors
  proc.on("error", (err) => {
    console.warn(`AI analysis layer not available: ${err.message}`);
    if (worker.proc === proc) {
      worker.proc = null;
      worker.available = false;
    }
    settlePendingVlm(worker, myGen, { ...DEGRADED_RESULT });
    dispatchQueue();
  });

  worker.proc = proc;
  // #189: writing to a crashed/killed worker's stdin can emit an async
  // EPIPE 'error' event; without a listener it surfaces as an unhandled
  // error. sendRequest already degrades the request — swallow the event.
  proc.stdin?.on?.("error", () => {});
  worker.available = null; // will be confirmed on first successful response
  return proc;
}

/**
 * Ensure a worker's Python subprocess is running (spawn if needed).
 * Returns true if running, false if unavailable.
 */
function ensureProcess(worker) {
  if (worker.proc && !worker.proc.killed && worker.proc.exitCode === null) {
    return true;
  }

  if (worker.available === false) {
    return false;
  }

  const proc = spawnPython(worker);
  return proc !== null;
}

/**
 * Handle a response line from Python subprocess.
 *
 * Parses JSON response. If response has an error field, resolves with
 * degraded result. Otherwise resolves with the response object (minus
 * the error field, which is removed if null).
 */
function handleResponse(line, worker, workerGen) {
  let response;
  try {
    response = JSON.parse(line);
  } catch {
    // Malformed JSON — settle the only pending request (if any) with degraded
    if (worker.pending.size === 1) {
      const iter = worker.pending.entries().next();
      const [fifoId, entry] = iter.value;
      if (entry.workerGeneration === workerGen) {
        clearTimeout(entry.timer);
        worker.pending.delete(fifoId);
        entry.resolve({ ...DEGRADED_RESULT });
        dispatchQueue();
      }
    }
    return;
  }

  // R1 fix: route by requestId when available, fallback to FIFO for
  // backwards compatibility with older Python that doesn't echo requestId.
  // Per-worker pending size is at most 1 (#189 pool), so the FIFO fallback
  // stays correct: each worker's stdout only carries that worker's response.
  let entry;
  const id = response.requestId;
  if (id && worker.pending.has(id)) {
    entry = worker.pending.get(id);
    // Generation check for explicit requestId routing
    if (entry.workerGeneration !== workerGen) {
      return;
    }
  } else if (!id && worker.pending.size === 1) {
    // FIFO fallback: no requestId in response, take the only pending entry
    // This path is for backwards compatibility. R1's generation isolation
    // still protects against late responses from killed workers because
    // killed workers' stdout no longer emits to this handler.
    const iter = worker.pending.entries().next();
    entry = iter.value[1];
    // Still check generation for safety
    if (entry.workerGeneration !== workerGen) {
      return;
    }
  } else {
    // Unknown requestId or no pending requests — discard stale response
    return;
  }

  clearTimeout(entry.timer);
  // Delete the correct key: explicit requestId if present, else the FIFO key
  if (id) {
    worker.pending.delete(id);
  } else {
    const fifoKey = worker.pending.keys().next().value;
    worker.pending.delete(fifoKey);
  }
  worker.available = true;

  if (response.error) {
    console.warn(`AI analysis error: ${response.error}`);
    const degraded = { ...DEGRADED_RESULT };
    if (entry.window) {
      degraded.window = entry.window;
      degraded.sourceMode = "degraded";
    }
    entry.resolve(degraded);
  } else {
    // Remove error field (null) and resolve with the rest
    const { error: _error, ...result } = response;
    // Attach window metadata from the request when present
    if (entry.window) {
      result.window = entry.window;
    }
    entry.resolve(result);
  }

  dispatchQueue();
}

/**
 * Settle all pending VLM requests from a specific worker generation.
 * Each pending Promise resolves with the given degraded result.
 */
function settlePendingVlm(worker, workerGen, degradedResult) {
  for (const [id, entry] of worker.pending) {
    if (entry.workerGeneration === workerGen) {
      clearTimeout(entry.timer);
      worker.pending.delete(id);
      const degraded = { ...degradedResult };
      if (entry.window) {
        degraded.window = entry.window;
        degraded.sourceMode = "degraded";
      }
      entry.resolve(degraded);
    }
  }
}

/**
 * Reset one VLM worker: kill its process, increment generation,
 * settle all pending from the old generation.
 * R1 fix: called on timeout to prevent late-response mismatch.
 */
function resetVlmWorker(worker) {
  const oldGen = worker.generation;
  if (worker.proc && !worker.proc.killed) {
    try {
      worker.proc.kill("SIGTERM");
    } catch (_e) {
      // ignore
    }
  }
  worker.proc = null;
  // Increment generation so any late response from the killed worker
  // will be discarded by handleResponse (generation mismatch)
  worker.generation++;
  // Settle all pending from the old generation with degraded result
  settlePendingVlm(worker, oldGen, { ...DEGRADED_RESULT });
}

/**
 * Dispatch queued requests to idle workers (#189 pool).
 * Each worker holds at most one in-flight request; when several workers
 * are idle, the queue is drained across them until it is empty or every
 * worker is busy/unavailable.
 */
function dispatchQueue() {
  if (requestQueue.length === 0) return;

  for (const worker of vlmWorkers) {
    if (requestQueue.length === 0) break;
    if (worker.pending.size > 0) continue; // busy

    if (!ensureProcess(worker)) continue; // try another worker

    sendRequest(worker, requestQueue.shift());
  }

  // Every worker is busy or unavailable — flush the queue with degraded
  // results so callers never hang (legacy behavior).
  if (requestQueue.length > 0) {
    const anyUsable = vlmWorkers.some(
      (w) => w.available !== false || (w.proc && !w.proc.killed && w.proc.exitCode === null),
    );
    if (!anyUsable) {
      while (requestQueue.length > 0) {
        const req = requestQueue.shift();
        req.resolve({ ...DEGRADED_RESULT });
      }
    }
  }
}

/**
 * Send one request to a worker and track it in that worker's pending map.
 */
function sendRequest(worker, request) {
  const requestId = randomUUID();
  const myGen = worker.generation;

  const jsonStr = JSON.stringify({
    requestId,
    action: request.action,
    path: request.path,
    ...(request.window ? { window: request.window } : {}),
    ...(request.claim ? { claim: request.claim } : {}),
  });

  try {
    worker.proc.stdin.write(jsonStr + "\n");
  } catch (_err) {
    request.resolve({ ...DEGRADED_RESULT });
    dispatchQueue();
    return;
  }

  // Timeout safety — R1 fix: kill worker on timeout, don't reuse it
  const timer = setTimeout(() => {
    if (worker.pending.has(requestId)) {
      worker.pending.delete(requestId);
      request.resolve({ ...DEGRADED_RESULT });
      // Kill the worker and increment generation to isolate late responses
      resetVlmWorker(worker);
      dispatchQueue();
    }
  }, RESPONSE_TIMEOUT_MS);

  worker.pending.set(requestId, {
    resolve: request.resolve,
    reject: request.reject,
    action: request.action,
    path: request.path,
    window: request.window,
    timer,
    workerGeneration: myGen,
  });
}

// ─── Public API ───

/**
 * Number of concurrent VLM workers in the pool (#189).
 * Callers (e.g. asset-sourcer Phase 3a) use this to match their own
 * request concurrency to the pool size.
 */
export function getVlmConcurrency() {
  return VLM_CONCURRENCY;
}

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
 * - window ({ startMs, endMs, sampleFps } | undefined) — videos only, when opts provided
 * - sourceMode ("frames" | "degraded" | undefined) — videos only; analysis
 *   always runs on ffmpeg-extracted frames
 * - relevance (int 0-100 | null) / relevanceReason — claim mode only
 *
 * On any failure (VLM unavailable, parse error, timeout), resolves with
 * a degraded result where all fields are empty/null.
 *
 * @param {string} assetPath - Absolute path to the image/video file.
 * @param {{startMs?: number, endMs?: number, sampleFps?: number, claim?: {voiceover: string, assetNeed: string}}} [opts] - Optional time window (video only) and scene claim (relevance judging)
 * @returns {Promise<{description: string, subjects: string[], contentKind: string|null,
 *   fit: string|null, criticalEdgeText: string|null, reason: string|null,
 *   window?: {startMs: number, endMs: number, sampleFps: number},
 *   sourceMode?: string}>}
 */
export function analyzeAssetSemantics(assetPath, opts) {
  const window = opts
    ? {
        startMs: opts.startMs,
        endMs: opts.endMs,
        sampleFps: opts.sampleFps,
      }
    : undefined;
  // Scene claim ({voiceover, assetNeed}) — routes through to the Python
  // prompt builder; absent claim keeps the legacy prompt untouched.
  const claim = opts?.claim || undefined;

  return new Promise((resolve, reject) => {
    requestQueue.push({
      resolve,
      reject,
      action: "analyze_semantics",
      path: assetPath,
      window,
      claim,
    });
    dispatchQueue();
  });
}

/**
 * Close all analyzer subprocesses in the pool (#189).
 * Sends an exit command to each, then kills them.
 * Also closes the focus detector subprocess if running.
 *
 * @returns {Promise<void>}
 */
export function closeVisualAnalyzer() {
  return new Promise((resolve) => {
    // Close focus detector first (lightweight, fast to exit)
    closeFocusDetector().then(() => {
      const liveWorkers = vlmWorkers.filter(
        (w) => w.proc && !w.proc.killed && w.proc.exitCode === null,
      );
      if (liveWorkers.length === 0) {
        resolve();
        return;
      }

      for (const worker of liveWorkers) {
        try {
          worker.proc.stdin.write(JSON.stringify({ action: "exit" }) + "\n");
        } catch (_e) {
          // ignore
        }
      }

      setTimeout(() => {
        for (const worker of vlmWorkers) {
          if (worker.proc && !worker.proc.killed) {
            try {
              worker.proc.kill("SIGTERM");
            } catch (_e) {
              // ignore
            }
          }
          worker.proc = null;
          // R1 fix: settle all pending VLM requests per worker
          for (const [id, entry] of worker.pending) {
            clearTimeout(entry.timer);
            entry.resolve({ ...DEGRADED_RESULT });
          }
          worker.pending.clear();
        }
        requestQueue.length = 0;
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
 * Independent from VLM — does NOT load the ~2GB 2B-4bit model.
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

    // Timeout safety — R3 fix: kill worker on timeout, don't reuse stuck worker
    const timer = setTimeout(() => {
      if (focusPending.has(requestId)) {
        focusPending.delete(requestId);
        resolve(_focusDegraded("focus_timeout"));
        // R3 fix: kill the stuck worker and settle all pending from this generation
        if (focusProc && !focusProc.killed) {
          try {
            focusProc.kill("SIGTERM");
          } catch (_e) {
            // ignore
          }
        }
        focusProc = null;
        focusWorkerGeneration++;
        settlePendingFocus(myGen, "focus_worker_reset");
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
// Guard against duplicate listener registration: vitest may import this module
// multiple times across test files, each adding a new 'exit' listener and
// triggering MaxListenersExceededWarning. Only register once per process.

const _exitHandlerRegistered = Symbol.for("visualAnalyzerExitHandler");

if (!process[_exitHandlerRegistered]) {
  process[_exitHandlerRegistered] = true;
  process.on("exit", () => {
    for (const worker of vlmWorkers) {
      if (worker.proc && !worker.proc.killed) {
        try {
          worker.proc.kill("SIGTERM");
        } catch (_e) {
          // ignore
        }
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
}
