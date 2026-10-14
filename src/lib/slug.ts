/**
 * Slugify a title into a URL-safe slug — lowercase, ASCII word chars and
 * hyphens only, single hyphens, no leading/trailing hyphen, capped at 80 chars.
 * Lives outside the component tree so the editor component keeps fast refresh.
 *
 * The edge trim is not cosmetic: the editor's slug field validates against
 * `[a-z0-9]+(?:-[a-z0-9]+)*`, which rejects "-hello-world-" and "-world", so
 * an untrimmed slug made titles like "-Hello World-" or "你好 World"
 * unsaveable (#319 OCR lib scan).
 */
export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
}
