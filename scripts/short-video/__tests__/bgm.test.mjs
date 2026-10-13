/**
 * analyzeBGM probing is argv-safe (#319 deferred class sweep).
 *
 * The BGM file name is data, not shell syntax: both probes (ffprobe duration,
 * ffmpeg volumedetect) must hand the path to the binary as one argv element.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { analyzeBGM } from "../lib/bgm.mjs";
import {
  hasFfmpeg,
  hasFfprobe,
  markerCreated,
  withMetacharPath,
} from "./fixtures/metachar-path.mjs";

describe("analyzeBGM", () => {
  it.skipIf(!(hasFfprobe && hasFfmpeg))(
    "keeps shell metacharacters in the path literal",
    async () => {
      await withMetacharPath("bgm-319", "mp3", (victim, dir) => {
        // A real mp3 so BOTH probes run: the duration probe must succeed for
        // the volumedetect probe to be reached.
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

        const meta = analyzeBGM(victim);

        expect(meta).not.toBeNull();
        expect(meta.duration).toBeGreaterThan(0.9); // duration probe ran
        expect(Number.isFinite(meta.meanVolumeDb)).toBe(true); // volumedetect ran
        expect(markerCreated(dir)).toBe(false);
      });
    },
  );
});
