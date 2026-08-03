import { describe, it, expect } from "vitest";
import {
  normalizeColumnName,
  matchColumn,
  FIELD_KEYWORDS,
  parseCSV,
  parseAnalyticsCSV,
  mapRowToVideo,
} from "../lib/analytics-utils.mjs";

// ─── normalizeColumnName ───

describe("normalizeColumnName", () => {
  it("lowercases and trims", () => {
    expect(normalizeColumnName("  Views  ")).toBe("views");
  });

  it("removes special characters", () => {
    expect(normalizeColumnName("Video Views!")).toBe("videoviews");
  });

  it("handles Chinese characters", () => {
    expect(normalizeColumnName("视频播放量")).toBe("视频播放量");
  });

  it("handles empty string", () => {
    expect(normalizeColumnName("")).toBe("");
  });
});

// ─── matchColumn ───

describe("matchColumn", () => {
  it("matches 'Video title' to title field", () => {
    expect(matchColumn("Video title")).toBe("title");
  });

  it("matches 'Video post time' to postedAt field", () => {
    expect(matchColumn("Video post time")).toBe("postedAt");
  });

  it("matches 'Views' to views field", () => {
    expect(matchColumn("Views")).toBe("views");
  });

  it("matches 'Video views' to views field (fuzzy)", () => {
    expect(matchColumn("Video views")).toBe("views");
  });

  it("matches '播放量' to views field (Chinese keyword)", () => {
    expect(matchColumn("播放量")).toBe("views");
  });

  it("matches 'Average watch time' to avgWatchTime field", () => {
    expect(matchColumn("Average watch time")).toBe("avgWatchTime");
  });

  it("matches 'Average watch %' to completionRate field", () => {
    expect(matchColumn("Average watch %")).toBe("completionRate");
  });

  it("matches '完成率' to completionRate field (Chinese)", () => {
    expect(matchColumn("完成率")).toBe("completionRate");
  });

  it("matches 'Shares' to shares field", () => {
    expect(matchColumn("Shares")).toBe("shares");
  });

  it("matches 'Saves' to saves field", () => {
    expect(matchColumn("Saves")).toBe("saves");
  });

  it("matches '收藏' to saves field (Chinese)", () => {
    expect(matchColumn("收藏")).toBe("saves");
  });

  it("matches 'Comments' to comments field", () => {
    expect(matchColumn("Comments")).toBe("comments");
  });

  it("matches 'Likes' to likes field", () => {
    expect(matchColumn("Likes")).toBe("likes");
  });

  it("returns null for unknown column", () => {
    expect(matchColumn("Some random column")).toBeNull();
  });
});

// ─── parseCSV ───

describe("parseCSV", () => {
  it("parses simple CSV with header + data", () => {
    const csv = "Title,Views\nVideo 1,1000\nVideo 2,2000\n";
    const result = parseCSV(csv);
    expect(result.headers).toEqual(["Title", "Views"]);
    expect(result.rows).toEqual([
      { Title: "Video 1", Views: "1000" },
      { Title: "Video 2", Views: "2000" },
    ]);
  });

  it("handles quoted values with commas", () => {
    const csv = '"Title, With Comma",Views\n"Hello, World",100\n';
    const result = parseCSV(csv);
    expect(result.rows[0]["Title, With Comma"]).toBe("Hello, World");
    expect(result.rows[0].Views).toBe("100");
  });

  it("handles empty CSV (only header)", () => {
    const csv = "Title,Views\n";
    const result = parseCSV(csv);
    expect(result.headers).toEqual(["Title", "Views"]);
    expect(result.rows).toEqual([]);
  });

  it("handles empty string", () => {
    const result = parseCSV("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    const csv = "Title,Views\r\nVideo 1,100\r\n";
    const result = parseCSV(csv);
    expect(result.rows[0].Title).toBe("Video 1");
  });
});

// ─── mapRowToVideo ───

describe("mapRowToVideo", () => {
  it("maps all fields correctly (scenario 18)", () => {
    const row = {
      "Video title": "My Video",
      "Video post time": "2026-08-01T12:00:00Z",
      Views: "1500",
      "Average watch time": "00:15",
      "Average watch %": "45.5",
      Shares: "10",
      Saves: "5",
      Comments: "3",
      Likes: "100",
    };
    const result = mapRowToVideo(row);
    expect(result.title).toBe("My Video");
    expect(result.postedAt).toBe("2026-08-01T12:00:00Z");
    expect(result.views).toBe(1500);
    expect(result.avgWatchTime).toBe("00:15");
    expect(result.completionRate).toBe(45.5);
    expect(result.shares).toBe(10);
    expect(result.saves).toBe(5);
    expect(result.comments).toBe(3);
    expect(result.likes).toBe(100);
  });

  it("sets null for missing columns (scenario 19)", () => {
    const row = {
      "Video title": "My Video",
      Views: "1000",
    };
    const result = mapRowToVideo(row);
    expect(result.title).toBe("My Video");
    expect(result.views).toBe(1000);
    expect(result.saves).toBeNull();
    expect(result.comments).toBeNull();
    expect(result.likes).toBeNull();
  });

  it("sets null for non-numeric values (scenario 27)", () => {
    const row = {
      "Video title": "My Video",
      Views: "N/A",
      Shares: "—",
      Likes: "abc",
    };
    const result = mapRowToVideo(row);
    expect(result.views).toBeNull();
    expect(result.shares).toBeNull();
    expect(result.likes).toBeNull();
  });

  it("preserves special characters in title (scenario 26)", () => {
    const row = {
      "Video title": "DeepSeek's $1.4B 💰 Round Paused!",
      Views: "500",
    };
    const result = mapRowToVideo(row);
    expect(result.title).toBe("DeepSeek's $1.4B 💰 Round Paused!");
  });

  it("handles extra columns (scenario 20)", () => {
    const row = {
      "Video title": "Test",
      Views: "100",
      "Extra Column": "ignored",
    };
    const result = mapRowToVideo(row);
    expect(result.title).toBe("Test");
    expect(result.views).toBe(100);
    expect(result.extra).toBeUndefined();
  });
});

// ─── parseAnalyticsCSV ───

describe("parseAnalyticsCSV", () => {
  it("parses full CSV into analytics JSON (scenario 18)", () => {
    const csv = [
      "Video title,Video post time,Views,Average watch time,Average watch %,Shares,Saves,Comments,Likes",
      "Video A,2026-08-01,1000,00:10,50.0,5,3,2,50",
      "Video B,2026-08-02,2000,00:20,60.0,10,8,5,100",
    ].join("\n");
    const result = parseAnalyticsCSV(csv);
    expect(result.source).toBe("csv");
    expect(result.videos).toHaveLength(2);
    expect(result.videos[0].title).toBe("Video A");
    expect(result.videos[0].views).toBe(1000);
    expect(result.videos[1].title).toBe("Video B");
    expect(result.videos[1].views).toBe(2000);
  });

  it("returns empty videos array for header-only CSV (scenario 21)", () => {
    const csv = "Video title,Views\n";
    const result = parseAnalyticsCSV(csv);
    expect(result.videos).toEqual([]);
  });

  it("returns empty videos array for empty content", () => {
    const result = parseAnalyticsCSV("");
    expect(result.videos).toEqual([]);
  });

  it("sets exportedAt timestamp", () => {
    const result = parseAnalyticsCSV("Video title,Views\nTest,100\n");
    expect(result.exportedAt).toBeTruthy();
    expect(new Date(result.exportedAt).toString()).not.toBe("Invalid Date");
  });
});
