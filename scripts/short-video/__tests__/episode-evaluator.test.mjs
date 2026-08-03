import { describe, it, expect } from "vitest";
import { evaluateArticle } from "../lib/episode-evaluator.mjs";

describe("evaluateArticle", () => {
  it("returns 1 part for short article (<60s)", () => {
    const short = "This is a short article about DeepSeek.";
    const result = evaluateArticle(short);
    expect(result.recommendedParts).toBe(1);
    expect(result.splitMethod).toBe("none");
    expect(result.wordCount).toBeLessThan(200);
    expect(result.reasoning.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 2 parts for article ~120s", () => {
    // ~300 words = ~120s at 2.5 words/s
    const medium = Array(300).fill("word").join(" ");
    const result = evaluateArticle(medium);
    expect(result.recommendedParts).toBe(2);
    expect(result.estimatedDuration).toBeGreaterThan(60);
    expect(result.reasoning.length).toBeGreaterThanOrEqual(2);
  });

  it("returns 3 parts for article ~180s", () => {
    // ~450 words = ~180s
    const long = Array(450).fill("word").join(" ");
    const result = evaluateArticle(long);
    expect(result.recommendedParts).toBe(3);
    expect(result.reasoning.some((r) => r.includes("exceeding 60s"))).toBe(true);
  });

  it("returns 5 parts (cap) for very long article", () => {
    // ~700 words = ~280s
    const veryLong = Array(700).fill("word").join(" ");
    const result = evaluateArticle(veryLong);
    expect(result.recommendedParts).toBe(5);
  });

  it("handles empty string safely", () => {
    const result = evaluateArticle("");
    expect(result.recommendedParts).toBe(1);
    expect(result.splitMethod).toBe("none");
    expect(result.wordCount).toBe(0);
    expect(result.estimatedDuration).toBe(0);
  });

  it("handles only frontmatter (no body)", () => {
    const frontmatterOnly = `---
title: "Test"
slug: "test"
---
`;
    const result = evaluateArticle(frontmatterOnly);
    expect(result.recommendedParts).toBe(1);
    expect(result.wordCount).toBe(0);
  });

  it("strips markdown formatting from word count", () => {
    const markdown = `## Heading

**bold** and *italic* text with [link](url) and ![image](img.png).

<!-- widget:deepseek-cloud -->

- list item 1
- list item 2
`;
    const result = evaluateArticle(markdown);
    // Should count: bold italic text with and list item 1 list item 2 = ~10 words
    // Heading is also counted
    expect(result.wordCount).toBeGreaterThan(5);
    expect(result.wordCount).toBeLessThan(25);
  });

  it("counts chapters by ## headings", () => {
    const article = `## Introduction\n\nsome text\n\n## Background\n\nmore text\n\n## Conclusion\n\nfinal text`;
    const result = evaluateArticle(article);
    expect(result.chapterCount).toBe(3);
  });

  it("detects data points (numbers, percentages, amounts)", () => {
    const article = "DeepSeek raised $1.4 billion. Growth was 50%. They have 20000 GPUs.";
    const result = evaluateArticle(article);
    expect(result.dataPointCount).toBeGreaterThanOrEqual(3);
  });

  it("chooses thematic split when chapterCount >= 2 and duration > 60s", () => {
    const article = "## Topic One\n\n" + "word ".repeat(100) + "\n\n## Topic Two\n\n" + "word ".repeat(100);
    const result = evaluateArticle(article);
    expect(result.estimatedDuration).toBeGreaterThan(60);
    expect(result.splitMethod).toBe("thematic");
  });

  it("chooses narrative split when chapterCount < 2 but long", () => {
    const article = "word ".repeat(300);
    const result = evaluateArticle(article);
    expect(result.splitMethod).toBe("narrative");
  });

  it("reasoning includes word count and duration", () => {
    const article = "word ".repeat(200);
    const result = evaluateArticle(article);
    expect(result.reasoning.some((r) => r.includes("s") && r.includes("~"))).toBe(true);
  });
});
