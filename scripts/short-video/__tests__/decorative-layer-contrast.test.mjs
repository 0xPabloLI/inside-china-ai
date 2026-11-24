/**
 * Decorative-layer contrast contract (#1215, 2026-11-15 ruling).
 *
 * A full-frame decorative layer whose rgba alpha is below 0.02 contributes at
 * most 2 of 255 luminance levels on the #0a0a14 canvas: below discrimination
 * threshold at any playback resolution, yet still costing a compositing layer
 * on every frame of every scene. `GridBg` (0.015) and `Scanlines` (0.008) were
 * retired for exactly this reason; `FrameGlow` (0.2) went before them. The
 * criterion is contrast, not downsampling — 3x-DPR devices can map 1080 video
 * pixels 1:1 onto the physical screen, so a "gone at phone width" argument
 * does not hold. Measurements and the ruling live on #1215.
 *
 * This is a static source contract: no browser, no extra CI render time. It
 * walks the whole Remotion source tree, so a plain numeric-literal decoration
 * added to a new scene or component is caught by the same rule.
 *
 * Known gap: interpolated alpha expressions cannot be decided statically and
 * are not flagged here. MediaBackground no longer draws any dim layer
 * (2026-11-25), so a new constant layer written in that form needs a manual
 * check.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "remotion", "src");

/** Alpha below this contributes ≤2/255 luminance on the dark canvas. */
export const MIN_ALPHA = 0.02;
const RGBA = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/g;

/** Sub-threshold numeric rgba literals in a piece of source text. */
export function subThresholdAlphas(text) {
  return [...text.matchAll(RGBA)]
    .map((match) => ({ alpha: Number(match[1]), index: match.index }))
    .filter((hit) => hit.alpha < MIN_ALPHA);
}

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
    total += [...text.matchAll(RGBA)].length;
    for (const hit of subThresholdAlphas(text)) {
      const line = text.slice(0, hit.index).split("\n").length;
      hits.push(`${relative(SRC, file)}:${line} alpha=${hit.alpha}`);
    }
  }
  return { hits, total };
}

describe("decorative layer contrast contract", () => {
  it("scans real rgba literals (guards against a vacuous rule)", () => {
    expect(scanRgba().total).toBeGreaterThan(20);
  });

  it("flags a known-bad literal and accepts a known-good one", () => {
    expect(
      subThresholdAlphas("background: rgba(77,139,255,0.008) 1px").map((h) => h.alpha),
    ).toEqual([0.008]);
    expect(subThresholdAlphas("background: rgba(77,139,255,0.10)")).toEqual([]);
  });

  it("keeps every numeric rgba decoration at or above 0.02 alpha", () => {
    const { hits } = scanRgba();
    expect(
      hits,
      `Sub-threshold decorative layers (≤2/255 luminance, invisible in the\n` +
        `delivered frame but composited on every frame):\n${hits.join("\n")}\n` +
        `Raise the alpha to >= ${MIN_ALPHA} or delete the layer.`,
    ).toEqual([]);
  });
});
