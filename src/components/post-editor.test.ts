import { describe, it, expect } from "vitest";
import { slugify } from "../lib/slug";

describe("slugify", () => {
  // Scenario 1: New post → empty title → empty slug
  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  // Auto-slug: "Hello World" → "hello-world"
  it("converts spaces to hyphens and lowercases", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  // Special chars stripped
  it("strips non-word characters except hyphens and spaces", () => {
    expect(slugify("Hello! World? #123")).toBe("hello-world-123");
  });

  // Multiple spaces → single hyphen
  it("collapses multiple spaces into single hyphen", () => {
    expect(slugify("Hello   World")).toBe("hello-world");
  });

  // Multiple hyphens collapsed
  it("collapses consecutive hyphens into one", () => {
    expect(slugify("Hello--World")).toBe("hello-world");
  });

  // Leading/trailing hyphens are NOT trimmed (existing behavior)
  it("preserves leading and trailing hyphens", () => {
    expect(slugify("-Hello World-")).toBe("-hello-world-");
  });

  // Max length 80
  it("truncates to 80 characters", () => {
    const input = "a".repeat(100);
    const result = slugify(input);
    expect(result.length).toBe(80);
  });

  // Unicode characters stripped (leaves leading hyphen from space before remaining word)
  it("strips unicode characters", () => {
    expect(slugify("你好 World")).toBe("-world");
  });

  // Numbers preserved
  it("preserves numbers", () => {
    expect(slugify("Post 123 Title")).toBe("post-123-title");
  });
});
