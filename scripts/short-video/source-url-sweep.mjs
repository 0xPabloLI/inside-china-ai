#!/usr/bin/env node

/**
 * Source URL sweep (#269 Phase 2) — batch diagnosis of CDP sources whose
 * *search URL pattern* may be dead, plus automated discovery of a replacement
 * pattern so a sweep of dozens of sources does not need one CDP navigation
 * per site.
 *
 * See lib/source-url-heal.mjs for the discovery rules and
 * docs/selector-auto-healing.md for the methodology this implements.
 *
 * Usage:
 *   node scripts/short-video/source-url-sweep.mjs [--only a,b] [--limit N]
 *   node scripts/short-video/source-url-sweep.mjs --json
 *
 * Writes scripts/short-video/output/source-url-sweep-<date>.json.
 * Read-only against sources: GET only, no login, no writes.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { loadEnv } from "./lib/load-env.mjs";
import { ALL_SOURCES } from "./lib/source-registry.mjs";
import {
  classifyProbe,
  countKeywordHits,
  decodeHtml,
  deriveCandidates,
  extractRssLinks,
  inspectFeed,
  looksLikeResults,
} from "./lib/source-url-heal.mjs";

/** API keys ride in the URL for several sources (gnews `apikey=`). The probe
 * needs the real value; the report must never carry it. */
function redactSecrets(url) {
  try {
    const u = new URL(url);
    for (const key of ["apikey", "api_key", "key", "token", "access_token"]) {
      if (u.searchParams.has(key)) u.searchParams.set(key, "***");
    }
    return u.toString();
  } catch {
    return url;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15000;
const MAX_CANDIDATES = 6;
const MAX_FEEDS = 4;

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

/** Every source with a probeable URL. Two rules learned the hard way:
 *  · `api` sources are included — an `api` source fails at its endpoint, and
 *    probing its legacy CDP `url` instead reports healthy sources as dead
 *    (gnews 404 / openalex 403 were both artifacts of probing the wrong URL).
 *  · `supportsKeyword: false` sources are included — a listing or feed URL can
 *    die exactly like a search pattern (techcrunch/guancha/qbitai all live in
 *    the source-health zero-streak list while carrying no keyword).
 * `channel` and `keywordDriven` are recorded per row so the classes stay
 * separable in the report. */
export function selectSweepTargets(sources = ALL_SOURCES) {
  return sources.filter((s) => typeof s.url === "function");
}

/** Empty keyword for sources whose URL carries no query term. */
export function keywordForSource(source, zhKeyword, enKeyword) {
  if (source.supportsKeyword === false) return "";
  return (source.locale ?? "en") === "zh-CN" ? zhKeyword : enKeyword;
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    const { text, charset } = decodeHtml(buf, res.headers.get("content-type") || "");
    return {
      status: res.status,
      finalUrl: res.url || url,
      bytes: buf.length,
      charset,
      text,
      ms: Date.now() - started,
    };
  } catch (err) {
    // Surface the cause code: ENOTFOUND here almost always means Node's fetch
    // ignored HTTP(S)_PROXY (see the hint at the end of main()).
    const code = err?.cause?.code || err?.code || err?.name || "error";
    return { status: null, error: String(code), finalUrl: url, bytes: 0, text: "", ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sweepSource(source, { zhKeyword, enKeyword }) {
  const keyword = keywordForSource(source, zhKeyword, enKeyword);
  // An `api` source fails at its API endpoint, not at its legacy CDP `url` —
  // probing the wrong one reports a dead source that is actually healthy
  // (openalex/gnews both looked "404/403" until apiSearch.url was probed).
  const useApi = source.accessMethod?.primary === "api" && typeof source.apiSearch?.url === "function";
  const probedUrl = useApi ? source.apiSearch.url(keyword) : source.url(keyword);
  const searchUrl = redactSecrets(probedUrl);
  const homeUrl = safeOrigin(probedUrl) ? new URL(probedUrl).origin + "/" : probedUrl;

  // One retry: the local proxy drops connections intermittently, and a
  // dropped probe would otherwise be recorded as a dead source.
  let primary = await probe(probedUrl);
  if (primary.status === null) {
    await sleep(600);
    primary = await probe(probedUrl);
  }
  const hits = countKeywordHits(primary.text, keyword);
  const verdict = classifyProbe({
    status: primary.status,
    finalUrl: primary.finalUrl,
    homeUrl,
    // null = no keyword in play (listing/feed source) → relevance gate N/A.
    keywordHits: keyword ? hits : null,
    requestedUrl: probedUrl,
  });

  const row = {
    name: source.name,
    label: source.label ?? source.name,
    locale: source.locale ?? "en",
    channel: source.accessMethod?.primary ?? "cdp",
    hasApiSearch: Boolean(source.apiSearch),
    keywordDriven: Boolean(keyword),
    needsAuth: Boolean(source.needsAuth),
    keyword,
    probedKind: useApi ? "apiSearch" : "url",
    searchUrl,
    homeUrl,
    primary: {
      status: primary.status,
      finalUrl: primary.finalUrl,
      bytes: primary.bytes,
      charset: primary.charset,
      keywordHits: hits,
      ms: primary.ms,
      error: primary.error ?? null,
    },
    verdict,
    candidates: [],
    feeds: [],
  };

  if (verdict === "alive") return row;

  // Discovery ladder — homepage HTML first (form/link/template), then feeds.
  await sleep(150);
  const home = await probe(homeUrl);
  row.home = {
    status: home.status,
    bytes: home.bytes,
    charset: home.charset,
    error: home.error ?? null,
  };
  if (home.status && home.status < 400 && home.text) {
    // Candidate discovery needs a keyword to substitute; listing sources keep
    // only the feed half of the ladder.
    const candidates = keyword ? deriveCandidates(home.text, homeUrl, keyword) : [];
    for (const cand of candidates.slice(0, MAX_CANDIDATES)) {
      await sleep(150);
      const p = await probe(cand.url);
      const h = countKeywordHits(p.text, keyword);
      // 200 + keyword is not enough — see looksLikeResults(): error templates
      // echo the query, and harvesting a non-results page is exactly the
      // #269 Phase 1 failure mode.
      const verdict =
        classifyProbe({ status: p.status, finalUrl: p.finalUrl, homeUrl, keywordHits: h }) === "alive" &&
        looksLikeResults(p.text)
          ? "alive"
          : p.status === 200
            ? "alive-no-results"
            : classifyProbe({ status: p.status, finalUrl: p.finalUrl, homeUrl, keywordHits: h });
      row.candidates.push({
        ...cand,
        status: p.status,
        finalUrl: p.finalUrl,
        keywordHits: h,
        bytes: p.bytes,
        verdict,
      });
      if (verdict === "alive") break; // first confirmed replacement wins
    }
    const feeds = extractRssLinks(home.text, homeUrl);
    for (const feed of feeds.slice(0, MAX_FEEDS)) {
      await sleep(150);
      const p = await probe(feed.url);
      if (p.status !== 200) {
        row.feeds.push({ ...feed, status: p.status });
        continue;
      }
      row.feeds.push({ ...feed, status: p.status, bytes: p.bytes, ...inspectFeed(p.text) });
    }
  }

  row.repairable = row.candidates.some((c) => c.verdict === "alive") ? "url-candidate"
    : row.feeds.some((f) => f.itemCount > 0) ? "feed-candidate"
    : "none";
  return row;
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function main() {
  // This CLI is an entry point, so it owns the .env.local load (lib/** never
  // self-loads — #287/#275). Without it, every keyed api source probes with an
  // empty `apikey=`, and a server-side "you did not provide an API key" reads
  // as a dead source: the 2026-09-21 sweep reported gnews 400 and currents 401
  // that way, both of which read 200/alive once the keys were loaded.
  //
  // `--env <path>` exists because a git worktree has no .env.local of its own
  // (the file is gitignored and lives in the main checkout) — point it at the
  // main checkout's copy instead of copying secrets around.
  loadEnv(getArg("env") || undefined);
  const envKeys = [
    "GNEWS_API_KEY",
    "CURRENTS_API_KEY",
    "SCRAPECREATORS_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "SERPER_API_KEY",
    "TAVILY_API_KEY",
  ];
  const keyPresence = Object.fromEntries(envKeys.map((k) => [k, Boolean(process.env[k])]));

  const only = getArg("only");
  const limit = Number(getArg("limit") || 0);
  const zhKeyword = getArg("keyword-zh") || "人工智能";
  const enKeyword = getArg("keyword-en") || "AI";
  let targets = selectSweepTargets();
  if (only) {
    const names = only.split(",").map((s) => s.trim()).filter(Boolean);
    targets = targets.filter((s) => names.includes(s.name));
  }
  if (limit > 0) targets = targets.slice(0, limit);

  const rows = [];
  for (const source of targets) {
    const row = await sweepSource(source, { zhKeyword, enKeyword });
    rows.push(row);
    process.stderr.write(
      `· ${row.name.padEnd(22)} ${String(row.primary.status ?? "err").padEnd(4)} ${row.verdict.padEnd(22)} ${row.repairable ?? "-"}\n`,
    );
  }

  if (rows.some((r) => r.primary.error === "ENOTFOUND")) {
    process.stderr.write(
      "\n⚠️  ENOTFOUND: Node's fetch ignores HTTP_PROXY/HTTPS_PROXY unless the env-proxy\n" +
        "    agent is enabled. Re-run with `NODE_USE_ENV_PROXY=1 node scripts/short-video/source-url-sweep.mjs`\n" +
        "    (Node ≥ 22.15) — otherwise every proxied host reads as network-error.\n",
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    keyword: { zh: zhKeyword, en: enKeyword },
    envLoaded: true,
    keyPresence,
    targetCount: targets.length,
    rows,
  };
  const outDir = join(__dirname, "output");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `source-url-sweep-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (hasFlag("json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n# source-url-sweep — ${report.generatedAt}`);
    console.log(`targets=${report.targetCount}  keyword(zh)=${zhKeyword} keyword(en)=${enKeyword}`);
    console.log(`report: ${outPath}\n`);
    console.log("| source | status | verdict | keywordHits | repairable | evidence |");
    console.log("| --- | --- | --- | --- | --- | --- |");
    for (const r of rows) {
      const ev =
        r.candidates.find((c) => c.verdict === "alive")?.url ||
        r.feeds.find((f) => f.itemCount > 0)?.url ||
        (r.candidates[0] ? `${r.candidates.length} candidates probed, none alive` : "") ||
        (r.verdict === "alive" ? "-" : "no discovery (home unreachable)");
      console.log(
        `| ${r.name} | ${r.primary.status ?? "err"} | ${r.verdict} | ${r.primary.keywordHits} | ${r.repairable ?? "-"} | ${truncate(ev, 90)} |`,
      );
    }
  }
}

function truncate(s, n) {
  const str = String(s ?? "");
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
