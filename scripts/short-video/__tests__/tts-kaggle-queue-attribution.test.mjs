/**
 * Tests for the Kaggle queue black-box fixes (#1354).
 *
 * Three behaviours used to be missing:
 *  - no pre-push slot check: a retry re-pushed the same slug while its previous
 *    version was still RUNNING/QUEUED, stacking another version in the queue;
 *  - a queue timeout asserted "Another kernel holds Kaggle's single free-tier
 *    GPU session" from the lone fact that OUR kernel was QUEUED — a fabricated
 *    cause that was copied into the run profile;
 *  - the kernel had no whole-script wall-clock budget, so a setup hang could
 *    hold the only GPU session until Kaggle's 9-12h cap.
 *
 * These tests pin the classification and the evidence file, and assert the
 * error no longer states a cause Kaggle never returned. No real Kaggle calls.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  classifyQueueCause,
  collectQueueAttribution,
  createCosyVoice3KaggleCudaEngine,
  formatKernelTimeoutError,
  parseKaggleTimestamp,
  parseKernelList,
  parseKernelLogProgress,
  parseKernelPushVersion,
  pollKernelStatus,
  preflightKernelSlot,
} from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";
import { wavBytes } from "./fixtures/wav-fixture.mjs";

const NOW = Date.parse("2026-11-16T00:00:00.000Z");
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const ORIGINAL_KAGGLE_USER = process.env.COSYVOICE3_KAGGLE_USER;

afterEach(() => {
  if (ORIGINAL_KAGGLE_USER === undefined) delete process.env.COSYVOICE3_KAGGLE_USER;
  else process.env.COSYVOICE3_KAGGLE_USER = ORIGINAL_KAGGLE_USER;
});

/**
 * Route the three CLI families the precheck/attribution use.
 *
 * `statuses[ref]` may be a string, an Error (non-zero exit with stdout), or a
 * script array consumed one call at a time.
 */
function makeCli({ list = "[]", statuses = {}, logs = {} } = {}) {
  const commands = [];
  const exec = async (cmd) => {
    commands.push(cmd);
    if (cmd.includes("kaggle kernels list")) {
      if (list instanceof Error) throw list;
      return { stdout: list };
    }
    const statusMatch = cmd.match(/kaggle kernels status (\S+)/);
    if (statusMatch) {
      const ref = statusMatch[1].toLowerCase();
      const value = statuses[ref];
      if (value === undefined) {
        throw Object.assign(new Error("Command failed: kaggle kernels status"), {
          stdout: `Cannot access kernel '${ref}' (Permission 'kernels.get' was denied).`,
        });
      }
      const next = Array.isArray(value) ? value.shift() : value;
      if (next instanceof Error) throw next;
      return { stdout: next };
    }
    const logMatch = cmd.match(/kaggle kernels logs (\S+)/);
    if (logMatch) {
      const ref = logMatch[1].toLowerCase();
      const value = logs[ref];
      if (value === undefined) {
        throw Object.assign(new Error("Command failed: kaggle kernels logs"), {
          stdout: `Cannot access kernel '${ref}' (Permission 'kernels.get' was denied).`,
        });
      }
      return { stdout: value };
    }
    return { stdout: "" };
  };
  // The production probes use execFile so a kernel ref is never shell-parsed;
  // tests route argv through the same string router for readability.
  const execFile = async (file, args, opts) => exec([file, ...args].join(" "), opts);
  return { exec, execFile, commands };
}

function makeClock() {
  let t = 0;
  return {
    deps: {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    },
    clock: () => t,
  };
}

describe("kernel CLI parsing (#1354)", () => {
  it("parses the JSON list after the CLI warning line", () => {
    const raw = `Warning: Looks like you're using an outdated kaggle version\n[\n  {"ref":"xpabloli/a","title":"a","lastRunTime":"2026-11-15T01:00:04.977000"}\n]`;
    expect(parseKernelList(raw)).toEqual([
      {
        ref: "xpabloli/a",
        title: "a",
        lastRunTime: "2026-11-15T01:00:04.977000",
      },
    ]);
    expect(parseKernelList("Warning only, no payload")).toEqual([]);
  });

  it("reads Kaggle's zone-less lastRunTime as UTC, not as host-local time", () => {
    expect(parseKaggleTimestamp("2026-11-15T01:00:04.977000")).toBe(
      Date.parse("2026-11-15T01:00:04.977Z"),
    );
    expect(parseKaggleTimestamp("2026-11-15T01:00:04.977Z")).toBe(
      Date.parse("2026-11-15T01:00:04.977Z"),
    );
    expect(Number.isNaN(parseKaggleTimestamp(""))).toBe(true);
  });

  it("reads the pushed kernel version from the CLI success line", () => {
    expect(
      parseKernelPushVersion(
        "Kernel version 42 successfully pushed.  Please check progress at https://kaggle.com/code/x/y",
      ),
    ).toBe(42);
    expect(parseKernelPushVersion("Kernel push error: quota exceeded")).toBeNull();
  });

  it("reads log clock and the newest heartbeat from the streamed JSON array", () => {
    const raw = `Warning: old CLI
[{"stream_name":"stdout","time":1.4,"data":"=== Kaggle CosyVoice3 CUDA Batch TTS ===\\n"}
,{"stream_name":"stdout","time":400.5,"data":"KERNEL_HEARTBEAT phase=model elapsed=400s\\n"}
,{"stream_name":"stdout","time":401.2,"data":"localised weights\\n"}]`;
    expect(parseKernelLogProgress(raw)).toEqual({
      lastLogSeconds: 401.2,
      lastHeartbeat: { phase: "model", elapsedSec: 400, logSeconds: 400.5 },
      lastLine: "localised weights",
    });
  });

  it("falls back to a line scan when the log payload is truncated", () => {
    const raw = "garbage\nKERNEL_HEARTBEAT phase=inference elapsed=612s\n";
    expect(parseKernelLogProgress(raw).lastHeartbeat).toEqual({
      phase: "inference",
      elapsedSec: 612,
      logSeconds: null,
    });
  });
});

describe("preflightKernelSlot — never stack a version behind a live slug (#1354)", () => {
  it("waits for the same slug to finish, then proceeds", async () => {
    const { execFile, commands } = makeCli({
      list: JSON.stringify([{ ref: "xpabloli/k", lastRunTime: iso(60_000) }]),
      statuses: {
        "xpabloli/k": ["k running: now", "k complete: done", "k complete: done"],
      },
    });
    const { deps, clock } = makeClock();
    const logs = [];
    const result = await preflightKernelSlot(
      "xpabloli/k",
      { waitBudgetMs: 5000, pollIntervalMs: 1000 },
      { execFile, ...deps, log: (msg) => logs.push(msg) },
    );
    expect(result.waitedMs).toBe(1000);
    expect(clock()).toBe(1000);
    expect(result.target.phase).toBe("complete");
    expect(logs.some((l) => l.includes("waiting up to 0m5s"))).toBe(true);
    expect(logs.some((l) => l.includes("safe to push"))).toBe(true);
    // The target was never pushed from inside the precheck.
    expect(commands.some((c) => c.includes("kaggle kernels push"))).toBe(false);
  });

  it("fails closed after the wait budget when the same slug is still RUNNING", async () => {
    const { execFile, commands } = makeCli({
      list: JSON.stringify([{ ref: "xpabloli/k", lastRunTime: iso(60_000) }]),
      statuses: { "xpabloli/k": "k running: now" },
    });
    const { deps } = makeClock();
    await expect(
      preflightKernelSlot(
        "xpabloli/k",
        { waitBudgetMs: 3000, pollIntervalMs: 1000 },
        { execFile, ...deps, log: () => {} },
      ),
    ).rejects.toThrow(
      /still RUNNING[\s\S]*Not pushing[\s\S]*stack[\s\S]*queue budget was not consumed/,
    );
    expect(commands.some((c) => c.includes("kaggle kernels push"))).toBe(false);
  });

  it("keeps waiting (and fails closed) when the status probe dies mid-wait", async () => {
    const probeError = Object.assign(new Error("Command failed"), {
      stdout: "504 Gateway Timeout",
    });
    const { execFile } = makeCli({
      list: JSON.stringify([{ ref: "xpabloli/k", lastRunTime: iso(60_000) }]),
      statuses: {
        "xpabloli/k": ["k running: now", probeError, probeError, probeError],
      },
    });
    const { deps } = makeClock();
    await expect(
      preflightKernelSlot(
        "xpabloli/k",
        { waitBudgetMs: 3000, pollIntervalMs: 1000 },
        { execFile, ...deps, log: () => {} },
      ),
    ).rejects.toThrow(/still RUNNING[\s\S]*Not pushing/);
  });

  it("refuses to push when an existing slug's status is unreadable", async () => {
    const probeError = Object.assign(new Error("Command failed"), {
      stdout: "504 Gateway Timeout",
    });
    const { execFile, commands } = makeCli({
      list: JSON.stringify([{ ref: "xpabloli/k", lastRunTime: iso(60_000) }]),
      statuses: { "xpabloli/k": [probeError, probeError] },
    });
    const { deps } = makeClock();
    await expect(
      preflightKernelSlot(
        "xpabloli/k",
        { waitBudgetMs: 3000, pollIntervalMs: 1000 },
        { execFile, ...deps, log: () => {} },
      ),
    ).rejects.toThrow(/could not be read after 2 probes[\s\S]*Refusing to push/);
    expect(commands.some((c) => c.includes("kaggle kernels push"))).toBe(false);
  });

  it("still pushes a fresh slug whose status probe 404s", async () => {
    const { execFile } = makeCli({ list: "[]" });
    const result = await preflightKernelSlot(
      "xpabloli/brand-new",
      {},
      { execFile, now: () => NOW, sleep: async () => {}, log: () => {} },
    );
    expect(result.target.phase).toBe("unknown");
    expect(result.target.listed).toBe(false);
  });

  it("warns (but does not wait) when another own kernel holds the slot", async () => {
    const { execFile } = makeCli({
      list: JSON.stringify([
        { ref: "xpabloli/k", lastRunTime: iso(60_000) },
        { ref: "xpabloli/other", lastRunTime: iso(120_000) },
      ]),
      statuses: {
        "xpabloli/k": "k complete: done",
        "xpabloli/other": "k running: now",
      },
    });
    const logs = [];
    const result = await preflightKernelSlot(
      "xpabloli/k",
      {},
      { execFile, now: () => NOW, sleep: async () => {}, log: (msg) => logs.push(msg) },
    );
    expect(result.waitedMs).toBe(0);
    expect(result.holders.map((h) => h.ref)).toContain("xpabloli/other");
    expect(logs.some((l) => l.includes("own kernel xpabloli/other is RUNNING"))).toBe(true);
  });

  it("is fail-open when the list/status probes cannot answer", async () => {
    const { execFile } = makeCli({
      list: Object.assign(new Error("network down"), { stdout: "network down" }),
    });
    const logs = [];
    const result = await preflightKernelSlot(
      "xpabloli/k",
      {},
      { execFile, now: () => NOW, sleep: async () => {}, log: (msg) => logs.push(msg) },
    );
    expect(result.target.phase).toBe("unknown");
    expect(result.listOk).toBe(false);
    expect(logs.some((l) => l.includes("list unavailable"))).toBe(true);
  });
});

describe("queue attribution — classify from evidence, not from our own status (#1354)", () => {
  it("classifies platform congestion when no own kernel is active", async () => {
    const { execFile } = makeCli({
      list: "[]",
      statuses: { "xpabloli/k": "k queued: position 1" },
    });
    const attribution = await collectQueueAttribution({
      kernelId: "xpabloli/k",
      timeoutKind: "queue",
      target: { phase: "queued", queuedMs: 2_400_000, runningMs: 0 },
      execFile,
      now: () => NOW,
      stuckWindowMs: 1_200_000,
    });
    expect(attribution.conclusion.cause).toBe("congestion");
    expect(attribution.conclusion.confidence).toBe("inferred");
    expect(attribution.ownKernels).toHaveLength(1);
    expect(attribution.ownKernels[0].phase).toBe("queued");
    expect(attribution.limits).toContain("no queue reason");
  });

  it("classifies a RUNNING own kernel with a stale log as stuck", async () => {
    const { execFile } = makeCli({
      list: JSON.stringify([
        { ref: "xpabloli/k", lastRunTime: iso(60_000) },
        { ref: "xpabloli/other", lastRunTime: iso(3_600_000) },
      ]),
      statuses: {
        "xpabloli/k": "k queued: position 1",
        "xpabloli/other": "k running: now",
      },
      logs: {
        "xpabloli/other": JSON.stringify([
          {
            stream_name: "stdout",
            time: 400,
            data: "KERNEL_HEARTBEAT phase=model elapsed=400s\n",
          },
          { stream_name: "stdout", time: 401, data: "still loading\n" },
        ]),
      },
    });
    const attribution = await collectQueueAttribution({
      kernelId: "xpabloli/k",
      timeoutKind: "queue",
      target: { phase: "queued", queuedMs: 2_400_000, runningMs: 0 },
      execFile,
      now: () => NOW,
      recentWindowMs: 24 * 60 * 60 * 1000,
      stuckWindowMs: 20 * 60 * 1000,
    });
    expect(attribution.conclusion.cause).toBe("stuck");
    expect(attribution.conclusion.confidence).toBe("inferred");
    expect(attribution.conclusion.reasons.join(" ")).toContain("no log progress");
    expect(
      attribution.ownKernels.find((k) => k.ref === "xpabloli/other").stalenessMs,
    ).toBeGreaterThan(20 * 60 * 1000);
  });

  it("classifies a quota error printed by the CLI as the cause", async () => {
    const { execFile } = makeCli({
      list: "[]",
      statuses: {
        "xpabloli/k": Object.assign(new Error("Command failed"), {
          stdout: "GPU quota exceeded for this week",
        }),
      },
    });
    const attribution = await collectQueueAttribution({
      kernelId: "xpabloli/k",
      timeoutKind: "queue",
      target: { phase: "queued", queuedMs: 2_400_000, runningMs: 0 },
      execFile,
      now: () => NOW,
    });
    expect(attribution.conclusion.cause).toBe("quota");
    expect(attribution.conclusion.reasons.join(" ")).toContain("quota");
  });

  it("does not call a RUNNING kernel stuck while its logs are advancing", async () => {
    const { execFile } = makeCli({
      list: JSON.stringify([{ ref: "xpabloli/k", lastRunTime: iso(1_800_000) }]),
      statuses: { "xpabloli/k": "k running: now" },
      logs: {
        "xpabloli/k": JSON.stringify([
          { stream_name: "stdout", time: 1700, data: "scene 3 of 8\n" },
        ]),
      },
    });
    const attribution = await collectQueueAttribution({
      kernelId: "xpabloli/k",
      timeoutKind: "run",
      target: { phase: "running", queuedMs: 0, runningMs: 1_800_000 },
      execFile,
      now: () => NOW,
      stuckWindowMs: 20 * 60 * 1000,
    });
    expect(attribution.conclusion.cause).toBe("slow");
    expect(attribution.conclusion.confidence).toBe("observed");
  });

  it("classifies a run timeout from the target's logs, not another kernel's stall", () => {
    const result = classifyQueueCause({
      timeoutKind: "run",
      kernelId: "u/k",
      target: { phase: "running" },
      targetEvidence: {
        ref: "u/k",
        stalenessMs: 60_000,
        log: { lastLogSeconds: 1740, lastHeartbeat: null },
      },
      stuck: [
        {
          ref: "u/other",
          stalenessMs: 1_500_000,
          log: { lastLogSeconds: 300, lastHeartbeat: null },
        },
      ],
      stuckWindowMs: 20 * 60 * 1000,
    });
    expect(result.cause).toBe("slow");
    expect(result.confidence).toBe("observed");
  });

  it("does not claim congestion when the status probes never answered", () => {
    expect(
      classifyQueueCause({
        timeoutKind: "queue",
        kernelId: "u/k",
        target: { phase: "unknown" },
      }),
    ).toMatchObject({ cause: "unknown", confidence: "unknown" });
  });

  it("classifyQueueCause ranks quota over stuck and congestion", () => {
    expect(
      classifyQueueCause({
        timeoutKind: "queue",
        kernelId: "u/k",
        target: { phase: "queued" },
        quotaSignal: { text: "weekly GPU quota exhausted" },
        stuck: [{ ref: "u/other", stalenessMs: 3_600_000 }],
        activeOthers: [{ ref: "u/other", phase: "running" }],
      }).cause,
    ).toBe("quota");
  });
});

describe("pollKernelStatus — timeout writes evidence and uses it (#1354)", () => {
  it("writes the attribution file and phrases the queue error from it", async () => {
    const dir = join(tmpdir(), `tts-kaggle-attribution-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const attributionFile = join(dir, "kaggle-queue-attribution.json");
    let t = 0;
    const { exec, execFile } = makeCli({
      list: "[]",
      statuses: { "u/k": "k queued: position 1" },
    });
    try {
      await expect(
        pollKernelStatus(
          "u/k",
          {
            queueTimeoutMs: 5000,
            pollIntervalMs: 1000,
            attributionFile,
            runTimeoutMs: 60000,
          },
          {
            exec,
            execFile,
            now: () => t,
            sleep: async (ms) => {
              t += ms;
            },
            log: () => {},
          },
        ),
      ).rejects.toThrow(
        /Cause: congestion \(inferred\)[\s\S]*evidence: .*kaggle-queue-attribution\.json/,
      );
      const evidence = JSON.parse(readFileSync(attributionFile, "utf-8"));
      expect(evidence.kernelId).toBe("u/k");
      expect(evidence.timeoutKind).toBe("queue");
      expect(evidence.conclusion.cause).toBe("congestion");
      expect(evidence.target.phase).toBe("queued");
      expect(evidence.ownKernels).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("timeout error text (#1354)", () => {
  const attribution = {
    target: { phase: "queued", queuedMs: 2_400_000, runningMs: 0 },
    attempt: {
      version: 7,
      pushedAt: "2026-11-16T00:00:00.000Z",
      queueStartedAt: "2026-11-16T00:00:00.000Z",
    },
    conclusion: {
      cause: "congestion",
      confidence: "inferred",
      reasons: [
        "target u/k stayed QUEUED for the whole queue budget and no own kernel is RUNNING or QUEUED",
      ],
    },
    limits: "Kaggle exposes no queue reason, queue position, or remaining quota.",
  };

  it("names the evidence file and cause, and never repeats the fabricated holder", () => {
    const message = formatKernelTimeoutError({
      timeoutKind: "queue",
      kernelId: "u/k",
      queuedMs: 2_400_000,
      attribution,
      attributionFile: "/tmp/kaggle-queue-attribution.json",
    });
    expect(message).toContain("exceeded queue timeout (40min)");
    expect(message).toContain("Cause: congestion (inferred)");
    expect(message).toContain("evidence: /tmp/kaggle-queue-attribution.json");
    expect(message).toContain("NOT auto-falling back");
    expect(message).toContain("kernel version 7");
    expect(message).not.toContain("Another kernel holds");
  });

  it("tells the operator not to re-push a RUNNING kernel", () => {
    const message = formatKernelTimeoutError({
      timeoutKind: "run",
      kernelId: "u/k",
      ranMs: 1_800_000,
      attribution: {
        ...attribution,
        conclusion: { cause: "slow", confidence: "observed", reasons: ["still logging"] },
      },
      attributionFile: "/tmp/e.json",
    });
    expect(message).toContain("of RUNNING");
    expect(message).toContain("Do NOT re-push blindly");
    expect(message).toContain("kaggle kernels output u/k");
  });
});

describe("engine wiring — precheck before push and evidence to the poller (#1354)", () => {
  it("does not push when the precheck refuses the slot", async () => {
    process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
    const outDir = join(tmpdir(), `tts-kaggle-slot-${process.pid}-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    const refAudioPath = join(outDir, "voice-sample-24k.wav");
    writeFileSync(refAudioPath, wavBytes("ref"));
    const commands = [];
    const engine = await createCosyVoice3KaggleCudaEngine({
      refAudioPath,
      exec: async (cmd) => {
        commands.push(cmd);
        return { stdout: "" };
      },
      preflight: async () => {
        throw new Error("slot busy: own kernel still RUNNING");
      },
      poll: async () => {
        throw new Error("poll must not run");
      },
      postProcess: async () => ({ duration: 1 }),
    });
    expect(engine).not.toBeNull();
    try {
      await expect(
        engine.generate([{ id: 1, voiceover: "Hook line.", visualType: "hook" }], outDir),
      ).rejects.toThrow(/slot busy/);
      expect(commands.some((c) => c.includes("kaggle kernels push"))).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("passes the attribution file and attempt to the poller", async () => {
    process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
    const outDir = join(tmpdir(), `tts-kaggle-evidence-${process.pid}-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    const refAudioPath = join(outDir, "voice-sample-24k.wav");
    writeFileSync(refAudioPath, wavBytes("ref"));
    const scenes = [{ id: 1, voiceover: "Hook line.", visualType: "hook" }];
    const pollCalls = [];
    const engine = await createCosyVoice3KaggleCudaEngine({
      refAudioPath,
      exec: async (cmd) => {
        if (cmd.includes("kaggle kernels push")) {
          return { stdout: "Kernel version 7 successfully pushed.  Please check progress at x" };
        }
        if (cmd.includes("kaggle kernels output")) {
          const dir = cmd.match(/-p "([^"]+)"/)[1];
          const kernelDir = join(dir, "..", "..");
          const requestId = readFileSync(
            join(kernelDir, "cosyvoice3_cuda_kernel.py"),
            "utf-8",
          ).match(/REQUEST_ID = r'''(.*?)'''/s)[1];
          mkdirSync(join(dir, "output"), { recursive: true });
          writeFileSync(
            join(dir, "output", "summary.json"),
            JSON.stringify({
              requestId,
              segments: [{ sceneId: 1, output: "scene-1.wav", error: null }],
            }),
          );
          writeFileSync(join(dir, "output", "scene-1.wav"), wavBytes("scene-1"));
        }
        return { stdout: "" };
      },
      preflight: async () => ({
        waitedMs: 0,
        target: { phase: "unknown", listed: false },
        holders: [],
        probes: [],
        listOk: true,
        listError: null,
      }),
      poll: async (kernelId, opts) => {
        pollCalls.push({ kernelId, opts });
        return { queuedMs: 0, runningMs: 0 };
      },
      postProcess: async () => ({ duration: 3.0 }),
    });
    expect(engine).not.toBeNull();
    try {
      await engine.generate(scenes, outDir);
      expect(pollCalls).toHaveLength(1);
      expect(pollCalls[0].opts.attributionFile).toMatch(/kaggle-queue-attribution\.json$/);
      expect(pollCalls[0].opts.attempt).toMatchObject({
        version: 7,
        requestId: expect.any(String),
      });
      const runEvidence = JSON.parse(
        readFileSync(join(outDir, ".kaggle-kernel", "kaggle-run-evidence.json"), "utf-8"),
      );
      expect(runEvidence.version).toBe(7);
      expect(runEvidence.kernelId).toMatch(/test-kaggle-user/);
      expect(runEvidence.preflight).toBeTruthy();
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
