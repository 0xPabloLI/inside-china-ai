/**
 * ShortVideo — Main Composition.
 *
 * Receives props (scenes, audioPaths, durations) and renders the full video
 * by dispatching each scene to its visualType component, arranging them with
 * <TransitionSeries>, and placing TTS audio with <Audio>.
 *
 * This is a placeholder for T2 (scaffold). T5 fills in the real implementation.
 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { ShortVideoProps } from "./types";

export const ShortVideo: React.FC<ShortVideoProps> = ({ scenes }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#f5f5f5",
          fontFamily: "Helvetica Neue, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 72, fontWeight: 900 }}>
          China AI News
        </h1>
        <p style={{ fontSize: 32, color: "#cbd5e1", marginTop: 20 }}>
          Remotion scaffold — frame {frame}
        </p>
        <p style={{ fontSize: 24, color: "#475569", marginTop: 10 }}>
          {scenes.length} scenes loaded
        </p>
      </div>
    </AbsoluteFill>
  );
};
