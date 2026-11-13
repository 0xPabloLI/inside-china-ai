#!/usr/bin/env node
/**
 * Reproduce the three #1288 acceptance checks without a browser (#1288).
 *
 * This is NOT a mock of the behaviour: it calls the PRODUCTION functions —
 * `runSessionWarmup`, `evaluateThrottle`, `commitThrottleRun`, the sampling
 * primitives and `makePublishLogger` — with injected clock / sleep / CDP
 * session / RNG. The resulting `publish-log.jsonl` is a real log written by
 * the real logger, so the same checks a reviewer would run against a live
 * upload's log can be run here in a second.
 *
 * Why no live upload: since #1181 the automated path stops at a Studio draft
 * and the public click is the operator's. A real run needs Chrome with the
 * logged-in profile open; this evidence is deliberately side-effect free.
 *
 * Usage:
 *   node scripts/short-video/publish-antidetection-evidence.mjs [--seed 1288]
 *
 * Output (gitignored):
 *   output/antidetection-evidence/publish/tiktok/publish-log.jsonl
 *   output/antidetection-evidence/summary.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  BEHAVIOR_BANDS,
  sampleBetaMs,
  sampleGammaWeight,
  sampleLogNormalMs,
  sampleSeries,
  variationStats,
} from "./lib/behavior-sampling.mjs";
import {
  THROTTLE_POLICY,
  commitThrottleRun,
  dayKey,
  emptyThrottleState,
  evaluateThrottle,
  readThrottleState,
} from "./lib/publish-throttle.mjs";
import { makePublishLogger, runSessionWarmup } from "./tiktok-upload-prep.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = join(__dirname, "output");
const EVIDENCE_ID = "antidetection-evidence";
const EVIDENCE_DIR = join(OUTPUT_ROOT, EVIDENCE_ID);
const LOG_PATH = join(EVIDENCE_DIR, "publish", "tiktok", "publish-log.jsonl");
const STATE_PATH = join(EVIDENCE_DIR, "publish-throttle.json");

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

const seedArg = process.argv.indexOf("--seed");
const seed = seedArg >= 0 ? Number(process.argv[seedArg + 1]) || 1288 : 1288;
const rand = seeded(seed);

function fakeCdp() {
  return {
    send: async (method) => {
      if (method === "Runtime.evaluate") return { result: { value: 0 } };
      return {};
    },
  };
}

function readLog() {
  return readFileSync(LOG_PATH, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function main() {
  // A fresh evidence set each run, so counts never accumulate across runs.
  // The throttle state is reset to a VALID empty document rather than deleted:
  // an empty/corrupt file fails closed by design (see readThrottleState).
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  if (existsSync(LOG_PATH)) writeFileSync(LOG_PATH, "", "utf8");
  writeFileSync(STATE_PATH, `${JSON.stringify(emptyThrottleState(dayKey()))}\n`, "utf8");
  const log = makePublishLogger(EVIDENCE_ID);
  const sleepFn = async () => {};
  const navigate = async () => {};

  // ① Entry-path warm-up: production function, fake session, real logger.
  const warmed = await runSessionWarmup(fakeCdp(), "EVIDENCE-TAB", {
    log,
    rand,
    sleepFn,
    navigate,
  });

  // ② Pacing gate: three successful runs, one blocked retry, one daily cap.
  const intervals = [];
  let now = new Date("2026-11-13T01:00:00Z");
  const first = evaluateThrottle({ state: readThrottleState(STATE_PATH), now });
  log("throttle", { ...first, policy: THROTTLE_POLICY, phase: "first-run" });

  for (let i = 0; i < 3; i++) {
    const committed = commitThrottleRun({ statePath: STATE_PATH, now, rand });
    intervals.push(committed.intervalMs);
    log("throttle.commit", {
      intervalMs: committed.intervalMs,
      jitterMs: committed.jitterMs,
      nextAllowedAt: new Date(committed.state.nextAllowedAt).toISOString(),
      runsToday: committed.state.runs,
    });
    if (i === 0) {
      const tooSoon = evaluateThrottle({
        state: readThrottleState(STATE_PATH),
        now: new Date(now.getTime() + 5 * 60_000),
      });
      log("throttle.blocked", {
        reason: tooSoon.reason,
        lastRunAt: tooSoon.lastRunAt,
        nextAllowedAt: tooSoon.nextAllowedAt,
        remainingMs: tooSoon.remainingMs,
        runsToday: tooSoon.runsToday,
      });
    }
    now = new Date(now.getTime() + committed.intervalMs + 1);
  }
  const capped = evaluateThrottle({ state: readThrottleState(STATE_PATH), now });
  log("throttle.blocked", {
    reason: capped.reason,
    lastRunAt: capped.lastRunAt,
    nextAllowedAt: capped.nextAllowedAt,
    remainingMs: capped.remainingMs,
    runsToday: capped.runsToday,
  });

  // ③ 24 samples per action, on the log so CV / dominant share are auditable.
  const draws = {
    feedDwell: sampleSeries(
      24,
      (r) => sampleLogNormalMs({ ...BEHAVIOR_BANDS.feedDwell, rand: r }),
      rand,
    ),
    scrollStep: sampleSeries(
      24,
      (r) => sampleGammaWeight({ ...BEHAVIOR_BANDS.scrollStep, rand: r }),
      rand,
    ),
    typingGap: sampleSeries(
      24,
      (r) => sampleBetaMs({ ...BEHAVIOR_BANDS.typingGap, rand: r }),
      rand,
    ),
    hoverHold: sampleSeries(
      24,
      (r) => sampleLogNormalMs({ ...BEHAVIOR_BANDS.hoverHold, rand: r }),
      rand,
    ),
  };
  for (const [kind, values] of Object.entries(draws)) {
    for (const value of values) log("behavior.sample", { kind, value, phase: "series-24" });
  }

  // ─── Judge the three acceptance checks against the JSONL itself ───
  const lines = readLog();
  const feeds = lines.filter((l) => l.step === "warmup.feed");
  const navIndex = lines.findIndex((l) => l.step === "upload.navigate");
  const lastFeedIndex = lines.map((l) => l.step).lastIndexOf("warmup.feed");
  const warmup = {
    feedRecords: feeds.length,
    allFeedsBeforeNavigate: navIndex > 0 && navIndex > lastFeedIndex,
    firstNavigateUrl: lines[navIndex]?.url ?? null,
    navigateFrom: lines[navIndex]?.from ?? null,
    navigateAfterFeeds: lines[navIndex]?.afterWarmupFeeds ?? 0,
    everyFeedHasRequiredFields: feeds.every(
      (f) =>
        f.items >= 1 && Array.isArray(f.dwellMs) && f.dwellMs.length >= 2 && f.scrollCount >= 1,
    ),
  };

  const blocked = lines.filter((l) => l.step === "throttle.blocked");
  const throttleRows = lines.filter((l) => l.step === "throttle");
  const throttle = {
    blockedRecords: blocked.length,
    blockedCarriesLastRunAndWait: blocked.every(
      (b) => typeof b.lastRunAt === "string" && b.remainingMs > 0,
    ),
    reasons: blocked.map((b) => b.reason),
    intervalsMs: intervals,
    intervalStats: variationStats(intervals),
    sampledValuesOnThrottleRows:
      throttleRows.some((t) => Array.isArray(t.recentIntervalsMs)) ||
      throttleRows.some((t) => t.sampledIntervalMs != null),
  };

  const behaviour = {};
  for (const kind of Object.keys(draws)) {
    const values = lines
      .filter((l) => l.step === "behavior.sample" && l.kind === kind)
      .map((l) => l.value);
    behaviour[kind] = variationStats(values);
  }

  const checks = {
    "① >=3 warmup.feed before upload.navigate":
      warmup.feedRecords >= 3 && warmup.allFeedsBeforeNavigate,
    "① every feed carries items/dwellMs[]/scrollCount": warmup.everyFeedHasRequiredFields,
    "② throttle.blocked carries lastRunAt + remaining wait":
      throttle.blockedRecords >= 2 && throttle.blockedCarriesLastRunAndWait,
    "② 3 intervals are not constant and respect the 90min floor":
      throttle.intervalStats.cv > 0 && intervals.every((ms) => ms >= THROTTLE_POLICY.minIntervalMs),
    "③ >=20 samples per action, CV>0, dominant share <50%": Object.values(behaviour).every(
      (s) => s.n >= 24 && s.cv > 0 && s.dominantShare < 0.5,
    ),
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    seed,
    driver: "production functions with injected CDP/clock/sleep (no live upload, see header)",
    logPath: "scripts/short-video/output/antidetection-evidence/publish/tiktok/publish-log.jsonl",
    totalLogLines: lines.length,
    warmup: { ...warmup, cycles: warmed.cycles },
    throttle,
    behaviour,
    checks,
    pass: Object.values(checks).every(Boolean),
  };
  writeFileSync(
    join(EVIDENCE_DIR, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  console.log(`#1288 evidence — seed ${seed}, ${lines.length} JSONL lines`);
  console.log(`  log: ${summary.logPath}`);
  for (const [name, ok] of Object.entries(checks))
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(`  warmup: ${warmup.feedRecords} feed records, navigate from ${warmup.navigateFrom}`);
  console.log(
    `  throttle: intervals ${intervals.map((v) => Math.round(v / 60_000)).join("/")} min, ` +
      `CV ${throttle.intervalStats.cv.toFixed(3)}, blocked ${throttle.blockedRecords}`,
  );
  for (const [kind, s] of Object.entries(behaviour)) {
    console.log(
      `  ${kind}: n=${s.n} cv=${s.cv.toFixed(3)} dominant=${(s.dominantShare * 100).toFixed(1)}% distinct=${s.distinct}`,
    );
  }
  if (!summary.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`❌ ${err.stack || err.message}`);
  process.exit(1);
});
