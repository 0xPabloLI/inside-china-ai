import { chromium } from "@playwright/test";
import { join } from "path";

const browser = await chromium.launch({ headless: true });
const scenes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
for (const id of scenes) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const htmlPath = join(process.cwd(), "scripts/short-video/output/scenes", `scene-${id}.html`);
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000); // Wait for animations to reach a good state
  await page.screenshot({
    path: `scripts/short-video/output/scene-${id}-preview.png`,
    clip: { x: 0, y: 0, width: 1080, height: 1920 },
  });
  await page.close();
  console.log(`Scene ${id}: screenshot saved`);
}
await browser.close();
