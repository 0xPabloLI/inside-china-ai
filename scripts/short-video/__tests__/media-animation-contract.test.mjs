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
import { selectAnimationForAsset } from "../lib/asset-sourcer.mjs";

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

  it("the allocator writes every animation through the content-aware seam", () => {
    // #1030: the old `isVideo ? VIDEO_ANIMATION : "ken-burns"` expression was
    // one of two producers. Both now resolve through a single pure function,
    // so the written field cannot drift from what the renderer degrades.
    expect(sourcer).toMatch(/export function selectAnimationForAsset\(/);
    expect(sourcer).toMatch(/media\.animation = selectAnimationForAsset\(asset, media\.fit\)/);
  });

  it("ordinary cover images still get ken-burns", () => {
    expect(selectAnimationForAsset({ type: "image" })).toBe("ken-burns");
  });

  it("keeps assignAssetsToScenes' JSDoc attached to the function", () => {
    // droid P2: the #1030 source-tier block was inserted between the
    // allocator's @param/@returns contract and its declaration, so editor
    // hover showed the tier docs. Pin the adjacency.
    expect(sourcer).toMatch(
      /\/\*\*[\s\S]*?Batch-assign downloaded assets[\s\S]*?\*\/\nexport function assignAssetsToScenes\(/,
    );
  });

  it("the renderer no longer ties the audio envelope to the visual preset", () => {
    // `none` is now handed out for talking-head video; it must still fade its
    // audio in/out instead of hard-cutting at the scene boundary. #1030 moved
    // the curve into lib/audio-envelope.mjs so its numbers are tested
    // behaviourally (content-aware-animation.test.mjs) rather than by regex.
    const volumeBlock = background.match(/const videoVolume =[\s\S]*?\n  \}\);/)?.[0] ?? "";
    expect(volumeBlock).not.toMatch(/preset === "none"/);
    expect(volumeBlock).toMatch(/videoVolumeAt\(\{/);
    expect(volumeBlock).toMatch(/fadeFrames/);
  });
});
