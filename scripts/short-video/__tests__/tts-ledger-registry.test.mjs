/**
 * #1566 — the registry writes run.start/run.end with the facts it can observe.
 *
 * Two exits are pinned: the generation path (engine returned takes with the
 * kernel's own `genTime`) and the full-cache-hit path (no engine work at all,
 * but the run still needs its ledger line). No real engine, no alignment.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { generateTTSWithEngine } from "../lib/tts/registry.mjs";
import { computeSceneKey, writeSceneMeta } from "../lib/tts/cache.mjs";
import { openTtsLedger, readTtsLedger, UNKNOWN } from "../lib/tts/ledger.mjs";

const PIPELINE = "ledger-probe";
const ENGINE = { name: "fake-ledger-engine", info: "Fake ledger engine (#1566 test)" };

function buildRoot() {
  const root = mkdtempSync(join(tmpdir(), "tts-ledger-registry-"));
  mkdirSync(join(root, "output", PIPELINE, "audio"), { recursive: true });
  return root;
}

function fakeEngine() {
  return {
    name: ENGINE.name,
    info: ENGINE.info,
    async generate(scenes, outputDir) {
      return scenes.map((scene) => {
        const audioPath = join(outputDir, `scene-${scene.id}.wav`);
        writeFileSync(audioPath, `take-${scene.id}`);
        return { sceneId: scene.id, audioPath, duration: 4.5, genTime: 3.2, rtf: 0.71 };
      });
    },
  };
}

function baseOptions(ledger, extra = {}) {
  return {
    useCache: false,
    runAlignment: false,
    ledger,
    runId: "r-1566-a",
    sessionId: "s-1566-a",
    pipelineId: PIPELINE,
    contentDir: PIPELINE,
    batchIndex: 1,
    sessionReused: false,
    ...extra,
  };
}

describe("generateTTSWithEngine + ledger", () => {
  it("records provider identity, phases, kernel synth seconds and scene gen", async () => {
    const root = buildRoot();
    try {
      const outputDir = join(root, "output", PIPELINE, "audio");
      const ledger = openTtsLedger({ dir: join(root, "output", PIPELINE) });
      const scenes = [
        { id: 1, voiceover: "first line" },
        { id: 2, voiceover: "second line" },
      ];

      const results = await generateTTSWithEngine(
        scenes,
        outputDir,
        fakeEngine(),
        baseOptions(ledger),
      );
      expect(results).toHaveLength(2);

      const { records, skipped } = readTtsLedger(ledger.path);
      expect(skipped).toBe(0);
      expect(records.map((record) => record.event)).toEqual(["run.start", "run.end"]);

      const start = records[0];
      expect(start).toMatchObject({
        runId: "r-1566-a",
        sessionId: "s-1566-a",
        provider: ENGINE.name,
        pipelineId: PIPELINE,
        scenes: 2,
        cacheHits: 0,
        pending: 2,
      });

      const end = records[1];
      expect(end).toMatchObject({
        runId: "r-1566-a",
        provider: ENGINE.name,
        status: "ok",
        scenes: 2,
      });
      expect(end.phases.plan).toBeGreaterThanOrEqual(0);
      expect(end.phases.engine).toBeGreaterThanOrEqual(0);
      expect(end.phases.total).toBeGreaterThanOrEqual(0);
      expect(end.kernel.synthSec).toBe(6.4);
      expect(end.sceneGen).toEqual([
        { sceneId: 1, seconds: 3.2, audioSec: 4.5, rtf: 0.71 },
        { sceneId: 2, seconds: 3.2, audioSec: 4.5, rtf: 0.71 },
      ]);
      expect(end.quota.kaggleWeekly).toBe(UNKNOWN);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still writes run.end on a full cache hit (no engine call)", async () => {
    const root = buildRoot();
    try {
      const outputDir = join(root, "output", PIPELINE, "audio");
      const ledger = openTtsLedger({ dir: join(root, "output", PIPELINE) });
      const scenes = [{ id: 1, voiceover: "already voiced" }];

      const audioPath = join(outputDir, "scene-1.wav");
      writeFileSync(audioPath, "approved-bytes");
      expect(
        writeSceneMeta(outputDir, 1, {
          key: computeSceneKey(ENGINE, scenes[0].voiceover),
          duration: 4.5,
          engine: ENGINE.name,
          audioPath,
        }),
      ).toBe(true);

      let generated = 0;
      const engine = {
        ...fakeEngine(),
        async generate(innerScenes, innerOutputDir) {
          generated += 1;
          return fakeEngine().generate(innerScenes, innerOutputDir);
        },
      };

      const results = await generateTTSWithEngine(
        scenes,
        outputDir,
        engine,
        baseOptions(ledger, { useCache: true, runId: "r-1566-hit", sessionReused: true }),
      );
      expect(results).toHaveLength(1);
      expect(generated).toBe(0);

      const { records } = readTtsLedger(ledger.path);
      const end = records.find((record) => record.event === "run.end");
      expect(end).toMatchObject({
        runId: "r-1566-hit",
        status: "ok",
        cacheHits: 1,
        sessionReused: true,
      });
      expect(end.phases.engine).toBe(0);
      expect(end.kernel.synthSec).toBe(UNKNOWN);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores a poll-status written before this run started", async () => {
    const root = buildRoot();
    try {
      const outputDir = join(root, "output", PIPELINE, "audio");
      const statusDir = join(outputDir, ".kaggle-kernel");
      mkdirSync(statusDir, { recursive: true });
      writeFileSync(
        join(statusDir, "poll-status.json"),
        JSON.stringify({
          kernelId: ENGINE.name,
          queuedMs: 120000,
          runningMs: 300352,
          updatedAt: "2026-11-25T00:04:45.842Z",
        }),
      );
      const ledger = openTtsLedger({ dir: join(root, "output", PIPELINE) });
      const engine = {
        ...fakeEngine(),
        getSessionTelemetry() {
          return {
            kernelId: ENGINE.name,
            requestId: "req-1566",
            batchIndex: 1,
            sessionReused: false,
            loadSec: null,
            sessionLoadSec: null,
          };
        },
      };

      await generateTTSWithEngine(
        [{ id: 1, voiceover: "line" }],
        outputDir,
        engine,
        baseOptions(ledger, { runId: "r-stale-time" }),
      );

      const { records } = readTtsLedger(ledger.path);
      const end = records.find((record) => record.event === "run.end");
      expect(end.kernel.queuedSec).toBe(UNKNOWN);
      expect(end.kernel.runningSec).toBe(UNKNOWN);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores a fresh poll-status that names another kernel", async () => {
    const root = buildRoot();
    try {
      const outputDir = join(root, "output", PIPELINE, "audio");
      const statusDir = join(outputDir, ".kaggle-kernel");
      mkdirSync(statusDir, { recursive: true });
      const ledger = openTtsLedger({ dir: join(root, "output", PIPELINE) });
      const base = fakeEngine();
      const engine = {
        ...base,
        async generate(scenes, innerOutputDir) {
          // Written after the run starts, so only the kernelId guard can reject it.
          writeFileSync(
            join(statusDir, "poll-status.json"),
            JSON.stringify({
              kernelId: "some-other-kernel",
              queuedMs: 120000,
              runningMs: 300352,
              updatedAt: new Date().toISOString(),
            }),
          );
          return base.generate(scenes, innerOutputDir);
        },
        getSessionTelemetry() {
          return {
            kernelId: ENGINE.name,
            requestId: "req-1566",
            batchIndex: 1,
            sessionReused: false,
            loadSec: null,
            sessionLoadSec: null,
          };
        },
      };

      await generateTTSWithEngine(
        [{ id: 1, voiceover: "line" }],
        outputDir,
        engine,
        baseOptions(ledger, { runId: "r-stale-kernel" }),
      );

      const { records } = readTtsLedger(ledger.path);
      const end = records.find((record) => record.event === "run.end");
      expect(end.kernel.queuedSec).toBe(UNKNOWN);
      expect(end.kernel.runningSec).toBe(UNKNOWN);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not write anything when no ledger handle is supplied", async () => {
    const root = buildRoot();
    try {
      const outputDir = join(root, "output", PIPELINE, "audio");
      const options = baseOptions(null);
      delete options.ledger;
      await generateTTSWithEngine([{ id: 1, voiceover: "line" }], outputDir, fakeEngine(), options);
      expect(() => readFileSync(join(root, "output", PIPELINE, "tts-ledger.jsonl"))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
