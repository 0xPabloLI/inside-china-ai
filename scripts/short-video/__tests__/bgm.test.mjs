/**
 * analyzeBGM probing is argv-safe (#319 deferred class sweep).
 *
 * The BGM file name is data, not shell syntax: both probes (ffprobe duration,
 * ffmpeg volumedetect) must hand the path to the binary as one argv element.
 * The metachar case is the regression guard — on a shell string the
 * substitution runs in the process's cwd.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { analyzeBGM } from "../lib/bgm.mjs";

const FFPROBE_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
const hasFfprobe = existsSync(FFPROBE_FULL) || spawnSync("ffprobe", ["-version"]).status === 0;
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("analyzeBGM", () => {
  it.skipIf(!(hasFfprobe && hasFfmpeg))("keeps shell metacharacters in the path literal", () => {
    const dir = mkdtempSync(join(tmpdir(), "bgm-319-"));
    // A real mp3 so BOTH probes run: the duration probe must succeed for the
    // volumedetect probe to be reached.
    const victim = join(dir, "evil$(touch MARKER).mp3");
    const made = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-codec:a",
      "libmp3lame",
      victim,
    ]);
    expect(made.status).toBe(0);

    const cwd = process.cwd();
    process.chdir(dir); // a substitution, if any shell sees it, lands here
    try {
      const meta = analyzeBGM(victim);

      expect(meta).not.toBeNull();
      expect(meta.duration).toBeGreaterThan(0.9); // duration probe ran
      expect(Number.isFinite(meta.meanVolumeDb)).toBe(true); // volumedetect ran
      expect(existsSync(join(dir, "MARKER"))).toBe(false);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
