/**
 * Competitor benchmark capture (#300 stage 2)
 *
 * Discovers each bench account's top videos (by plays) from its logged-in
 * profile page, then downloads each one to a structured directory. This is the
 * discovery+download half of the benchmark pipeline; per-video scene analysis
 * (WhisperX + VLM, schema v1) consumes the manifest afterwards.
 *
 * Two code gates run before anything is fetched, because both failure modes are
 * silent (a wrong profile or a blocked exit makes every later verdict a
 * projection of the wrong environment — 2026-09-22 and 2026-10-16 incidents):
 *   1. The CDP port must carry the automation profile (cdp-profile-guard.mjs).
 *   2. The browser exit must not be HK: tiktok.com serves an "unavailable in
 *      your region" page from there, with no error to distinguish it.
 *
 * Minimal-interaction discipline for the profile-page leg (risk control):
 * read-only, one account per pass, a page that fails is recorded and skipped,
 * silent render waits and jittered pacing between accounts.
 *
 * Verified 2026-10-16: `@marcus.dipaola` (19 items) and `@rileybrown.ai` —
 * `[data-e2e="user-post-item"]` + `[data-e2e="video-views"]`; downloads via
 * `downloadVideo()` (yt-dlp route) land 1080x1920 HEVC+AAC mp4.
 *
 * @module capture-competitor-videos
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { cdpNewTab, cdpEval, cdpCloseTab } from "./lib/cdp-client.mjs";
import { checkAutomationProfile, formatVerdict } from "./lib/cdp-profile-guard.mjs";
import { downloadVideo } from "./lib/video-downloaders.mjs";

/**
 * English-side bench accounts (#300 §2.1). Chinese-side TikTok samples are too
 * thin to compare against (max ~32.5K vs 100K-4M), so the ticket scopes the
 * cross-language contrast to the English side.
 */
const BENCH_ACCOUNTS = [
  { handle: "marcus.dipaola", followers: "4.1M" },
  { handle: "rileybrown.ai", followers: "636.7K" },
  { handle: "natebjones", followers: "488K" },
  { handle: "kanekallaway", followers: "425.1K" },
  { handle: "maverickgpt", followers: "409.6K" },
  { handle: "sineadbovell", followers: "313.1K" },
  { handle: "shedoesai", followers: "227K" },
  { handle: "thechriswinfield", followers: "120.7K" },
  { handle: "allsiekmiller", followers: "112.3K" },
];

const DEFAULT_TOP_N = 5;
const LIST_SCROLL_ROUNDS = 3;
const PROFILE_RENDER_WAIT_MS = 9000;
const SCROLL_SETTLE_MS = 1600;

/**
 * A handle becomes a directory name under outDir, so it must not carry path
 * separators or traversal segments. Only the charset TikTok allows in handles
 * survives; anything else is dropped.
 *
 * @param {string} handle
 * @returns {string} the handle reduced to `[A-Za-z0-9._-]`
 */
export function sanitizeHandle(handle) {
  return String(handle ?? "").replace(/[^A-Za-z0-9._-]/g, "");
}

/** Unwrap a CDP eval response. The proxy answers `{result:{value}}`; older
 *  callers/tests hand back the bare value, so both shapes are accepted. */
function cdpValue(raw, fallback) {
  if (typeof raw === "string") return raw;
  return raw?.result?.value ?? raw?.value ?? fallback;
}

/**
 * TikTok renders play counts with K/M suffixes ("177.5K", "2.1M") and plain
 * integers below 1,000. Sorting by plays needs the number, not the label.
 *
 * @param {string} label
 * @returns {number}
 */
export function parsePlayCount(label) {
  if (typeof label !== "string") return 0;
  const m = label
    .trim()
    .replace(/,/g, "")
    .match(/^(\d+(?:\.\d+)?)\s*([KMB])?/i);
  if (!m) return 0;
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1;
  return Math.round(Number.parseFloat(m[1]) * scale);
}

/**
 * The profile grid hands back hrefs that are already absolute
 * (`https://www.tiktok.com/@user/video/<id>`). Building the URL as
 * `origin + href` therefore produced `https://www.tiktok.comhttps://…` — a host
 * no adapter recognises, so the batch saved 0 of the 36 listed videos on
 * 2026-10-17 with `unsupported-by-downloader:www.tiktok.comhttps`. Normalise
 * instead of blindly prefixing: absolute hrefs pass through, relative ones get
 * the origin.
 *
 * @param {string} href
 * @returns {string}
 */
export function normalizeTikTokVideoUrl(href) {
  if (typeof href !== "string") return "";
  const path = href.split("?")[0].trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `https://www.tiktok.com${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * The in-page extractor: one pass over the rendered grid, no interaction.
 * Kept as a script string (not a function) because it runs inside the page.
 * It returns the raw `href`; normalisation happens on the Node side so the
 * rewriting lives in one testable place.
 */
const EXTRACT_LIST_SCRIPT = `
(() => {
  const items = [...document.querySelectorAll('[data-e2e="user-post-item"]')];
  const out = items.map((it) => {
    const a = it.querySelector('a[href*="/video/"]');
    const href = a ? a.getAttribute('href') || '' : '';
    const id = href ? (href.split('/video/')[1] || '').split('?')[0] : '';
    return {
      id,
      views: it.querySelector('[data-e2e="video-views"]')?.textContent?.trim() || '',
      href,
    };
  }).filter((x) => x.id && x.href);
  const body = document.body ? document.body.innerText : '';
  return JSON.stringify({
    count: items.length,
    regionBlocked: /unavailable in your region|已停止在/.test(body) || location.pathname.startsWith('/hk'),
    items: out,
  });
})()
`;

const SCROLL_SCRIPT = `
(() => { window.scrollBy(0, window.innerHeight * 3); return 'scrolled'; })()
`;

const EXIT_TRACE_SCRIPT = `
(async () => {
  const r = await fetch('https://cloudflare.com/cdn-cgi/trace');
  return await r.text();
})()
`;

/**
 * Read the browser exit location from Cloudflare's trace endpoint.
 * @returns {Promise<string>} two-letter country code, or "unknown"
 */
async function browserExitLocation() {
  const tabId = await cdpNewTab("https://cloudflare.com/cdn-cgi/trace");
  try {
    await new Promise((r) => setTimeout(r, 3000));
    const raw = await cdpEval(tabId, EXIT_TRACE_SCRIPT);
    const text = cdpValue(raw, "");
    const m = String(text).match(/^loc=(\w+)/m);
    return m ? m[1] : "unknown";
  } finally {
    await cdpCloseTab(tabId);
  }
}

/**
 * List one account's videos, newest grid first (scrolls a few rounds).
 *
 * @param {string} handle
 * @returns {Promise<{items: Array<{id: string, views: string, url: string}>, regionBlocked: boolean}>}
 */
async function listAccountVideos(handle) {
  const tabId = await cdpNewTab(`https://www.tiktok.com/@${handle}`);
  try {
    await new Promise((r) => setTimeout(r, PROFILE_RENDER_WAIT_MS));
    let last = { items: [], regionBlocked: false };
    for (let round = 0; round < LIST_SCROLL_ROUNDS; round++) {
      const raw = await cdpEval(tabId, EXTRACT_LIST_SCRIPT);
      const text = cdpValue(raw, "{}");
      try {
        const parsed = JSON.parse(text);
        const items = (parsed.items || [])
          .map((it) => ({ ...it, url: normalizeTikTokVideoUrl(it.href) }))
          .filter((it) => it.url);
        const snapshot = { items, regionBlocked: Boolean(parsed.regionBlocked) };
        if (snapshot.items.length >= last.items.length) last = snapshot;
      } catch {
        /* transient render state — keep the previous snapshot */
      }
      await cdpEval(tabId, SCROLL_SCRIPT);
      await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));
    }
    return last;
  } finally {
    await cdpCloseTab(tabId);
  }
}

/**
 * Capture the bench accounts: list top plays → download → manifest.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.accounts] - handles (without @); defaults to BENCH_ACCOUNTS
 * @param {number} [opts.topN]
 * @param {string} [opts.outDir]
 * @returns {Promise<object>} manifest
 */
export async function captureCompetitorVideos({
  accounts = BENCH_ACCOUNTS.map((a) => a.handle),
  topN = DEFAULT_TOP_N,
  outDir = join(process.cwd(), "scripts/short-video/output/competitor-benchmarks"),
} = {}) {
  // Gate 1: the CDP port must carry the logged-in automation profile.
  const profile = await checkAutomationProfile();
  if (profile.status !== "ok") {
    throw new Error(`CDP profile gate failed\n${formatVerdict(profile)}`);
  }

  // Gate 2: the browser exit must not be HK — TikTok serves a region page there
  // and reports no error, so a HK run would look like "these accounts have no
  // videos".
  const loc = await browserExitLocation();
  if (loc === "HK") {
    throw new Error(
      `exit gate failed: browser exits via HK (TikTok is unavailable there). ` +
        `Point the system proxy at a non-HK node and re-run.`,
    );
  }

  const followersByHandle = new Map(BENCH_ACCOUNTS.map((a) => [a.handle, a.followers]));
  const manifest = { capturedAt: new Date().toISOString(), exit: loc, accounts: [] };

  for (const rawHandle of accounts) {
    const handle = sanitizeHandle(rawHandle);
    if (!handle) continue;
    const dir = join(outDir, handle);
    mkdirSync(dir, { recursive: true });
    const entry = {
      handle,
      followers: followersByHandle.get(handle) ?? null,
      videos: [],
      error: null,
    };

    try {
      const { items, regionBlocked } = await listAccountVideos(handle);
      if (regionBlocked) {
        throw new Error("region-blocked page (check exit node)");
      }
      const ranked = items
        .map((it) => ({ ...it, plays: parsePlayCount(it.views) }))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, topN);

      for (const video of ranked) {
        const dest = join(dir, `${video.id}.mp4`);
        // downloadVideo returns the bytes (the ytdlp adapter owns its temp
        // file), so the structured path is written here.
        const result = await downloadVideo(video.url);
        let savedFile = null;
        if (result.buffer) {
          writeFileSync(dest, result.buffer);
          savedFile = dest;
        }
        entry.videos.push({
          id: video.id,
          url: video.url,
          views: video.views,
          plays: video.plays,
          file: savedFile,
          status: result.status,
          reason: result.reason ?? null,
          byteLength: result.byteLength,
        });
        // Human-like pacing between downloads (minimal-interaction discipline).
        await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 4000)));
      }
    } catch (err) {
      entry.error = err.message;
    }

    manifest.accounts.push(entry);
    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    // Jittered pacing between accounts.
    await new Promise((r) => setTimeout(r, 4000 + Math.floor(Math.random() * 4000)));
  }

  return manifest;
}

// ─── CLI ───

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const topN = Number.parseInt(argValue("--top", String(DEFAULT_TOP_N)), 10);
  const accountsArg = argValue("--accounts");
  const accounts = accountsArg
    ? accountsArg.split(",").map((h) => h.trim().replace(/^@/, ""))
    : undefined;
  const outDir = resolve(argValue("--out", "scripts/short-video/output/competitor-benchmarks"));

  captureCompetitorVideos({ accounts, topN, outDir })
    .then((manifest) => {
      console.log(`exit: ${manifest.exit} · out: ${outDir}`);
      for (const a of manifest.accounts) {
        console.log(
          a.error
            ? `  @${a.handle}: ERROR ${a.error}`
            : `  @${a.handle}: ${a.videos.filter((v) => v.file).length}/${a.videos.length} downloaded`,
        );
      }
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
