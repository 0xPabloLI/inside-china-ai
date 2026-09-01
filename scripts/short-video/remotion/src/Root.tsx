import { Composition, registerRoot } from "remotion";
import { ShortVideo } from "./ShortVideo";
import type { ShortVideoProps } from "./types";
// Import from the single source of truth in lib/timeline.mjs
// (re-exported through components/shared.ts)
import { FPS, sceneTimeline, scheduleTotalFrames, TRANSITION_FRAMES } from "./components/shared";

// Default empty props — real props are injected via --props at render time
const defaultProps: ShortVideoProps = {
  scenes: [],
  audioPaths: [],
  durations: [],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ShortVideo"
      component={ShortVideo as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={
        (({ props }: { props: Record<string, unknown> }) => {
          const durations = (props.durations as number[]) ?? [];
          if (durations.length === 0) {
            return { durationInFrames: 300 };
          }
          // Use the shared schedule from timeline.mjs — single source of truth.
          // This matches what ShortVideo.tsx places on the timeline, and what
          // the subtitle/audio generators consume.
          const totalFrames = scheduleTotalFrames(
            sceneTimeline(
              durations.map((d: number, i: number) => ({ sceneId: i + 1, duration: d })),
              { transitionOverlap: TRANSITION_FRAMES },
            ),
          );
          return { durationInFrames: totalFrames };
        }) as unknown as Parameters<typeof Composition>[0]["calculateMetadata"]
      }
    />
  );
};

registerRoot(RemotionRoot);
