/**
 * #1514: `step-1-tts` substep metering.
 *
 * The registry splits the outer TTS span into plan / engine / post-process /
 * verify / align / write, recorded through the pipeline profiler's existing
 * `steps[]` contract. These tests pin the wiring with a fake engine: which
 * substeps appear, that the derived `tts-engine` excludes the engine-reported
 * post-process segment, and that the non-overlapping leaves reconcile with the
 * span around the call.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createProfiler } from "../lib/pipeline-profile.mjs";
import { generateTTSWithEngine } from "../lib/tts/registry.mjs";

const SUBSTEPS = [
  "tts-select",
  "tts-plan",
  "tts-engine",
  "tts-engine-retry",
  "tts-loudness",
  "tts-verify",
  "tts-align",
  "tts-write",
];

function makeProfiler(dir) {
  return createProfiler({ outputDir: dir, version: "test-substeps", onExit: false });
}

function substepMs(prof, name) {
  return prof.steps.filter((s) => s.name === name).reduce((acc, s) => acc + s.durationMs, 0);
}

function hasStep(prof, name) {
  return prof.steps.some((s) => s.name === name);
}

describe("pipeline-profile record/end meta (#1514)", () => {
  it("record adds a span with the caller's duration and meta", () => {
    const dir = mkdtempSync(join(tmpdir(), "prof-record-"));
    try {
      const prof = makeProfiler(dir);
      prof.record("tts-engine", 1234, { queueMs: 100 });
      const step = prof.steps.find((s) => s.name === "tts-engine");
      expect(step.durationMs).toBe(1234);
      expect(step.queueMs).toBe(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("end merges meta known only at the end of the span", () => {
    const dir = mkdtempSync(join(tmpdir(), "prof-end-meta-"));
    try {
      const prof = makeProfiler(dir);
      prof.mark("tts-engine", { scenes: 2 });
      const ms = prof.end("tts-engine", { queueMs: 50, kernelMs: 900 });
      expect(ms).not.toBeNull();
      const step = prof.steps.find((s) => s.name === "tts-engine");
      expect(step.scenes).toBe(2);
      expect(step.queueMs).toBe(50);
      expect(step.kernelMs).toBe(900);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("generateTTSWithEngine substeps (#1514)", () => {
  let dirs = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  });

  /** Fake engine that reports a post-process segment through the #1514 hook. */
  function makeEngine({ loudnessMs = 12, delayMs = 30 } = {}) {
    return {
      name: "fake",
      info: "Fake engine (speed=1)",
      async generate(scenes, outputDir, hooks = {}) {
        await new Promise((r) => setTimeout(r, delayMs));
        hooks.onSpan?.("tts-loudness", loudnessMs);
        return scenes.map((s) => {
          const audioPath = join(outputDir, `scene-${s.id}.wav`);
          writeFileSync(audioPath, `wav-for-${s.id}`);
          return { sceneId: s.id, audioPath, duration: 1.5 + s.id };
        });
      },
    };
  }

  it("records plan/engine/post-process/write and reconciles the outer span", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-substep-"));
    dirs.push(dir);
    const audioDir = join(dir, "audio");
    mkdirSync(audioDir, { recursive: true });
    const prof = makeProfiler(dir);
    const scenes = [
      { id: 1, voiceover: "第一句" },
      { id: 2, voiceover: "第二句" },
    ];

    const t0 = performance.now();
    await generateTTSWithEngine(scenes, audioDir, makeEngine(), { prof, runAlignment: false });
    const outerMs = performance.now() - t0;

    expect(hasStep(prof, "tts-plan")).toBe(true);
    const engine = prof.steps.find((s) => s.name === "tts-engine");
    expect(engine).toBeTruthy();
    expect(engine.engineWallMs).toBeGreaterThan(0);
    expect(substepMs(prof, "tts-loudness")).toBe(12);
    // Derived engine span excludes the reported post-process segment, so the
    // two leaves cannot double count it.
    expect(substepMs(prof, "tts-engine") + substepMs(prof, "tts-loudness")).toBeCloseTo(
      engine.engineWallMs,
      -1,
    );
    // Gate skipped (fake engine) → no tts-verify, only the candidate settle.
    expect(hasStep(prof, "tts-verify")).toBe(false);
    expect(hasStep(prof, "tts-write")).toBe(true);

    const leaves = SUBSTEPS.filter((n) => n !== "tts-verify").reduce(
      (acc, n) => acc + substepMs(prof, n),
      0,
    );
    // Leaves must account for the call: allow only the glue between substeps.
    expect(leaves).toBeLessThanOrEqual(outerMs + 5);
    expect(leaves).toBeGreaterThan(outerMs * 0.8);
  });

  it("a full cache hit still records the plan span (no engine substep)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-substep-cache-"));
    dirs.push(dir);
    const audioDir = join(dir, "audio");
    mkdirSync(audioDir, { recursive: true });
    const scenes = [{ id: 1, voiceover: "第一句" }];
    await generateTTSWithEngine(scenes, audioDir, makeEngine(), { runAlignment: false });

    const prof = makeProfiler(dir);
    await generateTTSWithEngine(scenes, audioDir, makeEngine(), { prof, runAlignment: false });

    expect(hasStep(prof, "tts-plan")).toBe(true);
    expect(hasStep(prof, "tts-engine")).toBe(false);
    const verify = prof.steps.find((s) => s.name === "tts-verify");
    expect(verify).toBeUndefined();
  });
});
