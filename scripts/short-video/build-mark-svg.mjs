/**
 * Build the video-grade brand mark from the source SVG (spec D5).
 *
 * Source:  assets/china-ai-news-mark.svg  (VTracer vectorization, 648×420)
 * Output:  assets/china-ai-news-mark-video.svg
 *
 * Two defects in the source make the mark INVISIBLE in rendered videos:
 *   1. It has explicit width/height but NO viewBox — CSS scaling then becomes
 *      cropping (the container only ever shows the top-left blank slice).
 *   2. Fills are the trace's dark blues (#0000xx) and pure red — nearly
 *      invisible on the #050508 video background.
 *
 * This script injects a viewBox (derived from the width/height attributes)
 * and maps the fills to the brand palette: blue-family → brand blue
 * #4d8bff, red-family → brand red #ef4444. The source asset is never
 * modified; the output is idempotent (rebuilding yields identical bytes).
 *
 * Run:  node scripts/short-video/build-mark-svg.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";

/** Dispatch Blue — brand accent on dark video surfaces. */
export const BRAND_BLUE = "#4d8bff";
/** Brand red — matches the video semantic red (#ef4444). */
export const BRAND_RED = "#ef4444";

const FILL_RE = /fill="(#[0-9A-Fa-f]{6})"/g;
const SVG_TAG_RE = /<svg([^>]*)>/;
const WIDTH_RE = /width="([\d.]+)"/;
const HEIGHT_RE = /height="([\d.]+)"/;
const DECL_RE = /<\?xml[^>]*\?>\s*/;
const COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * Map a source fill to the brand palette (or null to keep it untouched).
 * Red-family: r > b (covers #FF0000 and dark purple-red #770046).
 * Blue-family: b dominates r and g (covers #0000xx, #0300F3, #000073…).
 */
function mapFill(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (r > b) return BRAND_RED;
  if (b > r && b >= g) return BRAND_BLUE;
  return null;
}

/**
 * Replace out-of-palette fills. Returns the remapped SVG and a record of
 * replacements (source hex → brand hex).
 * @param {string} svg
 * @returns {{svg: string, replacements: Object<string,string>}}
 */
export function remapFills(svg) {
  const replacements = {};
  const out = svg.replace(FILL_RE, (match, hex) => {
    const upper = hex.toUpperCase();
    const brand = mapFill(upper);
    if (!brand) return match;
    replacements[upper] = brand;
    return `fill="${brand}"`;
  });
  return { svg: out, replacements };
}

/**
 * Add a viewBox (derived from width/height) when missing.
 * @param {string} svg
 * @returns {string}
 */
export function injectViewBox(svg) {
  if (/<svg[^>]*viewBox=/i.test(svg)) return svg;
  const width = WIDTH_RE.exec(svg)?.[1] ?? "648";
  const height = HEIGHT_RE.exec(svg)?.[1] ?? "420";
  return svg.replace(SVG_TAG_RE, `<svg$1 viewBox="0 0 ${width} ${height}">`);
}

/**
 * Build the video mark asset: clean declarations/comments → viewBox →
 * brand fills. Never reads or writes the source path.
 * @param {URL|string} sourcePath
 * @param {URL|string} outputPath
 * @returns {{output: string, replacements: Object<string,string>}}
 */
export function buildMarkSvg(sourcePath, outputPath) {
  const source = readFileSync(sourcePath, "utf8");
  const cleaned = source.replace(DECL_RE, "").replace(COMMENT_RE, "");
  const withViewBox = injectViewBox(cleaned);
  const { svg, replacements } = remapFills(withViewBox);
  writeFileSync(outputPath, svg, "utf8");
  return { output: svg, replacements };
}

// CLI entry: node scripts/short-video/build-mark-svg.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = new URL("./assets/china-ai-news-mark.svg", import.meta.url);
  const output = new URL("./assets/china-ai-news-mark-video.svg", import.meta.url);
  const { replacements } = buildMarkSvg(source, output);
  console.log("✅ mark-video.svg built");
  for (const [from, to] of Object.entries(replacements)) {
    console.log(`   ${from} → ${to}`);
  }
}
