/**
 * Distillation pt1 visual scene templates — "The Crack"
 * 8 unique scenes for the LLM distillation scandal video.
 *
 * Visual DNA: data-breach / espionage aesthetic.
 *   - Red-dominant glow (scandal alert) vs DeepSeek's blue
 *   - Glitch flash on hook scenes
 *   - Terminal-style data stream accent
 *   - Stamp-in animations for impact numbers
 *
 * Each scene reads display text from scene.texts.
 * Shared visual system (CSS, brand assets, animations) from lib/base-styles.mjs.
 */

import { baseStyles, BRAND_MARK_SVG, withWatermark } from "../../../lib/base-styles.mjs";

// Safe text accessor — returns empty string for missing fields
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — data breach alert ── */
function scene1(scene, duration) {
  const txt = scene.texts || {};
  const line1 = t(txt, "line1");
  const line2 = t(txt, "line2");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s1 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s1 .glow-red { width: 1000px; height: 1000px; top: -300px; left: 50%; transform: translateX(-50%); background: radial-gradient(circle, rgba(239,68,68,0.18) 0%, transparent 60%); }
.s1 .alert-bar { position: absolute; top: 80px; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 12px; animation: slideDown 0.4s ease-out 0.1s forwards; opacity: 0; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
.s1 .alert-bar .dot { width: 14px; height: 14px; border-radius: 50%; background: var(--red); animation: pulseDot 0.8s ease-in-out infinite; box-shadow: 0 0 12px rgba(239,68,68,0.8); }
@keyframes pulseDot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.6); } }
.s1 .alert-bar .text { font-size: 26px; font-weight: 800; color: var(--red); letter-spacing: 4px; }
.s1 .headline { position: absolute; top: 320px; left: 0; right: 0; text-align: center; }
.s1 .big-text { font-size: 130px; font-weight: 900; color: var(--red); letter-spacing: 2px; line-height: 1; text-shadow: 0 0 60px rgba(239,68,68,0.5), 0 0 120px rgba(239,68,68,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.4s forwards, glitchShift 3s ease-in-out 1s infinite; opacity: 0; }
@keyframes glitchShift { 0%,90%,100% { transform: translateX(0); } 92% { transform: translateX(-4px); text-shadow: 0 0 60px rgba(239,68,68,0.5), 2px 0 var(--blue); } 94% { transform: translateX(4px); text-shadow: 0 0 60px rgba(239,68,68,0.5), -2px 0 var(--amber); } 96% { transform: translateX(0); } }
.s1 .divider { width: 400px; height: 2px; background: linear-gradient(90deg, transparent, rgba(239,68,68,0.5), transparent); margin: 50px auto; animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; }
.s1 .second-stat { position: absolute; top: 700px; left: 0; right: 0; text-align: center; }
.s1 .big-text2 { font-size: 100px; font-weight: 900; color: var(--amber); letter-spacing: 1px; line-height: 1; text-shadow: 0 0 50px rgba(245,158,11,0.4); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.2s forwards; opacity: 0; }
.s1 .glitch-flash { position: absolute; inset: 0; pointer-events: none; animation: glitchFlash 0.3s ease-out 0.4s; opacity: 0; }
@keyframes glitchFlash { 0% { opacity: 0; } 10% { opacity: 1; background: rgba(239,68,68,0.08); } 20% { opacity: 0; } 30% { opacity: 1; background: rgba(77,139,255,0.06); } 40% { opacity: 0; } 100% { opacity: 0; } }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="glitch-flash"></div>
  <div class="alert-bar"><span class="dot"></span><span class="text">DISTILLATION ALERT</span></div>
  <div class="headline"><div class="big-text">${line1}</div></div>
  <div class="divider"></div>
  <div class="second-stat"><div class="big-text2">${line2}</div></div>
</div></body></html>`;
}

/* ── S2: Contrast — surface vs deep theft ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};
  const left = txt.left || [];
  const right = txt.right || [];
  const leftHtml = left
    .map((item, i) => `<div class="item" style="animation-delay: ${0.5 + i * 0.2}s;">${item}</div>`)
    .join("");
  const rightHtml = right
    .map((item, i) => `<div class="item" style="animation-delay: ${1.2 + i * 0.2}s;">${item}</div>`)
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s2 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s2 .glow-red { top: 50%; left: -300px; transform: translateY(-50%); width: 700px; height: 700px; }
.s2 .title { font-size: 52px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s2 .cols { display: flex; gap: 40px; align-items: stretch; }
.s2 .col { flex: 1; }
.s2 .col-title { font-size: 28px; font-weight: 800; letter-spacing: 3px; margin-bottom: 24px; padding: 12px 20px; border-radius: 8px; text-align: center; animation: fadeIn 0.3s ease-out 0.3s forwards; opacity: 0; }
.s2 .col.left .col-title { background: rgba(239,68,68,0.15); color: var(--red); border: 1px solid rgba(239,68,68,0.3); }
.s2 .col.right .col-title { background: rgba(245,158,11,0.12); color: var(--amber); border: 1px solid rgba(245,158,11,0.3); }
.s2 .item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 28px 32px; margin-bottom: 16px; border-radius: 10px; font-size: 38px; font-weight: 800; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s2 .col.left .item { border-left: 4px solid var(--red); text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.4); }
.s2 .col.right .item { border-left: 4px solid var(--amber); }
.s2 .arrow { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 60px; font-weight: 900; color: var(--muted); animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; z-index: 10; }
</style></head><body>
<div class="scene s2"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">NOT JUST COPYING ANSWERS</div>
  <div class="cols"><div class="col left"><div class="col-title">SURFACE LEVEL</div>${leftHtml}</div><div class="col right"><div class="col-title">WHAT THEY STOLE</div>${rightHtml}</div></div>
  <div class="arrow">→</div>
</div></body></html>`;
}

/* ── S3: Timeline — the cracking sequence ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};
  const events = txt.events || [];
  const eventsHtml = events
    .map((e, i) => {
      const isLast = i === events.length - 1;
      return `<div class="step" style="animation-delay: ${0.3 + i * 0.6}s;"><div class="step-num">${e.date || ""}</div><div class="step-text">${e.text || ""}</div>${isLast ? "" : '<div class="step-arrow">↓</div>'}</div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s3 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s3 .glow-red { top: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 60%); }
.s3 .title { font-size: 44px; font-weight: 800; color: var(--sec); letter-spacing: 3px; margin-bottom: 50px; animation: fadeIn 0.3s ease-out 0.1s forwards; opacity: 0; }
.s3 .title .hl { color: var(--red); }
.s3 .flow { display: flex; flex-direction: column; align-items: center; gap: 0; }
.s3 .step { display: flex; flex-direction: column; align-items: center; animation: stampIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
.s3 .step-num { font-size: 26px; font-weight: 800; color: var(--blue); letter-spacing: 3px; padding: 8px 24px; border: 2px solid rgba(77,139,255,0.3); border-radius: 8px; background: rgba(77,139,255,0.06); margin-bottom: 12px; }
.s3 .step-text { font-size: 44px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-align: center; }
.s3 .step:nth-child(3) .step-num { color: var(--amber); border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.06); }
.s3 .step:nth-child(4) .step-num { color: var(--red); border-color: rgba(239,68,68,0.4); background: rgba(239,68,68,0.08); }
.s3 .step-arrow { font-size: 36px; color: var(--muted); margin: 16px 0; animation: fadeIn 0.3s ease-out forwards; opacity: 0; }
.s3 .cost { margin-top: 40px; text-align: center; font-size: 32px; font-weight: 700; color: var(--sec); animation: fadeIn 0.5s ease-out 2.8s forwards; opacity: 0; }
.s3 .cost .hl { color: var(--red); font-weight: 900; }
</style></head><body>
<div class="scene s3"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">THE <span class="hl">CRACK</span> SEQUENCE</div>
  <div class="flow">${eventsHtml}</div>
  <div class="cost">Cost: <span class="hl">tens of thousands of dollars</span></div>
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
      return `<div class="row ${isBiggest ? "biggest" : ""}" style="animation-delay: ${0.3 + i * 0.4}s;">
      <div class="label">${r.label || ""}</div>
      <div class="bar-track"><div class="bar-fill" style="width: ${pct}%; background: linear-gradient(90deg, var(--${color}), rgba(0,0,0,0)); animation-delay: ${0.5 + i * 0.4}s;"></div></div>
      <div class="value" style="color: var(--${color});">${r.value || ""}</div>
    </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s4 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s4 .glow-red { top: -150px; right: -200px; width: 800px; height: 800px; }
.s4 .title { font-size: 38px; font-weight: 800; color: var(--sec); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s4 .title .hl { color: var(--red); }
.s4 .table { display: flex; flex-direction: column; gap: 20px; }
.s4 .row { display: flex; align-items: center; gap: 24px; animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s4 .row .label { width: 280px; font-size: 36px; font-weight: 800; color: var(--white); text-align: right; }
.s4 .row.biggest .label { color: var(--red); }
.s4 .bar-track { flex: 1; height: 56px; background: rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden; position: relative; }
.s4 .bar-fill { height: 100%; border-radius: 8px; animation: barGrow 0.6s cubic-bezier(0.16,1,0.3,1) forwards; width: 0; }
@keyframes barGrow { from { width: 0; } }
.s4 .row .value { width: 120px; font-size: 44px; font-weight: 900; text-align: left; }
.s4 .row.biggest .value { text-shadow: 0 0 20px rgba(239,68,68,0.4); }
.s4 .footer { margin-top: 40px; text-align: center; font-size: 28px; font-weight: 700; color: var(--muted); letter-spacing: 2px; animation: fadeIn 0.5s ease-out 2.5s forwards; opacity: 0; }
</style></head><body>
<div class="scene s4"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">${t(txt, "title")}</div>
  <div class="table">${rowsHtml}</div>
  <div class="footer">SOURCE: ANTHROPIC · FEBRUARY 2026</div>
</div></body></html>`;
}

/* ── S5: Quote — crypto blog confirmation ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s5 { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 80px; }
.s5 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s5 .quote-mark { font-size: 200px; font-weight: 900; color: rgba(77,139,255,0.15); line-height: 0.8; margin-bottom: -40px; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s5 .quote { font-size: 52px; font-weight: 700; color: var(--white); text-align: center; line-height: 1.4; max-width: 800px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
.s5 .quote .hl { color: var(--blue); font-weight: 900; }
.s5 .source { margin-top: 60px; font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
.s5 .source .hl { color: var(--amber); }
.s5 .verified { margin-top: 30px; display: flex; align-items: center; gap: 12px; padding: 16px 32px; border: 2px solid rgba(52,211,153,0.3); border-radius: 10px; background: rgba(52,211,153,0.06); animation: stampIn 0.4s ease-out 2.0s forwards; opacity: 0; }
.s5 .verified .check { color: var(--green); font-size: 32px; }
.s5 .verified .text { font-size: 28px; font-weight: 800; color: var(--green); letter-spacing: 2px; }
</style></head><body>
<div class="scene s5"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="quote-mark">"</div>
  <div class="quote">${t(txt, "quote")}</div>
  <div class="source">${t(txt, "source")}</div>
  <div class="verified"><span class="check">✓</span><span class="text">INDEPENDENTLY CONFIRMED</span></div>
</div></body></html>`;
}

/* ── S6: Contrast — named vs not named ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};
  const left = txt.left || [];
  const right = txt.right || [];
  const leftHtml = left
    .map((item, i) => `<div class="item" style="animation-delay: ${0.4 + i * 0.2}s;">${item}</div>`)
    .join("");
  const rightHtml = right
    .map((item, i) => `<div class="item" style="animation-delay: ${1.0 + i * 0.2}s;">${item}</div>`)
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s6 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s6 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s6 .cols { display: flex; gap: 40px; }
.s6 .col { flex: 1; }
.s6 .col-title { font-size: 30px; font-weight: 800; letter-spacing: 3px; margin-bottom: 24px; padding: 14px 24px; border-radius: 8px; text-align: center; animation: fadeIn 0.3s ease-out 0.3s forwards; opacity: 0; }
.s6 .col.left .col-title { background: rgba(239,68,68,0.12); color: var(--red); border: 1px solid rgba(239,68,68,0.3); }
.s6 .col.right .col-title { background: rgba(245,158,11,0.08); color: var(--amber); border: 1px solid rgba(245,158,11,0.2); }
.s6 .item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 28px 32px; margin-bottom: 16px; border-radius: 10px; font-size: 40px; font-weight: 800; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s6 .col.left .item { border-left: 4px solid var(--red); }
.s6 .col.right .item { border-left: 4px solid var(--amber); color: var(--sec); }
.s6 .col.right .item:first-of-type { font-size: 30px; color: var(--amber); }
.s6 .note { margin-top: 40px; text-align: center; font-size: 32px; font-style: italic; color: var(--sec); animation: fadeIn 0.5s ease-out 2.0s forwards; opacity: 0; }
.s6 .note .hl { color: var(--white); font-style: normal; font-weight: 700; }
</style></head><body>
<div class="scene s6"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">SELECTIVE ACCUSATIONS</div>
  <div class="cols"><div class="col left"><div class="col-title">${left[0] || "NAMED"}</div>${left
    .slice(1)
    .map((item, i) => `<div class="item" style="animation-delay: ${0.4 + i * 0.2}s;">${item}</div>`)
    .join(
      "",
    )}</div><div class="col right"><div class="col-title">${right[0] || "NOT NAMED"}</div>${right
    .slice(1)
    .map((item, i) => `<div class="item" style="animation-delay: ${1.0 + i * 0.2}s;">${item}</div>`)
    .join("")}</div></div>
  <div class="note">Moonshot <span class="hl">never responded publicly</span></div>
</div></body></html>`;
}

/* ── S7: Teaser — Part 2 ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s7 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s7 .glow-red { top: 50%; left: 50%; transform: translate(-50%, -50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 60%); }
.s7 .part-label { font-size: 36px; font-weight: 700; color: var(--sec); letter-spacing: 6px; margin-bottom: 20px; animation: fadeIn 0.4s ease-out 0.1s forwards; opacity: 0; }
.s7 .big-text { font-size: 100px; font-weight: 900; color: var(--amber); letter-spacing: 4px; text-shadow: 0 0 50px rgba(245,158,11,0.4), 0 0 100px rgba(245,158,11,0.2); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s forwards; opacity: 0; }
.s7 .divider { width: 300px; height: 2px; background: linear-gradient(90deg, transparent, var(--amber), transparent); margin: 40px auto; animation: fadeIn 0.5s ease-out 0.8s forwards; opacity: 0; }
.s7 .teaser { font-size: 44px; font-weight: 800; color: var(--white); text-align: center; max-width: 800px; line-height: 1.3; animation: slideUp 0.5s ease-out 1.0s forwards; opacity: 0; }
.s7 .teaser .hl { color: var(--red); }
.s7 .countdown { margin-top: 50px; font-size: 28px; font-weight: 700; color: var(--muted); letter-spacing: 4px; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="part-label">COMING NEXT</div>
  <div class="big-text">${t(txt, "line1")}</div>
  <div class="divider"></div>
  <div class="teaser">${t(txt, "line2")}</div>
  <div class="countdown">SUBSCRIBE TO NOT MISS IT</div>
</div></body></html>`;
}

/* ── S8: CTA — channel brand close ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s8 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s8 .brand-logo-large { width: 130px; height: 130px; margin-bottom: 30px; filter: drop-shadow(0 0 30px rgba(77,139,255,0.4)); animation: scaleIn 0.6s ease-out 0.1s forwards, logoPulse 3s ease-in-out 1s infinite; opacity: 0; }
@keyframes logoPulse { 0%,100% { filter: drop-shadow(0 0 30px rgba(77,139,255,0.4)); } 50% { filter: drop-shadow(0 0 50px rgba(77,139,255,0.6)); } }
.s8 .brand-logo-large svg { width: 100%; height: 100%; }
.s8 .brand-name { font-size: 72px; font-weight: 900; color: var(--white); letter-spacing: 4px; margin-bottom: 16px; animation: scaleIn 0.6s ease-out 0.3s forwards; opacity: 0; }
.s8 .brand-name .hl { color: var(--blue); }
.s8 .tagline { font-size: 32px; font-weight: 600; color: var(--sec); letter-spacing: 3px; margin-bottom: 80px; animation: fadeIn 0.5s ease-out 0.7s forwards; opacity: 0; }
.s8 .line1 { font-size: 64px; font-weight: 800; color: var(--amber); letter-spacing: 2px; margin-bottom: 16px; animation: slideUp 0.5s ease-out 1.0s forwards; opacity: 0; text-shadow: 0 0 30px rgba(245,158,11,0.4); }
.s8 .subscribe { position: absolute; bottom: 120px; text-align: center; font-size: 30px; font-weight: 700; color: var(--muted); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.4s forwards; opacity: 0; }
.s8 .fade-to-black { position: absolute; inset: 0; background: #050508; pointer-events: none; animation: fadeOut 0.8s ease-in ${Math.max(duration - 1.2, 1.5).toFixed(1)}s forwards; opacity: 0; }
@keyframes fadeOut { to { opacity: 1; } }
</style></head><body>
<div class="scene s8"><div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="brand-logo-large">${BRAND_MARK_SVG}</div>
  <div class="brand-name">${t(txt, "brand").replace("AI", '<span class="hl">AI</span>')}</div>
  ${t(txt, "tagline") ? `<div class="tagline">${txt.tagline}</div>` : ""}
  ${t(txt, "line1") ? `<div class="line1">${txt.line1}</div>` : ""}
  <div class="subscribe">SUBSCRIBE FOR MORE</div>
  <div class="fade-to-black"></div>
</div></body></html>`;
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
