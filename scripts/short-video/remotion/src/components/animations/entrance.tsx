/**
 * Entrance animation components — map from CSS @keyframes in base-styles.mjs.
 *
 * Each component takes `delay` (seconds) and wraps children in a div with
 * the interpolated animation. Uses useCurrentFrame() for frame-exact timing.
 */
import { type ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { interpolate, Easing, secToFrames, clamp, easeOut, easeOutExpo } from "../shared";

interface AnimProps {
  delay?: number;
  duration?: number;
  children: ReactNode;
  style?: React.CSSProperties;
}

/** fadeIn — opacity 0→1, 0.4s, ease-out */
export const FadeIn: React.FC<AnimProps> = ({ delay = 0, duration = 0.4, children, style }) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  const end = start + secToFrames(duration);
  return (
    <div
      style={{
        opacity: interpolate(frame, [start, end], [0, 1], clamp),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** slideUp — opacity 0→1, translateY 30→0, 0.4s, ease-out */
export const SlideUp: React.FC<AnimProps> = ({ delay = 0, duration = 0.4, children, style }) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  const end = start + secToFrames(duration);
  return (
    <div
      style={{
        opacity: interpolate(frame, [start, end], [0, 1], clamp),
        translate: `0 ${interpolate(frame, [start, end], [30, 0], clamp)}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** slideLeft — opacity 0→1, translateX -50→0, 0.5s, ease-out */
export const SlideLeft: React.FC<AnimProps> = ({ delay = 0, duration = 0.5, children, style }) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  const end = start + secToFrames(duration);
  return (
    <div
      style={{
        opacity: interpolate(frame, [start, end], [0, 1], clamp),
        translate: `${interpolate(frame, [start, end], [-50, 0], clamp)}px 0`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** slideDown — opacity 0→1, translateY -30→0, 0.3s, ease-out */
export const SlideDown: React.FC<AnimProps> = ({ delay = 0, duration = 0.3, children, style }) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  const end = start + secToFrames(duration);
  return (
    <div
      style={{
        opacity: interpolate(frame, [start, end], [0, 1], clamp),
        translate: `0 ${interpolate(frame, [start, end], [-30, 0], clamp)}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** scaleIn — opacity 0→1, scale 0.7→1, 0.6s, cubic-bezier(0.16,1,0.3,1) */
export const ScaleIn: React.FC<AnimProps> = ({ delay = 0, duration = 0.6, children, style }) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  const end = start + secToFrames(duration);
  return (
    <div
      style={{
        opacity: interpolate(frame, [start, end], [0, 1], { ...clamp, easing: easeOutExpo }),
        scale: `${interpolate(frame, [start, end], [0.7, 1], { ...clamp, easing: easeOutExpo, output: "perceptual-scale" as const })}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** stampIn — opacity 0→1, scale 2→1, 0.5s, ease-out */
export const StampIn: React.FC<AnimProps> = ({ delay = 0, duration = 0.5, children, style }) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  const end = start + secToFrames(duration);
  return (
    <div
      style={{
        opacity: interpolate(frame, [start, end], [0, 1], { ...clamp, easing: easeOut }),
        scale: `${interpolate(frame, [start, end], [2, 1], { ...clamp, easing: easeOut, output: "perceptual-scale" as const })}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** slideRight — opacity 0→1, translateX -50→0, 0.5s, ease-out */
export const SlideRight: React.FC<AnimProps> = ({ delay = 0, duration = 0.5, children, style }) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  const end = start + secToFrames(duration);
  return (
    <div
      style={{
        opacity: interpolate(frame, [start, end], [0, 1], clamp),
        translate: `${interpolate(frame, [start, end], [-50, 0], clamp)}px 0`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** slideUpFromBottom — opacity 0→1, translateY 50→0, 0.5s, ease-out */
export const SlideUpFromBottom: React.FC<AnimProps> = ({
  delay = 0,
  duration = 0.5,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const start = secToFrames(delay);
  const end = start + secToFrames(duration);
  return (
    <div
      style={{
        opacity: interpolate(frame, [start, end], [0, 1], clamp),
        translate: `0 ${interpolate(frame, [start, end], [50, 0], clamp)}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
