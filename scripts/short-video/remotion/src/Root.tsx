import { Composition, registerRoot } from "remotion";
import { ShortVideo } from "./ShortVideo";
import type { ShortVideoProps } from "./types";
// Import from the single source of truth in lib/timeline.mjs
// (re-exported through components/shared.ts)
import { FPS, sceneClipFrames } from "./components/shared";

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
          // Use sceneClipFrames from timeline.mjs — single source of truth.
          // This matches what ShortVideo.tsx, render-remotion.mjs, and
          // subtitle/audio generators all use.
          const totalFrames = durations.reduce(
            (sum: number, d: number) => sum + sceneClipFrames(d),
            0,
          );
          return { durationInFrames: totalFrames };
        }) as unknown as Parameters<typeof Composition>[0]["calculateMetadata"]
      }
    />
  );
};

registerRoot(RemotionRoot);
