/**
 * Tests for status-probe hardening (#808).
 *
 * The bug: `kaggle kernels status` has no HTTP timeout anywhere in its stack
 * (kaggle 2.2.4 -> kagglesdk `KaggleHttpClient.call()` -> `Session.send()` with
 * a kwargs dict built by `merge_environment_settings`, which carries no
 * `timeout`), and `promisify(exec)` adds none either. A half-open connection
 * therefore parks `await exec(...)` forever: the poll loop never iterates
 * again, the log goes completely silent, and a COMPLETE kernel is never
 * collected. Observed 2026-10-20 on run `deepseek-v41-flash-1017`.
 *
 * Behaviour under test:
 *  - every probe is exec-time-boxed, and dies with SIGKILL;
 *  - a dead probe keeps the last known phase, so RUNNING metering and the run
 *    budget keep accruing instead of restarting a bogus queue wait;
 *  - a dead probe is announced (silence was the whole symptom) and recorded in
 *    poll-status.json;
 *  - dead probes are metered; past the budget the run fails closed and says
 *    how to collect the takes by hand instead of inviting a paid re-run;
 *  - instant CLI errors (~1s, e.g. 404 while QUEUED) do NOT consume that
 *    budget, so the historical "keep polling" behaviour is preserved.
 *
 * All statuses are mocked through the injected exec seam — no real Kaggle calls.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pollKernelStatus } from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";

/** A probe attempt is either a status line, an instant CLI error, or a hang. */
const ok = (raw) => ({ kind: "ok", raw });
const cliError = (raw) => ({ kind: "error", raw });
const hang = () => ({ kind: "timeout" });

/**
 * Mock deps on a fake clock. A probe that "times out" advances the clock by
 * `probeCost` — that is the wall-clock a killed child really burns, and it is
 * what the dead-probe budget must be metered with.
 */
function makeProbeDeps(script, { probeCost = 60000, callCost = 1000 } = {}) {
  let t = 0;
  const logs = [];
  const calls = [];
  return {
    deps: {
      exec: async (cmd, opts) => {
        calls.push({ cmd, opts });
        const step = script.shift();
        if (!step) throw new Error("mock exhausted: more polls than scripted outputs");
        if (step.kind === "timeout") {
          t += probeCost;
          throw Object.assign(new Error("Command failed: kaggle kernels status"), {
            killed: true,
            signal: "SIGKILL",
            stdout: "",
          });
        }
        if (step.kind === "error") {
          t += callCost;
          throw Object.assign(new Error("Command failed"), { stdout: step.raw });
        }
        t += callCost;
        return { stdout: step.raw };
      },
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
      log: (msg) => logs.push(msg),
    },
    calls,
    logs,
    clock: () => t,
  };
}

describe("pollKernelStatus — probe timeout (#808)", () => {
  it("time-boxes every status probe by default (60s) and kills it with SIGKILL", async () => {
    const { deps, calls } = makeProbeDeps([ok("k complete: done")]);
    await pollKernelStatus("u/k", { pollIntervalMs: 1000 }, deps);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts).toMatchObject({ timeout: 60000, killSignal: "SIGKILL" });
    expect(calls[0].cmd).toContain("kaggle kernels status u/k");
  });

  it("honours an explicit probe timeout (so the bound is testable/overridable)", async () => {
    const { deps, calls } = makeProbeDeps([ok("k complete: done")]);
    await pollKernelStatus("u/k", { pollIntervalMs: 1000, probeTimeoutMs: 2500 }, deps);
    expect(calls[0].opts.timeout).toBe(2500);
  });

  it("a timed-out probe keeps RUNNING and does not restart the run clock", async () => {
    const { deps, logs } = makeProbeDeps(
      [ok("k running: now"), hang(), ok("k running: now"), ok("k complete: done")],
      { probeCost: 5000 },
    );
    const result = await pollKernelStatus(
      "u/k",
      { pollIntervalMs: 1000, runTimeoutMs: 60000 },
      deps,
    );
    // RUNNING started at t=1000 (the first probe returns at t=1000); the
    // complete at t=11000 ends the stretch. If the dead probe downgraded the
    // phase, runStart would restart at 8000 and this would shrink to 3000.
    expect(result.runningMs).toBe(10000);
    expect(result.queuedMs).toBe(0);
    expect(logs.some((l) => l.includes("status probe failed"))).toBe(true);
    expect(logs.some((l) => l.includes("staying RUNNING"))).toBe(true);
  });

  it("records the probe failure in poll-status.json for post-mortems", async () => {
    const statusFile = join(tmpdir(), `tts-kaggle-probe-${process.pid}-${Date.now()}.json`);
    const { deps } = makeProbeDeps([hang(), ok("k complete: done")]);
    await pollKernelStatus("u/k", { statusFile, pollIntervalMs: 1000, probeTimeoutMs: 5000 }, deps);
    const state = JSON.parse(readFileSync(statusFile, "utf8"));
    expect(state.phase).toBe("complete");
    expect(state.probeFailures).toBe(0); // reset by the usable answer
    expect(state.probeFailureMs).toBe(60000); // but the spent budget stays visible
    expect(state.lastProbeError).toBeTruthy();
  });
});

describe("pollKernelStatus — dead-probe budget fails closed (#808)", () => {
  it("stops instead of hanging forever, and says to collect by hand", async () => {
    const { deps, logs } = makeProbeDeps(Array(10).fill(hang()), { probeCost: 20000 });
    await expect(
      pollKernelStatus(
        "u/k",
        { pollIntervalMs: 1000, probeTimeoutMs: 5000, probeFailureBudgetMs: 30000 },
        deps,
      ),
    ).rejects.toThrow(/without a usable answer[\s\S]*NOT collected[\s\S]*kaggle kernels output/s);
    // It must have said something on the way down — silence was the bug.
    expect(logs.filter((l) => l.includes("status probe failed")).length).toBeGreaterThanOrEqual(2);
  });

  it("names the last known phase so the operator knows whether to wait or collect", async () => {
    const { deps } = makeProbeDeps([ok("k running: now"), ...Array(10).fill(hang())], {
      probeCost: 20000,
    });
    await expect(
      pollKernelStatus(
        "u/k",
        { pollIntervalMs: 1000, probeTimeoutMs: 5000, probeFailureBudgetMs: 30000 },
        deps,
      ),
    ).rejects.toThrow(/Last known phase: RUNNING/);
  });

  it("instant CLI errors (404 while QUEUED) still do not consume the dead-probe budget", async () => {
    // Historical behaviour must survive: a fast non-zero exit is not a hang,
    // and the queue budget (not this new guard) owns that wait.
    const { deps, logs } = makeProbeDeps([
      cliError("404 Client Error: Not Found"),
      cliError("404 Client Error: Not Found"),
      cliError("404 Client Error: Not Found"),
      ok("k complete: done"),
    ]);
    const result = await pollKernelStatus(
      "u/k",
      { pollIntervalMs: 1000, probeFailureBudgetMs: 30000 },
      deps,
    );
    expect(result.runningMs).toBe(0);
    // Three 1s CLI errors plus three 1s sleeps, all metered as QUEUED/UNKNOWN.
    expect(result.queuedMs).toBe(6000);
    expect(logs.some((l) => l.includes("UNKNOWN"))).toBe(true);
  });
});
