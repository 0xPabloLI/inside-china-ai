import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  ARTIFACT_TYPES,
  PUBLISH_METHODS,
  IMPLEMENTED_ARTIFACT_TYPES,
  validateProfileShape,
  getPlatformProfile,
  listPlatformProfiles,
  getArtifactSpec,
  UnknownPlatformError,
} from "../lib/platforms/index.mjs";
import { buildTiktokSettings } from "../lib/publish-utils.mjs";

// ── Platform Profile model + loader (#219 ticket 01) ──
// Spec: docs/specs/spec-platform-profile-isolation.md (Implementation Decisions 2)
// TikTok Profile values must be item-by-item equivalent to the pre-migration
// rule set (zero behavior change), with drift guarded by independent literals.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Verbatim copy of the pre-migration tiktok-rules.mjs THRESHOLDS — the
// equivalence anchor. Kept as an independent literal so drift in either
// the profile or the derivation is caught.
// #219 T02: maxCaptionLength/maxTitleLength/minHashtags/maxHashtags moved OUT
// of thresholds — caption/hashtag limits live solely in caption./hashtags.
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

  it("shape validation fails closed on invalid video numerics and cover", () => {
    const base = {
      platform: "p",
      artifactTypes: ["video"],
      publishMethod: "manual-guide",
      enabledPublishMethods: ["manual-guide"],
      caption: { structure: "s", maxLength: 10, titleMaxLength: 5 },
      hashtags: { min: 1, max: 2 },
      aiDisclosure: { required: false },
      manualGuide: { steps: [{ id: "s1", label: "step" }] },
      video: { maxSizeBytes: 1, maxDurationSeconds: 1, containerFormats: ["mp4"], minFps: 1 },
      cover: { width: 1080, height: 1920 },
      privacy: {},
      commerce: { commercialContentRequiresBrand: true },
    };
    expect(validateProfileShape(base)).toEqual([]);

    const numericCases = [
      { ...base, video: { ...base.video, minFps: 0 } },
      { ...base, video: { ...base.video, minFps: -23 } },
      { ...base, video: { ...base.video, minFps: undefined } },
      { ...base, video: { ...base.video, maxSizeBytes: 0 } },
      { ...base, video: { ...base.video, maxDurationSeconds: -1 } },
    ];
    for (const profile of numericCases) {
      expect(validateProfileShape(profile).length).toBeGreaterThan(0);
    }

    const coverCases = [
      { ...base, cover: undefined },
      { ...base, cover: { height: 1920 } },
      { ...base, cover: { width: 0, height: 1920 } },
      { ...base, cover: { width: 1080, height: -1 } },
    ];
    for (const profile of coverCases) {
      expect(validateProfileShape(profile).length).toBeGreaterThan(0);
    }
  });

  it("cover is not required for image-thread-only platforms (declaresVideo group)", () => {
    const hypothetical = {
      platform: "hypothetical-image-platform",
      artifactTypes: ["image-thread"],
      publishMethod: "manual-guide",
      enabledPublishMethods: ["manual-guide"],
      caption: { structure: "text", maxLength: 100, titleMaxLength: 10 },
      hashtags: { min: 1, max: 2 },
      aiDisclosure: { required: false },
      manualGuide: { steps: [{ id: "open-app", label: "Open app" }] },
      cover: { width: 0, height: 0 },
    };
    expect(validateProfileShape(hypothetical)).toEqual([]);
  });
});

// ─── TikTok Profile value equivalence (zero behavior change) ───

describe("tiktok profile value equivalence", () => {
  const profile = getPlatformProfile("tiktok");

  it("thresholds equal the pre-migration rule set item by item", () => {
    expect(profile.thresholds).toEqual(TIKTOK_THRESHOLDS_BASELINE);
  });

  it("caption limits are single-path: thresholds carry no duplicates (#219 T02)", () => {
    // The limit is reachable ONLY as profile.caption.maxLength — a second
    // path (thresholds.maxCaptionLength) is how the dual-path debt started.
    expect(profile.thresholds.maxCaptionLength).toBeUndefined();
    expect(profile.thresholds.maxTitleLength).toBeUndefined();
    expect(profile.thresholds.minHashtags).toBeUndefined();
    expect(profile.thresholds.maxHashtags).toBeUndefined();
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
      enabledPublishMethods: ["manual-guide"],
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
      enabledPublishMethods: ["manual-guide"],
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

// ─── Doc drift: profile numerics anchored to their source documents ───
// Prior art: tiktok-rules-sync.test.mjs drift-detection style. Each Profile
// value asserts (a) the anchor sentence still exists in the source document
// and (b) the Profile value matches the anchor's semantics.

const BEST_PRACTICES_MD = join(__dirname, "..", "..", "..", "docs", "tiktok", "tiktok-best-practices.md");
const PLATFORM_TIKTOK_MJS = join(__dirname, "..", "lib", "platforms", "tiktok.mjs");
const PUBLISH_UTILS_MJS = join(__dirname, "..", "lib", "publish-utils.mjs");
const bestPracticesDoc = readFileSync(BEST_PRACTICES_MD, "utf8");
const platformTiktokSrc = readFileSync(PLATFORM_TIKTOK_MJS, "utf8");
const publishUtilsSrc = readFileSync(PUBLISH_UTILS_MJS, "utf8");

describe("tiktok profile doc drift (docs/tiktok/tiktok-best-practices.md)", () => {
  const profile = getPlatformProfile("tiktok");

  it("video.maxDurationSeconds=600 matches the documented '视频 ≤ 10 分钟' API limit", () => {
    expect(bestPracticesDoc).toContain("视频 ≤ 10 分钟");
    expect(profile.video.maxDurationSeconds).toBe(10 * 60);
  });

  it("video.minFps=23 matches the documented '最低 23 FPS' API limit", () => {
    expect(bestPracticesDoc).toContain("最低 23 FPS");
    expect(profile.video.minFps).toBe(23);
  });

  it("cover 1080×1920 matches the documented '分辨率：1080×1920' 技术规格", () => {
    expect(bestPracticesDoc).toContain("分辨率：1080×1920");
    expect(profile.cover.width).toBe(1080);
    expect(profile.cover.height).toBe(1920);
  });

  it("video.maxSizeBytes=150MB matches the Publora limit literal in the profile", () => {
    // 150MB is the Publora publish-path cap, not a TikTok API limit (doc: ≤ 4GB).
    // The literal lives in the profile (with its Publora source comment);
    // publish-utils validates against the profile value (#219 T02 migration).
    expect(platformTiktokSrc).toContain("150 * 1024 * 1024");
    expect(publishUtilsSrc).toContain("video.maxSizeBytes");
    expect(profile.video.maxSizeBytes).toBe(150 * 1024 * 1024);
  });
});
