const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const TARGET = "https://chinaai.news/";
const SITEMAPS = ["https://chinaai.news/sitemap.xml", "https://chinaai.news/news-sitemap.xml"];

type SiteEntry = { siteUrl: string; permissionLevel?: string };

function covers(siteUrl: string, target: URL) {
  if (siteUrl.startsWith("sc-domain:")) {
    const d = siteUrl.slice(10).toLowerCase();
    return target.hostname === d || target.hostname.endsWith(`.${d}`);
  }
  try {
    return target.href.startsWith(new URL(siteUrl).href);
  } catch {
    return false;
  }
}

/** Submit both sitemaps to Search Console and confirm Google recorded them. */
export async function submitSitemapsToGsc() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gscKey = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  if (!lovableKey || !gscKey) return { ok: false, error: "Search Console not linked" };
  const headers = { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gscKey };

  const res = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers });
  if (!res.ok) return { ok: false, error: `list sites [${res.status}]: ${await res.text()}` };
  const { siteEntry = [] } = (await res.json()) as { siteEntry?: SiteEntry[] };
  const target = new URL(TARGET);
  const matches = siteEntry.filter(
    (e) => e.permissionLevel !== "siteUnverifiedUser" && covers(e.siteUrl, target),
  );
  const site = matches.find((m) => m.siteUrl === TARGET) ?? matches[0];
  if (!site) return { ok: false, error: "No verified property covers chinaai.news" };

  const results = [];
  for (const sm of SITEMAPS) {
    const path = `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(site.siteUrl)}/sitemaps/${encodeURIComponent(sm)}`;
    const put = await fetch(path, { method: "PUT", headers });
    if (!put.ok) {
      results.push({ sitemap: sm, ok: false, error: `[${put.status}] ${await put.text()}` });
      if (put.status === 403 || put.status === 429) break;
      continue;
    }
    const get = await fetch(path, { headers });
    const status = get.ok
      ? ((await get.json()) as { lastSubmitted?: string; errors?: string; warnings?: string })
      : null;
    results.push({
      sitemap: sm,
      ok: !!status?.lastSubmitted,
      lastSubmitted: status?.lastSubmitted,
      errors: status?.errors,
      warnings: status?.warnings,
    });
  }
  return { ok: results.length === SITEMAPS.length && results.every((r) => r.ok), siteUrl: site.siteUrl, results };
}
