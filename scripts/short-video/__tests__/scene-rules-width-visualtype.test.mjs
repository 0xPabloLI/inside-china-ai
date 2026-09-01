import { describe, it, expect } from "vitest";
import { checkTextWidthBudget, checkVisualTypeWhitelist } from "../lib/scene-rules.mjs";

// Serif-adjusted budgets: the Remotion render falls back to a serif face
// ~30% wider than the sans metrics the templates were designed against.
// Measured anchors (qwen4-preview v1): "1/9 THE TRAINING COST" (21 chars)
// clipped at ~13 visible chars in a media-split half column at 52px;
// "6B ACTIVE PER TOKEN" (19 chars) fits the full 820px band.

const fullNarrative = {
  id: 2,
  visualType: "narrative",
  layout: "media-bottom-bar",
  texts: {
    company: "OPEN WEIGHTS, DAY ONE",
    action: "HUGGING FACE + MODELSCOPE",
    result: "FREE TO DOWNLOAD",
    context: "FP8 BUILD INCLUDED, GGUF AND MLX FOLLOWED",
    source: "SOURCE: Qwen official blog",
  },
};

describe("checkTextWidthBudget", () => {
  it("passes a full-width narrative whose fields fit the serif budgets", () => {
    const results = checkTextWidthBudget([fullNarrative]);
    expect(results.filter((r) => r.level === "fail")).toHaveLength(0);
  });

  it("fails a result line that exceeds the half-column budget in media-split", () => {
    const clipped = {
      id: 5,
      visualType: "narrative",
      layout: "media-split",
      texts: {
        company: "THE COST",
        action: "TRAINING COMPUTE VS QWEN3.7-PLUS (397B)",
        result: "1/9 THE TRAINING COST",
        source: "SOURCE: Qwen official blog",
      },
    };
    const results = checkTextWidthBudget([clipped]);
    const fails = results.filter((r) => r.level === "fail");
    expect(fails.length).toBeGreaterThan(0);
    const resultFail = fails.find((r) => r.check?.includes("result"));
    expect(resultFail).toBeTruthy();
    expect(resultFail.fix).toMatch(/shorten|full-width/i);
  });

  it("passes the same result text once the scene moves to a full-width layout", () => {
    const fixed = { ...clonedScene5FullWidth() };
    const results = checkTextWidthBudget([fixed]);
    expect(results.filter((r) => r.level === "fail")).toHaveLength(0);
  });

  it("checks stat-reveal subtext but tolerates the measured 25-char label line", () => {
    const stat = {
      id: 7,
      visualType: "stat-reveal",
      layout: "hero-center",
      texts: {
        bigNumber: "62.5",
        label: "SWE-BENCH PRO",
        subtext: "CLAUDE-OPUS-4.6 MAX: 53.4",
        source: "SOURCE: Qwen official benchmarks",
      },
    };
    const results = checkTextWidthBudget([stat]);
    expect(results.filter((r) => r.level === "fail")).toHaveLength(0);
  });

  it("skips hook and cta scenes (their contracts are checked elsewhere)", () => {
    const scenes = [
      {
        id: 1,
        visualType: "hook",
        texts: {
          subject: "A VERY LONG SUBJECT LINE THAT WOULD BUST ANY BUDGET",
          bigNumber: "6B",
        },
      },
      {
        id: 10,
        visualType: "cta",
        texts: { brand: "CHINA AI NEWS", action: "FOLLOW FOR MORE" },
      },
    ];
    const results = checkTextWidthBudget(scenes);
    expect(results.filter((r) => r.level === "fail")).toHaveLength(0);
  });
});

function clonedScene5FullWidth() {
  return {
    id: 5,
    visualType: "narrative",
    layout: "media-overlay",
    texts: {
      company: "THE COST",
      action: "TRAINING COMPUTE VS QWEN3.7-PLUS (397B)",
      result: "1/9 THE TRAINING COST",
      source: "SOURCE: Qwen official blog",
    },
  };
}

describe("checkVisualTypeWhitelist", () => {
  it("fails a visualType the Remotion dispatcher cannot render (default renderer)", () => {
    const scenes = [
      { id: 7, visualType: "benchmark", texts: {} },
      { id: 8, visualType: "narrative", texts: {} },
    ];
    const results = checkVisualTypeWhitelist(scenes, {});
    const fails = results.filter((r) => r.level === "fail");
    expect(fails).toHaveLength(1);
    expect(fails[0].detail).toContain("benchmark");
  });

  it("passes every scene when all types are in the Remotion dispatch table", () => {
    const scenes = [
      { id: 1, visualType: "hook", texts: {} },
      { id: 2, visualType: "narrative", texts: {} },
      { id: 7, visualType: "stat-reveal", texts: {} },
      { id: 10, visualType: "cta", texts: {} },
    ];
    const results = checkVisualTypeWhitelist(scenes, {});
    expect(results.filter((r) => r.level === "fail")).toHaveLength(0);
  });

  it("still applies the whitelist when a retired renderer opt-out is present", () => {
    // The Playwright renderer was retired (decision 59) — its opt-out can no
    // longer bypass the Remotion dispatch whitelist.
    const scenes = [{ id: 3, visualType: "timeline", texts: {} }];
    const results = checkVisualTypeWhitelist(scenes, {
      meta: { renderer: "playwright" },
    });
    expect(results.filter((r) => r.level === "fail")).toHaveLength(1);
  });
});
