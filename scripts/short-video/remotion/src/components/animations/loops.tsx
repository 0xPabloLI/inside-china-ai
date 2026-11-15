/**
 * Loop animation components — infinite repeating animations.
 *
 * These map from CSS @keyframes with `infinite` in the retired
 * base-styles.mjs (removed 2026-09-20, see git history).
 * Use modular arithmetic on the frame count to create loops.
 */
import { type ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { interpolate, secToFrames, clamp } from "../shared";

interface LoopProps {
  interval?: number; // seconds per cycle
  children: ReactNode;
  style?: React.CSSProperties;
}

/** numberPulse — text-shadow glow oscillation, 2s loop */
export const NumberPulse: React.FC<LoopProps & { color?: string }> = ({
  interval = 2,
  color = "rgba(245,158,11",
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const cycleLen = secToFrames(interval);
  const phase = (frame % cycleLen) / cycleLen;
  const glowStrength = interpolate(phase, [0, 0.5, 1], [0.5, 0.7, 0.5], clamp);
  const glowSpread = interpolate(phase, [0, 0.5, 1], [0.3, 0.4, 0.3], clamp);
  return (
    <div
      style={{
        textShadow: `0 0 60px ${color},${glowStrength}), 0 0 120px ${color},${glowSpread})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** logoPulse — drop-shadow glow oscillation, 3s loop */
export const LogoPulse: React.FC<LoopProps & { color?: string }> = ({
  interval = 3,
  color = "rgba(77,139,255",
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const cycleLen = secToFrames(interval);
  const phase = (frame % cycleLen) / cycleLen;
  const glowStrength = interpolate(phase, [0, 0.5, 1], [0.4, 0.6, 0.4], clamp);
  return (
    <div
      style={{
        filter: `drop-shadow(0 0 30px ${color},${glowStrength}))`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** scanSweep — top 0→100%, opacity 0→1→1→0, duration-based loop */
export const ScanSweep: React.FC<{
  duration: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ duration, color = "rgba(77,139,255,0.8)", style }) => {
  const frame = useCurrentFrame();
  const cycleLen = secToFrames(duration);
  const phase = (frame % cycleLen) / cycleLen; // 0→1
  const top = interpolate(phase, [0, 1], [0, 100], clamp);
  const opacity = interpolate(phase, [0, 0.05, 0.95, 1], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: `${top}%`,
        height: 3,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        boxShadow: `0 0 20px ${color.replace("0.8", "0.5")}`,
        opacity,
        zIndex: 50,
        ...style,
      }}
    />
  );
};
