/**
 * #357 contract: the allocator's video default and the renderer's degrade
 * rule must agree.
 *
 * Two places decide what a video asset animates with:
 *
 *   - `lib/asset-sourcer.mjs` — `VIDEO_ANIMATION`, written into scene-data and
 *     media-patch.json;
 *   - `remotion/src/components/MediaBackground.tsx` — `resolvePreset()`, which
 *     degrades container-motion presets for video before anything renders.
 *
 * If they drift, the written field stops describing what ships: the allocator
 * would hand out a preset the renderer is going to silently override, and
 * `#357`'s crop-loss fix would look applied in the data while the frame is
 * still being scaled (or vice versa). The render evidence for the behaviour
 * lives in media-zoom-render.test.mjs (real Chromium, CI-skipped); this file
 * pins the wiring itself so a drift is caught on every CI run.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = resolve(__dirname, "..", "remotion");

const sourcer = readFileSync(join(__dirname, "..", "lib", "asset-sourcer.mjs"), "utf-8");
const background = readFileSync(
  join(REMOTION_DIR, "src", "components", "MediaBackground.tsx"),
  "utf-8",
);

/** The value the allocator writes for every video asset. */
const allocatorValue = () => {
  const match = sourcer.match(/const VIDEO_ANIMATION = "([a-z-]+)";/);
  expect(match, "VIDEO_ANIMATION must stay a single named constant").toBeTruthy();
  return match[1];
};

/** Presets `resolvePreset()` refuses to render on a video. */
const degradedForVideo = () => {
  const fn = background.match(/const resolvePreset = \([\s\S]*?\n\};/);
  expect(fn, "MediaBackground must resolve presets through resolvePreset()").toBeTruthy();
  const names = [...fn[0].matchAll(/preset === "([a-z-]+)"/g)].map((m) => m[1]);
  expect(names.length, "the degrade rule must name at least zoom").toBeGreaterThan(0);
  return names;
};

describe("#357 video animation contract", () => {
  it("the allocator's video default is never a preset the renderer degrades", () => {
    const value = allocatorValue();
    const degraded = degradedForVideo();
    expect(
      degraded,
      `VIDEO_ANIMATION="${value}" is degraded for video by resolvePreset() — the ` +
        `written field would not describe what renders. Change both sides together.`,
    ).not.toContain(value);
  });

  it("zoom is degraded for video (the #357 fix)", () => {
    expect(degradedForVideo()).toContain("zoom");
  });

  it("the degrade rule is scoped to video — images keep their presets", () => {
    const fn = background.match(/const resolvePreset = \([\s\S]*?\n\};/)[0];
    // The guard must be conditioned on the media type, not applied globally.
    expect(fn).toMatch(/type === "video"/);
  });

  it("images still get ken-burns from the allocator", () => {
    expect(sourcer).toMatch(/isVideo \? VIDEO_ANIMATION : "ken-burns"/);
  });
});
