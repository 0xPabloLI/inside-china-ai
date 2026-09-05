import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { TIMELINE_VERSION, fuseMediaTimeline } from "../media-timeline.mjs";

// ─── #99 P6: deterministic fusion of P4 visual windows + P5 ASR segments ───
//
// P4 window: {id, startMs, endMs, sourceMode?} — one per analysed asset
// window (visual-analyzer #189 / temporal-focus #101 evidence).
// P5 segment: {id, startMs, endMs, text, language?} — asr-analyzer #98.
//
// Golden JSON fixtures live in fixtures/media-timeline/ and pin the exact
// artifact shape (issue acceptance: byte/semantically stable across runs).

const fixture = (name) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, "fixtures", "media-timeline", `${name}.json`), "utf-8"),
  );

const window = (id, startMs, endMs, sourceMode = "frames") => ({ id, startMs, endMs, sourceMode });
const seg = (id, startMs, endMs, text = "", language = "zh") => ({
  id,
  startMs,
  endMs,
  text,
  language,
});

const baseMeta = { durationMs: 60000 };

describe("fuseMediaTimeline (#99)", () => {
  it("version constant is exported", () => {
    expect(typeof TIMELINE_VERSION).toBe("string");
    expect(TIMELINE_VERSION.length).toBeGreaterThan(0);
  });

  it("fuses a visual window with overlapping ASR segments into fused events", () => {
    const t = fuseMediaTimeline({
      visualWindows: [window("w1", 0, 8000)],
      asrSegments: [seg("s1", 1000, 3000, "第一句"), seg("s2", 3500, 6000, "第二句")],
      mediaMeta: baseMeta,
    });
    expect(t.events).toEqual([
      {
        startMs: 0,
        endMs: 1000,
        fused: false,
        visualEvidence: ["w1"],
        transcriptEvidence: [],
        transcripts: [],
        sourceMode: "frames",
        confidence: null,
      },
      {
        startMs: 1000,
        endMs: 3000,
        fused: true,
        visualEvidence: ["w1"],
        transcriptEvidence: ["s1"],
        transcripts: [{ id: "s1", text: "第一句", language: "zh" }],
        sourceMode: "frames",
        confidence: null,
      },
      {
        startMs: 3000,
        endMs: 3500,
        fused: false,
        visualEvidence: ["w1"],
        transcriptEvidence: [],
        transcripts: [],
        sourceMode: "frames",
        confidence: null,
      },
      {
        startMs: 3500,
        endMs: 6000,
        fused: true,
        visualEvidence: ["w1"],
        transcriptEvidence: ["s2"],
        transcripts: [{ id: "s2", text: "第二句", language: "zh" }],
        sourceMode: "frames",
        confidence: null,
      },
      {
        startMs: 6000,
        endMs: 8000,
        fused: false,
        visualEvidence: ["w1"],
        transcriptEvidence: [],
        transcripts: [],
        sourceMode: "frames",
        confidence: null,
      },
    ]);
  });

  it("is deterministic — identical inputs produce identical artifacts in any run", () => {
    const input = {
      visualWindows: [window("w1", 500, 12000), window("w2", 12000, 20000, "degraded")],
      asrSegments: [seg("s1", 0, 9000, "a"), seg("s2", 9500, 21000, "b")],
      mediaMeta: baseMeta,
    };
    const a = fuseMediaTimeline(input);
    const b = fuseMediaTimeline({ ...input, visualWindows: [...input.visualWindows].reverse() });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("clamps windows/segments into media duration and drops degenerate intervals", () => {
    const t = fuseMediaTimeline({
      visualWindows: [window("w1", 59000, 70000), window("wBad", 3000, 3000)],
      asrSegments: [seg("s1", -500, 2000)],
      mediaMeta: baseMeta,
    });
    expect(t.meta.visualWindowCount).toBe(1); // wBad dropped (degenerate)
    expect(t.meta.asrSegmentCount).toBe(1);
    for (const e of t.events) {
      expect(e.startMs).toBeGreaterThanOrEqual(0);
      expect(e.endMs).toBeLessThanOrEqual(60000);
    }
  });

  it("preserves single-modality evidence — no audio → visual-only timeline", () => {
    const t = fuseMediaTimeline({
      visualWindows: [window("w1", 0, 8000, "degraded"), window("w2", 8000, 16000)],
      asrSegments: [],
      mediaMeta: baseMeta,
    });
    expect(t.events).toHaveLength(2);
    expect(t.events.every((e) => e.fused === false && e.transcriptEvidence.length === 0)).toBe(
      true,
    );
    expect(t.events[0].sourceMode).toBe("degraded"); // 窗口回退状态保留
  });

  it("preserves speech-only timelines (no visual windows)", () => {
    const t = fuseMediaTimeline({
      visualWindows: [],
      asrSegments: [seg("s1", 0, 5000, "只有语音"), seg("s2", 7000, 9000, "第二段")],
      mediaMeta: baseMeta,
    });
    expect(t.events).toHaveLength(2);
    expect(t.events.every((e) => e.visualEvidence.length === 0 && e.sourceMode === null)).toBe(
      true,
    );
    expect(t.events[0].transcriptEvidence).toEqual(["s1"]);
  });

  it("minEventMs: sub-threshold cross-modality slivers absorb into neighbours", () => {
    // s2 only kisses w1's tail for 100ms (< default 200ms) — the sliver is
    // absorbed into the preceding event instead of fragmenting the timeline.
    const t = fuseMediaTimeline({
      visualWindows: [window("w1", 0, 5000)],
      asrSegments: [seg("s1", 0, 4900, "主体"), seg("s2", 4900, 5000, "擦边")],
      mediaMeta: baseMeta,
    });
    // Absorption keeps evidence: s2 remains referenced, never dropped
    const allTranscript = t.events.flatMap((e) => e.transcriptEvidence);
    expect(allTranscript).toContain("s1");
    expect(allTranscript).toContain("s2");
    expect(t.events.at(-1).endMs).toBe(5000);
  });

  it("adjacent (zero-gap) windows stay separate; transcript breaks windows into sub-events", () => {
    const t = fuseMediaTimeline({
      visualWindows: [window("w1", 0, 4000), window("w2", 4000, 8000)],
      asrSegments: [seg("s1", 1000, 3000), seg("s2", 5000, 7000)],
      mediaMeta: baseMeta,
    });
    expect(t.events).toHaveLength(6);
    expect(t.events.map((e) => e.visualEvidence[0])).toEqual(["w1", "w1", "w1", "w2", "w2", "w2"]);
    expect(t.events.map((e) => e.fused)).toEqual([false, true, false, false, true, false]);
    // The zero-gap window boundary is a hard event edge
    expect(t.events[2].endMs).toBe(4000);
    expect(t.events[3].startMs).toBe(4000);
  });

  it("confidence aggregates as the minimum across referenced evidence", () => {
    const t = fuseMediaTimeline({
      visualWindows: [{ ...window("w1", 0, 8000), confidence: 0.9 }],
      asrSegments: [{ ...seg("s1", 1000, 3000), confidence: 0.4 }, seg("s2", 3500, 5000)],
      mediaMeta: baseMeta,
    });
    expect(t.events.find((e) => e.transcriptEvidence.includes("s1")).confidence).toBe(0.4);
    expect(t.events.find((e) => e.transcriptEvidence.includes("s2")).confidence).toBe(0.9);
  });

  it("every event time stays within media duration (issue acceptance)", () => {
    const t = fuseMediaTimeline({
      visualWindows: [window("w1", -100, 99999)],
      asrSegments: [seg("s1", -50, 99999)],
      mediaMeta: baseMeta,
    });
    for (const e of t.events) {
      expect(e.startMs).toBeGreaterThanOrEqual(0);
      expect(e.endMs).toBeLessThanOrEqual(60000);
    }
  });
});

// ─── Golden fixtures (issue: 黄金 JSON fixture) ───

describe("fuseMediaTimeline golden fixtures", () => {
  const cases = [
    {
      name: "fused-overlap",
      input: {
        visualWindows: [window("w1", 0, 8000), window("w2", 8000, 16000, "degraded")],
        asrSegments: [seg("s1", 1000, 3000, "大家好"), seg("s2", 9000, 14000, "今天讲宇树")],
        mediaMeta: baseMeta,
      },
    },
    {
      name: "no-overlap",
      input: {
        visualWindows: [window("w1", 0, 4000)],
        asrSegments: [seg("s1", 10000, 14000, "错开的语音")],
        mediaMeta: baseMeta,
      },
    },
    {
      name: "missing-audio",
      input: {
        visualWindows: [window("w1", 0, 8000)],
        asrSegments: [],
        mediaMeta: baseMeta,
      },
    },
    {
      name: "audio-only",
      input: {
        visualWindows: [],
        asrSegments: [seg("s1", 0, 6000, "纯音频素材")],
        mediaMeta: baseMeta,
      },
    },
    {
      // 窗口回退: a degraded window's fallback status is preserved and
      // fused into the overlapping event's sourceMode
      name: "window-fallback",
      input: {
        visualWindows: [window("w1", 0, 8000, "degraded"), window("w2", 8000, 14000, "frames")],
        asrSegments: [
          seg("s1", 2000, 5000, "回退窗口下的对白"),
          seg("s2", 9000, 12000, "正常窗口对白"),
        ],
        mediaMeta: baseMeta,
      },
    },
  ];

  for (const { name, input } of cases) {
    it(`golden fixture: ${name}`, () => {
      expect(fuseMediaTimeline(input)).toEqual(fixture(name));
    });
  }
});
