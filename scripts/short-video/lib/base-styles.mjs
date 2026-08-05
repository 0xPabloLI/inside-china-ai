/**
 * Shared visual system for short video scenes.
 *
 * Exports:
 *   - baseStyles(duration): CSS reset + variables + background layers + animations
 *   - BRAND_MARK_SVG: Channel brand logo SVG (cleaned)
 *   - withWatermark(html): Inject brand watermark into scene HTML
 *   - UI components: brandBar, breakingBadge, statCard, fadeToBlack
 *
 * All video pipelines share this module to maintain consistent channel identity.
 * Content-specific scene designs live in content/{article}/scenes.mjs and import from here.
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
 * Base CSS for all scenes: reset, variables, background layers, animations.
 * @param {number} duration - Scene duration in seconds (drives --d variable)
 * @returns {string} CSS string
 */
function baseStyles(duration) {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1080px; height: 1920px; overflow: hidden;
      font-family: 'Helvetica Neue', 'Arial Black', Arial, sans-serif;
      background: #050508;
    }
    :root {
      --d: ${duration}s;
      --blue: #4d8bff; --purple: #6d4eff; --red: #ef4444;
      --amber: #f59e0b; --green: #34d399; --cyan: #22d3ee;
      --white: #f5f5f5; --sec: #94a3b8; --muted: #475569;
    }
    .scene { width: 1080px; height: 1920px; position: relative; overflow: hidden; }
    .grid-bg {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(77,139,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(77,139,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }
    .glow-red {
      position: absolute; top: -200px; right: -200px; width: 800px; height: 800px;
      background: radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 60%); border-radius: 50%;
    }
    .glow-blue {
      position: absolute; bottom: -250px; left: -200px; width: 900px; height: 900px;
      background: radial-gradient(circle, rgba(77,139,255,0.08) 0%, transparent 60%); border-radius: 50%;
    }
    .scanlines {
      position: absolute; inset: 0;
      background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.008) 3px, rgba(255,255,255,0.008) 4px);
      pointer-events: none;
    }
    .logo { width: 80px; height: 80px; }
    .logo svg { width: 100%; height: 100%; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideLeft { from { opacity: 0; transform: translateX(-50px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
    @keyframes stampIn { from { opacity: 0; transform: scale(2); } to { opacity: 1; transform: scale(1); } }
    .brand-watermark { position: absolute; bottom: 50px; right: 50px; width: 55px; height: 55px; opacity: 0.18; z-index: 100; pointer-events: none; }
    .brand-watermark svg { width: 100%; height: 100%; }
  `;
}

// ── UI component building blocks (optional, content scenes use as needed) ──

/**
 * Top brand bar: logo + CHINA AI NEWS + briefing tag.
 * @param {string} tagText - Text for the briefing tag (e.g. "INTELLIGENCE BRIEFING")
 * @returns {string} HTML string
 */
function brandBar(tagText) {
  return `<div class="brand-bar">
    <div class="b-logo">${BRAND_MARK_SVG}</div>
    <div class="b-text">CHINA <span class="hl">AI</span> NEWS</div>
    <div class="briefing-tag">${tagText}</div>
  </div>`;
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
  return `<div class="stat-card" style="border-top: 4px solid var(--${color});">
    <div class="stat-num" style="color: var(--${color});">${num}${unitHtml}</div>
    <div class="stat-label">${label}</div>
  </div>`;
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
 * Inject brand watermark into scene HTML before closing </div></body>.
 * @param {string} html - Scene HTML string
 * @returns {string} HTML with watermark injected
 */
function withWatermark(html) {
  const watermark = `<div class="brand-watermark">${BRAND_MARK_SVG}</div>`;
  return html.replace(/<\/div><\/body>/, `${watermark}</div></body>`);
}

export {
  baseStyles,
  BRAND_MARK_SVG,
  withWatermark,
  brandBar,
  breakingBadge,
  statCard,
  fadeToBlack,
};
