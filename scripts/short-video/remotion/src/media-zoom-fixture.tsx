/**
 * MediaBackground container-zoom fixture (#357).
 *
 * Dedicated entry point with its own registerRoot — Root.tsx is never
 * touched. Driven by __tests__/media-zoom-render.test.mjs via
 * `remotion still` (same driver pattern as media-offset-fixture.tsx).
 *
 * What it isolates: the `zoom` preset in MediaBackground is a CONTAINER
 * scale (entrance 1.3 → 1.0, exit 1.0 → 1.15) applied on top of
 * fit:"cover" — so the frame the viewer sees is a second crop of an
 * already-cropped picture, and the crop window drifts frame by frame
 * (which silently invalidates the VLM cropFocus computed for a static
 * crop).
 *
 * The fixture asset is the real pipeline clip
 * (content/unitree/assets/unitree-superman-demo.mp4 — 640x360 source with
 * its own camera motion), copied into public/assets/ by the test driver
 * and deleted afterwards. Frames:
 *
 *   frame 9   — entrance window (opacity ramping up, scale still > 1)
 *   frame 118 — exit window (opacity 1, scale ≈ 1.14) — the crop loss is
 *               fully visible here, no fade to hide it
 *
 * Scenarios: zoom | fade | none × asset video | image.
 */
import React from "react";
import { AbsoluteFill, Composition, registerRoot } from "remotion";
import { MediaBackground } from "./components/MediaBackground";
import type { MediaField } from "./types";

/** Fixture asset basenames, copied by the test driver into public/assets/. */
export const MEDIA_ZOOM_FIXTURE_VIDEO = "media-zoom-fixture.mp4";
export const MEDIA_ZOOM_FIXTURE_IMAGE = "media-zoom-fixture.png";

type FixtureProps = {
  /** Animation preset under test. */
  scenario?: "zoom" | "fade" | "none";
  /** Which fixture asset to render: the real clip or a still frame of it. */
  asset?: "video" | "image";
};

const BASE_VIDEO: MediaField = {
  type: "video",
  path: `assets/${MEDIA_ZOOM_FIXTURE_VIDEO}`,
  animation: "none",
  volume: 0,
  overlay: 0, // no dim layer: pixel diffs must isolate the geometry
};

const BASE_IMAGE: MediaField = {
  type: "image",
  path: `assets/${MEDIA_ZOOM_FIXTURE_IMAGE}`,
  animation: "none",
  overlay: 0,
};

const FixtureScene: React.FC<FixtureProps> = ({ scenario = "zoom", asset = "video" }) => {
  const base = asset === "image" ? BASE_IMAGE : BASE_VIDEO;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <MediaBackground media={{ ...base, animation: scenario }} duration={4} />
    </AbsoluteFill>
  );
};

export const MediaZoomFixtureRoot: React.FC = () => (
  <Composition
    id="MediaZoomFixture"
    component={FixtureScene as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={120}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{ scenario: "zoom", asset: "video" }}
  />
);

registerRoot(MediaZoomFixtureRoot);
