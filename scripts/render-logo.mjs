/**
 * Renders the China AI News brand logo to PNG for use as profile picture.
 * Uses Playwright to screenshot the SVG at high resolution.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logoSVG = readFileSync(
  join(__dirname, "short-video", "assets", "china-ai-news-logo.svg"),
  "utf8",
);

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1024px; height: 1024px; }
  .logo-container { width: 1024px; height: 1024px; display: flex; align-items: center; justify-content: center; }
  .logo-container svg { width: 1024px; height: 1024px; }
</style></head><body>
<div class="logo-container">${logoSVG}</div>
</body></html>`;

const tmpPath = join(__dirname, "short-video", "output", "logo-render.html");
const { mkdirSync, writeFileSync } = await import("fs");
mkdirSync(join(__dirname, "short-video", "output"), { recursive: true });
writeFileSync(tmpPath, html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1024, height: 1024 },
  deviceScaleFactor: 2,
});

await page.goto(`file://${tmpPath}`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

// Full logo PNG (for profile picture)
const logoPath = join(__dirname, "short-video", "assets", "china-ai-news-logo.png");
await page.screenshot({
  path: logoPath,
  clip: { x: 0, y: 0, width: 1024, height: 1024 },
});
console.log(`Logo PNG saved: ${logoPath}`);

// Circular crop version (for avatar)
const avatarPath = join(__dirname, "short-video", "assets", "china-ai-news-avatar.png");
await page.evaluate(() => {
  const container = document.querySelector(".logo-container");
  container.style.borderRadius = "50%";
  container.style.overflow = "hidden";
});
await page.screenshot({
  path: avatarPath,
  clip: { x: 0, y: 0, width: 1024, height: 1024 },
});
console.log(`Avatar PNG saved: ${avatarPath}`);

await browser.close();
