#!/usr/bin/env node
/**
 * Matched-pair layout experiments (#1398).
 *
 * TikTok has no organic post A/B surface. This tool therefore treats a pair of
 * same-topic posts as a randomized block: assignment is pre-registered, the
 * publish order is fixed before either post goes out, and the unit of analysis
 * is the pair of videos — never the view.
 *
 * Usage:
 *   node scripts/short-video/experiment.mjs create --id <id> --hypothesis <text> --factor <text>
 *       [--primary-metric <key>]... [--pairs 20] [--seed 20260101]
 *       [--variant-a <label>] [--variant-b <label>]
 *   node scripts/short-video/experiment.mjs assign --experiment <id> --block <topic> --pack <slug>
 *       [--duration <sec>]
 *   node scripts/short-video/experiment.mjs ingest --experiment <id> --details <path>
 *       [--map videoId=slug]... [--allow-protocol-violations]
 *   node scripts/short-video/experiment.mjs check --experiment <id>
 *   node scripts/short-video/experiment.mjs report --experiment <id> [--out <path>]
 *   node scripts/short-video/experiment.mjs power [--pairs 20] [--rho 0.5]
 *   node scripts/short-video/experiment.mjs status
 *
 * Protocol gates (this file enforces them, not the operator):
 *   - The two pre-registered primary metrics are co-primaries: the treatment has
 *     to win both (intersection-union), so no multiplicity correction is needed.
 *   - A pair only enters the analysis when both posts are at least 72h old at
 *     the capture time. Post dates carry day precision, so the age used is a
 *     lower bound.
 *   - A pair only enters the analysis when its posts are at least two calendar
 *     days apart and were published in the seeded order. Violations are skipped
 *     (and named) unless --allow-protocol-violations is passed for a sensitivity
 *     read, in which case they are recorded on the observation.
 *   - Inference (p, CI) is withheld until the pre-registered n is reached: fixed
 *     n, no peeking.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { matchPack, packTokens } from "./cohort-report.mjs";
import {
  bhFdr,
  bootstrapCI,
  mean,
  mdeContinuous,
  normalQuantile,
  pairedPermutation,
  pairedSummary,
  seededBit,
  signTest,
  variance,
  wilcoxonSignedRank,
  wilsonInterval,
} from "./lib/experiment-stats.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const EXPERIMENTS_DIR = join(__dirname, "experiments");
export const CONTENT_DIR = join(__dirname, "content");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1}: invalid JSON (${error.message})`);
      }
    });
}

function writeJsonl(file, rows) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
    "utf8",
  );
}

function assertNonEmpty(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

/** Below this many complete pairs the report stays descriptive (no p, no CI). */
const REPORT_FLOOR = 8;
/** Both posts must be this old at capture time (T+72h read). */
const MATURITY_HOURS = 72;
/** Same-topic pairs may differ by at most this much in duration (seconds). */
const MAX_DURATION_GAP_SEC = 3;
/** The spec's two primaries; a treatment has to win both to count as a win. */
const DEFAULT_PRIMARY_METRICS = ["fullVideoWatchedRate", "logAvgWatchTimeSec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The primaries a record declares. Older records carry a single
 * `primaryMetric`; reading both shapes keeps a disposable experiments dir
 * usable across this change.
 *
 * @param {object} experiment
 * @returns {string[]}
 */
export function primaryMetricsOf(experiment) {
  const list =
    Array.isArray(experiment?.primaryMetrics) && experiment.primaryMetrics.length > 0
      ? experiment.primaryMetrics
      : experiment?.primaryMetric
        ? [experiment.primaryMetric]
        : [];
  const cleaned = list.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) throw new Error("experiment declares no primary metric");
  if (cleaned.length > 2) {
    throw new Error(
      "at most two co-primary metrics are supported (the decision rule is an intersection-union test)",
    );
  }
  if (new Set(cleaned).size !== cleaned.length) throw new Error("duplicate primary metric");
  return cleaned;
}

/**
 * When a post went out, at the precision the export offers.
 *
 * TikTok's detail page shows `M/D/YYYY`; API-shaped inputs pass an ISO string.
 * Day precision means the returned `lowerMs` is the *latest* plausible posting
 * moment (end of that UTC day), so an age computed from it is a lower bound.
 *
 * @param {{postedAt?: string, postedOn?: string}} video
 * @returns {{atMs: number, lowerMs: number, precision: "exact"|"day"}|null}
 */
export function parsePostedWhen(video) {
  const exact = [video?.postedAt, video?.postedOn].find(
    (value) => typeof value === "string" && /T\d{2}:\d{2}/.test(value),
  );
  if (exact) {
    const ms = Date.parse(exact);
    return Number.isFinite(ms) ? { atMs: ms, lowerMs: ms, precision: "exact" } : null;
  }
  const raw = [video?.postedOn, video?.postedAt].find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  if (!raw) return null;
  const text = raw.trim();
  let startMs = null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (iso) {
    startMs = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  } else if (slash) {
    // TikTok renders US order (M/D/YYYY); ambiguous days are read that way too.
    startMs = Date.UTC(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2]));
  }
  if (startMs === null || Number.isNaN(startMs)) return null;
  return { atMs: startMs, lowerMs: startMs + DAY_MS, precision: "day" };
}

/**
 * Create a pre-registered experiment record. Idempotence is the caller's job:
 * the CLI refuses to overwrite an existing registration.
 */
export function createExperiment({
  id,
  hypothesis,
  factor,
  primaryMetrics,
  primaryMetric,
  secondaryMetrics = [],
  targetPairs = 20,
  alpha = 0.05,
  power = 0.8,
  seed = 20260101,
  variants = { A: "control", B: "treatment" },
  notes = "",
  now = new Date().toISOString(),
} = {}) {
  const cleanId = assertNonEmpty(id, "id");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(cleanId)) {
    throw new Error("id must be a lowercase slug (a-z, 0-9, hyphen), 2-64 chars");
  }
  const cleanHypothesis = assertNonEmpty(hypothesis, "hypothesis");
  const cleanFactor = assertNonEmpty(factor, "factor");
  const pairs = Math.floor(Number(targetPairs));
  if (!Number.isFinite(pairs) || pairs < 2) throw new Error("targetPairs must be >= 2");
  if (!(alpha > 0 && alpha < 1)) throw new Error("alpha must be between 0 and 1");
  if (!(power > 0 && power < 1)) throw new Error("power must be between 0 and 1");
  if (!Number.isFinite(Number(seed))) throw new Error("seed must be a number");
  if (!variants || typeof variants !== "object" || !variants.A || !variants.B) {
    throw new Error("variants must provide A and B labels");
  }
  // The spec pre-registers two co-primaries; a single metric stays supported for
  // older records, but a new record defaults to both.
  const declaredPrimaries =
    primaryMetrics ?? (primaryMetric ? [String(primaryMetric)] : DEFAULT_PRIMARY_METRICS);
  const primaries = primaryMetricsOf({ primaryMetrics: declaredPrimaries });
  const secondaries = Array.isArray(secondaryMetrics)
    ? secondaryMetrics.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const overlap = secondaries.filter((item) => primaries.includes(item));
  if (overlap.length > 0) {
    throw new Error(`a metric cannot be both primary and secondary: ${overlap.join(", ")}`);
  }
  return {
    id: cleanId,
    createdAt: now,
    hypothesis: cleanHypothesis,
    factor: cleanFactor,
    primaryMetric: primaries[0],
    primaryMetrics: primaries,
    secondaryMetrics: secondaries,
    design: "matched-pair",
    targetPairs: pairs,
    alpha,
    power,
    seed: Number(seed),
    variants: { A: String(variants.A), B: String(variants.B) },
    status: "registered",
    notes: String(notes || ""),
  };
}

/**
 * Choose or return this pack's assignment in a topic block.
 *
 * The first pack in a block gets a seeded coin flip; the second gets the
 * opposite variant. Publish order is also seeded and fixed before either post
 * exists, so the operator cannot choose the order after seeing performance.
 */
export function chooseAssignment({
  experiment,
  existing = [],
  block,
  packSlug,
  variant = null,
  durationSec = null,
  now = new Date().toISOString(),
} = {}) {
  const cleanBlock = assertNonEmpty(block, "block");
  const cleanPack = assertNonEmpty(packSlug, "packSlug");
  const current = existing.filter((item) => item.block === cleanBlock);
  const already = current.find((item) => item.packSlug === cleanPack);
  if (already) return already;
  if (current.length >= 2) {
    throw new Error(`block "${cleanBlock}" already has two packs; a matched pair is exactly two`);
  }
  const override = variant == null ? null : String(variant).toUpperCase();
  if (override && !["A", "B"].includes(override)) throw new Error("variant must be A or B");
  const duration = durationSec == null || durationSec === "" ? null : Number(durationSec);
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
    throw new Error("duration must be a positive number of seconds");
  }

  if (current.length === 1) {
    const other = current[0].variant === "A" ? "B" : "A";
    if (override && override !== other) {
      throw new Error(`the second pack in "${cleanBlock}" must be the opposite variant (${other})`);
    }
    const siblingsDuration = Number.isFinite(current[0].durationSec)
      ? current[0].durationSec
      : null;
    if (siblingsDuration !== null && duration !== null) {
      const gap = Math.abs(siblingsDuration - duration);
      if (gap > MAX_DURATION_GAP_SEC) {
        throw new Error(
          `duration gap ${gap.toFixed(2)}s exceeds ${MAX_DURATION_GAP_SEC}s: the pair is not comparable ` +
            `(${current[0].packSlug} ${siblingsDuration}s vs ${cleanPack} ${duration}s)`,
        );
      }
    }
    return {
      experimentId: experiment.id,
      block: cleanBlock,
      packSlug: cleanPack,
      variant: other,
      order: current[0].order === 1 ? 2 : 1,
      durationSec: duration,
      assignedAt: now,
    };
  }

  const chosen =
    override ||
    (seededBit(experiment.seed, experiment.id, cleanBlock, "variant") === 0 ? "A" : "B");
  const order = seededBit(experiment.seed, experiment.id, cleanBlock, "order") === 0 ? 1 : 2;
  return {
    experimentId: experiment.id,
    block: cleanBlock,
    packSlug: cleanPack,
    variant: chosen,
    order,
    durationSec: duration,
    assignedAt: now,
  };
}

function normalizeRate(value) {
  if (!Number.isFinite(value)) return null;
  const rate = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, rate));
}

function normalizeObservation(video, assignment, capturedAt, meta = {}) {
  const avgWatchTimeSec = Number.isFinite(video.avgWatchTimeSec) ? video.avgWatchTimeSec : null;
  const fullVideoWatchedRate = normalizeRate(video.watchedFullVideoPct);
  return {
    experimentId: assignment.experimentId,
    block: assignment.block,
    packSlug: assignment.packSlug,
    variant: assignment.variant,
    videoId: String(video.videoId),
    title: video.title || "",
    postedOn: video.postedOn || null,
    postedAt: meta.postedAt ?? null,
    postedPrecision: meta.precision ?? null,
    ageHoursLower: meta.ageHoursLower ?? null,
    protocolViolations: meta.protocolViolations ?? [],
    capturedAt,
    metrics: {
      videoViews: Number.isFinite(video.videoViews) ? video.videoViews : null,
      avgWatchTimeSec,
      logAvgWatchTimeSec: avgWatchTimeSec && avgWatchTimeSec > 0 ? Math.log(avgWatchTimeSec) : null,
      fullVideoWatchedRate,
      reach: Number.isFinite(video.reach) ? video.reach : null,
      shares: Number.isFinite(video.shares) ? video.shares : null,
      comments: Number.isFinite(video.comments) ? video.comments : null,
      retentionInsight: video.retentionInsight || null,
    },
  };
}

/** Lower-bound age of a post at capture time, in hours. */
export function observationAge(video, capturedAt) {
  const posted = parsePostedWhen(video);
  if (!posted) return null;
  const capturedMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedMs)) return null;
  // `postedAt` is the *latest plausible* posting moment, so re-deriving the age
  // from a stored observation cannot inflate it the way the day start would.
  return {
    precision: posted.precision,
    postedAt: new Date(posted.lowerMs).toISOString(),
    ageHoursLower: Math.max(0, (capturedMs - posted.lowerMs) / 3_600_000),
  };
}

/**
 * The interval a pair's posts must clear, in hours, at the export's precision.
 *
 * With day-only post times the earliest possible second post is the next
 * midnight, so 48h is only *provable* from three calendar days apart. Exact
 * timestamps are compared directly.
 */
export function pairIntervalHours(earlier, later) {
  const first = parsePostedWhen(earlier);
  const second = parsePostedWhen(later);
  if (!first || !second) return null;
  const exact = first.precision === "exact" && second.precision === "exact";
  const gapMs = Math.abs(second.atMs - first.atMs);
  // Day precision: subtract the day of slack the timestamps hide.
  const guaranteedMs = exact ? gapMs : gapMs - DAY_MS;
  return { hoursLower: guaranteedMs / 3_600_000, exact, days: gapMs / DAY_MS };
}

/**
 * Map a TikTok details export onto experiment observations.
 *
 * `overrides` is the operator's explicit videoId -> pack map. Without an
 * override, `matchPack(title)` may resolve the pack from caption tokens.
 *
 * Three protocol gates run here rather than in the report, so a pair that
 * breaks the design never reaches the analysis by accident: T+72h maturity,
 * the >=48h publish interval, and the seeded publish order. A violation skips
 * the whole pair and is named in `skipped`; `allowProtocolViolations` records it
 * on the observation instead, for a sensitivity read that stays labelled.
 */
export function ingestDetails({
  experiment,
  assignments,
  details,
  overrides = {},
  matchPack: matcher = null,
  allowProtocolViolations = false,
  maturityHours = MATURITY_HOURS,
} = {}) {
  const capturedAt = details?.fetchedAt || new Date().toISOString();
  const videos = Array.isArray(details?.videos) ? details.videos : [];
  const byPack = new Map(assignments.map((item) => [item.packSlug, item]));
  const candidates = [];
  const skipped = [];
  const seen = new Set();

  for (const video of videos) {
    const videoId = String(video?.videoId ?? "");
    if (!videoId) {
      skipped.push({ videoId: null, reason: "missing videoId" });
      continue;
    }
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    const override = overrides[videoId];
    const matched = override || (matcher ? matcher(video.title || "") : null);
    if (!matched) {
      skipped.push({ videoId, title: video.title || "", reason: "no pack mapping" });
      continue;
    }
    const assignment = byPack.get(matched);
    if (!assignment) {
      skipped.push({
        videoId,
        title: video.title || "",
        packSlug: matched,
        reason: "no assignment for pack",
      });
      continue;
    }
    const age = observationAge(video, capturedAt);
    if (!age) {
      skipped.push({
        videoId,
        title: video.title || "",
        packSlug: matched,
        reason: "post date unknown: cannot verify the T+72h read",
      });
      continue;
    }
    if (age.ageHoursLower < maturityHours) {
      skipped.push({
        videoId,
        title: video.title || "",
        packSlug: matched,
        reason: `too early: lower-bound age ${age.ageHoursLower.toFixed(1)}h < ${maturityHours}h`,
      });
      continue;
    }
    candidates.push({ video, assignment, age });
  }

  const observations = [];
  const protocolViolations = [];
  const blocks = [...new Set(candidates.map((item) => item.assignment.block))].sort();
  for (const block of blocks) {
    const sides = ["A", "B"]
      .map((variant) =>
        candidates.find(
          (item) => item.assignment.block === block && item.assignment.variant === variant,
        ),
      )
      .filter(Boolean);
    // A block has exactly two sides; a re-upload or a repeated export would
    // otherwise disappear without a trace.
    for (const candidate of candidates) {
      if (candidate.assignment.block !== block) continue;
      if (sides.includes(candidate)) continue;
      skipped.push({
        videoId: String(candidate.video.videoId),
        title: candidate.video.title || "",
        packSlug: candidate.assignment.packSlug,
        block,
        reason: `duplicate side: this block already has a ${candidate.assignment.variant} video`,
      });
    }
    const violations = [];
    if (sides.length === 2) {
      const [first, second] = sides
        .slice()
        .sort((x, y) => x.age.postedAt.localeCompare(y.age.postedAt));
      const interval = pairIntervalHours(first.video, second.video);
      // hoursLower already removed the day of slack a date-only export hides,
      // so 48h is the same bar for both precisions.
      if (interval && interval.hoursLower < 48) {
        violations.push(
          `posts are ${interval.hoursLower.toFixed(1)}h apart (lower bound); the design needs 48h` +
            (interval.exact ? "" : " — day-precision dates only prove it from 3 calendar days"),
        );
      }
      const expectedFirst = first.assignment.order === 1 ? first : second;
      if (first.assignment.packSlug !== expectedFirst.assignment.packSlug) {
        violations.push(
          `publish order violated: ${first.assignment.packSlug} (order ${first.assignment.order}) published before ${second.assignment.packSlug} (order ${second.assignment.order})`,
        );
      }
      const durations = sides
        .map((item) => item.assignment.durationSec)
        .filter((value) => Number.isFinite(value));
      if (durations.length === 2) {
        const gap = Math.abs(durations[0] - durations[1]);
        if (gap > MAX_DURATION_GAP_SEC) {
          violations.push(`duration gap ${gap.toFixed(2)}s exceeds ${MAX_DURATION_GAP_SEC}s`);
        }
      }
    }
    if (violations.length > 0 && !allowProtocolViolations) {
      for (const side of sides) {
        skipped.push({
          videoId: String(side.video.videoId),
          title: side.video.title || "",
          packSlug: side.assignment.packSlug,
          block,
          reason: violations.join("; "),
        });
      }
      continue;
    }
    if (violations.length > 0) {
      protocolViolations.push({ block, violations: [...violations] });
    }
    // A block with one mature side stays ingestable: the report names it as an
    // excluded, incomplete block instead of pairing it with nothing.
    for (const side of sides) {
      observations.push(
        normalizeObservation(side.video, side.assignment, capturedAt, {
          postedAt: side.age.postedAt,
          precision: side.age.precision,
          ageHoursLower: side.age.ageHoursLower,
          protocolViolations: violations.length > 0 ? [...violations] : [],
        }),
      );
    }
  }
  return { observations, skipped, protocolViolations };
}

function latestObservation(observations, packSlug) {
  return observations
    .filter((item) => item.packSlug === packSlug)
    .sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")))[0];
}

function valuesFromPairs(pairs, metric) {
  // Filter the pair, not each side independently: dropping only the missing
  // side shifts B and silently compares unrelated videos.
  const aligned = pairs
    .map((pair) => ({ a: pair.a.metrics[metric], b: pair.b.metrics[metric] }))
    .filter(({ a, b }) => Number.isFinite(a) && Number.isFinite(b));
  return {
    a: aligned.map(({ a }) => a),
    b: aligned.map(({ b }) => b),
  };
}

/**
 * Build the report object. No p-values below n=8; no "winner" before the
 * pre-registered n is reached.
 */
export function buildReport({
  experiment,
  assignments,
  observations,
  now = new Date().toISOString(),
} = {}) {
  if (!experiment || !experiment.id) throw new Error("experiment is required");
  const blocks = [...new Set(assignments.map((item) => item.block))].sort();
  const pairs = [];
  const excludedBlocks = [];
  for (const block of blocks) {
    const blockAssignments = assignments.filter((item) => item.block === block);
    const aAssignment = blockAssignments.find((item) => item.variant === "A");
    const bAssignment = blockAssignments.find((item) => item.variant === "B");
    if (!aAssignment || !bAssignment) {
      excludedBlocks.push(block);
      continue;
    }
    const a = latestObservation(observations, aAssignment.packSlug);
    const b = latestObservation(observations, bAssignment.packSlug);
    if (!a || !b) {
      excludedBlocks.push(block);
      continue;
    }
    pairs.push({ block, a, b });
  }

  const primaryMetrics = primaryMetricsOf(experiment);
  const zAlpha = normalQuantile(1 - experiment.alpha / 2);
  const zPower = normalQuantile(experiment.power);

  const shaped = primaryMetrics.map((metric) => {
    const values = valuesFromPairs(pairs, metric);
    const summary = pairedSummary(values.a, values.b);
    const logged = /log/i.test(metric);
    const mdeRaw =
      summary.n > 0
        ? ((zAlpha + zPower) * summary.sdDiff) / Math.sqrt(summary.n)
        : mdeContinuous({
            pairs: experiment.targetPairs,
            alpha: experiment.alpha,
            power: experiment.power,
          }).mdeLog;
    return {
      metric,
      summary,
      logged,
      reportable: summary.n >= REPORT_FLOOR,
      fixedSampleReached: summary.n >= experiment.targetPairs,
      mde: {
        observedSd: summary.sdDiff,
        alpha: experiment.alpha,
        power: experiment.power,
        raw: mdeRaw,
        pct: logged ? Math.exp(mdeRaw) - 1 : null,
        planned: logged
          ? mdeContinuous({
              pairs: experiment.targetPairs,
              alpha: experiment.alpha,
              power: experiment.power,
            })
          : null,
      },
    };
  });

  const nPairs = Math.min(...shaped.map((item) => item.summary.n));
  const reportable = shaped.every((item) => item.reportable);
  // Fixed n, no peeking: one combined gate, so a completed co-primary cannot
  // print a p-value while its sibling is still short of the target.
  const fixedSampleReached = shaped.length > 0 && shaped.every((item) => item.fixedSampleReached);

  const primaries = shaped.map((item) => {
    const tests =
      item.reportable && fixedSampleReached
        ? {
            permutation: pairedPermutation(item.summary.diffs, { seed: experiment.seed }),
            wilcoxon: wilcoxonSignedRank(item.summary.diffs),
            sign: signTest(item.summary.diffs),
            bootstrap: bootstrapCI(item.summary.diffs, {
              seed: experiment.seed,
              iterations: 5000,
            }),
          }
        : null;
    const rejects = tests
      ? Math.max(tests.permutation.p, tests.wilcoxon.p, tests.sign.p) <= experiment.alpha
      : false;
    const decision = tests
      ? rejects && item.summary.meanDiff < 0
        ? "treatment-better"
        : rejects && item.summary.meanDiff > 0
          ? "control-better"
          : "no-difference"
      : null;
    return {
      metric: item.metric,
      n: item.summary.n,
      reportable: item.reportable,
      fixedSampleReached: item.fixedSampleReached,
      tests,
      decision,
      mde: item.mde,
      summary: {
        meanA: item.summary.meanA,
        meanB: item.summary.meanB,
        meanDiff: item.summary.meanDiff,
        medianDiff: item.summary.medianDiff,
        sdDiff: item.summary.sdDiff,
        wins: item.summary.wins,
        losses: item.summary.losses,
        ties: item.summary.ties,
        winRate: item.summary.n > 0 ? item.summary.wins / item.summary.n : 0,
        // A win-rate interval is inference too: it waits for the fixed sample.
        winRateCI:
          item.reportable && fixedSampleReached
            ? wilsonInterval(item.summary.wins, item.summary.n)
            : null,
        relativeEffect:
          item.summary.meanB !== 0 ? item.summary.meanDiff / item.summary.meanB : null,
      },
    };
  });

  // Intersection-union: a treatment has to win every co-primary, which is why
  // two primaries need no multiplicity correction. A pilot below the
  // descriptive floor never gets a verdict at all.
  const decision = !reportable
    ? "descriptive-only"
    : !fixedSampleReached
      ? "interim"
      : primaries.every((item) => item.decision === "treatment-better")
        ? "treatment-better"
        : primaries.every((item) => item.decision === "control-better")
          ? "control-better"
          : primaries.every((item) => item.decision === "no-difference")
            ? "no-difference"
            : "mixed";

  const lead = primaries[0];

  const secondary = (experiment.secondaryMetrics || []).map((metric) => {
    const values = valuesFromPairs(pairs, metric);
    const paired = pairedSummary(values.a, values.b);
    // A secondary metric may have fewer complete pairs than the primary. It
    // earns a p-value on its own sample size, never on the primary's, and only
    // once the fixed sample has been read.
    const p =
      paired.n >= REPORT_FLOOR && fixedSampleReached
        ? pairedPermutation(paired.diffs, { seed: experiment.seed }).p
        : null;
    return {
      metric,
      n: paired.n,
      meanA: paired.meanA,
      meanB: paired.meanB,
      meanDiff: paired.meanDiff,
      p,
      pAdjusted: null,
    };
  });
  if (secondary.length > 0) {
    // Keep the pre-registered family intact: an untestable secondary enters
    // BH as p=1 instead of shrinking the denominator and making its siblings
    // look more significant.
    const adjusted = bhFdr(
      secondary.map((item) => item.p ?? 1),
      experiment.alpha,
    );
    secondary.forEach((item, index) => {
      if (item.p === null) return;
      item.pAdjusted = adjusted.adjusted[index];
      item.rejected = adjusted.rejected[index];
    });
  }

  const status = !reportable
    ? "descriptive-only"
    : fixedSampleReached
      ? "fixed-sample"
      : "interim-no-decision";
  const limitations = [
    "Matched-pair blocks are not an RCT: assignment is within-topic, and the unit of analysis is the video pair, not the view.",
    "TikTok has no organic post A/B surface; this is a matched-pair field comparison, not a platform randomized experiment.",
    "T+72h is enforced at ingest: a post younger than 72h (lower bound, post dates carry day precision) is skipped, not read early. T+7d stays a sensitivity check, not a second chance to find significance.",
    "Small n detects structural differences only. At n=20, rho=.5, the planning MDE is about +28% on log watch time; +10% would need roughly 80 pairs.",
  ];
  if (!reportable)
    limitations.unshift(
      "n<8: descriptive only. No p-value, confidence interval, or winner claim is printed.",
    );
  if (reportable && !fixedSampleReached) {
    limitations.unshift(
      `Pre-registered n is ${experiment.targetPairs}; this report is at n=${nPairs}. Inference is withheld until the fixed sample is complete: fixed n, no peeking.`,
    );
  }

  return {
    experimentId: experiment.id,
    generatedAt: now,
    design: experiment.design,
    hypothesis: experiment.hypothesis,
    factor: experiment.factor,
    primaryMetric: lead.metric,
    primaryMetrics,
    variants: experiment.variants,
    targetPairs: experiment.targetPairs,
    nPairs,
    nAssignments: assignments.length,
    excludedBlocks,
    reportable,
    fixedSampleReached,
    status,
    decision,
    primaries,
    // The lead primary stays at the top level so existing readers keep working.
    summary: lead.summary,
    tests: lead.tests,
    mde: lead.mde,
    secondary,
    pairs: pairs.map((pair) => ({
      block: pair.block,
      a: {
        videoId: pair.a.videoId,
        postedOn: pair.a.postedOn,
        value: pair.a.metrics[lead.metric],
      },
      b: {
        videoId: pair.b.videoId,
        postedOn: pair.b.postedOn,
        value: pair.b.metrics[lead.metric],
      },
    })),
    limitations,
  };
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function num(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

/**
 * Structural audit of an experiment directory, meant to run before a read.
 *
 * The report already refuses to infer at an interim n, but a record can go
 * wrong *before* that: an observation for a pack that was never assigned, the
 * same video ingested twice, a post stored while younger than T+72h, a block
 * whose durations drifted apart. `check` turns those into a non-zero exit so a
 * read is never built on a broken record.
 *
 * @returns {{experimentId: string, ok: boolean, findings: object[], completeBlocks: number, targetPairs: number}}
 */
export function checkExperiment({
  experiment,
  assignments = [],
  observations = [],
  maturityHours = MATURITY_HOURS,
} = {}) {
  if (!experiment || !experiment.id) throw new Error("experiment is required");
  const findings = [];
  const push = (level, code, detail, ref = null) => findings.push({ level, code, detail, ref });
  const primaries = primaryMetricsOf(experiment);

  const byBlock = new Map();
  for (const assignment of assignments) {
    const list = byBlock.get(assignment.block) ?? [];
    list.push(assignment);
    byBlock.set(assignment.block, list);
  }
  for (const [block, list] of byBlock) {
    if (list.length > 2) {
      push("error", "block-overflow", `${list.length} packs in one block`, block);
    }
    if (new Set(list.map((item) => item.variant)).size !== list.length) {
      push("error", "variant-collision", "two packs share a variant", block);
    }
    if (list.length < 2) push("warn", "incomplete-block", "block has one pack", block);
    const durations = list
      .map((item) => item.durationSec)
      .filter((value) => Number.isFinite(value));
    if (durations.length === 2) {
      const gap = Math.abs(durations[0] - durations[1]);
      if (gap > MAX_DURATION_GAP_SEC) {
        push(
          "error",
          "duration-gap",
          `gap ${gap.toFixed(2)}s exceeds ${MAX_DURATION_GAP_SEC}s`,
          block,
        );
      }
    }
  }

  const assignmentKeys = new Set(assignments.map((item) => `${item.block}\u0000${item.packSlug}`));
  const seenVideos = new Set();
  for (const observation of observations) {
    const ref = String(observation.videoId ?? "");
    if (seenVideos.has(ref)) push("error", "duplicate-video", "video ingested twice", ref);
    seenVideos.add(ref);
    const key = `${observation.block}\u0000${observation.packSlug}`;
    if (!assignmentKeys.has(key)) {
      push("error", "unassigned-observation", "no assignment for this block/pack", ref);
    }
    const age = observationAge(
      { postedAt: observation.postedAt, postedOn: observation.postedOn },
      observation.capturedAt,
    );
    const ageHours = age ? age.ageHoursLower : observation.ageHoursLower;
    if (!Number.isFinite(ageHours)) {
      push("warn", "age-unknown", "post time missing; maturity cannot be verified", ref);
    } else if (ageHours < maturityHours) {
      push(
        "error",
        "immature-observation",
        `stored at a lower-bound age of ${ageHours.toFixed(1)}h < ${maturityHours}h`,
        ref,
      );
    }
    if (
      Array.isArray(observation.protocolViolations) &&
      observation.protocolViolations.length > 0
    ) {
      push("warn", "protocol-violation", observation.protocolViolations.join("; "), ref);
    }
    for (const metric of primaries) {
      if (!Number.isFinite(observation.metrics?.[metric])) {
        push("warn", "missing-primary-value", `no \`${metric}\` value`, ref);
      }
    }
  }

  let completeBlocks = 0;
  const blocks = [...byBlock.keys()].sort();
  for (const block of blocks) {
    const list = byBlock.get(block);
    const has = (variant) =>
      list.some(
        (item) =>
          item.variant === variant &&
          observations.some(
            (observation) => observation.block === block && observation.packSlug === item.packSlug,
          ),
      );
    if (has("A") && has("B")) completeBlocks++;
  }
  const targetPairs = Number(experiment.targetPairs) || 0;
  if (completeBlocks < targetPairs) {
    push(
      "warn",
      "fixed-sample-incomplete",
      `${completeBlocks}/${targetPairs} complete pairs: inference stays withheld`,
    );
  }

  return {
    experimentId: experiment.id,
    ok: !findings.some((item) => item.level === "error"),
    findings,
    completeBlocks,
    targetPairs,
  };
}

/** Markdown report, written next to the experiment. */
export function renderReportMarkdown(report) {
  const lines = [];
  lines.push(`# Layout experiment — ${report.experimentId}`);
  lines.push("");
  lines.push("> Matched-pair field comparison. Not an RCT.");
  lines.push("");
  lines.push(`- **Hypothesis**: ${report.hypothesis}`);
  lines.push(`- **Factor**: ${report.factor}`);
  const primaries = Array.isArray(report.primaries) ? report.primaries : [];
  const primaryList =
    primaries.length > 0 ? primaries.map((item) => item.metric) : [report.primaryMetric];
  lines.push(
    primaryList.length > 1
      ? `- **Primary metrics** (co-primary, both must win): ${primaryList.map((metric) => `\`${metric}\``).join(", ")}`
      : `- **Primary metric**: \`${primaryList[0]}\``,
  );
  if (report.decision) lines.push(`- **Decision**: \`${report.decision}\``);
  lines.push(`- **Variants**: A = ${report.variants.A}; B = ${report.variants.B}`);
  lines.push(`- **Status**: \`${report.status}\``);
  lines.push(
    `- **Sample**: ${report.nPairs} complete pairs / ${report.targetPairs} pre-registered; ${report.nAssignments} assignments`,
  );
  lines.push(`- **Generated**: ${report.generatedAt}`);
  if (report.excludedBlocks.length > 0) {
    lines.push(`- **Excluded blocks** (missing one side): ${report.excludedBlocks.join(", ")}`);
  }
  lines.push("");
  lines.push("## Primary result");
  lines.push("");
  lines.push("| metric | n | mean A | mean B | A − B | wins/losses/ties | win rate (Wilson 95%) |");
  lines.push("| --- | ---: | ---: | ---: | ---: | --- | --- |");
  for (const item of primaries) {
    const summary = item.summary;
    const winRate = summary.winRateCI
      ? `${pct(summary.winRate)} (${pct(summary.winRateCI.low)}–${pct(summary.winRateCI.high)})`
      : pct(summary.winRate);
    lines.push(
      `| ${item.metric} | ${item.n} | ${num(summary.meanA)} | ${num(summary.meanB)} | ${num(summary.meanDiff)} | ${summary.wins}/${summary.losses}/${summary.ties} | ${winRate} |`,
    );
  }
  lines.push("");
  const tested = primaries.filter((item) => item.tests);
  if (tested.length > 0) {
    for (const item of tested) {
      lines.push(`### Tests — \`${item.metric}\``);
      lines.push("");
      lines.push("| test | p | method |");
      lines.push("| --- | ---: | --- |");
      lines.push(
        `| Permutation (sign-flip) | ${num(item.tests.permutation.p)} | ${item.tests.permutation.method} |`,
      );
      lines.push(
        `| Wilcoxon signed-rank | ${num(item.tests.wilcoxon.p)} | ${item.tests.wilcoxon.method} |`,
      );
      lines.push(`| Sign test | ${num(item.tests.sign.p)} | exact binomial |`);
      lines.push(
        `| Bootstrap 95% CI of mean difference | ${num(item.tests.bootstrap.low)} – ${num(item.tests.bootstrap.high)} | ${item.tests.bootstrap.iterations} resamples |`,
      );
      lines.push("");
    }
  } else if (!report.reportable) {
    lines.push(
      "**No primary test is printed at n<8.** The primary table above is descriptive only; a secondary metric prints a p-value only when its own paired n reaches 8.",
    );
    lines.push("");
  } else {
    lines.push(
      `**Inference withheld at interim.** The pre-registered sample is ${report.targetPairs} pairs; this report holds ${report.nPairs}. Fixed n, no peeking: p-values, confidence intervals and the decision appear only once the fixed sample is complete.`,
    );
    lines.push("");
  }
  lines.push("## Pairs");
  lines.push("");
  lines.push("| block | A video | A value | B video | B value | A − B |");
  lines.push("| --- | --- | ---: | --- | ---: | ---: |");
  for (const pair of report.pairs) {
    const diff =
      Number.isFinite(pair.a.value) && Number.isFinite(pair.b.value)
        ? pair.a.value - pair.b.value
        : null;
    lines.push(
      `| ${pair.block} | ${pair.a.videoId} | ${num(pair.a.value)} | ${pair.b.videoId} | ${num(pair.b.value)} | ${diff === null ? "—" : num(diff)} |`,
    );
  }
  lines.push("");
  if (report.secondary.length > 0) {
    lines.push("## Secondary metrics (BH-FDR)");
    lines.push("");
    lines.push("| metric | n | mean A | mean B | mean diff | p | p adjusted |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const item of report.secondary) {
      lines.push(
        `| ${item.metric} | ${item.n} | ${num(item.meanA)} | ${num(item.meanB)} | ${num(item.meanDiff)} | ${num(item.p)} | ${num(item.pAdjusted)} |`,
      );
    }
    lines.push("");
  }
  lines.push("## MDE");
  lines.push("");
  lines.push(
    `- Observed paired SD: ${num(report.mde.observedSd)}; at alpha=${report.mde.alpha}, power=${report.mde.power}, the detectable effect at this n is ${num(report.mde.raw)} (log/raw scale).`,
  );
  if (report.mde.pct != null) lines.push(`- On a ratio scale: ${pct(report.mde.pct)}.`);
  if (report.mde.planned) {
    lines.push(
      `- Planned at n=${report.mde.planned.pairs}, rho=${report.mde.planned.rho}: ${num(report.mde.planned.mdeLog)} (${pct(report.mde.planned.pct)}).`,
    );
  } else {
    lines.push(
      `- Planned MDE is only modelled for log-scale primaries; this metric is on its own scale.`,
    );
  }
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push("");
  lines.push(
    "_Generated by `scripts/short-video/experiment.mjs`; observations are paired by topic block and read at T+72h._",
  );
  lines.push("");
  return lines.join("\n");
}

export function loadExperiment(experimentsDir, id) {
  const file = join(experimentsDir, id, "experiment.json");
  if (!existsSync(file)) throw new Error(`experiment "${id}" not found at ${file}`);
  return readJson(file);
}

export function loadAssignments(experimentsDir, id) {
  return readJsonl(join(experimentsDir, id, "assignments.jsonl"));
}

export function loadObservations(experimentsDir, id) {
  return readJsonl(join(experimentsDir, id, "observations.jsonl"));
}

export function saveAssignments(experimentsDir, id, assignments) {
  writeJsonl(join(experimentsDir, id, "assignments.jsonl"), assignments);
}

export function saveObservations(experimentsDir, id, observations) {
  writeJsonl(join(experimentsDir, id, "observations.jsonl"), observations);
}

/** Upsert by videoId, keeping the newest capturedAt. */
export function upsertObservations(existing, incoming) {
  const byId = new Map(existing.map((item) => [item.videoId, item]));
  for (const item of incoming) {
    const current = byId.get(item.videoId);
    if (!current || String(item.capturedAt || "") >= String(current.capturedAt || "")) {
      byId.set(item.videoId, item);
    }
  }
  return [...byId.values()].sort(
    (a, b) => a.block.localeCompare(b.block) || a.variant.localeCompare(b.variant),
  );
}

async function loadPackIndex(contentRoot) {
  const packs = [];
  if (!existsSync(contentRoot)) return packs;
  for (const slug of readdirSync(contentRoot)) {
    const scenePath = join(contentRoot, slug, "scene-data.mjs");
    if (!existsSync(scenePath)) continue;
    try {
      const mod = await import(pathToFileURL(scenePath).href);
      const scenes = mod.scenes || mod.default?.scenes || [];
      const metadata = mod.metadata || mod.default?.metadata || null;
      const metaPath = join(contentRoot, slug, "meta.mjs");
      let meta = null;
      if (existsSync(metaPath)) {
        try {
          meta = (await import(pathToFileURL(metaPath).href)).meta || null;
        } catch {
          /* scenes + metadata remain usable */
        }
      }
      packs.push({ slug, tokens: packTokens(scenes, metadata, meta) });
    } catch {
      /* an unreadable pack is skipped, not fatal to ingestion */
    }
  }
  return packs;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, maps: [] };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--map") {
      const [videoId, slug] = String(rest[++i] ?? "").split("=");
      if (videoId && slug) options.maps.push([videoId, slug]);
    } else if (arg === "--secondary") {
      options.secondary = options.secondary || [];
      options.secondary.push(rest[++i]);
    } else if (arg === "--primary-metric") {
      options.primaries = options.primaries || [];
      options.primaries.push(rest[++i]);
    } else if (arg === "--allow-protocol-violations") {
      options.allowProtocolViolations = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      options[key] = rest[++i];
    }
  }
  return options;
}

function experimentsDirFrom(options) {
  return options["experiments-dir"] ? resolve(options["experiments-dir"]) : EXPERIMENTS_DIR;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dir = experimentsDirFrom(options);
  if (!options.command || ["help", "--help", "-h"].includes(options.command)) {
    console.log(
      readFileSync(__filename, "utf8")
        .split("*/")[0]
        .replace(/^#!.*\n/, ""),
    );
    return;
  }

  if (options.command === "create") {
    const record = createExperiment({
      id: options.id,
      hypothesis: options.hypothesis,
      factor: options.factor,
      primaryMetrics: options.primaries,
      secondaryMetrics: options.secondary || [],
      targetPairs: options.pairs ? Number(options.pairs) : 20,
      alpha: options.alpha ? Number(options.alpha) : 0.05,
      power: options.power ? Number(options.power) : 0.8,
      seed: options.seed ? Number(options.seed) : 20260101,
      variants:
        options["variant-a"] || options["variant-b"]
          ? { A: options["variant-a"] || "control", B: options["variant-b"] || "treatment" }
          : undefined,
      notes: options.notes || "",
    });
    const file = join(dir, record.id, "experiment.json");
    if (existsSync(file)) throw new Error(`experiment "${record.id}" already exists at ${file}`);
    writeJson(file, record);
    console.log(`✅ Registered ${record.id} at ${file}`);
    return;
  }

  if (options.command === "assign") {
    const id = options.experiment;
    const experiment = loadExperiment(dir, id);
    const assignments = loadAssignments(dir, id);
    const assignment = chooseAssignment({
      experiment,
      existing: assignments,
      block: options.block,
      packSlug: options.pack,
      variant: options.variant || null,
      durationSec: options.duration ?? null,
    });
    if (
      !assignments.some(
        (item) => item.block === assignment.block && item.packSlug === assignment.packSlug,
      )
    ) {
      assignments.push(assignment);
      saveAssignments(dir, id, assignments);
    }
    console.log(
      `✅ ${id}: ${assignment.block} / ${assignment.packSlug} -> ${assignment.variant} (order ${assignment.order})`,
    );
    return;
  }

  if (options.command === "ingest") {
    const id = options.experiment;
    const experiment = loadExperiment(dir, id);
    const assignments = loadAssignments(dir, id);
    if (!options.details) throw new Error("--details is required");
    const details = readJson(resolve(options.details));
    const overrides = Object.fromEntries(options.maps);
    const contentRoot = options["content-root"] ? resolve(options["content-root"]) : CONTENT_DIR;
    const packs = await loadPackIndex(contentRoot);
    const matcher = (title) => matchPack(title, packs)?.slug ?? null;
    const { observations, skipped, protocolViolations } = ingestDetails({
      experiment,
      assignments,
      details,
      overrides,
      matchPack: matcher,
      allowProtocolViolations: Boolean(options.allowProtocolViolations),
    });
    const before = loadObservations(dir, id);
    const merged = upsertObservations(before, observations);
    saveObservations(dir, id, merged);
    console.log(`✅ ${id}: ${observations.length} observations ingested, ${merged.length} total`);
    for (const item of skipped) {
      console.log(
        `   skip ${item.videoId ?? "(no id)"} — ${item.reason}${item.packSlug ? ` (${item.block ? `${item.block}/` : ""}${item.packSlug})` : ""}`,
      );
    }
    for (const item of protocolViolations) {
      console.log(
        `   ⚠️  ${item.block} ingested as a labelled protocol violation: ${item.violations.join("; ")}`,
      );
    }
    return;
  }

  if (options.command === "check") {
    const id = options.experiment;
    const experiment = loadExperiment(dir, id);
    const result = checkExperiment({
      experiment,
      assignments: loadAssignments(dir, id),
      observations: loadObservations(dir, id),
    });
    const icon = result.ok ? "✅" : "❌";
    console.log(
      `${icon} ${result.experimentId}: ${result.completeBlocks}/${result.targetPairs} complete pairs, ${result.findings.length} finding(s)`,
    );
    for (const finding of result.findings) {
      console.log(
        `   [${finding.level}] ${finding.code}: ${finding.detail}${finding.ref ? ` (${finding.ref})` : ""}`,
      );
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (options.command === "report") {
    const id = options.experiment;
    const experiment = loadExperiment(dir, id);
    const assignments = loadAssignments(dir, id);
    const observations = loadObservations(dir, id);
    // A broken record never becomes a readable report: an unassigned,
    // duplicated or still-immature observation would silently enter the pairing.
    const audit = checkExperiment({ experiment, assignments, observations });
    if (!audit.ok) {
      const errors = audit.findings.filter((item) => item.level === "error");
      throw new Error(
        `record fails the integrity check (${errors
          .map((item) => `${item.code}${item.ref ? ` ${item.ref}` : ""}`)
          .join(", ")}); run \`check\` for the full list`,
      );
    }
    const report = buildReport({ experiment, assignments, observations });
    const out = options.out ? resolve(options.out) : join(dir, id, "report.md");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderReportMarkdown(report), "utf8");
    writeJson(out.replace(/\.md$/, ".json"), report);
    console.log(renderReportMarkdown(report));
    console.log(`✅ Wrote ${out}`);
    return;
  }

  if (options.command === "power") {
    if (options.pairs) {
      const result = mdeContinuous({
        pairs: Number(options.pairs),
        rho: options.rho ? Number(options.rho) : 0.5,
        sigma: options.sigma ? Number(options.sigma) : 0.4,
        alpha: options.alpha ? Number(options.alpha) : 0.05,
        power: options.power ? Number(options.power) : 0.8,
      });
      console.log(
        `n=${result.pairs} rho=${result.rho} sigma=${result.sigma}: MDE=${result.mdeLog.toFixed(3)} log (${(result.pct * 100).toFixed(1)}%)`,
      );
      return;
    }
    console.log("pairs  rho=0   rho=.5  rho=.7  rho=.8");
    for (const pairs of [10, 20, 40, 80]) {
      const cells = [0, 0.5, 0.7, 0.8].map((rho) => {
        const result = mdeContinuous({ pairs, rho, sigma: 0.4 });
        return `${(result.pct * 100).toFixed(0)}%`.padEnd(7);
      });
      console.log(`${String(pairs).padEnd(6)} ${cells.join(" ")}`);
    }
    return;
  }

  if (options.command === "status") {
    if (!existsSync(dir)) {
      console.log("No experiments directory yet.");
      return;
    }
    for (const id of readdirSync(dir).sort()) {
      const file = join(dir, id, "experiment.json");
      if (!existsSync(file)) continue;
      const experiment = readJson(file);
      const assignments = loadAssignments(dir, id);
      const observations = loadObservations(dir, id);
      const blocks = new Set(assignments.map((item) => item.block));
      const complete = [...blocks].filter((block) => {
        const variants = new Set(
          assignments.filter((item) => item.block === block).map((item) => item.variant),
        );
        return variants.has("A") && variants.has("B");
      }).length;
      console.log(
        `${id}: ${assignments.length} assignments, ${complete}/${experiment.targetPairs} complete blocks, ${observations.length} observations, status=${experiment.status}`,
      );
    }
    return;
  }

  throw new Error(`unknown command "${options.command}"`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
