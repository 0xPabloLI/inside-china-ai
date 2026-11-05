/**
 * #1030 — Media chain follow-ups.
 *
 * Three bounded slices:
 *  1. `selectAnimationForAsset()` — content-aware animation, with the video
 *     audio envelope decoupled from `preset === "none"` in the renderer.
 *  2. `sourceTierRank()` — same-type candidates prefer first-party/vertical
 *     sources over generic stock libraries before falling back to tech score.
 *  3. `VOLUME_RECOMMENDATIONS` — context/contrast visualTypes get a level.
 *
 * The renderer-side audio contract is asserted statically here because the
 * volume envelope is a per-frame React value; the real Chromium render evidence
 * lives in the media-zoom-render / media-focus-render suites.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  selectAnimationForAsset,
  sourceTierRank,
  assignAssetsToScenes,
} from "../lib/asset-sourcer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const background = readFileSync(
  resolve(__dirname, "..", "remotion", "src", "components", "MediaBackground.tsx"),
  "utf-8",
);

const makeScene = (id, visualType) => ({ id, visualType, media: undefined });
const claimed = (path, type, score, sceneId, over = {}) => ({
  path,
  type,
  score,
  source: "qbitai",
  title: `Asset ${path}`,
  claimSceneId: sceneId,
  relevanceScore: 90,
  ...over,
});

describe("#1030 Slice 1 — content-aware animation", () => {
  it("keeps talking-head video motionless (`none`)", () => {
    expect(selectAnimationForAsset({ type: "video", contentKind: "talking_head" })).toBe("none");
  });

  it("keeps every other video on the #357 `fade` default", () => {
    expect(selectAnimationForAsset({ type: "video" })).toBe("fade");
    expect(selectAnimationForAsset({ type: "video", contentKind: "product_demo" })).toBe("fade");
    expect(selectAnimationForAsset({ type: "video", fit: "contain" })).toBe("fade");
  });

  it("does not push charts / screenshots / contained images out of frame", () => {
    for (const asset of [
      { type: "image", contentKind: "chart" },
      { type: "image", contentKind: "text_screenshot" },
      { type: "image", fit: "contain" },
    ]) {
      expect(selectAnimationForAsset(asset)).toBe("fade");
    }
  });

  it("keeps ken-burns for ordinary cover stills", () => {
    expect(selectAnimationForAsset({ type: "image", contentKind: "photo" })).toBe("ken-burns");
    expect(selectAnimationForAsset({ type: "image" })).toBe("ken-burns");
  });

  it("treats unknown / malformed VLM contentKind as the default, not as a static asset", () => {
    expect(selectAnimationForAsset({ type: "image", contentKind: null })).toBe("ken-burns");
    expect(
      selectAnimationForAsset({
        type: "image",
        contentKind: "The image has a mix of urban elements",
      }),
    ).toBe("ken-burns");
  });

  it("writes the selected preset into scene-data through assignAssetsToScenes", () => {
    const scenes = [makeScene(2, "narrative"), makeScene(3, "narrative")];
    const assets = [
      claimed("talking.mp4", "video", 90, 2, { contentKind: "talking_head" }),
      claimed("chart.png", "image", 80, 3, { contentKind: "chart" }),
    ];
    const result = assignAssetsToScenes(assets, scenes);
    expect(result.find((r) => r.sceneId === 2).media.animation).toBe("none");
    expect(result.find((r) => r.sceneId === 3).media.animation).toBe("fade");
  });

  it("uses the resolved media fit, not just the raw asset fit, for contain images", () => {
    const scenes = [makeScene(1, "hook")];
    const assets = [claimed("wide.jpg", "image", 90, 1, { fit: "contain" })];
    const result = assignAssetsToScenes(assets, scenes);
    expect(result[0].media.fit).toBe("contain");
    expect(result[0].media.animation).toBe("fade");
  });
});

describe("#1030 Slice 1 — audio envelope is preset-independent", () => {
  it("never drops the 4-stop envelope for the `none` preset", () => {
    const block = background.match(/const videoVolume =[\s\S]*?;\n/)?.[0] ?? "";
    expect(block).not.toMatch(/preset === "none"/);
    expect(block).toMatch(/interpolate\(frame, \[0, audioInFrames, audioOutStart, totalFrames\]/);
    // TIMING.none is {in:0,out:0}; a zero-width input range would make
    // interpolate() degenerate, so `none` gets a short dedicated audio fade.
    expect(background).toMatch(/const audioInFrames = inFrames \|\| secToFrames/);
  });

  it("still feeds the envelope into <Video volume>", () => {
    expect(background).toMatch(/volume=\{videoVolume\}/);
  });
});

describe("#1030 Slice 2 — source tier", () => {
  it("ranks first-party / vertical reporting above generic search above stock libraries", () => {
    expect(sourceTierRank({ source: "qbitai" })).toBeGreaterThan(
      sourceTierRank({ source: "google_search" }),
    );
    expect(sourceTierRank({ source: "google_search" })).toBeGreaterThan(
      sourceTierRank({ source: "pexels" }),
    );
    expect(sourceTierRank({ source: "pixabay" })).toBe(0);
    expect(sourceTierRank({ source: "pexels-video" })).toBe(0);
  });

  it("unknown / missing source falls back to the middle tier", () => {
    expect(sourceTierRank({})).toBe(1);
    expect(sourceTierRank({ source: "brand-new-source" })).toBe(1);
    expect(sourceTierRank({ from: "cached-media" })).toBeGreaterThan(1);
  });

  it("same-type first-party evidence wins over a higher-scoring stock asset", () => {
    const scenes = [makeScene(2, "narrative")];
    const assets = [
      claimed("stock.jpg", "image", 99, 2, { source: "pexels" }),
      claimed("evidence.jpg", "image", 61, 2, { source: "xinhua" }),
    ];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.path).toBe("evidence.jpg");
  });

  it("keeps video-ahead-of-image (#355 D1a) as the first sort key", () => {
    const scenes = [makeScene(2, "narrative")];
    const assets = [
      claimed("evidence.jpg", "image", 99, 2, { source: "xinhua" }),
      claimed("stock.mp4", "video", 61, 2, { source: "pexels-video" }),
    ];
    const result = assignAssetsToScenes(assets, scenes);
    const assigned = result.find((r) => r.status === "assigned");
    expect(assigned.media.type).toBe("video");
  });
});

describe("#1030 Slice 3 — per-visualType volume", () => {
  it("gives context and contrast video a recommended level", () => {
    for (const [vt, expected] of [
      ["context", 0.08],
      ["contrast", 0.06],
    ]) {
      const scenes = [makeScene(2, vt)];
      const assets = [claimed("clip.mp4", "video", 90, 2)];
      const result = assignAssetsToScenes(assets, scenes);
      expect(result.find((r) => r.status === "assigned").media.volume, vt).toBe(expected);
    }
  });

  it("leaves the existing narrative / quote / info-card levels untouched", () => {
    for (const [vt, expected] of [
      ["narrative", 0.1],
      ["quote", 0.04],
      ["info-card", 0.08],
    ]) {
      const scenes = [makeScene(2, vt)];
      const assets = [claimed("clip.mp4", "video", 90, 2)];
      const result = assignAssetsToScenes(assets, scenes);
      expect(result.find((r) => r.status === "assigned").media.volume, vt).toBe(expected);
    }
  });
});
