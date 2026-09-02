/**
 * ShortVideo — Main Composition.
 *
 * Receives props (scenes, audioPaths, durations) and renders the full video
 * by dispatching each scene to its visualType component, arranging them with
 * <TransitionSeries>, and placing TTS audio with <Audio>.
 *
 * First scene: hard cut (no transition in) — TikTok cover frame has content.
 * Subsequent scenes: 6-frame fade transition.
 */
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type { ShortVideoProps, SceneData } from "./types";
import { HookScene } from "./scenes/HookScene";
import { CtaScene } from "./scenes/CtaScene";
import { NarrativeScene } from "./scenes/NarrativeScene";
import { DataScene } from "./scenes/DataScene";
import { InfoCardScene } from "./scenes/InfoCardScene";
import { QuoteScene } from "./scenes/QuoteScene";
import { ContextScene } from "./scenes/ContextScene";
import { ContrastScene } from "./scenes/ContrastScene";
import { StatRevealScene } from "./scenes/StatRevealScene";
import { FullscreenMedia } from "./scenes/FullscreenMedia";
import { sceneTimeline, TRANSITION_FRAMES, BRAND_FONT_STACK } from "./components/shared";
import {
  assertKnownTextFields,
  DEFAULT_NARRATIVE_LAYOUT,
  REMOTION_SLOT_MAP,
} from "../../lib/text-slots.mjs";

/** Dispatch a scene to its React component based on visualType. */
function renderScene(scene: SceneData, duration: number, contentDir: string) {
  // Typo'd text fields must fail the render, not silently drop (decision 51).
  // Unknown visualTypes skip validation and fail at the dispatch switch below.
  if ((REMOTION_SLOT_MAP as Record<string, unknown>)[scene.visualType]) {
    const layout =
      scene.visualType === "narrative"
        ? ((scene.layout ?? DEFAULT_NARRATIVE_LAYOUT) as string)
        : scene.visualType === "fullscreen"
          ? "media"
          : "hero-center";
    assertKnownTextFields(scene.visualType, layout, scene.texts as Record<string, unknown>);
  }

  // fullscreen mode: render only media + source label, skip text Slot layout
  if (scene.media?.mode === "fullscreen") {
    return (
      <FullscreenMedia media={scene.media} duration={duration} sceneId={`fullscreen-${scene.id}`} />
    );
  }

  const common = { scene, duration };

  switch (scene.visualType) {
    case "hook":
      return <HookScene {...common} contentDir={contentDir} />;
    case "cta":
      return <CtaScene {...common} />;
    case "narrative":
      return <NarrativeScene {...common} contentDir={contentDir} />;
    case "data":
      return <DataScene {...common} />;
    case "info-card":
      return <InfoCardScene {...common} contentDir={contentDir} />;
    case "quote":
      return <QuoteScene {...common} />;
    case "context":
      return <ContextScene {...common} contentDir={contentDir} />;
    case "contrast":
      return <ContrastScene {...common} />;
    case "stat-reveal":
      return <StatRevealScene {...common} />;
    default:
      // Unknown visualType is a scene-data bug: fail the render instead of
      // silently re-interpreting the scene as a narrative (spec decision 45).
      throw new Error(
        `Unknown visualType "${scene.visualType}" (scene ${scene.id}) — ` +
          "register it in REMOTION_SLOT_MAP and add a scene component",
      );
  }
}

/** Get transition for scene boundary based on scene types. */
function getTransition(prevScene: SceneData, currScene: SceneData) {
  const prevType = prevScene.visualType;
  const currType = currScene.visualType;

  // Hook → first narrative: slide from right (breaking news entering context)
  if (prevType === "hook" && currType === "narrative") {
    return slide({ direction: "from-right" });
  }

  // Data scene boundary: wipe (data reveal emphasis)
  if (
    currType === "data" ||
    prevType === "data" ||
    currType === "stat-reveal" ||
    prevType === "stat-reveal"
  ) {
    return wipe();
  }

  // Last content → CTA: slide from bottom (brand close rises up)
  if (currType === "cta") {
    return slide({ direction: "from-bottom" });
  }

  // Default: fade
  return fade();
}

export const ShortVideo: React.FC<ShortVideoProps> = ({
  scenes,
  audioPaths,
  durations,
  contentDir = "",
}) => {
  if (scenes.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: "#0a0a14" }} />;
  }

  // Shared schedule: visual Sequences, audio and subtitles all read their
  // offsets from here (single source of truth in lib/timeline.mjs).
  //
  // Non-final scenes are allocated `clipFrames + TRANSITION_FRAMES` because
  // TransitionSeries subtracts that overlap again when it places them — which
  // is what makes each scene's visual start equal its audio/subtitle start.
  const schedule = sceneTimeline(
    scenes.map((scene, i) => ({ sceneId: scene.id ?? i + 1, duration: durations[i] ?? 5 })),
    { transitionOverlap: TRANSITION_FRAMES },
  );

  // Build the sequence of scenes with transitions (visual only)
  const elements: React.ReactNode[] = [];
  // Build audio sequences with frame-precise offsets matching the schedule
  const audioElements: React.ReactNode[] = [];

  schedule.forEach((entry, i) => {
    const scene = scenes[i];

    // Add transition before this scene (skip first scene — hard cut)
    if (i > 0) {
      const prevScene = scenes[i - 1];
      elements.push(
        <TransitionSeries.Transition
          key={`t-${i}`}
          presentation={getTransition(prevScene, scene) as ReturnType<typeof fade>}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />,
      );
    }

    elements.push(
      <TransitionSeries.Sequence key={`s-${i}`} durationInFrames={entry.visualFrames}>
        {renderScene(scene, entry.visualDuration, contentDir)}
      </TransitionSeries.Sequence>,
    );

    // Audio is placed OUTSIDE TransitionSeries to avoid transition overlap
    // shifting audio onsets. `entry.offsetFrames` is the same value the visual
    // starts on once the allocated transition frames are given back.
    if (audioPaths[i]) {
      audioElements.push(
        <Sequence key={`a-${i}`} from={entry.offsetFrames} durationInFrames={entry.clipFrames}>
          <Audio src={staticFile(audioPaths[i])} />
        </Sequence>,
      );
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14", fontFamily: BRAND_FONT_STACK }}>
      <TransitionSeries>{elements}</TransitionSeries>
      {audioElements}
    </AbsoluteFill>
  );
};
