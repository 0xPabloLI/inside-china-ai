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
 *   node scripts/short-video/selector-health.mjs --env <main-checkout>/.env.local
 *
 * Requires the CDP proxy (localhost:3456) and a running Chrome with the
 * usual login states; per-domain pacing comes from the #89 P0 rate limiter.
 * `--env` points at the main checkout's .env.local (a worktree has none of its
 * own) so keyed api sources are probed with credentials, not without.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { ALL_SOURCES, missingApiKey, resolveApiHeaders } from "./lib/source-registry.mjs";
import { classifyProbe, isFailureVerdict } from "./lib/source-url-heal.mjs";
import { loadEnv } from "./lib/load-env.mjs";
import {
  cdpNewTab,
  cdpCloseTab,
  waitForPageLoad,
  extractWithRetry,
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

/** Sources live-checkable via their primary channel: CDP (page + script)
 * or API (apiSearch endpoint + parser). */
export function selectCheckableSources(sources = ALL_SOURCES) {
  return sources.filter((s) => {
    if (s.accessMethod?.primary === "api" && s.apiSearch?.url) return true;
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

/** Live-test an apiSearch source: fetch + parser, count parsed results.
 *
 * #269 (2026-09-23): axis 3 used to be *less* credential-aware than axis 1
 * (source-url-sweep) — it never loaded .env.local and never sent
 * `api.headers`, so every keyed endpoint was reported as an authoritative
 * `http_401`/`http_400` failure. Missing keys are now decided before the
 * request and 4xx answers go through the shared probe classifier.
 *
 * Exported so the credential path can be exercised without a CDP proxy.
 */
export async function checkApiSource(source, keyword) {
  const started = Date.now();
  const cap = source.capabilities?.articles ?? {};
  const api = cap.apiSearch ?? source.apiSearch;
  const missingKey = missingApiKey(cap);
  if (missingKey) {
    return {
      source: source.name,
      ok: false,
      count: 0,
      reason: "probe-not-authoritative",
      missingKey,
      durationMs: Date.now() - started,
    };
  }
  try {
    const url = api.url(keyword);
    const resp = await fetch(url, {
      headers: resolveApiHeaders(api),
      signal: AbortSignal.timeout(15000),
    });
    const body = await resp.text();
    if (!resp.ok) {
      return {
        source: source.name,
        ok: false,
        count: 0,
        reason: apiFailureVerdict({ status: resp.status, body, cap }).reason,
        durationMs: Date.now() - started,
      };
    }
    const articles = api.parser(body);
    return {
      source: source.name,
      ok: articles.length > 0,
      count: articles.length,
      reason: articles.length === 0 ? "zero_results" : null,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      source: source.name,
      ok: false,
      count: 0,
      reason: "network-error",
      error: e.message,
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Verdict for an api probe whose response was not OK (#269, 2026-09-23).
 *
 * Two corrections, both about keeping the answer about the probe rather than
 * about the endpoint:
 *   · a required-but-absent key is decided before the request — gnews answers
 *     such a call with 400, which has no other reading than http-dead;
 *   · a 4xx that survives that check goes through `classifyProbe`, the same
 *     classifier axis 1 uses, so 403/429 from an edge or rate limiter stays
 *     "about the probe" while 404/410 remains a statement about the endpoint.
 *
 * @param {{ status: number, body?: string, cap?: object }} probe
 * @returns {{ reason: string, missingKey: string|null }}
 */
export function apiFailureVerdict({ status, body = "", cap = {} } = {}) {
  const missingKey = missingApiKey(cap);
  if (missingKey) return { reason: "probe-not-authoritative", missingKey };
  return {
    // finalUrl/homeUrl are empty on purpose: for an api probe there is no
    // landing page to compare against a site root, and keyword hits are not
    // what a 4xx is answering about.
    reason: classifyProbe({ status, finalUrl: "", homeUrl: "", html: body, keywordHits: null }),
    missingKey: null,
  };
}

/**
 * Three-way failure class for a report row — the axis-3 form of "only the
 * failure column feeds the dead-source ledger" (#269/#285):
 *
 *   "none"   — the row produced items.
 *   "source" — the verdict is about the source: `zero_results` (selector rot),
 *              `http-dead`, `network-error` — this is what the repair runbook is for.
 *   "probe"  — the verdict is about the probe: `anti_bot:*` and `need_login`
 *              depend on the browser session, and `login-wall` /
 *              `probe-not-authoritative` are the shared vocabulary's
 *              "the answer is about the probe" class. Quarantine, do not repair.
 *
 * @param {{ ok: boolean, reason?: string|null }} result
 * @returns {"none"|"source"|"probe"}
 */
export function failureClass(result) {
  if (result.ok) return "none";
  const reason = String(result.reason ?? "");
  if (reason.startsWith("anti_bot") || reason === "need_login") return "probe";
  return isFailureVerdict(reason) ? "source" : "probe";
}

/**
 * Verdict reason for a CDP source check (#269, 2026-09-23).
 *
 * Two races used to produce wrong verdicts, and both mislead whoever reads
 * the report:
 *   - extraction ran once, before SPA hydration (zhihu: 0 cards right after
 *     load, 31 cards 1.6s later) → fix at the call site: extractWithRetry;
 *   - the anti-bot interstitial mounts *after* the pre-check (douyin: no
 *     marker at load, `captcha` from ~3.5s on) → fixed here: a late detection
 *     must still win over `zero_results`, because `anti_bot` means "leave this
 *     source alone" while `zero_results` sends the reader to the
 *     "selector rotted" runbook.
 *
 * @param {{length: number}} articles - Extracted articles (empty = failed).
 * @param {string|null} lateAntiBot - Anti-bot marker found after extraction.
 * @returns {string|null} Verdict reason, or null when the source is healthy.
 */
export function verdictReason(articles, lateAntiBot) {
  if (articles.length > 0) return null;
  return lateAntiBot ? `anti_bot:${lateAntiBot}` : "zero_results";
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
      return {
        source: source.name,
        ok: false,
        count: 0,
        reason: `anti_bot:${antiBot}`,
        durationMs: Date.now() - started,
      };
    }
    const needsAuth = cap?.needsAuth ?? source.needsAuth;
    const loginCheckScript = cap?.loginCheckScript ?? source.loginCheckScript;
    if (needsAuth && loginCheckScript) {
      const { checkLogin } = await import("./lib/cdp-client.mjs");
      const status = await checkLogin(tabId, loginCheckScript);
      if (status !== "ok") {
        return {
          source: source.name,
          ok: false,
          count: 0,
          reason: status,
          durationMs: Date.now() - started,
        };
      }
    }
    // #269 (2026-09-23): single-shot extraction raced SPA hydration and
    // reported a healthy source as `zero_results` — measured on zhihu, the
    // same page yields 0 cards right after load and 31 cards 1.6s later, so
    // the verdict flipped run-to-run (0/31/0). A health check must measure the
    // selector, not the render race, so it goes through the same
    // escalation/backoff seam the production path uses (search-sources).
    // Only "empty after all retries" is now reported as zero_results.
    const articles = await extractWithRetry(tabId, script);
    // Only now does a captcha *widget* mean anything: a container on a page that
    // still rendered results is the site's own form furniture, not an
    // interstitial (techcrunch / guancha both embed one on a healthy page).
    const lateAntiBot =
      articles.length === 0 ? await detectAntiBot(tabId, { allowDomHint: true }) : null;
    return {
      source: source.name,
      ok: articles.length > 0,
      count: articles.length,
      loaded,
      reason: verdictReason(articles, lateAntiBot),
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      source: source.name,
      ok: false,
      count: 0,
      reason: `error:${e.message}`,
      durationMs: Date.now() - started,
    };
  } finally {
    if (tabId) await cdpCloseTab(tabId);
  }
}

async function main() {
  // This CLI is an entry point, so it owns the .env.local load (#287/#275).
  // Without it every keyed api source probes with an empty credential and a
  // server-side "no API key" answer was recorded as a dead endpoint — the
  // 2026-09-23 axis-3 run reported gnews 400 / currents 401 / tiktok_creator
  // 401 that way while `source-url-sweep --env …` read the same endpoints
  // 200/alive. `--env <path>` exists because a git worktree has no .env.local
  // of its own (gitignored, lives in the main checkout).
  loadEnv(getArg("env") || undefined);
  await ensureCdpProxy();
  const keyword = getArg("keyword") || "AI大模型";
  const only = getArg("only");
  let sources = selectCheckableSources();
  if (only) {
    const wanted = new Set(only.split(",").map((s) => s.trim()));
    sources = sources.filter((s) => wanted.has(s.name));
  }

  const keywords = { zh: keyword, en: getArg("en-keyword") || "artificial intelligence" };
  console.log(
    `🔍 Selector health — ${sources.length} CDP sources (zh: "${keywords.zh}" / en: "${keywords.en}")`,
  );
  console.log("─".repeat(60));

  const results = [];
  for (const source of sources) {
    const result =
      source.accessMethod?.primary === "api"
        ? await checkApiSource(
            source,
            keywords[source.locale === "zh-CN" ? "zh" : "en"] ?? keywords.zh,
          )
        : await checkSource(source, keywords);
    results.push(result);
    const cls = failureClass(result);
    const icon = cls === "none" ? "✅" : cls === "source" ? "❌" : "⚠️";
    const hint = result.missingKey ? ` (missing ${result.missingKey})` : "";
    console.log(
      `  ${icon} ${result.source}: ${result.count} results (${(result.durationMs / 1000).toFixed(1)}s)${result.reason ? ` — ${result.reason}${hint}` : ""}`,
    );
  }

  const byClass = { none: 0, source: 0, probe: 0 };
  for (const r of results) byClass[failureClass(r)] += 1;
  console.log("─".repeat(60));
  console.log(`  ${byClass.none}/${results.length} healthy`);
  if (byClass.probe > 0) {
    console.log(
      `  ⚠️  ${byClass.probe} probe-not-authoritative / session-dependent — not source death, not for the ledger`,
    );
  }
  if (byClass.source > 0) {
    console.log(
      `  ❌ ${byClass.source} real failures — repair runbook: docs/selector-auto-healing.md`,
    );
  }

  if (hasFlag("json") || byClass.source + byClass.probe > 0) {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          keyword,
          envLoaded: true,
          summary: byClass,
          results: results.map((r) => ({ ...r, failureClass: failureClass(r) })),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    if (hasFlag("json")) console.log(`  📁 Report: ${REPORT_PATH}`);
  }
  // Only a verdict about the *source* is a failed health check. A missing key
  // or a browser-session answer would otherwise make CI red for a reason the
  // reader cannot act on in the source.
  process.exit(byClass.source > 0 ? 1 : 0);
}

// Entry-point guard, matching source-url-sweep: importing this module for its
// pure helpers (verdictReason / failureClass tests) must not start a CDP run.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
