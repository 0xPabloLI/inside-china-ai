import { describe, it, expect } from "vitest";
import { classifyConfidence } from "../query.mjs";

// ─── classifyConfidence: three-level classification ───

describe("classifyConfidence", () => {
  // ── High confidence (≥ 0.60) ──

  it("returns 'high' for 0.60 (exact boundary)", () => {
    const result = classifyConfidence(0.6);
    expect(result.level).toBe("high");
    expect(result.emoji).toBe("🟢");
  });

  it("returns 'high' for 0.65 (typical positive query)", () => {
    const result = classifyConfidence(0.65);
    expect(result.level).toBe("high");
  });

  it("returns 'high' for 0.678 (top result in eval)", () => {
    const result = classifyConfidence(0.678);
    expect(result.level).toBe("high");
  });

  it("returns 'high' for 1.0 (maximum similarity)", () => {
    const result = classifyConfidence(1.0);
    expect(result.level).toBe("high");
  });

  // ── Low confidence (0.50 – 0.60) ──

  it("returns 'low' for 0.50 (exact boundary)", () => {
    const result = classifyConfidence(0.5);
    expect(result.level).toBe("low");
    expect(result.emoji).toBe("🟡");
  });

  it("returns 'low' for 0.515 (Bitcoin false positive)", () => {
    const result = classifyConfidence(0.515);
    expect(result.level).toBe("low");
  });

  it("returns 'low' for 0.55 (mid-range)", () => {
    const result = classifyConfidence(0.55);
    expect(result.level).toBe("low");
  });

  it("returns 'low' for 0.599 (just below high threshold)", () => {
    const result = classifyConfidence(0.599);
    expect(result.level).toBe("low");
  });

  // ── Noise (< 0.50) ──

  it("returns 'noise' for 0.499 (just below low threshold)", () => {
    const result = classifyConfidence(0.499);
    expect(result.level).toBe("noise");
    expect(result.emoji).toBe("🔴");
  });

  it("returns 'noise' for 0.43 (sourdough top result)", () => {
    const result = classifyConfidence(0.43);
    expect(result.level).toBe("noise");
  });

  it("returns 'noise' for 0.0 (zero similarity)", () => {
    const result = classifyConfidence(0.0);
    expect(result.level).toBe("noise");
  });

  it("returns 'noise' for negative values (edge case)", () => {
    const result = classifyConfidence(-0.1);
    expect(result.level).toBe("noise");
  });

  // ── Label and emoji ──

  it("includes a human-readable label", () => {
    expect(classifyConfidence(0.7).label).toContain("high confidence");
    expect(classifyConfidence(0.55).label).toContain("caution");
    expect(classifyConfidence(0.3).label).toContain("irrelevant");
  });

  it("includes an emoji for each level", () => {
    expect(classifyConfidence(0.7).emoji).toBe("🟢");
    expect(classifyConfidence(0.55).emoji).toBe("🟡");
    expect(classifyConfidence(0.3).emoji).toBe("🔴");
  });

  // ── Empirical data points from eval run ──

  it("correctly classifies all eval data points", () => {
    // Positive query top results (should be high)
    expect(classifyConfidence(0.678).level).toBe("high"); // DeepSeek funding query
    expect(classifyConfidence(0.628).level).toBe("high"); // scene-data hook

    // Bitcoin false positive (should be low)
    expect(classifyConfidence(0.515).level).toBe("low"); // distillation timeline
    expect(classifyConfidence(0.492).level).toBe("noise"); // kimi-k3 article
    expect(classifyConfidence(0.49).level).toBe("noise"); // deepseek-talent

    // Sourdough (all noise)
    expect(classifyConfidence(0.43).level).toBe("noise"); // tiktok-ref top result
    expect(classifyConfidence(0.397).level).toBe("noise"); // second result
  });
});
