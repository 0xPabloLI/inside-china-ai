import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import VLM_MODEL_ID from "../vlm-model.mjs";

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("vlm-model single source of truth (#351)", () => {
  it("exports a non-empty string model id", () => {
    expect(typeof VLM_MODEL_ID).toBe("string");
    expect(VLM_MODEL_ID.trim().length).toBeGreaterThan(0);
  });

  it("equals the modelId declared in vlm-model.json", () => {
    const declared = JSON.parse(
      readFileSync(join(LIB_DIR, "vlm-model.json"), "utf-8"),
    ).modelId;
    expect(VLM_MODEL_ID).toBe(declared);
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
    const declared = JSON.parse(
      readFileSync(join(LIB_DIR, "vlm-model.json"), "utf-8"),
    ).modelId;
    expect(declared).toBe(VLM_MODEL_ID);
  });
});
