import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";

const urls = [
  "https://later.com/blog/tiktok-video-best-practices/",
  "https://www.socialpilot.co/blog/tiktok-video-best-practices",
  "https://blog.hubspot.com/marketing/tiktok-video",
  "https://www.wix.com/blog/tiktok-best-practices",
  "https://blog.hootsuite.com/tiktok-statistics/",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let allContent = "";

for (const url of urls) {
  try {
    console.log(`Fetching: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);
    
    // Get page title
    const title = await page.title();
    console.log(`  Title: ${title}`);
    
    // Get all visible text
    const text = await page.evaluate(() => {
      // Remove unwanted elements
      document.querySelectorAll("script, style, nav, footer, header, aside, iframe, .ad, .ads, .banner, .popup, .modal, .cookie, .newsletter").forEach(el => el.remove());
      return document.body.innerText;
    });
    
    if (text && text.length > 500) {
      // Get just the first 2000 chars of meaningful content (skip boilerplate)
      const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      // Find where the article starts (usually after some nav/social links)
      const startIdx = lines.findIndex((l, i) => 
        i > 2 && l.length > 50 && !/cookie|subscribe|sign up|log in|menu|search|share|follow/i.test(l)
      );
      const articleLines = lines.slice(Math.max(0, startIdx), startIdx + 80);
      allContent += `\n\n=== ${url} ===\n${articleLines.join("\n")}\n`;
      console.log(`  Got ${articleLines.length} lines (${text.length} chars total)`);
    } else {
      console.log(`  Content too short: ${text ? text.length : 0} chars`);
    }
  } catch (e) {
    console.log(`  Failed: ${e.message}`);
  }
}

await browser.close();

writeFileSync("/tmp/tiktok-best-practices-raw.txt", allContent);
console.log(`\nTotal: ${allContent.length} chars`);
console.log("Saved to /tmp/tiktok-best-practices-raw.txt");
