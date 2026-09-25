/**
 * Single source of truth for the VLM model id (#351).
 *
 * Both sides of the analyze subprocess boundary read vlm-model.json:
 *   - vlm_analyzer.py (MODEL_ID, expanduser'd — it loads the weights)
 *   - this module (getVlmModelId in visual-analyzer.mjs — cache-key material)
 *
 * Before this file existed the id was declared twice (Python constant vs
 * Node DEFAULT_VLM_MODEL_ID) and the copies drifted — cache keys then named
 * a model that never produced the cached results (#351 stale hits). Change
 * the model ONLY in vlm-model.json; both sides follow on the next process
 * start. Cache entries from a previous model simply stop being hit (the
 * model id is key material), so no manual cache purge is needed.
 *
 * The Python side uses the value verbatim after expanduser (a local path or
 * HF repo id); the Node side uses the raw string as cache-key material only.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let modelId;
try {
  modelId = JSON.parse(readFileSync(join(__dirname, "vlm-model.json"), "utf-8")).modelId;
} catch (err) {
  throw new Error(
    `vlm-model.json unreadable — it is the single source of truth for the VLM model id, shared by vlm_analyzer.py and visual-analyzer.mjs (#351): ${err.message}`,
  );
}
if (typeof modelId !== "string" || !modelId.trim()) {
  throw new Error(
    'vlm-model.json must declare a non-empty string "modelId" — single source of truth for the VLM model id (#351)',
  );
}

export default modelId.trim();
