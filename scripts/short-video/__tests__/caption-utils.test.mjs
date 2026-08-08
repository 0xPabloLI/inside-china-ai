import { describe, it, expect } from "vitest";
import {
  deriveTitle,
  deriveDescription,
  deriveHashtags,
  deriveCommentHook,
  derivePinnedComment,
} from "../lib/caption-utils.mjs";

// ─── Mock scene data (mirrors real scene-data.mjs format) ───

const mockScenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "A leaked four-hour investor meeting just paused DeepSeek's 1.4 billion dollar funding round.",
    texts: { line1: "LEAKED MEETING", line2: "PAUSED $1.4B" },
  },
  {
    id: 2,
    name: "background",
    visualType: "timeline",
    voiceover:
      "In May, DeepSeek founder Liang Wenfeng held a closed-door meeting with investors. No press, no recording.",
    texts: { events: [{ date: "MAY", text: "CLOSED-DOOR MEETING" }] },
  },
  {
    id: 3,
    name: "not-for-profit",
    visualType: "contrast",
    voiceover:
      "Liang said DeepSeek was never built to maximize profit. No IPO plan, no exit strategy.",
    texts: { left: ["NO IPO"], right: ["CONSENSUS"] },
  },
  {
    id: 4,
    name: "pricing",
    visualType: "price-comparison",
    voiceover:
      "DeepSeek's API is priced to recover hardware costs in ten months. At fourteen cents per million tokens.",
    texts: { deepseekPrice: "$0.14", ratio: "1/20" },
  },
  {
    id: 12,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI intelligence.",
    texts: { title: "SUBSCRIBE" },
  },
];

const fullMetadata = {
  title: "DeepSeek's $1.4B Funding Round Paused",
  description:
    "A leaked investor meeting reveals DeepSeek's strategy.\nFollow for more China AI news.",
  hashtags: ["#deepseek", "#chinaai", "#ai", "#technews", "#chinatech"],
};

const partialMetadata = {
  title: "DeepSeek Leaked Meeting Explained",
};

// ─── S1: Full metadata → use directly ───

describe("S1: Full metadata", () => {
  it("uses metadata title when present", () => {
    const result = deriveTitle(mockScenes, fullMetadata);
    expect(result).toBe(fullMetadata.title);
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it("uses metadata description when present (with comment hook appended)", () => {
    const result = deriveDescription(mockScenes, fullMetadata);
    // Should start with the metadata description
    expect(result).toContain(fullMetadata.description);
    // Should end with CTA
    expect(result).toMatch(/follow|subscribe/i);
    // Should include a comment hook (question)
    expect(result).toMatch(/\?/);
  });

  it("uses metadata hashtags when present", () => {
    const result = deriveHashtags(mockScenes, fullMetadata);
    expect(result).toEqual(fullMetadata.hashtags);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// ─── S2: No metadata → auto-derive ───

describe("S2: No metadata → auto-derive", () => {
  it("derives title from scene 1 voiceover + texts", () => {
    const result = deriveTitle(mockScenes, undefined);
    expect(result).toBeTruthy();
    expect(result.length).toBeLessThanOrEqual(60);
    // Should contain a key entity or keyword
    expect(result).toMatch(/deepseek|china|ai/i);
  });

  it("derives description from all scene voiceovers", () => {
    const result = deriveDescription(mockScenes, undefined);
    expect(result).toBeTruthy();
    expect(result.length).toBeLessThanOrEqual(2200);
    // Should end with CTA
    expect(result).toMatch(/follow|subscribe/i);
  });

  it("derives hashtags with #ainews and #chinaai always present", () => {
    const result = deriveHashtags(mockScenes, undefined);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(5);
    // #ainews is always included (best ROI: 68.7M views, low competition)
    expect(result).toContain("#ainews");
    // #chinaai is always included (brand niche hashtag)
    expect(result).toContain("#chinaai");
  });

  it("matches entity hashtags from content", () => {
    const result = deriveHashtags(mockScenes, undefined);
    // mockScenes contain "DeepSeek" → should match #deepseek
    expect(result).toContain("#deepseek");
  });
});

// ─── S3: Partial metadata → mixed ───

describe("S3: Partial metadata (title only)", () => {
  it("uses metadata title, derives description and hashtags", () => {
    const title = deriveTitle(mockScenes, partialMetadata);
    expect(title).toBe(partialMetadata.title);

    const desc = deriveDescription(mockScenes, partialMetadata);
    expect(desc).toBeTruthy();
    expect(desc).not.toBe(partialMetadata.description); // derived, not from metadata

    const tags = deriveHashtags(mockScenes, partialMetadata);
    expect(tags.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── S4: Hashtags < 3 → pad ───

describe("S4: Hashtags insufficient (< 3)", () => {
  it("pads hashtags to minimum 3", () => {
    const meta = { hashtags: ["#ai", "#deepseek"] };
    const result = deriveHashtags(mockScenes, meta);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toContain("#ai");
    expect(result).toContain("#deepseek");
  });
});

// ─── S5: Hashtags > 5 → truncate ───

describe("S5: Hashtags exceed 5", () => {
  it("truncates to maximum 5", () => {
    const meta = {
      hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// ─── S6: Title > 60 chars → truncate at word boundary ───

describe("S6: Title too long", () => {
  it("truncates title to <= 60 chars at word boundary", () => {
    const meta = {
      title:
        "This is an extremely long title that definitely exceeds the sixty character limit of TikTok posts by a significant margin",
    };
    const result = deriveTitle(mockScenes, meta);
    expect(result.length).toBeLessThanOrEqual(60);
    // Should not end with trailing space (truncated at word boundary)
    expect(result).not.toMatch(/\s$/);
  });
});

// ─── S7: Description > 2200 chars → truncate at sentence boundary ───

describe("S7: Description too long", () => {
  it("truncates description to <= 2200 chars", () => {
    const longScenes = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      voiceover:
        "This is a very long voiceover sentence about DeepSeek and China AI technology. It contains multiple pieces of information about the company and its strategic direction in the global AI landscape.",
      texts: { line: "DATA" },
    }));
    const result = deriveDescription(longScenes, undefined);
    expect(result.length).toBeLessThanOrEqual(2200);
    // Should end with CTA
    expect(result).toMatch(/follow|subscribe/i);
  });
});

// ─── S8: No entity match → default broad hashtags ───

describe("S8: No entities found", () => {
  it("falls back to default hashtags including #ainews", () => {
    const genericScenes = [
      {
        id: 1,
        voiceover: "Something happened somewhere today.",
        texts: { line1: "NEWS" },
      },
      {
        id: 2,
        voiceover: "More things happened elsewhere.",
        texts: { line1: "UPDATE" },
      },
    ];
    const result = deriveHashtags(genericScenes, undefined);
    expect(result.length).toBeGreaterThanOrEqual(3);
    // #ainews and #chinaai are always present
    expect(result).toContain("#ainews");
    expect(result).toContain("#chinaai");
  });
});

// ─── S16: Expanded entity hashtag matching ───

describe("S16: Expanded entity hashtag matching", () => {
  it("matches #chatgpt for OpenAI/GPT content", () => {
    const scenes = [
      { id: 1, voiceover: "OpenAI released GPT-5 today.", texts: { line1: "GPT-5" } },
    ];
    const result = deriveHashtags(scenes, undefined);
    expect(result).toContain("#chatgpt");
  });

  it("matches #kimi for Moonshot content", () => {
    const scenes = [
      { id: 1, voiceover: "Moonshot AI updated Kimi model.", texts: { line1: "KIMI" } },
    ];
    const result = deriveHashtags(scenes, undefined);
    expect(result).toContain("#kimi");
  });

  it("matches #chinanews for China content", () => {
    const scenes = [
      { id: 1, voiceover: "China announced new AI policy.", texts: { line1: "CHINA AI POLICY" } },
    ];
    const result = deriveHashtags(scenes, undefined);
    expect(result).toContain("#chinanews");
  });

  it("matches #futuretech for future/forward-looking content", () => {
    const scenes = [
      { id: 1, voiceover: "The future of AI is autonomous agents.", texts: { line1: "FUTURE AI" } },
    ];
    const result = deriveHashtags(scenes, undefined);
    expect(result).toContain("#futuretech");
  });

  it("matches #huawei for Huawei content", () => {
    const scenes = [
      { id: 1, voiceover: "Huawei released Pangu 5.0 model.", texts: { line1: "HUAWEI PANGU" } },
    ];
    const result = deriveHashtags(scenes, undefined);
    expect(result).toContain("#huawei");
  });
});

// ─── S14: Title missing SEO keyword → append ───

describe("S14: Title missing SEO keyword", () => {
  it("appends SEO keyword to title if missing", () => {
    const meta = { title: "A leaked meeting paused the round" };
    const result = deriveTitle(mockScenes, meta);
    // Should contain China, AI, or DeepSeek
    expect(result).toMatch(/china|ai|deepseek/i);
  });
});

// ─── S15: All short voiceovers ───

describe("S15: All short voiceovers", () => {
  it("still generates a title", () => {
    const shortScenes = [
      { id: 1, voiceover: "Wow.", texts: { line1: "WOW" } },
      { id: 2, voiceover: "Really?", texts: { line1: "REALLY" } },
    ];
    const result = deriveTitle(shortScenes, undefined);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("still generates a description", () => {
    const shortScenes = [
      { id: 1, voiceover: "Wow.", texts: {} },
      { id: 2, voiceover: "Really?", texts: {} },
    ];
    const result = deriveDescription(shortScenes, undefined);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── Edge cases ───

describe("Edge cases", () => {
  it("handles empty metadata object", () => {
    const result = deriveTitle(mockScenes, {});
    expect(result).toBeTruthy();
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it("handles metadata with empty string title", () => {
    const result = deriveTitle(mockScenes, { title: "" });
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles metadata with empty hashtags array", () => {
    const result = deriveHashtags(mockScenes, { hashtags: [] });
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("handles null metadata", () => {
    const result = deriveTitle(mockScenes, null);
    expect(result).toBeTruthy();
  });
});

// ─── S7: Comment Hook & Pinned Comment ───

describe("S7: Comment Hook & Pinned Comment", () => {
  it("derives a comment hook from scene data", () => {
    const result = deriveCommentHook(mockScenes, undefined);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(10);
    // Should be a question
    expect(result).toMatch(/\?/);
  });

  it("uses metadata commentHook when provided", () => {
    const meta = { commentHook: "Will DeepSeek beat OpenAI?" };
    const result = deriveCommentHook(mockScenes, meta);
    expect(result).toBe("Will DeepSeek beat OpenAI?");
  });

  it("derives a pinned comment with article URL", () => {
    const meta = { articleUrl: "https://chinaainews.com/posts/deepseek-test" };
    const result = derivePinnedComment(mockScenes, meta);
    expect(result).toContain("https://chinaainews.com/posts/deepseek-test");
    // Should also contain a question (the hook)
    expect(result).toMatch(/\?/);
  });

  it("derives a pinned comment without article URL (just the hook)", () => {
    const result = derivePinnedComment(mockScenes, undefined);
    expect(result).toBeTruthy();
    expect(result).toMatch(/\?/);
  });

  it("comment hook is included in description", () => {
    const desc = deriveDescription(mockScenes, undefined);
    const hook = deriveCommentHook(mockScenes, undefined);
    expect(desc).toContain(hook);
  });
});
