import { chromium } from "@playwright/test";

const URL = "http://localhost:8082/posts/deepseek-leaked-investor-meeting";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// Find the funding widget - it contains "Fundraising" or "Round 1"
const fundingWidget = page
  .locator("text=Round 1 Investors")
  .locator("xpath=ancestor::div[contains(@class,'my-10')]");
const fundingBox = await fundingWidget.boundingBox();
console.log("Funding widget found:", !!fundingBox, JSON.stringify(fundingBox));

// Find all <a> tags inside the funding widget
const fundingLinks = await fundingWidget.locator("a").all();
console.log("Links inside funding widget:", fundingLinks.length);

for (let i = 0; i < fundingLinks.length; i++) {
  const text = (await fundingLinks[i].textContent())?.trim();
  const href = await fundingLinks[i].getAttribute("href");
  const box = await fundingLinks[i].boundingBox();
  console.log(
    `  Link ${i}: text="${text?.slice(0, 40)}" href="${href?.slice(0, 60)}" visible=${!!box} box=${JSON.stringify(box)}`,
  );
}

// Check if there's a detail panel that needs to be clicked first
const detailPanel = fundingWidget.locator("text=Investors:");
const detailBox = await detailPanel.boundingBox().catch(() => null);
console.log("\nDetail panel visible:", !!detailBox);

// Try clicking a round button first
const roundButtons = await fundingWidget.locator("button").all();
console.log("Buttons in funding widget:", roundButtons.length);
for (let i = 0; i < Math.min(5, roundButtons.length); i++) {
  const text = (await roundButtons[i].textContent())?.trim();
  const box = await roundButtons[i].boundingBox();
  console.log(`  Button ${i}: text="${text?.slice(0, 20)}" visible=${!!box}`);
}

// Click the first round button (should be the completed round)
if (roundButtons.length > 0) {
  await roundButtons[0].click();
  await page.waitForTimeout(500);

  // Now check for links in the expanded detail
  const detailLinks = await fundingWidget.locator("a").all();
  console.log("\nAfter clicking round button, links:", detailLinks.length);
  for (let i = 0; i < detailLinks.length; i++) {
    const text = (await detailLinks[i].textContent())?.trim();
    const href = await detailLinks[i].getAttribute("href");
    const box = await detailLinks[i].boundingBox();
    console.log(
      `  Link ${i}: text="${text?.slice(0, 40)}" href="${href?.slice(0, 60)}" visible=${!!box}`,
    );
  }
}

// Screenshot the funding widget
await fundingWidget.screenshot({ path: "/tmp/funding-widget.png" });
console.log("\nScreenshot saved to /tmp/funding-widget.png");

await browser.close();
