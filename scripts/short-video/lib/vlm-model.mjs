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
 * "modelId"); both sides follow on the next process start. A request may
 * override the engine at the Python boundary (`--engine`), but the Node cache
 * key always names the file's default engine — callers that pin a non-default
 * engine must pass an explicit `model` cache-key material.
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

/** Model id of the default engine (raw string, not expanduser'd — cache key material only). */
export const VLM_MODEL_ID = declaredModelId.trim();

/**
 * Cache-key material: engine + model id. Both dimensions are key material —
 * the same asset analyzed by a different engine or model is a different result.
 */
export default `${VLM_ENGINE}::${VLM_MODEL_ID}`;
