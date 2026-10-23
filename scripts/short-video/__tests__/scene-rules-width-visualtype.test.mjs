import { describe, it, expect } from "vitest";
import { checkTextWidthBudget, checkVisualTypeWhitelist } from "../lib/scene-rules.mjs";

// Spec decision 14/71: the character budget is a contract-derived CREATIVE
// HINT at warn level — the final judgment is the TextGate real geometry, not
// this check. Budgets derive from MEASURED_MAX_WIDTH + SLOT_FIELDS preferred
// size (no hand-written anchors) and only cover fields the slot contract
// declares for the scene's visualType + layout.

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

// qwen4-preview s5's shipped copy — the historical media-split clipping
// incident. Both tests below run the SAME texts through two layouts, so the
// layout-derived budget is the only variable.
const S5_TEXTS = {
  company: "THE COST",
  action: "TRAINING COMPUTE VS QWEN3.7-PLUS (397B)",
  result: "1/9 THE TRAINING COST",
  source: "SOURCE: Qwen official blog",
};

describe("checkTextWidthBudget", () => {
  it("warns (not fails) when a result line busts the derived budget in media-split", () => {
    const clipped = {
      id: 5,
      visualType: "narrative",
      layout: "media-split",
      texts: S5_TEXTS,
    };
    const results = checkTextWidthBudget([clipped]);
    expect(results.filter((r) => r.level === "fail")).toHaveLength(0);
    const warns = results.filter((r) => r.level === "warn");
    expect(warns.length).toBeGreaterThan(0);
    const resultWarn = warns.find((r) => r.check?.includes("result"));
    expect(resultWarn).toBeTruthy();
    expect(resultWarn.fix).toMatch(/shorten|full-width|geometry/i);
  });

  it("derives the budget from the layout band, not the copy: same texts warn in media-split, clear in media-overlay", () => {
    // The budget is layout-derived (measured box width / preferredSize), so
    // the wider band raises it. #688 raised the copy floor to 48px, which
    // shrank every budget — qwen4-preview s5's 21-char result now busts BOTH
    // bands (10 / 19 chars), so the layout difference surfaces on `source`
    // (16 / 31 chars) instead.
    //
    // Asserted as the exact warn set per layout. A subset check (the warn
    // simply "disappears", or the total just drops) would let any other
    // field silently gain or lose its signal unnoticed.
    const warnedFields = (layout) =>
      checkTextWidthBudget([{ id: 5, visualType: "narrative", layout, texts: S5_TEXTS }])
        .filter((r) => r.level === "warn")
        .map((r) => r.check.match(/— (\w+) in /)[1])
        .sort();

    expect(warnedFields("media-split")).toEqual(["action", "result", "source"]);
    expect(warnedFields("media-overlay")).toEqual(["action", "result"]);
  });

  it("passes a full-width narrative whose fields fit the derived budgets", () => {
    const results = checkTextWidthBudget([fullNarrative]);
    expect(results.filter((r) => r.level === "fail")).toHaveLength(0);
    expect(results.filter((r) => r.level === "warn")).toHaveLength(0);
  });

  it("skips fields the slot contract does not declare for the visualType", () => {
    // "title" is not declared for any narrative layout — legacy packs carry
    // it, but the render layer owns the unknown-field FAIL (decision 51).
    const legacy = {
      id: 3,
      visualType: "narrative",
      layout: "media-bottom-bar",
      texts: {
        title: "AN UNDECLARED FIELD THAT WOULD BUST ANY CONCEIVABLE BUDGET",
        result: "OK",
      },
    };
    const results = checkTextWidthBudget([legacy]);
    expect(results.filter((r) => r.level === "warn")).toHaveLength(0);
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
    expect(results.filter((r) => r.level === "warn")).toHaveLength(0);
  });
});

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
