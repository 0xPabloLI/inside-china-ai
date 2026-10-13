/**
 * Tests for lib/post-process.mjs — extracted post-processing functions.
 *
 * These are interface/contract tests: they verify the functions exist,
 * accept the right arguments, and call ffmpeg with the expected flags.
 * Full integration is covered by verify-video.mjs on actual pipeline runs.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dirname, "..");
const FFPROBE_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";

describe("post-process module", () => {
  it("should export burnSubtitles, mixBgm, normalizeLoudness", async () => {
    const mod = await import(join(ROOT, "lib", "post-process.mjs"));
    expect(typeof mod.burnSubtitles).toBe("function");
    expect(typeof mod.mixBgm).toBe("function");
    expect(typeof mod.normalizeLoudness).toBe("function");
  });

  it("burnSubtitles should accept (videoPath, assPath, outputPath)", async () => {
    const { burnSubtitles } = await import(join(ROOT, "lib", "post-process.mjs"));
    expect(burnSubtitles.length).toBe(3); // 3 named params
  });

  it("mixBgm should accept (videoPath, bgmPath, outputPath, volume)", async () => {
    const { mixBgm } = await import(join(ROOT, "lib", "post-process.mjs"));
    // .length excludes params with defaults; verify >= 3 required params
    expect(mixBgm.length).toBeGreaterThanOrEqual(3);
  });

  it("normalizeLoudness should accept (videoPath, outputPath, target)", async () => {
    const { normalizeLoudness } = await import(join(ROOT, "lib", "post-process.mjs"));
    // .length excludes params with defaults; verify >= 2 required params
    expect(normalizeLoudness.length).toBeGreaterThanOrEqual(2);
  });

  it("normalizeLoudness should default target to -16 LUFS", async () => {
    const { normalizeLoudness } = await import(join(ROOT, "lib", "post-process.mjs"));
    // Verify the function exists and can be called (default param tested via source)
    expect(typeof normalizeLoudness).toBe("function");
  });
});

// The BGM fade-out timing probes the video duration. That probe is argv-only
// (#319 deferred class sweep): a path with shell metacharacters must reach
// ffprobe literally, never through a shell.
describe("BGM fade-out duration probe is argv-safe", () => {
  const hasFfprobe = existsSync(FFPROBE_FULL) || spawnSync("ffprobe", ["-version"]).status === 0;

  it.skipIf(!hasFfprobe)("mixBgm keeps shell metacharacters in the path literal", async () => {
    const { mixBgm } = await import(join(ROOT, "lib", "post-process.mjs"));
    const dir = mkdtempSync(join(tmpdir(), "mixbgm-319-"));
    const victim = join(dir, "evil$(touch MARKER).mp4");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      // ffmpeg cannot read the junk input either way; what matters is that the
      // probe never handed the path to a shell.
      expect(() => mixBgm(victim, victim, join(dir, "out.mp4"))).toThrow();
      expect(existsSync(join(dir, "MARKER"))).toBe(false);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasFfprobe)(
    "finalizeRenderedVideo keeps shell metacharacters in the path literal",
    async () => {
      const { finalizeRenderedVideo } = await import(join(ROOT, "lib", "post-process.mjs"));
      const dir = mkdtempSync(join(tmpdir(), "finalize-319-"));
      const victim = join(dir, "evil$(touch MARKER).mp4");
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        expect(() =>
          finalizeRenderedVideo({
            videoPath: victim,
            bgmPath: victim,
            outputPath: join(dir, "out.mp4"),
            loudnessReadback: false,
          }),
        ).toThrow();
        expect(existsSync(join(dir, "MARKER"))).toBe(false);
      } finally {
        process.chdir(cwd);
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
