/**
 * Cross-run caching for TTS generation and forced alignment (#198 Item 2).
 *
 * Pipeline re-runs (Gate 1 repair, subtitle-alignment repair, content edits
 * that touch one scene) used to re-run GPU TTS for ALL scenes and re-run the
 * wav2vec2 aligner over every scene even when the inputs were byte-identical.
 * The cache keys:
 *   - scene audio by sha1(engine name + engine config string + scene text),
 *     stored as a sidecar `scene-{id}.tts-meta.json` next to the audio file;
 *   - alignment by a signature over (scene text, scene audio bytes), stored
 *     as `subtitle-timing.meta.json` next to subtitle-timing.json.
 *
 * Fail-open: unreadable meta, missing audio or key mismatch all plan the
 * scene for regeneration. Repair paths pass force:true / useCache:false so
 * a retry genuinely recomputes instead of replaying the bad artifact.
 */

import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveSceneSpeed } from "./pacing.mjs";

/**
 * Stable cache key for one scene's TTS audio.
 *
 * The engine's `info` string carries its identity-relevant config (reference
 * voice, speed, model) — hashing it alongside the name means any config change
 * invalidates the cached audio without a per-engine signature API.
 *
 * The per-scene pacing speed (#235) joins the key only when it deviates from
 * 1.0, so legacy 1.0 cache entries keep their keys and a speed change never
 * replays 1.0x cached audio.
 *
 * @param {{name: string, info: string}} engine
 * @param {string} text - scene voiceover text
 * @param {number} [speed] - per-scene native speed (#235); omit for 1.0
 * @returns {string} sha1 hex
 */
export function computeSceneKey(engine, text, speed = 1.0) {
  const hash = createHash("sha1").update(`${engine.name}|${engine.info}|${text}`);
  if (speed !== 1.0) hash.update(`|speed=${speed}`);
  return hash.digest("hex");
}

/** Sidecar meta path for a scene's TTS result. */
function sceneMetaPath(outputDir, sceneId) {
  return join(outputDir, `scene-${sceneId}.tts-meta.json`);
}

/**
 * Persist a scene's TTS cache meta next to its audio file.
 *
 * @param {string} outputDir
 * @param {number} sceneId
 * @param {{key: string, duration: number, engine: string}} meta
 */
export function writeSceneMeta(outputDir, sceneId, meta) {
  writeFileSync(sceneMetaPath(outputDir, sceneId), JSON.stringify(meta));
}

/**
 * Split scenes into cache hits (reuse existing audio) and pending (must be
 * generated). A hit requires a readable meta whose key matches AND whose
 * audio file still exists — anything else falls back to regeneration. The
 * audio filename comes from the meta (engines differ: F5/Qwen write .wav,
 * edge-tts/say write .mp3), so every engine's output can be cached.
 *
 * @param {string} outputDir
 * @param {Array<{id: number, voiceover: string}>} scenes
 * @param {{name: string, info: string}} engine
 * @returns {{cached: Array<{sceneId: number, audioPath: string, duration: number, cached: true}>, pending: Array}}
 */
export function planTtsScenes(outputDir, scenes, engine) {
  const cached = [];
  const pending = [];
  for (const scene of scenes) {
    const spokenText = scene.ttsText || scene.voiceover;
    const key = computeSceneKey(engine, spokenText, resolveSceneSpeed(scene));
    let hit = null;
    try {
      const meta = JSON.parse(readFileSync(sceneMetaPath(outputDir, scene.id), "utf8"));
      const audioPath = meta.audioPath ?? join(outputDir, `scene-${scene.id}.wav`);
      if (meta.key === key && typeof meta.duration === "number" && existsSync(audioPath)) {
        hit = { sceneId: scene.id, audioPath, duration: meta.duration, cached: true };
      }
    } catch {
      // missing or corrupt meta → regenerate
    }
    if (hit) cached.push(hit);
    else pending.push(scene);
  }
  return { cached, pending };
}

/**
 * Signature over the alignment inputs: per-scene text + audio file bytes.
 * A matching signature means the existing subtitle-timing.json was computed
 * from exactly these inputs and can be reused.
 *
 * @param {Array<{id: number, voiceover: string}>} scenes
 * @param {Array<{sceneId: number, audioPath: string}>} ttsResults
 * @returns {string} sha1 hex, or null when no scenes have audio
 */
export function computeAlignmentSignature(scenes, ttsResults) {
  const hash = createHash("sha1");
  for (const r of ttsResults ?? []) {
    const scene = scenes.find((s) => s.id === r.sceneId);
    // ttsText (spoken track) drives the alignment; fall back to voiceover
    // for scenes that never got normalized.
    const text = scene?.ttsText ?? scene?.voiceover ?? "";
    hash.update(`${r.sceneId}|${text}|`);
    try {
      hash.update(readFileSync(r.audioPath));
    } catch {
      hash.update("<missing>");
    }
  }
  return hash.digest("hex");
}

/**
 * Compare the stored alignment meta against the current signature.
 *
 * @param {string} outputDir - directory holding subtitle-timing.json
 * @param {string} signature - computeAlignmentSignature() output
 * @returns {"valid"|"stale"|"missing"}
 */
export function alignmentCacheState(outputDir, signature) {
  const timingPath = join(outputDir, "subtitle-timing.json");
  const metaPath = join(outputDir, "subtitle-timing.meta.json");
  if (!existsSync(timingPath) || !existsSync(metaPath)) return "missing";
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    return meta.signature === signature ? "valid" : "stale";
  } catch {
    return "stale";
  }
}

/** Persist the alignment cache meta after a successful alignment run. */
export function writeAlignmentMeta(outputDir, signature) {
  writeFileSync(
    join(outputDir, "subtitle-timing.meta.json"),
    JSON.stringify({ signature }),
  );
}
