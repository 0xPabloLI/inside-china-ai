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
 *
 * #1525 adds two optional layers on top of that scene-boundary ramp:
 *
 *   - `audioWindow` (`{ startFrame, endFrame, fadeInFrames, fadeOutFrames }`)
 *     gates the source audio to a sub-range of the scene, with its own fades.
 *     Frames are 0-based scene frames; an end beyond `totalFrames` is clamped.
 *   - `duck` (0–1) scales the audible gain while narration is present. The
 *     caller resolves whether narration exists; this helper stays pure.
 *
 * With neither option the curve is bit-for-bit the pre-#1525 curve (the
 * content-aware-animation test sweeps it against the old formula).
 */
export function videoVolumeAt({
  frame,
  baseVolume,
  inFrames,
  outFrames,
  outStart,
  totalFrames,
  fadeFrames,
  audioWindow = null,
  duck = 1,
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

  let gain;
  if (frame < audioInFrames) gain = baseVolume * (frame / audioInFrames);
  else if (frame < audioOutStart) gain = baseVolume;
  else gain = baseVolume * ((totalFrames - frame) / (totalFrames - audioOutStart));

  if (audioWindow) {
    const start = Math.max(0, Math.min(audioWindow.startFrame ?? 0, totalFrames));
    const end = Math.max(start, Math.min(audioWindow.endFrame ?? totalFrames, totalFrames));
    if (frame < start || frame >= end) return 0;
    const fadeIn = Math.max(0, audioWindow.fadeInFrames ?? 0);
    const fadeOut = Math.max(0, audioWindow.fadeOutFrames ?? 0);
    const inStop = Math.min(start + fadeIn, end);
    const outStop = Math.max(end - fadeOut, start);
    let windowGain = 1;
    if (fadeIn > 0 && frame < inStop) windowGain = (frame - start) / (inStop - start);
    if (fadeOut > 0 && frame >= outStop) windowGain = (end - frame) / (end - outStop);
    gain *= windowGain;
  }

  const duckFactor = Math.max(0, Math.min(duck, 1));
  return gain * duckFactor;
}

/**
 * Resolve a `scene.media` declaration into the two #1525 render inputs.
 *
 * Kept here rather than in MediaBackground so the component does not grow
 * another branch per field (the pixel component is already at its complexity
 * ceiling). Seconds are converted at the composition's fps; the audio window
 * is only built when at least one edge is declared, so an untouched clip keeps
 * the pre-#1525 whole-scene envelope.
 *
 * @param {Object} options
 * @param {Object} options.media - scene.media (audioIn/audioOut/audioFadeIn/audioFadeOut/duckLevel)
 * @param {number} options.fps - composition fps
 * @param {number} options.totalFrames - scene length in frames
 * @param {boolean} options.narrationActive - whether this scene has a TTS track
 * @returns {{ audioWindow: null | {startFrame:number,endFrame:number,fadeInFrames:number,fadeOutFrames:number}, duck: number }}
 */
export function resolveMediaAudio({ media, fps, totalFrames, narrationActive }) {
  const hasAudioWindow = media.audioIn !== undefined || media.audioOut !== undefined;
  const toFrames = (seconds) => Math.round(seconds * fps);
  const audioWindow = hasAudioWindow
    ? {
        startFrame: toFrames(Math.max(0, media.audioIn ?? 0)),
        endFrame: media.audioOut !== undefined ? toFrames(media.audioOut) : totalFrames,
        fadeInFrames: toFrames(Math.max(0, media.audioFadeIn ?? 0.25)),
        fadeOutFrames: toFrames(Math.max(0, media.audioFadeOut ?? 0.25)),
      }
    : null;
  // Ducking is opt-in: a clip with a source window is not assumed to sit under
  // a voice. The provider only sets narrationActive when the scene has a TTS
  // track, so silent scenes keep the full source level.
  const duck =
    narrationActive && media.duckUnderNarration
      ? Math.max(0, Math.min(media.duckLevel ?? 0.25, 1))
      : 1;
  return { audioWindow, duck };
}
