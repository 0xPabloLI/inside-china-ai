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
 * The audio curve is asserted BEHAVIOURALLY against lib/audio-envelope.mjs
 * (plain .mjs, no Remotion dependency). The real-clip render evidence lives in
 * media-zoom-render.test.mjs, which is wired into the pixel-render CI job.
 */
import { describe, it, expect } from "vitest";

import {
  selectAnimationForAsset,
  sourceTierRank,
  assignAssetsToScenes,
  recommendScene,
} from "../lib/asset-sourcer.mjs";
import { ALL_SOURCES } from "../lib/source-registry.mjs";
import { audioEnvelopeStops, videoVolumeAt } from "../lib/audio-envelope.mjs";

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

  it("is the ONLY producer: recommendScene agrees with the allocator", () => {
    const asset = { type: "image", contentKind: "chart" };
    const expected = selectAnimationForAsset(asset);
    for (const visualType of ["hook", "narrative", "info-card", "quote", "context", "contrast"]) {
      const rec = recommendScene(asset, [makeScene(2, visualType)]);
      expect(rec.animation, visualType).toBe(expected);
    }
  });

  it("recommends context / contrast at all (they are not in NO_MEDIA_TYPES)", () => {
    for (const visualType of ["context", "contrast"]) {
      expect(recommendScene({ type: "video" }, [makeScene(2, visualType)])).toEqual({
        sceneId: 2,
        animation: "fade",
        // #1305: shared scrim table — context/contrast are 0.55 now.
        overlay: 0.55,
      });
    }
  });
});

// ─── Audio envelope: numeric contract, not a regex over a .tsx file ───
const TIMING = {
  fade: { in: 0.8, out: 0.6 },
  "ken-burns": { in: 1.0, out: 0.6 },
  zoom: { in: 0.6, out: 0.5 },
  none: { in: 0, out: 0 },
};
const secToFrames = (s) => Math.round(s * 30);

function timingFor(preset, duration = 4) {
  const totalFrames = secToFrames(duration);
  const inFrames = secToFrames(Math.min(TIMING[preset].in, duration / 2));
  const outFrames = secToFrames(Math.min(TIMING[preset].out, duration / 2));
  return {
    inFrames,
    outFrames,
    outStart: totalFrames - outFrames,
    totalFrames,
    fadeFrames: secToFrames(Math.min(0.25, duration / 2)),
  };
}

/** Pre-#1030 curve: `none` was a constant, everything else a 4-stop ramp. */
function oldVolume(preset, frame, baseVolume, t) {
  if (preset === "none") return baseVolume;
  const f = Math.max(0, Math.min(frame, t.totalFrames));
  if (f < t.inFrames) return baseVolume * (f / t.inFrames);
  if (f < t.outStart) return baseVolume;
  return baseVolume * ((t.totalFrames - f) / (t.totalFrames - t.outStart));
}

describe("#1030 Slice 1 — audio envelope is preset-independent", () => {
  const frames = [0, 1, 4, 7, 12, 24, 60, 102, 113, 119, 120];
  const baseVolume = 0.1;

  it("keeps every pre-existing preset curve bit-for-bit unchanged", () => {
    for (const preset of ["fade", "ken-burns", "zoom"]) {
      const t = timingFor(preset);
      for (const frame of frames) {
        const actual = videoVolumeAt({ frame, baseVolume, ...t });
        expect(actual, `${preset} f${frame}`).toBeCloseTo(
          oldVolume(preset, frame, baseVolume, t),
          10,
        );
      }
    }
  });

  it("gives `none` a real fade instead of the constant hard cut", () => {
    const t = timingFor("none");
    const stops = audioEnvelopeStops(t);
    expect(stops).toEqual({ audioInFrames: 8, audioOutStart: 112 });
    expect(videoVolumeAt({ frame: 0, baseVolume, ...t })).toBe(0);
    expect(videoVolumeAt({ frame: 4, baseVolume, ...t })).toBeCloseTo(baseVolume / 2, 10);
    expect(videoVolumeAt({ frame: 60, baseVolume, ...t })).toBeCloseTo(baseVolume, 10);
    expect(videoVolumeAt({ frame: 116, baseVolume, ...t })).toBeCloseTo(baseVolume / 2, 10);
    expect(videoVolumeAt({ frame: 120, baseVolume, ...t })).toBe(0);
    // The old curve was a flat baseVolume on every frame — the audio hard cut.
    expect(frames.every((f) => oldVolume("none", f, baseVolume, t) === baseVolume)).toBe(true);
  });

  it("preserves legal short-scene stops exactly (clamp only fires on degenerate ranges)", () => {
    // Review finding: clamping every scene to totalFrames/2 silently shortened
    // a legal 1.4 s fade-in from 21 to 20 frames. The fast path must leave
    // those anchors untouched AND the resulting curve must equal the old one.
    for (const [preset, duration, expected] of [
      ["fade", 1.4, { audioInFrames: 21, audioOutStart: 24 }],
      ["ken-burns", 2.0, { audioInFrames: 30, audioOutStart: 42 }],
      ["zoom", 1.2, { audioInFrames: 18, audioOutStart: 21 }],
    ]) {
      const t = timingFor(preset, duration);
      expect(audioEnvelopeStops(t), `${preset} ${duration}s`).toEqual(expected);
      for (let frame = 0; frame <= t.totalFrames; frame++) {
        expect(
          videoVolumeAt({ frame, baseVolume, ...t }),
          `${preset} ${duration}s f${frame}`,
        ).toBeCloseTo(oldVolume(preset, frame, baseVolume, t), 10);
      }
    }
  });

  it("sweeps every scene length 1–240 frames: no curve drift, no degenerate stops", () => {
    // A previous pass clamped ALL short scenes to totalFrames/2 and silently
    // changed legal fade-ins; the 4 s-only tests did not catch it. Sweep the
    // whole plausible range so the next edit cannot reintroduce it.
    for (let frames = 1; frames <= 240; frames++) {
      for (const preset of Object.keys(TIMING)) {
        const t = timingFor(preset, frames / 30);
        if (frames >= 3) {
          const { audioInFrames, audioOutStart } = audioEnvelopeStops(t);
          expect(0, `${preset} ${frames}f`).toBeLessThan(audioInFrames);
          expect(audioInFrames, `${preset} ${frames}f`).toBeLessThan(audioOutStart);
          expect(audioOutStart, `${preset} ${frames}f`).toBeLessThan(t.totalFrames);
        }
        if (preset === "none" || frames < 3) continue;
        const oldLegal = 0 < t.inFrames && t.inFrames < t.outStart && t.outStart < t.totalFrames;
        if (!oldLegal) continue; // pre-#1030 interpolate() would have thrown here
        for (const frame of [0, 1, 2, Math.floor(frames / 2), frames - 2, frames - 1, frames]) {
          expect(
            videoVolumeAt({ frame, baseVolume, ...t }),
            `${preset} ${frames}f f${frame}`,
          ).toBeCloseTo(oldVolume(preset, frame, baseVolume, t), 10);
        }
      }
    }
  });

  it("never produces a degenerate interpolate() input range on short scenes", () => {
    for (const duration of [0.1, 0.2, 0.25, 0.5, 1, 2]) {
      for (const preset of Object.keys(TIMING)) {
        const t = timingFor(preset, duration);
        const { audioInFrames, audioOutStart } = audioEnvelopeStops(t);
        expect(0, `${preset} ${duration}s`).toBeLessThan(audioInFrames);
        expect(audioInFrames, `${preset} ${duration}s`).toBeLessThan(audioOutStart);
        expect(audioOutStart, `${preset} ${duration}s`).toBeLessThan(t.totalFrames);
        for (const frame of frames) {
          expect(
            Number.isFinite(videoVolumeAt({ frame, baseVolume, ...t })),
            `${preset} ${duration}s f${frame}`,
          ).toBe(true);
        }
      }
    }
  });

  it("stays silent for a 1–2 frame clip (four distinct stops cannot fit)", () => {
    expect(videoVolumeAt({ frame: 1, baseVolume, ...timingFor("none", 0.05) })).toBe(0);
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

  it("derives tiers from source-registry categories, not a second name list", () => {
    // A source added to the registry must be ranked without an edit here.
    for (const source of ALL_SOURCES) {
      const expected =
        source.category === "stock_media" ? 0 : source.category === "general" ? 1 : 2;
      expect(sourceTierRank({ source: source.name }), source.name).toBe(expected);
    }
    expect(ALL_SOURCES.length).toBeGreaterThan(50);
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
