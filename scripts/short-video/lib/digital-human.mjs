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
 * Future exports (ticket 04): runPackage(), resumePackage() — they consume
 * this plan file after approval.approved === true; deliberately not stubbed
 * here.
 *
 * @module digital-human
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { pathToFileURL, fileURLToPath } from "url";

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
