/**
 * Restraint pt1 visual scene templates — "Vision Over KPIs"
 * 11 scenes for the DeepSeek Art of Restraint video. v3 (slot layout).
 *
 * Visual DNA: philosophical intelligence briefing aesthetic.
 *   - Blue-dominant glow (DeepSeek identity, wisdom/intelligence)
 *   - Amber for key data highlights (price cuts, stats)
 *   - Clean, authoritative — no glitch/breach energy
 *   - DeepSeek logo used where relevant
 *   - Stamp-in animations for impact numbers
 *
 * Migration to the slot layout system (spec: spec-video-layout-safe-zones.md):
 * - All scenes assemble content into fixed slots via sceneFrame() from
 *   lib/scene-layout.mjs: kickerTitle (220-400) / hero (400-950) /
 *   support (950-1150). No scene-level flex, no magic bottom padding.
 * - Comparison/contrast scenes (S6/S9) stack VERTICALLY (A/VS/B) — never
 *   side-by-side columns (the "landscape forced into portrait" fix);
 *   the legacy .cols/.vs-circle classes are gone.
 * - Scene 11 (CTA) delegates to the shared ctaScene end card (unchanged).
 *
 * ALL on-screen copy comes from scene.texts (scene-data.mjs) — this file
 * must not contain business copy (drift-guarded by scene-drift.test.mjs).
 * Shared primitives come from lib/scene-templates.mjs; shared keyframes
 * from lib/base-styles.mjs (never redeclared here).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { baseStyles, withWatermark } from "../../../lib/base-styles.mjs";
import {
  templateCss,
  brandBar,
  titleBlock,
  pointsList,
  stampBox,
  highlightSpan,
  ctaScene,
} from "../../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../../lib/scene-layout.mjs";

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
${baseStyles(duration)}${templateCss()}${slotCss()}
.s1 .scan-sweep { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, rgba(77,139,255,0.8), transparent); box-shadow: 0 0 20px rgba(77,139,255,0.5); animation: scanSweep ${d}s linear infinite; z-index: 50; }
@keyframes scanSweep { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
/* DS logo row — appears at 0.2s, large and bright for subject visibility */
.s1 .ds-row { display: flex; align-items: center; justify-content: center; gap: 20px; animation: fadeIn 0.3s ease-out 0.2s forwards; opacity: 0; }
.s1 .ds-row .ds-logo { width: 88px; height: 88px; filter: drop-shadow(0 0 25px rgba(77,139,255,0.3)); } .s1 .ds-row .ds-logo svg { width: 100%; height: 100%; }
.s1 .ds-row .ds-text { font-size: 64px; font-weight: 900; color: var(--white); letter-spacing: 4px; text-shadow: 0 0 30px rgba(77,139,255,0.4); }
/* HOOK TEXT — visible early, bold and large */
.s1 .hook-text { text-align: center; font-size: 64px; font-weight: 900; color: var(--white); letter-spacing: 2px; line-height: 1.1; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 0.4s forwards; opacity: 0; }
/* Reveal text — the payoff, appears at 1.2s */
.s1 .reveal-text { text-align: center; font-size: 84px; font-weight: 900; color: var(--blue); letter-spacing: 4px; line-height: 1; text-shadow: 0 0 60px rgba(77,139,255,0.5), 0 0 120px rgba(77,139,255,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.2s forwards, glowPulse 2s ease-in-out 1.9s infinite; opacity: 0; }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="scan-sweep"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="ds-row"><div class="ds-logo">${DEEPSEEK_ICON_SVG}</div><div class="ds-text">${t(txt, "subject")}</div></div><div class="hook-text">${t(txt, "hookText")}</div><div class="reveal-text">${t(txt, "revealText")}</div>`,
  })}
</div></body></html>`;
}

/* ── S2: Intro — person introduction ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-blue { top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(77,139,255,0.15) 0%, transparent 60%); }
.s2 .badge { background: rgba(77,139,255,0.15); border: 1px solid rgba(77,139,255,0.4); color: var(--blue); padding: 12px 36px; font-size: 24px; font-weight: 800; letter-spacing: 4px; border-radius: 8px; animation: slideDown 0.4s ease-out 0.1s forwards; opacity: 0; }
.s2 .ds-logo-large { width: 100px; height: 100px; margin-bottom: 24px; filter: drop-shadow(0 0 30px rgba(77,139,255,0.3)); animation: scaleIn 0.6s ease-out 0.2s forwards; opacity: 0; }
.s2 .ds-logo-large svg { width: 100%; height: 100%; }
.s2 .person-name { font-size: 68px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 12px; animation: slideUp 0.5s ease-out 0.5s forwards; opacity: 0; }
.s2 .person-role { font-size: 32px; font-weight: 700; color: var(--blue); letter-spacing: 3px; animation: slideUp 0.5s ease-out 0.7s forwards; opacity: 0; }
.s2 .meeting-info { display: flex; flex-direction: column; align-items: center; gap: 8px; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; }
.s2 .meeting-info .duration { font-size: 72px; font-weight: 900; color: var(--amber); letter-spacing: -2px; line-height: 1; text-shadow: 0 0 40px rgba(245,158,11,0.4); }
.s2 .meeting-info .duration-label { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 3px; }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="badge">${t(txt, "badge")}</div>`,
    hero: `<div class="ds-logo-large">${DEEPSEEK_ICON_SVG}</div><div class="person-name">${t(txt, "person")}</div><div class="person-role">${t(txt, "role")}</div>`,
    support: `<div class="meeting-info"><div class="duration">${t(txt, "meetingDuration")}</div><div class="duration-label">${t(txt, "meetingLabel")}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S3: Origin story — transformation ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s3 .transform-row { display: flex; align-items: center; justify-content: center; gap: 40px; }
.s3 .card { flex: 1; border-radius: 16px; padding: 36px 32px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s3 .card.before { background: rgba(71,85,105,0.08); border: 2px solid rgba(71,85,105,0.3); animation-delay: 0.2s; }
.s3 .card.after { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.4); animation-delay: 0.8s; box-shadow: 0 0 40px rgba(77,139,255,0.15); }
.s3 .card .label { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 3px; margin-bottom: 16px; }
.s3 .card .text { font-size: 28px; font-weight: 900; line-height: 1.3; letter-spacing: 1px; word-break: normal; }
.s3 .card.before .text { color: var(--muted); }
.s3 .card.after .text { color: var(--blue); text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s3 .arrow { font-size: 72px; font-weight: 900; color: var(--amber); animation: fadeIn 0.4s ease-out 0.5s forwards; opacity: 0; text-shadow: 0 0 20px rgba(245,158,11,0.4); }
.s3 .bottom-note { text-align: center; font-size: 30px; font-weight: 700; color: var(--white); letter-spacing: 2px; animation: slideUp 0.5s ease-out 1.3s forwards; opacity: 0; }
.s3 .bottom-note .hl { color: var(--amber); }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 40, color: "sec" }),
    hero: `<div class="transform-row"><div class="card before"><div class="label">${t(txt, "beforeLabel")}</div><div class="text">${t(txt, "group")}</div></div><div class="arrow">${t(txt, "arrow")}</div><div class="card after"><div class="label">${t(txt, "afterLabel")}</div><div class="text">${t(txt, "mission")}</div></div></div>`,
    support: `<div class="bottom-note">${highlightSpan(t(txt, "note"), t(txt, "noteHighlight"), "amber")}</div>`,
  })}
</div></body></html>`;
}

/* ── S4: Price cut — data reveal ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-amber { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 60%); border-radius: 50%; }
.s4 .context-tag { font-size: 26px; font-weight: 800; color: var(--sec); letter-spacing: 4px; animation: fadeIn 0.4s ease-out 0.1s forwards; opacity: 0; }
.s4 .big-number { font-size: 220px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.4s forwards, numberPulse 2s ease-in-out 1s infinite; opacity: 0; }
.s4 .reaction-wrap { animation: fadeIn 0.5s ease-out 1.3s forwards; opacity: 0; }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-amber"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="context-tag">${t(txt, "context")}</div>`,
    hero: `<div class="big-number">${t(txt, "change")}</div>`,
    support: `<div class="reaction-wrap">${stampBox({ text: t(txt, "reaction"), color: "green", icon: "✓" })}</div>`,
  })}
</div></body></html>`;
}

/* ── S5: Quote — philosophical ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-blue { bottom: -200px; left: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s5 .quote-mark { font-size: 160px; font-weight: 900; color: rgba(77,139,255,0.15); line-height: 0.8; margin-bottom: -30px; animation: fadeIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s5 .quote { font-size: 52px; font-weight: 800; color: var(--white); text-align: center; line-height: 1.3; max-width: 850px; animation: slideUp 0.6s ease-out 0.5s forwards; opacity: 0; }
.s5 .quote .hl { color: var(--blue); font-weight: 900; }
.s5 .speaker { margin-top: 40px; font-size: 32px; font-weight: 800; color: var(--white); letter-spacing: 2px; text-align: center; animation: fadeIn 0.5s ease-out 1.2s forwards; opacity: 0; }
.s5 .source { margin-top: 8px; font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 3px; text-align: center; animation: fadeIn 0.5s ease-out 1.4s forwards; opacity: 0; }
.s5 .accent-line { width: 200px; height: 3px; background: linear-gradient(90deg, transparent, var(--blue), transparent); margin-top: 28px; animation: fadeIn 0.5s ease-out 1.6s forwards; opacity: 0; }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="quote-mark">"</div><div class="quote">${t(txt, "quote")}</div><div class="speaker">${t(txt, "speaker")}</div><div class="source">${t(txt, "source")}</div><div class="accent-line"></div>`,
  })}
</div></body></html>`;
}

/* ── S6: Contrast — slogan vs action (vertical A/VS/B stack) ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s6 .vstack { display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; }
.s6 .col { width: 680px; border-radius: 16px; padding: 30px 40px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s6 .col.wrong { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); animation-delay: 0.2s; }
.s6 .col.right { background: rgba(77,139,255,0.06); border: 2px solid rgba(77,139,255,0.3); animation-delay: 0.7s; }
.s6 .col .col-icon { font-size: 44px; margin-bottom: 12px; line-height: 1; }
.s6 .col.wrong .col-icon { color: var(--red); }
.s6 .col.right .col-icon { color: var(--blue); }
.s6 .col .col-text { font-size: 30px; font-weight: 900; letter-spacing: 1px; line-height: 1.3; word-break: normal; }
.s6 .col.wrong .col-text { color: var(--muted); text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.4); text-decoration-thickness: 4px; }
.s6 .col.right .col-text { color: var(--blue); text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s6 .vs-mid { width: 64px; height: 64px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: var(--muted); background: #0a0a14; animation: fadeIn 0.4s ease-out 0.5s forwards; opacity: 0; flex-shrink: 0; }
.s6 .note { text-align: center; font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 1px; animation: fadeIn 0.5s ease-out 1.2s forwards; opacity: 0; }
.s6 .note .hl { color: var(--white); font-weight: 800; }
</style></head><body>
<div class="scene s6">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), { center: true, fontSize: 44, color: "sec" }),
    hero: `<div class="vstack"><div class="col wrong"><div class="col-icon">✕</div><div class="col-text">${t(txt, "left")}</div></div><div class="vs-mid">${t(txt, "vs")}</div><div class="col right"><div class="col-icon">✓</div><div class="col-text">${t(txt, "right")}</div></div></div>`,
    support: `<div class="note">${highlightSpan(t(txt, "note"), t(txt, "noteHighlight"), "white")}</div>`,
  })}
</div></body></html>`;
}

/* ── S7: Context — Jack Welch reference ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-blue { top: -150px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s7 .ref-label { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 4px; animation: fadeIn 0.4s ease-out 0.1s forwards; opacity: 0; }
.s7 .person-card { display: flex; align-items: center; gap: 32px; padding: 30px 44px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); animation: slideUp 0.5s ease-out 0.3s forwards; opacity: 0; margin-bottom: 36px; }
.s7 .person-card .avatar { width: 90px; height: 90px; border-radius: 50%; background: rgba(77,139,255,0.1); border: 3px solid rgba(77,139,255,0.3); display: flex; align-items: center; justify-content: center; font-size: 42px; font-weight: 900; color: var(--blue); }
.s7 .person-card .info .name { font-size: 42px; font-weight: 900; color: var(--white); letter-spacing: 1px; }
.s7 .person-card .info .role { font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
.s7 .quote-box { max-width: 800px; text-align: center; animation: slideUp 0.5s ease-out 0.7s forwards; opacity: 0; }
.s7 .quote-box .text { font-size: 46px; font-weight: 900; color: var(--amber); letter-spacing: 2px; line-height: 1.2; text-shadow: 0 0 30px rgba(245,158,11,0.3); }
.s7 .quote-box .context { margin-top: 20px; font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 1px; }
.s7 .quote-box .context .hl { color: var(--white); }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: `<div class="ref-label">${t(txt, "refLabel")}</div>`,
    hero: `<div class="person-card"><div class="avatar">${t(txt, "personInitials")}</div><div class="info"><div class="name">${t(txt, "person")}</div><div class="role">${t(txt, "role")}</div></div></div><div class="quote-box"><div class="text">${t(txt, "point")}</div><div class="context">${highlightSpan(t(txt, "context"), t(txt, "contextHighlight"), "white")}</div></div>`,
  })}
</div></body></html>`;
}

/* ── S8: Open source paradox — concept/stat ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-blue { top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(77,139,255,0.15) 0%, transparent 60%); }
.s8 .ds-logo-large { width: 80px; height: 80px; margin-bottom: 16px; filter: drop-shadow(0 0 25px rgba(77,139,255,0.3)); animation: scaleIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s8 .ds-logo-large svg { width: 100%; height: 100%; }
.s8 .action-text { font-size: 42px; font-weight: 800; color: var(--blue); letter-spacing: 3px; margin-bottom: 24px; animation: slideUp 0.4s ease-out 0.5s forwards; opacity: 0; }
.s8 .big-stat { font-size: 190px; font-weight: 900; color: var(--amber); letter-spacing: -8px; line-height: 0.9; text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.8s forwards, numberPulse 2s ease-in-out 1.5s infinite; opacity: 0; }
.s8 .stat-context { font-size: 40px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 12px; animation: slideUp 0.5s ease-out 1.1s forwards; opacity: 0; }
.s8 .conclusion { font-size: 32px; font-weight: 700; color: var(--sec); letter-spacing: 2px; text-align: center; max-width: 800px; animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
.s8 .conclusion .hl { color: var(--red); font-weight: 900; }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="ds-logo-large">${DEEPSEEK_ICON_SVG}</div><div class="action-text">${t(txt, "action")}</div><div class="big-stat">${t(txt, "stat")}</div><div class="stat-context">${t(txt, "context")}</div>`,
    support: `<div class="conclusion">${highlightSpan(t(txt, "conclusion"), t(txt, "conclusionHighlight"), "red")}</div>`,
  })}
</div></body></html>`;
}

/* ── S9: Comparison — DeepSeek vs Zhipu (vertical A/VS/B stack) ── */
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s9 .glow-blue { bottom: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s9 .vstack { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; }
.s9 .comp-card { width: 680px; border-radius: 16px; padding: 28px 32px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s9 .comp-card.intentional { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.4); animation-delay: 0.2s; box-shadow: 0 0 40px rgba(77,139,255,0.1); }
.s9 .comp-card.forced { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); animation-delay: 0.6s; }
.s9 .comp-card .name { font-size: 30px; font-weight: 800; color: var(--sec); letter-spacing: 2px; margin-bottom: 10px; }
.s9 .comp-card .verdict { font-size: 32px; font-weight: 900; letter-spacing: 1px; line-height: 1.2; word-break: normal; }
.s9 .comp-card.intentional .verdict { color: var(--blue); text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s9 .comp-card.forced .verdict { color: var(--red); }
.s9 .comp-card .check { font-size: 30px; margin-top: 10px; }
.s9 .comp-card.intentional .check { color: var(--green); }
.s9 .comp-card.forced .check { color: var(--muted); }
.s9 .vs-mid { width: 64px; height: 64px; border-radius: 50%; border: 3px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: var(--muted); background: #0a0a14; animation: fadeIn 0.4s ease-out 0.4s forwards; opacity: 0; flex-shrink: 0; }
.s9 .insight { text-align: center; font-size: 32px; font-weight: 700; color: var(--white); letter-spacing: 1px; animation: fadeIn 0.5s ease-out 1.1s forwards; opacity: 0; max-width: 800px; }
.s9 .insight .hl { color: var(--blue); font-weight: 900; }
</style></head><body>
<div class="scene s9">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), {
      center: true,
      fontSize: 44,
      color: "sec",
      highlight: t(txt, "titleHighlight"),
      hlColor: "white",
    }),
    hero: `<div class="vstack"><div class="comp-card intentional"><div class="name">${t(txt, "deepseekLabel")}</div><div class="verdict">${t(txt, "deepseek")}</div><div class="check">✓</div></div><div class="vs-mid">${t(txt, "vs")}</div><div class="comp-card forced"><div class="name">${t(txt, "glmLabel")}</div><div class="verdict">${t(txt, "glm")}</div><div class="check">✗</div></div></div>`,
    support: `<div class="insight">${highlightSpan(t(txt, "insight"), t(txt, "insightHighlight"), "blue")}</div>`,
  })}
</div></body></html>`;
}

/* ── S10: Summary — key points + teaser ── */
function scene10(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s10 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 700px; height: 700px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s10 .points-wrap { animation: fadeIn 0.4s ease-out 0.4s forwards; opacity: 0; }
.s10 .teaser-box { text-align: center; padding: 24px 40px; border: 2px solid rgba(245,158,11,0.3); border-radius: 14px; background: rgba(245,158,11,0.06); animation: stampIn 0.5s ease-out 1.6s forwards; opacity: 0; display: inline-block; }
.s10 .teaser-wrap { text-align: center; }
.s10 .teaser-box .text { font-size: 36px; font-weight: 900; color: var(--amber); letter-spacing: 3px; text-shadow: 0 0 30px rgba(245,158,11,0.3); }
.s10 .teaser-box .when { font-size: 22px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
</style></head><body>
<div class="scene s10">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    kicker: titleBlock(t(txt, "title"), {
      center: true,
      fontSize: 48,
      highlight: t(txt, "titleHighlight"),
    }),
    hero: `<div class="points-wrap">${pointsList(txt.points || [], { start: 0.3, step: 0.4 })}</div>`,
    support: `<div class="teaser-wrap"><div class="teaser-box"><div class="text">${t(txt, "teaser")}</div><div class="when">${t(txt, "teaserWhen")}</div></div></div>`,
  })}
</div></body></html>`;
}

/* ── S11: CTA — standard end card (shared ctaScene) ── */
function scene11(scene, duration) {
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
