/**
 * Distillation pt1 visual scene templates — "The Crack"
 * 8 scenes for the LLM distillation scandal video. v3 (slot layout).
 *
 * Visual DNA: data-breach / espionage aesthetic.
 *   - Red-dominant glow (scandal alert) vs DeepSeek's blue
 *   - Glitch flash on hook scenes
 *   - Terminal-style data stream accent
 *   - Stamp-in animations for impact numbers
 *
 * Migration to the slot layout system (spec: spec-video-layout-safe-zones.md):
 * - All scenes assemble content into fixed slots via sceneFrame() from
 *   lib/scene-layout.mjs: kickerTitle (220-400) / hero (400-950) /
 *   support (950-1150). No scene-level flex, no magic bottom padding.
 * - Contrast scenes (S2/S6) stack VERTICALLY (A/VS/B) — never side-by-side
 *   columns (the "landscape forced into portrait" fix); the legacy .cols
 *   classes are gone. List items render as wrapping chips inside each card.
 * - Scene 8 (CTA) delegates to the shared ctaScene end card (unchanged).
 *
 * ALL on-screen copy comes from scene.texts (scene-data.mjs) — this file
 * must not contain business copy (drift-guarded by scene-drift.test.mjs).
 * Shared primitives come from lib/scene-templates.mjs; shared keyframes
 * from lib/base-styles.mjs (never redeclared here).
 */

import { baseStyles, withWatermark } from "../../../lib/base-styles.mjs";
import { templateCss, brandBar, ctaScene, hookScene } from "../../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../../lib/scene-layout.mjs";

// Safe text accessor — returns empty string for missing fields
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — data breach alert (shared hookScene, red tint) ── */
function scene1(scene, duration) {
  return hookScene(scene, duration);
}

/* ── S2: Contrast — surface vs deep theft (vertical A/VS/B stack) ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};
  const left = txt.left || [];
  const right = txt.right || [];

  const chips = (items, delayBase) =>
    `<div class="chip-row">${items
      .map(
        (item, i) =>
          `<div class="chip" style="animation-delay: ${(delayBase + i * 0.2).toFixed(1)}s;">${item}</div>`,
      )
      .join("")}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-red { top: 50%; left: -300px; transform: translateY(-50%); width: 700px; height: 700px; }
.s2 .title { font-size: 42px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s2 .title .hl { color: var(--red); }
.s2 .vstack { display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; }
.s2 .card { width: 760px; border-radius: 16px; padding: 24px 30px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s2 .card.left { background: rgba(239,68,68,0.05); border: 2px solid rgba(239,68,68,0.25); animation-delay: 0.2s; }
.s2 .card.right { background: rgba(245,158,11,0.05); border: 2px solid rgba(245,158,11,0.25); animation-delay: 0.7s; }
.s2 .card .col-title { font-size: 24px; font-weight: 800; letter-spacing: 3px; margin-bottom: 16px; }
.s2 .card.left .col-title { color: var(--red); }
.s2 .card.right .col-title { color: var(--amber); }
.s2 .chip-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; }
.s2 .chip { padding: 14px 24px; border-radius: 10px; font-size: 28px; font-weight: 800; color: var(--white); background: rgba(255,255,255,0.03); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s2 .card.left .chip { border: 1px solid rgba(239,68,68,0.35); text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.4); }
.s2 .card.right .chip { border: 1px solid rgba(245,158,11,0.35); color: var(--amber); }
.s2 .vs-mid { width: 60px; height: 60px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 21px; font-weight: 900; color: var(--muted); background: #0a0a14; animation: fadeIn 0.4s ease-out 0.5s forwards; opacity: 0; flex-shrink: 0; }
</style></head><body>
<div class="scene s2"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="title">${t(txt, "title")}</div>`,
    hero: `<div class="vstack"><div class="card left"><div class="col-title">${t(txt, "leftTitle")}</div>${chips(left, 0.35)}</div><div class="vs-mid">${t(txt, "vs")}</div><div class="card right"><div class="col-title">${t(txt, "rightTitle")}</div>${chips(right, 0.85)}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S3: Timeline — the cracking sequence ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};
  const events = txt.events || [];
  const eventsHtml = events
    .map((e, i) => {
      const isLast = i === events.length - 1;
      return `<div class="step" style="animation-delay: ${0.3 + i * 0.55}s;"><div class="step-num">${e.date || ""}</div><div class="step-text">${e.text || ""}</div>${isLast ? "" : '<div class="step-arrow">↓</div>'}</div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-red { top: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 60%); }
.s3 .title { font-size: 36px; font-weight: 800; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.3s ease-out 0.1s forwards; opacity: 0; }
.s3 .title .hl { color: var(--red); }
.s3 .flow { display: flex; flex-direction: column; align-items: center; gap: 0; }
.s3 .step { display: flex; flex-direction: column; align-items: center; animation: stampIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
.s3 .step-num { font-size: 22px; font-weight: 800; color: var(--blue); letter-spacing: 3px; padding: 6px 20px; border: 2px solid rgba(77,139,255,0.3); border-radius: 8px; background: rgba(77,139,255,0.06); margin-bottom: 8px; }
.s3 .step-text { font-size: 34px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-align: center; }
.s3 .step:nth-child(3) .step-num { color: var(--amber); border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.06); }
.s3 .step:nth-child(4) .step-num { color: var(--red); border-color: rgba(239,68,68,0.4); background: rgba(239,68,68,0.08); }
.s3 .step-arrow { font-size: 28px; color: var(--muted); margin: 12px 0; animation: fadeIn 0.3s ease-out forwards; opacity: 0; }
.s3 .cost { text-align: center; font-size: 28px; font-weight: 700; color: var(--sec); animation: fadeIn 0.5s ease-out 2.4s forwards; opacity: 0; }
.s3 .cost .hl { color: var(--red); font-weight: 900; }
</style></head><body>
<div class="scene s3"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="title">${t(txt, "title")}<span class="hl">${t(txt, "titleHighlight")}</span>${t(txt, "titleSuffix")}</div>`,
    hero: `<div class="flow">${eventsHtml}</div>`,
    support: `<div class="cost">${t(txt, "cost")}<span class="hl">${t(txt, "costHighlight")}</span></div>`,
  })}
</div></body></html>`;
}

/* ── S4: Data table — Anthropic's accusation ── */
function scene4(scene, duration) {
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
      const color = isBiggest ? "red" : ["blue", "purple", "amber"][i] || "blue";
      return `<div class="row ${isBiggest ? "biggest" : ""}" style="animation-delay: ${0.3 + i * 0.35}s;">
      <div class="label">${r.label || ""}</div>
      <div class="bar-track"><div class="bar-fill" style="width: ${pct}%; background: linear-gradient(90deg, var(--${color}), rgba(0,0,0,0)); animation-delay: ${0.5 + i * 0.35}s;"></div></div>
      <div class="value" style="color: var(--${color});">${r.value || ""}</div>
    </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-red { top: -150px; right: -200px; width: 800px; height: 800px; }
.s4 .title { font-size: 34px; font-weight: 800; color: var(--sec); letter-spacing: 2px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s4 .title .hl { color: var(--red); }
.s4 .table { display: flex; flex-direction: column; gap: 16px; width: 100%; }
.s4 .row { display: flex; align-items: center; gap: 20px; animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s4 .row .label { width: 280px; font-size: 30px; font-weight: 800; color: var(--white); text-align: right; flex-shrink: 0; }
.s4 .row.biggest .label { color: var(--red); }
.s4 .bar-track { flex: 1; height: 44px; background: rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden; position: relative; }
.s4 .bar-fill { height: 100%; border-radius: 8px; animation: barGrow 0.6s cubic-bezier(0.16,1,0.3,1) forwards; width: 0; }
@keyframes barGrow { from { width: 0; } }
.s4 .row .value { width: 110px; font-size: 38px; font-weight: 900; text-align: left; flex-shrink: 0; }
.s4 .row.biggest .value { text-shadow: 0 0 20px rgba(239,68,68,0.4); }
.s4 .footer { text-align: center; font-size: 24px; font-weight: 700; color: var(--muted); letter-spacing: 2px; animation: fadeIn 0.5s ease-out 2.2s forwards; opacity: 0; }
</style></head><body>
<div class="scene s4"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="title">${t(txt, "title")}</div>`,
    hero: `<div class="table">${rowsHtml}</div>`,
    support: `<div class="footer">${t(txt, "footer")}</div>`,
  })}
</div></body></html>`;
}

/* ── S5: Quote — crypto blog confirmation ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s5 .quote-mark { font-size: 160px; font-weight: 900; color: rgba(77,139,255,0.15); line-height: 0.8; margin-bottom: -30px; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s5 .quote { font-size: 46px; font-weight: 700; color: var(--white); text-align: center; line-height: 1.35; max-width: 800px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
.s5 .quote .hl { color: var(--blue); font-weight: 900; }
.s5 .source { margin-top: 36px; font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s5 .source .hl { color: var(--amber); }
.s5 .verified { display: inline-flex; align-items: center; justify-content: center; gap: 12px; padding: 14px 28px; border: 2px solid rgba(52,211,153,0.3); border-radius: 10px; background: rgba(52,211,153,0.06); animation: stampIn 0.4s ease-out 1.8s forwards; opacity: 0; }
.s5 .verified-wrap { text-align: center; }
.s5 .verified .check { color: var(--green); font-size: 28px; }
.s5 .verified .text { font-size: 24px; font-weight: 800; color: var(--green); letter-spacing: 2px; }
</style></head><body>
<div class="scene s5"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="quote-mark">"</div><div class="quote">${t(txt, "quote")}</div><div class="source">${t(txt, "source")}</div>`,
    support: `<div class="verified-wrap"><div class="verified"><span class="check">✓</span><span class="text">${t(txt, "verified")}</span></div></div>`,
  })}
</div></body></html>`;
}

/* ── S6: Contrast — named vs not named (vertical A/VS/B stack) ── */
function scene6(scene, duration) {
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
.s6 .title { font-size: 40px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s6 .vstack { display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; }
.s6 .card { width: 760px; border-radius: 16px; padding: 24px 30px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s6 .card.left { background: rgba(239,68,68,0.05); border: 2px solid rgba(239,68,68,0.25); animation-delay: 0.2s; }
.s6 .card.right { background: rgba(245,158,11,0.05); border: 2px solid rgba(245,158,11,0.25); animation-delay: 0.6s; }
.s6 .card .col-title { font-size: 24px; font-weight: 800; letter-spacing: 3px; margin-bottom: 16px; }
.s6 .card.left .col-title { color: var(--red); }
.s6 .card.right .col-title { color: var(--amber); }
.s6 .chip-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; }
.s6 .chip { padding: 14px 24px; border-radius: 10px; font-size: 28px; font-weight: 800; background: rgba(255,255,255,0.03); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s6 .card.left .chip { border: 1px solid rgba(239,68,68,0.35); color: var(--white); }
.s6 .card.right .chip { border: 1px solid rgba(245,158,11,0.3); color: var(--sec); }
.s6 .vs-mid { width: 60px; height: 60px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 21px; font-weight: 900; color: var(--muted); background: #0a0a14; animation: fadeIn 0.4s ease-out 0.45s forwards; opacity: 0; flex-shrink: 0; }
.s6 .note { text-align: center; font-size: 26px; font-style: italic; color: var(--sec); animation: fadeIn 0.5s ease-out 1.8s forwards; opacity: 0; }
.s6 .note .hl { color: var(--white); font-style: normal; font-weight: 700; }
</style></head><body>
<div class="scene s6"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="title">${t(txt, "title")}</div>`,
    hero: `<div class="vstack"><div class="card left"><div class="col-title">${leftTitle}</div>${chips(left.slice(1), 0.35)}</div><div class="vs-mid">${t(txt, "vs")}</div><div class="card right"><div class="col-title">${rightTitle}</div>${chips(right.slice(1), 0.75)}</div></div>`,
    support: `<div class="note">${t(txt, "note")}<span class="hl">${t(txt, "noteHighlight")}</span></div>`,
  })}
</div></body></html>`;
}

/* ── S7: Teaser — Part 2 ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-red { top: 50%; left: 50%; transform: translate(-50%, -50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 60%); }
.s7 .part-label { font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 6px; animation: fadeIn 0.4s ease-out 0.1s forwards; opacity: 0; }
.s7 .big-text { font-size: 84px; font-weight: 900; color: var(--amber); letter-spacing: 4px; text-align: center; text-shadow: 0 0 50px rgba(245,158,11,0.4), 0 0 100px rgba(245,158,11,0.2); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards; opacity: 0; }
.s7 .divider { width: 300px; height: 2px; background: linear-gradient(90deg, transparent, var(--amber), transparent); margin: 24px auto; animation: fadeIn 0.5s ease-out 0.8s forwards; opacity: 0; }
.s7 .teaser { font-size: 38px; font-weight: 800; color: var(--white); text-align: center; max-width: 800px; line-height: 1.3; animation: slideUp 0.5s ease-out 1.0s forwards; opacity: 0; }
.s7 .teaser .hl { color: var(--red); }
.s7 .countdown { font-size: 24px; font-weight: 700; color: var(--muted); letter-spacing: 4px; text-align: center; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="part-label">${t(txt, "label")}</div>`,
    hero: `<div class="big-text">${t(txt, "line1")}</div><div class="divider"></div><div class="teaser">${t(txt, "line2")}</div>`,
    support: `<div class="countdown">${t(txt, "countdown")}</div>`,
  })}
</div></body></html>`;
}

/* ── S8: CTA — standard end card (shared ctaScene) ── */
function scene8(scene, duration) {
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
};

/**
 * Generate scene HTML for a Distillation pt1 scene.
 * @param {object} scene - Scene object with id, texts, voiceover
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));
}
