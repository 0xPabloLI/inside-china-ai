/**
 * Seeded behaviour distributions for the publish path (#1288).
 *
 * #1013 removed the literal waits by replacing them with `base ± spread`
 * UNIFORM jitter. Uniform is still a machine's shape: every value inside the
 * band is equally likely, so a dwell spends as much time at 20s as at 8s.
 * #1288 replaces the sampler, not the bands — the existing `[base, spread]`
 * contracts and the tests that pin their bounds stay the authority, and the
 * distribution is clamped INTO those bounds. Nothing here touches the network
 * or the DOM; every function takes `rand` so the shape is reproducible.
 *
 *   - dwell / settle  → log-normal (a long right tail, like reading a feed)
 *   - scroll steps    → gamma (positive, skewed burst sizes)
 *   - keystroke gaps  → beta on [0,1], mapped into the typing band
 *
 * @module behavior-sampling
 */

/** Clamp, including the degenerate case where min > max. */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (min > max) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Standard normal via Box–Muller. Re-draws zeros because log(0) is -Infinity.
 * @param {() => number} rand
 */
function normalSample(rand = Math.random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia–Tsang gamma deviate, shape >= 1. Not clamped: used by beta too. */
function gammaRaw(shape, rand) {
  const k = Math.max(1, shape);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normalSample(rand);
    const v = 1 + c * x;
    if (v <= 0) continue;
    const cube = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * Math.pow(x, 4)) return d * cube;
    const logU = u > 0 ? Math.log(u) : -Infinity;
    if (logU < 0.5 * x * x + d * (1 - cube + Math.log(cube))) return d * cube;
  }
}

/**
 * Log-normal dwell in milliseconds, clamped to the caller's band.
 * @returns {number} rounded ms, always inside [minMs, maxMs]
 */
export function sampleLogNormalMs({
  medianMs,
  sigma = 0.4,
  minMs,
  maxMs,
  rand = Math.random,
} = {}) {
  const raw = medianMs * Math.exp(sigma * normalSample(rand));
  return Math.round(clamp(raw, minMs, maxMs));
}

/** Gamma-shaped scroll-step weight, clamped to a positive band. */
export function sampleGammaWeight({
  shape = 2,
  scale = 0.5,
  min = 0.6,
  max = 1.4,
  rand = Math.random,
} = {}) {
  return clamp(gammaRaw(shape, rand) * scale, min, max);
}

/** Beta-shaped keystroke gap mapped into [minMs, maxMs]. */
export function sampleBetaMs({ alpha = 2, beta = 2, minMs, maxMs, rand = Math.random } = {}) {
  const a = gammaRaw(alpha, rand);
  const b = gammaRaw(beta, rand);
  const x = a + b > 0 ? a / (a + b) : 0.5;
  return Math.round(clamp(minMs + x * (maxMs - minMs), minMs, maxMs));
}

/**
 * Sample a jittered wait inside an existing `[base, spread]` pacing band.
 * Keeps the band as the hard contract while making its interior log-normal.
 */
export function samplePacing([base, spread], opts = {}) {
  const { sigma = 0.35, rand = Math.random } = opts;
  return sampleLogNormalMs({
    medianMs: base,
    sigma,
    minMs: Math.max(0, base - spread),
    maxMs: base + spread,
    rand,
  });
}

/** Integer in [min, max], inclusive. */
export function sampleIntBetween(min, max, rand = Math.random) {
  return Math.min(max, Math.max(min, Math.floor(min + rand() * (max - min + 1))));
}

/** Symmetric jitter around a base interval, in ms. */
export function sampleSymmetricJitter(baseMs, jitterMs, rand = Math.random) {
  return Math.round((rand() * 2 - 1) * jitterMs);
}

/**
 * The evidence statistics #1288 asks for: a non-constant sample is one with a
 * positive coefficient of variation AND no single value owning half the set.
 */
export function variationStats(values = []) {
  const nums = values.filter(Number.isFinite);
  if (!nums.length) return { n: 0, mean: 0, cv: 0, dominantShare: 0, distinct: 0 };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  const counts = new Map();
  for (const v of nums) counts.set(v, (counts.get(v) || 0) + 1);
  return {
    n: nums.length,
    mean,
    cv: mean > 0 ? Math.sqrt(variance) / mean : 0,
    dominantShare: Math.max(...counts.values()) / nums.length,
    distinct: counts.size,
  };
}

/** Named bands, so no call site carries a bare literal. */
export const BEHAVIOR_BANDS = Object.freeze({
  /** One feed item's dwell: 5–20s, log-normal around ~10s. */
  feedDwell: Object.freeze({ medianMs: 10_500, sigma: 0.45, minMs: 5_000, maxMs: 20_000 }),
  /** Wheel burst weights: gamma(2, 0.5) clamped to the old ±0.4 band. */
  scrollStep: Object.freeze({ shape: 2, scale: 0.5, min: 0.6, max: 1.4 }),
  /** Keystroke gaps inside the existing 30–120ms band. */
  typingGap: Object.freeze({ alpha: 2, beta: 2, minMs: 30, maxMs: 120 }),
  /** Hover before a scroll: 250–1200ms, log-normal. */
  hoverHold: Object.freeze({ medianMs: 600, sigma: 0.4, minMs: 250, maxMs: 1_200 }),
});

/** Collect n samples for the acceptance evidence (CV / dominant share). */
export function sampleSeries(n, sampler, rand = Math.random) {
  return Array.from({ length: n }, () => sampler(rand));
}
