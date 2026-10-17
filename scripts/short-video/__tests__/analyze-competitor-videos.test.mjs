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
  anchorTimings,
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
    });
    expect(anchorTimings([], null, 1000)).toEqual({
      items: [],
      anchored: 0,
      total: 0,
      distinctStarts: 0,
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
      beatsTotal: 1,
      beatsAnchored: 1,
      shotsTotal: 1,
      shotsAnchored: 1,
      beatsDistinctStarts: 1,
      shotsDistinctStarts: 1,
      beatsCollapsed: false,
      shotsCollapsed: false,
    });
  });

  it("flags a collapsed timeline when every item shares one anchor", () => {
    const breakdown = {
      beats: Array.from({ length: 9 }, () => ({ anchorSegment: 1, intent: "x" })),
      shots: Array.from({ length: 9 }, () => ({ anchorSegment: 1, visual: "y" })),
    };
    const rec = buildRecord(target, 15.8, breakdown, transcript);
    expect(rec.evidence.timing.beatsCollapsed).toBe(true);
    expect(rec.evidence.timing.shotsCollapsed).toBe(true);
    expect(rec.evidence.timing.beatsDistinctStarts).toBe(1);
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
