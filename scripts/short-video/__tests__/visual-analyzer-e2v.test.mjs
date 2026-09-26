/**
 * Tests for the emotion2vec+ (e2v) subsystem of lib/visual-analyzer.mjs (#361).
 *
 * Mirrors the mock patterns of visual-analyzer.test.mjs: child_process.spawn is
 * mocked, subprocesses are fake EventEmitters with stdin.write spies, timeouts
 * use fake timers. No real Python is ever spawned.
 *
 * Covered lifecycle:
 * - spawn (Python-missing / script-missing branches, generation counter)
 * - health check (ensureE2VProcess reuse + sticky-unavailable)
 * - pending-request resolution (unknown id, error response, malformed JSON,
 *   generation mismatch from a respawned worker)
 * - timeout (kill + generation bump + respawn)
 * - crash/exit handling (pending settled as degraded, respawn)
 * - spawn 'error' event
 * - stderr debug piping
 * - process 'exit' cleanup handler killing the e2v worker
 * - fuseAudioEmotion (pure fusion logic)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter, PassThrough } from "stream";

function createMockProcess() {
  const proc = new EventEmitter();
  proc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.pid = 4321;
  proc.killed = false;
  proc.exitCode = null;
  proc.kill = vi.fn((signal) => {
    proc.killed = true;
  });

  proc.emitStdout = (str) => {
    proc.stdout.push(str);
  };
  proc.emitStderr = (str) => {
    proc.stderr.push(str);
  };
  proc.emitExit = (code = 0, signal = null) => {
    proc.exitCode = code;
    proc.emit("exit", code, signal);
  };

  return proc;
}

let mockSpawn = vi.fn();
let mockProc = null;

vi.mock("child_process", () => ({
  spawn: (...args) => mockSpawn(...args),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  // vlm-model.mjs reads vlm-model.json at import time under the mocked fs.
  readFileSync: vi.fn(
    () => '{"engine": "minicpm", "engines": {"minicpm": {"modelId": "mock-model-id"}}}',
  ),
}));

let visualAnalyzer;

beforeEach(async () => {
  vi.resetModules();
  process.env.VLM_CONCURRENCY = "1";

  mockSpawn = vi.fn();
  mockProc = createMockProcess();
  mockSpawn.mockImplementation(() => mockProc);

  const mod = await import("../lib/visual-analyzer.mjs");
  visualAnalyzer = mod;
});

afterEach(async () => {
  // Ensure real timers are restored before cleanup (timeout tests use fake timers)
  vi.useRealTimers();
  try {
    await visualAnalyzer.closeVisualAnalyzer();
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

/** Echo a response with the requestId from the last stdin write. */
function emitE2VResponse(proc, responseObj) {
  const writtenData = proc.stdin.write.mock.calls.at(-1)?.[0]?.toString();
  if (!writtenData) throw new Error("No stdin write found");
  const request = JSON.parse(writtenData.trim());
  proc.emitStdout(JSON.stringify({ ...responseObj, requestId: request.requestId }) + "\n");
}

const DEGRADED_E2V = { labels: [], scores: [], topLabel: null, topScore: null };

describe("analyzeAssetEmotion — spawn + normal path", () => {
  it("spawns the emotion2vec subprocess and resolves the ok response", async () => {
    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = mockSpawn.mock.calls[0];
    expect(String(args[0])).toContain("emotion2vec_plugin.py");
    expect(opts.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(bin).toBeDefined();

    mockProc.emitStdout(
      JSON.stringify({
        requestId: JSON.parse(mockProc.stdin.write.mock.calls[0][0].toString().trim()).requestId,
        labels: ["中立/neutral", "开心/happy"],
        scores: [0.7, 0.2],
        topLabel: "中立/neutral",
        topScore: 0.7,
      }) + "\n",
    );

    const result = await promise;
    expect(result.topLabel).toBe("中立/neutral");
    expect(result.topScore).toBe(0.7);
    expect(result.labels).toEqual(["中立/neutral", "开心/happy"]);
  });

  it("sends analyze_emotion action with the asset path", async () => {
    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    const request = JSON.parse(mockProc.stdin.write.mock.calls[0][0].toString().trim());
    expect(request.action).toBe("analyze_emotion");
    expect(request.path).toBe("/abs/audio.wav");
    expect(request.requestId).toBeDefined();

    emitE2VResponse(mockProc, { ...DEGRADED_E2V });
    await promise;
  });

  it("reuses the running worker for subsequent calls (no re-spawn)", async () => {
    const p1 = visualAnalyzer.analyzeAssetEmotion("/abs/a.wav");
    await new Promise((r) => setTimeout(r, 10));
    emitE2VResponse(mockProc, { ...DEGRADED_E2V, topLabel: "first" });
    await p1;

    const p2 = visualAnalyzer.analyzeAssetEmotion("/abs/b.wav");
    await new Promise((r) => setTimeout(r, 10));
    emitE2VResponse(mockProc, { ...DEGRADED_E2V, topLabel: "second" });
    await p2;

    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});

describe("analyzeAssetEmotion — dependency-missing branches", () => {
  it("returns degraded without spawning when the Python binary is missing", async () => {
    const { existsSync } = await import("fs");
    existsSync.mockReturnValue(false);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");

    expect(result).toEqual(DEGRADED_E2V);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Python not found"));

    // Sticky: e2vAvailable=false means later calls also skip the spawn
    mockSpawn.mockClear();
    const result2 = await visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    expect(result2).toEqual(DEGRADED_E2V);
    expect(mockSpawn).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    existsSync.mockReturnValue(true);
  });

  it("returns degraded when the e2v script is missing (binary present)", async () => {
    const { existsSync } = await import("fs");
    existsSync.mockImplementation((p) => !String(p).includes("emotion2vec_plugin.py"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");

    expect(result).toEqual(DEGRADED_E2V);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Script not found"));

    warnSpy.mockRestore();
    existsSync.mockReturnValue(true);
  });
});

describe("analyzeAssetEmotion — spawn error", () => {
  it("settles pending request as degraded and marks e2v unavailable", async () => {
    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProc.emit("error", new Error("spawn EMFILE"));

    const result = await promise;
    expect(result).toEqual(DEGRADED_E2V);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("spawn EMFILE"));

    // Sticky unavailable: next call does not respawn
    mockSpawn.mockClear();
    const result2 = await visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    expect(result2).toEqual(DEGRADED_E2V);
    expect(mockSpawn).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("analyzeAssetEmotion — response handling", () => {
  it("ignores responses with an unknown requestId, then resolves the real one", async () => {
    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    mockProc.emitStdout(JSON.stringify({ ...DEGRADED_E2V, topLabel: "wrong" }) + "\n");

    emitE2VResponse(mockProc, { labels: ["x"], scores: [1], topLabel: "x", topScore: 1 });
    const result = await promise;
    expect(result.topLabel).toBe("x");
  }, 10000);

  it("returns degraded for an error response from Python", async () => {
    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    emitE2VResponse(mockProc, { error: "funasr import failed" });

    const result = await promise;
    expect(result).toEqual(DEGRADED_E2V);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("funasr import failed"));
    warnSpy.mockRestore();
  });

  it("ignores non-JSON stdout lines", async () => {
    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    mockProc.emitStdout("this is not json\n");
    emitE2VResponse(mockProc, { ...DEGRADED_E2V, topLabel: "late" });

    const result = await promise;
    expect(result.topLabel).toBe("late");
  }, 10000);

  it("pipes stderr lines to console.debug", async () => {
    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    mockProc.emitStderr("loading model...\n");
    emitE2VResponse(mockProc, { ...DEGRADED_E2V });

    await promise;
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("[emotion2vec:py]"));
    debugSpy.mockRestore();
  });

  it("settles pending requests as degraded when the worker exits", async () => {
    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    mockProc.emitExit(1, null);

    const result = await promise;
    expect(result).toEqual(DEGRADED_E2V);

    // The exit handler resets e2vProc/e2vAvailable — next call respawns
    mockSpawn.mockClear();
    const p2 = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    emitE2VResponse(mockProc, { ...DEGRADED_E2V });
    await p2;
  }, 10000);

  it("ignores a late response from a superseded worker generation", async () => {
    vi.useFakeTimers();

    // Request A — will time out and bump the generation
    const promiseA = visualAnalyzer.analyzeAssetEmotion("/abs/a.wav");
    vi.advanceTimersByTime(61_000);
    const resultA = await promiseA;
    expect(resultA).toEqual(DEGRADED_E2V);
    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

    // Request B — respawns a new worker (generation is now higher)
    const newProc = createMockProcess();
    mockSpawn.mockReturnValue(newProc);
    const promiseB = visualAnalyzer.analyzeAssetEmotion("/abs/b.wav");

    // Capture B's requestId from the new proc's stdin write (spawn + write are
    // synchronous, so the call is already recorded here).
    const written = newProc.stdin.write.mock.calls[0][0].toString();
    const reqB = JSON.parse(written.trim());

    // A's late response on the OLD proc: it carries B's requestId so it passes
    // the unknown-id guard (handleE2VResponse line ~1015), but the old proc's
    // data-handler closure holds generation 1 while B's pending entry was
    // recorded at the current (higher) generation — so it MUST be rejected by
    // the GENERATION guard (visual-analyzer.mjs:1018
    // `entry.workerGeneration !== workerGen`). If this guard were deleted the
    // old emission would resolve B with "old-A".
    mockProc.emitStdout(JSON.stringify({ ...reqB, topLabel: "old-A" }) + "\n");

    // B's real response on the NEW proc: same requestId, matching generation —
    // passes both the unknown-id guard and the generation guard, resolves B.
    newProc.emitStdout(
      JSON.stringify({ ...reqB, labels: ["b"], scores: [1], topLabel: "new-B" }) + "\n",
    );

    const resultB = await promiseB;
    // "old-A" must NOT win — the generation guard rejected the old-proc emission.
    expect(resultB.topLabel).toBe("new-B");

    vi.useRealTimers();
  }, 10000);

  it("degrades when the stdin write throws", async () => {
    mockProc.stdin.write.mockImplementation(() => {
      throw new Error("EPIPE");
    });

    const result = await visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    expect(result).toEqual(DEGRADED_E2V);
  });
});

describe("analyzeAssetEmotion — timeout", () => {
  it("kills the worker and returns degraded after the response timeout", async () => {
    vi.useFakeTimers();

    const promise = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    vi.advanceTimersByTime(61_000);

    const result = await promise;
    expect(result).toEqual(DEGRADED_E2V);
    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

    // e2vProc was nulled — next call respawns
    mockSpawn.mockClear();
    const newProc = createMockProcess();
    mockSpawn.mockReturnValue(newProc);
    const p2 = visualAnalyzer.analyzeAssetEmotion("/abs/audio.wav");
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    emitE2VResponse(newProc, { ...DEGRADED_E2V });
    await p2;

    vi.useRealTimers();
  }, 10000);
});

describe("process exit cleanup — e2v worker", () => {
  it("kills a live e2v worker with SIGTERM on process exit", async () => {
    // The registration is guarded by a process-level symbol, so the handler
    // belongs to whichever module instance imported first (with a null
    // e2vProc). Clear the guard and re-import so THIS instance registers its
    // own handler bound to the mock spawned below.
    // This mutation is intentional and idempotent: deleting the symbol only
    // removes the "already registered" flag; the re-import below re-sets it,
    // and the process 'exit' listener from the prior instance is replaced on
    // re-import (the module re-registers only when the guard is absent).
    delete process[Symbol.for("visualAnalyzerExitHandler")];
    vi.resetModules();
    const fresh = await import("../lib/visual-analyzer.mjs");

    const promise = fresh.analyzeAssetEmotion("/abs/audio.wav");
    await new Promise((r) => setTimeout(r, 10));

    const exitHandler = process
      .listeners("exit")
      .filter((l) => l.toString().includes("e2vProc"))
      .at(-1);
    expect(exitHandler).toBeDefined();

    exitHandler();
    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

    emitE2VResponse(mockProc, { ...DEGRADED_E2V });
    await promise;
  });
});

describe("fuseAudioEmotion", () => {
  it("returns unknown when primary is missing", () => {
    const r = visualAnalyzer.fuseAudioEmotion(null, { topLabel: "中立/neutral", topScore: 0.5 });
    expect(r).toEqual({
      primary: null,
      auxiliary: { label: "中立/neutral", score: 0.5 },
      agreement: "unknown",
    });
  });

  it("returns unknown when auxiliary label is missing", () => {
    const r = visualAnalyzer.fuseAudioEmotion("neutral", { topLabel: null, topScore: null });
    expect(r).toEqual({
      primary: "neutral",
      auxiliary: { label: null, score: null },
      agreement: "unknown",
    });
  });

  it("agrees when the e2v English label matches the primary emotion", () => {
    const r = visualAnalyzer.fuseAudioEmotion("neutral", {
      topLabel: "中立/neutral",
      topScore: 0.8,
    });
    expect(r.primary).toBe("neutral");
    expect(r.auxiliary).toEqual({ label: "中立/neutral", score: 0.8 });
    expect(r.agreement).toBe("agree");
  });

  it("reports disagree when the signals point to different emotions", () => {
    const r = visualAnalyzer.fuseAudioEmotion("happy", {
      topLabel: "悲伤/sad",
      topScore: 0.9,
    });
    expect(r.agreement).toBe("disagree");
  });

  it("matches labels without a slash separator", () => {
    const r = visualAnalyzer.fuseAudioEmotion("Angry", { topLabel: "angry", topScore: 0.6 });
    expect(r.agreement).toBe("agree");
  });
});
