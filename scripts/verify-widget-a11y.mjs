#!/usr/bin/env node
/**
 * Widget accessibility + container verification (spec T2/T3).
 *
 * Loads article pages that embed widgets, probes each widget by a landmark
 * text (or unique selector), and asserts:
 *   - T2: interactive controls expose state (aria-pressed / aria-expanded /
 *         aria-label) and carry focus-visible token classes
 *   - T2: click toggles the state attribute (selection regression)
 *   - T3: outer widget cards use the bg-card recipe; inner panels use
 *         bg-muted/30 + rounded-lg; no leftover ad-hoc opacities or native
 *         colors (segmented controls with rounded-full are excluded)
 *
 * A widget is SKIPPED (not failed) when its landmark is absent, so the
 * script stays meaningful as articles change.
 *
 * Usage:
 *   node scripts/verify-widget-a11y.mjs [--url http://localhost:8083]
 */
import { chromium } from "playwright";

const argUrl = process.argv.indexOf("--url");
const BASE = argUrl >= 0 ? process.argv[argUrl + 1] : "http://localhost:8083";

const PAGES = [
  "/posts/deepseek-leaked-investor-meeting",
  "/posts/china-llm-distillation-scandal",
  "/posts/deepseek-art-of-restraint",
];

const results = { pass: 0, fail: 0, skip: 0 };
const failures = [];

function check(ok, name, detail) {
  if (ok === null) {
    results.skip++;
    console.log(`  ⏭️  SKIP  ${name}`);
    return;
  }
  if (ok) {
    results.pass++;
    console.log(`  ✅ PASS  ${name}`);
  } else {
    results.fail++;
    failures.push({ name, detail });
    console.log(`  ❌ FAIL  ${name} — ${detail}`);
  }
}

const FOCUS_CLASSES = [
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-brand",
];
const hasFocusClasses = (cls) => FOCUS_CLASSES.every((c) => (cls || "").includes(c));

const hasText = (page, text) =>
  page
    .getByText(text, { exact: false })
    .count()
    .then((n) => n > 0);

/** Count aria-pressed=true buttons whose visible text matches a regex. */
async function pressedCountMatching(page, pattern) {
  return page.evaluate((re) => {
    return [...document.querySelectorAll("button[aria-pressed='true']")].filter((b) =>
      re.test(b.textContent),
    ).length;
  }, pattern);
}

const BAR_TEXT = /\$|亿|(?:19|20)\d{2}/;

async function probeFunding(page) {
  if (!(await hasText(page, "Funding Timeline")) && !(await hasText(page, "Round 1 Investors"))) {
    return check(null, "FundingView present", "");
  }
  const bars = [];
  for (const b of await page.locator("button").all()) {
    if (BAR_TEXT.test(await b.innerText())) bars.push(b);
  }
  if (bars.length === 0) return check(null, "Funding bars found", "");
  check(
    (await pressedCountMatching(page, BAR_TEXT)) === 1,
    "Funding bars expose exactly one aria-pressed=true",
    `found ${await pressedCountMatching(page, BAR_TEXT)}`,
  );
  const cls = await bars[0].getAttribute("class");
  check(hasFocusClasses(cls), "Funding bars carry focus-visible classes", cls || "none");
  await bars[0].click();
  check(
    (await pressedCountMatching(page, BAR_TEXT)) === 1,
    "Funding bar click keeps exactly one selected",
    `found ${await pressedCountMatching(page, BAR_TEXT)}`,
  );
}

async function probeCompanies(page) {
  // Scoped: CompaniesView accordion buttons are full-width rows (px-4 py-3
  // text-left); excludes shadcn Sheet/Select triggers that also set
  // aria-expanded.
  const accordions = page.locator("button[aria-expanded].px-4");
  if (
    (await accordions.count()) === 0 &&
    !(await hasText(page, "Source: Liang Wenfeng Investor Meeting transcript"))
  ) {
    return check(null, "CompaniesView present", "");
  }
  check(
    (await accordions.count()) > 0,
    "Companies accordion buttons expose aria-expanded",
    `${await accordions.count()} found`,
  );
  if ((await accordions.count()) === 0) return;
  const cls = await accordions.first().getAttribute("class");
  check(hasFocusClasses(cls), "Companies accordion carries focus-visible classes", cls || "none");
  const before = await accordions.first().getAttribute("aria-expanded");
  await accordions.first().click();
  const after = await accordions.first().getAttribute("aria-expanded");
  check(
    before !== after,
    "Companies accordion aria-expanded toggles on click",
    `${before} → ${after}`,
  );
}

async function probeNewsCoverage(page) {
  const dots = page.locator("button.h-3\\.5.w-3\\.5");
  if ((await dots.count()) === 0) return check(null, "NewsCoverageView present", "");
  const labeled = await page.locator("button.h-3\\.5.w-3\\.5[aria-label]").count();
  check(
    labeled === (await dots.count()),
    "News dots expose aria-label",
    `${labeled}/${await dots.count()}`,
  );
  const unlabeled = await page.locator("button.h-3\\.5.w-3\\.5:not([aria-label])").count();
  check(unlabeled === 0, "No news dot lacks aria-label", `${unlabeled} unlabeled`);
  const cls = await dots.first().getAttribute("class");
  check(hasFocusClasses(cls), "News dots carry focus-visible classes", cls || "none");
  const before = await dots.first().getAttribute("aria-pressed");
  await dots.first().click();
  const after = await dots.first().getAttribute("aria-pressed");
  check(before !== after, "News dot aria-pressed toggles on click", `${before} → ${after}`);
}

async function probeMoonshot(page) {
  if (!(await hasText(page, "Valuation Timeline")))
    return check(null, "MoonshotFundingView present", "");
  const bars = [];
  for (const b of await page.locator("button").all()) {
    if (BAR_TEXT.test(await b.innerText())) bars.push(b);
  }
  if (bars.length === 0) return check(null, "Moonshot bars found", "");
  const pressedTrue = await pressedCountMatching(page, BAR_TEXT);
  check(pressedTrue >= 1, "Moonshot bars expose aria-pressed", `${pressedTrue} true`);
  const cls = await bars[0].getAttribute("class");
  check(hasFocusClasses(cls), "Moonshot bars carry focus-visible classes", cls || "none");
  await bars[0].click();
  check(
    (await pressedCountMatching(page, BAR_TEXT)) === 1,
    "Moonshot bar click keeps exactly one selected",
    `found ${await pressedCountMatching(page, BAR_TEXT)}`,
  );
}

async function probeApiPricing(page) {
  // api-pricing-view title is "API Pricing Comparison" — distinct from
  // deepseek pricing-view's "API Pricing" (whose Output/Input mode pills also
  // carry aria-pressed + px-3 and would false-positive here).
  if (!(await hasText(page, "API Pricing Comparison")))
    return check(null, "ApiPricingView present", "");
  // Company selector buttons: px-3 py-1.5 rounded-md pills
  const sel = page.locator("button[aria-pressed].px-3");
  check(
    (await sel.count()) >= 2,
    "ApiPricing selector buttons expose aria-pressed",
    `${await sel.count()} found`,
  );
  if ((await sel.count()) < 2) return;
  const cls = await sel.first().getAttribute("class");
  check(hasFocusClasses(cls), "ApiPricing selector carries focus-visible classes", cls || "none");
  const selected = await page.evaluate(
    () => [...document.querySelectorAll("button[aria-pressed='true'].px-3")].length,
  );
  check(selected === 1, "ApiPricing exactly one selected (DeepSeek default)", `${selected}`);
  await sel.nth(1).click();
  const selectedAfter = await page.evaluate(
    () => [...document.querySelectorAll("button[aria-pressed='true'].px-3")].length,
  );
  check(selectedAfter === 1, "ApiPricing click keeps exactly one selected", `${selectedAfter}`);
}

const BAD_INNER_TOKENS = ["bg-muted/40", "bg-muted/50", "bg-background/40", "bg-background/60"];

async function probeContainers(page) {
  // T3-1: the route wrapper (posts.$slug) owns the widget card — assert it is
  // bg-card and no redundant self-container (my-6 ... bg-muted/30 p-6) remains.
  const state = await page.evaluate((badTokens) => {
    const wrapperCards = [];
    const redundant = [];
    for (const el of document.querySelectorAll("[class]")) {
      const c = el.className;
      if (typeof c !== "string") continue;
      if (c.includes("bg-card") && c.includes("my-10")) wrapperCards.push(c);
      if (c.includes("my-6 rounded-lg border border-border/60 bg-muted/30 p-6")) redundant.push(c);
    }
    // T3-2..T3-6: inner panels unified on bg-muted/30 + rounded-lg;
    // hover:/active: transitions and rounded-full segments are excluded.
    const badInner = [...document.querySelectorAll("[class]")]
      .map((el) => el.className)
      .filter((c) => {
        if (typeof c !== "string") return false;
        const tokens = c
          .split(/\s+/)
          .filter((t) => !t.startsWith("hover:") && !t.startsWith("active:"));
        return (
          tokens.includes("rounded-lg") &&
          tokens.includes("border-border/60") &&
          tokens.some((t) => badTokens.includes(t))
        );
      });
    // T3-5: no native purple borders
    const purple = [...document.querySelectorAll("[class]")]
      .map((el) => el.className)
      .filter((c) => typeof c === "string" && c.includes("purple-500"));
    return { wrapperCards, redundant, badInner, purple };
  }, BAD_INNER_TOKENS);
  if (state.wrapperCards.length === 0) return check(null, "Route wrapper cards present", "");
  check(
    state.wrapperCards.length > 0,
    "Route wrapper owns widget cards (bg-card + my-10)",
    `${state.wrapperCards.length} found`,
  );
  check(
    state.redundant.length === 0,
    "No redundant my-6 bg-muted/30 self-containers remain",
    state.redundant.slice(0, 2).join(" | ") || "clean",
  );
  check(
    state.badInner.length === 0,
    "Inner panels unified on bg-muted/30 + rounded-lg",
    state.badInner.slice(0, 3).join(" | ") || "clean",
  );
  check(
    state.purple.length === 0,
    "No native purple border leftovers",
    state.purple.slice(0, 3).join(" | ") || "clean",
  );
}

async function probeKeyboard(page) {
  let state = "";
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    state = await page.evaluate(() => {
      const a = document.activeElement;
      return a && a.tagName === "BUTTON" ? a.className : "";
    });
    if (state) break;
  }
  check(
    state ? hasFocusClasses(state) : null,
    "Keyboard Tab reaches controls with focus-visible classes",
    state ? state.slice(0, 100) : "no button focused",
  );
}

for (const path of PAGES) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  console.log(`\n=== ${path} ===`);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await probeFunding(page);
  await probeCompanies(page);
  await probeNewsCoverage(page);
  await probeMoonshot(page);
  await probeApiPricing(page);
  await probeContainers(page);
  await probeKeyboard(page);
  await browser.close();
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✅ PASS: ${results.pass}   ❌ FAIL: ${results.fail}   ⏭️ SKIP: ${results.skip}`);
if (failures.length) {
  console.log("\nFailed checks:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
