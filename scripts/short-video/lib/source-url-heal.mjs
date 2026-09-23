/**
 * Source URL healing primitives (#269 Phase 2).
 *
 * The failure class this module targets: a CDP source whose *search URL
 * pattern* is dead (404 / redirected to the homepage) while the site itself
 * is alive. #269 Phase 1 can only *detect* that state (`judgeUrlProbe`);
 * Phase 2 has to answer "what replaces it?" — this module automates the
 * discovery half of that answer so a sweep of dozens of sources does not
 * need one CDP navigation per site.
 *
 * Order of evidence (cheapest first, per the Phase 2 methodology in
 * docs/selector-auto-healing.md):
 *   1. HTTP probe of the configured search URL  → alive / dead / redirected
 *   2. Static discovery on the homepage HTML    → search form action + param
 *   3. Known search-path templates              → /search?q=, /s?q=, …
 *   4. RSS/Atom alternate links + common feeds  → API-shaped replacement
 *   5. Only if all of the above fail: interactive CDP in-page search
 *
 * Everything in this file is pure (no network, no fs) so the discovery rules
 * can be locked by tests against saved HTML fixtures.
 */

/** Charset-aware decode: several zh-CN news sites still serve GB2312/GBK, and
 * decoding those as UTF-8 turns the body into mojibake — which would make a
 * keyword-hit check report a false "content vacuum". */
export function decodeHtml(buffer, contentType = "") {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const charset = pickCharset(bytes, contentType);
  try {
    return { text: new TextDecoder(charset).decode(bytes), charset };
  } catch {
    // Unknown/unsupported label — latin1 never throws and keeps byte offsets.
    return { text: new TextDecoder("latin1").decode(bytes), charset: "latin1" };
  }
}

function pickCharset(bytes, contentType) {
  const fromHeader = /charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType || "");
  if (fromHeader) return normalizeCharset(fromHeader[1]);
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  const meta =
    /<meta[^>]+charset\s*=\s*"?([^";>\s]+)"?/i.exec(head) ||
    /<meta[^>]+content\s*=\s*[^>]*charset\s*=\s*([^";>\s]+)/i.exec(head);
  if (meta) return normalizeCharset(meta[1]);
  return "utf-8";
}

function normalizeCharset(label) {
  const l = String(label).toLowerCase().trim();
  if (l.startsWith("gb") || l === "x-gbk" || l === "chinese") return "gb18030";
  if (l === "big5" || l === "big5-hkscs") return "big5";
  if (l === "utf8") return "utf-8";
  return l;
}

/** Occurrences of `keyword` in `text`.
 *
 * ASCII keywords must match on **word boundaries**, not as substrings. The
 * 2026-09-22 sweep scored 237 hits for keyword "AI" on a Reddit 403 block page
 * whose actual text contains no result — every hit was inside "email",
 * "certain", "domain". A phantom hit count is the worst kind of wrong: it
 * flips `alive-no-keyword` into `alive` and makes a blocked source look
 * healthy. CJK has no word separators, so `indexOf` stays correct there. */
export function countKeywordHits(text, keyword) {
  if (!text || !keyword) return 0;
  if (/^[\x00-\x7F]+$/.test(keyword)) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi");
    return (text.match(re) || []).length;
  }
  let n = 0;
  let i = text.indexOf(keyword);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(keyword, i + keyword.length);
  }
  return n;
}

/**
 * Login endpoints, by path/host shape. Deliberately narrow: a bare
 * "登录/注册" in the page chrome appears on healthy anonymous pages too
 * (zhihu renders it while serving real content), so only an actual login
 * *destination* counts.
 */
const LOGIN_URL_RE =
  /(\/user-login[/.?]|\/login\b|\/signin\b|\/sign-in\b|passport\.|accounts\.google\.com|\/sso\/|\/cas\/login|member\.)/i;

/** A login *wall* is a page that would serve results to a logged-in visitor
 * and refuses an anonymous one. Two shapes, both observed on 2026-09-22:
 *   · the fetch lands on a login endpoint (ithome: `/search/{kw}.html` 302s to
 *     `/user-login/index.htm?url=…&tip=登录以查看搜索结果`);
 *   · the page renders in place but announces the gate (zhihu search: HTTP 200,
 *     "未搜索到相关内容" + 登录/注册, no results for an anonymous visitor).
 *
 * This is NOT a dead URL and must not be repaired by changing the URL — the
 * same #285 rule that keeps login-gated sources out of the dead-source
 * ledger. */
export function detectLoginWall({ finalUrl = "", html = "" } = {}) {
  if (finalUrl && LOGIN_URL_RE.test(String(finalUrl))) return true;
  return /登录以查看搜索结果|请先登录|登录后查看|需要登录后|Login required|Sign in to (?:continue|view)|You must be logged in/i.test(
    html || "",
  );
}

/** Anti-bot / WAF / rate-limit signatures. A 403 that comes from a WAF says
 * nothing about whether the URL pattern is alive: xinhua's `so.news.cn/getNews`
 * answers a real browser with 200 + JSON and a Node fetch with 403 (openresty),
 * and reddit answers *everything* non-browser with a network-security block.
 *
 * This list is necessarily incomplete and should be treated as such — it is a
 * vocabulary of observed interstitials, not a detector. The structural protection
 * is elsewhere: `resolveHealth()` lets a source that still extracts items win
 * regardless of what this list missed, so a missing pattern degrades the *label*
 * rather than the *decision*. Add a pattern when a real page proves it
 * (36kr, 2026-09-23: Volcengine returns **200** with 正在进行安全检测, which no
 * status-based rule can see).
 */
const BLOCK_PAGE_RE =
  /403 Forbidden|Access Denied|blocked by network security|安全验证|安全检测|异常流量|请求过于频繁|访问频率|访问过于频繁|verify you are human|Verifying you are human|Checking your browser|cf-browser-verification|Just a moment|Attention Required|Enable JavaScript and cookies/i;

export function detectBlockPage({ status, html = "" } = {}) {
  if (status === 429 || status === 503) return true;
  if (status !== 401 && status !== 403 && status !== 405) return false;
  if (BLOCK_PAGE_RE.test(html || "")) return true;
  // A 4xx that carries almost no body is an edge/WAF rejection, not a page that
  // decided the URL does not exist (xinhua's openresty 403 is 159 bytes).
  return (html || "").length < 2000;
}

/**
 * "Found ~0 results" — the page's own verdict on its own query.
 *
 * Keyword presence alone is a weak signal: a search page carries its query in
 * the header, in a breadcrumb, in an "you searched for X" strip, and in the
 * sidebar's hot-topic list. thepaper's `?keyword=AI` page says 找到约0个结果 in
 * plain text and still scored a keyword hit elsewhere, which read as `alive`
 * (2026-09-22). The result count the page states about itself beats any
 * inference from the surrounding chrome.
 *
 * Exported so the CDP snapshot script can evaluate the *same* list in-page —
 * one definition, two consumers.
 */
export const ZERO_RESULTS_PATTERNS = [
  "找到约\\s*0\\s*个结果",
  "找到\\s*0\\s*个结果",
  "约\\s*0\\s*个结果",
  "没有找到(?:相关|任何)?(?:结果|内容|文章)",
  "未找到(?:相关|任何)?(?:结果|内容|文章)",
  "没有搜索到",
  "暂无(?:相关)?(?:结果|内容|数据|文章)",
  "无相关结果",
  "did not match any",
  "no results found",
  "no results were found",
  "\\b0 results\\b",
  "About 0 results",
];

export function detectZeroResults(text) {
  if (!text) return false;
  return ZERO_RESULTS_PATTERNS.some((p) => new RegExp(p, "i").test(text));
}

/**
 * Classify one probe. `homeUrl` is the site root (origin + "/") used to
 * recognise "the search page silently bounced me to the homepage" — the exact
 * ithome failure mode from #269 Phase 1 (534 homepage links harvested as
 * "search results").
 *
 * Verdict vocabulary, and which half of it is about the *source*:
 *
 *   alive                  results present, on-site
 *   alive-off-site         results present, but the configured URL lands on a
 *                          different host — a canonical hop, not a failure
 *                          (google.com → google.com.hk, threads.net →
 *                          threads.com). 2026-09-22: this class was being
 *                          reported as `redirected-off-site` for four healthy
 *                          sources, three of which were carrying 28–148
 *                          keyword hits.
 *   alive-no-keyword       reachable but the term appears nowhere
 *   alive-zero-results     the page states its own query returned 0 results —
 *                          the URL works, the query does not (thepaper)
 *   redirected-home        search URL bounced to the site root
 *   redirected-off-site    landed on another host *without* the term
 *   http-dead              404/410/5xx — a real endpoint-death signal
 *   network-error          transport failure, but the probe reached the host
 *   probe-no-egress        the probe could not reach that host at all (a bare
 *                          `<origin>/` failed too) — says nothing about the source
 *   login-wall             the answer depends on cookies, not on the URL
 *   probe-not-authoritative 401/403/405/429 — an edge/WAF/credential answer
 *                          about the *probe*; a real browser may differ
 *
 * The last three are the accuracy fixes of 2026-09-22/23: calling them "dead" is
 * what sent live sources to the repair queue while the actual repair was "look
 * at it from a browser", or "the probe has no route to this host" (#269 Phase 2
 * methodology step 5).
 */

/**
 * The probe could not open a connection to the host at all.
 *
 * Kept separate from `probe-not-authoritative` on purpose: that verdict means
 * *the host answered and the answer was about the probe* (WAF/credential); this
 * one means **there was no answer**, and the reader's next move differs — check
 * the proxy/egress, not the headers.
 */
export const EGRESS_UNREACHABLE_VERDICT = "probe-no-egress";

export function classifyProbe({
  status,
  finalUrl,
  homeUrl,
  keywordHits = 0,
  requestedUrl = null,
  html = "",
  controlReachable = null,
}) {
  if (status === null) {
    // A connect-level failure is a fact about the *probe's* route until the probe
    // shows otherwise. `network-error` is a failure verdict and feeds the
    // dead-source ledger, so writing a source off on it is a claim the probe
    // cannot support: on 2026-09-23 four sources came back `UND_ERR_CONNECT_TIMEOUT`
    // while google.com itself was unreachable from the probe (and `gh` was fine).
    // `controlReachable === false` = a bare `<origin>/` did not connect either, so
    // nothing was learned about the source's search endpoint.
    if (controlReachable === false) return EGRESS_UNREACHABLE_VERDICT;
    return "network-error";
  }
  if (status >= 400) {
    // Order matters: status-specific edges are asked about *before* declaring
    // the URL dead, because both answers come back as 4xx.
    if (detectLoginWall({ finalUrl, html })) return "login-wall";
    if (detectBlockPage({ status, html })) return "probe-not-authoritative";
    return "http-dead";
  }
  if (detectLoginWall({ finalUrl, html })) return "login-wall";
  let final;
  let home;
  try {
    final = new URL(finalUrl);
    home = new URL(homeUrl);
  } catch {
    return "unknown";
  }
  // `keywordHits === null` means "no keyword in play" (listing/API sources whose
  // URL carries no query term) — the relevance gate does not apply to them.
  const hasKeyword = keywordHits !== null && keywordHits > 0;
  if (final.host !== home.host) {
    // A cross-host hop that still carries the term is a canonical-domain move,
    // not a broken URL: the page we landed on is the page we wanted.
    return hasKeyword ? "alive-off-site" : "redirected-off-site";
  }
  const finalPath = final.pathname.replace(/\/+$/, "") || "/";
  const homePath = home.pathname.replace(/\/+$/, "") || "/";
  // A listing source whose URL *is* the site root cannot "bounce back to the
  // homepage" — home is where it was sent. Without this guard qbitai/36kr/
  // guancha all read as redirected-home by construction.
  const requestedPath = requestedUrl
    ? new URL(requestedUrl, homeUrl).pathname.replace(/\/+$/, "") || "/"
    : null;
  if (finalPath === homePath && requestedPath !== homePath) return "redirected-home";
  if (keywordHits !== null && keywordHits === 0) return "alive-no-keyword";
  // The page's own result count beats any inference from the surrounding chrome
  // (thepaper says 找到约0个结果 on a 200 page that still echoes the term).
  if (detectZeroResults(html)) return "alive-zero-results";
  return "alive";
}

/** Verdicts that mean "this source is fine" — no repair, no quarantine. */
export const HEALTHY_VERDICTS = new Set(["alive", "alive-off-site"]);

/**
 * Verdicts where the probe's answer is about the *probe*, not the source.
 * These must not feed the dead-source ledger: #285 already established this for
 * login-gated sources, and the WAF case is the same argument one layer up.
 * `probe-no-egress` is the third member (2026-09-23): no route to the host is a
 * statement about the measurement's network path, not about the endpoint.
 */
export const PROBE_UNAUTHORITATIVE_VERDICTS = new Set([
  "login-wall",
  "probe-not-authoritative",
  EGRESS_UNREACHABLE_VERDICT,
]);

/** True when the verdict means the source itself needs repair or quarantine. */
export function isFailureVerdict(verdict) {
  return !HEALTHY_VERDICTS.has(verdict) && !PROBE_UNAUTHORITATIVE_VERDICTS.has(verdict);
}

/** Every non-healthy verdict is worth a browser second opinion: a 404 can be a
 * JS-routed endpoint (xinhua), and a 403 can be a WAF (xinhua again, reddit). */
export function needsCdpSecondOpinion(verdict) {
  return !HEALTHY_VERDICTS.has(verdict);
}

/**
 * Label for "the page opens fine and even looks healthy, but the registry's own
 * `articleScript` extracts nothing" — the third health axis.
 *
 * The first two axes can both pass while the source is in fact dead: on
 * 2026-09-23 douyin's configured URL scored `alive-no-keyword` over bare HTTP
 * and `alive` in the browser (20 real result cards on screen), yet returned
 * **0 items** because the default tab renders cards with no `<a href>` at all.
 * URL-level health and extraction-level health are different facts, and only
 * the second one is what the pipeline consumes.
 */
export const EXTRACTION_EMPTY_LABEL = "url-alive-but-extraction-empty";

/**
 * Should the discovery pass drive the site's own search box?
 *
 * Three axes, one gate. A URL that resolves is not a URL that yields items, so
 * the search box is worth driving both when the configured URL is unhealthy
 * **and** when it is healthy but extracts nothing — otherwise a source can sit
 * in the "healthy" column while producing zero rows forever (douyin).
 *
 * `extracted === null` means "not measured" (no articleScript, or the script
 * threw) and must not by itself trigger a drive: absence of a measurement is
 * not evidence of an empty extraction.
 *
 * @param {{ verdict: string, extracted?: number|null, keyword?: string|null }} probe
 */
export function needsSearchBoxDrive({ verdict, extracted = null, keyword = null } = {}) {
  if (!keyword) return false;
  if (extracted === 0) return true;
  // Items in hand end the question. Axis 1/2 verdicts are proxies ("is this URL
  // a result page?"); extraction is the contract the pipeline actually runs, and
  // a source that satisfies it has nothing to repair. Measured 2026-09-23,
  // guancha: axis 2 read `probe-not-authoritative` off a block phrase in the page
  // text while the source's own script pulled 230 items from the same page —
  // driving a search box there would have been pure noise.
  if (extracted !== null && extracted > 0) return false;
  return !HEALTHY_VERDICTS.has(verdict);
}

/**
 * Which health label does a (verdict, extraction) pair actually earn?
 *
 * Axis 3 outranks axes 1 and 2 when they disagree, and not because extraction is
 * more precise — because the other two answer a *proxy* question ("does this URL
 * look like a result page?") while extraction answers the one the pipeline asks.
 * A block page cannot satisfy a source's extraction contract, so items in hand
 * are proof that a "blocked" reading was wrong.
 *
 * The disagreement is labelled rather than flattened: `extracts-despite-verdict`
 * keeps it visible that axis 2 said something else, so a reader can go look
 * instead of trusting a silent override.
 *
 * @param {{ verdict: string, extracted?: number|null }} probe
 * @returns {string}
 */
export function resolveHealth({ verdict, extracted = null } = {}) {
  if (extracted !== null && extracted > 0) {
    return HEALTHY_VERDICTS.has(verdict) ? "healthy-in-browser" : "extracts-despite-verdict";
  }
  if (extracted === 0) {
    // Healthy URL, nothing extracted — the douyin shape. The fix is not a
    // different URL for the probe, it is a different URL for the *extraction*.
    return HEALTHY_VERDICTS.has(verdict) ? EXTRACTION_EMPTY_LABEL : "still-broken";
  }
  // Not measured: fall back to what the browser said. `probe-not-authoritative`
  // means the block is real and no rewrite of the URL will help (reddit).
  if (HEALTHY_VERDICTS.has(verdict)) return "healthy-in-browser";
  if (PROBE_UNAUTHORITATIVE_VERDICTS.has(verdict)) return "blocked-in-browser-too";
  return "still-broken";
}

/**
 * "200 + the keyword appears" is necessary but NOT sufficient: a site's error
 * template echoes the query too (xinhua `www.news.cn/search?q=…` returns a
 * 200 error page that contains the keyword), and #269 Phase 1 already showed
 * what happens when a non-results page is harvested as results. A candidate
 * must also carry result-shaped links.
 */
export function looksLikeResults(html, minLinks = 3) {
  if (!html) return false;
  if (/ErrorPageTemplate|<title>\s*(40[0-9]|50[0-9])\b|403 Forbidden|404 Not Found/i.test(html))
    return false;
  let n = 0;
  for (const m of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi,
  )) {
    const href = m[1] || "";
    const text = (m[2] || "").replace(/<[^>]*>/g, "").trim();
    if (text.length < 8) continue;
    if (/^#|^javascript:|^\/(login|signin|passport)/i.test(href)) continue;
    n += 1;
    if (n >= minLinks) return true;
  }
  return false;
}

const SEARCH_PARAM_NAMES =
  /^(q|s|word|words|wd|kw|keyword|keywords|query|search|searchword|searchkey|key|text|title)$/i;

/** Search forms declared in static HTML: `<form action> + <input name>`.
 * Returns candidate URLs with the keyword already substituted. */
export function extractSearchForms(html, baseUrl, keyword) {
  const out = [];
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) || [];
  for (const form of forms) {
    if (/method\s*=\s*["']?post/i.test(form)) continue;
    const action = (/<form\b[^>]*\baction\s*=\s*["']([^"']*)["']/i.exec(form) || [])[1] ?? "";
    const names = [...form.matchAll(/<input\b[^>]*>/gi)]
      .map((m) => m[0])
      .map((tag) => ({
        name: (/\bname\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || "",
        type: (/\btype\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || "text",
        value: (/\bvalue\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || "",
      }))
      .filter((i) => i.name && !/^(submit|button|hidden|checkbox|radio|image|file)$/i.test(i.type));
    const param = names.find((i) => SEARCH_PARAM_NAMES.test(i.name));
    if (!param) continue;
    // A value attribute often carries the placeholder ("请输入关键词"); the
    // keyword must replace it, not append to it.
    const url = withParam(resolveUrl(action || baseUrl, baseUrl), param.name, keyword);
    if (url) out.push({ url, param: param.name, source: "form", action });
  }
  return dedupeByUrl(out);
}

/** Homepage links that look like a search entry (`/search`, `/so`, `/s?`, or
 * anchor text 搜索/Search). Used when the site renders its form via JS. */
export function extractSearchLinks(html, baseUrl) {
  const out = [];
  for (const m of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi,
  )) {
    const href = m[1];
    const text = m[2].replace(/<[^>]*>/g, "").trim();
    // Anchor text alone is not evidence — an article titled "…AI搜索内容" also
    // contains 搜索. The href must itself look like a search endpoint.
    const isSearchHref =
      /(\/(search|sousuo|searchresult)(\.[\w]+)?($|[/?]))|(\/so($|[/?]))|([?&](q|word|keyword|wd)=)/i.test(
        href,
      );
    if (!isSearchHref) continue;
    const abs = resolveUrl(href, baseUrl);
    if (abs) out.push({ url: abs, source: "link", text });
  }
  return dedupeByUrl(out).slice(0, 6);
}

/** Known search-path templates. Deliberately small: a template guess is only
 * evidence when the probe comes back 200 *and* the keyword appears in the
 * body, so extra guesses cost one request each and nothing more. */
export const KNOWN_SEARCH_TEMPLATES = [
  "/search?q={kw}",
  "/search?keyword={kw}",
  "/search?word={kw}",
  "/search?keywords={kw}",
  "/search/{kw}",
  "/s?q={kw}",
  "/s?wd={kw}",
  "/so?q={kw}",
  "/search.html?q={kw}",
];

export function buildTemplateCandidates(baseUrl, keyword) {
  const origin = safeOrigin(baseUrl);
  if (!origin) return [];
  return KNOWN_SEARCH_TEMPLATES.map((tpl) => ({
    url: origin + tpl.replace("{kw}", encodeURIComponent(keyword)),
    source: "template",
    template: tpl,
  }));
}

/** RSS/Atom alternates declared in HTML + the usual feed paths. */
export function extractRssLinks(html, baseUrl) {
  const out = [];
  const re = /<link\b[^>]*rel\s*=\s*["']alternate["'][^>]*>/gi;
  for (const tag of html.match(re) || []) {
    if (!/application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = (/href\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    const title = (/title\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || "";
    const abs = resolveUrl(href, baseUrl);
    if (abs) out.push({ url: abs, source: "rss-link", title });
  }
  const origin = safeOrigin(baseUrl);
  if (origin) {
    for (const p of ["/rss", "/rss.xml", "/feed", "/feed.xml", "/atom.xml", "/rss/all.xml"]) {
      out.push({ url: origin + p, source: "rss-guess" });
    }
  }
  return dedupeByUrl(out);
}

/** Feed shape probe: item count and newest pubDate. Enough to judge whether a
 * feed can carry a source (count > 0 and dated within the window we care
 * about) without committing to a parser. */
export function inspectFeed(text) {
  const items = (text.match(/<item\b/gi) || []).length || (text.match(/<entry\b/gi) || []).length;
  const dates = [...text.matchAll(/<(?:pubDate|published|updated|dc:date)>([^<]{4,40})</gi)]
    .map((m) => Date.parse(m[1]))
    .filter((n) => Number.isFinite(n));
  const titles = [...text.matchAll(/<title>([\s\S]{2,120}?)<\/title>/gi)]
    .map((m) => m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim())
    .filter(Boolean);
  return {
    itemCount: items,
    newest: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    oldest: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    sampleTitles: titles.slice(1, 4),
  };
}

/** Full discovery ladder for one homepage: what to try next, cheapest first. */
export function deriveCandidates(html, baseUrl, keyword) {
  return [
    ...extractSearchForms(html, baseUrl, keyword),
    ...extractSearchLinks(html, baseUrl),
    ...buildTemplateCandidates(baseUrl, keyword),
  ];
}

// ─── in-page search-box discovery (methodology step 5) ───
//
// Static HTML cannot see a JS-rendered search box, and the template table is
// only a guess list. The authoritative source of "what is the real search URL"
// is the site's own search UI: put the term in its box, submit, and read the
// address bar. These builders return the CDP scripts that do that; they are
// pure string builders so tests can lock the selector list.

/** Knows-name list, kept exported so tests can lock it. Selection itself is
 * score-based (see `boxScoringPrelude`) because a pure first-match selector walk
 * is wrong on component-library SPAs. */
export const SEARCH_BOX_SELECTORS = [
  'input[type="search"]',
  'form[role="search"] input',
  'input[name="q"]',
  'input[name="wd"]',
  'input[name="word"]',
  'input[name="kw"]',
  'input[name="keyword"]',
  'input[name="keywords"]',
  'input[name="query"]',
  'input[name="searchword"]',
  'input[name="search_keyword"]',
  'input[name="key"]',
  'input[name="text"]',
  'input[placeholder*="搜索"]',
  'input[placeholder*="Search" i]',
  'input[aria-label*="搜索"]',
  'input[aria-label*="Search" i]',
  '[class*="search"] input[type="text"]',
  "#search input",
  "#searchInput",
];

/**
 * Shared in-page scoring, injected into both scripts so the box that gets
 * *reported* is the box that gets *driven*.
 *
 * The `input[type=search]` trap: on Ant-Design sites that element is a
 * `<Select>`'s hidden filter input (`ant-select-selection-search-input`), not
 * the site search box — submitting it does nothing. so.news.cn cost a wasted
 * diagnostic round to that on 2026-09-22, hence the explicit combobox penalty.
 */
function boxScoringPrelude() {
  const names =
    "/^(q|s|word|words|wd|kw|keyword|keywords|query|search|searchword|searchkey|key|text|title)$/i";
  const combobox =
    '\'.ant-select, [role="combobox"], [class*=combobox], [class*=el-select], [class*=select2], [aria-haspopup="listbox"]\'';
  return `
  var SEARCH_NAMES = ${names};
  var COMBOBOX_SCOPE = ${combobox};
  function boxScore(el) {
    if (!el || el.disabled || el.readOnly) return -99;
    var t = (el.type || 'text').toLowerCase();
    if (t !== 'text' && t !== 'search') return -99;
    var r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 8) return -99;
    var s = 0;
    if (el.name && SEARCH_NAMES.test(el.name)) s += 4;
    if (/搜索|search/i.test(el.placeholder || '')) s += 3;
    if (/搜索|search/i.test(el.getAttribute('aria-label') || '')) s += 2;
    if (/search|sousuo|query|ss-|top-search/i.test((el.id || '') + ' ' + (el.className || ''))) s += 2;
    if (t === 'search') s += 1;
    if (r.width > 120) s += 1;
    if (el.closest('[class*=search], [id*=search]')) s += 2;
    if (el.closest(COMBOBOX_SCOPE) || el.getAttribute('aria-autocomplete') === 'list') s -= 8;
    // The site-search box is normally alone in its form, while an *advanced*
    // search panel (xinhua's AdvancedSearchForm_a_keyWordAll) packs many
    // fields and steals the name/id hints. Prefer the lonely box.
    var f = el.closest('form');
    if (f) {
      var n = f.querySelectorAll('input').length;
      if (n > 2) s -= 3 * Math.min(n - 1, 3);
    }
    return s;
  }
  function rankBoxes() {
    var all = [].slice.call(document.querySelectorAll('input'));
    var scored = [];
    for (var i = 0; i < all.length; i++) {
      var sc = boxScore(all[i]);
      if (sc > 0) scored.push({ el: all[i], score: sc });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored;
  }
  function submitBox(el) {
    var btns = [].slice.call(document.querySelectorAll('button, input[type=submit], [role=button]'));
    var best = null, bestScore = 0;
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var txt = ((b.innerText || b.value || '') + '').replace(/\\s+/g, '').trim();
      var hay = (b.className || '') + ' ' + (b.id || '');
      var sc = 0;
      if (/^(搜索|search|go|查询)$/i.test(txt)) sc += 4;
      else if (/搜索|search/i.test(txt)) sc += 2;
      if (/search|sousuo/i.test(hay)) sc += 2;
      if (!sc) continue;
      var r = b.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (sc > bestScore) { bestScore = sc; best = b; }
    }
    if (best) { best.click(); return 'button:' + ((best.innerText || best.value || '').trim().slice(0, 8)); }
    var f = el.closest('form');
    if (f) { if (f.requestSubmit) f.requestSubmit(); else f.submit(); return 'form-submit'; }
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return 'synthetic-enter';
  }`;
}

/** Report which box would be driven, and why. Returns JSON; never throws. */
export function buildFindSearchBoxScript() {
  return `(function () {${boxScoringPrelude()}
  var ranked = rankBoxes();
  if (!ranked.length) return JSON.stringify({ found: false, candidates: 0 });
  var el = ranked[0].el;
  return JSON.stringify({
    found: true,
    score: ranked[0].score,
    candidates: ranked.length,
    name: el.name || '', id: el.id || '', type: el.type || '',
    placeholder: el.placeholder || '', inForm: !!el.closest('form'),
    runnerUp: ranked.length > 1 ? { name: ranked[1].el.name || '', id: ranked[1].el.id || '', score: ranked[1].score } : null
  });
})()`;
}

/** Fill the best-scoring box and submit it the way a human would: click the
 * search button when one is identifiable, else submit the form, else Enter.
 * `rank` picks which of the ranked boxes to drive — a page can carry both the
 * simple site-search box and an advanced-search panel, and only one of them may
 * route to a keyword-bearing URL. */
export function buildSubmitSearchScript(keyword, rank = 0) {
  const kw = JSON.stringify(String(keyword));
  return `(function () {
  var SETTER = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  function setValue(el, v) {
    // React/Vue keep their own copy of the value and ignore a direct
    // assignment: writing el.value updates the DOM but not the component
    // state, so the submit handler reads an empty box and nothing happens.
    // Going through the prototype setter makes the framework's onChange fire.
    // so.news.cn (Ant Design) needs this; so do most React sites.
    if (SETTER && SETTER.set) SETTER.set.call(el, v); else el.value = v;
  }${boxScoringPrelude()}
  var ranked = rankBoxes();
  if (!ranked.length) return 'no-box';
  var pick = ranked[${Number(rank) || 0}];
  if (!pick) return 'no-box-at-rank';
  var el = pick.el;
  var before = location.href;
  el.focus();
  setValue(el, ${kw});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  var via = submitBox(el);
  return 'submitted-via-' + via + '-from:' + before;
})()`;
}

/** Page snapshot used to judge a CDP landing: where we are, whether a login
 * gate or block page is showing, and how many result-shaped links exist.
 * `status` comes from `PerformanceNavigationTiming.responseStatus` — the CDP
 * client has no status channel, and without it a WAF 403 and a real 200 are
 * indistinguishable from the DOM alone.
 *
 * `keywordHits` is counted in-page so the CDP verdict can reuse `classifyProbe`
 * verbatim instead of inventing a second relevance rule. */
export function buildSnapshotScript(keyword = "") {
  const kw = JSON.stringify(String(keyword || ""));
  const zeroPatterns = JSON.stringify(ZERO_RESULTS_PATTERNS);
  return `JSON.stringify((function () {
  var links = [].slice.call(document.querySelectorAll('a[href]'));
  var dated = links.filter(function (a) { return /\\/20\\d\\d[-\\/]/.test(a.getAttribute('href') || ''); });
  var text = document.body ? document.body.innerText : '';
  var nav = performance.getEntriesByType('navigation')[0];
  var kw = ${kw};
  var ZERO = ${zeroPatterns};
  var hits = 0;
  if (kw) {
    if (/^[\\x00-\\x7F]+$/.test(kw)) {
      var esc = kw.replace(/[-[\\]{}()*+?.,\\\\^$|#\\s]/g, '\\\\$&');
      hits = (text.match(new RegExp('(?<![A-Za-z0-9])' + esc + '(?![A-Za-z0-9])', 'gi')) || []).length;
    } else {
      var i = text.indexOf(kw);
      while (i !== -1) { hits += 1; i = text.indexOf(kw, i + kw.length); }
    }
  }
  return {
    url: location.href,
    status: nav && nav.responseStatus ? nav.responseStatus : null,
    title: document.title,
    textLength: text.length,
    anchorCount: links.length,
    datedLinkCount: dated.length,
    keywordHits: hits,
    zeroResults: ZERO.some(function (p) { return new RegExp(p, 'i').test(text); }),
    sampleTitles: links.slice(0, 40).map(function (a) { return a.innerText.trim(); })
      .filter(function (t) { return t.length > 7; }).slice(0, 5),
    loginHint: /登录以查看搜索结果|请先登录|登录后查看|需要登录后|Sign in to (?:continue|view)|You must be logged in/i.test(text),
    blockHint: /安全验证|安全检测|异常流量|请求过于频繁|访问频率|访问过于频繁|verify you are human|Verifying you are human|Checking your browser|Access Denied|blocked by network security/i.test(text),
    bodyHead: text.slice(0, 160).replace(/\\s+/g, ' ')
  };
})())`;
}

/**
 * Turn the URL the site's own search box landed on into a `{kw}` template.
 *
 * This is the piece the user asked for: instead of guessing
 * `/search?word={kw}` and reading the 404 as "the source is dead", drive the
 * real search UI and read back the truth (ithome:
 * `/search/{kw}.html` — path segment, `.html` suffix, no query param at all).
 *
 * Returns `null` when the landed page cannot carry the term (site root, login
 * page, or a search that navigated nowhere).
 */
export function templateFromLandedUrl(landedUrl, keyword, { dropVolatile = true } = {}) {
  if (!landedUrl || !keyword) return null;
  let u;
  try {
    u = new URL(landedUrl);
  } catch {
    return null;
  }
  if (detectLoginWall({ finalUrl: landedUrl })) return null;
  const forms = [String(keyword), encodeURIComponent(keyword)].filter(
    (f, i, a) => a.indexOf(f) === i,
  );
  const hash = u.hash || "";
  const { search: stableSearch, dropped } = dropVolatile
    ? stripVolatileParams(u.search)
    : { search: u.search, dropped: [] };
  for (const f of forms) {
    if (u.search.includes(f)) {
      const param =
        [...u.searchParams.keys()].find((k) => {
          const v = u.searchParams.get(k) || "";
          return v.includes(f) || v === keyword;
        }) ?? null;
      // The keyword pair is never volatile, but a site could name it something
      // that trips the name heuristic; if stripping lost the term, the stripped
      // form is not a template at all. Fall back rather than emit a URL with no
      // keyword in it.
      const keptSearch = stableSearch.includes(f) ? stableSearch : u.search;
      return {
        template: u.origin + u.pathname + keptSearch.replace(f, "{kw}") + hash,
        templateVerbatim: u.origin + u.pathname + u.search.replace(f, "{kw}") + hash,
        param,
        shape: "query",
        droppedParams: keptSearch === u.search ? [] : dropped,
      };
    }
    if (hash.includes(f)) {
      return {
        template: u.origin + u.pathname + stableSearch + hash.replace(f, "{kw}"),
        templateVerbatim: u.origin + u.pathname + u.search + hash.replace(f, "{kw}"),
        param: null,
        shape: "hash",
        droppedParams: dropped,
      };
    }
    if (u.pathname.includes(f)) {
      return {
        template: u.origin + u.pathname.replace(f, "{kw}") + stableSearch + hash,
        templateVerbatim: u.origin + u.pathname.replace(f, "{kw}") + u.search + hash,
        param: null,
        shape: "path",
        droppedParams: dropped,
      };
    }
  }
  return null;
}

/**
 * Params that must not be frozen into a registry template.
 *
 * Driving the search box hands back the address bar **verbatim**, and the address
 * bar carries session furniture. Measured 2026-09-23, douyin's own landing page:
 *
 *     /jingxuan/search/人工智能?aid=e5019d6d-8cc1-4251-b58f-176f8eb02438&type=general
 *
 * `aid` is regenerated per visit; `type=general` is what decides which tab
 * renders. Freezing the whole string into `url: (keyword) => …` would ship a
 * template that was true for one second, and the very next run would look like a
 * fresh break — the repair would have to be redone, and the ledger would blame
 * the source.
 *
 * Two independent signals, because either alone is wrong:
 *   · **name** — the param announces itself as an identifier for *this*
 *     client/session (`aid`, `spm`, `uuid`, `_t`, …);
 *   · **shape** — the value is a generated token (uuid, long hex, long
 *     opaque string) whatever it is called.
 * A param that merely looks functional (`type=video`, `v=2`, `page=3`) trips
 * neither. Neither signal is a proof, so the derived template is **always**
 * verified by re-running the source's own `articleScript` before it is usable —
 * that check, not this heuristic, is what makes the repair safe.
 */
export const VOLATILE_PARAM_NAMES = new Set([
  "aid",
  "sid",
  "sessionid",
  "session_id",
  "traceid",
  "trace_id",
  "requestid",
  "request_id",
  "reqid",
  "spm",
  "from_spmid",
  "uuid",
  "guid",
  "nonce",
  "ts",
  "timestamp",
  "_ts",
  "t",
  "_",
  "cb",
  "callback",
  "token",
  "csrf",
  "csrf_token",
  "xsrf",
  "rand",
  "random",
  "r",
  "_r",
  "scm",
  "buvid",
  "msource",
  "ttwid",
  "referer",
  "ref",
]);

const UUID_VALUE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_VALUE_RE = /^[0-9a-f]{16,}$/i;
const LONG_OPAQUE_VALUE_RE = /^[A-Za-z0-9_-]{24,}$/;

/**
 * True when a query param looks like session furniture rather than page state.
 * `null`/empty values are kept: an empty param is usually a real switch
 * (`?tab=`), and dropping it changes the page.
 *
 * @param {string} name
 * @param {string} value
 * @returns {boolean}
 */
export function isVolatileParam(name, value) {
  if (VOLATILE_PARAM_NAMES.has(String(name).toLowerCase())) return true;
  const v = String(value ?? "");
  if (!v) return false;
  return UUID_VALUE_RE.test(v) || LONG_HEX_VALUE_RE.test(v) || LONG_OPAQUE_VALUE_RE.test(v);
}

/**
 * Remove volatile pairs from a raw query string.
 *
 * Works on the **raw** `k=v` pairs rather than round-tripping through
 * `URLSearchParams`: re-serializing would re-encode every value (a `+` becomes
 * `%20`, a nested `%2F` becomes `%2F` again) and change parts of the URL that
 * had nothing to do with volatility.
 *
 * @param {string} search - raw search string, with or without the leading `?`
 * @returns {{search: string, dropped: string[]}}
 */
export function stripVolatileParams(search) {
  const raw = String(search || "").replace(/^\?/, "");
  if (!raw) return { search: "", dropped: [] };
  const kept = [];
  const dropped = [];
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawVal = eq >= 0 ? pair.slice(eq + 1) : "";
    let key = rawKey;
    let val = rawVal;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " "));
    } catch {
      /* keep the raw form when it is not valid percent-encoding */
    }
    try {
      val = decodeURIComponent(rawVal.replace(/\+/g, " "));
    } catch {
      /* same */
    }
    if (isVolatileParam(key, val)) dropped.push(key);
    else kept.push(pair);
  }
  return { search: kept.length > 0 ? `?${kept.join("&")}` : "", dropped };
}

/**
 * Render a recovered template as the registry line a repair should paste.
 *
 * The repair used to end at a JSON blob, which left the last mile — turning
 * `…/{kw}?type=video` into `url: (keyword) => \`…\`` — to whoever read it. That
 * mile is exactly where a hand-typed template loses the one param that mattered
 * (douyin's `?type=video`). Emitting the literal line removes the transcription
 * step entirely.
 *
 * @param {string} template - template with a `{kw}` placeholder
 * @returns {string|null}
 */
export function registryUrlLine(template) {
  if (!template || !template.includes("{kw}")) return null;
  const literal = template.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  return `url: (keyword) => \`${literal.replace("{kw}", "${encodeURIComponent(keyword)}")}\`,`;
}

/**
 * Read the destination out of a login redirect.
 *
 * A gated site still tells us which URL it *would* have served — ithome's
 * redirect carries `?url=https%3a%2f%2fwww.ithome.com%2fsearch%2f%25e4%25ba…html`,
 * the target percent-encoded twice. That turns "we cannot see the search URL
 * because of the login gate" into "the search URL is `/search/{kw}.html`, and
 * anonymous visitors are gated" — two different facts, and only the second one
 * is about auth.
 */
export function loginRedirectTarget(landedUrl) {
  if (!landedUrl) return null;
  let u;
  try {
    u = new URL(landedUrl);
  } catch {
    return null;
  }
  const raw =
    u.searchParams.get("url") ||
    u.searchParams.get("redirect") ||
    u.searchParams.get("redirectUrl") ||
    u.searchParams.get("next") ||
    u.searchParams.get("returnUrl");
  if (!raw) return null;
  // `searchParams.get` already decodes one layer; the parameter often carries a
  // second encoded layer of its own.
  let decoded = raw;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  try {
    const target = new URL(decoded);
    return /^https?:$/.test(target.protocol) ? target.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Home pages worth driving a search box on, in order.
 *
 * The configured URL's own origin is the obvious first choice, but the search
 * UI is frequently on a sibling subdomain: xinhua's registry URL lives on
 * `www.news.cn` while its real search page is `so.news.cn`. Guessing is fine
 * here because a guess is only *accepted* when the template it produces verifies
 * as healthy — an unverified guess is reported, never written to the registry.
 */
export function homeCandidates(probedUrl) {
  const out = [];
  const origin = safeOrigin(probedUrl);
  if (origin) out.push(origin + "/");
  try {
    const u = new URL(probedUrl);
    const bare = u.host.replace(/^www\./, "");
    if (bare !== u.host) out.push(`${u.protocol}//so.${bare}/`);
  } catch {
    /* unparseable — keep the origin candidate */
  }
  try {
    const u = new URL(probedUrl);
    const bare = u.host.replace(/^www\./, "");
    if (bare !== u.host) out.push(`${u.protocol}//search.${bare}/`);
  } catch {
    /* ignore */
  }
  return [...new Set(out)];
}

// ─── helpers ───

function withParam(rawUrl, name, value) {
  try {
    const u = new URL(rawUrl);
    u.searchParams.set(name, value);
    return u.toString();
  } catch {
    return null;
  }
}

function resolveUrl(href, baseUrl) {
  if (!href) return null;
  try {
    const u = new URL(href, baseUrl);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function safeOrigin(baseUrl) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

function dedupeByUrl(list) {
  const seen = new Set();
  return list.filter((item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
