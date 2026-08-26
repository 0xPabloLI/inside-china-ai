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
 * - Strip query string and fragment
 * - Normalize trailing slash (except root path)
 * - Lowercase hostname
 *
 * @param {string|null|undefined} url
 * @returns {string} Canonical URL, or "" for null/undefined/empty input
 */
export function canonicalizeUrl(url) {
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

  // Strip query string and fragment from path
  const queryIdx = path.indexOf("?");
  if (queryIdx !== -1) path = path.slice(0, queryIdx);
  const fragIdx = path.indexOf("#");
  if (fragIdx !== -1) path = path.slice(0, fragIdx);

  // Normalize trailing slash (except root path "/")
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  // Reconstruct
  if (path === "") {
    return `${protocol}://${host}/`;
  }
  return `${protocol}://${host}${path}`;
}
