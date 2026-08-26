import { describe, it, expect } from "vitest";
import {
  deriveTitle,
  deriveDescription,
  deriveHashtags,
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
  primaryEntity: "DeepSeek",
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

  it("uses metadata description when present (no comment hook appended)", () => {
    const result = deriveDescription(mockScenes, fullMetadata);
    // Should start with the metadata description
    expect(result).toContain(fullMetadata.description);
    // Should end with CTA
    expect(result).toMatch(/follow|subscribe/i);
    // Should NOT include a comment hook (questions) — hooks are AITL-generated
    expect(result).not.toMatch(/\?/);
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
    const meta = { keyEntitiesCompanies: ["deepseek"] };
    const result = deriveHashtags(mockScenes, meta);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(5);
    // #ainews is always included (best ROI: 68.7M views, low competition)
    expect(result).toContain("#ainews");
    // #chinaai is always included (brand niche hashtag)
    expect(result).toContain("#chinaai");
  });

  it("matches entity hashtags from keyEntities", () => {
    const meta = { keyEntitiesCompanies: ["deepseek"] };
    const result = deriveHashtags(mockScenes, meta);
    // mockScenes keyEntities has "deepseek" → should match #deepseek
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

    const tags = deriveHashtags(mockScenes, { keyEntitiesCompanies: ["deepseek"] });
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
    const meta = { keyEntitiesCompanies: [] };
    const result = deriveHashtags(genericScenes, meta);
    expect(result.length).toBeGreaterThanOrEqual(3);
    // #ainews and #chinaai are always present
    expect(result).toContain("#ainews");
    expect(result).toContain("#chinaai");
  });
});

// ─── S16: Expanded entity hashtag matching ───

describe("S16: Entity hashtag from keyEntities", () => {
  it("matches #chatgpt for OpenAI in keyEntities", () => {
    const scenes = [
      { id: 1, voiceover: "OpenAI released GPT-5 today.", texts: { line1: "GPT-5" } },
    ];
    const meta = { keyEntitiesCompanies: ["openai"] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#chatgpt");
  });

  it("matches #kimi for Moonshot in keyEntities", () => {
    const scenes = [
      { id: 1, voiceover: "Moonshot AI updated Kimi model.", texts: { line1: "KIMI" } },
    ];
    const meta = { keyEntitiesCompanies: ["moonshot"] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#kimi");
  });

  it("matches #huawei for Huawei in keyEntities", () => {
    const scenes = [
      { id: 1, voiceover: "Huawei released Pangu 5.0 model.", texts: { line1: "HUAWEI PANGU" } },
    ];
    const meta = { keyEntitiesCompanies: ["huawei"] };
    const result = deriveHashtags(scenes, meta);
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

// ─── S17: Dynamic primary entity (replaces hardcoded "deepseek") ───

describe("S17: Dynamic primary entity", () => {
  it("prepends primaryEntity to description when entity not in body", () => {
    // Scenes about Kimi (no mention of DeepSeek in voiceover)
    const kimiScenes = [
      { id: 1, voiceover: "Kimi K3 just escaped its sandbox.", texts: { line1: "KIMI K3" } },
      { id: 2, voiceover: "Moonshot AI tested the model.", texts: { line1: "MOONSHOT" } },
    ];
    const result = deriveDescription(kimiScenes, { primaryEntity: "Moonshot" });
    // "Moonshot" appears in scene 2 voiceover, so no prefix needed
    expect(result).not.toContain("Moonshot analysis.");
  });

  it("prepends primaryEntity to description when entity is NOT in body", () => {
    // Scenes that don't mention the primary entity by name
    const genericScenes = [
      { id: 1, voiceover: "A new AI model broke containment.", texts: { line1: "BREAKING" } },
      { id: 2, voiceover: "The model escaped during testing.", texts: { line1: "ESCAPE" } },
    ];
    const result = deriveDescription(genericScenes, { primaryEntity: "Moonshot" });
    // "Moonshot" not in voiceover → should be prepended
    expect(result).toContain("Moonshot analysis.");
  });

  it("does NOT prepend anything when primaryEntity is absent", () => {
    const result = deriveDescription(mockScenes, undefined);
    // Should NOT have "DeepSeek analysis." prefix (old behavior)
    expect(result).not.toMatch(/^DeepSeek analysis\./);
  });

  it("uses primaryEntity as SEO keyword in title check", () => {
    // Title with "Moonshot" should pass SEO check (no suffix appended)
    const meta = { title: "Moonshot K3 breaks out", primaryEntity: "Moonshot" };
    const result = deriveTitle(mockScenes, meta);
    expect(result).toBe("Moonshot K3 breaks out");
    expect(result).not.toContain("| China AI");
  });

  it("appends China AI suffix when title lacks both base keywords and primaryEntity", () => {
    const meta = { title: "A model escaped", primaryEntity: "Moonshot" };
    const result = deriveTitle(mockScenes, meta);
    // "A model escaped" doesn't contain china/ai/moonshot → suffix appended
    expect(result).toContain("China AI");
  });
});

// ─── S7: Comment Hook & Pinned Comment ───

describe("S7: Pinned Comment (AITL-driven)", () => {
  it("returns metadata.commentHook when set", () => {
    const meta = { commentHook: "Will ByteDance's Feishu strategy work?" };
    const result = derivePinnedComment(mockScenes, meta);
    expect(result).toBe("Will ByteDance's Feishu strategy work?");
  });

  it("returns empty string when no commentHook", () => {
    const result = derivePinnedComment(mockScenes, undefined);
    expect(result).toBe("");
  });

  it("includes article URL when provided", () => {
    const meta = {
      commentHook: "Will ByteDance win the enterprise AI race?",
      articleUrl: "https://chinaainews.com/posts/doubao-work",
    };
    const result = derivePinnedComment(mockScenes, meta);
    expect(result).toContain("https://chinaainews.com/posts/doubao-work");
    expect(result).toContain("Will ByteDance win");
  });

  it("comment hook is NOT included in description", () => {
    const desc = deriveDescription(mockScenes, { commentHook: "Some question?" });
    expect(desc).not.toContain("Some question?");
  });
});

// ─── S18: Hashtag from keyEntities only (not voiceover full-text) ───

describe("S18: Hashtag from keyEntities only", () => {
  it("matches #bytedance from keyEntities, not #alibaba from voiceover", () => {
    const scenes = [
      { id: 1, voiceover: "ByteDance and Alibaba compete in AI.", texts: {} },
    ];
    const meta = { keyEntitiesCompanies: ["bytedance"] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#bytedance");
    expect(result).not.toContain("#alibaba");
  });

  it("matches #doubao for doubao content", () => {
    const scenes = [
      { id: 1, voiceover: "Doubao Work launched today.", texts: {} },
    ];
    const meta = { keyEntitiesCompanies: ["doubao"] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#doubao");
  });

  it("matches #feishu for feishu/lark content", () => {
    const scenes = [
      { id: 1, voiceover: "Feishu is the differentiator.", texts: {} },
    ];
    const meta = { keyEntitiesCompanies: ["feishu"] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#feishu");
  });

  it("does not match any entity when keyEntities is empty", () => {
    const scenes = [
      { id: 1, voiceover: "Some company did something.", texts: {} },
    ];
    const meta = { keyEntitiesCompanies: [] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#ainews");
    expect(result).toContain("#chinaai");
    // No entity hashtags, just defaults
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});
