/**
 * DeepSeek visual scene templates — v3 (slot layout).
 * 12 scenes for the DeepSeek $1.4B funding round video.
 *
 * Migration to the slot layout system (spec: spec-video-layout-safe-zones.md):
 * - All scenes assemble content into fixed slots via sceneFrame() from
 *   lib/scene-layout.mjs: kickerTitle (220-400) / hero (400-950) /
 *   support (950-1150). No scene-level flex, no space-between, no magic
 *   bottom padding — the grid is anchored and DOM-verified.
 * - Comparison/contrast scenes (S3/S5/S10) stack VERTICALLY — never
 *   side-by-side columns (the "landscape forced into portrait" fix).
 * - Scene 12 (CTA) delegates to the shared ctaScene end card (unchanged).
 * - scene-data.mjs copy is untouched; brandBar() on every scene.
 */

import { readFileSync } from "fs";
import { baseStyles, withWatermark } from "../../lib/base-styles.mjs";
import {
  templateCss,
  brandBar,
  breakingBadge,
  titleBlock,
  ctaScene,
} from "../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../lib/scene-layout.mjs";

// DeepSeek company logo
const DEEPSEEK_LOGO_SVG = readFileSync(
  new URL("../../assets/logos/deepseek.svg", import.meta.url),
  "utf8",
)
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!--[\s\S]*?-->/g, "");

// Safe text accessor — returns empty string for missing fields
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — BREAKING badge + number reveal + stats ── */
function scene1(scene, duration) {
  const d = Math.max(duration, 5).toFixed(1);
  const txt = scene.texts || {};
  const stats = txt.stats || [];
  const statsHtml = stats
    .map(
      (s, i) =>
        `<div class="stat-card" style="animation-delay: ${0.4 + i * 0.2}s;"><div class="stat-num">${s.num}${s.unit ? `<span class="unit">${s.unit}</span>` : ""}</div><div class="stat-label">${s.label || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s1 .scan-sweep { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, rgba(77,139,255,0.8), transparent); box-shadow: 0 0 20px rgba(77,139,255,0.5); animation: scanSweep ${d}s linear infinite; z-index: 50; }
@keyframes scanSweep { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
.s1 .subject-row { display: flex; align-items: center; justify-content: center; gap: 20px; animation: slideUp 0.4s ease-out 0.3s forwards; opacity: 0; }
.s1 .subject-row .ds-logo { width: 64px; height: 64px; } .s1 .subject-row .ds-logo svg { width: 100%; height: 100%; }
.s1 .subject-row .subject-text { font-size: 56px; font-weight: 800; color: var(--sec); letter-spacing: 4px; }
.s1 .headline { text-align: center; }
.s1 .big-number { font-size: 260px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: scaleIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.5s forwards, numberPulse 2s ease-in-out 1.2s infinite; opacity: 0; }
.s1 .subtitle { font-size: 52px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 12px; animation: slideUp 0.5s ease-out 0.8s forwards; opacity: 0; } .s1 .subtitle .hl { color: var(--red); }
.s1 .stats-grid { display: flex; gap: 20px; justify-content: center; }
.s1 .stat-card { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 24px 20px; text-align: center; animation: slideUp 0.5s ease-out forwards; opacity: 0; }
.s1 .stat-card:nth-child(1) { border-top: 4px solid var(--amber); } .s1 .stat-card:nth-child(2) { border-top: 4px solid var(--blue); }
.s1 .stat-card .stat-num { font-size: 56px; font-weight: 900; line-height: 1; } .s1 .stat-card .stat-num .unit { font-size: 28px; font-weight: 700; }
.s1 .stat-card:nth-child(1) .stat-num { color: var(--amber); } .s1 .stat-card:nth-child(2) .stat-num { color: var(--blue); }
.s1 .stat-card .stat-label { font-size: 20px; font-weight: 700; color: var(--sec); letter-spacing: 1px; margin-top: 10px; }
.s1 .glitch { position: absolute; inset: 0; pointer-events: none; animation: glitchFlash 0.4s ease-out 0.8s; opacity: 0; }
@keyframes glitchFlash { 0% { opacity: 0; } 10% { opacity: 1; background: rgba(239,68,68,0.1); transform: translateX(-3px); } 20% { opacity: 0; transform: translateX(3px); } 30% { opacity: 1; background: rgba(77,139,255,0.08); } 40% { opacity: 0; } 100% { opacity: 0; } }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="scan-sweep"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: t(txt, "badge") ? breakingBadge(txt.badge) : "",
    hero: `<div class="subject-row">${txt.subjectLogo ? `<div class="ds-logo">${DEEPSEEK_LOGO_SVG}</div>` : ""}<div class="subject-text">${t(txt, "subject")}</div></div><div class="headline">${txt.bigNumber ? `<div class="big-number">${txt.bigNumber}</div>` : ""}${txt.subtitle ? `<div class="subtitle">${txt.subtitle} ${txt.subtitleHighlight ? `<span class="hl">${txt.subtitleHighlight}</span>` : ""}</div>` : ""}</div>`,
    support: `<div class="stats-grid">${statsHtml}</div>`,
  })}
  <div class="glitch"></div>
</div></body></html>`;
}

/* ── S2: Timeline ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};
  const events = txt.events || [];
  const eventsHtml = events
    .map(
      (e, i) =>
        `<div class="event" style="animation-delay: ${0.2 + i * 0.6}s;"><div class="date">${e.date || ""}</div><div class="text">${e.text || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; }
.s2 .timeline { position: relative; padding-left: 60px; width: 100%; }
.s2 .timeline::before { content: ''; position: absolute; left: 20px; top: 20px; bottom: 20px; width: 3px; background: linear-gradient(180deg, var(--blue), var(--purple), var(--red)); }
.s2 .event { margin-bottom: 30px; position: relative; animation: slideLeft 0.5s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
.s2 .event::before { content: ''; position: absolute; left: -48px; top: 8px; width: 18px; height: 18px; border-radius: 50%; border: 3px solid var(--blue); background: #0a0a14; }
.s2 .event:nth-child(2)::before { border-color: var(--purple); } .s2 .event:nth-child(3)::before { border-color: var(--amber); } .s2 .event:nth-child(4)::before { border-color: var(--red); background: var(--red); }
.s2 .event .date { font-size: 26px; font-weight: 800; color: var(--blue); letter-spacing: 2px; } .s2 .event:nth-child(2) .date { color: var(--purple); } .s2 .event:nth-child(3) .date { color: var(--amber); } .s2 .event:nth-child(4) .date { color: var(--red); }
.s2 .event .text { font-size: 34px; font-weight: 700; color: var(--white); margin-top: 6px; line-height: 1.2; }
</style></head><body>
<div class="scene s2"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title")),
    hero: `<div class="timeline">${eventsHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S3: Contrast — before/after (vertical stack) ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};
  const left = txt.left || [];
  const right = txt.right || [];
  const leftHtml = left
    .map(
      (item, i) => `<div class="item" style="animation-delay: ${0.2 + i * 0.15}s;">${item}</div>`,
    )
    .join("");
  const rightHtml = right
    .map(
      (item, i) => `<div class="item" style="animation-delay: ${0.9 + i * 0.15}s;">${item}</div>`,
    )
    .join("");
  const quoteHtml = t(txt, "quote")
    ? `<div class="quote">"${txt.quote.replace(txt.quoteKeyword || "\0", `<span class="keyword">${txt.quoteKeyword}</span>`)}"</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-blue { bottom: -200px; right: -200px; width: 800px; height: 800px; }
.s3 .vline { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.s3 .col-title { font-size: 26px; font-weight: 700; letter-spacing: 3px; padding-top: 14px; animation: fadeIn 0.3s ease-out 0.1s forwards; opacity: 0; }
.s3 .col-title.left { color: var(--red); } .s3 .col-title.right { color: var(--green); }
.s3 .item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 14px 20px; border-radius: 10px; font-size: 30px; font-weight: 800; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s3 .item.left { border-left: 4px solid var(--red); text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.4); }
.s3 .item.right { border-left: 4px solid var(--green); }
.s3 .quote { background: rgba(77,139,255,0.06); border-left: 5px solid var(--blue); border-radius: 0 12px 12px 0; padding: 20px 28px; font-size: 30px; font-style: italic; color: var(--sec); line-height: 1.4; animation: slideUp 0.5s ease-out 1.8s forwards; opacity: 0; } .s3 .quote .keyword { color: var(--blue); font-style: normal; font-weight: 700; }
</style></head><body>
<div class="scene s3"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 44 }),
    hero: `<div class="vline"><div class="col-title left">${t(txt, "leftTitle")}</div>${leftHtml}<div class="col-title right">${t(txt, "rightTitle")}</div>${rightHtml}</div>`,
    support: quoteHtml,
  })}
</div></body></html>`;
}

/* ── S4: Price comparison ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};
  const bars = txt.bars || [];
  const stats = txt.stats || [];
  const barsHtml = bars
    .map(
      (b, i) =>
        `<div class="bar-row" style="animation-delay: ${0.2 + i * 0.4}s;"><div class="bar-label" style="color: var(--${b.color});">${b.label || ""}</div><div class="bar-track"><div class="bar-fill" style="animation-delay: ${0.4 + i * 0.4}s; background: linear-gradient(90deg, var(--${b.color}), var(--${b.color})); --target: ${b.target || "50%"};">${b.value || ""}</div></div></div>`,
    )
    .join("");
  const statsHtml = stats
    .map(
      (s, i) =>
        `<div class="stat"><div class="num" style="color: var(--${["blue", "green", "purple"][i] || "blue"});">${s.num || ""}</div><div class="lbl">${s.label || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; }
.s4 .bars { display: flex; flex-direction: column; gap: 22px; width: 100%; }
.s4 .bar-row { display: flex; align-items: center; gap: 24px; animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s4 .bar-label { width: 220px; font-size: 32px; font-weight: 800; text-align: right; } .s4 .bar-track { flex: 1; height: 60px; background: rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden; position: relative; } .s4 .bar-fill { height: 100%; border-radius: 8px; display: flex; align-items: center; padding: 0 20px; font-size: 30px; font-weight: 900; color: white; animation: barGrow 0.8s cubic-bezier(0.16,1,0.3,1) forwards; width: 0; }
@keyframes barGrow { from { width: 0; } to { width: var(--target); } }
.s4 .ratio-box { display: flex; gap: 40px; justify-content: center; animation: scaleIn 0.5s ease-out 1.6s forwards; opacity: 0; } .s4 .stat { text-align: center; } .s4 .stat .num { font-size: 56px; font-weight: 900; line-height: 1; } .s4 .stat .lbl { font-size: 20px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
.s4 .note { margin-top: 26px; text-align: center; font-size: 28px; font-style: italic; color: var(--sec); animation: fadeIn 0.5s ease-out 2.2s forwards; opacity: 0; } .s4 .note .hl { color: var(--red); font-weight: 700; font-style: normal; }
</style></head><body>
<div class="scene s4"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 44 }),
    hero: `<div class="bars">${barsHtml}</div>`,
    support: `<div class="ratio-box">${statsHtml}</div>${t(txt, "note") ? `<div class="note">${txt.note} <span class="hl">${t(txt, "noteHighlight")}</span></div>` : ""}`,
  })}
</div></body></html>`;
}

/* ── S5: Open source — stance cards (vertical stack) ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};
  const cards = txt.cards || [];
  const points = txt.points || [];
  const cardsHtml = cards
    .map(
      (c, i) =>
        `<div class="card ${i === 0 ? "top" : "bottom"} ${c.color}" style="animation-delay: ${0.2 + i * 0.4}s;"><div class="icon">${c.icon || ""}</div><div class="name">${c.name || ""}</div><div class="desc">${c.desc || ""}</div></div>`,
    )
    .join("");
  const pointsHtml = points
    .map(
      (p, i) =>
        `<div class="point" style="animation-delay: ${1.2 + i * 0.25}s;"><span class="check">✓</span> ${p}</div>`,
    )
    .join("");
  const quoteHtml = t(txt, "quote")
    ? `<div class="quote">"${txt.quote.replace(txt.quoteHighlight || "\0", `<span class="hl">${txt.quoteHighlight}</span>`)}"</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-blue { bottom: -200px; right: -200px; width: 900px; height: 900px; }
.s5 .vstack { display: flex; flex-direction: column; gap: 18px; width: 100%; }
.s5 .card { border-radius: 16px; padding: 24px 28px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; } .s5 .card .icon { font-size: 44px; margin-bottom: 8px; } .s5 .card .name { font-size: 30px; font-weight: 800; letter-spacing: 1px; margin-bottom: 8px; } .s5 .card .desc { font-size: 24px; color: var(--sec); line-height: 1.3; }
.s5 .card.blue { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.3); } .s5 .card.red { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); } .s5 .card.blue .name { color: var(--blue); } .s5 .card.red .name { color: var(--red); }
.s5 .points { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; } .s5 .point { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 700; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; } .s5 .point .check { color: var(--green); font-size: 32px; }
.s5 .quote { background: rgba(245,158,11,0.06); border-left: 5px solid var(--amber); border-radius: 0 12px 12px 0; padding: 18px 26px; font-size: 28px; font-style: italic; color: var(--sec); line-height: 1.4; animation: slideUp 0.5s ease-out 2s forwards; opacity: 0; } .s5 .quote .hl { color: var(--amber); font-style: normal; font-weight: 700; }
</style></head><body>
<div class="scene s5"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), {
      center: true,
      fontSize: 48,
      highlight: t(txt, "titleHighlight"),
      hlColor: "green",
    }),
    hero: `<div class="vstack"><div class="cards">${cardsHtml}</div><div class="points">${pointsHtml}</div></div>`,
    support: quoteHtml,
  })}
</div></body></html>`;
}

/* ── S6: Deployment cost ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};
  const factors = txt.factors || [];
  const factorsHtml = factors
    .map(
      (f, i) =>
        `<div class="factor" style="animation-delay: ${0.5 + i * 0.4}s; border-left: 5px solid var(--${["cyan", "blue", "purple"][i] || "blue"});"><div class="num" style="color: var(--${["cyan", "blue", "purple"][i] || "blue"});">${f.num || ""}</div><div class="text">${f.text || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; }
.s6 .tilelang-box { background: rgba(34,211,238,0.06); border: 2px solid rgba(34,211,238,0.25); border-radius: 16px; padding: 24px 32px; text-align: center; margin-bottom: 24px; animation: scaleIn 0.5s ease-out 0.2s forwards; opacity: 0; } .s6 .tilelang-box .name { font-size: 48px; font-weight: 900; color: var(--cyan); letter-spacing: 1px; } .s6 .tilelang-box .desc { font-size: 26px; color: var(--sec); margin-top: 6px; }
.s6 .factors { display: flex; flex-direction: column; gap: 18px; } .s6 .factor { display: flex; align-items: flex-start; gap: 24px; padding: 22px 28px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s6 .factor .num { font-size: 52px; font-weight: 900; line-height: 0.9; width: 60px; flex-shrink: 0; } .s6 .factor .text { font-size: 28px; font-weight: 700; color: var(--white); line-height: 1.3; padding-top: 6px; }
.s6 .verdict { text-align: center; font-size: 44px; font-weight: 900; color: var(--red); letter-spacing: 2px; text-shadow: 0 0 30px rgba(239,68,68,0.3); animation: stampIn 0.5s ease-out 2s forwards; opacity: 0; }
</style></head><body>
<div class="scene s6"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), {
      center: true,
      fontSize: 48,
      highlight: t(txt, "titleHighlight"),
      hlColor: "cyan",
    }),
    hero: `${t(txt, "tilelang") ? `<div class="tilelang-box"><div class="name">${txt.tilelang}</div><div class="desc">${t(txt, "tilelangDesc")}</div></div>` : ""}<div class="factors">${factorsHtml}</div>`,
    support: t(txt, "verdict") ? `<div class="verdict">${txt.verdict}</div>` : "",
  })}
</div></body></html>`;
}

/* ── S7: AGI staircase ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};
  const steps = txt.steps || [];
  const stepsHtml = steps
    .map(
      (s, i) =>
        `<div class="step ${s.status}" style="animation-delay: ${0.2 + i * 0.25}s;"><span class="num">${s.num || ""}</span><span class="text">${s.text || ""}</span>${s.status === "done" ? '<span class="badge">DONE</span>' : s.status === "current" ? '<span class="badge">NOW</span>' : s.status === "next" ? '<span class="badge">NEXT</span>' : ""}</div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-blue { top: -200px; left: -200px; width: 800px; height: 800px; }
.s7 .stairs { display: flex; flex-direction: column; gap: 10px; width: 100%; } .s7 .step { display: flex; align-items: center; gap: 20px; padding: 16px 26px; border-radius: 10px; animation: slideLeft 0.4s ease-out forwards; opacity: 0; } .s7 .step.done { background: rgba(52,211,153,0.08); border-left: 5px solid var(--green); } .s7 .step.current { background: rgba(77,139,255,0.1); border-left: 5px solid var(--blue); box-shadow: 0 0 30px rgba(77,139,255,0.15); } .s7 .step.next { background: rgba(245,158,11,0.08); border-left: 5px solid var(--amber); } .s7 .step.future { background: rgba(255,255,255,0.03); border-left: 5px solid var(--muted); } .s7 .step .num { font-size: 32px; font-weight: 900; width: 40px; } .s7 .step.done .num { color: var(--green); } .s7 .step.current .num { color: var(--blue); } .s7 .step.next .num { color: var(--amber); } .s7 .step.future .num { color: var(--muted); } .s7 .step .text { font-size: 28px; font-weight: 700; color: var(--white); } .s7 .step .badge { margin-left: auto; font-size: 20px; font-weight: 800; padding: 4px 12px; border-radius: 6px; } .s7 .step.done .badge { background: rgba(52,211,153,0.2); color: var(--green); } .s7 .step.current .badge { background: rgba(77,139,255,0.2); color: var(--blue); } .s7 .step.next .badge { background: rgba(245,158,11,0.2); color: var(--amber); }
.s7 .arrow { text-align: center; margin-top: 30px; font-size: 32px; font-weight: 800; color: var(--amber); animation: fadeIn 0.5s ease-out 1.8s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(
      `${t(txt, "title")}${t(txt, "titleSuffix") ? ` ${t(txt, "titleSuffix")}` : ""}`,
      { center: true, fontSize: 44, highlight: t(txt, "titleHighlight"), hlColor: "blue" },
    ),
    hero: `<div class="stairs">${stepsHtml}</div>`,
    support: t(txt, "arrow") ? `<div class="arrow">${txt.arrow}</div>` : "",
  })}
</div></body></html>`;
}

/* ── S8: Talent drain ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};
  const departures = txt.departures || [];
  const departuresHtml = departures
    .map(
      (d, i) =>
        `<div class="flow-row" style="animation-delay: ${0.7 + i * 0.25}s;"><span class="person">${d.name || ""}</span><span class="arrow">→</span><span class="company" style="color: var(--${d.color || "blue"});">${d.to || ""}</span></div>`,
    )
    .join("");
  const quoteHtml = t(txt, "quote")
    ? `<div class="quote">"${txt.quote.replace(txt.quoteHighlight || "\0", `<span class="hl">${txt.quoteHighlight}</span>`)}"</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-blue { bottom: -200px; right: -200px; width: 800px; height: 800px; }
.s8 .quote { background: rgba(239,68,68,0.06); border-left: 5px solid var(--red); border-radius: 0 12px 12px 0; padding: 20px 28px; font-size: 30px; font-weight: 700; color: var(--white); line-height: 1.4; margin-bottom: 22px; animation: slideUp 0.5s ease-out 0.2s forwards; opacity: 0; } .s8 .quote .hl { color: var(--red); }
.s8 .departures-title { font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-bottom: 16px; animation: fadeIn 0.4s ease-out 0.6s forwards; opacity: 0; }
.s8 .flow { display: flex; flex-direction: column; gap: 14px; } .s8 .flow-row { display: flex; align-items: center; gap: 20px; padding: 18px 24px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); animation: slideLeft 0.4s ease-out forwards; opacity: 0; } .s8 .flow-row .person { font-size: 32px; font-weight: 800; color: var(--white); width: 360px; } .s8 .flow-row .arrow { font-size: 32px; color: var(--muted); } .s8 .flow-row .company { font-size: 32px; font-weight: 800; }
.s8 .conclusion { text-align: center; font-size: 32px; font-weight: 700; color: var(--green); animation: fadeIn 0.5s ease-out 1.8s forwards; opacity: 0; }
</style></head><body>
<div class="scene s8"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), {
      center: true,
      fontSize: 46,
      highlight: t(txt, "titleHighlight"),
      hlColor: "red",
    }),
    hero: `${quoteHtml}${t(txt, "departuresTitle") ? `<div class="departures-title">${txt.departuresTitle}</div>` : ""}<div class="flow">${departuresHtml}</div>`,
    support: t(txt, "conclusion") ? `<div class="conclusion">${txt.conclusion}</div>` : "",
  })}
</div></body></html>`;
}

/* ── S9: Compute gap ── */
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s9 .glow-blue { bottom: -200px; left: -200px; width: 800px; height: 800px; }
.s9 .gap-row { display: flex; align-items: flex-end; justify-content: center; gap: 60px; margin-bottom: 20px; } .s9 .gpu-col { text-align: center; } .s9 .gpu-bar { width: 180px; border-radius: 12px 12px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 24px; font-size: 40px; font-weight: 900; color: white; animation: growUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards; height: 0; } .s9 .gpu-bar.have { background: linear-gradient(180deg, var(--blue), rgba(77,139,255,0.3)); animation-delay: 0.2s; --target-h: 150px; } .s9 .gpu-bar.need { background: linear-gradient(180deg, var(--red), rgba(239,68,68,0.3)); animation-delay: 0.5s; --target-h: 380px; }
@keyframes growUp { to { height: var(--target-h); } }
.s9 .gpu-num { font-size: 64px; font-weight: 900; line-height: 1; margin-bottom: 8px; animation: scaleIn 0.5s ease-out forwards; opacity: 0; } .s9 .have-num { color: var(--blue); animation-delay: 0.15s; } .s9 .need-num { color: var(--red); animation-delay: 0.45s; } .s9 .gpu-label { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 2px; } .s9 .vs-text { font-size: 36px; font-weight: 900; color: var(--muted); align-self: center; margin-bottom: 110px; }
.s9 .reserve-box { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 16px 28px; text-align: center; margin-bottom: 10px; animation: stampIn 0.5s ease-out 1.2s forwards; opacity: 0; display: inline-block; } .s9 .reserve-box .amount { font-size: 44px; font-weight: 900; color: var(--red); } .s9 .reserve-box .label { font-size: 20px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 2px; }
.s9 .reserve-wrap { text-align: center; }
.s9 .verdict { text-align: center; font-size: 30px; font-weight: 900; color: var(--white); animation: fadeIn 0.5s ease-out 1.7s forwards; opacity: 0; } .s9 .verdict .hl { color: var(--red); }
</style></head><body>
<div class="scene s9"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(
      `${t(txt, "title")}${t(txt, "titleSuffix") ? ` ${t(txt, "titleSuffix")}` : ""}`,
      { center: true, fontSize: 46, highlight: t(txt, "titleHighlight"), hlColor: "red" },
    ),
    hero: `<div class="gap-row"><div class="gpu-col"><div class="gpu-num have-num">${t(txt, "have")}</div><div class="gpu-bar have">${t(txt, "haveFill")}</div><div class="gpu-label">${t(txt, "haveLabel")}</div></div><div class="vs-text">${t(txt, "vsText")}</div><div class="gpu-col"><div class="gpu-num need-num">${t(txt, "need")}</div><div class="gpu-bar need">${t(txt, "needFill")}</div><div class="gpu-label">${t(txt, "needLabel")}</div></div></div>`,
    support: `<div class="reserve-wrap">${t(txt, "reserve") ? `<div class="reserve-box"><div class="amount">${txt.reserve}</div><div class="label">${t(txt, "reserveLabel")}</div></div>` : ""}</div>${t(txt, "verdict") ? `<div class="verdict">${txt.verdict} <span class="hl">${t(txt, "verdictHighlight")}</span></div>` : ""}`,
  })}
</div></body></html>`;
}

/* ── S10: Huawei GPU ecosystem — versus (vertical stack) ── */
function scene10(scene, duration) {
  const txt = scene.texts || {};
  const stats = txt.stats || [];
  const statsHtml = stats
    .map(
      (s, i) =>
        `<div class="stat-box" style="animation-delay: ${0.9 + i * 0.3}s;"><div class="num" style="color: var(--${["amber", "purple"][i] || "blue"});">${s.num || ""}</div><div class="lbl">${s.label || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s10 .glow-blue { bottom: -200px; right: -200px; width: 800px; height: 800px; }
.s10 .vstack { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; }
.s10 .chip-card { width: 640px; border-radius: 16px; padding: 22px 32px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; } .s10 .chip-card.huawei { background: rgba(239,68,68,0.08); border: 2px solid rgba(239,68,68,0.3); animation-delay: 0.2s; } .s10 .chip-card.nvidia { background: rgba(52,211,153,0.06); border: 2px solid rgba(52,211,153,0.2); animation-delay: 0.6s; } .s10 .chip-card .chip-name { font-size: 52px; font-weight: 900; line-height: 1; } .s10 .chip-card.huawei .chip-name { color: var(--red); } .s10 .chip-card.nvidia .chip-name { color: var(--green); } .s10 .chip-card .chip-label { font-size: 22px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; } .s10 .chip-card .chip-match { font-size: 20px; color: var(--white); margin-top: 8px; font-weight: 600; }
.s10 .vs-mid { width: 64px; height: 64px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 900; color: var(--muted); background: #0a0a14; animation: fadeIn 0.4s ease-out 0.4s forwards; opacity: 0; flex-shrink: 0; }
.s10 .stats-row { display: flex; gap: 40px; justify-content: center; margin-top: 20px; } .s10 .stat-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 22px 34px; text-align: center; animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s10 .stat-box .num { font-size: 52px; font-weight: 900; line-height: 1; } .s10 .stat-box .lbl { font-size: 20px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
.s10 .prediction { display: inline-block; background: rgba(52,211,153,0.06); border: 2px solid rgba(52,211,153,0.2); border-radius: 12px; padding: 20px 32px; text-align: center; animation: stampIn 0.5s ease-out 1.6s forwards; opacity: 0; } .s10 .prediction .text { font-size: 32px; font-weight: 900; color: var(--green); letter-spacing: 1px; } .s10 .prediction .sub { font-size: 22px; color: var(--sec); margin-top: 6px; }
.s10 .prediction-wrap { text-align: center; }
</style></head><body>
<div class="scene s10"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), {
      center: true,
      fontSize: 46,
      highlight: t(txt, "titleHighlight"),
      hlColor: "red",
    }),
    hero: `<div class="vstack"><div class="chip-card huawei"><div class="chip-name">${t(txt, "huaweiChip")}</div><div class="chip-label">${t(txt, "huaweiLabel")}</div><div class="chip-match">${t(txt, "huaweiMatch")}</div></div><div class="vs-mid">${t(txt, "vsText")}</div><div class="chip-card nvidia"><div class="chip-name">${t(txt, "nvidiaChip")}</div><div class="chip-label">${t(txt, "nvidiaLabel")}</div><div class="chip-match">${t(txt, "nvidiaMatch")}</div></div></div><div class="stats-row">${statsHtml}</div>`,
    support: t(txt, "prediction")
      ? `<div class="prediction-wrap"><div class="prediction"><div class="text">${txt.prediction}</div><div class="sub">${t(txt, "predictionSub")}</div></div></div>`
      : "",
  })}
</div></body></html>`;
}

/* ── S11: Three factors ── */
function scene11(scene, duration) {
  const txt = scene.texts || {};
  const factors = txt.factors || [];
  const factorsHtml = factors
    .map(
      (f, i) =>
        `<div class="factor" style="animation-delay: ${0.2 + i * 0.5}s; border-left: 5px solid var(--${f.color || "blue"});"><div class="num" style="color: var(--${f.color || "blue"});">${f.num || ""}</div><div class="content"><div class="ftitle">${f.title || ""}</div><div class="ftext">${f.text || ""}</div></div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s11 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; }
.s11 .factors { display: flex; flex-direction: column; gap: 22px; } .s11 .factor { display: flex; align-items: flex-start; gap: 28px; padding: 26px 32px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s11 .factor .num { font-size: 64px; font-weight: 900; line-height: 0.9; width: 70px; flex-shrink: 0; } .s11 .factor .content { flex: 1; } .s11 .factor .ftitle { font-size: 34px; font-weight: 900; color: var(--white); margin-bottom: 6px; letter-spacing: 1px; } .s11 .factor .ftext { font-size: 26px; color: var(--sec); line-height: 1.3; }
</style></head><body>
<div class="scene s11"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), {
      center: true,
      fontSize: 46,
      highlight: t(txt, "titleHighlight"),
      hlColor: "red",
    }),
    hero: `<div class="factors">${factorsHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S12: CTA — standard end card (shared ctaScene) ── */
function scene12(scene, duration) {
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
  11: scene11,
  12: scene12,
};

/**
 * Generate scene HTML for a DeepSeek scene.
 * @param {object} scene - Scene object with id, texts, voiceover
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));
}
