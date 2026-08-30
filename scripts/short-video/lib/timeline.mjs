/**
 * Video timeline — single source of truth for scene durations and offsets.
 *
 * The final video is a concatenation of per-scene clips. A clip's length is
 * defined in FRAMES, not in floating-point seconds: FFmpeg encodes whole frames,
 * so asking for 4.5227s at 30fps yields 4.5333s (136 frames). Anything that
 * assumes the requested duration drifts a few milliseconds per scene.
 *
 * Both the assembler (which encodes the clips) and the subtitle generator
 * (which offsets each scene on the global timeline) derive their numbers here,
 * so they cannot disagree.
 */

/** Output frame rate. Must match the `-r` flag used when encoding scenes. */
export const FPS = 30;

/** Recording buffer appended to each scene's voiceover, in seconds. */
export const SCENE_BUFFER = 0.5;

/**
 * Frames consumed by one TransitionSeries transition (Remotion path only).
 *
 * TransitionSeries OVERLAPS: each transition subtracts its own length from the
 * following scene's start (see `@remotion/transitions`
 * `resolvedTransitionOffsets -= duration`). Callers that place audio or read the
 * visual timeline must account for it — see `sceneTimeline()`.
 */
export const TRANSITION_FRAMES = 10;

// Guards against `4.5 * 30 = 135.00000000000003` rounding up to 136 frames.
const FRAME_EPSILON = 1e-6;

/**
 * Whole frames needed to cover `seconds`, rounded up.
 *
 * @param {number} seconds
 * @param {number} [fps]
 * @returns {number}
 */
export function frameCount(seconds, fps = FPS) {
  return Math.ceil(seconds * fps - FRAME_EPSILON);
}

/**
 * Frames in one scene's clip: voiceover plus recording buffer, frame-aligned.
 *
 * @param {number} ttsDuration - Voiceover audio duration in seconds.
 * @param {number} [fps]
 * @returns {number}
 */
export function sceneClipFrames(ttsDuration, fps = FPS) {
  return Math.max(1, frameCount(ttsDuration + SCENE_BUFFER, fps));
}

/**
 * Frame-aligned clip length in seconds. This is the exact length FFmpeg produces.
 *
 * @param {number} ttsDuration
 * @param {number} [fps]
 * @returns {number}
 */
export function sceneClipDuration(ttsDuration, fps = FPS) {
  return sceneClipFrames(ttsDuration, fps) / fps;
}

/**
 * @typedef {Object} SceneTimelineEntry
 * @property {number} sceneId
 * @property {number} ttsDuration - Voiceover duration in seconds.
 * @property {number} clipFrames  - Frames in the assembled clip.
 * @property {number} clipDuration - Clip length in seconds (clipFrames / fps).
 * @property {number} visualFrames - Frames allocated to the scene's visual
 *   Sequence. For every non-final scene this is `clipFrames + transitionOverlap`,
 *   which is exactly what TransitionSeries subtracts again when it overlaps the
 *   scenes — so the visual starts on the plain running sum.
 * @property {number} visualDuration - `visualFrames / fps`.
 * @property {number} visualStartFrames - Absolute frame where the scene's visual
 *   begins in the composition.
 * @property {number} offset - Clip start on the final video timeline, in seconds.
 * @property {number} offsetFrames - `offset` in frames.
 */

/**
 * Build the scene timeline: clip lengths plus their absolute start offsets.
 *
 * Single source of truth for every track — visual Sequences, audio, subtitles
 * and frame sampling must all read their offsets from here.
 *
 * @param {Array<{sceneId: number, duration: number}>} sceneDurations
 * @param {{fps?: number, transitionOverlap?: number}} [options]
 *   `transitionOverlap` is the per-transition frame count used by
 *   TransitionSeries (Remotion path). Playwright path passes 0 / omits it.
 * @returns {SceneTimelineEntry[]}
 */
export function sceneTimeline(sceneDurations, options = {}) {
  const { fps = FPS, transitionOverlap = 0 } = options;
  const timeline = [];
  let offsetFrames = 0;
  const scenes = sceneDurations ?? [];

  scenes.forEach((scene, index) => {
    const clipFrames = sceneClipFrames(scene.duration, fps);
    const isFinal = index === scenes.length - 1;
    const visualFrames = clipFrames + (isFinal ? 0 : transitionOverlap);

    timeline.push({
      sceneId: scene.sceneId,
      ttsDuration: scene.duration,
      clipFrames,
      clipDuration: clipFrames / fps,
      visualFrames,
      visualDuration: visualFrames / fps,
      visualStartFrames: offsetFrames,
      offset: offsetFrames / fps,
      offsetFrames,
    });
    offsetFrames += clipFrames;
  });

  return timeline;
}

/**
 * Total composition frames for a schedule.
 *
 * Under `transitionOverlap > 0` the allocated visual frames exceed this by
 * `(n - 1) * transitionOverlap`; TransitionSeries gives those back when it
 * overlaps the scenes, so the rendered video is exactly this long.
 *
 * @param {SceneTimelineEntry[]} schedule
 * @returns {number}
 */
export function scheduleTotalFrames(schedule) {
  return schedule.reduce((sum, entry) => sum + entry.clipFrames, 0);
}

/**
 * Look up a scene on the timeline.
 *
 * Throws rather than returning a zero-length placeholder: a missing scene means
 * the alignment data and the audio manifest disagree, and silently treating it
 * as 0s would shift every later scene's subtitles.
 *
 * @param {SceneTimelineEntry[]} timeline
 * @param {number} sceneId
 * @returns {SceneTimelineEntry}
 */
export function findScene(timeline, sceneId) {
  const entry = timeline.find((s) => s.sceneId === sceneId);
  if (!entry) {
    throw new Error(
      `No duration recorded for scene ${sceneId} — subtitle timing and audio manifest disagree`,
    );
  }
  return entry;
}
