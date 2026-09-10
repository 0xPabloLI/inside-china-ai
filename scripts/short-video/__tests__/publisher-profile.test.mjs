import { describe, it, expect } from "vitest";
import {
  buildTiktokSettings,
  buildManualPublishGuide,
  resolvePublishMethod,
} from "../lib/publish-utils.mjs";
import {
  getPlatformProfile,
  listPlatformProfiles,
  validateProfileShape,
} from "../lib/platforms/index.mjs";

// ── #219 T03 — TikTok publisher Profile-ization ──
// Spec: docs/specs/spec-platform-profile-isolation.md (Implementation Decisions 4, S1/S6)
// Ticket: .scratch/platform-profile/issues/03-publisher-profiling.md
// Zero behavior change: same inputs produce byte-identical settings and guide
// text (golden pins below); the profile becomes the SOURCE, publish-utils the
// renderer (dual-source debt from ticket 01 缓议项 removed).

// ─── Golden: manual guide text is byte-identical pre/post Profile wiring ───

describe("buildManualPublishGuide golden (S1/S6 zero text change)", () => {
  // Captured verbatim from the pre-T03 implementation (HEAD 087395b).
  const GOLDEN_WITH_AI = `
============================================================
📤 TikTok Manual Publishing Guide
============================================================

⚠️  API Auto-Publish is DISABLED (zero-views prevention).
   Publishing via API bypasses critical algorithm signals:
   AIGC label, trending audio, in-app editing, geographic tag.
   Manual in-app publishing is REQUIRED for video visibility.

🎬 Video file: /tmp/demo-short.mp4

📋 Caption (copy to TikTok description field):
──────────────────────────────────────────────────
CAPTION_TEXT
──────────────────────────────────────────────────

✅ Manual Publishing Checklist:
  [ ] 1. Open TikTok app → Tap [+] to upload
  [ ] 2. Select video file: /tmp/demo-short.mp4
  [ ] 3. ⚠️  CRITICAL: Toggle "AI-generated content" ON
         TikTok requires AI content labeling. Not labeling = penalty.
         This is the #1 cause of zero views for AI-voiced videos.
  [ ] 4. Paste caption above into description field
  [ ] 5. Tap "Edit" → Add a text sticker or effect (algorithm bonus)
         TikTok algorithm favors content edited within the app.
  [ ] 6. Tap "Add sound" → Pick a trending sound (set volume 5-10%)
         Trending audio boosts discoverability significantly.
  [ ] 7. Tap "Location" → Select "China" or "United States"
         Algorithm prioritizes local content.
  [ ] 8. Set privacy to "Public" (or "Friends" for testing)
  [ ] 9. Publish
  [ ] 10. First hour: Reply to EVERY comment (engagement signal)
  [ ] 11. Pin a comment with article link (when domain is live):
         https://chinaainews.com/posts/demo-slug

⏰  Best posting time: 2-4 PM or 10 PM-12 AM (off-peak hours)
    Off-peak = less competition = algorithm more likely to test your video.

📊 After 48h: Export analytics from https://analytics.tiktok.com
============================================================`;

  const GOLDEN_NO_AI = GOLDEN_WITH_AI.replace(
    `  [ ] 3. ⚠️  CRITICAL: Toggle "AI-generated content" ON
         TikTok requires AI content labeling. Not labeling = penalty.
         This is the #1 cause of zero views for AI-voiced videos.
`,
    `  [ ] 3. (No AI voice detected — AIGC label not needed)
`,
  );

  it("matches the pre-T03 output byte for byte (AI voice)", () => {
    const guide = buildManualPublishGuide({
      videoPath: "/tmp/demo-short.mp4",
      caption: "CAPTION_TEXT",
      articleSlug: "demo-slug",
      hasAIVoice: true,
      exampleEntity: "DeepSeek",
    });
    expect(guide).toBe(GOLDEN_WITH_AI);
  });

  it("matches the pre-T03 output byte for byte (no AI voice — AIGC step swaps to its no-voice variant)", () => {
    const guide = buildManualPublishGuide({
      videoPath: "/tmp/demo-short.mp4",
      caption: "CAPTION_TEXT",
      articleSlug: "demo-slug",
      hasAIVoice: false,
      exampleEntity: "DeepSeek",
    });
    expect(guide).toBe(GOLDEN_NO_AI);
  });

  it("falls back to the example-entity slug when articleSlug is absent", () => {
    const guide = buildManualPublishGuide({
      videoPath: "/tmp/v.mp4",
      caption: "C",
      hasAIVoice: true,
    });
    expect(guide).toContain("https://chinaainews.com/posts/company-news");
  });
});

// ─── Guide is rendered FROM the profile (dual-source removed) ───

describe("buildManualPublishGuide renders profile.manualGuide.steps", () => {
  const profile = getPlatformProfile("tiktok");

  it("profile step labels are the exact rendered templates (no mirror copy in publish-utils)", () => {
    const publishUtilsSrc = readFileSyncSrc("../lib/publish-utils.mjs");
    // The renderer must not carry a private step-sequence copy: it walks
    // profile.manualGuide.steps. Probe: the exact first-step label exists only
    // in the profile source.
    const firstLabel = profile.manualGuide.steps[0].label;
    expect(firstLabel).toBe("Open TikTok app → Tap [+] to upload");
    expect(publishUtilsSrc).not.toContain("Open TikTok app → Tap [+] to upload");
  });

  it("every step renders with its profile label and detail lines", () => {
    const guide = buildManualPublishGuide({
      videoPath: "/tmp/v.mp4",
      caption: "C",
      articleSlug: "s",
      hasAIVoice: true,
    });
    for (const step of profile.manualGuide.steps) {
      const label = step.label
        .replace("{videoPath}", "/tmp/v.mp4")
        .replace("{slug}", "s");
      expect(guide).toContain(label);
    }
    expect(guide).toContain("TikTok algorithm favors content edited within the app.");
  });

  it("AIGC step copy comes from profile.aiDisclosure (label + no-voice variant)", () => {
    expect(profile.aiDisclosure.label).toBe("AI-generated content");
    expect(profile.aiDisclosure.noVoiceLabel).toBe(
      "(No AI voice detected — AIGC label not needed)",
    );
    const withAi = buildManualPublishGuide({
      videoPath: "/tmp/v.mp4",
      caption: "C",
      hasAIVoice: true,
    });
    const noAi = buildManualPublishGuide({
      videoPath: "/tmp/v.mp4",
      caption: "C",
      hasAIVoice: false,
    });
    expect(withAi).toContain('Toggle "AI-generated content" ON');
    expect(noAi).toContain("(No AI voice detected — AIGC label not needed)");
    expect(noAi).not.toContain('Toggle "AI-generated content" ON');
  });
});

// ─── Publish settings defaults sourced from the profile (dual-source removed) ───

describe("buildTiktokSettings reads profile.privacy/commerce", () => {
  const profile = getPlatformProfile("tiktok");

  it("no-argument defaults equal the profile privacy/commerce declarations", () => {
    const settings = buildTiktokSettings().tiktok;
    expect(settings.viewerSetting).toBe(profile.privacy.defaultViewerSetting);
    expect(settings.allowComments).toBe(profile.privacy.allowComments);
    expect(settings.allowDuet).toBe(profile.privacy.allowDuet);
    expect(settings.allowStitch).toBe(profile.privacy.allowStitch);
    expect(settings.commercialContent).toBe(profile.commerce.defaultCommercialContent);
    expect(settings.brandOrganic).toBe(profile.commerce.defaultBrandOrganic);
    expect(settings.brandedContent).toBe(profile.commerce.defaultBrandedContent);
  });

  it("explicit options still override profile defaults (SELF_ONLY test path)", () => {
    const settings = buildTiktokSettings({ viewerSetting: "SELF_ONLY" }).tiktok;
    expect(settings.viewerSetting).toBe("SELF_ONLY");
    expect(settings.allowComments).toBe(profile.privacy.allowComments);
  });

  it("commerce disclosure rule enforced from profile.commerce.commercialContentRequiresBrand", () => {
    // TikTok profile: rule on → commercial without brand flag throws.
    expect(() =>
      buildTiktokSettings({ commercialContent: true }),
    ).toThrow(/brandOrganic or brandedContent/);

    // Hypothetical platform without the rule → same input accepted.
    const noRuleProfile = {
      ...profile,
      platform: "no-rule",
      commerce: { ...profile.commerce, commercialContentRequiresBrand: false },
    };
    const settings = buildTiktokSettings({ commercialContent: true }, noRuleProfile)["no-rule"];
    expect(settings.commercialContent).toBe(true);
  });
});

// ─── Publish method resolution + HITL gate (Implementation Decisions 4) ───

describe("resolvePublishMethod — per-platform publish gate", () => {
  const profile = getPlatformProfile("tiktok");

  it("defaults to the profile publishMethod (manual-guide safe tier)", () => {
    expect(resolvePublishMethod(profile, {})).toBe("manual-guide");
  });

  it("HITL: manual-guide publish requires no automation gate (the human executes the checklist)", () => {
    // The gate shape: automation paths must be enabled by the profile; the
    // default tier IS the human confirmation point and cannot be skipped.
    expect(profile.publishMethod).toBe("manual-guide");
    expect(profile.enabledPublishMethods).toContain("manual-guide");
  });

  it("fails closed when --auto requests api and the profile does not enable it", () => {
    expect(profile.enabledPublishMethods).not.toContain("api");
    expect(() => resolvePublishMethod(profile, { auto: true })).toThrow(
      /api.*not enabled.*tiktok/i,
    );
  });

  it("allows an automation path only when the profile enables it (per-platform authorization)", () => {
    const apiEnabled = {
      ...profile,
      platform: "api-enabled",
      enabledPublishMethods: ["manual-guide", "api"],
    };
    expect(resolvePublishMethod(apiEnabled, { auto: true })).toBe("api");
  });

  it("rejects unknown requested methods (not in the PUBLISH_METHODS enum)", () => {
    expect(() => resolvePublishMethod(profile, { auto: true, method: "pigeon" })).toThrow(
      /pigeon/,
    );
  });
});

// ─── Profile shape: enabledPublishMethods contract ───

describe("profile shape: enabledPublishMethods", () => {
  it("tiktok enables only manual-guide — api/cdp default closed", () => {
    const profile = getPlatformProfile("tiktok");
    expect(profile.enabledPublishMethods).toEqual(["manual-guide"]);
  });

  it("enabledPublishMethods must be a subset of the enum and include publishMethod", () => {
    const base = validBaseProfile();
    expect(validateProfileShape(base)).toEqual([]);
    expect(
      validateProfileShape({
        ...base,
        enabledPublishMethods: ["api"],
      }).length,
    ).toBeGreaterThan(0); // publishMethod (manual-guide) missing from enabled set
    expect(
      validateProfileShape({
        ...base,
        publishMethod: "api",
        enabledPublishMethods: ["manual-guide", "carrier-pigeon"],
      }).length,
    ).toBeGreaterThan(0); // unknown method in enabled set
  });

  it("every registered profile passes the extended shape contract", () => {
    for (const profile of listPlatformProfiles()) {
      expect(validateProfileShape(profile)).toEqual([]);
    }
  });
});

// ─── helpers ───

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

function readFileSyncSrc(rel) {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), rel), "utf8");
}

function validBaseProfile() {
  return {
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
}
