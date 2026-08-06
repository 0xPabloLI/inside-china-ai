/**
 * Runtime DOM verification for scene HTML — the render-level counterpart of
 * verify-video.mjs (which checks scene DATA). Loads each generated scene in
 * headless Chromium and asserts:
 *
 *   FAIL level:
 *   1. No content element crosses the BOTTOM safe-zone band (subtitles +
 *      TikTok caption/input zone). Background layers, brand bars, brand
 *      logos and watermarks are exempt by design.
 *   2. No text element overflows its box horizontally (scrollWidth).
 *   3. Rendered text contains no "undefined".
 *   4. Per-pipeline expectations: watermark skip sets, legacy footer
 *      classes absent, single-occurrence copy (e.g. S4 "PRICE CUT").
 *   5. Word-fit: every word in targeted text elements fits on its own line
 *      (guards mid-word breaks like the old "EXTRAORDINA RY" bug).
 *
 *   WARN level (reported, non-fatal):
 *   - Elements crossing the RIGHT band (right action rail is translucent;
 *     full-width titles are by design).
 *
 * Usage:
 *   node scripts/short-video/verify-scene-dom.mjs --content restraint/pt1
 *   node scripts/short-video/verify-scene-dom.mjs --content deepseek
 *
 * Exit code 1 on any FAIL.
 */

import { chromium } from "@playwright/test";
import { SAFE_ZONES } from "./lib/safe-zones.mjs";

const args = process.argv.slice(2);
const contentArg = args.indexOf("--content");
const contentDir = contentArg >= 0 ? args[contentArg + 1] : "deepseek";

// Layer/element that may legally extend beyond the content band.
const EXEMPT_SELECTORS = [
  ".scene",
  ".grid-bg",
  ".glow-blue",
  ".glow-red",
  ".glow-amber",
  ".scanlines",
  ".scan-sweep",
  ".fade-to-black",
  ".brand-watermark",
  ".brand-bar",
  ".brand-logo-large",
];

// Per-pipeline expectations.
//   skipWatermark:  scene ids that render their own brand identity
//   absentClasses:  legacy bottom-dead-zone footers that must not return
//   singleOccurrence: sceneId -> [copy] that must appear exactly once in the
//                     rendered DOM (guards duplicated labels)
//   wordFit:        sceneId -> [selector] whose words must each fit on one
//                   line (guards mid-word breaks)
const EXPECTATIONS = {
  "restraint/pt1": {
    skipWatermark: [1, 11],
    absentClasses: ["source-badge", "source-tag", "attribution", "subscribe"],
    singleOccurrence: { 4: ["PRICE CUT"] },
    wordFit: { 3: [".s3 .card .text"] },
  },
  deepseek: {
    skipWatermark: [1, 12],
    absentClasses: ["source-badge", "subscribe"],
    singleOccurrence: {},
    wordFit: {},
  },
  "distillation/pt1": {
    skipWatermark: [8],
    absentClasses: ["subscribe"],
    singleOccurrence: {},
    wordFit: {},
  },
};

const exp = EXPECTATIONS[contentDir] || {
  skipWatermark: [],
  absentClasses: [],
  singleOccurrence: {},
  wordFit: {},
};

const BAND = {
  bottom: 1920 - SAFE_ZONES.bottom, // content must end above this y (FAIL)
  right: 1080 - SAFE_ZONES.right,   // content should end left of this x (WARN)
};

async function main() {
  const { scenes } = await import(`./content/${contentDir}/scene-data.mjs`);
  const { generateScene } = await import(`./content/${contentDir}/scenes.mjs`);

  const browser = await chromium.launch({ headless: true });
  let failed = 0;

  for (const scene of scenes) {
    const html = generateScene(scene, 8);
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.setContent(html, { waitUntil: "load" });
    // Disable animations: layout metrics must be measured at the final
    // state, not mid-transition (transforms transiently inflate scroll boxes)
    await page.addStyleTag({
      content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
    });
    await page.waitForTimeout(100); // let fonts/layout settle

    const problems = [];
    const warns = [];

    // 1. Bottom band = FAIL, right band = WARN (exempt layers + svg internals)
    const { fails, warns: bwarns } = await page.evaluate(
      ({ exempt, band }) => {
        const fails = [];
        const warns = [];
        const probe = (el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          const label =
            (typeof el.className === "string" ? el.className.slice(0, 50) : el.tagName) ||
            el.tagName;
          if (r.bottom > band.bottom + 1) {
            fails.push(`${label} (B${Math.round(r.bottom)})`);
          } else if (r.right > band.right + 1) {
            warns.push(`${label} (R${Math.round(r.right)})`);
          }
        };
        for (const el of document.querySelectorAll("body *")) {
          if (el.matches("svg, svg *")) continue;
          if (exempt.some((s) => el.matches(s))) continue;
          probe(el);
        }
        return { fails, warns };
      },
      { exempt: EXEMPT_SELECTORS, band: BAND },
    );
    for (const f of fails) problems.push(`bottom-zone: ${f}`);
    for (const w of bwarns) warns.push(`right-band: ${w}`);

    // 2. Horizontal overflow (vertical clipping with tight line-height is
    //    by design for oversized anchors; transforms don't affect scrollWidth)
    const overflows = await page.evaluate((exempt) => {
      const out = [];
      for (const el of document.querySelectorAll("div, span")) {
        if (el.matches("svg, svg *")) continue;
        if (exempt.some((s) => el.matches(s))) continue;
        if (!el.innerText?.trim()) continue;
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

    // 4a. Watermark presence/absence
    const watermark = await page.$('div[class="brand-watermark"]');
    if (exp.skipWatermark.includes(scene.id) && watermark) {
      problems.push("unexpected watermark (brand identity scene)");
    }
    if (!exp.skipWatermark.includes(scene.id) && !watermark) {
      problems.push("missing watermark");
    }

    // 4b. Legacy footer classes absent
    for (const cls of exp.absentClasses) {
      if (await page.$(`.${cls}`)) problems.push(`legacy footer class .${cls} present`);
    }

    // 4c. Single-occurrence copy (scene-scoped)
    for (const text of exp.singleOccurrence[scene.id] || []) {
      const matches = await page.$$eval("*", (els, t) =>
        els.filter((el) => el.matches("svg, svg *") === false && el.innerText?.trim() === t)
          .length,
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
        problems.push(`word-fit ${selector}: "${t.word}" needs ${Math.round(t.width)}px, has ${t.avail}px`);
      }
    }

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
