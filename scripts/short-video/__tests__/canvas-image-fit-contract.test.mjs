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
 *
 * #952 added the class gate: every <Video> element in the tree, in any
 * component, must declare `objectFit` as a prop and must not declare it in
 * style. That is the "declared constant the runtime silently ignores" shape
 * generalised past the one instance — a new media site cannot reintroduce it.
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

/**
 * Self-closing `<tag …/>` blocks in a source file (first `/>` after the tag
 * opens), each with the index it starts at — the index is what lets
 * `styleObject` find the declaration that is actually in scope.
 *
 * Prose mentions (`the \`<Video>\` element`) are skipped by the caller's
 * `requiresAttribute` flag: a real element continues with whitespace after the
 * tag name, a mention continues with `>`.
 */
function jsxBlocks(source, tag, { requiresAttribute = false } = {}) {
  const blocks = [];
  let at = source.indexOf(`<${tag}`);
  while (at !== -1) {
    if (requiresAttribute && !/\s/.test(source[at + tag.length + 1] ?? "")) {
      at = source.indexOf(`<${tag}`, at + 1);
      continue;
    }
    const end = source.indexOf("/>", at);
    if (end === -1) break;
    blocks.push({ start: at, text: source.slice(at, end + 2) });
    at = source.indexOf(`<${tag}`, end);
  }
  return blocks;
}

/** `<CanvasImage …/>` blocks, prose-safe. */
const canvasImageBlocks = (source) =>
  jsxBlocks(source, "CanvasImage", { requiresAttribute: true }).map((b) => b.text);

/**
 * `<Video …/>` elements, prose-safe, INCLUDING spread-only sites
 * (`<Video {...props} />`) — those are the ones a `src=` filter would exempt,
 * and an exempted site is a site with no gate.
 */
const videoBlocks = (source) => jsxBlocks(source, "Video", { requiresAttribute: true });

/** The object literal starting at `open` (`{`), matched by brace depth. */
function objectAt(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  return null;
}

/**
 * The object literal behind `style={identifier}` / `style={{...identifier }}`
 * in an element block, or null. Resolving it is what closes the original bug
 * shape: `objectFit` lived in the shared `mediaStyle` const, not in the
 * element, so a scan that only reads the element text cannot see it.
 *
 * Resolution picks the LAST `const <name>` declared before the element — the
 * one in scope — and brace-matches the literal, so a same-named const earlier
 * in the file or a `}` followed by a newline cannot silently satisfy the gate.
 */
function styleObject(source, block) {
  const match = block.text.match(/style=\{\{\s*\.\.\.(\w+)/) ?? block.text.match(/style=\{(\w+)\}/);
  if (!match) return null;
  const name = match[1];
  const declarations = [
    ...source.matchAll(new RegExp(`const\\s+${name}\\b[^=]*=\\s*\\{`, "g")),
  ].filter((m) => m.index < block.start);
  if (declarations.length === 0) return null;
  const decl = declarations[declarations.length - 1];
  return objectAt(source, decl.index + decl[0].length - 1);
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

  // ─── The class gate (#952) ───
  // The 2026-10-25 letterbox bug was one instance of a broader shape: a
  // declared layout constant that the runtime ignores silently. For
  // @remotion/media's <Video> the trap is API-shaped — `objectFit` is a PROP
  // and the style form is discarded with a console warning nobody reads. This
  // scan covers every component, not just MediaBackground, so a new media
  // site (AvatarCard today, whatever comes next) cannot reintroduce it.
  //
  // Three shapes are covered, because each one defeated a narrower version:
  //   1. a missing prop             → <Video src={…} style={mediaStyle} />
  //   2. the style form anywhere    → objectFit sits in `mediaStyle`, which the
  //      element text never shows, so style objects are resolved by name
  //   3. a spread-only site         → <Video {...videoProps} /> has no `src=`,
  //      and a src-filter exempted it from the gate entirely
  it("every @remotion/media <Video> declares objectFit as a PROP, never only in style", () => {
    const propOffenders = [];
    const styleOffenders = [];
    let seen = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const where = relative(REMOTION_SRC, file).replace(/\\/g, "/");
      for (const block of videoBlocks(source)) {
        seen++;
        if (!/objectFit\s*=\s*[{"]/.test(block.text)) propOffenders.push(where);
        const resolved = styleObject(source, block);
        if (/objectFit\s*:/.test(block.text) || (resolved && /objectFit\s*:/.test(resolved))) {
          styleOffenders.push(where);
        }
      }
    }
    // MediaBackground has 2 (backdrop + primary) and AvatarCard 1; a floor of
    // 3 also fails loudly if the block scan ever stops matching.
    expect(seen).toBeGreaterThanOrEqual(3);
    expect(propOffenders).toEqual([]);
    expect(styleOffenders).toEqual([]);
  });

  it("the style-object resolver reaches a shared style const", () => {
    // Guard on the guard: if `styleObject` stops resolving, shape 2 silently
    // loses its gate while every assertion above stays green.
    const media = readFileSync(join(REMOTION_SRC, "components", "MediaBackground.tsx"), "utf8");
    const block = videoBlocks(media).find((b) => b.text.includes("style={mediaStyle}"));
    expect(block, "the primary <Video> must still use the shared style").toBeTruthy();
    const resolved = styleObject(media, block);
    expect(resolved, "style={mediaStyle} must resolve to its object literal").toBeTruthy();
    expect(resolved).toMatch(/objectPosition/);
    expect(resolved).not.toMatch(/objectFit:/);
    // The literal ends where the declaration ends, not at the next `}` + `;`.
    expect(resolved.trimEnd().endsWith("}")).toBe(false);
    expect(resolved).toMatch(/filter:/);
  });
});
