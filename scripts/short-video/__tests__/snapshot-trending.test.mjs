import { describe, it, expect } from "vitest";
import { matchTrendingTags, buildSnapshot, getCreativeCenterUrl } from "../snapshot-trending.mjs";

describe("snapshot-trending", () => {
  describe("getCreativeCenterUrl", () => {
    it("generates correct URL with period and region", () => {
      const url = getCreativeCenterUrl("7", "US");
      expect(url).toContain("period=7");
      expect(url).toContain("region=US");
      expect(url).toContain("creativeCenter/trends/hashtag");
    });

    it("handles different period and region", () => {
      const url = getCreativeCenterUrl("30", "JP");
      expect(url).toContain("period=30");
      expect(url).toContain("region=JP");
    });
  });

  describe("matchTrendingTags", () => {
    it("matches trending tags by keyword inclusion", () => {
      const trending = [
        { name: "#aidigital", views: "1.2B", posts: "45K" },
        { name: "#fyp", views: "100B", posts: "5M" },
        { name: "#deepseek", views: "50M", posts: "1K" },
      ];
      const keywords = ["deepseek", "ai"];
      const matched = matchTrendingTags(trending, keywords);

      expect(matched).toHaveLength(2);
      expect(matched[0].name).toBe("#aidigital"); // "ai" keyword
      expect(matched[1].name).toBe("#deepseek"); // "deepseek" keyword
    });

    it("sorts by views descending", () => {
      const trending = [
        { name: "#aimodel", views: 100, posts: 5 },
        { name: "#aipowered", views: 500, posts: 10 },
        { name: "#fyp", views: 10000, posts: 100 },
      ];
      const keywords = ["ai"];
      const matched = matchTrendingTags(trending, keywords);

      expect(matched).toHaveLength(2);
      expect(matched[0].name).toBe("#aipowered"); // 500 > 100
      expect(matched[1].name).toBe("#aimodel");
    });

    it("returns empty when no keywords", () => {
      const trending = [{ name: "#ai", views: 100, posts: 5 }];
      const matched = matchTrendingTags(trending, []);
      expect(matched).toHaveLength(0);
    });

    it("returns empty when no trending tags", () => {
      const matched = matchTrendingTags([], ["ai"]);
      expect(matched).toHaveLength(0);
    });

    it("handles tag names without #", () => {
      const trending = [
        { name: "aichat", views: 100, posts: 5 },
        { name: "fyp", views: 200, posts: 10 },
      ];
      const keywords = ["ai"];
      const matched = matchTrendingTags(trending, keywords);
      expect(matched).toHaveLength(1);
      expect(matched[0].name).toBe("aichat");
    });

    it("records which keywords matched", () => {
      const trending = [{ name: "#aidigital", views: 100, posts: 5 }];
      const keywords = ["ai", "digital"];
      const matched = matchTrendingTags(trending, keywords);
      expect(matched[0].matchedKeywords).toContain("ai");
      expect(matched[0].matchedKeywords).toContain("digital");
    });

    it("does not match unrelated tags", () => {
      const trending = [
        { name: "#dance", views: 100, posts: 5 },
        { name: "#fyp", views: 200, posts: 10 },
        { name: "#makeup", views: 50, posts: 3 },
      ];
      const keywords = ["deepseek", "ai"];
      const matched = matchTrendingTags(trending, keywords);
      expect(matched).toHaveLength(0);
    });
  });

  describe("buildSnapshot", () => {
    it("builds a complete snapshot object", () => {
      const trending = [
        { name: "#ai", views: 100, posts: 5 },
        { name: "#fyp", views: 200, posts: 10 },
      ];
      const matched = [{ name: "#ai", views: 100, posts: 5, matchedKeywords: ["ai"] }];
      const snapshot = buildSnapshot(trending, matched, ["ai"], "7", "US");

      expect(snapshot.period).toBe("7");
      expect(snapshot.region).toBe("US");
      expect(snapshot.keywords).toEqual(["ai"]);
      expect(snapshot.totalTrendingTags).toBe(2);
      expect(snapshot.matchedTags).toBe(1);
      expect(snapshot.trendingTags).toHaveLength(2);
      expect(snapshot.matchedTrendingTags).toHaveLength(1);
      expect(snapshot.creativeCenterUrl).toContain("period=7");
      expect(snapshot.snapshotDate).toBeTruthy();
    });

    it("includes note when no matches", () => {
      const snapshot = buildSnapshot(
        [{ name: "#fyp", views: 100, posts: 5 }],
        [],
        ["deepseek"],
        "7",
        "US",
      );
      expect(snapshot.note).toContain("No trending tags matched");
      expect(snapshot.note).toContain("curated hashtag pool");
    });

    it("includes note when matches found", () => {
      const matched = [{ name: "#ai", views: 100, posts: 5, matchedKeywords: ["ai"] }];
      const snapshot = buildSnapshot(
        [{ name: "#ai", views: 100, posts: 5 }],
        matched,
        ["ai"],
        "7",
        "US",
      );
      expect(snapshot.note).toContain("1 trending tag(s) matched");
      expect(snapshot.note).toContain("metadata.trendingHashtags");
    });

    it("truncates trending tags to top 50", () => {
      const trending = Array.from({ length: 80 }, (_, i) => ({
        name: `#tag${i}`,
        views: 1000 - i,
        posts: 10,
      }));
      const snapshot = buildSnapshot(trending, [], [], "7", "US");
      expect(snapshot.trendingTags).toHaveLength(50);
      expect(snapshot.trendingTags[0].name).toBe("#tag0");
    });
  });
});
