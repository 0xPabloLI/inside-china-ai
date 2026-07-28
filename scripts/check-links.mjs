import { chromium } from "@playwright/test";

const URL = "http://localhost:8082/posts/deepseek-leaked-investor-meeting";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// Find all <a> tags inside widget containers
const links = await page.locator("a[target='_blank']").all();
console.log("Total target=_blank links on page:", links.length);

// Check links inside the funding view area (second widget)
for (let i = 0; i < Math.min(5, links.length); i++) {
  const text = (await links[i].textContent())?.trim();
  const href = await links[i].getAttribute("href");
  const box = await links[i].boundingBox();
  console.log(`Link ${i}: text="${text?.slice(0, 30)}" href="${href?.slice(0, 50)}" visible=${!!box}`);
}

// Try clicking the first widget link
if (links.length > 0) {
  const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
  await links[0].click();
  const popup = await popupPromise;
  console.log("Popup opened:", !!popup);
  if (popup) {
    console.log("Popup URL:", popup.url());
    await popup.close();
  }
}

await browser.close();
