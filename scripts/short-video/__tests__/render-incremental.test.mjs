import { describe, it, expect } from "vitest";
import {
  INCREMENTAL_SCHEMA,
  assertSegmentsCover,
  buildSceneFingerprints,
  canonicalJson,
  compositionFingerprintOf,
  planIncrementalRender,
  sceneFingerprintParts,
  sceneFingerprint,
  sliceSourceRange,
  timelineDescriptor,
  totalFramesOf,
} from "../lib/render-incremental.mjs";

const FPS = 30;

function makeProps() {
  const scenes = [
    { id: 1, visualType: "hook", texts: { subject: "A" } },
    { id: 2, visualType: "narrative", texts: { subject: "B" } },
    { id: 3, visualType: "data", texts: { subject: "C" } },
    { id: 4, visualType: "cta", texts: { subject: "D" } },
  ];
  return { scenes, durations: [3, 4, 5, 3], audioPaths: [] };
}

function makePrevious(props, fingerprints, compositionFingerprint) {
  const timeline = timelineDescriptor(props, { fps: FPS });
  const totalFrames = totalFramesOf(timeline);
  return {
    schema: INCREMENTAL_SCHEMA,
    compositionFingerprint,
    fps: FPS,
    totalFrames,
    scenes: timeline.map((entry, i) => ({
      ...entry,
      fingerprint: fingerprints[i].fingerprint,
    })),
    segments: [
      {
        kind: "reuse",
        path: "base-raw.mp4",
        startFrame: 0,
        endFrame: totalFrames,
        timelineStartFrame: 0,
        timelineEndFrame: totalFrames,
      },
    ],
  };
}

function plan(props, previous, { compositionFingerprint = "comp-a", fingerprints } = {}) {
  const fps = FPS;
  const sceneFingerprints =
    fingerprints ?? buildSceneFingerprints({ scenes: props.scenes, durations: props.durations });
  return planIncrementalRender({
    previous,
    props,
    sceneFingerprints,
    compositionFingerprint,
    fps,
  });
}

describe("canonicalJson / fingerprints", () => {
  it("sorts object keys so the same input hashes the same", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(sceneFingerprint({ b: 1, a: 2 })).toBe(sceneFingerprint({ a: 2, b: 1 }));
  });

  it("puts neighbour visual types into the fingerprint", () => {
    const scene = { id: 2, visualType: "narrative" };
    const base = sceneFingerprintParts({ scene, duration: 4, prevVisualType: "hook", nextVisualType: "data" });
    const moved = sceneFingerprintParts({ scene, duration: 4, prevVisualType: "hook", nextVisualType: "cta" });
    expect(sceneFingerprint(base)).not.toBe(sceneFingerprint(moved));
  });

  it("composition fingerprint is order-sensitive and stable", () => {
    expect(compositionFingerprintOf([{ path: "a", sha256: "1" }])).toBe(
      compositionFingerprintOf([{ sha256: "1", path: "a" }]),
    );
    expect(compositionFingerprintOf([{ path: "a", sha256: "1" }])).not.toBe(
      compositionFingerprintOf([{ path: "b", sha256: "1" }]),
    );
  });
});

describe("planIncrementalRender", () => {
  it("reuses everything when no scene input changed", () => {
    const props = makeProps();
    const fingerprints = buildSceneFingerprints({ scenes: props.scenes, durations: props.durations });
    const previous = makePrevious(props, fingerprints, "comp-a");
    const result = plan(props, previous);
    expect(result.mode).toBe("noop");
    expect(result.segments).toHaveLength(1);
    expect(result.stats.dirtyFrames).toBe(0);
    expect(result.stats.reusedFrames).toBe(result.totalFrames);
  });

  it("renders one scene's window and reuses both sides when its copy changes", () => {
    const props = makeProps();
    const previousProps = makeProps();
    const previousFingerprints = buildSceneFingerprints({
      scenes: previousProps.scenes,
      durations: previousProps.durations,
    });
    const previous = makePrevious(previousProps, previousFingerprints, "comp-a");

    props.scenes[1] = { ...props.scenes[1], texts: { subject: "B changed" } };
    const result = plan(props, previous);

    expect(result.mode).toBe("incremental");
    expect(result.dirtyIntervals).toEqual([{ startFrame: 105, endFrame: 250, sceneIds: [2] }]);
    expect(result.segments.map((s) => [s.kind, s.timelineStartFrame, s.timelineEndFrame])).toEqual([
      ["reuse", 0, 105],
      ["render", 105, 250],
      ["reuse", 250, 510],
    ]);
    // No duration moved, so the old source frame equals the new one.
    expect(result.segments[2].startFrame).toBe(250);
    expect(result.stats.dirtyFrames).toBe(145);
  });

  it("maps later clean frames through the duration delta", () => {
    const props = makeProps();
    props.durations = [3, 4.4, 5, 3];
    const previousProps = makeProps();
    const previousFingerprints = buildSceneFingerprints({
      scenes: previousProps.scenes,
      durations: previousProps.durations,
    });
    const previous = makePrevious(previousProps, previousFingerprints, "comp-a");

    const current = buildSceneFingerprints({ scenes: props.scenes, durations: props.durations });
    const result = plan(props, previous, { fingerprints: current });

    expect(result.mode).toBe("incremental");
    expect(result.totalFrames).toBe(522);
    expect(result.dirtyIntervals[0]).toMatchObject({ startFrame: 105, endFrame: 262 });
    const tail = result.segments[result.segments.length - 1];
    expect(tail).toMatchObject({
      kind: "reuse",
      path: "base-raw.mp4",
      startFrame: 250,
      endFrame: 510,
      timelineStartFrame: 262,
      timelineEndFrame: 522,
    });
  });

  it("marks the scene dirty when only its media bytes changed", () => {
    const props = makeProps();
    const previousFingerprints = buildSceneFingerprints({
      scenes: props.scenes,
      durations: props.durations,
      mediaSha256: { 2: "old" },
    });
    const previous = makePrevious(props, previousFingerprints, "comp-a");
    const current = buildSceneFingerprints({
      scenes: props.scenes,
      durations: props.durations,
      mediaSha256: { 2: "new" },
    });
    const result = plan(props, previous, { fingerprints: current });

    expect(result.mode).toBe("incremental");
    expect(result.stats.dirtyScenes).toEqual([2]);
  });

  it("drags both neighbours in when a visualType change flips a transition", () => {
    const props = makeProps();
    const previousFingerprints = buildSceneFingerprints({
      scenes: props.scenes,
      durations: props.durations,
    });
    const previous = makePrevious(props, previousFingerprints, "comp-a");

    props.scenes[2] = { ...props.scenes[2], visualType: "narrative" };
    const current = buildSceneFingerprints({ scenes: props.scenes, durations: props.durations });
    const result = plan(props, previous, { fingerprints: current });

    expect(result.mode).toBe("incremental");
    expect(result.stats.dirtyScenes).toEqual([2, 3, 4]);
    // Windows 2→3→4 chain into one range that runs to the end of the video.
    expect(result.segments.map((s) => [s.kind, s.timelineStartFrame, s.timelineEndFrame])).toEqual([
      ["reuse", 0, 105],
      ["render", 105, 510],
    ]);
  });

  it("falls back to full when the composition fingerprint changed", () => {
    const props = makeProps();
    const fingerprints = buildSceneFingerprints({ scenes: props.scenes, durations: props.durations });
    const previous = makePrevious(props, fingerprints, "comp-a");
    const result = plan(props, previous, { compositionFingerprint: "comp-b" });
    expect(result.mode).toBe("full");
    expect(result.reason).toBe("composition fingerprint changed");
  });

  it("falls back to full when the scene count changed", () => {
    const props = makeProps();
    const fingerprints = buildSceneFingerprints({ scenes: props.scenes, durations: props.durations });
    const previous = makePrevious(props, fingerprints, "comp-a");
    const shorter = { ...props, scenes: props.scenes.slice(0, 3), durations: props.durations.slice(0, 3) };
    const result = plan(shorter, previous, {
      fingerprints: buildSceneFingerprints({
        scenes: shorter.scenes,
        durations: shorter.durations,
      }),
    });
    expect(result.mode).toBe("full");
    expect(result.reason).toContain("scene count");
  });

  it("falls back to full when the previous segments have a gap", () => {
    const props = makeProps();
    const fingerprints = buildSceneFingerprints({ scenes: props.scenes, durations: props.durations });
    const previous = makePrevious(props, fingerprints, "comp-a");
    previous.segments = [
      { path: "a.mp4", startFrame: 0, endFrame: 200 },
      { path: "b.mp4", startFrame: 250, endFrame: 510 },
    ];
    const result = plan(props, previous);
    expect(result.mode).toBe("full");
    expect(result.reason).toContain("previous segments unusable");
  });

  it("falls back to full when every scene changed", () => {
    const props = makeProps();
    const previousFingerprints = buildSceneFingerprints({
      scenes: props.scenes,
      durations: props.durations,
    });
    const previous = makePrevious(props, previousFingerprints, "comp-a");

    props.scenes = props.scenes.map((scene, i) => ({ ...scene, texts: { subject: `new-${i}` } }));
    const current = buildSceneFingerprints({ scenes: props.scenes, durations: props.durations });
    const result = plan(props, previous, { fingerprints: current });
    expect(result.mode).toBe("full");
    expect(result.reason).toBe("every scene changed");
  });

  it("falls back to full without a schema-stamped previous block", () => {
    const props = makeProps();
    expect(plan(props, null).mode).toBe("full");
    expect(plan(props, { fps: FPS }).mode).toBe("full");
  });
});

describe("sliceSourceRange / assertSegmentsCover", () => {
  it("splits a clean range across two recorded sources", () => {
    const segments = [
      { path: "a.mp4", startFrame: 0, endFrame: 100 },
      { path: "b.mp4", startFrame: 100, endFrame: 200 },
    ];
    const sliced = sliceSourceRange(segments, 50, 150);
    expect(sliced).toEqual([
      { kind: "reuse", path: "a.mp4", startFrame: 50, endFrame: 100, timelineStartFrame: 50, timelineEndFrame: 100 },
      { kind: "reuse", path: "b.mp4", startFrame: 100, endFrame: 150, timelineStartFrame: 100, timelineEndFrame: 150 },
    ]);
  });

  it("rejects gaps, overlaps and a short tail", () => {
    expect(() =>
      assertSegmentsCover(
        [
          { kind: "reuse", path: "a", timelineStartFrame: 0, timelineEndFrame: 100 },
          { kind: "render", timelineStartFrame: 120, timelineEndFrame: 200 },
        ],
        200,
      ),
    ).toThrow(/gap or overlap/);

    expect(() =>
      assertSegmentsCover([{ kind: "render", timelineStartFrame: 0, timelineEndFrame: 180 }], 200),
    ).toThrow(/expected 200/);

    expect(() => assertSegmentsCover([], 200)).toThrow(/no segments/);
  });
});
