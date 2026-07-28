import { chromium } from "@playwright/test";

const URL = "http://localhost:8082/posts/deepseek-leaked-investor-meeting";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// Find the cloud widget - it's the first widget breakout container
const cloudContainer = page.locator('[style*="min(90vw"]').first();
const box = await cloudContainer.boundingBox();
console.log("Cloud container box:", JSON.stringify(box));

// Screenshot just the cloud area
await cloudContainer.screenshot({ path: "/tmp/cloud-widget.png" });
console.log("Cloud screenshot saved to /tmp/cloud-widget.png");

// Also get the computed styles of the tag cloud div
const tagInfo = await cloudContainer.evaluate((el) => {
  const tags = el.querySelectorAll("span[style*='fontSize']");
  const items = Array.from(tags).map((t) => {
    const style = window.getComputedStyle(t);
    return {
      text: t.textContent?.slice(0, 20),
      fontSize: style.fontSize,
      opacity: style.opacity,
      display: style.display,
    };
  });
  return { count: items.length, items: items.slice(0, 5) };
});
console.log("Tag info:", JSON.stringify(tagInfo, null, 2));

await browser.close();
