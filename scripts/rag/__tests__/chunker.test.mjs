import { describe, it, expect } from "vitest";
import { chunkMarkdown, chunkSceneData, estimateTokens, MAX_TOKENS } from "../lib/chunker.mjs";

// ─── estimateTokens ───

describe("estimateTokens", () => {
  it("returns Math.ceil(length / 4) for non-empty text", () => {
    expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
    expect(estimateTokens("abcd")).toBe(1); // 4 chars / 4 = 1
    expect(estimateTokens("abcde")).toBe(2); // 5 chars / 4 = 1.25 → 2
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

// ─── chunkMarkdown ───

describe("chunkMarkdown", () => {
  it("splits by ## headings into separate chunks", () => {
    const md = `# Main Title

Intro paragraph before any section.

## First Section

Content of first section.

## Second Section

Content of second section.

## Third Section

Content of third section.`;

    const chunks = chunkMarkdown(md, "test-article");
    expect(chunks).toHaveLength(3);
    expect(chunks[0].title).toBe("First Section");
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].text).toContain("Content of first section");
    expect(chunks[1].title).toBe("Second Section");
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks[2].title).toBe("Third Section");
    expect(chunks[2].chunkIndex).toBe(2);
  });

  it("returns whole file as single chunk when no ## headings", () => {
    const md = `# Only H1 Title

This is a plain text file with no section headings.
Just some content here.`;

    const chunks = chunkMarkdown(md, "plain-doc");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].title).toBeNull();
    expect(chunks[0].text).toContain("plain text file");
  });

  it("handles empty string input", () => {
    const chunks = chunkMarkdown("", "empty");
    expect(chunks).toHaveLength(0);
  });

  it("sub-splits sections exceeding 8K tokens by paragraph", () => {
    // Create a section that's > 8K tokens (> 32768 chars)
    const longParagraph = "A".repeat(10000);
    const longSection = `## Big Section\n\n${longParagraph}\n\n${longParagraph}\n\n${longParagraph}\n\n${longParagraph}`;
    // Total content ~40000 chars → ~10000 tokens > 8192

    const chunks = chunkMarkdown(longSection, "big-doc");
    expect(chunks.length).toBeGreaterThan(1);
    // All sub-chunks share the same sourceId
    for (const c of chunks) {
      expect(c.sourceId).toBe("big-doc");
      expect(c.title).toBe("Big Section");
    }
    // Chunk indices are sequential
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
    // Each sub-chunk should be within the token limit (approximately)
    for (const c of chunks) {
      expect(estimateTokens(c.text)).toBeLessThanOrEqual(MAX_TOKENS + 500); // allow paragraph overshoot
    }
  });

  it("assigns sequential chunkIndex across multiple sections", () => {
    const md = `## A\n\ncontent a\n\n## B\n\ncontent b\n\n## C\n\ncontent c`;
    const chunks = chunkMarkdown(md, "seq-test");
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
  });

  it("includes content between sections in the correct chunk", () => {
    const md = `## Alpha\n\nAlpha content line 1.\n\nAlpha content line 2.\n\n## Beta\n\nBeta content.`;
    const chunks = chunkMarkdown(md, "content-test");
    expect(chunks[0].text).toContain("Alpha content line 1");
    expect(chunks[0].text).toContain("Alpha content line 2");
    expect(chunks[0].text).not.toContain("Beta content");
    expect(chunks[1].text).toContain("Beta content");
  });

  it("ignores ### subheadings as chunk boundaries (only ## splits)", () => {
    const md = `## Main Section\n\nSome text.\n\n### Sub A\n\nSub A content.\n\n### Sub B\n\nSub B content.`;
    const chunks = chunkMarkdown(md, "subhead-test");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe("Main Section");
    expect(chunks[0].text).toContain("Sub A content");
    expect(chunks[0].text).toContain("Sub B content");
  });
});

// ─── chunkSceneData ───

describe("chunkSceneData", () => {
  const mockScenes = [
    {
      id: 1,
      name: "hook",
      visualType: "hook",
      voiceover: "A leaked meeting paused a 1.4 billion dollar funding round.",
      texts: { badge: "BREAKING", subject: "DEEPSEEK", bigNumber: "$1.4B" },
    },
    {
      id: 2,
      name: "background",
      visualType: "timeline",
      voiceover: "In May, a closed-door meeting was held with investors.",
      texts: { title: "WHAT HAPPENED", events: [{ date: "MAY", text: "Meeting" }] },
    },
  ];

  const mockMeta = {
    subject: "deepseek",
    pipelineId: "deepseek",
    title: "DeepSeek Funding Round",
    article: "deepseek-art-of-restraint",
    topics: ["deepseek", "funding"],
  };

  it("creates one chunk per scene", () => {
    const chunks = chunkSceneData(mockScenes, mockMeta, "deepseek-scene-data");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
  });

  it("chunk text includes voiceover content", () => {
    const chunks = chunkSceneData(mockScenes, mockMeta, "deepseek-scene-data");
    expect(chunks[0].text).toContain("leaked meeting");
    expect(chunks[1].text).toContain("closed-door meeting");
  });

  it("chunk text includes visual text fields (Q12)", () => {
    const chunks = chunkSceneData(mockScenes, mockMeta, "deepseek-scene-data");
    // Scene 1 texts: badge=BREAKING, subject=DEEPSEEK, bigNumber=$1.4B
    expect(chunks[0].text).toContain("BREAKING");
    expect(chunks[0].text).toContain("DEEPSEEK");
    expect(chunks[0].text).toContain("$1.4B");
  });

  it("skips scenes with empty voiceover (Scenario #7)", () => {
    const scenesWithEmpty = [
      ...mockScenes,
      {
        id: 3,
        name: "visual-only",
        visualType: "stat",
        voiceover: "",
        texts: { title: "STATS" },
      },
      {
        id: 4,
        name: "another",
        visualType: "cta",
        voiceover: "This scene has voiceover.",
        texts: { title: "CTA" },
      },
    ];
    const chunks = chunkSceneData(scenesWithEmpty, mockMeta, "test");
    // Scene 3 (empty voiceover) should be skipped
    expect(chunks).toHaveLength(3); // 2 original + scene 4, scene 3 skipped
    expect(chunks[2].text).toContain("This scene has voiceover");
  });

  it("skips scenes with null/undefined voiceover", () => {
    const scenes = [
      { id: 1, name: "a", visualType: "hook", voiceover: null, texts: {} },
      { id: 2, name: "b", visualType: "content", voiceover: "Has voiceover.", texts: {} },
    ];
    const chunks = chunkSceneData(scenes, mockMeta, "test");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Has voiceover");
  });

  it("assigns sequential chunkIndex after skipping empty scenes", () => {
    const scenes = [
      { id: 1, name: "a", visualType: "hook", voiceover: "First.", texts: {} },
      { id: 2, name: "b", visualType: "stat", voiceover: "", texts: {} },
      { id: 3, name: "c", visualType: "cta", voiceover: "Third.", texts: {} },
    ];
    const chunks = chunkSceneData(scenes, mockMeta, "test");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
  });

  it("handles scenes with no texts object", () => {
    const scenes = [{ id: 1, name: "simple", visualType: "hook", voiceover: "Just voiceover." }];
    const chunks = chunkSceneData(scenes, mockMeta, "test");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Just voiceover");
  });

  it("sets sourceId on all chunks", () => {
    const chunks = chunkSceneData(mockScenes, mockMeta, "my-source-id");
    for (const c of chunks) {
      expect(c.sourceId).toBe("my-source-id");
    }
  });
});
