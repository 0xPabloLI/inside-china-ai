import { chromium } from "@playwright/test";
import { generateScene } from "./content/deepseek/scenes.mjs";
import { scenes } from "./content/deepseek/scene-data.mjs";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate scene 1 HTML
const html = generateScene(scenes[0], 6.0);
const htmlPath = join(__dirname, "output", "scenes", "scene-1.html");
writeFileSync(htmlPath, html);
console.log("Scene 1 HTML generated");

// Screenshot
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000); // Wait for animations
await page.screenshot({
  path: join(__dirname, "output", "scene-1-preview.png"),
  clip: { x: 0, y: 0, width: 1080, height: 1920 },
});
console.log("Scene 1 preview saved");

// Also preview scene 12 (CTA with logo)
const html12 = generateScene(scenes[11], 4.0);
const html12Path = join(__dirname, "output", "scenes", "scene-12.html");
writeFileSync(html12Path, html12);
await page.goto(`file://${html12Path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({
  path: join(__dirname, "output", "scene-12-preview.png"),
  clip: { x: 0, y: 0, width: 1080, height: 1920 },
});
console.log("Scene 12 (CTA) preview saved");

await browser.close();
