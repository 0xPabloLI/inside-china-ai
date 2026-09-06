#!/usr/bin/env node

/**
 * Selector health check (#140 P5) — live-test every CDP source's
 * articleScript against its real page.
 *
 * A search engine changing its DOM used to surface as a silent zero-result
 * source (see #200 source-health for the aggregate view); this script makes
 * the per-selector state explicit and is the entry point of the auto-healing
 * loop: sources reported here with 0 results go to the repair runbook
 * (docs/selector-auto-healing.md) before anyone rewrites selectors blind.
 *
 * Usage:
 *   node scripts/short-video/selector-health.mjs [--keyword <kw>] [--json]
 *   node scripts/short-video/selector-health.mjs --only baidu_news,qbitai
 *
 * Requires the CDP proxy (localhost:3456) and a running Chrome with the
 * usual login states; per-domain pacing comes from the #89 P0 rate limiter.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { ALL_SOURCES } from "./lib/source-registry.mjs";
import {
  cdpNewTab,
  cdpCloseTab,
  waitForPageLoad,
  extractFromTab,
  detectAntiBot,
  ensureCdpProxy,
} from "./lib/cdp-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, "output", "selector-health.json");

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

/** CDP sources that can be live-checked: have a page URL + articleScript. */
export function selectCheckableSources(sources = ALL_SOURCES) {
  return sources.filter((s) => {
    if (s.accessMethod?.primary !== "cdp") return false;
    const script = s.capabilities?.articles?.articleScript ?? s.articleScript;
    return Boolean(script && s.url);
  });
}

/** Locale-matched keyword — a Chinese keyword on an English engine reads as
 * "zero results" without being a selector failure. */
export function keywordForSource(source, zhKeyword, enKeyword) {
  return (source.locale ?? "en") === "zh-CN" ? zhKeyword : enKeyword;
}

async function checkSource(source, keywords) {
  const cap = source.capabilities?.articles;
  const keyword = keywords[source.locale === "zh-CN" ? "zh" : "en"] ?? keywords.zh;
  const url = typeof source.url === "function" ? source.url(keyword) : source.url;
  const script = cap?.articleScript ?? source.articleScript;
  const started = Date.now();
  let tabId = null;
  try {
    tabId = await cdpNewTab(url);
    await new Promise((r) => setTimeout(r, 1500));
    const loaded = await waitForPageLoad(tabId);
    const antiBot = await detectAntiBot(tabId);
    if (antiBot) {
      return { source: source.name, ok: false, count: 0, reason: `anti_bot:${antiBot}`, durationMs: Date.now() - started };
    }
    const needsAuth = cap?.needsAuth ?? source.needsAuth;
    const loginCheckScript = cap?.loginCheckScript ?? source.loginCheckScript;
    if (needsAuth && loginCheckScript) {
      const { checkLogin } = await import("./lib/cdp-client.mjs");
      const status = await checkLogin(tabId, loginCheckScript);
      if (status !== "ok") {
        return { source: source.name, ok: false, count: 0, reason: status, durationMs: Date.now() - started };
      }
    }
    const articles = await extractFromTab(tabId, script);
    return {
      source: source.name,
      ok: articles.length > 0,
      count: articles.length,
      loaded,
      reason: articles.length === 0 ? "zero_results" : null,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return { source: source.name, ok: false, count: 0, reason: `error:${e.message}`, durationMs: Date.now() - started };
  } finally {
    if (tabId) await cdpCloseTab(tabId);
  }
}

async function main() {
  await ensureCdpProxy();
  const keyword = getArg("keyword") || "AI大模型";
  const only = getArg("only");
  let sources = selectCheckableSources();
  if (only) {
    const wanted = new Set(only.split(",").map((s) => s.trim()));
    sources = sources.filter((s) => wanted.has(s.name));
  }

  const keywords = { zh: keyword, en: getArg("en-keyword") || "artificial intelligence" };
  console.log(`🔍 Selector health — ${sources.length} CDP sources (zh: "${keywords.zh}" / en: "${keywords.en}")`);
  console.log("─".repeat(60));

  const results = [];
  for (const source of sources) {
    const result = await checkSource(source, keywords);
    results.push(result);
    const icon = result.ok ? "✅" : "❌";
    console.log(
      `  ${icon} ${result.source}: ${result.count} results (${(result.durationMs / 1000).toFixed(1)}s)${result.reason ? ` — ${result.reason}` : ""}`,
    );
  }

  const broken = results.filter((r) => !r.ok);
  console.log("─".repeat(60));
  console.log(
    `  ${results.length - broken.length}/${results.length} healthy` +
      (broken.length > 0 ? ` — repair runbook: docs/selector-auto-healing.md` : ""),
  );

  if (hasFlag("json") || broken.length > 0) {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(
      REPORT_PATH,
      JSON.stringify({ checkedAt: new Date().toISOString(), keyword, results }, null, 2) + "\n",
      "utf8",
    );
    if (hasFlag("json")) console.log(`  📁 Report: ${REPORT_PATH}`);
  }
  process.exit(broken.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
