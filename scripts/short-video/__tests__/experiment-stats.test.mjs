import { describe, expect, it } from "vitest";
import {
  bhFdr,
  bootstrapCI,
  icc21,
  mean,
  mdeContinuous,
  pairedPermutation,
  signTest,
  variance,
  wilcoxonSignedRank,
  wilsonInterval,
} from "../lib/experiment-stats.mjs";

describe("mean / variance", () => {
  it("computes sample mean and sample variance", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(variance([1, 2, 3, 4])).toBeCloseTo(1.6666667, 6);
    expect(variance([5])).toBe(0);
  });

  it("ignores non-finite values", () => {
    expect(mean([1, NaN, 3, Infinity])).toBe(2);
    expect(variance([1, NaN, 3])).toBe(2);
  });
});

describe("pairedPermutation", () => {
  it("returns the exact two-sided p for six same-direction pairs", () => {
    // 2 * (1 / 2^6) = 0.03125. This is the n=6 minimum for significance.
    const result = pairedPermutation([1, 1, 1, 1, 1, 1]);
    expect(result.method).toBe("exact-sign-flip");
    expect(result.p).toBeCloseTo(0.03125, 10);
    expect(result.observedMean).toBe(1);
  });

  it("is not significant at n=5", () => {
    const result = pairedPermutation([1, 1, 1, 1, 1]);
    expect(result.p).toBeCloseTo(0.0625, 10);
  });

  it("returns p=1 for a mixed direction set", () => {
    const result = pairedPermutation([1, -1, 1, -1, 1, -1]);
    expect(result.p).toBeGreaterThan(0.9);
  });

  it("drops zero differences and returns p=1 when nothing is left", () => {
    const result = pairedPermutation([0, 0, 0]);
    expect(result.n).toBe(0);
    expect(result.p).toBe(1);
  });
});

describe("signTest", () => {
  it("matches the exact binomial for six same-direction pairs", () => {
    const result = signTest([1, 1, 1, 1, 1, 1]);
    expect(result.p).toBeCloseTo(0.03125, 10);
    expect(result.positive).toBe(6);
    expect(result.negative).toBe(0);
  });

  it("returns p=1 when positives and negatives are balanced", () => {
    expect(signTest([1, -1, 1, -1]).p).toBe(1);
  });
});

describe("signTest on a mixed sample", () => {
  it("counts both tails from the larger side (C(n,k) is symmetric)", () => {
    // n=6, 4 positive / 2 negative: P(X>=4) = (15+6+1)/64, doubled.
    const diffs = [0.3, 0.2, 0.1, 0.05, -0.04, -0.02];
    const result = signTest(diffs);
    expect(result.n).toBe(6);
    expect(result.positive).toBe(4);
    expect(result.negative).toBe(2);
    expect(result.p).toBeCloseTo((2 * 22) / 64, 10);
  });

  it("matches the exact binomial at n=18", () => {
    // 7 positive / 11 negative: 2 * P(X>=11) at n=18.
    const diffs = [
      ...Array.from({ length: 7 }, (_, i) => 0.1 + i / 100),
      ...Array.from({ length: 11 }, (_, i) => -(0.1 + i / 100)),
    ];
    const result = signTest(diffs);
    expect(result.positive).toBe(7);
    // sum C(18,11..18) = 63004 over 2^18, doubled: 0.480682...
    expect(result.p).toBeCloseTo(0.480682373, 6);
  });
});

describe("wilcoxonSignedRank", () => {
  it("is significant for six same-direction pairs", () => {
    const result = wilcoxonSignedRank([1, 2, 3, 4, 5, 6]);
    expect(result.p).toBeLessThan(0.05);
    expect(result.n).toBe(6);
  });

  it("drops zeros without changing the direction", () => {
    const result = wilcoxonSignedRank([0, 0, 1, 2, 3, 4, 5, 6]);
    expect(result.n).toBe(6);
    expect(result.p).toBeLessThan(0.05);
  });

  it("returns p=1 with no non-zero pairs", () => {
    expect(wilcoxonSignedRank([0, 0]).p).toBe(1);
  });
});

describe("bootstrapCI", () => {
  it("is deterministic and brackets the mean", () => {
    const values = [0.1, 0.2, 0.15, 0.3, 0.05, 0.25];
    const a = bootstrapCI(values, { iterations: 2000, seed: 7 });
    const b = bootstrapCI(values, { iterations: 2000, seed: 7 });
    expect(a).toEqual(b);
    expect(a.low).toBeLessThanOrEqual(mean(values));
    expect(a.high).toBeGreaterThanOrEqual(mean(values));
    expect(a.level).toBe(0.95);
  });

  it("collapses to [0,0] for all-zero differences", () => {
    expect(bootstrapCI([0, 0, 0])).toMatchObject({ low: 0, high: 0 });
  });
});

describe("wilsonInterval", () => {
  it("has a zero lower bound for zero successes", () => {
    const ci = wilsonInterval(0, 10);
    expect(ci.low).toBe(0);
    expect(ci.high).toBeCloseTo(0.2775, 3);
  });

  it("has a one upper bound for all successes", () => {
    const ci = wilsonInterval(10, 10);
    expect(ci.low).toBeCloseTo(0.7225, 3);
    expect(ci.high).toBe(1);
  });

  it("handles n=0", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1, p: 0 });
  });
});

describe("bhFdr", () => {
  it("rejects the smallest p-values and adjusts monotonically", () => {
    const result = bhFdr([0.001, 0.008, 0.039, 0.9, 0.95], 0.05);
    expect(result.rejected).toEqual([true, true, false, false, false]);
    expect(result.adjusted[0]).toBeCloseTo(0.005, 10);
    expect(result.adjusted[1]).toBeCloseTo(0.02, 10);
    expect(result.adjusted[2]).toBeCloseTo(0.065, 10);
  });

  it("returns no rejections for empty input", () => {
    expect(bhFdr([], 0.05)).toEqual({ adjusted: [], rejected: [], threshold: 0 });
  });
});

describe("mdeContinuous", () => {
  it("matches the pre-registered n=20, rho=.5 estimate", () => {
    const result = mdeContinuous({ pairs: 20, rho: 0.5, sigma: 0.4 });
    expect(result.mdeLog).toBeCloseTo(0.25, 2);
    expect(result.pct).toBeGreaterThan(0.26);
    expect(result.pct).toBeLessThan(0.31);
  });

  it("gets smaller as correlation rises", () => {
    const low = mdeContinuous({ pairs: 20, rho: 0.2 });
    const high = mdeContinuous({ pairs: 20, rho: 0.8 });
    expect(high.mdeLog).toBeLessThan(low.mdeLog);
  });
});

describe("icc21", () => {
  it("returns null when there is nothing to compare", () => {
    expect(icc21([[1, 2, 3]])).toBeNull();
    expect(icc21([[1], [2]])).toBeNull();
    expect(icc21([])).toBeNull();
  });

  it("returns 1 for identical raters and poor agreement for mirrored ones", () => {
    const values = [1, 3, 5, 7];
    expect(icc21([values, values])).toBeCloseTo(1, 12);
    const mirrored = values.map((value) => 8 - value);
    expect(icc21([values, mirrored])).toBeLessThan(0.5);
  });

  it("returns null when every rating is identical (zero variance)", () => {
    expect(
      icc21([
        [4, 4, 4],
        [4, 4, 4],
      ]),
    ).toBeNull();
  });
});
