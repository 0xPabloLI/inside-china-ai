/**
 * B-roll window — the one place that says how long a sourced clip runs.
 *
 * The product decision is "B-roll = the first 8 seconds". Three consumers
 * encode it today: the yt-dlp `--download-sections` arg (both the VDL builder
 * and asset-sourcer's own yt-dlp download) and the douyin ffmpeg `-t`. Keeping
 * the number in one module means a future change to the window cannot leave
 * one route clipping a different length (#314 review).
 *
 * @module media-window
 */

/** Length of a B-roll slice, in seconds. */
export const BROLL_CLIP_SECONDS = 8;

/**
 * The yt-dlp `--download-sections` spec for a B-roll slice: `*0:00-m:ss`.
 * The minute is not zero-padded — this is the shape the existing arg builders
 * and their tests already use (`*0:00-0:08`).
 *
 * @param {number} [seconds]
 * @returns {string}
 */
export function brollSectionSpec(seconds = BROLL_CLIP_SECONDS) {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return `*0:00-${mm}:${ss}`;
}
