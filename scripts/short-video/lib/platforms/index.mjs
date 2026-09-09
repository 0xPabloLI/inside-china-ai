/**
 * Platform Profile loader — registry + query surface (#219 ticket 01).
 *
 * Spec: docs/specs/spec-platform-profile-isolation.md
 * Ticket: .scratch/platform-profile/issues/01-profile-model-tiktok.md
 *
 * Query surface:
 *   - getPlatformProfile(name)       — by platform name, fail-closed on unknown
 *   - listPlatformProfiles()         — all registered profiles
 *   - listPlatformNames()            — all registered platform names
 *   - getArtifactSpec(name, type)    — artifact-specific spec, fail-closed for
 *                                      unimplemented artifact types
 *
 * Profiles are validated and deep-frozen at registration: a malformed
 * declaration fails at load time (fail-closed), not at publish time.
 * New platforms are added by dropping a profile file in lib/platforms/ and
 * registering it below — the content kernel stays untouched.
 */

import { tiktokProfile } from "./tiktok.mjs";
import {
  ARTIFACT_TYPES,
  PUBLISH_METHODS,
  IMPLEMENTED_ARTIFACT_TYPES,
  InvalidProfileError,
  validateProfileShape,
  deepFreeze,
} from "./profile-model.mjs";

export { ARTIFACT_TYPES, PUBLISH_METHODS, IMPLEMENTED_ARTIFACT_TYPES, validateProfileShape };

export { InvalidProfileError };

/** Thrown when a platform name has no registered profile (fail-closed). */
export class UnknownPlatformError extends Error {
  constructor(platform, knownNames) {
    super(
      `Unknown platform profile: "${platform}". Known platforms: ${
        knownNames.length > 0 ? knownNames.join(", ") : "(none)"
      }. Add a profile in scripts/short-video/lib/platforms/ to register a new platform ` +
        `(spec: docs/specs/spec-platform-profile-isolation.md).`,
    );
    this.name = "UnknownPlatformError";
    this.code = "UNKNOWN_PLATFORM";
  }
}

// ─── Registry ───

const REGISTRY = new Map();

function register(profile) {
  const errors = validateProfileShape(profile);
  if (errors.length > 0) {
    throw new InvalidProfileError(
      `Invalid platform profile "${profile?.platform}":\n  - ${errors.join("\n  - ")}`,
    );
  }
  REGISTRY.set(profile.platform, deepFreeze(profile));
}

register(tiktokProfile);

// ─── Queries ───

/** All registered platform names (sorted). */
export function listPlatformNames() {
  return [...REGISTRY.keys()].sort();
}

/** All registered profiles (sorted by platform name). */
export function listPlatformProfiles() {
  return listPlatformNames().map((name) => REGISTRY.get(name));
}

/**
 * Get a platform profile by name.
 * @param {string} platform - Platform name (e.g. "tiktok")
 * @returns {Object} Frozen profile
 * @throws {UnknownPlatformError} Fail-closed on unknown/non-string names
 */
export function getPlatformProfile(platform) {
  if (typeof platform !== "string" || !REGISTRY.has(platform)) {
    throw new UnknownPlatformError(String(platform), listPlatformNames());
  }
  return REGISTRY.get(platform);
}

/**
 * Get the artifact-specific spec for a platform.
 *
 * Fail-closed ladder:
 *   1. unknown platform        → UnknownPlatformError
 *   2. unknown artifact type    → Error (not in the ARTIFACT_TYPES enum)
 *   3. declared but not implemented → Error (e.g. `image-thread`, #223/#208)
 *
 * @param {string} platform - Platform name
 * @param {string} [artifactType="video"] - Artifact type (see ARTIFACT_TYPES)
 * @returns {Object} The profile's artifact spec (video → profile.video)
 */
export function getArtifactSpec(platform, artifactType = "video") {
  const profile = getPlatformProfile(platform);

  if (!ARTIFACT_TYPES.includes(artifactType)) {
    throw new Error(
      `Unknown artifact type "${artifactType}" for platform "${profile.platform}". Allowed: ${ARTIFACT_TYPES.join(", ")}.`,
    );
  }
  if (!profile.artifactTypes.includes(artifactType)) {
    throw new Error(
      `Platform "${profile.platform}" does not declare artifact type "${artifactType}" (declares: ${profile.artifactTypes.join(", ")}).`,
    );
  }
  if (!IMPLEMENTED_ARTIFACT_TYPES.includes(artifactType)) {
    throw new Error(
      `Artifact type "${artifactType}" is declarable but has no implemented consumer ` +
        `(implemented: ${IMPLEMENTED_ARTIFACT_TYPES.join(", ")}). Image-thread lands with #223/#208.`,
    );
  }
  return profile[artifactType];
}
