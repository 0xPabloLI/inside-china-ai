/**
 * Digital-human generation orchestration (#214, spec docs/specs/spec-digital-human-pipeline.md).
 *
 * Three-state CLI backend: plan (this ticket, T3) → approve (HITL) → run/resume
 * (ticket 04). plan is a pure dry-run: it reads package scene-data and the
 * package's TTS artifacts, computes the segment split and cost estimate, and
 * writes exactly ONE file — the plan JSON. It performs no remote calls and
 * never touches scene-data or remote-task state.
 *
 * ─── Segment-boundary strategy (TTS precision investigation, spec Further Notes) ───
 *
 *   1. Duration: precise. scene-{id}.tts-meta.json (#198 cache) stores the
 *      ffprobe duration of the final post-processed audio (float seconds,
 *      ~µs precision); legacy packages carry the same values in
 *      audio/scene-durations.json (e.g. output/qwen4-preview: 5.686667).
 *   2. Word alignment: audio/subtitle-timing.json (whisperx wav2vec2-large
 *      forced alignment, text-align.py) gives per-word start/end aligned to
 *      the exact final audio file the generation step will slice. Real data
 *      shows a ~20-25ms frame grid (word gaps quantized to 0.025/0.045s).
 *   3. Caveat: the TTS post chain compresses pauses (silenceremove
 *      stop_duration=0.25 → stop_silence=0.08, lib/tts/post-process.mjs), so
 *      long acoustic silences barely exist in the final audio — scanning the
 *      waveform for silence would find almost no usable boundaries.
 *   4. Decision: PRIMARY boundary source = word-gap midpoints from
 *      subtitle-timing.json (any inter-word boundary is a safe cut; the
 *      largest gap inside the back-off window is preferred). FALLBACK when
 *      alignment is missing/stale = punctuation-proportional estimate from
 *      the voiceover text (the ticket's "标点静音" relaxation), allocating
 *      the known duration across tokens and cutting at punctuation.
 *
 * ─── Plan file schema (v1 — the contract ticket 04's `run --plan` consumes) ───
 *
 *   output/{pipelineId}/digital-human-plan.json
 *   {
 *     schemaVersion: 1,
 *     kind: "digital-human-plan",
 *     pipelineId, contentDir, createdAt (ISO),
 *     tier: "free" | "quality",
 *     model: { name, platform, segmentCapSeconds },
 *     qualityTier: { authorized: boolean, switch: string },
 *     approval: { approved: false, approvedAt: null },
 *       // ↑ run --plan must REFUSE unless approval.approved === true.
 *       //   Approval is granted by a human reviewing the plan, then flipping
 *       //   approved/approvedAt in this file (or T4's explicit --approve
 *       //   flag once the user has approved in chat).
 *     scenes: [{
 *       sceneId, status: "needs-generation" | "already-generated",
 *       audioPath, durationSeconds, durationSource:
 *         "tts-meta" | "scene-durations",
 *       boundarySource: "word-alignment" | "text-punctuation-estimate",
 *       presentIntervals: [{from,to}] | null,
 *       segments: [{ index, from, to, duration, hardCut }],
 *         // full-audio split, each ≤ model segmentCapSeconds (hardCut:
 *         // no safe boundary found — cut lands mid-speech)
 *       generationUnits: [{ segmentIndex, from, to, duration }],
 *         // what will actually be generated: segments ∩ presentIntervals
 *         // (or all segments when present is omitted)
 *     }],
 *     totals: { scenesNeedingGeneration, segments, generationUnits,
 *               generatedSeconds, estimatedMinutes, estimatedHours, costUsd }
 *   }
 *
 * Ticket 04 exports (this file, "Run engine" section): approve/run/resume.
 *   executeApprove(planPath)            — flip approval.approved (HITL gate)
 *   runPlan({ planPath, ... })          — execute an approved plan
 *   resumePlan({ planPath, ... })       — recover an interrupted run
 * plus the scene-data writeback primitive (applyVideoPathToSceneData),
 * the concat list builder and the unit task-key helpers. Remote interaction
 * (Kaggle CLI), ffmpeg and dh-upscale are all injectable `deps` so the mock
 * test layer never touches the network (see __tests__/digital-human-run.test.mjs).
 *
 * @module digital-human
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";
import { FFMPEG_PATH } from "./upscale.mjs";
import { upscaleDigitalHuman } from "./dh-upscale.mjs";
import { REMOTE_TASKS_PATH, KAGGLE_USERNAME, KAGGLE_POLL_INTERVAL_SEC } from "../../cloud-gpu/run-gpu.mjs";
import { classifyTaskError, loadTaskLog, markTask, recordTask } from "../../cloud-gpu/lib/remote-task.mjs";

// ─── Model tiers (facts: docs/research/digital-human-test-progress.md) ───

/**
 * Per-tier model facts. The segment cap is the maximum audio seconds one
 * generation run accepts — longer audio must be split (spec decision 4).
 *
 * - free:    EchoMimicV3 Flash v51 on Kaggle free T4 — ~3.24s/segment,
 *            ~14min per segment, $0 (30h/week quota).
 * - quality: SoulX-FlashTalk 14B on Modal A100-80GB — 5.2s/segment,
 *            350s per segment, $0.20 per segment. Per-package authorization
 *            required (spec decision 3, scenario 8).
 */
export const MODEL_TIERS = {
  free: {
    id: "free",
    platform: "kaggle-free-t4",
    model: "EchoMimicV3 Flash v51",
    segmentCapSeconds: 3.24,
    secondsPerSegment: 840,
    costPerSegmentUsd: 0,
    quota: "Kaggle free quota 30h/week",
  },
  quality: {
    id: "quality",
    platform: "modal-a100",
    model: "SoulX-FlashTalk 14B",
    segmentCapSeconds: 5.2,
    secondsPerSegment: 350,
    costPerSegmentUsd: 0.2,
    quota: null,
  },
};

export const PLAN_SCHEMA_VERSION = 1;
/** Plan file name inside output/{pipelineId}/ (beside b-roll-report.json etc.). */
export const PLAN_FILE_NAME = "digital-human-plan.json";
/**
 * Per-package quality-tier authorization marker (empty file, presence =
 * authorized). Lives in the package's content dir; single-run override via
 * DIGITAL_HUMAN_QUALITY_AUTHORIZED=1.
 */
export const QUALITY_TIER_AUTH_FILE = "avatar-quality.authorized";
export const QUALITY_TIER_AUTH_ENV = "DIGITAL_HUMAN_QUALITY_AUTHORIZED";

/** Segmentation tunables. Back-off: how far before the cap the split may land. */
const BACKOFF_SECONDS = 1.0;
/** No segment shorter than this — a sliver tail is merged into the previous segment. */
const MIN_SEGMENT_SECONDS = 0.5;

// ─── Authorization ───

/**
 * Per-package Modal quality-tier authorization (spec decision 3 / scenario 8).
 * Authorized when the package dir contains the marker file, or the operator
 * set the single-run env override.
 *
 * @param {string} contentDir - absolute package dir
 * @returns {boolean}
 */
export function isQualityTierAuthorized(contentDir) {
  if (process.env[QUALITY_TIER_AUTH_ENV] === "1") return true;
  return existsSync(join(contentDir, QUALITY_TIER_AUTH_FILE));
}

export function qualityTierAuthorizationSwitch(contentDir) {
  return (
    `create the per-package marker file content/<dir>/${QUALITY_TIER_AUTH_FILE} ` +
    `(empty file is fine), or set ${QUALITY_TIER_AUTH_ENV}=1 for this single run`
  );
}

// ─── Boundary extraction ───

/**
 * Word-gap cut points from subtitle-timing alignment words.
 * Each gap between consecutive words yields a candidate cut at its midpoint;
 * `quality` = gap width (larger = closer to a real pause = preferred).
 *
 * @param {Array<{text: string, start: number, end: number}>} words - scene-local seconds
 * @returns {Array<{at: number, quality: number}>} sorted by `at`
 */
export function buildWordGapBoundaries(words) {
  const sorted = [...words].sort((a, b) => a.start - b.start);
  const cuts = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start - sorted[i - 1].end;
    if (gap > 0) {
      cuts.push({ at: sorted[i - 1].end + gap / 2, quality: gap });
    }
  }
  return cuts;
}

const SENTENCE_END = /[.!?;。！？；…]/;
const CLAUSE_END = /[,，、:：]/;

/**
 * Tokenize voiceover text for the punctuation-fallback estimate: CJK
 * characters become per-char tokens, non-CJK runs become per-word tokens.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function estimateTextTokens(text) {
  return (text ?? "").match(/[\u3400-\u4dbf\u4e00-\u9fff]|[^\s\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? [];
}

/**
 * Punctuation-proportional cut points (fallback when alignment data is
 * missing/stale — the ticket's "段边界放宽到标点静音处"). The known audio
 * duration is allocated proportionally across tokens; a cut after token i
 * lands at (i+1)/n × duration. Sentence punctuation scores higher than
 * clause punctuation so the back-off prefers sentence ends.
 *
 * @param {string} text - scene voiceover
 * @param {number} durationSeconds - exact audio duration
 * @returns {Array<{at: number, quality: number}>} sorted by `at`
 */
export function buildTextPunctuationBoundaries(text, durationSeconds) {
  const tokens = estimateTextTokens(text);
  if (tokens.length < 2 || !(durationSeconds > 0)) return [];
  const per = durationSeconds / tokens.length;
  const cuts = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const last = t[t.length - 1];
    const quality = SENTENCE_END.test(last) ? 2 : CLAUSE_END.test(last) ? 1 : 0;
    if (quality > 0) cuts.push({ at: (i + 1) * per, quality });
  }
  return cuts;
}

// ─── Segmentation ───

/**
 * Split [0, duration] into segments each ≤ capSeconds, cutting at the best
 * candidate boundary. Greedy: while the remainder exceeds the cap, look for
 * candidates within BACKOFF_SECONDS before the cap edge and pick the highest
 * quality (largest pause); ties break to the latest. If the back-off window
 * is empty, fall back to the latest candidate anywhere before the cap edge;
 * if there is none at all, hard-cut at the cap edge (flagged). A final sliver
 * shorter than minSegmentSeconds is merged back into the previous segment
 * (which then may exceed the cap — also flagged).
 *
 * @param {object} p
 * @param {number} p.durationSeconds
 * @param {Array<{at: number, quality: number}>} p.cutPoints - sorted by `at`
 * @param {number} p.capSeconds
 * @param {number} [p.backoffSeconds]
 * @param {number} [p.minSegmentSeconds]
 * @returns {Array<{index: number, from: number, to: number, duration: number, hardCut: boolean}>}
 */
export function splitAudioAtBoundaries({
  durationSeconds,
  cutPoints,
  capSeconds,
  backoffSeconds = BACKOFF_SECONDS,
  minSegmentSeconds = MIN_SEGMENT_SECONDS,
}) {
  if (!(durationSeconds > 0)) throw new Error(`splitAudioAtBoundaries: duration must be > 0, got ${durationSeconds}`);
  if (!(capSeconds > 0)) throw new Error(`splitAudioAtBoundaries: cap must be > 0, got ${capSeconds}`);

  const cuts = (cutPoints ?? [])
    .filter((c) => Number.isFinite(c?.at) && c.at > 0 && c.at < durationSeconds)
    .sort((a, b) => a.at - b.at);

  const raw = [];
  let cursor = 0;
  let guard = 0;
  while (durationSeconds - cursor > capSeconds && guard++ < 10000) {
    const upper = cursor + capSeconds;
    const windowFloor = Math.max(cursor + minSegmentSeconds, upper - backoffSeconds);
    // Preferred: highest-quality cut in the back-off window; tie → latest.
    let chosen = null;
    for (const c of cuts) {
      if (c.at < windowFloor) continue;
      if (c.at > upper) break;
      if (!chosen || c.quality >= chosen.quality) chosen = c;
    }
    // Widen: any usable cut before the cap edge (still never mid-segment).
    if (!chosen) {
      for (const c of cuts) {
        if (c.at > upper) break;
        if (c.at > cursor + minSegmentSeconds) chosen = c;
      }
    }
    const at = chosen ? chosen.at : upper;
    raw.push({ from: cursor, to: at, hardCut: !chosen });
    cursor = at;
  }
  raw.push({ from: cursor, to: durationSeconds, hardCut: false });

  // Merge a sliver tail into the previous segment.
  const last = raw[raw.length - 1];
  if (raw.length > 1 && last.to - last.from < minSegmentSeconds) {
    const prev = raw[raw.length - 2];
    prev.to = last.to;
    raw.pop();
  }

  return raw.map((s, i) => ({
    index: i,
    from: round6(s.from),
    to: round6(s.to),
    duration: round6(s.to - s.from),
    hardCut: s.hardCut || s.to - s.from > capSeconds,
  }));
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Intersect full-audio segments with the avatar's on-screen intervals.
 * presentIntervals omitted/null → every segment is generated as-is. Each
 * (segment ∩ interval) overlap becomes one generation unit; a unit never
 * exceeds the cap because segments already don't.
 *
 * @param {Array<{index: number, from: number, to: number}>} segments
 * @param {Array<{from: number, to: number}>|undefined} presentIntervals
 * @returns {Array<{segmentIndex: number, from: number, to: number, duration: number}>}
 */
export function resolveGenerationUnits(segments, presentIntervals) {
  if (!presentIntervals || presentIntervals.length === 0) {
    return segments.map((s) => ({
      segmentIndex: s.index,
      from: s.from,
      to: s.to,
      duration: s.duration,
    }));
  }
  const units = [];
  for (const seg of segments) {
    for (const iv of presentIntervals) {
      const from = Math.max(seg.from, iv.from);
      const to = Math.min(seg.to, iv.to);
      if (to - from > 0.01) {
        units.push({ segmentIndex: seg.index, from: round6(from), to: round6(to), duration: round6(to - from) });
      }
    }
  }
  return units;
}

// ─── Cost model ───

/**
 * Cost/time estimate for a number of generation units on a tier
 * (spec decision 5, scenario cost口径: Kaggle free $0 + 30h/week quota vs
 * Modal quality tier $0.20 per 5.2s segment).
 *
 * @param {number} unitCount
 * @param {object} tier - one of MODEL_TIERS
 * @returns {{platform: string, model: string, estimatedMinutes: number, estimatedHours: number, costUsd: number, quota: string|null}}
 */
export function estimateCost(unitCount, tier) {
  const minutes = round1((unitCount * tier.secondsPerSegment) / 60);
  return {
    platform: tier.platform,
    model: tier.model,
    estimatedMinutes: minutes,
    estimatedHours: round1(minutes / 60),
    costUsd: round1(unitCount * tier.costPerSegmentUsd),
    quota: tier.quota,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ─── Per-scene plan computation ───

/**
 * Compute the plan entry for one avatar scene.
 *
 * @param {object} p
 * @param {object} p.scene - scene with an avatar declaration
 * @param {number} p.audioDuration - exact duration of the final TTS audio
 * @param {"tts-meta"|"scene-durations"} p.durationSource
 * @param {Array<{text: string, start: number, end: number}>|null} p.words
 *        - flattened word timings for this scene from subtitle-timing.json
 *          (null when alignment is missing/stale → punctuation fallback)
 * @param {object} p.tier - one of MODEL_TIERS
 * @param {boolean} p.alreadyGenerated - avatar.videoPath already written back
 * @returns {object} plan scene entry (see module JSDoc schema)
 */
export function computeScenePlan({ scene, audioDuration, durationSource, words, tier, alreadyGenerated }) {
  const presentIntervals =
    scene.avatar?.present?.map((iv) => ({ from: iv.from, to: iv.to })) ?? null;

  if (alreadyGenerated) {
    return {
      sceneId: scene.id,
      status: "already-generated",
      audioPath: null,
      durationSeconds: round6(audioDuration),
      durationSource,
      boundarySource: null,
      presentIntervals,
      segments: [],
      generationUnits: [],
      segmentCount: 0,
      unitCount: 0,
    };
  }

  if (!(audioDuration > 0)) {
    throw new Error(
      `Scene ${scene.id}: TTS audio duration unknown — run the TTS pipeline (main.mjs --content <dir>) before planning`,
    );
  }

  const boundarySource = words && words.length > 1 ? "word-alignment" : "text-punctuation-estimate";
  const cutPoints =
    boundarySource === "word-alignment"
      ? buildWordGapBoundaries(words)
      : buildTextPunctuationBoundaries(scene.voiceover ?? "", audioDuration);

  const segments = splitAudioAtBoundaries({
    durationSeconds: audioDuration,
    cutPoints,
    capSeconds: tier.segmentCapSeconds,
  });
  const generationUnits = resolveGenerationUnits(segments, presentIntervals);

  return {
    sceneId: scene.id,
    status: "needs-generation",
    audioPath: null, // filled by planDigitalHumanPackage once resolved
    durationSeconds: round6(audioDuration),
    durationSource,
    boundarySource,
    presentIntervals,
    segments,
    generationUnits,
    segmentCount: segments.length,
    unitCount: generationUnits.length,
  };
}

// ─── Package artifact readers (fs — local reads only) ───

/**
 * Resolve a scene's TTS audio duration + file. Priority: #198 cache meta
 * (scene-{id}.tts-meta.json — exact ffprobe duration + engine-written audio
 * path) → legacy scene-durations.json. Throws fail-closed when neither has
 * the scene: planning without the TTS artifacts is meaningless.
 *
 * @param {string} audioDir - output/{pipelineId}/audio
 * @param {{id: number}} scene
 * @returns {{audioPath: string, duration: number, durationSource: "tts-meta"|"scene-durations"}}
 */
export function readSceneAudioInfo(audioDir, scene) {
  const metaPath = join(audioDir, `scene-${scene.id}.tts-meta.json`);
  if (existsSync(metaPath)) {
    let fromMeta = null;
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      if (typeof meta.duration === "number" && meta.duration > 0) {
        fromMeta = {
          audioPath: meta.audioPath ? resolve(audioDir, meta.audioPath) : join(audioDir, `scene-${scene.id}.wav`),
          duration: meta.duration,
          durationSource: "tts-meta",
        };
      }
    } catch {
      // corrupt meta → fall through to scene-durations.json
    }
    if (fromMeta) {
      assertAudioFileExists(scene.id, fromMeta.audioPath);
      return fromMeta;
    }
  }

  const durationsPath = join(audioDir, "scene-durations.json");
  if (existsSync(durationsPath)) {
    let fromDurations = null;
    try {
      const all = JSON.parse(readFileSync(durationsPath, "utf8"));
      const entry = (Array.isArray(all) ? all : all?.scenes)?.find((d) => d.sceneId === scene.id);
      if (entry && typeof entry.duration === "number" && entry.duration > 0) {
        fromDurations = {
          audioPath:
            [".wav", ".mp3"]
              .map((ext) => join(audioDir, `scene-${scene.id}${ext}`))
              .find((p) => existsSync(p)) ?? join(audioDir, `scene-${scene.id}.wav`),
          duration: entry.duration,
          durationSource: "scene-durations",
        };
      }
    } catch {
      // fall through
    }
    if (fromDurations) {
      assertAudioFileExists(scene.id, fromDurations.audioPath);
      return fromDurations;
    }
  }

  throw new Error(
    `Scene ${scene.id}: no TTS audio metadata in ${audioDir} ` +
      `(expected scene-${scene.id}.tts-meta.json or scene-durations.json) — ` +
      `run the TTS pipeline (main.mjs --content <dir>) before planning`,
  );
}

/**
 * Fail-closed: the generation step will slice THIS file as the driving audio.
 * A duration without the file is not plannable.
 */
function assertAudioFileExists(sceneId, audioPath) {
  if (!existsSync(audioPath)) {
    throw new Error(
      `Scene ${sceneId}: TTS audio file missing: ${audioPath} — ` +
        `regenerate the voiceover (main.mjs --content <dir>) before planning`,
    );
  }
}

/**
 * Load this scene's word timings from subtitle-timing.json. Accepts both the
 * array format and the {scenes:[...]} object format. Returns null when the
 * file is missing/corrupt or has no word timings for the scene — the caller
 * then falls back to the punctuation estimate. Alignment staleness only
 * shifts cut points by a few ms (frame grid), acceptable for planning; the
 * generation step slices the exact audio the alignment was computed against.
 *
 * @param {string} audioDir
 * @param {{id: number}} scene
 * @returns {Array<{text: string, start: number, end: number}>|null}
 */
export function readSceneAlignmentWords(audioDir, scene) {
  const timingPath = join(audioDir, "subtitle-timing.json");
  if (!existsSync(timingPath)) return null;
  try {
    const data = JSON.parse(readFileSync(timingPath, "utf8"));
    const scenes = Array.isArray(data) ? data : data?.scenes;
    const entry = scenes?.find((s) => s.sceneId === scene.id);
    if (!entry) return null;
    const words = (entry.segments ?? []).flatMap((seg) => seg.words ?? []);
    return words.length > 0 ? words : null;
  } catch {
    return null;
  }
}

// ─── Plan assembly ───

/**
 * Build the plan object for a package (no I/O beyond the passed data).
 *
 * @param {object} p
 * @param {Array<object>} p.scenes - scene-data scenes
 * @param {string} p.pipelineId
 * @param {string} p.contentDir - package dir (content/{dir})
 * @param {string} p.audioDir - output/{pipelineId}/audio
 * @param {"free"|"quality"} p.tier
 * @param {boolean} p.qualityAuthorized
 * @param {Date} [p.now]
 * @returns {{plan: object|null, avatarSceneCount: number}}
 *   plan is null when no scene declares avatar → the caller prints 无需生成
 *   and must not write anything.
 */
export function planDigitalHumanPackage({
  scenes,
  pipelineId,
  contentDir,
  audioDir,
  tier,
  qualityAuthorized,
  now = new Date(),
}) {
  const tierInfo = MODEL_TIERS[tier];
  if (!tierInfo) {
    throw new Error(`Unknown tier "${tier}" — expected free or quality`);
  }

  const avatarScenes = scenes.filter((s) => s.avatar !== undefined);
  if (avatarScenes.length === 0) {
    return { plan: null, avatarSceneCount: 0 };
  }

  for (const scene of avatarScenes) {
    if (scene.avatar === null || typeof scene.avatar !== "object" || Array.isArray(scene.avatar)) {
      // scene-rules checkAvatarContract rejects this at preflight; fail-closed here too.
      throw new Error(
        `Scene ${scene.id}: avatar must be an object, got ${JSON.stringify(scene.avatar)} — ` +
          `write avatar: {} to declare, or remove the field`,
      );
    }
  }

  const sceneEntries = [];
  for (const scene of avatarScenes) {
    const alreadyGenerated = typeof scene.avatar.videoPath === "string" && scene.avatar.videoPath.trim() !== "";
    let entry;
    if (alreadyGenerated) {
      entry = computeScenePlan({ scene, audioDuration: 0, durationSource: "tts-meta", words: null, tier: tierInfo, alreadyGenerated: true });
    } else {
      const info = readSceneAudioInfo(audioDir, scene);
      const words = readSceneAlignmentWords(audioDir, scene);
      entry = computeScenePlan({
        scene,
        audioDuration: info.duration,
        durationSource: info.durationSource,
        words,
        tier: tierInfo,
        alreadyGenerated: false,
      });
      entry.audioPath = info.audioPath;
    }
    sceneEntries.push(entry);
  }

  const needing = sceneEntries.filter((s) => s.status === "needs-generation");
  const totals = {
    scenesNeedingGeneration: needing.length,
    segments: needing.reduce((sum, s) => sum + s.segmentCount, 0),
    generationUnits: needing.reduce((sum, s) => sum + s.unitCount, 0),
    generatedSeconds: round1(needing.reduce((sum, s) => sum + s.generationUnits.reduce((a, u) => a + u.duration, 0), 0)),
    ...estimateCost(needing.reduce((sum, s) => sum + s.unitCount, 0), tierInfo),
  };

  return {
    plan: {
      schemaVersion: PLAN_SCHEMA_VERSION,
      kind: "digital-human-plan",
      pipelineId,
      contentDir,
      createdAt: now.toISOString(),
      tier,
      model: {
        name: tierInfo.model,
        platform: tierInfo.platform,
        segmentCapSeconds: tierInfo.segmentCapSeconds,
      },
      qualityTier: {
        authorized: qualityAuthorized,
        switch: qualityTierAuthorizationSwitch(contentDir),
      },
      approval: { approved: false, approvedAt: null },
      scenes: sceneEntries,
      totals,
    },
    avatarSceneCount: avatarScenes.length,
  };
}

// ─── Plan file I/O ───

/** Absolute plan path for a package: output/{pipelineId}/digital-human-plan.json. */
export function planPathFor(outputRoot, pipelineId) {
  return join(outputRoot, pipelineId, PLAN_FILE_NAME);
}

/**
 * Serialize + write the plan file (the ONLY file plan ever writes).
 * @returns {string} the written path
 */
export function writePlanFile(planPath, plan) {
  const body = JSON.stringify(plan, null, 2) + "\n";
  writeFileSync(planPath, body, "utf8");
  return planPath;
}

// ─── CLI-facing orchestration (thin — printing/exit codes live in the CLI) ───

/**
 * Execute the `plan` subcommand end-to-end.
 *
 * Reads: content/{slug}/{meta,scene-data}.mjs + output/{pipelineId}/audio/*.
 * Writes: output/{pipelineId}/digital-human-plan.json — nothing else.
 * No remote calls, no scene-data or remote-task writes.
 *
 * @param {object} p
 * @param {string} p.contentSlug - e.g. "deepseek" or "_test-fixtures/avatar-declarations"
 * @param {string} [p.contentRoot] - defaults to scripts/short-video/content
 * @param {string} [p.outputRoot] - defaults to scripts/short-video/output
 * @param {"free"|"quality"} [p.tier]
 * @param {Date} [p.now]
 * @returns {Promise<{outcome: "written"|"no-avatar"|"refused", planPath?: string,
 *                     plan?: object, avatarSceneCount?: number, reason?: string,
 *                     authSwitch?: string}>}
 *   refused → the caller prints the reason + switch and exits non-zero
 *   without writing anything (spec scenario 8).
 */
export async function executePlan({ contentSlug, contentRoot, outputRoot, tier = "free", now = new Date() }) {
  const here = dirname(fileURLToPath(import.meta.url));
  const contentBase = contentRoot ?? join(here, "..", "content");
  const outputBase = outputRoot ?? join(here, "..", "output");
  const contentDir = resolve(contentBase, contentSlug);

  if (!MODEL_TIERS[tier]) {
    throw new Error(`Unknown tier "${tier}" — expected free or quality`);
  }

  // Quality-tier authorization gate (spec scenario 8) — before any work.
  const authorized = tier === "free" || isQualityTierAuthorized(contentDir);
  if (!authorized) {
    return {
      outcome: "refused",
      reason:
        `Modal quality tier (${MODEL_TIERS.quality.model}) is not authorized for this package ` +
        `— plan refuses to execute (spec scenario 8).`,
      authSwitch: qualityTierAuthorizationSwitch(contentDir),
    };
  }

  let meta, scenes;
  try {
    const metaMod = await import(pathToFileURL(join(contentDir, "meta.mjs")).href);
    meta = metaMod.meta;
    const dataMod = await import(pathToFileURL(join(contentDir, "scene-data.mjs")).href);
    scenes = dataMod.scenes;
  } catch (e) {
    throw new Error(`Failed to load content package content/${contentSlug}: ${e.message}`);
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error(`No valid scenes array in content/${contentSlug}/scene-data.mjs`);
  }
  if (!meta?.pipelineId) {
    throw new Error(`content/${contentSlug}/meta.mjs is missing pipelineId — cannot resolve the package output dir`);
  }

  const audioDir = join(outputBase, meta.pipelineId, "audio");
  const { plan, avatarSceneCount } = planDigitalHumanPackage({
    scenes,
    pipelineId: meta.pipelineId,
    contentDir,
    audioDir,
    tier,
    qualityAuthorized: authorized,
    now,
  });

  if (!plan) {
    return { outcome: "no-avatar", avatarSceneCount: 0 };
  }

  const planPath = planPathFor(outputBase, meta.pipelineId);
  writePlanFile(planPath, plan);
  return { outcome: "written", planPath, plan, avatarSceneCount };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Run engine (#214 ticket 04) — approve / run / resume ─────────────────
//
// Contract (spec Behavioral Scenarios 3/4/5, ticket 04):
//   * approval gate FIRST: an unapproved plan gets ZERO remote calls and
//     ZERO fs writes (report/artifacts/scene-data all untouched);
//   * one Kaggle kernel per generation unit, recorded in the shared
//     remote-task state machine (scripts/cloud-gpu/output/remote-tasks.json)
//     so a dead driver resumes without re-billing completed units;
//   * per-scene post-processing (upscale 2x → ffmpeg concat in strict unit
//     order → atomic scene-data writeback) happens only after ALL units of
//     that scene succeeded — any failure leaves scene-data byte-identical;
//   * report (耗时/平台/费用) written once, after full success.
//
// All remote/local side effects go through `deps` (transport / ffmpeg /
// upscale / tasksPath) so tests inject fakes and never touch the network.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Report file name inside output/{pipelineId}/ (beside the plan). */
export const REPORT_FILE_NAME = "digital-human-report.json";
/** remote-task `kind` marker for digital-human generation units. */
export const UNIT_TASK_KIND = "digital-human-unit";
/** EchoMimicV3 model weights dataset attached to every unit kernel. */
export const MODEL_DATASET_SOURCE = "xpabloli/echomimicv3-flash";
/** States of a unit task that may still be recoverable (never re-bill them). */
const RESUMABLE_STATES = new Set(["running", "timeout", "download-failed"]);
/** Default per-unit harvest window: ~14min inference + env setup headroom. */
const DEFAULT_RUN_TIMEOUT_SEC = 2700;

/** Deterministic remote-task key for one generation unit of one plan. */
export function unitKeyFor(pipelineId, sceneId, unitIndex) {
  return `${pipelineId}:${sceneId}:${unitIndex}`;
}

/** Deterministic Kaggle kernel slug for a unit (re-push = new kernel version). */
function unitSlugFor(pipelineId, sceneId, unitIndex) {
  const slugified = String(pipelineId).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `dh-${slugified.slice(0, 30)}-s${sceneId}x${unitIndex}`;
}

/** Unit artifact paths (deterministic, mirrored into the task record). */
function unitSlicePath(planDir, sceneId, unitIndex) {
  return join(planDir, "avatar", "audio", `s${sceneId}-u${unitIndex}.wav`);
}
function unitOutputDir(planDir, sceneId, unitIndex) {
  return join(planDir, "avatar", "generated", `s${sceneId}-u${unitIndex}`);
}
function unitUpscaledPath(planDir, sceneId, unitIndex) {
  return join(planDir, "avatar", "upscaled", `s${sceneId}-u${unitIndex}.mp4`);
}
const UNIT_OUTPUT_EXT = ".mp4";

// ─── Plan file reading (shared by approve/run/resume + T5 frame-audit CLI) ───

/** Parse + validate a plan file (kind/schemaVersion). Exported for the
 *  ticket-05 frame-audit subcommand, which audits the plan's scene list. */
export function readPlanFile(planPath) {
  let raw;
  try {
    raw = readFileSync(planPath, "utf8");
  } catch (e) {
    throw new Error(`Cannot read plan file ${planPath}: ${e.message}`);
  }
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Plan file is not valid JSON: ${planPath} (${e.message})`);
  }
  if (plan?.kind !== "digital-human-plan") {
    throw new Error(`Not a digital-human-plan file (kind=${JSON.stringify(plan?.kind)}): ${planPath}`);
  }
  if (plan.schemaVersion !== PLAN_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported plan schemaVersion ${plan.schemaVersion} in ${planPath} — expected ${PLAN_SCHEMA_VERSION}; regenerate with \`plan --content <dir>\``,
    );
  }
  return plan;
}

/**
 * HITL approval: flip `approval.approved` in the plan file after a human
 * reviewed it. Atomic (tmp + rename) and schema-validated; the CLI exposes
 * this as `approve --plan <file>` (safer than hand-editing the JSON — the
 * approvedAt timestamp is stamped here).
 *
 * @param {string} planPath
 * @param {{ now?: Date }} [options]
 * @returns {{ outcome: "approved", planPath: string, plan: object }}
 */
export function executeApprove(planPath, { now = new Date() } = {}) {
  const plan = readPlanFile(planPath);
  plan.approval = { approved: true, approvedAt: now.toISOString() };
  const tmpPath = `${planPath}.dh-approve-tmp`;
  writeFileSync(tmpPath, JSON.stringify(plan, null, 2) + "\n", "utf8");
  renameSync(tmpPath, planPath);
  return { outcome: "approved", planPath, plan };
}

// ─── scene-data writeback (targeted string edit + backup + verify) ───

/**
 * Rewrite one scene's `avatar.videoPath` in scene-data.mjs TEXT (pure — no
 * disk I/O). scene-data is hand-authored code, so the edit is a targeted
 * string operation scoped to the scene's avatar block (brace-matching scan,
 * string-literal aware) rather than a full-file regeneration — everything
 * outside the avatar block stays byte-identical.
 *
 * @param {string} text - scene-data.mjs content
 * @param {number} sceneId
 * @param {string} videoPath - content-relative path, e.g. "assets/avatar/scene-1.mp4"
 * @returns {{ text: string }} the modified text (verify before writing!)
 * @throws when the scene is not found or declares no avatar (fail-closed)
 */
export function applyVideoPathToSceneData(text, sceneId, videoPath) {
  // Region of the scene object: from its `id:` to the next scene's `id:`.
  const idRe = new RegExp(`(^|[^\\w])id:\\s*${sceneId}\\b`);
  const idMatch = text.match(idRe);
  if (!idMatch) {
    throw new Error(`Scene ${sceneId} not found in scene-data (no id: ${sceneId} declaration)`);
  }
  const regionStart = idMatch.index + idMatch[0].length;
  const nextId = /(^|[^\w])id:\s*\d+/.exec(text.slice(regionStart));
  const regionEnd = nextId ? regionStart + nextId.index : text.length;
  const region = text.slice(regionStart, regionEnd);

  const avatarIdx = region.search(/\bavatar\s*:/);
  if (avatarIdx === -1) {
    throw new Error(
      `Scene ${sceneId}: no avatar declaration found in scene-data — write avatar: {} to declare it first`,
    );
  }
  const braceOffset = region.indexOf("{", avatarIdx);
  if (braceOffset === -1) {
    throw new Error(`Scene ${sceneId}: avatar declaration has no { block`);
  }
  const closeOffset = matchBrace(region, braceOffset);
  if (closeOffset === -1) {
    throw new Error(`Scene ${sceneId}: avatar declaration braces are unbalanced`);
  }

  const inner = region.slice(braceOffset + 1, closeOffset);
  const videoPathRe = /videoPath\s*:\s*(['"])(.*?)\1/;
  let newInner;
  if (videoPathRe.test(inner)) {
    newInner = inner.replace(videoPathRe, `videoPath: "${videoPath}"`);
  } else if (inner.trim() === "") {
    newInner = ` videoPath: "${videoPath}" `;
  } else {
    newInner = ` videoPath: "${videoPath}",${inner}`;
  }

  return {
    text: text.slice(0, regionStart) + region.slice(0, braceOffset + 1) + newInner + region.slice(closeOffset) + text.slice(regionEnd),
  };
}

/** Find the matching `}` for the `{` at `openIdx`, skipping string literals. */
function matchBrace(text, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Write `videoPath` back into content/<dir>/scene-data.mjs with the repo's
 * media-patch guarantees: verify (import a temp copy and assert the value),
 * backup (.bak, same convention as apply-media-patch), atomic rename.
 * Any verification failure throws BEFORE the backup/write — the file stays
 * byte-identical.
 *
 * @param {string} contentDir - package dir
 * @param {number} sceneId
 * @param {string} videoPath - content-relative
 */
async function writeBackVideoPath(contentDir, sceneId, videoPath) {
  const sceneDataPath = join(contentDir, "scene-data.mjs");
  const original = readFileSync(sceneDataPath, "utf8");
  const { text: modified } = applyVideoPathToSceneData(original, sceneId, videoPath);

  // Verify: the modified text must parse and carry the new videoPath. The
  // temp file name must be UNIQUE per verification — Node caches ESM modules
  // by URL, so a reused name would return the first scene's stale module.
  let verifySeq = (writeBackVideoPath._seq = (writeBackVideoPath._seq ?? 0) + 1);
  const verifyPath = join(contentDir, `.scene-data.dh-verify-${process.pid}-${verifySeq}.mjs`);
  writeFileSync(verifyPath, modified, "utf8");
  try {
    const mod = await import(pathToFileURL(verifyPath).href);
    const scene = (mod.scenes ?? []).find((s) => s.id === sceneId);
    if (!scene?.avatar || scene.avatar.videoPath !== videoPath) {
      throw new Error(`verification import shows videoPath not applied for scene ${sceneId}`);
    }
  } finally {
    try {
      rmSync(verifyPath, { force: true });
    } catch {}
  }

  copyFileSync(sceneDataPath, `${sceneDataPath}.bak`);
  const tmpPath = `${sceneDataPath}.dh-tmp`;
  writeFileSync(tmpPath, modified, "utf8");
  renameSync(tmpPath, sceneDataPath);
}

// ─── concat list ───

/**
 * ffmpeg concat-demuxer list. Entry order IS the playlist order — callers
 * pass unit videos in (segmentIndex, from) order so the concatenated
 * timeline matches the scene audio timeline.
 *
 * @param {string[]} paths
 * @returns {string} list file content
 */
export function buildConcatList(paths) {
  return paths.map((p) => `file '${p}'`).join("\n") + "\n";
}

// ─── Injectable side-effect seams (defaults = real CLI / binaries) ───

/** Real ffmpeg seam: sample-accurate wav slicing + concat-demuxer re-encode. */
function realFfmpeg() {
  return {
    async sliceAudio({ input, from, to, output }) {
      mkdirSync(dirname(output), { recursive: true });
      // Output-side -ss/-to with re-encode → sample-accurate cut.
      const res = spawnSync(FFMPEG_PATH, ["-y", "-i", input, "-ss", String(from), "-to", String(to), output], {
        encoding: "utf8",
        timeout: 120000,
      });
      if (res.status !== 0) {
        throw new Error(
          `ffmpeg audio slice failed (${input} [${from}–${to}s]): ${(res.stderr || "").slice(-400)}`,
        );
      }
    },
    async concat({ listFile, output }) {
      mkdirSync(dirname(output), { recursive: true });
      // Re-encode (not -c copy) so timestamps/frames are strictly sequential
      // across segment boundaries (ticket acceptance: 时间戳/帧序严格顺序).
      const res = spawnSync(
        FFMPEG_PATH,
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listFile,
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          output,
        ],
        { encoding: "utf8", timeout: 600000 },
      );
      if (res.status !== 0) {
        throw new Error(`ffmpeg concat failed (${listFile}): ${(res.stderr || "").slice(-400)}`);
      }
    },
  };
}

/** Default upscale dep: force the 2x digital-human default. */
function defaultUpscale(inputPath, outputPath) {
  return upscaleDigitalHuman(inputPath, outputPath, { scale: 2 });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Real Kaggle transport — mirrors run-gpu.mjs's push→poll→download flow
 * (same CLI, same status semantics), extended with the per-run input
 * dataset (portrait + unit driver-audio slices) that unit kernels attach.
 */
export function createKaggleTransport() {
  const kaggle = (cmd, timeoutMs = 60000) =>
    execSync(cmd, { encoding: "utf8", timeout: timeoutMs, stdio: ["pipe", "pipe", "pipe"] });

  return {
    /**
     * Push (create-or-version) the staged input dataset. Returns the source
     * id to attach in kernel metadata.
     */
    async pushDataset({ dir }) {
      const metadata = JSON.parse(readFileSync(join(dir, "dataset-metadata.json"), "utf8"));
      try {
        kaggle(`kaggle datasets create -p "${dir}"`);
      } catch (e) {
        const msg = e.message || String(e);
        if (!/already exists/i.test(msg)) {
          throw new Error(`Kaggle dataset push failed: ${msg}`);
        }
        kaggle(`kaggle datasets version -p "${dir}" -m "digital-human unit inputs" --dir-mode zip`);
      }
      return { source: metadata.id.toLowerCase() };
    },

    /** Push one unit kernel (deterministic slug → re-push = new version). */
    async submitUnit({ slug, script, datasetSources, workDir }) {
      mkdirSync(workDir, { recursive: true });
      const metadata = {
        id: `${KAGGLE_USERNAME}/${slug}`,
        title: slug,
        code_file: "kernel.py",
        language: "python",
        kernel_type: "script",
        is_private: true,
        enable_gpu: true,
        enable_tpu: false,
        enable_internet: true,
        dataset_sources: datasetSources,
        kernel_sources: [],
        competition_sources: [],
      };
      writeFileSync(join(workDir, "kernel-metadata.json"), JSON.stringify(metadata, null, 2));
      writeFileSync(join(workDir, "kernel.py"), script);
      kaggle(`kaggle kernels push -p "${workDir}"`);
      return { kernelId: `${KAGGLE_USERNAME}/${slug}` };
    },

    /**
     * Poll a pushed kernel to completion and download its output — the same
     * semantics as run-gpu.mjs harvestKaggleKernel (status strings, timeout
     * resumable vs error terminal, download failure non-terminal).
     */
    async harvestUnit({ kernelId, outputDir, timeoutSec, pollIntervalSec = KAGGLE_POLL_INTERVAL_SEC }) {
      const startTime = Date.now();
      let finalStatus = "unknown";
      while (Date.now() < startTime + timeoutSec * 1000) {
        await sleep(pollIntervalSec * 1000);
        let status;
        try {
          status = kaggle(`kaggle kernels status ${kernelId}`, 30000);
        } catch {
          continue; // status query failed — retry
        }
        const lower = status.toLowerCase();
        if (lower.includes("complete")) {
          finalStatus = "complete";
          break;
        }
        if (lower.includes("error") || lower.includes("cancel")) {
          finalStatus = "error";
          break;
        }
      }
      const elapsedSec = (Date.now() - startTime) / 1000;
      if (finalStatus !== "complete") {
        return {
          success: false,
          stage: finalStatus === "error" ? "execution" : "timeout",
          elapsedSec,
          stderr:
            finalStatus === "error"
              ? `Kaggle kernel finished with status: ${finalStatus}`
              : `Kaggle timeout after ${timeoutSec}s (last status: ${finalStatus})`,
        };
      }
      try {
        mkdirSync(outputDir, { recursive: true });
        kaggle(`kaggle kernels output ${kernelId} -p "${outputDir}"`, 120000);
      } catch (e) {
        return {
          success: false,
          stage: "download",
          elapsedSec,
          stderr: `Kaggle output download failed: ${e.message}`,
        };
      }
      return { success: true, elapsedSec, stderr: "" };
    },
  };
}

function resolveDeps(deps = {}) {
  return {
    tasksPath: deps.tasksPath ?? REMOTE_TASKS_PATH,
    transport: deps.transport ?? createKaggleTransport(),
    ffmpeg: deps.ffmpeg ?? realFfmpeg(),
    upscale: deps.upscale ?? defaultUpscale,
    timeoutSec: deps.timeoutSec ?? DEFAULT_RUN_TIMEOUT_SEC,
    pollIntervalSec: deps.pollIntervalSec ?? KAGGLE_POLL_INTERVAL_SEC,
  };
}

// ─── Unit task records (remote-task state machine wiring) ───

function findUnitRecord(log, unitKey, span) {
  const candidates = Object.values(log.tasks)
    .filter((t) => t.kind === UNIT_TASK_KIND && t.unitKey === unitKey)
    .sort((a, b) => (b.pushedAt ?? 0) - (a.pushedAt ?? 0));
  const spanMatch = (r) =>
    !r.unitSpan ||
    !span ||
    (Math.abs((r.unitSpan.from ?? 0) - (span.from ?? 0)) < 0.01 &&
      Math.abs((r.unitSpan.to ?? 0) - (span.to ?? 0)) < 0.01);
  const matching = candidates.filter(spanMatch);
  if (matching.length === 0) return null;
  return (
    matching.find((r) => RESUMABLE_STATES.has(r.state)) ??
    matching.find((r) => r.state === "complete") ??
    matching[0]
  );
}

function unitOutputExists(record) {
  return Boolean(record?.outputDir && record?.outputName && existsSync(join(record.outputDir, record.outputName)));
}

/** Mark a unit complete, accumulating elapsed seconds across sessions. */
function markUnitComplete(tasksPath, kernelId, priorElapsedSec, sessionElapsedSec) {
  markTask(tasksPath, kernelId, "complete", {
    elapsedSec: Math.round(((priorElapsedSec ?? 0) + (sessionElapsedSec ?? 0)) * 1000) / 1000,
  });
}

// ─── Per-unit Kaggle kernel script + input dataset staging (layout only —
//    submission happens exclusively inside an approved runPlan) ───

const KERNEL_TEMPLATE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kaggle", "dh-generate", "echomimicv3_unit_kernel.py");

/**
 * Build one unit's kernel script: the v51 EchoMimicV3 Flash template with a
 * UNIT_CONFIG header naming this unit's driver audio + output file.
 */
export function buildUnitKernelScript({ audioFile, outputFile }) {
  const template = readFileSync(KERNEL_TEMPLATE_PATH, "utf8");
  const config = JSON.stringify({ audio_file: audioFile, output_file: outputFile });
  if (!template.includes("__UNIT_CONFIG_JSON__")) {
    throw new Error(`Kernel template missing __UNIT_CONFIG_JSON__ placeholder: ${KERNEL_TEMPLATE_PATH}`);
  }
  return template.replace("__UNIT_CONFIG_JSON__", config);
}

/**
 * Stage the per-run Kaggle input dataset layout: dataset-metadata.json +
 * portrait + one wav per submitted unit + manifest.json. Layout only —
 * the actual `kaggle datasets create/version` happens via the transport.
 */
export function stageUnitDataset({ stageDir, portraitPath, items, pipelineId }) {
  mkdirSync(stageDir, { recursive: true });
  const datasetSlug = `dh-${String(pipelineId).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30)}`;
  const datasetId = `${KAGGLE_USERNAME.toLowerCase()}/${datasetSlug}`;
  writeFileSync(
    join(stageDir, "dataset-metadata.json"),
    JSON.stringify({ title: datasetSlug, id: datasetId, licenses: [{ name: "CC0-1.0" }] }, null, 2) + "\n",
  );
  copyFileSync(portraitPath, join(stageDir, "portrait.jpg"));
  const manifest = [];
  for (const item of items) {
    const audioName = `s${item.sceneId}-u${item.unitIndex}.wav`;
    copyFileSync(item.slicePath, join(stageDir, audioName));
    manifest.push({ sceneId: item.sceneId, unitIndex: item.unitIndex, audio: audioName, output: item.outputName });
  }
  writeFileSync(join(stageDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { datasetId, manifest };
}

// ─── Report ───

/** Platform family for the report's 平台 field ("kaggle" / "modal"). */
function platformFamily(platform) {
  if (String(platform).startsWith("modal")) return "modal";
  if (String(platform).startsWith("kaggle")) return "kaggle";
  return String(platform);
}

function buildReport({ plan, planPath, workScenes, generatedAt }) {
  const tierInfo = MODEL_TIERS[plan.tier] ?? MODEL_TIERS.free;
  const family = platformFamily(plan.model?.platform ?? tierInfo.platform);
  const scenes = workScenes.map(({ planScene, status, items }) => {
    const generated = (items ?? []).map((item) => ({
      unitKey: item.unitKey,
      segmentIndex: item.unit.segmentIndex,
      unitIndex: item.unitIndex,
      kernelId: item.kernelId ?? item.record?.id ?? null,
      elapsedSec: item.completedElapsedSec ?? 0,
      status: item.status ?? "complete",
    }));
    const elapsedSeconds = round1(generated.reduce((a, u) => a + u.elapsedSec, 0));
    return {
      sceneId: planScene.sceneId,
      status,
      videoPath: status === "generated" ? `assets/avatar/scene-${planScene.sceneId}.mp4` : null,
      elapsedSeconds,
      platform: family,
      costUsd: round1((status === "generated" ? generated.length : 0) * tierInfo.costPerSegmentUsd),
      quotaMinutes: round1(elapsedSeconds / 60),
      units: generated,
    };
  });
  const generatedScenes = scenes.filter((s) => s.status === "generated");
  const totalElapsed = round1(scenes.reduce((a, s) => a + s.elapsedSeconds, 0));
  const units = generatedScenes.reduce((a, s) => a + s.units.length, 0);
  return {
    schemaVersion: 1,
    kind: "digital-human-report",
    pipelineId: plan.pipelineId,
    planPath,
    tier: plan.tier,
    model: plan.model,
    generatedAt,
    scenes,
    totals: {
      elapsedSeconds: totalElapsed, // 耗时
      platform: family, // 平台
      costUsd: round1(generatedScenes.reduce((a, s) => a + s.costUsd, 0)), // 费用
      quotaMinutes: round1(totalElapsed / 60),
      units,
      scenesGenerated: generatedScenes.length,
      scenesSkipped: scenes.length - generatedScenes.length,
    },
  };
}

// ─── Scene finalization (upscale → concat → writeback) ───

/**
 * Post-process one fully-generated scene: 2x upscale every unit video,
 * concat in strict unit order, copy the final video into the package's
 * assets, and write `scene.avatar.videoPath` back (single atomic write).
 * Throws on ANY failure — scene-data is only touched by the final writeback.
 */
async function finalizeScene({ plan, planScene, items, deps, planDir }) {
  const sceneId = planScene.sceneId;
  const upscaledPaths = [];

  for (const item of items) {
    const input = join(item.outputDir, item.outputName);
    if (!existsSync(input)) {
      throw new Error(`unit output missing after completion: ${input}`);
    }
    const output = unitUpscaledPath(planDir, sceneId, item.unitIndex);
    mkdirSync(dirname(output), { recursive: true });
    const up = await deps.upscale(input, output, { scale: 2 });
    if (!up?.success) {
      throw new Error(`upscale failed for unit ${item.unitKey}: ${up?.error ?? "unknown error"}`);
    }
    upscaledPaths.push(item.upscaledPath ?? output);
  }

  // concat in strict (segmentIndex, from) order — items are already sorted
  const listFile = join(planDir, "avatar", `concat-s${sceneId}.txt`);
  mkdirSync(dirname(listFile), { recursive: true });
  writeFileSync(listFile, buildConcatList(upscaledPaths), "utf8");
  const concatOut = join(planDir, "avatar", `scene-${sceneId}.avatar.mp4`);
  await deps.ffmpeg.concat({ listFile, output: concatOut });

  const videoRelPath = `assets/avatar/scene-${sceneId}.mp4`;
  const destAbs = join(plan.contentDir, videoRelPath);
  mkdirSync(dirname(destAbs), { recursive: true });
  copyFileSync(concatOut, destAbs);

  await writeBackVideoPath(plan.contentDir, sceneId, videoRelPath);
  return videoRelPath;
}

// ─── runPlan / resumePlan ───

async function executeRunPlan({ planPath, portrait, outputRoot, deps, mode }) {
  const d = resolveDeps(deps);
  const plan = readPlanFile(planPath);

  // Plan location sanity: output/{pipelineId}/digital-human-plan.json
  const planDir = dirname(planPath);
  const outputBase = dirname(planDir);
  if (basename(planDir) !== plan.pipelineId) {
    throw new Error(
      `Plan file ${planPath} is not inside its package output dir (expected .../${plan.pipelineId}/${PLAN_FILE_NAME})`,
    );
  }
  if (outputRoot && resolve(outputRoot) !== resolve(outputBase)) {
    throw new Error(`--output-root ${outputRoot} does not match the plan's output dir ${outputBase}`);
  }

  // GATE 1 — approval (spec scenario 3): refuse before ANY remote call or write.
  if (plan.approval?.approved !== true) {
    return {
      outcome: "refused",
      reason:
        "Plan is not approved (approval.approved !== true) — review output/" +
        plan.pipelineId +
        "/" +
        PLAN_FILE_NAME +
        " then run: node scripts/short-video/digital-human.mjs approve --plan <file>. Zero remote calls were made.",
    };
  }

  // GATE 2 — quality-tier authorization re-check (spec scenario 8).
  if (plan.tier === "quality" && !isQualityTierAuthorized(plan.contentDir)) {
    return {
      outcome: "refused",
      reason:
        `Modal quality tier (${plan.model?.name ?? "quality model"}) is not authorized for this package — ` +
        `run refuses to execute (spec scenario 8).`,
      authSwitch: qualityTierAuthorizationSwitch(plan.contentDir),
    };
  }

  // Current scene-data state (stale-plan protection: scenes written back by an
  // earlier session are skipped without re-billing).
  const dataMod = await import(pathToFileURL(join(plan.contentDir, "scene-data.mjs")).href);
  const currentScenes = Array.isArray(dataMod.scenes) ? dataMod.scenes : [];
  const sceneById = new Map(currentScenes.map((s) => [s.id, s]));

  const log = loadTaskLog(d.tasksPath);
  const workScenes = [];
  for (const planScene of plan.scenes) {
    if (planScene.status !== "needs-generation") continue;
    const current = sceneById.get(planScene.sceneId);
    const alreadyGenerated =
      current?.avatar && typeof current.avatar.videoPath === "string" && current.avatar.videoPath.trim() !== "";
    if (alreadyGenerated) {
      workScenes.push({ planScene, status: "skipped-already-generated" });
      continue;
    }
    const items = (planScene.generationUnits ?? []).map((unit, unitIndex) => {
      const unitKey = unitKeyFor(plan.pipelineId, planScene.sceneId, unitIndex);
      const record = findUnitRecord(log, unitKey, unit);
      return {
        unit,
        unitIndex,
        unitKey,
        record,
        planScene,
        sceneId: planScene.sceneId,
        outputDir: unitOutputDir(planDir, planScene.sceneId, unitIndex),
        outputName: `s${planScene.sceneId}-u${unitIndex}${UNIT_OUTPUT_EXT}`,
      };
    });
    workScenes.push({ planScene, status: "pending", items });
  }

  const pendingItems = workScenes.flatMap((w) => w.items ?? []);

  // GATE 3 (run mode) — live/resumable remote tasks exist → point at resume.
  // All-or-nothing: nothing is submitted while recoverable units exist.
  if (mode === "run") {
    const live = pendingItems.filter(
      (i) => i.record && (RESUMABLE_STATES.has(i.record.state) || (i.record.state === "complete" && !unitOutputExists(i.record))),
    );
    if (live.length > 0) {
      return {
        outcome: "interrupted",
        reason:
          `${live.length} unit(s) of plan ${plan.pipelineId} have recoverable remote tasks ` +
          `(e.g. ${live[0].record.id} state=${live[0].record.state}) — run ` +
          `\`node scripts/short-video/digital-human.mjs resume --plan ${planPath}\` to recover without re-billing them.`,
        resumableUnits: live.map((i) => i.unitKey),
      };
    }
  }

  // Decide the action per unit.
  for (const item of pendingItems) {
    const record = item.record;
    if (record?.state === "complete" && unitOutputExists(record)) {
      item.action = "skip";
    } else if (record?.state === "complete" && mode === "resume") {
      item.action = "harvest"; // completed remotely, local output missing → re-download
    } else if (mode === "resume" && record && RESUMABLE_STATES.has(record.state)) {
      item.action = "harvest"; // kernel likely still alive / output retrievable
    } else {
      item.action = "submit"; // no record, failed record, or run-mode fresh unit
    }
    item.status = "complete";
  }

  const submitItems = pendingItems.filter((i) => i.action === "submit");

  // Submission setup: portrait + driver-audio slices + input dataset.
  let datasetSource = null;
  if (submitItems.length > 0) {
    const portraitPath = portrait ?? join(plan.contentDir, "assets", "avatar", "portrait.jpg");
    if (!existsSync(portraitPath)) {
      return {
        outcome: "failed",
        reason:
          `Avatar portrait not found: ${portraitPath} — place the reference photo at ` +
          `content/<dir>/assets/avatar/portrait.jpg (media-asset-management: private asset) or pass --portrait <path>`,
      };
    }
    for (const item of submitItems) {
      const audioPath = item.planScene.audioPath;
      if (!audioPath || !existsSync(audioPath)) {
        return {
          outcome: "failed",
          reason: `Scene ${item.sceneId}: TTS audio missing (${audioPath ?? "no audioPath in plan"}) — regenerate the voiceover before running`,
        };
      }
      item.slicePath = unitSlicePath(planDir, item.sceneId, item.unitIndex);
      await d.ffmpeg.sliceAudio({ input: audioPath, from: item.unit.from, to: item.unit.to, output: item.slicePath });
    }
    const stageDir = join(planDir, "avatar", "kaggle-input");
    stageUnitDataset({ stageDir, portraitPath, items: submitItems, pipelineId: plan.pipelineId });
    const pushed = await d.transport.pushDataset({ dir: stageDir });
    datasetSource = pushed.source;
  }

  // Phase 1 — execute units scene by scene (submission order = plan order).
  // All generation completes BEFORE any post-processing: kernels get in
  // flight early and a scene-1 upscale failure must not orphan later scenes'
  // generation (it is all recorded in remote-task state for resume).
  const generatedAt = new Date().toISOString();
  for (const work of workScenes) {
    if (work.status !== "pending") continue;
    for (const item of work.items) {
      if (item.action === "submit") {
        const slug = unitSlugFor(plan.pipelineId, item.sceneId, item.unitIndex);
        const kernelId = `${KAGGLE_USERNAME}/${slug}`;
        item.kernelId = kernelId;
        item.priorElapsedSec = item.record?.elapsedSec ?? 0;
        const script = buildUnitKernelScript({ audioFile: `s${item.sceneId}-u${item.unitIndex}.wav`, outputFile: item.outputName });
        try {
          await d.transport.submitUnit({
            slug,
            script,
            datasetSources: [MODEL_DATASET_SOURCE, datasetSource],
            workDir: join(planDir, "avatar", "kernels", slug),
            unitKey: item.unitKey,
            sceneId: item.sceneId,
            unitIndex: item.unitIndex,
          });
        } catch (e) {
          recordTask(d.tasksPath, {
            id: kernelId,
            backend: "kaggle",
            kind: UNIT_TASK_KIND,
            unitKey: item.unitKey,
            pipelineId: plan.pipelineId,
            planPath,
            sceneId: item.sceneId,
            unitIndex: item.unitIndex,
            unitSpan: { from: item.unit.from, to: item.unit.to },
            outputDir: item.outputDir,
            outputName: item.outputName,
            state: "failed",
            error: e.message,
            errorClass: classifyTaskError(e.message),
            elapsedSec: item.priorElapsedSec,
          });
          return {
            outcome: "failed",
            reason: `Unit ${item.unitKey} submission failed: ${e.message}`,
            failedUnit: item.unitKey,
          };
        }
        recordTask(d.tasksPath, {
          id: kernelId,
          backend: "kaggle",
          kind: UNIT_TASK_KIND,
          unitKey: item.unitKey,
          pipelineId: plan.pipelineId,
          planPath,
          sceneId: item.sceneId,
          unitIndex: item.unitIndex,
          unitSpan: { from: item.unit.from, to: item.unit.to },
          outputDir: item.outputDir,
          outputName: item.outputName,
          state: "running",
          elapsedSec: item.priorElapsedSec,
        });
      }

      // Harvest (fresh or resumed) — skip units already complete locally.
      if (item.action === "skip") {
        item.kernelId = item.kernelId ?? item.record?.id ?? null;
        item.completedElapsedSec = item.record?.elapsedSec ?? 0;
        continue;
      }
      const harvestKernelId = item.action === "harvest" ? item.record.id : item.kernelId;
      item.kernelId = harvestKernelId;
      const res = await d.transport.harvestUnit({
        kernelId: harvestKernelId,
        outputDir: item.outputDir,
        outputName: item.outputName,
        timeoutSec: d.timeoutSec,
        pollIntervalSec: d.pollIntervalSec,
      });
      if (!res.success) {
        const state = res.stage === "timeout" ? "timeout" : res.stage === "download" ? "download-failed" : "failed";
        markTask(d.tasksPath, harvestKernelId, state, { lastError: res.stderr });
        return {
          outcome: "failed",
          reason: `Unit ${item.unitKey} failed: ${res.stderr}`,
          failedUnit: item.unitKey,
        };
      }
      if (!existsSync(join(item.outputDir, item.outputName))) {
        markTask(d.tasksPath, harvestKernelId, "download-failed", {
          lastError: `kernel output missing after download: ${join(item.outputDir, item.outputName)}`,
        });
        return {
          outcome: "failed",
          reason: `Unit ${item.unitKey}: kernel output missing after download (${join(item.outputDir, item.outputName)})`,
          failedUnit: item.unitKey,
        };
      }
      markUnitComplete(d.tasksPath, harvestKernelId, item.priorElapsedSec ?? item.record?.elapsedSec ?? 0, res.elapsedSec);
      item.completedElapsedSec = (item.priorElapsedSec ?? item.record?.elapsedSec ?? 0) + (res.elapsedSec ?? 0);
    }
  }

  // Phase 2 — per-scene post-processing: upscale + concat + atomic writeback.
  const writtenBack = [];
  for (const work of workScenes) {
    if (work.status !== "pending") continue;
    try {
      const videoPath = await finalizeScene({ plan, planScene: work.planScene, items: work.items, deps: d, planDir });
      work.status = "generated";
      work.videoPath = videoPath;
      writtenBack.push({ sceneId: work.planScene.sceneId, videoPath });
    } catch (e) {
      return {
        outcome: "failed",
        reason: `Scene ${work.planScene.sceneId} post-processing failed: ${e.message}`,
        failedScene: work.planScene.sceneId,
      };
    }
  }

  // Report (耗时/平台/费用) — written once, only after full success.
  const report = buildReport({ plan, planPath, workScenes, generatedAt });
  const reportPath = join(planDir, REPORT_FILE_NAME);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  return {
    outcome: "completed",
    planPath,
    reportPath,
    report,
    writtenBack,
  };
}

/**
 * Execute an approved plan end-to-end (ticket 04 `run --plan`).
 * See the "Run engine" section header for the contract.
 *
 * @param {object} p
 * @param {string} p.planPath - output/{pipelineId}/digital-human-plan.json
 * @param {string} [p.portrait] - reference photo override (default
 *        content/<dir>/assets/avatar/portrait.jpg)
 * @param {string} [p.outputRoot] - sanity-checked against the plan's location
 * @param {object} [p.deps] - injectable seams: { tasksPath, transport, ffmpeg, upscale, timeoutSec, pollIntervalSec }
 * @returns {Promise<object>} { outcome: "completed"|"refused"|"interrupted"|"failed", ... }
 */
export function runPlan(params) {
  return executeRunPlan({ ...params, mode: "run" });
}

/**
 * Recover an interrupted run (ticket 04 `resume --plan`): re-harvests units
 * with live/timeout/download-failed remote tasks, re-downloads completed
 * units whose local output vanished, resubmits only failed/never-submitted
 * units. Completed units are never resubmitted or re-billed.
 */
export function resumePlan(params) {
  return executeRunPlan({ ...params, mode: "resume" });
}
