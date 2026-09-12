/**
 * Tests for Kaggle kernel queue-aware polling (#250).
 *
 * Behaviour under test (issue #250 + review comment 2026-09-11):
 *  - kernel status is explicitly classified into QUEUED / RUNNING / terminal
 *    phases instead of one undifferentiated "running..." line;
 *  - queue wait is metered against its own timeout (default 40min, env
 *    COSYVOICE3_KAGGLE_QUEUE_TIMEOUT_MS) — separate from the RUNNING budget
 *    (COSYVOICE3_KAGGLE_TIMEOUT_MS, 20min);
 *  - a non-zero CLI exit (e.g. 404 while QUEUED) is NOT misread as a kernel
 *    crash — the poll keeps waiting (review note on #250);
 *  - exceeding the queue budget fails closed with an explicit manual-decision
 *    error — no automatic fallback to F5 (ADR-0019 quality red line);
 *  - each poll writes a poll-status.json state file for background visibility.
 *
 * All tests use mock kernel statuses via injected deps — no real Kaggle calls.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { classifyKernelStatus, pollKernelStatus } from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";

/** Build mock deps: a script of `kaggle kernels status` outputs on a fake clock. */
function makeMockDeps(outputs, { interval = 1000 } = {}) {
  let t = 0;
  const lines = [];
  return {
    deps: {
      exec: async () => {
        const raw = outputs.shift();
        if (raw === undefined) throw new Error("mock exhausted: more polls than scripted outputs");
        if (raw instanceof Error) throw raw;
        return { stdout: raw };
      },
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
      log: (msg) => lines.push(msg),
    },
    clock: () => t,
    logs: lines,
  };
}

describe("classifyKernelStatus", () => {
  it("maps kaggle CLI status lines to phases", () => {
    expect(classifyKernelStatus("cosyvoice3-cuda-batch complete: 2026-09-11 10:00:00")).toBe("complete");
    expect(classifyKernelStatus("cosyvoice3-cuda-batch running: 2026-09-11 10:00:00")).toBe("running");
    expect(classifyKernelStatus("cosyvoice3-cuda-batch queued: position 1")).toBe("queued");
    expect(classifyKernelStatus("cosyvoice3-cuda-batch error: OOM")).toBe("error");
    expect(classifyKernelStatus("cosyvoice3-cuda-batch cancelAcknowledged: user cancel")).toBe("cancel");
  });

  it("maps empty/garbage output to unknown (never silently terminal)", () => {
    expect(classifyKernelStatus("")).toBe("unknown");
    expect(classifyKernelStatus(null)).toBe("unknown");
  });
});

describe("pollKernelStatus — phase tracking", () => {
  it("distinguishes QUEUED from RUNNING in logs and returns per-phase metering", async () => {
    const { deps, logs } = makeMockDeps([
      "k queued: position 1",
      "k queued: position 1",
      "k running: 2026-09-11",
      "k running: 2026-09-11",
      "k complete: done",
    ]);
    const result = await pollKernelStatus("u/k", { pollIntervalMs: 1000 }, deps);
    expect(result).toEqual({ queuedMs: 2000, runningMs: 2000 });
    expect(logs.some((l) => l.includes("QUEUED"))).toBe(true);
    expect(logs.some((l) => l.includes("RUNNING"))).toBe(true);
  });

  it("keeps polling when the CLI exits non-zero (404 while QUEUED) instead of crashing", async () => {
    const fail = Object.assign(new Error("Command failed"), { stdout: "404 Client Error: Not Found" });
    const { deps, logs } = makeMockDeps([
      fail,
      fail,
      "k complete: done",
    ]);
    const result = await pollKernelStatus("u/k", {}, deps);
    expect(result.queuedMs).toBeGreaterThanOrEqual(0);
    expect(logs.some((l) => l.includes("UNKNOWN"))).toBe(true);
  });

  it("throws the execution-failed error on kernel error status", async () => {
    const { deps } = makeMockDeps(["k error: OOM on P100"]);
    await expect(pollKernelStatus("u/k", {}, deps)).rejects.toThrow(/Kaggle kernel failed/);
  });
});

describe("pollKernelStatus — queue timeout is separate from run timeout", () => {
  it("fails closed with manual-decision error when queued past the queue budget", async () => {
    const queued = "k queued: position 1";
    const { deps } = makeMockDeps(Array(20).fill(queued));
    await expect(
      pollKernelStatus("u/k", { queueTimeoutMs: 5000, pollIntervalMs: 1000 }, deps),
    ).rejects.toThrow(/queue timeout.*NOT auto-falling back/s);
  });

  it("run timeout only counts RUNNING time, not queue wait", async () => {
    const outputs = ["k queued: p", "k running: now"];
    const { deps } = makeMockDeps(outputs.concat(Array(10).fill("k running: now")));
    await expect(
      pollKernelStatus(
        "u/k",
        { queueTimeoutMs: 60000, runTimeoutMs: 3000, pollIntervalMs: 1000 },
        deps,
      ),
    ).rejects.toThrow(/timed out.*RUNNING/s);
  });

  it("a long queue does not trip the run timeout (15min queue + run within budget survives)", async () => {
    const { deps } = makeMockDeps([
      "k queued: p",
      "k queued: p",
      "k running: now",
      "k complete: done",
    ]);
    const result = await pollKernelStatus(
      "u/k",
      { queueTimeoutMs: 60000, runTimeoutMs: 3000, pollIntervalMs: 1000 },
      deps,
    );
    expect(result.queuedMs).toBe(2000);
    expect(result.runningMs).toBe(1000);
  });
});

describe("pollKernelStatus — status file visibility", () => {
  it("writes poll-status.json with the current phase and metering", async () => {
    const statusFile = join(tmpdir(), `tts-kaggle-poll-test-${process.pid}-${Date.now()}.json`);
    const { deps } = makeMockDeps([
      "k queued: p",
      "k running: now",
      "k complete: done",
    ]);
    await pollKernelStatus("u/k", { statusFile, pollIntervalMs: 1000 }, deps);
    const state = JSON.parse(readFileSync(statusFile, "utf8"));
    expect(state.kernelId).toBe("u/k");
    expect(state.phase).toBe("complete");
    expect(typeof state.queuedMs).toBe("number");
    expect(typeof state.runningMs).toBe("number");
    expect(state.updatedAt).toBeTruthy();
  });
});
