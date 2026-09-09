import { describe, it, expect } from "vitest";
import {
  ARTIFACT_TYPES,
  PUBLISH_METHODS,
  IMPLEMENTED_ARTIFACT_TYPES,
  validateProfileShape,
  getPlatformProfile,
  listPlatformProfiles,
  listPlatformNames,
  getArtifactSpec,
  UnknownPlatformError,
} from "../lib/platforms/index.mjs";
import { THRESHOLDS } from "../lib/tiktok-rules.mjs";
import { buildTiktokSettings } from "../lib/publish-utils.mjs";

// ── Platform Profile model + loader (#219 ticket 01) ──
// Spec: docs/specs/spec-platform-profile-isolation.md (Implementation Decisions 2)
// TikTok Profile values must be item-by-item equivalent to the pre-migration
// rule set (zero behavior change), with drift guarded by independent literals.

// Verbatim copy of the pre-migration tiktok-rules.mjs THRESHOLDS — the
// equivalence anchor. Kept as an independent literal so drift in either
// the profile or the derivation is caught.
const TIKTOK_THRESHOLDS_BASELINE = {
  maxVoiceoverWords: 180,
  maxOneBreathWords: 25,
  minScenes: 6,
  maxScenes: 10,
  hookTextOverlapFailThreshold: 0.8,
  bodyTextDuplicateMinWords: 4,
  hookTextOverlapWarnThreshold: 0.5,
  minSourceScenes: 2,
  minKeywordScenes: 2,
  minDataSceneRatio: 0.5,
  teleprompterMaxDeviation: 0.15,
  ctaStackThreshold: 3,
  maxGoalSignals: 2,
  maxCaptionLength: 2200,
  maxTitleLength: 60,
  minHashtags: 3,
  maxHashtags: 5,
  greetingCheckWords: 3,
};

// ─── Loader ───

describe("platform profile loader", () => {
  it("returns the tiktok profile by platform name", () => {
    const profile = getPlatformProfile("tiktok");
    expect(profile.platform).toBe("tiktok");
  });

  it("lists all registered profiles", () => {
    const profiles = listPlatformProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(1);
    expect(profiles.map((p) => p.platform)).toContain("tiktok");
  });

  it("lists platform names including tiktok", () => {
    expect(listPlatformNames()).toContain("tiktok");
  });

  it("fails closed on unknown platform with diagnostic error", () => {
    let caught = null;
    try {
      getPlatformProfile("xhs");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnknownPlatformError);
    expect(caught.message).toContain("xhs");
    // Diagnostic: lists known platforms so the operator can recover
    expect(caught.message).toContain("tiktok");
  });

  it("fails closed on non-string platform names", () => {
    for (const bad of [undefined, null, "", 42]) {
      expect(() => getPlatformProfile(bad)).toThrow(UnknownPlatformError);
    }
  });

  it("profiles are frozen — declarative values cannot be mutated", () => {
    const profile = getPlatformProfile("tiktok");
    expect(() => {
      "use strict";
      profile.caption.maxLength = 1;
    }).toThrow();
  });
});

// ─── Profile shape (spec Implementation Decisions 2) ───

describe("profile shape contract", () => {
  it("artifact type enum reserves video and image-thread", () => {
    expect(ARTIFACT_TYPES).toEqual(["video", "image-thread"]);
  });

  it("publish method enum covers manual-guide, cdp, api", () => {
    expect(PUBLISH_METHODS).toEqual(["manual-guide", "cdp", "api"]);
  });

  it("tiktok profile declares every spec-required field group", () => {
    const profile = getPlatformProfile("tiktok");
    expect(profile.caption).toBeDefined();
    expect(profile.hashtags).toBeDefined();
    expect(profile.aiDisclosure).toBeDefined();
    expect(profile.cover).toBeDefined();
    expect(profile.video).toBeDefined();
    expect(profile.privacy).toBeDefined();
    expect(profile.commerce).toBeDefined();
    expect(profile.manualGuide).toBeDefined();
  });

  it("tiktok publish method is manual-guide (default safe tier)", () => {
    expect(getPlatformProfile("tiktok").publishMethod).toBe("manual-guide");
  });
});

// ─── TikTok Profile value equivalence (zero behavior change) ───

describe("tiktok profile value equivalence", () => {
  const profile = getPlatformProfile("tiktok");

  it("thresholds equal the pre-migration rule set item by item", () => {
    expect(profile.thresholds).toEqual(TIKTOK_THRESHOLDS_BASELINE);
  });

  it("tiktok-rules.mjs THRESHOLDS derive from the profile", () => {
    expect(THRESHOLDS).toEqual(profile.thresholds);
  });

  it("caption limits: 2200 chars, title 60", () => {
    expect(profile.caption.maxLength).toBe(2200);
    expect(profile.caption.titleMaxLength).toBe(60);
    expect(typeof profile.caption.structure).toBe("string");
    expect(profile.caption.structure.length).toBeGreaterThan(0);
  });

  it("hashtag range: 3-5", () => {
    expect(profile.hashtags.min).toBe(3);
    expect(profile.hashtags.max).toBe(5);
  });

  it("video file limits: 150MB, 600s, MP4, 23fps floor", () => {
    expect(profile.video.maxSizeBytes).toBe(150 * 1024 * 1024);
    expect(profile.video.maxDurationSeconds).toBe(600);
    expect(profile.video.containerFormats).toContain("mp4");
    expect(profile.video.minFps).toBe(23);
  });

  it("privacy defaults match publish-utils buildTiktokSettings defaults", () => {
    expect(profile.privacy.defaultViewerSetting).toBe("PUBLIC_TO_EVERYONE");
    expect(profile.privacy.allowComments).toBe(true);
    expect(profile.privacy.allowDuet).toBe(false);
    expect(profile.privacy.allowStitch).toBe(false);

    const apiDefaults = buildTiktokSettings().tiktok;
    expect(profile.privacy.defaultViewerSetting).toBe(apiDefaults.viewerSetting);
    expect(profile.privacy.allowComments).toBe(apiDefaults.allowComments);
    expect(profile.privacy.allowDuet).toBe(apiDefaults.allowDuet);
    expect(profile.privacy.allowStitch).toBe(apiDefaults.allowStitch);
  });

  it("commerce constraint expressed at profile level: commercialContent requires brand flag", () => {
    expect(profile.commerce.commercialContentRequiresBrand).toBe(true);
    expect(profile.commerce.defaultCommercialContent).toBe(false);
  });

  it("AI disclosure required with label and manual-guide entry step", () => {
    expect(profile.aiDisclosure.required).toBe(true);
    expect(profile.aiDisclosure.label).toBe("AI-generated content");
    const stepIds = profile.manualGuide.steps.map((s) => s.id);
    expect(stepIds).toContain(profile.aiDisclosure.guideStepId);
  });

  it("manual guide steps preserve the current sequence", () => {
    const stepIds = profile.manualGuide.steps.map((s) => s.id);
    expect(stepIds).toEqual([
      "open-app",
      "select-video",
      "aigc-label",
      "paste-caption",
      "edit-sticker",
      "add-sound",
      "location",
      "privacy",
      "publish",
      "first-hour-engagement",
      "pin-comment",
    ]);
  });
});

// ─── Artifact type model: image-thread declarable, only video consumed ───

describe("artifact type consumption", () => {
  it("only video has an implemented consumer", () => {
    expect(IMPLEMENTED_ARTIFACT_TYPES).toEqual(["video"]);
  });

  it("image-thread is a valid declaration (reservable, #223/#208)", () => {
    const hypothetical = {
      platform: "hypothetical-image-platform",
      artifactTypes: ["image-thread"],
      publishMethod: "manual-guide",
      caption: { structure: "text", maxLength: 100, titleMaxLength: 10 },
      hashtags: { min: 1, max: 2 },
      aiDisclosure: { required: false },
      manualGuide: { steps: [{ id: "open-app", label: "Open app" }] },
    };
    expect(validateProfileShape(hypothetical)).toEqual([]);
  });

  it("shape validation fails closed on unknown artifact type and publish method", () => {
    const base = {
      platform: "p",
      artifactTypes: ["video"],
      publishMethod: "manual-guide",
      caption: { structure: "s", maxLength: 10, titleMaxLength: 5 },
      hashtags: { min: 1, max: 2 },
      aiDisclosure: { required: false },
      manualGuide: { steps: [{ id: "s1", label: "step" }] },
      video: { maxSizeBytes: 1, maxDurationSeconds: 1, containerFormats: ["mp4"] },
      privacy: {},
      commerce: { commercialContentRequiresBrand: true },
    };
    expect(validateProfileShape({ ...base, artifactTypes: ["stories"] }).length).toBeGreaterThan(0);
    expect(validateProfileShape({ ...base, publishMethod: "pigeon" }).length).toBeGreaterThan(0);
    expect(validateProfileShape({ ...base, video: undefined }).length).toBeGreaterThan(0);
  });

  it("returns the video artifact spec for tiktok", () => {
    const spec = getArtifactSpec("tiktok", "video");
    expect(spec.maxSizeBytes).toBe(150 * 1024 * 1024);
  });

  it("fails closed consuming image-thread (declared-but-unimplemented path)", () => {
    expect(() => getArtifactSpec("tiktok", "image-thread")).toThrow(/image-thread/);
  });

  it("fails closed consuming an unknown artifact type", () => {
    expect(() => getArtifactSpec("tiktok", "stories")).toThrow(/artifact type/i);
  });
});
