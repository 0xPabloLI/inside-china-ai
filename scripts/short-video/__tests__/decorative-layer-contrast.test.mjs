/**
 * Decorative-layer contrast contract (#1215, 2026-11-15 ruling).
 *
 * A full-frame decorative layer whose rgba alpha is below 0.02 contributes at
 * most ~2/255 luminance levels on the #0a0a14 canvas: below discrimination
 * threshold, gone after downsampling to phone width, yet still costs a
 * compositing layer on every frame of every scene. `GridBg` (0.015) and
 * `Scanlines` (0.008) were retired for exactly this reason; `FrameGlow` (0.2)
 * went before them. Measured on nine real 1080x1920 stills: +1.88 and +1.95
 * luminance levels respectively, against +46 for the retired frame line.
 *
 * This is a static source contract: no browser, no extra CI render time. It
 * walks the whole Remotion source tree, so a layer added to a new scene or a
 * new component is caught by the same rule.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "remotion", "src");

/** Alpha below this contributes ≤2/255 luminance on the dark canvas. */
const MIN_ALPHA = 0.02;
const RGBA = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/g;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function scanRgba() {
  const hits = [];
  let total = 0;
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(RGBA)) {
      total += 1;
      const alpha = Number(match[1]);
      if (alpha < MIN_ALPHA) {
        const line = text.slice(0, match.index).split("\n").length;
        hits.push(`${relative(SRC, file)}:${line} alpha=${alpha}`);
      }
    }
  }
  return { hits, total };
}

describe("decorative layer contrast contract", () => {
  it("scans real rgba literals (guards against a vacuous rule)", () => {
    expect(scanRgba().total).toBeGreaterThan(20);
  });

  it("keeps every rgba decoration at or above 0.02 alpha", () => {
    const { hits } = scanRgba();
    expect(
      hits,
      `Sub-threshold decorative layers (≤2/255 luminance, invisible in the\n` +
        `delivered frame but composited on every frame):\n${hits.join("\n")}\n` +
        `Raise the alpha to >= ${MIN_ALPHA} or delete the layer.`,
    ).toEqual([]);
  });
});
