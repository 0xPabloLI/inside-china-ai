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
 *   node scripts/short-video/source-url-discover.mjs --all --env <main-checkout>/.env.local
 *
 * Two modes, because there are two questions:
 *   · default — **repair**. Drive the search box only where the configured URL
 *     fails to yield items, and emit the replacement URL.
 *   · `--compare` / `--all` — **alignment audit**. Drive it everywhere a keyword
 *     applies, including on healthy sources, and answer "is the URL in the
 *     registry the one this site's own search box produces?" A working URL is not
 *     evidence of alignment: a source configured on a page that already lists
 *     articles yields items, so no health signal would ever look at its search
 *     URL. Sources that take no keyword (column / RSS / Telegram) and API-direct
 *     sources are out of scope by construction — they have no search box to
 *     drive, and the audit says so instead of inventing a finding.
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
  classifyUrlDiff,
  countKeywordHits,
  EXTRACTION_EMPTY_LABEL,
  homeCandidates,
  loginRedirectTarget,
  needsCdpSecondOpinion,
  needsSearchBoxDrive,
  registryUrlLine,
  resolveHealth,
  templateFromLandedUrl,
} from "./lib/source-url-heal.mjs";
import {
  cdpCloseTab,
  cdpEval,
  cdpNewTab,
  waitForPageLoad,
  ensureCdpProxy,
} from "./lib/cdp-client.mjs";
import { ensureCdpProfileGuard } from "./lib/cdp-preflight.mjs";
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
 * The third health axis: run the source's **own** `articleScript` in the page.
 *
 * Axis 1 (bare HTTP) and axis 2 (browser navigation) both answer "is this URL a
 * result page?". Neither answers "does the registry's extraction still work" —
 * and that is the only question the pipeline actually depends on. Measured gap
 * (2026-09-23, douyin): axis 1 said `alive-no-keyword`, axis 2 said `alive` with
 * 20 real result cards on screen, axis 3 returned **0 items** because the
 * default tab renders cards without a single `<a href>`. Two green axes, dead
 * source.
 */
async function extractionProbe(tabId, source) {
  const script = source?.capabilities?.articles?.articleScript ?? source?.articleScript;
  if (!script) return { count: null, reason: "no-article-script" };
  // `articleScript` is a statement list ending in `return`, so it only evaluates
  // inside a function body of its own: a bare eval throws, and a caller that
  // swallows the throw reads that as "0 items" (trap hit twice — 2026-09-22 and
  // again on 2026-09-23 while diagnosing douyin). The `try` here is therefore
  // inside the page, and a throw reports `count: null` (not measured) rather
  // than 0 (measured empty).
  const wrapped = `JSON.stringify((function () {
  try {
    var out = (function () {${script}})();
    return {
      count: Array.isArray(out) ? out.length : out ? 1 : 0,
      sample: (Array.isArray(out) ? out : []).slice(0, 3).map(function (r) {
        return String((r && r.title) || "").slice(0, 70);
      }),
    };
  } catch (e) {
    return { count: null, reason: "script-error", message: String((e && e.message) || e).slice(0, 120) };
  }
})())`;
  return (await evalJson(tabId, wrapped)) ?? { count: null, reason: "eval-failed" };
}

/** Verdict for a browser snapshot. Login and block hints are read first: the
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
async function browse(url, keyword, source = null) {
  let tabId = null;
  try {
    tabId = await cdpNewTab(url);
    await waitForPageLoad(tabId);
    await sleep(SETTLE_MS);
    const snap = await snapshot(tabId, keyword);
    // Same tab, same moment: what would the pipeline have extracted from this
    // very page? Reported alongside the verdict, never in place of it.
    if (snap && source) snap.extraction = await extractionProbe(tabId, source);
    return snap;
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
    const shape = [
      box.type,
      box.name && `name=${box.name}`,
      box.id && `id=${box.id}`,
      box.placeholder && `ph=${box.placeholder}`,
    ]
      .filter(Boolean)
      .join(" ");
    if (rank >= (box.candidates ?? 1))
      return {
        url,
        rank,
        boxFound: true,
        boxShape: shape,
        dismissed: "rank exceeds candidate count",
      };
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
    return {
      url,
      rank,
      boxFound: false,
      dismissed: `drive failed: ${String(err?.message ?? err).slice(0, 120)}`,
    };
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
async function discoverViaSearchBox(homeUrls, keyword, { firstLanded = false } = {}) {
  // `boxFound` is tracked separately from `template` because "there is no search
  // box to drive" and "the box exists but its URL never carries the term" are
  // different findings with different follow-ups. Collapsing them (both have a
  // null template) made the first audit run report 12 sources as the second.
  const out = { attempts: [], template: null, dismissed: null, boxFound: false };
  for (const homeUrl of homeUrls) {
    for (let rank = 0; rank < MAX_BOX_RANKS; rank++) {
      const attempt = await attemptDrive(homeUrl, keyword, rank);
      out.attempts.push(attempt);
      if (!attempt.boxFound) break; // nothing to drive on this home
      out.boxFound = true;
      if (!attempt.landedUrl) continue;
      const tpl = templateFromLandedUrl(attempt.landedUrl, keyword);
      if (tpl) {
        Object.assign(out, {
          homeUrl,
          rank,
          template: tpl.template,
          templateVerbatim: tpl.templateVerbatim ?? tpl.template,
          templateDropped: tpl.droppedParams ?? [],
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
          gatedTemplateVerbatim: gated.templateVerbatim ?? gated.template,
          gatedTemplateDropped: gated.droppedParams ?? [],
          gatedBy: "login-redirect",
          boxShape: attempt.boxShape,
          via: attempt.via,
          landedUrl: attempt.landedUrl,
          dismissed: "search box led to a login gate (template recovered from the redirect)",
        });
        return out;
      }
      // Audit mode (`--compare` / `--all`): the box submitted and we have a
      // landing URL, but it carries no keyword — a POST form or a client-side
      // route that never puts the term in the address bar. That is already the
      // answer to "is the configured URL the site's search URL?" (no), and a
      // second box rank cannot change it. Record the landing and stop, so a
      // 55-source audit does not pay a navigation storm per source.
      if (firstLanded) {
        Object.assign(out, {
          homeUrl,
          rank,
          landedUrl: attempt.landedUrl,
          landedStatus: attempt.landedStatus,
          landedKeywordHits: attempt.landedKeywordHits,
          landedSampleTitles: attempt.landedSampleTitles,
          boxShape: attempt.boxShape,
          boxScore: attempt.boxScore,
          via: attempt.via,
          dismissed: "search box submitted but the landing URL carries no keyword",
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

async function discoverSource(source, { zhKeyword, enKeyword, compareBoxes = false }) {
  const keyword = keywordForSource(source, zhKeyword, enKeyword);
  const useApi =
    source.accessMethod?.primary === "api" && typeof source.apiSearch?.url === "function";
  const probedUrl = useApi ? source.apiSearch.url(keyword) : source.url(keyword);
  const homeUrl = safeOrigin(probedUrl) ? new URL(probedUrl).origin + "/" : probedUrl;

  const snapA = await browse(probedUrl, keyword, source);
  const verdictA = verdictFromSnapshot(snapA, { homeUrl, requestedUrl: probedUrl, keyword });
  // Axis 3. `null` = not measured (no articleScript / the script threw); `0` =
  // measured and empty. Only the latter is evidence of a dead source, and any
  // count above zero is evidence the source works whatever the other axes said.
  const extractedA = snapA?.extraction?.count ?? null;

  const row = {
    name: source.name,
    label: source.label ?? source.name,
    needsAuth: Boolean(source.needsAuth),
    keyword,
    probedKind: useApi ? "apiSearch" : "url",
    configuredUrl: probedUrl,
    homeUrl,
    cdp: { verdict: verdictA, snapshot: snapA },
    extraction: {
      configured: extractedA,
      reason: snapA?.extraction?.reason ?? null,
      sample: snapA?.extraction?.sample ?? [],
    },
    searchBox: null,
    candidate: null,
    // Read this against the HTTP column: `probe-not-authoritative` + `alive`
    // means the HTTP verdict was a probe artifact (bloomberg 403 → 200 in a
    // browser), while `probe-not-authoritative` + `blocked-in-browser-too`
    // means the block is real and no rewrite of the URL will help (reddit).
    // A healthy URL that extracts nothing gets its own label (douyin): the fix
    // is not a different URL for the probe, it is a different URL for the
    // *extraction*, and only the browser can tell the two apart.
    // Axis 3 outranks axes 1 and 2 when they disagree — see `resolveHealth()`.
    // `probe-not-authoritative` + 230 items (guancha) and `alive` + 0 items
    // (douyin) are the two mirror-image cases that made this a shared rule
    // instead of two ad-hoc comparisons.
    resolvesTo: resolveHealth({ verdict: verdictA, extracted: extractedA }),
  };

  // Step 5 of the methodology: drive the site's own search UI when a keyword is
  // in play and the configured URL did not demonstrably work — where
  // "demonstrably worked" now means *yields items*, not merely *resolves*.
  //
  // `--compare` / `--all` adds the second reason to drive it: **alignment**. The
  // repair trigger structurally cannot see whether a *working* URL is the site's
  // search URL, because extraction health answers "does it yield items?" and a
  // page that is already a result page answers yes. Auditing every keyword-bearing
  // source therefore has to bypass the trigger, not tighten it — while API-direct
  // sources are excluded outright: they have no search box, so driving one would
  // manufacture a finding about the audit rather than about the source.
  const shouldDrive = compareBoxes
    ? Boolean(keyword) && !useApi
    : needsSearchBoxDrive({ verdict: verdictA, extracted: extractedA, keyword });
  if (shouldDrive) {
    row.searchBox = await discoverViaSearchBox(homeCandidates(probedUrl), keyword, {
      firstLanded: compareBoxes,
    });
    const proposed = row.searchBox.template ?? row.searchBox.gatedTemplate ?? null;
    if (proposed) {
      // The driven URL carries session furniture with it (douyin's own landing
      // page appends `aid=<uuid>`, regenerated per visit), so the template that
      // came back from `templateFromLandedUrl` has already had those pairs
      // stripped. Verify the stripped form first — it is the only one that can be
      // committed — and fall back to the verbatim form when stripping removed
      // something the page actually needed. Which one wins is decided by the
      // source's own `articleScript`, not by the heuristic.
      const verbatim = row.searchBox.templateVerbatim ?? null;
      // Repair mode verifies both spellings, stripped first — the stripped form is
      // the only one that can be committed, and the verbatim fallback is what
      // catches a site that needs the session furniture. An audit has no such
      // stake, and 55 sources × 2 navigations is a different budget, so it
      // verifies the committable spelling only.
      const variants = compareBoxes
        ? [proposed ?? verbatim].filter((t) => t && t.includes("{kw}"))
        : [...new Set([proposed, verbatim].filter((t) => t && t.includes("{kw}")))];
      let chosen = null;
      for (const tpl of variants) {
        const verifyUrl = tpl.replace("{kw}", encodeURIComponent(keyword));
        const snapC = await browse(verifyUrl, keyword, source);
        const verdictC = verdictFromSnapshot(snapC, { homeUrl, requestedUrl: verifyUrl, keyword });
        const extractedC = snapC?.extraction?.count ?? null;
        const attempt = {
          template: tpl,
          verifyUrl,
          verdict: verdictC,
          extracted: extractedC,
          snapshot: snapC,
          // A template that reproduces the site's own result page **and extracts
          // items** is the fix. A page that renders but yields nothing is not a
          // fix at all — it is the douyin shape, where the URL was never the
          // problem. Landing on a login wall stays a finding about the site.
          // Items in hand is the whole test. It used to also require the browser
          // verdict to be healthy, which rejected working replacements whenever
          // axis 2 misread a block phrase (guancha). A block page cannot satisfy
          // a source's extraction contract, so this is the stronger evidence.
          usable: extractedC !== null && extractedC > 0,
        };
        if (!chosen) chosen = attempt;
        if (attempt.usable) {
          chosen = attempt;
          break;
        }
      }
      const usedStripped = chosen.template === proposed && verbatim !== proposed;
      row.candidate = {
        ...chosen,
        shape: row.searchBox.templateShape ?? row.searchBox.gatedBy ?? null,
        recoveredFrom: row.searchBox.template ? "search-box" : row.searchBox.gatedBy,
        // What the repair removed, and whether the kept form is the stripped one.
        droppedParams: usedStripped ? (row.searchBox.templateDropped ?? []) : [],
        variant: usedStripped ? "volatile-stripped" : "as-landed",
        // The literal registry line for a usable candidate — the repair ends at a
        // paste, not at a JSON blob. See `registryUrlLine()`.
        registryLine: registryUrlLine(chosen.template),
      };
      // Distinguish "we found the right URL and it is gated" from "we found
      // nothing" — they call for different follow-ups (needsAuth vs quarantine).
      if (!row.candidate.usable && chosen.verdict === "login-wall") {
        row.resolvesTo = "url-recovered-but-login-gated";
      } else if (!row.candidate.usable && chosen.extracted === 0) {
        row.resolvesTo = EXTRACTION_EMPTY_LABEL;
      }
    }
  }

  // ─── Alignment: is the configured URL the one the site's own search UI makes? ───
  // Deliberately separate from `candidate`, which is about *repairing* a broken
  // URL. The two disagree by design: a source can be misaligned **and** healthy,
  // and that is a finding about the registry rather than a health problem.
  // Read the answer as a question, not a verdict — a feed-shaped source may sit
  // on its front page on purpose, so `differs` names what changed and leaves the
  // decision with the reader.
  row.consistency = buildConsistency({
    box: row.searchBox,
    shouldDrive,
    keyword,
    configuredUrl: probedUrl,
    recoveredTemplate:
      row.searchBox?.templateVerbatim ?? row.searchBox?.gatedTemplateVerbatim ?? null,
    probedKind: useApi ? "apiSearch" : "url",
  });
  return row;
}

/**
 * Classify the alignment between the configured URL and the URL the site's own
 * search box produced.
 *
 * `match` vocabulary:
 *   · `same`                        — the registry already points at the site's search URL
 *                                     (or at it minus decorating params — see `subset`)
 *   · `differs`                     — it points somewhere else; `diffs` says where
 *   · `no-search-box`               — driven, and no box exists on any home candidate
 *   · `not-measured`               — not driven: the configured URL yields items (repair mode)
 *   · `not-applicable`             — no search URL exists to align with (no keyword, or API-direct)
 *   · `no-keyword-in-recovered-url` — a box exists and submitted, but the landing URL has no term
 *   · `uncomparable`               — nothing to compare on one of the two sides
 */
function buildConsistency({
  box,
  shouldDrive,
  keyword,
  configuredUrl,
  recoveredTemplate,
  probedKind,
}) {
  if (probedKind === "apiSearch") {
    return {
      match: "not-applicable",
      reason: "API-direct source: it queries the API, there is no search box to drive",
      diffs: [],
    };
  }
  if (!keyword) {
    return {
      match: "not-applicable",
      reason: "this source carries no keyword (supportsKeyword: false)",
      diffs: [],
    };
  }
  if (!box) {
    return {
      match: shouldDrive ? "no-search-box" : "not-measured",
      reason: shouldDrive
        ? "no search box found on any home candidate"
        : "configured URL yields items; pass --compare to audit the URL anyway",
      diffs: [],
    };
  }
  if (box.boxFound === false) {
    // Driven, but no box exists on any home candidate. Its own answer — not a
    // variant of "the box produced no keyword URL".
    return {
      match: "no-search-box",
      reason: box.dismissed ?? "no search box found on any home candidate",
      diffs: [],
    };
  }
  if (recoveredTemplate) {
    const diff = classifyUrlDiff(configuredUrl, recoveredTemplate, keyword);
    return {
      match: diff.match,
      diffs: diff.diffs,
      // `same` reached as "configured is the recovered URL minus decorating
      // params" — kept visible so a reader can see the box adds `vt`/`from_source`
      // and re-decide later, rather than losing the information to a bare `same`.
      ...(diff.subset ? { subset: true, extraParams: diff.extraParams } : {}),
      recoveredTemplate,
      recoveredUrl: recoveredTemplate.replace("{kw}", encodeURIComponent(keyword)),
      recoveredFrom: box.template ? "search-box" : box.gatedBy,
    };
  }
  return {
    match: "no-keyword-in-recovered-url",
    reason: box.dismissed ?? "search box produced no keyword-bearing URL",
    landedUrl: box.landedUrl ?? null,
    diffs: [],
  };
}

/**
 * Roll the per-row alignment answers up, and pull the misaligned ones out — they
 * are the whole point of an audit run, and burying them in 55 rows would make
 * the report read the same as a clean one.
 */
function summarizeConsistency(rows) {
  const counts = {};
  for (const r of rows) {
    const m = r.consistency?.match ?? "unknown";
    counts[m] = (counts[m] ?? 0) + 1;
  }
  return {
    counts,
    misaligned: rows
      .filter((r) => r.consistency?.match === "differs")
      .map((r) => ({
        source: r.name,
        configuredUrl: r.configuredUrl,
        recoveredUrl: r.consistency.recoveredUrl,
        diffs: r.consistency.diffs,
        // Both sides, so "switch to the recovered URL" can be weighed: a recovered
        // URL that extracts 0 is not an upgrade, whatever the alignment says.
        extractedFromConfigured: r.extraction?.configured ?? null,
        extractedFromRecovered: r.candidate?.extracted ?? null,
        recoveredUsable: Boolean(r.candidate?.usable),
      })),
  };
}

function resolveTargets({ only, from, limit }) {
  let targets = selectSweepTargets();
  if (from) {
    const report = JSON.parse(
      readFileSync(from.startsWith("/") ? from : join(__dirname, from), "utf8"),
    );
    // Everything that is not already healthy gets a browser second opinion —
    // explicitly including `probe-not-authoritative`, which is the class that
    // most needs one (a WAF 403 is exactly where the browser changes the answer).
    // Filtering on `isFailureVerdict` here would drop the very rows the tool
    // exists for.
    const names = new Set(
      (report.rows || []).filter((r) => needsCdpSecondOpinion(r.verdict)).map((r) => r.name),
    );
    targets = targets.filter((s) => names.has(s.name));
    process.stderr.write(
      `· --from ${from}: ${targets.length} row(s) need a browser second opinion\n`,
    );
  }
  if (only) {
    const names = only
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    targets = targets.filter((s) => names.includes(s.name));
  }
  if (limit > 0) targets = targets.slice(0, limit);
  return targets;
}

async function main() {
  // Entry point owns the .env.local load (lib/** never self-loads — #287/#275);
  // the worktree has no .env.local of its own, hence `--env`.
  loadEnv(getArg("env") || undefined);

  // The repair tool drives a real browser, so it owns the same Step 0.1 + 0.2
  // ladder the pipeline uses — and for the same reason: it used to assume a
  // proxy was already up, so a standalone repair run either failed obscurely or
  // attached to whichever Chrome the proxy's port discovery found. Reading the
  // wrong profile does not error; it just reports believable wrong answers,
  // which is the worst possible failure mode for the tool that decides what the
  // registry should say.
  await ensureCdpProfileGuard();
  if (!(await ensureCdpProxy())) {
    console.error(
      "❌ CDP proxy unavailable — repair cannot drive the search box. See the runbook.",
    );
    process.exit(1);
  }

  const zhKeyword = getArg("keyword-zh") || "人工智能";
  const enKeyword = getArg("keyword-en") || "AI";
  // `--compare` (with `--only`) and `--all` audit URL alignment rather than repair
  // breakage: every keyword-bearing source gets its search box driven even when
  // the configured URL is healthy. `--all` additionally means "the whole registry
  // minus the media sources" (`selectSweepTargets` drops the `url`-less ones).
  const compareBoxes = hasFlag("compare") || hasFlag("all");
  const targets = resolveTargets({
    only: getArg("only"),
    from: getArg("from"),
    limit: Number(getArg("limit") || 0),
  });
  if (targets.length === 0) {
    console.log("no targets — pass --only <names> or --from <sweep-report.json>");
    return;
  }

  const rows = [];
  for (const source of targets) {
    const row = await discoverSource(source, { zhKeyword, enKeyword, compareBoxes });
    rows.push(row);
    process.stderr.write(
      `· ${row.name.padEnd(22)} http->${String(row.cdp.snapshot?.status ?? "err").padEnd(4)} ` +
        `${row.cdp.verdict.padEnd(24)} extract=${String(row.extraction?.configured ?? "n/a").padEnd(4)} ` +
        `${row.resolvesTo.padEnd(31)} ` +
        `align=${String(row.consistency?.match ?? "?").padEnd(28)} ` +
        `${row.candidate ? (row.candidate.usable ? "candidate ✓ " + row.candidate.template : "candidate ✗") : ""}` +
        `${row.candidate?.droppedParams?.length ? ` [dropped ${row.candidate.droppedParams.join(",")}]` : ""}\n`,
    );
    // The DevTools WS layer goes stale under back-to-back navigation storms
    // (see the runbook's cold-down note) — pace the batch.
    await sleep(1200);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    keyword: { zh: zhKeyword, en: enKeyword },
    targetCount: targets.length,
    // An audit answers a different question from a repair, and the report has to
    // say which one it is, because `not-measured` and `same` both look like
    // "nothing wrong" unless you know which question was asked.
    audit: compareBoxes ? "url-alignment" : "repair",
    consistencySummary: summarizeConsistency(rows),
    // Machine-readable half of the repair: one entry per source whose recovered
    // URL actually extracts, carrying the literal registry line. A repair run is
    // supposed to end at an edit, so the artifact that ends it is in the report.
    //
    // Filtered on alignment, not just on usability. Driving a search box on a
    // source whose configured URL is *already* the search URL ("same") recovers
    // that same URL and verifies fine — listing it as a patch would recommend an
    // edit that changes nothing, and make a clean audit read like a repair list.
    // Found by running `--compare` on ithome/thepaper, which are aligned.
    registryPatches: rows
      .filter(
        (r) =>
          r.candidate?.usable &&
          r.candidate.registryLine &&
          classifyUrlDiff(r.configuredUrl, r.candidate.template, r.keyword).match !== "same",
      )
      .map((r) => ({
        source: r.name,
        configuredUrl: r.configuredUrl,
        template: r.candidate.template,
        registryLine: r.candidate.registryLine,
        variant: r.candidate.variant,
        droppedParams: r.candidate.droppedParams ?? [],
        shape: r.candidate.shape,
        verified: { verdict: r.candidate.verdict, extracted: r.candidate.extracted },
      })),
    rows,
  };
  const outArg = getArg("out");
  const outPath = outArg
    ? outArg.startsWith("/")
      ? outArg
      : join(__dirname, outArg)
    : join(
        __dirname,
        "output",
        `source-url-discover-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      );
  mkdirSync(dirname(outPath), { recursive: true });
  report.outPath = outPath;
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (hasFlag("json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`\n# source-url-discover — ${report.generatedAt}`);
  console.log(`mode=${report.audit}  targets=${report.targetCount}`);
  console.log(`keyword(zh)=${zhKeyword} keyword(en)=${enKeyword}`);
  console.log(`report: ${outPath}\n`);
  console.log(
    "| source | http | browser verdict | extract | resolves to | URL alignment | search box | candidate URL |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const sb = r.searchBox;
    const foundBox = sb?.attempts?.find((a) => a.boxFound);
    const box = sb
      ? foundBox
        ? `${foundBox.boxShape || "box"} (score ${foundBox.boxScore})`
        : `none (${sb.dismissed ?? sb.attempts?.[0]?.dismissed ?? "not attempted"})`
      : "-";
    const cand = r.candidate
      ? `\`${r.candidate.template}\` → ${r.candidate.verdict} / extract ${r.candidate.extracted ?? "n/a"}`
      : "-";
    const align = r.consistency
      ? r.consistency.diffs?.length
        ? `${r.consistency.match} (${r.consistency.diffs.join("+")})`
        : r.consistency.match
      : "-";
    console.log(
      `| ${r.name} | ${r.cdp.snapshot?.status ?? "err"} | ${r.cdp.verdict} | ${r.extraction?.configured ?? "n/a"} | ${r.resolvesTo} | ${truncate(align, 40)} | ${truncate(box, 46)} | ${truncate(cand, 78)} |`,
    );
  }
  console.log("\nHow to read the `extract` column: `/` = the configured URL, measured by");
  console.log("running this source's own articleScript in the page. `n/a` = not measured");
  console.log("(no script / it threw) — not the same as `0` = measured and empty.");

  // Alignment is a question about the *registry*, not about source health, so it
  // gets its own section: a source can be misaligned and perfectly healthy, and
  // reading that off the health columns is impossible.
  const summary = report.consistencySummary;
  console.log(`\n## URL alignment — ${JSON.stringify(summary.counts)}`);
  if (summary.misaligned.length === 0) {
    console.log("No misaligned source: every audited source already points at the URL its");
    console.log("own search box produces (or the check did not apply — see the counts).");
  } else {
    console.log(
      `${summary.misaligned.length} source(s) point somewhere other than their own search box's URL:`,
    );
    console.log("");
    console.log(
      "| source | configured | search box produces | differs in | extract now → recovered |",
    );
    console.log("| --- | --- | --- | --- | --- |");
    for (const m of summary.misaligned) {
      console.log(
        `| ${m.source} | \`${truncate(m.configuredUrl, 60)}\` | \`${truncate(m.recoveredUrl ?? "?", 60)}\` | ${m.diffs.join("+")} | ${m.extractedFromConfigured ?? "n/a"} → ${m.extractedFromRecovered ?? "not verified"} |`,
      );
    }
    console.log(
      "\n`differs` is a finding, not a fault: a feed-shaped source may be configured on its",
    );
    console.log(
      "front page deliberately. Weigh a switch by the two extract numbers — a recovered URL",
    );
    console.log("that extracts fewer items than the configured one is not an upgrade.");
  }

  // The last mile of the repair: recovered URL → registry line. Printed as a
  // paste-ready block because the hand-typed version of this step is where the
  // param that mattered gets lost (`?type=video`).
  const fixable = report.registryPatches;
  if (fixable.length > 0) {
    console.log(
      `\n## Registry patch — ${fixable.length} source(s) with a verified replacement URL`,
    );
    console.log("Verified = the recovered URL renders the site's own result page **and** this");
    console.log("source's articleScript extracts ≥1 item from it. Replace the matching `url:` in");
    console.log("scripts/short-video/lib/source-registry.mjs.\n");
    for (const p of fixable) {
      const notes = [`variant: ${p.variant}`];
      if (p.droppedParams.length > 0) notes.push(`dropped volatile: ${p.droppedParams.join(", ")}`);
      console.log(`### ${p.source}  (${notes.join("; ")})`);
      console.log("```js");
      console.log(p.registryLine);
      console.log("```");
      console.log(`was: \`${truncate(p.configuredUrl, 110)}\``);
      console.log(`now: \`${p.template}\` → extract ${p.verified.extracted}\n`);
    }
  } else {
    console.log("\n## Registry patch — none: no source produced a URL that both resolves");
    console.log("   and extracts. Nothing to paste; see the `resolves to` column above.");
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
