import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";

const urls = [
  "https://www.canva.com/learn/tiktok-video/",
  "https://buffer.com/resources/tiktok-video/",
  "https://blog.buffer.com/tiktok-tips/",
  "https://www.socialmediaexaminer.com/tiktok-video-tips/",
  "https://blog.snappa.com/tiktok-video/",
  "https://www.podium.com/blog/tiktok-video-best-practices/",
  "https://www Animoto.com/blog/tiktok-best-practices/",
  "https://www.renderforest.com/blog/tiktok-video-best-practices",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let allContent = "";

for (const url of urls) {
  try {
    console.log(`Fetching: ${url}`);
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    if (resp && resp.status() === 200) {
      await page.waitForTimeout(3000);
      const title = await page.title();
      const text = await page.evaluate(() => {
        document.querySelectorAll("script, style, nav, footer, header, aside, iframe, .ad, .ads, .popup, .cookie, .newsletter, .related").forEach(el => el.remove());
        return document.body.innerText;
      });
      if (text && text.length > 500) {
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 10);
        allContent += `\n\n=== ${url} ===\nTITLE: ${title}\n${lines.slice(0, 100).join("\n")}\n`;
        console.log(`  OK: ${title} (${lines.length} lines)`);
      } else {
        console.log(`  Short content: ${text ? text.length : 0}`);
      }
    } else {
      console.log(`  HTTP ${resp ? resp.status() : "?"}`);
    }
  } catch (e) {
    console.log(`  Failed: ${e.message.substring(0, 80)}`);
  }
}

await browser.close();

writeFileSync("/tmp/tiktok-best-practices-v2.txt", allContent);
console.log(`\nTotal: ${allContent.length} chars, saved to /tmp/tiktok-best-practices-v2.txt`);
