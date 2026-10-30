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
 * How a `<Video>`'s `style` is expressed, so the gate never has to guess:
 *   - `{ kind: "literal", text }`    inline `style={{ … }}` — readable directly
 *   - `{ kind: "resolved", text }`   `style={identifier}` resolved to its literal,
 *                                    including a `useMemo(() => ({ … }))` wrapper
 *   - `{ kind: "unresolved" }`       a style expression this scan cannot read
 *   - `null`                         no style prop at all
 *
 * `unresolved` is a gate FAILURE rather than a silent pass. The whole point of
 * #952 is that a declared-but-unreadable constant looks correct and does
 * nothing; a resolver that returns null would reproduce that inside the gate.
 *
 * Resolution picks the LAST `const <name>` declared before the element — the
 * one in scope — and brace-matches the first `{` after its `=`, so a same-named
 * const earlier in the file or a `}` followed by a newline cannot satisfy the
 * gate by accident.
 */
function styleOf(source, block) {
  if (!/style=\{/.test(block.text)) return null;
  if (/style=\{\{/.test(block.text)) return { kind: "literal", text: block.text };
  const name = (block.text.match(/style=\{\{\s*\.\.\.(\w+)/) ??
    block.text.match(/style=\{(\w+)\}/))?.[1];
  if (!name) return { kind: "unresolved" };
  const declarations = [...source.matchAll(new RegExp(`const\\s+${name}\\b`, "g"))].filter(
    (m) => m.index < block.start,
  );
  if (declarations.length === 0) return { kind: "unresolved" };
  const decl = declarations[declarations.length - 1];
  const assign = source.indexOf("=", decl.index + decl[0].length);
  if (assign === -1) return { kind: "unresolved" };
  const brace = source.indexOf("{", assign);
  const statementEnd = source.indexOf(";", assign);
  if (brace === -1 || (statementEnd !== -1 && statementEnd < brace)) {
    return { kind: "unresolved" };
  }
  const text = objectAt(source, brace);
  return text === null ? { kind: "unresolved" } : { kind: "resolved", text };
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
    const unresolvedOffenders = [];
    let seen = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const where = relative(REMOTION_SRC, file).replace(/\\/g, "/");
      for (const block of videoBlocks(source)) {
        seen++;
        if (!/objectFit\s*=\s*[{"]/.test(block.text)) propOffenders.push(where);
        const style = styleOf(source, block);
        if (style?.kind === "unresolved") unresolvedOffenders.push(where);
        const styleText = style?.kind === "literal" ? block.text : (style?.text ?? "");
        if (/objectFit\s*:/.test(styleText)) styleOffenders.push(where);
      }
    }
    // MediaBackground has 2 (backdrop + primary) and AvatarCard 1; a floor of
    // 3 also fails loudly if the block scan ever stops matching.
    expect(seen).toBeGreaterThanOrEqual(3);
    expect(propOffenders).toEqual([]);
    expect(styleOffenders).toEqual([]);
    // A style this scan cannot read is a hole, not a pass: an unreadable
    // expression can hide `objectFit` in exactly the way that shipped.
    expect(unresolvedOffenders).toEqual([]);
  });

  it("the style resolver reaches a shared style const", () => {
    // Guard on the guard: if `styleOf` stops resolving, shape 2 silently
    // loses its gate while every assertion above stays green.
    const media = readFileSync(join(REMOTION_SRC, "components", "MediaBackground.tsx"), "utf8");
    const block = videoBlocks(media).find((b) => b.text.includes("style={mediaStyle}"));
    expect(block, "the primary <Video> must still use the shared style").toBeTruthy();
    const style = styleOf(media, block);
    expect(style?.kind, "style={mediaStyle} must resolve").toBe("resolved");
    expect(style.text).toMatch(/objectPosition/);
    expect(style.text).not.toMatch(/objectFit:/);
    // The literal ends where the declaration ends, not at the next `}` + `;`.
    expect(style.text.trimEnd().endsWith("}")).toBe(false);
    expect(style.text).toMatch(/filter:/);
  });

  it("the style resolver reads a useMemo-wrapped literal and rejects an opaque one", () => {
    const wrapped = [
      'const cardStyle = useMemo(() => ({ width: "100%", objectFit: "contain" }), []);',
      "export const X = () => <Video src={s} style={cardStyle} />;",
    ].join("\n");
    const block = videoBlocks(wrapped)[0];
    const style = styleOf(wrapped, block);
    expect(style.kind).toBe("resolved");
    expect(style.text).toMatch(/objectFit/);

    const opaque = [
      "const cardStyle = buildStyle(props);",
      "export const X = () => <Video src={s} style={cardStyle} />;",
    ].join("\n");
    expect(styleOf(opaque, videoBlocks(opaque)[0]).kind).toBe("unresolved");
  });
});
