import { describe, it, expect } from "vitest";
import { writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  buildCaption,
  buildTiktokSettings,
  validateVideoFile,
  buildPendingAnalysis,
  buildAnalyticsGuidance,
  buildTikTokUrl,
  buildManualPublishGuide,
  buildAutoPublishWarning,
} from "../lib/publish-utils.mjs";

const mockMetadata = {
  title: "DeepSeek's $1.4B Funding Round Paused",
  description:
    "A leaked investor meeting reveals DeepSeek's strategy.\nFollow for more China AI news.\n\n#chinaai #deepseek #ai",
  hashtags: ["#chinaai", "#deepseek", "#ai"],
  generatedAt: "2026-08-02T11:28:25.152Z",
  source: "auto-derived",
};

describe("buildCaption", () => {
  it("assembles title + description into caption", () => {
    const result = buildCaption(mockMetadata);
    expect(result).toBe(
      "DeepSeek's $1.4B Funding Round Paused\n\nA leaked investor meeting reveals DeepSeek's strategy.\nFollow for more China AI news.\n\n#chinaai #deepseek #ai",
    );
  });

  it("caption is <= 2200 chars", () => {
    const result = buildCaption(mockMetadata);
    expect(result.length).toBeLessThanOrEqual(2200);
  });

  it("truncates if caption exceeds 2200 chars", () => {
    const longMeta = {
      title: "T",
      description: "x".repeat(2300),
    };
    const result = buildCaption(longMeta);
    expect(result.length).toBeLessThanOrEqual(2200);
  });

  it("handles missing title gracefully", () => {
    const result = buildCaption({ description: "desc" });
    expect(result).toBe("desc");
  });

  it("handles missing description gracefully", () => {
    const result = buildCaption({ title: "Title" });
    expect(result).toBe("Title");
  });

  it("handles empty metadata", () => {
    const result = buildCaption({});
    expect(result).toBe("");
  });

  it("handles null metadata", () => {
    const result = buildCaption(null);
    expect(result).toBe("");
  });
});

describe("buildTiktokSettings", () => {
  it("uses default PUBLIC_TO_EVERYONE", () => {
    const result = buildTiktokSettings();
    expect(result.tiktok.viewerSetting).toBe("PUBLIC_TO_EVERYONE");
  });

  it("sets allowDuet=false by default", () => {
    const result = buildTiktokSettings();
    expect(result.tiktok.allowDuet).toBe(false);
  });

  it("sets allowStitch=false by default", () => {
    const result = buildTiktokSettings();
    expect(result.tiktok.allowStitch).toBe(false);
  });

  it("sets allowComments=true by default", () => {
    const result = buildTiktokSettings();
    expect(result.tiktok.allowComments).toBe(true);
  });

  it("supports SELF_ONLY for testing", () => {
    const result = buildTiktokSettings({ viewerSetting: "SELF_ONLY" });
    expect(result.tiktok.viewerSetting).toBe("SELF_ONLY");
  });

  it("supports custom allow flags", () => {
    const result = buildTiktokSettings({ allowDuet: true, allowComments: false });
    expect(result.tiktok.allowDuet).toBe(true);
    expect(result.tiktok.allowComments).toBe(false);
  });

  it("validates commercial content rules", () => {
    expect(() => buildTiktokSettings({ commercialContent: true })).toThrow();
  });

  it("allows commercial content with brand flag", () => {
    const result = buildTiktokSettings({ commercialContent: true, brandOrganic: true });
    expect(result.tiktok.commercialContent).toBe(true);
    expect(result.tiktok.brandOrganic).toBe(true);
  });
});

describe("validateVideoFile", () => {
  it("returns error for non-existent file", () => {
    const result = validateVideoFile("/nonexistent/video.mp4");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns error for non-MP4 file", () => {
    // Use a known non-video file
    const result = validateVideoFile("package.json");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/mp4/i);
  });

  it("returns valid for existing MP4", () => {
    // Create a temporary MP4 file to test validation
    const tmpPath = join(tmpdir(), `test-${Date.now()}.mp4`);
    writeFileSync(tmpPath, Buffer.alloc(1024)); // 1KB dummy file
    const result = validateVideoFile(tmpPath);
    expect(result.valid).toBe(true);
    rmSync(tmpPath);
  });
});

// ─── buildPendingAnalysis (ISSUE-19) ───

describe("buildPendingAnalysis", () => {
  it("builds pending analysis with +48h suggested time (scenario 28)", () => {
    const postGroupId = "grp-123";
    const publishedAt = "2026-08-03T12:00:00Z";
    const result = buildPendingAnalysis(postGroupId, publishedAt);

    expect(result.postGroupId).toBe("grp-123");
    expect(result.publishedAt).toBe("2026-08-03T12:00:00Z");
    expect(result.status).toBe("pending");

    // suggestedAnalysisTime should be +48h
    const suggested = new Date(result.suggestedAnalysisTime);
    const published = new Date(publishedAt);
    const diffHours = (suggested - published) / (1000 * 60 * 60);
    expect(diffHours).toBe(48);
  });

  it("sets status to pending", () => {
    const result = buildPendingAnalysis("grp", "2026-01-01T00:00:00Z");
    expect(result.status).toBe("pending");
  });

  it("produces valid ISO timestamps", () => {
    const result = buildPendingAnalysis("grp", "2026-08-03T12:00:00Z");
    expect(new Date(result.publishedAt).toString()).not.toBe("Invalid Date");
    expect(new Date(result.suggestedAnalysisTime).toString()).not.toBe("Invalid Date");
  });
});

// ─── buildAnalyticsGuidance (ISSUE-19) ───

describe("buildAnalyticsGuidance", () => {
  it("includes 24-48h reminder text", () => {
    const msg = buildAnalyticsGuidance("output");
    expect(msg).toContain("24-48h");
  });

  it("includes fetch-tiktok-analytics command", () => {
    const msg = buildAnalyticsGuidance("output");
    expect(msg).toContain("fetch-tiktok-analytics.mjs");
  });

  it("includes ab-test-tracker command", () => {
    const msg = buildAnalyticsGuidance("output");
    expect(msg).toContain("ab-test-tracker.mjs");
  });

  it("includes pending-analysis.json path", () => {
    const msg = buildAnalyticsGuidance("output");
    expect(msg).toContain("pending-analysis.json");
  });

  it("includes analytics.tiktok.com URL", () => {
    const msg = buildAnalyticsGuidance("output");
    expect(msg).toContain("analytics.tiktok.com");
  });
});

describe("buildTikTokUrl", () => {
  it("constructs full TikTok URL from numeric postedId", () => {
    expect(buildTikTokUrl("7234567890123456789")).toBe(
      "https://www.tiktok.com/@chinaainews/video/7234567890123456789",
    );
  });

  it("handles postedId with leading zeros", () => {
    expect(buildTikTokUrl("007123")).toBe("https://www.tiktok.com/@chinaainews/video/007123");
  });

  it("always uses @chinaainews handle", () => {
    const url = buildTikTokUrl("123");
    expect(url).toContain("@chinaainews");
  });
});

// ─── buildManualPublishGuide (zero-views fix) ───

describe("buildManualPublishGuide", () => {
  const baseParams = {
    videoPath: "/path/to/video.mp4",
    caption: "Test title\n\nTest description\n#chinaai #ai",
  };

  it("includes the video file path", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("/path/to/video.mp4");
  });

  it("includes the caption text", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("Test title");
    expect(guide).toContain("Test description");
  });

  it("includes AIGC label warning when hasAIVoice=true", () => {
    const guide = buildManualPublishGuide({ ...baseParams, hasAIVoice: true });
    expect(guide).toContain("AI-generated content");
    expect(guide).toContain("CRITICAL");
  });

  it("omits AIGC label warning when hasAIVoice=false", () => {
    const guide = buildManualPublishGuide({ ...baseParams, hasAIVoice: false });
    expect(guide).not.toContain("CRITICAL");
    expect(guide).toContain("AIGC label not needed");
  });

  it("defaults hasAIVoice to true", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("AI-generated content");
  });

  it("includes in-app editing step", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("Edit");
    expect(guide).toContain("sticker");
  });

  it("includes trending audio step", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("Add sound");
    expect(guide).toContain("trending");
  });

  it("includes geographic tag step", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("Location");
    expect(guide).toContain("China");
  });

  it("includes first-hour engagement step", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("First hour");
    expect(guide).toContain("Reply to EVERY comment");
  });

  it("includes off-peak posting time recommendation", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("off-peak");
  });

  it("includes article URL with custom slug", () => {
    const guide = buildManualPublishGuide({
      ...baseParams,
      articleSlug: "kimi-k3-sandbox",
    });
    expect(guide).toContain("chinaainews.com/posts/kimi-k3-sandbox");
  });

  it("derives slug from exampleEntity when articleSlug not provided", () => {
    const guide = buildManualPublishGuide({
      ...baseParams,
      exampleEntity: "DeepSeek",
    });
    expect(guide).toContain("chinaainews.com/posts/DeepSeek-news");
  });

  it("includes API auto-publish disabled warning", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("API Auto-Publish is DISABLED");
  });

  it("includes analytics.tiktok.com URL", () => {
    const guide = buildManualPublishGuide(baseParams);
    expect(guide).toContain("analytics.tiktok.com");
  });
});

// ─── buildAutoPublishWarning ───

describe("buildAutoPublishWarning", () => {
  it("includes warning about API bypass", () => {
    const msg = buildAutoPublishWarning();
    expect(msg).toContain("WARNING");
    expect(msg).toContain("API");
  });

  it("lists all bypassed algorithm signals", () => {
    const msg = buildAutoPublishWarning();
    expect(msg).toContain("AIGC label");
    expect(msg).toContain("trending audio");
    expect(msg).toContain("in-app editing");
    expect(msg).toContain("geographic tag");
    expect(msg).toContain("first-hour engagement");
  });

  it("mentions zero views as top cause", () => {
    const msg = buildAutoPublishWarning();
    expect(msg).toContain("zero views");
  });

  it("recommends manual mode", () => {
    const msg = buildAutoPublishWarning();
    expect(msg).toContain("Manual");
    expect(msg).toContain("--auto");
  });
});
