/**
 * Per-run staging for TTS regeneration rounds (#423).
 *
 * A reroll or pacing-compensation round must not be able to overwrite the
 * audio already on disk: `engine.generate` is handed a staging directory, and
 * only a take the run ACCEPTS is moved into the audio directory. A take that
 * fails the gate — or a generation that dies mid-round — therefore leaves the
 * existing bytes untouched.
 *
 * The directory name is a cross-module contract: engines derive their
 * per-pipeline identity from the output directory they are handed
 * (`deriveContentIdFromOutputDir` in cosyvoice3-kaggle-cuda.mjs), so the
 * prefix lives here, in one place, and the derivation strips exactly this
 * segment. Without that, every reroll would push a brand-new Kaggle kernel
 * (the staging name embeds pid+timestamp) instead of reusing the pipeline's.
 *
 * @module tts/staging
 */

import { existsSync, mkdirSync, renameSync, rmSync } from "fs";
import { basename, join } from "path";

/** Staging directory name prefix — see the module note above. */
export const REGEN_STAGING_PREFIX = ".regen-staging-";

/** Create a fresh per-round staging directory inside the audio directory. */
export function createRegenStaging(outputDir) {
  const dir = join(outputDir, `${REGEN_STAGING_PREFIX}${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Promote an accepted staged take into the audio directory (#423). */
export function acceptRegenTake(outputDir, res) {
  // A result whose file does not exist is left alone: the Quality Gate flags
  // it as missing audio (fail-closed) instead of promotion crashing first.
  if (!existsSync(res.audioPath)) return;
  const finalPath = join(outputDir, basename(res.audioPath));
  if (finalPath === res.audioPath) return;
  renameSync(res.audioPath, finalPath);
  res.audioPath = finalPath;
}

/** Drop a round's staging directory (accepted takes were moved out). */
export function cleanupRegenStaging(stagingDir) {
  try {
    rmSync(stagingDir, { recursive: true, force: true });
  } catch {
    // staging cleanup never affects correctness — acceptance is decided by
    // the promoted files, not by directory state
  }
}
