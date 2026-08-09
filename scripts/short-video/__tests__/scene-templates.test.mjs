import { describe, it, expect } from "vitest";
import { CANVAS, SAFE_ZONES, SUBTITLE_LANE, WATERMARK_POS } from "../lib/safe-zones.mjs";
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
  hookScene,
  logoSvg,
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
    // The content band ends ABOVE the subtitle lane: content bottom edge
    // (1920 - SAFE_ZONES.bottom = 1340) sits below the lane top (≈1417).
    const contentBottom = CANVAS.height - SAFE_ZONES.bottom;
    const laneTop = CANVAS.height - SUBTITLE_LANE.marginV;
    expect(contentBottom).toBeLessThan(laneTop);
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
  it("injects frame-glow but skips watermark when scene has brand bar", () => {
    const input = `<div class="scene s1"><div class="brand-bar">logo</div></div></body>`;
    const result = withWatermark(input);
    expect(result).toContain("frame-glow");
    expect(result).not.toContain("brand-watermark");
  });

  it("injects blue frame-glow but skips watermark when scene has brand-logo-large (CTA)", () => {
    const input = `<div class="scene s11"><div class="brand-logo-large">logo</div></div></body>`;
    const result = withWatermark(input);
    expect(result).toContain("frame-glow blue");
    expect(result).not.toContain("brand-watermark");
  });

  it("injects frame-glow and watermark for non-brand-bar scenes", () => {
    const input = `<div class="scene s4">stats</div></body>`;
    const result = withWatermark(input);
    expect(result).toContain("frame-glow");
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

  it("sits inside the content safe zone (top 220, not the legacy 210)", () => {
    expect(templateCss()).toMatch(/.breaking-badge\s*{[^}]*top:\s*220px/);
    expect(templateCss()).not.toMatch(/.breaking-badge\s*{[^}]*top:\s*210px/);
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

  it("accepts a stagger delay option (support-slot rhythm)", () => {
    const html = statCard({ num: "4", unit: "HR", label: "L", color: "blue", delay: 1.3 });
    expect(html).toContain("animation-delay: 1.3s");
  });

  it("omits animation-delay when no delay given (backward compatible)", () => {
    const html = statCard({ num: "4", unit: "HR", label: "L", color: "blue" });
    expect(html).not.toContain("animation-delay");
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

  it("styles the standard hook opening card (.s-hook)", () => {
    const css = templateCss();
    for (const cls of [
      "s-hook",
      "scan-sweep",
      "badge-pill",
      "subject-row",
      "subject-logo",
      "subject-name",
      "focal-claim",
      "focal-reveal",
      "focal-number",
      "focal-number-label",
      "stats-row",
      "source-line",
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

  it("renders the action as an amber stamp box with the arrow inline after the text", () => {
    const html = ctaScene({ texts: CTA_TEXTS }, 10);
    expect(html).toContain('class="stamp-box"');
    expect(html).toContain("var(--amber)");
    expect(html).toContain("FOLLOW FOR PART 2 →");
    // No stacked stamp-icon element above the text (it pushed the text 24px below
    // box center). Match the element, not the shared .stamp-icon CSS rule.
    expect(html).not.toContain('class="stamp-icon"');
  });

  it("carries the large brand logo class so withWatermark skips watermark (frame-glow still injected)", () => {
    const html = ctaScene({ texts: CTA_TEXTS }, 10);
    expect(html).toContain('class="brand-logo-large"');
    expect(html).toContain(BRAND_MARK_SVG);
    const watermarked = withWatermark(html);
    expect(watermarked).toContain("frame-glow blue");
    expect(watermarked).not.toContain('class="brand-watermark"');
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

// ── hookScene (standard hook opening card) ──

const HOOK_CLAIM_TEXTS = {
  badge: "EXCLUSIVE",
  subject: "DEEPSEEK",
  subjectLogo: "deepseek-icon",
  hookText: "0 KPIs. 0 ORG CHARTS.",
  revealText: "ONLY A VISION",
  stats: [{ num: "4", unit: "HR", label: "LEAKED MEETING" }],
  source: "LIANG WENFENG INVESTOR MEETING",
};

const HOOK_NUMBER_TEXTS = {
  badge: "BREAKING",
  subject: "DEEPSEEK",
  subjectLogo: "deepseek-icon",
  bigNumber: "$1.4B",
  numberLabel: "FUNDING ROUND PAUSED",
  numberHighlight: "FUNDING",
  stats: [
    { num: "4", unit: "HR", label: "LEAKED MEETING" },
    { num: "1", unit: "LAB", label: "PAUSED ROUND" },
  ],
  source: "BLOOMBERG CONFIRMED",
};

describe("hookScene", () => {
  it("renders the fixed skeleton: brandBar + scan-sweep + three slots in order", () => {
    const html = hookScene({ texts: HOOK_CLAIM_TEXTS }, 10);
    expect(html).toContain('class="brand-bar"');
    expect(html).toContain("scan-sweep");
    const kicker = html.indexOf("slot-kicker");
    const hero = html.indexOf("slot-hero");
    const support = html.indexOf("slot-support");
    expect([kicker, hero, support].every((i) => i >= 0)).toBe(true);
    expect(kicker).toBeLessThan(hero);
    expect(hero).toBeLessThan(support);
  });

  it("claim variant: hookText is visible from frame 1 (no animation, no opacity:0)", () => {
    const css = templateCss();
    const claimRule = css.match(/\.s-hook \.focal-claim \{([^}]*)\}/)[1];
    // No entrance animation — the claim renders immediately on frame 1
    expect(claimRule).not.toMatch(/animation:/);
    expect(claimRule).not.toMatch(/opacity:\s*0/);
  });

  it("claim variant: revealText stampIn at 0.8s with blue glowPulse by default", () => {
    const html = hookScene({ texts: HOOK_CLAIM_TEXTS }, 10);
    expect(html).toContain("ONLY A VISION");
    expect(html).toContain(
      "animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.8s forwards, glowPulse 2s ease-in-out 1.5s infinite",
    );
  });

  it("number variant: amber big number with labeled highlight", () => {
    const html = hookScene({ texts: HOOK_NUMBER_TEXTS }, 10);
    expect(html).toContain("$1.4B");
    expect(html).toContain('<span class="hl" style="color: var(--blue);">FUNDING</span>');
    // number uses the amber-on-dark brand treatment
    expect(templateCss()).toMatch(/\.s-hook \.focal-number \{[^}]*color: var\(--amber\)/);
  });

  it("number focal wins deterministically when both focals present (template-level)", () => {
    const html = hookScene({ texts: { ...HOOK_CLAIM_TEXTS, bigNumber: "$1.4B" } }, 10);
    expect(html).toContain("$1.4B");
    expect(html).not.toContain("0 KPIs.");
    expect(html).not.toContain("undefined");
  });

  it("missing focal renders the skeleton only (no undefined, no crash)", () => {
    const html = hookScene({ texts: { subject: "DEEPSEEK", source: "REUTERS" } }, 10);
    expect(html).not.toContain("undefined");
    expect(html).not.toContain('class="focal-claim"');
    expect(html).not.toContain('class="focal-number"');
  });

  it("omits optional slots entirely when absent", () => {
    const html = hookScene({ texts: { hookText: "JUST A CLAIM" } }, 10);
    // Match rendered elements only (CSS class definitions always exist in the
    // style block, so assert on class="..." element markup)
    expect(html).not.toContain('class="badge-pill"');
    expect(html).not.toContain('class="subject-row"');
    expect(html).not.toContain('class="slot-kicker"'); // empty kicker omitted by sceneFrame
    expect(html).not.toContain('class="stats-row"');
    expect(html).not.toContain('class="source-line"');
    expect(html).not.toContain('class="slot-support"');
    expect(html).toContain('class="slot-hero"');
  });

  it("subject without logo renders the bold 80px name row", () => {
    const html = hookScene({ texts: { subject: "BYTEDANCE", hookText: "155M USERS" } }, 10);
    expect(html).toContain('class="subject-row"');
    expect(html).toContain("BYTEDANCE");
    expect(html).not.toContain('class="subject-logo"');
    expect(templateCss()).toContain(
      ".s-hook .subject-row .subject-name { font-size: 80px; font-weight: 900",
    );
  });

  it("red color variant: revealText uses static red glow, never glowPulse (blue-only keyframe)", () => {
    const html = hookScene({ texts: { ...HOOK_CLAIM_TEXTS, color: "red" } }, 10);
    expect(html).toContain("color: var(--red)");
    expect(html).toContain("rgba(239,68,68,0.5)");
    expect(html).not.toContain("forwards, glowPulse"); // no blue-only keyframe on the reveal
  });

  it("red color variant: claim and subject glows follow the color token (D-3, no red-copy-blue-glow)", () => {
    const html = hookScene(
      { texts: { ...HOOK_CLAIM_TEXTS, color: "red", subject: "DEEPSEEK" } },
      10,
    );
    expect(html).not.toContain("text-shadow: 0 0 40px rgba(77,139,255,0.4)"); // no blue claim glow
    expect(html).toContain(
      'class="focal-claim" style="text-shadow: 0 0 40px rgba(239,68,68,0.4);"',
    );
    expect(html).toContain(
      'class="subject-name" style="text-shadow: 0 0 30px rgba(239,68,68,0.4);"',
    );
  });

  it("invalid color token falls back to blue", () => {
    const html = hookScene({ texts: { ...HOOK_CLAIM_TEXTS, color: "pink" } }, 10);
    expect(html).toContain("forwards, glowPulse");
    expect(html).not.toContain("var(--pink)");
  });

  it("carries the brand bar so withWatermark skips watermark (frame-glow still injected)", () => {
    const html = hookScene({ texts: HOOK_NUMBER_TEXTS }, 10);
    const watermarked = withWatermark(html);
    expect(watermarked).toContain("frame-glow");
    expect(watermarked).not.toContain('class="brand-watermark"');
  });

  it("declares scanSweep exactly once and no shared keyframes", () => {
    const html = hookScene({ texts: HOOK_CLAIM_TEXTS }, 10);
    expect(html.match(/@keyframes scanSweep\b/g) ?? []).toHaveLength(1);
    for (const kf of [
      "fadeIn",
      "slideUp",
      "slideLeft",
      "scaleIn",
      "stampIn",
      "slideDown",
      "pulseDot",
      "numberPulse",
      "glowPulse",
      "logoPulse",
      "hookIn",
      "fadeOut",
    ]) {
      const decls = html.match(new RegExp(`@keyframes ${kf}\\b`, "g")) ?? [];
      expect(
        decls.length,
        `@keyframes ${kf} must come only from baseStyles (once)`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("with no color slot the reveal keeps the default blue glow (glowPulse)", () => {
    const html = hookScene({ texts: { ...HOOK_CLAIM_TEXTS, color: undefined } }, 10);
    expect(html).toContain("forwards, glowPulse");
  });

  it("renders no business copy and no undefined for empty texts (data-only)", () => {
    const html = hookScene({ texts: {} }, 10);
    assertNoBusinessCopy(html);
    expect(html).not.toContain("undefined");
  });
});

describe("logoSvg (logo registry)", () => {
  it("loads a registered logo from assets/logos", () => {
    const svg = logoSvg("deepseek-icon");
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/<\?xml/);
    expect(svg).not.toMatch(/<!--/);
  });

  it("returns empty for an unknown key (pure-text fallback)", () => {
    expect(logoSvg("no-such-logo")).toBe("");
  });

  it("rejects path-traversal keys", () => {
    expect(logoSvg("../../etc/passwd")).toBe("");
    expect(logoSvg("../scene-templates.mjs")).toBe("");
  });

  it("returns empty for empty or undefined key", () => {
    expect(logoSvg("")).toBe("");
    expect(logoSvg(undefined)).toBe("");
  });
});
