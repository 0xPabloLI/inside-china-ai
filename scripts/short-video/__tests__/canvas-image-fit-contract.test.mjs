/**
 * CanvasImage fit contract — brand marks must not be stretched.
 *
 * Why this exists (2026-10-14): <CanvasImage> paints a <canvas> whose backing
 * store is the artwork's NATURAL pixel size (see remotion's
 * canvas-image/CanvasImage.js: `canvasWidth = width ?? loadedImage.width`), then
 * the CSS box scales that canvas. A <canvas> is a replaced element and defaults
 * to `object-fit: fill`, so a square box squashed the 648×420 brand mark and the
 * 195×41 DeepSeek wordmark — visible in the delivered video as distorted logos.
 *
 * MediaBackground is unaffected because it sets `objectFit` in mediaStyle; the
 * logo sites simply omitted it. This test keeps a future logo site from doing
 * the same: any <CanvasImage> bound to a static asset must declare its fit.
 *
 * Revised 2026-10-25 — the "MediaBackground is unaffected" note above was
 * WRONG, and this file was pinning the bug. `objectFit` in mediaStyle does
 * reach <CanvasImage>/<Img> (plain DOM elements), but @remotion/media's
 * <Video> takes it as a PROP and ignores the style form, defaulting to
 * `contain`. So the video branch letterboxed every scene while the image
 * branch honoured `fit`, and this test asserted the style pattern as if it
 * covered both. The last case now pins the correct split.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REMOTION_SRC = join(HERE, "..", "remotion", "src");

/** Every .tsx under remotion/src, recursively. */
function tsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** `<CanvasImage …/>` blocks in a source file (first `/>` after the tag opens). */
function canvasImageBlocks(source) {
  const blocks = [];
  let at = source.indexOf("<CanvasImage");
  while (at !== -1) {
    const end = source.indexOf("/>", at);
    if (end === -1) break;
    blocks.push(source.slice(at, end + 2));
    at = source.indexOf("<CanvasImage", end);
  }
  return blocks;
}

describe("CanvasImage fit contract", () => {
  const files = tsxFiles(REMOTION_SRC);

  it("scans the Remotion scene sources", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("every static-asset CanvasImage declares objectFit", () => {
    const offenders = [];
    for (const file of files) {
      for (const block of canvasImageBlocks(readFileSync(file, "utf8"))) {
        // Only static (brand/logo) assets: a dynamic `src={src}` (media) sets
        // its fit through mediaStyle instead.
        if (!block.includes("staticFile(")) continue;
        if (!/objectFit\s*:/.test(block)) {
          offenders.push(relative(REMOTION_SRC, file).replace(/\\/g, "/"));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("brand marks use contain, never fill or cover", () => {
    const offenders = [];
    for (const file of files) {
      for (const block of canvasImageBlocks(readFileSync(file, "utf8"))) {
        if (!block.includes("staticFile(")) continue;
        if (!/objectFit\s*:\s*"contain"/.test(block)) {
          offenders.push(relative(REMOTION_SRC, file).replace(/\\/g, "/"));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("media keeps its declared fit on BOTH branches: prop for <Video>, style for the DOM elements", () => {
    const media = readFileSync(join(REMOTION_SRC, "components", "MediaBackground.tsx"), "utf8");

    // One resolved fit value, defaulting to cover.
    expect(media).toMatch(/const fit\s*=\s*media\.fit\s*\?\?\s*"cover"/);

    // @remotion/media's <Video> only reads the PROP. A style-only declaration
    // silently renders `contain` — the 2026-10-25 letterbox bug.
    expect(media).toMatch(/objectFit=\{fit\}/);
    expect(media).toMatch(/objectFit="cover"/);

    // The style form must NOT come back for the video branches.
    expect(media).not.toMatch(/objectFit:\s*media\.fit/);

    // <CanvasImage>/<Img> are plain DOM, so they take the style form.
    expect(media).toMatch(/objectFit:\s*fit/);
  });
});
