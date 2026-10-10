import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import VLM_CACHE_KEY, {
  VLM_ENGINE,
  VLM_MODEL_ID,
  VLM_VIDEO_INPUT,
  VLM_CONCURRENCY,
} from "../vlm-model.mjs";
import { getVlmModelId, getVlmVideoInput } from "../visual-analyzer.mjs";

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Read the default engine's modelId from the multi-engine vlm-model.json (#361). */
function readDeclaredModelId() {
  const cfg = JSON.parse(readFileSync(join(LIB_DIR, "vlm-model.json"), "utf-8"));
  return cfg.engines[cfg.engine].modelId;
}

/** Read the whole config (videoInput assertions, #542). */
function readConfig() {
  return JSON.parse(readFileSync(join(LIB_DIR, "vlm-model.json"), "utf-8"));
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

  // #542 L1: videoInput is the capability both sides branch on (Node: window
  // plan; Python: native-vs-frames dispatch). It must come from the file, and
  // getVlmVideoInput() must mirror it (the real module, not a mock).
  it("declares a videoInput per engine and mirrors it through getVlmVideoInput()", () => {
    const cfg = readConfig();
    expect(["native", "frames"]).toContain(VLM_VIDEO_INPUT);
    expect(getVlmVideoInput()).toBe(VLM_VIDEO_INPUT);
    for (const [name, entry] of Object.entries(cfg.engines)) {
      expect(["native", "frames"], `engines["${name}"].videoInput`).toContain(entry.videoInput);
    }
    expect(cfg.engines[VLM_ENGINE].videoInput).toBe(VLM_VIDEO_INPUT);
  });

  it("keeps the capability honest: minicpm is frames-only, qwen is native", () => {
    // MiniCPM-o has no native video support (Python raises if handed one);
    // Qwen3-VL samples the file itself. A swap here would silently route one
    // engine's videos through the other's path.
    const cfg = readConfig();
    expect(cfg.engines.minicpm.videoInput).toBe("frames");
    expect(cfg.engines["qwen3-vl-moe"].videoInput).toBe("native");
  });

  // #542: the pool size is engine-memory driven, and the engine is declared in
  // this file — so the declared concurrency must come from here too. Measured
  // 2026-10-10: two Qwen3-VL-30B (17GB) instances OOM the Metal device
  // (34GB > 32GB) and BOTH analyses degrade silently to empty descriptions.
  it("declares a per-engine concurrency and mirrors the default engine's through VLM_CONCURRENCY", () => {
    const cfg = readConfig();
    expect(Number.isInteger(VLM_CONCURRENCY)).toBe(true);
    expect(VLM_CONCURRENCY).toBeGreaterThanOrEqual(1);
    for (const [name, entry] of Object.entries(cfg.engines)) {
      expect(Number.isInteger(entry.concurrency), `engines["${name}"].concurrency`).toBe(true);
      expect(entry.concurrency, `engines["${name}"].concurrency`).toBeGreaterThanOrEqual(1);
    }
    expect(cfg.engines[VLM_ENGINE].concurrency).toBe(VLM_CONCURRENCY);
  });

  it("keeps the pool honest: the 17GB engine runs one instance, the 5GB engine two", () => {
    const cfg = readConfig();
    expect(cfg.engines["qwen3-vl-moe"].concurrency).toBe(1);
    expect(cfg.engines.minicpm.concurrency).toBe(2);
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

// ─── Fail-fast branches on malformed vlm-model.json (#361) ───
//
// vlm-model.mjs evaluates its validation at import time, so each case mocks
// fs, resets the module registry, and re-imports the module dynamically to
// observe the thrown Error. The existing real-file tests above are untouched:
// they were resolved from the static import before any doMock applies.

describe("vlm-model fail-fast branches on malformed vlm-model.json", () => {
  afterEach(() => {
    vi.doUnmock("fs");
    vi.resetModules();
  });

  /** A complete, valid engine entry — the baseline every case mutates. */
  function engine(overrides = {}) {
    return { modelId: "m", videoInput: "frames", concurrency: 2, ...overrides };
  }

  /** Serialize a config whose "minicpm" entry is `entry` (or omitted). */
  function config(entry, engineName = "minicpm") {
    const engines = entry === undefined ? {} : { [engineName]: entry };
    return JSON.stringify({ engine: engineName, engines });
  }

  /**
   * Import vlm-model.mjs fresh under a mocked readFileSync.
   * @param {Function} readFileSyncImpl - the mocked readFileSync implementation
   * @returns {Promise<any>} the module namespace (import rejects on fail-fast)
   */
  async function importUnderTest(readFileSyncImpl) {
    vi.resetModules();
    vi.doMock("fs", () => ({ readFileSync: vi.fn(readFileSyncImpl) }));
    return import("../vlm-model.mjs");
  }

  it("throws on unreadable JSON (readFileSync fails)", async () => {
    await expect(
      importUnderTest(() => {
        throw new Error("EACCES: permission denied");
      }),
    ).rejects.toThrow(/vlm-model\.json unreadable.*EACCES: permission denied/s);
  });

  it("throws when engine is missing or empty", async () => {
    await expect(importUnderTest(() => '{"engines": {"minicpm": {}}}')).rejects.toThrow(
      /non-empty string "engine"/,
    );
  });

  it("throws when engines is missing", async () => {
    await expect(importUnderTest(() => '{"engine": "minicpm"}')).rejects.toThrow(
      /must declare an "engines" object/,
    );
  });

  it("throws when engines is not an object", async () => {
    await expect(importUnderTest(() => '{"engine": "minicpm", "engines": "nope"}')).rejects.toThrow(
      /must declare an "engines" object/,
    );
  });

  it("throws when engines[engine].modelId is missing", async () => {
    await expect(importUnderTest(() => config(engine({ modelId: undefined })))).rejects.toThrow(
      /engines\["minicpm"\] must declare a non-empty string "modelId"/,
    );
  });

  it("throws when engines[engine].modelId is not a string", async () => {
    await expect(importUnderTest(() => config(engine({ modelId: 42 })))).rejects.toThrow(
      /must declare a non-empty string "modelId"/,
    );
  });

  it("throws when engines[engine].modelId is whitespace-only", async () => {
    await expect(importUnderTest(() => config(engine({ modelId: "   " })))).rejects.toThrow(
      /must declare a non-empty string "modelId"/,
    );
  });

  // #542 L1: the capability must be declared, not inferred from the engine
  // name — a missing/unknown value is a broken contract for both sides.
  it("throws when the default engine's videoInput is missing", async () => {
    await expect(importUnderTest(() => config(engine({ videoInput: undefined })))).rejects.toThrow(
      /engines\["minicpm"\] must declare a "videoInput"/,
    );
  });

  it("throws when videoInput is not native/frames", async () => {
    await expect(importUnderTest(() => config(engine({ videoInput: "stills" })))).rejects.toThrow(
      /must declare a "videoInput"/,
    );
  });

  it("throws when a non-default engine has a malformed videoInput", async () => {
    // Validating only the default engine would let a --engine switch (or a
    // config edit) reach the Python side with an unusable capability.
    const cfg = JSON.stringify({
      engine: "minicpm",
      engines: { minicpm: engine(), "qwen3-vl-moe": engine({ videoInput: undefined }) },
    });
    await expect(importUnderTest(() => cfg)).rejects.toThrow(
      /engines\["qwen3-vl-moe"\] must declare a "videoInput"/,
    );
  });

  // #542: two 17GB Qwen instances OOM the GPU, so the pool size is a declared
  // engine fact. A missing/invalid value must fail fast rather than fall back
  // to a number that does not fit in memory.
  it("throws when the default engine's concurrency is missing", async () => {
    await expect(importUnderTest(() => config(engine({ concurrency: undefined })))).rejects.toThrow(
      /engines\["minicpm"\] must declare a positive integer "concurrency"/,
    );
  });

  for (const [name, bad] of [
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["string", "2"],
    ["null", null],
  ]) {
    it(`throws when concurrency is ${name}`, async () => {
      await expect(importUnderTest(() => config(engine({ concurrency: bad })))).rejects.toThrow(
        /must declare a positive integer "concurrency"/,
      );
    });
  }

  it("throws when a non-default engine has a malformed concurrency", async () => {
    const cfg = JSON.stringify({
      engine: "minicpm",
      engines: { minicpm: engine(), "qwen3-vl-moe": engine({ concurrency: 0 }) },
    });
    await expect(importUnderTest(() => cfg)).rejects.toThrow(
      /engines\["qwen3-vl-moe"\] must declare a positive integer "concurrency"/,
    );
  });

  it("succeeds on a well-formed config and exports trimmed values", async () => {
    const mod = await importUnderTest(() =>
      JSON.stringify({
        engine: " minicpm ",
        engines: { minicpm: { modelId: "  mock-model  ", videoInput: " frames ", concurrency: 3 } },
      }),
    );
    expect(mod.VLM_ENGINE).toBe("minicpm");
    expect(mod.VLM_MODEL_ID).toBe("mock-model");
    expect(mod.VLM_VIDEO_INPUT).toBe("frames");
    expect(mod.VLM_CONCURRENCY).toBe(3);
    expect(mod.default).toBe("minicpm::mock-model");
  });
});
