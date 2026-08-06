/**
 * Restraint pt1 visual scene templates — "Vision Over KPIs"
 * 11 unique scenes for the DeepSeek Art of Restraint video.
 *
 * Visual DNA: philosophical intelligence briefing aesthetic.
 *   - Blue-dominant glow (DeepSeek identity, wisdom/intelligence)
 *   - Amber for key data highlights (price cuts, stats)
 *   - Clean, authoritative — no glitch/breach energy
 *   - DeepSeek logo used where relevant
 *   - Stamp-in animations for impact numbers
 *
 * Each scene reads display text from scene.texts.
 * Shared visual system (CSS, brand assets, animations) from lib/base-styles.mjs.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  baseStyles,
  BRAND_MARK_SVG,
  withWatermark,
} from "../../../lib/base-styles.mjs";

// DeepSeek company logo (full lockup: whale icon + wordmark)
const DEEPSEEK_LOGO_SVG = readFileSync(
  new URL("../../../assets/logos/deepseek.svg", import.meta.url),
  "utf8",
)
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!--[\s\S]*?-->/g, "");

// DeepSeek whale icon only (square-ish, for large display)
const DEEPSEEK_ICON_SVG = readFileSync(
  new URL("../../../assets/logos/deepseek-icon.svg", import.meta.url),
  "utf8",
)
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!--[\s\S]*?-->/g, "");

// Safe text accessor
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — T6 Bold Claim (three-layer open, first-frame striking) ── */
function scene1(scene, duration) {
  const d = Math.max(duration, 5).toFixed(1);
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s1 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s1 .scan-sweep { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, rgba(77,139,255,0.8), transparent); box-shadow: 0 0 20px rgba(77,139,255,0.5); animation: scanSweep ${d}s linear infinite; z-index: 50; }
@keyframes scanSweep { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
/* Brand bar — appears quickly (0.1s delay, not 0.5s) */
.s1 .brand-bar { position: absolute; top: 80px; left: 60px; right: 60px; display: flex; align-items: center; gap: 16px; animation: slideDown 0.3s ease-out 0.1s forwards; opacity: 0; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
.s1 .brand-bar .b-logo { width: 48px; height: 48px; } .s1 .brand-bar .b-logo svg { width: 100%; height: 100%; }
.s1 .brand-bar .b-text { font-size: 24px; font-weight: 900; color: var(--white); letter-spacing: 3px; } .s1 .brand-bar .b-text .hl { color: var(--blue); }
.s1 .brand-bar .briefing-tag { margin-left: auto; font-size: 16px; font-weight: 700; color: var(--sec); letter-spacing: 2px; padding: 5px 12px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; }
/* HOOK TEXT — visible from frame 1 (no delay), bold and large */
.s1 .hook-text { position: absolute; top: 380px; left: 0; right: 0; text-align: center; font-size: 78px; font-weight: 900; color: var(--white); letter-spacing: 2px; line-height: 1.1; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out forwards; }
@keyframes hookIn { from { opacity: 0; transform: scale(1.1); } to { opacity: 1; transform: scale(1); } }
/* DS logo row — appears at 0.3s, large and bright for subject visibility */
.s1 .ds-row { position: absolute; top: 180px; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 20px; animation: fadeIn 0.3s ease-out 0.3s forwards; opacity: 0; }
.s1 .ds-row .ds-logo { width: 120px; height: 120px; filter: drop-shadow(0 0 25px rgba(77,139,255,0.3)); } .s1 .ds-row .ds-logo svg { width: 100%; height: 100%; }
.s1 .ds-row .ds-text { font-size: 80px; font-weight: 900; color: var(--white); letter-spacing: 4px; text-shadow: 0 0 30px rgba(77,139,255,0.4); }
/* Reveal text — the payoff, appears at 1.5s */
.s1 .reveal-text { position: absolute; top: 700px; left: 0; right: 0; text-align: center; font-size: 100px; font-weight: 900; color: var(--blue); letter-spacing: 4px; line-height: 1; text-shadow: 0 0 60px rgba(77,139,255,0.5), 0 0 120px rgba(77,139,255,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.5s forwards, glowPulse 2s ease-in-out 2.2s infinite; opacity: 0; }
@keyframes glowPulse { 0%,100% { text-shadow: 0 0 60px rgba(77,139,255,0.5), 0 0 120px rgba(77,139,255,0.3); } 50% { text-shadow: 0 0 80px rgba(77,139,255,0.7), 0 0 160px rgba(77,139,255,0.4); } }
.s1 .source-badge { position: absolute; bottom: 120px; left: 0; right: 0; text-align: center; font-size: 22px; font-weight: 700; color: var(--muted); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 2.0s forwards; opacity: 0; }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="scan-sweep"></div>
  <div class="brand-bar"><div class="b-logo">${BRAND_MARK_SVG}</div><div class="b-text">CHINA <span class="hl">AI</span> NEWS</div><div class="briefing-tag">INTELLIGENCE BRIEFING</div></div>
  <div class="ds-row"><div class="ds-logo">${DEEPSEEK_ICON_SVG}</div><div class="ds-text">DEEPSEEK</div></div>
  <div class="hook-text">${t(txt, "hookText")}</div>
  <div class="reveal-text">${t(txt, "revealText")}</div>
  <div class="source-badge">SOURCE: ${t(txt, "source")}</div>
</div></body></html>`;
}

/* ── S2: Intro — person introduction ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s2 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s2 .glow-blue { top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(77,139,255,0.15) 0%, transparent 60%); }
.s2 .badge { position: absolute; top: 120px; left: 50%; transform: translateX(-50%); background: rgba(77,139,255,0.15); border: 1px solid rgba(77,139,255,0.4); color: var(--blue); padding: 12px 36px; font-size: 24px; font-weight: 800; letter-spacing: 4px; border-radius: 8px; animation: slideDown 0.4s ease-out 0.1s forwards; opacity: 0; }
.s2 .ds-logo-large { width: 120px; height: 120px; margin-bottom: 40px; filter: drop-shadow(0 0 30px rgba(77,139,255,0.3)); animation: scaleIn 0.6s ease-out 0.3s forwards; opacity: 0; }
.s2 .ds-logo-large svg { width: 100%; height: 100%; }
.s2 .person-name { font-size: 80px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 16px; animation: slideUp 0.5s ease-out 0.6s forwards; opacity: 0; }
.s2 .person-role { font-size: 36px; font-weight: 700; color: var(--blue); letter-spacing: 3px; margin-bottom: 60px; animation: slideUp 0.5s ease-out 0.8s forwards; opacity: 0; }
.s2 .meeting-info { display: flex; flex-direction: column; align-items: center; gap: 16px; animation: fadeIn 0.5s ease-out 1.2s forwards; opacity: 0; }
.s2 .meeting-info .duration { font-size: 100px; font-weight: 900; color: var(--amber); letter-spacing: -2px; text-shadow: 0 0 40px rgba(245,158,11,0.4); }
.s2 .meeting-info .duration-label { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 3px; }
.s2 .source-tag { position: absolute; bottom: 120px; left: 0; right: 0; text-align: center; font-size: 22px; font-weight: 700; color: var(--muted); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.8s forwards; opacity: 0; }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="badge">${t(txt, "badge")}</div>
  <div class="ds-logo-large">${DEEPSEEK_ICON_SVG}</div>
  <div class="person-name">${t(txt, "person")}</div>
  <div class="person-role">${t(txt, "role")}</div>
  <div class="meeting-info">
    <div class="duration">3.5h</div>
    <div class="duration-label">INVESTOR MEETING</div>
  </div>
  <div class="source-tag">RARE PUBLIC APPEARANCE</div>
</div></body></html>`;
}

/* ── S3: Origin story — transformation ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s3 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s3 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s3 .title { font-size: 44px; font-weight: 800; color: var(--sec); letter-spacing: 3px; margin-bottom: 60px; text-align: center; animation: fadeIn 0.3s ease-out 0.1s forwards; opacity: 0; }
.s3 .transform-row { display: flex; align-items: center; justify-content: center; gap: 40px; }
.s3 .card { flex: 1; border-radius: 16px; padding: 50px 40px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s3 .card.before { background: rgba(71,85,105,0.08); border: 2px solid rgba(71,85,105,0.3); animation-delay: 0.3s; }
.s3 .card.after { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.4); animation-delay: 1.0s; box-shadow: 0 0 40px rgba(77,139,255,0.15); }
.s3 .card .label { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 3px; margin-bottom: 20px; }
.s3 .card .text { font-size: 36px; font-weight: 900; line-height: 1.3; letter-spacing: 1px; word-break: break-word; }
.s3 .card.before .text { color: var(--muted); }
.s3 .card.after .text { color: var(--blue); text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s3 .arrow { font-size: 80px; font-weight: 900; color: var(--amber); animation: fadeIn 0.4s ease-out 0.7s forwards; opacity: 0; text-shadow: 0 0 20px rgba(245,158,11,0.4); }
.s3 .bottom-note { margin-top: 60px; text-align: center; font-size: 32px; font-weight: 700; color: var(--white); letter-spacing: 2px; animation: slideUp 0.5s ease-out 1.5s forwards; opacity: 0; }
.s3 .bottom-note .hl { color: var(--amber); }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">THE ORIGIN</div>
  <div class="transform-row">
    <div class="card before"><div class="label">STARTED AS</div><div class="text">${t(txt, "group")}</div></div>
    <div class="arrow">${t(txt, "arrow")}</div>
    <div class="card after"><div class="label">BECAME</div><div class="text">${t(txt, "mission")}</div></div>
  </div>
  <div class="bottom-note">No money. No chips. No fame. Just <span class="hl">one goal</span>.</div>
</div></body></html>`;
}

/* ── S4: Price cut — data reveal ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s4 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s4 .glow-amber { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 60%); border-radius: 50%; }
.s4 .context-tag { position: absolute; top: 120px; left: 0; right: 0; text-align: center; font-size: 28px; font-weight: 800; color: var(--sec); letter-spacing: 4px; animation: fadeIn 0.4s ease-out 0.1s forwards; opacity: 0; }
.s4 .big-number { font-size: 280px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.4s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
@keyframes numberPulse { 0%,100% { text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); } 50% { text-shadow: 0 0 80px rgba(245,158,11,0.7), 0 0 160px rgba(245,158,11,0.4); } }
.s4 .label { font-size: 44px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 20px; animation: slideUp 0.5s ease-out 0.8s forwards; opacity: 0; }
.s4 .reaction { margin-top: 60px; display: flex; align-items: center; gap: 16px; padding: 20px 40px; border: 2px solid rgba(52,211,153,0.3); border-radius: 12px; background: rgba(52,211,153,0.06); animation: stampIn 0.4s ease-out 1.3s forwards; opacity: 0; }
.s4 .reaction .icon { font-size: 40px; }
.s4 .reaction .text { font-size: 36px; font-weight: 900; color: var(--green); letter-spacing: 2px; }
.s4 .source { position: absolute; bottom: 120px; left: 0; right: 0; text-align: center; font-size: 22px; font-weight: 700; color: var(--muted); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.8s forwards; opacity: 0; }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
  <div class="context-tag">${t(txt, "context")}</div>
  <div class="big-number">${t(txt, "change")}</div>
  <div class="label">PRICE CUT</div>
  <div class="reaction"><span class="icon">🎉</span><span class="text">${t(txt, "reaction")}</span></div>
  <div class="source">SOURCE: LIANG WENFENG</div>
</div></body></html>`;
}

/* ── S5: Quote — philosophical ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s5 { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 80px; }
.s5 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s5 .quote-mark { font-size: 200px; font-weight: 900; color: rgba(77,139,255,0.15); line-height: 0.8; margin-bottom: -40px; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s5 .quote { font-size: 64px; font-weight: 800; color: var(--white); text-align: center; line-height: 1.3; max-width: 850px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
.s5 .quote .hl { color: var(--blue); font-weight: 900; }
.s5 .speaker { margin-top: 60px; font-size: 36px; font-weight: 800; color: var(--white); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s5 .source { margin-top: 12px; font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
.s5 .accent-line { width: 200px; height: 3px; background: linear-gradient(90deg, transparent, var(--blue), transparent); margin-top: 40px; animation: fadeIn 0.5s ease-out 1.7s forwards; opacity: 0; }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="quote-mark">"</div>
  <div class="quote">${t(txt, "quote")}</div>
  <div class="speaker">${t(txt, "speaker")}</div>
  <div class="source">${t(txt, "source")}</div>
  <div class="accent-line"></div>
</div></body></html>`;
}

/* ── S6: Contrast — slogan vs action ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s6 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s6 .title { font-size: 44px; font-weight: 800; color: var(--sec); letter-spacing: 3px; margin-bottom: 60px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s6 .cols { display: flex; gap: 40px; align-items: stretch; }
.s6 .col { flex: 1; border-radius: 16px; padding: 50px 40px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s6 .col.wrong { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); animation-delay: 0.3s; }
.s6 .col.right { background: rgba(77,139,255,0.06); border: 2px solid rgba(77,139,255,0.3); animation-delay: 0.8s; }
.s6 .col .col-icon { font-size: 60px; margin-bottom: 24px; }
.s6 .col .col-text { font-size: 32px; font-weight: 900; letter-spacing: 1px; line-height: 1.3; word-break: break-word; }
.s6 .col.wrong .col-text { color: var(--muted); text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.4); text-decoration-thickness: 4px; }
.s6 .col.right .col-text { color: var(--blue); text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s6 .vs-circle { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70px; height: 70px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; color: var(--muted); animation: fadeIn 0.4s ease-out 0.6s forwards; opacity: 0; z-index: 10; background: #050508; }
.s6 .note { margin-top: 50px; text-align: center; font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 1px; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s6 .note .hl { color: var(--white); font-weight: 800; }
</style></head><body>
<div class="scene s6">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">VISION IS NOT</div>
  <div class="cols">
    <div class="col wrong"><div class="col-icon">📋</div><div class="col-text">${t(txt, "left")}</div></div>
    <div class="col right"><div class="col-icon">⚡</div><div class="col-text">${t(txt, "right")}</div></div>
  </div>
  <div class="vs-circle">${t(txt, "vs")}</div>
  <div class="note"><span class="hl">Unwritten</span>, but everyone feels it</div>
</div></body></html>`;
}

/* ── S7: Context — Jack Welch reference ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s7 { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 80px; }
.s7 .glow-blue { top: -150px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s7 .ref-label { font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 4px; margin-bottom: 30px; animation: fadeIn 0.4s ease-out 0.1s forwards; opacity: 0; }
.s7 .person-card { display: flex; align-items: center; gap: 32px; padding: 40px 50px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); animation: slideUp 0.5s ease-out 0.3s forwards; opacity: 0; margin-bottom: 50px; }
.s7 .person-card .avatar { width: 100px; height: 100px; border-radius: 50%; background: rgba(77,139,255,0.1); border: 3px solid rgba(77,139,255,0.3); display: flex; align-items: center; justify-content: center; font-size: 48px; font-weight: 900; color: var(--blue); }
.s7 .person-card .info .name { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 1px; }
.s7 .person-card .info .role { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
.s7 .quote-box { max-width: 800px; text-align: center; animation: slideUp 0.5s ease-out 0.7s forwards; opacity: 0; }
.s7 .quote-box .text { font-size: 56px; font-weight: 900; color: var(--amber); letter-spacing: 2px; line-height: 1.2; text-shadow: 0 0 30px rgba(245,158,11,0.3); }
.s7 .quote-box .context { margin-top: 24px; font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 1px; }
.s7 .quote-box .context .hl { color: var(--white); }
.s7 .attribution { margin-top: 40px; font-size: 24px; font-weight: 700; color: var(--muted); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.2s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="ref-label">LIANG CITES</div>
  <div class="person-card">
    <div class="avatar">JW</div>
    <div class="info"><div class="name">${t(txt, "person")}</div><div class="role">${t(txt, "role")}</div></div>
  </div>
  <div class="quote-box">
    <div class="text">${t(txt, "point")}</div>
    <div class="context">Got most things wrong, but <span class="hl">nailed this</span></div>
  </div>
  <div class="attribution">SOURCE: LIANG WENFENG</div>
</div></body></html>`;
}

/* ── S8: Open source paradox — concept/stat ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s8 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s8 .glow-blue { top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(77,139,255,0.15) 0%, transparent 60%); }
.s8 .ds-logo-large { width: 100px; height: 100px; margin-bottom: 30px; filter: drop-shadow(0 0 25px rgba(77,139,255,0.3)); animation: scaleIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s8 .ds-logo-large svg { width: 100%; height: 100%; }
.s8 .action-text { font-size: 48px; font-weight: 800; color: var(--blue); letter-spacing: 3px; margin-bottom: 50px; animation: slideUp 0.4s ease-out 0.5s forwards; opacity: 0; }
.s8 .big-stat { font-size: 240px; font-weight: 900; color: var(--amber); letter-spacing: -8px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.8s forwards, numberPulse 2s ease-in-out 1.5s infinite; opacity: 0; }
@keyframes numberPulse { 0%,100% { text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); } 50% { text-shadow: 0 0 80px rgba(245,158,11,0.7), 0 0 160px rgba(245,158,11,0.4); } }
.s8 .stat-context { font-size: 44px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 16px; animation: slideUp 0.5s ease-out 1.1s forwards; opacity: 0; }
.s8 .conclusion { margin-top: 50px; font-size: 36px; font-weight: 700; color: var(--sec); letter-spacing: 2px; text-align: center; max-width: 800px; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
.s8 .conclusion .hl { color: var(--red); font-weight: 900; }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="ds-logo-large">${DEEPSEEK_ICON_SVG}</div>
  <div class="action-text">${t(txt, "action")}</div>
  <div class="big-stat">${t(txt, "stat")}</div>
  <div class="stat-context">${t(txt, "context")}</div>
  <div class="conclusion">You <span class="hl">can't monopolize</span> that</div>
</div></body></html>`;
}

/* ── S9: Comparison — DeepSeek vs Zhipu ── */
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s9 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s9 .title { font-size: 44px; font-weight: 800; color: var(--sec); letter-spacing: 3px; margin-bottom: 60px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s9 .title .hl { color: var(--white); }
.s9 .versus { display: flex; align-items: center; justify-content: center; gap: 40px; margin-bottom: 50px; }
.s9 .comp-card { flex: 1; border-radius: 16px; padding: 50px 32px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s9 .comp-card.intentional { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.4); animation-delay: 0.3s; box-shadow: 0 0 40px rgba(77,139,255,0.1); }
.s9 .comp-card.forced { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); animation-delay: 0.7s; }
.s9 .comp-card .name { font-size: 40px; font-weight: 800; color: var(--sec); letter-spacing: 2px; margin-bottom: 16px; }
.s9 .comp-card .verdict { font-size: 38px; font-weight: 900; letter-spacing: 1px; line-height: 1.2; word-break: break-word; }
.s9 .comp-card.intentional .verdict { color: var(--blue); text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s9 .comp-card.forced .verdict { color: var(--red); }
.s9 .comp-card .check { font-size: 36px; margin-top: 20px; }
.s9 .comp-card.intentional .check { color: var(--green); }
.s9 .comp-card.forced .check { color: var(--muted); }
.s9 .vs-circle { width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; color: var(--muted); animation: fadeIn 0.4s ease-out 0.5s forwards; opacity: 0; flex-shrink: 0; background: #050508; }
.s9 .insight { text-align: center; font-size: 34px; font-weight: 700; color: var(--white); letter-spacing: 1px; animation: fadeIn 0.5s ease-out 1.2s forwards; opacity: 0; max-width: 800px; margin: 0 auto; }
.s9 .insight .hl { color: var(--blue); font-weight: 900; }
</style></head><body>
<div class="scene s9">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">BOTH <span class="hl">OPEN SOURCE</span></div>
  <div class="versus">
    <div class="comp-card intentional">
      <div class="name">${t(txt, "deepseekLabel")}</div>
      <div class="verdict">${t(txt, "deepseek")}</div>
      <div class="check">✓</div>
    </div>
    <div class="vs-circle">VS</div>
    <div class="comp-card forced">
      <div class="name">${t(txt, "glmLabel")}</div>
      <div class="verdict">${t(txt, "glm")}</div>
      <div class="check">✗</div>
    </div>
  </div>
  <div class="insight">For DeepSeek, it's <span class="hl">intentional</span>. The vision requires it.</div>
</div></body></html>`;
}

/* ── S10: Summary — key points + teaser ── */
function scene10(scene, duration) {
  const txt = scene.texts || {};
  const points = txt.points || [];
  const pointsHtml = points
    .map(
      (p, i) =>
        `<div class="point" style="animation-delay: ${0.3 + i * 0.4}s;"><span class="num">${i + 1}</span><span class="text">${p}</span></div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s10 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s10 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 700px; height: 700px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s10 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 3px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s10 .title .hl { color: var(--blue); }
.s10 .points { display: flex; flex-direction: column; gap: 24px; margin-bottom: 60px; }
.s10 .point { display: flex; align-items: center; gap: 28px; padding: 32px 40px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-left: 5px solid var(--blue); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s10 .point .num { font-size: 56px; font-weight: 900; color: var(--blue); line-height: 0.9; width: 60px; flex-shrink: 0; }
.s10 .point .text { font-size: 40px; font-weight: 800; color: var(--white); letter-spacing: 1px; }
.s10 .teaser-box { text-align: center; padding: 30px 50px; border: 2px solid rgba(245,158,11,0.3); border-radius: 14px; background: rgba(245,158,11,0.06); animation: stampIn 0.5s ease-out 1.8s forwards; opacity: 0; }
.s10 .teaser-box .text { font-size: 42px; font-weight: 900; color: var(--amber); letter-spacing: 3px; text-shadow: 0 0 30px rgba(245,158,11,0.3); }
.s10 .teaser-box .when { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 8px; }
</style></head><body>
<div class="scene s10">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">DEEPSEEK'S <span class="hl">PLAYBOOK</span></div>
  <div class="points">${pointsHtml}</div>
  <div class="teaser-box">
    <div class="text">${t(txt, "teaser")}</div>
    <div class="when">TOMORROW</div>
  </div>
</div></body></html>`;
}

/* ── S11: CTA — brand close ── */
function scene11(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s11 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s11 .brand-logo-large { width: 130px; height: 130px; margin-bottom: 30px; filter: drop-shadow(0 0 30px rgba(77,139,255,0.4)); animation: scaleIn 0.6s ease-out 0.1s forwards, logoPulse 3s ease-in-out 1s infinite; opacity: 0; }
@keyframes logoPulse { 0%,100% { filter: drop-shadow(0 0 30px rgba(77,139,255,0.4)); } 50% { filter: drop-shadow(0 0 50px rgba(77,139,255,0.6)); } }
.s11 .brand-logo-large svg { width: 100%; height: 100%; }
.s11 .brand-name { font-size: 72px; font-weight: 900; color: var(--white); letter-spacing: 4px; margin-bottom: 16px; animation: scaleIn 0.6s ease-out 0.3s forwards; opacity: 0; }
.s11 .brand-name .hl { color: var(--blue); }
.s11 .tagline { font-size: 32px; font-weight: 600; color: var(--sec); letter-spacing: 3px; margin-bottom: 80px; animation: fadeIn 0.5s ease-out 0.7s forwards; opacity: 0; }
.s11 .action { font-size: 64px; font-weight: 800; color: var(--amber); letter-spacing: 2px; margin-bottom: 16px; animation: slideUp 0.5s ease-out 1.0s forwards; opacity: 0; text-shadow: 0 0 30px rgba(245,158,11,0.4); }
.s11 .topic { font-size: 36px; font-weight: 700; color: var(--sec); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
.s11 .subscribe { position: absolute; bottom: 120px; text-align: center; font-size: 30px; font-weight: 700; color: var(--muted); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
.s11 .fade-to-black { position: absolute; inset: 0; background: #050508; pointer-events: none; animation: fadeOut 0.8s ease-in ${Math.max(duration - 1.2, 1.5).toFixed(1)}s forwards; opacity: 0; }
@keyframes fadeOut { to { opacity: 1; } }
</style></head><body>
<div class="scene s11">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="brand-logo-large">${BRAND_MARK_SVG}</div>
  <div class="brand-name">${t(txt, "brand").replace("AI", '<span class="hl">AI</span>')}</div>
  <div class="tagline">${t(txt, "tagline")}</div>
  <div class="action">${t(txt, "action")}</div>
  <div class="topic">${t(txt, "topic")}</div>
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
  9: scene9,
  10: scene10,
  11: scene11,
};

/**
 * Generate scene HTML for a Restraint pt1 scene.
 * @param {object} scene - Scene object with id, texts, voiceover
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));
}
