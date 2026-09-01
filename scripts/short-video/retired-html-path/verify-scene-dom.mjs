/**
 * Runtime DOM verification for scene HTML — the render-level counterpart of
 * verify-video.mjs (which checks scene DATA). Loads each generated scene in
 * headless Chromium and asserts:
 *
 *   FAIL level:
 *   1. No content element crosses the TOP or BOTTOM safe-zone bands
 *      (TikTok tabs bar / subtitle lane + caption zone). Background layers,
 *      brand bars, brand logos and watermarks are exempt by design.
 *   1b. No content element crosses the RIGHT band (x880) WITHIN the action
 *      rail's vertical extent (y≈640-1775). The rail (avatar/like/comment/
 *      save/share/music) is an opaque occluder measured from a real FYP
 *      screenshot — content there is unreadable. Crossings ABOVE the rail
 *      (top chrome, y<640) are WARN only, since nothing occludes there.
 *   2. No text element overflows its box horizontally (scrollWidth).
 *   3. Rendered text contains no "undefined".
 *   4. Per-pipeline DOM config (dom-config.mjs): legacy footer
 *      classes absent, single-occurrence copy (e.g. S4 "PRICE CUT").
 *      Watermark is auto-detected (no config needed).
 *   5. Word-fit: every word in targeted text elements fits on its own line
 *      (guards mid-word breaks like the old "EXTRAORDINA RY" bug).
 *
 *   6. Spacing scale: all margin-top, margin-bottom, gap values on content
 *      elements must be multiples of 8 (the 8px spacing scale). Off-scale
 *      values are WARN-level (reported, non-fatal) to catch drift early.
 *      Padding values are checked on a 4px base (4, 8, 12, 16, 20, 24...).
 *
 *   WARN level (reported, non-fatal):
 *   - Elements crossing the RIGHT band ABOVE the action rail (top chrome).
 *   - Spacing values not on the 8px scale (margin/gap) or 4px scale (padding).
 *
 * Usage:
 *   node scripts/short-video/verify-scene-dom.mjs --content restraint/pt1
 *   node scripts/short-video/verify-scene-dom.mjs --content kimi-sandbox
 *
 * Exit code 1 on any FAIL.
 */

import { chromium } from "@playwright/test";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { SAFE_ZONES } from "./lib/safe-zones.mjs";
import { loadDomConfig } from "./lib/load-dom-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const contentArg = args.indexOf("--content");
if (contentArg < 0 || !args[contentArg + 1]) {
  const available = readdirSync(join(__dirname, "content"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  console.error("❌ --content flag is required. Available content:");
  available.forEach((d) => console.error(`   - ${d}`));
  process.exit(1);
}
const contentDir = args[contentArg + 1];

// Layer/element that may legally extend beyond the content band.
const EXEMPT_SELECTORS = [
  ".scene",
  ".grid-bg",
  ".glow-blue",
  ".glow-red",
  ".glow-amber",
  ".glow-tint",
  ".scanlines",
  ".scan-sweep",
  ".glitch",
  ".glitch-flash",
  ".fade-to-black",
  ".frame-glow",
  ".brand-watermark",
  ".brand-bar",
  ".brand-logo-large",
];

// Brand chrome containers whose INNER elements share the exemption (logo
// svg wrappers, wordmark spans, tag pills). Scoped to .scene so real
// content subtrees (e.g. a .hl span inside a quote box) are never skipped.
// Defined at module level for reference; the page.evaluate clone lives in
// the browser context (see probe below).
const BRAND_CHROME = [".brand-bar", ".brand-watermark", ".brand-logo-large"];

// Per-pipeline DOM verification config is loaded from each content
// directory's dom-config.mjs. If the file is absent or broken, the
// verifier falls back to DEFAULT_ABSENT_CLASSES + empty singleOccurrence/
// wordFit. This allows new pipelines to define their own checks without
// editing this central file.
//
// Config shape (dom-config.mjs):
//   export const domConfig = {
//     absentClasses: ["source-badge", ...],     // legacy CSS classes absent
//     singleOccurrence: { 4: ["PRICE CUT"] },   // sceneId -> [copy] exactly once
//     wordFit: { 3: [".s3 .card .text"] },      // sceneId -> [selector] word-fit
//   };
//
// skipWatermark was removed — brand identity is now auto-detected via
// .brand-bar / .brand-logo-large elements in the DOM.

const BAND = {
  top: SAFE_ZONES.top, // content must start below this y (FAIL)
  bottom: 1920 - SAFE_ZONES.bottom, // content must end above this y (FAIL)
  right: 1080 - SAFE_ZONES.right, // content must end left of this x within the rail (FAIL)
  // Action rail vertical extent (screenshot-measured, y≈655-1775); crossing
  // `right` inside this band is a hard FAIL, above it (top chrome) a WARN.
  railTop: 640,
};

async function main() {
  const { scenes } = await import(`./content/${contentDir}/scene-data.mjs`);
  const { generateScene } = await import(`./content/${contentDir}/scenes.mjs`);

  // Load per-pipeline DOM config (falls back to defaults if absent or broken)
  const exp = await loadDomConfig(contentDir, __dirname);

  const browser = await chromium.launch({ headless: true });
  let failed = 0;

  for (const scene of scenes) {
    const html = generateScene(scene, 8);
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.setContent(html, { waitUntil: "load" });
    // Disable animations: layout metrics must be measured at the final
    // state, not mid-transition (transforms transiently inflate scroll boxes)
    await page.addStyleTag({
      content:
        "*, *::before, *::after { animation: none !important; transition: none !important; }",
    });
    await page.waitForTimeout(100); // let fonts/layout settle

    const problems = [];
    const warns = [];

    // 1. Top/bottom band = FAIL, right band = WARN (exempt layers + svg internals)
    const { fails, warns: bwarns } = await page.evaluate(
      ({ exempt, band, brandChrome }) => {
        const fails = [];
        const warns = [];
        const insideBrandChrome = (el) => {
          let node = el.parentElement;
          while (node && !node.matches(".scene")) {
            if (brandChrome.some((s) => node.matches(s))) return true;
            node = node.parentElement;
          }
          return false;
        };
        const probe = (el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          const label =
            (typeof el.className === "string" ? el.className.slice(0, 50) : el.tagName) ||
            el.tagName;
          if (r.top < band.top - 1) {
            fails.push(`${label} (T${Math.round(r.top)})`);
          } else if (r.bottom > band.bottom + 1) {
            fails.push(`${label} (B${Math.round(r.bottom)})`);
          } else if (r.right > band.right + 1) {
            // Crossing the right band is only occluded inside the action rail's
            // vertical extent; above it (top chrome) it's a non-fatal warning.
            if (r.bottom > band.railTop) {
              fails.push(`${label} (R${Math.round(r.right)})`);
            } else {
              warns.push(`${label} (R${Math.round(r.right)})`);
            }
          }
        };
        for (const el of document.querySelectorAll("body *")) {
          if (el.matches("svg, svg *")) continue;
          if (exempt.some((s) => el.matches(s))) continue;
          if (insideBrandChrome(el)) continue;
          probe(el);
        }
        return { fails, warns };
      },
      { exempt: EXEMPT_SELECTORS, band: BAND, brandChrome: BRAND_CHROME },
    );
    for (const f of fails) {
      const zone = /\(T\d+\)$/.test(f)
        ? "top-zone"
        : /\(R\d+\)$/.test(f)
          ? "right-rail"
          : "bottom-zone";
      problems.push(`${zone}: ${f}`);
    }
    for (const w of bwarns) warns.push(`right-band: ${w}`);

    // 2. Horizontal overflow (vertical clipping with tight line-height is
    //    by design for oversized anchors; transforms don't affect scrollWidth).
    //    Elements fully contained in a clipping ancestor (e.g. an animated
    //    bar fill inside an overflow-hidden track) can never leak visually.
    const overflows = await page.evaluate((exempt) => {
      const clippedByAncestor = (el) => {
        const r = el.getBoundingClientRect();
        let node = el.parentElement;
        while (node) {
          if (exempt.some((s) => node.matches(s))) {
            node = node.parentElement;
            continue;
          }
          const o = getComputedStyle(node).overflow;
          if (/hidden|auto|scroll/.test(o)) {
            const nr = node.getBoundingClientRect();
            if (r.left >= nr.left - 1 && r.right <= nr.right + 1) return true;
          }
          node = node.parentElement;
        }
        return false;
      };
      const out = [];
      for (const el of document.querySelectorAll("div, span")) {
        if (el.matches("svg, svg *")) continue;
        if (exempt.some((s) => el.matches(s))) continue;
        if (!el.innerText?.trim()) continue;
        if (clippedByAncestor(el)) continue;
        if (el.scrollWidth > el.clientWidth + 4) {
          out.push(`${el.className?.toString?.().slice(0, 50)} "${el.innerText.slice(0, 40)}"`);
        }
      }
      return out;
    }, EXEMPT_SELECTORS);
    for (const o of overflows) problems.push(`overflow: ${o}`);

    // 3. No "undefined" rendered
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes("undefined")) problems.push("rendered undefined");

    // 4a. Watermark presence/absence — auto-detect brand identity
    // If a scene renders a brand-bar or brand-logo-large, it has brand identity
    // and the watermark should be absent (double-branding guard). This auto-detection
    // works for any pipeline, so new pipelines don't need to register
    // anything in dom-config.mjs for watermark checks.
    const watermark = await page.$('div[class="brand-watermark"]');
    const hasBrandBar = await page.$(".brand-bar, .brand-logo-large");
    // shouldSkip is true if the scene has brand identity (auto-detected via DOM).
    // The old exp.skipWatermark list was removed — all scenes now rely on
    // auto-detection of .brand-bar / .brand-logo-large elements.
    const shouldSkip = !!hasBrandBar;
    if (shouldSkip && watermark) {
      problems.push("unexpected watermark (brand identity scene)");
    }
    if (!shouldSkip && !watermark) {
      problems.push("missing watermark (no brand-bar or brand-watermark)");
    }

    // 4b. Legacy footer classes absent
    for (const cls of exp.absentClasses) {
      if (await page.$(`.${cls}`)) problems.push(`legacy footer class .${cls} present`);
    }

    // 4c. Single-occurrence copy (scene-scoped). Only leaf elements count:
    // a slot container holding a single child would otherwise match the
    // child's text twice.
    for (const text of exp.singleOccurrence[scene.id] || []) {
      const matches = await page.$$eval(
        "*",
        (els, t) =>
          els.filter(
            (el) =>
              el.matches("svg, svg *") === false &&
              el.children.length === 0 &&
              el.innerText?.trim() === t,
          ).length,
        text,
      );
      if (matches !== 1) {
        problems.push(`"${text}" appears ${matches}x (expected exactly 1)`);
      }
    }

    // 5. Word-fit: every word must fit on its own line (no mid-word breaks)
    for (const selector of exp.wordFit[scene.id] || []) {
      const fit = await page.evaluate((sel) => {
        const els = document.querySelectorAll(sel);
        const results = [];
        for (const el of els) {
          const style = getComputedStyle(el);
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const words = (el.innerText || "").split(/\s+/).filter(Boolean);
          for (const word of words) {
            results.push({
              word,
              width: ctx.measureText(word).width,
              avail: el.clientWidth,
            });
          }
        }
        return results;
      }, selector);
      const tooWide = fit.filter((f) => f.width > f.avail + 2);
      for (const t of tooWide) {
        problems.push(
          `word-fit ${selector}: "${t.word}" needs ${Math.round(t.width)}px, has ${t.avail}px`,
        );
      }
    }

    // 6. Spacing scale check — all margin/gap values must be multiples of 8,
    //    padding multiples of 4. Off-scale values are WARN-level.
    const spacingWarns = await page.evaluate((exempt) => {
      const SCALE = 8; // 8px base for margin/gap
      const PAD_SCALE = 4; // 4px base for padding
      const isMultiple = (v, base) => v % base === 0;
      const parsePx = (s) => {
        const m = /^([\d.]+)px$/.exec(s);
        return m ? parseFloat(m[1]) : null;
      };
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.matches("svg, svg *")) continue;
        if (exempt.some((s) => el.matches(s))) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const style = getComputedStyle(el);
        const cls = el.className?.toString?.()?.slice(0, 40) || el.tagName;
        // Check margins
        for (const prop of ["marginTop", "marginBottom"]) {
          const v = parsePx(style[prop]);
          if (v !== null && v > 0 && !isMultiple(v, SCALE)) {
            out.push(`${cls} ${prop}: ${v}px (not ${SCALE}px scale)`);
          }
        }
        // Check gap (flex/grid)
        const gap = parsePx(style.gap);
        if (gap !== null && gap > 0 && !isMultiple(gap, SCALE)) {
          out.push(`${cls} gap: ${gap}px (not ${SCALE}px scale)`);
        }
        // Check padding (4px scale, more lenient)
        for (const prop of ["paddingTop", "paddingBottom"]) {
          const v = parsePx(style[prop]);
          if (v !== null && v > 0 && !isMultiple(v, PAD_SCALE)) {
            out.push(`${cls} ${prop}: ${v}px (not ${PAD_SCALE}px scale)`);
          }
        }
      }
      return out;
    }, EXEMPT_SELECTORS);
    for (const s of spacingWarns) warns.push(`spacing-scale: ${s}`);

    await page.close();
    for (const w of warns) console.log(`  ⚠️  scene ${scene.id}: ${w}`);
    if (problems.length > 0) {
      failed++;
      console.log(`❌ scene ${scene.id} (${scene.name}):`);
      for (const p of problems) console.log(`   - ${p}`);
    } else {
      console.log(`✅ scene ${scene.id} (${scene.name})`);
    }
  }

  await browser.close();
  console.log(`\n${failed === 0 ? "✅ ALL SCENES PASS" : `❌ ${failed} scene(s) failed`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ verify-scene-dom failed:", err.message);
  process.exit(1);
});
