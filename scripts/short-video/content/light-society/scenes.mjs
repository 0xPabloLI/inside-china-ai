/**
 * Scene definitions for the Light Society video.
 * 10 scenes for the billion-agent simulation story.
 *
 * Uses the slot layout system (spec: spec-video-layout-safe-zones.md):
 * - All scenes assemble content into fixed slots via sceneFrame()
 * - brandBar() on every scene, withWatermark() on output
 */

import { baseStyles, withWatermark } from "../../lib/base-styles.mjs";
import {
  templateCss,
  brandBar,
  breakingBadge,
  titleBlock,
  ctaScene,
} from "../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../lib/scene-layout.mjs";

// Safe text accessor
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — VIRAL badge + big number + stats ── */
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
.s1 .subject-row .subject-text { font-size: 80px; font-weight: 900; color: var(--white); letter-spacing: 4px; }
.s1 .headline { text-align: center; }
.s1 .big-number { font-size: 260px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: scaleIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.5s forwards, numberPulse 2s ease-in-out 1.2s infinite; opacity: 0; }
.s1 .subtitle { font-size: 60px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 12px; animation: slideUp 0.5s ease-out 0.8s forwards; opacity: 0; } .s1 .subtitle .hl { color: var(--red); }
.s1 .stats-grid { display: flex; gap: 20px; justify-content: center; }
.s1 .stat-card { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 24px 20px; text-align: center; animation: slideUp 0.5s ease-out forwards; opacity: 0; }
.s1 .stat-card:nth-child(1) { border-top: 4px solid var(--amber); } .s1 .stat-card:nth-child(2) { border-top: 4px solid var(--red); }
.s1 .stat-card .stat-num { font-size: 56px; font-weight: 900; line-height: 1; } .s1 .stat-card .stat-num .unit { font-size: 28px; font-weight: 700; } .s1 .stat-card { padding: 20px 16px; }
.s1 .stat-card:nth-child(1) .stat-num { color: var(--amber); } .s1 .stat-card:nth-child(2) .stat-num { color: var(--red); }
.s1 .stat-card .stat-label { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 1px; margin-top: 10px; }
.s1 .s1-badge { display: inline-flex; align-items: center; gap: 10px; background: var(--red); color: white; padding: 14px 40px; font-size: 32px; font-weight: 900; letter-spacing: 4px; border-radius: 8px; box-shadow: 0 0 40px rgba(239,68,68,0.6); animation: stampIn 0.4s ease-out 0.3s forwards; opacity: 0; }
.s1 .glitch { position: absolute; inset: 0; pointer-events: none; animation: glitchFlash 0.4s ease-out 0.8s; opacity: 0; }
@keyframes glitchFlash { 0% { opacity: 0; } 10% { opacity: 1; background: rgba(239,68,68,0.1); transform: translateX(-3px); } 20% { opacity: 0; transform: translateX(3px); } 30% { opacity: 1; background: rgba(77,139,255,0.08); } 40% { opacity: 0; } 100% { opacity: 0; } }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="scan-sweep"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="s1-badge">${t(txt, "badge")}</div>`,
    hero: `<div class="subject-row"><div class="subject-text">${t(txt, "subject")}</div></div><div class="headline"><div class="big-number">${t(txt, "bigNumber")}</div><div class="subtitle">${t(txt, "subtitle")} <span class="hl">${t(txt, "subtitleHighlight")}</span></div></div>`,
    support: `<div class="stats-grid">${statsHtml}</div>`,
  })}
  <div class="glitch"></div>
</div></body></html>`;
}

/* ── S2: Callout — viral quote with attribution ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};
  const stats = txt.stats || [];
  const statsHtml = stats
    .map(
      (s, i) =>
        `<div class="stat" style="animation-delay: ${1.2 + i * 0.2}s;"><div class="num">${s.num || ""}</div><div class="lbl">${s.label || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; }
.s2 .quote-box { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.25); border-radius: 16px; padding: 32px 36px; animation: scaleIn 0.5s ease-out 0.3s forwards; opacity: 0; }
.s2 .quote-mark { font-size: 64px; color: var(--red); line-height: 0.5; margin-bottom: 8px; }
.s2 .quote-text { font-size: 38px; font-weight: 800; color: var(--white); line-height: 1.3; }
.s2 .attribution { font-size: 24px; font-weight: 700; color: var(--sec); margin-top: 16px; letter-spacing: 1px; }
.s2 .stats-row { display: flex; gap: 40px; justify-content: center; margin-top: 24px; } .s2 .stat { text-align: center; animation: slideUp 0.5s ease-out forwards; opacity: 0; } .s2 .stat .num { font-size: 48px; font-weight: 900; color: var(--blue); line-height: 1; } .s2 .stat .lbl { font-size: 20px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 4px; }
</style></head><body>
<div class="scene s2"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 40 }),
    hero: `<div class="quote-box"><div class="quote-mark">"</div><div class="quote-text">${t(txt, "quote")}</div><div class="attribution">${t(txt, "attribution")}</div></div>`,
    support: `<div class="stats-row">${statsHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S3: Info card — paper details + institutions + points ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};
  const institutions = txt.institutions || [];
  const points = txt.points || [];
  const instHtml = institutions
    .map(
      (inst, i) =>
        `<div class="inst" style="animation-delay: ${0.2 + i * 0.15}s;">${inst}</div>`,
    )
    .join("");
  const pointsHtml = points
    .map(
      (p, i) =>
        `<div class="point" style="animation-delay: ${0.8 + i * 0.15}s;"><span class="dot">●</span> ${p}</div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-blue { bottom: -200px; right: -200px; width: 800px; height: 800px; }
.s3 .subtitle { font-size: 28px; font-weight: 700; color: var(--cyan); letter-spacing: 2px; text-align: center; margin-bottom: 16px; animation: fadeIn 0.4s ease-out 0.15s forwards; opacity: 0; }
.s3 .institutions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.s3 .inst { font-size: 22px; font-weight: 600; color: var(--sec); padding: 6px 16px; background: rgba(255,255,255,0.03); border-left: 3px solid var(--blue); border-radius: 0 8px 8px 0; animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s3 .points { display: flex; flex-direction: column; gap: 8px; }
.s3 .point { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 700; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; } .s3 .point .dot { color: var(--amber); font-size: 14px; }
</style></head><body>
<div class="scene s3"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 48, highlight: t(txt, "titleHighlight"), hlColor: "blue" }),
    hero: `<div class="subtitle">${t(txt, "subtitle")}</div><div class="institutions">${instHtml}</div><div class="points">${pointsHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S4: Contrast — real data vs agent capabilities (vertical stack) ── */
function scene4(scene, duration) {
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

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-blue { bottom: -200px; right: -200px; width: 800px; height: 800px; }
.s4 .vline { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.s4 .col-title { font-size: 26px; font-weight: 700; letter-spacing: 3px; padding-top: 14px; animation: fadeIn 0.3s ease-out 0.1s forwards; opacity: 0; }
.s4 .col-title.left { color: var(--cyan); } .s4 .col-title.right { color: var(--amber); }
.s4 .item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 14px 20px; border-radius: 10px; font-size: 28px; font-weight: 800; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s4 .item.left { border-left: 4px solid var(--cyan); }
.s4 .item.right { border-left: 4px solid var(--amber); }
</style></head><body>
<div class="scene s4"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 44 }),
    hero: `<div class="vline"><div class="col-title left">${t(txt, "leftTitle")}</div>${leftHtml}<div class="col-title right">${t(txt, "rightTitle")}</div>${rightHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S5: Scale comparison — 10M vs 1B ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-blue { bottom: -200px; left: -200px; width: 800px; height: 800px; }
.s5 .gap-row { display: flex; align-items: flex-end; justify-content: center; gap: 60px; margin-bottom: 20px; } .s5 .num-col { text-align: center; } .s5 .num-bar { width: 180px; border-radius: 12px 12px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 24px; font-size: 36px; font-weight: 900; color: white; animation: growUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards; height: 0; } .s5 .num-bar.have { background: linear-gradient(180deg, var(--muted), rgba(255,255,255,0.1)); animation-delay: 0.2s; --target-h: 100px; } .s5 .num-bar.need { background: linear-gradient(180deg, var(--amber), rgba(245,158,11,0.3)); animation-delay: 0.5s; --target-h: 380px; }
@keyframes growUp { to { height: var(--target-h); } }
.s5 .big-num { font-size: 64px; font-weight: 900; line-height: 1; margin-bottom: 8px; animation: scaleIn 0.5s ease-out forwards; opacity: 0; } .s5 .have-num { color: var(--muted); animation-delay: 0.15s; } .s5 .need-num { color: var(--amber); animation-delay: 0.45s; } .s5 .num-label { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 2px; } .s5 .vs-text { font-size: 36px; font-weight: 900; color: var(--muted); align-self: center; margin-bottom: 80px; }
.s5 .tech-box { background: rgba(77,139,255,0.06); border: 2px solid rgba(77,139,255,0.2); border-radius: 12px; padding: 16px 28px; text-align: center; margin-bottom: 10px; animation: stampIn 0.5s ease-out 1.2s forwards; opacity: 0; display: inline-block; } .s5 .tech-box .name { font-size: 36px; font-weight: 900; color: var(--blue); } .s5 .tech-box .desc { font-size: 22px; color: var(--sec); margin-top: 4px; }
.s5 .tech-wrap { text-align: center; }
.s5 .verdict { text-align: center; font-size: 30px; font-weight: 900; color: var(--white); animation: fadeIn 0.5s ease-out 1.7s forwards; opacity: 0; } .s5 .verdict .hl { color: var(--green); }
</style></head><body>
<div class="scene s5"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 46, highlight: t(txt, "titleHighlight"), hlColor: "amber" }),
    hero: `<div class="gap-row"><div class="num-col"><div class="big-num have-num">${t(txt, "have")}</div><div class="num-bar have">${t(txt, "haveFill")}</div><div class="num-label">${t(txt, "haveLabel")}</div></div><div class="vs-text">${t(txt, "vsText")}</div><div class="num-col"><div class="big-num need-num">${t(txt, "need")}</div><div class="num-bar need">${t(txt, "needFill")}</div><div class="num-label">${t(txt, "needLabel")}</div></div></div>`,
    support: `<div class="tech-wrap"><div class="tech-box"><div class="name">${t(txt, "technique")}</div><div class="desc">${t(txt, "techniqueDesc")}</div></div></div><div class="verdict">${t(txt, "verdict")} <span class="hl">${t(txt, "verdictHighlight")}</span></div>`,
  })}
</div></body></html>`;
}

/* ── S6: Stats — key findings cards ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};
  const cards = txt.statCards || [];
  const cardsHtml = cards
    .map(
      (c, i) =>
        `<div class="stat-card ${c.color || "blue"}" style="animation-delay: ${0.2 + i * 0.3}s;"><div class="num">${c.num || ""}</div><div class="lbl">${c.label || ""}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-blue { bottom: -200px; left: -200px; width: 800px; height: 800px; }
.s6 .cards { display: flex; flex-direction: column; gap: 16px; } .s6 .stat-card { border-radius: 14px; padding: 24px 28px; animation: slideLeft 0.5s ease-out forwards; opacity: 0; } .s6 .stat-card .num { font-size: 44px; font-weight: 900; letter-spacing: 1px; margin-bottom: 4px; } .s6 .stat-card .lbl { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 1px; }
.s6 .stat-card.blue { background: rgba(77,139,255,0.08); border-left: 5px solid var(--blue); } .s6 .stat-card.blue .num { color: var(--blue); }
.s6 .stat-card.green { background: rgba(52,211,153,0.08); border-left: 5px solid var(--green); } .s6 .stat-card.green .num { color: var(--green); }
.s6 .stat-card.amber { background: rgba(245,158,11,0.08); border-left: 5px solid var(--amber); } .s6 .stat-card.amber .num { color: var(--amber); }
.s6 .note { text-align: center; font-size: 26px; font-weight: 700; color: var(--sec); margin-top: 16px; animation: fadeIn 0.5s ease-out 1.4s forwards; opacity: 0; }
</style></head><body>
<div class="scene s6"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 46, highlight: t(txt, "titleHighlight"), hlColor: "green" }),
    hero: `<div class="cards">${cardsHtml}</div>`,
    support: t(txt, "note") ? `<div class="note">${t(txt, "note")}</div>` : "",
  })}
</div></body></html>`;
}

/* ── S7: Network — opinion diffusion visualization ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};
  const findings = txt.findings || [];
  const findingsHtml = findings
    .map(
      (f, i) =>
        `<div class="finding" style="animation-delay: ${0.8 + i * 0.2}s;"><span class="check">▸</span> ${f}</div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-red { top: -200px; right: -200px; width: 800px; height: 800px; }
.s7 .net-viz { display: flex; align-items: center; justify-content: center; gap: 30px; margin-bottom: 16px; }
.s7 .net-circle { width: 120px; height: 120px; border-radius: 50%; border: 3px solid var(--blue); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; color: var(--blue); animation: scaleIn 0.5s ease-out 0.2s forwards, pulse 2s ease-in-out 1s infinite; opacity: 0; }
.s7 .net-arrow { font-size: 40px; color: var(--muted); animation: fadeIn 0.4s ease-out 0.5s forwards; opacity: 0; }
.s7 .cascade-box { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 16px 24px; text-align: center; animation: stampIn 0.5s ease-out 0.7s forwards; opacity: 0; } .s7 .cascade-box .label { font-size: 28px; font-weight: 900; color: var(--red); letter-spacing: 1px; }
.s7 .influencer { text-align: center; } .s7 .influencer .pct { font-size: 48px; font-weight: 900; color: var(--amber); line-height: 1; } .s7 .influencer .lbl { font-size: 20px; font-weight: 700; color: var(--sec); letter-spacing: 2px; }
.s7 .findings { display: flex; flex-direction: column; gap: 8px; } .s7 .finding { display: flex; align-items: center; gap: 12px; font-size: 24px; font-weight: 700; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; } .s7 .finding .check { color: var(--amber); font-size: 20px; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
</style></head><body>
<div class="scene s7"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 46, highlight: t(txt, "titleHighlight"), hlColor: "red" }),
    hero: `<div class="net-viz"><div class="net-circle">${t(txt, "networkNodes")}</div><div class="net-arrow">→</div><div class="influencer"><div class="pct">${t(txt, "influencerPct")}</div><div class="lbl">${t(txt, "influencerLabel")}</div></div><div class="net-arrow">→</div><div class="cascade-box"><div class="label">${t(txt, "cascadeLabel")}</div></div></div>`,
    support: `<div class="findings">${findingsHtml}</div>`,
  })}
</div></body></html>`;
}

/* ── S8: Callout — the real story clarification ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; }
.s8 .quote-box { background: rgba(245,158,11,0.06); border: 2px solid rgba(245,158,11,0.25); border-radius: 16px; padding: 32px 36px; animation: scaleIn 0.5s ease-out 0.3s forwards; opacity: 0; }
.s8 .quote-mark { font-size: 64px; color: var(--amber); line-height: 0.5; margin-bottom: 8px; }
.s8 .quote-text { font-size: 36px; font-weight: 800; color: var(--white); line-height: 1.3; } .s8 .quote-text .hl { color: var(--amber); }
.s8 .attribution { font-size: 24px; font-weight: 700; color: var(--sec); margin-top: 16px; letter-spacing: 1px; }
</style></head><body>
<div class="scene s8"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 44 }),
    hero: `<div class="quote-box"><div class="quote-mark">"</div><div class="quote-text">${t(txt, "quote")}</div><div class="attribution">${t(txt, "attribution")}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S9: Question — philosophical big question ── */
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s9 .glow-red { top: -100px; left: 50%; transform: translateX(-50%); width: 800px; height: 800px; }
.s9 .question-box { text-align: center; animation: scaleIn 0.8s cubic-bezier(0.16,1,0.3,1) 0.5s forwards; opacity: 0; }
.s9 .question { font-size: 72px; font-weight: 900; color: var(--white); letter-spacing: 2px; line-height: 1.1; text-shadow: 0 0 40px rgba(77,139,255,0.3); }
.s9 .subquestion { font-size: 32px; font-weight: 700; color: var(--sec); margin-top: 24px; animation: slideUp 0.5s ease-out 1.2s forwards; opacity: 0; }
.s9 .attribution { font-size: 24px; font-weight: 600; color: var(--muted); margin-top: 20px; letter-spacing: 1px; animation: fadeIn 0.5s ease-out 1.8s forwards; opacity: 0; }
.s9 .pulse-ring { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); width: 300px; height: 300px; border-radius: 50%; border: 2px solid rgba(77,139,255,0.15); animation: ringPulse 3s ease-in-out infinite; pointer-events: none; }
@keyframes ringPulse { 0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; } 50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.1; } }
</style></head><body>
<div class="scene s9"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="pulse-ring"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 36 }),
    hero: `<div class="question-box"><div class="question">${t(txt, "question")}</div></div>`,
    support: `<div class="subquestion">${t(txt, "subquestion")}</div><div class="attribution">${t(txt, "attribution")}</div>`,
  })}
</div></body></html>`;
}

/* ── S10: CTA — standard end card ── */
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
 * Generate scene HTML for a Light Society scene.
 * @param {object} scene - Scene object with id, texts, voiceover
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));
}
