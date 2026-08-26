/**
 * TikTok Creator Search Insights (CSI) CDP Integration
 *
 * Uses web-access CDP to interact with TikTok's CSI tool (tiktok.com/csi).
 * Requires user's TikTok login session in Chrome/Edge.
 *
 * Verified 2026-08-26:
 * - CSI topic list: ✅ available (tiktok.com/csi)
 * - Content Gap filter: ✅ available ("内容缺口" chip)
 * - Topic detail page: ✅ available (tiktok.com/csi/detail/{topicId})
 * - AI Outline: ❌ not on desktop (mobile-only)
 * - Search Analytics: ❌ "coming soon" on desktop
 *
 * @module tiktok-csi
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── CDP Proxy Constants ───

const CDP_BASE = "http://localhost:3456";
const CSI_URL = "https://www.tiktok.com/csi";
const CSI_DETAIL_URL_PREFIX = "https://www.tiktok.com/csi/detail/";

// ─── CDP Helper Functions ───

/**
 * Check if CDP proxy is running and ready.
 * @returns {boolean}
 */
function isCdpReady() {
  try {
    const result = execSync(`curl -s --max-time 3 ${CDP_BASE}/targets`, {
      encoding: "utf8",
    });
    return result.includes("targetId");
  } catch {
    return false;
  }
}

/**
 * Create a new browser tab and wait for initial load.
 * @param {string} url - URL to open
 * @returns {string} targetId
 */
function newTab(url) {
  const result = execSync(`curl -s -X POST --data-raw '${url}' ${CDP_BASE}/new`, {
    encoding: "utf8",
  });
  const data = JSON.parse(result);
  if (!data.targetId) throw new Error("CDP new tab failed: no targetId");
  return data.targetId;
}

/**
 * Navigate an existing tab to a new URL.
 * @param {string} targetId
 * @param {string} url
 */
function navigate(targetId, url) {
  execSync(`curl -s -X POST --data-raw '${url}' "${CDP_BASE}/navigate?target=${targetId}"`, {
    encoding: "utf8",
  });
}

/**
 * Execute JS in the page and return the result.
 * @param {string} targetId
 * @param {string} js - JavaScript expression to evaluate
 * @returns {*} Parsed JSON result
 */
function evalPage(targetId, js) {
  // Use a temp file to avoid shell escaping issues with complex JS
  const tmpFile = `/tmp/cdp-eval-${Date.now()}.js`;
  writeFileSync(tmpFile, js, "utf8");
  const result = execSync(
    `curl -s -X POST "${CDP_BASE}/eval?target=${targetId}" --data-binary @${tmpFile}`,
    { encoding: "utf8" },
  );
  unlinkSync(tmpFile);
  const data = JSON.parse(result);
  if (data.error) throw new Error(`CDP eval error: ${data.error}`);
  if (!data.value) return null;
  // Try to parse as JSON; if it fails, return the raw string
  try {
    return JSON.parse(data.value);
  } catch {
    return data.value;
  }
}

/**
 * Wait for page to load (poll readyState + content check).
 * @param {string} targetId
 * @param {number} [timeoutMs=10000]
 */
function waitForLoad(targetId, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = execSync(`curl -s "${CDP_BASE}/info?target=${targetId}"`, { encoding: "utf8" });
    const data = JSON.parse(info);
    if (data.ready === "complete" || data.ready === "interactive") {
      // Check if body has content
      const bodyCheck = execSync(
        `curl -s -X POST "${CDP_BASE}/eval?target=${targetId}" -d 'document.body ? document.body.innerText.length : 0'`,
        { encoding: "utf8" },
      );
      const bodyData = JSON.parse(bodyCheck);
      const bodyLen = parseInt(bodyData.value, 10) || 0;
      if (bodyLen > 100) return;
    }
    execSync("sleep 1", { encoding: "utf8" });
  }
}

/**
 * Close a tab.
 * @param {string} targetId
 */
function closeTab(targetId) {
  try {
    execSync(`curl -s "${CDP_BASE}/close?target=${targetId}"`, {
      encoding: "utf8",
    });
  } catch {
    // Best effort
  }
}

// ─── Public API ───

/**
 * Check CSI availability on the user's browser.
 *
 * @returns {Promise<{available: boolean, loginRequired: boolean, contentGapAvailable: boolean, aiOutlineAvailable: boolean, searchAnalyticsAvailable: boolean, region: string|null}>}
 */
export async function checkCsiAvailability() {
  if (!isCdpReady()) {
    throw new Error(
      "CDP proxy not ready. Run: node ~/.agents/skills/web-access/scripts/check-deps.mjs",
    );
  }

  const targetId = newTab(CSI_URL);
  waitForLoad(targetId);

  const info = evalPage(
    targetId,
    `JSON.stringify({
      url: location.href,
      bodyText: document.body ? document.body.innerText.substring(0, 500) : "",
      hasContentGap: !![...document.querySelectorAll("[class*=Chip]")].find(c => {
        const t = c.textContent.trim();
        return t === "内容缺口" || t === "Content gap" || t.toLowerCase().includes("content gap");
      }),
      hasAiOutline: document.body.innerText.includes("AI Outline") || document.body.innerText.includes("AI 大纲"),
      hasSearchAnalytics: document.body.innerText.includes("数据分析") || document.body.innerText.includes("Search Analytics"),
      loginRequired: !document.body || document.body.innerText.length < 50 || location.href.includes("login"),
    })`,
  );

  closeTab(targetId);

  const loginRequired = info.loginRequired || info.bodyText.length < 50;
  const available = !loginRequired && info.url.includes("/csi");

  return {
    available,
    loginRequired,
    contentGapAvailable: info.hasContentGap,
    aiOutlineAvailable: false, // Verified: not on desktop
    searchAnalyticsAvailable: false, // Verified: "coming soon" on desktop
    region: info.url.includes("/csi") ? "detected" : null,
  };
}

/**
 * Fetch Content Gap topics from CSI.
 *
 * Navigates to CSI, clicks the "Content Gap" filter, extracts topic list.
 *
 * @param {Object} [opts]
 * @param {string} [opts.category] - Not supported by CSI web (returns all)
 * @param {number} [opts.limit=20] - Max topics to return
 * @returns {Promise<Array<{topic: string, searchVolume: string, growthRate: string, topicId: string|null}>>}
 */
export async function fetchContentGapTopics(opts = {}) {
  const limit = opts.limit || 20;

  if (!isCdpReady()) {
    throw new Error(
      "CDP proxy not ready. Run: node ~/.agents/skills/web-access/scripts/check-deps.mjs",
    );
  }

  const targetId = newTab(CSI_URL);
  waitForLoad(targetId);

  // Click "Content Gap" filter
  evalPage(
    targetId,
    `(() => {
      const chips = document.querySelectorAll("[class*=Chip]");
      for (const c of chips) {
        const t = c.textContent.trim();
        if (t === "内容缺口" || t === "Content gap" || t.toLowerCase().includes("content gap")) {
          c.click();
          return "clicked";
        }
      }
      return "not found";
    })()`,
  );

  // Wait for filtered results
  execSync("sleep 3", { encoding: "utf8" });

  // Extract topics using <tr> row structure
  // Each row has 4 <td> cells: [topic name, search volume + growth rate, AI tips, action]
  const topics = evalPage(
    targetId,
    `(() => {
      const rows = document.querySelectorAll("tr");
      const results = [];
      for (const row of rows) {
        const tds = row.querySelectorAll("td");
        if (tds.length < 2) continue;
        const topic = tds[0].textContent.trim();
        if (!topic || topic === "搜索主题" || topic === "Search topic") continue;
        // Second td contains volume + growth (e.g. "148K1000%+" or "6.30K1000%+")
        const volText = tds[1].textContent.trim();
        // Match volume: number with optional K/M suffix (e.g. "148K", "6.30K", "100")
        const volumeMatch = volText.match(/^(\\d[\\d.]*[KM]?)/);
        // Match growth: percentage with optional + (e.g. "1000%+", "197.4%")
        const growthMatch = volText.match(/(\\d[\\d.]*%\\+?)$/);
        // Try to find topic link for topicId
        const link = tds[0].querySelector("a[href*='/csi/detail/']");
        const href = link ? link.getAttribute("href") : "";
        const topicId = href ? href.split("/csi/detail/")[1]?.split("?")[0] : null;
        results.push({
          topic,
          searchVolume: volumeMatch ? volumeMatch[1] : "",
          growthRate: growthMatch ? growthMatch[1] : "",
          topicId,
        });
      }
      return JSON.stringify(results);
    })()`,
  );

  closeTab(targetId);

  return topics.slice(0, limit);
}

/**
 * Fetch topic detail page data (search volume, demographics, related topics).
 *
 * @param {string} topicId - Topic ID from CSI (e.g. "7632250344352776212")
 * @returns {Promise<{topic: string, searchVolume: string, growthRate: string, regions: Array<{country: string, percentage: string}>, ageDistribution: string, relatedVideos: number}|null>}
 */
export async function fetchTopicDetail(topicId) {
  if (!isCdpReady()) {
    throw new Error(
      "CDP proxy not ready. Run: node ~/.agents/skills/web-access/scripts/check-deps.mjs",
    );
  }

  const url = `${CSI_DETAIL_URL_PREFIX}${topicId}`;
  const targetId = newTab(url);
  waitForLoad(targetId, 15000);
  execSync("sleep 3", { encoding: "utf8" }); // Extra wait for dynamic content

  const detail = evalPage(
    targetId,
    `(() => {
      const text = document.body ? document.body.innerText : "";
      // Parse topic name (first line after nav)
      const lines = text.split("\\n").filter(l => l.trim().length > 0);
      const topicIdx = lines.findIndex(l => l === "上传" || l.includes("搜索热度"));
      const topic = topicIdx > 0 ? lines[topicIdx - 1] : "";

      // Search volume
      const volMatch = text.match(/搜索热度\\n([\\d.]+[KM]?)/);
      const searchVolume = volMatch ? volMatch[1] : "";

      // Growth rate
      const growthMatch = text.match(/搜索热度\\n[\\d.]+[KM]?\\n(\\d+%\\+?|-)/);
      const growthRate = growthMatch ? growthMatch[1] : "";

      // Regions
      const regions = [];
      const regionSection = text.split("位置");
      if (regionSection.length > 1) {
        const regionText = regionSection[1].split("人口统计")[0];
        const regionLines = regionText.split("\\n").filter(l => l.trim().length > 0);
        for (let i = 0; i < regionLines.length - 1; i += 2) {
          if (regionLines[i] && regionLines[i + 1]) {
            regions.push({ country: regionLines[i], percentage: regionLines[i + 1] });
          }
        }
      }

      // Related videos count
      const videoMatch = text.match(/相关视频\\n([\\d.]+[K]?)/);
      const relatedVideos = videoMatch ? videoMatch[1] : "";

      return JSON.stringify({ topic, searchVolume, growthRate, regions, relatedVideos });
    })()`,
  );

  closeTab(targetId);

  return detail;
}

/**
 * Fetch all CSI topics (no Content Gap filter, "recommended" tab).
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=20]
 * @returns {Promise<Array<{topic: string, searchVolume: string, growthRate: string, topicId: string|null}>>}
 */
export async function fetchRecommendedTopics(opts = {}) {
  const limit = opts.limit || 20;

  if (!isCdpReady()) {
    throw new Error(
      "CDP proxy not ready. Run: node ~/.agents/skills/web-access/scripts/check-deps.mjs",
    );
  }

  const targetId = newTab(CSI_URL);
  waitForLoad(targetId);

  // Default tab is "推荐" (Recommended) — no filter needed
  execSync("sleep 2", { encoding: "utf8" });

  // Extract topics using <tr> row structure (same as fetchContentGapTopics)
  const topics = evalPage(
    targetId,
    `(() => {
      const rows = document.querySelectorAll("tr");
      const results = [];
      for (const row of rows) {
        const tds = row.querySelectorAll("td");
        if (tds.length < 2) continue;
        const topic = tds[0].textContent.trim();
        if (!topic || topic === "搜索主题" || topic === "Search topic") continue;
        const volText = tds[1].textContent.trim();
        const volumeMatch = volText.match(/^(\\d[\\d.]*[KM]?)/);
        const growthMatch = volText.match(/(\\d[\\d.]*%\\+?)$/);
        const link = tds[0].querySelector("a[href*='/csi/detail/']");
        const href = link ? link.getAttribute("href") : "";
        const topicId = href ? href.split("/csi/detail/")[1]?.split("?")[0] : null;
        results.push({
          topic,
          searchVolume: volumeMatch ? volumeMatch[1] : "",
          growthRate: growthMatch ? growthMatch[1] : "",
          topicId,
        });
      }
      return JSON.stringify(results);
    })()`,
  );

  closeTab(targetId);

  return topics.slice(0, limit);
}

// ─── CLI Entry ───

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === "--check") {
  console.log("🔍 Checking CSI availability...\n");
  checkCsiAvailability()
    .then((result) => {
      console.log("Result:");
      console.log(`  Available:           ${result.available ? "✅" : "❌"}`);
      console.log(`  Login required:      ${result.loginRequired ? "⚠️  Yes" : "✅ No"}`);
      console.log(`  Content Gap:         ${result.contentGapAvailable ? "✅" : "❌"}`);
      console.log(
        `  AI Outline:          ${result.aiOutlineAvailable ? "✅" : "❌ (desktop not available)"}`,
      );
      console.log(
        `  Search Analytics:    ${result.searchAnalyticsAvailable ? "✅" : "❌ (coming soon on desktop)"}`,
      );
      process.exit(result.available ? 0 : 1);
    })
    .catch((e) => {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    });
} else if (cmd === "--content-gap") {
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : 20;

  console.log("📊 Fetching Content Gap topics...\n");
  fetchContentGapTopics({ limit })
    .then((topics) => {
      console.log(`Found ${topics.length} Content Gap topics:\n`);
      for (const t of topics) {
        console.log(
          `  • ${t.topic} — ${t.searchVolume} (${t.growthRate})${t.topicId ? ` [${t.topicId}]` : ""}`,
        );
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    });
} else if (cmd === "--recommended") {
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : 20;

  console.log("📊 Fetching recommended topics...\n");
  fetchRecommendedTopics({ limit })
    .then((topics) => {
      console.log(`Found ${topics.length} recommended topics:\n`);
      for (const t of topics) {
        console.log(
          `  • ${t.topic} — ${t.searchVolume} (${t.growthRate})${t.topicId ? ` [${t.topicId}]` : ""}`,
        );
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    });
} else if (cmd === "--detail") {
  const topicId = args[1];
  if (!topicId) {
    console.error("Usage: --detail <topicId>");
    process.exit(1);
  }
  console.log(`📊 Fetching topic detail: ${topicId}...\n`);
  fetchTopicDetail(topicId)
    .then((detail) => {
      if (!detail) {
        console.log("No data found.");
        process.exit(1);
      }
      console.log(`Topic: ${detail.topic}`);
      console.log(`Search volume: ${detail.searchVolume}`);
      console.log(`Growth rate: ${detail.growthRate}`);
      console.log(`\nRegions:`);
      for (const r of detail.regions) {
        console.log(`  ${r.country}: ${r.percentage}`);
      }
      console.log(`\nRelated videos: ${detail.relatedVideos}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    });
} else if (cmd) {
  console.error(`Unknown command: ${cmd}`);
  console.error(
    "Available: --check, --content-gap [--limit N], --recommended [--limit N], --detail <topicId>",
  );
  process.exit(1);
}
