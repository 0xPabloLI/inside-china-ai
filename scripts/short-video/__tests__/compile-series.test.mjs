import { describe, it, expect, vi } from "vitest";
import { buildConcatCommand, buildXfadeCommand } from "../compile-series.mjs";

describe("buildConcatCommand", () => {
  it("builds concat demuxer command for multiple files", () => {
    const files = ["/tmp/part1.mp4", "/tmp/part2.mp4", "/tmp/part3.mp4"];
    const cmd = buildConcatCommand(files, "/tmp/output.mp4");
    expect(cmd).toContain("ffmpeg");
    expect(cmd).toContain("concat");
    expect(cmd).toContain("/tmp/output.mp4");
  });
});

describe("buildXfadeCommand", () => {
  it("builds xfade command with correct offsets", () => {
    const files = [
      { path: "/tmp/part1.mp4", duration: 60 },
      { path: "/tmp/part2.mp4", duration: 65 },
    ];
    const cmd = buildXfadeCommand(files, "/tmp/output.mp4", 1);
    expect(cmd).toContain("xfade");
    expect(cmd).toContain("acrossfade");
    expect(cmd).toContain("59"); // offset = 60 - 1 (xfade duration) = 59
    expect(cmd).toContain("/tmp/output.mp4");
  });

  it("handles 3 files with cumulative offsets", () => {
    const files = [
      { path: "/tmp/p1.mp4", duration: 60 },
      { path: "/tmp/p2.mp4", duration: 65 },
      { path: "/tmp/p3.mp4", duration: 70 },
    ];
    const cmd = buildXfadeCommand(files, "/tmp/out.mp4", 1);
    expect(cmd).toContain("xfade");
    // offset for 2nd xfade = 60-1 + 65-1 = 123
    expect(cmd).toContain("123");
  });
});
