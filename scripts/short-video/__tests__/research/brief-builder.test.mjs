import { describe, it, expect } from "vitest";
import {
  normalizeUrl,
  deduplicateSources,
  filterByTimeWindow,
  prioritizeSources,
  buildBrief,
} from "../../lib/research/brief-builder.mjs";
import { DISCOVERY_SCHEMA_VERSION } from "../../lib/research/schemas.mjs";

// ─── normalizeUrl ───

describe("normalizeUrl", () => {
  it("lowercases hostname", () => {
    expect(normalizeUrl("https://WWW.Example.COM/path")).toBe("https://www.example.com/path");
  });

  it("strips utm parameters", () => {
    const result = normalizeUrl(
      "https://example.com/article?utm_source=newsletter&utm_medium=email",
    );
    expect(result).not.toContain("utm_source");
    expect(result).not.toContain("utm_medium");
  });

  it("strips fbclid and gclid", () => {
    const result = normalizeUrl("https://example.com/a?fbclid=abc&gclid=def");
    expect(result).not.toContain("fbclid");
    expect(result).not.toContain("gclid");
  });

  it("sorts remaining query parameters", () => {
    const result = normalizeUrl("https://example.com/a?b=2&a=1");
    expect(result).toContain("a=1");
    expect(result).toContain("b=2");
    // a should come before b
    const searchPart = result.split("?")[1];
    expect(searchPart.indexOf("a=1")).toBeLessThan(searchPart.indexOf("b=2"));
  });

  it("removes fragment", () => {
    expect(normalizeUrl("https://example.com/a#section")).not.toContain("#");
  });

  it("removes trailing slash from non-root paths", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
  });

  it("preserves root path trailing slash", () => {
    const result = normalizeUrl("https://example.com/");
    expect(result).toBe("https://example.com/");
  });

  it("returns empty string for null/undefined input", () => {
    expect(normalizeUrl(null)).toBe("");
    expect(normalizeUrl(undefined)).toBe("");
  });

  it("returns input as-is for invalid URLs", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

// ─── deduplicateSources ───

describe("deduplicateSources", () => {
  it("removes exact URL duplicates", () => {
    const sources = [
      { url: "https://example.com/a", title: "A", sourceType: "independent-secondary" },
      { url: "https://example.com/a", title: "A duplicate", sourceType: "independent-secondary" },
    ];
    const result = deduplicateSources(sources);
    expect(result).toHaveLength(1);
  });

  it("removes duplicates after normalization (tracking params)", () => {
    const sources = [
      {
        url: "https://example.com/a?utm_source=x",
        title: "A",
        sourceType: "independent-secondary",
      },
      { url: "https://example.com/a", title: "A dup", sourceType: "independent-secondary" },
    ];
    const result = deduplicateSources(sources);
    expect(result).toHaveLength(1);
  });

  it("keeps the higher-priority source when duplicates exist", () => {
    const sources = [
      { url: "https://example.com/a", title: "Blog post", sourceType: "community" },
      { url: "https://example.com/a", title: "Official announcement", sourceType: "primary" },
    ];
    const result = deduplicateSources(sources);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Official announcement");
  });

  it("keeps first encountered when same priority", () => {
    const sources = [
      { url: "https://example.com/a", title: "First", sourceType: "independent-secondary" },
      { url: "https://example.com/a", title: "Second", sourceType: "independent-secondary" },
    ];
    const result = deduplicateSources(sources);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("First");
  });

  it("handles case-insensitive hostname dedup", () => {
    const sources = [
      { url: "HTTPS://Example.COM/a", title: "Caps", sourceType: "independent-secondary" },
      { url: "https://example.com/a", title: "Lower", sourceType: "independent-secondary" },
    ];
    const result = deduplicateSources(sources);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for non-array input", () => {
    expect(deduplicateSources(null)).toEqual([]);
    expect(deduplicateSources("not-array")).toEqual([]);
  });

  it("skips sources without url", () => {
    const sources = [
      { title: "No URL", sourceType: "independent-secondary" },
      { url: "https://example.com/a", title: "With URL", sourceType: "independent-secondary" },
    ];
    const result = deduplicateSources(sources);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("With URL");
  });
});

// ─── filterByTimeWindow ───

describe("filterByTimeWindow", () => {
  it("keeps sources within the time window", () => {
    const ref = "2026-08-18";
    const sources = [
      { url: "https://a.com", publishedAt: "2026-08-15" }, // 3 days ago
      { url: "https://b.com", publishedAt: "2026-07-01" }, // old
    ];
    const result = filterByTimeWindow(sources, 7, ref);
    expect(result).toHaveLength(1);
    expect(result[0].url).toContain("a.com");
  });

  it("keeps sources without publishedAt date", () => {
    const sources = [{ url: "https://a.com" }, { url: "https://b.com", publishedAt: "2020-01-01" }];
    const result = filterByTimeWindow(sources, 7);
    expect(result).toHaveLength(1);
    expect(result[0].url).toContain("a.com");
  });

  it("keeps sources with invalid publishedAt date", () => {
    const sources = [{ url: "https://a.com", publishedAt: "not-a-date" }];
    const result = filterByTimeWindow(sources, 7);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for non-array input", () => {
    expect(filterByTimeWindow(null, 7)).toEqual([]);
  });
});

// ─── prioritizeSources ───

describe("prioritizeSources", () => {
  it("sorts primary before secondary before community", () => {
    const sources = [
      { url: "https://blog.com", sourceType: "community" },
      { url: "https://official.com", sourceType: "primary" },
      { url: "https://reuters.com", sourceType: "independent-secondary" },
      { url: "https://techcrunch.com", sourceType: "authoritative-secondary" },
    ];
    const result = prioritizeSources(sources);
    expect(result[0].url).toContain("official.com");
    expect(result[1].url).toContain("techcrunch.com");
    expect(result[2].url).toContain("reuters.com");
    expect(result[3].url).toContain("blog.com");
  });

  it("sources without sourceType go to the end", () => {
    const sources = [
      { url: "https://unknown.com" },
      { url: "https://official.com", sourceType: "primary" },
    ];
    const result = prioritizeSources(sources);
    expect(result[0].url).toContain("official.com");
    expect(result[1].url).toContain("unknown.com");
  });

  it("does not mutate the input array", () => {
    const sources = [
      { url: "https://blog.com", sourceType: "community" },
      { url: "https://official.com", sourceType: "primary" },
    ];
    const result = prioritizeSources(sources);
    expect(sources[0].url).toContain("blog.com"); // Original unchanged
    expect(result[0].url).toContain("official.com");
  });
});

// ─── buildBrief ───

describe("buildBrief", () => {
  const validDiscovery = {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    contentId: "test-content",
    researchRunId: "run-001",
    timeWindow: { days: 7, until: "2026-08-18" },
    locale: "en",
    sources: [
      {
        url: "https://official.com/announcement?utm_source=newsletter",
        title: "Official Announcement",
        sourceType: "primary",
        publishedAt: "2026-08-15",
      },
      {
        url: "https://techcrunch.com/coverage",
        title: "TechCrunch Coverage",
        sourceType: "authoritative-secondary",
        publishedAt: "2026-08-16",
      },
      {
        url: "https://blog.com/opinion",
        title: "Random Blog Opinion",
        sourceType: "community",
        publishedAt: "2026-06-01", // Old — should be filtered
      },
      // Duplicate of official.com (after normalization strips utm)
      {
        url: "https://official.com/announcement",
        title: "Duplicate of Official",
        sourceType: "community",
        publishedAt: "2026-08-16",
      },
    ],
    sourceCount: 4,
  };

  it("builds a valid brief from a discovery object", () => {
    const result = buildBrief(validDiscovery, {
      researchQuestion: "What did the company announce?",
      researchTier: "standard",
      claimsToVerify: [{ claimId: "c1", question: "Is the announcement verified?" }],
    });
    expect(result.valid).toBe(true);
    expect(result.brief).not.toBeNull();
    expect(result.brief.researchQuestion).toBe("What did the company announce?");
    expect(result.brief.contentId).toBe("test-content");
    expect(result.brief.researchRunId).toBe("run-001");
  });

  it("deduplicates sources (4 → 3 after dedup, 2 after time filter)", () => {
    const result = buildBrief(validDiscovery, {
      researchQuestion: "test?",
      researchTier: "standard",
      claimsToVerify: [],
    });
    // After dedup: official.com (primary wins over community dup) + techcrunch + blog.com
    // After time filter (30 days from 2026-08-18): blog.com (June) filtered out
    expect(result.brief.candidateSources).toHaveLength(2);
  });

  it("sorts candidate sources by priority", () => {
    const result = buildBrief(validDiscovery, {
      researchQuestion: "test?",
      researchTier: "standard",
      claimsToVerify: [],
    });
    expect(result.brief.candidateSources[0].sourceType).toBe("primary");
    expect(result.brief.candidateSources[1].sourceType).toBe("authoritative-secondary");
  });

  it("normalizes URLs in candidate sources", () => {
    const result = buildBrief(validDiscovery, {
      researchQuestion: "test?",
      researchTier: "standard",
      claimsToVerify: [],
    });
    // The primary source had utm_source, should be stripped
    expect(result.brief.candidateSources[0].url).not.toContain("utm_source");
  });

  it("returns invalid when discovery is not an object", () => {
    const result = buildBrief(null, { researchQuestion: "test?" });
    expect(result.valid).toBe(false);
    expect(result.brief).toBeNull();
  });

  it("returns invalid when discovery.sources is not an array", () => {
    const result = buildBrief(
      { contentId: "x", sources: "bad" },
      {
        researchQuestion: "test?",
      },
    );
    expect(result.valid).toBe(false);
  });

  it("defaults researchTier to standard", () => {
    const result = buildBrief(
      {
        schemaVersion: DISCOVERY_SCHEMA_VERSION,
        contentId: "x",
        researchRunId: "r1",
        sources: [],
        sourceCount: 0,
      },
      { researchQuestion: "test?" },
    );
    expect(result.brief.researchTier).toBe("standard");
  });
});
