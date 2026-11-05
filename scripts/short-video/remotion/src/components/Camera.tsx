/**
 * Camera — the anti-PPT composition layer (#731).
 *
 * Wraps a scene's TEXT / composition layer (never its media) in one very slow
 * pull, and stops the motion `settleByFrame()` before the scene ends so the
 * closing 30–45 frames are provably static (HOLD budget). The scene's hold
 * boundary is also published through MotionBudgetContext, so entrance
 * primitives that would run into the hold window are pulled earlier — the
 * budget binds composed text, not just the camera transform.
 *
 * Hook and CTA get no transform (CAMERA.disabled): the hook's first frame is
 * the TikTok cover and must be fully composed, and the CTA is the brand close.
 * They still mount Camera so their entrances share the hold budget.
 * Media keeps its own MediaBackground motion (#357); this layer must never
 * double-move it.
 */
import { useCurrentFrame } from "remotion";
import type { ReactNode } from "react";
import { cameraStateAt, secToFrames, settleByFrame } from "./shared";
import { MotionBudgetContext } from "./motion-budget";

export const Camera: React.FC<{
  visualType: string;
  duration: number;
  children: ReactNode;
}> = ({ visualType, duration, children }) => {
  const frame = useCurrentFrame();
  const totalFrames = secToFrames(duration);
  const settleAt = settleByFrame(totalFrames, visualType);
  const state = cameraStateAt(frame, totalFrames, visualType);
  return (
    <MotionBudgetContext.Provider value={settleAt}>
      {state ? (
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
      ) : (
        children
      )}
    </MotionBudgetContext.Provider>
  );
};
