/**
 * Tests for lib/frame-extract.mjs (#198 Item 5).
 *
 * verify-remotion-frames used to spawn one ffmpeg process per frame with
 * select=eq(n,midFrame) — every process decoded the video from 0, so N scenes
 * cost N near-full decodes. extractFramesAtIndexes() selects all target frame
 * indexes in ONE pass and writes them to ordered outputs; the eq(n,X) index
 * semantics are unchanged, only the number of decodes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { frameSelectFilter, extractFramesAtIndexes } from "../lib/frame-extract.mjs";

describe("frameSelectFilter", () => {
  it("builds an ascending, deduplicated eq(n) chain", () => {
    expect(frameSelectFilter([15, 5, 15, 8])).toBe("eq(n,5)+eq(n,8)+eq(n,15)");
  });

  it("returns null for an empty frame list", () => {
    expect(frameSelectFilter([])).toBeNull();
  });
});

describe("extractFramesAtIndexes (integration, real ffmpeg)", () => {
  let dirs = [];
  const cleanup = () => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  };
  afterEach(cleanup);

  /** 30-frame synthetic video: 10fps × 3s, distinct pattern per frame. */
  function makeVideo(dir) {
    const videoPath = join(dir, "in.mp4");
    execSync(
      `ffmpeg -y -f lavfi -i testsrc2=duration=3:size=64x64:rate=10 -pix_fmt yuv420p "${videoPath}" 2>/dev/null`,
    );
    return videoPath;
  }

  it("extracts all requested frames in one pass", async () => {
    const dir = mkdtempSync(join(tmpdir(), "frame-extract-"));
    dirs.push(dir);
    const videoPath = makeVideo(dir);
    const outDir = join(dir, "frames");

    const { byFrame, missing } = await extractFramesAtIndexes({
      videoPath,
      frames: [5, 15, 29],
      outDir,
    });

    expect(missing).toEqual([]);
    expect([...byFrame.keys()].sort((a, b) => a - b)).toEqual([5, 15, 29]);
    for (const path of byFrame.values()) {
      expect(existsSync(path)).toBe(true);
    }
  });

  it("reports frames beyond the video length as missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "frame-extract-miss-"));
    dirs.push(dir);
    const videoPath = makeVideo(dir);

    const { byFrame, missing } = await extractFramesAtIndexes({
      videoPath,
      frames: [5, 100],
      outDir: join(dir, "frames"),
    });

    expect(byFrame.has(5)).toBe(true);
    expect(missing).toEqual([100]);
  });

  it("deduplicates repeated frame requests", async () => {
    const dir = mkdtempSync(join(tmpdir(), "frame-extract-dup-"));
    dirs.push(dir);
    const videoPath = makeVideo(dir);

    const { byFrame, missing } = await extractFramesAtIndexes({
      videoPath,
      frames: [7, 7, 7, 12],
      outDir: join(dir, "frames"),
    });

    expect(missing).toEqual([]);
    expect(byFrame.size).toBe(2);
    expect(byFrame.has(7)).toBe(true);
    expect(byFrame.has(12)).toBe(true);
  });
});
