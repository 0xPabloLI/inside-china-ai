import { chromium } from "@playwright/test";
import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgContent = readFileSync(join(__dirname, "assets", "china-ai-news-logo-new.svg"), "utf8");
const pngPath = join(__dirname, "assets", "Weixin Image_20260731192706_43_538.png");

// Side-by-side comparison
const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 2048px; height: 1024px; background: #050508; display: flex; }
  .panel { width: 1024px; height: 1024px; display: flex; align-items: center; justify-content: center; position: relative; }
  .panel:first-child { border-right: 1px solid rgba(255,255,255,0.1); }
  .label { position: absolute; top: 20px; left: 20px; color: #94a3b8; font-family: monospace; font-size: 20px; z-index: 10; }
  svg { max-width: 800px; max-height: 800px; }
  img { max-width: 800px; max-height: 800px; }
</style></head><body>
  <div class="panel">
    <div class="label">SVG (potrace traced)</div>
    ${svgContent}
  </div>
  <div class="panel">
    <div class="label">Original PNG (GPT generated)</div>
    <img src="file://${pngPath}">
  </div>
</body></html>`;

const tmpHtml = join(__dirname, "output", "svg-verify.html");
writeFileSync(tmpHtml, html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 2048, height: 1024 } });
await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const screenshotPath = join(__dirname, "output", "svg-vs-png-compare.png");
await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 2048, height: 1024 } });

// Also render the SVG alone at 1:1 scale for detailed inspection
const html2 = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1024px; height: 1024px; background: #050508; display: flex; align-items: center; justify-content: center; }
  svg { width: 1024px; height: 1024px; }
</style></head><body>
  ${svgContent}
</body></html>`;
writeFileSync(join(__dirname, "output", "svg-only-render.html"), html2);
await page.goto(`file://${join(__dirname, "output", "svg-only-render.html")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.screenshot({ path: join(__dirname, "output", "svg-only-render.png"), clip: { x: 0, y: 0, width: 1024, height: 1024 } });

// Render the original PNG alone for pixel comparison
const html3 = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1024px; height: 1024px; background: #050508; display: flex; align-items: center; justify-content: center; }
  img { width: 1024px; height: 1024px; }
</style></head><body>
  <img src="file://${pngPath}">
</body></html>`;
writeFileSync(join(__dirname, "output", "png-only-render.html"), html3);
await page.goto(`file://${join(__dirname, "output", "png-only-render.html")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.screenshot({ path: join(__dirname, "output", "png-only-render.png"), clip: { x: 0, y: 0, width: 1024, height: 1024 } });

await browser.close();
console.log("Verification screenshots saved");
