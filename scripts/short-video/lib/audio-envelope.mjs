/**
 * #1030 — Video audio envelope, decoupled from the visual animation preset.
 *
 * Plain `.mjs` on purpose: the numeric curve is a product contract, and the
 * root vitest suite cannot import the Remotion workspace (CI installs that
 * dependency graph only in the machine-bound pixel-render job). Keeping the
 * maths here means the envelope is asserted behaviourally, not by regex over
 * a .tsx file.
 *
 * Before #1030, `preset === "none"` held a constant baseVolume: a clip's audio
 * hard-cut at every scene boundary. That coupling is also why `none` (the only
 * motionless preset) could never be handed to a talking-head video in #357.
 * Every preset now gets the same 4-stop 0 → 1 → 1 → 0 ramp; only the stop
 * positions differ, so the pre-#1030 curves are bit-for-bit unchanged.
 */

/**
 * Resolve the two interior stops of the ramp.
 *
 * `none` has TIMING {in: 0, out: 0}, so `inFrames` and `outFrames` are both 0.
 * Feeding [0, 0, totalFrames, totalFrames] to `interpolate()` throws
 * "inputRange must be strictly monotonically increasing" — and so does any
 * scene short enough for the fade-in to overlap the fade-out (6-frame scene:
 * [0, 3, 3, 6]).
 *
 * The clamp is applied ONLY to a degenerate range. Clamping every scene to
 * half its length would silently SHORTEN the fade-in of a perfectly legal
 * short scene (1.4 s fade: 21 frames → 20), changing the pre-#1030 curve the
 * envelope promises to preserve bit-for-bit.
 *
 * @param {Object} timing
 * @param {number} timing.inFrames - visual fade-in length (0 for `none`)
 * @param {number} timing.outFrames - visual fade-out length (0 for `none`)
 * @param {number} timing.outStart - visual fade-out start frame
 * @param {number} timing.totalFrames - scene length in frames
 * @param {number} timing.fadeFrames - dedicated short fade for `none`
 * @returns {{ audioInFrames: number, audioOutStart: number }}
 */
export function audioEnvelopeStops({ inFrames, outFrames, outStart, totalFrames, fadeFrames }) {
  // No 4-stop ramp fits in 1–2 frames; videoVolumeAt() returns 0 before it
  // gets here. These are documented placeholders, not a usable range.
  if (totalFrames < 3) return { audioInFrames: 1, audioOutStart: 2 };

  const requestedIn = inFrames || fadeFrames;
  const requestedOut = outFrames ? outStart : totalFrames - requestedIn;
  if (requestedIn > 0 && requestedIn < requestedOut && requestedOut < totalFrames) {
    return { audioInFrames: requestedIn, audioOutStart: requestedOut };
  }

  // Degenerate: overlapping or reversed stops. Squeeze the shortest legal
  // ramp into the remaining frames instead of letting interpolate() throw.
  const clampedIn = Math.max(1, Math.min(requestedIn, totalFrames - 2));
  const clampedOut = Math.max(clampedIn + 1, Math.min(requestedOut, totalFrames - 1));
  return { audioInFrames: clampedIn, audioOutStart: clampedOut };
}

/**
 * Per-frame video volume. Equivalent to
 * `interpolate(frame, [0, in, out, total], [0, 1, 1, 0], clamp)` but with no
 * dependency on Remotion and no degenerate input range.
 *
 * A 1–2 frame scene cannot hold four distinct integer stops; such a clip is
 * inaudible, so it stays silent rather than crashing the composition.
 */
export function videoVolumeAt({
  frame,
  baseVolume,
  inFrames,
  outFrames,
  outStart,
  totalFrames,
  fadeFrames,
}) {
  if (totalFrames < 3) return 0;
  const { audioInFrames, audioOutStart } = audioEnvelopeStops({
    inFrames,
    outFrames,
    outStart,
    totalFrames,
    fadeFrames,
  });
  if (frame <= 0 || frame >= totalFrames) return 0;
  if (frame < audioInFrames) return baseVolume * (frame / audioInFrames);
  if (frame < audioOutStart) return baseVolume;
  return baseVolume * ((totalFrames - frame) / (totalFrames - audioOutStart));
}
