/**
 * Profile-level pacing throttle for the TikTok Studio publish path (#1288).
 *
 * The state lives in the automation Chrome profile, not in the content package
 * and not in process memory: two runs from different shells, different content
 * ids, or a restarted Node process must see the SAME last-run time. Only the
 * "prepare the post" path is throttled — the public click is still the human's
 * (#1181), and a run that failed before reaching its terminal action is never
 * committed, so a failed run can be retried immediately.
 *
 * The interval is sampled ONCE, at commit time, and stored as an absolute
 * `nextAllowedAt`. Re-sampling it on every check would make the gate's answer
 * depend on when you asked, which is both unauditable and easy to bypass.
 *
 * @module publish-throttle
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { automationProfileDir } from "./cdp-profile-guard.mjs";
import { clamp, sampleSymmetricJitter } from "./behavior-sampling.mjs";

/**
 * Baseline 135min ±45min ⇒ 90–180min. The 90min floor is the ticket's hard
 * minimum; the ±45min is the "not on the hour" spread. Daily cap counts any
 * committed terminal action (prepared editor OR saved draft).
 */
export const THROTTLE_POLICY = Object.freeze({
  maxPerDay: 3,
  minIntervalMs: 90 * 60_000,
  baseIntervalMs: 135 * 60_000,
  jitterMs: 45 * 60_000,
});

const THROTTLE_STATE_VERSION = 1;

/** The one state file for the automation profile; overridable in tests. */
export function throttleStatePath(profileDir = automationProfileDir()) {
  return `${profileDir}/publish-throttle.json`;
}

/** Local calendar day — the account operator's day, not UTC's. */
export function dayKey(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function emptyThrottleState(day = dayKey()) {
  return {
    version: THROTTLE_STATE_VERSION,
    day,
    runs: 0,
    lastRunAt: null,
    nextAllowedAt: null,
    intervalsMs: [],
    jittersMs: [],
  };
}

/**
 * Read the state. A corrupt file fails CLOSED (throws) instead of silently
 * resetting the counters — a JSON parse error is not a licence to publish.
 */
export function readThrottleState(path) {
  if (!existsSync(path)) return emptyThrottleState();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`publish throttle state is unreadable (${path}): ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object" || parsed.version !== THROTTLE_STATE_VERSION) {
    throw new Error(`publish throttle state has an unsupported version (${path})`);
  }
  return {
    ...emptyThrottleState(parsed.day),
    ...parsed,
    intervalsMs: Array.isArray(parsed.intervalsMs) ? parsed.intervalsMs : [],
    jittersMs: Array.isArray(parsed.jittersMs) ? parsed.jittersMs : [],
  };
}

/**
 * Decide whether this run may start. Pure w.r.t. the state file: no writes.
 *
 * @returns {{allowed:boolean, reason:string, runsToday:number, lastRunAt:string|null,
 *   nextAllowedAt:string|null, remainingMs:number, sampledIntervalMs:number|null,
 *   sampledJitterMs:number|null, recentIntervalsMs:number[]}}
 */
export function evaluateThrottle({ state, now = new Date(), policy = THROTTLE_POLICY } = {}) {
  const s = state || emptyThrottleState(dayKey(now));
  const today = dayKey(now);
  const runsToday = s.day === today ? Number(s.runs) || 0 : 0;
  const last = Number.isFinite(s.lastRunAt) ? s.lastRunAt : null;
  const intervals = Array.isArray(s.intervalsMs) ? s.intervalsMs.slice(-20) : [];
  const jitters = Array.isArray(s.jittersMs) ? s.jittersMs.slice(-20) : [];
  const base = {
    runsToday,
    lastRunAt: last === null ? null : new Date(last).toISOString(),
    nextAllowedAt: Number.isFinite(s.nextAllowedAt)
      ? new Date(s.nextAllowedAt).toISOString()
      : null,
    remainingMs: 0,
    sampledIntervalMs: intervals.at(-1) ?? null,
    sampledJitterMs: jitters.at(-1) ?? null,
    recentIntervalsMs: intervals,
  };

  if (runsToday >= policy.maxPerDay) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return {
      ...base,
      allowed: false,
      reason: "daily-cap",
      remainingMs: Math.max(0, tomorrow.getTime() - now.getTime()),
    };
  }
  if (Number.isFinite(s.nextAllowedAt) && now.getTime() < s.nextAllowedAt) {
    return {
      ...base,
      allowed: false,
      reason: "min-interval",
      remainingMs: s.nextAllowedAt - now.getTime(),
    };
  }
  return { ...base, allowed: true, reason: last === null ? "no-state" : "ok" };
}

/**
 * Commit a SUCCESSFUL terminal action: sample the next interval, store the
 * absolute deadline, and atomically replace the state file. The tmp+rename is
 * what makes the state cross-process safe: a reader never sees a half-written
 * JSON document.
 */
export function commitThrottleRun({
  statePath,
  now = new Date(),
  policy = THROTTLE_POLICY,
  rand = Math.random,
  state,
} = {}) {
  if (!statePath) throw new Error("commitThrottleRun needs statePath");
  const s = state || readThrottleState(statePath);
  const today = dayKey(now);
  const runsToday = s.day === today ? (Number(s.runs) || 0) + 1 : 1;
  const jitterMs = sampleSymmetricJitter(0, policy.jitterMs, rand);
  // The ±45min spread sits ON TOP of the 135min base, clamped at the 90min
  // floor, so actual intervals land in [90, 180] minutes and are never a
  // constant nor a whole hour.
  const intervalMs = Math.round(
    clamp(
      policy.baseIntervalMs + jitterMs,
      policy.minIntervalMs,
      policy.baseIntervalMs + policy.jitterMs,
    ),
  );
  const next = {
    ...s,
    version: THROTTLE_STATE_VERSION,
    day: today,
    runs: runsToday,
    lastRunAt: now.getTime(),
    nextAllowedAt: now.getTime() + intervalMs,
    intervalsMs: [...(s.intervalsMs || []), intervalMs].slice(-20),
    jittersMs: [...(s.jittersMs || []), jitterMs].slice(-20),
  };
  mkdirSync(dirname(statePath), { recursive: true });
  const tmp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tmp, statePath);
  return { state: next, intervalMs, jitterMs };
}

/** Human-readable block message, shared by stdout and the publish log. */
export function describeThrottleBlock(verdict) {
  const waitMin = Math.ceil(verdict.remainingMs / 60_000);
  return verdict.reason === "daily-cap"
    ? `daily cap reached (${verdict.runsToday} runs today); retry in ~${waitMin} min`
    : `minimum interval not elapsed (last run ${verdict.lastRunAt}); wait ~${waitMin} min (until ${verdict.nextAllowedAt})`;
}
