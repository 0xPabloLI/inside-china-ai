/**
 * Output-path helpers for the final video.
 *
 * The FFmpeg scene-by-scene assembler (`assembleVideo`) lived here until the
 * HTML/Playwright render path was retired (decision 59,
 * spec-text-overflow-hardening.md): it existed to concatenate the WebM clips
 * recorded by record-scenes.mjs, and Remotion renders the whole composition
 * itself. Final assembly now lives in lib/render-remotion.mjs; the post-roll
 * helpers (burnSubtitles / mixBgm / normalizeLoudness) live in post-process.mjs.
 */

import { readdirSync } from "fs";
import { join } from "path";

/**
 * Resolve the canonical output video for a pipeline: the latest versioned
 * `{filePrefix}-v{version}-short.mp4`, falling back to the legacy unversioned
 * `{filePrefix}-short.mp4` for old outputs. Version suffixes sort
 * lexicographically (vYYYY-MM-DDTHH-MM-SS), matching assemble's own ordering.
 */
export function resolveOutputVideo(outputDir, filePrefix) {
  let latest;
  try {
    latest = readdirSync(outputDir)
      .filter((f) => f.startsWith(`${filePrefix}-v`) && f.endsWith("-short.mp4"))
      .sort()
      .reverse()[0];
  } catch {
    // outputDir missing or unreadable — fall through to the legacy path.
  }
  return latest ? join(outputDir, latest) : join(outputDir, `${filePrefix}-short.mp4`);
}
