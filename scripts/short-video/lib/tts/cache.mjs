/**
 * Cross-run caching for TTS generation and forced alignment (#198 Item 2).
 *
 * Pipeline re-runs (Gate 1 repair, subtitle-alignment repair, content edits
 * that touch one scene) used to re-run GPU TTS for ALL scenes and re-run the
 * wav2vec2 aligner over every scene even when the inputs were byte-identical.
 * The cache keys:
 *   - scene audio by sha1(engine name + engine config string + scene text
 *     [+ per-scene speed / emotion instruct when present]);
 *   - alignment by a signature over (scene text, scene audio bytes), stored
 *     as `subtitle-timing.meta.json` next to subtitle-timing.json.
 *
 * #423 candidate/approved trust boundary — three planning states per scene:
 *
 *   - **approved** (`scene-{id}.tts-meta.json`): a take that passed the full
 *     verification chain (Quality Gate → acoustic/infra → pacing) under the
 *     CURRENT `SCENE_META_VERSION`, with a sha256 digest over the exact audio
 *     bytes it blessed. Only this state satisfies a cache hit — regeneration
 *     (GPU) is skipped. Any change to the key (text/speed/instruct), the
 *     bytes, or the verification version demotes the entry.
 *   - **candidate** (`scene-{id}.tts-candidate.json`): audio already on disk
 *     whose inputs still match but which is not finally verified — a failed
 *     take that may still be repairable (pacing compensation), an unverified
 *     take (gate skipped / ASR down), or an aborted run's survivor. The next
 *     run re-verifies candidates through the normal gate + pacing ladder
 *     (local ASR, no GPU) instead of paying for a fresh generation.
 *   - **pending**: no usable take — regenerate.
 *
 * Fail-open: unreadable meta, missing audio or key mismatch all plan the
 * scene for regeneration (never a hit). Repair paths pass force:true /
 * useCache:false so a retry genuinely recomputes instead of replaying the
 * bad artifact.
 */

import { createHash } from "crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveSceneSpeed } from "./pacing.mjs";
import { DEFAULT_SILENCE_FLOOR_MS } from "./silence-trim.mjs";

/**
 * Verification version of the approved trust contract (#423). Bump when the
 * Quality Gate / pacing semantics change in a way that makes previously
 * approved takes unverified under the new rules: every approved meta carrying
 * an older version demotes to a candidate and is re-verified (locally, no
 * GPU) before it can be reused as approved again.
 */
export const SCENE_META_VERSION = 1;

/**
 * Version of the post-processing policy that shapes the audio BYTES (#786).
 * Bump when the pause-trim algorithm changes shape (not when only the floor
 * moves — the floor is part of the token).
 */
const SILENCE_TRIM_POLICY_VERSION = "v1";

/**
 * Cache-key token for the engine's post-processing policy (#786).
 *
 * The silence trim rewrites the audio after synthesis: same text, same speed,
 * same instruct, different bytes. Without this token a take approved under the
 * old untrimmed policy keeps hitting the cache, so the new pacing never reaches
 * existing packs. The token — not `SCENE_META_VERSION` — is the right lever:
 * `SCENE_META_VERSION` demotes to a locally re-verified candidate (same bytes),
 * which would re-approve the untrimmed audio without regenerating it.
 *
 * Engines that do not trim (F5/MLX) keep the legacy key shape. The comparison
 * is `=== false` on purpose: `postProcessAudio()` defaults `useSilenceFilter`
 * to true, so an engine descriptor that omits the flag still trims — treating
 * "absent" as "no trim" would hand such an engine an untrimmed key.
 *
 * @param {{useSilenceFilter?: boolean, silenceFloorMs?: number}} engine
 * @returns {string} "" for engines without the trim policy
 */
function silenceTrimToken(engine) {
  if (engine?.useSilenceFilter === false) return "";
  const floor = Number.isFinite(engine.silenceFloorMs)
    ? engine.silenceFloorMs
    : DEFAULT_SILENCE_FLOOR_MS;
  return `trim=${SILENCE_TRIM_POLICY_VERSION}:${floor}`;
}

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
 * The per-scene emotion instruct (#244) joins the key only when the engine
 * exposes `instructForScene(scene)`. Same trap as speed: editing the instruct
 * standard (#270 — the single source is `lib/tts/instruct.mjs` →
 * INSTRUCT_STANDARD; engines carry no local copy) must not replay audio
 * generated under the old instruct. Engines without the hook keep the legacy
 * key shape.
 *
 * The silence-trim policy joins the key when the engine trims pauses (#786) —
 * see silenceTrimToken().
 *
 * @param {{name: string, info: string, useSilenceFilter?: boolean, silenceFloorMs?: number}} engine
 * @param {string} text - scene voiceover text
 * @param {number} [speed] - per-scene native speed (#235); omit for 1.0
 * @param {string} [instruct] - resolved emotion instruct (#244); omit/empty for legacy shape
 * @returns {string} sha1 hex
 */
export function computeSceneKey(engine, text, speed = 1.0, instruct = "") {
  const hash = createHash("sha1").update(`${engine.name}|${engine.info}|${text}`);
  if (speed !== 1.0) hash.update(`|speed=${speed}`);
  if (instruct) hash.update(`|inst=${createHash("sha1").update(instruct).digest("hex")}`);
  const trim = silenceTrimToken(engine);
  if (trim) hash.update(`|${trim}`);
  return hash.digest("hex");
}

/**
 * Cache key for one scene at a given speed (#423). Single source for the
 * text/instruct resolution shared by the cache-hit check here and the meta
 * writer in registry.mjs — composing the key in two places that drift apart
 * would make a freshly written take miss its own entry on the next run.
 *
 * @param {{name: string, info: string}} engine
 * @param {{voiceover?: string, ttsText?: string}} scene
 * @param {number} [speed] - native speed that produced / will produce the take
 * @returns {string} sha1 hex
 */
export function sceneCacheKey(engine, scene, speed = resolveSceneSpeed(scene)) {
  return computeSceneKey(
    engine,
    scene.ttsText || scene.voiceover,
    speed,
    resolveSceneInstruct(engine, scene),
  );
}

/** Sidecar meta path for a scene's APPROVED TTS result. */
function sceneMetaPath(outputDir, sceneId) {
  return join(outputDir, `scene-${sceneId}.tts-meta.json`);
}

/** Sidecar path for a scene's not-yet-approved (candidate) take. */
function sceneCandidatePath(outputDir, sceneId) {
  return join(outputDir, `scene-${sceneId}.tts-candidate.json`);
}

/** Read a JSON sidecar; any parse/IO failure yields null (fail-open). */
function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Atomic JSON write: temp file + rename, so a crash mid-write cannot leave a
 * half-written sidecar for the next run to parse.
 */
function writeJsonAtomic(path, data) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * sha256 over the exact audio bytes — the binding that makes an approval
 * invalid the moment the file is replaced by anything else.
 *
 * @param {string} audioPath
 * @returns {string|null} hex digest, or null when the file is missing/unreadable
 */
export function computeAudioDigest(audioPath) {
  try {
    return createHash("sha256").update(readFileSync(audioPath)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Whether an on-disk approved meta still vouches for the current bytes.
 *
 * @param {object} meta
 * @param {string} audioPath
 * @returns {boolean}
 */
function isApprovedAndTrusted(meta, audioPath) {
  return (
    meta.status === "approved" &&
    meta.metaVersion === SCENE_META_VERSION &&
    typeof meta.audioDigest === "string" &&
    meta.audioDigest === computeAudioDigest(audioPath)
  );
}

/**
 * Why an existing entry lost its approved status (surfaced on the candidate).
 */
function untrustedReason(meta, candidateMeta, currentKey) {
  // A candidate sidecar written after the meta lost trust describes the
  // newest take state — prefer its reason when it is for the same inputs.
  if (
    candidateMeta &&
    typeof candidateMeta.reason === "string" &&
    candidateMeta.reason &&
    candidateMeta.key === currentKey
  ) {
    return candidateMeta.reason;
  }
  if (meta.status !== "approved") return "unapproved-meta";
  if (meta.metaVersion !== SCENE_META_VERSION) return "verification-version-changed";
  return "audio-bytes-changed";
}

/**
 * Persist a scene's APPROVED cache meta next to its audio file (#423).
 *
 * The meta binds the current `SCENE_META_VERSION` and a sha256 over the exact
 * bytes: promotion is refused (returns false) when the audio file is missing,
 * because an approval without bytes would be a lie the next run cannot check.
 * Writing also clears the candidate sidecar the entry supersedes.
 *
 * @param {string} outputDir
 * @param {number} sceneId
 * @param {{key: string, duration: number, engine: string, audioPath?: string, ttsSpeed?: number}} meta
 * @returns {boolean} true when the approved entry was written
 */
export function writeSceneMeta(outputDir, sceneId, meta) {
  const audioPath = meta.audioPath ?? join(outputDir, `scene-${sceneId}.wav`);
  const audioDigest = computeAudioDigest(audioPath);
  if (!audioDigest) return false;
  writeJsonAtomic(sceneMetaPath(outputDir, sceneId), {
    ...meta,
    audioPath,
    status: "approved",
    metaVersion: SCENE_META_VERSION,
    audioDigest,
    verifiedAt: new Date().toISOString(),
  });
  rmSync(sceneCandidatePath(outputDir, sceneId), { force: true });
  return true;
}

/**
 * Record a scene take that exists on disk but is NOT approved (#423):
 * unverified (gate skipped / ASR down), gate-failed, pacing-repair-pending or
 * an aborted run's survivor. The next run re-verifies it instead of
 * regenerating; it can never satisfy a cache hit by itself.
 *
 * Refuses (returns false) when the audio file is missing — there is nothing
 * to re-verify.
 *
 * @param {string} outputDir
 * @param {number} sceneId
 * @param {{key: string, duration: number, engine: string, reason?: string, audioPath?: string, ttsSpeed?: number}} meta
 * @returns {boolean} true when the candidate sidecar was written
 */
export function writeCandidateSceneMeta(outputDir, sceneId, meta) {
  const audioPath = meta.audioPath ?? join(outputDir, `scene-${sceneId}.wav`);
  if (!existsSync(audioPath)) return false;
  writeJsonAtomic(sceneCandidatePath(outputDir, sceneId), {
    ...meta,
    audioPath,
    status: "candidate",
  });
  return true;
}

/**
 * Re-bind a trusted approved entry to its current bytes (#423, alignment
 * tail-cut). `runAlignmentGuards` trims trailing silence in place AFTER a take
 * was approved; without the refresh the digest would mismatch and every later
 * run would demote the scene to a candidate even though the bytes are the
 * pipeline's own cut of an approved take.
 *
 * Only ever refreshes an entry that is approved under the CURRENT version —
 * it never invents trust for an unverified take.
 *
 * @param {string} outputDir
 * @param {number} sceneId
 * @param {{duration?: number}} [patch] - e.g. the post-cut duration
 * @returns {boolean} true when the entry was refreshed
 */
export function refreshApprovedSceneMeta(outputDir, sceneId, patch = {}) {
  const meta = readJsonSafe(sceneMetaPath(outputDir, sceneId));
  if (!meta || meta.status !== "approved" || meta.metaVersion !== SCENE_META_VERSION) return false;
  const audioPath = meta.audioPath ?? join(outputDir, `scene-${sceneId}.wav`);
  const audioDigest = computeAudioDigest(audioPath);
  if (!audioDigest) return false;
  writeJsonAtomic(sceneMetaPath(outputDir, sceneId), {
    ...meta,
    ...patch,
    audioPath,
    status: "approved",
    metaVersion: SCENE_META_VERSION,
    audioDigest,
  });
  return true;
}

/**
 * Re-bind a candidate sidecar to its current state (#423, alignment tail-cut).
 * The cut changes the duration the next run's gate measures WPM against; the
 * bytes themselves stay unverified, so only the recorded fields are refreshed.
 * Never touches an approved entry (that path goes through
 * `refreshApprovedSceneMeta`, which also re-binds the digest).
 *
 * @param {string} outputDir
 * @param {number} sceneId
 * @param {{duration?: number}} [patch]
 * @returns {boolean} true when the sidecar was refreshed
 */
export function refreshCandidateSceneMeta(outputDir, sceneId, patch = {}) {
  const meta = readJsonSafe(sceneCandidatePath(outputDir, sceneId));
  if (!meta || meta.status !== "candidate") return false;
  const audioPath = meta.audioPath ?? join(outputDir, `scene-${sceneId}.wav`);
  if (!existsSync(audioPath)) return false;
  writeJsonAtomic(sceneCandidatePath(outputDir, sceneId), {
    ...meta,
    ...patch,
    audioPath,
    status: "candidate",
  });
  return true;
}

/**
 * Resolve the per-scene emotion instruct for the cache key (#244).
 *
 * Key-side wrapper over the engine's own resolver: registry.mjs hands the same
 * `engine.instructForScene` to the Quality Gate, so the key and the validated
 * instruct cannot drift apart. Returns "" for engines without an instruct
 * concept (legacy key shape).
 */
function resolveSceneInstruct(engine, scene) {
  return engine?.instructForScene?.(scene) ?? "";
}

/**
 * Human-actionable reason a scene is pending (#953).
 *
 * The cache key is a one-way hash, so the planner cannot see WHICH input
 * moved. Classify from what the sidecars still record:
 *   - no usable sidecar + no audio  → missing-audio (never generated)
 *   - audio on disk but no sidecar  → missing-meta (aborted/unverified take)
 *   - unreadable sidecar            → corrupt-meta
 *   - sidecar points at deleted wav → missing-audio
 *   - sidecar names another engine  → engine-changed
 *   - stored speed ≠ the speed this run would use → speed-changed
 *   - legacy sidecar (no recorded speed) whose key matches at 1.0x but not at
 *     the resolved speed (scene.ttsSpeed / TTS_SPEED) → speed-changed
 *   - otherwise                     → text-changed (the key also folds the
 *                                     per-scene instruct in, so an instruct
 *                                     edit lands here too)
 *
 * @param {object} args
 * @param {string} args.outputDir
 * @param {{name: string}} args.engine
 * @param {{id: number}} args.scene
 * @param {object|null} args.approvedMeta
 * @param {object|null} args.candidateMeta
 * @param {boolean} args.corruptSidecar
 * @param {(meta: object) => number} args.speedForMeta
 * @param {string} args.baselineKey - key at 1.0x, to tell a legacy speed miss
 *   from a text edit
 * @returns {string}
 */
function classifyPendingMiss({
  outputDir,
  engine,
  scene,
  approvedMeta,
  candidateMeta,
  corruptSidecar,
  speedForMeta,
  baselineKey,
}) {
  const meta = [approvedMeta, candidateMeta].find((m) => m && typeof m.duration === "number");
  if (!meta) {
    if (corruptSidecar) return "corrupt-meta";
    const audioPath = join(outputDir, `scene-${scene.id}.wav`);
    return existsSync(audioPath) ? "missing-meta" : "missing-audio";
  }
  const audioPath = meta.audioPath ?? join(outputDir, `scene-${scene.id}.wav`);
  if (!existsSync(audioPath)) return "missing-audio";
  if (typeof meta.engine === "string" && meta.engine !== engine.name) return "engine-changed";
  const storedSpeed = Number.isFinite(meta.ttsSpeed) ? meta.ttsSpeed : null;
  if (storedSpeed !== null && storedSpeed !== speedForMeta(meta)) return "speed-changed";
  // Legacy sidecar: no recorded speed, but the take was 1.0x and this run
  // resolves higher (hook floor / TTS_SPEED). Its key proves the text matches.
  if (storedSpeed === null && meta.key === baselineKey && speedForMeta(meta) !== 1.0) {
    return "speed-changed";
  }
  return "text-changed";
}

/**
 * Split scenes into approved hits, candidates and pending (#423).
 *
 * - A hit requires a readable meta whose key matches (under the same
 *   speed-resolution fallback as the writer), the audio file to still exist,
 *   AND the current verification version + matching byte digest. `cached: true`
 *   results skip generation entirely.
 * - A candidate requires a matching key and an existing audio file; the result
 *   is surfaced for re-verification (never a hit). Its `reason` records why it
 *   is not approved.
 * - Everything else (missing/corrupt meta, key mismatch, missing audio) is
 *   pending — fail-open to regeneration. Each pending scene has a parallel
 *   entry in `misses` naming why (#953) so the spend can be stated before the
 *   batch runs.
 *
 * @param {string} outputDir
 * @param {Array<{id: number, voiceover: string}>} scenes
 * @param {{name: string, info: string}} engine
 * @returns {{
 *   approved: Array<{sceneId: number, audioPath: string, duration: number, cached: true, ttsSpeed: number}>,
 *   candidates: Array<{sceneId: number, audioPath: string, duration: number, reason: string, candidate: true, ttsSpeed: number}>,
 *   pending: Array,
 *   misses: Array<{sceneId: number, reason: string}>,
 * }}
 */
export function planTtsScenes(outputDir, scenes, engine) {
  const approved = [];
  const candidates = [];
  const pending = [];
  const misses = [];

  for (const scene of scenes) {
    const resolvedSpeed = resolveSceneSpeed(scene);

    // #252: meta.ttsSpeed records a pacing-loop compensation. A fresh scene
    // object resolves to the 1.0 baseline, so without this fallback every
    // re-run would regenerate and re-compensate the same scene. An explicit
    // override (scene.ttsSpeed / TTS_SPEED env → resolved ≠ 1.0) beats the
    // stored value; legacy meta without the field behaves exactly as before.
    const speedForMeta = (meta) => {
      const storedSpeed = Number.isFinite(meta?.ttsSpeed) ? meta.ttsSpeed : null;
      return resolvedSpeed !== 1.0 || storedSpeed === null ? resolvedSpeed : storedSpeed;
    };
    const keyForMeta = (meta) => sceneCacheKey(engine, scene, speedForMeta(meta));

    const metaPath = sceneMetaPath(outputDir, scene.id);
    const candidatePath = sceneCandidatePath(outputDir, scene.id);
    const approvedMeta = readJsonSafe(metaPath);
    const candidateMeta = readJsonSafe(candidatePath);
    // readJsonSafe folds "missing" and "unparseable" into null; only the file
    // existing separates them, and the difference decides corrupt-meta.
    const corruptSidecar =
      (!approvedMeta && existsSync(metaPath)) || (!candidateMeta && existsSync(candidatePath));

    // 1. Approved hit — the only path that skips re-verification.
    if (approvedMeta && typeof approvedMeta.duration === "number") {
      const audioPath = approvedMeta.audioPath ?? join(outputDir, `scene-${scene.id}.wav`);
      const key = keyForMeta(approvedMeta);
      if (approvedMeta.key === key && existsSync(audioPath)) {
        if (isApprovedAndTrusted(approvedMeta, audioPath)) {
          approved.push({
            sceneId: scene.id,
            audioPath,
            duration: approvedMeta.duration,
            cached: true,
            ttsSpeed: speedForMeta(approvedMeta),
          });
        } else {
          candidates.push({
            sceneId: scene.id,
            audioPath,
            duration: approvedMeta.duration,
            reason: untrustedReason(approvedMeta, candidateMeta, key),
            candidate: true,
            ttsSpeed: speedForMeta(approvedMeta),
          });
        }
        continue;
      }
    }

    // 2. Candidate sidecar — audio on disk, inputs match, awaiting (re-)verification.
    if (candidateMeta && typeof candidateMeta.duration === "number") {
      const audioPath = candidateMeta.audioPath ?? join(outputDir, `scene-${scene.id}.wav`);
      if (candidateMeta.key === keyForMeta(candidateMeta) && existsSync(audioPath)) {
        candidates.push({
          sceneId: scene.id,
          audioPath,
          duration: candidateMeta.duration,
          reason:
            typeof candidateMeta.reason === "string" && candidateMeta.reason
              ? candidateMeta.reason
              : "unverified",
          candidate: true,
          // The speed that produced the take on disk — re-promotion must
          // record it, or a compensated take would be relabelled 1.0x (#252).
          ttsSpeed: speedForMeta(candidateMeta),
        });
        continue;
      }
    }

    pending.push(scene);
    misses.push({
      sceneId: scene.id,
      reason: classifyPendingMiss({
        outputDir,
        engine,
        scene,
        approvedMeta,
        candidateMeta,
        corruptSidecar,
        speedForMeta,
        baselineKey: sceneCacheKey(engine, scene, 1.0),
      }),
    });
  }
  return { approved, candidates, pending, misses };
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
  writeFileSync(join(outputDir, "subtitle-timing.meta.json"), JSON.stringify({ signature }));
}
