/**
 * URL Normalizer — Canonical URL for dedup and adapter selection.
 *
 * @module url-normalizer
 */

/**
 * Canonicalize a URL for deduplication and adapter routing.
 *
 * Sync (no network):
 * - Normalize http:// → https://
 * - Strip query string and fragment (fragment always; query unless keepQuery)
 * - Normalize trailing slash (except root path)
 * - Lowercase hostname
 *
 * `keepQuery` exists for URLs whose query is part of the address, not
 * tracking: xhs note links carry `xsec_token` and the downloader needs it
 * (#314). Everything else about the canonical form still applies.
 *
 * @param {string|null|undefined} url
 * @param {{ keepQuery?: boolean }} [options]
 * @returns {string} Canonical URL, or "" for null/undefined/empty input
 */
export function canonicalizeUrl(url, options = {}) {
  const keepQuery = options.keepQuery === true;
  if (!url || typeof url !== "string" || url.trim() === "") {
    return "";
  }

  // Handle non-URL strings gracefully — return as-is
  if (!url.includes("://") && !url.startsWith("//")) {
    return url.trim();
  }

  let result = url.trim();

  // Normalize protocol: http:// → https://
  if (result.startsWith("http://")) {
    result = "https://" + result.slice(7);
  }

  // Ensure https:// for protocol-relative URLs
  if (result.startsWith("//")) {
    result = "https:" + result;
  }

  // Split into parts: protocol, rest
  const protoEnd = result.indexOf("://");
  const protocol = result.slice(0, protoEnd);
  let rest = result.slice(protoEnd + 3);

  // Find first slash (end of host:port)
  const firstSlash = rest.indexOf("/");
  let host = firstSlash === -1 ? rest : rest.slice(0, firstSlash);
  let path = firstSlash === -1 ? "" : rest.slice(firstSlash);

  // Lowercase hostname (keep port case as-is — but port is numeric anyway)
  host = host.toLowerCase();

  // Strip the fragment always; keep the query only when asked. Fragment first:
  // a `#` there ends the address, so a `?` after it is not a query.
  const fragIdx = path.indexOf("#");
  if (fragIdx !== -1) path = path.slice(0, fragIdx);
  let query = "";
  const queryIdx = path.indexOf("?");
  if (queryIdx !== -1) {
    if (keepQuery) query = path.slice(queryIdx);
    path = path.slice(0, queryIdx);
  }

  // Normalize trailing slash (except root path "/")
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  // Reconstruct
  if (path === "") {
    return `${protocol}://${host}/${query}`;
  }
  return `${protocol}://${host}${path}${query}`;
}
