/**
 * Local ASR gateway (#98, P5) — resident WhisperX worker with windowed,
 * sentence-level transcription and millisecond timecodes.
 *
 * Mirrors the visual-analyzer worker contract: NDJSON IPC over stdin/stdout,
 * requestId routing, worker-generation isolation (a timed-out worker is
 * killed and its late responses discarded), schema-complete degraded
 * results — callers never get an unhandled exception.
 *
 * Window handling: audio for [startMs, endMs] is extracted with ffmpeg
 * (16 kHz mono wav, the sample rate faster-whisper expects); the worker's
 * window-relative timestamps are offset back onto the media timeline and
 * clamped to the requested window. meta records the actual window, backend,
 * model and duration (issue acceptance).
 *
 * Caching: optional #100 unified envelope cache keyed by source fingerprint
 * + window + language + model + ASR_VERSION. Degraded results are refused
 * at the cache layer.
 *
 * Consumers: none wired yet by design — P6 (#99) timeline fusion is the
 * first consumer; this module is the P5 contract it depends on.
 *
 * @module asr-analyzer
 */

import { spawn, execFileSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  fileFingerprint,
  getCachedResult,
  writeCachedResult,
  VLM_CACHE_PIPELINE_VERSION,
} from "./vlm-cache.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PYTHON_SCRIPT = process.env.ASR_ANALYZER_SCRIPT || join(__dirname, "asr_worker.py");
const HOME = process.env.HOME || "/Users/pabloli";
const PYTHON_BIN =
  process.env.ASR_ANALYZER_PYTHON_BIN || join(HOME, ".video-tts-env", "bin", "python3");
const FFMPEG_FULL = process.env.ASR_FFMPEG || "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";

const RESPONSE_TIMEOUT_MS = Number(process.env.ASR_RESPONSE_TIMEOUT_MS) || 120_000;

export const ASR_VERSION = "v1-2026-09-05";

/**
 * The WhisperX transcription model. "base" is in the local HF cache;
 * larger models (small/medium/large-v3) download on first use with
 * HF_HUB_OFFLINE=0.
 */
export function getAsrModel() {
  return process.env.ASR_MODEL || "base";
}

// ─── Resident worker (single — ASR is a heavy model, #98: "一个 worker") ───

const worker = {
  /** @type {import('child_process').ChildProcess | null} */
  proc: null,
  /** @type {boolean|null} */
  available: null,
  generation: 0,
  /** @type {Map<string, {resolve: Function, timer: any, workerGeneration: number}>} */
  pending: new Map(),
};

function spawnPython() {
  if (!existsSync(PYTHON_BIN) || !existsSync(PYTHON_SCRIPT)) {
    console.warn(`ASR layer not available: python/script missing (${PYTHON_BIN})`);
    worker.available = false;
    return null;
  }
  worker.generation++;
  const myGen = worker.generation;

  const proc = spawn(PYTHON_BIN, [PYTHON_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE || "1" },
  });

  let stdoutBuffer = "";
  proc.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) handleResponse(line, myGen);
    }
  });

  proc.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) console.debug(`[asr:py] ${line}`);
    }
  });

  proc.on("exit", () => {
    if (worker.proc === proc) {
      worker.proc = null;
      worker.available = null;
    }
    settlePending(myGen, "worker_exited");
  });

  proc.on("error", (err) => {
    console.warn(`ASR layer not available: ${err.message}`);
    if (worker.proc === proc) {
      worker.proc = null;
      worker.available = false;
    }
    settlePending(myGen, "worker_error");
  });

  proc.stdin?.on?.("error", () => {});
  worker.proc = proc;
  return proc;
}

function ensureProcess() {
  if (worker.proc && !worker.proc.killed && worker.proc.exitCode === null) return true;
  if (worker.available === false) return false;
  return spawnPython() !== null;
}

function settlePending(workerGen, errorCode) {
  for (const [id, entry] of worker.pending) {
    if (entry.workerGeneration === workerGen) {
      clearTimeout(entry.timer);
      worker.pending.delete(id);
      entry.resolve({ error: errorCode });
    }
  }
}

/**
 * Kill the worker and bump the generation so a late response from the
 * killed process is discarded by the generation check (#98 acceptance:
 * 超时后旧 worker 的迟到响应不会污染下一请求).
 */
function resetWorker() {
  const oldGen = worker.generation;
  if (worker.proc && !worker.proc.killed) {
    try {
      worker.proc.kill("SIGTERM");
    } catch (_e) {
      // ignore
    }
  }
  worker.proc = null;
  worker.generation++;
  settlePending(oldGen, "worker_timeout");
}

function handleResponse(line, workerGen) {
  let response;
  try {
    response = JSON.parse(line);
  } catch {
    return;
  }
  const id = response.requestId;
  const entry = id ? worker.pending.get(id) : null;
  if (!entry || entry.workerGeneration !== workerGen) {
    return; // stale/unknown response — discard
  }
  clearTimeout(entry.timer);
  worker.pending.delete(id);
  worker.available = true;

  entry.resolve(response);
}

// ─── Audio extraction ───

/**
 * Extract [startMs, endMs) as 16 kHz mono wav into a temp dir.
 * Returns { dir, path } or throws Error with .code:
 *   "no_audio_track" | "audio_extraction_failed"
 */
function extractWindowAudio(mediaPath, startMs, endMs) {
  const dir = mkdtempSync(join(tmpdir(), "asr-window-"));
  const out = join(dir, "window.wav");
  const durationSec = endMs != null ? (endMs - startMs) / 1000 : null;
  const args = ["-y", "-ss", `${startMs / 1000}`];
  if (durationSec != null) args.push("-t", `${durationSec}`);
  args.push("-i", mediaPath, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", out);
  try {
    execFileSync(FFMPEG_FULL, args, { stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    const stderr = err?.stderr?.toString?.() || "";
    const code =
      /matches no streams|does not contain any stream|Output file .* does not contain any stream/.test(
        stderr,
      )
        ? "no_audio_track"
        : "audio_extraction_failed";
    const error = new Error(`audio extraction failed: ${code}`);
    error.code = code;
    throw error;
  }
  return { dir, path: out };
}

// ─── Result shaping ───

function classifyWorkerError(error) {
  if (/^worker_/.test(error)) return error; // internal gateway codes
  if (/^model_load_failed/.test(error)) return "model_load_failed";
  if (/^audio_not_found/.test(error)) return "audio_not_found";
  return "transcribe_failed";
}

function degradedResult(errorCode) {
  return {
    ok: false,
    segments: [],
    language: null,
    errorCode,
    meta: { model: getAsrModel(), backend: "whisperx/faster-whisper", degraded: true },
  };
}

/**
 * Shape a raw worker response (window-relative segment times, seconds→ms
 * already done by the worker) into the public contract: absolute timestamps
 * offset onto the media timeline and clamped to the requested window.
 */
function shapeResult(rawResponse, req) {
  const window = req.endMs != null ? { startMs: req.startMs, endMs: req.endMs } : null;
  const offsetMs = req.startMs ?? 0;
  const clampToWindow = (ms) => {
    let v = ms;
    if (window) {
      v = Math.min(window.endMs, Math.max(window.startMs, v));
    } else if (req.startMs != null) {
      v = Math.max(req.startMs, v);
    }
    return v;
  };
  const segments = (rawResponse.segments || [])
    .map((seg) => ({
      startMs: clampToWindow(offsetMs + (seg.startMs ?? 0)),
      endMs: clampToWindow(offsetMs + (seg.endMs ?? 0)),
      text: seg.text || "",
    }))
    .filter((seg) => seg.text.length > 0);
  return {
    ok: true,
    segments,
    language: rawResponse.language ?? req.languageHint ?? null,
    errorCode: null,
    meta: {
      ...rawResponse.meta,
      requestedWindow: window ?? { startMs: req.startMs ?? 0 },
      degraded: false,
    },
  };
}

// ─── Public API ───

/**
 * Compute the ASR cache key (#100 protocol).
 *
 * @param {{mediaPath: string, startMs: number, endMs: ?number,
 *          languageHint: ?string, model?: string}} req
 * @returns {Promise<string>} 64-char hex sha256
 */
export async function computeAsrCacheKey(req) {
  const h = createHash("sha256");
  h.update(ASR_VERSION + "\n");
  h.update(VLM_CACHE_PIPELINE_VERSION + "\n");
  h.update(fileFingerprint(req.mediaPath) + "\n");
  h.update(`${Math.round(req.startMs)}-${req.endMs != null ? Math.round(req.endMs) : "end"}\n`);
  h.update(`${req.languageHint || ""}\n`);
  h.update(`${req.model || getAsrModel()}\n`);
  return h.digest("hex");
}

/**
 * Transcribe the audio of a media time window with the local WhisperX
 * worker (#98, P5).
 *
 * @param {string} mediaPath - audio or video file
 * @param {{startMs?: number, endMs?: ?number, languageHint?: ?string,
 *          cacheDir?: ?string, deps?: {extractAudio?: Function,
 *          sendToWorker?: Function}}} [opts]
 *   startMs default 0; endMs null = to end of media. languageHint e.g. "zh".
 *   deps are test seams; by default the real ffmpeg extractor and resident
 *   worker are used.
 * @returns {Promise<object>}
 *   Success: { ok: true, segments: [{startMs, endMs, text}], language,
 *              errorCode: null,
 *              meta: { backend, model, requestedWindow, durationMs, cacheHit? } }
 *   Degraded: { ok: false, segments: [], language: null, errorCode,
 *               meta: { ..., degraded: true } } — never throws.
 */
export async function transcribeAudioWindow(mediaPath, opts = {}) {
  const startMs = Math.max(0, Math.round(opts.startMs ?? 0));
  const endMs = opts.endMs != null ? Math.round(opts.endMs) : null;
  const languageHint = opts.languageHint ?? null;
  const deps = opts.deps || {};
  const extractAudio = deps.extractAudio || extractWindowAudio;

  const cacheDir = opts.cacheDir && process.env.ASR_CACHE_DISABLED !== "1" ? opts.cacheDir : null;
  let cacheKey = null;
  if (cacheDir) {
    try {
      cacheKey = await computeAsrCacheKey({ mediaPath, startMs, endMs, languageHint });
      const cached = getCachedResult(cacheDir, cacheKey);
      if (cached) {
        console.log(
          `  💾 ASR cache hit: ${mediaPath} (${startMs}-${endMs ?? "end"}ms, analyzed ${cached.meta.generatedAt || "unknown"})`,
        );
        return { ...cached.data, meta: { ...cached.data.meta, cacheHit: true } };
      }
    } catch {
      // cache read problems never block transcription
    }
  }

  const t0 = Date.now();
  let audioPath = null;
  let audioDir = null;
  try {
    const extraction = await extractAudio(mediaPath, startMs, endMs);
    audioPath = extraction.path;
    audioDir = extraction.dir;
  } catch (err) {
    return degradedResult(err?.code || "audio_extraction_failed");
  }

  try {
    const send = deps.sendToWorker || sendToWorker;
    const raw = await send({
      action: "transcribe",
      audioPath,
      startMs,
      endMs,
      languageHint,
    });
    const response = raw.error
      ? degradedResult(classifyWorkerError(raw.error))
      : shapeResult(raw, { startMs, endMs, languageHint });
    // Acceptance (#98): meta records elapsed time on every path.
    response.meta.durationMs = Date.now() - t0;
    // Success results are cached; degraded ones are not (retry on rerun).
    if (cacheDir && cacheKey && response.ok) {
      writeCachedResult(cacheDir, cacheKey, {
        data: { ...response },
        meta: { asrVersion: ASR_VERSION },
      });
    }
    return response;
  } finally {
    if (audioDir) rmSync(audioDir, { recursive: true, force: true });
  }
}

/**
 * Send one transcription request to the resident worker, with
 * requestId routing and generation-isolated timeout handling.
 */
function sendToWorker(request) {
  return new Promise((resolve) => {
    if (!ensureProcess()) {
      resolve({ error: "worker_unavailable" });
      return;
    }
    const requestId = randomUUID();
    const myGen = worker.generation;

    let payload;
    try {
      payload = JSON.stringify({
        requestId,
        action: request.action,
        audioPath: request.audioPath,
        languageHint: request.languageHint ?? null,
      });
    } catch (_err) {
      resolve({ error: "bad_request" });
      return;
    }

    try {
      worker.proc.stdin.write(payload + "\n");
    } catch (_err) {
      resolve({ error: "worker_write_failed" });
      return;
    }

    const timer = setTimeout(() => {
      if (worker.pending.has(requestId)) {
        worker.pending.delete(requestId);
        resolve({ error: "worker_timeout" });
        resetWorker();
      }
    }, RESPONSE_TIMEOUT_MS);

    worker.pending.set(requestId, {
      resolve,
      timer,
      workerGeneration: myGen,
    });
  });
}

/**
 * Close the resident ASR worker (pipeline shutdown / tests).
 */
export function closeAsrAnalyzer() {
  if (worker.proc && !worker.proc.killed) {
    try {
      worker.proc.stdin.write(JSON.stringify({ action: "exit" }) + "\n");
    } catch (_e) {
      try {
        worker.proc.kill("SIGTERM");
      } catch (_e2) {
        // ignore
      }
    }
  }
  worker.proc = null;
  worker.available = null;
  for (const [id, entry] of worker.pending) {
    clearTimeout(entry.timer);
    entry.resolve({ error: "worker_closed" });
  }
  worker.pending.clear();
}
