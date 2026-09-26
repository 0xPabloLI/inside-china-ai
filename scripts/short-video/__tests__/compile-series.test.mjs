import { describe, it, expect } from "vitest";
import { buildConcatArgs, concatListEntry, buildXfadeArgs } from "../compile-series.mjs";

// #319 OCR High finding: paths were previously interpolated into shell command
// strings executed via execSync. The contract now is argv arrays executed via
// spawnSync — every path is a single literal argv element, never shell text.

describe("concatListEntry", () => {
  it("quotes a path for the concat demuxer list file", () => {
    expect(concatListEntry("/tmp/part1.mp4")).toBe("file '/tmp/part1.mp4'");
  });

  it("escapes single quotes inside paths", () => {
    expect(concatListEntry("/tmp/a'b/part1.mp4")).toBe("file '/tmp/a'\\''b/part1.mp4'");
  });

  it("resolves relative paths to absolute", () => {
    expect(concatListEntry("part1.mp4")).toMatch(/^file '\//);
  });
});

describe("buildConcatArgs", () => {
  it("returns a concat plan whose args is a literal argv array", () => {
    const plan = buildConcatArgs(["/tmp/part1.mp4", "/tmp/part2.mp4"], "/tmp/output.mp4");
    expect(plan.listFile).toBeTruthy();
    expect(plan.listContent).toContain("file '/tmp/part1.mp4'");
    expect(plan.args).toEqual([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      plan.listFile,
      "-c",
      "copy",
      "/tmp/output.mp4",
    ]);
  });

  it("keeps shell metacharacters as list-file data, not command text", () => {
    const sneaky = "/tmp/$(touch /tmp/pwned) ; rm -rf ~.mp4";
    const plan = buildConcatArgs([sneaky], "/tmp/out.mp4");
    expect(plan.listContent).toContain("$(touch /tmp/pwned) ; rm -rf ~.mp4");
    // no path material leaks outside the -i list file argument
    expect(plan.args.every((a) => !a.includes("rm -rf"))).toBe(true);
  });
});

describe("buildXfadeArgs", () => {
  const two = [
    { path: "/tmp/part1.mp4", duration: 60 },
    { path: "/tmp/part2.mp4", duration: 65 },
  ];

  it("returns an argv array with one -i per input", () => {
    const args = buildXfadeArgs(two, "/tmp/output.mp4", 1);
    expect(Array.isArray(args)).toBe(true);
    expect(args.filter((a) => a === "-i")).toHaveLength(2);
    expect(args).toContain("/tmp/part1.mp4");
    expect(args).toContain("/tmp/part2.mp4");
    expect(args).toContain("/tmp/output.mp4");
  });

  it("keeps shell metacharacters as one literal argv element", () => {
    const sneaky = '/tmp/p"; $(touch /tmp/pwned) > /dev/null; #.mp4';
    const args = buildXfadeArgs(
      [
        { path: sneaky, duration: 60 },
        { path: "/tmp/part2.mp4", duration: 65 },
      ],
      "/tmp/out.mp4",
      1,
    );
    // the whole hostile string survives as a single argv element
    expect(args).toContain(sneaky);
  });

  it("carries the filter graph with the offset math (60-1=59)", () => {
    const args = buildXfadeArgs(two, "/tmp/output.mp4", 1);
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("xfade");
    expect(filter).toContain("acrossfade");
    expect(filter).toContain("offset=59");
  });

  it("computes cumulative offsets for 3 files (60-1 + 65-1 = 123)", () => {
    const three = [...two, { path: "/tmp/p3.mp4", duration: 70 }];
    const args = buildXfadeArgs(three, "/tmp/out.mp4", 1);
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("offset=123");
  });

  it("maps vout/aout and re-encodes", () => {
    const args = buildXfadeArgs(two, "/tmp/output.mp4", 1);
    expect(args[args.indexOf("-map") + 1]).toBe("[vout]");
    expect(args[args.lastIndexOf("-map") + 1]).toBe("[aout]");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
  });

  it("single file degrades to a plain copy argv", () => {
    expect(buildXfadeArgs([{ path: "/tmp/a.mp4", duration: 30 }], "/tmp/out.mp4", 1)).toEqual([
      "-y",
      "-i",
      "/tmp/a.mp4",
      "-c",
      "copy",
      "/tmp/out.mp4",
    ]);
  });

  it("returns empty argv for no files", () => {
    expect(buildXfadeArgs([], "/tmp/out.mp4", 1)).toEqual([]);
  });
});
