/**
 * Doubao Work launch video — scenes.mjs
 *
 * Scenes 2-9 use "narrative" visualType with media backgrounds (Pexels images).
 * Scene 1 (hook) uses shared hookScene template.
 * Scene 10 (cta) uses shared ctaScene template.
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { baseStyles, withWatermark } from "../../lib/base-styles.mjs";
import { templateCss, brandBar, ctaScene, hookScene } from "../../lib/scene-templates.mjs";
import { slotCss, sceneFrame } from "../../lib/scene-layout.mjs";
import { mediaLayer } from "../../lib/media-bg.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Safe text accessor
function t(texts, key) {
  return texts?.[key] ?? "";
}

// ─── S1: Hook — shared hookScene ───
function scene1(scene, duration) {
  return hookScene(scene, duration, __dirname);
}

// ─── S2-S9: Narrative — media background + content card ───
function narrativeScene(scene, duration) {
  const txt = scene.texts || {};
  const media = scene.media ? mediaLayer(scene.media, __dirname, duration) : { css: "", html: "" };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}${templateCss()}${slotCss()}${media.css}
.narrative .narrative-badge { display: inline-block; padding: 10px 24px; border: 2px solid rgba(77,139,255,0.4); border-radius: 8px; background: rgba(77,139,255,0.08); font-size: 22px; font-weight: 800; color: var(--blue); letter-spacing: 2px; margin-bottom: 24px; animation: stampIn 0.4s ease-out 0.2s forwards; opacity: 0; }
.narrative .company-name { font-size: 44px; font-weight: 900; color: var(--white); margin-bottom: 16px; animation: slideUp 0.5s ease-out 0.4s forwards; opacity: 0; }
.narrative .action-text { font-size: 30px; font-weight: 700; color: var(--sec); margin-bottom: 12px; animation: slideUp 0.5s ease-out 0.6s forwards; opacity: 0; }
.narrative .result-text { font-size: 52px; font-weight: 900; color: var(--amber); animation: stampIn 0.5s ease-out 0.8s forwards; opacity: 0; }
.narrative .context-text { font-size: 22px; font-weight: 600; color: var(--sec); margin-top: 16px; animation: fadeIn 0.5s ease-out 1.0s forwards; opacity: 0; }
.narrative .source-line { font-size: 18px; font-weight: 600; color: var(--muted); margin-top: 20px; letter-spacing: 1px; animation: fadeIn 0.5s ease-out 1.2s forwards; opacity: 0; }
</style></head><body>
<div class="scene narrative">
${media.html}
<div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
${brandBar()}
${sceneFrame({ kicker: `<div class="narrative-badge">${t(txt, "badge")}</div>`, hero: `<div class="company-name">${t(txt, "company")}</div><div class="action-text">${t(txt, "action")}</div><div class="result-text">${t(txt, "result")}</div>`, support: `<div class="context-text">${t(txt, "context")}</div><div class="source-line">${t(txt, "source")}</div>` })}
</div></body></html>`;
}

// ─── S10: CTA — shared ctaScene ───
function scene10(scene, duration) {
  return ctaScene(scene, duration);
}

// ─── Dispatcher ───

export function generateScene(scene, duration) {
  const d = Math.max(duration, 5);
  switch (scene.visualType) {
    case "hook":
      return scene1(scene, d);
    case "narrative":
      return narrativeScene(scene, d);
    case "cta":
      return scene10(scene, d);
    default:
      console.warn(`Unknown visualType: ${scene.visualType}, using hookScene`);
      return hookScene(scene, d, __dirname);
  }
}
