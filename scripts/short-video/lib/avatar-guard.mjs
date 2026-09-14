/**
 * Digital-human (avatar) clip guard — the single implementation of the
 * "a declared clip must be present, readable and long enough" invariant
 * (#214 ticket 02, tightened by #272).
 *
 * Why one module and not a check at each call site: the pipeline reaches the
 * render through several doors — `main.mjs` (full run), `render-only.mjs`,
 * `rerender.mjs`, `rerender-full.mjs`, `realign-render.mjs` (all via
 * `renderRemotion`) — and only some of them know the voiceover duration. The
 * duration rule is a contract, so it lives with its implementation and every
 * door calls it.
 *
 * #272 background: avatar clips are NOT invalidated when TTS is regenerated
 * (`avatar.videoPath` has no link to the audio that produced it), so the checks
 * used to only ask "does the file exist?" and stale lip-sync shipped silently.
 * The real pilot is the fixture in the tests: a 5.00s clip against a 7.24s
 * voiceover (content/dh-pilot-qwen4 scene-10, #225/#272).
 */

import { existsSync } from "fs";
import { join } from "path";
import { getDurationSync } from "./tts/ffmpeg-cmd.mjs";

/**
 * Seconds of slack when comparing clip length to voiceover length: just over one
 * frame at 30fps (0.033s), so container/frame quantisation cannot fail a clip
 * that was generated for exactly this voiceover. It never admits a real
 * mismatch — the failure this guard exists for was 2.24s short.
 */
export const AVATAR_DURATION_EPSILON_SEC = 0.05;

/**
 * Whether a Scene declares the avatar layer at all. Scenes with no declaration
 * must stay byte-identical through every gate, so this predicate is the single
 * entry condition for all of them.
 *
 * @param {object} scene
 * @returns {boolean}
 */
export function isAvatarDeclared(scene) {
  return Boolean(scene?.avatar) && typeof scene.avatar === "object";
}

/**
 * The remediation hint every avatar failure carries.
 *
 * A stale clip needs the FORCE path, not a plain re-run: `digital-human run`
 * skips a scene whose `videoPath` is already set (its documented stale-plan
 * protection, lib/digital-human.mjs), so an operator who re-runs it without
 * `--force` watches the stale clip survive and the gate fire again. It must be
 * the ORIGINAL approved plan: a re-planned file marks scenes already-generated
 * (#233).
 *
 * @param {object} scene
 * @param {string} declared - the declared videoPath (or a placeholder)
 * @returns {string}
 */
export function avatarRemediation(scene, declared) {
  return (
    `\n   Remediation: regenerate it with the FORCE path — a plain run SKIPS scenes whose` +
    `\n   videoPath is already set (stale-plan protection), so a stale clip survives it:` +
    `\n     node scripts/short-video/digital-human.mjs run --plan <original plan.json> --force` +
    `\n   (--force clears scene-data avatar.videoPath + the cached mp4 + the matching remote-task` +
    `\n   records, #233; use the ORIGINAL approved plan),` +
    `\n   or restore the clip at ${declared} by hand,` +
    `\n   or remove scene.avatar from scene ${scene.id} to render without the card.`
  );
}

/**
 * Probe a media file's duration in seconds with ffprobe (a hard pipeline
 * dependency — see the finalize step, which already relies on it).
 *
 * @param {string} mediaPath
 * @returns {number} duration in seconds, or NaN when the file is unreadable
 */
export function probeMediaDurationSeconds(mediaPath) {
  try {
    const duration = getDurationSync(mediaPath);
    return Number.isFinite(duration) && duration > 0 ? duration : NaN;
  } catch {
    return NaN;
  }
}

/**
 * Assert one scene's declared avatar clip is usable.
 *
 * Order matters for the message the operator sees: pending generation is a
 * scene-data problem, a missing file is an asset problem, an unreadable file is
 * corruption, and a short clip is stale lip-sync. Each has its own fix, so each
 * gets its own message.
 *
 * @param {object} options
 * @param {object} options.scene - scene with an optional `avatar` declaration
 * @param {number} [options.voiceoverDurationSec] - the scene's CURRENT voiceover
 *   duration (from the TTS results, not the scene's own length). Omit it only
 *   where the pipeline genuinely does not know it yet (the pre-TTS pass), which
 *   downgrades this to a presence + readability check.
 * @param {string} [options.contentDir] - base dir for the content-relative path
 * @param {(path: string) => number} [options.probe] - duration probe (test seam)
 * @returns {{avatarDurationSec: number|null}} what was checked
 */
export function assertAvatarScene({
  scene,
  voiceoverDurationSec,
  contentDir = "",
  probe = probeMediaDurationSeconds,
}) {
  if (!isAvatarDeclared(scene)) return { avatarDurationSec: null };

  // Declared but never generated (the generation CLI writes videoPath back) —
  // fail-closed rather than shipping the video without its host.
  if (!scene.avatar.videoPath) {
    throw new Error(
      `[AvatarCard] Scene ${scene.id}: avatar declared but no videoPath (still pending generation).` +
        avatarRemediation(scene, "<generated clip>"),
    );
  }

  const avatarSrc = join(contentDir || ".", scene.avatar.videoPath);
  if (!existsSync(avatarSrc)) {
    throw new Error(
      `[AvatarCard] Scene ${scene.id}: avatar video not found: ${scene.avatar.videoPath}` +
        avatarRemediation(scene, scene.avatar.videoPath),
    );
  }

  // Corrupt/unreadable file → same fail-closed fate.
  const avatarDurationSec = probe(avatarSrc);
  if (!Number.isFinite(avatarDurationSec) || avatarDurationSec <= 0) {
    throw new Error(
      `[AvatarCard] Scene ${scene.id}: avatar video unreadable (ffprobe found no duration): ${scene.avatar.videoPath}` +
        avatarRemediation(scene, scene.avatar.videoPath),
    );
  }

  // #272: the clip has to cover this scene's CURRENT voiceover. A clip is only
  // as long as the audio it was generated from, so a shorter one means the
  // voiceover was regenerated and the clip went stale — exactly the lip-sync the
  // viewer would see. Nothing downstream re-checks this, hence fail-closed.
  const voiceoverSec = Number(voiceoverDurationSec);
  if (
    Number.isFinite(voiceoverSec) &&
    voiceoverSec > 0 &&
    avatarDurationSec + AVATAR_DURATION_EPSILON_SEC < voiceoverSec
  ) {
    throw new Error(
      `[AvatarCard] Scene ${scene.id}: stale lip-sync — the avatar clip is ` +
        `${avatarDurationSec.toFixed(2)}s but the current voiceover is ` +
        `${voiceoverSec.toFixed(2)}s (the clip must be ≥ the voiceover).` +
        `\n   Regenerating TTS does NOT invalidate the clip (#272), so it still holds the old take.` +
        avatarRemediation(scene, scene.avatar.videoPath),
    );
  }

  return { avatarDurationSec };
}

/**
 * Assert every declared clip across a scene list — the `main.mjs` seam, where
 * voiceover durations are keyed by scene id (they come from the TTS results,
 * not from scene order).
 *
 * @param {object} options
 * @param {Array<object>} options.scenes
 * @param {Map<number, number>} [options.voiceoverSecById] - voiceover seconds per scene id
 * @param {string} [options.contentDir]
 * @param {(path: string) => number} [options.probe]
 * @returns {{checked: number}} declared clips verified
 */
export function assertAvatarVoiceovers({
  scenes,
  voiceoverSecById,
  contentDir = "",
  probe = probeMediaDurationSeconds,
}) {
  let checked = 0;
  for (const scene of scenes || []) {
    if (!isAvatarDeclared(scene)) continue;
    assertAvatarScene({
      scene,
      voiceoverDurationSec: voiceoverSecById?.get(scene.id),
      contentDir,
      probe,
    });
    checked++;
  }
  return { checked };
}
