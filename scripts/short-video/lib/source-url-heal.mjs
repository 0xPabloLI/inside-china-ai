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

/** Occurrences of `keyword` in `text`. Latin keywords are matched
 * case-insensitively; CJK has no case, and `indexOf` is enough for a
 * presence/absence signal (we never need the positions). */
export function countKeywordHits(text, keyword) {
  if (!text || !keyword) return 0;
  const haystack = /[a-z]/i.test(keyword) && !/[^\x00-\x7F]/.test(keyword)
    ? text.toLowerCase()
    : text;
  const needle = haystack === text ? keyword : keyword.toLowerCase();
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * Classify one probe. `homeUrl` is the site root (origin + "/") used to
 * recognise "the search page silently bounced me to the homepage" — the exact
 * ithome failure mode from #269 Phase 1 (534 homepage links harvested as
 * "search results").
 */
export function classifyProbe({ status, finalUrl, homeUrl, keywordHits = 0, requestedUrl = null }) {
  if (status === null) return "network-error";
  if (status >= 400) return "http-dead";
  let final;
  let home;
  try {
    final = new URL(finalUrl);
    home = new URL(homeUrl);
  } catch {
    return "unknown";
  }
  if (final.host !== home.host) return "redirected-off-site";
  const finalPath = final.pathname.replace(/\/+$/, "") || "/";
  const homePath = home.pathname.replace(/\/+$/, "") || "/";
  // A listing source whose URL *is* the site root cannot "bounce back to the
  // homepage" — home is where it was sent. Without this guard qbitai/36kr/
  // guancha all read as redirected-home by construction.
  const requestedPath = requestedUrl ? new URL(requestedUrl, homeUrl).pathname.replace(/\/+$/, "") || "/" : null;
  if (finalPath === homePath && requestedPath !== homePath) return "redirected-home";
  // keywordHits === null means "no keyword in play" (listing/API sources whose
  // URL carries no query term) — the relevance gate does not apply to them.
  if (keywordHits !== null && keywordHits === 0) return "alive-no-keyword";
  return "alive";
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
  if (/ErrorPageTemplate|<title>\s*(40[0-9]|50[0-9])\b|403 Forbidden|404 Not Found/i.test(html)) return false;
  let n = 0;
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const href = m[1] || "";
    const text = (m[2] || "").replace(/<[^>]*>/g, "").trim();
    if (text.length < 8) continue;
    if (/^#|^javascript:|^\/(login|signin|passport)/i.test(href)) continue;
    n += 1;
    if (n >= minLinks) return true;
  }
  return false;
}

const SEARCH_PARAM_NAMES = /^(q|s|word|words|wd|kw|keyword|keywords|query|search|searchword|searchkey|key|text|title)$/i;

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
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)) {
    const href = m[1];
    const text = m[2].replace(/<[^>]*>/g, "").trim();
    // Anchor text alone is not evidence — an article titled "…AI搜索内容" also
    // contains 搜索. The href must itself look like a search endpoint.
    const isSearchHref = /(\/(search|sousuo|searchresult)(\.[\w]+)?($|[/?]))|(\/so($|[/?]))|([?&](q|word|keyword|wd)=)/i.test(href);
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
