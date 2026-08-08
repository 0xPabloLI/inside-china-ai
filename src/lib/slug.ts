/**
 * Slugify a title into a URL-safe slug — lowercase, ASCII word chars and
 * hyphens only, single hyphens, capped at 80 chars.
 * Lives outside the component tree so the editor component keeps fast refresh.
 */
export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
