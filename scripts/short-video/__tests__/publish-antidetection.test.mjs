/**
 * #1288 acceptance contracts: distributed behaviour, profile-level pacing,
 * and the warm-up log's ordering. Everything is driven with injected RNG,
 * clock, sleep and CDP session — no Chrome, no network, no real profile.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  BEHAVIOR_BANDS,
  sampleBetaMs,
  sampleGammaWeight,
  sampleIntBetween,
  sampleLogNormalMs,
  samplePacing,
  sampleSeries,
  variationStats,
} from "../lib/behavior-sampling.mjs";
import {
  THROTTLE_POLICY,
  commitThrottleRun,
  dayKey,
  evaluateThrottle,
  readThrottleState,
} from "../lib/publish-throttle.mjs";
import { PUBLISH_PACING } from "../lib/publish-pacing.mjs";
import {
  movePointerAlongPath,
  hoverAtPoint,
  planTyping,
  sleepJitter,
} from "../lib/human-input.mjs";
import { runSessionWarmup } from "../tiktok-upload-prep.mjs";

/** Deterministic PRNG (mulberry32), same helper the existing input tests use. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tempStatePath(name) {
  const dir = mkdtempSync(join(tmpdir(), `antidetection-${name}-`));
  return join(dir, "publish-throttle.json");
}

describe("behavior distributions (#1288 ③)", () => {
  it("clamps log-normal dwell into the 5–20s feed band, including degenerate RNG", () => {
    const fixed = (v) => () => v;
    for (const v of [0.000001, 0.5, 0.999999]) {
      const ms = sampleLogNormalMs({ ...BEHAVIOR_BANDS.feedDwell, rand: fixed(v) });
      expect(ms).toBeGreaterThanOrEqual(BEHAVIOR_BANDS.feedDwell.minMs);
      expect(ms).toBeLessThanOrEqual(BEHAVIOR_BANDS.feedDwell.maxMs);
    }
  });

  it("keeps beta keystroke gaps and gamma scroll weights inside their bands", () => {
    for (let i = 0; i < 60; i++) {
      const rand = seeded(i);
      const gap = sampleBetaMs({ ...BEHAVIOR_BANDS.typingGap, rand });
      const weight = sampleGammaWeight({ ...BEHAVIOR_BANDS.scrollStep, rand });
      expect(gap).toBeGreaterThanOrEqual(30);
      expect(gap).toBeLessThanOrEqual(120);
      expect(weight).toBeGreaterThanOrEqual(0.6);
      expect(weight).toBeLessThanOrEqual(1.4);
    }
  });

  it("draws a non-constant 24-sample set for each action (CV>0, no dominant value)", () => {
    const sets = {
      feedDwell: sampleSeries(
        24,
        (rand) => sampleLogNormalMs({ ...BEHAVIOR_BANDS.feedDwell, rand }),
        seeded(7),
      ),
      scrollStep: sampleSeries(
        24,
        (rand) => sampleGammaWeight({ ...BEHAVIOR_BANDS.scrollStep, rand }),
        seeded(8),
      ),
      typingGap: sampleSeries(
        24,
        (rand) => sampleBetaMs({ ...BEHAVIOR_BANDS.typingGap, rand }),
        seeded(9),
      ),
    };
    for (const [kind, values] of Object.entries(sets)) {
      const stats = variationStats(values);
      expect(stats.n, kind).toBe(24);
      expect(stats.cv, kind).toBeGreaterThan(0);
      expect(stats.dominantShare, kind).toBeLessThan(0.5);
      expect(stats.distinct, kind).toBeGreaterThan(5);
    }
  });

  it("reports cv=0 and dominantShare=1 for a constant sample", () => {
    expect(variationStats([7, 7, 7]).cv).toBe(0);
    expect(variationStats([7, 7, 7]).dominantShare).toBe(1);
    expect(variationStats([]).n).toBe(0);
  });

  it("keeps the existing pacing band authoritative for sleepJitter", async () => {
    const sleeps = [];
    const sleepFn = async (ms) => sleeps.push(ms);
    for (let i = 0; i < 24; i++) {
      await sleepJitter(...PUBLISH_PACING.warmupDwell, { rand: seeded(i), sleepFn });
    }
    const [base, spread] = PUBLISH_PACING.warmupDwell;
    expect(base - spread).toBe(5000);
    expect(base + spread).toBe(20000);
    for (const ms of sleeps) {
      expect(ms).toBeGreaterThanOrEqual(base - spread);
      expect(ms).toBeLessThanOrEqual(base + spread);
    }
    expect(variationStats(sleeps).cv).toBeGreaterThan(0);
  });

  it("replaces the uniform typing gap with a beta one, still inside the band", () => {
    const plan = planTyping("a b c d e f. g h i j k", { rand: seeded(21) });
    // Boundary segments may deliberately take a 300–900ms pause; that is the
    // pre-existing contract, not a gap. The rest are beta gaps in 30–120ms.
    const gaps = [];
    for (const seg of plan.segments) {
      if (seg.kind !== "text") continue;
      expect(seg.delayBeforeMs).toBeGreaterThanOrEqual(30);
      expect(seg.delayBeforeMs).toBeLessThanOrEqual(1300);
      if (seg.delayBeforeMs <= 120) gaps.push(seg.delayBeforeMs);
    }
    expect(gaps.length).toBeGreaterThan(5);
    expect(variationStats(gaps).cv).toBeGreaterThan(0);
    expect(samplePacing([100, 20], { rand: seeded(3) })).toBeGreaterThanOrEqual(80);
  });

  it("gives hovers and scrolls a Bézier pointer path, not a teleported mousemove", async () => {
    const calls = [];
    const session = {
      send: async (method, params) => {
        calls.push({ method, params });
        return { result: { value: 0 } };
      },
    };
    const sleepFn = async () => {};
    const from = { x: 100, y: 100 };
    const to = { x: 700, y: 500 };
    const moved = await movePointerAlongPath(session, { from, to, rand: seeded(4), sleepFn });
    expect(moved.points.length).toBeGreaterThan(10);
    expect(calls.filter((c) => c.params?.type === "mouseMoved").length).toBeGreaterThan(10);
    const hover = await hoverAtPoint(session, { from, to, rand: seeded(5), sleepFn });
    expect(hover.holdMs).toBeGreaterThanOrEqual(BEHAVIOR_BANDS.hoverHold.minMs);
    expect(hover.holdMs).toBeLessThanOrEqual(BEHAVIOR_BANDS.hoverHold.maxMs);
    expect(calls.some((c) => c.params?.type === "mousePressed")).toBe(false);
  });
});

describe("profile-level pacing gate (#1288 ②)", () => {
  it("allows the first run and blocks a second run inside the minimum interval", () => {
    const path = tempStatePath("interval");
    const t0 = new Date("2026-11-13T09:00:00Z");
    expect(evaluateThrottle({ state: readThrottleState(path), now: t0 }).allowed).toBe(true);

    const first = commitThrottleRun({ statePath: path, now: t0, rand: seeded(11) });
    expect(first.intervalMs).toBeGreaterThanOrEqual(THROTTLE_POLICY.minIntervalMs);
    expect(first.intervalMs).toBeLessThanOrEqual(
      THROTTLE_POLICY.baseIntervalMs + THROTTLE_POLICY.jitterMs,
    );

    // A DIFFERENT process reading the file sees the same deadline.
    const second = evaluateThrottle({ state: readThrottleState(path), now: t0 });
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("min-interval");
    expect(second.lastRunAt).toBe(t0.toISOString());
    expect(second.remainingMs).toBe(first.intervalMs);
    expect(second.nextAllowedAt).toBe(new Date(t0.getTime() + first.intervalMs).toISOString());
  });

  it("samples three non-constant intervals, none below the 90min floor", () => {
    const path = tempStatePath("jitter");
    let now = new Date("2026-11-13T09:00:00Z");
    const intervals = [];
    for (let i = 0; i < 3; i++) {
      const { intervalMs } = commitThrottleRun({
        statePath: path,
        now,
        rand: seeded(i + 1),
        state: i === 0 ? undefined : readThrottleState(path),
      });
      intervals.push(intervalMs);
      now = new Date(now.getTime() + intervalMs + 1);
    }
    expect(variationStats(intervals).cv).toBeGreaterThan(0);
    for (const ms of intervals) {
      expect(ms).toBeGreaterThanOrEqual(THROTTLE_POLICY.minIntervalMs);
      expect(ms).toBeLessThanOrEqual(THROTTLE_POLICY.baseIntervalMs + THROTTLE_POLICY.jitterMs);
    }
    // ±45min means the sampled deadlines are not on the hour.
    const state = readThrottleState(path);
    expect(state.jittersMs.some((j) => j !== 0)).toBe(true);
  });

  it("enforces the daily cap after three successful runs, with a retry time", () => {
    const path = tempStatePath("daily");
    let now = new Date("2026-11-13T01:00:00Z");
    for (let i = 0; i < 3; i++) {
      const { intervalMs } = commitThrottleRun({ statePath: path, now, rand: seeded(i + 30) });
      now = new Date(now.getTime() + intervalMs + 1);
    }
    const verdict = evaluateThrottle({ state: readThrottleState(path), now });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("daily-cap");
    expect(verdict.runsToday).toBe(3);
    expect(verdict.remainingMs).toBeGreaterThan(0);
  });

  it("fails closed on a corrupt state file instead of resetting the counters", () => {
    const path = tempStatePath("corrupt");
    writeFileSync(path, "{not json", "utf8");
    expect(() => readThrottleState(path)).toThrow(/unreadable/);
  });

  it("keys the daily counter to the local calendar day", () => {
    expect(dayKey(new Date(2026, 10, 13, 23, 59))).toBe("2026-11-13");
    expect(dayKey(new Date(2026, 10, 14, 0, 1))).toBe("2026-11-14");
  });
});

/** Minimal CDP stand-in: trusted wheel bursts always ack on the first try. */
function fakeCdp() {
  const calls = [];
  return {
    calls,
    send: async (method, params) => {
      calls.push({ method, params });
      if (method === "Runtime.evaluate") return { result: { value: 0 } };
      return {};
    },
  };
}

describe("feed warm-up log evidence (#1288 ①)", () => {
  it("logs >=3 warmup.feed lines before upload.navigate, each with items/dwellMs/scrollCount", async () => {
    const entries = [];
    const navigations = [];
    const cdp = fakeCdp();
    const warmed = await runSessionWarmup(cdp, "TAB", {
      rand: seeded(42),
      sleepFn: async () => {},
      log: (step, detail = {}) => entries.push({ step, ...detail }),
      navigate: async (url) => navigations.push(url),
    });

    const feedLines = entries.filter((e) => e.step === "warmup.feed");
    const navIndex = entries.findIndex((e) => e.step === "upload.navigate");
    const lastFeedIndex = entries.map((e) => e.step).lastIndexOf("warmup.feed");
    expect(feedLines.length).toBeGreaterThanOrEqual(3);
    expect(feedLines.length).toBeLessThanOrEqual(8);
    expect(navIndex).toBeGreaterThan(lastFeedIndex);
    const nav = entries[navIndex];
    expect(nav.from).toBe("https://www.tiktok.com/foryou");
    expect(nav.afterWarmupFeeds).toBe(feedLines.length);
    expect(navigations).toEqual(["https://www.tiktok.com/tiktokstudio/upload"]);

    for (const feed of feedLines) {
      expect(feed.items).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(feed.dwellMs)).toBe(true);
      expect(feed.dwellMs.length).toBeGreaterThanOrEqual(2);
      expect(feed.scrollCount).toBeGreaterThanOrEqual(1);
      for (const ms of feed.dwellMs) {
        expect(ms).toBeGreaterThanOrEqual(BEHAVIOR_BANDS.hoverHold.minMs);
      }
    }
    // Every drawn value is on the log, so CV / dominant share can be computed
    // from the JSONL file rather than from a claim in a comment.
    const samples = entries.filter((e) => e.step === "behavior.sample");
    expect(samples.length).toBeGreaterThanOrEqual(9);
    expect(new Set(samples.map((s) => s.kind))).toEqual(
      new Set(["hoverHold", "scrollStep", "feedDwell"]),
    );
    expect(warmed.feeds.length).toBe(feedLines.length);
    expect(cdp.calls.some((c) => c.params?.type === "mouseWheel")).toBe(true);
    expect(cdp.calls.filter((c) => c.params?.type === "mouseMoved").length).toBeGreaterThan(10);
  });

  it("samples feed item counts in 3–8 and look-backs do occur", () => {
    const counts = sampleSeries(40, (rand) => sampleIntBetween(3, 8, rand), seeded(6));
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(3);
      expect(c).toBeLessThanOrEqual(8);
    }
    expect(variationStats(counts).distinct).toBeGreaterThan(1);
  });
});
