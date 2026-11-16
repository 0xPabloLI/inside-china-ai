import { describe, expect, it } from "vitest";
import {
  chooseAssignment,
  createExperiment,
  ingestDetails,
  buildReport,
  renderReportMarkdown,
} from "../experiment.mjs";

const baseExperiment = {
  id: "info-layout-v1",
  createdAt: "2026-11-16T00:00:00.000Z",
  hypothesis: "Native charts improve completion versus chart-card screenshots",
  factor: "native-chart-vs-chart-card",
  primaryMetric: "fullVideoWatchedRate",
  secondaryMetrics: ["logAvgWatchTimeSec"],
  design: "matched-pair",
  targetPairs: 20,
  alpha: 0.05,
  power: 0.8,
  seed: 20260101,
  variants: { A: "chart-card", B: "native-chart" },
  status: "registered",
};

const details = {
  fetchedAt: "2026-11-20T00:00:00.000Z",
  videos: [
    {
      videoId: "v1",
      title: "Kimi IPO valuation",
      postedOn: "2026-11-17T09:00:00.000Z",
      videoViews: 1000,
      avgWatchTimeSec: 20,
      watchedFullVideoPct: 30,
    },
    {
      videoId: "v2",
      title: "Kimi IPO valuation",
      postedOn: "2026-11-19T09:00:00.000Z",
      videoViews: 1200,
      avgWatchTimeSec: 25,
      watchedFullVideoPct: 40,
    },
    {
      videoId: "v3",
      title: "Unrelated video",
      postedOn: "2026-11-19T09:00:00.000Z",
      videoViews: 10,
      avgWatchTimeSec: 2,
      watchedFullVideoPct: 5,
    },
  ],
};

describe("createExperiment", () => {
  it("fills the pre-registered defaults", () => {
    const record = createExperiment({
      id: "info-layout-v1",
      hypothesis: "h",
      factor: "f",
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(record).toMatchObject({
      id: "info-layout-v1",
      design: "matched-pair",
      targetPairs: 20,
      alpha: 0.05,
      power: 0.8,
      seed: 20260101,
      status: "registered",
    });
    expect(record.primaryMetric).toBe("fullVideoWatchedRate");
    expect(record.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects an unsafe id", () => {
    expect(() => createExperiment({ id: "../x", hypothesis: "h", factor: "f" })).toThrow(/id/);
  });

  it("rejects an empty hypothesis or factor", () => {
    expect(() => createExperiment({ id: "xx", hypothesis: "", factor: "f" })).toThrow(/hypothesis/);
    expect(() => createExperiment({ id: "xx", hypothesis: "h", factor: "" })).toThrow(/factor/);
  });
});

describe("chooseAssignment", () => {
  it("randomizes the first variant and gives the second the opposite", () => {
    const first = chooseAssignment({
      experiment: baseExperiment,
      existing: [],
      block: "kimi-ipo",
      packSlug: "kimi-ipo-v2",
      now: "2026-01-01T00:00:00.000Z",
    });
    const second = chooseAssignment({
      experiment: baseExperiment,
      existing: [first],
      block: "kimi-ipo",
      packSlug: "kimi-ipo-v3",
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(["A", "B"]).toContain(first.variant);
    expect(second.variant).not.toBe(first.variant);
    expect(new Set([first.order, second.order])).toEqual(new Set([1, 2]));
  });

  it("is deterministic for the same block and seed", () => {
    const args = {
      experiment: baseExperiment,
      existing: [],
      block: "deepinfer",
      packSlug: "deepinfer-a",
      now: "2026-01-01T00:00:00.000Z",
    };
    expect(chooseAssignment(args)).toEqual(chooseAssignment(args));
  });

  it("returns the existing assignment for the same pack", () => {
    const first = chooseAssignment({
      experiment: baseExperiment,
      existing: [],
      block: "kimi-ipo",
      packSlug: "kimi-ipo-v2",
      now: "2026-01-01T00:00:00.000Z",
    });
    const again = chooseAssignment({
      experiment: baseExperiment,
      existing: [first],
      block: "kimi-ipo",
      packSlug: "kimi-ipo-v2",
      now: "2026-02-01T00:00:00.000Z",
    });
    expect(again).toBe(first);
  });

  it("rejects a third pack in one block", () => {
    const first = chooseAssignment({
      experiment: baseExperiment,
      existing: [],
      block: "x",
      packSlug: "a",
    });
    const second = chooseAssignment({
      experiment: baseExperiment,
      existing: [first],
      block: "x",
      packSlug: "b",
    });
    expect(() =>
      chooseAssignment({
        experiment: baseExperiment,
        existing: [first, second],
        block: "x",
        packSlug: "c",
      }),
    ).toThrow(/two packs/);
  });

  it("rejects an override that duplicates the existing variant", () => {
    const first = chooseAssignment({
      experiment: baseExperiment,
      existing: [],
      block: "x",
      packSlug: "a",
    });
    expect(() =>
      chooseAssignment({
        experiment: baseExperiment,
        existing: [first],
        block: "x",
        packSlug: "b",
        variant: first.variant,
      }),
    ).toThrow(/opposite/);
  });
});

describe("ingestDetails", () => {
  const assignments = [
    {
      experimentId: baseExperiment.id,
      block: "kimi-ipo",
      packSlug: "kimi-ipo",
      variant: "A",
      order: 1,
      assignedAt: "2026-11-01T00:00:00.000Z",
    },
  ];

  it("normalizes percentages and computes the log metric", () => {
    const { observations, skipped } = ingestDetails({
      experiment: baseExperiment,
      assignments,
      details,
      overrides: { v1: "kimi-ipo" },
    });
    expect(skipped).toHaveLength(2);
    expect(observations).toHaveLength(1);
    expect(observations[0].metrics.fullVideoWatchedRate).toBeCloseTo(0.3, 10);
    expect(observations[0].metrics.logAvgWatchTimeSec).toBeCloseTo(Math.log(20), 10);
    expect(observations[0].variant).toBe("A");
  });

  it("accepts a rate already in 0-1 form", () => {
    const one = {
      fetchedAt: "2026-11-20T00:00:00.000Z",
      videos: [{ ...details.videos[0], watchedFullVideoPct: 0.3 }],
    };
    const { observations } = ingestDetails({
      experiment: baseExperiment,
      assignments,
      details: one,
      overrides: { v1: "kimi-ipo" },
    });
    expect(observations[0].metrics.fullVideoWatchedRate).toBeCloseTo(0.3, 10);
  });

  it("uses a matcher when there is no override", () => {
    const { observations } = ingestDetails({
      experiment: baseExperiment,
      assignments,
      details: { ...details, videos: [details.videos[0]] },
      matchPack: (title) => (title.includes("Kimi") ? "kimi-ipo" : null),
    });
    expect(observations).toHaveLength(1);
  });

  it("skips a video whose pack has no assignment", () => {
    const { skipped } = ingestDetails({
      experiment: baseExperiment,
      assignments,
      details: { ...details, videos: [details.videos[2]] },
      overrides: { v3: "not-assigned" },
    });
    expect(skipped[0].reason).toMatch(/no assignment/);
  });
});

function pairedAssignments(n) {
  return Array.from({ length: n }, (_, index) => [
    {
      experimentId: baseExperiment.id,
      block: `block-${index}`,
      packSlug: `a-${index}`,
      variant: "A",
      order: 1,
      assignedAt: "2026-11-01T00:00:00.000Z",
    },
    {
      experimentId: baseExperiment.id,
      block: `block-${index}`,
      packSlug: `b-${index}`,
      variant: "B",
      order: 2,
      assignedAt: "2026-11-01T00:00:00.000Z",
    },
  ]).flat();
}

function pairedObservations(n, { aRate = 0.4, bRate = 0.3 } = {}) {
  return Array.from({ length: n }, (_, index) => [
    {
      experimentId: baseExperiment.id,
      block: `block-${index}`,
      packSlug: `a-${index}`,
      variant: "A",
      videoId: `va-${index}`,
      capturedAt: "2026-11-20T00:00:00.000Z",
      metrics: { fullVideoWatchedRate: aRate, logAvgWatchTimeSec: Math.log(20) },
    },
    {
      experimentId: baseExperiment.id,
      block: `block-${index}`,
      packSlug: `b-${index}`,
      variant: "B",
      videoId: `vb-${index}`,
      capturedAt: "2026-11-20T00:00:00.000Z",
      metrics: { fullVideoWatchedRate: bRate, logAvgWatchTimeSec: Math.log(15) },
    },
  ]).flat();
}

describe("buildReport", () => {
  it("refuses a statistical claim below n=8", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(6),
      observations: pairedObservations(6),
      now: "2026-11-21T00:00:00.000Z",
    });
    expect(report.nPairs).toBe(6);
    expect(report.reportable).toBe(false);
    expect(report.tests).toBeNull();
    expect(report.status).toBe("descriptive-only");
    expect(report.limitations.join(" ")).toMatch(/n<8/);
  });

  it("runs the paired tests at n=8 and still labels the fixed sample as unreached", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
      now: "2026-11-21T00:00:00.000Z",
    });
    expect(report.reportable).toBe(true);
    expect(report.fixedSampleReached).toBe(false);
    expect(report.tests.permutation.p).toBeLessThan(0.05);
    expect(report.tests.sign.p).toBeLessThan(0.05);
    expect(report.status).toBe("interim-no-decision");
    expect(report.summary.wins).toBe(8);
    expect(report.summary.winRateCI.high).toBe(1);
  });

  it("marks the fixed sample as reached at the target", () => {
    const experiment = { ...baseExperiment, targetPairs: 8 };
    const report = buildReport({
      experiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
    });
    expect(report.fixedSampleReached).toBe(true);
    expect(report.status).toBe("fixed-sample");
  });

  it("excludes incomplete blocks and reports the exclusion", () => {
    const assignments = pairedAssignments(8).filter(
      (item) => !(item.block === "block-7" && item.variant === "B"),
    );
    const report = buildReport({
      experiment: baseExperiment,
      assignments,
      observations: pairedObservations(8),
    });
    expect(report.nPairs).toBe(7);
    expect(report.excludedBlocks).toEqual(["block-7"]);
  });

  it("computes a secondary metric with BH adjustment", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
    });
    expect(report.secondary).toHaveLength(1);
    expect(report.secondary[0].metric).toBe("logAvgWatchTimeSec");
    expect(report.secondary[0].pAdjusted).toBeGreaterThan(0);
  });
});

describe("renderReportMarkdown", () => {
  it("states the design limits and the n<8 floor", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(6),
      observations: pairedObservations(6),
    });
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("matched-pair");
    expect(markdown).toContain("not an RCT");
    expect(markdown).toContain("n<8");
    expect(markdown).toContain("descriptive-only");
  });

  it("prints the primary table and the MDE at n=8", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
    });
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("fullVideoWatchedRate");
    expect(markdown).toContain("Permutation");
    expect(markdown).toContain("MDE");
  });
});
