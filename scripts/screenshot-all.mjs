import { chromium } from "@playwright/test";

const URL = "http://localhost:8082/posts/deepseek-leaked-investor-meeting";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// Take full page screenshot
await page.screenshot({ path: "/tmp/full-page.png", fullPage: true });

// Get all breakout containers
const containers = await page.locator('[style*="min(90vw"]').all();
console.log("Total breakout containers:", containers.length);
for (let i = 0; i < containers.length; i++) {
  const box = await containers[i].boundingBox();
  const text = await containers[i].textContent();
  console.log(`Container ${i}:`, JSON.stringify(box), "text:", text?.slice(0, 50));
}

// Screenshot the first container (should be cloud + funding)
await containers[0].screenshot({ path: "/tmp/container-0.png" });

await browser.close();
