/**
 * #1566 — `tts-only` owns the run, so it must
 *   1) pass one session id + ledger handle into generation,
 *   2) store the session pointer in `run.json.meta.ttsSessionId`,
 *   3) keep a failed attempt in the lane ledger.
 *
 * The engine is injected: this test owns the orchestration wiring, not the
 * registry contract (pinned in tts-ledger-registry.test.mjs).
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { runTtsOnly } from "../lib/tts-only-run.mjs";
import { writeRateReport } from "../lib/exchange-rates.mjs";
import { readManifest } from "../lib/run-history.mjs";
import { readTtsLedger } from "../lib/tts/ledger.mjs";

const PIPELINE = "ledger-tts-only";

function buildRoot() {
  const root = mkdtempSync(join(tmpdir(), "tts-ledger-only-"));
  mkdirSync(join(root, "content", PIPELINE), { recursive: true });
  mkdirSync(join(root, "output", PIPELINE, "audio"), { recursive: true });
  writeRateReport(join(root, "output", PIPELINE, "currency-rates.json"), {
    rates: { CNY: 7.21, HKD: 7.79 },
    source: "test-fixture",
    providerTime: null,
    fetchedAt: new Date("2026-11-28T00:00:00Z").toISOString(),
    fallback: false,
  });
  return root;
}

function writeTakes(scenes, cacheDir) {
  const results = [];
  for (const scene of scenes) {
    const audioPath = join(cacheDir, `scene-${scene.id}.wav`);
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
        verifiedAt: "2026-11-28T00:00:00.000Z",
      }),
    );
    results.push({ sceneId: scene.id, audioPath, duration: 4.5, status: "approved" });
  }
  writeFileSync(join(cacheDir, "subtitle-timing.json"), JSON.stringify({ words: [] }));
  writeFileSync(join(cacheDir, "subtitle-timing.meta.json"), JSON.stringify({ sig: "x" }));
  return results;
}

describe("runTtsOnly + ledger", () => {
  it("passes identity into generate and points run.json at the session", async () => {
    const root = buildRoot();
    try {
      const scenes = [{ id: 1, voiceover: "first line" }];
      const seen = [];
      const result = await runTtsOnly({
        root,
        pipelineId: PIPELINE,
        contentDir: PIPELINE,
        scenes,
        meta: { pipelineId: PIPELINE, keyEntities: {} },
        withRun: true,
        generate: async (scenesArg, cacheDir, options) => {
          seen.push(options);
          const results = writeTakes(scenesArg, cacheDir);
          options.ledger.runStart({
            runId: options.runId,
            sessionId: options.sessionId,
            provider: "test-engine",
            pipelineId: options.pipelineId,
            scenes: scenesArg.length,
          });
          options.ledger.runEnd({
            runId: options.runId,
            sessionId: options.sessionId,
            provider: "test-engine",
            seconds: 1,
            kernel: { queuedSec: 0, loadSec: 0, synthSec: 1 },
          });
          return results;
        },
        now: new Date("2026-11-28T03:00:00Z"),
      });

      expect(result.runId).toBeTruthy();
      expect(seen[0]).toMatchObject({
        runId: result.runId,
        pipelineId: PIPELINE,
        contentDir: PIPELINE,
      });
      expect(seen[0].sessionId).toMatch(/^tts-\d{8}T\d{6}-[0-9a-f]{6}$/);
      expect(seen[0].ledger?.path).toContain(join("output", PIPELINE, "tts-ledger.jsonl"));

      const manifest = readManifest(root, PIPELINE);
      const entry = manifest.runs.find((run) => run.runId === result.runId);
      expect(entry.meta.ttsSessionId).toBe(seen[0].sessionId);

      const { records } = readTtsLedger(join(root, "output", PIPELINE, "tts-ledger.jsonl"));
      expect(records.map((record) => record.event)).toEqual(["run.start", "run.end"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a failed attempt in the ledger with the same session id", async () => {
    const root = buildRoot();
    try {
      const scenes = [{ id: 1, voiceover: "boom" }];
      let sessionId = null;
      await expect(
        runTtsOnly({
          root,
          pipelineId: PIPELINE,
          contentDir: PIPELINE,
          scenes,
          meta: { pipelineId: PIPELINE, keyEntities: {} },
          withRun: true,
          sessionId: "s-fixed",
          generate: async (_scenesArg, _cacheDir, options) => {
            sessionId = options.sessionId;
            options.ledger.runStart({
              runId: options.runId,
              sessionId: options.sessionId,
              provider: "test-engine",
            });
            throw new Error("engine exploded");
          },
          now: new Date("2026-11-28T03:05:00Z"),
        }),
      ).rejects.toThrow("engine exploded");
      expect(sessionId).toBe("s-fixed");
      const { records } = readTtsLedger(join(root, "output", PIPELINE, "tts-ledger.jsonl"));
      const fail = records.find((record) => record.event === "run.fail");
      expect(fail).toMatchObject({ sessionId: "s-fixed", status: "failed" });
      expect(String(fail.error)).toContain("engine exploded");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
