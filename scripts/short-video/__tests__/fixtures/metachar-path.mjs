/**
 * Metachar-path guard harness for the #319 deferred class sweep.
 *
 * The property under test: a media path carrying shell metacharacters must
 * reach the binary as one argv element, never as shell syntax. The
 * `$(touch MARKER)` payload makes the difference observable — a shell runs the
 * substitution and creates MARKER in the process's cwd; argv hands the path
 * over literally, so the file is simply not found.
 *
 * One harness keeps the five suites that assert this from growing divergent
 * private copies (and from leaking their temp dirs).
 */
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const FFPROBE_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";

/** ffprobe is present (ffmpeg-full's copy, or a PATH one). */
export const hasFfprobe =
  existsSync(FFPROBE_FULL) || spawnSync("ffprobe", ["-version"]).status === 0;

/** ffmpeg is present on PATH. */
export const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

/**
 * Run `body` with the process cwd inside a fresh temp dir and a metachar-laden
 * media path in scope, then restore the cwd and remove the dir.
 *
 * Async on purpose: an awaited body keeps the cwd swapped for its whole run,
 * and the restore still happens when `body` throws. chdir is safe here — the
 * root vitest config leaves the default pool, so each test file runs in its own
 * process.
 *
 * @param {string} prefix - temp dir prefix (suite name)
 * @param {string} ext - victim file extension, e.g. "mp4"
 * @param {(victim: string, dir: string) => unknown} body
 */
export async function withMetacharPath(prefix, ext, body) {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const victim = join(dir, `evil$(touch MARKER).${ext}`);
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await body(victim, dir);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Whether the payload's command substitution actually ran. `true` is the RED
 * state — a shell saw the path.
 *
 * @param {string} dir - the dir `withMetacharPath` handed to `body`
 */
export function markerCreated(dir) {
  return existsSync(join(dir, "MARKER"));
}
