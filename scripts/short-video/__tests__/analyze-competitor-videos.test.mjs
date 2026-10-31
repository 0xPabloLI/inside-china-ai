import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The batch leg's ASR dependency; the limit test drives the real loop through
// it rather than loading whisper.cpp.
vi.mock("../lib/video-understand.mjs", () => ({
  transcribeVideo: vi.fn(async () => ({
    language: "en",
    segments: [{ start: 0, end: 1000, text: "the hook" }],
  })),
}));

import {
  formatTranscript,
  measurableSegments,
  parseBreakdownJson,
  repairBreakdownJson,
  anchorTimings,
  isTimelineCollapsed,
  interpolateStarts,
  resolveCutStarts,
  resolveTimings,
  buildRecord,
  safeSegment,
  analyzeCompetitorVideos,
  COMPETITOR_PROMPT,
} from "../analyze-competitor-videos.mjs";

// ─── measurableSegments / formatTranscript ───

const SEGMENTS = [
  { start: 0, end: 6080, text: "the hook" },
  { start: 6660, end: 13100, text: "" },
  { start: 13560, end: 18260, text: "the middle" },
  { start: 28480, end: 49080, text: "the CTA" },
];

describe("measurableSegments (#300 stage 2)", () => {
  it("keeps only segments that carry text", () => {
    expect(measurableSegments(SEGMENTS)).toHaveLength(3);
    expect(measurableSegments(null)).toEqual([]);
  });
});

describe("formatTranscript (#300 stage 2)", () => {
  it("numbers the measured segments the prompt's anchors refer to", () => {
    // The empty-text segment is dropped, so `[seg 2]` is really SEGMENTS[2] —
    // this numbering is what anchorTimings must resolve against.
    expect(formatTranscript(SEGMENTS)).toBe(
      [
        "[seg 1] 0-6080ms: the hook",
        "[seg 2] 13560-18260ms: the middle",
        "[seg 3] 28480-49080ms: the CTA",
      ].join("\n"),
    );
  });

  it("returns a placeholder when there is no speech", () => {
    expect(formatTranscript([])).toBe("(no speech detected)");
    expect(formatTranscript([{ start: 0, end: 1, text: "" }])).toBe("(no speech detected)");
  });
});

// ─── parseBreakdownJson ───

describe("parseBreakdownJson (#300 stage 2)", () => {
  it("parses a bare JSON object", () => {
    expect(parseBreakdownJson('{"verdict":"works"}')).toEqual({ verdict: "works" });
  });

  it("strips markdown fences the model adds anyway", () => {
    expect(parseBreakdownJson('```json\n{"verdict":"works"}\n```')).toEqual({ verdict: "works" });
  });

  it("takes the outermost object when prose surrounds it", () => {
    const text = 'Sure! Here it is:\n{"verdict":"works","beats":[]}\nHope that helps.';
    expect(parseBreakdownJson(text)).toEqual({ verdict: "works", beats: [] });
  });

  it("stops at the first balanced closing brace (no trailing-garbage overrun)", () => {
    expect(parseBreakdownJson('{"a":{"b":1}} trailing junk {"c":2}')).toEqual({ a: { b: 1 } });
  });

  it("does not treat braces inside strings as structure", () => {
    expect(parseBreakdownJson('{"verdict":"it says {hello} and \\"bye\\""}')).toEqual({
      verdict: 'it says {hello} and "bye"',
    });
  });

  it("returns null when there is no JSON object", () => {
    expect(parseBreakdownJson("no object here")).toBeNull();
    expect(parseBreakdownJson("")).toBeNull();
    expect(parseBreakdownJson(null)).toBeNull();
  });

  it("returns null on malformed JSON rather than throwing", () => {
    expect(parseBreakdownJson('{"verdict": "unterminated')).toBeNull();
  });
});

// ─── repairBreakdownJson (#729) ───

describe("repairBreakdownJson (#729)", () => {
  // The exact shape the batch hit: the model closed the final array with `}`
  // instead of `]`, leaving the root object one closer short. `"antiPatterns":
  // ["None"}}` should have been `["None"]}}` — one delimiter's *type* is wrong.
  const MISMATCHED =
    '{"verdict":"works","beats":[{"anchorSegment":1,"intent":"x"}],' +
    '"learnings":{"reusable":["a"],"antiPatterns":["None"}}';

  it("does not repair a well-formed or merely-fenced reply (parse handles those)", () => {
    // Only reached when parseBreakdownJson already failed; it must not change a
    // good payload's meaning if ever called on one.
    expect(repairBreakdownJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("recovers the delimiter-type mismatch instead of dropping the record", () => {
    expect(parseBreakdownJson(MISMATCHED)).toBeNull(); // the failure being repaired
    expect(repairBreakdownJson(MISMATCHED)).toEqual({
      verdict: "works",
      beats: [{ anchorSegment: 1, intent: "x" }],
      learnings: { reusable: ["a"], antiPatterns: ["None"] },
    });
  });

  it("coerces a `]` used where `}` belonged (the mirror case)", () => {
    expect(repairBreakdownJson('{"a":{"b":1]}}')).toEqual({ a: { b: 1 } });
  });

  it("refuses a truncated reply: a text ending mid-string is not repairable", () => {
    // Truncation's signature — the output budget cut mid-token — must stay a
    // hard failure, never dressed up as a complete record.
    expect(repairBreakdownJson('{"verdict":"wor')).toBeNull();
    expect(repairBreakdownJson('{"beats":[{"anchorSeg')).toBeNull();
  });

  it("returns null when there is nothing object-shaped to repair", () => {
    expect(repairBreakdownJson("no object here")).toBeNull();
    expect(repairBreakdownJson(null)).toBeNull();
  });

  it("appends the closers owed when the text ends cleanly but short", () => {
    // Ends on a structural char (not mid-string) one closer short → recoverable.
    expect(repairBreakdownJson('{"a":[1,2')).toEqual({ a: [1, 2] });
  });
});

// ─── isTimelineCollapsed (#730) ───

describe("isTimelineCollapsed (#730)", () => {
  it("flags the measured batch case: 9 beats over 2 distinct starts", () => {
    // `shedoesai/7372434986558934305` — the false negative the ticket is about.
    expect(isTimelineCollapsed(9, 2)).toBe(true);
  });

  it("does not flag a healthy 9-beat / 9-start timeline", () => {
    expect(isTimelineCollapsed(9, 9)).toBe(false);
  });

  it("does not flag borderline ratios at or above half the items", () => {
    expect(isTimelineCollapsed(15, 9)).toBe(false); // 0.6 — the real 2nd-lowest record
    expect(isTimelineCollapsed(4, 2)).toBe(false); // exactly half
    expect(isTimelineCollapsed(6, 3)).toBe(false);
    expect(isTimelineCollapsed(5, 3)).toBe(false);
  });

  it("ignores timelines too short for a ratio to mean anything", () => {
    expect(isTimelineCollapsed(2, 1)).toBe(false);
    expect(isTimelineCollapsed(1, 1)).toBe(false);
    expect(isTimelineCollapsed(0, 0)).toBe(false);
  });
});

// ─── interpolateStarts / resolveTimings (#730) ───

describe("resolveTimings (#730)", () => {
  it("leaves a healthy timeline on the measured source", () => {
    const items = [1, 2, 3, 4].map((anchorSegment) => ({ anchorSegment }));
    const r = resolveTimings(items, SEGMENTS, 49100);
    expect(r.anchorSource).toBe("asr");
    // Anchor 4 is out of range for the 3 measurable segments, so it inherits the
    // previous start: 3 distinct over 4 items is still healthy.
    expect(r.rawDistinctStarts).toBe(3);
    expect(r.items.map((b) => b.startMs)).toEqual([0, 13560, 28480, 28480]);
  });

  it("interpolates a collapsed timeline within its measured segment spans", () => {
    // 7 items on segment 1 + 2 on segment 3, mirroring shedoesai's shape.
    const items = [
      ...Array.from({ length: 7 }, () => ({ anchorSegment: 1 })),
      ...Array.from({ length: 2 }, () => ({ anchorSegment: 3 })),
    ];
    const r = resolveTimings(items, SEGMENTS, 28480 + 5000);
    expect(r.anchorSource).toBe("interpolated");
    expect(r.rawDistinctStarts).toBe(2); // what measurement actually achieved
    expect(r.distinctStarts).toBe(9); // resolved shape
    // Monotonic, non-zero-length ranges — the invariant the fallback must keep.
    for (let i = 1; i < r.items.length; i++) {
      expect(r.items[i].startMs).toBeGreaterThanOrEqual(r.items[i - 1].startMs);
    }
    for (const b of r.items) expect(b.endMs).toBeGreaterThan(b.startMs);
    // The second group still starts at its real segment boundary (28480).
    expect(r.items[7].startMs).toBe(28480);
  });

  it("keeps interpolatedStarts a no-op for a single-item group", () => {
    const items = [{ startMs: 500 }];
    expect(interpolateStarts(items, 1000)).toEqual([500]);
  });
});

// ─── second measured source (#749) ───

const COLLAPSED_ITEMS = [
  ...Array.from({ length: 7 }, () => ({ anchorSegment: 1 })),
  ...Array.from({ length: 2 }, () => ({ anchorSegment: 3 })),
];
// 8 measured transitions inside the 33.48s span.
const CUTS = [2000, 5000, 8000, 12000, 16000, 20000, 24000, 30000];
const COLLAPSED_SPAN = 28480 + 5000;

describe("resolveCutStarts (#749)", () => {
  it("returns null when the material has no usable cut", () => {
    expect(resolveCutStarts(9, [], 15800)).toBeNull();
    expect(resolveCutStarts(9, null, 15800)).toBeNull();
    // Only the video start / out-of-span values are not a second source.
    expect(resolveCutStarts(9, [0, 15800, 40000, NaN], 15800)).toBeNull();
    expect(resolveCutStarts(9, CUTS, 0)).toBeNull();
    expect(resolveCutStarts(0, CUTS, 15800)).toBeNull();
  });

  it("uses only measured times: the video start plus detected cuts", () => {
    const starts = resolveCutStarts(COLLAPSED_ITEMS.length, CUTS, COLLAPSED_SPAN);
    expect(starts).toEqual([0, ...CUTS]);
    // Every start is a measured boundary — nothing invented between cuts.
    for (const start of starts) expect([0, ...CUTS]).toContain(start);
  });

  it("samples the grid evenly when there are more cuts than items", () => {
    const starts = resolveCutStarts(3, CUTS, COLLAPSED_SPAN);
    expect(starts).toEqual([0, 12000, 30000]);
  });

  it("lets items share a cut when the material offers less resolution", () => {
    // Two boundaries for nine items: the resolved shape keeps the honest
    // resolution (the collapse verdict is computed from it), it does not
    // invent eight distinct starts.
    const starts = resolveCutStarts(9, [5000], COLLAPSED_SPAN);
    expect(new Set(starts).size).toBe(2);
    expect(starts[0]).toBe(0);
    expect(starts[starts.length - 1]).toBe(5000);
  });

  it("dedupes and sorts cuts, and returns a single start for one item", () => {
    expect(resolveCutStarts(3, [8000, 2000, 8000, 2000], COLLAPSED_SPAN)).toEqual([0, 2000, 8000]);
    expect(resolveCutStarts(1, CUTS, COLLAPSED_SPAN)).toEqual([0]);
  });
});

describe("resolveTimings with a cut source (#749)", () => {
  it("re-anchors a collapsed layer on the measured cuts", () => {
    const r = resolveTimings(COLLAPSED_ITEMS, SEGMENTS, COLLAPSED_SPAN, CUTS);
    expect(r.anchorSource).toBe("cuts");
    expect(r.items.map((item) => item.startMs)).toEqual([0, ...CUTS]);
    expect(r.rawDistinctStarts).toBe(9); // measured boundaries actually used
    expect(r.distinctStarts).toBe(9);
    for (let i = 1; i < r.items.length; i++) {
      expect(r.items[i].startMs).toBeGreaterThanOrEqual(r.items[i - 1].startMs);
    }
    for (const item of r.items) expect(item.endMs).toBeGreaterThan(item.startMs);
  });

  it("keeps today's interpolation byte-for-byte when no cut source exists", () => {
    // The #749 acceptance: a missing second source must not change behavior.
    const without = resolveTimings(COLLAPSED_ITEMS, SEGMENTS, COLLAPSED_SPAN);
    const empty = resolveTimings(COLLAPSED_ITEMS, SEGMENTS, COLLAPSED_SPAN, []);
    const outOfRange = resolveTimings(COLLAPSED_ITEMS, SEGMENTS, COLLAPSED_SPAN, [0, 99999]);
    expect(empty).toEqual(without);
    expect(outOfRange).toEqual(without);
    expect(without.anchorSource).toBe("interpolated");
    expect(without.items.map((item) => item.startMs)).toEqual([
      0, 4069, 8137, 12206, 16274, 20343, 24411, 28480, 30980,
    ]);
  });

  it("never touches a healthy ASR layer even when cuts exist", () => {
    const items = [1, 2, 3, 4].map((anchorSegment) => ({ anchorSegment }));
    const without = resolveTimings(items, SEGMENTS, 49100);
    const withCuts = resolveTimings(items, SEGMENTS, 49100, CUTS);
    expect(withCuts).toEqual(without);
    expect(withCuts.anchorSource).toBe("asr");
  });
});

// ─── anchorTimings ───

describe("anchorTimings (#300 stage 2)", () => {
  it("takes each start from the measured start of its anchor segment", () => {
    const { items, anchored } = anchorTimings(
      [{ anchorSegment: 1 }, { anchorSegment: 2 }, { anchorSegment: 3 }],
      SEGMENTS,
      49100,
    );
    expect(items.map((b) => b.startMs)).toEqual([0, 13560, 28480]);
    expect(anchored).toBe(3);
  });

  it("ends an item at the next distinct anchor, and the last at the duration", () => {
    const { items } = anchorTimings(
      [{ anchorSegment: 1 }, { anchorSegment: 2 }, { anchorSegment: 3 }],
      SEGMENTS,
      49100,
    );
    expect(items.map((b) => b.endMs)).toEqual([13560, 28480, 49100]);
  });

  it("regression: a 49.1s video is no longer compressed into the first 5s", () => {
    // The pre-anchor run produced beats ending at 4800ms on this exact video.
    const { items } = anchorTimings([{ anchorSegment: 1 }, { anchorSegment: 3 }], SEGMENTS, 49100);
    expect(items[items.length - 1].endMs).toBe(49100);
  });

  it("never returns a zero-length range when neighbours share an anchor", () => {
    const { items } = anchorTimings(
      [{ anchorSegment: 1 }, { anchorSegment: 1 }, { anchorSegment: 3 }],
      SEGMENTS,
      49100,
    );
    expect(items[0].startMs).toBe(0);
    expect(items[0].endMs).toBe(28480); // skips the duplicate to the next distinct start
    expect(items[1].startMs).toBe(0);
    expect(items[1].endMs).toBe(28480);
    for (const b of items) expect(b.endMs).toBeGreaterThan(b.startMs);
  });

  it("lets an unanchored item inherit the previous start instead of inventing one", () => {
    const { items, anchored } = anchorTimings(
      [{ anchorSegment: 1 }, { anchorSegment: null }, { anchorSegment: 3 }],
      SEGMENTS,
      49100,
    );
    expect(items[1].startMs).toBe(0);
    expect(anchored).toBe(2);
  });

  it("clamps a non-monotonic anchor so the timeline cannot run backwards", () => {
    const { items } = anchorTimings([{ anchorSegment: 3 }, { anchorSegment: 1 }], SEGMENTS, 49100);
    expect(items[0].startMs).toBe(28480);
    expect(items[1].startMs).toBe(28480);
    expect(items[1].endMs).toBeGreaterThanOrEqual(items[1].startMs);
  });

  it("treats an out-of-range anchor as unanchored", () => {
    const { items, anchored } = anchorTimings(
      [{ anchorSegment: 9 }, { anchorSegment: 1 }],
      SEGMENTS,
      49100,
    );
    expect(anchored).toBe(1);
    expect(items[0].startMs).toBe(0);
  });

  it("falls back to the last measured voice end when the duration is unknown", () => {
    const { items } = anchorTimings([{ anchorSegment: 1 }, { anchorSegment: 3 }], SEGMENTS, null);
    expect(items[1].endMs).toBe(49080);
  });

  it("returns an empty result for missing items", () => {
    expect(anchorTimings(null, SEGMENTS, 1000)).toEqual({
      items: [],
      anchored: 0,
      total: 0,
      distinctStarts: 0,
      span: 1000,
    });
    expect(anchorTimings([], null, 1000)).toEqual({
      items: [],
      anchored: 0,
      total: 0,
      distinctStarts: 0,
      span: 1000,
    });
  });

  it("counts distinct starts so a collapsed timeline is visible", () => {
    const spread = anchorTimings(
      [{ anchorSegment: 1 }, { anchorSegment: 2 }, { anchorSegment: 3 }],
      SEGMENTS,
      49100,
    );
    expect(spread.distinctStarts).toBe(3);
  });

  it("regression: shedosai-style collapse — every anchor on one segment", () => {
    // 2026-10-17 `shedoesai/7372434986558934305` (15.8s) had only 2 ASR segments
    // and the model anchored all 9 beats to segment 1, so every start was 0.
    const { items, anchored, distinctStarts, total } = anchorTimings(
      Array.from({ length: 9 }, () => ({ anchorSegment: 1 })),
      SEGMENTS,
      15800,
    );
    expect(anchored).toBe(9); // every item "resolved" — which is exactly why this
    expect(total).toBe(9); //    looked healthy and needed a separate signal
    expect(distinctStarts).toBe(1);
    expect(items.every((b) => b.startMs === 0)).toBe(true);
  });

  it("keeps the model's own fields alongside the derived times", () => {
    const { items } = anchorTimings(
      [{ anchorSegment: 2, intent: "show the fix", audienceQuestionIn: "does it work?" }],
      SEGMENTS,
      49100,
    );
    expect(items[0]).toMatchObject({
      anchorSegment: 2,
      intent: "show the fix",
      audienceQuestionIn: "does it work?",
      startMs: 13560,
      endMs: 49100,
    });
  });
});

// ─── buildRecord ───

describe("buildRecord (#300 stage 2)", () => {
  const target = {
    handle: "shedoesai",
    followers: "227K",
    video: {
      id: "7372434986558934305",
      url: "https://www.tiktok.com/@shedoesai/video/7372434986558934305",
      views: "983.2K",
      plays: 983200,
    },
  };
  const transcript = { segments: SEGMENTS, guard: { changed: false } };

  it("fills meta from the manifest and leaves uncaptured fields null", () => {
    const rec = buildRecord(target, 42.5, null, transcript);
    expect(rec.schemaVersion).toBe("competitor-breakdown-v1");
    expect(rec.meta).toMatchObject({
      handle: "shedoesai",
      followers: "227K",
      videoId: "7372434986558934305",
      plays: 983200,
      durationSec: 42.5,
      language: "en",
    });
    // We never scraped these — they must stay null, never invented.
    expect(rec.meta.likes).toBeNull();
    expect(rec.meta.comments).toBeNull();
    expect(rec.meta.shares).toBeNull();
    expect(rec.meta.publishedAt).toBeNull();
  });

  it("degrades to empty layers when the VLM produced no breakdown", () => {
    const rec = buildRecord(target, null, null, null);
    expect(rec.verdict).toBeNull();
    expect(rec.story_level).toBeNull();
    expect(rec.beats).toEqual([]);
    expect(rec.shots).toEqual([]);
    expect(rec.learnings).toEqual({ reusable: [], antiPatterns: [] });
    expect(rec.evidence.breakdownParsed).toBe(false);
    expect(rec.evidence.timing).toMatchObject({
      beatsTotal: 0,
      beatsAnchored: 0,
      shotsTotal: 0,
      shotsAnchored: 0,
    });
  });

  it("passes the parsed layers through, anchored to the measured timeline", () => {
    const breakdown = {
      verdict: "tight hook",
      story_level: { hook: "question", develop: "demo", turn: null, landing: "CTA" },
      beats: [{ anchorSegment: 1, intent: "stop the scroll" }],
      shots: [{ anchorSegment: 1, visual: "talking head" }],
      learnings: { reusable: ["name the tool in the hook"], antiPatterns: [] },
    };
    const rec = buildRecord(target, 49.1, breakdown, transcript);
    expect(rec.verdict).toBe("tight hook");
    expect(rec.beats[0]).toMatchObject({ startMs: 0, endMs: 49100, intent: "stop the scroll" });
    expect(rec.shots[0]).toMatchObject({ startMs: 0, endMs: 49100, visual: "talking head" });
    expect(rec.evidence).toMatchObject({
      asrSegments: 4,
      asrGuardChanged: false,
      breakdownParsed: true,
    });
    // Only 1 of 1 shot was anchored: the provenance must say so.
    expect(rec.evidence.timing).toEqual({
      durationMs: 49100,
      beatsAnchorSource: "asr",
      shotsAnchorSource: "asr",
      beatsTotal: 1,
      beatsAnchored: 1,
      shotsTotal: 1,
      shotsAnchored: 1,
      beatsMeasuredDistinctStarts: 1,
      shotsMeasuredDistinctStarts: 1,
      beatsDistinctStarts: 1,
      shotsDistinctStarts: 1,
      beatsCollapsed: false,
      shotsCollapsed: false,
    });
  });

  it("flags a collapsed timeline and reconstructs its pacing (#730)", () => {
    const breakdown = {
      beats: Array.from({ length: 9 }, () => ({ anchorSegment: 1, intent: "x" })),
      shots: Array.from({ length: 9 }, () => ({ anchorSegment: 1, visual: "y" })),
    };
    const rec = buildRecord(target, 15.8, breakdown, transcript);
    // The health signal stays honest (it reads the *measured* resolution) …
    expect(rec.evidence.timing.beatsCollapsed).toBe(true);
    expect(rec.evidence.timing.shotsCollapsed).toBe(true);
    // … while the data is repaired within the segment spans, not left collapsed.
    expect(rec.evidence.timing.beatsAnchorSource).toBe("interpolated");
    expect(rec.evidence.timing.beatsMeasuredDistinctStarts).toBe(1); // what measurement achieved
    expect(rec.evidence.timing.beatsDistinctStarts).toBe(9); // resolved shape after fallback
    for (const b of rec.beats) expect(b.endMs).toBeGreaterThan(b.startMs);
    expect(rec.evidence.asrSegments).toBe(4); // total segments, the cause-side input
  });

  it("keeps provenance per layer when only shots are reconstructed", () => {
    // Real batch shape (kanekallaway/7676104609177423134): beats fully anchored
    // while 30 shots use anchors 1..30 against a 3-segment transcript, so 27 have
    // no measured start. One shared source would misstate one of the two layers.
    const breakdown = {
      beats: [1, 2, 3, 4].map((anchorSegment) => ({ anchorSegment })),
      shots: Array.from({ length: 30 }, (_, i) => ({ anchorSegment: i + 1 })),
    };
    const rec = buildRecord(target, 84, breakdown, transcript);
    expect(rec.evidence.timing.beatsAnchorSource).toBe("asr");
    expect(rec.evidence.timing.shotsAnchorSource).toBe("interpolated");
    expect(rec.evidence.timing.shotsAnchored).toBe(3); // only segs 1..3 resolve
    expect(rec.evidence.timing.shotsCollapsed).toBe(true);
    expect(rec.evidence.timing.beatsCollapsed).toBe(false);
  });

  it("re-anchors collapsed layers on measured cuts and records the artifact (#749)", () => {
    const breakdown = {
      beats: Array.from({ length: 9 }, () => ({ anchorSegment: 1 })),
      shots: Array.from({ length: 9 }, () => ({ anchorSegment: 1 })),
    };
    const cuts = { times: CUTS, threshold: 0.15, artifact: "123.cuts.json" };
    const rec = buildRecord(target, COLLAPSED_SPAN / 1000, breakdown, transcript, cuts);
    expect(rec.evidence.cuts).toEqual({ total: 8, threshold: 0.15, artifact: "123.cuts.json" });
    expect(rec.evidence.timing.beatsAnchorSource).toBe("cuts");
    expect(rec.evidence.timing.shotsAnchorSource).toBe("cuts");
    expect(rec.evidence.timing.beatsMeasuredDistinctStarts).toBe(9);
    expect(rec.evidence.timing.beatsCollapsed).toBe(false);
    expect(rec.beats.map((item) => item.startMs)).toEqual([0, ...CUTS]);
  });

  it("omits the cuts block entirely when detection did not run", () => {
    const rec = buildRecord(target, 15.8, { beats: [{ anchorSegment: 1 }] }, transcript);
    expect(rec.evidence).not.toHaveProperty("cuts");
    expect(rec.evidence.timing.beatsAnchorSource).toBe("asr");
  });

  it("does not call a single item a collapsed timeline", () => {
    const rec = buildRecord(target, 15.8, { beats: [{ anchorSegment: 1 }] }, transcript);
    expect(rec.evidence.timing.beatsCollapsed).toBe(false);
  });

  it("records 0 anchored when the model returned no anchors at all", () => {
    const rec = buildRecord(target, 49.1, { beats: [{ intent: "x" }], shots: [] }, transcript);
    expect(rec.evidence.timing.beatsAnchored).toBe(0);
    expect(rec.beats[0].startMs).toBe(0);
  });

  it("tolerates a breakdown whose array fields are not arrays", () => {
    const rec = buildRecord(target, 10, { beats: null, shots: "nope" }, transcript);
    expect(rec.beats).toEqual([]);
    expect(rec.shots).toEqual([]);
  });
});

// ─── prompt contract ───

describe("COMPETITOR_PROMPT (#300 stage 2)", () => {
  it("carries both placeholders and asks for schema v1's layers", () => {
    expect(COMPETITOR_PROMPT).toContain("{TRANSCRIPT}");
    expect(COMPETITOR_PROMPT).toContain("{DURATION_MS}");
    for (const key of ["verdict", "story_level", "beats", "shots", "learnings"]) {
      expect(COMPETITOR_PROMPT).toContain(key);
    }
    // The ticket's highest-increment beats fields.
    expect(COMPETITOR_PROMPT).toContain("audienceQuestionIn");
    expect(COMPETITOR_PROMPT).toContain("audienceQuestionOut");
  });

  it("asks for anchors instead of self-reported timestamps (fake-time regression)", () => {
    expect(COMPETITOR_PROMPT).toContain("anchorSegment");
    expect(COMPETITOR_PROMPT).toContain("Never output startMs or endMs");
    // The pre-anchor prompt requested startMs/endMs in the JSON skeleton; that
    // invitation is what produced fabricated times.
    expect(COMPETITOR_PROMPT).not.toContain('"startMs": 0, "endMs": 2500');
  });
});

// ─── path segments & limit accounting ───

describe("safeSegment (#300 stage 2)", () => {
  it("passes the values the manifest actually carries through unchanged", () => {
    expect(safeSegment("rileybrown.ai", "handle")).toBe("rileybrown.ai");
    expect(safeSegment("7687736415848811789", "video id")).toBe("7687736415848811789");
    expect(safeSegment("user_1-2", "handle")).toBe("user_1-2");
  });

  it("throws on anything that could escape outDir", () => {
    for (const bad of ["../../etc", "a/b", "C:\\tmp", ".", "..", "", null, undefined]) {
      expect(() => safeSegment(bad, "handle")).toThrow(/not a safe path segment/);
    }
  });

  it("names the offending field so a corrupt manifest is pinpointable", () => {
    expect(() => safeSegment("../x", "video id")).toThrow(/video id/);
  });
});

describe("--limit accounting (#300 stage 2)", () => {
  // Regression: the break condition counted every entry of summary.results,
  // including the `skipped-existing` records a resume pushes — so "N already
  // analysed + --limit N" skipped N records, hit the limit, and analysed
  // nothing, contradicting the documented "max videos to analyse this run".
  it("does not spend the budget on records a resume skips", async () => {
    const root = mkdtempSync(join(tmpdir(), "competitor-limit-"));
    const outDir = join(root, "out");
    const manifestPath = join(root, "manifest.json");
    const videos = ["111", "222"].map((id) => {
      const file = join(root, `${id}.mp4`);
      writeFileSync(file, "");
      return { id, status: "downloaded", file, views: 1 };
    });
    writeFileSync(
      manifestPath,
      JSON.stringify({ accounts: [{ handle: "bench", followers: "1K", videos }] }),
    );
    // 111 is already analysed, so a plain resume skips it before reaching 222.
    mkdirSync(join(outDir, "bench"), { recursive: true });
    writeFileSync(join(outDir, "bench", "111.json"), JSON.stringify({ meta: { id: "111" } }));

    try {
      const summary = await analyzeCompetitorVideos({
        manifestPath,
        outDir,
        limit: 1,
        asrOnly: true,
      });

      expect(summary.skipped).toBe(1);
      expect(summary.analyzed).toBe(1);
      expect(existsSync(join(outDir, "bench", "222.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
