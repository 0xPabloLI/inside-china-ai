/**
 * Small-sample statistics for matched-pair layout experiments.
 *
 * No third-party dependencies. Every stochastic routine takes a seed so a
 * report is reproducible. The tests are the contract: exact p-values for
 * n<=16 where enumeration is cheap, seeded Monte Carlo beyond that.
 *
 * Unit of analysis is the video pair, never the view. Views inside one video
 * are not independent; treating them as n would inflate significance.
 */

import { createHash } from "node:crypto";

const EPS = 1e-12;
const DEFAULT_SEED = 20260101;

/**
 * Deterministic 0/1 bit from a seed and label parts. Assignment and blind
 * review both need a reproducible coin; they must not each grow their own.
 */
export function seededBit(seed, ...parts) {
  const digest = createHash("sha256")
    .update([seed, ...parts].join("\u0000"))
    .digest();
  return digest[0] % 2;
}

function finiteSorted(values) {
  return (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
}

/** Arithmetic mean of finite values; 0 when nothing is left. */
export function mean(values) {
  const xs = (Array.isArray(values) ? values : []).filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  if (xs.length === 0) return 0;
  return xs.reduce((sum, value) => sum + value, 0) / xs.length;
}

/** Sample variance (n-1); 0 for n<2. */
export function variance(values) {
  const xs = (Array.isArray(values) ? values : []).filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((sum, value) => sum + (value - m) ** 2, 0) / (xs.length - 1);
}

/** Median of finite values; 0 when nothing is left. */
function median(values) {
  const xs = finiteSorted(values);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** Deterministic PRNG (mulberry32). */
function createRng(seed = DEFAULT_SEED) {
  let state = Number(seed) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26). */
function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Inverse standard normal CDF (Acklam's approximation). */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new RangeError(`normalQuantile expects 0<p<1, got ${p}`);
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q;
  let r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

function nonZeroDiffs(diffs) {
  return (Array.isArray(diffs) ? diffs : []).filter(
    (value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) > EPS,
  );
}

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) {
    result = (result * (n - k + i)) / i;
  }
  return result;
}

/**
 * Two-sided paired sign-flip permutation test.
 *
 * Under the null the two layouts are exchangeable within a pair, so each
 * difference can flip sign independently. Exact enumeration through n=16;
 * seeded Monte Carlo above that. Zeros carry no information and are dropped.
 *
 * @param {number[]} diffs - paired differences (A - B)
 * @param {{iterations?: number, seed?: number}} [opts]
 */
export function pairedPermutation(diffs, opts = {}) {
  const clean = nonZeroDiffs(diffs);
  const n = clean.length;
  if (n === 0) {
    return { n: 0, observedMean: 0, p: 1, method: "empty", iterations: 0 };
  }
  const observedSum = clean.reduce((sum, value) => sum + value, 0);
  const observedMean = observedSum / n;
  const threshold = Math.abs(observedSum) - EPS;

  if (n <= 16) {
    let extreme = 0;
    const total = 2 ** n;
    for (let mask = 0; mask < total; mask++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += mask & (1 << i) ? clean[i] : -clean[i];
      }
      if (Math.abs(sum) >= threshold) extreme++;
    }
    return {
      n,
      observedMean,
      p: extreme / total,
      method: "exact-sign-flip",
      iterations: total,
    };
  }

  const iterations = Math.max(1000, Number(opts.iterations) || 20000);
  const rng = createRng(opts.seed ?? DEFAULT_SEED);
  let extreme = 0;
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (const value of clean) sum += rng() < 0.5 ? -value : value;
    if (Math.abs(sum) >= threshold) extreme++;
  }
  return {
    n,
    observedMean,
    p: (extreme + 1) / (iterations + 1),
    method: "monte-carlo-sign-flip",
    iterations,
  };
}

/**
 * Exact two-sided sign test. Zeros are dropped.
 *
 * @param {number[]} diffs
 */
export function signTest(diffs) {
  const clean = nonZeroDiffs(diffs);
  const n = clean.length;
  if (n === 0) return { n: 0, positive: 0, negative: 0, p: 1 };
  const positive = clean.filter((value) => value > 0).length;
  const negative = n - positive;
  const k = Math.max(positive, negative);
  let tail = 0;
  for (let i = k; i <= n; i++) tail += combination(n, i);
  const p = Math.min(1, (2 * tail) / 2 ** n);
  return { n, positive, negative, p };
}

function averageRanks(values) {
  const indexed = values.map((value, index) => ({ value: Math.abs(value), index }));
  indexed.sort((a, b) => a.value - b.value || a.index - b.index);
  const ranks = new Array(values.length);
  const tieSizes = [];
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j++;
    const rank = (i + j + 2) / 2; // 1-based average
    for (let k = i; k <= j; k++) ranks[indexed[k].index] = rank;
    tieSizes.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, tieSizes };
}

/**
 * Wilcoxon signed-rank test.
 *
 * Exact null distribution through n=16 when there are no ties; normal
 * approximation with tie correction otherwise. Zeros are dropped.
 *
 * @param {number[]} diffs
 */
export function wilcoxonSignedRank(diffs) {
  const clean = nonZeroDiffs(diffs);
  const n = clean.length;
  if (n === 0) return { n: 0, wPlus: 0, wMinus: 0, p: 1, method: "empty" };
  const { ranks, tieSizes } = averageRanks(clean);
  let wPlus = 0;
  let wMinus = 0;
  clean.forEach((value, index) => {
    if (value > 0) wPlus += ranks[index];
    else wMinus += ranks[index];
  });
  const hasTies = tieSizes.some((size) => size > 1);

  if (!hasTies && n <= 16) {
    // Exact distribution of the positive-rank sum.
    const maxSum = (n * (n + 1)) / 2;
    let counts = new Float64Array(maxSum + 1);
    counts[0] = 1;
    for (let rank = 1; rank <= n; rank++) {
      const next = new Float64Array(maxSum + 1);
      for (let sum = 0; sum <= maxSum; sum++) {
        if (!counts[sum]) continue;
        next[sum] += counts[sum];
        next[sum + rank] += counts[sum];
      }
      counts = next;
    }
    let lower = 0;
    let upper = 0;
    for (let sum = 0; sum <= maxSum; sum++) {
      if (sum <= wPlus + EPS) lower += counts[sum];
      if (sum >= wPlus - EPS) upper += counts[sum];
    }
    const total = 2 ** n;
    return {
      n,
      wPlus,
      wMinus,
      p: Math.min(1, (2 * Math.min(lower, upper)) / total),
      method: "exact",
    };
  }

  const m = (n * (n + 1)) / 4;
  const tieCorrection = tieSizes.reduce((sum, size) => sum + size ** 3 - size, 0) / 48;
  const v = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection;
  if (!(v > 0)) return { n, wPlus, wMinus, p: 1, method: "normal" };
  const z = (wPlus - m - 0.5 * Math.sign(wPlus - m)) / Math.sqrt(v);
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return { n, wPlus, wMinus, p, method: "normal" };
}

/**
 * Percentile bootstrap CI for the mean. Seeded.
 *
 * @param {number[]} values
 * @param {{iterations?: number, seed?: number, level?: number}} [opts]
 */
export function bootstrapCI(values, opts = {}) {
  const xs = (Array.isArray(values) ? values : []).filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  const level = opts.level ?? 0.95;
  if (xs.length === 0) return { low: 0, high: 0, mean: 0, level, iterations: 0 };
  if (xs.every((value) => Math.abs(value) <= EPS)) {
    return { low: 0, high: 0, mean: 0, level, iterations: 0 };
  }
  const iterations = Math.max(200, Number(opts.iterations) || 10000);
  const rng = createRng(opts.seed ?? DEFAULT_SEED);
  const means = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < xs.length; j++) sum += xs[Math.floor(rng() * xs.length)];
    means[i] = sum / xs.length;
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const lowIndex = Math.max(0, Math.floor(alpha * iterations));
  const highIndex = Math.min(iterations - 1, Math.ceil((1 - alpha) * iterations) - 1);
  return { low: means[lowIndex], high: means[highIndex], mean: mean(xs), level, iterations };
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * @param {number} successes
 * @param {number} n
 * @param {number} [z]
 */
export function wilsonInterval(successes, n, z = 1.96) {
  const total = Math.max(0, Math.floor(n));
  if (total === 0) return { low: 0, high: 1, p: 0 };
  const p = Math.min(1, Math.max(0, successes / total));
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half), p };
}

/**
 * Benjamini-Hochberg FDR. Returns adjusted p-values in the input order.
 *
 * @param {number[]} pValues
 * @param {number} [alpha]
 */
export function bhFdr(pValues, alpha = 0.05) {
  const ps = (Array.isArray(pValues) ? pValues : []).map((value) =>
    Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1,
  );
  const m = ps.length;
  if (m === 0) return { adjusted: [], rejected: [], threshold: 0 };
  const order = ps.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p || a.index - b.index);
  const adjustedSorted = new Array(m);
  let runningMin = 1;
  for (let i = m - 1; i >= 0; i--) {
    const raw = (order[i].p * m) / (i + 1);
    runningMin = Math.min(runningMin, raw);
    adjustedSorted[i] = Math.min(1, runningMin);
  }
  const adjusted = new Array(m);
  const rejected = new Array(m).fill(false);
  let threshold = 0;
  order.forEach(({ index }, i) => {
    adjusted[index] = adjustedSorted[i];
    if (adjustedSorted[i] <= alpha) {
      rejected[index] = true;
      threshold = Math.max(threshold, order[i].p);
    }
  });
  return { adjusted, rejected, threshold };
}

/**
 * Minimum detectable effect for a paired continuous outcome.
 *
 * `sigma` is the within-pair SD of the outcome on the analysis scale (for
 * log watch time, 0.40 is the planning value). `rho` is the within-pair
 * correlation. Returns both the log-scale MDE and the percent change.
 *
 * @param {{sigma?: number, rho?: number, pairs?: number, alpha?: number, power?: number}} [opts]
 */
export function mdeContinuous(opts = {}) {
  const sigma = opts.sigma ?? 0.4;
  const rho = opts.rho ?? 0.5;
  const pairs = Math.max(2, Math.floor(opts.pairs ?? 20));
  const alpha = opts.alpha ?? 0.05;
  const power = opts.power ?? 0.8;
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zPower = normalQuantile(power);
  const sdDiff = sigma * Math.sqrt(Math.max(0, 2 * (1 - rho)));
  const mdeLog = ((zAlpha + zPower) * sdDiff) / Math.sqrt(pairs);
  return {
    pairs,
    sigma,
    rho,
    alpha,
    power,
    sdDiff,
    mdeLog,
    pct: Math.exp(mdeLog) - 1,
  };
}

/**
 * Paired summary used by the report. `a` and `b` are aligned arrays; only
 * pairs where both values are finite count.
 *
 * @param {number[]} a
 * @param {number[]} b
 */
export function pairedSummary(a, b) {
  const pairs = [];
  const length = Math.min(a?.length ?? 0, b?.length ?? 0);
  for (let i = 0; i < length; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) pairs.push([a[i], b[i]]);
  }
  const diffs = pairs.map(([left, right]) => left - right);
  const wins = diffs.filter((diff) => diff > EPS).length;
  const losses = diffs.filter((diff) => diff < -EPS).length;
  const ties = diffs.length - wins - losses;
  return {
    n: diffs.length,
    meanA: mean(pairs.map(([left]) => left)),
    meanB: mean(pairs.map(([, right]) => right)),
    meanDiff: mean(diffs),
    medianDiff: median(diffs),
    sdDiff: Math.sqrt(variance(diffs)),
    wins,
    losses,
    ties,
    diffs,
  };
}
