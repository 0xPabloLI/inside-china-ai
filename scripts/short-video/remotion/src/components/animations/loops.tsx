/**
 * Loop animation components — infinite repeating animations.
 *
 * These map from CSS @keyframes with `infinite` in base-styles.mjs.
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

/** pulseDot — opacity 1→0.3→1, scale 1→0.7→1, 1s loop */
export const PulseDot: React.FC<LoopProps> = ({ interval = 1, children, style }) => {
  const frame = useCurrentFrame();
  const cycleLen = secToFrames(interval);
  const phase = (frame % cycleLen) / cycleLen; // 0→1 within each cycle
  return (
    <div
      style={{
        opacity: interpolate(phase, [0, 0.5, 1], [1, 0.3, 1], clamp),
        scale: `${interpolate(phase, [0, 0.5, 1], [1, 0.7, 1], clamp)}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

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

/** glitchFlash — multi-segment opacity/background flash, 0.4s one-shot at delay */
export const GlitchFlash: React.FC<{
  delay?: number;
  children?: ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, style }) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  // 0%→10%→20%→30%→40%→100% mapped over 12 frames (0.4s at 30fps)
  const opacity = interpolate(
    frame - start,
    [0, 1, 2, 3, 4, 5, 6, 12],
    [0, 0, 1, 0, 1, 0, 0, 0],
    clamp,
  );
  const bgRed = interpolate(frame - start, [1, 2, 3, 4], [0, 0.1, 0, 0], clamp);
  const bgBlue = interpolate(frame - start, [3, 4, 5, 6], [0, 0.08, 0, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        background: `rgba(239,68,68,${bgRed}) + rgba(77,139,255,${bgBlue})`,
        ...style,
      }}
    />
  );
};
