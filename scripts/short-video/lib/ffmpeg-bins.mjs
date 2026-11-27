/**
 * Decode/probe ffmpeg resolution (#1118).
 *
 * `upscale`, `dh-upscale`, `digital-human` and the avatar frame audit only
 * decode and probe media — they never burn ASS subtitles. Those calls therefore
 * do not need the libass build, and hardcoding `/opt/homebrew/opt/ffmpeg-full`
 * made every one of them die with ENOENT on a machine (or CI runner) that has
 * brew `ffmpeg` on PATH only. That is what kept `avatar-frame-audit` out of
 * `Lint, typecheck, test`: its fixtures synthesize with ffmpeg before the first
 * assertion, so the suite failed at collection-adjacent setup, not on a gate.
 *
 * Resolution order:
 *   1. `FFMPEG_BIN` / `FFPROBE_BIN` — explicit operator override, used as-is.
 *      A typo must surface as ENOENT naming the path, not silently pick a
 *      different binary than the one that was asked for.
 *   2. the Homebrew ffmpeg-full build when it exists (best decoder build on
 *      this machine and the historical default),
 *   3. the PATH binary.
 *
 * Boundary: the ASS burn in `post-process.mjs` still consumes `FFMPEG_FULL`,
 * because it needs libass — only ffmpeg-full carries it. The Step 0.4
 * preflight (#394) turns a missing build into a fail-fast error. Since #1591
 * `post-process.mjs` also imports this resolver for the passes that do NOT
 * carry subtitles (finalize without ASS, BGM mix, loudness repair, segment
 * audio concat), so an operator override works on a shell without Homebrew.
 * The burn call site itself must keep using `FFMPEG_FULL`;
 * `lib/__tests__/ffmpeg-bins.test.mjs` pins that distinction statically.
 *
 * Consumers: `upscale.mjs` (and therefore `dh-upscale`, `digital-human` and the
 * avatar frame audit through its re-exports), `tts/ffmpeg-cmd.mjs`,
 * `media-probe.mjs`, and — since #1586 — the verify/QA/BGM/series/download
 * passes (`verify-video`, `verify-remotion-frames`, `compile-series`,
 * `qa-final-review`, `mix-bgm`, `frame-extract`, `qa-mechanics`,
 * `generate-bgm`, `video-downloaders`, `audio/diagnostics`, plus `main.mjs`'s
 * preflight). Since #1591 `post-process.mjs` uses it for the non-ASS
 * finalize/mix/loudness/concat passes; the ASS burn stays on `FFMPEG_FULL`.
 * `lib/__tests__/ffmpeg-bins.test.mjs` pins that sweep so a new
 * bare `"ffmpeg"` / `"ffprobe"` call fails there instead of at the first
 * verify run on a shell without Homebrew on PATH.
 * Three decode consumers still pin ffmpeg-full unconditionally
 * (`asr-analyzer`, `temporal-focus`, `video-understand`); no CI suite executes
 * them, so they are not a gate hole, but they fail the same way on a machine
 * without the keg and belong here when one does.
 *
 * @module ffmpeg-bins
 */

import { execFileSync } from "child_process";
import { existsSync } from "fs";

/** ffmpeg-full build installed by Homebrew on this machine. */
const HOMEBREW_FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";

/** ffprobe from the same ffmpeg-full build. */
const HOMEBREW_FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";

/**
 * Pick a media binary: override → preferred build if installed → PATH.
 *
 * @param {object} p
 * @param {string} p.preferred - absolute path to the preferred build
 * @param {string} p.fallback - PATH-resolved command name
 * @param {string} p.envKey - override variable name
 * @param {NodeJS.ProcessEnv} [p.env=process.env]
 * @param {(path: string) => boolean} [p.exists=existsSync] - test seam
 * @returns {string}
 */
export function resolveMediaBinary({
  preferred,
  fallback,
  envKey,
  env = process.env,
  exists = existsSync,
}) {
  const override = env[envKey]?.trim();
  if (override) return override;
  return exists(preferred) ? preferred : fallback;
}

/** ffmpeg used by decode/encode paths (not the ASS burn). */
export const FFMPEG_BIN = resolveMediaBinary({
  preferred: HOMEBREW_FFMPEG,
  fallback: "ffmpeg",
  envKey: "FFMPEG_BIN",
});

/**
 * Is the resolved binary usable as the pipeline will use it?
 *
 * A path override is checked directly: `which` reports "not installed" for
 * `/opt/homebrew/.../ffmpeg` when PATH lacks that keg, even though the file
 * exists (#1586). A bare command is checked through PATH.
 *
 * @param {string} bin - absolute path or PATH command name
 * @returns {boolean}
 */
export function binaryUsable(bin) {
  if (bin.includes("/")) return existsSync(bin);
  try {
    execFileSync("which", [bin], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** ffprobe used by decode/encode paths (not the ASS burn). */
export const FFPROBE_BIN = resolveMediaBinary({
  preferred: HOMEBREW_FFPROBE,
  fallback: "ffprobe",
  envKey: "FFPROBE_BIN",
});
