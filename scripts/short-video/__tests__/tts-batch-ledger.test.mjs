/**
 * #1566 — the session-level ledger must show N packs sharing one warm kernel.
 *
 * `runTtsBatch` already owns order/reuse/teardown; this pins the added facts:
 * every pack carries the same `sessionId` plus its own batch index, and the
 * session closes once with the true pack count and status.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { runTtsBatch } from "../lib/tts-batch-run.mjs";
import { openTtsLedger, readTtsLedger, SESSIONS_FILENAME } from "../lib/tts/ledger.mjs";

const packs = {
  a: { meta: { pipelineId: "pack-a" }, scenes: [{ id: 1 }, { id: 2 }] },
  b: { meta: { pipelineId: "pack-b" }, scenes: [{ id: 1 }, { id: 2 }] },
  c: { meta: {}, scenes: [{ id: 1 }] },
};

function fakeEngine(name = "fake-batch-engine") {
  return {
    name,
    info: "Fake batch engine (#1566 test)",
    setBatchMode: vi.fn(),
    endLiveSession: vi.fn(async () => {}),
  };
}

function makeLedger() {
  const dir = mkdtempSync(join(tmpdir(), "tts-batch-ledger-"));
  const ledger = openTtsLedger({ dir, file: SESSIONS_FILENAME });
  return { dir, ledger };
}

describe("runTtsBatch + session ledger", () => {
  it("links three packs to one session with ascending batch indexes", async () => {
    const { dir, ledger } = makeLedger();
    try {
      const seen = [];
      const runPack = vi.fn(async (pack) => {
        seen.push([pack.sessionId, pack.batchIndex, pack.sessionReused]);
        pack.onRunCreated(`run-${pack.contentDir}`);
        return { runId: `run-${pack.contentDir}` };
      });

      const { summary, ok } = await runTtsBatch({
        contents: ["a", "b", "c"],
        engine: fakeEngine(),
        loadPack: async (contentDir) => packs[contentDir],
        runPack,
        sessionId: "sess-1566",
        sessionLedger: ledger,
      });

      expect(ok).toBe(true);
      expect(summary.map((row) => row.runId)).toEqual(["run-a", "run-b", "run-c"]);
      expect(seen).toEqual([
        ["sess-1566", 1, false],
        ["sess-1566", 2, true],
        ["sess-1566", 3, true],
      ]);

      const { records } = readTtsLedger(ledger.path);
      const events = records.map((record) => record.event);
      expect(events).toEqual([
        "session.start",
        "session.pack",
        "session.pack",
        "session.pack",
        "session.end",
      ]);
      const packRows = records.filter((record) => record.event === "session.pack");
      expect(packRows.map((record) => record.runId)).toEqual(["run-a", "run-b", "run-c"]);
      expect(packRows.map((record) => record.batchIndex)).toEqual([1, 2, 3]);
      expect(new Set(packRows.map((record) => record.sessionId))).toEqual(new Set(["sess-1566"]));

      const end = records.at(-1);
      expect(end).toMatchObject({ packs: 3, ok: true, status: "ok", sessionId: "sess-1566" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records a failed pack in the session without hiding the next one", async () => {
    const { dir, ledger } = makeLedger();
    try {
      const runPack = vi.fn(async (pack) => {
        pack.onRunCreated(`run-${pack.contentDir}`);
        if (pack.contentDir === "b") throw new Error("kernel died mid-batch");
        return { runId: `run-${pack.contentDir}` };
      });

      const { ok } = await runTtsBatch({
        contents: ["a", "b"],
        engine: fakeEngine(),
        loadPack: async (contentDir) => packs[contentDir],
        runPack,
        sessionId: "sess-fail",
        sessionLedger: ledger,
      });

      expect(ok).toBe(false);
      const { records } = readTtsLedger(ledger.path);
      const failedPack = records.find(
        (record) => record.event === "session.pack" && record.status === "failed",
      );
      expect(failedPack).toMatchObject({
        sessionId: "sess-fail",
        runId: "run-b",
        batchIndex: 2,
      });
      expect(records.at(-1)).toMatchObject({ status: "failed", ok: false, packs: 2 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the old contract when no session ledger is supplied", async () => {
    const runPack = vi.fn(async (pack) => {
      pack.onRunCreated(`run-${pack.contentDir}`);
      return { runId: `run-${pack.contentDir}` };
    });
    const { ok } = await runTtsBatch({
      contents: ["a", "b"],
      engine: fakeEngine(),
      loadPack: async (contentDir) => packs[contentDir],
      runPack,
      sessionId: "sess-unused",
    });
    expect(ok).toBe(true);
    expect(runPack.mock.calls[0][0].sessionId).toBe("sess-unused");
  });
});
