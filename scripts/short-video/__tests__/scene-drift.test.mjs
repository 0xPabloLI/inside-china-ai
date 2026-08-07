/**
 * Scene drift guards — the content layer must stay data-driven.
 *
 * These tests lock the contracts established by the design-optimization
 * work (docs/specs/spec-design-optimization.md):
 *
 *   1. Safe-zone / watermark constants are the reviewed values.
 *   2. withWatermark skips brand-identity scenes by REAL element match
 *      (never by CSS class definitions).
 *   3. Content scenes.mjs contains no bare uppercase display copy outside
 *      the whitelist (channel identity + step-status vocabulary); every
 *      other string must live in scene-data.mjs so preflight rules and
 *      the redundancy checker can see it.
 *   4. Legacy dead-zone footer classes (source-badge / subscribe / ...)
 *      must not return to content scenes.
 *   5. Shared keyframes have a single definition (base-styles bundle);
 *      scenes must not redeclare them. Scene-specific animations must use
 *      unique names (e.g. alertPulse, not pulseDot).
 *   6. The template layer (lib/scene-templates.mjs) stays copy-free and
 *      keyframe-free (channel constants in brandBar are the exception).
 *   7. The CTA end card is the single shared ctaScene: every content
 *      CTA scene output must be byte-identical to ctaScene, and every
 *      CTA scene-data / evergreen template carries the standardized
 *      action slot (spec: docs/spec-cta-end-card-standard.md).
 *
 * Runtime geometry (actual bottom/right band crossings) is verified per
 * render by scripts/short-video/verify-scene-dom.mjs, which measures the
 * real DOM; these source-level guards are the fast static layer.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { SAFE_ZONES, SUBTITLE_LANE, WATERMARK_POS } from "../lib/safe-zones.mjs";
import { withWatermark } from "../lib/base-styles.mjs";
import { ctaScene } from "../lib/scene-templates.mjs";
import { scenes as bytedanceScenes } from "../content/bytedance-distillation/scene-data.mjs";
import { generateScene as generateBytedance } from "../content/bytedance-distillation/scenes.mjs";
import { scenes as deepseekScenes } from "../content/deepseek/scene-data.mjs";
import { generateScene as generateDeepseek } from "../content/deepseek/scenes.mjs";
import { scenes as restraintScenes } from "../content/restraint/pt1/scene-data.mjs";
import { generateScene as generateRestraint } from "../content/restraint/pt1/scenes.mjs";
import { scenes as restraintPt3Scenes } from "../content/restraint/pt3/scene-data.mjs";
import { generateScene as generateRestraintPt3 } from "../content/restraint/pt3/scenes.mjs";
import { scenes as pt1Scenes } from "../content/distillation/pt1/scene-data.mjs";
import { generateScene as generatePt1 } from "../content/distillation/pt1/scenes.mjs";
import { scenes as fundingScenes } from "../evergreen-templates/china-ai-funding-tracker.mjs";
import { scenes as vsUsScenes } from "../evergreen-templates/china-vs-us-ai.mjs";
import { scenes as chipScenes } from "../evergreen-templates/china-chip-industry.mjs";
import { scenes as openSourceScenes } from "../evergreen-templates/china-open-source-ecosystem.mjs";
import { scenes as explainerScenes } from "../evergreen-templates/deepseek-explainer.mjs";

const CONTENT_FILES = [
  "content/deepseek/scenes.mjs",
  "content/restraint/pt1/scenes.mjs",
  "content/restraint/pt3/scenes.mjs",
  "content/distillation/pt1/scenes.mjs",
];

// Content pipelines with an implemented CTA scene (static imports — vitest
// cannot resolve dynamic imports with variable paths).
const CTA_PIPELINES = [
  {
    name: "bytedance-distillation",
    id: 9,
    scenes: bytedanceScenes,
    generateScene: generateBytedance,
  },
  { name: "deepseek", id: 12, scenes: deepseekScenes, generateScene: generateDeepseek },
  { name: "restraint/pt1", id: 11, scenes: restraintScenes, generateScene: generateRestraint },
  {
    name: "restraint/pt3",
    id: 10,
    scenes: restraintPt3Scenes,
    generateScene: generateRestraintPt3,
  },
  { name: "distillation/pt1", id: 8, scenes: pt1Scenes, generateScene: generatePt1 },
];

// Evergreen scene-data templates (data-only, consumed when copied into content/)
const EVERGREEN_FILES = [
  { name: "china-ai-funding-tracker", scenes: fundingScenes },
  { name: "china-vs-us-ai", scenes: vsUsScenes },
  { name: "china-chip-industry", scenes: chipScenes },
  { name: "china-open-source-ecosystem", scenes: openSourceScenes },
  { name: "deepseek-explainer", scenes: explainerScenes },
];

// Whitelisted bare uppercase words that may appear as literal text inside
// scenes.mjs. Everything else must come from scene-data.mjs.
const ALLOWED_WORDS = new Set([
  // Channel identity (deepseek renders its own brand bar)
  "CHINA",
  "AI",
  "NEWS",
  "INTELLIGENCE",
  "BRIEFING",
  // Step-status vocabulary (deepseek S7 staircase badges)
  "DONE",
  "NOW",
  "NEXT",
]);

// Keyframes defined once in lib/base-styles.mjs; scenes must not redeclare.
const SHARED_KEYFRAMES = [
  "fadeIn",
  "slideUp",
  "slideLeft",
  "scaleIn",
  "stampIn",
  "slideDown",
  "pulseDot",
  "numberPulse",
  "glowPulse",
  "logoPulse",
  "hookIn",
  "fadeOut",
];

// Bottom dead-zone footers removed by the design review (D1); forbidden
// to return. Runtime band crossings are handled by verify-scene-dom.mjs.
const LEGACY_FOOTER_CLASSES = ["source-badge", "source-tag", "attribution", "subscribe"];

/** All literal text chunks between HTML tags that contain no interpolation. */
function textChunks(src) {
  return (src.match(/>([^<{]{1,80})</g) ?? []).map((c) => c.slice(1, -1));
}

describe("scene drift guards", () => {
  describe("safe zone constants", () => {
    it("TikTok safe zones are the reviewed values", () => {
      expect(SAFE_ZONES).toEqual({ top: 220, right: 160, bottom: 580, left: 60 });
    });

    it("subtitle lane is separated from the content band (single source)", () => {
      // Content bottom edge (1920-580=1340) must stay above the subtitle lane
      // (bottom margin 390 → lane bottom y=1530, top ≈1416).
      expect(SAFE_ZONES.bottom).toBeGreaterThan(SUBTITLE_LANE.marginV);
    });

    it("watermark sits top-left inside the brand corner", () => {
      expect(WATERMARK_POS).toEqual({ top: 60, left: 60 });
    });
  });

  describe("withWatermark branches", () => {
    it("injects watermark into plain scenes exactly once", () => {
      const html = '<div class="scene"></div></body></html>';
      const out = withWatermark(html);
      expect(out.match(/<div class="brand-watermark">/g)).toHaveLength(1);
      expect(out).toMatch(/<div class="brand-watermark">[\s\S]*<\/div><\/div><\/body>/);
    });

    it("skips scenes with a brand bar (top-left identity)", () => {
      const html = '<div class="scene"><div class="brand-bar"></div></div></body></html>';
      expect(withWatermark(html)).toBe(html);
    });

    it("skips scenes with a large brand logo (CTA close)", () => {
      const html = '<div class="scene"><div class="brand-logo-large"></div></div></body></html>';
      expect(withWatermark(html)).toBe(html);
    });

    it("does not match CSS class definitions, only real elements", () => {
      const html =
        "<style>.brand-bar { top: 0; } .brand-logo-large { width: 1px; }</style>" +
        '<div class="scene"></div></body></html>';
      expect(withWatermark(html)).toMatch(/<div class="brand-watermark">/);
    });
  });

  describe("content scenes stay data-driven", () => {
    it("no bare uppercase copy outside the whitelist", () => {
      const offenders = [];
      for (const file of CONTENT_FILES) {
        const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
        for (const text of textChunks(src)) {
          for (const word of text.match(/[A-Z]{2,}/g) ?? []) {
            if (!ALLOWED_WORDS.has(word)) {
              offenders.push(`${file}: bare "${word}" in >${text}<`);
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("no legacy dead-zone footer classes", () => {
      for (const file of CONTENT_FILES) {
        const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
        for (const cls of LEGACY_FOOTER_CLASSES) {
          expect(src, `${file} still contains class="${cls}"`).not.toContain(`class="${cls}"`);
        }
      }
    });

    it("no shared keyframe redeclarations", () => {
      const offenders = [];
      for (const file of CONTENT_FILES) {
        const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
        for (const name of SHARED_KEYFRAMES) {
          if (new RegExp(`@keyframes ${name}\\b`).test(src)) {
            offenders.push(`${file}: redeclares @keyframes ${name}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("brandHighlight contract", () => {
    it("every brandHighlight exists inside the scene brand string", () => {
      const offenders = [];
      for (const file of [
        "content/restraint/pt1/scene-data.mjs",
        "content/restraint/pt3/scene-data.mjs",
        "content/distillation/pt1/scene-data.mjs",
      ]) {
        const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
        // Extract scene blocks with their texts: check each brand/brandHighlight pair.
        const scenes = src.match(/texts:\s*\{[\s\S]*?\n    \}/g) ?? [];
        for (const block of scenes) {
          const brand = /\bbrand:\s*"([^"]+)"/.exec(block)?.[1];
          const highlight = /\bbrandHighlight:\s*"([^"]+)"/.exec(block)?.[1];
          if (highlight && (!brand || !brand.includes(highlight))) {
            offenders.push(`${file}: brandHighlight "${highlight}" not inside brand "${brand}"`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("template layer stays copy-free", () => {
    it("templates contain no business copy (brand constants excepted)", () => {
      const offenders = [];
      for (const file of ["lib/scene-templates.mjs", "lib/base-styles.mjs"]) {
        const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
        for (const text of textChunks(src)) {
          const words = text.match(/[A-Z]{2,}/g) ?? [];
          if (words.some((w) => !ALLOWED_WORDS.has(w))) {
            offenders.push(`${file}: "${text}"`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("scene-templates declares no keyframes (single bundle in baseStyles)", () => {
      const src = readFileSync(new URL("../lib/scene-templates.mjs", import.meta.url), "utf8");
      expect(src).not.toMatch(/@keyframes [a-zA-Z]+/);
    });
  });

  describe("CTA end card (standard ctaScene)", () => {
    it("every content CTA scene output is byte-identical to ctaScene", () => {
      for (const { name, id, scenes, generateScene } of CTA_PIPELINES) {
        const cta = scenes.find((s) => s.id === id && s.visualType === "cta");
        expect(cta, `${name}: CTA scene ${id} missing`).toBeDefined();
        const fromContent = generateScene(cta, 10);
        const fromShared = ctaScene(cta, 10);
        expect(fromContent, `${name}: CTA scene drifted from shared ctaScene`).toBe(fromShared);
      }
    });

    it("every content CTA scene-data carries the standardized action slot", () => {
      for (const { name, id, scenes } of CTA_PIPELINES) {
        const cta = scenes.find((s) => s.id === id);
        expect(cta.texts?.action?.trim(), `${name}: missing texts.action`).toBeTruthy();
      }
    });

    it("every evergreen template's CTA scene carries the standard contract", () => {
      for (const { name, scenes } of EVERGREEN_FILES) {
        const cta = scenes.find((s) => s.visualType === "cta");
        expect(cta, `${name}: no CTA scene`).toBeDefined();
        expect(cta.texts?.action?.trim(), `${name}: missing texts.action`).toBeTruthy();
        expect(cta.texts?.brand, `${name}: missing texts.brand`).toBe("CHINA AI NEWS");
      }
    });

    it("batch-generate scaffold emits the standardized CTA contract (no title: SUBSCRIBE)", () => {
      const src = readFileSync(new URL("../batch-generate.mjs", import.meta.url), "utf8");
      expect(src).not.toContain('texts: { title: "SUBSCRIBE" }');
      expect(src).toContain('action: "FOLLOW FOR MORE"');
    });
  });
});
