import { chromium } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const htmlPath = join(__dirname, "youtube-thumbnail.html");
const outputPath = join(__dirname, "youtube-thumbnail.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2, // 2x for retina quality
});

await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

await page.screenshot({
  path: outputPath,
  clip: { x: 0, y: 0, width: 1280, height: 720 },
});

console.log(`Thumbnail saved to: ${outputPath}`);

// Also save a 2x version for extra quality
const outputPath2x = join(__dirname, "youtube-thumbnail-2x.png");
await page.screenshot({
  path: outputPath2x,
  clip: { x: 0, y: 0, width: 1280, height: 720 },
});
console.log(`2x Thumbnail saved to: ${outputPath2x}`);

await browser.close();
