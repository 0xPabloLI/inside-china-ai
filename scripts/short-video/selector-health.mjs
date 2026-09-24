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
 *   node scripts/short-video/selector-health.mjs --fallback [--json]
 *                                                     (#337: audit the site:
 *     fallback layer itself — every source that has a googleSiteFallback is
 *     probed on googleSiteFallback.url(keyword) + its own articleScript,
 *     with sample titles and a three-way quality verdict per source)
 *
 * Requires the CDP proxy (localhost:3456) and a running Chrome with the
 * usual login states; per-domain pacing comes from the #89 P0 rate limiter.
 * `--env` points at the main checkout's .env.local (a worktree has none of its
 * own) so keyed api sources are probed with credentials, not without.
 * CDP is only touched when the selected set actually contains a CDP source
 * (api-only runs never open a browser) and it goes through Step 0.1's
 * automation-profile guard first.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  ALL_SOURCES,
  missingApiKey,
  resolveApiHeaders,
  keyReadiness,
} from "./lib/source-registry.mjs";
import {
  classifyProbe,
  EGRESS_UNREACHABLE_VERDICT,
  isFailureVerdict,
} from "./lib/source-url-heal.mjs";
import { judgeRelevance } from "./lib/source-health.mjs";
import { loadEnv } from "./lib/load-env.mjs";
import { ensureCdpProfileGuard } from "./lib/cdp-preflight.mjs";
import {
  cdpNewTab,
  cdpCloseTab,
  cdpEval,
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
 * A connect-level failure is checked the same way axis 1 checks it: before the
 * row can read `network-error` (a failure verdict), the source's own origin is
 * requested bare. No route to the origin means `probe-no-egress` — the same
 * `ECONNRESET`-while-google-is-unreachable shape measured on 2026-09-23.
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
  const url = api.url(keyword);
  try {
    const resp = await fetch(url, {
      headers: resolveApiHeaders(api),
      // Same seam as collectFromApi (search-sources.mjs): a source may opt
      // into a longer budget via api.timeoutMs (searxng_search needs it).
      signal: AbortSignal.timeout(api.timeoutMs ?? 15000),
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
      reason: (await originReachable(url)) ? "network-error" : EGRESS_UNREACHABLE_VERDICT,
      error: e.message,
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Can this process open a connection to the URL's origin at all?
 *
 * The control for a connect-level failure: bare `<origin>/`, no credentials, no
 * keyword, short budget. **Any** HTTP answer proves a route exists — a 403 is
 * still an answer, and the caller's question is whether there is a route, not
 * whether the endpoint likes us. Only a thrown fetch means "no route", and that
 * is what turns a row into `probe-no-egress` instead of `network-error`.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function originReachable(url) {
  try {
    const origin = new URL(url).origin;
    await fetch(`${origin}/`, { signal: AbortSignal.timeout(8000) });
    return true;
  } catch {
    return false;
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
 *              `http-dead`, `network-error` (the host answered nothing but was
 *              reachable) — this is what the repair runbook is for.
 *   "probe"  — the verdict is about the probe: `anti_bot:*` and `need_login`
 *              depend on the browser session, and `login-wall` /
 *              `probe-not-authoritative` / `probe-no-egress` are the shared
 *              vocabulary's "the answer is about the probe" class. Quarantine,
 *              do not repair.
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

/**
 * Production-availability takeover (2026-09-24): merge a primary-layer
 * failure with a fallback-layer probe result. The source is reported
 * production-usable when the site: fallback extracted anything — the reader's
 * question is "can we get data in the end", not "is the configured URL
 * healthy" (jiqizhixin: primary 0 while the site: layer extracted 10).
 *
 * Pure function so the takeover rule is unit-testable without a CDP run.
 * Only a real fallback extraction flips the verdict; a fallback that also
 * fails keeps the primary failure untouched (its layer/reason are the truth).
 *
 * @param {object} primary   - checkSource/checkApiSource result (ok:false, source-verdict).
 * @param {object} fallback  - checkFallbackSource result for the same source.
 * @returns {object} the result row to report.
 */
export function applyFallbackTakeover(primary, fallback) {
  if (fallback.ok && fallback.count > 0) {
    return {
      ...primary,
      ok: true,
      count: fallback.count,
      via: "site-fallback",
      reason: null,
      primaryReason: primary.reason ?? "zero_results",
      note: `primary layer failed (${primary.reason}) — site: fallback layer is serving`,
    };
  }
  return primary;
}

/**
 * Did Chrome actually render a page? A `chrome-error://chromewebdata/` landing
 * means navigation itself failed (DNS / proxy / transport) — there is no DOM
 * to extract from, and running the extraction anyway is how a network failure
 * used to surface as a misleading `zero_results` (digg_search, #337).
 */
export async function landedChromeError(tabId) {
  const r = await cdpEval(tabId, "location.href");
  const href = String(r?.result?.value ?? r?.value ?? "");
  return href.startsWith("chrome-error://") || href.startsWith("chrome://");
}

/**
 * Network-layer verdict for a URL Chrome could not load at all (#337, AC5) —
 * the same control-group criterion the HTTP probe applies to connect-level
 * failures: navigate a bare `<origin>/` with the same probe. If even that
 * never renders there is no route to this host, and the answer is about the
 * probe's network path (`probe-no-egress` — not a source verdict, not for the
 * dead-source ledger); if the origin loads while the target URL failed, the
 * transport failure belongs to the URL (`network-error`, a failure verdict).
 * Both values come from the shared vocabulary — no new verdict is invented.
 */
export async function networkLayerVerdict(url) {
  let ctrl = null;
  try {
    ctrl = await cdpNewTab(new URL(url).origin + "/");
    await new Promise((r) => setTimeout(r, 2000));
    return (await landedChromeError(ctrl)) ? "probe-no-egress" : "network-error";
  } catch {
    return "probe-no-egress";
  } finally {
    if (ctrl) await cdpCloseTab(ctrl);
  }
}

/**
 * #337 AC2: three-way quality bucket for a fallback-layer extraction. Count
 * alone misreads both known failure modes: a consent-page link-grab returns
 * hundreds of junk rows (the #269 history), and sogou_weixin returns 1 row
 * whose "title" is the bare URL. Uses the same relevance seam
 * (judgeRelevance) applyRelevanceGuard applies in production.
 *
 * @param {Array<{title?: string, url?: string}>} articles
 * @param {{invalid: boolean, hits: number, total: number}} relevance
 * @returns {"zero"|"low-quality"|"real"}
 */
export function fallbackQuality(articles, relevance) {
  const list = Array.isArray(articles) ? articles : [];
  if (list.length === 0) return "zero";
  const urlTitled = list.filter((a) => /^https?:\/\//.test(String(a?.title ?? ""))).length;
  return relevance?.invalid || urlTitled === list.length ? "low-quality" : "real";
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
    // #337 AC5: a chrome-error landing means navigation never produced a page —
    // extraction there is meaningless and used to surface as zero_results.
    // Network jitter must be re-tested before a verdict: one fresh-tab retry,
    // then the bare-origin control probe separates probe-no-egress (no route
    // to the host — not a source verdict) from network-error (this URL's own
    // transport failure).
    if (await landedChromeError(tabId)) {
      const retryTab = await cdpNewTab(url);
      await cdpCloseTab(tabId);
      tabId = retryTab;
      await new Promise((r) => setTimeout(r, 1500));
      if (await landedChromeError(tabId)) {
        return {
          source: source.name,
          ok: false,
          count: 0,
          reason: await networkLayerVerdict(url),
          durationMs: Date.now() - started,
        };
      }
    }
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

/**
 * #337 AC1: live-test one source's googleSiteFallback layer in isolation.
 *
 * Production only reaches this layer when the primary layer fails, so a dead
 * fallback layer stays invisible until the day it is needed (jiqizhixin's CDP
 * layer failed 2026-09-24 and its site: layer was the only thing left). This
 * probe asks the layer directly: navigate googleSiteFallback.url(keyword) and
 * extract with the layer's own articleScript — the same "test the registry's
 * script, not a hand-written subset" rule the primary check follows.
 *
 * The row carries samples and a quality verdict because count alone misreads:
 * the relevance seam (judgeRelevance, the one applyRelevanceGuard uses) flags
 * large all-unrelated sets (consent-page link-grabs), and fallbackQuality
 * flags bare-URL titles (sogou_weixin's 1 url-only row).
 */
export async function checkFallbackSource(source, keywords) {
  const fb = source.capabilities?.articles?.googleSiteFallback ?? source.googleSiteFallback;
  const keyword = keywords[source.locale === "zh-CN" ? "zh" : "en"] ?? keywords.zh;
  const url = typeof fb.url === "function" ? fb.url(keyword) : fb.url;
  const started = Date.now();
  let tabId = null;
  try {
    tabId = await cdpNewTab(url);
    await new Promise((r) => setTimeout(r, 1500));
    if (await landedChromeError(tabId)) {
      const retryTab = await cdpNewTab(url);
      await cdpCloseTab(tabId);
      tabId = retryTab;
      await new Promise((r) => setTimeout(r, 1500));
      if (await landedChromeError(tabId)) {
        return {
          source: source.name,
          ok: false,
          count: 0,
          reason: await networkLayerVerdict(url),
          layer: "fallback",
          durationMs: Date.now() - started,
        };
      }
    }
    const antiBot = await detectAntiBot(tabId);
    if (antiBot) {
      return {
        source: source.name,
        ok: false,
        count: 0,
        reason: `anti_bot:${antiBot}`,
        layer: "fallback",
        durationMs: Date.now() - started,
      };
    }
    const articles = await extractWithRetry(tabId, fb.articleScript);
    const lateAntiBot =
      articles.length === 0 ? await detectAntiBot(tabId, { allowDomHint: true }) : null;
    const relevance = judgeRelevance(keyword, articles);
    return {
      source: source.name,
      ok: articles.length > 0,
      count: articles.length,
      reason: verdictReason(articles, lateAntiBot),
      layer: "fallback",
      quality: fallbackQuality(articles, relevance),
      relevance: { hits: relevance.hits, total: relevance.total },
      samples: articles.slice(0, 3).map((a) => String(a.title ?? "").slice(0, 80)),
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      source: source.name,
      ok: false,
      count: 0,
      reason: `error:${e.message}`,
      layer: "fallback",
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
  const keyword = getArg("keyword") || "AI大模型";
  const only = getArg("only");
  // #337: --fallback audits the site: fallback layer itself — only sources
  // that actually have a googleSiteFallback (auto or explicit) are checkable.
  const fallbackMode = hasFlag("fallback");
  let sources = fallbackMode
    ? ALL_SOURCES.filter((s) => {
        const fb = s.capabilities?.articles?.googleSiteFallback ?? s.googleSiteFallback;
        return Boolean(fb?.url && fb.articleScript);
      })
    : selectCheckableSources();
  if (only) {
    const wanted = new Set(only.split(",").map((s) => s.trim()));
    sources = sources.filter((s) => wanted.has(s.name));
  }

  // ── 凭据前置检查（修复方法的一步，且必须在任何探针之前）──────────────
  // keyed 源缺凭据时，服务端回来的是「没有 key」而不是「端点错了」，两者在状态码
  // 上无法区分——这就是 2026-09-23 之前 gnews/currents 被记成 http_400/http_401
  // 死源的原因。先声明「谁需要什么、在不在」，后面每一条红才读得懂。
  const keyReport = keyReadiness();
  if (hasFlag("keys")) {
    console.log("🔑 Credential readiness — registry-declared keys only");
    console.log("─".repeat(72));
    for (const e of keyReport.entries) {
      console.log(
        `  ${e.present ? "✅" : "❌"} ${e.source.padEnd(20)} ${e.channel.padEnd(9)} ${e.env}`,
      );
    }
    console.log("─".repeat(72));
    console.log(
      `  ${keyReport.present}/${keyReport.required} present` +
        (keyReport.ready ? "" : ` — MISSING: ${keyReport.missing.join(", ")}`),
    );
    return;
  }
  const keyedInPlay = keyReport.entries.filter((e) => sources.some((s) => s.name === e.source));
  const keyedMissing = keyedInPlay.filter((e) => !e.present);

  // CDP 只在**真要测 CDP 源**时才碰。
  //
  // 这里原来是无条件 `ensureCdpProxy()`：于是一次纯 api 运行（`--only gnews,currents`）
  // 也会去连一个浏览器，而代理选哪个 Chrome 不由调用方决定（按 DevToolsActivePort
  // 探测，日常 Chrome 常常先被找到）。2026-09-23 实测误连到 9222（用户日常 Chrome）。
  // 同一个洞还有第二个：`ensureCdpProxy()` 不含 Step 0.1 的 profile 守卫——那是
  // `cdp-preflight.mjs` 里 main.mjs 的私有步骤，旁路入口全都跳过了。两个一起补。
  const cdpSources = sources.filter((s) => s.accessMethod?.primary !== "api");
  if (cdpSources.length > 0) {
    await ensureCdpProfileGuard();
    await ensureCdpProxy();
  }

  const keywords = { zh: keyword, en: getArg("en-keyword") || "artificial intelligence" };
  console.log(
    `🔍 Selector health — ${sources.length} ${fallbackMode ? "fallback-layer (site:)" : "CDP"} sources (zh: "${keywords.zh}" / en: "${keywords.en}")`,
  );
  if (keyedInPlay.length > 0) {
    console.log(
      `  🔑 credentials: ${keyedInPlay.length - keyedMissing.length}/${keyedInPlay.length} present` +
        (keyedMissing.length > 0
          ? ` — missing ${[...new Set(keyedMissing.map((e) => e.env))].join(", ")} (those will read as probe-not-authoritative, not as dead sources)`
          : ""),
    );
  }
  console.log("─".repeat(60));

  const results = [];
  for (const source of sources) {
    let result = fallbackMode
      ? await checkFallbackSource(source, keywords)
      : source.accessMethod?.primary === "api"
        ? await checkApiSource(
            source,
            keywords[source.locale === "zh-CN" ? "zh" : "en"] ?? keywords.zh,
          )
        : await checkSource(source, keywords);
    // Production-availability takeover: when the primary layer fails with a
    // source-verdict (zero_results) and the registry carries a site: fallback
    // layer, probe the fallback right away. If it extracts, the source is
    // production-usable (ok: true, via: "site-fallback") instead of reading
    // as dead — jiqizhixin 2026-09-24: primary 0 for weeks while its site:
    // layer extracted 10. Only "source" verdicts take over; probe-class
    // failures (probe-not-authoritative / probe-no-egress / anti_bot) mean
    // "we cannot measure" and must not be flipped by the fallback layer.
    if (
      !fallbackMode &&
      failureClass(result) === "source" &&
      (source.capabilities?.articles?.googleSiteFallback ?? source.googleSiteFallback)
    ) {
      console.log(`      ↳ primary failed — probing site: fallback layer...`);
      const fb = await checkFallbackSource(source, keywords);
      result = applyFallbackTakeover(result, fb);
    }
    results.push(result);
    const cls = failureClass(result);
    const icon = cls === "none" ? "✅" : cls === "source" ? "❌" : "⚠️";
    const hint = result.missingKey ? ` (missing ${result.missingKey})` : "";
    console.log(
      `  ${icon} ${result.source}: ${result.count} results (${(result.durationMs / 1000).toFixed(1)}s)${result.reason ? ` — ${result.reason}${hint}` : ""}`,
    );
    // #337 AC2/AC4: count alone misreads junk — print the quality verdict and
    // sample titles so a "healthy count" cannot hide a link-grab or bare URLs.
    if (fallbackMode && result.quality) {
      console.log(
        `      ↳ ${result.quality} (relevance ${result.relevance.hits}/${result.relevance.total})`,
      );
      for (const s of result.samples) console.log(`        · ${s}`);
    }
  }

  const byClass = { none: 0, source: 0, probe: 0 };
  for (const r of results) byClass[failureClass(r)] += 1;
  const viaFallback = results.filter((r) => r.via === "site-fallback");
  console.log("─".repeat(60));
  console.log(
    `  ${byClass.none}/${results.length} healthy` +
      (viaFallback.length > 0
        ? ` (incl. ${viaFallback.length} production-usable via site-fallback: ${viaFallback.map((r) => r.source).join(", ")})`
        : ""),
  );
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
          layer: fallbackMode ? "fallback" : "primary",
          credentials: {
            required: keyReport.required,
            present: keyReport.present,
            missing: keyReport.missing,
            entries: keyReport.entries,
          },
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
