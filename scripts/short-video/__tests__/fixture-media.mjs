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
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { SCENE_GATE_PHOTO } from "../remotion/src/fixture-media.mjs";

const REMOTION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "remotion");

/** `\x89PNG\r\n\x1a\n` — a real file starts with it; a truncated write does not. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Anything smaller than this is a truncated write, not a picture. */
const MIN_BYTES = 1024;

/** True when `path` holds a complete-looking PNG (size + signature). */
function looksLikePng(path) {
  if (!existsSync(path) || statSync(path).size < MIN_BYTES) return false;
  const head = Buffer.alloc(PNG_SIGNATURE.length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  return head.equals(PNG_SIGNATURE);
}

/**
 * Where the fixture's picture actually lives on disk.
 *
 * `remotion/public/assets` is a symlink to `scripts/short-video/assets`, and
 * `staticFile()` serves through it — so the file has to exist on the TARGET
 * side of the link. Writing to `public/assets/...` would work too, but it
 * hides which directory is the source of truth.
 */
export function sceneGatePhotoPath() {
  return join(REMOTION_DIR, "..", SCENE_GATE_PHOTO);
}

/**
 * Generate the fixture picture if it is not already there. Idempotent: a
 * present file is left untouched, so a re-run costs nothing and two suites in
 * the same vitest process cannot fight over it.
 *
 * Content is deliberately a synthetic test pattern rather than something that
 * tries to look like a photograph: the assertions that read this frame are
 * geometric (does the media layer render at all, do the text gates still
 * pass), and a pattern is deterministic across ffmpeg builds while a "nice"
 * gradient is not. 1600x900 is larger than the 1080x1920 canvas so the
 * `cover` branch has to crop — the same condition the real photo creates.
 */
export function ensureSceneGatePhoto() {
  const out = sceneGatePhotoPath();
  if (looksLikePng(out)) return out;

  mkdirSync(dirname(out), { recursive: true });
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1600x900", "-frames:v", "1", "-y", out],
    { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
  );
  return out;
}
