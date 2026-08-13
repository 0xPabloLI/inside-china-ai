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
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
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
import { FPS, secToFrames, sceneClipFrames, sceneClipDuration } from "./components/shared";

/** Dispatch a scene to its React component based on visualType. */
function renderScene(scene: SceneData, duration: number, contentDir: string) {
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

const TRANSITION_FRAMES = 6; // 0.2s at 30fps

export const ShortVideo: React.FC<ShortVideoProps> = ({ scenes, audioPaths, durations, contentDir = "" }) => {
  if (scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#0a0a14" }} />
    );
  }

  // Build the sequence of scenes with transitions
  const elements: React.ReactNode[] = [];
  let cumulativeFrames = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const duration = durations[i] ?? 5; // fallback 5s
    const clipFrames = sceneClipFrames(duration);
    const clipDuration = sceneClipDuration(duration);

    // Add transition before this scene (skip first scene — hard cut)
    if (i > 0) {
      elements.push(
        <TransitionSeries.Transition
          key={`t-${i}`}
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
      );
    }

    elements.push(
      <TransitionSeries.Sequence
        key={`s-${i}`}
        durationInFrames={clipFrames}
      >
        {renderScene(scene, clipDuration, contentDir)}
        {/* Place TTS audio within this sequence — audioPaths are relative to public/ */}
        {audioPaths[i] && (
          <Audio
            src={staticFile(audioPaths[i])}
          />
        )}
      </TransitionSeries.Sequence>
    );

    cumulativeFrames += clipFrames;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14" }}>
      <TransitionSeries>
        {elements}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
