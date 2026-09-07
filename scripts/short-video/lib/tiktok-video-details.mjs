/**
 * TikTok per-video analytics detail fetcher (#215)
 *
 * Scrapes the per-video analytics pages
 * (`tiktokstudio/analytics/<videoId>/overview`) via the web-access CDP
 * proxy, which the CSV export lacks: average watch time, watched-full-video
 * percentage (completion rate), total play time, retention insight and
 * per-video traffic source split.
 *
 * Minimal-interaction principles (risk-control reduction):
 * - Read-only: only visits our own account's analytics pages.
 * - Single pass, no retry storms: a page that fails is recorded and skipped.
 * - Silent render waits: no eval while the SPA is first-painting (this is
 *   what intermittently hangs the renderer — verified 2026-09-07).
 * - Human-like pacing: 4-8s jitter between video pages.
 * - One tab reused for the whole run, closed at the end.
 * - One sanctioned reload: the SPA "Unexpected Application Error" crash
 *   recovers on reload (verified 2026-09-07).
 *
 * Verified ground truth 2026-09-07 (qwen video 7679644897619561748):
 *   Video views 467, Average watch time 7.18s, Watched full video 2.6%,
 *   Total play time 1h:00m:41s, Traffic source For You 88.5% / Search 8.9%.
 *
 * @module tiktok-video-details
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { CDP_BASE, cdpNewTab, cdpEval, cdpCloseTab } from "./cdp-client.mjs";

const CONTENT_LIST_URL = "https://www.tiktok.com/tiktokstudio/content";
const DETAIL_URL_PREFIX = "https://www.tiktok.com/tiktokstudio/analytics/";

const CRASH_MARKER = "Unexpected Application Error";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Random 4-8s pacing between page loads (human-like). */
export function pacingDelayMs(rand = Math.random) {
  return 4000 + Math.round(rand() * 4000);
}

/**
 * Parse the innerText of a per-video analytics overview page.
 *
 * Real page text shape (2026-09-07):
 * ```
 * #alibaba #qwen
 * Posted on 8/30/2026
 * 467 | 11 | 0 | 1 | 5
 * Video views | 467
 * Total play time | 1h:00m:41s
 * Average watch time | 7.18s
 * Watched full video | 2.6%
 * New followers | 0
 * Chart shows the data trend...
 * Retention rate
 * Most viewers stopped watching at 0:01. ...
 * Traffic source
 * For You | 88.5%
 * Search | 8.9%
 * ...
 * ```
 *
 * @param {string} text - innerText of the detail page
 * @returns {{postedOn: string|null, videoViews: number|null, totalPlayTime: string|null, avgWatchTimeSec: number|null, watchedFullVideoPct: number|null, newFollowers: number|null, retentionInsight: string|null, trafficSource: {forYouPct: number|null, searchPct: number|null}}}
 */
export function parseVideoDetailText(text) {
  const result = {
    postedOn: null,
    videoViews: null,
    totalPlayTime: null,
    avgWatchTimeSec: null,
    watchedFullVideoPct: null,
    newFollowers: null,
    retentionInsight: null,
    trafficSource: { forYouPct: null, searchPct: null },
  };
  if (!text || text.includes(CRASH_MARKER)) return result;

  const posted = text.match(/Posted on (\d{1,2}\/\d{1,2}\/\d{4})/);
  if (posted) result.postedOn = posted[1];

  const views = text.match(/Video views\n([\d,]+)/);
  if (views) result.videoViews = parseInt(views[1].replace(/,/g, ""), 10);

  const play = text.match(/Total play time\n([\dhms:]+)/);
  if (play) result.totalPlayTime = play[1];

  const avg = text.match(/Average watch time\n([\d.]+)s/);
  if (avg) result.avgWatchTimeSec = parseFloat(avg[1]);

  const full = text.match(/Watched full video\n([\d.]+)%/);
  if (full) result.watchedFullVideoPct = parseFloat(full[1]);

  const followers = text.match(/New followers\n([\d,]+)/);
  if (followers) result.newFollowers = parseInt(followers[1].replace(/,/g, ""), 10);

  // Retention insight: free-text lines between "Retention rate" and "Traffic source"
  const retMatch = text.match(/Retention rate\n([\s\S]*?)(?:\nTraffic source|\n*$)/);
  if (retMatch) {
    const insight = retMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !/^\d/.test(l) && l !== "(--)" && !/NaN/.test(l))
      .join(" ");
    result.retentionInsight = insight.length > 0 ? insight : null;
  }

  const fyp = text.match(/Traffic source\nFor You\n([\d.]+)%/);
  if (fyp) result.trafficSource.forYouPct = parseFloat(fyp[1]);
  const search = text.match(/Traffic source\nFor You\n[\d.]+%\n(?:Search\n([\d.]+)%)/);
  if (search) result.trafficSource.searchPct = parseFloat(search[1]);

  return result;
}

/**
 * @param {string} tabId - CDP tab showing tiktokstudio/content
 * @param {Function} evalFn - eval seam (tests)
 * @returns {Promise<Array<{videoId: string, title: string}>>}
 */
async function extractVideoList(tabId, evalFn) {
  const script = `(() => {
    const links = [...document.querySelectorAll('a[href*="/video/"]')];
    return JSON.stringify(links.slice(0, 30).map((a) => {
      const videoId = (a.getAttribute("href") || "").split("/video/")[1]?.split("?")[0] || "";
      const title = (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 120);
      return { videoId, title };
    }).filter((v) => v.videoId));
  })()`;
  const resp = await evalFn(tabId, script);
  if (resp?.error) return [];
  try {
    return JSON.parse(resp.value || "[]");
  } catch {
    return [];
  }
}

/**
 * Navigate an existing tab (keeps one tab for the whole run, like a human
 * staying in one page). Overridable via opts for tests.
 */
async function navigateTab(tabId, url) {
  await fetch(`${CDP_BASE}/navigate?target=${tabId}`, { method: "POST", body: url });
}

/**
 * Fetch the analytics detail text for one video, with the single sanctioned
 * reload on SPA crash.
 *
 * @param {string} tabId
 * @param {string} videoId
 * @param {object} [opts]
 * @param {number} [opts.renderWaitMs=15000] - silent wait before first eval
 * @param {Function} [opts.evalFn] - seam for tests
 * @param {Function} [opts.navigateFn] - seam for tests
 * @param {Function} [opts.sleepFn] - seam for tests
 * @returns {Promise<string|null>} page innerText, or null on failure
 */
export async function fetchDetailText(tabId, videoId, opts = {}) {
  const renderWaitMs = opts.renderWaitMs ?? 15000;
  const evalFn = opts.evalFn || cdpEval;
  const navigateFn = opts.navigateFn || navigateTab;
  const sleepFn = opts.sleepFn || sleep;

  await navigateFn(tabId, `${DETAIL_URL_PREFIX}${videoId}/overview`);
  await sleepFn(renderWaitMs);

  const read = async () => {
    const resp = await evalFn(tabId, `(document.getElementById("app") || document.body).innerText`);
    return resp?.error ? null : resp?.value || null;
  };

  // Patient read: the metrics block sometimes renders later than the first
  // eval (SPA variability) — poll the same page instead of reloading.
  let text = await read();
  let reloaded = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (text && text.includes("Video views")) return text;
    if (text && text.includes(CRASH_MARKER) && !reloaded) {
      // Single sanctioned reload — the SPA crash recovers on reload.
      await evalFn(tabId, "location.reload()");
      await sleepFn(renderWaitMs);
      reloaded = true;
    } else {
      await sleepFn(5000);
    }
    text = await read();
  }
  return text;
}

/**
 * Fetch per-video analytics details for all (or the N most recent) videos.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit] - max videos to fetch (default: all on page)
 * @param {string[]} [opts.videoIds] - explicit videoIds (skips list page)
 * @param {number} [opts.renderWaitMs=15000]
 * @param {Function} [opts.rand] - RNG seam for tests
 * @returns {Promise<{fetchedAt: string, videos: Array<object>, failed: Array<object>}>}
 */
export async function fetchVideoDetails(opts = {}) {
  const limit = opts.limit ?? null;
  const rand = opts.rand || Math.random;
  const renderWaitMs = opts.renderWaitMs ?? 15000;
  const evalFn = opts.evalFn || cdpEval;
  const sleepFn = opts.sleepFn || sleep;
  const newTabFn = opts.cdpNewTab || cdpNewTab;
  const closeTabFn = opts.cdpCloseTab || cdpCloseTab;

  const tabId = await newTabFn(CONTENT_LIST_URL);
  let videoList;
  try {
    // Content list page: silent render wait, then patient polling (the SPA
    // sometimes renders the post list later than 20s — verified flaky).
    // Same page, no reloads: read-only patience, not retry storms.
    await sleepFn(20000);
    videoList = [];
    for (let attempt = 0; attempt < 5 && videoList.length === 0; attempt++) {
      if (attempt > 0) await sleepFn(5000);
      videoList = await extractVideoList(tabId, evalFn);
    }
  } catch (e) {
    await closeTabFn(tabId);
    throw new Error(`Failed to list videos: ${e.message}`);
  }

  if (opts.videoIds?.length) {
    const known = new Map(videoList.map((v) => [v.videoId, v.title]));
    videoList = opts.videoIds.map((id) => ({ videoId: id, title: known.get(id) || "" }));
  }
  if (limit) videoList = videoList.slice(0, limit);

  const videos = [];
  const failed = [];
  try {
    for (let i = 0; i < videoList.length; i++) {
      const { videoId, title } = videoList[i];
      if (i > 0) await sleepFn(pacingDelayMs(rand));

      const text = await fetchDetailText(tabId, videoId, { renderWaitMs, evalFn, sleepFn });
      if (!text) {
        failed.push({ videoId, title, reason: "eval failed" });
        continue;
      }
      const details = parseVideoDetailText(text);
      if (details.videoViews === null) {
        failed.push({ videoId, title, reason: "no metrics parsed (page not ready or crash)" });
        continue;
      }
      videos.push({ videoId, title, ...details });
    }
  } finally {
    await closeTabFn(tabId);
  }

  return { fetchedAt: new Date().toISOString(), videos, failed };
}

// ─── CLI Entry ───

const isMain = process.argv[1] && process.argv[1].endsWith("tiktok-video-details.mjs");

if (isMain) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "--fetch") {
    const limitArg = args.indexOf("--limit");
    const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : null;
    const outArg = args.indexOf("--out");
    const outPath = outArg >= 0 ? args[outArg + 1] : null;

    console.log("📊 Fetch per-video TikTok analytics details (#215)\n" + "=".repeat(50));
    fetchVideoDetails({ limit })
      .then((result) => {
        for (const v of result.videos) {
          console.log(
            `  • ${v.videoId} — ${v.videoViews} views, avg ${v.avgWatchTimeSec}s, full ${v.watchedFullVideoPct}%, FYP ${v.trafficSource.forYouPct}%`,
          );
        }
        for (const f of result.failed) {
          console.log(`  ⚠️  ${f.videoId} — ${f.reason}`);
        }
        const json = JSON.stringify(result, null, 2) + "\n";
        if (outPath) {
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, json, "utf8");
          console.log(`\n📁 Output: ${outPath}`);
        } else {
          console.log(json);
        }
      })
      .catch((e) => {
        console.error(`❌ ${e.message}`);
        process.exit(1);
      });
  } else {
    console.error(
      "Usage: node scripts/short-video/lib/tiktok-video-details.mjs --fetch [--limit N] [--out path.json]",
    );
    process.exit(cmd ? 1 : 0);
  }
}
