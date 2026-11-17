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
 * Everything below the pair count floor is descriptive: with fewer than 8 pairs
 * the tests cannot separate a real effect from noise, so a dimension is marked
 * non-reportable instead of printed as if it settled anything. Pure functions
 * only — the CLI does the file I/O.
 */

import {
  bootstrapCI,
  icc21,
  mean,
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
 * The packet always writes a record per pair, with `null`s when untouched, so
 * "rated" cannot mean "record exists". A pair counts as rated once it carries a
 * preference or at least one score on either side.
 */
function isRated(record, keyPair) {
  if (!record) return false;
  if (
    record.preference === "left" ||
    record.preference === "right" ||
    record.preference === "tie"
  ) {
    return true;
  }
  return DIMENSIONS.some(
    (dimension) =>
      scoreFor(record, keyPair, dimension, "A") !== null ||
      scoreFor(record, keyPair, dimension, "B") !== null,
  );
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
  const unrated = key.pairs.filter((pair) =>
    exports.every((entry) => !isRated(entry.pairs?.[pair.pairId], pair)),
  );
  if (unrated.length > 0) {
    warnings.push(`${unrated.length} pair(s) unrated: ${unrated.map((p) => p.pairId).join(", ")}`);
  }

  const dimensions = [];
  for (const dimension of DIMENSIONS) {
    const a = [];
    const b = [];
    for (const pair of key.pairs) {
      // A pair only counts when one rater scored both sides: pulling A from one
      // rater and B from another would compare different people, not layouts.
      const pairA = [];
      const pairB = [];
      for (const entry of exports) {
        const record = entry.pairs?.[pair.pairId];
        const scoreA = scoreFor(record, pair, dimension, "A");
        const scoreB = scoreFor(record, pair, dimension, "B");
        if (scoreA === null || scoreB === null) continue;
        pairA.push(scoreA);
        pairB.push(scoreB);
      }
      if (pairA.length === 0) continue;
      a.push(mean(pairA));
      b.push(mean(pairB));
    }
    const summary = pairedSummary(a, b);
    const diffs = summary.diffs;
    const hasPairs = summary.n > 0;
    const ci = hasPairs ? bootstrapCI(diffs, { seed: key.seed ?? 20261116 }) : null;
    dimensions.push({
      dimension,
      n: summary.n,
      reportable: summary.n >= MIN_PAIRS_FOR_TEST,
      meanA: hasPairs ? summary.meanA : null,
      meanB: hasPairs ? summary.meanB : null,
      meanDiff: hasPairs ? summary.meanDiff : null,
      sdDiff: hasPairs ? summary.sdDiff : null,
      wins: summary.wins,
      losses: summary.losses,
      ties: summary.ties,
      ci: ci ? { low: ci.low, high: ci.high, level: ci.level } : null,
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
      warnings.push(`${dimension}: ICC undefined (zero variance across raters)`);
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

  const pairsRated = key.pairs.length - unrated.length;
  if (pairsRated < MIN_PAIRS_FOR_TEST) {
    warnings.push(
      `n=${pairsRated} rated pairs < ${MIN_PAIRS_FOR_TEST}: report descriptively, no test-based winner`,
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
    pairsRated,
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
 * non-finite value prints as a dash so the table stays aligned. Dimensions with
 * fewer than 8 pairs keep their p-values but get a `*` and suppressed columns.
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
      "dimension".padEnd(15),
      "A mean".padStart(7),
      "B mean".padStart(7),
      "A−B".padStart(7),
      "95% CI".padStart(16),
      "sign p".padStart(8),
      "wilcox p".padStart(9),
    ].join(" "),
  );
  let suppressed = false;
  for (const entry of report.dimensions) {
    const name = entry.reportable ? entry.dimension : `${entry.dimension}*`;
    if (!entry.reportable) suppressed = true;
    const ci = entry.ci ? `[${formatNumber(entry.ci.low)}, ${formatNumber(entry.ci.high)}]` : "—";
    lines.push(
      [
        name.padEnd(15),
        formatNumber(entry.meanA).padStart(7),
        formatNumber(entry.meanB).padStart(7),
        formatNumber(entry.meanDiff).padStart(7),
        ci.padStart(16),
        (entry.reportable ? formatP(entry.signTest.p) : "—").padStart(8),
        (entry.reportable ? formatP(entry.wilcoxon.p) : "—").padStart(9),
      ].join(" "),
    );
  }
  if (suppressed)
    lines.push(`* fewer than ${MIN_PAIRS_FOR_TEST} pairs in that dimension: descriptive only`);
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
