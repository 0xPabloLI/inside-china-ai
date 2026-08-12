import { Composition, registerRoot } from "remotion";
import { ShortVideo } from "./ShortVideo";
import type { ShortVideoProps } from "./types";

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
      durationInFrames={300} // 10s default; overridden by props at render time
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
    />
  );
};

registerRoot(RemotionRoot);
