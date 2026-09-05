import { describe, it, expect } from "vitest";
import {
  extractSceneClaims,
  claimToKeywords,
  skipsMediaSourcing,
} from "../lib/claim-keywords.mjs";
import { buildQueryGroups } from "../lib/asset-sourcer.mjs";
import { scenes as qwen4Scenes } from "../content/qwen4-preview/scene-data.mjs";

// ── extractSceneClaims ──

describe("extractSceneClaims", () => {
  it("collects scenes with a non-empty assetNeed", () => {
    const scenes = [
      {
        id: 2,
        visualType: "narrative",
        voiceover: "It previews the Qwen4 architecture.",
        assetNeed: "  transformer architecture diagram  ",
      },
      { id: 3, visualType: "narrative", voiceover: "No need here." },
    ];
    expect(extractSceneClaims(scenes)).toEqual([
      {
        sceneId: 2,
        assetNeed: "transformer architecture diagram",
        voiceover: "It previews the Qwen4 architecture.",
      },
    ]);
  });

  it("treats empty, whitespace, and missing assetNeed as no claim", () => {
    const scenes = [
      { id: 1, visualType: "narrative", voiceover: "a", assetNeed: "" },
      { id: 2, visualType: "narrative", voiceover: "b", assetNeed: "   " },
      { id: 3, visualType: "narrative", voiceover: "c" },
    ];
    expect(extractSceneClaims(scenes)).toEqual([]);
  });

  it("mediaOptOut wins over assetNeed", () => {
    const scenes = [
      {
        id: 4,
        visualType: "narrative",
        voiceover: "Pure CSS scene.",
        assetNeed: "chip diagram",
        mediaOptOut: true,
      },
    ];
    expect(extractSceneClaims(scenes)).toEqual([]);
  });

  it("excludes NO_MEDIA_TYPES scenes even with assetNeed", () => {
    const scenes = [
      { id: 5, visualType: "cta", voiceover: "Follow!", assetNeed: "logo wall" },
      { id: 6, visualType: "data", voiceover: "Numbers.", assetNeed: "chart" },
      { id: 7, visualType: "stat-reveal", voiceover: "62.5 percent.", assetNeed: "graph" },
    ];
    expect(extractSceneClaims(scenes)).toEqual([]);
  });

  it("handles null/undefined scenes array and real qwen4-preview scene-data (no assetNeed yet)", () => {
    expect(extractSceneClaims(null)).toEqual([]);
    expect(extractSceneClaims([])).toEqual([]);
    // Real content smoke: qwen4-preview has no assetNeed fields — zero claims, no throw.
    expect(extractSceneClaims(qwen4Scenes)).toEqual([]);
  });
});

// ── claimToKeywords ──

describe("claimToKeywords", () => {
  it("produces a deterministic primary phrase of up to 4 content words plus spares", () => {
    const keywords = claimToKeywords("Alipay QR code payment scene on a phone");
    expect(keywords).toEqual(["alipay qr code payment", "scene", "phone"]);
  });

  it("keeps a two-token claim as one phrase and a single token as one keyword", () => {
    expect(claimToKeywords("benchmark chart")).toEqual(["benchmark chart"]);
    expect(claimToKeywords("robot")).toEqual(["robot"]);
  });

  it("returns an empty array when every word is a stopword", () => {
    expect(claimToKeywords("the of and to a")).toEqual([]);
  });

  it("is deterministic and caps output at 3 keywords", () => {
    const claim = "humanoid robot backflip demo on factory floor with engineers watching";
    const first = claimToKeywords(claim);
    const second = claimToKeywords(claim);
    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(3);
    expect(first[0].split(" ").length).toBeLessThanOrEqual(4);
  });

  it("handles empty and punctuation-only input", () => {
    expect(claimToKeywords("")).toEqual([]);
    expect(claimToKeywords("... !!! ---")).toEqual([]);
    expect(claimToKeywords(null)).toEqual([]);
  });
});

// ── buildQueryGroups（asset-sourcer 搜索计划，矩阵行 #2/#5）──

describe("buildQueryGroups", () => {
  it("returns empty groups when no assetNeed and no keyEntities (row 2: graceful pool)", () => {
    const { queryGroups, allKeywords } = buildQueryGroups(
      [{ id: 1, visualType: "narrative", voiceover: "nothing here" }],
      null,
      null,
    );
    expect(queryGroups).toEqual([]);
    expect(allKeywords).toEqual([]);
  });

  it("skips all-stopword claims but keeps the fallback pool (row 5)", () => {
    const scenes = [
      { id: 1, visualType: "narrative", voiceover: "vo", assetNeed: "the of and to a" },
    ];
    const { queryGroups } = buildQueryGroups(
      scenes,
      { keyEntities: { companies: ["Qwen"] } },
      null,
    );
    expect(queryGroups).toHaveLength(1);
    expect(queryGroups[0].claimSceneId).toBeNull();
    expect(queryGroups[0].keywords).toEqual(["Qwen"]); // extractKeywords preserves source casing
  });

  it("keeps claim groups ahead of the fallback pool", () => {
    const scenes = [
      { id: 2, visualType: "narrative", voiceover: "vo", assetNeed: "benchmark chart" },
    ];
    const { queryGroups } = buildQueryGroups(
      scenes,
      { keyEntities: { companies: ["Qwen"] } },
      null,
    );
    expect(queryGroups.map((g) => g.claimSceneId)).toEqual([2, null]);
  });

  it("lets --keywords override the fallback pool", () => {
    const { queryGroups } = buildQueryGroups([], null, ["custom"]);
    expect(queryGroups[0].keywords).toEqual(["custom"]);
  });
});

// ─── #191: shared media-sourcing skip predicate ───

describe("skipsMediaSourcing (#191)", () => {
  const base = { id: 1, visualType: "narrative", layout: "media-overlay" };

  it("skips NO_MEDIA_TYPES (cta/data/stat-reveal)", () => {
    expect(skipsMediaSourcing({ ...base, visualType: "cta" })).toBe(true);
    expect(skipsMediaSourcing({ ...base, visualType: "stat-reveal" })).toBe(true);
  });

  it("skips explicit media:null — permanent no-media declaration", () => {
    expect(skipsMediaSourcing({ ...base, media: null })).toBe(true);
  });

  it("still honors deprecated mediaOptOut (legacy content, #191)", () => {
    expect(skipsMediaSourcing({ ...base, mediaOptOut: true })).toBe(true);
  });

  it("skips CSS-only layouts (hero-center / stacked-cards)", () => {
    expect(skipsMediaSourcing({ ...base, layout: "hero-center" })).toBe(true);
    expect(skipsMediaSourcing({ ...base, layout: "stacked-cards" })).toBe(true);
  });

  it("does not skip scenes that need sourcing", () => {
    expect(skipsMediaSourcing(base)).toBe(false);
  });

  it("extractSceneClaims skips media:null scenes", () => {
    const claims = extractSceneClaims([
      { ...base, id: 1, assetNeed: "factory floor", media: null },
      { ...base, id: 2, assetNeed: "server room" },
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0].sceneId).toBe(2);
  });
});
