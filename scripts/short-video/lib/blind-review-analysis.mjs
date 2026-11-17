/**
 * Blind-review analysis for layout experiments (#1398).
 *
 * The packet (`experiment-review.mjs --manifest`) collects 1–7 scores per side
 * plus a preference, and keeps the left/right → variant mapping in a separate
 * `key.json`. This module joins the two and reports:
 *
 *   - per-dimension means per variant, the A−B difference with a bootstrap CI,
 *     and the pair-level sign / Wilcoxon tests;
 *   - preference votes by variant with a Wilson interval;
 *   - ICC(2,1) across raters on the A−B difference, when there is more than one
 *     rater (a single rater has no agreement to measure).
 *
 * Everything above the pair count floor is descriptive: with fewer than 8 pairs
 * the tests cannot separate a real effect from noise, so the report says so
 * instead of naming a winner. Pure functions only — the CLI does the file I/O.
 */

import {
  bootstrapCI,
  pairedSummary,
  signTest,
  wilcoxonSignedRank,
  wilsonInterval,
} from "./experiment-stats.mjs";

/** Keep in step with `REPORT_FLOOR` in `experiment.mjs`: below this, no test. */
const MIN_PAIRS_FOR_TEST = 8;

/**
 * The four 1–7 dimensions. The packet renders these labels, so keeping the list
 * here is what stops the form and the analysis from drifting apart.
 */
export const REVIEW_DIMENSIONS = [
  { key: "clarity", label: "Clarity — can I tell what the chart says?" },
  { key: "credibility", label: "Credibility — does it look like a sourced claim?" },
  { key: "memorability", label: "Memorability — would I remember the number?" },
  { key: "hierarchy", label: "Visual hierarchy — is there one obvious focal point?" },
];

const DIMENSIONS = REVIEW_DIMENSIONS.map((dimension) => dimension.key);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreFor(record, keyPair, dimension, variant) {
  const ratings = record?.ratings?.[dimension];
  if (!ratings) return null;
  const side = keyPair.left === variant ? "left" : keyPair.right === variant ? "right" : null;
  if (!side) return null;
  const value = ratings[side];
  return isFiniteNumber(value) ? value : null;
}

function preferenceVariant(record, keyPair) {
  const preference = record?.preference;
  if (preference === "left") return keyPair.left;
  if (preference === "right") return keyPair.right;
  return null;
}

/**
 * Two-way random-effects, absolute-agreement, single-measure ICC: ICC(2,1).
 *
 * @param {number[][]} columns one column per rater, one row per pair
 */
export function icc21(columns) {
  const raters = columns.length;
  const rows = columns[0]?.length ?? 0;
  if (raters < 2 || rows < 2) return null;
  const grand =
    columns.reduce((sum, column) => sum + column.reduce((a, b) => a + b, 0), 0) / (raters * rows);
  const rowMeans = [];
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (const column of columns) sum += column[i];
    rowMeans.push(sum / raters);
  }
  const raterMeans = columns.map((column) => column.reduce((a, b) => a + b, 0) / rows);
  let ssRows = 0;
  for (const value of rowMeans) ssRows += (value - grand) ** 2;
  ssRows *= raters;
  let ssRaters = 0;
  for (const value of raterMeans) ssRaters += (value - grand) ** 2;
  ssRaters *= rows;
  let ssError = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < raters; j++) {
      ssError += (columns[j][i] - rowMeans[i] - raterMeans[j] + grand) ** 2;
    }
  }
  const msRows = ssRows / (rows - 1);
  const msRaters = ssRaters / (raters - 1);
  const msError = ssError / ((rows - 1) * (raters - 1));
  const denominator = msRows + (raters - 1) * msError + (raters * (msRaters - msError)) / rows;
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return (msRows - msError) / denominator;
}

function formatNumber(value, digits = 2) {
  return isFiniteNumber(value) ? value.toFixed(digits) : "—";
}

function formatP(value) {
  if (!isFiniteNumber(value)) return "—";
  return value < 0.001 ? "<0.001" : value.toFixed(3);
}

/**
 * @param {{
 *   exports: Array<{source: string, experimentId: string, pairs: Record<string, object>}>,
 *   key: {experimentId: string, seed?: number, pairs: Array<{pairId: string, block?: string, left: "A"|"B", right: "A"|"B"}>},
 *   labels?: {A?: string, B?: string},
 * }} input
 */
export function analyzeBlindReview({ exports, key, labels = {} } = {}) {
  if (!Array.isArray(exports) || exports.length === 0) {
    throw new Error("at least one review export is required");
  }
  if (!key || !Array.isArray(key.pairs) || key.pairs.length === 0) {
    throw new Error("key.pairs must contain at least one pair");
  }
  const experimentId = String(key.experimentId || "").trim();
  if (!experimentId) throw new Error("key.experimentId is required");
  for (const entry of exports) {
    if (String(entry.experimentId || "").trim() !== experimentId) {
      throw new Error(
        `${entry.source}: experimentId ${JSON.stringify(entry.experimentId)} does not match key ${JSON.stringify(experimentId)}`,
      );
    }
    for (const pairId of Object.keys(entry.pairs || {})) {
      if (!key.pairs.some((pair) => pair.pairId === pairId)) {
        throw new Error(`${entry.source}: pair ${JSON.stringify(pairId)} is not in the key`);
      }
    }
  }

  const warnings = [];
  const unrated = key.pairs.filter((pair) => exports.every((entry) => !entry.pairs?.[pair.pairId]));
  if (unrated.length > 0) {
    warnings.push(`${unrated.length} pair(s) unrated: ${unrated.map((p) => p.pairId).join(", ")}`);
  }

  const dimensions = [];
  for (const dimension of DIMENSIONS) {
    const a = [];
    const b = [];
    for (const pair of key.pairs) {
      const scores = { A: [], B: [] };
      for (const entry of exports) {
        const record = entry.pairs?.[pair.pairId];
        const scoreA = scoreFor(record, pair, dimension, "A");
        const scoreB = scoreFor(record, pair, dimension, "B");
        if (scoreA !== null) scores.A.push(scoreA);
        if (scoreB !== null) scores.B.push(scoreB);
      }
      if (scores.A.length === 0 || scores.B.length === 0) continue;
      a.push(scores.A.reduce((sum, value) => sum + value, 0) / scores.A.length);
      b.push(scores.B.reduce((sum, value) => sum + value, 0) / scores.B.length);
    }
    const summary = pairedSummary(a, b);
    const diffs = summary.diffs;
    const ci = bootstrapCI(diffs, { seed: key.seed ?? 20261116 });
    dimensions.push({
      dimension,
      n: summary.n,
      meanA: summary.meanA,
      meanB: summary.meanB,
      meanDiff: summary.meanDiff,
      sdDiff: summary.sdDiff,
      wins: summary.wins,
      losses: summary.losses,
      ties: summary.ties,
      ci: { low: ci.low, high: ci.high, level: ci.level },
      signTest: signTest(diffs),
      wilcoxon: wilcoxonSignedRank(diffs),
    });
  }

  const votes = { A: 0, B: 0, tie: 0, missing: 0 };
  const perRater = [];
  for (const entry of exports) {
    const own = { source: entry.source, A: 0, B: 0, tie: 0, missing: 0 };
    for (const pair of key.pairs) {
      const record = entry.pairs?.[pair.pairId];
      if (!record) {
        own.missing++;
        continue;
      }
      const variant = preferenceVariant(record, pair);
      if (variant) own[variant]++;
      else if (record.preference === "tie") own.tie++;
      else own.missing++;
    }
    for (const bucket of ["A", "B", "tie", "missing"]) votes[bucket] += own[bucket];
    perRater.push(own);
  }
  const decisive = votes.A + votes.B;
  const shareA = decisive === 0 ? null : votes.A / decisive;
  const shareCi = decisive === 0 ? null : wilsonInterval(votes.A, decisive);

  const iccByDimension = {};
  const iccNotes = [];
  for (const dimension of DIMENSIONS) {
    const columns = [];
    for (const entry of exports) {
      const column = [];
      for (const pair of key.pairs) {
        const record = entry.pairs?.[pair.pairId];
        const scoreA = scoreFor(record, pair, dimension, "A");
        const scoreB = scoreFor(record, pair, dimension, "B");
        if (scoreA === null || scoreB === null) {
          column.length = 0;
          break;
        }
        column.push(scoreA - scoreB);
      }
      if (column.length >= 2) columns.push(column);
    }
    const value = columns.length >= 2 ? icc21(columns) : null;
    iccByDimension[dimension] = value;
    if (columns.length >= 2 && value === null) {
      iccNotes.push(`${dimension}: ICC undefined (zero variance across raters)`);
    }
  }
  const iccAvailable = Object.values(iccByDimension).some((value) => isFiniteNumber(value));
  const icc = {
    available: iccAvailable,
    reason: iccAvailable
      ? null
      : exports.length < 2
        ? "single rater: agreement needs at least two"
        : "pairs or variance too small for ICC",
    byDimension: iccByDimension,
  };

  const pairCount = Math.max(...dimensions.map((entry) => entry.n), 0);
  if (pairCount < MIN_PAIRS_FOR_TEST) {
    warnings.push(
      `n=${pairCount} pairs < ${MIN_PAIRS_FOR_TEST}: report descriptively, no test-based winner`,
    );
  }
  if (exports.length > 1) {
    warnings.push(
      "dimension means pool raters; ICC(2,1) on the A−B difference is the agreement check",
    );
  }

  return {
    experimentId,
    seed: key.seed ?? null,
    raters: exports.length,
    pairsRated: key.pairs.length - unrated.length,
    pairsTotal: key.pairs.length,
    variants: { A: labels.A || "A", B: labels.B || "B" },
    dimensions,
    preference: {
      votes,
      decisive,
      shareA,
      ci: shareCi ? { low: shareCi.low, high: shareCi.high } : null,
      perRater,
    },
    icc,
    warnings,
  };
}

/**
 * Human-readable report for the terminal. Numbers stay at 2 decimals; a
 * non-finite value prints as an em-free dash so the table stays aligned.
 */
export function formatBlindReviewReport(report) {
  const { variants } = report;
  const lines = [];
  lines.push(
    `Blind review — ${report.experimentId}${report.seed === null ? "" : ` (seed ${report.seed})`}`,
  );
  lines.push(
    `raters: ${report.raters}${report.icc.available ? "" : ` (${report.icc.reason})`} · pairs: ${report.pairsRated}/${report.pairsTotal}`,
  );
  lines.push(`labels: A = ${variants.A} · B = ${variants.B}`);
  lines.push("");
  lines.push(
    [
      "dimension".padEnd(14),
      "A mean".padStart(7),
      "B mean".padStart(7),
      "A−B".padStart(7),
      "95% CI".padStart(16),
      "sign p".padStart(8),
      "wilcox p".padStart(9),
    ].join(" "),
  );
  for (const entry of report.dimensions) {
    const ci = `[${formatNumber(entry.ci.low)}, ${formatNumber(entry.ci.high)}]`;
    lines.push(
      [
        entry.dimension.padEnd(14),
        formatNumber(entry.meanA).padStart(7),
        formatNumber(entry.meanB).padStart(7),
        formatNumber(entry.meanDiff).padStart(7),
        ci.padStart(16),
        formatP(entry.signTest.p).padStart(8),
        formatP(entry.wilcoxon.p).padStart(9),
      ].join(" "),
    );
  }
  lines.push("");
  const { votes, decisive, shareA, ci } = report.preference;
  const shareText =
    shareA === null
      ? "no decisive votes"
      : `A share ${(shareA * 100).toFixed(1)}% (Wilson 95% ${(ci.low * 100).toFixed(1)}–${(ci.high * 100).toFixed(1)}%, n=${decisive})`;
  lines.push(`preference: A ${votes.A} / B ${votes.B} / tie ${votes.tie} → ${shareText}`);
  if (report.icc.available) {
    const values = report.dimensions
      .map((entry) => `${entry.dimension} ${formatNumber(report.icc.byDimension[entry.dimension])}`)
      .join(" · ");
    lines.push(`ICC(2,1) on A−B: ${values}`);
  }
  for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  return `${lines.join("\n")}\n`;
}
