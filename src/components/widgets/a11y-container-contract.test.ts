import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Widget a11y + container contract guards (spec video-guard-widget-a11y,
 * tickets T2 / T3).
 *
 * These widgets are not all present on live (published) pages, so the
 * runtime Playwright script (scripts/verify-widget-a11y.mjs) covers the
 * published subset and this static contract keeps the rest from regressing:
 *
 *   T2 — every interactive control exposes state and focus styling:
 *     funding bars, companies accordion, news-coverage dots,
 *     moonshot bars, api-pricing selector.
 *   T3 — container recipe: outer widget cards delegated to the route
 *     wrapper (no redundant self-containers), inner panels use
 *     bg-muted/30 + rounded-lg, no ad-hoc opacity variants, no native
 *     colors, no rounded-xl inner panels.
 */

const WIDGETS_DIR = join(import.meta.dirname);

const read = (f: string) => readFileSync(join(WIDGETS_DIR, f), "utf8");

// ── T2: a11y attributes ──

describe("widget a11y contract (T2)", () => {
  it("funding bars expose selection state", () => {
    const src = read("deepseek/funding-view.tsx");
    expect(src).toContain("aria-pressed={selectedRound === i}");
    expect(src).toContain("focus-visible:outline-brand");
  });

  it("companies accordion exposes expansion state + focus styling", () => {
    const src = read("deepseek/companies-view.tsx");
    expect(src).toContain("aria-expanded={isExpanded}");
    expect(src).toContain("focus-visible:outline-brand");
  });

  it("news-coverage dots have accessible names + selection state", () => {
    const src = read("distillation/news-coverage-view.tsx");
    expect(src).toContain("aria-label={ev.headline}");
    expect(src).toContain("aria-pressed={selected === ev}");
    expect(src).toContain("focus-visible:outline-brand");
  });

  it("moonshot bars expose selection state + focus styling", () => {
    const src = read("distillation/moonshot-funding-view.tsx");
    expect(src).toContain("aria-pressed={isSelected}");
    expect(src).toContain("focus-visible:outline-brand");
  });

  it("api-pricing selector exposes selection state + focus styling", () => {
    const src = read("deepseek-api-pricing/api-pricing-view.tsx");
    expect(src).toContain("aria-pressed=");
    expect(src).toContain("focus-visible:outline-brand");
  });

  it("every widget button carries the focus-visible recipe", () => {
    for (const f of [
      "deepseek/funding-view.tsx",
      "deepseek/companies-view.tsx",
      "deepseek/pricing-view.tsx",
      "distillation/news-coverage-view.tsx",
      "distillation/moonshot-funding-view.tsx",
      "deepseek-api-pricing/api-pricing-view.tsx",
    ]) {
      const src = read(f);
      const buttons = (src.match(/<button/g) || []).length;
      const focusLines = (src.match(/focus-visible:outline-brand/g) || []).length;
      expect(buttons).toBeGreaterThan(0);
      expect(focusLines).toBeGreaterThanOrEqual(buttons);
    }
  });
});

// ── T3: container recipe ──

describe("widget container contract (T3)", () => {
  const INNER_PANEL_OPACITY = /bg-(?:muted\/(?:4|5)0|background\/(?:4|6)0)/;

  it("redundant self-containers removed from the 4 widgets (route wrapper owns the card)", () => {
    for (const f of [
      "deepseek-api-pricing/api-pricing-view.tsx",
      "deepseek-agi-roadmap/agi-roadmap-view.tsx",
      "deepseek-oss-comparison/oss-comparison-view.tsx",
      "deepseek-vision/vision-keywords-view.tsx",
    ]) {
      const src = read(f);
      expect(src).not.toContain("my-6 rounded-lg border border-border/60 bg-muted/30 p-6");
      expect(src).not.toContain('className="my-6');
    }
  });

  it("inner panels unified on bg-muted/30 + rounded-lg (hover/segmented excluded)", () => {
    for (const f of [
      "deepseek/funding-view.tsx",
      "deepseek/companies-view.tsx",
      "deepseek/talent-view.tsx",
      "deepseek/pricing-view.tsx",
      "distillation/news-coverage-view.tsx",
      "distillation/moonshot-funding-view.tsx",
      "distillation/identity-bleed-view.tsx",
      "distillation/minimax-stock-view.tsx",
      "deepseek-api-pricing/api-pricing-view.tsx",
      "deepseek-agi-roadmap/agi-roadmap-view.tsx",
      "deepseek-oss-comparison/oss-comparison-view.tsx",
      "deepseek-vision/vision-keywords-view.tsx",
    ]) {
      const src = read(f);
      for (const line of src.split("\n")) {
        // hover/active state transitions are not panels
        if (line.includes("hover:") || line.includes("active:")) continue;
        // segmented controls (rounded-full) keep bg-muted/40
        if (line.includes("rounded-full")) continue;
        expect(line).not.toMatch(INNER_PANEL_OPACITY);
        expect(line).not.toContain("border-purple-500");
      }
    }
  });

  it("no rounded-xl inner panels in the deepseek talent widget", () => {
    const src = read("deepseek/talent-view.tsx");
    expect(src).not.toContain("rounded-xl");
  });

  it("companies accordion cards follow the inner panel recipe", () => {
    const src = read("deepseek/companies-view.tsx");
    expect(src).toContain("rounded-lg border border-border/60 bg-muted/30");
  });
});
