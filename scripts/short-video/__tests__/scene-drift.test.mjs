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
 *
 * Runtime geometry (actual bottom/right band crossings) is verified per
 * render by scripts/short-video/verify-scene-dom.mjs, which measures the
 * real DOM; these source-level guards are the fast static layer.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { SAFE_ZONES, WATERMARK_POS } from "../lib/safe-zones.mjs";
import { withWatermark } from "../lib/base-styles.mjs";

const CONTENT_FILES = [
  "content/deepseek/scenes.mjs",
  "content/restraint/pt1/scenes.mjs",
  "content/distillation/pt1/scenes.mjs",
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
      expect(SAFE_ZONES).toEqual({ top: 220, right: 160, bottom: 450, left: 60 });
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
});
