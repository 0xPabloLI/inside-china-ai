/**
 * W1 acceptance: header navigation at desktop (1280px) and mobile (375px).
 * Desktop: inline Articles/Companies links visible, hamburger hidden.
 * Mobile: hamburger visible, opens Sheet with links, no horizontal overflow.
 *
 * Usage: node scripts/verify-header-nav.mjs [baseUrl]
 */

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:8082";
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });

// ── Desktop 1280px ──
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  const desktopNavVisible = await page
    .locator("header nav:visible", { hasText: "Companies" })
    .count();
  check(
    "desktop: inline nav visible (1280px)",
    desktopNavVisible > 0,
    "found inline nav with Companies",
  );

  const hamburgerVisible = await page.locator('button[aria-label="Open menu"]:visible').count();
  check(
    "desktop: hamburger hidden (1280px)",
    hamburgerVisible === 0,
    `${hamburgerVisible} visible`,
  );

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    "desktop: no horizontal overflow (1280px)",
    overflow.scrollWidth <= overflow.clientWidth,
    `${overflow.scrollWidth} <= ${overflow.clientWidth}`,
  );

  await page.screenshot({ path: "/tmp/w1-desktop.png" });
  await page.close();
}

// ── Mobile 375px ──
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  const inlineVisible = await page.locator("header nav:visible", { hasText: "Companies" }).count();
  check("mobile: inline nav hidden (375px)", inlineVisible === 0, `${inlineVisible} visible`);

  const hamburgerCount = await page.locator('button[aria-label="Open menu"]:visible').count();
  check("mobile: hamburger visible (375px)", hamburgerCount >= 1, `${hamburgerCount} visible`);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    "mobile: no horizontal overflow (375px)",
    overflow.scrollWidth <= overflow.clientWidth,
    `${overflow.scrollWidth} <= ${overflow.clientWidth}`,
  );

  // Open the sheet and verify links (Sheet renders in a portal at body root)
  await page.locator('button[aria-label="Open menu"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  const sheetLinks = await dialog
    .locator("a", { hasText: /.+/ })
    .evaluateAll((els) =>
      els.map((el) => ({ text: el.textContent?.trim(), href: el.getAttribute("href") })),
    );
  const names = sheetLinks.map((l) => l.text).join("|");
  check(
    "mobile: sheet opens with Articles/Companies links",
    /Articles/.test(names) && /Companies/.test(names),
    names,
  );

  await page.screenshot({ path: "/tmp/w1-mobile-sheet.png" });
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
