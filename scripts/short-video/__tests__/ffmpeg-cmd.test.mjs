/**
 * getDuration / getDurationSync — the shared ffprobe duration seam used by
 * mix-bgm, render-only and render-remotion (#319 OCR video batch scan, async
 * probe converted in the deferred class sweep).
 *
 * The metachar case is the regression guard: the path must reach ffprobe as
 * argv, never as shell syntax.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { getDuration, getDurationSync } from "../lib/tts/ffmpeg-cmd.mjs";
import {
  hasFfmpeg,
  hasFfprobe,
  markerCreated,
  withMetacharPath,
} from "./fixtures/metachar-path.mjs";

describe("getDurationSync", () => {
  it("throws for a file ffprobe cannot read", () => {
    const dir = mkdtempSync(join(tmpdir(), "ffmpeg-cmd-319-"));
    const junk = join(dir, "junk.wav");
    writeFileSync(junk, "not media");
    expect(() => getDurationSync(junk)).toThrow();
  });

  it("throws for a missing file", () => {
    expect(() => getDurationSync("/nonexistent/missing.wav")).toThrow();
  });

  it.skipIf(!(hasFfprobe && hasFfmpeg))("reads a real wav duration", () => {
    const dir = mkdtempSync(join(tmpdir(), "ffmpeg-cmd-319-"));
    const wav = join(dir, "voiceover.wav");
    const made = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1.25",
      wav,
    ]);
    expect(made.status).toBe(0);

    const duration = getDurationSync(wav);
    expect(duration).toBeGreaterThan(1.15);
    expect(duration).toBeLessThan(1.35);
  });

  it.skipIf(!hasFfprobe)("keeps shell metacharacters in the path literal", () => {
    withMetacharPath("ffmpeg-cmd-319", "wav", (victim, dir) => {
      writeFileSync(victim, "not media");
      expect(() => getDurationSync(victim)).toThrow();
      expect(markerCreated(dir)).toBe(false);
    });
  });
});

// The async probe is the same seam, awaited (#319 deferred class sweep).
describe("getDuration", () => {
  it.skipIf(!hasFfprobe)("keeps shell metacharacters in the path literal", async () => {
    await withMetacharPath("ffmpeg-cmd-async-319", "wav", async (victim, dir) => {
      writeFileSync(victim, "not media");
      await expect(getDuration(victim)).rejects.toThrow();
      expect(markerCreated(dir)).toBe(false);
    });
  });

  it.skipIf(!(hasFfprobe && hasFfmpeg))("reads a real wav duration", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ffmpeg-cmd-async-319-"));
    const wav = join(dir, "voiceover.wav");
    const made = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1.25",
      wav,
    ]);
    expect(made.status).toBe(0);

    const duration = await getDuration(wav);
    expect(duration).toBeGreaterThan(1.15);
    expect(duration).toBeLessThan(1.35);
  });
});
