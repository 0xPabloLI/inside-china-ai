import { chromium } from "@playwright/test";

const URL = "http://localhost:8082/posts/deepseek-leaked-investor-meeting";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });

// Wait for lazy widgets to load
await page.waitForTimeout(3000);

// Check for widget breakout containers
const widgetContainers = await page.locator('[style*="min(90vw"]').count();
console.log("Widget breakout containers:", widgetContainers);

// Check for widget content
const hasLuoFuli = await page.locator("text=Luo Fuli").count();
console.log("Talent data (Luo Fuli):", hasLuoFuli);

const hasFunding = await page.locator("text=Fundraising").count();
console.log("Funding text (Fundraising):", hasFunding);

const hasPricing = await page.locator("text=API Pricing").count();
console.log("Pricing text:", hasPricing);

const hasNVIDIA = await page.locator("text=NVIDIA").count();
console.log("NVIDIA (Companies):", hasNVIDIA);

const hasCost = await page.locator("text=cost").count();
console.log("Cloud keyword (cost):", hasCost);

const hasUnknown = await page.locator("text=Unknown widget").count();
console.log("Unknown widget placeholders:", hasUnknown);

// Check layout width
const mainStyle = await page.locator("main").getAttribute("class");
console.log("Main classes:", mainStyle);

// Take screenshot
await page.screenshot({ path: "/tmp/article-widgets.png", fullPage: true });
console.log("Screenshot saved to /tmp/article-widgets.png");

await browser.close();
