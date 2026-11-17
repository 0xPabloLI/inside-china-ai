import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chooseAssignment,
  createExperiment,
  ingestDetails,
  buildReport,
  checkExperiment,
  observationAge,
  parsePostedWhen,
  renderReportMarkdown,
} from "../experiment.mjs";

const baseExperiment = {
  id: "info-layout-v1",
  createdAt: "2026-11-16T00:00:00.000Z",
  hypothesis: "Native charts improve completion versus chart-card screenshots",
  factor: "native-chart-vs-chart-card",
  // A legacy single-primary record: the reader must keep accepting this shape.
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
  fetchedAt: "2026-11-23T00:00:00.000Z",
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
    expect(record.primaryMetrics).toEqual(["fullVideoWatchedRate", "logAvgWatchTimeSec"]);
    // One canonical field: the legacy singular key is read, never written.
    expect(record.primaryMetric).toBeUndefined();
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
      fetchedAt: "2026-11-23T00:00:00.000Z",
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

  it("withholds inference at an interim n that clears the floor (fixed n, no peeking)", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
      now: "2026-11-21T00:00:00.000Z",
    });
    expect(report.reportable).toBe(true);
    expect(report.fixedSampleReached).toBe(false);
    // n=8 would carry a p-value, but the pre-registered n is 20: stopping early
    // on a significant interim would inflate the error rate.
    expect(report.tests).toBeNull();
    expect(report.decision).toBe("interim");
    expect(report.status).toBe("interim-no-decision");
    expect(report.summary.wins).toBe(8);
    // The win-rate interval is inference as well, so it waits for the fixed sample.
    expect(report.summary.winRateCI).toBeNull();
  });

  it("runs the paired tests and decides once the fixed sample is complete", () => {
    const experiment = { ...baseExperiment, targetPairs: 8 };
    const report = buildReport({
      experiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
      now: "2026-11-21T00:00:00.000Z",
    });
    expect(report.fixedSampleReached).toBe(true);
    expect(report.tests.permutation.p).toBeLessThan(0.05);
    expect(report.tests.sign.p).toBeLessThan(0.05);
    // A − B > 0 means the control scored higher.
    expect(report.decision).toBe("control-better");
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

  it("computes a secondary metric with BH adjustment at the fixed sample", () => {
    const experiment = { ...baseExperiment, targetPairs: 8 };
    const report = buildReport({
      experiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
    });
    expect(report.secondary).toHaveLength(1);
    expect(report.secondary[0].metric).toBe("logAvgWatchTimeSec");
    expect(report.secondary[0].pAdjusted).toBeGreaterThan(0);
  });

  it("withholds a secondary p-value at an interim read even when its own n>=8", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
    });
    expect(report.secondary[0].n).toBe(8);
    expect(report.secondary[0].p).toBeNull();
    expect(report.secondary[0].pAdjusted).toBeNull();
  });

  it("aligns secondary values by pair before dropping missing siblings", () => {
    const observations = pairedObservations(8);
    delete observations[0].metrics.logAvgWatchTimeSec;
    delete observations[3].metrics.logAvgWatchTimeSec;
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations,
    });
    // Six complete pairs, not seven unilateral values from each side.
    expect(report.secondary[0].n).toBe(6);
    expect(report.secondary[0].p).toBeNull();
    expect(report.secondary[0].pAdjusted).toBeNull();
  });

  it("gives a secondary metric a p-value only at its own n>=8", () => {
    const observations = pairedObservations(8);
    observations[0].metrics.logAvgWatchTimeSec = null;
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations,
    });
    expect(report.reportable).toBe(true);
    expect(report.secondary[0].n).toBe(7);
    expect(report.secondary[0].p).toBeNull();
    expect(report.secondary[0].pAdjusted).toBeNull();
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

  it("prints the primary table and the tests at the fixed sample", () => {
    const report = buildReport({
      experiment: { ...baseExperiment, targetPairs: 8 },
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
    });
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("fullVideoWatchedRate");
    expect(markdown).toContain("Permutation");
    expect(markdown).toContain("MDE");
    expect(markdown).toContain("control-better");
  });

  it("says inference is withheld instead of printing an interim p-value", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations: pairedObservations(8),
    });
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("Inference withheld at interim");
    expect(markdown).toContain("no peeking");
    expect(markdown).not.toContain("| Permutation");
  });

  it("prints an em dash, not 0.000, when a pair has no primary values", () => {
    const observations = pairedObservations(8);
    observations[0].metrics.fullVideoWatchedRate = null;
    observations[1].metrics.fullVideoWatchedRate = null;
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations,
    });
    const markdown = renderReportMarkdown(report);
    expect(markdown).toMatch(/\| block-0 \|.*\| — \|/);
    expect(markdown).not.toMatch(/\| block-0 \|.*\| 0\.000 \|/);
  });
});

describe("createExperiment co-primaries", () => {
  it("pre-registers both primary metrics by default", () => {
    const record = createExperiment({ id: "l2-default", hypothesis: "h", factor: "f" });
    expect(record.primaryMetrics).toEqual(["fullVideoWatchedRate", "logAvgWatchTimeSec"]);
    expect(record.primaryMetric).toBeUndefined();
    expect(record.secondaryMetrics).toEqual([]);
  });

  it("refuses a metric that is both primary and secondary", () => {
    expect(() =>
      createExperiment({
        id: "l2-overlap",
        hypothesis: "h",
        factor: "f",
        primaryMetrics: ["fullVideoWatchedRate"],
        secondaryMetrics: ["fullVideoWatchedRate"],
      }),
    ).toThrow(/both primary and secondary/);
  });

  it("refuses more than two co-primaries or a duplicate", () => {
    const base = { id: "l2-three", hypothesis: "h", factor: "f" };
    expect(() => createExperiment({ ...base, primaryMetrics: ["a", "b", "c"] })).toThrow(
      /at most two/,
    );
    expect(() => createExperiment({ ...base, primaryMetrics: ["a", "a"] })).toThrow(/duplicate/);
  });
});

describe("chooseAssignment duration gate", () => {
  const experiment = createExperiment({
    id: "l2-duration",
    hypothesis: "h",
    factor: "f",
    targetPairs: 20,
  });
  const first = chooseAssignment({
    experiment,
    block: "block-a",
    packSlug: "pack-a",
    variant: "A",
    durationSec: 62,
  });

  it("records the duration on the assignment", () => {
    expect(first.durationSec).toBe(62);
  });

  it("accepts a partner within the 3s gap", () => {
    const second = chooseAssignment({
      experiment,
      existing: [first],
      block: "block-a",
      packSlug: "pack-b",
      durationSec: 64.5,
    });
    expect(second.variant).toBe("B");
    expect(second.durationSec).toBe(64.5);
  });

  it("rejects a partner that breaks the 3s gap", () => {
    expect(() =>
      chooseAssignment({
        experiment,
        existing: [first],
        block: "block-a",
        packSlug: "pack-b",
        durationSec: 70,
      }),
    ).toThrow(/duration gap 8\.00s exceeds 3s/);
  });
});

const pairAssignments = [
  {
    experimentId: baseExperiment.id,
    block: "kimi-ipo",
    packSlug: "kimi-ipo-a",
    variant: "A",
    order: 1,
    durationSec: 60,
    assignedAt: "2026-11-01T00:00:00.000Z",
  },
  {
    experimentId: baseExperiment.id,
    block: "kimi-ipo",
    packSlug: "kimi-ipo-b",
    variant: "B",
    order: 2,
    durationSec: 61,
    assignedAt: "2026-11-01T00:00:00.000Z",
  },
];

function pairVideos({ aPosted = "11/14/2026", bPosted = "11/18/2026" } = {}) {
  return {
    fetchedAt: "2026-11-24T00:00:00.000Z",
    videos: [
      {
        videoId: "va",
        title: "Kimi IPO valuation",
        postedOn: aPosted,
        videoViews: 1000,
        avgWatchTimeSec: 20,
        watchedFullVideoPct: 40,
      },
      {
        videoId: "vb",
        title: "Kimi IPO valuation",
        postedOn: bPosted,
        videoViews: 1200,
        avgWatchTimeSec: 26,
        watchedFullVideoPct: 30,
      },
    ],
  };
}

describe("ingestDetails protocol gates", () => {
  it("reads a pair that clears T+72h and the publish interval", () => {
    const { observations, skipped, protocolViolations } = ingestDetails({
      experiment: baseExperiment,
      assignments: pairAssignments,
      details: pairVideos(),
      overrides: { va: "kimi-ipo-a", vb: "kimi-ipo-b" },
    });
    expect(skipped).toEqual([]);
    expect(protocolViolations).toEqual([]);
    expect(observations).toHaveLength(2);
    // The post date carries day precision, so the stored age is a lower bound.
    expect(observations[0].postedPrecision).toBe("day");
    expect(observations[0].ageHoursLower).toBeGreaterThan(72);
  });

  it("skips a post younger than 72h instead of reading it early", () => {
    const { observations, skipped } = ingestDetails({
      experiment: baseExperiment,
      assignments: pairAssignments,
      details: {
        fetchedAt: "2026-11-24T00:00:00.000Z",
        videos: [
          ...pairVideos().videos.slice(0, 1),
          { ...pairVideos().videos[1], postedOn: "11/22/2026" },
        ],
      },
      overrides: { va: "kimi-ipo-a", vb: "kimi-ipo-b" },
    });
    expect(observations.map((item) => item.videoId)).toEqual(["va"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/too early: lower-bound age 24\.0h < 72h/);
  });

  it("accepts a day-precision pair three calendar days apart (48h lower bound)", () => {
    const { observations, skipped } = ingestDetails({
      experiment: baseExperiment,
      assignments: pairAssignments,
      details: pairVideos({ aPosted: "11/14/2026", bPosted: "11/17/2026" }),
      overrides: { va: "kimi-ipo-a", vb: "kimi-ipo-b" },
    });
    expect(skipped).toEqual([]);
    expect(observations).toHaveLength(2);
  });

  it("skips a pair whose posts are under two calendar days apart", () => {
    const { observations, skipped } = ingestDetails({
      experiment: baseExperiment,
      assignments: pairAssignments,
      details: pairVideos({ bPosted: "11/15/2026" }),
      overrides: { va: "kimi-ipo-a", vb: "kimi-ipo-b" },
    });
    expect(observations).toEqual([]);
    expect(skipped).toHaveLength(2);
    expect(skipped[0].reason).toMatch(/the design needs 48h/);
  });

  it("skips a pair published in the wrong seeded order", () => {
    const { skipped } = ingestDetails({
      experiment: baseExperiment,
      assignments: pairAssignments,
      details: pairVideos({ aPosted: "11/18/2026", bPosted: "11/14/2026" }),
      overrides: { va: "kimi-ipo-a", vb: "kimi-ipo-b" },
    });
    expect(skipped).toHaveLength(2);
    expect(skipped[0].reason).toMatch(/publish order violated: kimi-ipo-b/);
  });

  it("labels a violation instead of dropping it when explicitly allowed", () => {
    const { observations, skipped, protocolViolations } = ingestDetails({
      experiment: baseExperiment,
      assignments: pairAssignments,
      details: pairVideos({ bPosted: "11/15/2026" }),
      overrides: { va: "kimi-ipo-a", vb: "kimi-ipo-b" },
      allowProtocolViolations: true,
    });
    expect(skipped).toEqual([]);
    expect(observations).toHaveLength(2);
    expect(protocolViolations).toHaveLength(1);
    expect(protocolViolations[0].violations[0]).toMatch(/48h/);
    expect(observations[0].protocolViolations).toHaveLength(1);
  });

  it("reports a repeated side instead of dropping it silently", () => {
    const videos = [...pairVideos().videos, { ...pairVideos().videos[0], videoId: "va-again" }];
    const { observations, skipped } = ingestDetails({
      experiment: baseExperiment,
      assignments: pairAssignments,
      details: { ...pairVideos(), videos },
      overrides: { va: "kimi-ipo-a", vb: "kimi-ipo-b", "va-again": "kimi-ipo-a" },
    });
    expect(observations.map((item) => item.videoId).sort()).toEqual(["va", "vb"]);
    expect(skipped.map((item) => item.videoId)).toEqual(["va-again"]);
    expect(skipped[0].reason).toMatch(/duplicate side/);
  });

  it("skips a post whose date is missing rather than assuming it is mature", () => {
    const videos = pairVideos().videos.map((video) => ({ ...video, postedOn: undefined }));
    const { observations, skipped } = ingestDetails({
      experiment: baseExperiment,
      assignments: pairAssignments,
      details: { ...pairVideos(), videos },
      overrides: { va: "kimi-ipo-a", vb: "kimi-ipo-b" },
    });
    expect(observations).toEqual([]);
    expect(skipped[0].reason).toMatch(/post date unknown/);
  });
});

describe("post time parsing", () => {
  it("reads TikTok's M/D/YYYY as a day-precision date", () => {
    const posted = parsePostedWhen({ postedOn: "11/9/2026" });
    expect(posted.precision).toBe("day");
    expect(new Date(posted.atMs).toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("treats a day-precision post as possibly sent at the end of that day", () => {
    const age = observationAge({ postedOn: "11/9/2026" }, "2026-11-13T00:00:00.000Z");
    expect(age.ageHoursLower).toBe(72);
  });

  it("uses an exact timestamp when the export carries one", () => {
    const posted = parsePostedWhen({ postedAt: "2026-11-09T18:30:00.000Z" });
    expect(posted.precision).toBe("exact");
    expect(posted.lowerMs).toBe(Date.parse("2026-11-09T18:30:00.000Z"));
  });
});

describe("co-primary decisions", () => {
  const coPrimary = {
    ...baseExperiment,
    primaryMetrics: ["fullVideoWatchedRate", "logAvgWatchTimeSec"],
    secondaryMetrics: [],
    targetPairs: 8,
  };

  function observationsWith({
    aRate = 0.5,
    bRate = 0.2,
    aLog = Math.log(20),
    bLog = Math.log(20),
  }) {
    const rows = pairedObservations(8, { aRate, bRate });
    for (const row of rows) {
      row.metrics.logAvgWatchTimeSec = row.variant === "A" ? aLog : bLog;
    }
    return rows;
  }

  it("requires both co-primaries to win before calling the treatment better", () => {
    const report = buildReport({
      experiment: coPrimary,
      assignments: pairedAssignments(8),
      observations: observationsWith({
        aRate: 0.2,
        bRate: 0.5,
        aLog: Math.log(10),
        bLog: Math.log(20),
      }),
    });
    expect(report.decision).toBe("treatment-better");
    expect(report.primaries.map((item) => item.decision)).toEqual([
      "treatment-better",
      "treatment-better",
    ]);
  });

  it("returns mixed when one co-primary wins and the other does not", () => {
    const report = buildReport({
      experiment: coPrimary,
      assignments: pairedAssignments(8),
      observations: observationsWith({ aRate: 0.2, bRate: 0.5 }),
    });
    expect(report.primaries.map((item) => item.decision)).toEqual([
      "treatment-better",
      "no-difference",
    ]);
    expect(report.decision).toBe("mixed");
  });

  it("returns no-difference when neither co-primary separates", () => {
    const report = buildReport({
      experiment: coPrimary,
      assignments: pairedAssignments(8),
      observations: observationsWith({ aRate: 0.3, bRate: 0.3 }),
    });
    expect(report.decision).toBe("no-difference");
  });

  it("withholds every co-primary while one of them is still short of the target", () => {
    const observations = observationsWith({
      aRate: 0.2,
      bRate: 0.5,
      aLog: Math.log(10),
      bLog: Math.log(20),
    });
    // Drop the log metric from one B side: the rate keeps n=8, the log metric has 7.
    observations[1].metrics.logAvgWatchTimeSec = null;
    const report = buildReport({
      experiment: { ...coPrimary, targetPairs: 8 },
      assignments: pairedAssignments(8),
      observations,
    });
    expect(report.primaries.map((item) => item.n)).toEqual([8, 7]);
    expect(report.fixedSampleReached).toBe(false);
    expect(report.primaries.every((item) => item.tests === null)).toBe(true);
    // One co-primary below the floor makes the whole family descriptive: the
    // completed one must not print a p-value on its own.
    expect(report.decision).toBe("descriptive-only");
    expect(report.status).toBe("descriptive-only");
  });

  it("refuses a verdict for a pilot below the descriptive floor", () => {
    const report = buildReport({
      experiment: { ...coPrimary, targetPairs: 6 },
      assignments: pairedAssignments(6),
      observations: observationsWith({
        aRate: 0.2,
        bRate: 0.5,
        aLog: Math.log(10),
        bLog: Math.log(20),
      }),
    });
    expect(report.reportable).toBe(false);
    expect(report.decision).toBe("descriptive-only");
    expect(report.status).toBe("descriptive-only");
  });

  it("keeps the interim decision out of the winner vocabulary", () => {
    const report = buildReport({
      experiment: baseExperiment,
      assignments: pairedAssignments(8),
      observations: observationsWith({
        aRate: 0.2,
        bRate: 0.5,
        aLog: Math.log(10),
        bLog: Math.log(20),
      }),
    });
    expect(report.decision).toBe("interim");
    expect(report.primaries.every((item) => item.tests === null)).toBe(true);
  });
});

describe("checkExperiment", () => {
  const experiment = { id: "l2-check", targetPairs: 1, primaryMetrics: ["fullVideoWatchedRate"] };
  const assignments = [
    { block: "b1", packSlug: "a", variant: "A", order: 1, durationSec: 60 },
    { block: "b1", packSlug: "b", variant: "B", order: 2, durationSec: 61 },
  ];
  const clean = [
    {
      videoId: "va",
      block: "b1",
      packSlug: "a",
      capturedAt: "2026-11-25T00:00:00.000Z",
      postedOn: "11/16/2026",
      metrics: { fullVideoWatchedRate: 0.4 },
    },
    {
      videoId: "vb",
      block: "b1",
      packSlug: "b",
      capturedAt: "2026-11-25T00:00:00.000Z",
      postedOn: "11/20/2026",
      metrics: { fullVideoWatchedRate: 0.5 },
    },
  ];

  it("passes a complete, mature record", () => {
    const result = checkExperiment({ experiment, assignments, observations: clean });
    expect(result.ok).toBe(true);
    expect(result.completeBlocks).toBe(1);
    expect(result.findings.filter((item) => item.level === "error")).toEqual([]);
  });

  it("flags the same video ingested twice", () => {
    const result = checkExperiment({
      experiment,
      assignments,
      observations: [...clean, { ...clean[0] }],
    });
    expect(result.ok).toBe(false);
    expect(result.findings.some((item) => item.code === "duplicate-video")).toBe(true);
  });

  it("flags an observation for a pack that was never assigned", () => {
    const result = checkExperiment({
      experiment,
      assignments,
      observations: [...clean, { ...clean[0], videoId: "vz", packSlug: "ghost" }],
    });
    expect(result.findings.some((item) => item.code === "unassigned-observation")).toBe(true);
  });

  it("flags a post stored while younger than T+72h", () => {
    const result = checkExperiment({
      experiment,
      assignments,
      observations: [{ ...clean[0], postedOn: "11/23/2026" }, clean[1]],
    });
    expect(result.ok).toBe(false);
    expect(result.findings.some((item) => item.code === "immature-observation")).toBe(true);
  });

  it("re-derives a day-precision age from the stored lower-bound timestamp", () => {
    // Ingest stores `postedAt` as the latest plausible posting moment, so the
    // audit sees 24h here — not 0h (day start) and not 48h.
    const result = checkExperiment({
      experiment,
      assignments,
      observations: [
        { ...clean[0], postedOn: "11/23/2026", postedAt: "2026-11-24T00:00:00.000Z" },
        clean[1],
      ],
    });
    expect(result.ok).toBe(false);
    const finding = result.findings.find((item) => item.code === "immature-observation");
    expect(finding.detail).toContain("24.0h");
  });

  it("flags a duration gap above 3s recorded at assignment time", () => {
    const drifted = [assignments[0], { ...assignments[1], durationSec: 70 }];
    const result = checkExperiment({ experiment, assignments: drifted, observations: clean });
    expect(result.findings.some((item) => item.code === "duration-gap")).toBe(true);
  });

  it("keeps a labelled protocol violation as a warning, not an error", () => {
    const result = checkExperiment({
      experiment,
      assignments,
      observations: [{ ...clean[0], protocolViolations: ["posts are 24.0h apart"] }, clean[1]],
    });
    expect(result.ok).toBe(true);
    expect(result.findings.some((item) => item.code === "protocol-violation")).toBe(true);
  });
});

describe("experiment CLI integrity gate", () => {
  it("exits non-zero on a broken record and zero on a clean one", () => {
    const dir = mkdtempSync(join(tmpdir(), "l2-check-"));
    const experimentDir = join(dir, "l2-cli");
    mkdirSync(experimentDir, { recursive: true });
    writeFileSync(
      join(experimentDir, "experiment.json"),
      JSON.stringify({
        id: "l2-cli",
        hypothesis: "h",
        factor: "f",
        primaryMetrics: ["fullVideoWatchedRate"],
        primaryMetric: "fullVideoWatchedRate",
        secondaryMetrics: [],
        targetPairs: 1,
        alpha: 0.05,
        power: 0.8,
        seed: 1,
        variants: { A: "control", B: "treatment" },
      }),
      "utf8",
    );
    const assignments = [
      { block: "b1", packSlug: "a", variant: "A", order: 1, durationSec: 60 },
      { block: "b1", packSlug: "b", variant: "B", order: 2, durationSec: 61 },
    ];
    writeFileSync(
      join(experimentDir, "assignments.jsonl"),
      assignments.map((item) => JSON.stringify(item)).join("\n") + "\n",
      "utf8",
    );
    const observations = [
      {
        videoId: "va",
        block: "b1",
        packSlug: "a",
        capturedAt: "2026-11-25T00:00:00.000Z",
        postedOn: "11/16/2026",
        metrics: { fullVideoWatchedRate: 0.4 },
      },
      {
        videoId: "vb",
        block: "b1",
        packSlug: "b",
        capturedAt: "2026-11-25T00:00:00.000Z",
        postedOn: "11/20/2026",
        metrics: { fullVideoWatchedRate: 0.5 },
      },
    ];
    const observationsPath = join(experimentDir, "observations.jsonl");
    writeFileSync(
      observationsPath,
      observations.map((item) => JSON.stringify(item)).join("\n") + "\n",
      "utf8",
    );
    const script = fileURLToPath(new URL("../experiment.mjs", import.meta.url));

    const clean = execFileSync(
      process.execPath,
      [script, "check", "--experiment", "l2-cli", "--experiments-dir", dir],
      { encoding: "utf8" },
    );
    expect(clean).toContain("1/1 complete pairs");

    writeFileSync(
      observationsPath,
      [...observations, observations[0]].map((item) => JSON.stringify(item)).join("\n") + "\n",
      "utf8",
    );
    let failure = null;
    try {
      execFileSync(
        process.execPath,
        [script, "check", "--experiment", "l2-cli", "--experiments-dir", dir],
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).not.toBeNull();
    expect(failure.status).toBe(1);
    expect(String(failure.stdout)).toContain("duplicate-video");
    rmSync(dir, { recursive: true, force: true });
  });
});
