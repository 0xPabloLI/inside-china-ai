import { describe, it, expect } from "vitest";
import { fuseAudioEmotion } from "../visual-analyzer.mjs";

describe("fuseAudioEmotion (#361)", () => {
  it("returns agree when primary and auxiliary match", () => {
    const result = fuseAudioEmotion("neutral", { topLabel: "中立/neutral", topScore: 0.99 });
    expect(result.primary).toBe("neutral");
    expect(result.auxiliary).toEqual({ label: "中立/neutral", score: 0.99 });
    expect(result.agreement).toBe("agree");
  });

  it("returns disagree when signals conflict", () => {
    const result = fuseAudioEmotion("angry", { topLabel: "开心/happy", topScore: 0.8 });
    expect(result.agreement).toBe("disagree");
  });

  it("returns unknown when primary is null", () => {
    const result = fuseAudioEmotion(null, { topLabel: "中立/neutral", topScore: 0.9 });
    expect(result.primary).toBeNull();
    expect(result.agreement).toBe("unknown");
  });

  it("returns unknown when auxiliary is null/degraded", () => {
    const result = fuseAudioEmotion("neutral", { topLabel: null, topScore: null });
    expect(result.auxiliary).toEqual({ label: null, score: null });
    expect(result.agreement).toBe("unknown");
  });

  it("returns unknown when both are null", () => {
    const result = fuseAudioEmotion(null, { topLabel: null, topScore: null });
    expect(result.agreement).toBe("unknown");
  });

  it("handles e2v label without slash (English-only)", () => {
    const result = fuseAudioEmotion("happy", { topLabel: "happy", topScore: 0.9 });
    expect(result.agreement).toBe("agree");
  });

  it("preserves both signals without merging into one label", () => {
    const result = fuseAudioEmotion("calm and neutral", { topLabel: "中立/neutral", topScore: 0.7 });
    expect(result.primary).toBe("calm and neutral");
    expect(result.auxiliary.label).toBe("中立/neutral");
    expect(result.auxiliary.score).toBe(0.7);
  });

  it("matches case-insensitively", () => {
    const result = fuseAudioEmotion("NEUTRAL", { topLabel: "中立/neutral", topScore: 0.9 });
    expect(result.agreement).toBe("agree");
  });
});