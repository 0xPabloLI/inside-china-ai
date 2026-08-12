import { Composition, registerRoot } from "remotion";
import { ShortVideo } from "./ShortVideo";
import type { ShortVideoProps } from "./types";

// Default empty props — real props are injected via --props at render time
const defaultProps: ShortVideoProps = {
  scenes: [],
  audioPaths: [],
  durations: [],
};

// Frame-aligned clip duration: TTS duration + 0.5s buffer, in frames at 30fps.
// Matches sceneClipDuration() from lib/timeline.mjs.
const FPS = 30;
const SCENE_BUFFER = 0.5;
const clipFrames = (ttsDuration: number) =>
  Math.ceil((ttsDuration + SCENE_BUFFER) * FPS);

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
          const totalFrames = durations.reduce(
            (sum: number, d: number) => sum + clipFrames(d),
            0,
          );
          return { durationInFrames: totalFrames };
        }) as unknown as Parameters<typeof Composition>[0]["calculateMetadata"]
      }
    />
  );
};

registerRoot(RemotionRoot);
