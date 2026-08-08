/**
 * DeepSeek visual scene templates.
 * 12 unique scenes for the DeepSeek $1.4B funding round video.
 * Each scene reads display text from scene.texts.
 * Shared visual system (CSS, brand assets, animations) from lib/base-styles.mjs.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { baseStyles, BRAND_MARK_SVG, withWatermark } from "../../lib/base-styles.mjs";
import { ctaScene } from "../../lib/scene-templates.mjs";

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

/* ── S1: Hook ── */
function scene1(scene, duration) {
  const d = Math.max(duration, 5).toFixed(1);
  const txt = scene.texts || {};
  const stats = txt.stats || [];
  const statsHtml = stats
    .map(
      (s, i) =>
        `<div class="stat-card" style="animation-delay: ${1.3 + i * 0.2}s;"><div class="stat-num">${s.num}${s.unit ? `<span class="unit">${s.unit}</span>` : ""}</div><div class="stat-label">${s.label || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s1 { display: flex; flex-direction: column; align-items: center; }
.s1 .scan-sweep { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, rgba(77,139,255,0.8), transparent); box-shadow: 0 0 20px rgba(77,139,255,0.5); animation: scanSweep ${d}s linear infinite; z-index: 50; }
@keyframes scanSweep { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
.s1 .brand-bar { position: absolute; top: 80px; left: 60px; right: 60px; display: flex; align-items: center; gap: 16px; animation: slideDown 0.5s ease-out 0.1s forwards; opacity: 0; }
.s1 .brand-bar .b-logo { width: 56px; height: 56px; } .s1 .brand-bar .b-logo svg { width: 100%; height: 100%; }
.s1 .brand-bar .b-text { font-size: 28px; font-weight: 900; color: var(--white); letter-spacing: 3px; } .s1 .brand-bar .b-text .hl { color: var(--blue); }
.s1 .brand-bar .briefing-tag { margin-left: auto; font-size: 18px; font-weight: 700; color: var(--sec); letter-spacing: 2px; padding: 6px 14px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; }
.s1 .breaking-badge { position: absolute; top: 210px; left: 50%; transform: translateX(-50%); background: var(--red); color: white; padding: 14px 40px; font-size: 28px; font-weight: 900; letter-spacing: 4px; border-radius: 8px; box-shadow: 0 0 40px rgba(239,68,68,0.6); display: flex; align-items: center; gap: 10px; animation: stampIn 0.4s ease-out 0.3s forwards; opacity: 0; }
.s1 .breaking-badge .pulse-dot { width: 12px; height: 12px; border-radius: 50%; background: white; animation: pulseDot 1s ease-in-out infinite; }
.s1 .subject-row { position: absolute; top: 340px; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 20px; animation: slideUp 0.4s ease-out 0.5s forwards; opacity: 0; }
.s1 .subject-row .ds-logo { width: 64px; height: 64px; } .s1 .subject-row .ds-logo svg { width: 100%; height: 100%; }
.s1 .subject-row .subject-text { font-size: 56px; font-weight: 800; color: var(--sec); letter-spacing: 4px; }
.s1 .headline { position: absolute; top: 480px; left: 0; right: 0; text-align: center; }
.s1 .big-number { font-size: 260px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: scaleIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.8s forwards, numberPulse 2s ease-in-out 1.5s infinite; opacity: 0; }
.s1 .subtitle { font-size: 52px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 12px; animation: slideUp 0.5s ease-out 1.1s forwards; opacity: 0; } .s1 .subtitle .hl { color: var(--red); }
.s1 .stats-grid { position: absolute; top: 950px; left: 80px; right: 80px; display: flex; gap: 20px; justify-content: center; }
.s1 .stat-card { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 32px 20px; text-align: center; animation: slideUp 0.5s ease-out forwards; opacity: 0; }
.s1 .stat-card:nth-child(1) { border-top: 4px solid var(--amber); } .s1 .stat-card:nth-child(2) { border-top: 4px solid var(--blue); }
.s1 .stat-card .stat-num { font-size: 64px; font-weight: 900; line-height: 1; } .s1 .stat-card .stat-num .unit { font-size: 32px; font-weight: 700; }
.s1 .stat-card:nth-child(1) .stat-num { color: var(--amber); } .s1 .stat-card:nth-child(2) .stat-num { color: var(--blue); }
.s1 .stat-card .stat-label { font-size: 22px; font-weight: 700; color: var(--sec); letter-spacing: 1px; margin-top: 10px; }
.s1 .glitch { position: absolute; inset: 0; pointer-events: none; animation: glitchFlash 0.4s ease-out 0.8s; opacity: 0; }
@keyframes glitchFlash { 0% { opacity: 0; } 10% { opacity: 1; background: rgba(239,68,68,0.1); transform: translateX(-3px); } 20% { opacity: 0; transform: translateX(3px); } 30% { opacity: 1; background: rgba(77,139,255,0.08); } 40% { opacity: 0; } 100% { opacity: 0; } }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="scan-sweep"></div>
  <div class="brand-bar"><div class="b-logo">${BRAND_MARK_SVG}</div><div class="b-text">CHINA <span class="hl">AI</span> NEWS</div><div class="briefing-tag">INTELLIGENCE BRIEFING</div></div>
  ${t(txt, "badge") ? `<div class="breaking-badge"><span class="pulse-dot"></span> ${txt.badge}</div>` : ""}
  ${txt.subject ? `<div class="subject-row">${txt.subjectLogo ? `<div class="ds-logo">${DEEPSEEK_LOGO_SVG}</div>` : ""}<div class="subject-text">${txt.subject}</div></div>` : ""}
  <div class="headline">${txt.bigNumber ? `<div class="big-number">${txt.bigNumber}</div>` : ""}${txt.subtitle ? `<div class="subtitle">${txt.subtitle} ${txt.subtitleHighlight ? `<span class="hl">${txt.subtitleHighlight}</span>` : ""}</div>` : ""}</div>
  <div class="stats-grid">${statsHtml}</div>
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
        `<div class="event" style="animation-delay: ${0.3 + i * 0.7}s;"><div class="date">${e.date || ""}</div><div class="text">${e.text || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s2 { display: flex; flex-direction: column; justify-content: center; padding: 120px 80px; }
.s2 .title { font-size: 42px; font-weight: 800; color: var(--sec); letter-spacing: 3px; margin-bottom: 60px; animation: fadeIn 0.3s ease-out 0.1s forwards; opacity: 0; }
.s2 .timeline { position: relative; padding-left: 60px; }
.s2 .timeline::before { content: ''; position: absolute; left: 20px; top: 30px; bottom: 30px; width: 3px; background: linear-gradient(180deg, var(--blue), var(--purple), var(--red)); }
.s2 .event { margin-bottom: 50px; position: relative; animation: slideLeft 0.5s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
.s2 .event::before { content: ''; position: absolute; left: -48px; top: 8px; width: 18px; height: 18px; border-radius: 50%; border: 3px solid var(--blue); background: #0a0a14; }
.s2 .event:nth-child(2)::before { border-color: var(--purple); } .s2 .event:nth-child(3)::before { border-color: var(--amber); } .s2 .event:nth-child(4)::before { border-color: var(--red); background: var(--red); }
.s2 .event .date { font-size: 28px; font-weight: 800; color: var(--blue); letter-spacing: 2px; } .s2 .event:nth-child(2) .date { color: var(--purple); } .s2 .event:nth-child(3) .date { color: var(--amber); } .s2 .event:nth-child(4) .date { color: var(--red); }
.s2 .event .text { font-size: 40px; font-weight: 700; color: var(--white); margin-top: 6px; line-height: 1.2; }
</style></head><body>
<div class="scene s2"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")}</div><div class="timeline">${eventsHtml}</div>
</div></body></html>`;
}

/* ── S3: Contrast ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};
  const left = txt.left || [];
  const right = txt.right || [];
  const leftHtml = left
    .map((item, i) => `<div class="item" style="animation-delay: ${0.5 + i * 0.2}s;">${item}</div>`)
    .join("");
  const rightHtml = right
    .map((item, i) => `<div class="item" style="animation-delay: ${1.4 + i * 0.2}s;">${item}</div>`)
    .join("");
  const quoteHtml = t(txt, "quote")
    ? `<div class="quote">"${txt.quote.replace(txt.quoteKeyword || "\0", `<span class="keyword">${txt.quoteKeyword}</span>`)}"</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s3 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s3 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s3 .cols { display: flex; gap: 40px; margin-bottom: 60px; } .s3 .col { flex: 1; }
.s3 .col-title { font-size: 28px; font-weight: 700; letter-spacing: 3px; margin-bottom: 24px; animation: fadeIn 0.3s ease-out 0.3s forwards; opacity: 0; }
.s3 .col.left .col-title { color: var(--red); } .s3 .col.right .col-title { color: var(--green); }
.s3 .item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 24px 28px; margin-bottom: 16px; border-radius: 10px; font-size: 36px; font-weight: 800; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s3 .col.left .item { border-left: 4px solid var(--red); text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.4); } .s3 .col.right .item { border-left: 4px solid var(--green); }
.s3 .quote { background: rgba(77,139,255,0.06); border-left: 5px solid var(--blue); border-radius: 0 12px 12px 0; padding: 30px 36px; font-size: 36px; font-style: italic; color: var(--sec); line-height: 1.4; animation: slideUp 0.5s ease-out 2.5s forwards; opacity: 0; } .s3 .quote .keyword { color: var(--blue); font-style: normal; font-weight: 700; }
</style></head><body>
<div class="scene s3"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")}</div><div class="cols"><div class="col left"><div class="col-title">${t(txt, "leftTitle")}</div>${leftHtml}</div><div class="col right"><div class="col-title">${t(txt, "rightTitle")}</div>${rightHtml}</div></div>${quoteHtml}
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
        `<div class="bar-row" style="animation-delay: ${0.3 + i * 0.5}s;"><div class="bar-label" style="color: var(--${b.color});">${b.label || ""}</div><div class="bar-track"><div class="bar-fill" style="animation-delay: ${0.5 + i * 0.5}s; background: linear-gradient(90deg, var(--${b.color}), var(--${b.color})); --target: ${b.target || "50%"};">${b.value || ""}</div></div></div>`,
    )
    .join("");
  const statsHtml = stats
    .map(
      (s, i) =>
        `<div class="stat"><div class="num" style="color: var(--${["blue", "green", "purple"][i] || "blue"});">${s.num || ""}</div><div class="lbl">${s.label || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s4 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s4 .title { font-size: 44px; font-weight: 800; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s4 .bars { display: flex; flex-direction: column; gap: 30px; margin-bottom: 50px; }
.s4 .bar-row { display: flex; align-items: center; gap: 24px; animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s4 .bar-label { width: 240px; font-size: 36px; font-weight: 800; text-align: right; } .s4 .bar-track { flex: 1; height: 70px; background: rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden; position: relative; } .s4 .bar-fill { height: 100%; border-radius: 8px; display: flex; align-items: center; padding: 0 20px; font-size: 32px; font-weight: 900; color: white; animation: barGrow 0.8s cubic-bezier(0.16,1,0.3,1) forwards; width: 0; }
@keyframes barGrow { from { width: 0; } to { width: var(--target); } }
.s4 .ratio-box { display: flex; gap: 40px; justify-content: center; animation: scaleIn 0.5s ease-out 2.2s forwards; opacity: 0; } .s4 .stat { text-align: center; } .s4 .stat .num { font-size: 72px; font-weight: 900; line-height: 1; } .s4 .stat .lbl { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
.s4 .note { margin-top: 30px; text-align: center; font-size: 30px; font-style: italic; color: var(--sec); animation: fadeIn 0.5s ease-out 2.8s forwards; opacity: 0; } .s4 .note .hl { color: var(--red); font-weight: 700; font-style: normal; }
</style></head><body>
<div class="scene s4"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")}</div><div class="bars">${barsHtml}</div><div class="ratio-box">${statsHtml}</div>${t(txt, "note") ? `<div class="note">${txt.note} <span class="hl">${t(txt, "noteHighlight")}</span></div>` : ""}
</div></body></html>`;
}

/* ── S5: Open source ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};
  const cards = txt.cards || [];
  const points = txt.points || [];
  const cardsHtml = cards
    .map(
      (c, i) =>
        `<div class="card ${c.color}" style="animation-delay: ${0.4 + i * 0.5}s;"><div class="icon">${c.icon || ""}</div><div class="name">${c.name || ""}</div><div class="desc">${c.desc || ""}</div></div>`,
    )
    .join("");
  const pointsHtml = points
    .map(
      (p, i) =>
        `<div class="point" style="animation-delay: ${1.4 + i * 0.3}s;"><span class="check">✓</span> ${p}</div>`,
    )
    .join("");
  const quoteHtml = t(txt, "quote")
    ? `<div class="quote">"${txt.quote.replace(txt.quoteHighlight || "\0", `<span class="hl">${txt.quoteHighlight}</span>`)}"</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s5 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s5 .title { font-size: 52px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 40px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; } .s5 .title .hl { color: var(--green); }
.s5 .vs { display: flex; gap: 30px; margin-bottom: 50px; } .s5 .card { flex: 1; border-radius: 16px; padding: 40px 32px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; } .s5 .card.blue { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.3); } .s5 .card.red { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); } .s5 .card .icon { font-size: 60px; margin-bottom: 16px; } .s5 .card .name { font-size: 32px; font-weight: 800; letter-spacing: 1px; margin-bottom: 16px; } .s5 .card.blue .name { color: var(--blue); } .s5 .card.red .name { color: var(--red); } .s5 .card .desc { font-size: 26px; color: var(--sec); line-height: 1.4; }
.s5 .points { margin-bottom: 40px; } .s5 .point { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; font-size: 34px; font-weight: 700; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; } .s5 .point .check { color: var(--green); font-size: 36px; }
.s5 .quote { background: rgba(245,158,11,0.06); border-left: 5px solid var(--amber); border-radius: 0 12px 12px 0; padding: 28px 32px; font-size: 32px; font-style: italic; color: var(--sec); line-height: 1.4; animation: slideUp 0.5s ease-out 2.5s forwards; opacity: 0; } .s5 .quote .hl { color: var(--amber); font-style: normal; font-weight: 700; }
</style></head><body>
<div class="scene s5"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")} <span class="hl">${t(txt, "titleHighlight")}</span></div><div class="vs">${cardsHtml}</div><div class="points">${pointsHtml}</div>${quoteHtml}
</div></body></html>`;
}

/* ── S6: Deployment Cost ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};
  const factors = txt.factors || [];
  const factorsHtml = factors
    .map(
      (f, i) =>
        `<div class="factor" style="animation-delay: ${0.8 + i * 0.5}s; border-left: 5px solid var(--${["cyan", "blue", "purple"][i] || "blue"});"><div class="num" style="color: var(--${["cyan", "blue", "purple"][i] || "blue"});">${f.num || ""}</div><div class="text">${f.text || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s6 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s6 .title { font-size: 52px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; } .s6 .title .hl { color: var(--cyan); }
.s6 .tilelang-box { background: rgba(34,211,238,0.06); border: 2px solid rgba(34,211,238,0.25); border-radius: 16px; padding: 40px; text-align: center; margin-bottom: 50px; animation: scaleIn 0.5s ease-out 0.3s forwards; opacity: 0; } .s6 .tilelang-box .name { font-size: 56px; font-weight: 900; color: var(--cyan); letter-spacing: 1px; } .s6 .tilelang-box .desc { font-size: 30px; color: var(--sec); margin-top: 8px; }
.s6 .factors { display: flex; flex-direction: column; gap: 24px; margin-bottom: 50px; } .s6 .factor { display: flex; align-items: flex-start; gap: 24px; padding: 30px 36px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s6 .factor .num { font-size: 64px; font-weight: 900; line-height: 0.9; width: 70px; flex-shrink: 0; } .s6 .factor .text { font-size: 32px; font-weight: 700; color: var(--white); line-height: 1.3; padding-top: 8px; }
.s6 .verdict { text-align: center; font-size: 48px; font-weight: 900; color: var(--red); letter-spacing: 2px; text-shadow: 0 0 30px rgba(239,68,68,0.3); animation: stampIn 0.5s ease-out 2.5s forwards; opacity: 0; }
</style></head><body>
<div class="scene s6"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")} <span class="hl">${t(txt, "titleHighlight")}</span></div>${t(txt, "tilelang") ? `<div class="tilelang-box"><div class="name">${txt.tilelang}</div><div class="desc">${t(txt, "tilelangDesc")}</div></div>` : ""}<div class="factors">${factorsHtml}</div>${t(txt, "verdict") ? `<div class="verdict">${txt.verdict}</div>` : ""}
</div></body></html>`;
}

/* ── S7: AGI Staircase ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};
  const steps = txt.steps || [];
  const stepsHtml = steps
    .map(
      (s, i) =>
        `<div class="step ${s.status}" style="animation-delay: ${0.3 + i * 0.3}s; margin-right: ${i * 40}px;"><span class="num">${s.num || ""}</span><span class="text">${s.text || ""}</span>${s.status === "done" ? '<span class="badge">DONE</span>' : s.status === "current" ? '<span class="badge">NOW</span>' : s.status === "next" ? '<span class="badge">NEXT</span>' : ""}</div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s7 { display: flex; flex-direction: column; justify-content: center; padding: 80px 60px; }
.s7 .title { font-size: 44px; font-weight: 800; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; } .s7 .title .hl { color: var(--blue); }
.s7 .stairs { display: flex; flex-direction: column-reverse; gap: 12px; } .s7 .step { display: flex; align-items: center; gap: 20px; padding: 22px 30px; border-radius: 10px; animation: slideLeft 0.4s ease-out forwards; opacity: 0; } .s7 .step.done { background: rgba(52,211,153,0.08); border-left: 5px solid var(--green); } .s7 .step.current { background: rgba(77,139,255,0.1); border-left: 5px solid var(--blue); box-shadow: 0 0 30px rgba(77,139,255,0.15); } .s7 .step.next { background: rgba(245,158,11,0.08); border-left: 5px solid var(--amber); } .s7 .step.future { background: rgba(255,255,255,0.03); border-left: 5px solid var(--muted); } .s7 .step .num { font-size: 40px; font-weight: 900; width: 50px; } .s7 .step.done .num { color: var(--green); } .s7 .step.current .num { color: var(--blue); } .s7 .step.next .num { color: var(--amber); } .s7 .step.future .num { color: var(--muted); } .s7 .step .text { font-size: 32px; font-weight: 700; color: var(--white); } .s7 .step .badge { margin-left: auto; font-size: 22px; font-weight: 800; padding: 4px 14px; border-radius: 6px; } .s7 .step.done .badge { background: rgba(52,211,153,0.2); color: var(--green); } .s7 .step.current .badge { background: rgba(77,139,255,0.2); color: var(--blue); } .s7 .step.next .badge { background: rgba(245,158,11,0.2); color: var(--amber); }
.s7 .arrow { text-align: center; margin-top: 40px; font-size: 36px; font-weight: 800; color: var(--amber); animation: fadeIn 0.5s ease-out 2.2s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")} <span class="hl">${t(txt, "titleHighlight")}</span> ${t(txt, "titleSuffix")}</div><div class="stairs">${stepsHtml}</div>${t(txt, "arrow") ? `<div class="arrow">${txt.arrow}</div>` : ""}
</div></body></html>`;
}

/* ── S8: Talent drain ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};
  const departures = txt.departures || [];
  const departuresHtml = departures
    .map(
      (d, i) =>
        `<div class="flow-row" style="animation-delay: ${1.0 + i * 0.3}s;"><span class="person">${d.name || ""}</span><span class="arrow">→</span><span class="company" style="color: var(--${d.color || "blue"});">${d.to || ""}</span></div>`,
    )
    .join("");
  const quoteHtml = t(txt, "quote")
    ? `<div class="quote">"${txt.quote.replace(txt.quoteHighlight || "\0", `<span class="hl">${txt.quoteHighlight}</span>`)}"</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s8 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s8 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 40px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; } .s8 .title .hl { color: var(--red); }
.s8 .quote { background: rgba(239,68,68,0.06); border-left: 5px solid var(--red); border-radius: 0 12px 12px 0; padding: 28px 32px; font-size: 36px; font-weight: 700; color: var(--white); line-height: 1.4; margin-bottom: 50px; animation: slideUp 0.5s ease-out 0.3s forwards; opacity: 0; } .s8 .quote .hl { color: var(--red); }
.s8 .departures-title { font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-bottom: 24px; animation: fadeIn 0.4s ease-out 0.8s forwards; opacity: 0; }
.s8 .flow { display: flex; flex-direction: column; gap: 20px; } .s8 .flow-row { display: flex; align-items: center; gap: 20px; padding: 24px 28px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); animation: slideLeft 0.4s ease-out forwards; opacity: 0; } .s8 .flow-row .person { font-size: 36px; font-weight: 800; color: var(--white); width: 400px; } .s8 .flow-row .arrow { font-size: 36px; color: var(--muted); } .s8 .flow-row .company { font-size: 36px; font-weight: 800; }
.s8 .conclusion { margin-top: 40px; text-align: center; font-size: 34px; font-weight: 700; color: var(--green); animation: fadeIn 0.5s ease-out 2.2s forwards; opacity: 0; }
</style></head><body>
<div class="scene s8"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")} <span class="hl">${t(txt, "titleHighlight")}</span></div>${quoteHtml}${t(txt, "departuresTitle") ? `<div class="departures-title">${txt.departuresTitle}</div>` : ""}<div class="flow">${departuresHtml}</div>${t(txt, "conclusion") ? `<div class="conclusion">${txt.conclusion}</div>` : ""}
</div></body></html>`;
}

/* ── S9: Compute gap ── */
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s9 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s9 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 60px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; } .s9 .title .hl { color: var(--red); }
.s9 .gap-viz { display: flex; align-items: flex-end; justify-content: center; gap: 80px; margin-bottom: 50px; } .s9 .gpu-col { text-align: center; } .s9 .gpu-bar { width: 200px; border-radius: 12px 12px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 30px; font-size: 48px; font-weight: 900; color: white; animation: growUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards; height: 0; } .s9 .gpu-bar.have { background: linear-gradient(180deg, var(--blue), rgba(77,139,255,0.3)); animation-delay: 0.4s; --target-h: 200px; } .s9 .gpu-bar.need { background: linear-gradient(180deg, var(--red), rgba(239,68,68,0.3)); animation-delay: 0.8s; --target-h: 700px; }
@keyframes growUp { to { height: var(--target-h); } }
.s9 .gpu-num { font-size: 80px; font-weight: 900; line-height: 1; margin-bottom: 10px; animation: scaleIn 0.5s ease-out forwards; opacity: 0; } .s9 .have-num { color: var(--blue); animation-delay: 0.3s; } .s9 .need-num { color: var(--red); animation-delay: 0.7s; } .s9 .gpu-label { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 2px; } .s9 .vs-text { font-size: 40px; font-weight: 900; color: var(--muted); align-self: center; margin-bottom: 200px; }
.s9 .reserve-box { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 30px 40px; text-align: center; margin-bottom: 30px; animation: stampIn 0.5s ease-out 1.5s forwards; opacity: 0; } .s9 .reserve-box .amount { font-size: 72px; font-weight: 900; color: var(--red); } .s9 .reserve-box .label { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
.s9 .verdict { text-align: center; font-size: 40px; font-weight: 900; color: var(--white); animation: fadeIn 0.5s ease-out 2.2s forwards; opacity: 0; } .s9 .verdict .hl { color: var(--red); }
</style></head><body>
<div class="scene s9"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")} <span class="hl">${t(txt, "titleHighlight")}</span> ${t(txt, "titleSuffix")}</div>
  <div class="gap-viz"><div class="gpu-col"><div class="gpu-num have-num">${t(txt, "have")}</div><div class="gpu-bar have">${t(txt, "haveFill")}</div><div class="gpu-label">${t(txt, "haveLabel")}</div></div><div class="vs-text">${t(txt, "vsText")}</div><div class="gpu-col"><div class="gpu-num need-num">${t(txt, "need")}</div><div class="gpu-bar need">${t(txt, "needFill")}</div><div class="gpu-label">${t(txt, "needLabel")}</div></div></div>
  ${t(txt, "reserve") ? `<div class="reserve-box"><div class="amount">${txt.reserve}</div><div class="label">${t(txt, "reserveLabel")}</div></div>` : ""}
  ${t(txt, "verdict") ? `<div class="verdict">${txt.verdict} <span class="hl">${t(txt, "verdictHighlight")}</span></div>` : ""}
</div></body></html>`;
}

/* ── S10: Huawei GPU Ecosystem ── */
function scene10(scene, duration) {
  const txt = scene.texts || {};
  const stats = txt.stats || [];
  const statsHtml = stats
    .map(
      (s, i) =>
        `<div class="stat-box" style="animation-delay: ${1.2 + i * 0.4}s;"><div class="num" style="color: var(--${["amber", "purple"][i] || "blue"});">${s.num || ""}</div><div class="lbl">${s.label || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s10 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s10 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; } .s10 .title .hl { color: var(--red); }
.s10 .versus { display: flex; align-items: center; justify-content: center; gap: 40px; margin-bottom: 60px; } .s10 .chip-card { flex: 1; border-radius: 16px; padding: 40px 32px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; } .s10 .chip-card.huawei { background: rgba(239,68,68,0.08); border: 2px solid rgba(239,68,68,0.3); animation-delay: 0.3s; } .s10 .chip-card.nvidia { background: rgba(52,211,153,0.06); border: 2px solid rgba(52,211,153,0.2); animation-delay: 0.7s; } .s10 .chip-card .chip-name { font-size: 72px; font-weight: 900; line-height: 1; } .s10 .chip-card.huawei .chip-name { color: var(--red); } .s10 .chip-card.nvidia .chip-name { color: var(--green); } .s10 .chip-card .chip-label { font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 10px; } .s10 .chip-card .chip-match { font-size: 24px; color: var(--white); margin-top: 14px; font-weight: 600; }
.s10 .vs-circle { width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 900; color: var(--muted); animation: fadeIn 0.4s ease-out 0.5s forwards; opacity: 0; flex-shrink: 0; }
.s10 .stats-row { display: flex; gap: 40px; justify-content: center; margin-bottom: 50px; } .s10 .stat-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 30px 40px; text-align: center; animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s10 .stat-box .num { font-size: 64px; font-weight: 900; line-height: 1; } .s10 .stat-box .lbl { font-size: 22px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 8px; }
.s10 .prediction { background: rgba(52,211,153,0.06); border: 2px solid rgba(52,211,153,0.2); border-radius: 12px; padding: 30px 40px; text-align: center; animation: stampIn 0.5s ease-out 2.2s forwards; opacity: 0; } .s10 .prediction .text { font-size: 36px; font-weight: 900; color: var(--green); letter-spacing: 1px; } .s10 .prediction .sub { font-size: 24px; color: var(--sec); margin-top: 8px; }
</style></head><body>
<div class="scene s10"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")} <span class="hl">${t(txt, "titleHighlight")}</span></div>
  <div class="versus"><div class="chip-card huawei"><div class="chip-name">${t(txt, "huaweiChip")}</div><div class="chip-label">${t(txt, "huaweiLabel")}</div><div class="chip-match">${t(txt, "huaweiMatch")}</div></div><div class="vs-circle">${t(txt, "vsText")}</div><div class="chip-card nvidia"><div class="chip-name">${t(txt, "nvidiaChip")}</div><div class="chip-label">${t(txt, "nvidiaLabel")}</div><div class="chip-match">${t(txt, "nvidiaMatch")}</div></div></div>
  <div class="stats-row">${statsHtml}</div>
  ${t(txt, "prediction") ? `<div class="prediction"><div class="text">${txt.prediction}</div><div class="sub">${t(txt, "predictionSub")}</div></div>` : ""}
</div></body></html>`;
}

/* ── S11: Three factors ── */
function scene11(scene, duration) {
  const txt = scene.texts || {};
  const factors = txt.factors || [];
  const factorsHtml = factors
    .map(
      (f, i) =>
        `<div class="factor" style="animation-delay: ${0.3 + i * 0.7}s; border-left: 5px solid var(--${f.color || "blue"});"><div class="num" style="color: var(--${f.color || "blue"});">${f.num || ""}</div><div class="content"><div class="ftitle">${f.title || ""}</div><div class="ftext">${f.text || ""}</div></div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s11 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s11 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 60px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; } .s11 .title .hl { color: var(--red); }
.s11 .factors { display: flex; flex-direction: column; gap: 30px; } .s11 .factor { display: flex; align-items: flex-start; gap: 28px; padding: 36px 40px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s11 .factor .num { font-size: 80px; font-weight: 900; line-height: 0.9; width: 80px; flex-shrink: 0; } .s11 .factor .content { flex: 1; } .s11 .factor .ftitle { font-size: 40px; font-weight: 900; color: var(--white); margin-bottom: 8px; letter-spacing: 1px; } .s11 .factor .ftext { font-size: 30px; color: var(--sec); line-height: 1.3; }
</style></head><body>
<div class="scene s11"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")} <span class="hl">${t(txt, "titleHighlight")}</span></div><div class="factors">${factorsHtml}</div>
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
