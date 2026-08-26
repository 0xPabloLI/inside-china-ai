import { describe, it, expect } from "vitest";
import {
  deriveTitle,
  deriveDescription,
  deriveHashtags,
  derivePinnedComment,
  normalizeHashtag,
  classifyHashtags,
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
    const scenes = [{ id: 1, voiceover: "ByteDance and Alibaba compete in AI.", texts: {} }];
    const meta = { keyEntitiesCompanies: ["bytedance"] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#bytedance");
    expect(result).not.toContain("#alibaba");
  });

  it("matches #doubao for doubao content", () => {
    const scenes = [{ id: 1, voiceover: "Doubao Work launched today.", texts: {} }];
    const meta = { keyEntitiesCompanies: ["doubao"] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#doubao");
  });

  it("matches #feishu for feishu/lark content", () => {
    const scenes = [{ id: 1, voiceover: "Feishu is the differentiator.", texts: {} }];
    const meta = { keyEntitiesCompanies: ["feishu"] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#feishu");
  });

  it("does not match any entity when keyEntities is empty", () => {
    const scenes = [{ id: 1, voiceover: "Some company did something.", texts: {} }];
    const meta = { keyEntitiesCompanies: [] };
    const result = deriveHashtags(scenes, meta);
    expect(result).toContain("#ainews");
    expect(result).toContain("#chinaai");
    // No entity hashtags, just defaults
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── T1: normalizeHashtag ───

describe("T1: normalizeHashtag", () => {
  it("normalizes a plain string", () => {
    expect(normalizeHashtag("aiviral")).toBe("#aiviral");
  });

  it("normalizes a string with leading #", () => {
    expect(normalizeHashtag("#aiviral")).toBe("#aiviral");
  });

  it("trims whitespace and lowercases", () => {
    expect(normalizeHashtag("  #AiViral ")).toBe("#aiviral");
  });

  it("rejects empty string", () => {
    expect(normalizeHashtag("")).toBeNull();
  });

  it("rejects whitespace-only string", () => {
    expect(normalizeHashtag("   ")).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(normalizeHashtag(null)).toBeNull();
    expect(normalizeHashtag(undefined)).toBeNull();
    expect(normalizeHashtag(123)).toBeNull();
    expect(normalizeHashtag([])).toBeNull();
  });

  it("rejects string with internal whitespace", () => {
    expect(normalizeHashtag("ai viral")).toBeNull();
    expect(normalizeHashtag("ai\tviral")).toBeNull();
  });

  it("normalizes #CreatorSearchInsights to #creatorsearchinsights", () => {
    expect(normalizeHashtag("#CreatorSearchInsights")).toBe("#creatorsearchinsights");
  });
});

// ─── T2: #creatorsearchinsights removed from blacklist ───

describe("T2: #creatorsearchinsights not blacklisted", () => {
  it("preserves #creatorsearchinsights in manual override", () => {
    const meta = {
      hashtags: ["#creatorsearchinsights", "#deepseek", "#chinaai"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#creatorsearchinsights");
  });

  it("allows #creatorsearchinsights in trending", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: ["#creatorsearchinsights"],
    };
    const result = deriveHashtags(mockScenes, meta);
    // Should not be filtered out by blacklist
    expect(result).toContain("#creatorsearchinsights");
  });
});

// ─── T3: trendingHashtags consumption (auto-derive path) ───

describe("T3: trendingHashtags consumption", () => {
  it("T3-1: no trendingHashtags → same as before", () => {
    const meta = { keyEntitiesCompanies: ["deepseek"] };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#ainews");
    expect(result).toContain("#chinaai");
    expect(result).toContain("#deepseek");
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("T3-2: trending tag added when < 5 tags", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: ["#aiviral"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#aiviral");
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("T3-3: trending tag added when = 3 tags", () => {
    const meta = {
      keyEntitiesCompanies: [],
      trendingHashtags: ["#aiviral"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#aiviral");
    expect(result.length).toBe(4);
  });

  it("T3-4: trending replaces secondary vertical when at 5", () => {
    // 2 core+brand + 1 primary (deepseek) + 2 secondary (openai→#chatgpt, nvidia→#nvidia) = 5
    const meta = {
      keyEntitiesCompanies: ["deepseek", "openai", "nvidia"],
      trendingHashtags: ["#aiviral"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#aiviral");
    expect(result).toContain("#deepseek"); // primary preserved
    expect(result.length).toBe(5);
    // One of the secondary should be replaced
    const hasChatGPT = result.includes("#chatgpt");
    const hasNvidia = result.includes("#nvidia");
    expect(hasChatGPT && hasNvidia).toBe(false); // at least one replaced
  });

  it("T3-5: trending replaces pad candidate when at 5", () => {
    // 2 core+brand + 2 primary+secondary (deepseek, nvidia) + 1 pad (#ai) = 5
    // trending replaces the pad candidate
    const meta = {
      keyEntitiesCompanies: ["deepseek", "nvidia"],
      trendingHashtags: ["#aiviral"],
    };
    // With 2 entities: ainews + chinaai + deepseek(primary) + nvidia(secondary) = 4
    // pad #ai to reach 3+ → actually 4 >= 3 so no pad, trending adds → 5
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#aiviral");
    expect(result).toContain("#deepseek"); // primary preserved
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("T3-6: trending discarded when no replaceable tag available", () => {
    // 2 core+brand + 1 primary + 0 secondary + 0 pad needed (only 3 tags)
    // But if trending is #ainews (already exists), it's deduped, not added
    // For "no replaceable": we need exactly 5 non-replaceable tags
    // core(2) + brand(already in core set) — actually core is #ainews only, brand is #chinaai
    // So max non-replaceable = #ainews + #chinaai + #deepseek(primary) = 3
    // To get 5 non-replaceable we'd need 3 primary entities, but only companies[0] is primary
    // This scenario is impossible with current design — skip with a note
    // Instead test: trending that's already in the set → deduped
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: ["#ainews"], // already in set
    };
    const result = deriveHashtags(mockScenes, meta);
    // #ainews should appear only once
    const ainewsCount = result.filter((t) => t === "#ainews").length;
    expect(ainewsCount).toBe(1);
  });

  it("T3-7: only 1 trending tag max", () => {
    const meta = {
      keyEntitiesCompanies: [],
      trendingHashtags: ["#aiviral", "#aitechtrends"],
    };
    const result = deriveHashtags(mockScenes, meta);
    // Only 1 trending should be included
    const trendingCount = result.filter((t) => t === "#aiviral" || t === "#aitechtrends").length;
    expect(trendingCount).toBe(1);
  });

  it("T3-8: trending deduped if already in set", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: ["#deepseek"], // already matched by entity
    };
    const result = deriveHashtags(mockScenes, meta);
    const deepseekCount = result.filter((t) => t === "#deepseek").length;
    expect(deepseekCount).toBe(1);
  });

  it("T3-9: trending normalized (case + whitespace + #)", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: ["  #AiViral "],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#aiviral");
  });

  it("T3-10: trending invalid values filtered", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: ["", "  ", null, 123, "#aiviral"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#aiviral");
    // No invalid values leaked
    expect(result).not.toContain("");
    expect(result).not.toContain("  ");
    expect(result).not.toContain(null);
    expect(result).not.toContain(123);
  });

  it("T3-11: manual override does not inject trending", () => {
    const meta = {
      hashtags: ["#deepseek", "#chinaai"],
      trendingHashtags: ["#aiviral"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).not.toContain("#aiviral");
    // Manual override should only return the manual tags (+ pad if < 3)
    expect(result).toContain("#deepseek");
    expect(result).toContain("#chinaai");
  });

  it("T3-12: primary entity tag preserved during replacement", () => {
    // companies[0] = deepseek (primary), companies[1] = openai (secondary)
    const meta = {
      keyEntitiesCompanies: ["deepseek", "openai"],
      trendingHashtags: ["#aiviral"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#deepseek"); // primary always preserved
    expect(result).toContain("#aiviral");
  });

  it("T3-13: manual override with #creatorsearchinsights preserved", () => {
    const meta = {
      hashtags: ["#creatorsearchinsights", "#deepseek", "#chinaai"],
      trendingHashtags: ["#aiviral"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#creatorsearchinsights");
    expect(result).not.toContain("#aiviral"); // trending not injected
  });

  it("T3-14: empty trendingHashtags array → no effect", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: [],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#deepseek");
    expect(result).toContain("#ainews");
    expect(result).toContain("#chinaai");
  });

  it("T3-15: trendingHashtags not set → no effect", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
    };
    const result = deriveHashtags(mockScenes, meta);
    expect(result).toContain("#deepseek");
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// ─── classifyHashtags integration tests (P2: source attribution) ───

describe("classifyHashtags", () => {
  it("C1: auto mode — trending tag classified as trending", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: ["#aiviral"],
    };
    const hashtags = deriveHashtags(mockScenes, meta);
    const result = classifyHashtags(hashtags, meta);
    expect(result.selectionMode).toBe("auto");
    expect(result.trending).toContain("#aiviral");
  });

  it("C2: manual mode — trending is always empty even if trendingHashtags overlaps", () => {
    const meta = {
      hashtags: ["#deepseek", "#aiviral", "#technews"],
      trendingHashtags: ["#aiviral"],
    };
    const hashtags = deriveHashtags(mockScenes, meta);
    const result = classifyHashtags(hashtags, meta);
    expect(result.selectionMode).toBe("manual");
    expect(result.trending).toEqual([]);
    expect(result.vertical).toContain("#deepseek");
    expect(result.vertical).toContain("#aiviral");
  });

  it("C3: auto mode — no trendingHashtags → trending is empty", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
    };
    const hashtags = deriveHashtags(mockScenes, meta);
    const result = classifyHashtags(hashtags, meta);
    expect(result.selectionMode).toBe("auto");
    expect(result.trending).toEqual([]);
  });

  it("C4: auto mode — traffic and brand correctly classified", () => {
    const meta = {
      keyEntitiesCompanies: ["deepseek"],
      trendingHashtags: ["#aiviral"],
    };
    const hashtags = deriveHashtags(mockScenes, meta);
    const result = classifyHashtags(hashtags, meta);
    expect(result.traffic).toContain("#ainews");
    expect(result.brand).toContain("#chinaai");
    expect(result.vertical).toContain("#deepseek");
    // #aiviral should be in trending, not vertical
    expect(result.vertical).not.toContain("#aiviral");
  });

  it("C5: manual mode — traffic and brand still classified from final tags", () => {
    const meta = {
      hashtags: ["#ainews", "#chinaai", "#deepseek"],
    };
    const hashtags = deriveHashtags(mockScenes, meta);
    const result = classifyHashtags(hashtags, meta);
    expect(result.selectionMode).toBe("manual");
    expect(result.traffic).toContain("#ainews");
    expect(result.brand).toContain("#chinaai");
    expect(result.vertical).toContain("#deepseek");
    expect(result.trending).toEqual([]);
  });
});
