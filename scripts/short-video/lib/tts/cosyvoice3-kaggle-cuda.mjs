/**
 * CosyVoice3 Kaggle CUDA engine adapter.
 *
 * Runs CosyVoice3 on Kaggle P100 GPU (free, 30h/week) via the Kaggle Kernels API.
 * CUDA ExecutionProvider gives full emotion fidelity — unlike MLX/MPS which have
 * emotion regression vs CUDA baseline (verified 2026-09-07).
 *
 * Workflow:
 *   1. Build manifest from scenes (text + instruct_text with <|endofprompt|>)
 *   2. Embed manifest + per-call request id into the Kaggle kernel script
 *   3. Push kernel via `kaggle kernels push` (ref audio from Kaggle dataset)
 *   4. Poll `kaggle kernels status` until complete
 *   5. Download output into a per-call staging dir, recovering per file when
 *      the whole-batch transfer is cut short (#581), verify the kernel summary
 *      echoes this call's request id and that every requested scene is complete
 *      (#420), then promote into the audio dir
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

import { exec, execFile } from "child_process";
import { createHash, randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, join, dirname, relative } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { REGEN_STAGING_PREFIX } from "./staging.mjs";
import { assertRiffWaveHeader, walkRiffChunks } from "../audio/wav.mjs";
import { containedPath } from "../path-safety.mjs";
import { postProcessBatch, getProsodyProfile, engineTtsText } from "./post-process.mjs";
import { resolveSilenceFloorMs } from "./silence-trim.mjs";
import { resolveSceneSpeed } from "./pacing.mjs";
import { INSTRUCT_FORMAT, createInstructResolver } from "./instruct.mjs";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * The default exec seam.
 *
 * It MUST forward `opts`. The previous shape was `(cmd) => execAsync(cmd)`,
 * which silently dropped the second argument — so an exec timeout added at the
 * call site (#808) never reached production while every injected-mock test
 * stayed green. `deps.exec` is the only seam the tests can reach, so the
 * wiring itself is pinned separately by a PATH-shim test that exercises this
 * function with no `deps.exec` at all.
 */
const defaultExec = (cmd, opts) => execAsync(cmd, opts);

/**
 * The default argv seam for the slot/attribution probes (#1354).
 *
 * These probes carry a kernel ref into a CLI call. `execFile` passes it as one
 * argv element, so no shell parses it (Semgrep detect-child-process). The
 * poll's long-standing `exec` seam stays for compatibility; only the new
 * probes use this one.
 */
const defaultExecFile = (file, args, opts) => execFileAsync(file, args, opts);

// Kernel wall-clock defaults (#1354). `kaggle kernels push` has no env-var
// channel, so the adapter bakes these values into the pushed script; reading
// them at generate time keeps a test/operator override real.
const DEFAULT_KERNEL_WALL_CLOCK_BUDGET_SEC = 3 * 60 * 60;
const DEFAULT_KERNEL_HEARTBEAT_SEC = 60;
function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || String(value) !== raw.trim()) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

// ── Config ──
const KAGGLE_KERNEL_TEMPLATE = join(ROOT_DIR, "kaggle", "cosyvoice3_cuda_kernel.py");
// The frozen wheelhouse this repo expects to be mounted (#521). Kaggle cannot
// pin a dataset version (`dataset_sources` drops the version segment at push
// time and mounts the latest), so the kernel is handed the committed set and
// compares it to the mount before installing. Read at push time, not baked
// into the template, so the kernel can never carry a hand-copied copy.
const KAGGLE_WHEELHOUSE_MANIFEST = join(ROOT_DIR, "kaggle", "wheelhouse-manifest.json");
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
// Status-probe hardening (#808). `kaggle kernels status` reaches the network
// through kaggle 2.2.4 -> kagglesdk, whose `KaggleHttpClient.call()` does
// `self._session.send(request, **merge_environment_settings(...))` — that
// kwargs dict carries no `timeout`, and the whole kagglesdk package contains
// zero `timeout` hits, so requests waits forever. `promisify(exec)` adds no
// bound either (default `timeout: 0`). One half-open connection therefore
// parks `await exec(...)` permanently: the loop cannot iterate, prints
// nothing, and the process stays alive while a COMPLETE kernel is never
// collected (2026-10-20 run `deepseek-v41-flash-1017`: last log line 11:23:11,
// kernel finished 11:50, audio never downloaded, no error anywhere).
const KAGGLE_PROBE_TIMEOUT_MS = parseInt(
  process.env.COSYVOICE3_KAGGLE_PROBE_TIMEOUT_MS || "60000",
  10,
);
// How much wall-clock one run may spend on dead probes before failing closed.
// Instant CLI errors cost ~1s each, so the historical "404 while QUEUED keeps
// polling, the queue budget decides" behaviour is unchanged; only probes that
// burn their full timeout accumulate meaningfully (~15 attempts here), which
// is long enough to ride out a transient outage and short enough to stop
// holding a run hostage.
const KAGGLE_PROBE_FAILURE_BUDGET_MS = parseInt(
  process.env.COSYVOICE3_KAGGLE_PROBE_FAILURE_BUDGET_MS || "900000",
  10,
);
// Slot precheck (#1354). Kaggle's free tier runs ONE GPU session at a time and
// a re-push of the same slug stacks a new version behind the one that is still
// running — the queue therefore gets longer every time a timed-out pipeline is
// retried. Before pushing, `kaggle kernels list --mine` is narrowed to recent
// kernels, then each candidate (target first) is probed with
// `kaggle kernels status`. A target that is still RUNNING/QUEUED is waited out
// for a bounded 10min; another own kernel only earns a warning because queuing
// behind it is the documented, expected behaviour of the 40min queue budget.
const KAGGLE_SLOT_WAIT_MS = parseInt(process.env.COSYVOICE3_KAGGLE_SLOT_WAIT_MS || "600000", 10); // 10 min, pre-push only; the queue budget starts after the push
const KAGGLE_SLOT_POLL_INTERVAL_MS = parseInt(
  process.env.COSYVOICE3_KAGGLE_SLOT_POLL_INTERVAL_MS || "15000",
  10,
);
// How far back a listed kernel counts as a possible slot holder. One day
// covers a same-day pipeline retry; older COMPLETE kernels are history.
const KAGGLE_RECENT_KERNEL_WINDOW_MS = parseInt(
  process.env.COSYVOICE3_KAGGLE_RECENT_KERNEL_WINDOW_MS || String(24 * 60 * 60 * 1000),
  10,
);
// RUNNING but the log clock has not advanced for this long => report stalled.
// Setup normally logs every few seconds; the longest legitimate silent phase
// is the model load, and the pre-seeded mount keeps that well below 20min.
const KAGGLE_STUCK_WINDOW_MS = parseInt(
  process.env.COSYVOICE3_KAGGLE_STUCK_WINDOW_MS || "1200000",
  10,
);
// One list page can hold 200 kernels; each status/log probe is a network
// round-trip, so evidence collection is capped.
const KAGGLE_EVIDENCE_MAX_KERNELS = parseInt(
  process.env.COSYVOICE3_KAGGLE_EVIDENCE_MAX_KERNELS || "8",
  10,
);
// `kaggle kernels logs` streams the whole log as one JSON array; it can be a
// few hundred KB, so it gets a wider bound than a status probe.
const KAGGLE_LOG_PROBE_TIMEOUT_MS = parseInt(
  process.env.COSYVOICE3_KAGGLE_LOG_PROBE_TIMEOUT_MS || "120000",
  10,
);
const CV3_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");

// The kernel writes every artifact below `<working dir>/output`
// (kaggle/cosyvoice3_cuda_kernel.py: `/kaggle/working/output/<scene-N>.wav` +
// summary.json), and `kaggle kernels output` mirrors that relative layout.
const KAGGLE_OUTPUT_SUBDIR = "output";
const KAGGLE_SUMMARY_FILE = "summary.json";
/** The summary's path relative to the staging dir (`output/summary.json`). */
const KAGGLE_SUMMARY_REL = `${KAGGLE_OUTPUT_SUBDIR}/${KAGGLE_SUMMARY_FILE}`;
// Per-file recovery budget when the whole-batch download aborts (#581). The
// CLI's exit code is all-or-nothing: one SSL EOF while streaming the next
// artifact exits non-zero and the run used to be discarded even though the
// earlier takes had already landed (2026-09-27: 7 of 8 CosyVoice3 wavs on
// disk). Retries are bounded and stay far below the ~10min a re-push costs.
const KAGGLE_DOWNLOAD_RECOVERY_ATTEMPTS = 3;
const KAGGLE_DOWNLOAD_RECOVERY_BACKOFF_MS = 2000; // 2s → 4s → 8s

// ── Emotion instructions ──
// #270: the instruct standard (Persona + Accent + Emotion + Pacing, #234) has
// ONE source — ./instruct.mjs. This adapter used to carry a private
// INSTRUCT_MAP, which is what let a second generation path (#257) re-derive the
// pre-#234 wording and reproduce the accent regression. Adding a new style is
// now a change to the shared table, not to this file.
// CUDA (PyTorch) instruct format requires the <|endofprompt|> suffix.
export const resolveInstructForScene = createInstructResolver({
  format: INSTRUCT_FORMAT.PYTORCH,
});

/**
 * Build the CosyVoice3 batch manifest for CUDA (with <|endofprompt|>).
 *
 * Baseline = the user-approved Kaggle P100 emotion samples
 * (assets/tts-comparison/cosyvoice3-kaggle-p100-cuda/, verified 2026-09-07):
 * inference_instruct2 with the instruct-standard text (./instruct.mjs) and the
 * ref audio, NO rubberband
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
 * Kaggle slug charset/length constraints. Kernel slugs allow lowercase
 * letters, digits, `-` and `_`, max 50 chars.
 */
const KAGGLE_SLUG_MAX_LENGTH = 50;
const KAGGLE_SLUG_PREFIX = "cosyvoice3-cuda";

/** Simple deterministic 32-bit FNV-1a hash (hex) — disambiguates truncated slugs. */
function fnv1aHex(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Normalize a raw content id into a Kaggle-safe slug part: lowercase,
 * illegal characters → `-`, collapsed separators, trimmed edges.
 * @param {string} raw
 * @returns {string} sanitized slug part ("" if nothing survives)
 */
export function sanitizeKaggleSlugPart(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

/**
 * Derive the content/pipeline id from the TTS output directory. All callers
 * pass `output/<pipelineId>/audio` (main.mjs, rerender-full.mjs), so the id
 * is the full path below `output/` — nested pipelines like
 * `anthropic-distillation-7labs/pt1` keep their full prefix, otherwise two
 * unrelated articles both named `pt1` would derive the same slug and
 * silently cross-contaminate (the exact failure #267 removes). Outside the
 * output root, fall back to the dir basename.
 * @param {string} outputDir
 * @returns {string|null} content id, or null when none can be derived
 */
export function deriveContentIdFromOutputDir(outputDir) {
  if (!outputDir) return null;
  const rel = relative(join(ROOT_DIR, "output"), outputDir);
  if (rel && !rel.startsWith("..")) {
    const segments = rel.split(/[\\/]+/).filter(Boolean);
    // #423: regeneration rounds hand the engine a per-run staging dir nested
    // under the pipeline's audio dir. The slug must still derive from the
    // PIPELINE — the staging name embeds pid+timestamp, so treating it as part
    // of the id would push a new kernel on every reroll (overwrite-vs-queue
    // aside, each push is a fresh kernel and the slug cap would truncate it
    // into a hash of the timestamp).
    if (segments.at(-1)?.startsWith(REGEN_STAGING_PREFIX)) segments.pop();
    const stripped = segments.join("/").replace(/(^|\/)audio$/, "");
    if (stripped)
      return stripped
        .split(/[\\/]+/)
        .filter(Boolean)
        .join("/");
  }
  const base = basename(outputDir);
  if (base === "audio") {
    const parent = basename(dirname(outputDir));
    return parent || null;
  }
  return base || null;
}

/**
 * Resolve the Kaggle kernel slug for a TTS batch (#267).
 *
 * Priority: explicit `COSYVOICE3_KAGGLE_SLUG` env > semantic derivation from
 * the content id (`cosyvoice3-cuda-<contentId>`) > fail-fast. The old
 * hardcoded "cosyvoice3-cuda-batch" default made a forgotten env silently
 * cross-contaminate parallel pipelines — pushing to the same slug OVERWRITES
 * the kernel source instead of queueing (#250), so a shared slug is always a
 * bug, never a queue.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.envSlug] - raw COSYVOICE3_KAGGLE_SLUG value
 * @param {string|null} [opts.contentId] - content/pipeline id for derivation
 * @returns {string} Kaggle-safe kernel slug
 * @throws {Error} when neither an env slug nor a content id is available
 */
export function resolveKernelSlug({ envSlug, contentId } = {}) {
  const explicit = typeof envSlug === "string" ? envSlug.trim() : "";
  if (explicit) return explicit;

  const id = sanitizeKaggleSlugPart(contentId);
  if (!id) {
    throw new Error(
      "COSYVOICE3_KAGGLE_SLUG is not set and no content id could be derived for " +
        "the Kaggle kernel slug. Parallel pipelines MUST use distinct slugs — " +
        "pushing kernels under the same slug overwrites (not queues, #250) and " +
        "silently cross-contaminates runs. Fix: run via main.mjs (slug derives " +
        "from the content id) or set COSYVOICE3_KAGGLE_SLUG explicitly.",
    );
  }

  const prefix = `${KAGGLE_SLUG_PREFIX}-`;
  if (prefix.length + id.length <= KAGGLE_SLUG_MAX_LENGTH) {
    return `${prefix}${id}`;
  }
  // Truncate but stay unique per pipeline: a deterministic hash of the full
  // sanitized id disambiguates ids that only differ past the cut.
  const hash = fnv1aHex(id);
  const keep = KAGGLE_SLUG_MAX_LENGTH - prefix.length - 1 - hash.length;
  return `${prefix}${id.slice(0, keep)}-${hash}`;
}

/**
 * Per-call run identity for the Kaggle artifact seam (#420).
 *
 * Binds the manifest digest (what the kernel was asked to synthesize) to a
 * unique nonce. The kernel echoes this string into summary.json, so only
 * artifacts produced by the kernel build that received THIS call's manifest can
 * be accepted — a previous run's summary is rejected even when the manifest is
 * byte-identical (single-scene reroll with the same text).
 *
 * @param {string} manifestJson - exact JSON embedded into the pushed kernel
 * @param {object} [deps] - injectable seams for tests
 * @param {() => string} [deps.uuid]
 * @returns {string} request id ("<manifest-digest>-<uuid>")
 */
export function buildRunRequestId(manifestJson, deps = {}) {
  const uuid = deps.uuid ?? randomUUID();
  const digest = createHash("sha256").update(manifestJson).digest("hex").slice(0, 16);
  return `${digest}-${uuid}`;
}

/**
 * Verify that a kernel summary belongs to THIS run and covers exactly the
 * requested scenes (#420). Pure — file integrity is checked separately, before
 * anything is promoted into the audio directory.
 *
 * @param {object} summary - parsed summary.json from the kernel output
 * @param {object} expected
 * @param {string} expected.requestId - identity embedded in the pushed script
 * @param {Array<{id: number}>} expected.scenes - scenes this run requested
 * @throws {Error} when the summary is stale, foreign or incomplete
 */
export function verifyKaggleRunSummary(summary, { requestId, scenes }) {
  if (!summary || typeof summary !== "object") {
    throw new Error("Kaggle summary is not an object — refusing to promote unverifiable artifacts");
  }
  if (summary.requestId !== requestId) {
    throw new Error(
      `Kaggle summary does not belong to this run (expected requestId "${requestId}", ` +
        `got ${summary.requestId ? `"${summary.requestId}"` : "none"}) — refusing to promote ` +
        "stale or foreign artifacts.",
    );
  }
  if (!Array.isArray(summary.segments)) {
    throw new Error(
      "Kaggle summary has no segments array — refusing to promote unverifiable artifacts",
    );
  }
  const expectedOutputs = new Map(scenes.map((s) => [String(s.id), `scene-${s.id}.wav`]));
  const seen = new Set();
  for (const segment of summary.segments) {
    const key = String(segment?.sceneId);
    if (!expectedOutputs.has(key)) {
      throw new Error(
        `Kaggle summary contains scene ${segment?.sceneId} which was not requested — ` +
          "the summary does not belong to this run's manifest",
      );
    }
    if (seen.has(key)) {
      throw new Error(
        `Kaggle summary lists scene ${segment.sceneId} twice — refusing ambiguous output`,
      );
    }
    seen.add(key);
    if (segment.error) {
      if (typeof segment.error !== "string") {
        throw new Error(`Kaggle summary scene ${segment.sceneId} carries a non-string error`);
      }
      continue;
    }
    if (segment.output !== expectedOutputs.get(key)) {
      throw new Error(
        `Kaggle summary scene ${segment.sceneId} names output "${segment.output}" ` +
          `(expected "${expectedOutputs.get(key)}")`,
      );
    }
  }
  const missing = [...expectedOutputs.keys()].filter((key) => !seen.has(key));
  if (missing.length > 0) {
    throw new Error(
      `Kaggle summary is missing requested scenes: ${missing.join(", ")} — ` +
        "refusing to promote an incomplete kernel output",
    );
  }
  return summary;
}

/**
 * A downloaded kernel wav is only promotable when it is a complete RIFF/WAVE
 * file (#420): network hiccups are known to yield 0-byte or truncated Kaggle
 * downloads (#394 class), and a partial take must not enter the approved audio
 * path. Beyond the magic header, every declared chunk must fit inside the
 * downloaded bytes and a non-empty `data` chunk must be present — a 500-byte
 * file whose RIFF header still declares the full take is exactly the partial
 * download this gate exists to reject.
 *
 * @param {string} filePath - staged file under the per-call download dir
 * @param {number} sceneId - for the error message
 * @returns {string} filePath when complete
 * @throws {Error} when the file is missing, truncated or not a wav
 */
export function assertCompleteKernelWav(filePath, sceneId) {
  if (!existsSync(filePath)) {
    throw new Error(
      `Kaggle output file for scene ${sceneId} is missing (${basename(filePath)}) — ` +
        "refusing to promote an incomplete kernel output",
    );
  }
  const buf = readFileSync(filePath);
  try {
    assertRiffWaveHeader(buf, basename(filePath));
  } catch (e) {
    throw new Error(
      `Kaggle output file for scene ${sceneId} is incomplete or invalid (${e.message}) — ` +
        "refusing to promote invalid audio",
    );
  }
  let hasData = false;
  const overrun = walkRiffChunks(buf, (id, size) => {
    if (id === "data" && size > 0) hasData = true;
  });
  if (overrun) {
    throw new Error(
      `Kaggle output file for scene ${sceneId} is truncated (chunk "${overrun.id}" declares ` +
        `${overrun.size} bytes beyond the ${buf.length}-byte download) — refusing to promote ` +
        "a partial download",
    );
  }
  if (!hasData) {
    throw new Error(
      `Kaggle output file for scene ${sceneId} has no non-empty data chunk — ` +
        "refusing to promote incomplete audio",
    );
  }
  return filePath;
}

/** Escape a literal file name for embedding in `--file-pattern`. */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Anchored `--file-pattern` regex for a set of kernel output file NAMES.
 *
 * The CLI filters with `compiled_pattern.search(item.file_name)`
 * (kernels_output in kaggle_api_extended.py), where `file_name` is the
 * artifact's relative path — `output/scene-1.wav` — so both ends must be
 * anchored: a bare `scene-1.wav` would also select `scene-11.wav`, fetching a
 * take the run never asked for under the requested scene's name.
 *
 * @param {string[]} fileNames - e.g. ["scene-1.wav", "summary.json"]
 * @returns {string} regex accepted by `kaggle kernels output --file-pattern`
 */
export function buildKernelFilePattern(fileNames) {
  return `(^|/)(?:${fileNames.map(escapeRegExp).join("|")})$`;
}

/** Last non-empty line of a CLI failure (the Python exception, not the traceback head). */
function errorTail(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const tail = lines.at(-1) ?? "unknown error";
  return tail.length > 240 ? `${tail.slice(0, 240)}…` : tail;
}

/** Path of the staged kernel summary inside the per-call staging dir. */
function stagedSummaryPath(downloadDir) {
  return join(downloadDir, KAGGLE_OUTPUT_SUBDIR, KAGGLE_SUMMARY_FILE);
}

/** Read the staged kernel summary, or null when absent/unreadable. */
function readStagedSummary(downloadDir) {
  const summaryPath = stagedSummaryPath(downloadDir);
  if (!existsSync(summaryPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(summaryPath, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Files this run must end up with locally before the download seam returns.
 *
 * Until a usable summary is staged the kernel's coverage is unknown, so every
 * requested take is required (optimistic — the fetch for a scene that turns out
 * to have errored simply matches nothing). Once the summary is readable its
 * per-scene verdicts decide: the kernel writes NO wav for a scene it errored
 * (cosyvoice3_cuda_kernel.py appends `{sceneId, error}` without an output), and
 * the registry's self-heal owns that scene — requiring its wav here would turn
 * a legitimate partial batch into a download failure.
 *
 * @param {string} downloadDir - per-call staging dir
 * @param {number[]} expectedScenes - scene ids this run requested
 * @returns {string[]} paths relative to downloadDir
 */
function requiredArtifacts(downloadDir, expectedScenes) {
  const takes = expectedScenes.map((id) => ({
    id: String(id),
    rel: `${KAGGLE_OUTPUT_SUBDIR}/scene-${id}.wav`,
  }));
  const summary = readStagedSummary(downloadDir);
  if (!summary || !Array.isArray(summary.segments)) {
    return [KAGGLE_SUMMARY_REL, ...takes.map((t) => t.rel)];
  }
  const produced = new Set(
    summary.segments.filter((s) => !s?.error).map((s) => String(s?.sceneId)),
  );
  return [KAGGLE_SUMMARY_REL, ...takes.filter((t) => produced.has(t.id)).map((t) => t.rel)];
}

/** Scene id for the completeness gate's messages; the file name when unparsable. */
function artifactSceneLabel(relPath) {
  const name = basename(relPath);
  const match = name.match(/^scene-(\d+)\.wav$/);
  return match ? match[1] : name;
}

/**
 * Intactness of one staged artifact. Wavs go through the same RIFF/chunk gate
 * promotion uses (#420); the summary must be readable JSON. A half-written file
 * (truncated RIFF, 0 bytes) counts as absent — the seam's postcondition is that
 * the run's artifacts are present AND usable, not merely present.
 */
function isIntactArtifact(absPath, relPath) {
  if (!existsSync(absPath)) return false;
  if (relPath.endsWith(".wav")) {
    try {
      assertCompleteKernelWav(absPath, artifactSceneLabel(relPath));
      return true;
    } catch {
      return false;
    }
  }
  if (relPath.endsWith(".json")) {
    try {
      JSON.parse(readFileSync(absPath, "utf-8"));
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Validate what the batch attempt left behind and remove unusable files.
 *
 * @returns {{intact: string[], removed: string[]}} relative paths
 */
function salvageStagedArtifacts(downloadDir, expectedRels) {
  const intact = [];
  const removed = [];
  for (const rel of expectedRels) {
    const abs = join(downloadDir, rel);
    if (isIntactArtifact(abs, rel)) {
      intact.push(rel);
      continue;
    }
    if (existsSync(abs)) {
      // Remove it so the next pass cannot mistake a half-written file for a
      // usable one. Not because the CLI would trust it — `download_needed()`
      // re-downloads whenever the local file is smaller than the remote — but
      // because this seam's own bookkeeping (and its final report) must count
      // the file as absent until intact bytes are actually staged.
      rmSync(abs, { force: true });
      removed.push(rel);
    }
  }
  return { intact, removed };
}

/**
 * Download a finished kernel's output into the per-call staging dir, recovering
 * per file when the whole-batch transfer is cut short (#581).
 *
 * Postcondition: on resolve, the staging dir holds an INTACT copy of every
 * artifact the run needs (see requiredArtifacts) — otherwise this throws with
 * the missing files named. It deliberately does NOT verify run identity: the
 * #420 gate still reads summary.json afterwards and rejects a stale, foreign or
 * uncovered batch, so recovery can never promote a partial batch as complete.
 *
 * @param {object} opts
 * @param {string} opts.kernelId - "<owner>/<slug>"
 * @param {string} opts.downloadDir - per-call staging dir (downloads/<requestId>)
 * @param {number[]} opts.expectedScenes - scene ids this run requested
 * @param {(cmd: string) => Promise<{stdout: string}>} opts.runCmd - shell runner
 * @param {(ms: number) => Promise<void>} [opts.sleep] - backoff seam
 * @param {(msg: string) => void} [opts.log]
 * @returns {Promise<{batchFailed: boolean, removed: string[], recovered: string[]}>}
 * @throws {Error} when required artifacts are still missing after the budget
 *   (KAGGLE_DOWNLOAD_RECOVERY_ATTEMPTS rounds at KAGGLE_DOWNLOAD_RECOVERY_BACKOFF_MS
 *   base, doubling per round)
 */
export async function downloadKernelOutput({
  kernelId,
  downloadDir,
  expectedScenes,
  runCmd,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = (msg) => console.log(msg),
}) {
  mkdirSync(downloadDir, { recursive: true });
  const removed = [];
  const recovered = [];
  // Files that were present but unusable at least once (half-written transfer):
  // the final report must not read as if they never arrived upstream.
  const unusable = new Set();

  /** Recompute the required set, salvage it, and report what is still missing. */
  const salvagePass = () => {
    const required = requiredArtifacts(downloadDir, expectedScenes);
    const pass = salvageStagedArtifacts(downloadDir, required);
    // One entry per distinct file: a re-fetched copy that is truncated again is
    // the same file being discarded twice, not two files. `unusable` already
    // dedupes for the same reason.
    for (const rel of pass.removed) {
      if (!removed.includes(rel)) removed.push(rel);
      unusable.add(rel);
    }
    const intactSet = new Set(pass.intact);
    return { missing: required.filter((rel) => !intactSet.has(rel)), intactSet };
  };

  let batchError = null;
  try {
    await runCmd(`kaggle kernels output ${kernelId} -p "${downloadDir}" --force 2>&1`);
  } catch (e) {
    // A non-zero exit is a symptom, not a verdict: it cannot say whether the
    // takes that already landed are usable. Fall through to the recovery path
    // and let what is on disk decide.
    batchError = e;
  }
  let missing = salvagePass().missing;

  if (batchError) {
    const tail = errorTail(batchError.message ?? batchError);
    log(
      missing.length === 0
        ? `  ⚠️ Kaggle output download aborted (${tail}) but every required artifact is ` +
            "already staged intact — continuing (#581)"
        : `  ⚠️ Kaggle output download aborted (${tail}) — recovering ${missing.length} ` +
            "missing file(s) per file (#581)",
    );
  }

  let lastRecoveryError = null;

  /** Fetch `rels` with one anchored `--file-pattern` call and re-salvage. */
  const fetchAndSalvage = async (rels) => {
    try {
      const pattern = buildKernelFilePattern(rels.map((rel) => basename(rel)));
      await runCmd(
        `kaggle kernels output ${kernelId} -p "${downloadDir}" --file-pattern "${pattern}" --force 2>&1`,
      );
    } catch (e) {
      lastRecoveryError = e;
    }
    const after = salvagePass();
    // Only files that are now INTACT count as recovered: one that merely
    // dropped out of the required set (the freshly fetched summary narrowed it
    // to the scenes the kernel actually produced) was never fetched.
    for (const rel of rels) {
      if (after.intactSet.has(rel)) recovered.push(rel);
    }
    missing = after.missing;
  };

  for (
    let attempt = 1;
    missing.length > 0 && attempt <= KAGGLE_DOWNLOAD_RECOVERY_ATTEMPTS;
    attempt++
  ) {
    const waitMs = KAGGLE_DOWNLOAD_RECOVERY_BACKOFF_MS * 2 ** (attempt - 1);
    log(
      `  ↻ Kaggle per-file recovery ${attempt}/${KAGGLE_DOWNLOAD_RECOVERY_ATTEMPTS}: ` +
        `${missing.length} file(s) missing, retrying in ${waitMs}ms...`,
    );
    await sleep(waitMs);
    // The kernel writes summary.json LAST (cosyvoice3_cuda_kernel.py: after
    // every wav), so it is the most cut-prone artifact — and the file whose
    // per-scene verdicts decide which takes are actually required. Fetch it on
    // its own first: otherwise a cut would keep demanding the wav of a scene
    // the kernel errored on, and the bounded budget would fail a legitimately
    // partial batch.
    if (missing.includes(KAGGLE_SUMMARY_REL)) {
      await fetchAndSalvage([KAGGLE_SUMMARY_REL]);
    }
    if (missing.length > 0) {
      await fetchAndSalvage([...missing]);
    }
  }

  if (missing.length > 0) {
    const cause = batchError ?? lastRecoveryError;
    const described = missing.map((rel) =>
      unusable.has(rel) ? `${rel} (incomplete/truncated)` : `${rel} (not present)`,
    );
    const details =
      `per-file recovery left ${missing.length} file(s) missing after ` +
      `${KAGGLE_DOWNLOAD_RECOVERY_ATTEMPTS} attempt(s): ${described.join(", ")}`;
    throw new Error(
      `Failed to download Kaggle output: ${cause ? `${cause.message ?? cause} — ` : ""}${details}`,
    );
  }
  return { batchFailed: batchError !== null, removed, recovered };
}

/**
 * Check if Kaggle CLI is available and configured.
 *
 * `deps.refAudioPath` overrides the repo voice sample so the engine's
 * availability gate is testable on a pristine CI checkout (voice-samples/ is
 * gitignored) — the smoke contract is the same either way.
 *
 * @returns {Promise<boolean>}
 */
async function isAvailable(deps = {}) {
  if (!existsSync(KAGGLE_KERNEL_TEMPLATE)) return false;
  if (!existsSync(deps.refAudioPath ?? CV3_REF_AUDIO)) return false;
  const username = getKaggleUsername();
  if (!username) return false;
  try {
    // Availability probe honours the injected exec seam like the rest of the
    // engine — the module contract is "batch contract testable without
    // touching real Kaggle", and a real `kaggle --version` can take ~9s of
    // wall-clock on shimmed Python installs (deterministic test timeout).
    const probe = deps.exec ?? defaultExec;
    await probe("kaggle --version 2>/dev/null");
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

/** Kernel refs are case-insensitive on Kaggle; compare them one way. */
function sameRef(a, b) {
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
}

/** A phase that holds the single free-tier GPU session. */
function isActivePhase(phase) {
  return phase === "running" || phase === "queued";
}

/** A phase that has released the slot; UNKNOWN is neither active nor terminal. */
function isTerminalPhase(phase) {
  return phase === "complete" || phase === "error" || phase === "cancel";
}

/**
 * Best-effort JSON artifact write (poll-status / run evidence / attribution).
 * Fail-open: a missing directory or a read-only checkout must not turn an
 * otherwise working run into a failure. Only observability is lost.
 */
function writeJsonFile(filePath, payload) {
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

function firstLine(text) {
  return String(text ?? "")
    .split("\n")[0]
    .trim();
}

function formatLogClock(seconds) {
  if (!Number.isFinite(seconds)) return "unknown";
  return fmtDuration(Math.max(0, seconds) * 1000);
}

/**
 * Parse the JSON body `kaggle kernels list --format json` prints.
 *
 * The CLI writes its "outdated version" warning to stderr, but the engine
 * captures `2>&1` like every other probe, so the payload starts after the
 * first `[`. An empty/failed list is an empty array, never a throw: a failed
 * precheck must not block a push (the push itself will fail loudly if the
 * network is really down).
 *
 * @param {string} raw
 * @returns {Array<{ref: string, title?: string, lastRunTime?: string}>}
 */
export function parseKernelList(raw) {
  const text = String(raw ?? "");
  const start = text.indexOf("[");
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(text.slice(start));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Parse a Kaggle list timestamp.
 *
 * `lastRunTime` is UTC but carries no zone suffix (`2026-11-15T01:00:04.977000`).
 * `Date.parse` would read that as LOCAL time, shifting a RUNNING kernel's age by
 * the host's UTC offset — in UTC+8 a kernel started 10 minutes ago would look
 * 8h10m old and be misclassified as stalled. Append `Z` unless the value
 * already carries one.
 *
 * @param {string} raw
 * @returns {number} epoch ms, or NaN
 */
export function parseKaggleTimestamp(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return NaN;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  return Date.parse(hasZone ? text : `${text}Z`);
}

/**
 * Parse the version echoed by `kaggle kernels push` (#1354).
 *
 * The CLI prints `Kernel version <N> successfully pushed.` on success. The
 * version is evidence only: a missing/unparsable line must not fail a push
 * that the CLI itself accepted.
 *
 * @param {string} raw
 * @returns {number|null}
 */
export function parseKernelPushVersion(raw) {
  const match = String(raw ?? "").match(/Kernel version\s+(\d+)\s+successfully pushed/i);
  return match ? Number(match[1]) : null;
}

/**
 * Parse `kaggle kernels logs` output into the two progress signals the
 * attribution needs (#1354): the newest log clock (`time`, seconds since the
 * session started) and the newest `KERNEL_HEARTBEAT` line emitted by the
 * kernel's own watchdog.
 *
 * The CLI prints the whole stream as one JSON array with a non-JSON warning
 * line in front, so the parser starts at the first `[` and falls back to a
 * line scan when the payload is truncated.
 *
 * @param {string} raw
 * @returns {{lastLogSeconds: number|null, lastHeartbeat: {phase: string, elapsedSec: number, logSeconds: number|null}|null, lastLine: string|null}}
 */
export function parseKernelLogProgress(raw) {
  const text = String(raw ?? "");
  const start = text.indexOf("[");
  let entries = null;
  if (start >= 0) {
    try {
      const parsed = JSON.parse(text.slice(start));
      if (Array.isArray(parsed)) entries = parsed;
    } catch {
      // truncated/plain-text output falls through to the line scan
    }
  }

  let lastLogSeconds = null;
  let lastHeartbeat = null;
  let lastLine = null;

  const noteLine = (line, logSeconds = null) => {
    const trimmed = String(line ?? "").trim();
    if (!trimmed) return;
    lastLine = trimmed;
    const match = trimmed.match(/KERNEL_HEARTBEAT phase=(\S+) elapsed=(\d+)s/);
    if (match) {
      lastHeartbeat = {
        phase: match[1],
        elapsedSec: Number(match[2]),
        logSeconds: Number.isFinite(logSeconds) ? logSeconds : null,
      };
    }
  };

  if (entries) {
    for (const entry of entries) {
      const t = Number(entry?.time);
      if (Number.isFinite(t)) {
        lastLogSeconds = lastLogSeconds === null ? t : Math.max(lastLogSeconds, t);
      }
      for (const line of String(entry?.data ?? "").split("\n")) {
        noteLine(line, Number.isFinite(t) ? t : null);
      }
    }
  } else {
    for (const line of text.split("\n")) noteLine(line);
  }

  return { lastLogSeconds, lastHeartbeat, lastLine };
}

async function probeKernelStatus(ref, { execFile: run = defaultExecFile, probeTimeoutMs }) {
  try {
    const { stdout } = await run("kaggle", ["kernels", "status", ref], {
      timeout: probeTimeoutMs,
      killSignal: "SIGKILL",
    });
    const raw = String(stdout ?? "").trim();
    return {
      ref,
      ok: true,
      phase: classifyKernelStatus(raw),
      statusLine: firstLine(raw),
      error: null,
    };
  } catch (e) {
    const raw = String(e.stderr || e.stdout || e.message || "unknown").trim();
    return {
      ref,
      ok: false,
      // A failed probe is not kernel truth (#250). It only means this
      // precheck cannot see the slot; unattributable, not "RUNNING".
      phase: "unknown",
      statusLine: firstLine(raw),
      error: firstLine(raw),
    };
  }
}

async function probeKernelLogProgress(ref, { execFile: run = defaultExecFile, probeTimeoutMs }) {
  try {
    const { stdout } = await run("kaggle", ["kernels", "logs", ref], {
      timeout: probeTimeoutMs,
      killSignal: "SIGKILL",
      // A real kernel log (pip + model + inference) is routinely >1MB, the
      // child_process.exec default. Without this the probe fails with
      // ERR_CHILD_PROCESS_STDIO_MAXBUFFER and every RUNNING kernel looks
      // like it has no log evidence.
      maxBuffer: 32 * 1024 * 1024,
    });
    const parsed = parseKernelLogProgress(stdout);
    return { ref, ok: true, ...parsed, error: null };
  } catch (e) {
    return {
      ref,
      ok: false,
      lastLogSeconds: null,
      lastHeartbeat: null,
      lastLine: null,
      error: firstLine(e.stderr || e.stdout || e.message),
    };
  }
}

/**
 * Look for the slot owner among own kernels (#1354).
 *
 * `kaggle kernels list` does NOT expose a status column in 2.2.4 — the JSON
 * carries only ref/title/lastRunTime/totalVotes. The status has to be asked
 * per kernel, so the list is narrowed to the target plus kernels that ran in
 * the recent window, and the probe count is capped.
 *
 * @returns {Promise<{listOk: boolean, listError: string|null, target: object, holders: object[], probes: object[]}>}
 */
async function probeOwnKernelSlots({
  kernelId,
  execFile: run = defaultExecFile,
  now = Date.now,
  recentWindowMs = KAGGLE_RECENT_KERNEL_WINDOW_MS,
  maxKernels = KAGGLE_EVIDENCE_MAX_KERNELS,
  probeTimeoutMs = KAGGLE_PROBE_TIMEOUT_MS,
}) {
  const probe = async (args) => {
    try {
      const { stdout } = await run("kaggle", args, {
        timeout: probeTimeoutMs,
        killSignal: "SIGKILL",
      });
      return { ok: true, raw: String(stdout ?? "") };
    } catch (e) {
      return { ok: false, raw: String(e.stderr || e.stdout || e.message || "unknown") };
    }
  };

  const list = await probe([
    "kernels",
    "list",
    "--mine",
    "--sort-by",
    "dateRun",
    "--page-size",
    "200",
    "--format",
    "json",
  ]);
  const entries = list.ok ? parseKernelList(list.raw) : [];
  const targetRef = String(kernelId).toLowerCase();
  const nowMs = now();

  const ordered = [];
  const seen = new Set();
  // The target is probed first even when it has never been pushed: a 404 is
  // the expected answer for a fresh slug and means "slot free". If the list
  // does contain it, carry `listed` so the precheck can tell "fresh slug"
  // (fail-open) from "exists but status unreadable" (fail-closed).
  const targetEntry = entries.find((entry) => sameRef(entry?.ref, kernelId));
  ordered.push({
    ref: kernelId,
    lastRunTime: targetEntry?.lastRunTime ?? null,
    listed: Boolean(targetEntry),
  });
  seen.add(targetRef);
  for (const entry of entries) {
    const ref = String(entry?.ref ?? "").trim();
    if (!ref) continue;
    const key = ref.toLowerCase();
    if (seen.has(key)) continue;
    const ranAt = parseKaggleTimestamp(entry?.lastRunTime);
    const recent = Number.isFinite(ranAt) && nowMs - ranAt <= recentWindowMs;
    if (!recent) continue;
    seen.add(key);
    ordered.push({ ref, lastRunTime: entry?.lastRunTime ?? null });
    if (ordered.length >= maxKernels) break;
  }

  const probes = [];
  for (const item of ordered) {
    const result = await probeKernelStatus(item.ref, { execFile: run, probeTimeoutMs });
    probes.push({
      ...result,
      lastRunTime: item.lastRunTime,
      listed: Boolean(item.listed),
    });
  }

  const holders = probes.filter((p) => isActivePhase(p.phase));
  return {
    listOk: list.ok,
    listError: list.ok ? null : firstLine(list.raw),
    target: probes[0],
    holders,
    probes,
  };
}

/**
 * Pre-push slot precheck (#1354).
 *
 * Same-slug RUNNING/QUEUED is the dangerous case: re-pushing stacks a new
 * version behind the old one and makes the wait longer every retry. Wait for
 * it, bounded, then refuse. Another own kernel only gets a warning — queuing
 * behind it is what the 40min queue budget exists for.
 *
 * Fail-open applies when the list itself fails: a network hiccup must not block
 * a push, and the push itself is the authoritative failure if Kaggle is down.
 * Once the list proves the slug exists, an unreadable status is refused instead
 * — the version may still be live, and stacking is what this check exists to
 * stop.
 *
 * @param {string} kernelId - e.g. "username/cosyvoice3-cuda-batch"
 * @param {object} [opts]
 * @param {number} [opts.waitBudgetMs]
 * @param {number} [opts.pollIntervalMs]
 * @param {object} [deps] - injected execFile/sleep/now/log for tests
 * @returns {Promise<{waitedMs: number, target: object, holders: object[], probes: object[], listOk: boolean, listError: string|null}>}
 * @throws {Error} when the target itself stays RUNNING/QUEUED past the wait budget
 */
export async function preflightKernelSlot(kernelId, opts = {}, deps = {}) {
  const {
    waitBudgetMs = KAGGLE_SLOT_WAIT_MS,
    pollIntervalMs = KAGGLE_SLOT_POLL_INTERVAL_MS,
    recentWindowMs = KAGGLE_RECENT_KERNEL_WINDOW_MS,
    probeTimeoutMs = KAGGLE_PROBE_TIMEOUT_MS,
  } = opts;
  const execFile = deps.execFile ?? defaultExecFile;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((msg) => console.log(msg));

  let snapshot = await probeOwnKernelSlots({
    kernelId,
    execFile,
    now,
    recentWindowMs,
    probeTimeoutMs,
  });
  const started = now();
  let waitedMs = 0;
  const isActive = (probe) => isActivePhase(probe?.phase);
  const isTerminal = (probe) => isTerminalPhase(probe?.phase);

  // "Fresh slug" and "existing kernel whose status probe failed" both look
  // like `unknown`, but only the first is safe to push. The list tells them
  // apart; an existing target gets one retry, then a refusal. This is the
  // case that used to be silently fail-open and could stack a version behind
  // a QUEUED kernel whose status CLI was returning 404 (#250).
  if (snapshot.target.phase === "unknown" && snapshot.target.listed) {
    log(
      `  ⚠️ [Kaggle] Slot precheck: ${kernelId} exists but its status probe failed ` +
        `(${snapshot.target.error || "unknown"}) — retrying once before refusing`,
    );
    await sleep(Math.min(pollIntervalMs, 2000));
    const retry = await probeKernelStatus(kernelId, { execFile, probeTimeoutMs });
    snapshot = {
      ...snapshot,
      target: {
        ...retry,
        listed: true,
        lastRunTime: snapshot.target.lastRunTime,
      },
      holders: snapshot.holders
        .filter((h) => !sameRef(h.ref, kernelId))
        .concat(isActive(retry) ? [{ ...retry, lastRunTime: snapshot.target.lastRunTime }] : []),
    };
    if (snapshot.target.phase === "unknown") {
      throw new Error(
        `Kaggle slot precheck: own kernel ${kernelId} exists in your kernel list but ` +
          `its status could not be read after 2 probes (${snapshot.target.error || "unknown"}). ` +
          `Refusing to push another version while its state is unknown — it may still be ` +
          `RUNNING/QUEUED, and a re-push stacks a new version behind it. Check ` +
          `\`kaggle kernels status ${kernelId}\` and re-run; the queue budget was not consumed.`,
      );
    }
  }

  if (isActive(snapshot.target)) {
    log(
      `  ⏳ [Kaggle] Slot precheck: ${kernelId} is ${snapshot.target.phase.toUpperCase()} — ` +
        `waiting up to ${fmtDuration(waitBudgetMs)} before pushing ` +
        `(a re-push would stack a new version behind it)`,
    );
    // A probe that fails mid-wait must NOT be read as "the slot is free":
    // keep the last known active phase and keep waiting. Only COMPLETE /
    // ERROR / CANCEL release the slot.
    let lastTarget = snapshot.target;
    while (!isTerminal(lastTarget) && now() - started < waitBudgetMs) {
      await sleep(pollIntervalMs);
      const target = await probeKernelStatus(kernelId, { execFile, probeTimeoutMs });
      if (target.phase !== "unknown") lastTarget = target;
      snapshot = {
        ...snapshot,
        target: lastTarget,
        holders: snapshot.holders
          .filter((h) => !sameRef(h.ref, kernelId))
          .concat(isActive(lastTarget) ? [{ ...lastTarget, lastRunTime: null }] : []),
      };
      waitedMs = now() - started;
      if (!isTerminal(lastTarget)) {
        log(
          `  ⏳ [Kaggle] Slot precheck: ${kernelId} still ` +
            `${lastTarget.phase.toUpperCase()} (${fmtDuration(waitedMs)}/${fmtDuration(waitBudgetMs)})`,
        );
      }
    }
    if (!isTerminal(lastTarget)) {
      throw new Error(
        `Kaggle slot precheck: own kernel ${kernelId} is still ` +
          `${lastTarget.phase.toUpperCase()} after ${fmtDuration(waitedMs)}. ` +
          `Not pushing it again — a re-push stacks a new version behind the running one ` +
          `and lengthens the queue. Wait for it to finish, then re-run; if it is stuck, ` +
          `it ends at Kaggle's session cap (kernels pushed with the current template also ` +
          `have their own wall-clock budget). ` +
          `The queue budget was not consumed. Status: ${lastTarget.statusLine || "unknown"}`,
      );
    }
    const refreshed = await probeOwnKernelSlots({
      kernelId,
      execFile,
      now,
      recentWindowMs,
      probeTimeoutMs,
    });
    // The refreshed list can itself fail; the terminal status we just saw is
    // the stronger evidence, so do not let an unknown overwrite it.
    snapshot = {
      ...refreshed,
      target: refreshed.target.phase === "unknown" ? lastTarget : refreshed.target,
      holders: refreshed.holders.filter((h) => !sameRef(h.ref, kernelId)),
    };
    log(
      `  ✓ [Kaggle] Slot precheck: ${kernelId} is now ` +
        `${snapshot.target.phase.toUpperCase()} — safe to push`,
    );
  }

  if (!snapshot.listOk) {
    log(
      `  ⚠️ [Kaggle] Slot precheck: own-kernel list unavailable ` +
        `(${snapshot.listError || "unknown error"}) — pushing without the full check`,
    );
  }
  for (const holder of snapshot.holders) {
    if (sameRef(holder.ref, kernelId)) continue;
    log(
      `  ⚠️ [Kaggle] Slot precheck: own kernel ${holder.ref} is ` +
        `${holder.phase.toUpperCase()} — this push will queue behind Kaggle's single ` +
        `free-tier GPU session (queue budget ${Math.round(KAGGLE_QUEUE_TIMEOUT_MS / 60000)}min)`,
    );
  }

  return {
    waitedMs,
    target: snapshot.target,
    holders: snapshot.holders,
    probes: snapshot.probes,
    listOk: snapshot.listOk,
    listError: snapshot.listError,
  };
}

function findQuotaSignal(texts) {
  // Kaggle does not expose remaining quota. These phrases are the only quota
  // evidence available: an error the CLI actually printed. A match is still
  // an inference from wording, not a quota API answer.
  const re =
    /\b(quota|gpu\s+limit|session\s+limit|weekly\s+limit|out\s+of\s+gpu|resources?\s+exhausted|exceeded\b.*\b(gpu|session|quota))\b/i;
  for (const text of texts) {
    const raw = String(text ?? "").trim();
    if (!raw) continue;
    const match = raw.match(re);
    if (match) return { text: firstLine(raw), match: match[0] };
  }
  return null;
}

/**
 * Decide the three-way cause from the evidence that was actually observed.
 *
 * The conclusion is deliberately not called a Kaggle answer: Kaggle exposes no
 * queue reason, queue position or remaining quota. `confidence` says whether
 * the deciding signal was directly observed (`slow` = logs advancing,
 * `unknown` = no usable evidence) or inferred from status patterns.
 *
 * @param {object} input
 * @returns {{cause: "quota"|"stuck"|"slow"|"congestion"|"unknown", confidence: "observed"|"inferred"|"unknown", reasons: string[]}}
 */
export function classifyQueueCause({
  timeoutKind,
  kernelId,
  target,
  quotaSignal = null,
  stuck = [],
  activeOthers = [],
  targetEvidence = null,
  stuckWindowMs = KAGGLE_STUCK_WINDOW_MS,
} = {}) {
  const reasons = [];
  if (quotaSignal) {
    reasons.push(`Kaggle CLI reported a quota-related error: ${quotaSignal.text}`);
    return { cause: "quota", confidence: "inferred", reasons };
  }
  const stuckReason = (kernel) => {
    const lastLog =
      kernel.log?.lastHeartbeat?.phase != null
        ? `last heartbeat phase=${kernel.log.lastHeartbeat.phase} at ${formatLogClock(
            kernel.log.lastHeartbeat.logSeconds,
          )}`
        : `last log at ${formatLogClock(kernel.log?.lastLogSeconds)}`;
    return `${kernel.ref} has been RUNNING with no log progress for ${fmtDuration(
      kernel.stalenessMs,
    )} (${lastLog}); a RUNNING kernel holds the session and burns quota`;
  };

  if (timeoutKind === "run") {
    const targetStuck = stuck.find((k) => sameRef(k.ref, kernelId));
    if (targetStuck) {
      return {
        cause: "stuck",
        confidence: "inferred",
        reasons: [
          stuckReason(targetStuck),
          "Kaggle has no cancel API; a stuck kernel ends at the 9-12h session cap or at the kernel's own wall-clock budget",
        ],
      };
    }
    const evidence =
      targetEvidence ?? [...stuck, ...activeOthers].find((k) => sameRef(k.ref, kernelId)) ?? null;
    if (evidence?.log?.lastLogSeconds != null && evidence.stalenessMs != null) {
      if (evidence.stalenessMs <= stuckWindowMs) {
        reasons.push(
          `${evidence.ref} was still logging (last log at ${formatLogClock(
            evidence.log.lastLogSeconds,
          )}, ${fmtDuration(evidence.stalenessMs)} behind the run clock) when the host run budget expired`,
        );
        return { cause: "slow", confidence: "observed", reasons };
      }
    }
    reasons.push(
      "The RUNNING budget expired without usable log-progress evidence; the kernel may be slow, stuck, or already finished",
    );
    return { cause: "unknown", confidence: "unknown", reasons };
  }

  if (stuck.length > 0) {
    return {
      cause: "stuck",
      confidence: "inferred",
      reasons: [
        ...stuck.map(stuckReason),
        "Kaggle has no cancel API; a stuck kernel ends at the 9-12h session cap or at the kernel's own wall-clock budget",
      ],
    };
  }

  // The poller's last phase is captured at timeout; the attribution's fresh
  // probe is a later observation. Prefer it when it changed: a kernel that
  // finished or started running during a probe-blind stretch must not be
  // reported as "stayed QUEUED".
  const freshPhase = String(targetEvidence?.phase ?? "unknown");
  const pollerPhase = String(target?.phase ?? "unknown");
  if (freshPhase !== "unknown" && freshPhase !== pollerPhase) {
    if (freshPhase === "complete") {
      reasons.push(
        `target ${kernelId} is COMPLETE in the fresh probe after the queue timeout — collect its output with \`kaggle kernels output ${kernelId} -p <dir>\` instead of re-pushing`,
      );
      return { cause: "unknown", confidence: "observed", reasons };
    }
    if (freshPhase === "running") {
      if (
        targetEvidence.log?.lastLogSeconds != null &&
        targetEvidence.stalenessMs != null &&
        targetEvidence.stalenessMs <= stuckWindowMs
      ) {
        reasons.push(
          `target ${kernelId} started RUNNING after the poller's last status and is still logging (last log at ${formatLogClock(
            targetEvidence.log.lastLogSeconds,
          )}, ${fmtDuration(targetEvidence.stalenessMs)} behind the run clock); collect it when it finishes`,
        );
        return { cause: "slow", confidence: "observed", reasons };
      }
      reasons.push(
        `target ${kernelId} is RUNNING in the fresh probe after the queue timeout but has no usable log-progress evidence; collect it with \`kaggle kernels output ${kernelId} -p <dir>\` when it finishes`,
      );
      return { cause: "unknown", confidence: "observed", reasons };
    }
    if (isTerminalPhase(freshPhase)) {
      reasons.push(
        `target ${kernelId} is ${freshPhase.toUpperCase()} in the fresh probe after the queue timeout — inspect/collect it instead of re-pushing`,
      );
      return { cause: "unknown", confidence: "observed", reasons };
    }
  }

  const targetPhase = String(freshPhase !== "unknown" ? freshPhase : pollerPhase).toUpperCase();
  if (activeOthers.length > 0) {
    for (const kernel of activeOthers) {
      reasons.push(
        `own kernel ${kernel.ref} is ${kernel.phase.toUpperCase()} and shares Kaggle's single free-tier GPU session`,
      );
    }
    reasons.push(`target ${kernelId} was still ${targetPhase} when the queue budget expired`);
    return { cause: "congestion", confidence: "inferred", reasons };
  }
  if (targetPhase === "UNKNOWN") {
    reasons.push(
      `no usable status was observed for ${kernelId} and no own kernel was observed RUNNING or QUEUED — the CLI probes failed, so no cause is claimed`,
    );
    return { cause: "unknown", confidence: "unknown", reasons };
  }
  reasons.push(
    `target ${kernelId} stayed ${targetPhase} for the whole queue budget and no own kernel was observed RUNNING or QUEUED`,
  );
  return { cause: "congestion", confidence: "inferred", reasons };
}

/**
 * Collect the post-timeout evidence bundle (#1354) and classify its cause.
 *
 * Everything in `ownKernels` is copied from the API; `conclusion` is the
 * derived part and is labelled as such. Log progress is only fetched for
 * RUNNING kernels: `kaggle kernels logs` on a QUEUED kernel can return the
 * previous version's log, which would attribute progress to the wrong run.
 *
 * @returns {Promise<object>} the JSON-serialisable evidence bundle
 */
export async function collectQueueAttribution({
  kernelId,
  timeoutKind,
  target = null,
  attempt = null,
  probeFailures = 0,
  probeFailureMs = 0,
  lastProbeError = null,
  execFile = defaultExecFile,
  now = Date.now,
  probeTimeoutMs = KAGGLE_PROBE_TIMEOUT_MS,
  logProbeTimeoutMs = KAGGLE_LOG_PROBE_TIMEOUT_MS,
  stuckWindowMs = KAGGLE_STUCK_WINDOW_MS,
  recentWindowMs = KAGGLE_RECENT_KERNEL_WINDOW_MS,
} = {}) {
  const slot = await probeOwnKernelSlots({
    kernelId,
    execFile,
    now,
    recentWindowMs,
    probeTimeoutMs,
  });
  const ownKernels = [];
  for (const probe of slot.probes) {
    const entry = {
      ref: probe.ref,
      phase: probe.phase,
      statusLine: probe.statusLine,
      lastRunTime: probe.lastRunTime ?? null,
      log: null,
      stalenessMs: null,
    };
    if (probe.phase === "running") {
      const progress = await probeKernelLogProgress(probe.ref, {
        execFile,
        probeTimeoutMs: logProbeTimeoutMs,
      });
      entry.log = progress.ok
        ? {
            lastLogSeconds: progress.lastLogSeconds,
            lastHeartbeat: progress.lastHeartbeat,
            lastLine: progress.lastLine,
          }
        : { error: progress.error };
      // The target's RUNNING clock is normally measured by the poller. At a
      // queue timeout it never observed RUNNING (runningMs=0), yet the fresh
      // probe can show the kernel running; fall back to the same lastRunTime
      // upper bound used for other kernels so a stuck target is still caught.
      const pollerRunningMs = sameRef(probe.ref, kernelId) ? Number(target?.runningMs ?? 0) : null;
      const runningMs =
        pollerRunningMs && pollerRunningMs > 0
          ? pollerRunningMs
          : entry.lastRunTime
            ? Math.max(0, now() - parseKaggleTimestamp(entry.lastRunTime))
            : pollerRunningMs;
      if (
        runningMs != null &&
        Number.isFinite(runningMs) &&
        progress.ok &&
        progress.lastLogSeconds != null
      ) {
        entry.stalenessMs = Math.max(0, runningMs - progress.lastLogSeconds * 1000);
      }
    }
    ownKernels.push(entry);
  }

  const quotaSignal = findQuotaSignal([
    slot.listError,
    ...ownKernels.map((k) => k.statusLine),
    ...ownKernels.map((k) => k.log?.error),
    lastProbeError,
  ]);
  const stuck = ownKernels.filter(
    (k) => k.phase === "running" && k.stalenessMs != null && k.stalenessMs > stuckWindowMs,
  );
  const activeOthers = ownKernels.filter(
    (k) => !sameRef(k.ref, kernelId) && isActivePhase(k.phase),
  );
  const targetEvidence = ownKernels.find((k) => sameRef(k.ref, kernelId)) ?? null;
  const conclusion = classifyQueueCause({
    timeoutKind,
    kernelId,
    target,
    quotaSignal,
    stuck,
    activeOthers,
    targetEvidence,
    stuckWindowMs,
  });

  return {
    schemaVersion: 1,
    kernelId,
    timeoutKind,
    observedAt: new Date(now()).toISOString(),
    attempt: attempt ?? null,
    target: target ?? null,
    ownKernels,
    signals: {
      listOk: slot.listOk,
      listError: slot.listError,
      probeFailures,
      probeFailureMs,
      lastProbeError,
      quotaSignal,
      stuckWindowMs,
      activeOwnKernels: activeOthers.length,
    },
    conclusion,
    limits:
      "Kaggle exposes no queue reason, queue position, or remaining quota. " +
      "The cause is classified from observable kernel statuses and log progress, not returned by Kaggle.",
  };
}

/**
 * Error text shared by the queue/run timeout paths. The old queue message
 * asserted "Another kernel holds Kaggle's single free-tier GPU session" from
 * the single fact that our own kernel was QUEUED — a fabricated cause (#1354).
 * This formatter only claims what the evidence bundle observed.
 */
export function formatKernelTimeoutError({
  timeoutKind,
  kernelId,
  queuedMs = 0,
  ranMs = 0,
  queueTimeoutMs = KAGGLE_QUEUE_TIMEOUT_MS,
  runTimeoutMs = KAGGLE_TIMEOUT_MS,
  attribution = null,
  attributionFile = null,
}) {
  const conclusion = attribution?.conclusion ?? {
    cause: "unknown",
    confidence: "unknown",
    reasons: ["evidence collection failed"],
  };
  const evidence = attributionFile ? `evidence: ${attributionFile}. ` : "";
  const target = attribution?.target;
  const freshTarget = attribution?.ownKernels?.find((k) => sameRef(k.ref, kernelId)) ?? null;
  const freshPhase = freshTarget?.phase ?? null;
  const targetPhase = String(freshPhase ?? target?.phase ?? "unknown").toUpperCase();
  const targetLine =
    target || freshTarget
      ? `target ${kernelId}: ${targetPhase}` +
        (target?.queuedMs != null
          ? ` (queued ${fmtDuration(target.queuedMs)}, running ${fmtDuration(target.runningMs ?? 0)})`
          : "")
      : `target ${kernelId}: unknown`;
  // pushedAt is the queue start: the push is what enqueues the version. The
  // old queueStartedAt field was a plain alias and duplicated the timestamp.
  const attemptLine = attribution?.attempt?.version
    ? `kernel version ${attribution.attempt.version}, queue started ${attribution.attempt.pushedAt}`
    : attribution?.attempt?.pushedAt
      ? `kernel version unknown, queue started ${attribution.attempt.pushedAt}`
      : null;
  const reasonLines = (conclusion.reasons ?? []).map((reason) => `  - ${reason}`);

  const head =
    timeoutKind === "queue"
      ? `Kaggle kernel waiting for ${fmtDuration(queuedMs)} — exceeded queue timeout ` +
        `(${Math.round(queueTimeoutMs / 60000)}min). Cause: ${conclusion.cause} ` +
        `(${conclusion.confidence}); ${evidence}`
      : `Kaggle kernel timed out after ${fmtDuration(ranMs)} of RUNNING ` +
        `(run timeout ${Math.round(runTimeoutMs / 60000)}min). Cause: ${conclusion.cause} ` +
        `(${conclusion.confidence}); ${evidence}`;

  const tail =
    timeoutKind === "queue"
      ? freshPhase === "complete"
        ? `Do NOT re-push: the target is COMPLETE — collect its output with ` +
          `\`kaggle kernels output ${kernelId} -p <dir>\`; ADR-0019 still forbids an automatic engine fallback.`
        : freshPhase === "running"
          ? `Do NOT re-push blindly: the target is RUNNING — collect it with ` +
            `\`kaggle kernels output ${kernelId} -p <dir>\` when it finishes; the kernel's own wall-clock budget terminates a stuck run.`
          : isTerminalPhase(freshPhase)
            ? `The target is ${String(freshPhase).toUpperCase()} — inspect its log/output before deciding; ` +
              `ADR-0019 still forbids an automatic engine fallback.`
            : `NOT auto-falling back (ADR-0019 quality red line) — decide manually: ` +
              `wait and re-run, or set TTS_ENGINE explicitly.`
      : `Do NOT re-push blindly: a RUNNING kernel that is still logging is making progress; ` +
        `collect it with \`kaggle kernels output ${kernelId} -p <dir>\` when it finishes. ` +
        `The kernel's own wall-clock budget terminates a genuinely stuck run.`;

  return [
    head,
    targetLine,
    attemptLine,
    ...reasonLines,
    attribution?.limits ? `Limits: ${attribution.limits}` : null,
    tail,
  ]
    .filter(Boolean)
    .join("\n");
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
 * Every probe is time-boxed (`probeTimeoutMs`) because the Kaggle CLI has no
 * HTTP timeout of its own — see the constant comment above (#808). A probe
 * that fails does NOT downgrade the phase: the last known phase is kept so
 * RUNNING metering and the run budget keep accruing, and a failed probe can
 * never be mistaken for kernel truth (only the first probe may report
 * UNKNOWN). Dead probes are metered against `probeFailureBudgetMs`; past it
 * the run fails closed with an explicit "collect it by hand, a re-run bills
 * another GPU session" instruction.
 *
 * @param {string} kernelId - e.g. "username/cosyvoice3-cuda-batch"
 * @param {object} [opts]
 * @param {number} [opts.runTimeoutMs] - budget for RUNNING state
 * @param {number} [opts.queueTimeoutMs] - budget for QUEUED/UNKNOWN wait
 * @param {number} [opts.pollIntervalMs]
 * @param {number} [opts.probeTimeoutMs] - per-probe exec timeout (#808)
 * @param {number} [opts.probeFailureBudgetMs] - dead-probe budget (#808)
 * @param {string|null} [opts.statusFile] - poll-status.json path (visibility)
 * @param {string|null} [opts.attributionFile] - timeout evidence bundle path (#1354)
 * @param {object|null} [opts.attempt] - kernel version / queue start (#1354)
 * @param {number} [opts.stuckWindowMs] - no-log-progress window (#1354)
 * @param {number} [opts.recentWindowMs] - own-kernel lookback (#1354)
 * @param {number} [opts.logProbeTimeoutMs] - per-log-fetch bound (#1354)
 * @param {object} [deps] - injected exec/execFile/sleep/now/log for tests
 * @returns {Promise<{queuedMs: number, runningMs: number}>}
 * @throws {Error} on kernel failure, queue timeout, or run timeout
 */
export async function pollKernelStatus(kernelId, opts = {}, deps = {}) {
  const {
    runTimeoutMs = KAGGLE_TIMEOUT_MS,
    queueTimeoutMs = KAGGLE_QUEUE_TIMEOUT_MS,
    pollIntervalMs = KAGGLE_POLL_INTERVAL_MS,
    probeTimeoutMs = KAGGLE_PROBE_TIMEOUT_MS,
    probeFailureBudgetMs = KAGGLE_PROBE_FAILURE_BUDGET_MS,
    statusFile = null,
    // #1354: when set, every timeout first writes an evidence bundle here and
    // phrases the error from its conclusion instead of the old fabricated
    // "another kernel holds the slot" line.
    attributionFile = null,
    attempt = null,
    stuckWindowMs = KAGGLE_STUCK_WINDOW_MS,
    recentWindowMs = KAGGLE_RECENT_KERNEL_WINDOW_MS,
    logProbeTimeoutMs = KAGGLE_LOG_PROBE_TIMEOUT_MS,
  } = opts;
  const exec = deps.exec ?? defaultExec;
  const execFile = deps.execFile ?? defaultExecFile;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((msg) => console.log(msg));

  let phase = null; // null until the first status lands (so the first poll logs a transition)
  let waitStart = null; // fake-clock time the current QUEUED/UNKNOWN stretch began
  let runStart = null; // fake-clock time the current RUNNING stretch began
  let waitMs = 0;
  let runMs = 0;
  let probeFailures = 0; // consecutive dead probes (reset by any usable answer)
  let probeFailureMs = 0; // total wall-clock burned on dead probes this run
  let lastProbeError = null;

  const snapshot = () => ({
    queuedMs: waitMs + (waitStart !== null ? now() - waitStart : 0),
    runningMs: runMs + (runStart !== null ? now() - runStart : 0),
  });

  /**
   * Build the timeout error for `timeoutKind`.
   *
   * With no `attributionFile` the historical message is preserved exactly:
   * direct callers and the existing tests see the same text. The engine always
   * sets it, so production gets the evidence-backed form (#1354).
   */
  const timeoutError = async (timeoutKind, statusLine, waitedMs, ranMs) => {
    const target = { phase, statusLine, ...snapshot() };
    if (!attributionFile) {
      if (timeoutKind === "queue") {
        return new Error(
          `Kaggle kernel waiting for ${fmtDuration(waitedMs)} — exceeded queue timeout ` +
            `(${Math.round(queueTimeoutMs / 60000)}min). Another kernel holds Kaggle's single ` +
            `free-tier GPU session (${kernelId} still ${String(phase).toUpperCase()}). ` +
            `NOT auto-falling back (ADR-0019 quality red line) — decide manually: ` +
            `wait and re-run, or set TTS_ENGINE explicitly.`,
        );
      }
      return new Error(
        `Kaggle kernel timed out after ${fmtDuration(ranMs)} of RUNNING ` +
          `(run timeout ${Math.round(runTimeoutMs / 60000)}min)`,
      );
    }

    let attribution;
    try {
      attribution = await collectQueueAttribution({
        kernelId,
        timeoutKind,
        target,
        attempt,
        probeFailures,
        probeFailureMs,
        lastProbeError,
        execFile,
        now,
        probeTimeoutMs,
        logProbeTimeoutMs,
        stuckWindowMs,
        recentWindowMs,
      });
    } catch (e) {
      // Evidence collection must never hide the timeout itself.
      attribution = {
        schemaVersion: 1,
        kernelId,
        timeoutKind,
        observedAt: new Date(now()).toISOString(),
        attempt,
        target,
        ownKernels: [],
        conclusion: {
          cause: "unknown",
          confidence: "unknown",
          reasons: [`evidence collection failed: ${firstLine(e.message)}`],
        },
        limits:
          "Evidence collection failed before Kaggle status/logs could be read; nothing was inferred.",
      };
    }
    writeJsonFile(attributionFile, attribution);
    if (statusFile) {
      writeJsonFile(statusFile, {
        kernelId,
        phase,
        status: statusLine,
        ...snapshot(),
        probeFailures,
        probeFailureMs,
        lastProbeError,
        timedOut: timeoutKind,
        attribution: {
          cause: attribution.conclusion?.cause ?? "unknown",
          confidence: attribution.conclusion?.confidence ?? "unknown",
          evidenceFile: attributionFile,
        },
        updatedAt: new Date(now()).toISOString(),
      });
    }
    return new Error(
      formatKernelTimeoutError({
        timeoutKind,
        kernelId,
        queuedMs: timeoutKind === "queue" ? waitedMs : 0,
        ranMs: timeoutKind === "run" ? ranMs : 0,
        queueTimeoutMs,
        runTimeoutMs,
        attribution,
        attributionFile,
      }),
    );
  };

  while (true) {
    let raw = "";
    let execOk = false;
    let probeError = null;
    const probeStart = now();
    try {
      const { stdout } = await exec(`kaggle kernels status ${kernelId} 2>&1`, {
        timeout: probeTimeoutMs,
        killSignal: "SIGKILL",
      });
      raw = stdout.trim();
      execOk = true;
      probeFailures = 0;
    } catch (e) {
      raw = (e.stdout || e.message || "unknown").trim();
      probeError = e;
      probeFailures += 1;
      probeFailureMs += Math.max(0, now() - probeStart);
      lastProbeError = raw.split("\n")[0];
    }
    const statusLine = raw.split("\n")[0];
    // Non-zero CLI exit (network hiccup, 404 while QUEUED) is not kernel truth
    // (#250 review note) — keep polling. A failed probe also must not reset the
    // RUNNING clock (#808): the kernel is still burning GPU whatever the CLI
    // says, so staying in the last known phase is both honest and what makes
    // the run budget able to fire. Only the first probe can introduce UNKNOWN.
    const next = execOk ? classifyKernelStatus(raw) : (phase ?? "unknown");

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
      log(`  [Kaggle] Kernel Status → ${next.toUpperCase()} (${statusLine || kernelId})`);
      phase = next;
    }

    // Silence used to be the whole symptom of #808, so a dead probe is never
    // quiet: name the failure, the phase it did not change, and the budget it
    // is eating.
    if (probeError) {
      log(
        `  ⚠️ [Kaggle] status probe failed (${probeFailures} in a row, ` +
          `${fmtDuration(probeFailureMs)}/${fmtDuration(probeFailureBudgetMs)} dead-probe budget) ` +
          `— staying ${String(phase).toUpperCase()}: ${statusLine}`,
      );
    }

    if (statusFile) {
      writeJsonFile(statusFile, {
        kernelId,
        phase,
        status: statusLine,
        ...snapshot(),
        probeFailures,
        probeFailureMs,
        lastProbeError,
        updatedAt: new Date(now()).toISOString(),
      });
    }

    if (phase === "complete") {
      log("  ✓ Kaggle kernel complete");
      return snapshot();
    }
    if (phase === "error" || phase === "cancel") {
      throw new Error(`Kaggle kernel failed: ${statusLine}`);
    }

    if (waitStart !== null) {
      const waited = now() - waitStart;
      if (waited > queueTimeoutMs) {
        throw await timeoutError("queue", statusLine, waited, 0);
      }
      if (phase === "queued") {
        log(
          `  ⏳ [Kaggle] Kernel Status: QUEUED (waiting in line ${fmtDuration(waited)}, ` +
            `queue budget ${Math.round(queueTimeoutMs / 60000)}min)`,
        );
      } else {
        log(`  ⏳ [Kaggle] Kernel Status: ${phase.toUpperCase()} (${statusLine})`);
      }
    }
    if (runStart !== null) {
      const ran = now() - runStart;
      if (ran > runTimeoutMs) {
        throw await timeoutError("run", statusLine, 0, ran);
      }
      log(`  ⏳ [Kaggle] Kernel Status: RUNNING (${fmtDuration(ran)} elapsed)`);
    }
    if (probeFailureMs > probeFailureBudgetMs) {
      throw new Error(
        `Kaggle status probe burned ${fmtDuration(probeFailureMs)} without a usable answer ` +
          `(${probeFailures} consecutive failures, ${Math.round(probeTimeoutMs / 1000)}s per probe). ` +
          `Last known phase: ${String(phase).toUpperCase()} — the kernel itself may well have ` +
          `finished, but this run cannot tell. It was NOT collected, and blindly re-running ` +
          `would bill another GPU session: check \`kaggle kernels status ${kernelId}\`, and if ` +
          `it is COMPLETE collect the takes with \`kaggle kernels output ${kernelId} -p <dir>\`. ` +
          `Last probe error: ${lastProbeError}`,
      );
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
 * @param {(file: string, args: string[], opts: object) => Promise<{stdout: string}>} [deps.execFile] - argv runner for the slot probes (#1354)
 * @param {typeof pollKernelStatus} [deps.poll] - kernel status poller
 * @param {typeof preflightKernelSlot} [deps.preflight] - pre-push slot precheck (#1354)
 * @param {typeof postProcessBatch} [deps.postProcess] - per-scene audio post-process
 * @param {(ms: number) => Promise<void>} [deps.sleep] - download-recovery backoff (#581)
 * @returns {Promise<TTSEngine|null>} null if not available.
 */
export async function createCosyVoice3KaggleCudaEngine(deps = {}) {
  if (!(await isAvailable(deps))) return null;

  const username = getKaggleUsername();
  const runCmd = deps.exec ?? defaultExec;
  const poll = deps.poll ?? pollKernelStatus;
  const preflight = deps.preflight ?? preflightKernelSlot;
  const postProcess = deps.postProcess ?? postProcessBatch;
  // One value for both the engine descriptor (which feeds the cache key) and
  // the per-scene call, so the key can never describe a floor the trim did not
  // use. `TTS_SILENCE_FLOOR_MS` is the documented 250→300 downgrade lever.
  const silenceFloorMs = resolveSilenceFloorMs();

  return {
    name: "cosyvoice3-kaggle-cuda",
    info: `CosyVoice3-Kaggle-CUDA (P100, cloned from ${CV3_REF_AUDIO})`,
    // #786: internal pauses are capped at the floor before the take is
    // measured. The capability existed in post-process.mjs all along but was
    // switched off here — three real packs measured 154-161 WPM with
    // 10.5-13.7% of airtime spent in pauses. `silenceFloorMs` also enters the
    // cache key, so takes approved under the old (untrimmed) policy demote to
    // pending and are regenerated once instead of being replayed.
    useSilenceFilter: true,
    silenceFloorMs,
    resample: true,
    // #244: exposed so the cache key folds the per-scene instruct in — an
    // INSTRUCT_STANDARD edit (#270) must invalidate affected cached takes,
    // not replay them. Also the seam the Quality Gate re-validates through.
    instructForScene: resolveInstructForScene,

    async generate(scenes, outputDir, hooks = {}) {
      // Kernel slug resolved per call (#267): env override > content-id
      // derivation (output/<pipelineId>/audio) > fail-fast. Never a shared
      // default — same slug overwrite, not queue (#250).
      const kernelSlug = resolveKernelSlug({
        envSlug: process.env.COSYVOICE3_KAGGLE_SLUG || null,
        contentId: deriveContentIdFromOutputDir(outputDir),
      });
      const kernelId = `${username}/${kernelSlug}`;
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
      // Per-call identity (#420): the kernel echoes it into summary.json and
      // the download below is only accepted when that echo matches.
      const requestId = buildRunRequestId(manifestJson);
      const wallClockSec = positiveIntEnv(
        "KERNEL_WALL_CLOCK_BUDGET_SEC",
        DEFAULT_KERNEL_WALL_CLOCK_BUDGET_SEC,
      );
      const heartbeatSec = positiveIntEnv("KERNEL_HEARTBEAT_SEC", DEFAULT_KERNEL_HEARTBEAT_SEC);

      const kernelScript = template
        .replaceAll("__MANIFEST_JSON__", manifestJson)
        .replaceAll("__REQUEST_ID__", requestId)
        .replaceAll("__KERNEL_WALL_CLOCK_BUDGET_SEC__", String(wallClockSec))
        .replaceAll("__KERNEL_HEARTBEAT_SEC__", String(heartbeatSec))
        // #521: the expected wheelhouse, so the kernel can refuse a mount that
        // is not what this repo froze. Injected even when the run resolves to
        // the online path — the placeholder has to be gone either way, and the
        // check is what turns a silent dependency swap into a loud failure.
        .replaceAll(
          "__EXPECTED_WHEELHOUSE__",
          readFileSync(KAGGLE_WHEELHOUSE_MANIFEST, "utf-8").trim(),
        );

      const tempDir = join(outputDir, ".kaggle-kernel");
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(join(tempDir, "cosyvoice3_cuda_kernel.py"), kernelScript);
      writeFileSync(
        join(tempDir, "kernel-metadata.json"),
        JSON.stringify(
          {
            id: kernelId,
            title: kernelSlug,
            code_file: "cosyvoice3_cuda_kernel.py",
            language: "python",
            kernel_type: "script",
            is_private: true,
            enable_gpu: true,
            enable_internet: true,
            // cosyvoice3-wheels (#231): the frozen dependency wheelhouse. The
            // kernel installs from it with --no-index when mounted, so the
            // dependency set cannot drift under us and the install stops
            // hitting PyPI. Measured saving on the 2026-10-09 py3.13 image:
            // 633s online → 512s offline for a 2-scene batch (the install is
            // ~2min; the rest is clone + model load + inference).
            // cosyvoice3-wetext (#804): the WeTextProcessing snapshot the
            // text frontend pulls from modelscope on first use. The acoustic
            // model mount below does NOT contain it, so a cold container
            // re-downloaded ~41MB and billed it to the inference budget —
            // measured 1265.2s of 1800s on 2026-10-20, which left a 10-scene
            // job 154s of headroom and killed it. pre-seeding removes the
            // download rather than widening the timeout.
            dataset_sources: [
              "xPabloLI/tts-ref-audio",
              "xPabloLI/cosyvoice3-model",
              "xPabloLI/cosyvoice3-wheels",
              "xPabloLI/cosyvoice3-wetext",
            ],
            competition_sources: [],
            kernel_sources: [],
          },
          null,
          2,
        ),
      );

      // ── Push precheck (#1354) ──
      // Never re-push a slug whose previous version is still RUNNING/QUEUED:
      // each push adds a version to the same queue and makes the wait longer.
      // Another own kernel only earns a warning; queuing behind it is the
      // documented 40min queue behaviour.
      const preflightResult = await preflight(
        kernelId,
        {},
        {
          execFile: deps.execFile,
          sleep: deps.sleep,
          now: deps.now,
          log: console.log,
        },
      );

      // ── Push kernel (single push for the whole manifest, #241) ──
      console.log(`  📤 Pushing Kaggle kernel (${manifest.length} segments, 1 push)...`);
      const pushResult = await runCmd(`kaggle kernels push -p "${tempDir}" 2>&1`);
      const pushedVersion = parseKernelPushVersion(pushResult?.stdout ?? "");
      const pushedAt = new Date().toISOString();
      const attempt = {
        version: pushedVersion,
        pushedAt,
        requestId,
      };
      // Run evidence is the durable answer to "what was pushed, when did it
      // start queueing, and what did the slot precheck see?" for the next
      // attribution; it sits beside poll-status.json under .kaggle-kernel/.
      writeJsonFile(containedPath(tempDir, "kaggle-run-evidence.json"), {
        schemaVersion: 1,
        kernelId,
        ...attempt,
        preflight: {
          waitedMs: preflightResult.waitedMs,
          listOk: preflightResult.listOk,
          listError: preflightResult.listError,
          target: preflightResult.target,
          holders: preflightResult.holders,
        },
      });
      console.log(
        `  ✓ Kaggle kernel version ${pushedVersion ?? "unknown"} pushed (queue started ${pushedAt})`,
      );

      // ── Poll status ──
      console.log(
        `  ⏳ Waiting for Kaggle kernel (queue budget ${Math.round(KAGGLE_QUEUE_TIMEOUT_MS / 60000)}min, ` +
          `run timeout ${Math.round(KAGGLE_TIMEOUT_MS / 60000)}min)...`,
      );
      // poll-status.json: QUEUED/RUNNING phase + metering for background runs
      // (#250). attributionFile (#1354) makes a timeout collect status/log
      // evidence and phrase the error from the observed cause, not a guess.
      await poll(kernelId, {
        statusFile: containedPath(tempDir, "poll-status.json"),
        attributionFile: containedPath(tempDir, "kaggle-queue-attribution.json"),
        attempt,
      });

      // ── Download output into per-call staging (#420) ──
      // The download target MUST be unique per call: `kaggle kernels output`
      // skips files when a more recent local copy exists. That skip is not an
      // error — in the installed CLI (2.2.4) kernels_output gates the fetch on
      // `download_needed()` (kaggle/api/kaggle_api_extended.py:8232, gated at
      // :6715), which returns False when the local size/date look current; the
      // command then still exits 0, so the pipeline reads the old file while
      // the download "succeeded". The legacy `.kaggle-kernel/kaggle-output`
      // dir is deliberately not reused, overwritten or cleaned as routine
      // self-heal — acceptance is proven by the identity checks below, not by
      // directory cleanliness.
      const downloadDir = join(tempDir, "downloads", requestId);
      mkdirSync(downloadDir, { recursive: true });
      console.log("  📥 Downloading Kaggle kernel output...");
      // #581: one transient error mid-transfer must not void a paid GPU run —
      // the takes that already landed are recovered per file, bounded. This
      // only guarantees the staged files are present and intact; identity,
      // coverage and integrity are still judged by the gates below, so a
      // partial recovery can never be promoted as a complete batch.
      await downloadKernelOutput({
        kernelId,
        downloadDir,
        expectedScenes: scenes.map((s) => s.id),
        runCmd,
        sleep: deps.sleep,
      });

      // ── Verify run identity, coverage and per-scene file integrity ──
      // Every check runs BEFORE any file reaches the audio directory: a stale,
      // foreign or partial download must never mix into the approved takes.
      const summaryPath = stagedSummaryPath(downloadDir);
      if (!existsSync(summaryPath)) {
        throw new Error("Kaggle kernel did not produce summary.json");
      }
      let summary;
      try {
        summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
      } catch (e) {
        throw new Error(`Kaggle summary.json is not valid JSON: ${e.message}`);
      }
      verifyKaggleRunSummary(summary, { requestId, scenes });
      const failed = summary.segments.filter((s) => s.error);
      if (failed.length > 0) {
        console.error(
          `  ⚠️ ${failed.length} segments failed: ${failed.map((f) => `scene-${f.sceneId}`).join(", ")}`,
        );
      }
      const promotable = summary.segments.filter((s) => !s.error);
      for (const s of promotable) {
        assertCompleteKernelWav(join(downloadDir, KAGGLE_OUTPUT_SUBDIR, s.output), s.sceneId);
      }

      // ── Post-process ──
      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const finalResults = [];
      // #1514: the local post-process segment is reported back to the registry
      // so the `step-1-tts` split can name it (`tts-loudness`) instead of
      // folding it into "engine returned". Inert when no hook is passed.
      const postStartMs = performance.now();
      try {
        for (const s of promotable) {
          // containedPath (#758): kernel output names are external data; the
          // taint rule cannot see that a bare join stays inside its root.
          const srcPath = containedPath(downloadDir, KAGGLE_OUTPUT_SUBDIR, s.output);
          const destPath = containedPath(outputDir, s.output);
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
          const { duration } = await postProcess(destPath, {
            useSilenceFilter: true,
            silenceFloorMs,
            resample: true,
            prosody,
          });
          finalResults.push({ sceneId: s.sceneId, audioPath: destPath, duration });
          console.log(`  Scene ${s.sceneId}: ${duration.toFixed(2)}s`);
        }
      } finally {
        hooks?.onSpan?.("tts-loudness", performance.now() - postStartMs);
      }

      if (finalResults.length === 0) {
        throw new Error("No successful TTS results from Kaggle kernel");
      }

      // Staging is per-call scratch: drop it after successful promotion so
      // downloads/ does not grow without bound (failures keep it as evidence).
      // Cleanup can never affect correctness — acceptance depends on the
      // requestId bound into summary.json, not on directory state.
      try {
        rmSync(downloadDir, { recursive: true, force: true });
      } catch {
        // fail-open: leftover staging is harmless
      }

      return finalResults;
    },
  };
}
