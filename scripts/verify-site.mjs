/**
 * W4 acceptance: site matrix screenshots + layout sanity at desktop/mobile.
 * Pages: home, article (widgets), companies.
 * Checks: no horizontal overflow, header nav correct per viewport,
 * widget cards present on articles.
 *
 * Usage: node scripts/verify-site.mjs [baseUrl]
 */

import { mkdirSync } from "fs";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:8082";
const OUT = "/tmp/site-matrix";
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
]) {
  for (const page of [
    { name: "home", path: "/", hasWidgets: false },
    { name: "article", path: "/posts/deepseek-leaked-investor-meeting", hasWidgets: true },
    { name: "companies", path: "/companies", hasWidgets: false },
  ]) {
    const ctx = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await ctx.goto(`${BASE}${page.path}`, { waitUntil: "networkidle", timeout: 45000 });
      await ctx.waitForTimeout(2200);

      const overflow = await ctx.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      const tag = `${viewport.name}-${page.name}`;
      check(
        `${tag}: no horizontal overflow`,
        overflow.sw <= overflow.cw,
        `${overflow.sw} <= ${overflow.cw}`,
      );

      const hamburger = await ctx.locator('button[aria-label="Open menu"]:visible').count();
      const inlineNav = await ctx.locator("header nav:visible", { hasText: "Companies" }).count();
      if (viewport.name === "desktop") {
        check(`${tag}: inline nav visible`, inlineNav >= 1, `${inlineNav}`);
        check(`${tag}: hamburger hidden`, hamburger === 0, `${hamburger}`);
      } else {
        check(`${tag}: inline nav hidden`, inlineNav === 0, `${inlineNav}`);
        check(`${tag}: hamburger visible`, hamburger >= 1, `${hamburger}`);
      }

      if (page.hasWidgets) {
        const cards = await ctx.locator("main .rounded-lg.border.bg-card").count();
        check(`${tag}: widget cards`, cards >= 1, `${cards}`);
      }

      await ctx.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });
    } finally {
      await ctx.close();
    }
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`Screenshots: ${OUT}/`);
process.exit(failed.length ? 1 : 0);
