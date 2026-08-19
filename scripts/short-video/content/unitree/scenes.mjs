/**
 * Unitree IPO visual scene templates — v1 (media-enabled).
 * 10 scenes for the Unitree Robotics IPO video.
 *
 * This is the FIRST content pipeline to use media backgrounds (bgImage/bgVideo).
 * Scenes 2, 4, 5 have `media` fields in scene-data.mjs that trigger
 * background rendering via lib/media-bg.mjs's mediaLayer() function.
 *
 * Visual DNA: IPO/finance + robotics aesthetic.
 *   - Amber-dominant glow (money/IPO energy)
 *   - Red accents for the "can't do real work" controversy
 *   - Slide/ken-burns animations for product/demo footage
 *
 * Architecture:
 *   - hookScene / ctaScene delegate to shared templates
 *   - hookScene now supports optional media via scene.media (spec: spec-hook-media-support.md)
 *   - Media scenes call mediaLayer(scene.media, __dirname, duration)
 *     to get { css, html } for the background layer
 *   - Scene content sits at z-index: 2+ above the media layer
 *
 * ALL on-screen copy comes from scene.texts (scene-data.mjs) — this file
 * must not contain business copy (drift-guarded by scene-drift.test.mjs).
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { baseStyles, withWatermark } from "../../lib/base-styles.mjs";
import { templateCss, brandBar, ctaScene, hookScene, sceneChart } from "../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../lib/scene-layout.mjs";
import { mediaLayer } from "../../lib/media-bg.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Safe text accessor
function t(texts, key) {
  return texts?.[key] ?? "";
}

// ─── S1: Hook — shared hookScene (supports optional media) ───
function scene1(scene, duration) {
  return hookScene(scene, duration, __dirname);
}

// ─── S2: IPO details — video background + narrative overlay ───
function scene2(scene, duration) {
  const txt = scene.texts || {};
  const media = scene.media ? mediaLayer(scene.media, __dirname, duration) : { css: "", html: "" };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}${media.css}
.s2 .narrative-badge { display: inline-block; padding: 12px 28px; border: 2px solid rgba(245,158,11,0.4); border-radius: 8px; background: rgba(245,158,11,0.08); font-size: 28px; font-weight: 800; color: var(--amber); letter-spacing: 2px; margin-bottom: 24px; animation: stampIn 0.4s ease-out 0.2s forwards; opacity: 0; }
.s2 .company-name { font-size: 62px; font-weight: 900; color: var(--white); margin-bottom: 16px; animation: slideUp 0.5s ease-out 0.4s forwards; opacity: 0; }
.s2 .action-text { font-size: 42px; font-weight: 700; color: var(--sec); margin-bottom: 12px; animation: slideUp 0.5s ease-out 0.6s forwards; opacity: 0; }
.s2 .result-text { font-size: 72px; font-weight: 900; color: var(--amber); animation: stampIn 0.5s ease-out 0.8s forwards; opacity: 0; }
.s2 .context-text { font-size: 32px; font-weight: 600; color: var(--sec); margin-top: 16px; animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; }
</style></head><body>
<div class="scene s2">
${media.html}
<div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ kicker: `<div class="narrative-badge">${t(txt, "badge")}</div>`, hero: `<div class="company-name">${t(txt, "company")}</div><div class="action-text">${t(txt, "action")}</div><div class="result-text">${t(txt, "result")}</div>`, support: `<div class="context-text">${t(txt, "context")}</div>` })}
</div></body></html>`;
}

// ─── S3: Oversubscription — pure data stat (no media) ───
function scene3(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-amber { bottom: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 60%); }
.s3 .stat-reveal { text-align: center; }
.s3 .big-stat { font-size: 220px; font-weight: 900; color: var(--amber); line-height: 0.9; animation: stampIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s3 .stat-label { font-size: 46px; font-weight: 800; color: var(--white); letter-spacing: 4px; margin-top: 16px; animation: slideUp 0.5s ease-out 0.5s forwards; opacity: 0; }
.s3 .subtext { font-size: 36px; font-weight: 600; color: var(--sec); margin-top: 24px; animation: fadeIn 0.5s ease-out 0.8s forwards; opacity: 0; }
.s3 .source { font-size: 26px; font-weight: 600; color: var(--muted); margin-top: 20px; letter-spacing: 1px; animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; }
</style></head><body>
<div class="scene s3"><div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ hero: `<div class="stat-reveal"><div class="big-stat">${t(txt, "stat")}</div><div class="stat-label">${t(txt, "statLabel")}</div><div class="subtext">${t(txt, "subtext")}</div><div class="source">${t(txt, "source")}</div></div>` })}
</div></body></html>`;
}

// ─── S4: Company background — image background (ken-burns) + info card ───
function scene4(scene, duration) {
  const txt = scene.texts || {};
  const media = scene.media ? mediaLayer(scene.media, __dirname, duration) : { css: "", html: "" };
  const points = txt.points || [];
  const pointsHtml = points
    .map((p, i) => `<li style="animation-delay: ${0.5 + i * 0.15}s;">${p}</li>`)
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}${media.css}
.s4 .info-card { padding: 32px; border: 2px solid rgba(77,139,255,0.2); border-radius: 12px; background: rgba(10,10,20,0.6); }
.s4 .card-title { font-size: 36px; font-weight: 900; color: var(--blue); margin-bottom: 8px; }
.s4 .card-highlight { color: var(--amber); }
.s4 .card-subtitle { font-size: 28px; font-weight: 600; color: var(--sec); margin-bottom: 20px; }
.s4 .card-points { list-style: none; padding: 0; }
.s4 .card-points li { font-size: 34px; font-weight: 700; color: var(--white); margin-bottom: 14px; padding-left: 32px; position: relative; animation: slideUp 0.4s ease-out forwards; opacity: 0; }
.s4 .card-points li::before { content: "▸"; position: absolute; left: 0; color: var(--amber); }
</style></head><body>
<div class="scene s4">
${media.html}
<div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ kicker: `<div class="card-title">${t(txt, "title")} <span class="card-highlight">${t(txt, "titleHighlight")}</span></div><div class="card-subtitle">${t(txt, "subtitle")}</div>`, hero: `<div class="info-card"><ul class="card-points">${pointsHtml}</ul></div>` })}
</div></body></html>`;
}

// ─── S5: Products — video background (slide) + narrative ───
function scene5(scene, duration) {
  const txt = scene.texts || {};
  const media = scene.media ? mediaLayer(scene.media, __dirname, duration) : { css: "", html: "" };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}${media.css}
.s5 .narrative-badge { display: inline-block; padding: 12px 28px; border: 2px solid rgba(239,68,68,0.4); border-radius: 8px; background: rgba(239,68,68,0.08); font-size: 28px; font-weight: 800; color: var(--red); letter-spacing: 2px; margin-bottom: 24px; animation: stampIn 0.4s ease-out 0.2s forwards; opacity: 0; }
.s5 .company-name { font-size: 62px; font-weight: 900; color: var(--white); margin-bottom: 16px; animation: slideUp 0.5s ease-out 0.4s forwards; opacity: 0; }
.s5 .action-text { font-size: 42px; font-weight: 700; color: var(--sec); margin-bottom: 12px; animation: slideUp 0.5s ease-out 0.6s forwards; opacity: 0; }
.s5 .result-text { font-size: 54px; font-weight: 900; color: var(--red); animation: stampIn 0.5s ease-out 0.8s forwards; opacity: 0; }
.s5 .context-text { font-size: 32px; font-weight: 600; color: var(--amber); margin-top: 16px; animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; }
</style></head><body>
<div class="scene s5">
${media.html}
<div class="grid-bg"></div><div class="glow-red"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ kicker: `<div class="narrative-badge">${t(txt, "badge")}</div>`, hero: `<div class="company-name">${t(txt, "company")}</div><div class="action-text">${t(txt, "action")}</div><div class="result-text">${t(txt, "result")}</div>`, support: `<div class="context-text">${t(txt, "context")}</div>` })}
</div></body></html>`;
}

// ─── S6: The catch — quote (no media, pure text impact) ───
function scene6(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-red { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 60%); }
.s6 .quote-mark { font-size: 200px; font-weight: 900; color: rgba(239,68,68,0.15); line-height: 0.8; margin-bottom: -30px; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s6 .quote { font-size: 54px; font-weight: 700; color: var(--white); text-align: center; line-height: 1.35; max-width: 900px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
.s6 .source { margin-top: 36px; font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s6 .verified { display: inline-flex; align-items: center; gap: 12px; padding: 14px 28px; border: 2px solid rgba(245,158,11,0.3); border-radius: 10px; background: rgba(245,158,11,0.06); margin-top: 24px; animation: stampIn 0.4s ease-out 1.8s forwards; opacity: 0; }
.s6 .verified .text { font-size: 30px; font-weight: 800; color: var(--amber); letter-spacing: 2px; }
.s6 .verified-wrap { text-align: center; }
</style></head><body>
<div class="scene s6"><div class="grid-bg"></div><div class="glow-red"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ hero: `<div style="text-align:center;"><div class="quote-mark">"</div><div class="quote">${t(txt, "quote")}</div><div class="source">${t(txt, "source")}</div><div class="verified-wrap"><div class="verified"><span class="text">${t(txt, "verified")}</span></div></div></div>` })}
</div></body></html>`;
}

// ─── S7: DeepSeek backing — context card (no media) ───
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-blue { bottom: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s7 .context-card { padding: 36px; border: 2px solid rgba(77,139,255,0.2); border-radius: 12px; background: rgba(10,10,20,0.6); }
.s7 .card-badge { display: inline-block; padding: 10px 24px; border: 1px solid rgba(77,139,255,0.3); border-radius: 6px; font-size: 24px; font-weight: 800; color: var(--blue); letter-spacing: 2px; margin-bottom: 20px; animation: stampIn 0.4s ease-out 0.2s forwards; opacity: 0; }
.s7 .card-title { font-size: 46px; font-weight: 900; color: var(--white); margin-bottom: 8px; animation: slideUp 0.5s ease-out 0.4s forwards; opacity: 0; }
.s7 .card-highlight { color: var(--blue); }
.s7 .context-detail { font-size: 36px; font-weight: 700; color: var(--amber); margin-top: 16px; animation: slideUp 0.5s ease-out 0.6s forwards; opacity: 0; }
.s7 .extra-detail { font-size: 28px; font-weight: 600; color: var(--sec); margin-top: 12px; animation: fadeIn 0.5s ease-out 0.8s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7"><div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ kicker: `<div class="card-badge">${t(txt, "badge")}</div>`, hero: `<div class="context-card"><div class="card-title">${t(txt, "title")} <span class="card-highlight">${t(txt, "titleHighlight")}</span></div><div class="context-detail">${t(txt, "context")}</div><div class="extra-detail">${t(txt, "detail")}</div></div>` })}
</div></body></html>`;
}

// ─── S8: AgiBot rivalry — vertical contrast (no media) ───
function scene8(scene, duration) {
  const txt = scene.texts || {};
  const left = txt.left || [];
  const right = txt.right || [];

  const chips = (items, delayBase) =>
    `<div class="chip-row">${items.map((item, i) => `<div class="chip" style="animation-delay: ${delayBase + i * 0.12}s;">${item}</div>`).join("")}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-amber { top: 200px; left: -200px; width: 700px; height: 700px; background: radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 60%); }
.s8 .glow-blue { bottom: -200px; right: -200px; width: 700px; height: 700px; background: radial-gradient(circle, rgba(77,139,255,0.10) 0%, transparent 60%); }
.s8 .vs-title { font-size: 46px; font-weight: 900; color: var(--white); text-align: center; margin-bottom: 24px; animation: slideUp 0.5s ease-out 0.2s forwards; opacity: 0; }
.s8 .vs-badge { display: inline-block; padding: 8px 24px; border: 1px solid var(--muted); border-radius: 6px; font-size: 28px; font-weight: 900; color: var(--muted); letter-spacing: 2px; margin: 0 auto 20px; animation: stampIn 0.4s ease-out 0.4s forwards; opacity: 0; }
.s8 .vs-wrap { text-align: center; }
.s8 .card { padding: 24px; border-radius: 10px; margin-bottom: 16px; }
.s8 .card-left { border: 2px solid rgba(245,158,11,0.3); background: rgba(245,158,11,0.05); }
.s8 .card-right { border: 2px solid rgba(77,139,255,0.3); background: rgba(77,139,255,0.05); }
.s8 .chip-row { display: flex; flex-wrap: wrap; gap: 10px; }
.s8 .chip { display: inline-block; padding: 10px 20px; border-radius: 6px; font-size: 28px; font-weight: 700; animation: slideUp 0.4s ease-out forwards; opacity: 0; }
.s8 .card-left .chip { background: rgba(245,158,11,0.1); color: var(--amber); }
.s8 .card-right .chip { background: rgba(77,139,255,0.1); color: var(--blue); }
.s8 .note { text-align: center; font-size: 28px; font-weight: 700; color: var(--sec); margin-top: 16px; animation: fadeIn 0.5s ease-out 1.2s forwards; opacity: 0; }
.s8 .note .hl { color: var(--red); }
</style></head><body>
<div class="scene s8"><div class="grid-bg"></div><div class="glow-amber"></div><div class="glow-blue"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ hero: `<div><div class="vs-title">${t(txt, "title")}</div><div class="vs-wrap"><div class="vs-badge">${t(txt, "vs")}</div></div><div class="card card-left">${chips(left, 0.6)}</div><div class="card card-right">${chips(right, 0.9)}</div><div class="note">${t(txt, "note")} <span class="hl">${t(txt, "noteHighlight")}</span></div></div>` })}
</div></body></html>`;
}

// ─── S9: China dominance — stat reveal (no media) ───
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s9 .glow-amber { top: 50%; left: 50%; transform: translate(-50%, -50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 60%); }
.s9 .stat-reveal { text-align: center; }
.s9 .big-stat { font-size: 260px; font-weight: 900; color: var(--amber); line-height: 0.9; animation: stampIn 0.6s ease-out 0.2s forwards; opacity: 0; }
.s9 .stat-label { font-size: 46px; font-weight: 800; color: var(--white); letter-spacing: 4px; margin-top: 16px; animation: slideUp 0.5s ease-out 0.6s forwards; opacity: 0; }
.s9 .subtext { font-size: 34px; font-weight: 600; color: var(--sec); margin-top: 24px; animation: fadeIn 0.5s ease-out 0.9s forwards; opacity: 0; }
.s9 .source { font-size: 26px; font-weight: 600; color: var(--muted); margin-top: 16px; letter-spacing: 1px; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
</style></head><body>
<div class="scene s9"><div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ hero: `<div class="stat-reveal"><div class="big-stat">${t(txt, "bigNumber")}</div><div class="stat-label">${t(txt, "label")}</div><div class="subtext">${t(txt, "subtext")}</div><div class="source">${t(txt, "source")}</div></div>` })}
</div></body></html>`;
}

// ─── S10: CTA — shared ctaScene (ignores media) ───
function scene10(scene, duration) {
  return ctaScene(scene, duration);
}

// ─── Dispatcher ───

export function generateScene(scene, duration) {
  const d = Math.max(duration, 5);
  switch (scene.visualType) {
    case "hook":
      return scene1(scene, d);
    case "narrative":
      // Scenes 2 and 5 both use narrative but with different visual treatment
      // Dispatch by scene id
      if (scene.id === 2) return scene2(scene, d);
      if (scene.id === 5) return scene5(scene, d);
      return scene2(scene, d);
    case "data":
      return scene3(scene, d);
    case "info-card":
      return scene4(scene, d);
    case "quote":
      return scene6(scene, d);
    case "context":
      return scene7(scene, d);
    case "contrast":
      return scene8(scene, d);
    case "stat-reveal":
      return scene9(scene, d);
    case "chart":
      return sceneChart(scene, d);
    case "cta":
      return scene10(scene, d);
    default:
      console.warn(`Unknown visualType: ${scene.visualType}, using hookScene`);
      return hookScene(scene, d, __dirname);
  }
}
