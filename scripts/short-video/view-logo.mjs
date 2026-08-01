import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";

const logoPath = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/Weixin Image_20260731192706_43_538.png";

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1024px; height: 1024px; background: #050508; display: flex; align-items: center; justify-content: center; }
  img { max-width: 1024px; max-height: 1024px; }
</style></head><body>
<img src="file://${logoPath}">
</body></html>`;

const tmpHtml = "/tmp/logo-view.html";
writeFileSync(tmpHtml, html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

await page.screenshot({ path: "/tmp/logo-dark-bg.png", clip: { x: 0, y: 0, width: 1024, height: 1024 } });

await page.evaluate(() => { document.body.style.background = "#fff"; });
await page.screenshot({ path: "/tmp/logo-white-bg.png", clip: { x: 0, y: 0, width: 1024, height: 1024 } });

await browser.close();
console.log("Logo screenshots saved");
