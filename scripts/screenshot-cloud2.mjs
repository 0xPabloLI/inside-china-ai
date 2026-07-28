import { chromium } from "@playwright/test";

const URL = "http://localhost:8082/posts/deepseek-leaked-investor-meeting";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// Get main container width
const mainBox = await page.locator("main").boundingBox();
console.log("Main box:", JSON.stringify(mainBox));

// Find the tag cloud (flex flex-wrap)
const tagCloud = page.locator(".flex.flex-wrap.items-baseline").first();
const cloudBox = await tagCloud.boundingBox();
console.log("Tag cloud box:", JSON.stringify(cloudBox));

// Get all tags
const tags = await tagCloud.locator("span[style*='fontSize']").all();
console.log("Tag count:", tags.length);
if (tags.length > 0) {
  for (let i = 0; i < Math.min(5, tags.length); i++) {
    const box = await tags[i].boundingBox();
    const text = await tags[i].textContent();
    console.log(`Tag ${i}: "${text?.slice(0, 15)}" box:`, JSON.stringify(box));
  }
}

// Screenshot the cloud area
await tagCloud.screenshot({ path: "/tmp/cloud-tag.png" });
console.log("Screenshot saved to /tmp/cloud-tag.png");

await browser.close();
