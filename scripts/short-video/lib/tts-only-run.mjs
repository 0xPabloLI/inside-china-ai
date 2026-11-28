#!/usr/bin/env node
/**
 * TTS-only orchestration (#1528 R1).
 *
 * One call = optional run creation + currency normalization + TTS/alignment +
 * run materialization. `tts-only.mjs` stays a thin CLI over this; tests drive
 * it with an injected `generate` so no engine, GPU or network is involved.
 *
 * Why the run is created up front: a prewarmed cache is not a run. `render-only`
 * reads `runs/<runId>/audio` (takes, sidecars, subtitle-timing pair) and
 * `currency-rates.json`; without a run it either falls back to the legacy
 * package or refuses. Creating the run before TTS also means a TTS failure is
 * recorded as a failed run instead of vanishing.
 */
import { mkdirSync } from "fs";
import { join } from "path";

import { readFreshRateReport, writeRateReport } from "./exchange-rates.mjs";
import { normalizeSceneDataWithLiveRates } from "./normalize-currency.mjs";
import { createRun, markRun, RUN_STATUS } from "./run-history.mjs";
import { createSessionId, openTtsLedger, readTtsLedger } from "./tts/ledger.mjs";
import { materializeRunAudio } from "./tts-run-materialize.mjs";

/**
 * Resolve the run (when asked for) and the rate report the audio must be
 * generated with. Rates are reused from this pack's previous cache report so
 * the cache key stays byte-identical for the later full run; only a pack that
 * has never been prewarmed pays the network lookup.
 *
 * @param {object} options
 * @param {string} options.root - `scripts/short-video`
 * @param {string} options.pipelineId
 * @param {string} options.contentDir
 * @returns {{run: {runId: string, dir: string}|null, cacheRatesFile: string}}
 */
function resolveTtsRun({ root, pipelineId, contentDir, withRun = false, runId = null, now }) {
  const cacheRatesFile = join(root, "output", pipelineId, "currency-rates.json");
  const run = withRun ? createRun({ root, slug: pipelineId, contentDir, runId, now }) : null;
  return { run, cacheRatesFile };
}

/**
 * Normalize scenes exactly like `main.mjs` Step 0.5/0.6. A fresh report is
 * reused so the prewarmed cache stays byte-identical for the later full run;
 * with no usable report we fetch once and seed the cache, so the full run
 * reuses the same numbers instead of re-annotating text and missing the cache.
 */
async function normalizeForTts({
  scenes,
  meta,
  cacheRatesFile,
  ratesFile = null,
  now = Date.now(),
  fetchImpl,
}) {
  const cached = readFreshRateReport(cacheRatesFile, { now });
  const report = await normalizeSceneDataWithLiveRates(
    scenes,
    meta,
    cached
      ? { rates: cached.rates, rateSource: `run-artifact:${cached.source}`, ratesFile }
      : { ratesFile, fetchImpl, now: () => new Date(now) },
  );
  if (!cached) writeRateReport(cacheRatesFile, report);
  const { normalizeTtsText } = await import("./normalize-tts-text.mjs");
  normalizeTtsText(scenes, meta);
}

/**
 * @param {object} options
 * @param {string} options.root
 * @param {string} options.pipelineId
 * @param {string} options.contentDir
 * @param {Array} options.scenes
 * @param {object} options.meta
 * @param {boolean} [options.withRun=false] - create and materialize a run
 * @param {string} [options.runId=null]
 * @param {string} [options.sessionId=null] - TTS session id; a batch driver
 *   passes the one it created so N packs point at the same session (#1566)
 * @param {number|null} [options.batchIndex=null]
 * @param {boolean|null} [options.sessionReused=null]
 * @param {object|null} [options.ledger=null] - an ``openTtsLedger`` handle;
 *   when absent the run-level ledger is opened here (#1566)
 * @param {Function} options.generate - `generateTTS` (injectable)
 * @param {number|Date} [options.now]
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{runId: string|null, runDir: string|null, results: Array, materialized: object|null}>}
 */
export async function runTtsOnly({
  root,
  pipelineId,
  contentDir,
  scenes,
  meta,
  withRun = false,
  runId = null,
  sessionId = null,
  batchIndex = null,
  sessionReused = null,
  ledger = null,
  generate,
  now = new Date(),
  fetchImpl,
  log = () => {},
  onRunCreated = () => {},
}) {
  const startedMs = Date.now();
  const cacheDir = join(root, "output", pipelineId, "audio");
  mkdirSync(cacheDir, { recursive: true });

  // #1566: the ledger lives beside the pack's runs, not inside one, so the
  // next run can still read what the previous session cost. A write failure
  // is reported once and never aborts TTS.
  const runLedger =
    ledger ??
    openTtsLedger({
      dir: join(root, "output", pipelineId),
      onError: (error) => log(`  ⚠️  TTS ledger write failed: ${error.message}`),
    });
  const ttsSessionId = sessionId ?? createSessionId({ provider: "tts" });

  const { run, cacheRatesFile } = resolveTtsRun({
    root,
    pipelineId,
    contentDir,
    withRun,
    runId,
    now,
  });
  if (run) onRunCreated(run.runId);

  await normalizeForTts({
    scenes,
    meta,
    cacheRatesFile,
    ratesFile: run ? join(run.dir, "currency-rates.json") : null,
    now: now instanceof Date ? now.getTime() : now,
    fetchImpl,
  });

  let results;
  try {
    results = await generate(scenes, cacheDir, {
      qualityGateOptions: { keyEntities: meta.keyEntities },
      // #1566: identity travels with the generation so the registry can write
      // `run.start` / `run.end` without knowing which driver called it.
      ledger: runLedger,
      runId: run?.runId ?? null,
      sessionId: ttsSessionId,
      pipelineId,
      contentDir,
      batchIndex,
      sessionReused,
    });
  } catch (error) {
    runLedger.runFail({
      runId: run?.runId ?? null,
      sessionId: ttsSessionId,
      pipelineId,
      contentDir,
      error: String(error?.message ?? error).split("\n")[0],
      seconds: (Date.now() - startedMs) / 1000,
    });
    throw error;
  }

  if (!run) {
    return { runId: null, runDir: null, results, materialized: null };
  }

  const audioDir = join(run.dir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const materialized = materializeRunAudio({ results, cacheDir, audioDir, log });
  markRun({
    root,
    slug: pipelineId,
    runId: run.runId,
    status: RUN_STATUS.RUNNING,
    artifacts: { audioDir: "audio", timing: materialized.timing },
    meta: { stage: "tts-only", ttsSessionId },
  });
  return { runId: run.runId, runDir: run.dir, results, materialized };
}

/**
 * Record a failed run when the TTS step throws. Separate from `runTtsOnly` so
 * the CLI keeps main.mjs's exit-handler shape (`process.on("exit")`).
 */
export function markTtsRunFailed({
  root,
  pipelineId,
  runId,
  code,
  sessionId = null,
  log = () => {},
}) {
  try {
    markRun({
      root,
      slug: pipelineId,
      runId,
      status: RUN_STATUS.FAILED,
      meta: {
        stage: "tts-only",
        exitCode: code,
        ...(sessionId ? { ttsSessionId: sessionId } : {}),
      },
    });
  } catch (error) {
    log(`  ⚠️  could not record failed run ${runId}: ${error.message}`);
  }
  // #1566: a failed run is a fact the ledger must keep too — otherwise the
  // next "what did this pack cost?" query silently drops the aborted attempt.
  // `runTtsOnly` already records thrown failures; the exit hook only fills the
  // gap for `process.exit(1)` paths that never reached its catch.
  const ledgerFile = join(root, "output", pipelineId, "tts-ledger.jsonl");
  const alreadyRecorded = readTtsLedger(ledgerFile).records.some(
    (record) => record.event === "run.fail" && record.runId === runId,
  );
  if (alreadyRecorded) return;
  openTtsLedger({
    dir: join(root, "output", pipelineId),
    onError: (error) => log(`  ⚠️  TTS ledger write failed: ${error.message}`),
  }).runFail({
    runId,
    sessionId,
    pipelineId,
    error: `process exited with code ${code}`,
  });
}
