/**
 * Protagonist light renderer (#738) — the React edge over `lib/focus-light.mjs`.
 *
 * Everything that can be checked without a frame lives in the lib: the three
 * tiers, the per-template protagonist declaration, the beat budget (one focus
 * per frame, 8-frame extinguish, 3–6 frame flash) and the CSS strings. This
 * file only asks Remotion for the frame and hands the result back.
 *
 * Usage — one call per lit target, at the top of the scene component (never
 * inside a TextGate render prop: that is a callback, not a component):
 *
 *   const statLight = useFocusLight("data", "stat", duration);
 *   ...
 *   <div style={{ fontSize, color: COLOR.amber, ...statLight }}>{...}</div>
 *
 * A target the plan does not light gets `{}` — the element renders exactly as
 * it did before this ticket.
 *
 * The light is a style on the element, never a positioned layer: see the lib
 * header for why (it follows the glyphs, it cannot shift layout, and the fade
 * can run on the shadow while the content stays opaque).
 */
import { useCurrentFrame } from "remotion";
import type { CSSProperties } from "react";
import {
  focusLightStyle,
  lightKindFor,
  lightStateAt,
  lightPlanFor,
  lightToneFor,
  resolveLightTimeline,
} from "../../../lib/focus-light.mjs";
import { secToFrames } from "./shared";

/** The lib's tones — a key set of `LIGHT_TONES`, declared here for TS. */
type LightTone = "amber" | "blue" | "red";

const DARK: CSSProperties = {};

/**
 * @param visualType contract template the scene renders as
 * @param target contract field name of the element being lit
 * @param duration scene length in seconds (the renderer's own prop)
 * @param opts.tone override the plan's default tone when the template picks the
 *   colour per scene (narrative alternates red/amber by scene id)
 * @returns the light's CSS declarations for the current frame
 */
export function useFocusLight(
  visualType: string,
  target: string,
  duration: number,
  opts: { tone?: LightTone } = {},
): CSSProperties {
  const frame = useCurrentFrame();
  const plan = lightPlanFor(visualType);
  if (!plan) return DARK;
  const durationFrames =
    Number.isFinite(duration) && duration > 0 ? secToFrames(duration) : undefined;
  // A plan that breaks the budget throws here, i.e. the render fails. That is
  // the point: the rule is a contract, not a review note.
  const timeline = resolveLightTimeline(plan, { durationFrames });
  return focusLightStyle(
    { tone: opts.tone ?? lightToneFor(plan, target), kind: lightKindFor(plan, target) },
    lightStateAt(timeline, target, frame),
  ) as CSSProperties;
}
