import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Decoding is covered by cut-detect's own tests; here the detector is fed a
// fixed cut list so the retime/comparison wiring is deterministic and offline.
const { detectCuts } = vi.hoisted(() => ({ detectCuts: vi.fn() }));
vi.mock("../lib/cut-detect.mjs", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, detectCuts };
});

import {
  compareCutTimeline,
  firstSegmentSpanMs,
  maxStartDelta,
  retimeWithCuts,
} from "../competitor-benchmarks-cuts.mjs";

const SEGMENTS = [
  { start: 0, end: 8000, text: "the hook" },
  { start: 8000, end: 38000, text: "the body" },
];

describe("compareCutTimeline (#749)", () => {
  it("agrees when the cut start sits inside the anchored ASR segment", () => {
    const items = [1, 1, 2, 2].map((anchorSegment) => ({ anchorSegment }));
    const result = compareCutTimeline({
      items,
      segments: SEGMENTS,
      cutStarts: [0, 4000, 9000, 20000],
    });
    expect(result).toMatchObject({
      compared: 4,
      agree: 4,
      diverge: 0,
      unmeasured: 0,
      verdict: "agree",
    });
  });

  it("flags an item whose cut start crosses into another segment", () => {
    const items = [1, 1, 2].map((anchorSegment) => ({ anchorSegment }));
    const result = compareCutTimeline({ items, segments: SEGMENTS, cutStarts: [0, 9000, 20000] });
    expect(result.agree).toBe(2);
    expect(result.diverge).toBe(1);
    expect(result.diverged[0]).toMatchObject({ item: 2, anchorSegment: 1, cutStartMs: 9000 });
    expect(result.verdict).toBe("agree"); // 2 of 3 — at least half
  });

  it("counts out-of-range and missing anchors as unmeasured, never as disagreement", () => {
    // The model naming segments beyond the transcript is an enumeration
    // artifact, not a measured claim (kanekallaway's 1..N anchors).
    const items = [{ anchorSegment: 1 }, { anchorSegment: 99 }, {}, { anchorSegment: 0 }];
    const result = compareCutTimeline({
      items,
      segments: SEGMENTS,
      cutStarts: [0, 9000, 12000, 20000],
    });
    expect(result).toMatchObject({
      compared: 1,
      agree: 1,
      diverge: 0,
      unmeasured: 3,
      verdict: "agree",
    });
  });

  it("returns unmeasurable when no item has a measured claim", () => {
    const result = compareCutTimeline({
      items: [{ anchorSegment: 7 }],
      segments: SEGMENTS,
      cutStarts: [0],
    });
    expect(result.verdict).toBe("unmeasurable");
  });

  it("diverges when fewer than half the comparable items agree", () => {
    const items = [1, 1, 1].map((anchorSegment) => ({ anchorSegment }));
    const result = compareCutTimeline({ items, segments: SEGMENTS, cutStarts: [0, 9000, 12000] });
    expect(result).toMatchObject({ agree: 1, diverge: 2, verdict: "diverge" });
  });
});

describe("maxStartDelta / firstSegmentSpanMs (#749)", () => {
  it("returns the largest item-wise shift and its 1-based position", () => {
    expect(maxStartDelta([0, 1000, 2000], [0, 1500, 1000])).toEqual({ maxDeltaMs: 1000, item: 3 });
  });

  it("uses the first measurable segment's span as the §10.3 threshold", () => {
    expect(firstSegmentSpanMs(SEGMENTS)).toBe(8000);
    expect(firstSegmentSpanMs([{ start: 0, end: 1000, text: "" }])).toBeNull();
    expect(firstSegmentSpanMs([])).toBeNull();
  });
});

// ─── retimeWithCuts wiring ───

const CUTS = [1833, 3733, 6100, 8500, 10267, 12167];

function makeFixture({ withVideo = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "competitor-cuts-test-"));
  const videoRoot = join(root, "bench");
  const dir = join(videoRoot, "analysis-recompute");
  const outDir = join(videoRoot, "analysis-cuts");
  const handleDir = join(dir, "shedoesai");
  mkdirSync(handleDir, { recursive: true });
  if (withVideo) {
    mkdirSync(join(videoRoot, "shedoesai"), { recursive: true });
    writeFileSync(join(videoRoot, "shedoesai", "737.mp4"), "fake");
  }
  // Real `shedoesai/7372434986558934305` shape: 9 beats/shots over 2 ASR
  // segments (7 anchored to the first, 2 to the second).
  const items = [
    ...Array.from({ length: 7 }, () => ({ anchorSegment: 1, intent: "x" })),
    ...Array.from({ length: 2 }, () => ({ anchorSegment: 2, intent: "x" })),
  ];
  const record = {
    schemaVersion: "competitor-breakdown-v1",
    meta: { handle: "shedoesai", videoId: "737", durationSec: 15.8 },
    verdict: "v",
    story_level: null,
    beats: structuredClone(items),
    shots: structuredClone(items),
    learnings: { reusable: [], antiPatterns: [] },
    evidence: {
      asrSegments: 2,
      breakdownParsed: true,
      timing: {
        durationMs: 15800,
        beatsAnchorSource: "interpolated",
        shotsAnchorSource: "interpolated",
        beatsTotal: 9,
        shotsTotal: 9,
        beatsAnchored: 9,
        shotsAnchored: 9,
        beatsMeasuredDistinctStarts: 1,
        shotsMeasuredDistinctStarts: 1,
        beatsDistinctStarts: 9,
        shotsDistinctStarts: 9,
        beatsCollapsed: true,
        shotsCollapsed: true,
      },
    },
  };
  writeFileSync(join(handleDir, "737.json"), JSON.stringify(record, null, 2));
  writeFileSync(
    join(handleDir, "737.asr.json"),
    JSON.stringify({
      language: "en",
      segments: [
        { start: 0, end: 7920, text: "the hook" },
        { start: 8640, end: 15040, text: "the body" },
      ],
    }),
  );
  return { root, videoRoot, dir, outDir };
}

describe("retimeWithCuts (#749)", () => {
  let fixture;

  beforeEach(() => {
    fixture = makeFixture();
    detectCuts.mockReset();
    detectCuts.mockReturnValue({ cutsMs: CUTS, threshold: 0.15 });
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("writes a retimed record, the cuts artifact and the ASR evidence", () => {
    const report = retimeWithCuts({
      dir: fixture.dir,
      outDir: fixture.outDir,
      videoRoot: fixture.videoRoot,
      asrDir: fixture.dir,
      threshold: 0.15,
    });
    expect(report.summary).toMatchObject({
      cutsDetected: 1,
      cutsTotal: 6,
      noCutRecords: 0,
      repairedLayers: 2,
      repairedRecords: 1,
      agree: 2,
      diverge: 0,
    });
    const record = JSON.parse(readFileSync(join(fixture.outDir, "shedoesai", "737.json"), "utf8"));
    expect(record.evidence.timing).toMatchObject({
      beatsAnchorSource: "cuts",
      shotsAnchorSource: "cuts",
      beatsMeasuredDistinctStarts: 7,
      beatsCollapsed: false,
    });
    expect(record.evidence.cuts).toEqual({ total: 6, threshold: 0.15, artifact: "737.cuts.json" });
    expect(record.beats.map((item) => item.startMs)).toEqual([
      0, 1833, 3733, 3733, 6100, 8500, 10267, 10267, 12167,
    ]);
    expect(existsSync(join(fixture.outDir, "shedoesai", "737.asr.json"))).toBe(true);
    const artifact = JSON.parse(
      readFileSync(join(fixture.outDir, "shedoesai", "737.cuts.json"), "utf8"),
    );
    expect(artifact).toMatchObject({
      schemaVersion: "competitor-cuts-v1",
      threshold: 0.15,
      cutsMs: CUTS,
    });
  });

  it("keeps the interpolation when the video has no cuts", () => {
    detectCuts.mockReturnValue({ cutsMs: [], threshold: 0.15 });
    const report = retimeWithCuts({
      dir: fixture.dir,
      outDir: fixture.outDir,
      videoRoot: fixture.videoRoot,
      asrDir: fixture.dir,
    });
    expect(report.summary).toMatchObject({
      cutsDetected: 0,
      noCutRecords: 1,
      repairedLayers: 0,
      repairedRecords: 0,
    });
    const record = JSON.parse(readFileSync(join(fixture.outDir, "shedoesai", "737.json"), "utf8"));
    expect(record.evidence.timing.beatsAnchorSource).toBe("interpolated");
    expect(record.evidence.cuts).toEqual({ total: 0, threshold: 0.15, artifact: "737.cuts.json" });
    // Today's behavior, unchanged.
    expect(record.beats[1].startMs).toBe(1234);
  });

  it("copies records it cannot retime and reports why", () => {
    rmSync(join(fixture.videoRoot, "shedoesai", "737.mp4"));
    const report = retimeWithCuts({
      dir: fixture.dir,
      outDir: fixture.outDir,
      videoRoot: fixture.videoRoot,
      asrDir: fixture.dir,
    });
    expect(report.skipped).toEqual([{ key: "shedoesai/737", reason: "video-missing" }]);
    expect(report.processed).toBe(0);
    expect(detectCuts).not.toHaveBeenCalled();
    const record = JSON.parse(readFileSync(join(fixture.outDir, "shedoesai", "737.json"), "utf8"));
    expect(record.evidence.timing.beatsAnchorSource).toBe("interpolated");
  });
});
