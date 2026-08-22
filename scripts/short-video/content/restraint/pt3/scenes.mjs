/**
 * Restraint pt3 visual scene templates — "AGI Roadmap"
 * 10 scenes for the DeepSeek Art of Restraint series finale. v3 (slot layout).
 *
 * Visual DNA: philosophical intelligence briefing aesthetic (same family
 * as restraint/pt1).
 *   - Blue-dominant glow (DeepSeek identity, wisdom/intelligence)
 *   - Amber for key data highlights (stamps, roadmap next-step)
 *   - Clean, authoritative — no glitch/breach energy
 *   - DeepSeek logo used where relevant
 *   - Stamp-in animations for verdicts
 *
 * Migration to the slot layout system (spec: spec-video-layout-safe-zones.md):
 * - All scenes assemble content into fixed slots via sceneFrame() from
 *   lib/scene-layout.mjs: kickerTitle (220-400) / hero (400-950) /
 *   support (950-1150). No scene-level flex, no magic bottom padding.
 * - Contrast scene (S8) stacks VERTICALLY (A/B) — never side-by-side
 *   columns (the "landscape forced into portrait" fix).
 * - Scene 10 (CTA) delegates to the shared ctaScene end card (unchanged).
 *
 * ALL on-screen copy comes from scene.texts (scene-data.mjs) — this file
 * must not contain business copy (drift-guarded by scene-drift.test.mjs).
 * Shared primitives come from lib/scene-templates.mjs; shared keyframes
 * from lib/base-styles.mjs (never redeclared here).
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { baseStyles, withWatermark } from "../../../lib/base-styles.mjs";
import {
  templateCss,
  brandBar,
  pointsList,
  stampBox,
  ctaScene,
  hookScene,
} from "../../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../../lib/scene-layout.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Safe text accessor
function t(texts, key) {
  return texts?.[key] ?? "";
}

/* ── S1: Hook — one-rule claim (shared hookScene) ── */
function scene1(scene, duration) {
  return hookScene(scene, duration, __dirname);
}

/* ── S2: Core interest — the one non-negotiable ── */
function scene2(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s2 .glow-blue { top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(77,139,255,0.15) 0%, transparent 60%); }
.s2 .core { font-size: 72px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-shadow: 0 0 50px rgba(77,139,255,0.35); animation: hookIn 0.3s ease-out 0.3s forwards; opacity: 0; margin-bottom: 32px; }
.s2 .result-wrap { animation: fadeIn 0.5s ease-out 0.7s forwards; opacity: 0; }
.s2 .consequence { font-size: 34px; font-weight: 800; color: var(--amber); letter-spacing: 3px; text-shadow: 0 0 30px rgba(245,158,11,0.35); animation: slideUp 0.5s ease-out 1.4s forwards; opacity: 0; }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="core">${t(txt, "core")}</div><div class="result-wrap">${stampBox({ text: t(txt, "result"), color: "blue" })}</div>`,
    support: `<div class="consequence">${t(txt, "consequence")}</div>`,
  })}
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
${baseStyles(duration)}${templateCss()}${slotCss()}
.s3 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s3 .chain { display: flex; flex-direction: column; gap: 24px; width: 100%; }
.s3 .chain-row { display: flex; align-items: center; gap: 32px; padding: 28px 40px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s3 .chain-row .step-chip { width: 64px; height: 64px; border-radius: 10px; background: rgba(77,139,255,0.15); border: 2px solid rgba(77,139,255,0.4); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 900; color: var(--blue); flex-shrink: 0; }
.s3 .chain-row .chain-text { font-size: 38px; font-weight: 900; color: var(--white); letter-spacing: 2px; }
.s3 .chain-row.last .chain-text { text-shadow: 0 0 30px rgba(77,139,255,0.35); }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="chain">
    ${rows
      .map(
        (r, i) =>
          `<div class="chain-row${i === rows.length - 1 ? " last" : ""}" style="animation-delay: ${r.delay.toFixed(1)}s;"><div class="step-chip">${i + 1}</div><div class="chain-text">${t(txt, r.key)}</div></div>`,
      )
      .join("")}
  </div>`,
  })}
</div></body></html>`;
}

/* ── S4: AGI roadmap — phase ladder ── */
function scene4(scene, duration) {
  const txt = scene.texts || {};
  const steps = txt.steps || [];
  const activeIndex = typeof txt.active === "number" ? txt.active : -1;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s4 .glow-blue { top: -200px; left: 50%; transform: translateX(-50%); width: 1000px; height: 1000px; background: radial-gradient(circle, rgba(77,139,255,0.15) 0%, transparent 60%); }
.s4 .ladder { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 14px; width: 100%; }
.s4 .step-chip { padding: 20px 24px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 2px solid rgba(255,255,255,0.12); font-size: 26px; font-weight: 800; color: var(--white); letter-spacing: 2px; text-align: center; animation: slideUp 0.5s ease-out forwards; opacity: 0; }
.s4 .step-chip.active { border-color: rgba(77,139,255,0.7); color: var(--blue); box-shadow: 0 0 40px rgba(77,139,255,0.2); }
.s4 .step-arrow { font-size: 32px; font-weight: 900; color: var(--amber); animation: fadeIn 0.4s ease-out forwards; opacity: 0; }
.s4 .stamps { display: flex; align-items: center; justify-content: center; gap: 36px; }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="ladder">
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
  </div>`,
    support: `<div class="stamps">
    ${stampBox({ text: t(txt, "current"), color: "blue", icon: "✓" })}
    ${stampBox({ text: `${t(txt, "next")} →`, color: "amber" })}
  </div>`,
  })}
</div></body></html>`;
}

/* ── S5: Self-iteration — the singularity stack ── */
function scene5(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s5 .glow-blue { bottom: -200px; right: -200px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(77,139,255,0.12) 0%, transparent 60%); }
.s5 .singularity { font-size: 44px; font-weight: 800; color: var(--sec); letter-spacing: 4px; animation: slideUp 0.5s ease-out 0.4s forwards; opacity: 0; margin-bottom: 28px; }
.s5 .next { font-size: 68px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-shadow: 0 0 50px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 0.9s forwards; opacity: 0; margin-bottom: 32px; }
.s5 .final { font-size: 50px; font-weight: 900; color: var(--blue); letter-spacing: 3px; text-shadow: 0 0 40px rgba(77,139,255,0.5); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.5s forwards, glowPulse 2s ease-in-out 2.2s infinite; opacity: 0; }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="singularity">${t(txt, "singularity")}</div><div class="next">${t(txt, "next")}</div><div class="final">${t(txt, "final")}</div>`,
  })}
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
${baseStyles(duration)}${templateCss()}${slotCss()}
.s6 .glow-blue { top: 50%; right: -200px; transform: translateY(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s6 .verdicts { display: flex; flex-direction: column; gap: 24px; width: 100%; }
.s6 .verdict-row { display: flex; align-items: center; gap: 32px; padding: 28px 40px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s6 .verdict-row .icon-chip { width: 64px; height: 64px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 900; flex-shrink: 0; }
.s6 .verdict-row .verdict-text { font-size: 38px; font-weight: 900; color: var(--white); letter-spacing: 2px; }
</style></head><body>
<div class="scene s6">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="verdicts">
    ${rows
      .map(
        (r) =>
          `<div class="verdict-row" style="animation-delay: ${r.delay.toFixed(1)}s;"><div class="icon-chip" style="color: var(--${r.color}); border-color: rgba(${r.rgb},0.4);">${r.icon}</div><div class="verdict-text">${t(txt, r.key)}</div></div>`,
      )
      .join("")}
  </div>`,
  })}
</div></body></html>`;
}

/* ── S7: Byproduct, not destination ── */
function scene7(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s7 .glow-blue { top: -150px; left: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s7 .mission { font-size: 76px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-shadow: 0 0 50px rgba(77,139,255,0.4); animation: hookIn 0.3s ease-out 0.3s forwards; opacity: 0; margin-bottom: 40px; }
.s7 .byproduct { font-size: 50px; font-weight: 900; color: var(--blue); letter-spacing: 3px; text-shadow: 0 0 40px rgba(77,139,255,0.4); animation: slideUp 0.5s ease-out 1.0s forwards; opacity: 0; margin-bottom: 28px; }
.s7 .not-line { font-size: 38px; font-weight: 800; color: var(--sec); letter-spacing: 3px; text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.5); text-decoration-thickness: 4px; animation: fadeIn 0.5s ease-out 1.6s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="mission">${t(txt, "mission")}</div><div class="byproduct">${t(txt, "byproduct")}</div><div class="not-line">${t(txt, "not")}</div>`,
  })}
</div></body></html>`;
}

/* ── S8: Why they won — the person who didn't fight (vertical A/B) ── */
function scene8(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s8 .glow-blue { top: -150px; right: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s8 .vstack { display: flex; flex-direction: column; gap: 16px; width: 100%; }
.s8 .card { width: 680px; border-radius: 16px; padding: 26px 32px; text-align: center; align-self: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s8 .card.others { background: rgba(239,68,68,0.05); border: 2px solid rgba(239,68,68,0.2); animation-delay: 0.3s; }
.s8 .card.deepseek { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.4); animation-delay: 0.8s; box-shadow: 0 0 40px rgba(77,139,255,0.12); }
.s8 .card .card-icon { font-size: 40px; margin-bottom: 10px; line-height: 1; }
.s8 .card.others .card-icon { color: var(--red); }
.s8 .card.deepseek .card-icon { color: var(--green); }
.s8 .card .card-text { font-size: 32px; font-weight: 900; letter-spacing: 1px; line-height: 1.3; word-break: normal; }
.s8 .card.others .card-text { color: var(--muted); }
.s8 .card.deepseek .card-text { color: var(--blue); text-shadow: 0 0 30px rgba(77,139,255,0.3); }
.s8 .result-wrap { animation: fadeIn 0.5s ease-out 1.5s forwards; opacity: 0; }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="vstack"><div class="card others"><div class="card-icon">✕</div><div class="card-text">${t(txt, "others")}</div></div><div class="card deepseek"><div class="card-icon">✓</div><div class="card-text">${t(txt, "deepseek")}</div></div></div>`,
    support: `<div class="result-wrap">${stampBox({ text: `${t(txt, "result")} →`, color: "amber" })}</div>`,
  })}
</div></body></html>`;
}

/* ── S9: Summary — key points + final verdict ── */
function scene9(scene, duration) {
  const txt = scene.texts || {};

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}
.s9 .glow-blue { top: 50%; left: -200px; transform: translateY(-50%); width: 700px; height: 700px; background: radial-gradient(circle, rgba(77,139,255,0.1) 0%, transparent 60%); }
.s9 .points-wrap { max-width: 860px; width: 100%; }
.s9 .final-line { text-align: center; font-size: 42px; font-weight: 900; color: var(--amber); letter-spacing: 3px; text-shadow: 0 0 40px rgba(245,158,11,0.4); animation: stampIn 0.5s cubic-bezier(0.16,1,0.3,1) 1.8s forwards, glowPulse 2s ease-in-out 2.4s infinite; opacity: 0; }
</style></head><body>
<div class="scene s9">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  ${brandBar()}
  ${sceneFrame({
    hero: `<div class="points-wrap">${pointsList(txt.points || [], { start: 0.4, step: 0.4 })}</div>`,
    support: `<div class="final-line">${t(txt, "final")}</div>`,
  })}
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
