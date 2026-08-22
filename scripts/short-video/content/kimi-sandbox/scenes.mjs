/**
 * Kimi K3 Sandbox Escape — visual scene templates
 * 10 scenes, TikTok 60-70s.
 *
 * Visual DNA: breaking news / security incident briefing.
 *   - Red-dominant for urgency (containment breach, security)
 *   - Amber for key data highlights (model count, attacks)
 *   - Blue for authority (quotes, context)
 *   - Glitch energy on hook, clean authority on analysis scenes
 *
 * ALL on-screen copy comes from scene.texts (scene-data.mjs) — this file
 * must not contain business copy (drift-guarded by scene-drift.test.mjs).
 * Shared primitives come from lib/scene-templates.mjs; shared keyframes
 * from lib/base-styles.mjs (never redeclared here).
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { baseStyles, withWatermark } from "../../lib/base-styles.mjs";
import {
  templateCss,
  brandBar,
  titleBlock,
  pointsList,
  stampBox,
  highlightSpan,
  quoteBox,
  hookScene,
  ctaScene,
} from "../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../lib/scene-layout.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Safe text accessor
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — uses shared hookScene (red breaking news aesthetic) ── */
function scene1(scene, duration) {
  return hookScene(scene, duration, __dirname);
}

/* ── S2: What happened — test setup and escape ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-red { position: absolute; top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 60%); }
.s2 .badge { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); color: var(--red); padding: 12px 36px; font-size: 24px; font-weight: 800; letter-spacing: 4px; border-radius: 8px; animation: slideDown 0.4s ease-out 0.1s forwards; opacity: 0; }
.s2 .company-name { font-size: 64px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 16px; animation: slideUp 0.5s ease-out 0.3s forwards; opacity: 0; }
.s2 .action-row { display: flex; align-items: center; justify-content: center; gap: 24px; animation: fadeIn 0.5s ease-out 0.7s forwards; opacity: 0; }
.s2 .action-box { background: rgba(239,68,68,0.08); border: 2px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 20px 36px; text-align: center; }
.s2 .action-box .label { font-size: 22px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-bottom: 8px; }
.s2 .action-box .value { font-size: 36px; font-weight: 900; letter-spacing: 1px; }
.s2 .action-box.probe .value { color: var(--amber); }
.s2 .action-box.escape .value { color: var(--red); text-shadow: 0 0 30px rgba(239,68,68,0.4); }
.s2 .arrow { font-size: 48px; font-weight: 900; color: var(--muted); }
.s2 .context-note { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.2s forwards; opacity: 0; }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="badge">${t(txt, "badge")}</div>`,
    hero: `<div class="company-name">${t(txt, "company")}</div><div class="action-row"><div class="action-box probe"><div class="label">STEP 1</div><div class="value">${t(txt, "action")}</div></div><div class="arrow">→</div><div class="action-box escape"><div class="label">STEP 2</div><div class="value">${t(txt, "result")}</div></div></div>`,
    support: `<div class="context-note">${t(txt, "context")}</div>`,
  })}
</div></body></html>`;
}

/* ── S3: Just cheated — 0 attacks data reveal ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-amber { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 60%); border-radius: 50%; }
.s3 .stat-label { font-size: 28px; font-weight: 800; color: var(--sec); letter-spacing: 4px; animation: fadeIn 0.4s ease-out 0.1s forwards; opacity: 0; }
.s3 .big-zero { font-size: 260px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
.s3 .zero-label { font-size: 36px; font-weight: 800; color: var(--white); letter-spacing: 4px; margin-top: 8px; animation: slideUp 0.5s ease-out 0.6s forwards; opacity: 0; }
.s3 .cheat-stamp { animation: stampIn 0.5s ease-out 1.1s forwards; opacity: 0; }
.s3 .source-note { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.4s ease-out 1.5s forwards; opacity: 0; }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="stat-label">${t(txt, "statLabel")}</div>`,
    hero: `<div class="big-zero">${t(txt, "stat")}</div><div class="zero-label">${t(txt, "statLabel")}</div>`,
    support: `<div class="cheat-stamp">${stampBox({ text: t(txt, "action"), color: "amber" })}</div><div class="source-note" style="margin-top: 12px;">${t(txt, "source")}</div>`,
  })}
</div></body></html>`;
}

/* ── S4: Frontier Security assessment — quote ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-red { bottom: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(239,68,68,0.10) 0%, transparent 60%); }
.s4 .quote-mark { font-size: 160px; font-weight: 900; color: rgba(239,68,68,0.15); line-height: 0.8; margin-bottom: -30px; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s4 .quote { font-size: 48px; font-weight: 800; color: var(--white); text-align: center; line-height: 1.3; max-width: 850px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
.s4 .quote .hl { color: var(--red); font-weight: 900; }
.s4 .speaker { margin-top: 36px; font-size: 34px; font-weight: 800; color: var(--white); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
.s4 .source { margin-top: 8px; font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s4 .accent-line { width: 200px; height: 3px; background: linear-gradient(90deg, transparent, var(--red), transparent); margin-top: 24px; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="quote-mark">"</div><div class="quote">${t(txt, "quote")}</div><div class="speaker">${t(txt, "speaker")}</div><div class="source">${t(txt, "role")}</div><div class="accent-line"></div>`,
  })}
</div></body></html>`;
}

/* ── S5: AISI dispute — context/contrast ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-blue { top: -150px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.10) 0%, transparent 60%); }
.s5 .org-name { font-size: 60px; font-weight: 900; color: var(--blue); letter-spacing: 3px; text-shadow: 0 0 30px rgba(77,139,255,0.3); animation: slideUp 0.5s ease-out 0.2s forwards; opacity: 0; }
.s5 .verdict-box { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.3); border-radius: 14px; padding: 28px 40px; text-align: center; margin-top: 28px; animation: scaleIn 0.5s ease-out 0.6s forwards; opacity: 0; }
.s5 .verdict-box .verdict { font-size: 42px; font-weight: 900; color: var(--blue); letter-spacing: 2px; }
.s5 .blame-row { display: flex; align-items: center; gap: 16px; margin-top: 24px; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
.s5 .blame-row .arrow { font-size: 32px; color: var(--amber); font-weight: 900; }
.s5 .blame-row .blame { font-size: 34px; font-weight: 800; color: var(--amber); letter-spacing: 2px; }
.s5 .context-note { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.4s ease-out 1.4s forwards; opacity: 0; }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="org-name">${t(txt, "org")}</div><div class="verdict-box"><div class="verdict">${t(txt, "verdict")}</div></div><div class="blame-row"><span class="arrow">→</span><span class="blame">${t(txt, "blame")}</span></div>`,
    support: `<div class="context-note">${t(txt, "context")}</div>`,
  })}
</div></body></html>`;
}

/* ── S6: Pattern — 4 models broke containment ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-red { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(239,68,68,0.10) 0%, transparent 60%); border-radius: 50%; }
.s6 .period-tag { font-size: 24px; font-weight: 800; color: var(--sec); letter-spacing: 4px; animation: fadeIn 0.4s ease-out 0.1s forwards; opacity: 0; }
.s6 .big-four { font-size: 280px; font-weight: 900; color: var(--red); letter-spacing: -10px; line-height: 0.9; text-shadow: 0 0 60px rgba(239,68,68,0.5), 0 0 120px rgba(239,68,68,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
.s6 .four-label { font-size: 36px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 8px; animation: slideUp 0.5s ease-out 0.6s forwards; opacity: 0; }
.s6 .model-list { font-size: 30px; font-weight: 800; color: var(--sec); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; }
.s6 .model-list .hl { color: var(--red); font-weight: 900; }
</style></head><body>
<div class="scene s6">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="period-tag">${t(txt, "period")}</div>`,
    hero: `<div class="big-four">${t(txt, "bigNumber")}</div><div class="four-label">${t(txt, "label")}</div>`,
    support: `<div class="model-list">${t(txt, "list")}</div>`,
  })}
</div></body></html>`;
}

/* ── S7: What each did — different paths ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};
  const items = txt.items || [];

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-red { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 60%); }
.s7 .path-list { display: flex; flex-direction: column; gap: 18px; width: 100%; }
.s7 .path-item { display: flex; align-items: center; gap: 24px; padding: 24px 36px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-left: 5px solid var(--red); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s7 .path-item .icon { font-size: 36px; color: var(--red); flex-shrink: 0; }
.s7 .path-item .text { font-size: 32px; font-weight: 800; color: var(--white); letter-spacing: 1px; word-break: break-word; }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 44, color: "sec" }),
    hero: `<div class="path-list">${items.map((item, i) => `<div class="path-item" style="animation-delay: ${0.2 + i * 0.3}s;"><span class="icon">→</span><span class="text">${item}</span></div>`).join("")}</div>`,
  })}
</div></body></html>`;
}

/* ── S8: Why it happens — CMU professor quote ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-blue { top: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.10) 0%, transparent 60%); }
.s8 .quote-mark { font-size: 160px; font-weight: 900; color: rgba(77,139,255,0.15); line-height: 0.8; margin-bottom: -30px; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s8 .quote { font-size: 44px; font-weight: 800; color: var(--white); text-align: center; line-height: 1.3; max-width: 850px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
.s8 .quote .hl { color: var(--blue); font-weight: 900; }
.s8 .speaker { margin-top: 36px; font-size: 34px; font-weight: 800; color: var(--white); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
.s8 .source { margin-top: 8px; font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s8 .accent-line { width: 200px; height: 3px; background: linear-gradient(90deg, transparent, var(--blue), transparent); margin-top: 24px; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="quote-mark">"</div><div class="quote">${t(txt, "quote")}</div><div class="speaker">${t(txt, "speaker")}</div><div class="source">${t(txt, "role")}</div><div class="accent-line"></div>`,
  })}
</div></body></html>`;
}

/* ── S9: Big picture — summary with points ── */
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s9 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 700px; height: 700px; background: radial-gradient(circle, rgba(77,139,255,0.10) 0%, transparent 60%); }
.s9 .models-note { font-size: 28px; font-weight: 800; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.5s ease-out 1.4s forwards; opacity: 0; }
.s9 .models-note .hl { color: var(--blue); }
</style></head><body>
<div class="scene s9">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), {
      center: true,
      fontSize: 48,
      highlight: t(txt, "titleHighlight"),
    }),
    hero: `<div style="animation: fadeIn 0.4s ease-out 0.4s forwards; opacity: 0;">${pointsList(txt.points || [], { start: 0.3, step: 0.4, color: "red" })}</div>`,
    support: `<div class="models-note">${t(txt, "models")}</div>`,
  })}
</div></body></html>`;
}

/* ── S10: CTA — standard end card (shared ctaScene) ── */
function scene10(scene, duration) {
  return ctaScene(scene, duration);
}

// Scene dispatch table
const sceneGenerators = {
  1: scene1,
  2: scene2,
  3: scene3,
  4: scene4,
  5: scene5,
  6: scene6,
  7: scene7,
  8: scene8,
  9: scene9,
  10: scene10,
};

/**
 * Generate scene HTML for a Kimi K3 Sandbox Escape scene.
 * @param {object} scene - Scene object with id, texts, voiceover
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));
}
