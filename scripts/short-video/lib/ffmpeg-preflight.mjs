/**
 * ASS burn-in preflight — Step 0.4 hard gate (#394).
 *
 * The 2026-10-04 incident: the pipeline burned TTS and a full Remotion render
 * (tens of minutes), then died at the subtitle burn because the ffmpeg it
 * consumes lacked libass. The failure landed at the very end of the run, after
 * every expensive step, and read as a generic ffmpeg error.
 *
 * Two details make the obvious check wrong:
 *   1. The burn does NOT use PATH ffmpeg. `post-process.mjs` burns ASS with
 *      ffmpeg-full, because Homebrew's default ffmpeg formula omits libass.
 *      A PATH probe would pass on a machine where the burn fails, so this gate
 *      probes the SAME binary the burn consumes (imported, not re-declared).
 *   2. `ffmpeg -h filter=ass` exits 0 even when libass is absent (measured
 *      2026-10-12), so "help works" proves nothing. The `-filters` list is the
 *      only reliable probe — it prints the filter table and the `ass` row is
 *      present exactly when the filter is compiled in.
 *
 * Judgement is unconditional for voiced runs (any scene with voiceover/ttsText
 * → burned subtitles) and N/A for visual-only runs, matching the render
 * boundary guard (#421) via the shared `hasVoicedScenes` predicate.
 *
 * @module ffmpeg-preflight
 */

import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { FFMPEG_FULL } from "./post-process.mjs";
import { hasVoicedScenes } from "./subtitles/generate.mjs";

/** Install hint for both failure reasons — same binary, same fix. */
const ASS_FIX_HINT = "Fix: brew install ffmpeg-full (Homebrew's default ffmpeg has no libass)";

/**
 * Does a `ffmpeg -filters` listing contain the `ass` filter?
 *
 * Anchored on the filter-name column (`<flags> <name> <io>  <description>`):
 * matching the raw substring would accept `asuperpass`/`allpass`/`bandpass`,
 * and matching the description would accept any filter whose help text
 * mentions ASS.
 *
 * @param {string} text - stdout of `ffmpeg -hide_banner -filters`
 * @returns {boolean}
 */
export function filtersIncludeAss(text) {
  return /^\s*\S+\s+ass\s+\S+->\S+/m.test(String(text ?? ""));
}

/**
 * Probe the burn binary for libass support.
 *
 * @param {object} [options]
 * @param {string} [options.binary=FFMPEG_FULL] - the binary post-process.mjs consumes
 * @param {Function} [options.fileExists=existsSync] - test seam
 * @param {Function} [options.probe] - test seam; returns `{status, output, error}`
 * @returns {{ok: boolean, reason: null|"binary"|"filter", binary: string, detail: string|null}}
 */
export function checkAssBurnCapability({
  binary = FFMPEG_FULL,
  fileExists = existsSync,
  probe = (bin) => {
    const r = spawnSync(bin, ["-hide_banner", "-filters"], { encoding: "utf8" });
    return { status: r.status, output: r.stdout ?? "", error: r.error?.message ?? null };
  },
} = {}) {
  if (!fileExists(binary)) {
    return { ok: false, reason: "binary", binary, detail: `not found at ${binary}` };
  }

  let result;
  try {
    result = probe(binary);
  } catch (err) {
    return { ok: false, reason: "binary", binary, detail: `cannot execute: ${err.message}` };
  }
  if (!result || result.status !== 0) {
    return {
      ok: false,
      reason: "binary",
      binary,
      detail: result?.error || `exited with status ${result?.status}`,
    };
  }
  if (!filtersIncludeAss(result.output)) {
    return { ok: false, reason: "filter", binary, detail: "the ass filter is not compiled in" };
  }

  return { ok: true, reason: null, binary, detail: null };
}

/**
 * Ensure ASS burn-in is possible, or terminate the pipeline.
 * Called from main.mjs right after the ASR gate — fail fast, before the
 * TTS/Remotion spend rather than at the final burn.
 *
 * `capability` is resolved lazily and only for a voiced run, so a visual-only
 * run pays no `spawnSync` for a burn it will never do.
 *
 * @param {object} [options]
 * @param {Array<{voiceover?: string, ttsText?: string}>} [options.scenes]
 * @param {ReturnType<typeof checkAssBurnCapability>|Function} [options.capability]
 *   the capability, or a function returning it (resolved only on a voiced run);
 *   test seam
 * @param {Function} [options.exit=process.exit] - test seam
 * @returns {{ok: boolean, skipped?: boolean, exited?: boolean}}
 */
export function ensureAssBurnOrExit({
  scenes,
  capability = checkAssBurnCapability,
  exit = process.exit,
} = {}) {
  if (!hasVoicedScenes(scenes)) {
    console.log("✅ Step 0.4: ASS burn preflight N/A (visual-only run — no subtitles burned)");
    return { ok: true, skipped: true };
  }

  const cap = typeof capability === "function" ? capability() : capability;

  if (cap.ok) {
    console.log(`✅ Step 0.4: ASS burn available (${cap.binary})`);
    return { ok: true };
  }

  console.error(`❌ Step 0.4: ASS burn unavailable (${cap.reason}) — ${cap.detail}`);
  console.error(
    "   The run has voiceover, so subtitles are burned with the ass filter after the Remotion render. Without it the pipeline dies at the last step, after the TTS and render spend.",
  );
  console.error(`   Probed: ${cap.binary}`);
  console.error(`   ${ASS_FIX_HINT}`);
  exit(1);
  return { ok: false, exited: true };
}
