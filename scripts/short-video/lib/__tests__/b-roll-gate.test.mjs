import { describe, test, expect } from "vitest";

import { GATE_THRESHOLD, scoreCandidates, pickWinner, buildClaim } from "../b-roll/gate.mjs";

// Scenario-matrix rows #13–#17. Analyzer is injected so tests never spawn the VLM.

function fakeAnalyzer(scoreByPath) {
  return async (path, opts) => {
    if (!(path in scoreByPath)) throw new Error(`unexpected path ${path}`);
    return scoreByPath[path](opts);
  };
}

const CANDIDATES = [
  { seed: 1024, file: "/tmp/b-roll/scene-6-seed1024.mp4" },
  { seed: 2048, file: "/tmp/b-roll/scene-6-seed2048.mp4" },
];

describe("buildClaim", () => {
  test("claim carries voiceover + the full aiVideo prompt as assetNeed", () => {
    const claim = buildClaim({
      voiceover: "训练成本只有九分之一",
      aiVideo: { prompt: "eight dims" },
    });
    expect(claim).toEqual({ voiceover: "训练成本只有九分之一", assetNeed: "eight dims" });
  });
});

describe("scoreCandidates", () => {
  test("#13 one passes (>=60), one fails -> per-candidate pass flag", async () => {
    const analyzer = fakeAnalyzer({
      "/tmp/b-roll/scene-6-seed1024.mp4": () => ({
        relevance: 72,
        relevanceReason: "matches cost metaphor",
      }),
      "/tmp/b-roll/scene-6-seed2048.mp4": () => ({
        relevance: 31,
        relevanceReason: "abstract glow",
      }),
    });
    const scored = await scoreCandidates(CANDIDATES, {
      analyzer,
      claim: buildClaim({ voiceover: "v", aiVideo: { prompt: "p" } }),
    });
    expect(scored.map((c) => c.passed)).toEqual([true, false]);
    expect(scored[0].relevance).toBe(72);
    expect(scored[1].reason).toBe("abstract glow");
  });

  test("#16 missing relevance (degraded VLM) is fail-closed", async () => {
    const analyzer = fakeAnalyzer({
      "/tmp/b-roll/scene-6-seed1024.mp4": () => ({ relevance: null, relevanceReason: null }),
      "/tmp/b-roll/scene-6-seed2048.mp4": () => ({ relevance: 65, relevanceReason: "ok" }),
    });
    const scored = await scoreCandidates(CANDIDATES, {
      analyzer,
      claim: { voiceover: "v", assetNeed: "p" },
    });
    expect(scored[0].passed).toBe(false);
    expect(scored[0].relevance).toBeNull();
    expect(scored[1].passed).toBe(true);
  });

  test("#16 analyzer throwing is also fail-closed", async () => {
    const analyzer = async () => {
      throw new Error("vlm crashed");
    };
    const scored = await scoreCandidates([CANDIDATES[0]], {
      analyzer,
      claim: { voiceover: "v", assetNeed: "p" },
    });
    expect(scored[0].passed).toBe(false);
    expect(scored[0].relevance).toBeNull();
    expect(scored[0].reason).toMatch(/analyzer/i);
  });

  test("claim is forwarded to the analyzer", async () => {
    const seen = [];
    const analyzer = async (path, opts) => {
      seen.push(opts);
      return { relevance: 80, relevanceReason: "ok" };
    };
    const claim = { voiceover: "口播", assetNeed: "prompt text" };
    await scoreCandidates([CANDIDATES[0]], { analyzer, claim });
    expect(seen[0].claim).toEqual(claim);
  });
});

describe("pickWinner", () => {
  const scoredOf = (rows) =>
    rows.map((r) => ({
      seed: r.seed,
      file: `f${r.seed}.mp4`,
      relevance: r.relevance,
      reason: r.reason ?? "",
      passed: r.relevance !== null && r.relevance >= GATE_THRESHOLD,
    }));

  test("#13 the passing candidate wins even if the loser is listed first", () => {
    const scored = scoredOf([
      { seed: 1, relevance: 40 },
      { seed: 2, relevance: 61 },
    ]);
    expect(pickWinner(scored).seed).toBe(2);
  });

  test("#14 both pass -> highest relevance wins", () => {
    const scored = scoredOf([
      { seed: 1024, relevance: 72 },
      { seed: 2048, relevance: 88 },
    ]);
    expect(pickWinner(scored).seed).toBe(2048);
  });

  test("#14 tie -> smaller seed wins (deterministic)", () => {
    const scored = scoredOf([
      { seed: 2048, relevance: 70 },
      { seed: 1024, relevance: 70 },
    ]);
    expect(pickWinner(scored).seed).toBe(1024);
  });

  test("#15 none pass -> no winner", () => {
    const scored = scoredOf([
      { seed: 1, relevance: 59 },
      { seed: 2, relevance: 12 },
    ]);
    expect(pickWinner(scored)).toBeNull();
  });

  test("#17 relevance exactly at threshold passes (>=", () => {
    expect(GATE_THRESHOLD).toBe(60);
    const scored = scoredOf([{ seed: 7, relevance: 60 }]);
    expect(scored[0].passed).toBe(true);
    expect(pickWinner(scored).seed).toBe(7);
  });
});
