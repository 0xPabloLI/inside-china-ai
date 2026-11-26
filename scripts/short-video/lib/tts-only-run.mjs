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

import { DEFAULT_RATES, readRateReport } from "./exchange-rates.mjs";
import { normalizeSceneDataWithLiveRates } from "./normalize-currency.mjs";
import { createRun, markRun, RUN_STATUS } from "./run-history.mjs";
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
export function resolveTtsRun({ root, pipelineId, contentDir, withRun = false, runId = null, now }) {
  const cacheRatesFile = join(root, "output", pipelineId, "currency-rates.json");
  const run = withRun ? createRun({ root, slug: pipelineId, contentDir, runId, now }) : null;
  return { run, cacheRatesFile };
}

/**
 * Normalize scenes exactly like `main.mjs` Step 0.5/0.6, but write the rate
 * report beside the run artifacts when there is a run (what `render-only`
 * reads) instead of only into the cache.
 */
export async function normalizeForTts({
  scenes,
  meta,
  cacheRatesFile,
  ratesFile = null,
}) {
  const cached = readRateReport(cacheRatesFile);
  await normalizeSceneDataWithLiveRates(scenes, meta, {
    rates: cached?.rates ?? DEFAULT_RATES,
    rateSource: cached ? `run-artifact:${cached.source}` : "fallback",
    ratesFile,
  });
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
 * @param {string|null} [options.runId]
 * @param {Function} options.generate - `generateTTS` (injectable)
 * @param {Date} [options.now]
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
  generate,
  now = new Date(),
  log = () => {},
  onRunCreated = () => {},
}) {
  const cacheDir = join(root, "output", pipelineId, "audio");
  mkdirSync(cacheDir, { recursive: true });

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
  });

  const results = await generate(scenes, cacheDir, {
    qualityGateOptions: { keyEntities: meta.keyEntities },
  });

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
    meta: { stage: "tts-only" },
  });
  return { runId: run.runId, runDir: run.dir, results, materialized };
}

/**
 * Record a failed run when the TTS step throws. Separate from `runTtsOnly` so
 * the CLI keeps main.mjs's exit-handler shape (`process.on("exit")`).
 */
export function markTtsRunFailed({ root, pipelineId, runId, code, log = () => {} }) {
  try {
    markRun({
      root,
      slug: pipelineId,
      runId,
      status: RUN_STATUS.FAILED,
      meta: { stage: "tts-only", exitCode: code },
    });
  } catch (error) {
    log(`  ⚠️  could not record failed run ${runId}: ${error.message}`);
  }
}
