/**
 * #1528 R1: `tts-only --run` must produce a run that `render-only` can read.
 *
 * The gap this pins: `tts-only` wrote only the shared cache
 * (`output/<pipelineId>/audio`), so a prewarmed TTS could not be rendered on
 * another machine — a run directory only appeared after a full `main.mjs`
 * run, which also rendered. Here the run is created before TTS, the takes and
 * the alignment pair are materialized into it, and the rate report lands in the
 * run so `render-only` never has to re-quote.
 *
 * No engine is involved: `generate` is injected, which is also why the cache
 * meta below can be minimal — this test owns the orchestration wiring, not the
 * TTS contract.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { markTtsRunFailed, runTtsOnly } from "../lib/tts-only-run.mjs";
import { writeRateReport } from "../lib/exchange-rates.mjs";
import { readManifest, RUN_STATUS } from "../lib/run-history.mjs";

const PIPELINE_ID = "probe-pack";

function buildRoot({ withRates = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "tts-only-run-"));
  mkdirSync(join(root, "content", PIPELINE_ID), { recursive: true });
  mkdirSync(join(root, "output", PIPELINE_ID, "audio"), { recursive: true });
  if (withRates)
    writeRateReport(join(root, "output", PIPELINE_ID, "currency-rates.json"), {
      rates: { CNY: 7.21, HKD: 7.79 },
      source: "test-fixture",
      providerTime: null,
      fetchedAt: new Date("2026-11-26T00:00:00Z").toISOString(),
      fallback: false,
    });
  return root;
}

/** Provider stand-in: only used when the cache is cold. */
const okFetch = async () => ({
  ok: true,
  json: async () => ({
    result: "success",
    time_last_update_utc: "Wed, 26 Nov 2026 00:00:00 +0000",
    rates: { USD: 1, CNY: 7.0, HKD: 7.8 },
  }),
});

/** A generate stand-in: writes the cache artifacts a real engine + aligner would. */
function fakeGenerate({ writeTiming = true } = {}) {
  return async (scenesArg, cacheDir) => {
    const results = [];
    for (const scene of scenesArg) {
      const name = `scene-${scene.id}.wav`;
      const audioPath = join(cacheDir, name);
      writeFileSync(audioPath, `wav:${scene.id}`);
      writeFileSync(
        join(cacheDir, `scene-${scene.id}.tts-meta.json`),
        JSON.stringify({
          key: `k-${scene.id}`,
          duration: 4.5,
          engine: "test-engine",
          audioPath,
          status: "approved",
          metaVersion: 1,
          audioDigest: "digest",
          verifiedAt: "2026-11-26T00:00:00.000Z",
        }),
      );
      results.push({ sceneId: scene.id, audioPath, duration: 4.5, status: "approved" });
    }
    if (writeTiming) {
      writeFileSync(join(cacheDir, "subtitle-timing.json"), JSON.stringify({ words: [] }));
      writeFileSync(join(cacheDir, "subtitle-timing.meta.json"), JSON.stringify({ sig: "x" }));
    }
    return results;
  };
}

describe("tts-only --run", () => {
  it("materializes takes, sidecars, alignment pair and rates into a new run", async () => {
    const root = buildRoot();
    try {
      const scenes = [
        { id: 1, voiceover: "first line" },
        { id: 2, voiceover: "second line" },
      ];
      const meta = { pipelineId: PIPELINE_ID, keyEntities: {} };
      const result = await runTtsOnly({
        root,
        pipelineId: PIPELINE_ID,
        contentDir: PIPELINE_ID,
        scenes,
        meta,
        withRun: true,
        generate: fakeGenerate(),
        now: new Date("2026-11-26T03:00:00Z"),
        onRunCreated: () => {},
      });

      expect(result.runId).toMatch(/^r-20261126T/);
      const audioDir = join(result.runDir, "audio");
      expect(existsSync(join(audioDir, "scene-1.wav"))).toBe(true);
      expect(existsSync(join(audioDir, "scene-1.tts-meta.json"))).toBe(true);
      expect(existsSync(join(audioDir, "subtitle-timing.json"))).toBe(true);
      expect(existsSync(join(audioDir, "subtitle-timing.meta.json"))).toBe(true);
      expect(result.materialized.timing).toEqual([
        "subtitle-timing.json",
        "subtitle-timing.meta.json",
      ]);

      // render-only reads the rate report from the run, not from a fresh quote.
      const rates = JSON.parse(readFileSync(join(result.runDir, "currency-rates.json"), "utf8"));
      expect(rates.rates.CNY).toBe(7.21);
      expect(rates.source).toBe("run-artifact:test-fixture");

      // The run is parked at running (nothing shipped), so latest never moves.
      const manifest = readManifest(root, PIPELINE_ID);
      const entry = manifest.runs.find((run) => run.runId === result.runId);
      expect(entry.status).toBe(RUN_STATUS.RUNNING);
      expect(entry.meta.stage).toBe("tts-only");
      expect(entry.artifacts.audioDir).toBe("audio");
      expect(existsSync(join(root, "output", PIPELINE_ID, "latest.json"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("without --run writes only the cache and allocates no run", async () => {
    const root = buildRoot();
    try {
      const result = await runTtsOnly({
        root,
        pipelineId: PIPELINE_ID,
        contentDir: PIPELINE_ID,
        scenes: [{ id: 1, voiceover: "only line" }],
        meta: { pipelineId: PIPELINE_ID, keyEntities: {} },
        withRun: false,
        generate: fakeGenerate(),
      });
      expect(result.runId).toBeNull();
      expect(result.materialized).toBeNull();
      expect(readManifest(root, PIPELINE_ID).runs).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records the allocated run as failed when TTS throws", async () => {
    const root = buildRoot();
    try {
      let allocated = null;
      await expect(
        runTtsOnly({
          root,
          pipelineId: PIPELINE_ID,
          contentDir: PIPELINE_ID,
          scenes: [{ id: 1, voiceover: "doomed" }],
          meta: { pipelineId: PIPELINE_ID, keyEntities: {} },
          withRun: true,
          generate: async () => {
            throw new Error("kaggle queue timeout");
          },
          onRunCreated: (id) => {
            allocated = id;
          },
        }),
      ).rejects.toThrow("kaggle queue timeout");

      // The run id carries the LOCAL calendar day (`r-YYYYMMDDT...`). Pinning
      // yesterday's literal made this suite red every day after 2026-11-26
      // without anything in the allocator changing; derive the day here instead.
      const localDay = (() => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      })();
      expect(allocated).toMatch(new RegExp(`^r-${localDay}T`));
      markTtsRunFailed({ root, pipelineId: PIPELINE_ID, runId: allocated, code: 1 });
      const entry = readManifest(root, PIPELINE_ID).runs.find((run) => run.runId === allocated);
      expect(entry.status).toBe(RUN_STATUS.FAILED);
      expect(entry.meta.stage).toBe("tts-only");
      expect(entry.meta.exitCode).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("seeds the rate report when the cache is cold, so the full run reuses it", async () => {
    const root = buildRoot({ withRates: false });
    try {
      await runTtsOnly({
        root,
        pipelineId: PIPELINE_ID,
        contentDir: PIPELINE_ID,
        scenes: [{ id: 1, voiceover: "first line" }],
        meta: { pipelineId: PIPELINE_ID, keyEntities: {} },
        withRun: true,
        generate: fakeGenerate(),
        now: new Date("2026-11-26T03:00:00Z"),
        fetchImpl: okFetch,
      });
      const seeded = JSON.parse(
        readFileSync(join(root, "output", PIPELINE_ID, "currency-rates.json"), "utf8"),
      );
      expect(seeded.source).toBe("open.er-api.com");
      expect(seeded.rates.CNY).toBeCloseTo(1 / 7.0, 6);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not touch the network when a fresh report exists", async () => {
    const root = buildRoot();
    try {
      await runTtsOnly({
        root,
        pipelineId: PIPELINE_ID,
        contentDir: PIPELINE_ID,
        scenes: [{ id: 1, voiceover: "first line" }],
        meta: { pipelineId: PIPELINE_ID, keyEntities: {} },
        withRun: true,
        generate: fakeGenerate(),
        now: new Date("2026-11-26T03:00:00Z"),
        fetchImpl: async () => {
          throw new Error("network must not be used");
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
