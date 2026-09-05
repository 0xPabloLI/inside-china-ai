import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  writeResearchArtifact,
  readResearchArtifact,
  getResearchWorkspace,
  RESEARCH_ARTIFACTS,
} from "../../lib/research/workspace.mjs";
import { validateDiscovery } from "../../lib/research/validate.mjs";
// Issue #97: use the real buildDiscoveryOutput from search-sources.mjs instead
// of a local copy — the fixture used to drift from the implementation.
import { buildDiscoveryOutput } from "../../search-sources.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test fixture: simulate what search-sources.mjs would write in scoped mode
const TEST_SLUG = "test-scoped-search";
const TEST_RUN = "run-scoped-001";

function buildDiscovery(articles, failedSourceNames, keyword) {
  return buildDiscoveryOutput(
    articles,
    failedSourceNames.map((name) => ({ name, reason: `source failed: ${name}` })),
    {
      contentId: TEST_SLUG,
      runId: TEST_RUN,
      keyword,
      sources: [],
    },
  );
}

// Clean up
afterEach(() => {
  const ws = getResearchWorkspace(TEST_SLUG);
  if (existsSync(ws)) {
    rmSync(ws, { recursive: true, force: true });
  }
});

describe("search-sources scoped mode: discovery output", () => {
  it("produces a schema-valid discovery.json when content-id is provided", () => {
    const articles = [
      { url: "https://example.com/a", title: "Article A", source: "qbitai", category: "news" },
      { url: "https://example.com/b", title: "Article B", source: "36kr", category: "news" },
    ];

    const discovery = buildDiscovery(articles, [], "DeepSeek");

    // Write it as search-sources.mjs would
    writeResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.DISCOVERY, discovery);

    // Read it back
    const read = readResearchArtifact(TEST_SLUG, TEST_RUN, RESEARCH_ARTIFACTS.DISCOVERY);
    expect(read).not.toBeNull();
    expect(read.contentId).toBe(TEST_SLUG);
    expect(read.researchRunId).toBe(TEST_RUN);

    // Validate against schema
    const result = validateDiscovery(read);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("includes failedSources with reasons in discovery output", () => {
    const articles = [
      { url: "https://example.com/a", title: "Article A", source: "qbitai", category: "news" },
    ];
    const failed = ["bloomberg", "xiaohongshu"];

    const discovery = buildDiscovery(articles, failed, "AI chip");

    expect(discovery.failedSources).toHaveLength(2);
    expect(discovery.failedSources[0].name).toBe("bloomberg");
    expect(discovery.failedSources[0].reason).toBeTruthy();
    expect(discovery.failedSources[1].name).toBe("xiaohongshu");
  });

  it("sourceCount matches sources.length", () => {
    const articles = [
      { url: "https://a.com", title: "A", source: "s1" },
      { url: "https://b.com", title: "B", source: "s2" },
      { url: "https://c.com", title: "C", source: "s3" },
    ];

    const discovery = buildDiscovery(articles, [], "test");
    expect(discovery.sourceCount).toBe(3);
    expect(discovery.sources).toHaveLength(3);
  });

  it("discovery is schema-valid even with zero articles", () => {
    const discovery = buildDiscovery([], ["all-sources-failed"], "test");
    expect(discovery.sourceCount).toBe(0);
    expect(discovery.sources).toHaveLength(0);
    expect(discovery.failedSources).toHaveLength(1);

    const result = validateDiscovery(discovery);
    expect(result.valid).toBe(true);
  });

  it("concurrent runs for different content slugs don't overwrite", () => {
    const slugA = "concurrent-scoped-a";
    const slugB = "concurrent-scoped-b";

    try {
      const discoveryA = buildDiscovery(
        [{ url: "https://a.com", title: "A", source: "s1" }],
        [],
        "test-a",
      );
      discoveryA.contentId = slugA;

      const discoveryB = buildDiscovery(
        [{ url: "https://b.com", title: "B", source: "s1" }],
        [],
        "test-b",
      );
      discoveryB.contentId = slugB;

      // Fix run IDs to match artifact data
      discoveryA.researchRunId = "run-1";
      discoveryB.researchRunId = "run-1";

      writeResearchArtifact(slugA, "run-1", RESEARCH_ARTIFACTS.DISCOVERY, discoveryA);
      writeResearchArtifact(slugB, "run-1", RESEARCH_ARTIFACTS.DISCOVERY, discoveryB);

      const readA = readResearchArtifact(slugA, "run-1", RESEARCH_ARTIFACTS.DISCOVERY);
      const readB = readResearchArtifact(slugB, "run-1", RESEARCH_ARTIFACTS.DISCOVERY);

      expect(readA.sources[0].url).toBe("https://a.com");
      expect(readB.sources[0].url).toBe("https://b.com");
    } finally {
      rmSync(getResearchWorkspace(slugA), { recursive: true, force: true });
      rmSync(getResearchWorkspace(slugB), { recursive: true, force: true });
    }
  });

  it("each source item has required url or title field", () => {
    const articles = [{ url: "https://example.com/a", title: "Article A", source: "s1" }];
    const discovery = buildDiscovery(articles, [], "test");

    for (const source of discovery.sources) {
      expect(source.url || source.title).toBeTruthy();
    }
  });
});
