import { describe, it, expect, vi, beforeEach } from "vitest";

// The module shells out to ffmpeg; the parsing/selection contract is what this
// test pins, not the decoder.
const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock("child_process", () => ({ spawnSync }));

import { cutsArtifact, detectCuts, parseScenePts } from "../lib/cut-detect.mjs";

describe("parseScenePts (#749)", () => {
  it("reads showinfo pts_time values in output order", () => {
    const stderr = [
      "frame:0 pts:0 pts_time:0",
      "[Parsed_showinfo_1 @ 0x7f] n:0 pts:55 pts_time:1.83333 pos:1 fmt:yuv420p",
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x.mp4':",
      "[Parsed_showinfo_1 @ 0x7f] n:1 pts:112 pts_time:3.733333 pos:2 fmt:yuv420p",
    ].join("\n");
    expect(parseScenePts(stderr)).toEqual([0, 1.83333, 3.733333]);
  });

  it("returns an empty list for missing or unrelated stderr", () => {
    expect(parseScenePts("")).toEqual([]);
    expect(parseScenePts(null)).toEqual([]);
    expect(parseScenePts("frame= 10 fps=0.0 q=-0.0 size=N/A time=00:00:01")).toEqual([]);
  });
});

describe("detectCuts (#749)", () => {
  beforeEach(() => {
    spawnSync.mockReset();
  });

  it("runs the scene filter with the requested threshold and drops frame 0", () => {
    spawnSync.mockReturnValue({
      status: 0,
      stderr: "pts_time:3.0\npts_time:1.5\npts_time:3.0\npts_time:0",
    });
    const result = detectCuts("/tmp/x.mp4", { threshold: 0.15 });
    expect(result).toEqual({ cutsMs: [1500, 3000], threshold: 0.15 });
    const [, args] = spawnSync.mock.calls[0];
    expect(args).toContain("select='gt(scene,0.15)',showinfo");
    expect(args).toContain("-an"); // no audio decode: the source must not need the track
  });

  it("throws with the decoder's tail when ffmpeg fails", () => {
    spawnSync.mockReturnValue({ status: 1, stderr: "line1\nInvalid data found" });
    expect(() => detectCuts("/tmp/x.mp4")).toThrow(
      /ffmpeg scene detection failed \(1\).*Invalid data/,
    );
  });

  it("rethrows spawn errors (missing binary, timeout)", () => {
    spawnSync.mockReturnValue({ error: new Error("ENOENT") });
    expect(() => detectCuts("/tmp/x.mp4")).toThrow(/ENOENT/);
  });
});

describe("cutsArtifact (#749)", () => {
  it("pins the persisted shape shared by the runner and the retime CLI", () => {
    expect(cutsArtifact("737", { cutsMs: [1833, 3733], threshold: 0.15 })).toEqual({
      schemaVersion: "competitor-cuts-v1",
      videoId: "737",
      source: "ffmpeg-scene",
      threshold: 0.15,
      cutsMs: [1833, 3733],
    });
  });
});
