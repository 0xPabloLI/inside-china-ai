/**
 * Audio policy for short-video packs — the fail-closed companion to `--bgm`.
 *
 * `--bgm` used to be a silent opt-in: a render invoked without it shipped a
 * narration-only film that every downstream check (subtitles, sync, loudness)
 * passed. 2026-11-26: the joint composition of CapCut / RunningHub rendered
 * that way and the user heard "sound only at the very beginning" on the
 * delivered artifact. The fix is not a reminder — it is a declaration:
 *
 *   meta.audio.mode: "bed"        → the render must carry a local BGM bed
 *   meta.audio.mode: "voice-only" → no bed by design; the ticket records why
 *
 * Legacy packs omit the field; they resolve to `bed`, so re-rendering one
 * without `--bgm` now stops instead of producing the same silent artifact.
 */

export const AUDIO_MODES = ["bed", "voice-only"];
export const DEFAULT_AUDIO_MODE = "bed";

/**
 * Read the pack's declared audio mode.
 *
 * @param {object|null|undefined} meta - content meta.mjs export
 * @returns {{mode: string, declared: boolean, valid: boolean, declaredValue?: string}}
 */
export function resolveAudioMode(meta) {
  const declaredValue = meta?.audio?.mode;
  if (declaredValue === undefined || declaredValue === null) {
    return { mode: DEFAULT_AUDIO_MODE, declared: false, valid: true };
  }
  if (!AUDIO_MODES.includes(declaredValue)) {
    return { mode: DEFAULT_AUDIO_MODE, declared: true, valid: false, declaredValue };
  }
  return { mode: declaredValue, declared: true, valid: true };
}

/**
 * Decide whether this render invocation may proceed.
 *
 * @param {{meta: object|null|undefined, useBgm: boolean}} options
 * @returns {string|null} a user-facing refusal, or null when the render is allowed
 */
export function renderAudioPolicyViolation({ meta, useBgm }) {
  const { mode, valid, declaredValue } = resolveAudioMode(meta);
  if (!valid) {
    return (
      `meta.audio.mode is "${declaredValue}"; allowed values are ${AUDIO_MODES.join(" / ")}. ` +
      "Fix the declaration before rendering."
    );
  }
  if (mode === "bed" && !useBgm) {
    return (
      'meta.audio.mode is "bed" but this render has no --bgm: the film would ship with narration ' +
      "only. Pass --bgm, or declare meta.audio.mode = \"voice-only\" with the reason recorded in the " +
      "ticket."
    );
  }
  return null;
}

/**
 * The expectation a delivered artifact must satisfy.
 *
 * @param {object|null|undefined} meta
 * @returns {boolean|null} true = a bed must be measurable, false = no bed by design
 */
export function expectedBedFromPolicy(meta) {
  const { mode, valid } = resolveAudioMode(meta);
  if (!valid) return null;
  return mode === "bed";
}
