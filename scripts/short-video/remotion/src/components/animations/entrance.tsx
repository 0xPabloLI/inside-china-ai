/**
 * Entrance animation components.
 *
 * Every visible value is a pure function of `useCurrentFrame()` (#529 R2②):
 * no CSS transitions, no wall-clock, no animation library. The curve is a
 * spring from the shared MOTION presets (#731); `durationInFrames` pins every
 * primitive to the same settle frame the previous bezier used, so authoring
 * delays keep their meaning.
 *
 * Each component takes `delay` (seconds) and wraps children in a div with the
 * interpolated animation. Stagger primitives schedule successive units from
 * MOTION.stagger — line and word granularities per #302 §E.
 */
import { Children, type CSSProperties, type ReactNode } from "react";
import { spring, useCurrentFrame } from "remotion";
import { clamp, interpolate, FPS, secToFrames } from "../shared";
import { useEntranceWindow } from "../motion-budget";
import { MOTION, type SpringPreset } from "../../tokens";

interface AnimProps {
  delay?: number;
  duration?: number;
  children: ReactNode;
  style?: React.CSSProperties;
  /**
   * Opt-in measurement hook: names this wrapper for the render probes
   * (`measure:*` scenarios read every `[data-measure-box]` element). #422
   * needs the hook subject ROW's real box, and the row is an entrance
   * wrapper — the only element that can carry it.
   */
  dataMeasureBox?: string;
}

/**
 * Spring progress for an entrance that starts at `start` and settles at `end`.
 *
 * Endpoints are explicit so settled frames are exactly 0 / exactly 1 — the
 * text gate asserts on settled geometry and must never see a spring tail.
 */
function progressOf(frame: number, start: number, end: number, config: SpringPreset): number {
  if (frame <= start) return 0;
  if (frame >= end) return 1;
  const value = spring({
    frame: frame - start,
    fps: FPS,
    config,
    durationInFrames: Math.max(1, end - start),
  });
  return Math.min(1, Math.max(0, value));
}

/** Linear range on top of a clamped spring progress (translate distances). */
const range = (p: number, from: number, to: number): number =>
  interpolate(p, [0, 1], [from, to], clamp);

/** fadeIn — opacity 0→1, spring (item tier) */
export const FadeIn: React.FC<AnimProps> = ({ delay = 0, duration = 0.4, children, style }) => {
  const frame = useCurrentFrame();
  const { start, end } = useEntranceWindow(delay, duration);
  const p = progressOf(frame, start, end, MOTION.spring.item);
  return <div style={{ opacity: p, ...style }}>{children}</div>;
};

/** slideUp — opacity 0→1, translateY 30→0, spring (item tier) */
export const SlideUp: React.FC<AnimProps> = ({
  delay = 0,
  duration = 0.4,
  children,
  style,
  dataMeasureBox,
}) => {
  const frame = useCurrentFrame();
  const { start, end } = useEntranceWindow(delay, duration);
  const p = progressOf(frame, start, end, MOTION.spring.item);
  return (
    <div
      data-measure-box={dataMeasureBox}
      style={{ opacity: p, translate: `0 ${range(p, 30, 0)}px`, ...style }}
    >
      {children}
    </div>
  );
};

/** slideLeft — opacity 0→1, translateX -50→0, spring (item tier) */
export const SlideLeft: React.FC<AnimProps> = ({ delay = 0, duration = 0.5, children, style }) => {
  const frame = useCurrentFrame();
  const { start, end } = useEntranceWindow(delay, duration);
  const p = progressOf(frame, start, end, MOTION.spring.item);
  return (
    <div style={{ opacity: p, translate: `${range(p, -50, 0)}px 0`, ...style }}>{children}</div>
  );
};

/** slideDown — opacity 0→1, translateY -30→0, spring (item tier) */
export const SlideDown: React.FC<AnimProps> = ({ delay = 0, duration = 0.3, children, style }) => {
  const frame = useCurrentFrame();
  const { start, end } = useEntranceWindow(delay, duration);
  const p = progressOf(frame, start, end, MOTION.spring.item);
  return (
    <div style={{ opacity: p, translate: `0 ${range(p, -30, 0)}px`, ...style }}>{children}</div>
  );
};

/** scaleIn — opacity 0→1, scale 0.7→1, spring (heading tier) */
export const ScaleIn: React.FC<AnimProps> = ({ delay = 0, duration = 0.6, children, style }) => {
  const frame = useCurrentFrame();
  const { start, end } = useEntranceWindow(delay, duration);
  const p = progressOf(frame, start, end, MOTION.spring.heading);
  return (
    <div
      style={{
        opacity: p,
        scale: `${interpolate(p, [0, 1], [0.7, 1], {
          ...clamp,
          output: "perceptual-scale" as const,
        })}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** stampIn — opacity 0→1, scale 2→1, spring (accent tier) */
export const StampIn: React.FC<AnimProps> = ({ delay = 0, duration = 0.5, children, style }) => {
  const frame = useCurrentFrame();
  const { start, end } = useEntranceWindow(delay, duration);
  const p = progressOf(frame, start, end, MOTION.spring.accent);
  return (
    <div
      style={{
        opacity: p,
        scale: `${interpolate(p, [0, 1], [2, 1], {
          ...clamp,
          output: "perceptual-scale" as const,
        })}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** slideRight — opacity 0→1, translateX -50→0, spring (item tier) */
export const SlideRight: React.FC<AnimProps> = ({ delay = 0, duration = 0.5, children, style }) => {
  const frame = useCurrentFrame();
  const { start, end } = useEntranceWindow(delay, duration);
  const p = progressOf(frame, start, end, MOTION.spring.item);
  return (
    <div style={{ opacity: p, translate: `${range(p, -50, 0)}px 0`, ...style }}>{children}</div>
  );
};

/** slideUpFromBottom — opacity 0→1, translateY 50→0, spring (item tier) */
export const SlideUpFromBottom: React.FC<AnimProps> = ({
  delay = 0,
  duration = 0.5,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const { start, end } = useEntranceWindow(delay, duration);
  const p = progressOf(frame, start, end, MOTION.spring.item);
  return (
    <div style={{ opacity: p, translate: `0 ${range(p, 50, 0)}px`, ...style }}>{children}</div>
  );
};

// ── Stagger primitives (#302 §E) ──────────────────────────────────────────

interface StaggerProps {
  delay?: number;
  /** Per-unit animation length, seconds. */
  duration?: number;
  /** Seconds between successive units. Defaults to MOTION.stagger.line. */
  stagger?: number;
  config?: SpringPreset;
  style?: CSSProperties;
  /** Applied to every unit wrapper (on top of the animation style). */
  itemStyle?: CSSProperties;
  children: ReactNode;
}

/**
 * StaggerLines — one spring entrance per child, offset by MOTION.stagger.line.
 *
 * For lists (bullets, cards, stat rows) whose units land in sequence instead
 * of as one block.
 */
export const StaggerLines: React.FC<StaggerProps> = ({
  delay = 0,
  duration = 0.4,
  stagger = MOTION.stagger.line,
  config = MOTION.spring.item,
  style,
  itemStyle,
  children,
}) => {
  const frame = useCurrentFrame();
  const units = Children.toArray(children);
  const perFrames = secToFrames(stagger);
  const unitFrames = secToFrames(duration);
  // Budget the whole group: the last unit must land before the hold boundary.
  const group = useEntranceWindow(delay, duration + Math.max(0, units.length - 1) * stagger);
  return (
    <div style={style}>
      {units.map((child, i) => {
        const start = group.start + i * perFrames;
        const end = Math.min(start + unitFrames, group.end);
        const p = progressOf(frame, start, Math.max(start + 1, end), config);
        return (
          <div key={i} style={{ opacity: p, translate: `0 ${range(p, 30, 0)}px`, ...itemStyle }}>
            {child}
          </div>
        );
      })}
    </div>
  );
};

interface StaggerWordsProps extends Omit<StaggerProps, "children"> {
  text: string;
}

/**
 * StaggerWords — per-word spring entrance inside one line of copy.
 *
 * Whitespace stays as plain text nodes so wrapping and spaces are preserved;
 * CJK copy without spaces falls back to a single animated unit, which is the
 * correct behaviour (per-character reveals live in a later typography pass).
 */
export const StaggerWords: React.FC<StaggerWordsProps> = ({
  text,
  delay = 0,
  duration = 0.4,
  stagger = MOTION.stagger.word,
  config = MOTION.spring.item,
  style,
  itemStyle,
}) => {
  const frame = useCurrentFrame();
  const parts = text.split(/(\s+)/);
  const wordCount = parts.filter((part) => part !== "" && !/^\s+$/.test(part)).length;
  const perFrames = secToFrames(stagger);
  const unitFrames = secToFrames(duration);
  const group = useEntranceWindow(delay, duration + Math.max(0, wordCount - 1) * stagger);
  let wordIndex = 0;
  return (
    <div style={style}>
      {parts.map((part, i) => {
        if (part === "" || /^\s+$/.test(part)) return <span key={i}>{part}</span>;
        const index = wordIndex++;
        const start = group.start + index * perFrames;
        const end = Math.min(start + unitFrames, group.end);
        const p = progressOf(frame, start, Math.max(start + 1, end), config);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              translate: `0 ${range(p, 16, 0)}px`,
              ...itemStyle,
            }}
          >
            {part}
          </span>
        );
      })}
    </div>
  );
};
