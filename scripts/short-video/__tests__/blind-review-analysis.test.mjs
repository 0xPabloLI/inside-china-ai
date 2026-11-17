import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeBlindReview,
  formatBlindReviewReport,
  icc21,
  REVIEW_DIMENSIONS,
} from "../lib/blind-review-analysis.mjs";
import { parseLabels } from "../experiment-review.mjs";

const CLI = fileURLToPath(new URL("../experiment-review.mjs", import.meta.url));
const DIMENSIONS = REVIEW_DIMENSIONS.map((dimension) => dimension.key);

const dirs = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "blind-review-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A key with `count` pairs; even pairs are flipped so left is variant B. */
function makeKey(count = 6, extras = {}) {
  const pairs = [];
  for (let i = 0; i < count; i++) {
    const flipped = i % 2 === 0;
    pairs.push({
      pairId: `p${i + 1}`,
      block: `p${i + 1}`,
      left: flipped ? "B" : "A",
      right: flipped ? "A" : "B",
    });
  }
  return { experimentId: "info-layout-v2", seed: 20261116, pairs, ...extras };
}

function rating(value) {
  const ratings = {};
  for (const dimension of DIMENSIONS) ratings[dimension] = { left: value, right: value };
  return ratings;
}

/** Build an export from per-pair specs; `A`/`B` are written to the matching side. */
function makeExport(
  specs,
  { experimentId = "info-layout-v2", source = "export.json", key = makeKey() } = {},
) {
  const pairs = {};
  for (const spec of specs) {
    const keyPair = key.pairs.find((pair) => pair.pairId === spec.pairId);
    if (!keyPair) throw new Error(`fixture pair ${spec.pairId} is not in the key`);
    const ratings = {};
    for (const dimension of DIMENSIONS) {
      const scores = spec.scores?.[dimension] ?? {};
      const left = keyPair.left === "A" ? scores.A : scores.B;
      const right = keyPair.right === "A" ? scores.A : scores.B;
      ratings[dimension] = {
        left: left ?? null,
        right: right ?? null,
      };
    }
    pairs[spec.pairId] = { block: spec.pairId, preference: spec.preference ?? null, ratings };
  }
  return { source, experimentId, pairs };
}

describe("analyzeBlindReview", () => {
  it("maps left/right back to variants through the key", () => {
    // p1 is flipped (left = B), so a left preference is a B vote and the left
    // score is the B score.
    const key = makeKey(2);
    const scores = { clarity: { A: 3, B: 7 } };
    const result = analyzeBlindReview({
      exports: [makeExport([{ pairId: "p1", preference: "left", scores }])],
      key,
      labels: { A: "old", B: "new" },
    });
    const clarity = result.dimensions.find((entry) => entry.dimension === "clarity");
    expect(clarity.meanA).toBe(3);
    expect(clarity.meanB).toBe(7);
    expect(clarity.meanDiff).toBe(-4);
    expect(result.preference.votes.B).toBe(1);
    expect(result.preference.votes.A).toBe(0);
    expect(result.variants).toEqual({ A: "old", B: "new" });
  });

  it("excludes ties from the preference share and reports unrated pairs", () => {
    const votes = ["left", "left", "right", "tie"];
    const specs = votes.map((preference, index) => ({
      pairId: `p${index + 1}`,
      preference,
      scores: { clarity: { A: 4, B: 5 } },
    }));
    const result = analyzeBlindReview({
      exports: [makeExport(specs)],
      key: makeKey(),
    });
    // p1/p3 are flipped, p2/p4 are not: two left votes split A/B, one right vote,
    // one tie. Six pairs in the key, two of them unrated.
    expect(result.preference.votes.tie).toBe(1);
    expect(result.preference.decisive).toBe(result.preference.votes.A + result.preference.votes.B);
    expect(result.preference.shareA).toBeCloseTo(
      result.preference.votes.A / result.preference.decisive,
      12,
    );
    expect(result.pairsRated).toBe(4);
    expect(result.pairsTotal).toBe(6);
    expect(result.warnings.join(" ")).toMatch(/2 pair\(s\) unrated/);
  });

  it("reports ICC as unavailable for a single rater instead of inventing one", () => {
    const result = analyzeBlindReview({
      exports: [
        makeExport([{ pairId: "p1", preference: "left", scores: { clarity: { A: 1, B: 7 } } }]),
      ],
      key: makeKey(2),
    });
    expect(result.icc.available).toBe(false);
    expect(result.icc.reason).toMatch(/single rater/);
    expect(formatBlindReviewReport(result)).toMatch(/single rater/);
    expect(formatBlindReviewReport(result)).not.toMatch(/ICC\(2,1\) on A−B:/);
  });

  it("computes ICC(2,1) ≈ 1 for two identical raters", () => {
    const diffs = [-4, -2, 0, 2, 4, 1];
    const specs = diffs.map((diff, index) => ({
      pairId: `p${index + 1}`,
      preference: diff < 0 ? "left" : "right",
      scores: { clarity: { A: 4, B: 4 - diff } },
    }));
    const result = analyzeBlindReview({
      exports: [
        makeExport(specs, { source: "rater-1.json" }),
        makeExport(specs, { source: "rater-2.json" }),
      ],
      key: makeKey(),
    });
    expect(result.raters).toBe(2);
    expect(result.icc.available).toBe(true);
    expect(result.icc.byDimension.clarity).toBeCloseTo(1, 9);
  });

  it("scores disagreeing raters as poor agreement", () => {
    const forwards = [-4, -2, 0, 2, 4, 1];
    const backwards = forwards.map((value) => -value);
    const build = (diffs, source) =>
      makeExport(
        diffs.map((diff, index) => ({
          pairId: `p${index + 1}`,
          preference: diff < 0 ? "left" : "right",
          scores: { clarity: { A: 4, B: 4 - diff } },
        })),
        { source },
      );
    const result = analyzeBlindReview({
      exports: [build(forwards, "rater-1.json"), build(backwards, "rater-2.json")],
      key: makeKey(),
    });
    expect(result.icc.available).toBe(true);
    expect(result.icc.byDimension.clarity).toBeLessThan(0.5);
  });

  it("warns below the pair floor instead of naming a winner", () => {
    const result = analyzeBlindReview({
      exports: [
        makeExport([{ pairId: "p1", preference: "left", scores: { clarity: { A: 1, B: 7 } } }]),
      ],
      key: makeKey(2),
    });
    expect(result.warnings.join(" ")).toMatch(/n=1 pairs < 8/);
  });

  it("rejects an export from another experiment", () => {
    expect(() =>
      analyzeBlindReview({
        exports: [makeExport([], { experimentId: "other" })],
        key: makeKey(),
      }),
    ).toThrow(/does not match key/);
  });

  it("rejects a pair that is not in the key", () => {
    const exported = makeExport([], { source: "rogue.json" });
    exported.pairs.ghost = { preference: "left", ratings: {} };
    expect(() => analyzeBlindReview({ exports: [exported], key: makeKey() })).toThrow(
      /not in the key/,
    );
  });
});

describe("icc21", () => {
  it("returns null when there is nothing to compare", () => {
    expect(icc21([[1, 2, 3]])).toBeNull();
    expect(icc21([[1], [2]])).toBeNull();
  });
});

describe("parseLabels", () => {
  it("parses A/B names and rejects malformed input", () => {
    expect(parseLabels("A=old, B=new")).toEqual({ A: "old", B: "new" });
    expect(parseLabels(undefined)).toEqual({});
    expect(() => parseLabels("C=old")).toThrow(/must be A or B/);
    expect(() => parseLabels("A=")).toThrow(/needs a name/);
  });
});

describe("experiment-review --analyze", () => {
  it("writes report.json next to the key and prints the table", () => {
    const dir = tempDir();
    const key = makeKey(2);
    writeFileSync(join(dir, "key.json"), `${JSON.stringify(key)}\n`, "utf8");
    const exported = makeExport([
      { pairId: "p1", preference: "left", scores: { clarity: { A: 3, B: 6 } } },
      { pairId: "p2", preference: "tie", scores: { clarity: { A: 5, B: 5 } } },
    ]);
    const exportPath = join(dir, "export.json");
    writeFileSync(exportPath, `${JSON.stringify(exported)}\n`, "utf8");

    const stdout = execFileSync(
      process.execPath,
      [CLI, "--analyze", exportPath, "--labels", "A=old,B=new"],
      { encoding: "utf8" },
    );
    expect(stdout).toMatch(/Blind review — info-layout-v2/);
    expect(stdout).toMatch(/labels: A = old · B = new/);
    expect(existsSync(join(dir, "report.json"))).toBe(true);
    const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
    expect(report.raters).toBe(1);
    expect(report.icc.available).toBe(false);
    expect(report.keyPath).toBe(join(dir, "key.json"));
    expect(report.exportSources).toEqual(["export.json"]);
  });
});
