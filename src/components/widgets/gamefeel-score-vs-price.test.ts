import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { AS_OF, AXIS_MAX, AXIS_MIN, ROWS } from "./gamefeel-score-vs-price/data/scores";

/**
 * GameFeel score-vs-price widget (#1189 item 1) guards.
 *
 * The dataset is a pinned snapshot, so the two ways it can rot are silent:
 * the numbers drift from the article that renders beside it, or the axis stops
 * matching the values (bars quieter than the labels). Neither is visible in a
 * typecheck, and `check-widget-plan.mjs` only judges the plan/marker/registry
 * triangle — not whether the widget agrees with its own article.
 */

const WIDGETS_DIR = join(import.meta.dirname);
const ARTICLE = join(WIDGETS_DIR, "..", "..", "..", "articles", "qwen4-gamefeel.md");
const article = readFileSync(ARTICLE, "utf8"); // nosemgrep

describe("gamefeel dataset", () => {
  it("keeps four unique rows ordered by score, highest first", () => {
    expect(ROWS).toHaveLength(4);
    expect(new Set(ROWS.map((r) => r.id)).size).toBe(4);
    const scores = ROWS.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("prices are positive and the two Qwen entries are flagged as early checkpoints", () => {
    for (const row of ROWS) expect(row.pricePerTaskUsd).toBeGreaterThan(0);
    expect(ROWS.filter((r) => r.earlyCheckpoint).map((r) => r.model)).toEqual([
      "Qwen-4-Flash-Early",
      "Qwen-4-27B-Early",
    ]);
  });

  it("the axis zooms on purpose: it brackets the range instead of starting at zero", () => {
    const scores = ROWS.map((r) => r.score);
    expect(AXIS_MIN).toBeLessThan(Math.min(...scores));
    expect(AXIS_MAX).toBeGreaterThanOrEqual(Math.max(...scores));
    expect(AXIS_MIN).toBeGreaterThan(0);
    expect(AXIS_MAX).toBeLessThan(100);
  });
});

describe("article parity", () => {
  it("the article cites the same snapshot date", () => {
    expect(AS_OF).toBe("Nov 8, 2026");
  });

  it("every row's score and price appear in the article", () => {
    for (const row of ROWS) {
      expect(article).toContain(row.score.toFixed(1));
      expect(article).toContain(`$${row.pricePerTaskUsd.toFixed(2)}`);
    }
  });

  it("the article embeds this widget exactly once", () => {
    const markers = article.match(/<!--\s*widget:gamefeel-score-vs-price\s*-->/g) ?? [];
    expect(markers).toHaveLength(1);
  });
});
