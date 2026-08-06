import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReadingProgress, calcReadingProgress } from "./reading-progress";

describe("calcReadingProgress", () => {
  // S10: At top of page → 0%
  it("returns 0 when scrollTop is 0", () => {
    expect(calcReadingProgress(0, 1000, 500)).toBe(0);
  });

  // S10: Scrolled 50% → 50%
  it("returns 50 when scrolled to midpoint", () => {
    expect(calcReadingProgress(250, 1000, 500)).toBe(50);
  });

  // S10: Scrolled to bottom → 100%
  it("returns 100 when scrolled to bottom", () => {
    expect(calcReadingProgress(500, 1000, 500)).toBe(100);
  });

  // S12: Short article (doc height ≤ viewport) → 0%
  it("returns 0 when document is shorter than viewport", () => {
    expect(calcReadingProgress(0, 400, 500)).toBe(0);
  });

  // S10: Overscroll clamped to 100%
  it("clamps to 100 when scrolled beyond document height", () => {
    expect(calcReadingProgress(600, 1000, 500)).toBe(100);
  });

  // S10: Negative scroll clamped to 0%
  it("clamps to 0 when scrollTop is negative", () => {
    expect(calcReadingProgress(-10, 1000, 500)).toBe(0);
  });
});

describe("ReadingProgress (static render)", () => {
  // S10: Renders a bar element with brand color class
  it("renders a progress bar with brand color class", () => {
    const html = renderToStaticMarkup(<ReadingProgress />);
    expect(html).toContain("bg-brand");
  });

  // S10: Initial width is 0% (useState initial)
  it("renders with 0% width initially", () => {
    const html = renderToStaticMarkup(<ReadingProgress />);
    expect(html).toContain("width:0%");
  });

  // S10: Container has aria-hidden for screen readers
  it("has aria-hidden on container", () => {
    const html = renderToStaticMarkup(<ReadingProgress />);
    expect(html).toContain('aria-hidden="true"');
  });

  // S10: Uses fixed positioning at top
  it("uses fixed top positioning", () => {
    const html = renderToStaticMarkup(<ReadingProgress />);
    expect(html).toContain("fixed");
    expect(html).toContain("top-0");
  });

  // S10: Has reading-progress-bar class for reduced-motion CSS
  it("has reading-progress-bar class", () => {
    const html = renderToStaticMarkup(<ReadingProgress />);
    expect(html).toContain("reading-progress-bar");
  });
});
