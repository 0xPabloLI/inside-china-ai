/**
 * Restraint pt3 visual scene templates — "AGI Roadmap"
 * 10 unique scenes for the DeepSeek Art of Restraint series finale.
 *
 * Visual DNA: philosophical intelligence briefing aesthetic (same family
 * as restraint/pt1).
 *   - Blue-dominant glow (DeepSeek identity, wisdom/intelligence)
 *   - Amber for key data highlights (stamps, roadmap next-step)
 *   - Clean, authoritative — no glitch/breach energy
 *   - DeepSeek logo used where relevant
 *   - Stamp-in animations for verdicts
 *
 * ALL on-screen copy comes from scene.texts (scene-data.mjs) — this file
 * must not contain business copy (drift-guarded by scene-drift.test.mjs).
 * Shared primitives come from lib/scene-templates.mjs; shared keyframes
 * from lib/base-styles.mjs (never redeclared here).
 */

import { readFileSync } from "fs";
import { baseStyles, withWatermark } from "../../../lib/base-styles.mjs";
import {
  templateCss,
  brandBar,
  pointsList,
  stampBox,
  ctaScene,
} from "../../../lib/scene-templates.mjs";

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

/* ── S1: Hook — one-rule claim (three-layer open, first-frame striking) ── */
function scene1(scene, duration) {
  const d = Math.max(duration, 5).toFixed(1);
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s1 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s1 .scan-sweep { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, rgba(77,139,255,0.8), transparent); box-shadow: 0 0 20px rgba(77,139,255,0.5); animation: scanSweep ${d}s linear infinite; z-index: 50; }
@keyframes scanSweep { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
/* DS logo row — appears first for subject visibility */
.s1 .ds-row { position: absolute; top: 170px; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 18px; animation: scaleIn 0.5s ease-out 0.2s forwards; opacity: 0; }
.s1 .ds-row .ds-logo { width: 96px; height: 96px; filter: drop-shadow(0 0 25px rgba(77,139,255,0.3)); } .s1 .ds-row .ds-logo svg { width: 100%; height: 100%; }
.s1 .ds-row .ds-text { font-size: 64px; font-weight: 900; color: var(--white); letter-spacing: 4px; text-shadow: 0 0 30px rgba(77,139,255,0.4); }
/* Kicker line — sec, quiet, sets the frame */
.s1 .line1 { position: absolute; top: 360px; left: 0; right: 0; text-align: center; font-size: 44px; font-weight: 800; color: var(--sec); letter-spacing: 6px; animation: slideUp 0.4s ease-out 0.6s forwards; opacity: 0; }
/* Main claim — visible early, bold and large */
.s1 .line2 { position: absolute; top: 500px; left: 0; right: 0; text-align: center; font-size: 96px; font-weight: 900; color: var(--white); letter-spacing: 2px; line-height: 1.1; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 1.0s forwards; opacity: 0; }
/* Payoff line — blue glow, lands last */
.s1 .line3 { position: absolute; top: 740px; left: 0; right: 0; text-align: center; font-size: 58px; font-weight: 900; color: var(--blue); letter-spacing: 3px; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.7s forwards, glowPulse 2s ease-in-out 2.4s infinite; opacity: 0; }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div><div class="scan-sweep"></div>
  ${brandBar()}
  <div class="ds-row"><div class="ds-logo">${DEEPSEEK_ICON_SVG}</div><div class="ds-text">${t(txt, "subject")}</div></div>
  <div class="line1">${t(txt, "line1")}</div>
  <div class="line2">${t(txt, "line2")}</div>
  <div class="line3">${t(txt, "line3")}</div>
</div></body></html>`;
}

/* ── S2: Core interest — the one non-negotiable ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s2 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s2 .core { font-size: 88px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-shadow: 0 0 50px rgba(77,139,255,0.35); animation: hookIn 0.3s ease-out 0.3s forwards; opacity: 0; margin-bottom: 60px; }
.s2 .result-wrap { margin-bottom: 90px; }
.s2 .consequence { font-size: 40px; font-weight: 800; color: var(--amber); letter-spacing: 3px; text-shadow: 0 0 30px rgba(245,158,11,0.35); animation: slideUp 0.5s ease-out 1.6s forwards; opacity: 0; }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  <div class="core">${t(txt, "core")}</div>
  <div class="result-wrap">${stampBox({ text: t(txt, "result"), color: "blue" })}</div>
  <div class="consequence">${t(txt, "consequence")}</div>
</div></body></html>`;
}

/* ── S3: Why people join — motivation chain ── */
function scene3(scene, duration) {
  const txt = scene.texts || {};
  const rows = [
    { key: "motivation", delay: 0.4 },
    { key: "effect", delay: 1.0 },
    { key: "outcome", delay: 1.6 },
  ];

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s3 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s3 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s3 .chain { display: flex; flex-direction: column; gap: 36px; }
.s3 .chain-row { display: flex; align-items: center; gap: 32px; padding: 36px 44px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s3 .chain-row .step-chip { width: 72px; height: 72px; border-radius: 10px; background: rgba(77,139,255,0.15); border: 2px solid rgba(77,139,255,0.4); display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 900; color: var(--blue); flex-shrink: 0; }
.s3 .chain-row .chain-text { font-size: 42px; font-weight: 900; color: var(--white); letter-spacing: 2px; }
.s3 .chain-row.last .chain-text { text-shadow: 0 0 30px rgba(77,139,255,0.35); }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  <div class="chain">
    ${rows
      .map(
        (r, i) =>
          `<div class="chain-row${i === rows.length - 1 ? " last" : ""}" style="animation-delay: ${r.delay.toFixed(1)}s;"><div class="step-chip">${i + 1}</div><div class="chain-text">${t(txt, r.key)}</div></div>`,
      )
      .join("")}
  </div>
</div></body></html>`;
}

/* ── S4: AGI roadmap — phase ladder ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};
  const steps = txt.steps || [];
  const activeIndex = typeof txt.active === "number" ? txt.active : -1;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s4 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s4 .glow-blue { top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(77,139,255,0.15) 0%, transparent 60%); }
.s4 .ladder { display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 110px; }
.s4 .step-chip { padding: 26px 30px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 2px solid rgba(255,255,255,0.12); font-size: 34px; font-weight: 800; color: var(--white); letter-spacing: 2px; text-align: center; animation: slideUp 0.5s ease-out forwards; opacity: 0; }
.s4 .step-chip.active { border-color: rgba(77,139,255,0.7); color: var(--blue); box-shadow: 0 0 40px rgba(77,139,255,0.2); }
.s4 .step-arrow { font-size: 44px; font-weight: 900; color: var(--amber); animation: fadeIn 0.4s ease-out forwards; opacity: 0; }
.s4 .stamps { display: flex; align-items: center; justify-content: center; gap: 44px; }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  <div class="ladder">
    ${steps
      .map((step, i) => {
        const stepHtml = `<div class="step-chip${i === activeIndex ? " active" : ""}" style="animation-delay: ${(0.3 + i * 0.45).toFixed(1)}s;">${step}</div>`;
        const arrowHtml =
          i < steps.length - 1
            ? `<div class="step-arrow" style="animation-delay: ${(0.55 + i * 0.45).toFixed(1)}s;">→</div>`
            : "";
        return stepHtml + arrowHtml;
      })
      .join("")}
  </div>
  <div class="stamps">
    ${stampBox({ text: t(txt, "current"), color: "blue", icon: "✓" })}
    ${stampBox({ text: `${t(txt, "next")} →`, color: "amber" })}
  </div>
</div></body></html>`;
}

/* ── S5: Self-iteration — the singularity stack ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s5 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s5 .glow-blue { bottom: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s5 .singularity { font-size: 52px; font-weight: 800; color: var(--sec); letter-spacing: 4px; animation: slideUp 0.5s ease-out 0.4s forwards; opacity: 0; margin-bottom: 44px; }
.s5 .next { font-size: 84px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-shadow: 0 0 50px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 1.0s forwards; opacity: 0; margin-bottom: 60px; }
.s5 .final { font-size: 56px; font-weight: 900; color: var(--blue); letter-spacing: 3px; text-shadow: 0 0 40px rgba(77,139,255,0.5); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.7s forwards, glowPulse 2s ease-in-out 2.4s infinite; opacity: 0; }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  <div class="singularity">${t(txt, "singularity")}</div>
  <div class="next">${t(txt, "next")}</div>
  <div class="final">${t(txt, "final")}</div>
</div></body></html>`;
}

/* ── S6: Easiest path — verdict rows ── */
function scene6(scene, duration) {
  const txt = scene.texts || {};
  const rows = [
    { key: "approach", icon: "✓", color: "green", rgb: "52,211,153", delay: 0.4 },
    { key: "benefit", icon: "✓", color: "green", rgb: "52,211,153", delay: 1.0 },
    { key: "contrast", icon: "✗", color: "red", rgb: "239,68,68", delay: 1.6 },
  ];

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s6 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s6 .glow-blue { top: 50%; right: -200px; transform: translateY(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s6 .verdicts { display: flex; flex-direction: column; gap: 36px; }
.s6 .verdict-row { display: flex; align-items: center; gap: 32px; padding: 36px 44px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s6 .verdict-row .icon-chip { width: 72px; height: 72px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 38px; font-weight: 900; flex-shrink: 0; }
.s6 .verdict-row .verdict-text { font-size: 42px; font-weight: 900; color: var(--white); letter-spacing: 2px; }
</style></head><body>
<div class="scene s6">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  <div class="verdicts">
    ${rows
      .map(
        (r) =>
          `<div class="verdict-row" style="animation-delay: ${r.delay.toFixed(1)}s;"><div class="icon-chip" style="color: var(--${r.color}); border-color: rgba(${r.rgb},0.4);">${r.icon}</div><div class="verdict-text">${t(txt, r.key)}</div></div>`,
      )
      .join("")}
  </div>
</div></body></html>`;
}

/* ── S7: Byproduct, not destination ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s7 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s7 .glow-blue { top: -150px; left: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s7 .mission { font-size: 92px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-shadow: 0 0 50px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 0.3s forwards; opacity: 0; margin-bottom: 70px; }
.s7 .byproduct { font-size: 56px; font-weight: 900; color: var(--blue); letter-spacing: 3px; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: slideUp 0.5s ease-out 1.0s forwards; opacity: 0; margin-bottom: 50px; }
.s7 .not-line { font-size: 42px; font-weight: 800; color: var(--sec); letter-spacing: 3px; text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.5); text-decoration-thickness: 4px; animation: fadeIn 0.5s ease-out 1.6s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  <div class="mission">${t(txt, "mission")}</div>
  <div class="byproduct">${t(txt, "byproduct")}</div>
  <div class="not-line">${t(txt, "not")}</div>
</div></body></html>`;
}

/* ── S8: Why they won — the person who didn't fight ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s8 { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 80px; }
.s8 .glow-blue { top: -150px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s8 .cards { display: flex; gap: 40px; align-items: stretch; width: 100%; max-width: 860px; }
.s8 .card { flex: 1; border-radius: 16px; padding: 50px 32px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s8 .card.others { background: rgba(239,68,68,0.05); border: 2px solid rgba(239,68,68,0.2); animation-delay: 0.4s; }
.s8 .card.deepseek { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.4); animation-delay: 1.0s; box-shadow: 0 0 40px rgba(77,139,255,0.12); }
.s8 .card .card-icon { font-size: 52px; margin-bottom: 24px; line-height: 1; }
.s8 .card.others .card-icon { color: var(--red); }
.s8 .card.deepseek .card-icon { color: var(--green); }
.s8 .card .card-text { font-size: 36px; font-weight: 900; letter-spacing: 1px; line-height: 1.3; word-break: normal; }
.s8 .card.others .card-text { color: var(--muted); }
.s8 .card.deepseek .card-text { color: var(--blue); text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s8 .result-wrap { margin-top: 80px; }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  <div class="cards">
    <div class="card others"><div class="card-icon">✕</div><div class="card-text">${t(txt, "others")}</div></div>
    <div class="card deepseek"><div class="card-icon">✓</div><div class="card-text">${t(txt, "deepseek")}</div></div>
  </div>
  <div class="result-wrap">${stampBox({ text: `${t(txt, "result")} →`, color: "amber" })}</div>
</div></body></html>`;
}

/* ── S9: Summary — key points + final verdict ── */
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}
.s9 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s9 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 700px; height: 700px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s9 .points-wrap { margin-bottom: 70px; max-width: 860px; width: 100%; margin-left: auto; margin-right: auto; }
.s9 .final-line { text-align: center; font-size: 48px; font-weight: 900; color: var(--amber); letter-spacing: 3px; text-shadow: 0 0 40px rgba(245,158,11,0.4); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 2.0s forwards, glowPulse 2s ease-in-out 2.6s infinite; opacity: 0; }
</style></head><body>
<div class="scene s9">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="points-wrap">${pointsList(txt.points || [], { start: 0.4, step: 0.4 })}</div>
  <div class="final-line">${t(txt, "final")}</div>
</div></body></html>`;
}

/* ── S10: CTA — standard end card (shared ctaScene) ── */
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
 * Generate scene HTML for a Restraint pt3 scene.
 * @param {object} scene - Scene object with id, texts, voiceover
 * @param {number} duration - Scene duration in seconds
 * @returns {string} Complete HTML document
 */
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));
}
