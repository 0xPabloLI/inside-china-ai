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
 * Boundary: the ASS burn in `post-process.mjs` deliberately does NOT import
 * this module. It consumes libass, which only ffmpeg-full carries, and the
 * Step 0.4 preflight (#394) turns a missing build into a fail-fast error.
 * Falling back to PATH there would move the failure to the last step of a
 * render — the exact incident that gate exists for. `lib/__tests__/ffmpeg-bins.test.mjs`
 * rejects that wiring statically.
 *
 * Consumers: `upscale.mjs` (and therefore `dh-upscale`, `digital-human` and the
 * avatar frame audit through its re-exports), `tts/ffmpeg-cmd.mjs` and
 * `media-probe.mjs` — the last two used to carry their own copy of the rule.
 * Three decode consumers still pin ffmpeg-full unconditionally
 * (`asr-analyzer`, `temporal-focus`, `video-understand`); no CI suite executes
 * them, so they are not a gate hole, but they fail the same way on a machine
 * without the keg and belong here when one does.
 *
 * @module ffmpeg-bins
 */

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

/** ffprobe used by decode/encode paths (not the ASS burn). */
export const FFPROBE_BIN = resolveMediaBinary({
  preferred: HOMEBREW_FFPROBE,
  fallback: "ffprobe",
  envKey: "FFPROBE_BIN",
});
