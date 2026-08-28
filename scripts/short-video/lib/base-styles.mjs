/**
 * Shared visual system for short video scenes.
 *
 * Exports:
 *   - baseStyles(duration): CSS reset + variables + background layers +
 *     shared keyframes + watermark positioning
 *   - withWatermark(html): Inject brand watermark into scene HTML
 *   - BRAND_MARK_SVG: Channel brand logo SVG (cleaned)
 *   - UI components (brandBar, breakingBadge, statCard, fadeToBlack):
 *     re-exported from lib/scene-templates.mjs (kept here for API compat;
 *     new content should import from scene-templates.mjs directly)
 *
 * All video pipelines share this module to maintain consistent channel
 * identity. Content-specific scene designs live in content/{slug}/scenes.mjs
 * and import from here.
 */

import {
  BRAND_MARK_SVG,
  brandBar,
  breakingBadge,
  statCard,
  fadeToBlack,
} from "./scene-templates.mjs";
import { WATERMARK_POS } from "./safe-zones.mjs";

/**
 * Base CSS for all scenes: reset, variables, background layers, shared
 * keyframes, watermark position. Scene templates (lib/scene-templates.mjs)
 * style their own classes via templateCss().
 * @param {number} duration - Scene duration in seconds (drives --d variable)
 * @returns {string} CSS string
 */
function baseStyles(duration) {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1080px; height: 1920px; overflow: hidden;
      font-family: 'Helvetica Neue', 'Arial Black', Arial, sans-serif;
      background: #0a0a14;
    }
    :root {
      --d: ${duration}s;
      --blue: #4d8bff; --purple: #6d4eff; --red: #ef4444;
      --amber: #f59e0b; --green: #34d399; --cyan: #22d3ee;
      --white: #f5f5f5; --sec: #cbd5e1; --muted: #475569;
    }
    .scene { width: 1080px; height: 1920px; position: relative; overflow: hidden; }
    .grid-bg {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(77,139,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(77,139,255,0.04) 1px, transparent 1px);
      background-size: 60px 60px;
    }
    .glow-red {
      position: absolute; top: -200px; right: -200px; width: 800px; height: 800px;
      background: radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 60%); border-radius: 50%;
    }
    .glow-blue {
      position: absolute; bottom: -250px; left: -200px; width: 900px; height: 900px;
      background: radial-gradient(circle, rgba(77,139,255,0.10) 0%, transparent 60%); border-radius: 50%;
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
    /* Shared template keyframes — scenes must NOT redeclare these
       (single definition per video, drift-guarded by scene-drift.test.mjs) */
    @keyframes slideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.7); } }
    @keyframes numberPulse { 0%, 100% { text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); } 50% { text-shadow: 0 0 80px rgba(245,158,11,0.7), 0 0 160px rgba(245,158,11,0.4); } }
    @keyframes glowPulse { 0%, 100% { text-shadow: 0 0 60px rgba(77,139,255,0.5), 0 0 120px rgba(77,139,255,0.3); } 50% { text-shadow: 0 0 80px rgba(77,139,255,0.7), 0 0 160px rgba(77,139,255,0.4); } }
    @keyframes logoPulse { 0%, 100% { filter: drop-shadow(0 0 30px rgba(77,139,255,0.4)); } 50% { filter: drop-shadow(0 0 50px rgba(77,139,255,0.6)); } }
    @keyframes hookIn { from { opacity: 0; transform: scale(1.1); } to { opacity: 1; transform: scale(1); } }
    @keyframes fadeOut { to { opacity: 1; } }
    /* Channel watermark — top-left corner, clear of the TikTok action rail
       (right) and the caption/subtitle zone (bottom). See lib/safe-zones.mjs.
       opacity 0.35 keeps the (now visible) mark legible without competing
       with scene content. */
    .brand-watermark { position: absolute; top: ${WATERMARK_POS.top}px; left: ${WATERMARK_POS.left}px; width: 55px; height: 55px; opacity: 0.35; z-index: 100; pointer-events: none; }
    .brand-watermark svg { width: 100%; height: 100%; }
    /* Frame glow — Feed separation layer (spec: docs/archive/spec-color-scheme-optimization.md §2.2).
       Decorative border + inner glow on every scene frame edge; solves the
       dark-video-against-dark-TikTok-UI camouflage problem. CTA scenes use the
       .blue variant. pointer-events: none; not content; safe-zone-exempt. */
    .frame-glow { position: absolute; inset: 0; border: 3px solid rgba(245,158,11,0.2); box-shadow: inset 0 0 40px rgba(245,158,11,0.08); z-index: 99; pointer-events: none; }
    .frame-glow.blue { border-color: rgba(77,139,255,0.2); box-shadow: inset 0 0 40px rgba(77,139,255,0.08); }
  `;
}

/**
 * Inject brand watermark + frame-glow into scene HTML before closing
 * </div></body>.
 *
 * Frame-glow is injected into ALL scenes (including brand-bar / CTA
 * scenes) — it's a decorative Feed-separation layer, not channel identity.
 * CTA scenes (detected by brand-logo-large) get the .blue glow variant.
 *
 * Watermark is skipped for scenes that already render channel identity —
 * a brand bar (top-left scenes) or a large brand logo (CTA close scenes) —
 * avoiding double branding in the top-left corner.
 * @param {string} html - Scene HTML string
 * @returns {string} HTML with frame-glow (+ watermark) injected
 */
function withWatermark(html) {
  // Detect CTA scene for blue frame-glow variant
  const isCTA = html.includes('class="brand-logo-large"');
  const glowClass = isCTA ? "frame-glow blue" : "frame-glow";
  const frameGlow = `<div class="${glowClass}"></div>`;

  // Watermark only for scenes without brand identity (brand-bar or logo)
  const hasBrand = html.includes('class="brand-bar"') || isCTA;
  const watermark = hasBrand ? "" : `<div class="brand-watermark">${BRAND_MARK_SVG}</div>`;

  // Inject both before closing </div></body> (inside the scene div)
  return html.replace(/<\/div><\/body>/, `${frameGlow}${watermark}</div></body>`);
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
