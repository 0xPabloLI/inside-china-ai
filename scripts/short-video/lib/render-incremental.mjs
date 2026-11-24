/**
 * Incremental render planning (#228 ③ / spec `spec-render-incremental-228-3`).
 *
 * Pure functions only: this module never touches the filesystem, ffmpeg or
 * Remotion. It turns two recorded render inputs (the previous manifest's scene
 * fingerprints + timeline, and the props of the run about to render) into a
 * segment plan:
 *
 *   { kind: "reuse", path, startFrame, endFrame }  — frames already encoded
 *   { kind: "render", startFrame, endFrame }       — frames to rasterize
 *
 * The plan must cover [0, totalFrames) contiguously and in timeline order. Any
 * doubt — missing schema, mismatched fps, changed composition fingerprint,
 * missing source files, scene count drift — returns `mode: "full"` with a
 * reason. The caller obeys that instead of guessing.
 *
 * Frame semantics (see `lib/timeline.mjs`): scene timelines tile with a
 * TRANSITION_FRAMES overlap. A non-final scene owns
 * `[offset, offset + clipFrames + TRANSITION_FRAMES)` — both neighbouring
 * 10-frame transitions live inside one of the two adjacent windows, so a dirty
 * scene's window already covers every frame its pixels can reach. Never cut
 * inside a scene.
 */
import { createHash } from "node:crypto";
import { sceneTimeline, TRANSITION_FRAMES } from "./timeline.mjs";

export const INCREMENTAL_SCHEMA = "short-video-render-incremental@1";

/** Deterministic JSON: object keys sorted, no whitespace churn. */
export function canonicalJson(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (seen.has(value)) throw new Error("canonicalJson: circular structure");
  seen.add(value);
  let out;
  if (Array.isArray(value)) {
    out = `[${value.map((item) => canonicalJson(item, seen)).join(",")}]`;
  } else {
    const keys = Object.keys(value).sort();
    out = `{${keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], seen)}`)
      .join(",")}}`;
  }
  seen.delete(value);
  return out;
}

export function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * One scene's fingerprint. Every field here is a way pixels can change:
 * - `scene`: copy, layout, texts, media path, chart data, animation knobs;
 * - `duration`: drives each component's local animation clock;
 * - `audioSha256`: re-cut voiceover changes the audio in that window;
 * - `mediaSha256`: same filename, different bytes is a picture change;
 * - `prev/nextVisualType`: `getTransition()` picks fade/slide/wipe from both
 *   sides, so changing one scene's type changes its neighbours' frames.
 */
export function sceneFingerprintParts({
  scene,
  duration,
  audioSha256 = null,
  mediaSha256 = null,
  prevVisualType = null,
  nextVisualType = null,
}) {
  const visualType = scene?.visualType ?? null;
  return {
    scene,
    duration,
    audioSha256,
    mediaSha256,
    prevVisualType: prevVisualType ?? null,
    nextVisualType: nextVisualType ?? null,
    visualType,
  };
}

export function sceneFingerprint(parts) {
  return sha256Hex(canonicalJson(parts));
}

/**
 * Build fingerprints for the whole scene list, wiring neighbour visual types.
 * @returns {{id: string|number, fingerprint: string, parts: object}[]}
 */
export function buildSceneFingerprints({ scenes, durations, audioSha256 = {}, mediaSha256 = {} }) {
  return (scenes ?? []).map((scene, index) => {
    const id = scene?.id ?? index + 1;
    const parts = sceneFingerprintParts({
      scene,
      duration: durations?.[index] ?? null,
      audioSha256: audioSha256[id] ?? null,
      mediaSha256: mediaSha256[id] ?? null,
      prevVisualType: index > 0 ? (scenes[index - 1]?.visualType ?? null) : null,
      nextVisualType: index < scenes.length - 1 ? (scenes[index + 1]?.visualType ?? null) : null,
    });
    return { id, fingerprint: sceneFingerprint(parts), parts };
  });
}

/** Composition-wide fingerprint from a stable list of {path, sha256} entries. */
export function compositionFingerprintOf(entries) {
  return sha256Hex(canonicalJson(entries ?? []));
}

/**
 * Timeline descriptor recorded in the manifest and compared on the next run.
 * @param {{scenes: object[], durations: number[]}} props
 */
export function timelineDescriptor(props, { fps = 30, transitionFrames = TRANSITION_FRAMES } = {}) {
  const scenes = props?.scenes ?? [];
  const schedule = sceneTimeline(
    scenes.map((scene, i) => ({
      sceneId: scene?.id ?? i + 1,
      duration: props.durations?.[i] ?? 0,
    })),
    { fps, transitionOverlap: transitionFrames },
  );
  return schedule.map((entry) => ({
    sceneId: entry.sceneId,
    offsetFrames: entry.offsetFrames,
    clipFrames: entry.clipFrames,
    visualFrames: entry.visualFrames,
  }));
}

export function totalFramesOf(timeline) {
  const last = timeline?.[timeline.length - 1];
  return last ? last.offsetFrames + last.visualFrames : 0;
}

/**
 * Walk the previous segment list and slice [startFrame, endFrame) out of it.
 * Previous segments are contiguous and cover [0, prevTotalFrames); a clean
 * range can straddle two sources (raw cut + a part from an earlier run), so
 * this returns one entry per overlap.
 */
export function sliceSourceRange(
  previousSegments,
  startFrame,
  endFrame,
  timelineAnchor = startFrame,
) {
  const out = [];
  for (const segment of previousSegments ?? []) {
    // `startFrame`/`endFrame` address the source file; the timeline position is
    // recorded separately because a reused range may begin at an offset inside
    // an older raw (and two segments can point at the same source).
    const timelineStart = segment.timelineStartFrame ?? segment.startFrame;
    const timelineEnd = segment.timelineEndFrame ?? segment.endFrame;
    const from = Math.max(startFrame, timelineStart);
    const to = Math.min(endFrame, timelineEnd);
    if (to <= from) continue;
    out.push({
      kind: "reuse",
      path: segment.path,
      startFrame: segment.startFrame + (from - timelineStart),
      endFrame: segment.startFrame + (to - timelineStart),
      timelineStartFrame: timelineAnchor + (from - startFrame),
      timelineEndFrame: timelineAnchor + (to - startFrame),
    });
  }
  return out.sort((a, b) => a.timelineStartFrame - b.timelineStartFrame);
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort(
    (a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame,
  );
  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startFrame <= last.endFrame) {
      last.endFrame = Math.max(last.endFrame, interval.endFrame);
      last.sceneIds = [...new Set([...(last.sceneIds ?? []), ...(interval.sceneIds ?? [])])];
    } else {
      merged.push({ ...interval, sceneIds: [...(interval.sceneIds ?? [])] });
    }
  }
  return merged;
}

function complementIntervals(intervals, totalFrames) {
  const out = [];
  let cursor = 0;
  for (const interval of intervals) {
    if (interval.startFrame > cursor) {
      out.push({ startFrame: cursor, endFrame: interval.startFrame });
    }
    cursor = Math.max(cursor, interval.endFrame);
  }
  if (cursor < totalFrames) out.push({ startFrame: cursor, endFrame: totalFrames });
  return out;
}

/**
 * Validate that segments are fully specified, ordered, gap-free and end at
 * `totalFrames`. Throws — a malformed plan must never reach ffmpeg.
 */
export function assertSegmentsCover(segments, totalFrames) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("incremental plan: no segments");
  }
  let cursor = 0;
  for (const segment of segments) {
    if (segment.kind === "reuse" && !segment.path) {
      throw new Error("incremental plan: reuse segment without a path");
    }
    const start = segment.timelineStartFrame ?? segment.startFrame;
    const end = segment.timelineEndFrame ?? segment.endFrame;
    if (!(Number.isInteger(start) && Number.isInteger(end)) || end <= start) {
      throw new Error(`incremental plan: bad segment range ${start}..${end}`);
    }
    if (start !== cursor) {
      throw new Error(
        `incremental plan: gap or overlap at frame ${cursor} (segment starts ${start})`,
      );
    }
    cursor = end;
  }
  if (cursor !== totalFrames) {
    throw new Error(`incremental plan: segments end at ${cursor}, expected ${totalFrames}`);
  }
  return true;
}

/**
 * Compare the previous manifest's incremental block with the current inputs.
 *
 * @param {object} input
 * @param {object|null} input.previous - previous manifest `incremental` block
 * @param {{scenes: object[], durations: number[]}} input.props
 * @param {{id: string|number, fingerprint: string}[]} input.sceneFingerprints
 * @param {string} input.compositionFingerprint
 * @param {number} [input.fps]
 * @param {number} [input.transitionFrames]
 * @returns {{mode: "full"|"noop"|"incremental", reason: string|null, timeline: object[], totalFrames: number, dirtyIntervals: object[], segments: object[], stats: object}}
 */
export function planIncrementalRender({
  previous,
  props,
  sceneFingerprints,
  compositionFingerprint,
  fps = 30,
  transitionFrames = TRANSITION_FRAMES,
}) {
  const timeline = timelineDescriptor(props, { fps, transitionFrames });
  const totalFrames = totalFramesOf(timeline);
  const base = {
    timeline,
    totalFrames,
    dirtyIntervals: [],
    segments: [],
    stats: { totalFrames, reusedFrames: 0, dirtyFrames: totalFrames, dirtyScenes: [] },
  };
  const full = (reason) => ({ ...base, mode: "full", reason });

  if (!previous || previous.schema !== INCREMENTAL_SCHEMA) {
    return full("no incremental manifest");
  }
  if (previous.fps !== fps) return full(`fps ${previous.fps} → ${fps}`);
  if (!totalFrames) return full("empty timeline");
  if (timeline.length !== previous.scenes?.length) {
    return full(`scene count ${previous.scenes?.length} → ${timeline.length}`);
  }
  if (previous.compositionFingerprint !== compositionFingerprint) {
    return full("composition fingerprint changed");
  }

  const previousSegments = previous.segments;
  try {
    // Segments record *source* ranges; their timeline position is separate
    // because a reused range can start at an offset inside an older raw.
    assertSegmentsCover(
      previousSegments.map((segment) => ({
        ...segment,
        timelineStartFrame: segment.timelineStartFrame ?? segment.startFrame,
        timelineEndFrame: segment.timelineEndFrame ?? segment.endFrame,
      })),
      previous.totalFrames,
    );
  } catch (error) {
    return full(`previous segments unusable: ${error.message}`);
  }

  const dirtyScenes = [];
  for (let i = 0; i < timeline.length; i += 1) {
    const current = sceneFingerprints?.[i];
    const old = previous.scenes?.[i];
    if (!current || !old || current.fingerprint !== old.fingerprint) {
      dirtyScenes.push({ index: i, sceneId: timeline[i].sceneId });
    }
  }

  const dirtyIntervals = mergeIntervals(
    dirtyScenes.map(({ index, sceneId }) => ({
      startFrame: timeline[index].offsetFrames,
      endFrame: Math.min(totalFrames, timeline[index].offsetFrames + timeline[index].visualFrames),
      sceneIds: [sceneId],
    })),
  );

  const stats = {
    totalFrames,
    reusedFrames: 0,
    dirtyFrames: dirtyIntervals.reduce((sum, i) => sum + (i.endFrame - i.startFrame), 0),
    dirtyScenes: dirtyScenes.map((s) => s.sceneId),
  };

  if (dirtyScenes.length === 0) {
    if (previous.totalFrames !== totalFrames) {
      return full(`total frames ${previous.totalFrames} → ${totalFrames} with no scene change`);
    }
    const segments = previousSegments.map((segment) => ({
      kind: "reuse",
      path: segment.path,
      startFrame: segment.startFrame,
      endFrame: segment.endFrame,
      timelineStartFrame: segment.timelineStartFrame ?? segment.startFrame,
      timelineEndFrame: segment.timelineEndFrame ?? segment.endFrame,
    }));
    try {
      assertSegmentsCover(segments, totalFrames);
    } catch (error) {
      return full(`cached segments unusable: ${error.message}`);
    }
    return {
      timeline,
      totalFrames,
      mode: "noop",
      reason: "inputs identical",
      dirtyIntervals: [],
      segments,
      stats: { ...stats, reusedFrames: totalFrames, dirtyFrames: 0 },
    };
  }

  if (dirtyScenes.length === timeline.length) {
    return { ...base, mode: "full", reason: "every scene changed", stats };
  }

  const cleanIntervals = complementIntervals(dirtyIntervals, totalFrames);

  // A clean interval must map onto the previous raw with one constant delta.
  // Deltas only change at a scene whose duration changed — and that scene is
  // dirty, so a clean interval never straddles one.
  const segments = [];
  try {
    for (const interval of cleanIntervals) {
      const sceneIndex = timeline.findIndex(
        (entry, i) =>
          interval.startFrame >= entry.offsetFrames &&
          (i === timeline.length - 1 || interval.startFrame < timeline[i + 1].offsetFrames),
      );
      if (sceneIndex < 0) throw new Error(`no scene owns clean frame ${interval.startFrame}`);
      const delta = timeline[sceneIndex].offsetFrames - previous.scenes[sceneIndex].offsetFrames;
      const oldStart = interval.startFrame - delta;
      const oldEnd = interval.endFrame - delta;
      if (oldStart < 0 || oldEnd > previous.totalFrames) {
        throw new Error(`clean range maps outside previous timeline (${oldStart}..${oldEnd})`);
      }
      // Guard the constant-delta assumption.
      for (let j = sceneIndex + 1; j < timeline.length; j += 1) {
        if (timeline[j].offsetFrames >= interval.endFrame) break;
        if (timeline[j].clipFrames !== previous.scenes[j].clipFrames) {
          throw new Error(
            `clean range straddles a duration change at scene ${timeline[j].sceneId}`,
          );
        }
      }
      const slices = sliceSourceRange(previousSegments, oldStart, oldEnd, interval.startFrame);
      const mapped = slices.reduce(
        (sum, s) => sum + (s.timelineEndFrame - s.timelineStartFrame),
        0,
      );
      if (mapped !== interval.endFrame - interval.startFrame) {
        throw new Error(
          `clean range ${interval.startFrame}..${interval.endFrame} mapped ${mapped} frames`,
        );
      }
      segments.push(...slices);
    }

    for (const interval of dirtyIntervals) {
      segments.push({
        kind: "render",
        startFrame: interval.startFrame,
        endFrame: interval.endFrame,
        timelineStartFrame: interval.startFrame,
        timelineEndFrame: interval.endFrame,
        sceneIds: interval.sceneIds,
      });
    }

    segments.sort((a, b) => a.timelineStartFrame - b.timelineStartFrame);
    assertSegmentsCover(segments, totalFrames);
  } catch (error) {
    return full(`cannot build a safe plan: ${error.message}`);
  }

  const reusedFrames = segments
    .filter((s) => s.kind === "reuse")
    .reduce((sum, s) => sum + (s.timelineEndFrame - s.timelineStartFrame), 0);

  return {
    timeline,
    totalFrames,
    mode: "incremental",
    reason: null,
    dirtyIntervals,
    segments,
    stats: { ...stats, reusedFrames, dirtyFrames: totalFrames - reusedFrames },
  };
}
