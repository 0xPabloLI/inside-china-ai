import { describe, it, expect } from "vitest";
import {
  normalizeTopics,
  normalizeEntities,
  normalizeMetadata,
  toSnakeCase,
} from "../lib/normalizer.mjs";

// ─── toSnakeCase ───

describe("toSnakeCase", () => {
  it("converts spaces and capitals to snake_case", () => {
    expect(toSnakeCase("Liang Wenfeng")).toBe("liang_wenfeng");
    expect(toSnakeCase("DeepSeek V3")).toBe("deepseek_v3");
    expect(toSnakeCase("Jack Welch")).toBe("jack_welch");
  });

  it("handles already-lowercase single word", () => {
    expect(toSnakeCase("deepseek")).toBe("deepseek");
  });

  it("handles hyphens and mixed case", () => {
    expect(toSnakeCase("DeepSeek-R1")).toBe("deepseek_r1");
    expect(toSnakeCase("open-source")).toBe("open_source");
  });

  it("handles empty string", () => {
    expect(toSnakeCase("")).toBe("");
  });
});

// ─── normalizeTopics ───

describe("normalizeTopics", () => {
  it("lowercases all topic strings (Q5)", () => {
    expect(normalizeTopics(["DeepSeek", "AI", "Funding"])).toEqual(["deepseek", "ai", "funding"]);
  });

  it("handles already-lowercase topics", () => {
    expect(normalizeTopics(["deepseek", "funding"])).toEqual(["deepseek", "funding"]);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeTopics([])).toEqual([]);
  });

  it("returns empty array for null/undefined input", () => {
    expect(normalizeTopics(null)).toEqual([]);
    expect(normalizeTopics(undefined)).toEqual([]);
  });

  it("throws if topics is a string instead of array (Scenario #8)", () => {
    expect(() => normalizeTopics("deepseek")).toThrow(/array/i);
  });

  it("throws if topics contains non-string elements", () => {
    expect(() => normalizeTopics(["deepseek", 42])).toThrow(/string/i);
  });

  it("trims whitespace from topics", () => {
    expect(normalizeTopics(["  deepseek  ", " funding "])).toEqual(["deepseek", "funding"]);
  });

  it("filters out empty strings after trim", () => {
    expect(normalizeTopics(["deepseek", "  ", ""])).toEqual(["deepseek"]);
  });
});

// ─── normalizeEntities ───

describe("normalizeEntities", () => {
  it("converts entity IDs to snake_case", () => {
    const input = {
      companies: ["DeepSeek", "Nvidia", "Huawei"],
      people: ["Liang Wenfeng", "Jack Welch"],
      models: ["DeepSeek V3", "DeepSeek R1"],
    };
    const result = normalizeEntities(input);
    expect(result.companies).toEqual(["deepseek", "nvidia", "huawei"]);
    expect(result.people).toEqual(["liang_wenfeng", "jack_welch"]);
    expect(result.models).toEqual(["deepseek_v3", "deepseek_r1"]);
  });

  it("handles already-snake_case IDs", () => {
    const input = {
      companies: ["deepseek", "nvidia"],
      people: ["liang_wenfeng"],
    };
    const result = normalizeEntities(input);
    expect(result.companies).toEqual(["deepseek", "nvidia"]);
    expect(result.people).toEqual(["liang_wenfeng"]);
  });

  it("returns undefined for null/undefined input", () => {
    expect(normalizeEntities(null)).toBeUndefined();
    expect(normalizeEntities(undefined)).toBeUndefined();
  });

  it("handles partial entities (only companies)", () => {
    const result = normalizeEntities({ companies: ["DeepSeek"] });
    expect(result.companies).toEqual(["deepseek"]);
    expect(result.people).toBeUndefined();
    expect(result.models).toBeUndefined();
  });
});

// ─── normalizeMetadata ───

describe("normalizeMetadata", () => {
  it("normalizes topics and entities in a full metadata object", () => {
    const raw = {
      topics: ["DeepSeek", "Funding"],
      entities: {
        companies: ["DeepSeek", "Nvidia"],
        people: ["Liang Wenfeng"],
        models: ["DeepSeek V3"],
      },
      article_slug: "deepseek-art-of-restraint",
      section_title: "## The Funding Round",
      published: true,
    };
    const result = normalizeMetadata(raw);
    expect(result.topics).toEqual(["deepseek", "funding"]);
    expect(result.entities.companies).toEqual(["deepseek", "nvidia"]);
    expect(result.entities.people).toEqual(["liang_wenfeng"]);
    expect(result.entities.models).toEqual(["deepseek_v3"]);
    expect(result.article_slug).toBe("deepseek-art-of-restraint");
    expect(result.published).toBe(true);
  });

  it("omits entities key when entities is missing (Scenario #24)", () => {
    const raw = {
      topics: ["deepseek"],
      article_slug: "test-article",
    };
    const result = normalizeMetadata(raw);
    expect(result.topics).toEqual(["deepseek"]);
    expect(result).not.toHaveProperty("entities");
  });

  it("omits topics key when topics is missing", () => {
    const raw = {
      article_slug: "test-article",
    };
    const result = normalizeMetadata(raw);
    expect(result).not.toHaveProperty("topics");
  });

  it("keeps empty topics array as empty array", () => {
    const raw = { topics: [] };
    const result = normalizeMetadata(raw);
    expect(result.topics).toEqual([]);
  });

  it("throws if topics is a string instead of array (Scenario #8)", () => {
    const raw = { topics: "deepseek" };
    expect(() => normalizeMetadata(raw)).toThrow(/array/i);
  });

  it("passes through non-topics/non-entities fields unchanged", () => {
    const raw = {
      topics: ["deepseek"],
      source_urls: ["https://example.com"],
      part_number: 1,
      scene_id: "scene-3",
      visual_type: "hook",
      custom_field: "custom-value",
    };
    const result = normalizeMetadata(raw);
    expect(result.source_urls).toEqual(["https://example.com"]);
    expect(result.part_number).toBe(1);
    expect(result.scene_id).toBe("scene-3");
    expect(result.visual_type).toBe("hook");
    expect(result.custom_field).toBe("custom-value");
  });

  it("handles empty object input", () => {
    const result = normalizeMetadata({});
    expect(result).toEqual({});
  });

  it("handles null/undefined input", () => {
    expect(normalizeMetadata(null)).toEqual({});
    expect(normalizeMetadata(undefined)).toEqual({});
  });
});
