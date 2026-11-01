/**
 * Generated media for the scene-gate fixture (#1093).
 *
 * `contrast-media-render` and `scene-gate-render` both render
 * `remotion/src/scene-gate-fixture.tsx`, which binds a picture. Until #1093
 * that picture was a scraped Pexels photo that `.gitignore` keeps out of the
 * repo, so a clean checkout (CI) rendered `Could not load <CanvasImage>` / 404
 * and neither suite could be gated. This module writes a deterministic one
 * instead — the same move `media-focus-render` already makes with its
 * colour-banded sources, so the render contract carries no committed binary.
 *
 * The path itself is NOT defined here: it lives in
 * `remotion/src/fixture-media.mjs` because the fixture has to bind the same
 * string. Two files naming one path by hand is how the 404 comes back.
 *
 * The file is a cache, not an artifact: it is gitignored, regenerated on
 * demand, and never deleted by the suites (a second suite in the same run
 * would otherwise delete it mid-render).
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { inspectMediaFile } from "../lib/media-integrity.mjs";
import { SCENE_GATE_PHOTO } from "../remotion/src/fixture-media.mjs";

const REMOTION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "remotion");

/**
 * Where the fixture's picture actually lives on disk.
 *
 * `remotion/public/assets` is a symlink to `scripts/short-video/assets`, and
 * `staticFile()` serves through it — so the file has to exist on the TARGET
 * side of the link. Writing to `public/assets/...` would work too, but it
 * hides which directory is the source of truth.
 */
function sceneGatePhotoPath() {
  return join(REMOTION_DIR, "..", SCENE_GATE_PHOTO);
}

/**
 * True when the path holds a COMPLETE picture.
 *
 * `inspectMediaFile` walks the PNG chunks to IEND, so a half-written cache from
 * an interrupted run is regenerated instead of rendered — a size/signature
 * check cannot tell the two apart.
 */
function isCompletePng(path) {
  if (!existsSync(path)) return false;
  return inspectMediaFile(path, { declaredType: "image" }).ok === true;
}

/**
 * Generate the fixture picture if it is not already there. Idempotent: a
 * complete file is left untouched, so a re-run costs nothing.
 *
 * Concurrency: vitest runs test FILES in separate worker processes, so both
 * suites can call this at once. ffmpeg writes to a per-process temp file and
 * the result is renamed into place — `rename` is atomic within a filesystem,
 * so no reader can observe a partially written picture.
 *
 * Content is deliberately a synthetic test pattern rather than something that
 * tries to look like a photograph: the assertions that read this frame are
 * geometric (does the media layer render at all, do the text gates still
 * pass), and a pattern is deterministic across ffmpeg builds while a "nice"
 * gradient is not. 1600x900 is larger than the 1080x1920 canvas so the
 * `cover` branch has to crop — the same condition the real photo created.
 */
export function ensureSceneGatePhoto() {
  const out = sceneGatePhotoPath();
  if (isCompletePng(out)) return out;

  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp.png`;
  try {
    execFileSync(
      "ffmpeg",
      ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1600x900", "-frames:v", "1", "-y", tmp],
      { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
    );
    renameSync(tmp, out);
  } finally {
    rmSync(tmp, { force: true });
  }
  return out;
}
