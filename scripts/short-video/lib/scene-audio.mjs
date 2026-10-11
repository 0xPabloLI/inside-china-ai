/**
 * Scene audio resolution shared by the render entry points (#421 review).
 *
 * The TTS registry writes `scene-<id>.tts-meta.json` next to every approved
 * take, recording the path the engine actually produced (wav for the current
 * F5/MLX/Kaggle engines, mp3 for the retired edge-tts). Legacy audio dirs can
 * still hold BOTH extensions for one scene; probing by extension then picks
 * the stale take, which re-renders old audio AND makes the alignment
 * signature (#198) mismatch — a false "stale timing" at the render boundary.
 *
 * Resolve through the sidecar first (it is the pipeline's own record of the
 * take behind the current timing), keep extension probing as the fallback for
 * pre-sidecar content dirs.
 */
import { existsSync, readFileSync } from "fs";
import { isAbsolute, join, resolve, sep } from "path";

/** Extension order for the fallback probe — the historical default first. */
const FALLBACK_EXTS = [".mp3", ".wav"];

/**
 * @param {string} audioDir - `<outputDir>/audio`
 * @param {number} sceneId
 * @returns {string|null} path of the take, or null when none exists
 */
export function resolveSceneAudioPath(audioDir, sceneId) {
  const metaPath = join(audioDir, `scene-${sceneId}.tts-meta.json`);
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const recorded = meta?.audioPath;
      if (recorded) {
        const path = isAbsolute(recorded) ? recorded : join(audioDir, recorded);
        // The take must live inside the audio dir: a tampered or hand-edited
        // sidecar must not redirect the read elsewhere on disk.
        if (existsSync(path) && resolve(path).startsWith(resolve(audioDir) + sep)) {
          return path;
        }
      }
    } catch {
      // corrupt sidecar — fall through to extension probing
    }
  }
  return (
    FALLBACK_EXTS.map((ext) => join(audioDir, `scene-${sceneId}${ext}`)).find((p) =>
      existsSync(p),
    ) ?? null
  );
}
