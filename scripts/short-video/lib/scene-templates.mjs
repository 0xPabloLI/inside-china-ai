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

// ── Brand assets ──
// Channel brand logo — shared across ALL videos
const BRAND_MARK_SVG = readFileSync(
  new URL("../assets/china-ai-news-logo-vector.svg", import.meta.url),
  "utf8",
)
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!--[\s\S]*?-->/g, "");

/**
 * CSS for all template classes. Keyframes are NOT included here — they live
 * in baseStyles() (single definition per full scene CSS).
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
    .stamp-box .stamp-text { font-size: 36px; font-weight: 900; color: var(--amber); letter-spacing: 2px; text-shadow: 0 0 30px rgba(245,158,11,0.3); }
    .stamp-box .stamp-sub { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 8px; }
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
  const tag = typeof tagOrOpts === "string" ? tagOrOpts : tagOrOpts?.tag ?? "INTELLIGENCE BRIEFING";
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
 * @param {object} opts - { num, unit, label, color }
 * @returns {string} HTML string
 */
function statCard({ num, unit = "", label, color = "blue" }) {
  const unitHtml = unit ? `<span class="unit">${unit}</span>` : "";
  return `<div class="stat-card" style="border-top-color: var(--${color});"><div class="stat-num" style="color: var(--${color});">${num}${unitHtml}</div><div class="stat-label">${label}</div></div>`;
}

/**
 * Left-border accent quote box with optional keyword highlight.
 * @param {object} opts - { quote, highlight, color, fontSize, speaker, source }
 * @returns {string} HTML string
 */
function quoteBox({ quote = "", highlight = "", color = "blue", fontSize = 40, speaker = "", source = "" } = {}) {
  const quoted = quote
    ? `<div class="quote-text" style="font-size: ${fontSize}px;">"${highlight ? quote.replace(highlight, `<span class="hl">${highlight}</span>`) : quote}"</div>`
    : "";
  return `<div class="quote-box" style="border-left-color: var(--${color});">${quoted}${speaker ? `<div class="quote-speaker">${speaker}</div>` : ""}${source ? `<div class="quote-source">${source}</div>` : ""}</div>`;
}

/**
 * Section title with optional highlighted keyword.
 * @param {string} text - Title
 * @param {object} opts - { highlight, hlColor, fontSize }
 * @returns {string} HTML string
 */
function titleBlock(text, { highlight = "", hlColor = "blue", fontSize = 48 } = {}) {
  const tag = `<span class="hl" style="color: var(--${hlColor});">${highlight}</span>`;
  // In-place when the highlight is part of the text ("THE CRACK SEQUENCE"
  // with highlight "CRACK"), otherwise appended ("BOTH" + "OPEN SOURCE").
  const inner = highlight
    ? text.includes(highlight)
      ? text.replace(highlight, tag)
      : `${text} ${tag}`
    : text;
  return `<div class="title-block" style="font-size: ${fontSize}px;">${inner}</div>`;
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

/**
 * Full-width stamp box (verdict / reaction) with optional sub label.
 * @param {object} opts - { text, sub, color }
 * @returns {string} HTML string
 */
function stampBox({ text = "", sub = "", color = "amber" } = {}) {
  return `<div class="stamp-box" style="border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.06);"><div class="stamp-text" style="color: var(--${color}); text-shadow: 0 0 30px rgba(245,158,11,0.3);">${text}</div>${sub ? `<div class="stamp-sub">${sub}</div>` : ""}</div>`;
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
};
