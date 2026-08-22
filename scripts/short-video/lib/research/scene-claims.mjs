/**
 * Research Evidence Pipeline — Scene Claim IDs
 *
 * Extends scene-data to optionally carry `claimIds` on scenes that contain
 * material claims. This enables traceability from video → article → evidence pack
 * for fact correction during video production.
 *
 * This module is intentionally lightweight and non-blocking:
 * - claimIds on scenes are OPTIONAL
 * - Scenes without claimIds are valid (backward compatible)
 * - When present, claimIds must be non-empty strings
 * - No scene is required to have claimIds (hook, CTA, transition are exempt)
 *
 * See: docs/specs/spec-research-evidence-pipeline.md (Design Decision #8)
 */

/**
 * Extracts claim IDs from a scene object.
 * Returns an empty array if the scene has no claimIds field.
 *
 * @param {object} scene — a scene-data scene object
 * @returns {string[]} array of claim ID strings (empty if none)
 */
export function getClaimIdsForScene(scene) {
  if (!scene || typeof scene !== "object") return [];
  if (!Array.isArray(scene.claimIds)) return [];
  return scene.claimIds.filter((id) => typeof id === "string" && id.length > 0);
}

/**
 * Validates that claim IDs in a scene are well-formed.
 * This is an optional check — scenes without claimIds pass trivially.
 * When claimIds are present, each must be a non-empty string.
 *
 * @param {object} scene — a scene-data scene object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSceneClaimIds(scene) {
  const errors = [];

  if (!scene || typeof scene !== "object") {
    return { valid: true, errors: [] }; // Nothing to validate
  }

  // claimIds is optional — absence is valid
  if (!("claimIds" in scene)) {
    return { valid: true, errors: [] };
  }

  if (!Array.isArray(scene.claimIds)) {
    return {
      valid: false,
      errors: ["scene.claimIds must be an array"],
    };
  }

  for (let i = 0; i < scene.claimIds.length; i++) {
    const id = scene.claimIds[i];
    if (typeof id !== "string" || id.length === 0) {
      errors.push(`scene.claimIds[${i}] must be a non-empty string`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates claim IDs across all scenes in a scene-data array.
 * Returns aggregated results. Scenes without claimIds are valid.
 *
 * @param {Array} scenes — array of scene objects
 * @returns {{ valid: boolean, errors: string[], scenesWithClaims: number }}
 */
export function validateAllSceneClaimIds(scenes) {
  const errors = [];
  let scenesWithClaims = 0;

  if (!Array.isArray(scenes)) {
    return { valid: true, errors: [], scenesWithClaims: 0 };
  }

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const result = validateSceneClaimIds(scene);
    if (!result.valid) {
      for (const err of result.errors) {
        errors.push(`Scene[${i}]: ${err}`);
      }
    }
    if (getClaimIdsForScene(scene).length > 0) {
      scenesWithClaims++;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    scenesWithClaims,
  };
}

/**
 * Collects all unique claim IDs across an entire scene-data array.
 * Useful for cross-referencing with an evidence pack.
 *
 * @param {Array} scenes — array of scene objects
 * @returns {string[]} unique claim IDs (deduplicated)
 */
export function getAllClaimIds(scenes) {
  if (!Array.isArray(scenes)) return [];

  const all = new Set();
  for (const scene of scenes) {
    const ids = getClaimIdsForScene(scene);
    for (const id of ids) {
      all.add(id);
    }
  }

  return [...all];
}
