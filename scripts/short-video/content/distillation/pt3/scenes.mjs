/**
 * Distillation pt3 visual scene templates — "The Fallout"
 * 9 scenes for the LLM distillation scandal video, part 3.
 * v3 (slot layout) — implemented 2026-08-08 (was a stub since
 * handoff-2026-08-05.md Task 3).
 *
 * Visual DNA: data-breach / espionage aesthetic (same family as pt1).
 *   - Red-dominant glow (scandal alert) with DeepSeek blue accents
 *   - Terminal-style data stream accent
 *   - Stamp-in animations for impact numbers
 *   - Amber for market data (stock crash)
 *
 * Migration to the slot layout system (spec: spec-video-layout-safe-zones.md):
 * - All scenes assemble content into fixed slots via sceneFrame() from
 *   lib/scene-layout.mjs: kickerTitle (220-400) / hero (400-950) /
 *   support (950-1150). No scene-level flex, no magic bottom padding.
 * - Contrast scene (S5) stacks VERTICALLY (A/B) — never side-by-side
 *   columns (the "landscape forced into portrait" fix).
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

/* ── S1: Hook — stock crash alert (shared hookScene, red tint) ── */
function scene1(scene, duration) {
  return hookScene(scene, duration, __dirname);
}

/* ── S2: Recap — part 1 → part 2 → part 3 ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-blue { top: -200px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s2 .prev { text-align: center; font-size: 38px; font-weight: 800; color: var(--sec); letter-spacing: 3px; animation: slideUp 0.4s ease-out 0.2s forwards; opacity: 0; }
.s2 .arrow-down { text-align: center; font-size: 44px; font-weight: 900; color: var(--amber); text-shadow: 0 0 20px rgba(245,158,11,0.4); animation: fadeIn 0.4s ease-out 0.7s forwards; opacity: 0; margin: 12px 0; }
.s2 .next { text-align: center; font-size: 46px; font-weight: 900; color: var(--white); letter-spacing: 2px; line-height: 1.2; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 1.0s forwards; opacity: 0; max-width: 820px; }
.s2 .next .hl { color: var(--blue); }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="prev">${t(txt, "line1")}</div><div class="arrow-down">↓</div><div class="next">${t(txt, "line2")}</div>`,
  })}
</div></body></html>`;
}

/* ── S3: MiniMax crash — timeline ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};
  const events = txt.events || [];
  const eventsHtml = events
    .map((e, i) => {
      const isLast = i === events.length - 1;
      const isBad = i === 2; // LOW (HK$186) — the crash low
      return `<div class="step${isBad ? " bad" : ""}" style="animation-delay: ${0.3 + i * 0.55}s;"><div class="step-num">${e.date || ""}</div><div class="step-text">${e.text || ""}</div>${isLast ? "" : '<div class="step-arrow">↓</div>'}</div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-red { top: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 60%); }
.s3 .title { text-align: center; font-size: 40px; font-weight: 900; color: var(--white); letter-spacing: 2px; animation: fadeIn 0.3s ease-out 0.1s forwards; opacity: 0; }
.s3 .title .hl { color: var(--red); }
.s3 .flow { display: flex; flex-direction: column; align-items: center; gap: 0; }
.s3 .step { display: flex; flex-direction: column; align-items: center; animation: stampIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
.s3 .step-num { font-size: 22px; font-weight: 800; color: var(--blue); letter-spacing: 3px; padding: 6px 20px; border: 2px solid rgba(77,139,255,0.3); border-radius: 8px; background: rgba(77,139,255,0.06); margin-bottom: 8px; }
.s3 .step-text { font-size: 40px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-align: center; }
.s3 .step.bad .step-text { color: var(--red); text-shadow: 0 0 30px rgba(239,68,68,0.4); }
.s3 .step-arrow { font-size: 30px; color: var(--muted); margin: 10px 0; animation: fadeIn 0.3s ease-out forwards; opacity: 0; }
.s3 .cost { text-align: center; font-size: 30px; font-weight: 700; color: var(--sec); animation: fadeIn 0.5s ease-out 2.4s forwards; opacity: 0; }
.s3 .cost .hl { color: var(--red); font-weight: 900; }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="title">${t(txt, "title")}</div>`,
    hero: `<div class="flow">${eventsHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S4: Moonshot win — stat reveal ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-amber { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 60%); border-radius: 50%; }
.s4 .big-number { text-align: center; font-size: 200px; font-weight: 900; color: var(--amber); letter-spacing: -8px; line-height: 0.95; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
.s4 .label { text-align: center; font-size: 38px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 16px; animation: slideUp 0.4s ease-out 0.8s forwards; opacity: 0; }
.s4 .subtext { text-align: center; font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 12px; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="big-number">${t(txt, "bigNumber")}</div><div class="label">${t(txt, "label")}</div><div class="subtext">${t(txt, "subtext")}</div>`,
  })}
</div></body></html>`;
}

/* ── S5: IPO drama — contrast (vertical A/B stack) ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};
  const left = txt.left || [];
  const right = txt.right || [];
  const leftTitle = left[0] || "";
  const rightTitle = right[0] || "";

  const chips = (items, delayBase) =>
    `<div class="chip-row">${items
      .map(
        (item, i) =>
          `<div class="chip" style="animation-delay: ${(delayBase + i * 0.2).toFixed(1)}s;">${item}</div>`,
      )
      .join("")}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-red { top: 50%; right: -200px; transform: translateY(-50%); width: 700px; height: 700px; background: radial-gradient(circle, rgba(239,68,68,0.1) 0%, transparent 60%); }
.s5 .vstack { display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; }
.s5 .card { width: 760px; border-radius: 16px; padding: 22px 30px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s5 .card.claim { background: rgba(77,139,255,0.06); border: 2px solid rgba(77,139,255,0.3); animation-delay: 0.2s; }
.s5 .card.denied { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.3); animation-delay: 0.7s; }
.s5 .card .col-title { font-size: 26px; font-weight: 800; letter-spacing: 3px; margin-bottom: 14px; }
.s5 .card.claim .col-title { color: var(--blue); }
.s5 .card.denied .col-title { color: var(--red); }
.s5 .chip-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.s5 .chip { padding: 12px 22px; border-radius: 10px; font-size: 26px; font-weight: 800; color: var(--white); background: rgba(255,255,255,0.03); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s5 .card.claim .chip { border: 1px solid rgba(77,139,255,0.35); }
.s5 .card.denied .chip { border: 1px solid rgba(239,68,68,0.35); color: var(--sec); }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="vstack"><div class="card claim"><div class="col-title">${leftTitle}</div>${chips(left.slice(1), 0.35)}</div><div class="card denied"><div class="col-title">${rightTitle}</div>${chips(right.slice(1), 0.85)}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S6: Quote — the playbook ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s6 .quote-mark { text-align: center; font-size: 160px; font-weight: 900; color: rgba(77,139,255,0.15); line-height: 0.8; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s6 .quote { font-size: 64px; font-weight: 900; color: var(--white); text-align: center; line-height: 1.25; max-width: 840px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
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

/* ── S7: Verification — data table (numeric bars) ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};
  const rows = txt.rows || [];
  const maxVal = Math.max(
    ...rows.map((r) => {
      const n = parseFloat(r.value);
      return isNaN(n) ? 0 : n;
    }),
    1,
  );
  const rowsHtml = rows
    .map((r, i) => {
      const num = parseFloat(r.value);
      const pct = isNaN(num) ? 30 : Math.max((num / maxVal) * 100, 12);
      const isBiggest = num === maxVal;
      const color = isBiggest ? "green" : ["blue", "amber", "red"][i - 1] || "blue";
      return `<div class="row ${isBiggest ? "biggest" : ""}" style="animation-delay: ${0.3 + i * 0.35}s;">
      <div class="label">${r.label || ""}</div>
      <div class="bar-track"><div class="bar-fill" style="width: ${pct}%; background: linear-gradient(90deg, var(--${color}), rgba(0,0,0,0)); animation-delay: ${0.5 + i * 0.35}s;"></div></div>
      <div class="value" style="color: var(--${color});">${r.value || ""}</div>
    </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-red { top: -150px; right: -200px; width: 800px; height: 800px; }
.s7 .title { text-align: center; font-size: 36px; font-weight: 800; color: var(--sec); letter-spacing: 2px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s7 .title .hl { color: var(--red); }
.s7 .table { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.s7 .row { display: flex; align-items: center; gap: 20px; animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s7 .row .label { width: 280px; font-size: 30px; font-weight: 800; color: var(--white); text-align: right; flex-shrink: 0; }
.s7 .row.biggest .label { color: var(--green); }
.s7 .bar-track { flex: 1; height: 40px; background: rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden; position: relative; }
.s7 .bar-fill { height: 100%; border-radius: 8px; animation: barGrow 0.6s cubic-bezier(0.16,1,0.3,1) forwards; width: 0; }
@keyframes barGrow { from { width: 0; } }
.s7 .row .value { width: 100px; font-size: 36px; font-weight: 900; text-align: left; flex-shrink: 0; }
.s7 .row.biggest .value { text-shadow: 0 0 20px rgba(52,211,153,0.4); }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="title">${t(txt, "title")}</div>`,
    hero: `<div class="table">${rowsHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S8: Closing — two-line verdict ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s8 .line1 { text-align: center; font-size: 76px; font-weight: 900; color: var(--white); letter-spacing: 2px; line-height: 1.1; text-shadow: 0 0 50px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 0.4s forwards; opacity: 0; }
.s8 .divider { width: 300px; height: 2px; background: linear-gradient(90deg, transparent, var(--red), transparent); margin: 28px auto; animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; }
.s8 .line2 { text-align: center; font-size: 66px; font-weight: 900; color: var(--red); letter-spacing: 2px; line-height: 1.15; text-shadow: 0 0 50px rgba(239,68,68,0.4); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.4s forwards; opacity: 0; }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="line1">${t(txt, "line1")}</div><div class="divider"></div><div class="line2">${t(txt, "line2")}</div>`,
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
 * Generate scene HTML for a Distillation pt3 scene.
 * @param {object} scene - Scene object with id, texts, voiceover
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));
}
