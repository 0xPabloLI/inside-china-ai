/**
 * #1560 — evidence source audio belongs to the content defaults, not to the
 * author's memory.
 *
 * #1525 proved the pipeline can window a clip's own audio and duck it under
 * narration, but every consumer had to spell the whole envelope by hand. The
 * next two packs wrote `volume: 0` on evidence clips that carry AAC tracks,
 * shipped silent, and no gate said a word: `volume` is a legal field, the render
 * honours it, and "the source had sound" was knowledge only a probe has.
 *
 * This module makes the decision explicit in three places:
 *
 *   1. `audioMode: "source"` is the default for an evidence video. A source
 *      mode clip gets full source level, a 0–3s window at the top of the scene,
 *      and narration ducking — the shape the two hand-written packs (CapCut,
 *      RunningHub) already used. `media.volume: 0` is treated as an omitted
 *      value, because a zero-gain "source" clip is a contradiction, not a
 *      quieter source.
 *   2. `audioMode: "silent-by-design"` is the only way to keep the 0-gain cut.
 *      It strips the window so the props cannot describe an inaudible window.
 *   3. Preflight warns on the legacy shape: a real audio track + `volume: 0`
 *      and no opt-out. The render default will still carry the sound, so the
 *      warning is about the declaration having no effect, not about shipping
 *      silence.
 *
 * The defaults are applied where the props are built (`render-remotion.mjs`),
 * not inside `MediaBackground`: the component never learns the scene's
 * `mediaRole`, and adding a second place that resolves gain is how the
 * "declared but not in effect" class starts. Materialised props also leave a
 * verifiable artifact behind (`render/<version>/props.json`).
 *
 * Every helper here is pure except `checkEvidenceSourceAudio`, whose probe and
 * file lookup are injected so a test never spawns ffprobe.
 */
import { existsSync } from "fs";
import { isEvidenceMedia } from "./media-role.mjs";
import { mediaAbsolutePath } from "./media-bg.mjs";
import { probeMedia as realProbeMedia } from "./media-probe.mjs";

/** The only two decisions an evidence video may declare. */
export const EVIDENCE_AUDIO_MODES = ["source", "silent-by-design"];

/**
 * Default source window, in seconds.
 *
 * Two seconds was the floor in the ticket; three clears the "at least 2–4s"
 * band with one number a producer can hear, and the scene envelope fades the
 * tail anyway. Longer clips stay one edit away: `audioOut` is still honoured.
 */
export const DEFAULT_SOURCE_AUDIO_WINDOW_SEC = 3;

/** Fade length for the default window. Matches the two hand-written packs. */
export const DEFAULT_SOURCE_AUDIO_FADE_SEC = 0.3;

/** Gain while narration is present. Matches the two hand-written packs. */
export const DEFAULT_DUCK_LEVEL = 0.55;

/**
 * Resolve the scene's declared evidence-audio policy.
 *
 * `applies` is true only for a scene whose media role is evidence and whose
 * media is a video: an evidence still has no track to keep, and a background
 * clip is atmosphere whose mix is the author's business. An unknown
 * `audioMode` is reported (`valid: false`) rather than coerced, so the schema
 * check is the only place that decides what a typo means.
 *
 * @param {object} scene
 * @returns {{applies: boolean, mode: null|"source"|"silent-by-design",
 *           declared: string|undefined, valid: boolean}}
 */
export function evidenceAudioPolicy(scene) {
  const media = scene?.media;
  if (!media || media.type !== "video" || !isEvidenceMedia(scene)) {
    return { applies: false, mode: null, declared: media?.audioMode, valid: true };
  }
  const declared = media.audioMode;
  const valid = declared === undefined || EVIDENCE_AUDIO_MODES.includes(declared);
  return {
    applies: true,
    mode: valid ? (declared ?? "source") : null,
    declared,
    valid,
  };
}

/**
 * Materialise the evidence-audio defaults onto a scene for render props.
 *
 * Returns the same object when nothing applies (a pack's scenes are passed
 * through `render-remotion` verbatim otherwise), so callers can compare
 * identity in tests and in the incremental fingerprint path.
 *
 * @param {object} scene
 * @returns {object} scene, possibly with a new `media` object
 */
export function applyEvidenceAudioDefaults(scene) {
  const { applies, mode, valid } = evidenceAudioPolicy(scene);
  if (!applies || !valid) return scene;
  const media = scene.media;

  if (mode === "silent-by-design") {
    const { audioIn, audioOut, audioFadeIn, audioFadeOut, ...rest } = media;
    return { ...scene, media: { ...rest, volume: 0, audioMode: "silent-by-design" } };
  }

  const hasWindow = media.audioIn !== undefined || media.audioOut !== undefined;
  const baseVolume = typeof media.volume === "number" && media.volume > 0 ? media.volume : 1;
  const next = {
    ...media,
    audioMode: "source",
    volume: baseVolume,
    audioIn: hasWindow ? (media.audioIn ?? 0) : 0,
    audioOut: hasWindow ? media.audioOut : DEFAULT_SOURCE_AUDIO_WINDOW_SEC,
    audioFadeIn: media.audioFadeIn ?? DEFAULT_SOURCE_AUDIO_FADE_SEC,
    audioFadeOut: media.audioFadeOut ?? DEFAULT_SOURCE_AUDIO_FADE_SEC,
    duckUnderNarration: media.duckUnderNarration ?? true,
    duckLevel: media.duckLevel ?? DEFAULT_DUCK_LEVEL,
  };
  // An authored window with only its in-point keeps the whole rest of the clip;
  // writing `undefined` would survive the spread but read as "no edge" to
  // `resolveMediaAudio`, which is right — this is only about not inventing an
  // out-point the author did not write.
  if (next.audioOut === undefined) delete next.audioOut;
  return { ...scene, media: next };
}

/**
 * Preflight findings for evidence videos that carry real audio but declare
 * `volume: 0`.
 *
 * The gate is deliberately narrow:
 *   - only evidence videos (see `evidenceAudioPolicy`);
 *   - only when the file is on disk and the probe says an audio stream exists
 *     (a missing file is the final media gate's finding, and a probe failure
 *     is "not measured", never "no audio");
 *   - `silent-by-design` is a decision and passes with its name in the log;
 *   - a source scene that already carries a window passes, because the
 *     declaration agrees with what will render.
 *
 * @param {object} options
 * @param {Array<object>} options.scenes
 * @param {string} options.contentDirAbs - absolute pack directory
 * @param {(abs: string) => {hasAudio?: boolean}|null} [options.probeMedia]
 * @param {(abs: string) => boolean} [options.fileExists]
 * @returns {{rows: Array<{level: string, check: string, detail: string, fix?: string}>}}
 */
export function checkEvidenceSourceAudio({
  scenes,
  contentDirAbs,
  probeMedia = realProbeMedia,
  fileExists = existsSync,
}) {
  const rows = [];
  for (const scene of scenes ?? []) {
    const policy = evidenceAudioPolicy(scene);
    if (!policy.applies || !policy.valid) continue;
    const media = scene.media;
    if (!media.path) continue;
    const abs = mediaAbsolutePath(media.path, contentDirAbs);
    if (!fileExists(abs)) continue;
    const probe = probeMedia(abs);
    if (!probe?.hasAudio) continue;

    const check = `Scene ${scene.id} evidence source audio`;
    if (policy.mode === "silent-by-design") {
      rows.push({
        level: "pass",
        check,
        detail: "silent-by-design declared; the source track is muted on purpose",
      });
      continue;
    }
    if (media.volume === 0) {
      rows.push({
        level: "warn",
        check,
        detail: `the source has an audio track, but media.volume is 0 — the render default will carry the source at full level, so this declaration has no effect`,
        fix: 'Drop media.volume (source level and a 0–3s window are the default), or set audioMode: "silent-by-design" if the track must stay muted.',
      });
      continue;
    }
    const window =
      media.audioIn !== undefined || media.audioOut !== undefined
        ? `${media.audioIn ?? 0}s–${media.audioOut ?? "end"}s`
        : "default 0–3s";
    rows.push({
      level: "pass",
      check,
      detail: `source placed (${window}, volume ${media.volume ?? "default 1"})`,
    });
  }
  return { rows };
}
