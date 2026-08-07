import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandName } from "./brand-name";

describe("BrandName", () => {
  // S1: Renders "China AI News" as visible text
  it("renders China AI News as visible text", () => {
    const html = renderToStaticMarkup(<BrandName />);
    expect(html).toContain("China");
    expect(html).toContain("AI");
    expect(html).toContain("News");
  });

  // S1: "AI" is wrapped in a span with brand color class
  it("wraps AI in a span with brand color class", () => {
    const html = renderToStaticMarkup(<BrandName />);
    // The AI should be in a separate span with the text-brand class
    const aiSpanMatch = html.match(/<span[^>]*class="[^"]*text-brand[^"]*"[^>]*>AI<\/span>/);
    expect(aiSpanMatch).not.toBeNull();
  });

  // S1: Does not contain the old brand name
  it("does not contain old brand name Inside China AI", () => {
    const html = renderToStaticMarkup(<BrandName />);
    expect(html).not.toContain("Inside China AI");
  });
});
