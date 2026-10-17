import { describe, expect, it } from "vitest";
import { layerHealth, summarizeRecords } from "../competitor-benchmarks-timing-health.mjs";

/** Minimal schema v1 record stub: only the fields the verifier reads. */
function record({ beats = [], shots = [], timing = {}, error, ...evidence } = {}) {
  return { beats, shots, evidence: { timing, ...evidence }, error };
}

function items(starts) {
  return starts.map((startMs, index) => ({ index, startMs }));
}

/** 9 items, 2 distinct starts — the #730 shape. */
const COLLAPSED_9 = [0, 0, 0, 0, 1000, 1000, 1000, 1000, 1000];
/** The same record after #730's fallback rebuilt the timeline. */
const REBUILT_9 = [0, 102, 204, 306, 408, 510, 612, 714, 816];

describe("layerHealth", () => {
  it("re-judges from the measured count when the run persisted one", () => {
    const health = layerHealth(items(COLLAPSED_9), { measuredDistinctStarts: 2 });
    expect(health.distinctStarts).toBe(2);
    expect(health.collapsed).toBe(true);
    expect(health.basis).toBe("measured");
  });

  it("prefers the measured count over the runner's own verdict", () => {
    // A run that persisted both a verdict and the count must be re-judged, not
    // re-read — otherwise the verifier can never catch a broken判据.
    const health = layerHealth(items(COLLAPSED_9), {
      measuredDistinctStarts: 2,
      persistedCollapsed: false,
    });
    expect(health.collapsed).toBe(true);
    expect(health.basis).toBe("measured");
  });

  it("uses the persisted verdict for a rebuilt layer, where counting whitens the signal", () => {
    // analysis-recompute shape: starts interpolated back to 9 distinct values.
    expect(layerHealth(items(REBUILT_9), { anchorSource: "interpolated" }).collapsed).toBe(false);
    const health = layerHealth(items(REBUILT_9), {
      anchorSource: "interpolated",
      persistedCollapsed: true,
    });
    expect(health).toMatchObject({
      total: 9,
      distinctStarts: 9,
      collapsed: true,
      basis: "persisted",
    });
  });

  it("recounts a layer that was never rebuilt — and exposes the stale pre-fix verdict", () => {
    // analysis/ shape: pre-fix judge stored `false` for 2 distinct starts.
    const health = layerHealth(items(COLLAPSED_9), { persistedCollapsed: false });
    expect(health).toMatchObject({ total: 9, distinctStarts: 2, collapsed: true, basis: "items" });
    expect(health.storedCollapsed).toBe(false);
  });

  it("flags a rebuilt layer that carries no stored verdict instead of trusting the recount", () => {
    const health = layerHealth(items(REBUILT_9), { anchorSource: "interpolated" });
    expect(health.basis).toBe("items-rebuilt");
    expect(health.collapsed).toBe(false); // under-reports; the basis label says so
  });

  it("does not flag a healthy layer, and never below the 3-item floor", () => {
    expect(layerHealth(items([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000])).collapsed).toBe(
      false,
    );
    expect(layerHealth(items([0]), { measuredDistinctStarts: 1 }).collapsed).toBe(false);
  });
});

describe("summarizeRecords", () => {
  it("counts errors, repairs, collapses, anchor sources and bases (≈ §10.1)", () => {
    const summary = summarizeRecords([
      { key: "sineadbovell/7599", record: record({ error: "unparseable-json" }) },
      {
        key: "shedoesai/7372",
        record: record({
          beats: items(COLLAPSED_9),
          shots: items(COLLAPSED_9),
          timing: {
            beatsMeasuredDistinctStarts: 2,
            shotsMeasuredDistinctStarts: 2,
            beatsAnchorSource: "interpolated",
            shotsAnchorSource: "interpolated",
          },
        }),
      },
      {
        key: "rileybrown/7309",
        record: record({
          beats: items([0, 1000, 2000]),
          shots: items([0, 1000]),
          timing: { beatsAnchorSource: "asr", shotsAnchorSource: "asr" },
          breakdownRepaired: true,
        }),
      },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.valid).toBe(2);
    expect(summary.errors).toEqual(["sineadbovell/7599"]);
    expect(summary.repaired).toEqual(["rileybrown/7309"]);
    expect(summary.beats.records).toBe(2);
    expect(summary.beats.items).toBe(12); // 9 + 3; the errored record contributes nothing
    expect(summary.beats.collapsed).toEqual([
      {
        key: "shedoesai/7372",
        total: 9,
        distinctStarts: 2,
        collapsed: true,
        basis: "measured",
        storedCollapsed: undefined,
      },
    ]);
    expect(summary.beats.anchorSource).toEqual({ interpolated: 1, asr: 1 });
    expect(summary.beats.basis).toEqual({ measured: 1, items: 1 });
    expect(summary.shots.records).toBe(2); // the errored record's empty shots array is skipped
    expect(summary.shots.collapsed).toHaveLength(1);
    expect(summary.beats.staleVerdict).toEqual([]);
  });

  it("reports the analysis/ false negative as a stale verdict", () => {
    // 34 records, one layer with 2 distinct starts, verdict stored false.
    const summary = summarizeRecords([
      {
        key: "shedoesai/7372",
        record: record({
          beats: items(COLLAPSED_9),
          shots: [],
          timing: { beatsCollapsed: false },
        }),
      },
      { key: "other/1", record: record({ beats: items([0, 1000, 2000]), shots: [] }) },
    ]);
    expect(summary.beats.collapsed.map((hit) => hit.key)).toEqual(["shedoesai/7372"]);
    expect(summary.beats.staleVerdict).toEqual([{ key: "shedoesai/7372", storedCollapsed: false }]);
    expect(summary.beats.basis).toEqual({ items: 2 });
  });

  it("reads the analysis-recompute shape: persisted verdict over rebuilt starts", () => {
    const rebuilt = (key, collapsed) => ({
      key,
      record: record({
        beats: items(collapsed ? REBUILT_9 : [0, 1000, 2000]),
        shots: items(collapsed ? REBUILT_9 : [0, 1000, 2000, 3000]),
        timing: {
          beatsCollapsed: collapsed,
          shotsCollapsed: collapsed,
          beatsAnchorSource: collapsed ? "interpolated" : "asr",
          shotsAnchorSource: collapsed ? "interpolated" : "asr",
        },
      }),
    });
    const summary = summarizeRecords([
      rebuilt("a/1", false),
      rebuilt("shedoesai/7372", true),
      rebuilt("b/2", false),
    ]);
    expect(summary.beats.collapsed.map((hit) => hit.key)).toEqual(["shedoesai/7372"]);
    expect(summary.shots.collapsed.map((hit) => hit.key)).toEqual(["shedoesai/7372"]);
    expect(summary.beats.basis).toEqual({ items: 2, persisted: 1 });
    expect(summary.beats.staleVerdict).toEqual([]);
  });
});
