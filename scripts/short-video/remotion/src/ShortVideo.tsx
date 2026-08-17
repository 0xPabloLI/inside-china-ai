/**
 * ShortVideo — Main Composition.
 *
 * Receives props (scenes, audioPaths, durations) and renders the full video
 * by dispatching each scene to its visualType component.
 *
 * Timeline contract: Option A — Fixed Scene Start.
 * All tracks (visual, audio, subtitle, totalFrames) use the SAME offsets
 * derived from sceneTimeline() in lib/timeline.mjs. No track compresses
 * the global timeline. Fade transitions are internal to each scene's
 * first/last frames and do NOT shift subsequent scene start positions.
 *
 * First scene: hard cut (no fade in) — TikTok cover frame has content.
 * Subsequent scenes: 6-frame fade-in at the START of each scene (internal
 * animation, does not overlap with the previous scene).
 */
import { AbsoluteFill, Audio, Sequence, staticFile, interpolate, useCurrentFrame } from "remotion";
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
import { sceneClipFrames, sceneClipDuration } from "./components/shared";

/** Dispatch a scene to its React component based on visualType. */
function renderScene(scene: SceneData, duration: number, contentDir: string) {
  // fullscreen mode: render only media + source label, skip text Slot layout
  if (scene.media?.mode === "fullscreen") {
    return <FullscreenMedia media={scene.media} duration={duration} />;
  }

  const common = { scene, duration };

  switch (scene.visualType) {
    case "hook":
      return <HookScene {...common} />;
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
      return <ContextScene {...common} />;
    case "contrast":
      return <ContrastScene {...common} />;
    case "stat-reveal":
      return <StatRevealScene {...common} />;
    default:
      // Fallback: render as narrative (most generic)
      console.warn(`Unknown visualType: ${scene.visualType}, using NarrativeScene`);
      return <NarrativeScene {...common} contentDir={contentDir} />;
  }
}

/** Fade-in wrapper for subsequent scenes (internal animation, no timeline shift). */
const FadeIn: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
}> = ({ children, durationInFrames }) => {
  const FADE_FRAMES = 6; // 0.2s at 30fps
  const fadeFrames = Math.min(FADE_FRAMES, durationInFrames);
  const frame = useCurrentFrame(); // relative to the enclosing <Sequence>

  const opacity = interpolate(frame, [0, fadeFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const ShortVideo: React.FC<ShortVideoProps> = ({ scenes, audioPaths, durations, contentDir = "" }) => {
  if (scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#0a0a14" }} />
    );
  }

  // Build visual and audio sequences with IDENTICAL offsets from sceneTimeline().
  // Both use cumulativeOffsetFrames which matches sceneTimeline() exactly.
  const visualElements: React.ReactNode[] = [];
  const audioElements: React.ReactNode[] = [];
  let cumulativeOffsetFrames = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const duration = durations[i] ?? 5; // fallback 5s
    const clipFrames = sceneClipFrames(duration);
    const clipDuration = sceneClipDuration(duration);

    // Visual: absolute Sequence at the same offset as audio/subtitle.
    // Fade-in for subsequent scenes (internal, does not shift timeline).
    visualElements.push(
      <Sequence
        key={`s-${i}`}
        from={cumulativeOffsetFrames}
        durationInFrames={clipFrames}
      >
        {i > 0 ? (
          <FadeIn durationInFrames={clipFrames}>
            {renderScene(scene, clipDuration, contentDir)}
          </FadeIn>
        ) : (
          renderScene(scene, clipDuration, contentDir)
        )}
      </Sequence>
    );

    // Audio: same offset as visual — matches sceneTimeline() exactly.
    if (audioPaths[i]) {
      audioElements.push(
        <Sequence
          key={`a-${i}`}
          from={cumulativeOffsetFrames}
          durationInFrames={clipFrames}
        >
          <Audio src={staticFile(audioPaths[i])} />
        </Sequence>
      );
    }

    cumulativeOffsetFrames += clipFrames;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14" }}>
      {visualElements}
      {audioElements}
    </AbsoluteFill>
  );
};
