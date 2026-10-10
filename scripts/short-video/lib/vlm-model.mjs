/**
 * Single source of truth for the VLM engine + model id (#351, #361).
 *
 * Both sides of the analyze subprocess boundary read vlm-model.json:
 *   - vlm_analyzer.py (per-engine MODEL_ID, expanduser'd — it loads the weights)
 *   - this module (cache-key material for visual-analyzer.mjs getVlmModelId)
 *
 * The default export is the cache-key material `<engine>::<modelId>`, so a
 * cache key can never name a model/engine different from the one that actually
 * ran inference. It carries the engine name as well as the model id: switching
 * engines (minicpm <-> qwen3-vl-moe) or models both invalidate old entries, so
 * no manual cache purge is needed.
 *
 * Change the engine ONLY in vlm-model.json ("engine" + that engine's
 * "modelId" + "videoInput"); both sides follow on the next process start. A
 * request may override the engine at the Python boundary (`--engine`), but the
 * Node cache key always names the file's default engine — callers that pin a
 * non-default engine must pass an explicit `model` cache-key material.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, "vlm-model.json");

function fail(message) {
  throw new Error(
    `${message} — vlm-model.json is the single source of truth for the VLM engine + model id, shared by vlm_analyzer.py and visual-analyzer.mjs (#351/#361)`,
  );
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
} catch (err) {
  fail(`vlm-model.json unreadable (${CONFIG_FILE}): ${err.message}`);
}

/** The default engine declared by vlm-model.json (e.g. "minicpm"). */
export const VLM_ENGINE = typeof config?.engine === "string" ? config.engine.trim() : "";

if (!VLM_ENGINE) {
  fail('vlm-model.json must declare a non-empty string "engine"');
}

const engines = config?.engines;
if (!engines || typeof engines !== "object") {
  fail('vlm-model.json must declare an "engines" object keyed by engine name');
}

const declaredModelId = engines[VLM_ENGINE]?.modelId;
if (typeof declaredModelId !== "string" || !declaredModelId.trim()) {
  fail(`vlm-model.json engines["${VLM_ENGINE}"] must declare a non-empty string "modelId"`);
}

// #542 L1: every engine declares how it consumes a video — "native" (the
// engine gets the file; mlx_vlm samples it) or "frames" (the caller extracts
// stills). Declared per engine and validated for ALL engines, not just the
// default: the capability is what the Node window-plan gate and the Python
// dispatch both branch on, so a missing value is a broken contract rather
// than a defaultable absence.
const VALID_VIDEO_INPUTS = ["native", "frames"];
for (const [name, entry] of Object.entries(engines)) {
  const videoInput = entry && typeof entry === "object" ? entry.videoInput : undefined;
  if (typeof videoInput !== "string" || !VALID_VIDEO_INPUTS.includes(videoInput.trim())) {
    fail(
      `vlm-model.json engines["${name}"] must declare a "videoInput" of ` +
        `${JSON.stringify(VALID_VIDEO_INPUTS)} (got ${JSON.stringify(videoInput)})`,
    );
  }
}

// #542: how many instances of this engine the machine can hold at once — the
// VLM pool size (visual-analyzer.mjs) defaults to it. Measured 2026-10-10: two
// Qwen3-VL-30B (17GB each) instances exhaust the Metal device (34GB > 32GB);
// the second worker's warmup dies with kIOGPUCommandBufferCallbackErrorOutOfMemory
// and BOTH analyses degrade to empty descriptions. Declared per engine and
// validated for all of them: the fallback number is what OOMs.
for (const [name, entry] of Object.entries(engines)) {
  const concurrency = entry && typeof entry === "object" ? entry.concurrency : undefined;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    fail(
      `vlm-model.json engines["${name}"] must declare a positive integer ` +
        `"concurrency" (got ${JSON.stringify(concurrency)})`,
    );
  }
}

/** Model id of the default engine (raw string, not expanduser'd — cache key material only). */
export const VLM_MODEL_ID = declaredModelId.trim();

/**
 * Video-input capability of the default engine (#542 L1): "native" or
 * "frames". Consumers that decide how a video reaches the model (the
 * asset-sourcer window plan) read this instead of inferring from the engine
 * name — the engine name is not the contract, the capability is.
 */
export const VLM_VIDEO_INPUT = engines[VLM_ENGINE].videoInput.trim();

/**
 * Concurrent VLM subprocesses the default engine supports (#542): the pool
 * size visual-analyzer.mjs uses when VLM_CONCURRENCY is unset. Engine-memory
 * driven, so it lives beside the engine declaration — see the validation note
 * above for the measurement that made this a declared fact.
 */
export const VLM_CONCURRENCY = engines[VLM_ENGINE].concurrency;

/**
 * Cache-key material: engine + model id. Both dimensions are key material —
 * the same asset analyzed by a different engine or model is a different result.
 */
export default `${VLM_ENGINE}::${VLM_MODEL_ID}`;
