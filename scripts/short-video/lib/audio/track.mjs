/**
 * Continuous voiceover track — the single audio stem the final video is mixed
 * from.
 *
 * Each scene's voiceover is padded with real silence up to its frame-aligned
 * clip length and concatenated into one PCM file whose sample count equals the
 * video's sample count (Σ clipDuration). The final video therefore has a
 * gapless audio track: no timestamp gaps exist for any downstream player or
 * transcoder (TikTok ingest, QuickTime, ffmpeg WAV extraction) to compact,
 * which is the failure mode that made subtitles drift toward the end of a
 * video.
 *
 * Consumer note: the FFmpeg assembler that mixed this stem was retired with
 * the HTML render path (decision 59); `buildVoiceoverTrack` is kept as the
 * contract reference and is test-locked (audio-sync.test.mjs).
 */

import { dirname, join } from "path";
import { unlinkSync } from "fs";
import { sceneClipDuration } from "../timeline.mjs";
import { decodeToWavFile, readWavPcm, writeWavPcm } from "./wav.mjs";

/** Working format of the master track — matches the final video's 44.1kHz. */
export const TRACK_SAMPLE_RATE = 44100;

/**
 * Pad each scene's PCM to its frame-aligned clip length and concatenate.
 * Sample-exact by construction: every scene lands at its cumulative clip
 * offset, with real (zero) silence in between.
 *
 * Throws rather than truncating if a scene is longer than its clip — that
 * would mean the timeline's duration assumption broke, and cutting speech is
 * worse than failing loudly.
 *
 * @param {Array<Float32Array>} scenePcms - decoded voiceovers, in scene order
 * @param {Array<number>} ttsDurations - voiceover durations in seconds
 * @param {number} [sampleRate]
 * @returns {Float32Array} concatenated track
 */
export function assembleTrackPcm(scenePcms, ttsDurations, sampleRate = TRACK_SAMPLE_RATE) {
  if (!Array.isArray(scenePcms) || scenePcms.length === 0) {
    throw new Error("no scene audio to assemble into a voiceover track");
  }
  if (scenePcms.length !== ttsDurations.length) {
    throw new Error(
      `scene audio count (${scenePcms.length}) does not match duration count (${ttsDurations.length})`,
    );
  }

  const targets = ttsDurations.map((d) => Math.round(sceneClipDuration(d) * sampleRate));
  const total = targets.reduce((s, t) => s + t, 0);
  const out = new Float32Array(total);

  let pos = 0;
  for (let i = 0; i < scenePcms.length; i++) {
    if (scenePcms[i].length > targets[i]) {
      throw new Error(
        `scene ${i + 1} audio (${scenePcms[i].length} samples) exceeds its ` +
          `clip (${targets[i]} samples) — refusing to truncate speech`,
      );
    }
    out.set(scenePcms[i], pos);
    pos += targets[i];
  }

  return out;
}

/**
 * Build `outputPath` from the scene voiceover files: decode each to PCM,
 * assemble the padded track, write it.
 *
 * Temporary PCM files are removed even on failure.
 *
 * @param {object} options
 * @param {Array<string>} options.sceneAudioPaths - audio files, in scene order
 * @param {Array<number>} options.ttsDurations - voiceover durations in seconds
 * @param {string} options.outputPath - where to write the .wav track
 * @param {number} [options.sampleRate]
 * @returns {{path: string, samples: number, sampleRate: number}}
 */
export function buildVoiceoverTrack({
  sceneAudioPaths,
  ttsDurations,
  outputPath,
  sampleRate = TRACK_SAMPLE_RATE,
}) {
  if (!Array.isArray(sceneAudioPaths) || sceneAudioPaths.length === 0) {
    throw new Error("no scene audio paths provided to build the voiceover track");
  }
  if (sceneAudioPaths.length !== ttsDurations.length) {
    throw new Error(
      `scene audio count (${sceneAudioPaths.length}) does not match duration count (${ttsDurations.length})`,
    );
  }

  const workDir = dirname(outputPath);
  const temps = sceneAudioPaths.map((_, i) => join(workDir, `voice-${i}-pcm.wav`));

  try {
    const pcms = sceneAudioPaths.map((audioPath, i) => {
      decodeToWavFile(audioPath, temps[i], sampleRate);
      return readWavPcm(temps[i]).samples;
    });

    const track = assembleTrackPcm(pcms, ttsDurations, sampleRate);
    writeWavPcm(outputPath, track, sampleRate);
    return { path: outputPath, samples: track.length, sampleRate };
  } finally {
    for (const temp of temps) {
      try {
        unlinkSync(temp);
      } catch {}
    }
  }
}
