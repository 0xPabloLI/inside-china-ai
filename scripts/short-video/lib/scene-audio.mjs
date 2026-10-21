/**
 * Scene audio resolution shared by the render entry points (#421 review) and
 * the digital-human planner (#566).
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
 *
 * Two consumers, one contract (#566 drift fix):
 *   - render entry points need only the path → `resolveSceneAudioPath`;
 *   - digital-human planning needs duration + provenance → `resolveSceneAudioInfo`.
 * Both share the same sidecar chain, the same audio-dir containment check and
 * the same extension order, so a take cannot resolve differently per consumer.
 */
import { existsSync, readFileSync } from "fs";
import { isAbsolute, join, resolve, sep } from "path";

/**
 * Extension order for the fallback probe. This is the render entry points'
 * historical contract (pre-sidecar dirs); #566 unifies the digital-human
 * planner onto it instead of inventing a second order. A sidecar always wins,
 * so the order only decides between two takes in pre-sidecar content dirs.
 */
const FALLBACK_EXTS = [".mp3", ".wav"];

/** Sidecar chain for duration-bearing resolution — approved take first. */
const SIDECAR_SOURCES = [
  ["tts-meta", ".tts-meta.json"],
  ["tts-candidate", ".tts-candidate.json"],
];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** The take must live inside the audio dir: a tampered or hand-edited sidecar
 * must not redirect the read elsewhere on disk. */
function isInsideAudioDir(audioDir, path) {
  return resolve(path).startsWith(resolve(audioDir) + sep);
}

/**
 * Path recorded by a sidecar, or null when the sidecar is absent, records no
 * path, points at a missing file, or points outside the audio dir.
 */
function recordedTakePath(audioDir, sceneId, suffix) {
  const metaPath = join(audioDir, `scene-${sceneId}${suffix}`);
  if (!existsSync(metaPath)) return null;
  const recorded = readJson(metaPath)?.audioPath;
  if (!recorded) return null;
  const path = isAbsolute(recorded) ? recorded : join(audioDir, recorded);
  return existsSync(path) && isInsideAudioDir(audioDir, path) ? path : null;
}

function probeFallbackPath(audioDir, sceneId) {
  return (
    FALLBACK_EXTS.map((ext) => join(audioDir, `scene-${sceneId}${ext}`)).find((p) =>
      existsSync(p),
    ) ?? null
  );
}

/**
 * Path-only view used by the render entry points.
 *
 * @param {string} audioDir - `<outputDir>/audio`
 * @param {number} sceneId
 * @returns {string|null} path of the take, or null when none exists
 */
export function resolveSceneAudioPath(audioDir, sceneId) {
  return (
    recordedTakePath(audioDir, sceneId, ".tts-meta.json") ?? probeFallbackPath(audioDir, sceneId)
  );
}

/**
 * Duration-bearing view used by digital-human planning. Priority: #198 cache
 * meta → #423 candidate sidecar (a take on disk that is not finally verified;
 * a skip-gate or aborted run leaves only this record) → legacy
 * scene-durations.json.
 *
 * The recorded path is returned even when the file is missing — fail-closed
 * stays with the consumer (digital-human planning refuses to plan a duration
 * whose audio file is gone). Returns null when no source knows the scene.
 *
 * @param {string} audioDir - `output/{pipelineId}/audio`
 * @param {number} sceneId
 * @returns {{audioPath: string, duration: number, durationSource: "tts-meta"|"tts-candidate"|"scene-durations"}|null}
 */
export function resolveSceneAudioInfo(audioDir, sceneId) {
  for (const [durationSource, suffix] of SIDECAR_SOURCES) {
    const metaPath = join(audioDir, `scene-${sceneId}${suffix}`);
    if (!existsSync(metaPath)) continue;
    const meta = readJson(metaPath);
    if (!meta || typeof meta.duration !== "number" || !(meta.duration > 0)) continue;
    return {
      audioPath:
        recordedTakePath(audioDir, sceneId, suffix) ?? join(audioDir, `scene-${sceneId}.wav`),
      duration: meta.duration,
      durationSource,
    };
  }

  const durationsPath = join(audioDir, "scene-durations.json");
  if (existsSync(durationsPath)) {
    const all = readJson(durationsPath);
    const entry = (Array.isArray(all) ? all : all?.scenes)?.find((d) => d.sceneId === sceneId);
    if (entry && typeof entry.duration === "number" && entry.duration > 0) {
      return {
        audioPath: probeFallbackPath(audioDir, sceneId) ?? join(audioDir, `scene-${sceneId}.wav`),
        duration: entry.duration,
        durationSource: "scene-durations",
      };
    }
  }

  return null;
}
