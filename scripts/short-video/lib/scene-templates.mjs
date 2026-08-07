/**
 * Shared scene building blocks — the implementation of the brand-system
 * scene templates (see docs/brand-system.md → Scene Layout Templates).
 *
 * Every function is DATA-ONLY: it renders whatever the caller passes and
 * contains zero business copy (channel constants like CHINA AI NEWS are the
 * only hardcoded strings, and only in brandBar()).
 *
 * Class styling lives in templateCss(); callers compose it with
 * baseStyles(duration) from base-styles.mjs and their scene-specific CSS.
 * Shared keyframes are bundled in baseStyles() — scenes must NOT redeclare
 * them (drift guard: __tests__/scene-drift.test.mjs).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
// Intentional ESM cycle: base-styles.mjs re-exports a few components from this
// module. baseStyles is only used inside ctaScene() at call time (never at
// module top level), so both modules finish evaluating safely.
import { baseStyles } from "./base-styles.mjs";
import { slotCss, sceneFrame } from "./scene-layout.mjs";

// ── Brand assets ──
// Channel brand mark — shared across ALL videos. Reads the VIDEO-GRADE
// asset (built by build-mark-svg.mjs): viewBox'd so CSS scaling works,
// brand-palette fills (#4d8bff / #ef4444) so it is visible on the dark
// stage. Do NOT point this back at the raw source SVG (no viewBox, dark
// fills — invisible in renders).
const BRAND_MARK_SVG = readFileSync(
  new URL("../assets/china-ai-news-mark-video.svg", import.meta.url),
  "utf8",
)
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!--[\s\S]*?-->/g, "");

/**
 * CSS for all template classes. Shared keyframes are NOT included here —
 * they live in baseStyles() (single definition per full scene CSS). The one
 * exception is the template-local `scanSweep` (hookScene): it is not part of
 * the shared 12-keyframe bundle, so it may be declared once per video — here,
 * at the template layer — instead of being copy-pasted per content.
 * @returns {string} CSS string
 */
function templateCss() {
  return `
    /* ── Shared scene templates (lib/scene-templates.mjs) ── */
    .brand-bar { position: absolute; top: 80px; left: 60px; right: 60px; display: flex; align-items: center; gap: 16px; animation: slideDown 0.3s ease-out 0.1s forwards; opacity: 0; }
    .brand-bar .b-logo { width: 48px; height: 48px; } .brand-bar .b-logo svg { width: 100%; height: 100%; }
    .brand-bar .b-text { font-size: 24px; font-weight: 900; color: var(--white); letter-spacing: 3px; } .brand-bar .b-text .hl { color: var(--blue); }
    .brand-bar .briefing-tag { margin-left: auto; font-size: 16px; font-weight: 700; color: var(--sec); letter-spacing: 2px; padding: 5px 12px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; }
    .breaking-badge { position: absolute; top: 210px; left: 50%; transform: translateX(-50%); background: var(--red); color: white; padding: 14px 40px; font-size: 28px; font-weight: 900; letter-spacing: 4px; border-radius: 8px; box-shadow: 0 0 40px rgba(239,68,68,0.6); display: flex; align-items: center; gap: 10px; animation: stampIn 0.4s ease-out 0.3s forwards; opacity: 0; }
    .breaking-badge .pulse-dot { width: 12px; height: 12px; border-radius: 50%; background: white; animation: pulseDot 1s ease-in-out infinite; }
    .stat-card { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-top: 4px solid var(--blue); border-radius: 14px; padding: 32px 20px; text-align: center; animation: slideUp 0.5s ease-out forwards; opacity: 0; }
    .stat-card .stat-num { font-size: 64px; font-weight: 900; line-height: 1; color: var(--blue); } .stat-card .stat-num .unit { font-size: 32px; font-weight: 700; }
    .stat-card .stat-label { font-size: 22px; font-weight: 700; color: var(--sec); letter-spacing: 1px; margin-top: 10px; }
    .quote-box { background: rgba(255,255,255,0.03); border-left: 4px solid var(--blue); border-radius: 0 12px 12px 0; padding: 30px 36px; animation: slideUp 0.5s ease-out forwards; opacity: 0; }
    .quote-box .quote-text { font-style: italic; color: var(--sec); line-height: 1.4; } .quote-box .quote-text .hl { color: var(--blue); font-style: normal; font-weight: 700; }
    .quote-box .quote-speaker { margin-top: 14px; font-size: 24px; font-weight: 700; color: var(--white); letter-spacing: 1px; }
    .quote-box .quote-source { margin-top: 4px; font-size: 20px; font-weight: 700; color: var(--sec); letter-spacing: 2px; }
    .title-block { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
    .title-block .hl { color: var(--blue); }
    .big-number-anchor { font-size: 260px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.4s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
    .points { display: flex; flex-direction: column; gap: 24px; }
    .point { display: flex; align-items: center; gap: 28px; padding: 32px 40px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-left: 5px solid var(--blue); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
    .point .num { font-size: 56px; font-weight: 900; color: var(--blue); line-height: 0.9; width: 60px; flex-shrink: 0; }
    .point .text { font-size: 40px; font-weight: 800; color: var(--white); letter-spacing: 1px; }
    .stamp-box { display: inline-block; padding: 20px 40px; border: 2px solid var(--amber); border-radius: 12px; background: rgba(245,158,11,0.06); text-align: center; animation: stampIn 0.5s ease-out forwards; opacity: 0; }
    .stamp-box .stamp-icon { font-size: 40px; line-height: 1; margin-bottom: 8px; }
    .stamp-box .stamp-text { font-size: 36px; font-weight: 900; color: var(--amber); letter-spacing: 2px; text-shadow: 0 0 30px rgba(245,158,11,0.3); }
    .stamp-box .stamp-sub { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 8px; }
    /* ── Standard CTA end card (ctaScene) — fixed layout, data-driven copy ── */
    .s-cta { display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .s-cta .brand-logo-large { width: 130px; height: 130px; margin-bottom: 40px; filter: drop-shadow(0 0 30px rgba(77,139,255,0.4)); animation: scaleIn 0.6s ease-out 0.1s forwards, logoPulse 3s ease-in-out 1s infinite; opacity: 0; }
    .s-cta .brand-logo-large svg { width: 100%; height: 100%; }
    .s-cta .brand-name { font-size: 72px; font-weight: 900; color: var(--white); letter-spacing: 4px; margin-bottom: 16px; animation: scaleIn 0.6s ease-out 0.3s forwards; opacity: 0; }
    .s-cta .brand-name .hl { color: var(--blue); }
    .s-cta .tagline { font-size: 32px; font-weight: 600; color: var(--sec); letter-spacing: 3px; margin-bottom: 60px; animation: fadeIn 0.5s ease-out 0.7s forwards; opacity: 0; }
    .s-cta .action-box { animation: stampIn 0.5s ease-out 1.0s forwards; opacity: 0; }
    .s-cta .topic { margin-top: 30px; font-size: 36px; font-weight: 700; color: var(--sec); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
    /* ── Standard hook opening card (hookScene) — fixed skeleton, data-driven slots ── */
    .s-hook .scan-sweep { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, rgba(77,139,255,0.8), transparent); box-shadow: 0 0 20px rgba(77,139,255,0.5); animation: scanSweep var(--d) linear infinite; z-index: 50; }
    @keyframes scanSweep { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
    .s-hook .glow-tint { position: absolute; bottom: -250px; left: -200px; width: 900px; height: 900px; border-radius: 50%; }
    .s-hook .badge-pill { display: inline-flex; align-items: center; gap: 10px; background: var(--red); color: white; padding: 12px 32px; font-size: 26px; font-weight: 900; letter-spacing: 4px; border-radius: 8px; animation: stampIn 0.4s ease-out 0.3s forwards; opacity: 0; }
    .s-hook .badge-pill .pulse-dot { width: 12px; height: 12px; border-radius: 50%; background: white; animation: pulseDot 1s ease-in-out infinite; }
    .s-hook .subject-row { display: flex; align-items: center; justify-content: center; gap: 20px; animation: slideUp 0.4s ease-out 0.3s forwards; opacity: 0; }
    .s-hook .subject-row .subject-logo { width: 120px; height: 120px; filter: drop-shadow(0 0 25px rgba(77,139,255,0.3)); } .s-hook .subject-row .subject-logo svg { width: 100%; height: 100%; }
    .s-hook .subject-row .subject-name { font-size: 80px; font-weight: 900; color: var(--white); letter-spacing: 4px; }
    .s-hook .focal-claim { font-size: 78px; font-weight: 900; color: var(--white); letter-spacing: 2px; line-height: 1.1; text-align: center; animation: hookIn 0.3s ease-out forwards; }
    .s-hook .focal-reveal { font-size: 96px; font-weight: 900; letter-spacing: 4px; line-height: 1; text-align: center; animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.5s forwards; opacity: 0; }
    .s-hook .focal-number { font-size: 260px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9; text-align: center; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: scaleIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.8s forwards, numberPulse 2s ease-in-out 1.5s infinite; opacity: 0; }
    .s-hook .focal-number-label { font-size: 48px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 12px; text-align: center; animation: slideUp 0.5s ease-out 1.1s forwards; opacity: 0; }
    .s-hook .stats-row { display: flex; gap: 20px; justify-content: center; }
    .s-hook .source-line { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.4s ease-out 2.1s forwards; opacity: 0; }
  `;
}

// ── UI component building blocks (data-only; no business copy) ──

/**
 * Top brand bar: logo + CHINA AI NEWS + briefing tag. Channel identity only —
 * this is the only template containing hardcoded strings.
 * @param {string|object} tagOrOpts - Backward-compat: tag string, or { tag }
 * @returns {string} HTML string
 */
function brandBar(tagOrOpts) {
  const tag =
    typeof tagOrOpts === "string" ? tagOrOpts : (tagOrOpts?.tag ?? "INTELLIGENCE BRIEFING");
  return `<div class="brand-bar"><div class="b-logo">${BRAND_MARK_SVG}</div><div class="b-text">CHINA <span class="hl">AI</span> NEWS</div>${tag ? `<div class="briefing-tag">${tag}</div>` : ""}</div>`;
}

/**
 * Breaking news badge with pulsing dot.
 * @param {string} text - Badge text (e.g. "BREAKING", "EXCLUSIVE")
 * @returns {string} HTML string
 */
function breakingBadge(text) {
  return `<div class="breaking-badge"><span class="pulse-dot"></span> ${text}</div>`;
}

/**
 * Stat card with number, unit, and label.
 * @param {object} opts - { num, unit, label, color, delay }
 *   delay: optional animation-delay seconds (stagger rhythm in slot layouts)
 * @returns {string} HTML string
 */
function statCard({ num, unit = "", label, color = "blue", delay = 0 } = {}) {
  const unitHtml = unit ? `<span class="unit">${unit}</span>` : "";
  const style =
    `border-top-color: var(--${color});` + (delay ? ` animation-delay: ${delay}s;` : "");
  return `<div class="stat-card" style="${style}"><div class="stat-num" style="color: var(--${color});">${num}${unitHtml}</div><div class="stat-label">${label}</div></div>`;
}

/**
 * Left-border accent quote box with optional keyword highlight.
 * @param {object} opts - { quote, highlight, color, fontSize, speaker, source }
 * @returns {string} HTML string
 */
function quoteBox({
  quote = "",
  highlight = "",
  color = "blue",
  fontSize = 40,
  speaker = "",
  source = "",
} = {}) {
  const quoted = quote
    ? `<div class="quote-text" style="font-size: ${fontSize}px;">"${highlight ? quote.replace(highlight, `<span class="hl">${highlight}</span>`) : quote}"</div>`
    : "";
  return `<div class="quote-box" style="border-left-color: var(--${color});">${quoted}${speaker ? `<div class="quote-speaker">${speaker}</div>` : ""}${source ? `<div class="quote-source">${source}</div>` : ""}</div>`;
}

/**
 * Wrap `highlight` (when it appears in `text`) in an in-place highlighted
 * span — the shared substring highlight primitive for templates. Returns the
 * original text unchanged when the highlight is absent (never appends).
 * @param {string} text - Display text
 * @param {string} highlight - Substring to wrap (optional)
 * @param {string} color - Semantic color token, e.g. "blue"
 * @returns {string} HTML string
 */
function highlightSpan(text, highlight, color = "blue") {
  if (!highlight || !text.includes(highlight)) return text;
  return text.replace(
    highlight,
    `<span class="hl" style="color: var(--${color});">${highlight}</span>`,
  );
}

/**
 * Section title with optional highlighted keyword.
 * @param {string} text - Title
 * @param {object} opts - { highlight, hlColor, fontSize }
 * @returns {string} HTML string
 */
function titleBlock(
  text,
  { highlight = "", hlColor = "blue", fontSize = 48, center = false, color = "white" } = {},
) {
  const tag = `<span class="hl" style="color: var(--${hlColor});">${highlight}</span>`;
  // In-place when the highlight is part of the text ("THE CRACK SEQUENCE"
  // with highlight "CRACK"), otherwise appended ("BOTH" + "OPEN SOURCE").
  const inner = highlight
    ? text.includes(highlight)
      ? highlightSpan(text, highlight, hlColor)
      : `${text} ${tag}`
    : text;
  const align = center ? "text-align: center; " : "";
  return `<div class="title-block" style="${align}font-size: ${fontSize}px; color: var(--${color});">${inner}</div>`;
}

/**
 * Oversized data anchor (amber glow pulse) — the brand's signature focal point.
 * @param {string} num - Number/stat text
 * @param {object} opts - { color, fontSize }
 * @returns {string} HTML string
 */
function bigNumberAnchor(num, { color = "amber", fontSize = 260 } = {}) {
  return `<div class="big-number-anchor" style="color: var(--${color}); text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); font-size: ${fontSize}px;">${num}</div>`;
}

/**
 * Numbered points list (summary/playbook rows).
 * @param {string[]} points - Point texts
 * @param {object} opts - { color, start, step } stagger timing
 * @returns {string} HTML string — empty when no points
 */
function pointsList(points, { color = "blue", start = 0.3, step = 0.4 } = {}) {
  if (!points || points.length === 0) return "";
  return `<div class="points">${points
    .map(
      (p, i) =>
        `<div class="point" style="animation-delay: ${(start + i * step).toFixed(1)}s; border-left-color: var(--${color});" ><span class="num" style="color: var(--${color});">${i + 1}</span><span class="text">${p}</span></div>`,
    )
    .join("")}</div>`;
}

/** RGB triplets for semantic colors — used to tint stamp borders/glows. */
const COLOR_RGB = {
  blue: "77,139,255",
  red: "239,68,68",
  amber: "245,158,11",
  green: "52,211,153",
  purple: "109,78,255",
  cyan: "34,211,238",
};

/**
 * Full-width stamp box (verdict / reaction) with optional sub label + icon.
 * @param {object} opts - { text, sub, color, icon }
 * @returns {string} HTML string
 */
function stampBox({ text = "", sub = "", color = "amber", icon = "" } = {}) {
  const rgb = COLOR_RGB[color] || COLOR_RGB.amber;
  return `<div class="stamp-box" style="border-color: rgba(${rgb},0.3); background: rgba(${rgb},0.06);">${icon ? `<div class="stamp-icon">${icon}</div>` : ""}<div class="stamp-text" style="color: var(--${color}); text-shadow: 0 0 30px rgba(${rgb},0.3);">${text}</div>${sub ? `<div class="stamp-sub">${sub}</div>` : ""}</div>`;
}

/**
 * Fade-to-black overlay for scene endings.
 * @param {number} duration - Scene duration in seconds
 * @returns {string} HTML string
 */
function fadeToBlack(duration) {
  const start = Math.max(duration - 1.2, 1.5).toFixed(1);
  return `<div class="fade-to-black" style="position: absolute; inset: 0; background: #050508; pointer-events: none; animation: fadeOut 0.8s ease-in ${start}s forwards; opacity: 0;"></div>`;
}

/**
 * Logo registry lookup (spec: docs/specs/spec-hook-opening-card.md D-6).
 * Reads assets/logos/<key>.svg (stripped of XML declaration/comments) and
 * returns "" for unknown or non-registry keys — the subject row then falls
 * back to text-only. The key is validated against /^[a-z0-9-]+$/ so a
 * malformed value can never escape the logos directory (path traversal).
 * @param {string} key - Registry key (assets/logos/<key>.svg)
 * @returns {string} SVG markup or ""
 */
function logoSvg(key) {
  if (!key || !/^[a-z0-9-]+$/.test(key)) return "";
  try {
    return readFileSync(new URL(`../assets/logos/${key}.svg`, import.meta.url), "utf8")
      .replace(/<\?xml[^>]*\?>\s*/, "")
      .replace(/<!--[\s\S]*?-->/g, "");
  } catch {
    return "";
  }
}

/**
 * Standard hook opening card — the single shared implementation for every
 * video's Scene 1 (spec: docs/archive/spec-hook-opening-card.md).
 *
 * Fixed skeleton (never varies): scan-sweep + glow tint + brandBar + slot
 * system — kicker = optional badge pill, hero = subject row + focal,
 * support = optional stats + source. Zero business copy: every string comes
 * from scene.texts.
 *
 * Data contract (scene.texts):
 *   badge: "BREAKING"               optional — red pill in the kicker slot
 *   subject: "DEEPSEEK"             optional — subject name (company/topic)
 *   subjectLogo: "deepseek-icon"    optional — logo registry key (logoSvg)
 *   bigNumber: "$1.4B"              focal A (number-led, amber). Mutually
 *                                   exclusive with hookText — see
 *                                   scene-rules checkHookContract
 *   numberLabel: "FUNDING PAUSED"   optional — label under bigNumber;
 *                                   numberHighlight substring wraps .hl
 *   hookText: "0 KPIs."             focal B (claim-led) — visible on frame 1
 *                                   (no animation delay)
 *   revealText: "ONLY A VISION"     optional — claim payoff, stampIn at 1.5s
 *   stats: [{ num, unit, label }]   optional — stat card row (support)
 *   source: "BLOOMBERG"             optional — source line (support)
 *   color: "blue"                   optional — semantic color token driving
 *                                   glow tint + reveal color (default blue;
 *                                   valid: blue/red/amber/green/purple/cyan)
 *
 * The output carries brandBar, so withWatermark() skips injection — no
 * double branding on the channel open.
 * @param {object} scene - Scene object with texts
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
function hookScene(scene, duration) {
  const txt = scene.texts || {};
  const text = (key) => txt[key] ?? "";
  const color = /^(blue|red|amber|green|purple|cyan)$/.test(text("color")) ? text("color") : "blue";
  const rgb = COLOR_RGB[color];
  // glowPulse is blue-only (its keyframe hardcodes a blue text-shadow);
  // every other glow on the card is a static same-color glow (D-3).
  const isBlue = color === "blue";

  // kicker slot — optional badge (brand-red pill, pulse dot)
  const badge = text("badge")
    ? `<div class="badge-pill"><span class="pulse-dot"></span>${text("badge")}</div>`
    : "";

  // hero slot — optional subject row (registered logo + name)
  const logo = text("subjectLogo")
    ? `<div class="subject-logo">${logoSvg(text("subjectLogo"))}</div>`
    : "";
  const subject = text("subject")
    ? `<div class="subject-name" style="text-shadow: 0 0 30px rgba(${rgb},0.4);">${text("subject")}</div>`
    : "";
  const subjectRow = logo || subject ? `<div class="subject-row">${logo}${subject}</div>` : "";

  // hero slot — focal (number-led preferred; claim-led fallback)
  let focal = "";
  if (text("bigNumber")) {
    focal = `<div class="focal-number">${text("bigNumber")}</div>`;
    if (text("numberLabel")) {
      focal += `<div class="focal-number-label">${highlightSpan(text("numberLabel"), text("numberHighlight"), color)}</div>`;
    }
  } else if (text("hookText")) {
    focal = `<div class="focal-claim" style="text-shadow: 0 0 40px rgba(${rgb},0.4);">${highlightSpan(text("hookText"), text("hookHighlight"), color)}</div>`;
    if (text("revealText")) {
      const glow = isBlue
        ? "stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.5s forwards, glowPulse 2s ease-in-out 2.2s infinite"
        : "stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.5s forwards";
      const shadow = isBlue
        ? ""
        : `text-shadow: 0 0 60px rgba(${rgb},0.5), 0 0 120px rgba(${rgb},0.3); `;
      focal += `<div class="focal-reveal" style="color: var(--${color}); ${shadow}animation: ${glow};">${highlightSpan(text("revealText"), text("revealHighlight"), color)}</div>`;
    }
  }

  // support slot — optional stats row (staggered) + source line
  const statList = Array.isArray(txt.stats) ? txt.stats : [];
  const statsHtml =
    statList.length > 0
      ? `<div class="stats-row">${statList
          .map((s, i) =>
            statCard({ num: s.num, unit: s.unit, label: s.label, color, delay: 1.3 + i * 0.2 }),
          )
          .join("")}</div>`
      : "";
  const sourceHtml = text("source") ? `<div class="source-line">${text("source")}</div>` : "";
  const support = statsHtml || sourceHtml ? `${statsHtml}${sourceHtml}` : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
</style></head><body>
<div class="scene s-hook">
  <div class="grid-bg"></div><div class="glow-tint" style="background: radial-gradient(circle, rgba(${rgb},0.10) 0%, transparent 60%);"></div><div class="scanlines"></div><div class="scan-sweep"></div>
  ${brandBar()}
  ${sceneFrame({ kicker: badge, hero: subjectRow + focal, support })}
</div></body></html>`;
}

/**
 * Standard CTA end card — the single shared implementation for every video's
 * last scene (spec: docs/spec-cta-end-card-standard.md).
 *
 * Fixed layout (never varies): large logo → brand name (brandHighlight in
 * brand blue) → tagline → amber stampBox action → optional topic slot →
 * fade-to-black. Zero business copy: every string comes from scene.texts.
 *
 * Data contract (scene.texts):
 *   brand: "CHINA AI NEWS"        display text
 *   brandHighlight: "AI"          substring of brand, wrapped in .hl
 *   tagline: "CHINA AI, DECODED"  uppercase convention
 *   action: "FOLLOW FOR MORE"     required — amber stamp text (see
 *                                 scene-rules checkCTAActionContract)
 *   topic: "PRICING STRATEGY"     optional — series next-part teaser slot
 *
 * The output carries class "brand-logo-large", so withWatermark() skips
 * injection — no double branding on the channel close.
 * @param {object} scene - Scene object with texts
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
function ctaScene(scene, duration) {
  const txt = scene.texts || {};
  const text = (key) => txt[key] ?? "";
  const brand = text("brand");
  const brandHtml = highlightSpan(brand, text("brandHighlight"), "blue");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
</style></head><body>
<div class="scene s-cta">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="brand-logo-large">${BRAND_MARK_SVG}</div>
  ${brand ? `<div class="brand-name">${brandHtml}</div>` : ""}
  ${text("tagline") ? `<div class="tagline">${text("tagline")}</div>` : ""}
  ${text("action") ? `<div class="action-box">${stampBox({ text: `${text("action")} →`, color: "amber" })}</div>` : ""}
  ${text("topic") ? `<div class="topic">${text("topic")}</div>` : ""}
  ${fadeToBlack(duration)}
</div></body></html>`;
}

export {
  BRAND_MARK_SVG,
  templateCss,
  brandBar,
  breakingBadge,
  statCard,
  quoteBox,
  titleBlock,
  bigNumberAnchor,
  pointsList,
  stampBox,
  fadeToBlack,
  logoSvg,
  hookScene,
  ctaScene,
};
