import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import VLM_CACHE_KEY, { VLM_ENGINE, VLM_MODEL_ID } from "../vlm-model.mjs";
import { getVlmModelId } from "../visual-analyzer.mjs";

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Read the default engine's modelId from the multi-engine vlm-model.json (#361). */
function readDeclaredModelId() {
  const cfg = JSON.parse(readFileSync(join(LIB_DIR, "vlm-model.json"), "utf-8"));
  return cfg.engines[cfg.engine].modelId;
}

describe("vlm-model single source of truth (#351, #361)", () => {
  it("getVlmModelId() mirrors the cache-key material (real module, not a mock)", () => {
    // Both consumer tests mock visual-analyzer.mjs wholesale, so this is the
    // only place the real export gets called — it must return the cache-key
    // material (engine + model id) so cache entries can't cross engines.
    expect(getVlmModelId()).toBe(VLM_CACHE_KEY);
  });

  it("exports a non-empty string engine and model id", () => {
    expect(typeof VLM_ENGINE).toBe("string");
    expect(VLM_ENGINE.trim().length).toBeGreaterThan(0);
    expect(typeof VLM_MODEL_ID).toBe("string");
    expect(VLM_MODEL_ID.trim().length).toBeGreaterThan(0);
  });

  it("default export is the cache-key material <engine>::<modelId>", () => {
    // The default export carries both dimensions so switching engines or
    // models invalidates old cache entries (#361).
    expect(VLM_CACHE_KEY).toBe(`${VLM_ENGINE}::${VLM_MODEL_ID}`);
  });

  it("model id equals the modelId declared for the default engine in vlm-model.json", () => {
    expect(VLM_MODEL_ID).toBe(readDeclaredModelId());
  });

  it("keeps both sides of the subprocess boundary on the same source — no dual declarations", () => {
    // Node side: visual-analyzer.mjs must not carry its own hardcoded id
    // (the #351 bug: Node said Qwen3-VL-8B while Python ran Qwen3-VL-30B).
    const nodeSrc = readFileSync(join(LIB_DIR, "visual-analyzer.mjs"), "utf-8");
    expect(nodeSrc).not.toContain("mlx-community/");

    // Python side: vlm_analyzer.py must read the shared JSON instead of a
    // hardcoded ~/models path.
    const pySrc = readFileSync(join(LIB_DIR, "vlm_analyzer.py"), "utf-8");
    expect(pySrc).toContain("vlm-model.json");
    expect(pySrc).not.toMatch(/MODEL_ID\s*=\s*str\(os\.path\.expanduser\(/);

    // The JSON is the only declaration, and both readers agree on it.
    expect(readDeclaredModelId()).toBe(VLM_MODEL_ID);
  });
});
