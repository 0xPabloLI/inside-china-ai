/**
 * Camera — the anti-PPT composition layer (#731).
 *
 * Wraps a scene's TEXT / composition layer (never its media) in one very slow
 * push, and stops the push `settleByFrame()` before the scene ends so the
 * closing 30–45 frames are provably static (HOLD budget).
 *
 * Not used by hook and CTA (CAMERA.disabled): the hook's first frame is the
 * TikTok cover and must be fully composed, and the CTA is the brand close.
 * Media keeps its own MediaBackground motion (#357); this layer must never
 * double-move it.
 */
import { useCurrentFrame } from "remotion";
import type { ReactNode } from "react";
import { cameraStateAt, secToFrames } from "./shared";

export const Camera: React.FC<{
  visualType: string;
  duration: number;
  children: ReactNode;
}> = ({ visualType, duration, children }) => {
  const frame = useCurrentFrame();
  const state = cameraStateAt(frame, secToFrames(duration), visualType);
  if (!state) return <>{children}</>;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transformOrigin: state.transformOrigin,
        transform: `scale(${state.scale}) translateY(${state.translateY}px)`,
      }}
    >
      {children}
    </div>
  );
};
