import { describe, it, expect } from "vitest";
import { distributeTopics, buildWeeklyPlan } from "../lib/calendar-utils.mjs";

const mockTopics = {
  scrapedAt: "2026-08-02T12:00:00Z",
  totalTopics: 10,
  sourceStats: { qbitai: 3, "36kr": 2, techcrunch: 5 },
  topics: {
    breaking: [
      {
        title: "DeepSeek announces new model",
        sources: ["qbitai"],
        urls: ["http://1"],
        keywords: ["DeepSeek"],
        summary: "",
      },
      {
        title: "Baidu reveals chip breakthrough",
        sources: ["36kr"],
        urls: ["http://2"],
        keywords: ["Baidu"],
        summary: "",
      },
      {
        title: "Tencent invests $10B in AI",
        sources: ["techcrunch"],
        urls: ["http://3"],
        keywords: ["Tencent"],
        summary: "",
      },
      {
        title: "Alibaba launches Qwen 3",
        sources: ["qbitai"],
        urls: ["http://4"],
        keywords: ["Alibaba"],
        summary: "",
      },
    ],
    fermenting: [
      {
        title: "Analysis: DeepSeek's open-source strategy",
        sources: ["techcrunch"],
        urls: ["http://5"],
        keywords: ["DeepSeek"],
        summary: "",
      },
      {
        title: "Why China AI is winning",
        sources: ["36kr"],
        urls: ["http://6"],
        keywords: ["China", "AI"],
        summary: "",
      },
      {
        title: "Behind the DeepSeek leak",
        sources: ["qbitai"],
        urls: ["http://7"],
        keywords: ["DeepSeek"],
        summary: "",
      },
    ],
    data: [
      {
        title: "China AI market reaches $50B",
        sources: ["techcrunch"],
        urls: ["http://8"],
        keywords: ["China", "AI"],
        summary: "",
      },
      {
        title: "DeepSeek valuation hits $5B",
        sources: ["techcrunch"],
        urls: ["http://9"],
        keywords: ["DeepSeek"],
        summary: "",
      },
    ],
    explainer: [
      {
        title: "What is DeepSeek: A guide",
        sources: ["qbitai"],
        urls: ["http://10"],
        keywords: ["DeepSeek"],
        summary: "",
      },
    ],
  },
};

describe("distributeTopics", () => {
  it("distributes topics across 7 days by pillar ratio (40/30/20/10)", () => {
    const result = distributeTopics(mockTopics);
    expect(result).toHaveLength(7);

    // Each day should have a topic (if enough topics)
    const assigned = result.filter((d) => d.topic);
    expect(assigned.length).toBeGreaterThanOrEqual(Math.min(7, mockTopics.totalTopics));

    // Check pillar ratio across 7 days: ~40% breaking, ~30% fermenting, ~20% data, ~10% explainer
    const breaking = result.filter((d) => d.type === "breaking");
    const fermenting = result.filter((d) => d.type === "fermenting");
    const data = result.filter((d) => d.type === "data");
    const explainer = result.filter((d) => d.type === "explainer");

    // With 7 days: 3 breaking, 2 fermenting, 1 data, 1 explainer
    expect(breaking.length).toBe(3);
    expect(fermenting.length).toBe(2);
    expect(data.length).toBe(1);
    expect(explainer.length).toBe(1);
  });

  it("handles empty topics", () => {
    const empty = {
      scrapedAt: "",
      totalTopics: 0,
      sourceStats: {},
      topics: { breaking: [], fermenting: [], data: [], explainer: [] },
    };
    const result = distributeTopics(empty);
    expect(result).toHaveLength(7);
    expect(result.every((d) => d.topic === null)).toBe(true);
  });

  it("handles fewer topics than days", () => {
    const few = {
      scrapedAt: "",
      totalTopics: 2,
      sourceStats: {},
      topics: {
        breaking: [{ title: "Test 1", sources: ["x"], urls: [""], keywords: [], summary: "" }],
        fermenting: [{ title: "Test 2", sources: ["x"], urls: [""], keywords: [], summary: "" }],
        data: [],
        explainer: [],
      },
    };
    const result = distributeTopics(few);
    expect(result).toHaveLength(7);
    const assigned = result.filter((d) => d.topic);
    expect(assigned.length).toBe(2);
  });

  it("assigns hook formula based on type", () => {
    const result = distributeTopics(mockTopics);
    for (const day of result) {
      if (day.topic) {
        expect(day.hookFormula).toBeTruthy();
        expect(day.duration).toBeTruthy();
      }
    }
  });
});

describe("buildWeeklyPlan", () => {
  it("builds structured weekly plan JSON", () => {
    const result = buildWeeklyPlan(mockTopics);

    expect(result.generatedAt).toBeTruthy();
    expect(result.totalTopics).toBe(10);
    expect(result.days).toHaveLength(7);

    const firstDay = result.days[0];
    expect(firstDay.day).toBe(1);
    expect(firstDay.date).toBeTruthy();
    expect(firstDay.type).toBeTruthy();
  });

  it("includes metadata for each assigned topic", () => {
    const result = buildWeeklyPlan(mockTopics);
    for (const day of result.days) {
      if (day.topic) {
        expect(day.topic.title).toBeTruthy();
        expect(day.topic.sources).toBeTruthy();
        expect(day.topic.urls).toBeTruthy();
      }
    }
  });
});
