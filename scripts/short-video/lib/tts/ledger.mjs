/**
 * #1566 — TTS lane ledger (`#1528` R3): record which provider / session / batch
 * produced a take, how long each segment took, and what is known about quota.
 *
 * Two levels, both append-only JSONL:
 *
 *  - per run   → `output/<pipelineId>/tts-ledger.jsonl` (identity, phases,
 *                kernel meter, per-scene synth seconds), written by the caller
 *                that owns the run (`tts-only-run` / `main`);
 *  - per session → `output/tts-sessions.jsonl` (one line per session start,
 *                pack and end) for `tts-batch`, where N packs share one warm
 *                kernel and a per-pack file alone cannot show the reuse.
 *
 * `run.json.meta.ttsSessionId` carries the pointer from the run to the session,
 * so `render-only` / `tts-verify` never need to read this file — the ledger is
 * a side channel, not a new gate.
 *
 * Facts only: anything the host cannot observe (Kaggle weekly quota, Modal
 * monthly spend, a kernel's own model-load split) is written as `unknown`
 * instead of being inferred. Writes are fail-open: a broken ledger must never
 * break TTS.
 *
 * @module tts/ledger
 */

import { randomBytes } from "crypto";
import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";

/** Run-level ledger filename, under `output/<pipelineId>/`. */
export const LEDGER_FILENAME = "tts-ledger.jsonl";
/** Session-level ledger filename, under `output/`. */
export const SESSIONS_FILENAME = "tts-sessions.jsonl";
/** Schema version of every line. */
export const LEDGER_VERSION = 1;
/** The one honest value for facts the host cannot observe. */
export const UNKNOWN = "unknown";

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * A session id that sorts by time and names the provider.
 *
 * @param {object} [options]
 * @param {string} [options.provider]
 * @param {number|Date} [options.now]
 * @param {(n: number) => Buffer} [options.rand] - injectable for tests
 * @returns {string}
 */
export function createSessionId({ provider = "tts", now = Date.now(), rand = randomBytes } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  // UTC, like run ids and ledger timestamps — a session must not shift when a
  // batch crosses local midnight.
  const stamp =
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}`;
  return `${provider}-${stamp}-${rand(3).toString("hex")}`;
}

const round1 = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : UNKNOWN);

/**
 * Open an append-only ledger.
 *
 * @param {object} options
 * @param {string} options.dir - directory that holds the file (created if absent)
 * @param {string} [options.file=LEDGER_FILENAME]
 * @param {() => Date} [options.now]
 * @param {(error: Error) => void} [options.onError] - called once on the first
 *   write failure; every later failure stays silent
 * @returns {object} handle
 */
export function openTtsLedger({
  dir,
  file = LEDGER_FILENAME,
  now = () => new Date(),
  onError,
} = {}) {
  if (typeof dir !== "string" || dir.length === 0) {
    throw new Error("openTtsLedger: dir is required");
  }
  const path = join(dir, file);
  let failed = false;

  const record = (event, fields = {}) => {
    if (failed) return false;
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(
        path,
        `${JSON.stringify({ v: LEDGER_VERSION, ts: now().toISOString(), event, ...fields })}\n`,
        "utf8",
      );
      return true;
    } catch (error) {
      failed = true;
      onError?.(error);
      return false;
    }
  };

  return {
    path,
    record,
    runStart: (fields) => record("run.start", fields),
    runEnd: (fields) =>
      record("run.end", {
        status: "ok",
        ...fields,
        phases: roundPhases(fields.phases),
        seconds: round1(fields.seconds),
      }),
    runFail: (fields) =>
      record("run.fail", { status: "failed", ...fields, seconds: round1(fields.seconds) }),
    sessionStart: (fields) => record("session.start", fields),
    sessionPack: (fields) =>
      record("session.pack", {
        ...fields,
        seconds: round1(fields.seconds),
      }),
    sessionEnd: (fields) =>
      record("session.end", {
        status: fields.ok === false ? "failed" : "ok",
        ...fields,
        seconds: round1(fields.seconds),
      }),
  };
}

/** Round every phase duration once so two writers cannot disagree on precision. */
function roundPhases(phases) {
  if (!phases || typeof phases !== "object") return UNKNOWN;
  const out = {};
  for (const [name, value] of Object.entries(phases)) out[name] = round1(value);
  return out;
}

/**
 * Read a ledger file. A missing file is an empty ledger, not an error; a
 * corrupt line is counted and skipped (the file is append-only and may be
 * truncated by an unrelated crash).
 *
 * @param {string} path
 * @returns {{records: object[], skipped: number, missing: boolean}}
 */
export function readTtsLedger(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { records: [], skipped: 0, missing: true };
    throw error;
  }
  const records = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && typeof parsed.event === "string")
        records.push(parsed);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { records, skipped, missing: false };
}

/**
 * Narrow a record set to the requested facets.
 *
 * @param {object[]} records
 * @param {object} [filters]
 * @param {string} [filters.runId]
 * @param {string} [filters.sessionId]
 * @param {string} [filters.provider]
 * @param {string} [filters.since] - ISO date (inclusive)
 * @param {string} [filters.until] - ISO date (inclusive, whole day)
 * @returns {object[]}
 */
export function filterTtsLedger(records, { runId, sessionId, provider, since, until } = {}) {
  const sinceMs = since ? Date.parse(`${since}T00:00:00.000Z`) : null;
  const untilMs = until ? Date.parse(`${until}T23:59:59.999Z`) : null;
  return records.filter((record) => {
    if (runId && record.runId !== runId) return false;
    if (sessionId && record.sessionId !== sessionId) return false;
    if (provider && record.provider !== provider) return false;
    const at = Date.parse(record.ts ?? "");
    if (Number.isFinite(sinceMs) && Number.isFinite(at) && at < sinceMs) return false;
    if (Number.isFinite(untilMs) && Number.isFinite(at) && at > untilMs) return false;
    return true;
  });
}

const sumNumeric = (values) =>
  values.reduce((total, value) => (Number.isFinite(value) ? total + value : total), 0);

/**
 * Roll records up into sessions, runs and per-provider totals.
 *
 * @param {object[]} records
 * @returns {{sessions: object[], runs: object[], providers: object[]}}
 */
export function summarizeTtsLedger(records) {
  const sessions = new Map();
  const runs = new Map();

  const sessionOf = (id) => {
    if (!sessions.has(id)) {
      sessions.set(id, {
        sessionId: id,
        provider: UNKNOWN,
        startedAt: null,
        endedAt: null,
        status: UNKNOWN,
        packs: 0,
        seconds: 0,
        runIds: new Set(),
      });
    }
    return sessions.get(id);
  };
  const runOf = (id) => {
    if (!runs.has(id)) {
      runs.set(id, {
        runId: id,
        sessionId: UNKNOWN,
        provider: UNKNOWN,
        status: UNKNOWN,
        seconds: UNKNOWN,
        batchIndex: UNKNOWN,
        sessionReused: UNKNOWN,
        pipelineId: UNKNOWN,
        contentDir: UNKNOWN,
        scenes: UNKNOWN,
        cacheHits: UNKNOWN,
        pending: UNKNOWN,
        phases: UNKNOWN,
        kernel: UNKNOWN,
        quota: UNKNOWN,
        sceneGen: [],
        failedError: null,
      });
    }
    return runs.get(id);
  };

  for (const record of records) {
    const runId = typeof record.runId === "string" ? record.runId : null;
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : null;

    if (sessionId && record.event.startsWith("session.")) {
      const session = sessionOf(sessionId);
      session.provider = record.provider ?? session.provider;
      if (record.event === "session.start") session.startedAt = record.ts;
      if (record.event === "session.end") {
        session.endedAt = record.ts;
        session.status = record.status ?? session.status;
        session.seconds = Number.isFinite(record.seconds) ? record.seconds : session.seconds;
        session.packs = Number.isFinite(record.packs) ? record.packs : session.packs;
      }
      if (record.event === "session.pack") {
        session.packs += 1;
        session.seconds += Number.isFinite(record.seconds) ? record.seconds : 0;
      }
      if (runId) session.runIds.add(runId);
      if (!session.startedAt) session.startedAt = record.ts;
    }

    if (runId) {
      const run = runOf(runId);
      if (sessionId) run.sessionId = sessionId;
      run.provider = record.provider ?? run.provider;
      run.pipelineId = record.pipelineId ?? run.pipelineId;
      run.contentDir = record.contentDir ?? run.contentDir;
      if (record.event === "run.start") {
        run.status = "running";
        run.batchIndex = record.batchIndex ?? run.batchIndex;
        run.sessionReused = record.sessionReused ?? run.sessionReused;
        run.scenes = record.scenes ?? run.scenes;
        run.cacheHits = record.cacheHits ?? run.cacheHits;
        run.pending = record.pending ?? run.pending;
        run.quota = record.quota ?? run.quota;
      }
      if (record.event === "run.end") {
        run.status = record.status ?? "ok";
        run.seconds = record.seconds ?? run.seconds;
        run.phases = record.phases ?? run.phases;
        run.kernel = record.kernel ?? run.kernel;
        run.quota = record.quota ?? run.quota;
        run.sceneGen = Array.isArray(record.sceneGen) ? record.sceneGen : run.sceneGen;
        // Provider telemetry is the authoritative batch/reuse fact; the top
        // level mirrors it but may be null on a driver that did not know it.
        run.batchIndex = record.kernel?.batchIndex ?? record.batchIndex ?? run.batchIndex;
        run.sessionReused =
          record.kernel?.sessionReused ?? record.sessionReused ?? run.sessionReused;
      }
      if (record.event === "run.fail") {
        run.status = "failed";
        run.seconds = record.seconds ?? run.seconds;
        run.failedError = record.error ?? null;
      }
    }
  }

  const sessionRows = [...sessions.values()].map((session) => ({
    ...session,
    runIds: [...session.runIds],
  }));

  const runRows = [...runs.values()];

  const providers = new Map();
  for (const run of runRows) {
    const key = run.provider ?? UNKNOWN;
    if (!providers.has(key)) {
      providers.set(key, {
        provider: key,
        runs: 0,
        ok: 0,
        failed: 0,
        seconds: 0,
        synthSec: 0,
        queuedSec: 0,
        runningSec: 0,
        unknownSynthRuns: 0,
        unknownQueueRuns: 0,
      });
    }
    const row = providers.get(key);
    row.runs += 1;
    if (run.status === "failed") row.failed += 1;
    else if (run.status === "ok") row.ok += 1;
    row.seconds += Number.isFinite(run.seconds) ? run.seconds : 0;

    const synth = run.kernel?.synthSec;
    if (Number.isFinite(synth)) row.synthSec += synth;
    else row.unknownSynthRuns += 1;
    const queued = run.kernel?.queuedSec;
    if (Number.isFinite(queued)) row.queuedSec += queued;
    else row.unknownQueueRuns += 1;
    const running = run.kernel?.runningSec;
    if (Number.isFinite(running)) row.runningSec += running;
  }

  return { sessions: sessionRows, runs: runRows, providers: [...providers.values()] };
}
