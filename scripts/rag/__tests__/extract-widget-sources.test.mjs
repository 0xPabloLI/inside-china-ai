import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  extractUrlsFromContent,
  deduplicateUrls,
  slugifyUrl,
  createSourceMarkdown,
  createStubMarkdown,
} from "../extract-widget-sources.mjs";

// ─── extractUrlsFromContent ───

describe("extractUrlsFromContent", () => {
  it("extracts sourceUrl fields from funding.ts-style content", () => {
    const tsContent = `
    export const FUNDING_ROUNDS = [
      {
        event: "DeepSeek Founded",
        source: "Wikipedia — DeepSeek",
        sourceUrl: "https://en.wikipedia.org/wiki/DeepSeek",
        color: "#888888",
      },
      {
        event: "Fundraising Launched",
        source: "elsewhere",
        sourceUrl: "https://elsewhere.news/en/elsewhere/deepseek",
        color: "#5B8FF9",
      },
    ];
    `;
    const urls = extractUrlsFromContent(tsContent, "deepseek/data/funding.ts");
    expect(urls).toHaveLength(2);
    expect(urls[0].url).toBe("https://en.wikipedia.org/wiki/DeepSeek");
    expect(urls[0].widgetId).toBe("deepseek");
    expect(urls[0].fieldName).toBe("sourceUrl");
    expect(urls[1].url).toBe("https://elsewhere.news/en/elsewhere/deepseek");
  });

  it("extracts url fields from news-events.ts-style content", () => {
    const tsContent = `
    export const NEWS_EVENTS = [
      {
        company: "DeepSeek",
        headline: "Named in Anthropic's distillation blog post",
        source: "Anthropic Blog",
        url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
      },
      {
        company: "MiniMax",
        headline: "Stock peaks",
        source: "Google Finance",
        url: "https://www.google.com/finance/quote/0100:HKG",
      },
    ];
    `;
    const urls = extractUrlsFromContent(tsContent, "distillation/data/news-events.ts");
    expect(urls).toHaveLength(2);
    expect(urls[0].url).toBe(
      "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
    );
    expect(urls[0].widgetId).toBe("distillation");
    expect(urls[0].fieldName).toBe("url");
    expect(urls[1].url).toBe("https://www.google.com/finance/quote/0100:HKG");
  });

  it("returns empty array for files with no URL fields (Scenario: pricing.ts / deepseek-api-pricing)", () => {
    const tsContent = `
    export const PRICING_DATA = [
      {
        vendor: "DeepSeek",
        models: [
          { name: "V4-Pro", input: 3, output: 6 },
        ],
      },
    ];
    `;
    const urls = extractUrlsFromContent(tsContent, "deepseek-api-pricing/data/pricing.ts");
    expect(urls).toEqual([]);
  });

  it("handles multi-line sourceUrl (split across lines)", () => {
    const tsContent = `
    {
      sourceUrl:
        "https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/",
    },
    `;
    const urls = extractUrlsFromContent(tsContent, "deepseek/data/funding.ts");
    expect(urls).toHaveLength(1);
    expect(urls[0].url).toBe(
      "https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/",
    );
  });

  it("deduplicates URLs within a single file (same URL appearing multiple times)", () => {
    const tsContent = `
    export const DATA = [
      { source: "Google Finance", url: "https://www.google.com/finance/quote/0100:HKG" },
      { source: "Google Finance", url: "https://www.google.com/finance/quote/0100:HKG" },
      { source: "Google Finance", url: "https://www.google.com/finance/quote/0100:HKG" },
    ];
    `;
    const urls = extractUrlsFromContent(tsContent, "distillation/data/minimax-stock.ts");
    // extractUrlsFromContent returns all matches; dedup happens later
    expect(urls).toHaveLength(3);
  });
});

// ─── deduplicateUrls ───

describe("deduplicateUrls", () => {
  it("removes duplicate URLs keeping first occurrence (Scenario #17)", () => {
    const entries = [
      { url: "https://example.com/a", widgetId: "deepseek", fieldName: "sourceUrl" },
      { url: "https://example.com/b", widgetId: "distillation", fieldName: "url" },
      { url: "https://example.com/a", widgetId: "distillation", fieldName: "url" },
      { url: "https://example.com/c", widgetId: "deepseek", fieldName: "sourceUrl" },
      { url: "https://example.com/b", widgetId: "deepseek", fieldName: "sourceUrl" },
    ];
    const deduped = deduplicateUrls(entries);
    expect(deduped).toHaveLength(3);
    expect(deduped[0].url).toBe("https://example.com/a");
    expect(deduped[0].widgetId).toBe("deepseek"); // first occurrence wins
    expect(deduped[1].url).toBe("https://example.com/b");
    expect(deduped[1].widgetId).toBe("distillation");
    expect(deduped[2].url).toBe("https://example.com/c");
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateUrls([])).toEqual([]);
  });

  it("returns same array when no duplicates", () => {
    const entries = [
      { url: "https://example.com/a", widgetId: "w1", fieldName: "sourceUrl" },
      { url: "https://example.com/b", widgetId: "w2", fieldName: "url" },
    ];
    const deduped = deduplicateUrls(entries);
    expect(deduped).toHaveLength(2);
  });
});

// ─── slugifyUrl ───

describe("slugifyUrl", () => {
  it("converts URL to filesystem-safe slug", () => {
    const slug = slugifyUrl(
      "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
    );
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug).toContain("anthropic");
    expect(slug).toContain("distillation");
  });

  it("handles URLs with query params", () => {
    const slug = slugifyUrl("https://www.google.com/finance/quote/0100:HKG?q=1");
    expect(slug).not.toContain("?");
    expect(slug).not.toContain("=");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("handles URLs with special characters", () => {
    const slug = slugifyUrl("https://en.cryptonomist.ch/2026/07/14/deepseek-new-funding/");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).toContain("cryptonomist");
  });

  it("produces reasonable length slug (truncates if too long)", () => {
    const longUrl = "https://example.com/" + "a".repeat(200);
    const slug = slugifyUrl(longUrl);
    expect(slug.length).toBeLessThanOrEqual(100);
  });
});

// ─── createSourceMarkdown ───

describe("createSourceMarkdown", () => {
  it("creates markdown with source header, URL, widget, and content", () => {
    const md = createSourceMarkdown(
      "https://example.com/article",
      "deepseek",
      "Article Title",
      "Article body text here.",
    );
    expect(md).toContain("# Source: Article Title");
    expect(md).toContain("> URL: https://example.com/article");
    expect(md).toContain("> Extracted from widget: deepseek");
    expect(md).toContain("Article body text here.");
  });

  it("handles empty title gracefully", () => {
    const md = createSourceMarkdown(
      "https://example.com/article",
      "distillation",
      "",
      "Content here.",
    );
    expect(md).toContain("# Source: (Untitled)");
    expect(md).toContain("Content here.");
  });
});

// ─── createStubMarkdown ───

describe("createStubMarkdown", () => {
  it("creates stub markdown for failed fetch (Scenario #15 — paywall)", () => {
    const md = createStubMarkdown(
      "https://bloomberg.com/article",
      "deepseek",
      "Bloomberg Article",
      "HTTP 403: Forbidden",
      "DeepSeek funding: $7.4B raised, $50B valuation",
    );
    expect(md).toContain("# Source: Bloomberg Article (Stub)");
    expect(md).toContain("> URL: https://bloomberg.com/article");
    expect(md).toContain("> Extracted from widget: deepseek");
    expect(md).toContain("## Note");
    expect(md).toContain("Content could not be fetched");
    expect(md).toContain("HTTP 403: Forbidden");
    expect(md).toContain("DeepSeek funding: $7.4B raised, $50B valuation");
  });

  it("creates stub markdown for failed fetch (Scenario #16 — 429/timeout)", () => {
    const md = createStubMarkdown(
      "https://example.com/rate-limited",
      "distillation",
      "Rate Limited Article",
      "HTTP 429: Too Many Requests",
      "MiniMax stock crash 80%",
    );
    expect(md).toContain("(Stub)");
    expect(md).toContain("HTTP 429");
    expect(md).toContain("MiniMax stock crash 80%");
  });

  it("handles empty summary gracefully", () => {
    const md = createStubMarkdown(
      "https://example.com/article",
      "deepseek",
      "Some Article",
      "Timeout",
      "",
    );
    expect(md).toContain("## Note");
    expect(md).toContain("Content could not be fetched");
    // Empty summary should not add a "Widget data summary:" line
    expect(md).not.toContain("Widget data summary:");
  });
});
