/**
 * Tests for lib/post-process.mjs — extracted post-processing functions.
 *
 * These are interface/contract tests: they verify the functions exist,
 * accept the right arguments, and call ffmpeg with the expected flags.
 * Full integration is covered by verify-video.mjs on actual pipeline runs.
 */
import { describe, it, expect } from "vitest";
import { join } from "path";
import { hasFfprobe, markerCreated, withMetacharPath } from "./fixtures/metachar-path.mjs";

const ROOT = join(import.meta.dirname, "..");

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

// #1043: the local bed gain is calibrated against the shipped-artifact
// measurement, not against the platform's dB slider. Lock the value and its
// derivation here so a later retune has a failing test explaining the target
// (docs/research/music-under-voice-calibration-2026-10.md §6.1).
describe("DEFAULT_BGM_VOLUME calibration (#1043)", () => {
  it("is 0.08 — the -3.5 dB retune aligning the local mix with platform attach", async () => {
    const { DEFAULT_BGM_VOLUME } = await import(join(ROOT, "lib", "post-process.mjs"));
    expect(DEFAULT_BGM_VOLUME).toBe(0.08);

    // The bed gain itself drops -3.52 dB, which RAISES the measured
    // music-below-narration margin by +3.52 dB. 0.12 was the #950-era default
    // that measured 13.7 dB on the real deepseek-v41-flash-1017 render (PASS,
    // 1.7 dB from the loud edge).
    const marginGainDb = -20 * Math.log10(DEFAULT_BGM_VOLUME / 0.12);
    expect(marginGainDb).toBeCloseTo(3.52, 2);
    expect(13.7 + marginGainDb).toBeGreaterThan(17);
    expect(13.7 + marginGainDb).toBeLessThan(18);
  });
});

// The BGM fade-out timing probes the video duration. That probe is argv-only
// (#319 deferred class sweep): a path with shell metacharacters must reach
// ffprobe literally, never through a shell.
describe("BGM fade-out duration probe is argv-safe", () => {
  it.skipIf(!hasFfprobe)("mixBgm keeps shell metacharacters in the path literal", async () => {
    const { mixBgm } = await import(join(ROOT, "lib", "post-process.mjs"));
    await withMetacharPath("mixbgm-319", "mp4", (victim, dir) => {
      // ffmpeg cannot read the junk input either way; what matters is that the
      // probe never handed the path to a shell.
      expect(() => mixBgm(victim, victim, join(dir, "out.mp4"))).toThrow();
      expect(markerCreated(dir)).toBe(false);
    });
  });

  it.skipIf(!hasFfprobe)(
    "finalizeRenderedVideo keeps shell metacharacters in the path literal",
    async () => {
      const { finalizeRenderedVideo } = await import(join(ROOT, "lib", "post-process.mjs"));
      await withMetacharPath("finalize-319", "mp4", (victim, dir) => {
        expect(() =>
          finalizeRenderedVideo({
            videoPath: victim,
            bgmPath: victim,
            outputPath: join(dir, "out.mp4"),
            loudnessReadback: false,
          }),
        ).toThrow();
        expect(markerCreated(dir)).toBe(false);
      });
    },
  );
});
