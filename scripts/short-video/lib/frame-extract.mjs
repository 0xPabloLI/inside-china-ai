/**
 * Batched frame extraction for pixel-level verification (#198 Item 5).
 *
 * The verify CLI used to spawn one ffmpeg process per frame with
 * `select=eq(n,X)` — each process decoded the video from the start, so N
 * scenes cost N near-full decodes. extractFramesAtIndexes() selects ALL
 * target indexes in a single pass and writes them to ordered image outputs;
 * the eq(n,X) index semantics are identical, only the decode count drops
 * from N to 1.
 */

import { execFile } from "child_process";
import { existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Build the select expression for the requested frame indexes.
 *
 * @param {number[]} frames - frame indexes (any order, duplicates removed)
 * @returns {string|null} e.g. "eq(n,5)+eq(n,8)+eq(n,15)", or null when empty
 */
export function frameSelectFilter(frames) {
  const unique = [...new Set(frames)].sort((a, b) => a - b);
  if (unique.length === 0) return null;
  return unique.map((f) => `eq(n,${f})`).join("+");
}

/**
 * Extract specific frames by index from a video in ONE ffmpeg pass.
 *
 * A select filter reduces the stream to the requested frames; a numbered
 * image2 pattern (`%d.png`) writes them out in order — the k-th selected
 * frame becomes `.fe-<k>.png`, so the mapping back to the ascending frame
 * list is deterministic. Each file is then renamed to nameFor(frame).
 * Frames beyond the video length (or a failed invocation) are reported as
 * missing rather than throwing — the caller decides whether an absent frame
 * is warn- or fail-class.
 *
 * @param {object} options
 * @param {string} options.videoPath
 * @param {number[]} options.frames - frame indexes to extract
 * @param {string} options.outDir - output directory (created on demand)
 * @param {(frame: number) => string} [options.nameFor] - output file name
 * @returns {Promise<{byFrame: Map<number, string>, missing: number[]}>}
 */
export async function extractFramesAtIndexes({ videoPath, frames, outDir, nameFor }) {
  const name = nameFor ?? ((f) => `frame-${f}.png`);
  const unique = [...new Set(frames)].sort((a, b) => a - b);
  const byFrame = new Map();
  const missing = [];
  const select = frameSelectFilter(unique);
  if (!select) return { byFrame, missing };

  const seqPattern = join(outDir, ".fe-%d.png");
  mkdirSync(outDir, { recursive: true });
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        videoPath,
        "-vf",
        `select='${select}'`,
        "-fps_mode",
        "passthrough",
        "-loglevel",
        "error",
        seqPattern,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch {
    // fall through — per-file existence decides missing below
  }

  unique.forEach((f, i) => {
    const seqPath = join(outDir, `.fe-${i + 1}.png`);
    if (!existsSync(seqPath)) {
      missing.push(f);
      return;
    }
    const finalPath = join(outDir, name(f));
    try {
      renameSync(seqPath, finalPath);
    } catch {
      missing.push(f);
      return;
    }
    byFrame.set(f, finalPath);
  });
  return { byFrame, missing };
}
