/**
 * End-to-end audio sync check — verifies the SHIPPED artifact, not the plans
 * that produced it.
 *
 * Each scene's voiceover is cross-correlated against the final video's audio
 * track; the measured onset must match the timeline offset. This is the check
 * that would have caught the inter-scene gap compaction that drifted subtitles
 * ~0.5s/scene toward the end of a video: the container looked correct, but any
 * decode→re-encode downstream (players, TikTok ingest) shrank the gaps.
 *
 * Subtitle-vs-alignment checks can never see this class of bug because both
 * sides share the same (pre-assembly) timeline.
 *
 * TTS engine output formats (used by resolveSceneAudio):
 *   F5-MLX    → scene-{id}.wav
 *   Qwen3-TTS → scene-{id}.wav
 *   edge-tts  → scene-{id}.mp3
 *   say       → scene-{id}.mp3
 * Never hard-code an extension — always use resolveSceneAudio().
 */

import { existsSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { sceneTimeline, findScene } from "../timeline.mjs";
import { decodeToWavFile, readWavPcm } from "./wav.mjs";
import { findOnset } from "./fft.mjs";

/**
 * Audio extensions supported by TTS engines, in priority order.
 * .wav first (F5-MLX, Qwen3 — lossless), .mp3 second (edge-tts, say).
 */
const SCENE_AUDIO_EXTENSIONS = [".wav", ".mp3"];

/**
 * Resolve a scene's audio file without hard-coding the extension.
 *
 * TTS engines output different formats (see header comment). This function
 * probes each supported extension in priority order and returns the first
 * existing file, or null if none found. The caller treats null as "skip".
 *
 * @param {string} audioDir - output/{pipelineId}/audio
 * @param {number} sceneId
 * @returns {string|null} absolute path to the scene audio file, or null
 */
export function resolveSceneAudio(audioDir, sceneId) {
  if (sceneId == null) return null;
  for (const ext of SCENE_AUDIO_EXTENSIONS) {
    const candidate = join(audioDir, `scene-${sceneId}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * The single sync budget for the whole pipeline: ±80ms. The per-word subtitle
 * check re-exports this as SYNC_TOLERANCE so the two checks can never drift
 * apart.
 */
export const AUDIO_SYNC_TOLERANCE = 0.08;

/**
 * Correlation sample rate. 4kHz keeps the FFT small (well under a second for
 * a 74s video) while still carrying plenty of speech energy for an
 * unambiguous match; precision is 0.25ms, far inside the 80ms tolerance.
 */
const CORRELATION_SAMPLE_RATE = 4000;

/**
 * Judge measured-vs-expected scene onsets against the tolerance.
 *
 * @param {Array<{sceneId: number, expected: number, measured: number}>} measurements
 * @param {number} [tolerance]
 * @returns {{checked: number, errors: number, passed: boolean, scenes: Array}}
 */
export function evaluateAudioSync(measurements, tolerance = AUDIO_SYNC_TOLERANCE) {
  const scenes = (measurements ?? []).map((m) => {
    const drift = m.measured - m.expected;
    const driftMs = drift * 1000;
    // Epsilon: 1.08 - 1.0 === 0.08000000000000007 in binary floats, so an
    // exact-boundary drift must not be misjudged as past the tolerance.
    return { ...m, drift, driftMs, ok: Math.abs(drift) <= tolerance + 1e-9 };
  });
  const errors = scenes.filter((s) => !s.ok).length;
  return { checked: scenes.length, errors, passed: errors === 0, scenes };
}

/**
 * Fold audio sync results into the verification summary: audio sync errors are
 * FAIL-class, so they add to `errors` and can flip `passed` to false.
 * Returns a new summary object; the input is not mutated.
 *
 * @param {{errors: number, warnings: number, passed: boolean}} summary
 * @param {{errors: number, passed: boolean}|null} audioSync
 * @returns {{errors: number, warnings: number, passed: boolean}}
 */
export function applyAudioSyncToSummary(summary, audioSync) {
  if (!audioSync) return summary;
  return {
    ...summary,
    errors: summary.errors + audioSync.errors,
    passed: summary.passed && audioSync.passed,
  };
}

/**
 * The "cannot run the check at all" result — FAIL-class: if the shipped audio
 * cannot be decoded, the video must not be waved through.
 */
function syncFailure(error) {
  return {
    errored: true,
    error,
    checked: 0,
    skipped: 0,
    errors: 1,
    passed: false,
    scenes: [],
    skippedScenes: [],
    failedScenes: [],
  };
}

/**
 * Measure every scene's actual onset inside the final video's audio track.
 *
 * Missing scene audio files are skipped (fail-open for absent data). A scene
 * file that EXISTS but cannot be decoded or matched is FAIL-class — the check
 * failed to verify something it was responsible for — as is a final track
 * that cannot be decoded (fail-closed for broken output).
 *
 * @param {object} options
 * @param {string} options.videoPath - the shipped video
 * @param {string} options.outputDir - output/{pipelineId}, scene audio lives in {outputDir}/audio
 * @param {Array<{sceneId: number, duration: number}>} options.sceneDurations
 * @param {number} [options.tolerance]
 * @returns {object} evaluation result + skip/failure bookkeeping
 */
export function verifyAudioSync({ videoPath, outputDir, sceneDurations, tolerance }) {
  const rate = CORRELATION_SAMPLE_RATE;
  const workDir = mkdtempSync(join(tmpdir(), "audiosync-"));
  const skippedScenes = [];
  const failedScenes = [];
  const measurements = [];

  const cleanup = () => {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}
  };

  try {
    // Decode the shipped track once.
    const finalWav = join(workDir, "final.wav");
    try {
      decodeToWavFile(videoPath, finalWav, rate);
    } catch {
      return syncFailure(`Could not decode audio from ${videoPath}`);
    }
    const finalSamples = readWavPcm(finalWav).samples;
    if (finalSamples.length === 0) {
      return syncFailure(`Video has no audio to measure: ${videoPath}`);
    }

    const timeline = sceneTimeline(sceneDurations ?? []);
    const audioDir = join(outputDir, "audio");

    for (const scene of sceneDurations ?? []) {
      // Keep scenes in timeline order; unknown ids are caught by findScene.
      const entry = findScene(timeline, scene.sceneId);
      const scenePath = resolveSceneAudio(audioDir, scene.sceneId);
      if (!scenePath) {
        skippedScenes.push(scene.sceneId);
        continue;
      }

      const sceneWav = join(workDir, `scene-${scene.sceneId}.wav`);
      try {
        decodeToWavFile(scenePath, sceneWav, rate);
        const sceneSamples = readWavPcm(sceneWav).samples;
        if (sceneSamples.length === 0) {
          throw new Error(`decoded to zero samples`);
        }
        const { sample } = findOnset(finalSamples, sceneSamples, rate);
        measurements.push({
          sceneId: scene.sceneId,
          expected: entry.offset,
          measured: sample / rate,
        });
      } catch (e) {
        failedScenes.push({ sceneId: scene.sceneId, reason: e.message });
      }
    }

    const evaluated = evaluateAudioSync(measurements, tolerance);
    // Present-but-unmeasurable scenes count as errors (see jsdoc above).
    const errors = evaluated.errors + failedScenes.length;
    return {
      ...evaluated,
      errors,
      passed: errors === 0,
      skipped: skippedScenes.length,
      skippedScenes,
      failedScenes,
      errored: false,
    };
  } finally {
    cleanup();
  }
}
