import { describe, it, expect } from "vitest";
import { normalizeSceneData, CNY_TO_USD_RATE } from "../lib/normalize-currency.mjs";

describe("normalizeSceneData", () => {
  // Scenario #10: "445 billion yuan" → "$63 billion (445 billion yuan)"
  it("converts 'X billion yuan' to dual-annotation", () => {
    const scenes = [
      { id: 1, voiceover: "China AI spending hit 445 billion yuan in 2024." },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$62 billion");
    expect(result[0].voiceover).toContain("445 billion yuan");
  });

  // Scenario #11: already has dual annotation → no modification
  it("does not modify when dual annotation already present", () => {
    const scenes = [
      { id: 1, voiceover: "That's $62 billion (445 billion yuan) total." },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toBe("That's $62 billion (445 billion yuan) total.");
  });

  // Scenario #17: "¥1100 per share" → "$154 (¥1100) per share" (small amount rounding)
  it("converts '¥1100' to dual-annotation with rounding", () => {
    const scenes = [
      { id: 1, voiceover: "Priced at ¥1100 per share." },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$154");
    expect(result[0].voiceover).toContain("¥1100");
  });

  // No RMB amounts → no-op
  it("does not modify scenes without RMB amounts", () => {
    const scenes = [
      { id: 1, voiceover: "China AI spending hit 63 billion dollars." },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toBe("China AI spending hit 63 billion dollars.");
  });

  // Also scans texts fields
  it("scans texts fields for RMB amounts", () => {
    const scenes = [
      { id: 1, voiceover: "Look at this.", texts: { stat: "¥445 billion" } },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].texts.stat).toContain("$");
    expect(result[0].texts.stat).toContain("¥445");
  });

  // Multiple RMB amounts in one voiceover
  it("handles multiple RMB amounts in one voiceover", () => {
    const scenes = [
      { id: 1, voiceover: "Raised ¥629 million, valued at ¥445 billion." },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$88 million");
    expect(result[0].voiceover).toContain("¥629");
    expect(result[0].voiceover).toContain("$62 billion");
    expect(result[0].voiceover).toContain("¥445 billion");
  });

  // "million yuan" pattern
  it("converts 'X million yuan' to dual-annotation", () => {
    const scenes = [
      { id: 1, voiceover: "They raised 629 million yuan." },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$88 million");
    expect(result[0].voiceover).toContain("629 million yuan");
  });

  // Does not duplicate when $ already near the ¥ amount
  it("does not duplicate when $ already precedes the yuan amount", () => {
    const scenes = [
      { id: 1, voiceover: "That's $88 million, 629 million yuan." },
    ];
    const result = normalizeSceneData(scenes, {});
    // Already has $88 million nearby — no double-insert
    expect(result[0].voiceover).toBe("That's $88 million, 629 million yuan.");
  });

  it("returns original scenes array reference (mutates in place)", () => {
    const scenes = [{ id: 1, voiceover: "No money here." }];
    const result = normalizeSceneData(scenes, {});
    expect(result).toBe(scenes);
  });
});

describe("CNY_TO_USD_RATE", () => {
  it("is 0.14 (¥1 ≈ $0.14)", () => {
    expect(CNY_TO_USD_RATE).toBe(0.14);
  });
});
