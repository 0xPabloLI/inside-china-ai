/**
 * Audio-file probes shared by the Quality Gate and the pacing ladder (#925).
 *
 * The gate derives its "no audio" verdict from `hasAudioBytes`, and the ladder
 * reuses the SAME derivation to tell an infrastructure failure (the take was
 * never produced) from a take the gate rejected. Keeping it in a leaf module
 * means both importers share one implementation without pulling the gate's ASR
 * stack into the registry (or into tests that mock the gate).
 */

import { existsSync, statSync } from "fs";

/**
 * Whether a take's audio file exists with non-zero size.
 *
 * @param {string} [audioPath]
 * @returns {boolean}
 */
export function hasAudioBytes(audioPath) {
  try {
    return Boolean(audioPath) && existsSync(audioPath) && statSync(audioPath).size > 0;
  } catch {
    return false;
  }
}
