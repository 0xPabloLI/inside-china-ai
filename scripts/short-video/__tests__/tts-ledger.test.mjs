/**
 * #1566 — the ledger itself: append-only JSONL, honest rounding, fail-open
 * writes, corrupt-line tolerance and the session/run roll-up.
 *
 * No TTS engine is involved: the ledger is a plain side channel, and its
 * contract must hold even when nobody is generating audio.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  createSessionId,
  filterTtsLedger,
  openTtsLedger,
  readTtsLedger,
  SESSIONS_FILENAME,
  summarizeTtsLedger,
  UNKNOWN,
} from "../lib/tts/ledger.mjs";

function tempDir(prefix = "tts-ledger-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("createSessionId", () => {
  it("names the provider and sorts by time", () => {
    const id = createSessionId({
      provider: "cosyvoice3-kaggle-cuda",
      now: new Date(Date.UTC(2026, 10, 28, 9, 5, 7)),
      rand: () => Buffer.from("ab12cd", "hex"),
    });
    expect(id).toBe("cosyvoice3-kaggle-cuda-20261128T090507-ab12cd");
  });
});

describe("openTtsLedger", () => {
  it("appends run/session records and rounds every duration", () => {
    const dir = tempDir();
    try {
      const ledger = openTtsLedger({
        dir,
        now: () => new Date("2026-11-28T01:00:00.000Z"),
      });
      ledger.runStart({ runId: "r-a", sessionId: "s-a", provider: "fake", scenes: 2 });
      ledger.runEnd({
        runId: "r-a",
        sessionId: "s-a",
        provider: "fake",
        seconds: 12.345,
        phases: { plan: 1.234, engine: 10.005 },
        kernel: { synthSec: 9.876, queuedSec: UNKNOWN, loadSec: UNKNOWN },
        sceneGen: [{ sceneId: 1, seconds: 4.444 }],
      });
      const { records, skipped } = readTtsLedger(ledger.path);
      expect(skipped).toBe(0);
      expect(records.map((record) => record.event)).toEqual(["run.start", "run.end"]);
      expect(records[1].seconds).toBe(12.3);
      expect(records[1].phases).toEqual({ plan: 1.2, engine: 10 });

      const summary = summarizeTtsLedger(records);
      expect(summary.runs).toHaveLength(1);
      expect(summary.runs[0]).toMatchObject({
        runId: "r-a",
        sessionId: "s-a",
        provider: "fake",
        status: "ok",
        seconds: 12.3,
      });
      expect(summary.runs[0].kernel.synthSec).toBe(9.876);
      expect(summary.runs[0].kernel.queuedSec).toBe(UNKNOWN);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is fail-open: an unwritable path reports once and never throws", () => {
    const dir = tempDir();
    try {
      // A regular file where the directory should be makes mkdir/append fail.
      const brokenDir = join(dir, "not-a-dir");
      writeFileSync(brokenDir, "x");
      const onError = vi.fn();
      const ledger = openTtsLedger({ dir: brokenDir, onError });
      expect(ledger.runStart({ runId: "r" })).toBe(false);
      expect(ledger.runEnd({ runId: "r" })).toBe(false);
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the session filename when asked", () => {
    const dir = tempDir();
    try {
      const ledger = openTtsLedger({ dir, file: SESSIONS_FILENAME });
      ledger.sessionStart({ sessionId: "s", provider: "fake" });
      expect(ledger.path.endsWith(SESSIONS_FILENAME)).toBe(true);
      expect(readTtsLedger(ledger.path).records).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readTtsLedger", () => {
  it("counts corrupt lines and tolerates a missing file", () => {
    const dir = tempDir();
    try {
      const path = join(dir, "tts-ledger.jsonl");
      writeFileSync(
        path,
        `${JSON.stringify({ v: 1, ts: "2026-11-28T00:00:00.000Z", event: "run.start" })}\n` +
          "not json\n" +
          `${JSON.stringify({ v: 1, ts: "2026-11-28T00:00:01.000Z", noEvent: true })}\n`,
      );
      const result = readTtsLedger(path);
      expect(result.records).toHaveLength(1);
      expect(result.skipped).toBe(2);
      expect(readTtsLedger(join(dir, "absent.jsonl")).missing).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("summarizeTtsLedger", () => {
  it("shows N packs sharing one session, and per-provider totals", () => {
    const dir = tempDir();
    try {
      const ledger = openTtsLedger({ dir, file: SESSIONS_FILENAME });
      ledger.sessionStart({ sessionId: "sess-1", provider: "kaggle", contents: ["a", "b"] });
      for (let index = 0; index < 3; index += 1) {
        ledger.sessionPack({
          sessionId: "sess-1",
          runId: `r-${index}`,
          batchIndex: index + 1,
          status: "ok",
          seconds: 60,
        });
      }
      ledger.sessionEnd({
        sessionId: "sess-1",
        provider: "kaggle",
        packs: 3,
        ok: true,
        seconds: 180,
      });

      const records = readTtsLedger(ledger.path).records;
      const summary = summarizeTtsLedger(records);
      expect(summary.sessions).toHaveLength(1);
      expect(summary.sessions[0]).toMatchObject({
        sessionId: "sess-1",
        packs: 3,
        status: "ok",
      });
      expect(summary.sessions[0].runIds.sort()).toEqual(["r-0", "r-1", "r-2"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("filters by run, provider and date", () => {
    const records = [
      {
        event: "run.end",
        ts: "2026-11-27T10:00:00.000Z",
        runId: "r-old",
        provider: "kaggle",
        status: "ok",
        seconds: 10,
      },
      {
        event: "run.end",
        ts: "2026-11-28T10:00:00.000Z",
        runId: "r-new",
        provider: "mlx",
        status: "ok",
        seconds: 20,
      },
    ];
    expect(filterTtsLedger(records, { runId: "r-new" }).map((r) => r.runId)).toEqual(["r-new"]);
    expect(filterTtsLedger(records, { provider: "kaggle" }).map((r) => r.runId)).toEqual(["r-old"]);
    expect(filterTtsLedger(records, { since: "2026-11-28" }).map((r) => r.runId)).toEqual([
      "r-new",
    ]);
    expect(filterTtsLedger(records, { until: "2026-11-27" }).map((r) => r.runId)).toEqual([
      "r-old",
    ]);
  });

  it("keeps unknown quota as unknown instead of inventing numbers", () => {
    const records = [
      {
        event: "run.end",
        ts: "2026-11-28T10:00:00.000Z",
        runId: "r-1",
        provider: "kaggle",
        status: "ok",
        seconds: 60,
        kernel: { queuedSec: 120, synthSec: 200, runningSec: 400 },
        quota: { kaggleWeekly: UNKNOWN, modalMonthly: UNKNOWN },
      },
    ];
    const summary = summarizeTtsLedger(records);
    expect(summary.providers[0]).toMatchObject({
      provider: "kaggle",
      runs: 1,
      ok: 1,
      synthSec: 200,
      queuedSec: 120,
      runningSec: 400,
    });
  });
});
