/**
 * Bytedance distillation scene templates — v3 (slot layout).
 * 9 scenes: hook, narrative, concept, data, quote, comparison, data, contrast, cta
 *
 * Migration to the slot layout system (spec: spec-video-layout-safe-zones.md):
 * - All scenes assemble content into fixed slots via sceneFrame() from
 *   lib/scene-layout.mjs: kickerTitle (220-400) / hero (400-1080) /
 *   support (1080-1340). No scene-level flex, no space-between, no magic
 *   bottom padding — the grid is anchored and DOM-verified.
 * - Scene 9 (CTA) delegates to the shared ctaScene end card (unchanged).
 * - scene-data.mjs copy is untouched; brandBar() on every scene.
 */

import { baseStyles, withWatermark } from "../../lib/base-styles.mjs";
import {
  templateCss,
  brandBar,
  stampBox,
  titleBlock,
  ctaScene,
} from "../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../lib/scene-layout.mjs";

// Safe text accessor
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — T3 Number Reveal ── */
function scene1(scene, duration) {
  const d = Math.max(duration, 5).toFixed(1);
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s1 .scan-sweep { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, rgba(77,139,255,0.8), transparent); box-shadow: 0 0 20px rgba(77,139,255,0.5); animation: scanSweep ${d}s linear infinite; z-index: 50; }
@keyframes scanSweep { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
.s1 .subject { font-size: 80px; font-weight: 900; color: var(--white); letter-spacing: 6px; text-shadow: 0 0 40px rgba(77,139,255,0.5); animation: fadeIn 0.4s ease-out 0.2s forwards; opacity: 0; }
.s1 .hook-text { font-size: 72px; font-weight: 900; color: var(--white); letter-spacing: 3px; line-height: 1.2; text-align: center; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 0.5s forwards; opacity: 0; }
.s1 .reveal-text { font-size: 84px; font-weight: 900; color: var(--blue); letter-spacing: 1px; line-height: 1.05; text-align: center; max-width: 100%; text-shadow: 0 0 80px rgba(77,139,255,0.6), 0 0 160px rgba(77,139,255,0.3); animation: stampIn 0.6s cubic-bezier(0.16,1,0.3,1) 1.5s forwards, glowPulse 2s ease-in-out 2.2s infinite; opacity: 0; }
.s1 .source { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.4s ease-out 2.1s forwards; opacity: 0; }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="scan-sweep"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="subject">${t(txt, "subject")}</div>`,
    hero: `<div class="hook-text">${t(txt, "hookText")}</div><div class="reveal-text">${t(txt, "revealText")}</div>`,
    support: `<div class="source">${t(txt, "source")}</div>`,
  })}
</div></body></html>`;
}

/* ── S2: Narrative — person introduction ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-blue { top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s2 .badge { background: rgba(77,139,255,0.15); border: 1px solid rgba(77,139,255,0.4); color: var(--blue); padding: 14px 40px; font-size: 28px; font-weight: 800; letter-spacing: 4px; border-radius: 8px; animation: slideDown 0.4s ease-out 0.1s forwards; opacity: 0; }
.s2 .person-block { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.s2 .person-name { font-size: 96px; font-weight: 900; color: var(--white); letter-spacing: 3px; animation: slideUp 0.5s ease-out 0.5s forwards; opacity: 0; text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s2 .person-role { font-size: 40px; font-weight: 700; color: var(--blue); letter-spacing: 4px; animation: slideUp 0.5s ease-out 0.7s forwards; opacity: 0; }
.s2 .meeting-info { display: flex; flex-direction: column; align-items: center; gap: 16px; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
.s2 .meeting-info .label { font-size: 36px; font-weight: 700; color: var(--sec); letter-spacing: 4px; }
.s2 .meeting-info .source { font-size: 28px; font-weight: 700; color: var(--white); letter-spacing: 3px; }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="badge">${t(txt, "badge")}</div>`,
    hero: `<div class="person-block"><div class="person-name">${t(txt, "person")}</div><div class="person-role">${t(txt, "role")}</div></div>`,
    support: `<div class="meeting-info"><div class="label">${t(txt, "meetingLabel")}</div><div class="source">${t(txt, "source")}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S3: Concept — distillation diagram ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.08) 0%, transparent 60%); }
.s3 .title { font-size: 68px; font-weight: 900; color: var(--white); letter-spacing: 6px; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: slideDown 0.4s ease-out 0.1s forwards; opacity: 0; }
.s3 .flow-row { display: flex; align-items: center; justify-content: center; gap: 50px; width: 100%; }
.s3 .card { width: 320px; border-radius: 24px; padding: 60px 36px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s3 .card.teacher { background: rgba(245,158,11,0.08); border: 2px solid rgba(245,158,11,0.3); animation-delay: 0.3s; box-shadow: 0 0 40px rgba(245,158,11,0.15); }
.s3 .card.student { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.4); animation-delay: 1.1s; }
.s3 .card .icon { font-size: 72px; margin-bottom: 24px; line-height: 1; }
.s3 .card.teacher .icon { color: var(--amber); }
.s3 .card.student .icon { color: var(--blue); }
.s3 .card .text { font-size: 28px; font-weight: 800; letter-spacing: 2px; line-height: 1.3; }
.s3 .card.teacher .text { color: var(--amber); }
.s3 .card.student .text { color: var(--blue); }
.s3 .arrow { font-size: 100px; font-weight: 900; color: var(--sec); animation: fadeIn 0.4s ease-out 0.7s forwards; opacity: 0; }
.s3 .bottom-info { display: flex; flex-direction: column; align-items: center; gap: 20px; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
.s3 .bottom-info .label { font-size: 36px; font-weight: 700; color: var(--white); letter-spacing: 3px; }
.s3 .bottom-info .note { font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 2px; }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="title">${t(txt, "title")}</div>`,
    hero: `<div class="flow-row"><div class="card teacher"><div class="icon">▣</div><div class="text">${t(txt, "teacher")}</div></div><div class="arrow">${t(txt, "arrow")}</div><div class="card student"><div class="icon">◇</div><div class="text">${t(txt, "student")}</div></div></div>`,
    support: `<div class="bottom-info"><div class="label">${t(txt, "label")}</div><div class="note">${t(txt, "note")}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S4: Data — three battles ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-amber { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 60%); border-radius: 50%; }
.s4 .number-row { display: flex; align-items: baseline; gap: 20px; }
.s4 .big-number { font-size: 360px; font-weight: 900; color: var(--amber); letter-spacing: -16px; line-height: 0.85; text-shadow: 0 0 80px rgba(245,158,11,0.5), 0 0 160px rgba(245,158,11,0.3); animation: stampIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.3s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
.s4 .label { font-size: 44px; font-weight: 800; color: var(--white); letter-spacing: 4px; animation: slideUp 0.4s ease-out 0.8s forwards; opacity: 0; }
.s4 .points { display: flex; flex-direction: column; gap: 24px; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s4 .points .point { font-size: 32px; font-weight: 700; color: var(--sec); letter-spacing: 2px; }
.s4 .points .point::before { content: "▸ "; color: var(--amber); font-weight: 900; }
.s4 .result-wrap { animation: fadeIn 0.5s ease-out 1.8s forwards; opacity: 0; }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="number-row"><div class="big-number">${t(txt, "number")}</div><div class="label">${t(txt, "label")}</div></div><div class="points"><div class="point">${t(txt, "point1")}</div><div class="point">${t(txt, "point2")}</div><div class="point">${t(txt, "point3")}</div></div>`,
    support: `<div class="result-wrap">${stampBox({ text: t(txt, "result"), color: "amber" })}</div>`,
  })}
</div></body></html>`;
}

/* ── S5: Quote — Zhang's stance ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s5 .quote-mark { font-size: 240px; font-weight: 900; color: rgba(77,139,255,0.15); line-height: 0.8; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s5 .quote { font-size: 56px; font-weight: 800; color: var(--white); text-align: center; line-height: 1.3; max-width: 860px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s5 .quote-meta { display: flex; flex-direction: column; align-items: center; gap: 12px; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s5 .speaker { font-size: 38px; font-weight: 800; color: var(--white); letter-spacing: 3px; }
.s5 .source { font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 3px; }
.s5 .accent-line { width: 240px; height: 3px; background: linear-gradient(90deg, transparent, var(--blue), transparent); animation: fadeIn 0.5s ease-out 1.7s forwards; opacity: 0; }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="quote-mark">"</div><div class="quote">${t(txt, "quote")}</div>`,
    support: `<div class="quote-meta"><div class="speaker">${t(txt, "speaker")}</div><div class="source">${t(txt, "source")}</div><div class="accent-line"></div></div>`,
  })}
</div></body></html>`;
}

/* ── S6: Comparison — Anthropic accusations (vertical stack) ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s6 .accused-stack { display: flex; flex-direction: column; gap: 28px; width: 100%; }
.s6 .accused-item { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-radius: 16px; padding: 34px 48px; background: rgba(239,68,68,0.08); border: 2px solid rgba(239,68,68,0.3); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s6 .accused-item.one { animation-delay: 0.3s; }
.s6 .accused-item.two { animation-delay: 0.6s; }
.s6 .accused-item.three { animation-delay: 0.9s; }
.s6 .accused-item .name { font-size: 44px; font-weight: 800; color: var(--white); letter-spacing: 1px; }
.s6 .accused-item .stat { font-size: 36px; font-weight: 900; color: var(--red); letter-spacing: -1px; }
.s6 .bytedance-box { width: 100%; border-radius: 20px; padding: 40px 48px; text-align: center; animation: scaleIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s6 .bytedance-box.clean { background: rgba(52,211,153,0.08); border: 2px solid rgba(52,211,153,0.4); box-shadow: 0 0 40px rgba(52,211,153,0.15); }
.s6 .bytedance-box .text { font-size: 48px; font-weight: 900; color: var(--green); letter-spacing: 3px; }
</style></head><body>
<div class="scene s6">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 44, color: "sec" }),
    hero: `<div class="accused-stack"><div class="accused-item one"><span class="name">${t(txt, "left")}</span><span class="stat">${t(txt, "leftStat")}</span></div><div class="accused-item two"><span class="name">${t(txt, "middle")}</span><span class="stat">${t(txt, "middleStat")}</span></div><div class="accused-item three"><span class="name">${t(txt, "right")}</span><span class="stat">${t(txt, "rightStat")}</span></div></div>`,
    support: `<div class="bytedance-box clean"><div class="text">${t(txt, "bytedance")}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S7: Data — compute gap (vertical A/VS/B stack) ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-red { position: absolute; top: -200px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 60%); }
.s7 .chip-stack { display: flex; flex-direction: column; align-items: center; gap: 20px; width: 100%; }
.s7 .chip-box { width: 640px; border-radius: 24px; padding: 32px 36px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s7 .chip-box.h20 { background: rgba(52,211,153,0.06); border: 2px solid rgba(52,211,153,0.3); animation-delay: 0.3s; }
.s7 .chip-box.b200 { background: rgba(239,68,68,0.08); border: 2px solid rgba(239,68,68,0.4); animation-delay: 1.0s; box-shadow: 0 0 40px rgba(239,68,68,0.15); }
.s7 .chip-box .chip-name { font-size: 92px; font-weight: 900; line-height: 1; margin-bottom: 12px; }
.s7 .chip-box.h20 .chip-name { color: var(--green); }
.s7 .chip-box.b200 .chip-name { color: var(--red); }
.s7 .chip-box .chip-label { font-size: 28px; font-weight: 700; letter-spacing: 3px; }
.s7 .chip-box.h20 .chip-label { color: var(--green); }
.s7 .chip-box.b200 .chip-label { color: var(--red); }
.s7 .vs { font-size: 56px; font-weight: 900; color: var(--muted); animation: fadeIn 0.4s ease-out 0.6s forwards; opacity: 0; }
.s7 .bottom-info { display: flex; flex-direction: column; align-items: center; gap: 18px; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
.s7 .bottom-info .source { font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 3px; }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="chip-stack"><div class="chip-box h20"><div class="chip-name">${t(txt, "chip")}</div><div class="chip-label">${t(txt, "chipLabel")}</div></div><div class="vs">${t(txt, "vsText")}</div><div class="chip-box b200"><div class="chip-name">${t(txt, "vs")}</div><div class="chip-label">${t(txt, "vsLabel")}</div></div></div>`,
    support: `<div class="bottom-info">${stampBox({ text: t(txt, "gap"), color: "red" })}<div class="source">${t(txt, "source")}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S8: Contrast — same day (vertical A/VS/B stack) ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s8 .vstack { display: flex; flex-direction: column; align-items: center; gap: 20px; width: 100%; }
.s8 .vcard { width: 680px; border-radius: 20px; padding: 36px 40px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s8 .vcard.left { background: rgba(245,158,11,0.08); border: 2px solid rgba(245,158,11,0.4); animation-delay: 0.3s; box-shadow: 0 0 40px rgba(245,158,11,0.15); }
.s8 .vcard.right { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.4); animation-delay: 1.0s; }
.s8 .vcard .company { font-size: 52px; font-weight: 900; letter-spacing: 2px; margin-bottom: 16px; line-height: 1.2; }
.s8 .vcard.left .company { color: var(--amber); }
.s8 .vcard.right .company { color: var(--blue); }
.s8 .vcard .action { font-size: 32px; font-weight: 800; letter-spacing: 2px; line-height: 1.3; color: var(--white); }
.s8 .vs-mid { width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; color: var(--muted); background: #050508; animation: fadeIn 0.4s ease-out 0.6s forwards; opacity: 0; }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 44, color: "sec" }),
    hero: `<div class="vstack"><div class="vcard left"><div class="company">${t(txt, "left")}</div><div class="action">${t(txt, "leftAction")}</div></div><div class="vs-mid">${t(txt, "vs")}</div><div class="vcard right"><div class="company">${t(txt, "right")}</div><div class="action">${t(txt, "rightAction")}</div></div></div>`,
  })}
</div></body></html>`;
}

/* ── S9: CTA — standard end card (shared ctaScene) ── */
function scene9(scene, duration) {
  return ctaScene(scene, duration);
}

// Scene router
export function generateScene(scene, duration) {
  switch (scene.id) {
    case 1:
      return withWatermark(scene1(scene, duration));
    case 2:
      return withWatermark(scene2(scene, duration));
    case 3:
      return withWatermark(scene3(scene, duration));
    case 4:
      return withWatermark(scene4(scene, duration));
    case 5:
      return withWatermark(scene5(scene, duration));
    case 6:
      return withWatermark(scene6(scene, duration));
    case 7:
      return withWatermark(scene7(scene, duration));
    case 8:
      return withWatermark(scene8(scene, duration));
    case 9:
      return withWatermark(scene9(scene, duration));
    default:
      throw new Error("Unknown scene: " + scene.id);
  }
}
