/**
 * Distillation pt2 visual scene templates — "Kimi's Gambit"
 * 9 scenes for the LLM distillation scandal video, part 2. v3 (slot layout).
 *
 * Visual DNA: data-breach / espionage aesthetic (same family as pt1).
 *   - Red-dominant glow (scandal alert) vs DeepSeek's blue
 *   - Glitch flash on hook scenes
 *   - Terminal-style data stream accent
 *   - Stamp-in animations for impact numbers
 *
 * Migration to the slot layout system (spec: spec-video-layout-safe-zones.md):
 * - All scenes assemble content into fixed slots via sceneFrame() from
 *   lib/scene-layout.mjs: kickerTitle (220-400) / hero (400-950) /
 *   support (950-1150). No scene-level flex, no magic bottom padding.
 * - Scene 9 (CTA) delegates to the shared ctaScene end card (unchanged).
 *
 * ALL on-screen copy comes from scene.texts (scene-data.mjs) — this file
 * must not contain business copy (drift-guarded by scene-drift.test.mjs).
 * Shared primitives come from lib/scene-templates.mjs; shared keyframes
 * from lib/base-styles.mjs (never redeclared here).
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { baseStyles, withWatermark } from "../../../lib/base-styles.mjs";
import { templateCss, brandBar, ctaScene, hookScene } from "../../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../../lib/scene-layout.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Safe text accessor — returns empty string for missing fields
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — "I'm Claude" (shared hookScene, red tint) ── */
function scene1(scene, duration) {
  return hookScene(scene, duration, __dirname);
}

/* ── S2: Recap — part 1 → part 2 ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-blue { top: -200px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s2 .prev { text-align: center; font-size: 42px; font-weight: 800; color: var(--sec); letter-spacing: 3px; animation: slideUp 0.4s ease-out 0.2s forwards; opacity: 0; }
.s2 .arrow-down { text-align: center; font-size: 48px; font-weight: 900; color: var(--amber); text-shadow: 0 0 20px rgba(245,158,11,0.4); animation: fadeIn 0.4s ease-out 0.7s forwards; opacity: 0; margin: 12px 0; }
.s2 .next { text-align: center; font-size: 66px; font-weight: 900; color: var(--white); letter-spacing: 2px; line-height: 1.15; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 1.0s forwards; opacity: 0; }
.s2 .next .hl { color: var(--blue); }
.s2 .next-wrap { max-width: 820px; }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="prev">${t(txt, "line1")}</div><div class="arrow-down">↓</div><div class="next-wrap"><div class="next">${t(txt, "line2")}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S3: K3 specs — stat reveal ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-amber { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 60%); border-radius: 50%; }
.s3 .big-number { text-align: center; font-size: 200px; font-weight: 900; color: var(--amber); letter-spacing: -8px; line-height: 0.95; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
.s3 .label { text-align: center; font-size: 40px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 16px; animation: slideUp 0.4s ease-out 0.8s forwards; opacity: 0; }
.s3 .subtext { text-align: center; font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 12px; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="big-number">${t(txt, "bigNumber")}</div><div class="label">${t(txt, "label")}</div><div class="subtext">${t(txt, "subtext")}</div>`,
  })}
</div></body></html>`;
}

/* ── S4: Benchmarks — data table (text values) ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};
  const rows = txt.rows || [];

  const rowsHtml = rows
    .map((r, i) => {
      const value = r.value || "";
      const tone = /^#/.test(value) ? "green" : "red";
      return `<div class="row" style="animation-delay: ${0.4 + i * 0.35}s;">
      <div class="label">${r.label || ""}</div>
      <div class="value ${tone}">${value}</div>
    </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-red { top: -150px; right: -200px; width: 800px; height: 800px; }
.s4 .title { text-align: center; font-size: 40px; font-weight: 800; color: var(--sec); letter-spacing: 2px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s4 .title .hl { color: var(--red); }
.s4 .table { display: flex; flex-direction: column; width: 100%; }
.s4 .row { display: flex; align-items: center; gap: 24px; padding: 22px 0; border-bottom: 1px solid rgba(255,255,255,0.07); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s4 .row .label { flex: 1; font-size: 34px; font-weight: 800; color: var(--white); letter-spacing: 1px; }
.s4 .row .value { font-size: 38px; font-weight: 900; }
.s4 .row .value.green { color: var(--green); text-shadow: 0 0 20px rgba(52,211,153,0.4); }
.s4 .row .value.red { color: var(--red); text-shadow: 0 0 20px rgba(239,68,68,0.4); }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="title">${t(txt, "title")}</div>`,
    hero: `<div class="table">${rowsHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S5: Hallucination — stat reveal ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-red { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 60%); border-radius: 50%; }
.s5 .big-number { text-align: center; font-size: 200px; font-weight: 900; color: var(--red); letter-spacing: -8px; line-height: 0.95; text-shadow: 0 0 60px rgba(239,68,68,0.5), 0 0 120px rgba(239,68,68,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
.s5 .label { text-align: center; font-size: 40px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 16px; animation: slideUp 0.4s ease-out 0.8s forwards; opacity: 0; }
.s5 .subtext { text-align: center; font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 12px; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="big-number">${t(txt, "bigNumber")}</div><div class="label">${t(txt, "label")}</div><div class="subtext">${t(txt, "subtext")}</div>`,
  })}
</div></body></html>`;
}

/* ── S6: Quote — identity bleed ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s6 .quote-mark { text-align: center; font-size: 160px; font-weight: 900; color: rgba(77,139,255,0.15); line-height: 0.8; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s6 .quote { font-size: 54px; font-weight: 800; color: var(--white); text-align: center; line-height: 1.3; max-width: 840px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
.s6 .quote .hl { color: var(--blue); font-weight: 900; }
.s6 .source { margin-top: 36px; text-align: center; font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s6 .accent-line { width: 200px; height: 3px; background: linear-gradient(90deg, transparent, var(--blue), transparent); margin: 28px auto 0; animation: fadeIn 0.5s ease-out 1.6s forwards; opacity: 0; }
</style></head><body>
<div class="scene s6">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="quote-mark">"</div><div class="quote">${t(txt, "quote")}</div><div class="source">${t(txt, "source")}</div><div class="accent-line"></div>`,
  })}
</div></body></html>`;
}

/* ── S7: White House — hook variant ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-red { width: 1000px; height: 1000px; top: -300px; left: 50%; transform: translateX(-50%); background: radial-gradient(circle, rgba(239,68,68,0.18) 0%, transparent 60%); }
.s7 .big-text { text-align: center; font-size: 116px; font-weight: 900; color: var(--red); letter-spacing: 2px; line-height: 1.05; text-shadow: 0 0 60px rgba(239,68,68,0.5), 0 0 120px rgba(239,68,68,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards; opacity: 0; }
.s7 .divider { width: 400px; height: 2px; background: linear-gradient(90deg, transparent, rgba(239,68,68,0.5), transparent); margin: 28px auto; animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; }
.s7 .second-stat { text-align: center; font-size: 92px; font-weight: 900; color: var(--white); letter-spacing: 1px; line-height: 1.1; text-shadow: 0 0 50px rgba(255,255,255,0.25); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.2s forwards; opacity: 0; }
.s7 .glitch-flash { position: absolute; inset: 0; pointer-events: none; animation: glitchFlash 0.3s ease-out 0.4s; opacity: 0; }
@keyframes glitchFlash { 0% { opacity: 0; } 10% { opacity: 1; background: rgba(239,68,68,0.08); } 20% { opacity: 0; } 30% { opacity: 1; background: rgba(77,139,255,0.06); } 40% { opacity: 0; } 100% { opacity: 0; } }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="glitch-flash"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="big-text">${t(txt, "line1")}</div><div class="divider"></div><div class="second-stat">${t(txt, "line2")}</div>`,
  })}
</div></body></html>`;
}

/* ── S8: Teaser — Part 3 ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-red { top: 50%; left: 50%; transform: translate(-50%, -50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 60%); }
.s8 .big-text { text-align: center; font-size: 100px; font-weight: 900; color: var(--amber); letter-spacing: 4px; line-height: 1; text-shadow: 0 0 50px rgba(245,158,11,0.4), 0 0 100px rgba(245,158,11,0.2); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards; opacity: 0; }
.s8 .divider { width: 300px; height: 2px; background: linear-gradient(90deg, transparent, var(--amber), transparent); margin: 28px auto; animation: fadeIn 0.5s ease-out 0.8s forwards; opacity: 0; }
.s8 .teaser { text-align: center; font-size: 56px; font-weight: 800; color: var(--white); max-width: 820px; line-height: 1.25; animation: slideUp 0.5s ease-out 1.0s forwards; opacity: 0; }
.s8 .teaser .hl { color: var(--red); }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="big-text">${t(txt, "line1")}</div><div class="divider"></div><div class="teaser">${t(txt, "line2")}</div>`,
  })}
</div></body></html>`;
}

/* ── S9: CTA — standard end card (shared ctaScene) ── */
function scene9(scene, duration) {
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
};

/**
 * Generate scene HTML for a Distillation pt2 scene.
 * @param {object} scene - Scene object with id, texts, voiceover
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));
}
