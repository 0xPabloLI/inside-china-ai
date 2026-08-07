import { describe, it, expect } from "vitest";
import { SAFE_ZONES, WATERMARK_POS } from "../lib/safe-zones.mjs";
import { baseStyles, BRAND_MARK_SVG, withWatermark } from "../lib/base-styles.mjs";
import {
  brandBar,
  breakingBadge,
  statCard,
  quoteBox,
  titleBlock,
  bigNumberAnchor,
  pointsList,
  stampBox,
  fadeToBlack,
  templateCss,
  ctaScene,
} from "../lib/scene-templates.mjs";

// ── Safe zones ──

describe("SAFE_ZONES (TikTok overlay avoidance)", () => {
  it("all constants are positive numbers", () => {
    for (const v of Object.values(SAFE_ZONES)) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThan(0);
    }
  });

  it("top band is below the top UI tabs, bottom band above subtitles", () => {
    // Top "Following | For You" tabs occupy ~top 100px; content must start lower
    expect(SAFE_ZONES.top).toBeGreaterThan(150);
    // Burned subtitles sit at bottom margin 450px — content must stay above
    expect(SAFE_ZONES.bottom).toBeGreaterThanOrEqual(450);
  });

  it("right rail clearance is wider than the left margin", () => {
    expect(SAFE_ZONES.right).toBeGreaterThan(SAFE_ZONES.left);
  });

  it("WATERMARK_POS sits in the top-left clear corner (outside content band)", () => {
    expect(WATERMARK_POS.top).toBeGreaterThan(0);
    expect(WATERMARK_POS.left).toBeGreaterThan(0);
    expect(WATERMARK_POS.top).toBeLessThan(SAFE_ZONES.top);
    expect(WATERMARK_POS.left).toBeLessThan(SAFE_ZONES.right);
  });
});

// ── baseStyles ──

describe("baseStyles watermark CSS uses WATERMARK_POS", () => {
  it("positions .brand-watermark at top-left via constants", () => {
    const css = baseStyles(10);
    expect(css).toContain(".brand-watermark");
    expect(css).toContain(`top: ${WATERMARK_POS.top}px`);
    expect(css).toContain(`left: ${WATERMARK_POS.left}px`);
    expect(css).not.toContain(".brand-watermark { position: absolute; bottom:");
  });

  it("bundles shared keyframes once (no per-scene re-declaration needed)", () => {
    const css = baseStyles(10);
    for (const kf of ["slideDown", "pulseDot", "numberPulse", "glowPulse", "logoPulse", "hookIn"]) {
      expect(css).toContain(`@keyframes ${kf}`);
    }
  });
});

// ── withWatermark ──

describe("withWatermark", () => {
  it("skips injection when the scene already renders a brand bar", () => {
    const input = `<div class="scene s1"><div class="brand-bar">logo</div></div></body>`;
    const result = withWatermark(input);
    expect(result).toBe(input);
    expect(result).not.toContain("brand-watermark");
  });

  it("skips injection when the scene already renders a large brand logo (CTA)", () => {
    const input = `<div class="scene s11"><div class="brand-logo-large">logo</div></div></body>`;
    const result = withWatermark(input);
    expect(result).toBe(input);
    expect(result).not.toContain("brand-watermark");
  });

  it("injects watermark otherwise (non-brand-bar scenes)", () => {
    const input = `<div class="scene s4">stats</div></body>`;
    const result = withWatermark(input);
    expect(result).toContain("brand-watermark");
    expect(result).toContain(BRAND_MARK_SVG);
  });

  it("returns input unchanged if closing pattern not found", () => {
    const input = "<div>no pattern</div>";
    expect(withWatermark(input)).toBe(input);
  });
});

// ── Shared scene templates ──

/** Bare-business-copy detector: uppercase sentences inside HTML tags. */
const COPY_RE = />[A-Z0-9 .,'%:&!()\-]{8,}</g;
const ALLOWED_COPY = ["CHINA", "AI", "NEWS", "CHINA AI NEWS", "INTELLIGENCE BRIEFING"];

function assertNoBusinessCopy(html) {
  const found = [...new Set(html.match(COPY_RE) || [])].map((m) => m.slice(1, -1).trim());
  const offenders = found.filter((s) => !ALLOWED_COPY.includes(s));
  expect(offenders).toEqual([]);
}

describe("brandBar", () => {
  it("renders standardized bar with logo, wordmark and tag", () => {
    const html = brandBar({ tag: "INTELLIGENCE BRIEFING" });
    expect(html).toContain("brand-bar");
    expect(html).toContain("CHINA");
    expect(html).toContain("AI");
    expect(html).toContain("INTELLIGENCE BRIEFING");
    expect(html).toContain(BRAND_MARK_SVG);
  });

  it("renders no business copy beyond channel constants", () => {
    assertNoBusinessCopy(brandBar());
  });
});

describe("breakingBadge", () => {
  it("renders badge with pulse dot and caller text", () => {
    const html = breakingBadge("BREAKING");
    expect(html).toContain("breaking-badge");
    expect(html).toContain("pulse-dot");
    expect(html).toContain("BREAKING");
  });
});

describe("statCard", () => {
  it("renders number, unit and label from data only", () => {
    const html = statCard({ num: "4", unit: "HR", label: "LEAKED MEETING", color: "amber" });
    expect(html).toContain("stat-card");
    expect(html).toContain("4");
    expect(html).toContain("HR");
    expect(html).toContain("LEAKED MEETING");
  });

  it("handles missing unit", () => {
    const html = statCard({ num: "JULY 25", unit: "", label: "CONFIRMED", color: "blue" });
    expect(html).toContain("JULY 25");
    expect(html).not.toContain('<span class="unit"></span>');
  });
});

describe("quoteBox", () => {
  it("wraps highlight keyword in span", () => {
    const html = quoteBox({ quote: "VISION MATTERS MOST", highlight: "MATTERS" });
    expect(html).toContain('<span class="hl">MATTERS</span>');
    expect(html).toContain("VISION");
  });

  it("renders speaker/source lines when provided", () => {
    const html = quoteBox({ quote: "Q", speaker: "Liang Wenfeng", source: "DEEPSEEK CEO" });
    expect(html).toContain("Liang Wenfeng");
    expect(html).toContain("DEEPSEEK CEO");
  });

  it("empty data renders no business copy", () => {
    assertNoBusinessCopy(quoteBox({ quote: "", highlight: "", speaker: "", source: "" }));
  });
});

describe("titleBlock", () => {
  it("renders title without highlight", () => {
    const html = titleBlock("VISION IS NOT", { highlight: "" });
    expect(html).toContain("VISION IS NOT");
  });

  it("highlights in place when highlight is part of the text", () => {
    const html = titleBlock("THE CRACK SEQUENCE", { highlight: "CRACK" });
    expect(html).toContain('<span class="hl" style="color: var(--blue);">CRACK</span>');
  });

  it("appends highlight when it is not part of the text", () => {
    const html = titleBlock("BOTH", { highlight: "OPEN SOURCE" });
    expect(html).toContain('BOTH <span class="hl" style="color: var(--blue);">OPEN SOURCE</span>');
  });

  it("honors center and color options", () => {
    const html = titleBlock("VISION IS NOT", { center: true, fontSize: 44, color: "sec" });
    expect(html).toContain("text-align: center");
    expect(html).toContain("font-size: 44px");
    expect(html).toContain("color: var(--sec)");
  });
});

describe("bigNumberAnchor", () => {
  it("renders data anchor number", () => {
    const html = bigNumberAnchor("-75%", { color: "amber" });
    expect(html).toContain("-75%");
  });
});

describe("pointsList", () => {
  it("renders numbered points from data", () => {
    const html = pointsList(["VISION > KPIs", "KINDNESS > PROFIT"]);
    expect(html).toContain("VISION &gt; KPIs".replace("&gt;", ">"));
    expect(html).toContain("KINDNESS &gt; PROFIT".replace("&gt;", ">"));
    expect(html.match(/class="point"/g)).toHaveLength(2);
  });

  it("empty list renders nothing", () => {
    expect(pointsList([])).toBe("");
  });
});

describe("stampBox", () => {
  it("renders stamp with sub label", () => {
    const html = stampBox({ text: "TEAM CHEERED", sub: "", color: "green" });
    expect(html).toContain("TEAM CHEERED");
    expect(html).toContain("stamp-box");
  });
});

describe("fadeToBlack", () => {
  it("clamps start to 1.5s minimum", () => {
    expect(fadeToBlack(2)).toContain("1.5s");
  });

  it("computes start as duration - 1.2", () => {
    expect(fadeToBlack(10)).toContain("8.8s");
  });
});

describe("templateCss", () => {
  it("styles every template class (fade-to-black is standalone inline)", () => {
    const css = templateCss();
    for (const cls of [
      "brand-bar",
      "breaking-badge",
      "stat-card",
      "quote-box",
      "title-block",
      "big-number-anchor",
      "points",
      "stamp-box",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("styles the standard CTA end card (.s-cta)", () => {
    const css = templateCss();
    for (const cls of [
      "s-cta",
      "brand-logo-large",
      "brand-name",
      "tagline",
      "action-box",
      "topic",
    ]) {
      expect(css).toContain(cls);
    }
  });
});

// ── ctaScene (standard CTA end card) ──

const CTA_TEXTS = {
  brand: "CHINA AI NEWS",
  brandHighlight: "AI",
  tagline: "CHINA AI, DECODED",
  action: "FOLLOW FOR PART 2",
  topic: "PRICING STRATEGY",
};

describe("ctaScene", () => {
  it("renders the fixed end-card structure in order: logo → brand → tagline → action → topic", () => {
    const html = ctaScene({ texts: CTA_TEXTS }, 10);
    const logo = html.indexOf("brand-logo-large");
    const brand = html.indexOf("brand-name");
    const tagline = html.indexOf("tagline");
    const action = html.indexOf("action-box");
    const topic = html.indexOf("topic");
    expect([logo, brand, tagline, action, topic].every((i) => i >= 0)).toBe(true);
    expect(logo).toBeLessThan(brand);
    expect(brand).toBeLessThan(tagline);
    expect(tagline).toBeLessThan(action);
    expect(action).toBeLessThan(topic);
  });

  it("highlights brandHighlight inside the brand name with the brand-blue .hl span", () => {
    const html = ctaScene({ texts: CTA_TEXTS }, 10);
    expect(html).toContain('CHINA <span class="hl" style="color: var(--blue);">AI</span> NEWS');
  });

  it("renders the action as an amber stamp box with arrow icon", () => {
    const html = ctaScene({ texts: CTA_TEXTS }, 10);
    expect(html).toContain('class="stamp-box"');
    expect(html).toContain("var(--amber)");
    expect(html).toContain("FOLLOW FOR PART 2");
    expect(html).toContain("→");
  });

  it("carries the large brand logo class so withWatermark skips (no double branding)", () => {
    const html = ctaScene({ texts: CTA_TEXTS }, 10);
    expect(html).toContain('class="brand-logo-large"');
    expect(html).toContain(BRAND_MARK_SVG);
  });

  it("ends with fade-to-black timed off the scene duration", () => {
    const html = ctaScene({ texts: CTA_TEXTS }, 10);
    expect(html).toContain("fade-to-black");
    expect(html).toContain("8.8s");
  });

  it("omits the topic slot when not provided (standalone videos)", () => {
    const html = ctaScene({ texts: { ...CTA_TEXTS, topic: undefined } }, 10);
    expect(html).not.toContain("PRICING STRATEGY");
    expect(html).not.toContain('class="topic"');
  });

  it("omits the action stamp when action is missing and renders no undefined", () => {
    const html = ctaScene({ texts: { ...CTA_TEXTS, action: undefined } }, 10);
    expect(html).not.toContain('class="stamp-box"');
    expect(html).not.toContain("undefined");
  });

  it("renders brand unchanged when brandHighlight is not inside brand (no crash)", () => {
    const html = ctaScene({ texts: { ...CTA_TEXTS, brandHighlight: "DEEPSEEK" } }, 10);
    expect(html).toContain("CHINA AI NEWS");
    expect(html).not.toContain('<span class="hl">DEEPSEEK</span>');
    expect(html).not.toContain("undefined");
  });

  it("renders no business copy and no undefined for empty texts (data-only)", () => {
    const html = ctaScene({ texts: {} }, 10);
    assertNoBusinessCopy(html);
    expect(html).not.toContain("undefined");
  });
});
