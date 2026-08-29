import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  baseStyles,
  BRAND_MARK_SVG,
  withWatermark,
  brandBar,
  breakingBadge,
  statCard,
  fadeToBlack,
  BRAND_FONT_STACK,
} from "../lib/base-styles.mjs";

describe("baseStyles", () => {
  it("returns CSS string with :root variables", () => {
    const css = baseStyles(10);
    expect(css).toContain(":root");
    expect(css).toContain("--blue");
    expect(css).toContain("--red");
    expect(css).toContain("--amber");
    expect(css).toContain("--green");
    expect(css).toContain("--white");
  });

  it("includes duration as CSS variable", () => {
    const css = baseStyles(15);
    expect(css).toContain("--d: 15s");
  });

  it("includes background layers (grid-bg, glow, scanlines)", () => {
    const css = baseStyles(10);
    expect(css).toContain(".grid-bg");
    expect(css).toContain(".glow-red");
    expect(css).toContain(".glow-blue");
    expect(css).toContain(".scanlines");
  });

  it("includes keyframe animations", () => {
    const css = baseStyles(10);
    expect(css).toContain("@keyframes fadeIn");
    expect(css).toContain("@keyframes slideUp");
    expect(css).toContain("@keyframes slideLeft");
    expect(css).toContain("@keyframes scaleIn");
    expect(css).toContain("@keyframes stampIn");
  });

  it("includes scene container spec (1080x1920)", () => {
    const css = baseStyles(10);
    expect(css).toContain("1080px");
    expect(css).toContain("1920px");
    expect(css).toContain(".scene");
  });

  it("includes brand watermark CSS", () => {
    const css = baseStyles(10);
    expect(css).toContain(".brand-watermark");
  });
});

describe("BRAND_MARK_SVG", () => {
  it("is a string containing SVG content", () => {
    expect(typeof BRAND_MARK_SVG).toBe("string");
    expect(BRAND_MARK_SVG).toContain("<svg");
    expect(BRAND_MARK_SVG).toContain("</svg>");
  });

  it("has XML declaration and comments stripped", () => {
    expect(BRAND_MARK_SVG).not.toContain("<?xml");
    expect(BRAND_MARK_SVG).not.toContain("<!--");
  });
});

describe("withWatermark", () => {
  it("injects brand-watermark div before closing scene div", () => {
    const input = `<div class="scene s1">content</div></body>`;
    const result = withWatermark(input);
    expect(result).toContain("brand-watermark");
    expect(result).toContain(BRAND_MARK_SVG);
    // Watermark should be inside the scene div, before </div></body>
    expect(result).toMatch(/brand-watermark.*<\/div><\/body>/s);
  });

  it("handles HTML with closing </div></body> pattern", () => {
    const input = `<div class="scene">hello</div></body>`;
    const result = withWatermark(input);
    expect(result).toContain("hello");
    expect(result).toContain("brand-watermark");
  });

  it("returns input unchanged if pattern not found", () => {
    const input = `<div>no closing pattern</div>`;
    const result = withWatermark(input);
    expect(result).toBe(input);
  });
});

describe("UI components", () => {
  describe("brandBar", () => {
    it("returns HTML with brand bar structure", () => {
      const html = brandBar("INTELLIGENCE BRIEFING");
      expect(html).toContain("brand-bar");
      expect(html).toContain("CHINA");
      expect(html).toContain("AI");
      expect(html).toContain("INTELLIGENCE BRIEFING");
      expect(html).toContain(BRAND_MARK_SVG);
    });
  });

  describe("breakingBadge", () => {
    it("returns HTML with breaking badge and text", () => {
      const html = breakingBadge("BREAKING");
      expect(html).toContain("breaking-badge");
      expect(html).toContain("BREAKING");
      expect(html).toContain("pulse-dot");
    });

    it("uses custom text", () => {
      const html = breakingBadge("EXCLUSIVE");
      expect(html).toContain("EXCLUSIVE");
      expect(html).not.toContain("BREAKING");
    });
  });

  describe("statCard", () => {
    it("returns HTML with stat number and label", () => {
      const html = statCard({ num: "4", unit: "HR", label: "LEAKED MEETING", color: "amber" });
      expect(html).toContain("stat-card");
      expect(html).toContain("4");
      expect(html).toContain("HR");
      expect(html).toContain("LEAKED MEETING");
    });

    it("handles missing unit gracefully", () => {
      const html = statCard({ num: "JULY 25", unit: "", label: "CONFIRMED", color: "blue" });
      expect(html).toContain("JULY 25");
      expect(html).toContain("CONFIRMED");
    });
  });

  describe("fadeToBlack", () => {
    it("returns HTML with fade-to-black animation", () => {
      const html = fadeToBlack(10);
      expect(html).toContain("fade-to-black");
      expect(html).toContain("fadeOut");
      expect(html).toContain("8.8s"); // max(10 - 1.2, 1.5) = 8.8
    });

    it("clamps to minimum 1.5s start", () => {
      const html = fadeToBlack(2);
      expect(html).toContain("1.5s");
    });
  });
});

// ── Serif rendering baseline (spec #130 D9) ──

const testDir = dirname(fileURLToPath(import.meta.url));

describe("BRAND_FONT_STACK — serif rendering baseline", () => {
  it("exports the explicit Times serif stack", () => {
    expect(BRAND_FONT_STACK).toBe("'Times New Roman', Times, serif");
  });

  it("baseStyles CSS uses the serif stack instead of the Helvetica sans stack", () => {
    const css = baseStyles(10);
    expect(css).toContain("'Times New Roman', Times, serif");
    expect(css).not.toContain("Helvetica Neue");
  });

  it("ShortVideo root composition applies BRAND_FONT_STACK (Remotion path)", () => {
    const src = readFileSync(join(testDir, "..", "remotion", "src", "ShortVideo.tsx"), "utf8");
    expect(src).toContain("BRAND_FONT_STACK");
  });
});
