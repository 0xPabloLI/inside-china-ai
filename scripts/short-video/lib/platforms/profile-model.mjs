/**
 * Platform Profile declarative model — shape contract for platform profiles.
 *
 * Spec: docs/specs/spec-platform-profile-isolation.md (Implementation Decisions 2)
 * Ticket: .scratch/platform-profile/issues/01-profile-model-tiktok.md
 *
 * A Profile declares, per platform: publish-package rules (caption/hashtags/
 * AI disclosure/cover/video limits/privacy/commerce/manual guide), the publish
 * method, and artifact types. The content kernel (Scene Data) stays
 * platform-free — profiles only take effect at the publish-package layer.
 */

// ─── Enums ───

/**
 * Artifact type enum. `image-thread` is reserved (declarable) but only
 * `video` has an implemented consumer (image-thread lands with #223/#208).
 */
export const ARTIFACT_TYPES = ["video", "image-thread"];

/**
 * Publish method enum. `manual-guide` is the default safe tier; `cdp`/`api`
 * require per-platform authorization + sandbox verification before enablement
 * (each platform keeps an independent publish HITL gate).
 */
export const PUBLISH_METHODS = ["manual-guide", "cdp", "api"];

/** Artifact types with an implemented consumer in the pipeline. */
export const IMPLEMENTED_ARTIFACT_TYPES = ["video"];

// ─── Errors ───

export class InvalidProfileError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidProfileError";
    this.code = "INVALID_PROFILE";
  }
}

// ─── Validation ───

/**
 * Validate a profile against the declarative shape contract.
 * Pure function — returns an array of error strings (empty = valid).
 *
 * `video`/`privacy`/`commerce` field groups are required only when the profile
 * declares the `video` artifact type, so image-thread-only platforms can be
 * declared without video constraints.
 */
export function validateProfileShape(profile) {
  if (!profile || typeof profile !== "object") {
    return ["profile must be an object"];
  }
  const errors = [];

  if (typeof profile.platform !== "string" || profile.platform.trim() === "") {
    errors.push("platform: non-empty string required");
  }

  if (!Array.isArray(profile.artifactTypes) || profile.artifactTypes.length === 0) {
    errors.push("artifactTypes: non-empty array required");
  } else {
    for (const type of profile.artifactTypes) {
      if (!ARTIFACT_TYPES.includes(type)) {
        errors.push(
          `artifactTypes: unknown artifact type "${type}" (allowed: ${ARTIFACT_TYPES.join(", ")})`,
        );
      }
    }
  }

  if (!PUBLISH_METHODS.includes(profile.publishMethod)) {
    errors.push(`publishMethod: must be one of ${PUBLISH_METHODS.join(", ")}`);
  }

  if (!profile.caption || typeof profile.caption !== "object") {
    errors.push("caption: object required");
  } else {
    if (typeof profile.caption.structure !== "string" || profile.caption.structure.trim() === "") {
      errors.push("caption.structure: non-empty string required");
    }
    if (!Number.isInteger(profile.caption.maxLength) || profile.caption.maxLength <= 0) {
      errors.push("caption.maxLength: positive integer required");
    }
    if (!Number.isInteger(profile.caption.titleMaxLength) || profile.caption.titleMaxLength <= 0) {
      errors.push("caption.titleMaxLength: positive integer required");
    }
  }

  if (!profile.hashtags || typeof profile.hashtags !== "object") {
    errors.push("hashtags: object required");
  } else {
    if (!Number.isInteger(profile.hashtags.min) || profile.hashtags.min < 0) {
      errors.push("hashtags.min: non-negative integer required");
    }
    if (!Number.isInteger(profile.hashtags.max) || profile.hashtags.max <= 0) {
      errors.push("hashtags.max: positive integer required");
    }
    if (
      Number.isInteger(profile.hashtags.min) &&
      Number.isInteger(profile.hashtags.max) &&
      profile.hashtags.min > profile.hashtags.max
    ) {
      errors.push("hashtags.min must be <= hashtags.max");
    }
  }

  if (!profile.aiDisclosure || typeof profile.aiDisclosure !== "object") {
    errors.push("aiDisclosure: object required");
  } else if (typeof profile.aiDisclosure.required !== "boolean") {
    errors.push("aiDisclosure.required: boolean required");
  }

  if (
    !profile.manualGuide ||
    !Array.isArray(profile.manualGuide.steps) ||
    profile.manualGuide.steps.length === 0
  ) {
    errors.push("manualGuide.steps: non-empty array required");
  }

  const declaresVideo = Array.isArray(profile.artifactTypes) && profile.artifactTypes.includes("video");
  if (declaresVideo) {
    if (!profile.video || typeof profile.video !== "object") {
      errors.push("video: object required when artifactTypes includes 'video'");
    } else {
      if (!Number.isInteger(profile.video.maxSizeBytes) || profile.video.maxSizeBytes <= 0) {
        errors.push("video.maxSizeBytes: positive integer (bytes) required");
      }
      if (!Number.isInteger(profile.video.maxDurationSeconds) || profile.video.maxDurationSeconds <= 0) {
        errors.push("video.maxDurationSeconds: positive integer required");
      }
      if (!Array.isArray(profile.video.containerFormats) || profile.video.containerFormats.length === 0) {
        errors.push("video.containerFormats: non-empty array required");
      }
    }

    if (!profile.privacy || typeof profile.privacy !== "object") {
      errors.push("privacy: object required when artifactTypes includes 'video'");
    }

    if (!profile.commerce || typeof profile.commerce !== "object") {
      errors.push("commerce: object required when artifactTypes includes 'video'");
    } else if (typeof profile.commerce.commercialContentRequiresBrand !== "boolean") {
      errors.push("commerce.commercialContentRequiresBrand: boolean required");
    }
  }

  return errors;
}

// ─── Immutability ───

/**
 * Deep-freeze a profile so declared values cannot be mutated at runtime.
 */
export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}
