/**
 * Tests for the pipeline step profiler (#225 acceptance 1).
 *
 * The profiler records wall-clock durations for named pipeline steps,
 * including overlapping steps (parallel voice/media tracks), persists a
 * JSON profile to the pipeline output dir, and prints a summary sorted by
 * duration. The clock is injectable so tests are deterministic.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { createProfiler } from "../lib/pipeline-profile.mjs";

describe("pipeline-profile", () => {
  let tmp;
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = null;
    vi.restoreAllMocks();
  });

  function makeTmp() {
    tmp = mkdtempSync("prof-test-");
    return tmp;
  }

  /** Deterministic clock: advance manually. */
  function fakeClock() {
    let t = 1000;
    return {
      now: () => t,
      advance: (ms) => {
        t += ms;
      },
    };
  }

  /** Manually released gate: `await g.wait()` blocks until `g.open()`. */
  function gate() {
    let release;
    const p = new Promise((resolve) => {
      release = resolve;
    });
    return { wait: () => p, open: () => release() };
  }

  /** Let pending promise continuations (and wrap's finally) run. */
  function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function stepByName(prof, name) {
    return prof.steps.find((s) => s.name === name);
  }

  /** Capture summary() output as one string. */
  function captureSummary(prof) {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    prof.summary();
    return log.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  /**
   * Drive a two-track `runParallel` join the way main.mjs does. Each track
   * blocks on its own gate, then advances the shared clock by `advanceMs`
   * before resolving `value` or throwing `error`. Returns the join promise
   * plus the gates, so a test can settle the branches in any order.
   */
  function joinTracks(clk, prof, tracks) {
    const gates = new Map(tracks.map((t) => [t.name, gate()]));
    const joined = prof.runParallel(
      tracks.map((t) => ({
        name: t.name,
        meta: t.meta,
        fn: async () => {
          await gates.get(t.name).wait();
          clk.advance(t.advanceMs);
          if (t.error) throw t.error;
          return t.value;
        },
      })),
    );
    return { joined, gates };
  }

  it("records a step duration via mark/end", () => {
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: makeTmp(), version: "v-test", now: clk.now });

    prof.mark("step-a");
    clk.advance(250);
    const dur = prof.end("step-a");

    expect(dur).toBe(250);
    expect(prof.steps).toHaveLength(1);
    expect(prof.steps[0]).toMatchObject({ name: "step-a", durationMs: 250 });
  });

  it("returns null and does not throw when ending an unknown step", () => {
    const prof = createProfiler({
      outputDir: makeTmp(),
      version: "v-test",
      now: () => 0,
      onExit: false,
    });
    expect(prof.end("nope")).toBeNull();
    expect(prof.steps).toHaveLength(0);
  });

  it("supports overlapping steps (parallel tracks)", () => {
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: makeTmp(), version: "v-test", now: clk.now });

    prof.mark("voice");
    prof.mark("media");
    clk.advance(100);
    prof.end("media"); // 100ms
    clk.advance(400);
    prof.end("voice"); // 500ms

    expect(prof.steps.map((s) => s.name).sort()).toEqual(["media", "voice"]);
    expect(prof.steps.find((s) => s.name === "media").durationMs).toBe(100);
    expect(prof.steps.find((s) => s.name === "voice").durationMs).toBe(500);
  });

  it("wrap() records the duration and returns the fn result", async () => {
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: makeTmp(), version: "v-test", now: clk.now });

    const result = await prof.wrap("step-w", async () => {
      clk.advance(75);
      return 42;
    });

    expect(result).toBe(42);
    expect(prof.steps[0]).toMatchObject({ name: "step-w", durationMs: 75 });
  });

  it("wrap() closes the step even when the fn rejects", async () => {
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: makeTmp(), version: "v-test", now: clk.now });

    await expect(
      prof.wrap("step-boom", async () => {
        clk.advance(10);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(prof.steps[0]).toMatchObject({ name: "step-boom", durationMs: 10 });
  });

  it("runParallel() records each parallel track's own settle time (#623)", async () => {
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: makeTmp(), version: "v-test", now: clk.now });
    const { joined, gates } = joinTracks(clk, prof, [
      { name: "fast", advanceMs: 20, value: "fast", meta: { track: "voice", parallel: true } },
      { name: "slow", advanceMs: 60, value: "slow", meta: { track: "media", parallel: true } },
    ]);

    gates.get("fast").open();
    await flush(); // fast closes at t0+20, before the slower track finishes
    gates.get("slow").open();
    const [fastRes, slowRes] = await joined;

    expect(fastRes).toMatchObject({ status: "fulfilled", value: "fast" });
    expect(slowRes).toMatchObject({ status: "fulfilled", value: "slow" });
    expect(stepByName(prof, "fast")).toMatchObject({ durationMs: 20, parallel: true });
    expect(stepByName(prof, "slow")).toMatchObject({ durationMs: 80, parallel: true });
    // Different spans, same start: the bug was both reporting the join span.
    expect(stepByName(prof, "fast").startedAt).toBe(stepByName(prof, "slow").startedAt);
    // totalMs reflects the join (the slow track), not the sum of both spans.
    expect(prof.totalMs()).toBe(80);
  });

  it("runParallel() persists both durations when the TTS track rejects (#623)", async () => {
    const dir = makeTmp();
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: dir, version: "v-test", now: clk.now });
    const { joined, gates } = joinTracks(clk, prof, [
      {
        name: "media-track",
        advanceMs: 30,
        value: "media",
        meta: { track: "media", parallel: true },
      },
      {
        name: "step-1-tts",
        advanceMs: 70,
        error: new Error("tts boom"),
        meta: { track: "voice", parallel: true },
      },
    ]);

    // TTS settles first and rejects; media still runs to its natural end.
    gates.get("step-1-tts").open();
    await flush(); // let step-1-tts close at t0+70 before media advances further
    gates.get("media-track").open();
    const [mediaRes, ttsRes] = await joined;

    expect(ttsRes.status).toBe("rejected");
    expect(ttsRes.reason.message).toBe("tts boom");
    expect(mediaRes).toMatchObject({ status: "fulfilled", value: "media" });
    // Neither step is lost to the rejection, and neither is left open.
    expect(stepByName(prof, "step-1-tts")).toMatchObject({ durationMs: 70, track: "voice" });
    expect(stepByName(prof, "media-track")).toMatchObject({ durationMs: 100, track: "media" });
    expect(prof.steps.map((s) => s.name).sort()).toEqual(["media-track", "step-1-tts"]);

    // The rejection path persists both closed spans: no unfinished snapshot.
    prof.write();
    const json = JSON.parse(readFileSync(join(dir, "last-profile.json"), "utf8"));
    const persisted = new Map(json.steps.map((s) => [s.name, s]));
    expect(persisted.get("step-1-tts")).toMatchObject({ durationMs: 70, track: "voice" });
    expect(persisted.get("media-track")).toMatchObject({ durationMs: 100, track: "media" });
    expect(json.steps.some((s) => s.unfinished === true)).toBe(false);
  });

  it("runParallel() keeps both durations when the media track rejects (#623)", async () => {
    const dir = makeTmp();
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: dir, version: "v-test", now: clk.now });
    const { joined, gates } = joinTracks(clk, prof, [
      {
        name: "media-track",
        advanceMs: 30,
        error: new Error("media boom"),
        meta: { track: "media", parallel: true },
      },
      {
        name: "step-1-tts",
        advanceMs: 70,
        value: "voice",
        meta: { track: "voice", parallel: true },
      },
    ]);

    // Media settles first and rejects; the voice track still fulfills.
    gates.get("media-track").open();
    await flush(); // let media-track close at t0+30 before TTS advances further
    gates.get("step-1-tts").open();
    const [mediaRes, ttsRes] = await joined;

    expect(mediaRes.status).toBe("rejected");
    expect(mediaRes.reason.message).toBe("media boom");
    expect(ttsRes).toMatchObject({ status: "fulfilled", value: "voice" });
    expect(stepByName(prof, "media-track")).toMatchObject({ durationMs: 30, track: "media" });
    expect(stepByName(prof, "step-1-tts")).toMatchObject({ durationMs: 100, track: "voice" });

    prof.write();
    const json = JSON.parse(readFileSync(join(dir, "last-profile.json"), "utf8"));
    const persisted = new Map(json.steps.map((s) => [s.name, s]));
    expect(persisted.get("media-track")).toMatchObject({ durationMs: 30, track: "media" });
    expect(persisted.get("step-1-tts")).toMatchObject({ durationMs: 100, track: "voice" });
    expect(json.steps.some((s) => s.unfinished === true)).toBe(false);
  });

  it("mark() accepts meta and stores it on the step record", () => {
    const prof = createProfiler({
      outputDir: makeTmp(),
      version: "v-test",
      now: () => 0,
      onExit: false,
    });
    prof.mark("step-1-tts", { track: "voice", cacheHits: 3 });
    prof.end("step-1-tts");
    expect(prof.steps[0]).toMatchObject({ track: "voice", cacheHits: 3 });
  });

  it("write() persists profile JSON with steps, total and version", () => {
    const dir = makeTmp();
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: dir, version: "2026-09-08T00-00-00", now: clk.now });

    prof.mark("fast");
    clk.advance(5);
    prof.end("fast");
    prof.mark("slow");
    clk.advance(900);
    prof.end("slow");
    prof.write();

    const file = join(dir, "profile-2026-09-08T00-00-00.json");
    expect(existsSync(file)).toBe(true);
    const json = JSON.parse(readFileSync(file, "utf8"));
    expect(json.version).toBe("2026-09-08T00-00-00");
    expect(json.steps).toHaveLength(2);
    expect(json.totalMs).toBeGreaterThanOrEqual(905);
    expect(json.steps.find((s) => s.name === "slow").durationMs).toBe(900);
  });

  it("write() also drops a stable last-profile.json and creates the output dir", () => {
    const dir = join(makeTmp(), "output", "nested-pipe");
    const prof = createProfiler({ outputDir: dir, version: "v2", now: () => 0, onExit: false });
    prof.mark("s");
    prof.end("s");
    prof.write();

    expect(existsSync(join(dir, "profile-v2.json"))).toBe(true);
    expect(existsSync(join(dir, "last-profile.json"))).toBe(true);
    const stable = JSON.parse(readFileSync(join(dir, "last-profile.json"), "utf8"));
    expect(stable.steps).toHaveLength(1);
  });

  it("summary() prints steps sorted by duration descending", () => {
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: makeTmp(), version: "v-test", now: clk.now });
    prof.mark("tiny");
    prof.mark("huge");
    clk.advance(10);
    prof.end("tiny");
    clk.advance(1000);
    prof.end("huge");

    const out = captureSummary(prof);
    expect(out).toContain("huge");
    expect(out).toContain("tiny");
    const iHuge = out.indexOf("huge");
    const iTiny = out.indexOf("tiny");
    expect(iHuge).toBeLessThan(iTiny);
  });

  it("summary() flags parallel steps and still sorts by duration descending", () => {
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: makeTmp(), version: "v-test", now: clk.now });
    prof.mark("step-1-tts", { track: "voice", parallel: true });
    prof.mark("render");
    clk.advance(100);
    prof.end("step-1-tts");
    clk.advance(900);
    prof.end("render");

    const out = captureSummary(prof);

    expect(out).toContain("step-1-tts [voice] [parallel]");
    expect(out).not.toContain("render [parallel]");
    // Sort order is unchanged by the parallel marker.
    expect(out.indexOf("render")).toBeLessThan(out.indexOf("step-1-tts"));
  });

  it("write() includes open steps as unfinished (failure evidence)", () => {
    const dir = makeTmp();
    const clk = fakeClock();
    const prof = createProfiler({ outputDir: dir, version: "v-open", now: clk.now });
    prof.mark("done-step");
    clk.advance(50);
    prof.end("done-step");
    prof.mark("aborted-step", { track: "voice" });
    clk.advance(120);
    prof.write();

    const json = JSON.parse(readFileSync(join(dir, "profile-v-open.json"), "utf8"));
    const aborted = json.steps.find((s) => s.name === "aborted-step");
    expect(aborted).toMatchObject({ unfinished: true, durationMs: 120, track: "voice" });
    expect(json.steps.find((s) => s.name === "done-step").unfinished).toBeUndefined();
    // write() must not consume the open step — a later end() still works.
    clk.advance(10);
    expect(prof.end("aborted-step")).toBe(130);
  });

  it("exit hook writes the profile when enabled", () => {
    const dir = makeTmp();
    const handlers = [];
    vi.stubGlobal("process", {
      ...process,
      on: (evt, fn) => {
        if (evt === "exit") handlers.push(fn);
      },
    });
    createProfiler({ outputDir: dir, version: "v-exit", now: () => 0, onExit: true });
    expect(handlers).toHaveLength(1);
    // Simulate process exit: the handler must write synchronously.
    handlers[0]();
    expect(existsSync(join(dir, "profile-v-exit.json"))).toBe(true);
  });

  it("does not register an exit hook when onExit is false", () => {
    const handlers = [];
    vi.stubGlobal("process", {
      ...process,
      on: (evt, fn) => {
        if (evt === "exit") handlers.push(fn);
      },
    });
    createProfiler({ outputDir: makeTmp(), version: "v", now: () => 0, onExit: false });
    expect(handlers).toHaveLength(0);
  });
});
