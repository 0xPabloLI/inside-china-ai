import { describe, it, expect } from "vitest";
import { checkDemoCuts } from "../lib/demo-cut.mjs";

const validScene = {
  id: 4,
  mediaRole: "evidence",
  media: { type: "video", path: "assets/tree-cut.mp4", volume: 1 },
};

const validMeta = {
  demoRequired: true,
  demoCuts: {
    4: {
      source: "scripts/short-video/output/external-demos/full-with-audio.mp4",
      sourceDurationSec: 292.79,
      startSec: 34,
      endSec: 42,
      why: "34–42s is the sharp tree artwork; 0–8s is a blurred intro silhouette.",
      audio: "source",
      derivedAsset: "assets/tree-cut.mp4",
    },
  },
};

const run = (meta = validMeta, scenes = [validScene]) =>
  checkDemoCuts({
    meta,
    scenes,
    contentDirAbs: "/repo/scripts/short-video/content/test-pack",
    repoRoot: "/repo",
    fileExists: () => true,
  }).rows;

const failures = (rows) => rows.filter((row) => row.level === "fail");

describe("demo cut provenance", () => {
  it("passes a complete record", () => {
    const rows = run();
    expect(failures(rows)).toEqual([]);
    expect(rows.some((row) => row.level === "pass" && row.check.includes("provenance"))).toBe(true);
  });

  it("fails when a contest pack has no record for its evidence video", () => {
    const meta = { demoRequired: true, demoCuts: {} };
    expect(failures(run(meta)).some((row) => row.check.includes("has a cut record"))).toBe(true);
  });

  it("fails a 28-second 'demo' as a highlight reel rather than a shot", () => {
    const meta = structuredClone(validMeta);
    meta.demoCuts[4].endSec = 62;
    expect(failures(run(meta)).some((row) => row.check.includes("window is"))).toBe(true);
  });

  it("fails when the record says source audio but the scene is muted", () => {
    const scene = { ...validScene, media: { ...validScene.media, volume: 0 } };
    expect(
      failures(run(validMeta, [scene])).some((row) => row.check.includes("source audible")),
    ).toBe(true);
  });

  it("fails when the scene plays a different cut than the record names", () => {
    const scene = { ...validScene, media: { ...validScene.media, path: "assets/band.mp4" } };
    expect(
      failures(run(validMeta, [scene])).some((row) => row.check.includes("matches scene")),
    ).toBe(true);
  });

  it("fails a reason that only says 'demo'", () => {
    const meta = structuredClone(validMeta);
    meta.demoCuts[4].why = "demo";
    expect(failures(run(meta)).some((row) => row.check.includes("why is recorded"))).toBe(true);
  });

  it("warns when the cut starts at 0", () => {
    const meta = structuredClone(validMeta);
    meta.demoCuts[4].startSec = 0;
    meta.demoCuts[4].endSec = 8;
    const rows = run(meta);
    expect(failures(rows)).toEqual([]);
    expect(rows.some((row) => row.level === "warn" && row.check.includes("intro"))).toBe(true);
  });
});
