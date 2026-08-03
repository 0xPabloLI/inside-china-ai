import { describe, it, expect } from "vitest";
import {
  buildCaption,
  buildTiktokSettings,
  validateVideoFile,
  buildPendingAnalysis,
  buildAnalyticsGuidance,
} from "../lib/publish-utils.mjs";

const mockMetadata = {
  title: "DeepSeek's $1.4B Funding Round Paused",
  description: "A leaked investor meeting reveals DeepSeek's strategy.\nFollow for more China AI news.\n\n#chinaai #deepseek #ai",
  hashtags: ["#chinaai", "#deepseek", "#ai"],
  generatedAt: "2026-08-02T11:28:25.152Z",
  source: "auto-derived",
};

describe("buildCaption", () => {
  it("assembles title + description into caption", () => {
    const result = buildCaption(mockMetadata);
    expect(result).toBe(
      "DeepSeek's $1.4B Funding Round Paused\n\nA leaked investor meeting reveals DeepSeek's strategy.\nFollow for more China AI news.\n\n#chinaai #deepseek #ai"
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
    // Use the actual video file from output
    const result = validateVideoFile("scripts/short-video/output/deepseek-short.mp4");
    expect(result.valid).toBe(true);
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
