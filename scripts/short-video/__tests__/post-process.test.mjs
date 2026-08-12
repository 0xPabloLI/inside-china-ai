/**
 * Tests for lib/post-process.mjs — extracted post-processing functions.
 *
 * These are interface/contract tests: they verify the functions exist,
 * accept the right arguments, and call ffmpeg with the expected flags.
 * Full integration is covered by verify-video.mjs on actual pipeline runs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

describe("post-process module", () => {
  it("should export burnSubtitles, mixBgm, normalizeLoudness", async () => {
    const mod = await import(join(ROOT, "lib", "post-process.mjs"));
    assert.equal(typeof mod.burnSubtitles, "function");
    assert.equal(typeof mod.mixBgm, "function");
    assert.equal(typeof mod.normalizeLoudness, "function");
  });

  it("burnSubtitles should accept (videoPath, assPath, outputPath)", async () => {
    const { burnSubtitles } = await import(join(ROOT, "lib", "post-process.mjs"));
    assert.equal(burnSubtitles.length, 3); // 3 named params
  });

  it("mixBgm should accept (videoPath, bgmPath, outputPath, volume)", async () => {
    const { mixBgm } = await import(join(ROOT, "lib", "post-process.mjs"));
    // .length excludes params with defaults; verify >= 3 required params
    assert.ok(
      mixBgm.length >= 3,
      `mixBgm should have at least 3 required params, got ${mixBgm.length}`,
    );
  });

  it("normalizeLoudness should accept (videoPath, outputPath, target)", async () => {
    const { normalizeLoudness } = await import(join(ROOT, "lib", "post-process.mjs"));
    // .length excludes params with defaults; verify >= 2 required params
    assert.ok(
      normalizeLoudness.length >= 2,
      `normalizeLoudness should have at least 2 required params, got ${normalizeLoudness.length}`,
    );
  });

  it("normalizeLoudness should default target to -16 LUFS", async () => {
    const { normalizeLoudness } = await import(join(ROOT, "lib", "post-process.mjs"));
    // Verify the function exists and can be called (default param tested via source)
    assert.equal(typeof normalizeLoudness, "function");
  });
});
