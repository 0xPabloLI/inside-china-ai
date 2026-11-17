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
 *   node scripts/short-video/experiment.mjs assign --experiment <id> --block <topic> --pack <slug>
 *   node scripts/short-video/experiment.mjs ingest --experiment <id> --details <path> [--map videoId=slug]
 *   node scripts/short-video/experiment.mjs report --experiment <id> [--out <path>]
 *   node scripts/short-video/experiment.mjs power [--pairs 20] [--rho 0.5]
 *   node scripts/short-video/experiment.mjs status
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
const REPORT_FLOOR = 8;

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

/**
 * Create a pre-registered experiment record. Idempotence is the caller's job:
 * the CLI refuses to overwrite an existing registration.
 */
export function createExperiment({
  id,
  hypothesis,
  factor,
  primaryMetric = "fullVideoWatchedRate",
  secondaryMetrics = ["logAvgWatchTimeSec"],
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
  return {
    id: cleanId,
    createdAt: now,
    hypothesis: cleanHypothesis,
    factor: cleanFactor,
    primaryMetric,
    secondaryMetrics: Array.isArray(secondaryMetrics) ? [...secondaryMetrics] : [],
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

  if (current.length === 1) {
    const other = current[0].variant === "A" ? "B" : "A";
    if (override && override !== other) {
      throw new Error(`the second pack in "${cleanBlock}" must be the opposite variant (${other})`);
    }
    return {
      experimentId: experiment.id,
      block: cleanBlock,
      packSlug: cleanPack,
      variant: other,
      order: current[0].order === 1 ? 2 : 1,
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
    assignedAt: now,
  };
}

function normalizeRate(value) {
  if (!Number.isFinite(value)) return null;
  const rate = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, rate));
}

function normalizeObservation(video, assignment, capturedAt) {
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

/**
 * Map a TikTok details export onto experiment observations.
 *
 * `overrides` is the operator's explicit videoId -> pack map. Without an
 * override, `matchPack(title)` may resolve the pack from caption tokens.
 */
export function ingestDetails({
  experiment,
  assignments,
  details,
  overrides = {},
  matchPack: matcher = null,
} = {}) {
  const capturedAt = details?.fetchedAt || new Date().toISOString();
  const videos = Array.isArray(details?.videos) ? details.videos : [];
  const byPack = new Map(assignments.map((item) => [item.packSlug, item]));
  const observations = [];
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
    observations.push(normalizeObservation(video, assignment, capturedAt));
  }
  return { observations, skipped };
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

  const primary = valuesFromPairs(pairs, experiment.primaryMetric);
  const summary = pairedSummary(primary.a, primary.b);
  const reportable = summary.n >= REPORT_FLOOR;
  const fixedSampleReached = summary.n >= experiment.targetPairs;
  const tests = reportable
    ? {
        permutation: pairedPermutation(summary.diffs, { seed: experiment.seed }),
        wilcoxon: wilcoxonSignedRank(summary.diffs),
        sign: signTest(summary.diffs),
        bootstrap: bootstrapCI(summary.diffs, { seed: experiment.seed, iterations: 5000 }),
      }
    : null;

  const zAlpha = normalQuantile(1 - experiment.alpha / 2);
  const zPower = normalQuantile(experiment.power);
  const mdeRaw =
    summary.n > 0
      ? ((zAlpha + zPower) * summary.sdDiff) / Math.sqrt(summary.n)
      : mdeContinuous({
          pairs: experiment.targetPairs,
          alpha: experiment.alpha,
          power: experiment.power,
        }).mdeLog;
  const mde = {
    observedSd: summary.sdDiff,
    alpha: experiment.alpha,
    power: experiment.power,
    raw: mdeRaw,
    pct: /log/i.test(experiment.primaryMetric) ? Math.exp(mdeRaw) - 1 : null,
    planned: mdeContinuous({
      pairs: experiment.targetPairs,
      alpha: experiment.alpha,
      power: experiment.power,
    }),
  };

  const secondary = (experiment.secondaryMetrics || []).map((metric) => {
    const values = valuesFromPairs(pairs, metric);
    const paired = pairedSummary(values.a, values.b);
    // A secondary metric may have fewer complete pairs than the primary. It
    // earns a p-value on its own sample size, never on the primary's.
    const p =
      paired.n >= REPORT_FLOOR
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
    "Read the primary outcome at T+72h; T+7d is a sensitivity check, not a second chance to find significance.",
    "Small n detects structural differences only. At n=20, rho=.5, the planning MDE is about +28% on log watch time; +10% would need roughly 80 pairs.",
  ];
  if (!reportable)
    limitations.unshift(
      "n<8: descriptive only. No p-value, confidence interval, or winner claim is printed.",
    );
  if (reportable && !fixedSampleReached) {
    limitations.unshift(
      `Pre-registered n is ${experiment.targetPairs}; this report is at n=${summary.n}. It is directional and cannot close the experiment.`,
    );
  }

  return {
    experimentId: experiment.id,
    generatedAt: now,
    design: experiment.design,
    hypothesis: experiment.hypothesis,
    factor: experiment.factor,
    primaryMetric: experiment.primaryMetric,
    variants: experiment.variants,
    targetPairs: experiment.targetPairs,
    nPairs: summary.n,
    nAssignments: assignments.length,
    excludedBlocks,
    reportable,
    fixedSampleReached,
    status,
    summary: {
      meanA: summary.meanA,
      meanB: summary.meanB,
      meanDiff: summary.meanDiff,
      medianDiff: summary.medianDiff,
      sdDiff: summary.sdDiff,
      wins: summary.wins,
      losses: summary.losses,
      ties: summary.ties,
      winRate: summary.n > 0 ? summary.wins / summary.n : 0,
      winRateCI: reportable ? wilsonInterval(summary.wins, summary.n) : null,
      relativeEffect: summary.meanB !== 0 ? summary.meanDiff / summary.meanB : null,
    },
    tests,
    mde,
    secondary,
    pairs: pairs.map((pair) => ({
      block: pair.block,
      a: {
        videoId: pair.a.videoId,
        postedOn: pair.a.postedOn,
        value: pair.a.metrics[experiment.primaryMetric],
      },
      b: {
        videoId: pair.b.videoId,
        postedOn: pair.b.postedOn,
        value: pair.b.metrics[experiment.primaryMetric],
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

/** Markdown report, written next to the experiment. */
export function renderReportMarkdown(report) {
  const lines = [];
  lines.push(`# Layout experiment — ${report.experimentId}`);
  lines.push("");
  lines.push("> Matched-pair field comparison. Not an RCT.");
  lines.push("");
  lines.push(`- **Hypothesis**: ${report.hypothesis}`);
  lines.push(`- **Factor**: ${report.factor}`);
  lines.push(`- **Primary metric**: \`${report.primaryMetric}\``);
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
  lines.push("| | A | B | A − B |");
  lines.push("| --- | ---: | ---: | ---: |");
  lines.push(
    `| mean | ${num(report.summary.meanA)} | ${num(report.summary.meanB)} | ${num(report.summary.meanDiff)} |`,
  );
  lines.push(`| median paired difference | | | ${num(report.summary.medianDiff)} |`);
  lines.push(
    `| wins / losses / ties | ${report.summary.wins} | ${report.summary.losses} | ${report.summary.ties} |`,
  );
  lines.push(
    report.summary.winRateCI
      ? `| win rate (Wilson 95%) | | | ${pct(report.summary.winRate)} (${pct(report.summary.winRateCI.low)}–${pct(report.summary.winRateCI.high)}) |`
      : `| win rate | | | ${pct(report.summary.winRate)} |`,
  );
  lines.push("");
  if (report.tests) {
    lines.push("| test | p | method |");
    lines.push("| --- | ---: | --- |");
    lines.push(
      `| Permutation (sign-flip) | ${num(report.tests.permutation.p)} | ${report.tests.permutation.method} |`,
    );
    lines.push(
      `| Wilcoxon signed-rank | ${num(report.tests.wilcoxon.p)} | ${report.tests.wilcoxon.method} |`,
    );
    lines.push(`| Sign test | ${num(report.tests.sign.p)} | exact binomial |`);
    lines.push(
      `| Bootstrap 95% CI of mean difference | ${num(report.tests.bootstrap.low)} – ${num(report.tests.bootstrap.high)} | ${report.tests.bootstrap.iterations} resamples |`,
    );
    lines.push("");
  } else {
    lines.push(
      "**No primary test is printed at n<8.** The primary table above is descriptive only; a secondary metric prints a p-value only when its own paired n reaches 8.",
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
  lines.push(
    `- Planned at n=${report.mde.planned.pairs}, rho=${report.mde.planned.rho}: ${num(report.mde.planned.mdeLog)} (${pct(report.mde.planned.pct)}).`,
  );
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
      primaryMetric: options["primary-metric"] || "fullVideoWatchedRate",
      secondaryMetrics: options.secondary || ["logAvgWatchTimeSec"],
      targetPairs: options.pairs ? Number(options.pairs) : 20,
      alpha: options.alpha ? Number(options.alpha) : 0.05,
      power: options.power ? Number(options.power) : 0.8,
      seed: options.seed ? Number(options.seed) : 20260101,
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
    const { observations, skipped } = ingestDetails({
      experiment,
      assignments,
      details,
      overrides,
      matchPack: matcher,
    });
    const before = loadObservations(dir, id);
    const merged = upsertObservations(before, observations);
    saveObservations(dir, id, merged);
    console.log(`✅ ${id}: ${observations.length} observations ingested, ${merged.length} total`);
    for (const item of skipped) {
      console.log(
        `   skip ${item.videoId ?? "(no id)"} — ${item.reason}${item.packSlug ? ` (${item.packSlug})` : ""}`,
      );
    }
    return;
  }

  if (options.command === "report") {
    const id = options.experiment;
    const experiment = loadExperiment(dir, id);
    const assignments = loadAssignments(dir, id);
    const observations = loadObservations(dir, id);
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
