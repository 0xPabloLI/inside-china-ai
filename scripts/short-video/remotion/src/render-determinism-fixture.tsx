/**
 * Determinism fixture (#734 ①).
 *
 * A dedicated entry so this suite owns its Remotion bundle directory.
 * `remotion-still.mjs` memoizes one bundle per ENTRY per process but writes it
 * to a fixed path per entry, so two suites rendering through the same entry
 * concurrently (local `vitest run`, `maxWorkers: 4`) can rebuild each other's
 * bundle directory mid-render — a 404 or pixel failure that in this suite
 * would be indistinguishable from a real determinism break. Sharing
 * `media-zoom-fixture.tsx` or `scene-gate-fixture.tsx` with their own suites
 * is exactly that hazard, hence a file of its own.
 *
 * Two modes cover what the pixel contract needs:
 *   text  — the production `<ShortVideo>` composition with the qwen4-preview s9
 *           narrative scene: entrance springs mid-flight + text-gate fitting.
 *   video — `MediaBackground`'s zoom preset over a real H.264 clip the suite
 *           copies into `public/assets/`: frame extraction + container scale.
 *
 * Both modes render nothing at all (pure canvas) if the pipeline breaks, which
 * is why the suite pairs every identical-frame assertion with a different-frame
 * control that must differ.
 */
import React from "react";
import { AbsoluteFill, Composition, registerRoot } from "remotion";
import { ShortVideo } from "./ShortVideo";
import { MediaBackground } from "./components/MediaBackground";
import { FPS } from "./components/shared";
import type { MediaField, SceneData } from "./types";

/**
 * s9 "loop-closure" shape, same copy the scene-gate fixture uses (verbatim
 * from qwen4-preview scene-data); duplicated here because importing that
 * fixture would execute its `registerRoot`.
 */
const TEXT_SCENE: SceneData = {
  id: 9,
  name: "loop-closure",
  visualType: "narrative",
  layout: "media-overlay",
  voiceover:
    "Remember 6 billion? That tiny active footprint is the whole point. Capacity without the compute bill.",
  texts: {
    badge: "LOOP CLOSURE",
    company: "REMEMBER 6B PARAMS?",
    action: "CAPACITY GROWTH, COMPUTE FLAT",
    result: "THAT'S THE WHOLE POINT",
    highlight: { field: "result", text: "POINT" },
    context: "51B EMBEDDINGS SIT IN REGULAR RAM, NOT VRAM",
    source: "CHINA AI NEWS ANALYSIS",
  },
};

type FixtureProps = {
  mode?: "text" | "video";
  /** Clip basename under `public/assets/`, copied by the suite. */
  clipName?: string;
};

const FixtureScene: React.FC<FixtureProps> = ({ mode = "text", clipName = "" }) => {
  if (mode === "text") {
    return <ShortVideo scenes={[TEXT_SCENE]} audioPaths={[]} durations={[4]} />;
  }
  const media: MediaField = {
    type: "video",
    path: `assets/${clipName}`,
    animation: "zoom",
    volume: 0,
    overlay: 0, // no dim layer: the pixel diff must see the decoded frame
  };
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <MediaBackground media={media} duration={4} />
    </AbsoluteFill>
  );
};

export const RenderDeterminismFixtureRoot: React.FC = () => (
  <Composition
    id="RenderDeterminismFixture"
    component={FixtureScene as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={120}
    fps={FPS}
    width={1080}
    height={1920}
    defaultProps={{ mode: "text", clipName: "" }}
  />
);

registerRoot(RenderDeterminismFixtureRoot);
