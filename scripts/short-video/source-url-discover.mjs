#!/usr/bin/env node

/**
 * Source URL CDP discovery (#269 Phase 2, methodology step 5).
 *
 * `source-url-sweep.mjs` answers "does the configured URL still work?" with a
 * plain HTTP GET. That question has three failure modes the GET cannot resolve,
 * all observed on 2026-09-22:
 *
 *   · a 403/401 that is really an edge/WAF answer about the *probe* (xinhua's
 *     `so.news.cn/getNews`: 403 to Node, 200 + JSON inside a browser);
 *   · a login gate reported as a 302/404 (ithome's real search URL is
 *     `/search/{kw}.html`, and it redirects anonymous visitors to
 *     `/user-login/index.htm?tip=登录以查看搜索结果`);
 *   · a search URL that was never right in the first place, because the site
 *     renders its search box in JS and the template table is only a guess list
 *     (ithome's registry had `/search?word=` → 404).
 *
 * This tool re-asks the question from inside a real browser, and — when the
 * configured URL is genuinely wrong — reads the truth off the site's own search
 * UI: put the term in the box, submit it, and take the URL from the address bar.
 *
 * Usage:
 *   node scripts/short-video/source-url-discover.mjs --from output/sweep.json
 *   node scripts/short-video/source-url-discover.mjs --only xinhua,ithome
 *   node scripts/short-video/source-url-discover.mjs --only xinhua --json
 *   node scripts/short-video/source-url-discover.mjs --only xinhua --out output/keep.json
 *   node scripts/short-video/source-url-discover.mjs --only xinhua --env <main-checkout>/.env.local
 *
 * Requires a Chrome reachable through the repo's CDP proxy (see
 * docs/selector-auto-healing.md — the proxy is ours to restart; Chrome is the
 * user's and is never killed by an agent).
 *
 * Read-only against sources: navigation only, no login, no writes.
 */

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { loadEnv } from "./lib/load-env.mjs";
import { ALL_SOURCES } from "./lib/source-registry.mjs";
import {
  buildFindSearchBoxScript,
  buildSnapshotScript,
  buildSubmitSearchScript,
  classifyProbe,
  countKeywordHits,
  HEALTHY_VERDICTS,
  homeCandidates,
  loginRedirectTarget,
  needsCdpSecondOpinion,
  PROBE_UNAUTHORITATIVE_VERDICTS,
  templateFromLandedUrl,
} from "./lib/source-url-heal.mjs";
import { cdpCloseTab, cdpEval, cdpNewTab, waitForPageLoad } from "./lib/cdp-client.mjs";
import { keywordForSource, selectSweepTargets } from "./source-url-sweep.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTLE_MS = 3000;
const SNAPSHOT_ATTEMPTS = 3;
/** How many ranked search boxes to try per home page. Two covers the common
 * "simple site search box + advanced search panel" pair without turning a
 * failing source into a navigation storm. */
const MAX_BOX_RANKS = 2;

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The CDP proxy has no HTTP-status channel, and `cdpEval` loses its response
 * whenever the page navigates mid-eval — which is exactly what a submitted
 * search form does. Both are expected, so neither may throw. */
async function evalJson(tabId, script, attempts = SNAPSHOT_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await cdpEval(tabId, script);
      const value = resp?.result?.value ?? resp?.value;
      if (typeof value === "string" && value) return JSON.parse(value);
      if (value && typeof value === "object") return value;
    } catch {
      // Navigation killed the response — retry against the new document.
    }
    if (i < attempts - 1) await sleep(900);
  }
  return null;
}

/** Raw eval for scripts that return a plain string (the submit hand-off is not
 * JSON). Kept separate from `evalJson` so neither has to guess the shape. */
async function evalText(tabId, script) {
  try {
    const resp = await cdpEval(tabId, script);
    const value = resp?.result?.value ?? resp?.value;
    return typeof value === "string" ? value : null;
  } catch {
    // Navigation killed the response — the expected outcome of a submit.
    return null;
  }
}

async function snapshot(tabId, keyword) {
  return (await evalJson(tabId, buildSnapshotScript(keyword))) ?? null;
}

/**
 * Verdict for a browser snapshot. Login and block hints are read first: the
 * browser is looking at the real page, so its own text beats any status-code
 * guess. Everything else defers to the shared `classifyProbe` so the CDP path
 * cannot drift from the HTTP path.
 *
 * Note deliberately absent: anything that would *repair* a source. This
 * function only re-labels.
 */
export function verdictFromSnapshot(snap, { homeUrl, requestedUrl, keyword }) {
  if (!snap) return "network-error";
  if (snap.loginHint) return "login-wall";
  if (snap.blockHint) return "probe-not-authoritative";
  // The page's own result count, read in-page, is stronger evidence than any
  // inference from the chrome around it: thepaper's search page renders a 200
  // that says 找到约0个结果 while still echoing the term elsewhere.
  if (snap.zeroResults && (snap.status ?? 200) < 400) return "alive-zero-results";
  const keywordHits = keyword ? snap.keywordHits : null;
  return classifyProbe({
    status: snap.status ?? 200,
    finalUrl: snap.url,
    homeUrl,
    keywordHits,
    requestedUrl,
    html: "",
  });
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Open `url`, let the page settle, and report what the browser sees. */
async function browse(url, keyword) {
  let tabId = null;
  try {
    tabId = await cdpNewTab(url);
    await waitForPageLoad(tabId);
    await sleep(SETTLE_MS);
    return await snapshot(tabId, keyword);
  } catch (err) {
    return { error: String(err?.message ?? err).slice(0, 160), url };
  } finally {
    if (tabId) {
      try {
        await cdpCloseTab(tabId);
      } catch {
        /* tab already gone with its page */
      }
    }
  }
}

/**
 * One submit attempt: open the page fresh, fill the box at `rank`, submit,
 * and report where we landed. A fresh navigation per attempt is deliberate —
 * the previous submit usually moved the page away, so the box has to be
 * re-found rather than re-used.
 */
async function attemptDrive(url, keyword, rank) {
  let tabId = null;
  try {
    tabId = await cdpNewTab(url);
    await waitForPageLoad(tabId);
    await sleep(2500);
    const box = await evalJson(tabId, buildFindSearchBoxScript());
    if (!box?.found) return { url, rank, boxFound: false, dismissed: "no visible search box" };
    const shape = [box.type, box.name && `name=${box.name}`, box.id && `id=${box.id}`, box.placeholder && `ph=${box.placeholder}`]
      .filter(Boolean)
      .join(" ");
    if (rank >= (box.candidates ?? 1)) return { url, rank, boxFound: true, boxShape: shape, dismissed: "rank exceeds candidate count" };
    // Submitting navigates, so the eval's own response is expected to be lost.
    const via = await evalText(tabId, buildSubmitSearchScript(keyword, rank));
    await sleep(3500);
    const after = await snapshot(tabId, keyword);
    return {
      url,
      rank,
      boxFound: true,
      boxScore: box.score ?? null,
      boxCandidates: box.candidates ?? null,
      boxShape: shape,
      via: typeof via === "string" ? via : null,
      landedUrl: after?.url ?? null,
      landedStatus: after?.status ?? null,
      landedKeywordHits: after?.keywordHits ?? null,
      landedSampleTitles: after?.sampleTitles ?? [],
    };
  } catch (err) {
    return { url, rank, boxFound: false, dismissed: `drive failed: ${String(err?.message ?? err).slice(0, 120)}` };
  } finally {
    if (tabId) {
      try {
        await cdpCloseTab(tabId);
      } catch {
        /* tab already gone */
      }
    }
  }
}

/**
 * Drive the site's own search UI and read the URL it produced. This is the
 * authoritative answer to "what is the real search URL" — better than any
 * template table, because it is the site's own routing.
 *
 * Several home candidates are tried because the search UI often lives on a
 * sibling subdomain (xinhua: registry URL on `www.news.cn`, real search page on
 * `so.news.cn`). Two box ranks are tried per home because a page can carry both
 * the simple site-search box and a bigger advanced-search panel.
 */
async function discoverViaSearchBox(homeUrls, keyword) {
  const out = { attempts: [], template: null, dismissed: null };
  for (const homeUrl of homeUrls) {
    for (let rank = 0; rank < MAX_BOX_RANKS; rank++) {
      const attempt = await attemptDrive(homeUrl, keyword, rank);
      out.attempts.push(attempt);
      if (!attempt.boxFound) break; // nothing to drive on this home
      if (!attempt.landedUrl) continue;
      const tpl = templateFromLandedUrl(attempt.landedUrl, keyword);
      if (tpl) {
        Object.assign(out, {
          homeUrl,
          rank,
          template: tpl.template,
          templateShape: tpl.shape,
          templateParam: tpl.param,
          boxShape: attempt.boxShape,
          boxScore: attempt.boxScore,
          via: attempt.via,
          landedUrl: attempt.landedUrl,
          landedStatus: attempt.landedStatus,
          landedKeywordHits: attempt.landedKeywordHits,
          landedSampleTitles: attempt.landedSampleTitles,
        });
        return out;
      }
      // Gated landing: the redirect tells us the URL the site would have served.
      const target = loginRedirectTarget(attempt.landedUrl);
      const gated = target ? templateFromLandedUrl(target, keyword) : null;
      if (gated) {
        Object.assign(out, {
          homeUrl,
          rank,
          gatedTemplate: gated.template,
          gatedBy: "login-redirect",
          boxShape: attempt.boxShape,
          via: attempt.via,
          landedUrl: attempt.landedUrl,
          dismissed: "search box led to a login gate (template recovered from the redirect)",
        });
        return out;
      }
    }
  }
  const last = out.attempts[out.attempts.length - 1];
  out.dismissed =
    last?.dismissed ??
    (/user-login|\/login|passport\./i.test(last?.landedUrl || "")
      ? "search box led to a login gate"
      : "no home candidate produced a keyword-bearing search URL");
  return out;
}

async function discoverSource(source, { zhKeyword, enKeyword }) {
  const keyword = keywordForSource(source, zhKeyword, enKeyword);
  const useApi = source.accessMethod?.primary === "api" && typeof source.apiSearch?.url === "function";
  const probedUrl = useApi ? source.apiSearch.url(keyword) : source.url(keyword);
  const homeUrl = safeOrigin(probedUrl) ? new URL(probedUrl).origin + "/" : probedUrl;

  const snapA = await browse(probedUrl, keyword);
  const verdictA = verdictFromSnapshot(snapA, { homeUrl, requestedUrl: probedUrl, keyword });

  const row = {
    name: source.name,
    label: source.label ?? source.name,
    needsAuth: Boolean(source.needsAuth),
    keyword,
    probedKind: useApi ? "apiSearch" : "url",
    configuredUrl: probedUrl,
    homeUrl,
    cdp: { verdict: verdictA, snapshot: snapA },
    searchBox: null,
    candidate: null,
    // Read this against the HTTP column: `probe-not-authoritative` + `alive`
    // means the HTTP verdict was a probe artifact (bloomberg 403 → 200 in a
    // browser), while `probe-not-authoritative` + `blocked-in-browser-too`
    // means the block is real and no rewrite of the URL will help (reddit).
    resolvesTo: HEALTHY_VERDICTS.has(verdictA)
      ? "healthy-in-browser"
      : PROBE_UNAUTHORITATIVE_VERDICTS.has(verdictA)
        ? "blocked-in-browser-too"
        : "still-broken",
  };

  // Step 5 of the methodology: only worth driving the search UI when a keyword
  // is in play and the configured URL did not already work.
  if (!HEALTHY_VERDICTS.has(verdictA) && keyword) {
    row.searchBox = await discoverViaSearchBox(homeCandidates(probedUrl), keyword);
    const proposed = row.searchBox.template ?? row.searchBox.gatedTemplate ?? null;
    if (proposed) {
      const verifyUrl = proposed.replace("{kw}", encodeURIComponent(keyword));
      const snapC = await browse(verifyUrl, keyword);
      const verdictC = verdictFromSnapshot(snapC, { homeUrl, requestedUrl: verifyUrl, keyword });
      row.candidate = {
        template: proposed,
        shape: row.searchBox.templateShape ?? row.searchBox.gatedBy ?? null,
        recoveredFrom: row.searchBox.template ? "search-box" : row.searchBox.gatedBy,
        verifyUrl,
        verdict: verdictC,
        snapshot: snapC,
        // A template that reproduces the site's own result page is the fix; one
        // that lands on a login wall is a finding about the site, not a fix.
        usable: HEALTHY_VERDICTS.has(verdictC),
      };
      // Distinguish "we found the right URL and it is gated" from "we found
      // nothing" — they call for different follow-ups (needsAuth vs quarantine).
      if (!row.candidate.usable && verdictC === "login-wall") {
        row.resolvesTo = "url-recovered-but-login-gated";
      }
    }
  }
  return row;
}

function resolveTargets({ only, from, limit }) {
  let targets = selectSweepTargets();
  if (from) {
    const report = JSON.parse(readFileSync(from.startsWith("/") ? from : join(__dirname, from), "utf8"));
    // Everything that is not already healthy gets a browser second opinion —
    // explicitly including `probe-not-authoritative`, which is the class that
    // most needs one (a WAF 403 is exactly where the browser changes the answer).
    // Filtering on `isFailureVerdict` here would drop the very rows the tool
    // exists for.
    const names = new Set(
      (report.rows || []).filter((r) => needsCdpSecondOpinion(r.verdict)).map((r) => r.name),
    );
    targets = targets.filter((s) => names.has(s.name));
    process.stderr.write(`· --from ${from}: ${targets.length} row(s) need a browser second opinion\n`);
  }
  if (only) {
    const names = only.split(",").map((s) => s.trim()).filter(Boolean);
    targets = targets.filter((s) => names.includes(s.name));
  }
  if (limit > 0) targets = targets.slice(0, limit);
  return targets;
}

async function main() {
  // Entry point owns the .env.local load (lib/** never self-loads — #287/#275);
  // the worktree has no .env.local of its own, hence `--env`.
  loadEnv(getArg("env") || undefined);

  const zhKeyword = getArg("keyword-zh") || "人工智能";
  const enKeyword = getArg("keyword-en") || "AI";
  const targets = resolveTargets({ only: getArg("only"), from: getArg("from"), limit: Number(getArg("limit") || 0) });
  if (targets.length === 0) {
    console.log("no targets — pass --only <names> or --from <sweep-report.json>");
    return;
  }

  const rows = [];
  for (const source of targets) {
    const row = await discoverSource(source, { zhKeyword, enKeyword });
    rows.push(row);
    process.stderr.write(
      `· ${row.name.padEnd(22)} http->${String(row.cdp.snapshot?.status ?? "err").padEnd(4)} ` +
        `${row.cdp.verdict.padEnd(24)} ${row.resolvesTo.padEnd(19)} ` +
        `${row.candidate ? (row.candidate.usable ? "candidate ✓ " + row.candidate.template : "candidate ✗") : ""}\n`,
    );
    // The DevTools WS layer goes stale under back-to-back navigation storms
    // (see the runbook's cold-down note) — pace the batch.
    await sleep(1200);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    keyword: { zh: zhKeyword, en: enKeyword },
    targetCount: targets.length,
    rows,
  };
  const outArg = getArg("out");
  const outPath = outArg
    ? outArg.startsWith("/")
      ? outArg
      : join(__dirname, outArg)
    : join(__dirname, "output", `source-url-discover-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  report.outPath = outPath;
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (hasFlag("json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`\n# source-url-discover — ${report.generatedAt}`);
  console.log(`targets=${report.targetCount}  keyword(zh)=${zhKeyword} keyword(en)=${enKeyword}`);
  console.log(`report: ${outPath}\n`);
  console.log("| source | http status | browser verdict | resolves to | search box | candidate URL |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const sb = r.searchBox;
    const foundBox = sb?.attempts?.find((a) => a.boxFound);
    const box = sb
      ? foundBox
        ? `${foundBox.boxShape || "box"} (score ${foundBox.boxScore})`
        : `none (${sb.dismissed ?? sb.attempts?.[0]?.dismissed ?? "not attempted"})`
      : "-";
    const cand = r.candidate ? `\`${r.candidate.template}\` → ${r.candidate.verdict}` : "-";
    console.log(
      `| ${r.name} | ${r.cdp.snapshot?.status ?? "err"} | ${r.cdp.verdict} | ${r.resolvesTo} | ${truncate(box, 46)} | ${truncate(cand, 70)} |`,
    );
  }
  console.log("\nSample of what the browser actually saw (first 3):");
  for (const r of rows.slice(0, 3)) {
    console.log(`· ${r.name}: ${truncate(r.cdp.snapshot?.bodyHead ?? "(no snapshot)", 150)}`);
  }
}

function truncate(s, n) {
  const str = String(s ?? "");
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

export { discoverSource };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
